/**
 * FORK CONVERZON — o ramo de cada instalação.
 *
 * O mesmo fork roda em instalações de ramos diferentes (um consultório e uma
 * agência). O que muda entre elas é VOCABULÁRIO de tela — "pacientes" e
 * "consultas" num, "leads" e "reuniões" no outro —, não regra. O ramo vem do
 * `.env` da VPS (`CONVERZON_PERFIL`), como as chaves do Google Analytics: é da
 * instalação, não de uma empresa, e não existe no banco do upstream.
 *
 * Vazio ou qualquer valor desconhecido = consultório, o vocabulário com que a
 * tela nasceu. Assim uma VPS que não conhece a chave continua igual, e um erro
 * de digitação não derruba o CRM (por isso `lib/env.ts` lê como texto livre).
 *
 * Arquivo puro, sem `env`: a tela do navegador também importa os tipos daqui.
 */
export type PerfilDaInstalacao = "consultorio" | "agencia";

export function lerPerfil(valor: string | null | undefined): PerfilDaInstalacao {
  return valor?.trim().toLowerCase() === "agencia" ? "agencia" : "consultorio";
}

/** Como o compromisso acontece, do jeito que a tela Início mostra. */
export type FormatoDoCompromisso = "presencial" | "video" | "ligacao";

/**
 * `calendar_event_types.location_kind` (migration 0177): `in_person`, `phone`,
 * `whatsapp`, `video_link` e `google_meet`. Ligação pelo WhatsApp conta como
 * ligação; desconhecido cai em presencial, que era o padrão da coluna.
 */
export function formatoDoCompromisso(localKind: string | null | undefined): FormatoDoCompromisso {
  if (localKind === "google_meet" || localKind === "video_link") return "video";
  if (localKind === "phone" || localKind === "whatsapp") return "ligacao";
  return "presencial";
}
