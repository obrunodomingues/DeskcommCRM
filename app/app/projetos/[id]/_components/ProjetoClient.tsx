"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { SeletorDeContato } from "@/components/kanban/SeletorDeContato";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { roleAtLeast } from "@/lib/auth/types";
import {
  MODELOS_DE_PROJETO,
  centavosDoTexto,
  diasNaFase,
  valorEmReais,
  type ItemDoProjeto,
  type ProjetoCompleto,
  type SituacaoDoProjeto,
} from "@/lib/converzon/projetos";
import { CaretDown, CaretRight, PencilSimple, Trash } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/** "2026-11-20" → "20/11/2026" (data de calendário, sem fuso). */
function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Fork Converzon — um projeto por dentro: as fases (avançar e voltar), o
 * checklist de cada fase com prazo por item, as notas e o histórico. Cada
 * mudança grava na hora e recarrega o projeto e a lista.
 */
export function ProjetoClient({ id }: { id: string }) {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const { activeOrg } = useAuth();
  const podeEditar = roleAtLeast(activeOrg?.role, "agent");
  const podeExcluir = roleAtLeast(activeOrg?.role, "manager");
  const [agora] = useState(() => Date.now());
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [trocandoCliente, setTrocandoCliente] = useState(false);

  const chave = ["converzon-projeto", id];
  const consulta = useQuery({
    queryKey: chave,
    queryFn: () => apiClient.get<{ data: ProjetoCompleto }>(`/api/v1/converzon/projetos/${id}`).then((r) => r.data),
  });
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: chave });
    qc.invalidateQueries({ queryKey: ["converzon-projetos"] });
  };

  const editar = useMutation({
    mutationFn: (mudancas: Record<string, unknown>) => apiClient.patch(`/api/v1/converzon/projetos/${id}`, mudancas),
    onError: showApiError,
    onSuccess: recarregar,
  });
  const excluir = useMutation({
    mutationFn: () => apiClient.delete(`/api/v1/converzon/projetos/${id}`),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["converzon-projetos"] });
      router.push("/app/projetos");
    },
  });

  if (consulta.isLoading) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-10 w-1/2 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (consulta.isError || !consulta.data) {
    return (
      <div className="p-6">
        <p className="text-sm text-text-muted">{t("Não consegui carregar o projeto.")}</p>
        <Link href="/app/projetos" className="mt-2 inline-block text-sm text-accent hover:underline">
          {t("Voltar para Projetos")}
        </Link>
      </div>
    );
  }

  const p = consulta.data;
  const ultimaFase = p.fases.length - 1;
  const itensDaFaseAtual = p.itens.filter((i) => i.fase === p.fase_atual);
  const faltamNaFase = itensDaFaseAtual.filter((i) => !i.feito).length;
  const dias = diasNaFase(p.fase_desde, agora);

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <div>
        <Link href="/app/projetos" className="text-sm text-text-muted hover:text-text">
          ← {t("Projetos")}
        </Link>
      </div>

      {/* ── Cabeçalho ── */}
      <header className="flex flex-col gap-3">
        <NomeDoProjeto key={p.nome} nome={p.nome} podeEditar={podeEditar} onSalvar={(nome) => editar.mutate({ nome })} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="cz-chip cz-chip-neutro">{MODELOS_DE_PROJETO[p.tipo].rotulo}</span>

          <span className="flex items-center gap-1.5">
            <span className="text-text-muted">{t("Cliente")}:</span>
            {p.contato ? (
              <Link href={`/app/contacts/${p.contato.id}`} className="font-medium text-accent hover:underline">
                {p.contato.nome}
              </Link>
            ) : (
              <span className="text-text-muted">{t("Sem cliente")}</span>
            )}
            {podeEditar ? (
              <button
                type="button"
                className="text-xs text-text-subtle hover:text-text"
                onClick={() => setTrocandoCliente((v) => !v)}
              >
                {p.contato ? t("trocar") : t("escolher")}
              </button>
            ) : null}
          </span>

          <ValorDoProjeto
            key={String(p.valor_centavos)}
            centavos={p.valor_centavos}
            podeEditar={podeEditar}
            onSalvar={(valor_centavos) => editar.mutate({ valor_centavos })}
          />

          <label className="flex items-center gap-1.5">
            <span className="text-text-muted">{t("Prazo")}:</span>
            <Input
              type="date"
              className="h-8 w-40"
              defaultValue={p.prazo ?? ""}
              disabled={!podeEditar}
              onChange={(e) => editar.mutate({ prazo: e.target.value || null })}
            />
          </label>

          <span className="flex items-center gap-1.5">
            <span className="text-text-muted">{t("Situação")}:</span>
            <Select
              value={p.situacao}
              disabled={!podeEditar}
              onValueChange={(v) => editar.mutate({ situacao: v as SituacaoDoProjeto })}
            >
              <SelectTrigger className="h-8 w-48" aria-label={t("Situação")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="andamento">{t("Em andamento")}</SelectItem>
                <SelectItem value="esperando_cliente">{t("Esperando o cliente")}</SelectItem>
                <SelectItem value="pausado">{t("Pausado")}</SelectItem>
                <SelectItem value="concluido">{t("Concluído")}</SelectItem>
                <SelectItem value="cancelado">{t("Cancelado")}</SelectItem>
              </SelectContent>
            </Select>
          </span>
        </div>

        {trocandoCliente ? (
          <div className="max-w-md rounded-xl border border-border bg-card p-4">
            <SeletorDeContato
              escolhido={null}
              onEscolher={(c) => {
                if (!c) return;
                editar.mutate({ contact_id: c.id });
                setTrocandoCliente(false);
              }}
            />
          </div>
        ) : null}
      </header>

      {/* ── Fases ── */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">{t("Fases")}</h2>
        <ol className="mt-3 flex flex-wrap gap-2">
          {p.fases.map((fase, i) => (
            <li
              key={`${i}-${fase}`}
              className={cn(
                "rounded-full border px-3 py-1 text-sm",
                i < p.fase_atual && "border-border bg-surface-elevated text-text-muted line-through",
                i === p.fase_atual && "border-accent bg-accent font-medium text-accent-foreground",
                i > p.fase_atual && "border-border text-text-muted",
              )}
            >
              {i + 1}. {fase}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-sm text-text-muted">
          {t("Nesta fase há {n} dias").replace("{n}", String(dias))}
          {faltamNaFase > 0 ? ` · ${t("faltam {n} itens desta fase").replace("{n}", String(faltamNaFase))}` : ""}
        </p>
        {podeEditar ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {p.fase_atual > 0 ? (
              <Button variant="outline" disabled={editar.isPending} onClick={() => editar.mutate({ fase_atual: p.fase_atual - 1 })}>
                {t("Voltar fase")}
              </Button>
            ) : null}
            {p.fase_atual < ultimaFase ? (
              <Button disabled={editar.isPending} onClick={() => editar.mutate({ fase_atual: p.fase_atual + 1 })}>
                {t("Avançar para")} {p.fases[p.fase_atual + 1]}
              </Button>
            ) : p.situacao !== "concluido" ? (
              <Button disabled={editar.isPending} onClick={() => editar.mutate({ situacao: "concluido" })}>
                {t("Concluir projeto")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ── Checklist ── */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">{t("Checklist")}</h2>
        <div className="mt-3 flex flex-col gap-2">
          {p.fases.map((fase, i) => (
            <ChecklistDaFase
              key={`${i}-${fase}`}
              projetoId={id}
              indice={i}
              nome={fase}
              atual={i === p.fase_atual}
              itens={p.itens.filter((it) => it.fase === i)}
              podeEditar={podeEditar}
              onMudou={recarregar}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Notas ── */}
        <NotasDoProjeto
          key={p.notas ?? ""}
          notas={p.notas}
          podeEditar={podeEditar}
          salvando={editar.isPending}
          onSalvar={(notas) => editar.mutate({ notas })}
        />

        {/* ── Histórico ── */}
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">{t("Histórico")}</h2>
          {p.eventos.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">{t("Nada registrado ainda.")}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {p.eventos.map((e) => (
                <li key={e.id} className="flex gap-3 text-sm">
                  <span className="w-28 shrink-0 tabular-nums text-text-subtle" suppressHydrationWarning>
                    {new Intl.DateTimeFormat("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(e.created_at))}
                  </span>
                  <span>{e.texto}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {podeExcluir ? (
        <div>
          <Button variant="ghost" className="text-error-fg" onClick={() => setConfirmarExclusao(true)}>
            <Trash aria-hidden />
            {t("Excluir projeto")}
          </Button>
        </div>
      ) : null}

      <AlertDialog open={confirmarExclusao} onOpenChange={setConfirmarExclusao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Excluir este projeto?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("O checklist e o histórico vão junto, e não dá para desfazer. Para tirar do quadro sem apagar, mude a situação para Cancelado.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => excluir.mutate()}>{t("Excluir")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NomeDoProjeto({
  nome,
  podeEditar,
  onSalvar,
}: {
  nome: string;
  podeEditar: boolean;
  onSalvar: (nome: string) => void;
}) {
  const t = useT();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(nome);
  if (editando) {
    return (
      <form
        className="flex max-w-xl gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valor.trim() && valor.trim() !== nome) onSalvar(valor.trim());
          setEditando(false);
        }}
      >
        <Input value={valor} onChange={(e) => setValor(e.target.value)} maxLength={160} autoFocus aria-label={t("Nome do projeto")} />
        <Button type="submit">{t("Salvar")}</Button>
      </form>
    );
  }
  return (
    <h1 className="flex items-center gap-2 text-3xl font-semibold">
      {nome}
      {podeEditar ? (
        <button
          type="button"
          className="text-text-subtle hover:text-text"
          aria-label={t("Renomear projeto")}
          onClick={() => setEditando(true)}
        >
          <PencilSimple size={18} aria-hidden />
        </button>
      ) : null}
    </h1>
  );
}

function ValorDoProjeto({
  centavos,
  podeEditar,
  onSalvar,
}: {
  centavos: number | null;
  podeEditar: boolean;
  onSalvar: (centavos: number | null) => void;
}) {
  const t = useT();
  const [texto, setTexto] = useState(centavos === null ? "" : (centavos / 100).toFixed(2).replace(".", ","));
  const lido = centavosDoTexto(texto);
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-text-muted">{t("Valor")}:</span>
      {podeEditar ? (
        <Input
          className="h-8 w-32"
          inputMode="decimal"
          value={texto}
          placeholder="0,00"
          aria-invalid={Number.isNaN(lido)}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => {
            if (!Number.isNaN(lido) && lido !== centavos) onSalvar(lido);
          }}
        />
      ) : (
        <span className="font-medium">{valorEmReais(centavos) ?? t("Sem valor")}</span>
      )}
    </label>
  );
}

function ChecklistDaFase({
  projetoId,
  indice,
  nome,
  atual,
  itens,
  podeEditar,
  onMudou,
}: {
  projetoId: string;
  indice: number;
  nome: string;
  atual: boolean;
  itens: ItemDoProjeto[];
  podeEditar: boolean;
  onMudou: () => void;
}) {
  const t = useT();
  const [aberta, setAberta] = useState(atual);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novoPrazo, setNovoPrazo] = useState("");
  const feitos = itens.filter((i) => i.feito).length;
  const base = `/api/v1/converzon/projetos/${projetoId}/itens`;

  const mudarItem = useMutation({
    mutationFn: ({ itemId, mudancas }: { itemId: string; mudancas: Record<string, unknown> }) =>
      apiClient.patch(`${base}/${itemId}`, mudancas),
    onError: showApiError,
    onSuccess: onMudou,
  });
  const apagarItem = useMutation({
    mutationFn: (itemId: string) => apiClient.delete(`${base}/${itemId}`),
    onError: showApiError,
    onSuccess: onMudou,
  });
  const adicionar = useMutation({
    mutationFn: () => apiClient.post(base, { fase: indice, titulo: novoTitulo.trim(), prazo: novoPrazo || null }),
    onError: showApiError,
    onSuccess: () => {
      setNovoTitulo("");
      setNovoPrazo("");
      onMudou();
    },
  });

  return (
    <div className={cn("rounded-lg border", atual ? "border-accent" : "border-border")}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        aria-expanded={aberta}
        onClick={() => setAberta((v) => !v)}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          {aberta ? <CaretDown size={14} aria-hidden /> : <CaretRight size={14} aria-hidden />}
          {indice + 1}. {nome}
          {atual ? <span className="cz-chip cz-chip-nova">{t("fase atual")}</span> : null}
        </span>
        <span className="text-xs tabular-nums text-text-muted">
          {feitos}/{itens.length}
        </span>
      </button>

      {aberta ? (
        <div className="flex flex-col gap-1 border-t border-border px-4 py-3">
          {itens.length === 0 ? <p className="text-sm text-text-subtle">{t("Nenhum item nesta fase.")}</p> : null}
          {itens.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-md px-1 py-1.5 hover:bg-surface-elevated">
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-accent"
                checked={item.feito}
                disabled={!podeEditar || mudarItem.isPending}
                aria-label={item.titulo}
                onChange={(e) => mudarItem.mutate({ itemId: item.id, mudancas: { feito: e.target.checked } })}
              />
              <span className={cn("min-w-0 flex-1 text-sm", item.feito && "text-text-subtle line-through")}>
                {item.titulo}
              </span>
              {podeEditar ? (
                <Input
                  type="date"
                  className="h-7 w-36 text-xs"
                  defaultValue={item.prazo ?? ""}
                  aria-label={t("Prazo do item")}
                  onChange={(e) => mudarItem.mutate({ itemId: item.id, mudancas: { prazo: e.target.value || null } })}
                />
              ) : item.prazo ? (
                <span className="text-xs text-text-muted">{dataBr(item.prazo)}</span>
              ) : null}
              {podeEditar ? (
                <button
                  type="button"
                  className="text-text-subtle hover:text-error-fg"
                  aria-label={t("Apagar item")}
                  onClick={() => apagarItem.mutate(item.id)}
                >
                  <Trash size={14} aria-hidden />
                </button>
              ) : null}
            </div>
          ))}

          {podeEditar ? (
            <form
              className="mt-2 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (novoTitulo.trim()) adicionar.mutate();
              }}
            >
              <Input
                className="h-8 min-w-48 flex-1"
                value={novoTitulo}
                maxLength={200}
                placeholder={t("Novo item")}
                aria-label={t("Novo item")}
                onChange={(e) => setNovoTitulo(e.target.value)}
              />
              <Input
                type="date"
                className="h-8 w-36"
                value={novoPrazo}
                aria-label={t("Prazo do item")}
                onChange={(e) => setNovoPrazo(e.target.value)}
              />
              <Button type="submit" size="sm" variant="outline" disabled={!novoTitulo.trim() || adicionar.isPending}>
                {t("Adicionar")}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function NotasDoProjeto({
  notas,
  podeEditar,
  salvando,
  onSalvar,
}: {
  notas: string | null;
  podeEditar: boolean;
  salvando: boolean;
  onSalvar: (notas: string | null) => void;
}) {
  const t = useT();
  const [texto, setTexto] = useState(notas ?? "");
  const mudou = texto !== (notas ?? "");
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="text-lg font-semibold">{t("Notas")}</h2>
      <Textarea
        className="mt-3 min-h-40"
        value={texto}
        disabled={!podeEditar}
        maxLength={20000}
        placeholder={t("Acessos, combinados com o cliente, links importantes...")}
        aria-label={t("Notas")}
        onChange={(e) => setTexto(e.target.value)}
      />
      {podeEditar ? (
        <div className="mt-2 flex justify-end">
          <Button size="sm" disabled={!mudou || salvando} onClick={() => onSalvar(texto.trim() ? texto : null)}>
            {t("Salvar notas")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
