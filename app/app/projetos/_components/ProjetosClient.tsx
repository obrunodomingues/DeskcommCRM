"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { roleAtLeast } from "@/lib/auth/types";
import {
  COLUNAS_DO_QUADRO,
  DIAS_PARA_PARADO,
  MODELOS_DE_PROJETO,
  TIPOS_DE_PROJETO,
  diasNaFase,
  estadoDoPrazo,
  mostrarNoQuadro,
  percentualFeito,
  resumoDaSemana,
  type ProjetoNaLista,
  type SituacaoDoProjeto,
  type TipoDeProjeto,
} from "@/lib/converzon/projetos";
import { Plus } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { NovoProjetoDialog } from "./NovoProjetoDialog";

/** "2026-11-20" → "20/11" (data de calendário, sem fuso). */
export function diaMes(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

/**
 * Fork Converzon — a tela "Projetos": o resumo da semana no topo e o quadro por
 * situação. Cada card leva ao projeto (fases, checklist, notas e histórico).
 */
export function ProjetosClient() {
  const t = useT();
  const { activeOrg } = useAuth();
  const podeEditar = roleAtLeast(activeOrg?.role, "agent");
  const [tipo, setTipo] = useState<TipoDeProjeto | "todos">("todos");
  const [novo, setNovo] = useState(false);

  const consulta = useQuery({
    queryKey: ["converzon-projetos"],
    queryFn: () =>
      apiClient
        .get<{ data: { projetos: ProjetoNaLista[]; hoje: string } }>("/api/v1/converzon/projetos")
        .then((r) => r.data),
  });
  // Lido uma vez ao abrir a tela: "parado há N dias" não precisa andar sozinho.
  const [agora] = useState(() => Date.now());
  const projetos = consulta.data?.projetos ?? [];
  // O "hoje" vem do servidor (fuso de Brasília), o mesmo que contou os atrasados.
  const hoje = consulta.data?.hoje ?? "";
  const resumo = resumoDaSemana(projetos, hoje, agora);
  const visiveis = projetos.filter((p) => (tipo === "todos" || p.tipo === tipo) && mostrarNoQuadro(p, agora));

  const tituloDaColuna = (s: SituacaoDoProjeto) =>
    s === "andamento"
      ? t("Em andamento")
      : s === "esperando_cliente"
        ? t("Esperando o cliente")
        : s === "pausado"
          ? t("Pausado")
          : t("Concluídos");

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold">{t("Projetos")}</h1>
          <p className="mt-1 text-base text-text-muted">
            {t("A execução de cada serviço vendido, do briefing à entrega.")}
          </p>
        </div>
        {podeEditar ? (
          <Button onClick={() => setNovo(true)}>
            <Plus aria-hidden />
            {t("Novo projeto")}
          </Button>
        ) : null}
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("Esta semana")}>
        <Resumo titulo={t("Atrasados")} valor={resumo.atrasados} alerta={resumo.atrasados > 0 ? "erro" : null} />
        <Resumo titulo={t("Vencem em 7 dias")} valor={resumo.vencendo} alerta={resumo.vencendo > 0 ? "aviso" : null} />
        <Resumo
          titulo={t("Parados há 7 dias ou mais")}
          valor={resumo.parados}
          alerta={resumo.parados > 0 ? "aviso" : null}
        />
        <Resumo titulo={t("Esperando o cliente")} valor={resumo.esperandoCliente} alerta={null} />
      </section>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t("Tipo de serviço")}>
        <Filtro ativo={tipo === "todos"} onClick={() => setTipo("todos")}>
          {t("Todos")}
        </Filtro>
        {TIPOS_DE_PROJETO.map((tp) => (
          <Filtro key={tp} ativo={tipo === tp} onClick={() => setTipo(tp)}>
            {MODELOS_DE_PROJETO[tp].rotulo}
          </Filtro>
        ))}
      </div>

      {consulta.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : consulta.isError ? (
        <p className="text-sm text-text-muted">{t("Não consegui carregar os projetos.")}</p>
      ) : projetos.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center">
          <p className="text-base font-medium">{t("Nenhum projeto ainda.")}</p>
          <p className="mt-1 text-sm text-text-muted">
            {t("Crie o primeiro com o botão Novo projeto: as fases e o checklist já vêm prontos pelo tipo de serviço.")}
          </p>
        </div>
      ) : (
        <section className="grid items-start gap-4 lg:grid-cols-4">
          {COLUNAS_DO_QUADRO.map((s) => {
            const daColuna = visiveis.filter((p) => p.situacao === s);
            return (
              <div key={s} className="flex flex-col gap-3 rounded-xl bg-surface-elevated p-3">
                <h2 className="flex items-center justify-between px-1 text-sm font-semibold">
                  {tituloDaColuna(s)}
                  <span className="text-xs tabular-nums text-text-muted">{daColuna.length}</span>
                </h2>
                {daColuna.length === 0 ? (
                  <p className="px-1 pb-2 text-xs text-text-subtle">{t("Nada por aqui.")}</p>
                ) : (
                  daColuna.map((p) => <CartaoDoProjeto key={p.id} p={p} hoje={hoje} agora={agora} />)
                )}
              </div>
            );
          })}
        </section>
      )}

      <NovoProjetoDialog aberto={novo} onFechar={() => setNovo(false)} />
    </div>
  );
}

