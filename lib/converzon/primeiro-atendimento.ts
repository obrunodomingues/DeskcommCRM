const CAMPOS = [
  ["ja_possui_site", "Já possui site", "Já possui site?"],
  ["segmento", "Segmento", "Segmento de atuação"],
  ["objetivo_principal", "Objetivo principal", "Objetivo principal"],
  ["quando_pretende_comecar", "Quando pretende começar", "Quando pretende começar"],
  ["investimento", "Investimento", "Nível de investimento"],
  ["instagram_ou_site", "Instagram ou site", "Instagram / Site"],
] as const;

type Chave = (typeof CAMPOS)[number][0];
type CamposDoLead = Record<string, unknown> | null | undefined;

function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.replace(/\s+/g, " ").trim() : "";
}

export function respostasDeclaradas(campos: CamposDoLead) {
  return CAMPOS.flatMap(([key, antiga, label]) => {
    const value = texto(campos?.[key]) || texto(campos?.[antiga]);
    return value ? [{ key, label, value }] : [];
  });
}

function paraBusca(valor: string): string {
  return valor.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function encaixar(valor: string): string {
  const comLimite = valor.slice(0, 250).trim().replace(/[.,;!?]+$/, "");
  return comLimite && !/^\p{Lu}\p{Lu}/u.test(comLimite)
    ? comLimite.charAt(0).toLocaleLowerCase("pt-BR") + comLimite.slice(1)
    : comLimite;
}

const EXEMPLOS = [
  { nicho: /imove|corret|imobili/, link: "https://ronaldocarvalhocorretordeimoveis.com/" },
  { nicho: /arquitet|interior/, link: "https://ht-arquitetura.com/" },
  { nicho: /advog|advoc|jurid/, link: "https://marquesadvocacia.adv.br/" },
  { nicho: /saude|clinic|medic|estetic/, link: "https://drleonardogomes.com/" },
  { nicho: /educa|curso|escola/, link: "https://educsaudelumen.com.br/" },
  { nicho: /solar|energia/, link: "https://solartp.com.br/" },
  { nicho: /entrega|frete|logistic/, link: "https://www.sosentregasrapidas.com.br/" },
  { nicho: /tecnolog|software|informatica/, link: "https://nextcoreti.com.br/" },
  { nicho: /turism|pousad|hotel/, link: "https://trindade.pousadafilhosdaterra.com.br/" },
] as const;

export function linksDoPortfolio(segmento: string): string[] {
  const buscavel = paraBusca(segmento);
  const afins = EXEMPLOS.filter(({ nicho }) => nicho.test(buscavel)).map(({ link }) => link);
  const variados = [EXEMPLOS[1].link, EXEMPLOS[5].link, EXEMPLOS[2].link, EXEMPLOS[3].link];
  return [...new Set([...afins, ...variados])].slice(0, 3);
}

function parteDoSite(valor: string): string {
  const resposta = paraBusca(valor);
  if (resposta === "nao" || resposta.includes("nao tenho")) return "não tem site";
  if (resposta.includes("perdi")) return "perdeu o acesso ao site que tinha";
  if (resposta === "sim" || resposta.includes("tenho") || resposta.includes("evoluir")) {
    return "já tem site";
  }
  return "";
}

function saudacao(agora: Date): string {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hourCycle: "h23",
    }).format(agora),
  );
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

export function montarPrimeiroAtendimento(
  nome: string | null | undefined,
  campos: CamposDoLead,
  agora: Date,
): [string, string, string] {
  const respostas = new Map<Chave, string>(
    respostasDeclaradas(campos).map(({ key, value }) => [key, value]),
  );
  const primeiro = texto(nome).split(" ", 1)[0] ?? "";
  const nomeReal = /^\p{L}{2,}[\p{L}\p{M}'-]*$/u.test(primeiro) ? primeiro : "";
  const segmento = encaixar(respostas.get("segmento") ?? "");
  const objetivo = encaixar(respostas.get("objetivo_principal") ?? "");
  const possuiSite = parteDoSite(respostas.get("ja_possui_site") ?? "");
  const partes = [
    segmento &&
      (/^(arquiteta|arquiteto|corretora de im[oó]veis|corretor de im[oó]veis)$/iu.test(segmento)
        ? "é " + segmento
        : "trabalha com " + segmento),
    possuiSite,
    objetivo && "tem como foco " + objetivo,
  ].filter(Boolean);
  const resumo = new Intl.ListFormat("pt-BR", { type: "conjunction" }).format(partes);
  const cadastro = resumo
    ? "Recebi seu cadastro: " + resumo + "."
    : respostas.size
      ? "Recebi seu cadastro."
      : "Recebi sua mensagem.";
  const abertura = saudacao(agora) + (nomeReal ? ", " + nomeReal + "!" : "!");
  return [
    abertura + " Aqui é o Bruno da Converzon, prazer!\n" + cadastro,
    "Aqui fazemos sites 100% personalizados desde 2021, em código próprio, sem templates ou plugins. Carregam em segundos! E site rápido converte mais e agrada o Google.\nDá uma olhada nesses:\n" +
      linksDoPortfolio(segmento).join("\n"),
    "Posso te ajudar com a Máquina de Vendas (site, CRM e agente de IA), desenvolver só o site ou cuidar do tráfego pago e da criação de conteúdo.\nPelo que você me contou, a Máquina de Vendas pode fazer sentido. Posso te apresentar e mostrar o CRM por dentro?",
  ];
}
