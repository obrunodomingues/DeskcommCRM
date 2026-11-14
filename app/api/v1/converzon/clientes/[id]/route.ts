import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { normalizarTags } from "@/lib/contacts/tag-normalizada";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { ETIQUETA_DE_CLIENTE } from "@/lib/inbox/abas-converzon";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * FORK CONVERZON — marcar e desmarcar um contato como CLIENTE.
 *
 * Marcar faz, numa escrita só:
 *   1) a etiqueta `cliente` em `contacts.tags` — é o que põe as conversas dele na
 *      aba "Clientes" do inbox (lib/inbox/abas-converzon.ts), para sempre;
 *   2) `ai_opt_out = true` e `force_human = true` — o mesmo par do "sempre
 *      atendimento humano" (app/api/v1/contacts/[id]/always-human): a IA para de
 *      responder esse contato e a devolução automática não desfaz.
 *
 * Desmarcar tira a etiqueta e limpa `ai_opt_out`, como o desmarcar do "sempre
 * atendimento humano": NÃO devolve o atendimento à IA. A conversa segue com a
 * equipe até alguém usar "Devolver ao automático".
 *
 * A auditoria reusa `contacts.always_human_marked/unmarked`, com a origem no
 * metadata: o efeito que importa auditar (a IA parar) é o mesmo.
 *
 * `manager`, como o "sempre atendimento humano": decisão operacional.
 */
export async function POST(req: NextRequest, ctx: Context): Promise<Response> {
  // Guarda de efeito dentro de cada handler: o gate `suporte-cobertura-de-efeitos`
  // lê o corpo de POST/DELETE e não enxerga através de função compartilhada.
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  return trocar(req, ctx, true);
}

export async function DELETE(req: NextRequest, ctx: Context): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  return trocar(req, ctx, false);
}

async function trocar(_req: NextRequest, ctx: Context, marcar: boolean): Promise<Response> {
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
  // Admin client bypassa RLS: o filtro por organização é PROGRAMÁTICO e
  // obrigatório (CLAUDE.md, anti-pattern 10).
  const { data: contato, error: leituraErro } = await admin
    .from("contacts")
    .select("id, tags, ai_opt_out")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (leituraErro) {
    return fail("internal_error", t("Não foi possível alterar a marca de cliente."), 500, { requestId });
  }
  if (!contato) return fail("not_found", t("Contato não encontrado."), 404, { requestId });

  const atual = contato as { tags?: string[] | null; ai_opt_out?: boolean };
  const tagsAtuais = atual.tags ?? [];
  const jaCliente = tagsAtuais.includes(ETIQUETA_DE_CLIENTE);

  const valores = marcar
    ? { tags: normalizarTags([...tagsAtuais, ETIQUETA_DE_CLIENTE]), ai_opt_out: true, force_human: true }
    : { tags: tagsAtuais.filter((tag) => tag !== ETIQUETA_DE_CLIENTE), ai_opt_out: false };

  const { data: alterado, error: updateErro } = await admin
    .from("contacts")
    .update(valores)
    .eq("organization_id", orgId)
    .eq("id", id)
    .select("id, display_name, tags, ai_opt_out")
    .maybeSingle();
  if (updateErro || !alterado) {
    return fail("internal_error", t("Não foi possível alterar a marca de cliente."), 500, { requestId });
  }

  // Idempotente na prova: repetir o gesto não gera nova linha de auditoria, mas
  // o UPDATE roda de novo e cura uma marca pela metade.
  if (jaCliente === marcar && (atual.ai_opt_out === true) === marcar) {
    return ok({ data: alterado }, { requestId });
  }

  await audit({
    action: marcar ? "contacts.always_human_marked" : "contacts.always_human_unmarked",
    actorUserId: authz.user.id,
    actorApiTokenId: null,
    organizationId: orgId,
    resourceType: "contact",
    resourceId: id,
    requestId,
    // Sem nome: auditoria é append-only e a anonimização (LGPD) não a alcança.
    metadata: { contact_id: id, origem: marcar ? "marcar_como_cliente" : "desmarcar_cliente" },
  });

  return ok({ data: alterado }, { requestId });
}
