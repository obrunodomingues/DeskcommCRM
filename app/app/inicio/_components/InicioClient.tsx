"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import {
  caminhoDaTendencia,
  haQuantoTempo,
  iniciais,
  larguraDaBarra,
  saudacao,
  type ComandoDaConversa,
  type ResumoDoInicio,
} from "@/lib/converzon/inicio";
import { ArrowRight, CalendarCheck, Globe, Users, WhatsappLogo } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Fork Converzon — a tela "Início". Lê `/api/v1/converzon/inicio` a cada minuto.
 * Cada cartão leva à tela de onde o número vem.
 */
export function InicioClient({ nome, gerente }: { nome: string; gerente: boolean }) {
  const t = useT();
  const idioma = useTagDeIdioma();
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const consulta = useQuery({
    queryKey: ["converzon-inicio"],
    queryFn: () => apiClient.get<{ data: ResumoDoInicio }>("/api/v1/converzon/inicio").then((r) => r.data),
    refetchInterval: 60_000,
    placeholderData: (anterior) => anterior,
  });
  const r = consulta.data;
  const numero = (n: number | null | undefined) => (typeof n === "number" ? n.toLocaleString(idioma) : "—");

  const hoje = new Date(agora);
  const dataLonga = new Intl.DateTimeFormat(idioma, { weekday: "long", day: "numeric", month: "long" }).format(hoje);
  const ola = nome ? `${t(saudacao(hoje.getHours()))}, ${nome}` : t(saudacao(hoje.getHours()));
  const esperando = r?.mensagens.semResposta;
  const resumoDasMensagens =
    esperando === undefined || esperando === null
      ? ""
      : esperando === 0
        ? t("nenhuma conversa esperando resposta")
        : esperando === 1
          ? t("1 conversa esperando resposta")
          : t("{n} conversas esperando resposta").replace("{n}", numero(esperando));

  const quando = (iso: string) =>
    new Intl.DateTimeFormat(idioma, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const hora = (iso: string) => new Intl.DateTimeFormat(idioma, { hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const diaDaSemana = (iso: string) => new Intl.DateTimeFormat(idioma, { weekday: "short" }).format(new Date(iso)).replace(".", "");
  const diaDoMes = (iso: string) => new Intl.DateTimeFormat(idioma, { day: "2-digit" }).format(new Date(iso));

  const maiorEtapa = Math.max(0, ...(r?.funil.etapas ?? []).map((e) => e.abertos));

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="cz-serifa text-4xl leading-tight font-semibold" suppressHydrationWarning>
            {ola}
          </h1>
          <p className="mt-1 text-base text-text-muted first-letter:uppercase" suppressHydrationWarning>
            {dataLonga}
            {resumoDasMensagens ? ` · ${resumoDasMensagens}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/app/inbox">
              <WhatsappLogo aria-hidden />
              {t("Abrir WhatsApp")}
            </Link>
          </Button>
          <Button asChild>
            <Link href="/app/agenda">
              <CalendarCheck aria-hidden />
              {t("Abrir agenda")}
            </Link>
          </Button>
        </div>
      </header>

      {consulta.isLoading && !r ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : null}

      {consulta.isError && !r ? (
        <p className="text-sm text-text-muted">{t("Não consegui carregar o resumo agora. Tente de novo em instantes.")}</p>
      ) : null}

      {r ? (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t("Resumo")}>
            <Numero
              href="/app/inbox"
              ladrilho="cz-ladrilho-azul"
              icone={<WhatsappLogo size={20} />}
              etiqueta={t("agora")}
              titulo={t("Esperando resposta")}
              valor={numero(r.mensagens.semResposta)}
              detalhe={
                r.mensagens.maisAntiga
                  ? `${t("A mais antiga chegou")} ${haQuantoTempo(r.mensagens.maisAntiga, agora, t)}`
                  : t("Tudo respondido")
              }
            />
            <Numero
              href="/app/kanban"
              ladrilho="cz-ladrilho"
              icone={<Users size={20} />}
              etiqueta={t("7 dias")}
              titulo={t("Novos pacientes")}
              valor={numero(r.pacientes.novos7Dias)}
              detalhe={
                typeof r.pacientes.doFormulario7Dias === "number"
                  ? t("{n} pelo formulário do site").replace("{n}", numero(r.pacientes.doFormulario7Dias))
                  : null
              }
            />
            <Numero
              href="/app/agenda"
              ladrilho="cz-ladrilho-ambar"
              icone={<CalendarCheck size={20} />}
              etiqueta={t("7 dias")}
              titulo={t("Consultas marcadas")}
              valor={numero(r.consultas.proximos7Dias)}
              detalhe={
                r.consultas.proximaVaga
                  ? `${t("Próximo horário livre")}: ${quando(r.consultas.proximaVaga)}`
                  : r.consultas.vagas30Dias === 0
                    ? t("Sem horário livre nos próximos 30 dias")
                    : null
              }
            />
            {gerente && r.site ? (
              <Numero
                href="/app/metricas-do-site"
                ladrilho="cz-ladrilho-roxo"
                icone={<Globe size={20} />}
                etiqueta={t("7 dias")}
                titulo={t("Visitas no site")}
                valor={numero(r.site.visitas7Dias)}
                detalhe={null}
                tendencia={r.site.serie}
              />
            ) : (
              <Numero
                href="/app/kanban"
                ladrilho="cz-ladrilho-roxo"
                icone={<Users size={20} />}
                etiqueta={t("agora")}
                titulo={t("Pacientes no funil")}
                valor={numero(r.funil.abertos)}
                detalhe={r.funil.nome}
              />
            )}
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Bloco titulo={t("Próximas consultas")} href="/app/agenda" acao={t("Ver agenda")}>
              {r.consultas.lista.length === 0 ? (
                <Vazio texto={t("Nenhuma consulta marcada daqui para frente.")} />
              ) : (
                <ul className="flex flex-col gap-1">
                  {r.consultas.lista.map((c) => (
                    <li key={c.id}>
                      <Link href="/app/agenda" className="cz-linha flex items-center gap-3 rounded-lg px-3 py-2.5">
                        <span className="flex w-14 shrink-0 flex-col items-center rounded-lg bg-surface-elevated py-1.5">
                          <span className="text-xs font-semibold text-text-muted uppercase" suppressHydrationWarning>{diaDaSemana(c.inicio)}</span>
                          <span className="text-lg leading-tight font-bold" suppressHydrationWarning>{diaDoMes(c.inicio)}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{c.nome}</span>
                          {c.tipo ? <span className="block truncate text-sm text-text-muted">{c.tipo}</span> : null}
                        </span>
                        <span className={cn("cz-chip", c.teleconsulta ? "cz-chip-nova" : "cz-chip-equipe")}>
                          {c.teleconsulta ? t("Teleconsulta") : t("Presencial")}
                        </span>
                        <span className="w-12 shrink-0 text-right text-sm font-semibold tabular-nums" suppressHydrationWarning>{hora(c.inicio)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Bloco>

            <Bloco titulo={t("Esperando resposta")} href="/app/inbox" acao={t("Abrir WhatsApp")}>
              {r.mensagens.lista.length === 0 ? (
                <Vazio texto={t("Nenhuma conversa esperando resposta.")} />
              ) : (
                <ul className="flex flex-col gap-1">
                  {r.mensagens.lista.map((m) => (
                    <li key={m.conversaId}>
                      <Link href={`/app/inbox/${m.conversaId}`} className="cz-linha flex items-center gap-3 rounded-lg px-3 py-2.5">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-elevated text-sm font-bold text-text-muted">
                          {iniciais(m.nome)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-baseline gap-2">
                            <span className="truncate text-sm font-semibold">{m.nome}</span>
                            <span className="shrink-0 text-xs text-text-muted" suppressHydrationWarning>
                              {haQuantoTempo(m.recebidaEm, agora, t)}
                            </span>
                          </span>
                          {m.previa ? <span className="block truncate text-sm text-text-muted">{m.previa}</span> : null}
                        </span>
                        <ChipDoComando comando={m.comando} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Bloco>
          </section>

          <Bloco
            titulo={r.funil.nome ? `${t("Funil")} · ${r.funil.nome}` : t("Funil")}
            href="/app/kanban"
            acao={t("Abrir funil")}
          >
            {r.funil.etapas.length === 0 ? (
              <Vazio texto={t("Nenhum funil para mostrar.")} />
            ) : (
              <ul className="grid gap-x-6 gap-y-4 px-3 pb-2 sm:grid-cols-2 lg:grid-cols-4">
                {r.funil.etapas.map((e) => (
                  <li key={e.nome} className="cz-etapa flex flex-col gap-1.5">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm text-text-muted">{e.nome}</span>
                      <span className="text-lg font-bold tabular-nums">{numero(e.abertos)}</span>
                    </span>
                    <span className="h-2 overflow-hidden rounded-full bg-surface-elevated">
                      <span
                        className="cz-barra block h-full rounded-full"
                        style={{ width: `${larguraDaBarra(e.abertos, maiorEtapa)}%` }}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Bloco>
        </>
      ) : null}
    </div>
  );
}

function Numero({
  href,
  ladrilho,
  icone,
  etiqueta,
  titulo,
  valor,
  detalhe,
  tendencia,
}: {
  href: string;
  ladrilho: string;
  icone: React.ReactNode;
  etiqueta: string;
  titulo: string;
  valor: string;
  detalhe: string | null;
  tendencia?: number[];
}) {
  const caminho = tendencia ? caminhoDaTendencia(tendencia) : "";
  return (
    <Link href={href} className="cz-ergue relative flex flex-col gap-1 rounded-xl border border-border bg-card p-5">
      <span className="cz-chip cz-chip-neutro absolute top-4 right-4">{etiqueta}</span>
      <span className={cn(ladrilho, "cz-icone mb-3")} aria-hidden>
        {icone}
      </span>
      <span className="text-sm text-text-muted">{titulo}</span>
      <span className="text-3xl font-semibold tabular-nums">{valor}</span>
      {caminho ? (
        <svg viewBox="0 0 200 40" preserveAspectRatio="none" className="mt-1 h-9 w-full" aria-hidden>
          <path d={caminho} fill="none" stroke="var(--color-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
      ) : null}
      {detalhe ? <span className="text-sm text-text-muted" suppressHydrationWarning>{detalhe}</span> : null}
    </Link>
  );
}

function Bloco({ titulo, href, acao, children }: { titulo: string; href: string; acao: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-2 pb-3">
      <header className="flex items-center justify-between gap-3 px-3 pt-3 pb-2">
        <h2 className="text-lg font-semibold">{titulo}</h2>
        <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
          {acao}
          <ArrowRight size={14} aria-hidden />
        </Link>
      </header>
      {children}
    </section>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="px-3 py-6 text-center text-sm text-text-muted">{texto}</p>;
}

function ChipDoComando({ comando }: { comando: ComandoDaConversa | null }) {
  const t = useT();
  if (comando === "automatico") return <span className="cz-chip cz-chip-ia">{t("IA atendendo")}</span>;
  if (comando === "aguardando") return <span className="cz-chip cz-chip-espera">{t("Esperando a equipe")}</span>;
  if (comando === "humano") return <span className="cz-chip cz-chip-equipe">{t("Com a equipe")}</span>;
  return <span className="cz-chip cz-chip-nova">{t("Nova")}</span>;
}
