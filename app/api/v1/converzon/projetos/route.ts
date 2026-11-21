import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { hojeEmBrasilia, instalacaoDeAgencia } from "@/lib/converzon/perfil-servidor";
import {
  MODELOS_DE_PROJETO,
  TIPOS_DE_PROJETO,
  fasesDoModelo,
  itensIniciais,
  type ProjetoNaLista,
  type SituacaoDoProjeto,
  type TipoDeProjeto,
} from "@/lib/converzon/projetos";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * FORK CONVERZON — a lista de projetos (GET) e a criação de um projeto (POST).
 *
 * Tudo pela sessão de quem pede (RLS das tabelas `converzon_projeto*`) e com o
 * filtro de organização explícito. Fora de uma instalação de agência
 * (`CONVERZON_PERFIL`), responde 404: a tela não existe ali.
 */

type Contato = { id: string; display_name?: string | null; name?: string | null; phone_number?: string | null };
/** O PostgREST devolve o embutido como objeto ou lista, conforme a relação. */
const um = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  if (!instalacaoDeAgencia()) return fail("not_found", "Not found.", 404, { requestId });

  const authz = await requireRole("viewer", { requestId, resource: "converzon_projetos" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;
  const supabase = await createClient();

  const [projetos, itens] = await Promise.all([
    supabase
      .from("converzon_projetos")
      .select(
        "id, nome, tipo, situacao, fases, fase_atual, fase_desde, valor_centavos, prazo, concluido_em, contacts:contact_id (id, display_name, name, phone_number)",
      )
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase
      .from("converzon_projeto_itens")
      .select("projeto_id, feito, prazo")
      .eq("organization_id", orgId)
      .limit(10000),
  ]);
  if (projetos.error || itens.error) {
    return fail("internal_error", t("Não consegui carregar os projetos."), 500, { requestId });
  }

  const hoje = hojeEmBrasilia();
  const porProjeto = new Map<string, { total: number; feitos: number; atrasados: number; proximo: string | null }>();
  for (const i of (itens.data ?? []) as { projeto_id: string; feito: boolean; prazo: string | null }[]) {
    const conta = porProjeto.get(i.projeto_id) ?? { total: 0, feitos: 0, atrasados: 0, proximo: null };
    conta.total++;
    if (i.feito) conta.feitos++;
    else if (i.prazo) {
      if (i.prazo < hoje) conta.atrasados++;
      if (!conta.proximo || i.prazo < conta.proximo) conta.proximo = i.prazo;
    }
    porProjeto.set(i.projeto_id, conta);
  }

  const lista: ProjetoNaLista[] = (
    (projetos.data ?? []) as Array<{
      id: string;
      nome: string;
      tipo: TipoDeProjeto;
      situacao: SituacaoDoProjeto;
      fases: string[];
      fase_atual: number;
      fase_desde: string;
      valor_centavos: number | null;
      prazo: string | null;
      concluido_em: string | null;
      contacts: Contato | Contato[] | null;
    }>
  ).map((p) => {
    const contato = um(p.contacts);
    const conta = porProjeto.get(p.id);
    return {
      id: p.id,
      nome: p.nome,
      tipo: p.tipo,
      situacao: p.situacao,
      fases: p.fases,
      fase_atual: p.fase_atual,
      fase_desde: p.fase_desde,
      valor_centavos: p.valor_centavos,
      prazo: p.prazo,
      concluido_em: p.concluido_em,
      contato: contato ? { id: contato.id, nome: rotuloDoContato(contato) } : null,
      itens_total: conta?.total ?? 0,
      itens_feitos: conta?.feitos ?? 0,
      itens_atrasados: conta?.atrasados ?? 0,
      proximo_prazo: conta?.proximo ?? null,
    };
  });

  return ok({ projetos: lista, hoje }, { requestId });
}

const novoProjetoSchema = z
  .object({
    nome: z.string().trim().min(1).max(160),
    tipo: z.enum(TIPOS_DE_PROJETO),
    contact_id: z.uuid().nullable().optional(),
    valor_centavos: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
    prazo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
  })
  .strict();

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  if (!instalacaoDeAgencia()) return fail("not_found", "Not found.", 404, { requestId });

  const authz = await requireRole("agent", { requestId, resource: "converzon_projetos" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const orgId = authz.org.orgId;

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return fail("invalid_request", t("Dados inválidos."), 400, { requestId });
  }
  const parsed = novoProjetoSchema.safeParse(json);
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }
  const dados = parsed.data;
  const supabase = await createClient();

  if (dados.contact_id) {
    const { data: contato } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", orgId)
      .eq("id", dados.contact_id)
      .maybeSingle();
    if (!contato) return fail("not_found", t("Contato não encontrado."), 404, { requestId });
  }

  const { data: criado, error } = await supabase
    .from("converzon_projetos")
    .insert({
      organization_id: orgId,
      nome: dados.nome,
      tipo: dados.tipo,
      contact_id: dados.contact_id ?? null,
      fases: fasesDoModelo(dados.tipo),
      valor_centavos: dados.valor_centavos ?? null,
      prazo: dados.prazo ?? null,
      created_by: authz.user.id,
    })
    .select("id")
    .single();
  if (error || !criado) {
    return fail("internal_error", t("Não foi possível salvar o projeto."), 500, { requestId });
  }
  const projetoId = (criado as { id: string }).id;

  const itens = itensIniciais(dados.tipo).map((i) => ({ ...i, organization_id: orgId, projeto_id: projetoId }));
  if (itens.length > 0) {
    const { error: itensErr } = await supabase.from("converzon_projeto_itens").insert(itens);
    // Duas escritas sem transação: projeto sem o checklist do modelo nasceria
    // pela metade, então desfaz e devolve o erro (o projeto ainda não tem nada).
    if (itensErr) {
      await supabase.from("converzon_projetos").delete().eq("organization_id", orgId).eq("id", projetoId);
      return fail("internal_error", t("Não foi possível salvar o projeto."), 500, { requestId });
    }
  }

  await supabase.from("converzon_projeto_eventos").insert({
    organization_id: orgId,
    projeto_id: projetoId,
    tipo: "criado",
    texto: `Projeto criado: ${MODELOS_DE_PROJETO[dados.tipo].rotulo}`,
    autor_user_id: authz.user.id,
  });

  return ok({ id: projetoId }, { requestId, status: 201 });
}
