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

/** FORK CONVERZON — acrescenta um item ao checklist de uma fase do projeto. */

type Context = { params: Promise<{ id: string }> };

const novoItemSchema = z
  .object({
    fase: z.number().int().min(0).max(19),
    titulo: z.string().trim().min(1).max(200),
    prazo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .strict();

export async function POST(req: NextRequest, ctx: Context): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  if (!instalacaoDeAgencia()) return fail("not_found", "Not found.", 404, { requestId });

  const authz = await requireRole("agent", { requestId, resource: "converzon_projetos" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return fail("not_found", t("Projeto não encontrado."), 404, { requestId });

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return fail("invalid_request", t("Dados inválidos."), 400, { requestId });
  }
  const parsed = novoItemSchema.safeParse(json);
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }

  const orgId = authz.org.orgId;
  const supabase = await createClient();
  const { data: projeto } = await supabase
    .from("converzon_projetos")
    .select("id, fases")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (!projeto) return fail("not_found", t("Projeto não encontrado."), 404, { requestId });
  if (parsed.data.fase >= (projeto as { fases: string[] }).fases.length) {
    return fail("validation_failed", t("Fase inválida."), 422, { requestId });
  }

  // No fim da fase: maior posição + 1000.
  const { data: ultimo } = await supabase
    .from("converzon_projeto_itens")
    .select("posicao")
    .eq("organization_id", orgId)
    .eq("projeto_id", id)
    .eq("fase", parsed.data.fase)
    .order("posicao", { ascending: false })
    .limit(1)
    .maybeSingle();
  const posicao = ((ultimo as { posicao: number } | null)?.posicao ?? 0) + 1000;

  const { data: criado, error } = await supabase
    .from("converzon_projeto_itens")
    .insert({
      organization_id: orgId,
      projeto_id: id,
      fase: parsed.data.fase,
      titulo: parsed.data.titulo,
      prazo: parsed.data.prazo ?? null,
      posicao,
    })
    .select("id, fase, titulo, feito, feito_em, prazo, posicao")
    .single();
  if (error || !criado) return fail("internal_error", t("Não foi possível salvar o item."), 500, { requestId });
  return ok(criado, { requestId, status: 201 });
}
