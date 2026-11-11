"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import {
  PERIODOS,
  variacao,
  type ItemDaLista,
  type PainelDoSite,
  type Periodo,
} from "@/lib/converzon/metricas-do-site";
import {
  ArrowsClockwise,
  Clock,
  Eye,
  FileText,
  Globe,
  MapPin,
  Users,
  Warning,
  WhatsappLogo,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Fork Converzon — a tela "Métricas do site". Lê `/api/v1/converzon/metricas-do-site`.
 *
 * Cores dos gráficos saem dos tokens do tema (`--color-accent` é a cor da marca),
 * então acompanham claro/escuro e a marca da instalação sem ramo por tema.
 */

interface Resposta {
  dias: Periodo;
  ga4: PainelDoSite | null;
  erro: { motivo: string; mensagem: string; email: string | null } | null;
  agora: number | null;
  crm: { leadsNovos: number | null; doFormularioDoSite: number | null };
}

const COR_PRINCIPAL = "var(--color-accent)";
const COR_SECUNDARIA = "hsl(199 89% 48%)";
const COR_ANTERIOR = "var(--color-text-subtle)";
const CORES_DA_ROSCA = [COR_PRINCIPAL, COR_SECUNDARIA, "hsl(38 92% 50%)", "hsl(262 83% 58%)", "var(--color-border-strong)"];

export function MetricasDoSiteClient() {
  const t = useT();
  const idioma = useTagDeIdioma();
  const [dias, setDias] = useState<Periodo>(28);
  const [forcar, setForcar] = useState(0);

  const consulta = useQuery({
    queryKey: ["converzon-metricas-do-site", dias, forcar],
    queryFn: () =>
      apiClient
        .get<{ data: Resposta }>(`/api/v1/converzon/metricas-do-site?dias=${dias}${forcar ? "&forcar=1" : ""}`)
        .then((r) => r.data),
    refetchInterval: 5 * 60 * 1000,
    placeholderData: (anterior) => anterior,
  });

  const numero = (n: number) => n.toLocaleString(idioma);
  const dados = consulta.data;
  const ga4 = dados?.ga4 ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label={t("Período")}>
          {PERIODOS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setDias(p)}
              aria-pressed={dias === p}
              className={cn(
                "rounded px-3 py-1.5 text-xs font-medium transition-colors",
                dias === p ? "bg-accent text-accent-fg" : "text-text-muted hover:text-text",
              )}
            >
              {p} {t("dias")}
            </button>
          ))}
        </div>
        {typeof dados?.agora === "number" && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-text-muted">
            <span className="h-2 w-2 animate-pulse rounded-full bg-success" aria-hidden />
            {numero(dados.agora)} {dados.agora === 1 ? t("pessoa no site agora") : t("pessoas no site agora")}
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {ga4 && (
            <span className="text-xs text-text-subtle">
              {t("Atualizado às")}{" "}
              {new Date(ga4.atualizadoEm).toLocaleTimeString(idioma, { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setForcar(Date.now())}
            disabled={consulta.isFetching}
          >
            <ArrowsClockwise size={14} className={cn("mr-1.5", consulta.isFetching && "animate-spin")} aria-hidden />
            {t("Atualizar agora")}
          </Button>
        </div>
      </div>

      {consulta.isLoading && <Esqueleto />}

      {consulta.isError && !dados && (
        <Aviso titulo={t("Não consegui carregar as métricas.")} texto={t("Tente de novo em instantes.")} />
      )}

      {dados?.erro && (
        <Aviso
          titulo={dados.erro.motivo === "sem_configuracao" ? t("O Google Analytics ainda não está conectado.") : t("O Google Analytics não respondeu como esperado.")}
          texto={dados.erro.mensagem}
          extra={dados.erro.email ? `${t("Conta de serviço")}: ${dados.erro.email}` : null}
        />
      )}

      {ga4 && (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <Cartao icone={<Users size={16} />} titulo={t("Visitantes")} valor={numero(ga4.totais.atual.visitantes)} delta={comparar(ga4, ga4.totais.atual.visitantes, ga4.totais.anterior.visitantes)} />
            <Cartao icone={<Globe size={16} />} titulo={t("Visitas")} valor={numero(ga4.totais.atual.visitas)} delta={comparar(ga4, ga4.totais.atual.visitas, ga4.totais.anterior.visitas)} />
            <Cartao icone={<Eye size={16} />} titulo={t("Páginas vistas")} valor={numero(ga4.totais.atual.paginas)} delta={comparar(ga4, ga4.totais.atual.paginas, ga4.totais.anterior.paginas)} />
            <Cartao icone={<FileText size={16} />} titulo={t("Formulários enviados")} valor={numero(ga4.eventos.atual.formularios)} delta={comparar(ga4, ga4.eventos.atual.formularios, ga4.eventos.anterior.formularios)} />
            <Cartao icone={<WhatsappLogo size={16} />} titulo={t("Cliques no WhatsApp")} valor={numero(ga4.eventos.atual.cliquesWhatsapp)} delta={comparar(ga4, ga4.eventos.atual.cliquesWhatsapp, ga4.eventos.anterior.cliquesWhatsapp)} />
            <Cartao icone={<Clock size={16} />} titulo={t("Tempo médio no site")} valor={duracao(ga4.totais.atual.tempoMedioSeg)} delta={comparar(ga4, ga4.totais.atual.tempoMedioSeg, ga4.totais.anterior.tempoMedioSeg)} />
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">{t("Visitas por dia")}</h2>
              <div className="flex items-center gap-4 text-xs text-text-muted">
                <Legenda cor={COR_PRINCIPAL} texto={t("Visitas")} />
                <Legenda cor={COR_SECUNDARIA} texto={t("Visitantes")} />
                <Legenda cor={COR_ANTERIOR} texto={t("Visitas no período anterior")} tracejada />
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ga4.serie} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="converzon-visitas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COR_PRINCIPAL} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={COR_PRINCIPAL} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis
                    dataKey="data"
                    tickFormatter={(d: string) => dataCurta(d, idioma)}
                    tick={{ fontSize: 11, fill: "var(--color-text-subtle)" }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={16}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--color-text-subtle)" }} tickLine={false} axisLine={false} />
                  <Tooltip
                    labelFormatter={(d) => dataLonga(String(d), idioma)}
                    formatter={(v, nome) => [numero(Number(v)), rotuloDaSerie(String(nome), t)]}
                    contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface-elevated)", fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="visitasAnterior" stroke={COR_ANTERIOR} strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
                  <Area type="monotone" dataKey="visitas" stroke={COR_PRINCIPAL} strokeWidth={2} fill="url(#converzon-visitas)" />
                  <Line type="monotone" dataKey="visitantes" stroke={COR_SECUNDARIA} strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Bloco titulo={t("De onde vêm as visitas")} className="lg:col-span-2">
              <ListaDeBarras itens={ga4.origens} unidade={t("visitas")} numero={numero} vazio={t("Nenhum dado no período.")} />
            </Bloco>
            <Bloco titulo={t("Celular ou computador")}>
              <Rosca itens={ga4.aparelhos} numero={numero} vazio={t("Nenhum dado no período.")} />
            </Bloco>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Bloco titulo={t("Páginas mais vistas")}>
              <ListaDeBarras itens={ga4.paginas} unidade={t("visualizações")} numero={numero} vazio={t("Nenhum dado no período.")} />
            </Bloco>
            <Bloco titulo={t("Cidades")} icone={<MapPin size={14} />}>
              <ListaDeBarras itens={ga4.cidades} unidade={t("visitantes")} numero={numero} vazio={t("Nenhum dado no período.")} />
            </Bloco>
          </section>
        </>
      )}

      {dados && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">{t("Do site ao CRM")}</h2>
          <p className="mb-4 text-xs text-text-muted">{t("No mesmo período, do clique até o lead no funil.")}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <EtapaDoFunil
              titulo={t("Visitas no site")}
              valor={ga4 ? numero(ga4.totais.atual.visitas) : "—"}
            />
            <EtapaDoFunil
              titulo={t("Contatos pelo site")}
              detalhe={t("formulário + WhatsApp")}
              valor={ga4 ? numero(ga4.eventos.atual.formularios + ga4.eventos.atual.cliquesWhatsapp) : "—"}
              taxa={ga4 && ga4.totais.atual.visitas > 0
                ? `${pct((ga4.eventos.atual.formularios + ga4.eventos.atual.cliquesWhatsapp) / ga4.totais.atual.visitas, idioma)} ${t("das visitas")}`
                : null}
            />
            <EtapaDoFunil
              titulo={t("Leads novos no CRM")}
              detalhe={typeof dados.crm.doFormularioDoSite === "number" ? `${numero(dados.crm.doFormularioDoSite)} ${t("pelo formulário do site")}` : null}
              valor={typeof dados.crm.leadsNovos === "number" ? numero(dados.crm.leadsNovos) : "—"}
            />
          </div>
        </section>
      )}
    </div>
  );
}

