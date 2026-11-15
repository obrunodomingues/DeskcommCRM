/**
 * FORK CONVERZON — a tela "Projetos": a execução de cada serviço vendido.
 *
 * Junta o que o CRM antigo da agência tinha em duas telas (projetos e
 * tarefas): cada projeto é um serviço para um cliente, anda por FASES e tem um
 * CHECKLIST por fase, com prazo por item, notas e histórico.
 *
 * Aqui ficam os modelos de cada tipo de serviço e as contas puras da tela (sem
 * banco e sem relógio lido por dentro), para o teste prendê-las. As tabelas
 * estão em converzon/sql/0002_converzon_projetos.sql.
 */

export const TIPOS_DE_PROJETO = ["site", "estrutura", "trafego", "ia", "sistema", "outro"] as const;
export type TipoDeProjeto = (typeof TIPOS_DE_PROJETO)[number];

export const SITUACOES_DE_PROJETO = [
  "andamento",
  "esperando_cliente",
  "pausado",
  "concluido",
  "cancelado",
] as const;
export type SituacaoDoProjeto = (typeof SITUACOES_DE_PROJETO)[number];

export interface FaseDoModelo {
  nome: string;
  /** O checklist com que a fase nasce. Cada projeto edita o seu. */
  itens: string[];
}

export interface ModeloDeProjeto {
  rotulo: string;
  fases: FaseDoModelo[];
}

const BRIEFING_DE_SITE: FaseDoModelo = {
  nome: "Briefing",
  itens: [
    "Enviar o link do briefing",
    "Receber o briefing respondido",
    "Receber logo, fotos e textos",
    "Definir o domínio",
  ],
};
const DESIGN: FaseDoModelo = {
  nome: "Design",
  itens: ["Montar o layout da página inicial", "Enviar a prévia ao cliente", "Design aprovado pelo cliente"],
};
const DESENVOLVIMENTO_DE_SITE: FaseDoModelo = {
  nome: "Desenvolvimento",
  itens: [
    "Programar as páginas",
    "Ajustar para celular",
    "Formulário e botões de WhatsApp",
    "Títulos e descrições para o Google",
    "Instalar o Google Analytics",
  ],
};
const REVISAO_DO_CLIENTE: FaseDoModelo = {
  nome: "Revisão do cliente",
  itens: ["Enviar o link de revisão", "Aplicar os ajustes pedidos", "Aprovação final do cliente"],
};
const PUBLICACAO: FaseDoModelo = {
  nome: "Publicação",
  itens: [
    "Apontar o domínio",
    "Certificado de segurança (SSL)",
    "Publicar o site",
    "Testar formulário e WhatsApp no ar",
  ],
};
const ENTREGUE: FaseDoModelo = {
  nome: "Entregue",
  itens: ["Enviar os acessos ao cliente", "Pedir um depoimento"],
};

