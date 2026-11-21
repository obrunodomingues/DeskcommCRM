import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Fork Converzon — "Apagar contato e conversas".
 *
 * Some com um contato indesejado (golpe, oferta comercial) de uma vez: contato,
 * conversas, mensagens, cards do funil e compromissos passados ou cancelados,
 * numa transação só (`converzon_apagar_contato_completo`, converzon/sql/0003).
 * O "Excluir contato" do produto deixa o card do funil sem dono e trava em
 * qualquer compromisso; aqui só a consulta FUTURA trava — ela é de alguém que
 * ainda vai ser atendido, e cancelar é decisão de quem atende.
 *
 * Gerente para cima: não tem volta. A função só é executável pelo service_role,
 * e o filtro de organização vem daqui (sessão), nunca do corpo.
 */
export async function POST(_req: NextRequest, ctx: Context): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("manager", { requestId, resource: "contacts" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  if (!z.uuid().safeParse(id).success) {
    return fail("validation_failed", t("Contato inválido."), 422, { requestId });
  }

  const orgId = authz.org.orgId;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("converzon_apagar_contato_completo", {
    p_contact_id: id,
    p_organization_id: orgId,
  });

  if (error) {
    const motivo = (error.message ?? "").trim();
    if (motivo === "contato_nao_encontrado") {
      return fail("not_found", t("Contato não encontrado."), 404, { requestId });
    }
    if (motivo === "consulta_futura") {
      return fail(
        "state_conflict",
        t("Este contato tem consulta marcada. Cancele a consulta na Agenda antes de apagar."),
        409,
        { requestId },
      );
    }
    if (error.code === "23503") {
      return fail(
        "state_conflict",
        t("Não consegui apagar: este contato ainda tem outros registros ligados a ele."),
        409,
        { requestId },
      );
    }
    return fail("internal_error", t("Não foi possível apagar o contato."), 500, { requestId });
  }

  const resumo = (data ?? {}) as { apagou?: boolean; cards?: number; compromissos?: number };
  if (!resumo.apagou) {
    return fail("not_found", t("Contato não encontrado."), 404, { requestId });
  }

  await admin
    .rpc("emit_event", {
      p_event_type: "contact.deleted",
      p_entity_kind: "contact",
      p_entity_id: id,
      p_payload: {},
      p_metadata: { request_id: requestId, actor_user_id: authz.user.id },
      p_organization_id: orgId,
    })
    .then(({ error: eventoErro }) => {
      if (eventoErro) console.error("[converzon/apagar] emit_event failed", eventoErro.message);
    });

  await audit({
    action: "contact.deleted",
    actorUserId: authz.user.id,
    actorApiTokenId: null,
    organizationId: orgId,
    resourceType: "contact",
    resourceId: id,
    requestId,
    metadata: {
      origem: "converzon_apagar_tudo",
      cards_apagados: resumo.cards ?? 0,
      compromissos_apagados: resumo.compromissos ?? 0,
    },
  });

  return ok({ data: { id, cards: resumo.cards ?? 0, compromissos: resumo.compromissos ?? 0 } }, { requestId });
}