function Cartao({ icone, titulo, valor, delta }: { icone: React.ReactNode; titulo: string; valor: string; delta: number | null }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
      <span className="flex items-center gap-1.5 text-xs text-text-muted">
        <span className="text-accent" aria-hidden>{icone}</span>
        {titulo}
      </span>
      <span className="text-2xl font-semibold tabular-nums">{valor}</span>
      {delta === null ? (
        <span className="text-[11px] text-text-subtle">{t("sem base para comparar")}</span>
      ) : (
        <span className={cn("text-[11px] font-medium tabular-nums", delta >= 0 ? "text-success" : "text-error")}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}% <span className="font-normal text-text-subtle">{t("vs. período anterior")}</span>
        </span>
      )}
    </div>
  );
}

function Bloco({ titulo, icone, className, children }: { titulo: string; icone?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        {icone && <span className="text-text-muted" aria-hidden>{icone}</span>}
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function ListaDeBarras({ itens, unidade, numero, vazio }: { itens: ItemDaLista[]; unidade: string; numero: (n: number) => string; vazio: string }) {
  if (itens.length === 0) return <p className="text-xs text-text-subtle">{vazio}</p>;
  const total = itens.reduce((s, i) => s + i.valor, 0);
  const maior = Math.max(...itens.map((i) => i.valor));
  return (
    <ul className="flex flex-col gap-2.5">
      {itens.map((i) => (
        <li key={i.nome} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate" title={i.nome}>{i.nome}</span>
            <span className="shrink-0 tabular-nums text-text-muted">
              {numero(i.valor)} {unidade} · {total > 0 ? Math.round((i.valor / total) * 100) : 0}%
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-elevated">
            <div className="h-full rounded-full bg-accent" style={{ width: `${maior > 0 ? Math.max(2, (i.valor / maior) * 100) : 0}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Rosca({ itens, numero, vazio }: { itens: ItemDaLista[]; numero: (n: number) => string; vazio: string }) {
  if (itens.length === 0) return <p className="text-xs text-text-subtle">{vazio}</p>;
  const total = itens.reduce((s, i) => s + i.valor, 0);
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="h-40 w-40">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={itens} dataKey="valor" nameKey="nome" innerRadius="62%" outerRadius="100%" paddingAngle={2} stroke="none">
              {itens.map((i, n) => (
                <Cell key={i.nome} fill={CORES_DA_ROSCA[n % CORES_DA_ROSCA.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(v, nome) => [numero(Number(v)), String(nome)]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex w-full flex-col gap-1.5 text-xs">
        {itens.map((i, n) => (
          <li key={i.nome} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CORES_DA_ROSCA[n % CORES_DA_ROSCA.length] }} aria-hidden />
              {i.nome}
            </span>
            <span className="tabular-nums text-text-muted">{total > 0 ? Math.round((i.valor / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EtapaDoFunil({ titulo, valor, detalhe, taxa }: { titulo: string; valor: string; detalhe?: string | null; taxa?: string | null }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-surface-elevated p-3">
      <span className="text-xs text-text-muted">{titulo}</span>
      <span className="text-xl font-semibold tabular-nums">{valor}</span>
      {detalhe && <span className="text-[11px] text-text-subtle">{detalhe}</span>}
      {taxa && <span className="text-[11px] font-medium text-accent">{taxa}</span>}
    </div>
  );
}

function Legenda({ cor, texto, tracejada = false }: { cor: string; texto: string; tracejada?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-0 w-4 border-t-2"
        style={{ borderColor: cor, borderTopStyle: tracejada ? "dashed" : "solid" }}
        aria-hidden
      />
      {texto}
    </span>
  );
}

function Aviso({ titulo, texto, extra = null }: { titulo: string; texto: string; extra?: string | null }) {
  return (
    <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning-bg p-4 text-sm text-warning-fg">
      <Warning size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="flex flex-col gap-1">
        <strong className="font-semibold">{titulo}</strong>
        <span>{texto}</span>
        {extra && <span className="text-xs opacity-80">{extra}</span>}
      </div>
    </div>
  );
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-72" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
    </div>
  );
}

function rotuloDaSerie(chave: string, t: (s: string) => string): string {
  if (chave === "visitas") return t("Visitas");
  if (chave === "visitantes") return t("Visitantes");
  return t("Visitas no período anterior");
}

function dataCurta(d: string, idioma: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString(idioma, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

function dataLonga(d: string, idioma: string): string {
  return new Date(`${d}T12:00:00Z`).toLocaleDateString(idioma, { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" });
}

function duracao(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = Math.round(seg % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function pct(fracao: number, idioma: string): string {
  return fracao.toLocaleString(idioma, { style: "percent", maximumFractionDigits: 1 });
}

/** A variação só aparece quando o período anterior serve de régua (`comparavel`). */
function comparar(ga4: PainelDoSite, atual: number, anterior: number): number | null {
  return ga4.comparavel ? variacao(atual, anterior) : null;
}
