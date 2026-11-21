import "server-only";

import { importPKCS8, SignJWT } from "jose";

import { env } from "@/lib/env";
import {
  agrupar,
  caminhoLimpo,
  hojeNoFuso,
  montarSerie,
  nomeDaCidade,
  nomeDaOrigem,
  nomeDaPagina,
  nomeDoAparelho,
  periodoAnteriorComparavel,
  somaDias,
  type Eventos,
  type PainelDoSite,
  type Totais,
} from "./metricas-do-site";

/**
 * FORK CONVERZON — o cliente do Google Analytics 4 da tela "Métricas do site".
 *
 * Conta de serviço (JSON em `CONVERZON_GA4_CREDENTIALS_B64`) com papel "Leitor"
 * na propriedade `CONVERZON_GA4_PROPERTY_ID`. O token sai de um JWT assinado com
 * a chave da conta (RS256, `jose`) trocado no endpoint OAuth do Google — sem SDK
 * novo. Mesmas consultas que o painel antigo do site fazia, mais a duração média
 * da visita e a série do período anterior.
 *
 * Cache em memória: o painel por 10 min e "agora no site" por 1 min. A cota da
 * Data API é por propriedade e a tela pode ficar aberta o dia inteiro.
 */

export const FUSO_DO_SITE = "America/Sao_Paulo";
const ESCOPO = "https://www.googleapis.com/auth/analytics.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://analyticsdata.googleapis.com/v1beta";
const TTL_PAINEL_MS = 10 * 60 * 1000;
const TTL_AGORA_MS = 60 * 1000;

export type MotivoDoErro = "sem_configuracao" | "credencial_invalida" | "sem_acesso" | "falha";

export class Ga4Erro extends Error {
  constructor(
    readonly motivo: MotivoDoErro,
    mensagem: string,
    /** E-mail da conta de serviço — é ele que precisa de acesso à propriedade. */
    readonly email: string | null = null,
  ) {
    super(mensagem);
    this.name = "Ga4Erro";
  }
}

interface Credencial {
  client_email: string;
  private_key: string;
}

function configuracao(): { propriedade: string; credencial: Credencial } {
  const propriedade = env.CONVERZON_GA4_PROPERTY_ID.trim();
  const bruto = env.CONVERZON_GA4_CREDENTIALS_B64.trim();
  if (!propriedade || !bruto) {
    throw new Ga4Erro("sem_configuracao", "O Google Analytics ainda não foi configurado nesta instalação.");
  }
  let credencial: Partial<Credencial>;
  try {
    credencial = JSON.parse(Buffer.from(bruto, "base64").toString("utf8")) as Partial<Credencial>;
  } catch {
    throw new Ga4Erro("credencial_invalida", "A chave do Google Analytics não é um JSON válido em base64.");
  }
  if (!credencial.client_email || !credencial.private_key) {
    throw new Ga4Erro("credencial_invalida", "A chave do Google Analytics não tem o e-mail ou a chave privada da conta de serviço.");
  }
  return { propriedade, credencial: credencial as Credencial };
}

let tokenEmCache: { valor: string; expiraEm: number } | null = null;

async function token(credencial: Credencial, renovar = false): Promise<string> {
  if (!renovar && tokenEmCache && tokenEmCache.expiraEm > Date.now() + 60_000) return tokenEmCache.valor;
  let assinatura: string;
  try {
    const chave = await importPKCS8(credencial.private_key, "RS256");
    assinatura = await new SignJWT({ scope: ESCOPO })
      .setProtectedHeader({ alg: "RS256", typ: "JWT" })
      .setIssuer(credencial.client_email)
      .setAudience(TOKEN_URL)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(chave);
  } catch {
    throw new Ga4Erro("credencial_invalida", "Não consegui assinar com a chave da conta de serviço.", credencial.client_email);
  }
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: assinatura }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  const corpo = resp ? ((await resp.json().catch(() => ({}))) as { access_token?: string; expires_in?: number }) : {};
  if (!resp || !resp.ok || !corpo.access_token) {
    throw new Ga4Erro(
      resp && resp.status < 500 ? "credencial_invalida" : "falha",
      "O Google recusou a chave da conta de serviço.",
      credencial.client_email,
    );
  }
  tokenEmCache = { valor: corpo.access_token, expiraEm: Date.now() + (corpo.expires_in ?? 3600) * 1000 };
  return corpo.access_token;
}

