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
 * Consequência aceita (decisão do cliente, 10/11/2026): arrastar para reordenar
 * DENTRO da mesma coluna deixa de valer — o board ignora esse arrasto.
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
