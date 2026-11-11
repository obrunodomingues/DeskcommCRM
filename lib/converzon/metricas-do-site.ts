/**
 * FORK CONVERZON — MÉTRICAS DO SITE: as regras puras (sem rede, sem banco).
 *
 * Transformam o que o Google Analytics 4 devolve no que a tela mostra: nome
 * legível da origem, da página e da cidade, o agrupamento "top N + Outras" e a
 * série por dia com o período anterior alinhado dia a dia. Quem fala com o
 * Google é `lib/converzon/ga4.ts`.
 *
 * Nada aqui é específico de um site: o nome da página sai do TÍTULO dela (sem o
 * sufixo "| Nome do site"), não de uma lista de caminhos escrita no código.
 */

export interface ItemDaLista {
  nome: string;
  valor: number;
}

export interface Totais {
  visitantes: number;
  visitas: number;
  paginas: number;
  /** Duração média da visita, em segundos. */
  tempoMedioSeg: number;
}

export interface Eventos {
  /** `generate_lead`: formulários enviados. */
  formularios: number;
  /** `whatsapp_click`: cliques no botão de WhatsApp. */
  cliquesWhatsapp: number;
}

export interface PontoDaSerie {
  /** AAAA-MM-DD, no fuso do site. */
  data: string;
  visitas: number;
  visitantes: number;
  /** Visitas no dia correspondente do período anterior (mesma posição). */
  visitasAnterior: number;
}

export interface PainelDoSite {
  dias: number;
  inicio: string;
  fim: string;
  totais: { atual: Totais; anterior: Totais };
  eventos: { atual: Eventos; anterior: Eventos };
  serie: PontoDaSerie[];
  origens: ItemDaLista[];
  paginas: ItemDaLista[];
  cidades: ItemDaLista[];
  aparelhos: ItemDaLista[];
  /**
   * O período anterior serve de régua? Só quando teve visita na maior parte dos
   * dias: com a medição recém-instalada, "+11.000%" seria verdade inútil.
   */
  comparavel: boolean;
  atualizadoEm: string;
}

/** A régua de `comparavel`: visita em pelo menos 80% dos dias do período anterior. */
export function periodoAnteriorComparavel(serie: ReadonlyArray<{ visitasAnterior: number }>): boolean {
  if (serie.length === 0) return false;
  const comVisita = serie.filter((p) => p.visitasAnterior > 0).length;
  return comVisita >= Math.ceil(serie.length * 0.8);
}

/** Os períodos que a tela oferece. Outro valor vira o padrão. */
export const PERIODOS = [7, 28, 90] as const;
export type Periodo = (typeof PERIODOS)[number];
export function periodoValido(v: unknown): Periodo {
  const n = Number(v);
  return (PERIODOS as readonly number[]).includes(n) ? (n as Periodo) : 28;
}

/** Nome legível da origem da visita. A ordem importa: gemini.google antes de google. */
export function nomeDaOrigem(fonte: string, meio: string): string {
  const f = fonte.trim().toLowerCase();
  const pago = /cpc|ppc|paid|ads?$/i.test(meio);
  if (f === "(direct)") return "Direto (digitou ou salvou o endereço)";
  // "(not set)", "(data not available)", "(other)": o GA4 não soube dizer.
  if (f === "" || /^\(.*\)$/.test(f)) return "Não identificada";
  if (f.includes("gemini")) return "Gemini";
  if (f.includes("chatgpt") || f.includes("openai")) return "ChatGPT";
  if (f.includes("perplexity")) return "Perplexity";
  if (f.includes("google")) return pago ? "Google (anúncio)" : "Google";
  // Anúncio da Meta marcado com utm_source=meta (Facebook + Instagram juntos).
  if (f === "meta" || f === "meta_ads" || f === "metaads") return pago ? "Meta (anúncio)" : "Meta";
  if (f.includes("instagram")) return pago ? "Instagram (anúncio)" : "Instagram";
  if (f.includes("facebook") || f === "fb" || f.includes("fb.com")) return pago ? "Facebook (anúncio)" : "Facebook";
  if (f.includes("whatsapp") || f === "wa.me") return "WhatsApp";
  if (f.includes("youtube")) return "YouTube";
  if (f.includes("bing")) return "Bing";
  if (f.includes("linkedin")) return "LinkedIn";
  return fonte.trim();
}

