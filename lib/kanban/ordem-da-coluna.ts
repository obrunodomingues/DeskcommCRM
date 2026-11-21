/**
 * Fork Converzon — A ORDEM DOS CARDS NA COLUNA DO FUNIL.
 *
 * No upstream a coluna sai por `position_in_stage` (ordem manual, de arrastar),
 * e o card novo nasce com MAX + 1000 — vai para o FIM. Pior: o lead que nasce de
 * conversa pelo banco pega o default (1000), e vários empatam na mesma posição,
 * então a ordem entre eles nem é estável. O consultório quer o contrário: o mais
 * recente no topo, sempre.
 *
 * "Recente" é a chegada NAQUELA coluna: `stage_changed_at`, carimbada por trigger
 * a cada troca de etapa (migration 0071) e na criação. Na coluna Novo é a data em
 * que o lead entrou; nas outras, quando o card foi movido para lá. Sem a coluna
 * (linha antiga), vale `created_at`. Empate desempata pelo `id`, para a ordem não
 * pular entre duas leituras.
 *
 * Decisão revista em 19/11/2026: só a PRIMEIRA coluna (Novo) sai por chegada.
 * Nas outras o consultório arruma os cards à mão (ex.: "Avaliação agendada" na
 * ordem das consultas), então elas voltam à ordem manual do upstream
 * (`ordenarPorPosicao`), e o arrasto dentro delas volta a valer.
 */
export interface LinhaComChegada {
  id: string;
  stage_changed_at?: string | null;
  created_at?: string | null;
}

export function chegadaNaColuna(lead: LinhaComChegada): string {
  return lead.stage_changed_at ?? lead.created_at ?? "";
}

/** Mais recente primeiro. Não altera a lista recebida. */
export function ordenarPorChegada<T extends LinhaComChegada>(leads: readonly T[]): T[] {
  return [...leads].sort((a, b) => {
    const porData = chegadaNaColuna(b).localeCompare(chegadaNaColuna(a));
    return porData !== 0 ? porData : b.id.localeCompare(a.id);
  });
}

/**
 * Ordem MANUAL, a do upstream: `position_in_stage` crescente, que é o que o
 * arrasto grava. Empate desempata pelo `id`, para a ordem não pular entre duas
 * leituras. Não altera a lista recebida.
 */
export function ordenarPorPosicao<T extends LinhaComChegada & { position_in_stage: number }>(
  leads: readonly T[],
): T[] {
  return [...leads].sort(
    (a, b) => Number(a.position_in_stage) - Number(b.position_in_stage) || a.id.localeCompare(b.id),
  );
}
