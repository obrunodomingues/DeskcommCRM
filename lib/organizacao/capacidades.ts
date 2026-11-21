/**
 * AS CAPACIDADES DA ORGANIZAÇÃO — o que ESTA empresa ligou para si.
 *
 * Irmã de `lib/instalacao/modulos.ts`, em outro nível: módulo opcional é
 * decisão da INSTALAÇÃO (o dono do servidor); capacidade é decisão da
 * ORGANIZAÇÃO (o administrador da empresa). A doutrina de extensões diz a
 * mesma coisa: "a instância decide o pacote; a organização decide o uso".
 *
 * Só o booleano `true` liga. Ausente, malformado, string ou erro de banco =
 * desligado: falha fechada, como `modulosLigados()`. Nunca lança — roda no
 * layout de `/app` e no turno do agente, e um throw ali derruba a tela ou o
 * atendimento.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { modulosLigados, type ModuloOpcional } from "@/lib/instalacao/modulos";
import { logger } from "@/lib/logger";

export const CAPACIDADES_DA_ORGANIZACAO = ["propostas"] as const;
type CapacidadeDoCatalogo = (typeof CAPACIDADES_DA_ORGANIZACAO)[number];

/**
 * Fork Converzon: `converzon_agencia` não é decisão da empresa nem módulo da
 * instalação. É o RAMO da instalação (`CONVERZON_PERFIL=agencia`), que o layout
 * de `/app` acrescenta às capacidades ligadas para o menu mostrar as telas de
 * agência (Projetos). Fica FORA de `CAPACIDADES_DA_ORGANIZACAO` de propósito:
 * aquela lista é o catálogo de recursos opcionais que a empresa liga e desliga.
 * `converzon_consultorio` é o ramo oposto (sem `CONVERZON_PERFIL`): enxuga o
 * cabeçalho da conversa para quem atende sozinho.
 * `converzon_atende_sozinho` leva SÓ esse cabeçalho enxuto a uma agência em que
 * uma pessoa atende tudo (`CONVERZON_ATENDE_SOZINHO=1`), sem o menu e o
 * vocabulário do consultório.
 */
export type CapacidadeDoFork = "converzon_agencia" | "converzon_consultorio" | "converzon_atende_sozinho";
export type CapacidadeDaOrganizacao = CapacidadeDoCatalogo | CapacidadeDoFork;

/**
 * O módulo da INSTALAÇÃO que cada capacidade exige (doc 79). A empresa liga a
 * dela; com o módulo desligado no servidor, a chave da empresa não liga nada —
 * e é aqui, e não em cada consumidor, que as duas se somam: tela, menu, rota,
 * ferramenta do agente e cron leem a mesma resposta.
 */
const MODULO_DA_CAPACIDADE: Record<CapacidadeDoCatalogo, ModuloOpcional> = {
  propostas: "propostas",
};

function objeto(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/**
 * `organizations.settings` + os módulos ligados na instalação → as
 * capacidades ligadas. Pura; nunca lança.
 */
export function capacidadesLigadas(
  settings: unknown,
  modulos: readonly ModuloOpcional[],
): CapacidadeDaOrganizacao[] {
  const propostas = objeto(objeto(settings)?.proposals);
  const daEmpresa: CapacidadeDoCatalogo[] = propostas?.enabled === true ? ["propostas"] : [];
  return daEmpresa.filter((c) => modulos.includes(MODULO_DA_CAPACIDADE[c]));
}

/** Lê a linha da organização. Nunca lança: erro = nenhuma capacidade. */
export async function capacidadesDaOrganizacao(
  db: SupabaseClient,
  organizationId: string,
): Promise<CapacidadeDaOrganizacao[]> {
  try {
    const [{ data, error }, modulos] = await Promise.all([
      db.from("organizations").select("settings").eq("id", organizationId).maybeSingle(),
      modulosLigados(db),
    ]);
    if (error) {
      logger.warn("capacidades da organização: leitura recusada — tratando todas como desligadas", {
        organization_id: organizationId,
        detalhe: (error as { message?: string }).message,
      });
      return [];
    }
    return capacidadesLigadas((data as { settings?: unknown } | null)?.settings, modulos);
  } catch (erro) {
    logger.warn("capacidades da organização: leitura falhou — tratando todas como desligadas", {
      organization_id: organizationId,
      detalhe: erro instanceof Error ? erro.message : String(erro),
    });
    return [];
  }
}