function Resumo({ titulo, valor, alerta }: { titulo: string; valor: number; alerta: "erro" | "aviso" | null }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <span className="text-sm text-text-muted">{titulo}</span>
      <span
        className={cn(
          "mt-1 block text-3xl font-semibold tabular-nums",
          alerta === "erro" && "text-error-fg",
          alerta === "aviso" && "text-warning-fg",
        )}
      >
        {valor}
      </span>
    </div>
  );
}

function Filtro({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        ativo ? "border-accent bg-accent text-accent-foreground" : "border-border bg-card text-text-muted hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

function CartaoDoProjeto({ p, hoje, agora }: { p: ProjetoNaLista; hoje: string; agora: number }) {
  const t = useT();
  const prazo = estadoDoPrazo(p.prazo, hoje);
  const dias = diasNaFase(p.fase_desde, agora);
  const parado = p.situacao === "andamento" && dias >= DIAS_PARA_PARADO;
  const pct = percentualFeito(p.itens_feitos, p.itens_total);

  return (
    <Link href={`/app/projetos/${p.id}`} className="cz-ergue flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{p.nome}</span>
          <span className="block truncate text-xs text-text-muted">{p.contato?.nome ?? t("Sem cliente")}</span>
        </span>
        <span className="cz-chip cz-chip-neutro shrink-0">{MODELOS_DE_PROJETO[p.tipo].rotulo}</span>
      </span>

      <span className="text-xs text-text-muted">
        {t("Fase {n} de {total}")
          .replace("{n}", String(p.fase_atual + 1))
          .replace("{total}", String(p.fases.length))}
        {" · "}
        <span className="font-medium text-text">{p.fases[p.fase_atual]}</span>
      </span>

      <span className="h-1.5 overflow-hidden rounded-full bg-surface-elevated" aria-hidden>
        <span className="cz-barra block h-full rounded-full" style={{ width: `${pct}%` }} />
      </span>
      <span className="text-xs tabular-nums text-text-subtle">
        {t("{feitos} de {total} itens").replace("{feitos}", String(p.itens_feitos)).replace("{total}", String(p.itens_total))}
      </span>

      <span className="flex flex-wrap gap-1.5">
        {p.prazo ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs",
              prazo === "atrasado" && "bg-error-bg text-error-fg",
              prazo === "esta_semana" && "bg-warning-bg text-warning-fg",
              prazo === "em_dia" && "bg-surface-elevated text-text-muted",
            )}
          >
            {prazo === "atrasado" ? t("Atrasado") : t("Prazo")} {diaMes(p.prazo)}
          </span>
        ) : null}
        {p.itens_atrasados > 0 ? (
          <span className="rounded-full bg-error-bg px-2 py-0.5 text-xs text-error-fg">
            {t("{n} itens atrasados").replace("{n}", String(p.itens_atrasados))}
          </span>
        ) : null}
        {parado ? (
          <span className="rounded-full bg-warning-bg px-2 py-0.5 text-xs text-warning-fg">
            {t("Parado há {n} dias").replace("{n}", String(dias))}
          </span>
        ) : null}
      </span>
    </Link>
  );
}