/** Caminho limpo: /pagina.html, /pagina/ e /pagina viram a mesma página. */
export function caminhoLimpo(p: string): string {
  let c = (p.split(/[?#]/)[0] ?? "").trim() || "/";
  c = c.replace(/\/index(\.html|\.php)?$/, "/").replace(/\.(html|php)$/, "");
  return c !== "/" ? c.replace(/\/+$/, "") || "/" : "/";
}

/**
 * Nome da página: o PRIMEIRO trecho do título, antes do separador que antecede o
 * nome do site ("Rinoplastia · Nome — Slogan" → "Rinoplastia"). Separador só
 * conta com espaço dos dois lados, para não partir palavra com hífen. A raiz é
 * "Início"; artigo do blog ganha o prefixo "Blog:".
 */
export function nomeDaPagina(caminho: string, titulo: string): string {
  if (caminho === "/") return "Início";
  const t = (titulo.split(/\s+[|—–·]\s+/u)[0] ?? "").trim();
  const vale = t !== "" && t !== "(not set)";
  if (caminho.startsWith("/blog/") && vale) return `Blog: ${t}`;
  return vale ? t : caminho;
}

const CIDADES: Record<string, string> = {
  "(not set)": "Não identificada",
  Brasilia: "Brasília",
  "Sao Paulo": "São Paulo",
  Goiania: "Goiânia",
  Belem: "Belém",
  Florianopolis: "Florianópolis",
  Vitoria: "Vitória",
  Cuiaba: "Cuiabá",
  Uberlandia: "Uberlândia",
  Anapolis: "Anápolis",
  Luziania: "Luziânia",
  "Aguas Claras": "Águas Claras",
  Ceilandia: "Ceilândia",
  Guara: "Guará",
  "Aguas Lindas de Goias": "Águas Lindas de Goiás",
  "Valparaiso de Goias": "Valparaíso de Goiás",
  Maceio: "Maceió",
  "Sao Luis": "São Luís",
  Macapa: "Macapá",
  Ribeirao: "Ribeirão",
};
export function nomeDaCidade(c: string): string {
  return CIDADES[c] ?? c;
}

const APARELHOS: Record<string, string> = {
  mobile: "Celular",
  desktop: "Computador",
  tablet: "Tablet",
  "smart tv": "TV",
};
export function nomeDoAparelho(a: string): string {
  return APARELHOS[a] ?? a;
}

/** Soma por nome, ordena do maior para o menor; o que passa do limite vira `outros`. */
export function agrupar(itens: ReadonlyArray<readonly [string, number]>, limite: number, outros: string): ItemDaLista[] {
  const soma = new Map<string, number>();
  for (const [nome, valor] of itens) soma.set(nome, (soma.get(nome) ?? 0) + valor);
  const ordenado = [...soma.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const topo = ordenado.slice(0, limite).map(([nome, valor]) => ({ nome, valor: Math.round(valor) }));
  const resto = ordenado.slice(limite).reduce((s, [, v]) => s + v, 0);
  return resto > 0 ? [...topo, { nome: outros, valor: Math.round(resto) }] : topo;
}

/** AAAA-MM-DD de hoje no fuso dado. */
export function hojeNoFuso(fuso: string, agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

/** Soma dias a uma data AAAA-MM-DD (aritmética de calendário, sem fuso). */
export function somaDias(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/**
 * A série por dia, com o período anterior alinhado por POSIÇÃO: o 1º dia do
 * período atual ao lado do 1º dia do anterior. `porDia` usa a chave do GA4
 * (AAAAMMDD). Dia sem linha vale zero — o GA4 omite dia sem visita.
 */
export function montarSerie(
  hoje: string,
  dias: number,
  atual: ReadonlyMap<string, { visitas: number; visitantes: number }>,
  anterior: ReadonlyMap<string, number>,
): PontoDaSerie[] {
  const serie: PontoDaSerie[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const data = somaDias(hoje, -i);
    const dataAnterior = somaDias(hoje, -i - dias);
    const chave = data.replaceAll("-", "");
    const p = atual.get(chave);
    serie.push({
      data,
      visitas: p?.visitas ?? 0,
      visitantes: p?.visitantes ?? 0,
      visitasAnterior: anterior.get(dataAnterior.replaceAll("-", "")) ?? 0,
    });
  }
  return serie;
}

/** Variação percentual entre dois números; `null` quando não há base para comparar. */
export function variacao(atual: number, anterior: number): number | null {
  if (anterior <= 0) return null;
  return ((atual - anterior) / anterior) * 100;
}
