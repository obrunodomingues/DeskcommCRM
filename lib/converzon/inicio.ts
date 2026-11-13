/**
 * Fork Converzon — a tela "Início": o resumo do dia numa tela só.
 *
 * Aqui ficam os TIPOS do que a rota `/api/v1/converzon/inicio` devolve e as
 * contas puras (sem banco, sem relógio lido por dentro), para o teste prendê-las.
 * Cada número que falhar na leitura volta `null` e o cartão mostra "—": uma
 * consulta com problema não derruba a tela inteira.
 */

/** O que `comando_da_conversa` diz sobre quem está com a conversa agora. */
export type ComandoDaConversa = "automatico" | "aguardando" | "humano" | "encerrada" | string;

export interface MensagemNova {
  conversaId: string;
  nome: string;
  previa: string | null;
  recebidaEm: string;
  comando: ComandoDaConversa | null;
}

export interface ProximaConsulta {
  id: string;
  inicio: string;
  nome: string;
  tipo: string | null;
  teleconsulta: boolean;
}

export interface EtapaDoFunil {
  nome: string;
  abertos: number;
}

export interface ResumoDoInicio {
  mensagens: {
    semResposta: number | null;
    /** Quando chegou a mais antiga ainda sem resposta. */
    maisAntiga: string | null;
    lista: MensagemNova[];
  };
  pacientes: { novos7Dias: number | null; doFormulario7Dias: number | null };
  consultas: {
    proximos7Dias: number | null;
    lista: ProximaConsulta[];
    /** O próximo horário que o site e a IA oferecem a um paciente novo. */
    proximaVaga: string | null;
    vagas30Dias: number | null;
  };
  funil: { nome: string | null; abertos: number | null; etapas: EtapaDoFunil[] };
  /** `null` para quem não é gerente (os números do site são da empresa toda). */
  site: { visitas7Dias: number | null; serie: number[] } | null;
}

const DIA_MS = 24 * 60 * 60 * 1000;

/** "Bom dia" até 11h59, "Boa tarde" até 17h59, "Boa noite" no resto. */
export function saudacao(hora: number): "Bom dia" | "Boa tarde" | "Boa noite" {
  if (hora >= 5 && hora < 12) return "Bom dia";
  if (hora >= 12 && hora < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Como chamar a pessoa na saudação: o título e o primeiro nome. "Dr. João
 * Silva" vira "Dr. João"; "Ana Paula Souza" vira "Ana". Sem nome, vazio.
 */
export function nomeDaSaudacao(nomeCompleto: string | null | undefined): string {
  const partes = (nomeCompleto ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  const primeira = partes[0] ?? "";
  const titulo = /^(dr|dra|prof|profa)\.?$/i.test(primeira);
  return titulo && partes[1] ? `${primeira} ${partes[1]}` : primeira;
}

/** O nome que aparece para um contato, na mesma ordem de preferência do WhatsApp. */
export function nomeDoContato(
  c: { display_name?: string | null; name?: string | null; address_book_name?: string | null; phone_number?: string | null } | null | undefined,
): string {
  return (
    c?.display_name?.trim() ||
    c?.name?.trim() ||
    c?.address_book_name?.trim() ||
    c?.phone_number?.trim() ||
    "Contato"
  );
}

/** Duas letras para o avatar: as iniciais do primeiro e do último nome. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter((p) => /\p{L}/u.test(p));
  if (partes.length === 0) return "?";
  const a = partes[0]?.[0] ?? "";
  const b = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
  return (a + b).toUpperCase();
}

/**
 * Quanto tempo faz, curto: "agora", "há 5 min", "há 2 h", "há 3 dias". `agora`
 * entra por parâmetro — relógio lido aqui dentro não se testa. `t` traduz o
 * MOLDE (chave literal do dicionário) e o número entra depois, no `{n}`.
 */
export function haQuantoTempo(iso: string, agora: number, t: (texto: string) => string = (s) => s): string {
  const ms = Math.max(0, agora - new Date(iso).getTime());
  const min = Math.floor(ms / 60_000);
  if (min < 1) return t("agora");
  if (min < 60) return t("há {n} min").replace("{n}", String(min));
  const h = Math.floor(min / 60);
  if (h < 24) return t("há {n} h").replace("{n}", String(h));
  const d = Math.floor(ms / DIA_MS);
  return d === 1 ? t("há 1 dia") : t("há {n} dias").replace("{n}", String(d));
}

/**
 * Leads em aberto por etapa, na ordem das etapas. Etapa de ganho e de perda não
 * entra: o resumo mostra quem ainda está no caminho.
 */
export function contarPorEtapa(
  etapas: { id: string; name: string; is_won?: boolean | null; is_lost?: boolean | null }[],
  leads: { stage_id: string | null }[],
): EtapaDoFunil[] {
  const porEtapa = new Map<string, number>();
  for (const l of leads) if (l.stage_id) porEtapa.set(l.stage_id, (porEtapa.get(l.stage_id) ?? 0) + 1);
  return etapas
    .filter((e) => !e.is_won && !e.is_lost)
    .map((e) => ({ nome: e.name, abertos: porEtapa.get(e.id) ?? 0 }));
}

/** O funil do resumo: o padrão da organização; sem padrão, o primeiro por posição. */
export function escolherFunil<T extends { is_default?: boolean | null; position?: number | null }>(funis: T[]): T | null {
  if (funis.length === 0) return null;
  return funis.find((f) => f.is_default) ?? [...funis].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))[0] ?? null;
}

/** A barra de cada etapa, em % da maior — a maior ocupa a largura toda. */
export function larguraDaBarra(valor: number, maior: number): number {
  if (maior <= 0 || valor <= 0) return 0;
  return Math.max(4, Math.round((valor / maior) * 100));
}

/** O caminho SVG da linha de tendência (viewBox 0 0 200 40), com 3px de respiro. */
export function caminhoDaTendencia(valores: number[]): string {
  if (valores.length < 2) return "";
  const max = Math.max(...valores);
  const min = Math.min(...valores);
  const faixa = max - min || 1;
  return valores
    .map((v, i) => {
      const x = (i / (valores.length - 1)) * 200;
      const y = 37 - ((v - min) / faixa) * 34;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