export const MODELOS_DE_PROJETO: Record<TipoDeProjeto, ModeloDeProjeto> = {
  site: {
    rotulo: "Site",
    fases: [BRIEFING_DE_SITE, DESIGN, DESENVOLVIMENTO_DE_SITE, REVISAO_DO_CLIENTE, PUBLICACAO, ENTREGUE],
  },
  estrutura: {
    rotulo: "Estrutura completa",
    fases: [
      BRIEFING_DE_SITE,
      DESIGN,
      DESENVOLVIMENTO_DE_SITE,
      REVISAO_DO_CLIENTE,
      PUBLICACAO,
      {
        nome: "Google",
        itens: [
          "Cadastrar o site no Google Search Console",
          "Enviar o sitemap",
          "Criar ou otimizar o Google Meu Negócio",
          "Pedir a verificação do perfil",
        ],
      },
      {
        nome: "CRM",
        itens: [
          "Contratar o servidor no nome do cliente",
          "Instalar o CRM",
          "Conectar o WhatsApp",
          "Configurar o funil e o agente",
          "Treinar o cliente",
        ],
      },
      {
        nome: "Google Ads",
        itens: [
          "Criar a conta de anúncios",
          "Configurar as conversões",
          "Pesquisar palavras-chave e região",
          "Criar a campanha institucional",
          "Ativar a campanha",
        ],
      },
      ENTREGUE,
    ],
  },
  trafego: {
    rotulo: "Tráfego pago",
    fases: [
      {
        nome: "Briefing",
        itens: ["Receber acesso às contas de anúncio", "Definir público e região", "Definir a verba mensal"],
      },
      {
        nome: "Configuração das contas",
        itens: ["Pixel e tags de conversão", "Conectar WhatsApp e formulários"],
      },
      {
        nome: "Criação das campanhas",
        itens: ["Criativos", "Textos dos anúncios", "Montar as campanhas"],
      },
      { nome: "Ativo", itens: ["Ativar as campanhas", "Acompanhar as primeiras 72 horas"] },
      { nome: "Relatório", itens: ["Relatório do mês", "Reunião de resultados"] },
    ],
  },
  ia: {
    rotulo: "Agente de IA",
    fases: [
      {
        nome: "Briefing",
        itens: ["Mapear as perguntas mais comuns", "Definir o que o agente vai fazer"],
      },
      { nome: "Desenho do fluxo", itens: ["Escrever as instruções", "Montar a base de conhecimento"] },
      {
        nome: "Desenvolvimento",
        itens: ["Configurar o agente", "Conectar o WhatsApp", "Integrações"],
      },
      { nome: "Testes", itens: ["Testar conversas", "Ajustes com o cliente"] },
      { nome: "Entrega", itens: ["Publicar o agente", "Treinar o cliente"] },
    ],
  },
  sistema: {
    rotulo: "Sistema sob medida",
    fases: [
      { nome: "Briefing", itens: ["Levantar o processo atual", "Definir as funcionalidades"] },
      { nome: "Protótipo", itens: ["Desenhar as telas principais", "Protótipo aprovado pelo cliente"] },
      { nome: "Desenvolvimento", itens: [] },
      { nome: "Testes", itens: ["Testes com o cliente", "Correções"] },
      { nome: "Entrega", itens: ["Publicar", "Treinar o cliente", "Enviar os acessos"] },
    ],
  },
  outro: {
    rotulo: "Outro",
    fases: [
      { nome: "Planejamento", itens: [] },
      { nome: "Execução", itens: [] },
      { nome: "Entrega", itens: [] },
    ],
  },
};

export function ehTipoDeProjeto(v: unknown): v is TipoDeProjeto {
  return typeof v === "string" && (TIPOS_DE_PROJETO as readonly string[]).includes(v);
}

export function ehSituacaoDoProjeto(v: unknown): v is SituacaoDoProjeto {
  return typeof v === "string" && (SITUACOES_DE_PROJETO as readonly string[]).includes(v);
}

/** Os nomes das fases, na ordem: a FOTO que o projeto guarda ao nascer. */
export function fasesDoModelo(tipo: TipoDeProjeto): string[] {
  return MODELOS_DE_PROJETO[tipo].fases.map((f) => f.nome);
}

/** O checklist com que o projeto nasce, já com fase e posição. */
export function itensIniciais(tipo: TipoDeProjeto): { fase: number; titulo: string; posicao: number }[] {
  return MODELOS_DE_PROJETO[tipo].fases.flatMap((f, fase) =>
    f.itens.map((titulo, i) => ({ fase, titulo, posicao: (i + 1) * 1000 })),
  );
}

// ── O que a API devolve ────────────────────────────────────────────────────

export interface ProjetoNaLista {
  id: string;
  nome: string;
  tipo: TipoDeProjeto;
  situacao: SituacaoDoProjeto;
  fases: string[];
  fase_atual: number;
  fase_desde: string;
  valor_centavos: number | null;
  prazo: string | null;
  concluido_em: string | null;
  contato: { id: string; nome: string } | null;
  itens_total: number;
  itens_feitos: number;
  itens_atrasados: number;
  /** O prazo mais próximo entre os itens ainda abertos. */
  proximo_prazo: string | null;
}

export interface ItemDoProjeto {
  id: string;
  fase: number;
  titulo: string;
  feito: boolean;
  feito_em: string | null;
  prazo: string | null;
  posicao: number;
}

export interface EventoDoProjeto {
  id: string;
  tipo: string;
  texto: string;
  created_at: string;
}

export interface ProjetoCompleto extends Omit<ProjetoNaLista, "itens_total" | "itens_feitos" | "itens_atrasados" | "proximo_prazo"> {
  notas: string | null;
  itens: ItemDoProjeto[];
  eventos: EventoDoProjeto[];
}

// ── Contas da tela ─────────────────────────────────────────────────────────

const DIA_MS = 24 * 60 * 60 * 1000;

