import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * Fork Converzon — "Não precisa responder".
 *
 * Tira a conversa das abas "Sem resposta" e "Precisam de você" sem mandar nada
 * ao cliente: grava `metadata.converzon_dispensada_em`, e `converzon_sem_resposta`
 * (converzon/sql/0003) só volta a contar o que o cliente mandar DEPOIS disso.
 * É marcador de tela, não atendimento: não fecha, não atribui, não mexe na IA.
 */
export async function POST(_req: NextRequest, ctx: Context): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id } = await ctx.params;
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  if (!z.uuid().safeParse(id).success) {
    return fail("validation_failed", t("Conversa inválida."), 422, { requestId });
  }

  const orgId = authz.org.orgId;
  const admin = createAdminClient();
  const { data: conversa, error: leituraErro } = await admin
    .from("conversations")
    .select("id, metadata")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (leituraErro) {
    return fail("internal_error", t("Não foi possível tirar a conversa da aba."), 500, { requestId });
  }
  if (!conversa) return fail("not_found", t("Conversa não encontrada."), 404, { requestId });

  const metadata = ((conversa as { metadata?: Record<string, unknown> | null }).metadata ?? {}) as Record<
    string,
    unknown
  >;
  const { error: updateErro } = await admin
    .from("conversations")
    .update({ metadata: { ...metadata, converzon_dispensada_em: new Date().toISOString() } })
    .eq("organization_id", orgId)
    .eq("id", id);
  if (updateErro) {
    return fail("internal_error", t("Não foi possível tirar a conversa da aba."), 500, { requestId });
  }

  return ok({ data: { id } }, { requestId });
}