interface RelatorioBruto {
  dimensionHeaders?: Array<{ name: string }>;
  metricHeaders?: Array<{ name: string }>;
  rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
}
type Linha = Record<string, string | number>;

/** Cada linha do relatório vira um objeto { dimensão: texto, métrica: número }. */
export function linhas(rel: RelatorioBruto | undefined): Linha[] {
  if (!rel) return [];
  const dims = (rel.dimensionHeaders ?? []).map((h) => h.name);
  const mets = (rel.metricHeaders ?? []).map((h) => h.name);
  return (rel.rows ?? []).map((r) => {
    const l: Linha = {};
    dims.forEach((n, i) => (l[n] = r.dimensionValues?.[i]?.value ?? ""));
    mets.forEach((n, i) => (l[n] = Number(r.metricValues?.[i]?.value ?? 0)));
    return l;
  });
}

async function api<T>(metodo: string, corpo: unknown): Promise<T> {
  const { propriedade, credencial } = configuracao();
  const chamar = async (renovar: boolean) =>
    fetch(`${API}/properties/${encodeURIComponent(propriedade)}:${metodo}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await token(credencial, renovar)}`, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);
  let resp = await chamar(false);
  if (resp?.status === 401) resp = await chamar(true);
  if (!resp) throw new Ga4Erro("falha", "O Google Analytics não respondeu. Tente de novo em instantes.");
  const json = (await resp.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (resp.status === 403) {
    throw new Ga4Erro(
      "sem_acesso",
      `A conta de serviço não tem acesso à propriedade ${propriedade}. Dê a ela o papel "Leitor" no Google Analytics.`,
      credencial.client_email,
    );
  }
  if (!resp.ok) throw new Ga4Erro("falha", json.error?.message ?? `O Google Analytics respondeu ${resp.status}.`);
  return json;
}

const cache = new Map<string, { em: number; dados: unknown }>();
function doCache<T>(chave: string, ttl: number): T | null {
  const c = cache.get(chave);
  return c && Date.now() - c.em < ttl ? (c.dados as T) : null;
}

/** Idade do painel em cache, em ms (para o "Atualizar agora" não martelar a API). */
export function idadeDoCache(dias: number): number | null {
  const c = cache.get(`painel-${dias}`);
  return c ? Date.now() - c.em : null;
}

const desc = (m: string) => [{ metric: { metricName: m }, desc: true }];
const totaisVazios = (): Totais => ({ visitantes: 0, visitas: 0, paginas: 0, tempoMedioSeg: 0 });
const eventosVazios = (): Eventos => ({ formularios: 0, cliquesWhatsapp: 0 });

/** Tudo que a tela mostra para os últimos `dias` (hoje incluído), comparado com os `dias` anteriores. */
export async function painelDoSite(dias: number, forcar = false): Promise<PainelDoSite> {
  const chave = `painel-${dias}`;
  if (!forcar) {
    const c = doCache<PainelDoSite>(chave, TTL_PAINEL_MS);
    if (c) return c;
  }
  const atual = { startDate: `${dias - 1}daysAgo`, endDate: "today", name: "atual" };
  const anterior = { startDate: `${2 * dias - 1}daysAgo`, endDate: `${dias}daysAgo`, name: "anterior" };

  const lote1 = await api<{ reports?: RelatorioBruto[] }>("batchRunReports", {
    requests: [
      {
        dateRanges: [atual, anterior],
        metrics: [{ name: "totalUsers" }, { name: "sessions" }, { name: "screenPageViews" }, { name: "averageSessionDuration" }],
      },
      {
        dateRanges: [atual, anterior],
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }],
        dimensionFilter: { filter: { fieldName: "eventName", inListFilter: { values: ["generate_lead", "whatsapp_click"] } } },
      },
      {
        dateRanges: [atual, anterior],
        dimensions: [{ name: "date" }],
        metrics: [{ name: "sessions" }, { name: "totalUsers" }],
        limit: 500,
      },
      {
        dateRanges: [atual],
        dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }],
        metrics: [{ name: "sessions" }],
        orderBys: desc("sessions"),
        limit: 60,
      },
      {
        dateRanges: [atual],
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: desc("screenPageViews"),
        limit: 80,
      },
    ],
  });
  const lote2 = await api<{ reports?: RelatorioBruto[] }>("batchRunReports", {
    requests: [
      { dateRanges: [atual], dimensions: [{ name: "city" }], metrics: [{ name: "totalUsers" }], orderBys: desc("totalUsers"), limit: 30 },
      { dateRanges: [atual], dimensions: [{ name: "deviceCategory" }], metrics: [{ name: "sessions" }], orderBys: desc("sessions") },
    ],
  });
  const [rTot, rEv, rSerie, rOrigem, rPag] = (lote1.reports ?? []).map(linhas);
  const [rCid, rAp] = (lote2.reports ?? []).map(linhas);

  const periodo = (l: Linha) => (l.dateRange === "anterior" ? "anterior" : "atual");

  const totais = { atual: totaisVazios(), anterior: totaisVazios() };
  for (const l of rTot ?? []) {
    totais[periodo(l)] = {
      visitantes: Number(l.totalUsers),
      visitas: Number(l.sessions),
      paginas: Number(l.screenPageViews),
      tempoMedioSeg: Math.round(Number(l.averageSessionDuration)),
    };
  }
  const eventos = { atual: eventosVazios(), anterior: eventosVazios() };
  for (const l of rEv ?? []) {
    const e = eventos[periodo(l)];
    if (l.eventName === "generate_lead") e.formularios = Number(l.eventCount);
    if (l.eventName === "whatsapp_click") e.cliquesWhatsapp = Number(l.eventCount);
  }

  const porDia = new Map<string, { visitas: number; visitantes: number }>();
  const porDiaAnterior = new Map<string, number>();
  for (const l of rSerie ?? []) {
    if (periodo(l) === "anterior") porDiaAnterior.set(String(l.date), Number(l.sessions));
    else porDia.set(String(l.date), { visitas: Number(l.sessions), visitantes: Number(l.totalUsers) });
  }
  const hoje = hojeNoFuso(FUSO_DO_SITE);
  const serie = montarSerie(hoje, dias, porDia, porDiaAnterior);

  const dados: PainelDoSite = {
    dias,
    inicio: somaDias(hoje, -(dias - 1)),
    fim: hoje,
    totais,
    eventos,
    serie,
    origens: agrupar(
      (rOrigem ?? []).map((l) => [nomeDaOrigem(String(l.sessionSource), String(l.sessionMedium)), Number(l.sessions)] as const),
      7,
      "Outras origens",
    ),
    paginas: agrupar(
      (rPag ?? []).map((l) => {
        const c = caminhoLimpo(String(l.pagePath));
        return [nomeDaPagina(c, String(l.pageTitle)), Number(l.screenPageViews)] as const;
      }),
      8,
      "Outras páginas",
    ),
    cidades: agrupar((rCid ?? []).map((l) => [nomeDaCidade(String(l.city)), Number(l.totalUsers)] as const), 6, "Outras cidades"),
    aparelhos: agrupar((rAp ?? []).map((l) => [nomeDoAparelho(String(l.deviceCategory)), Number(l.sessions)] as const), 4, "Outros"),
    comparavel: periodoAnteriorComparavel(serie),
    atualizadoEm: new Date().toISOString(),
  };
  cache.set(chave, { em: Date.now(), dados });
  return dados;
}

/** Pessoas no site agora (últimos 30 min). Nunca derruba a tela: falhou, devolve null. */
export async function pessoasNoSiteAgora(): Promise<number | null> {
  const c = doCache<number>("agora", TTL_AGORA_MS);
  if (c !== null) return c;
  try {
    const j = await api<{ rows?: Array<{ metricValues?: Array<{ value?: string }> }> }>("runRealtimeReport", {
      metrics: [{ name: "activeUsers" }],
    });
    const n = Number(j.rows?.[0]?.metricValues?.[0]?.value ?? 0);
    cache.set("agora", { em: Date.now(), dados: n });
    return n;
  } catch {
    return null;
  }
}
