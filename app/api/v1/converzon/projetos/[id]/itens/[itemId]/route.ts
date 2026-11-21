import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { instalacaoDeAgencia } from "@/lib/converzon/perfil-servidor";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * FORK CONVERZON — um item do checklist: marcar/desmarcar, renomear e mudar o
 * prazo (PATCH), ou apagar (DELETE). Marcar e desmarcar entram no histórico.
 */

type Context = { params: Promise<{ id: string; itemId: string }> };

const edicaoSchema = z
  .object({
    feito: z.boolean().optional(),
    titulo: z.string().trim().min(1).max(200).optional(),
    prazo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .strict();

async function preparar(ctx: Context, requestId: string) {
  const authz = await requireRole("agent", { requestId, resource: "converzon_projetos" });
  if (!authz.ok) return { erro: authz.response } as const;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id, itemId } = await ctx.params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(itemId).success) {
    return { erro: fail("not_found", t("Item não encontrado."), 404, { requestId }) } as const;
  }
  return { authz, t, id, itemId } as const;
}

export async function PATCH(req: NextRequest, ctx: Context): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  if (!instalacaoDeAgencia()) return fail("not_found", "Not found.", 404, { requestId });
  const p = await preparar(ctx, requestId);
  if (p.erro) return p.erro;
  const { authz, t, id, itemId } = p;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return fail("invalid_request", t("Dados inválidos."), 400, { requestId });
  }
  const parsed = edicaoSchema.safeParse(json);
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }

  const orgId = authz.org.orgId;
  const supabase = await createClient();
  const { data: atual } = await supabase
    .from("converzon_projeto_itens")
    .select("id, titulo, feito")
    .eq("organization_id", orgId)
    .eq("projeto_id", id)
    .eq("id", itemId)
    .maybeSingle();
  if (!atual) return fail("not_found", t("Item não encontrado."), 404, { requestId });
  const antes = atual as { titulo: string; feito: boolean };

  const mudancas: Record<string, unknown> = {};
  if (parsed.data.titulo !== undefined) mudancas.titulo = parsed.data.titulo;
  if (parsed.data.prazo !== undefined) mudancas.prazo = parsed.data.prazo;
  const virouFeito = parsed.data.feito !== undefined && parsed.data.feito !== antes.feito;
  if (virouFeito) {
    mudancas.feito = parsed.data.feito;
    mudancas.feito_em = parsed.data.feito ? new Date().toISOString() : null;
  }
  if (Object.keys(mudancas).length === 0) return ok({ id: itemId }, { requestId });

  const { data: salvo, error } = await supabase
    .from("converzon_projeto_itens")
    .update(mudancas)
    .eq("organization_id", orgId)
    .eq("projeto_id", id)
    .eq("id", itemId)
    .select("id, fase, titulo, feito, feito_em, prazo, posicao")
    .single();
  if (error || !salvo) return fail("internal_error", t("Não foi possível salvar o item."), 500, { requestId });

  if (virouFeito) {
    const titulo = (parsed.data.titulo ?? antes.titulo).slice(0, 400);
    await supabase.from("converzon_projeto_eventos").insert({
      organization_id: orgId,
      projeto_id: id,
      tipo: "item",
      texto: parsed.data.feito ? `Feito: ${titulo}` : `Reaberto: ${titulo}`,
      autor_user_id: authz.user.id,
    });
  }
  return ok(salvo, { requestId });
}

export async function DELETE(_req: NextRequest, ctx: Context): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  if (!instalacaoDeAgencia()) return fail("not_found", "Not found.", 404, { requestId });
  const p = await preparar(ctx, requestId);
  if (p.erro) return p.erro;
  const { authz, t, id, itemId } = p;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("converzon_projeto_itens")
    .delete()
    .eq("organization_id", authz.org.orgId)
    .eq("projeto_id", id)
    .eq("id", itemId)
    .select("id");
  if (error) return fail("internal_error", t("Não foi possível excluir o item."), 500, { requestId });
  if (!data || data.length === 0) return fail("not_found", t("Item não encontrado."), 404, { requestId });
  return ok({ id: itemId }, { requestId });
}