/** Dias inteiros desde que o projeto entrou na fase atual. */
export function diasNaFase(faseDesde: string, agora: number): number {
  const t = Date.parse(faseDesde);
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((agora - t) / DIA_MS));
}

/** A partir de quantos dias na mesma fase o projeto conta como parado. */
export const DIAS_PARA_PARADO = 7;

/** Soma `dias` a uma data AAAA-MM-DD, sem fuso (é data de calendário). */
export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split("-").map(Number);
  const t = Date.UTC(a!, (m ?? 1) - 1, d ?? 1) + dias * DIA_MS;
  return new Date(t).toISOString().slice(0, 10);
}

export type EstadoDoPrazo = "atrasado" | "esta_semana" | "em_dia";

/** `hoje` em AAAA-MM-DD no fuso de quem usa: prazo é data, não instante. */
export function estadoDoPrazo(prazo: string | null, hoje: string): EstadoDoPrazo | null {
  if (!prazo) return null;
  if (prazo < hoje) return "atrasado";
  if (prazo <= somarDias(hoje, 7)) return "esta_semana";
  return "em_dia";
}

/** Projeto que ainda está no jogo: conta para os números da semana. */
export function emAberto(p: Pick<ProjetoNaLista, "situacao">): boolean {
  return p.situacao === "andamento" || p.situacao === "esperando_cliente";
}

export interface ResumoDaSemana {
  atrasados: number;
  vencendo: number;
  parados: number;
  esperandoCliente: number;
}

/**
 * Os quatro números do topo da tela. Um projeto conta como atrasado se o
 * PRÓPRIO prazo venceu ou se tem item vencido; vencendo, se o prazo (dele ou do
 * próximo item) cai nos próximos 7 dias. Parado: em andamento e há
 * DIAS_PARA_PARADO dias ou mais na mesma fase.
 */
export function resumoDaSemana(projetos: ProjetoNaLista[], hoje: string, agora: number): ResumoDaSemana {
  const abertos = projetos.filter(emAberto);
  let atrasados = 0;
  let vencendo = 0;
  for (const p of abertos) {
    const proprio = estadoDoPrazo(p.prazo, hoje);
    const doItem = estadoDoPrazo(p.proximo_prazo, hoje);
    if (proprio === "atrasado" || p.itens_atrasados > 0) atrasados++;
    else if (proprio === "esta_semana" || doItem === "esta_semana") vencendo++;
  }
  return {
    atrasados,
    vencendo,
    parados: abertos.filter((p) => p.situacao === "andamento" && diasNaFase(p.fase_desde, agora) >= DIAS_PARA_PARADO)
      .length,
    esperandoCliente: abertos.filter((p) => p.situacao === "esperando_cliente").length,
  };
}

/** Percentual do checklist feito, inteiro de 0 a 100. Sem itens = 0. */
export function percentualFeito(feitos: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((Math.min(feitos, total) / total) * 100);
}

/** As colunas do quadro, na ordem. Cancelado não tem coluna: sai de vista. */
export const COLUNAS_DO_QUADRO: readonly SituacaoDoProjeto[] = [
  "andamento",
  "esperando_cliente",
  "pausado",
  "concluido",
];

/** Concluídos só aparecem no quadro por este tempo depois de concluídos. */
export const DIAS_DE_CONCLUIDO_NO_QUADRO = 30;

export function mostrarNoQuadro(p: Pick<ProjetoNaLista, "situacao" | "concluido_em">, agora: number): boolean {
  if (p.situacao === "cancelado") return false;
  if (p.situacao !== "concluido") return true;
  if (!p.concluido_em) return true;
  return agora - Date.parse(p.concluido_em) <= DIAS_DE_CONCLUIDO_NO_QUADRO * DIA_MS;
}

/** "R$ 1.500,00" a partir de centavos; nulo vira null para a tela esconder. */
export function valorEmReais(centavos: number | null, idioma = "pt-BR"): string | null {
  if (centavos === null || centavos === undefined) return null;
  return new Intl.NumberFormat(idioma, { style: "currency", currency: "BRL" }).format(centavos / 100);
}

/** "1.500" ou "1500,50" digitado na tela vira centavos. Vazio = null; lixo = NaN. */
export function centavosDoTexto(texto: string): number | null {
  const limpo = texto.trim().replace(/[R$\s]/g, "");
  if (limpo === "") return null;
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo.replace(/\.(?=\d{3}(\D|$))/g, "");
  const n = Number(normalizado);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : Number.NaN;
}
