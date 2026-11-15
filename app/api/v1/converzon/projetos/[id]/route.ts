import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { instalacaoDeAgencia } from "@/lib/converzon/perfil-servidor";
import {
  SITUACOES_DE_PROJETO,
  valorEmReais,
  type ProjetoCompleto,
  type SituacaoDoProjeto,
  type TipoDeProjeto,
} from "@/lib/converzon/projetos";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * FORK CONVERZON — um projeto: ler (GET), editar (PATCH) e excluir (DELETE).
 *
 * O PATCH grava no histórico o que muda o andamento: fase, situação, prazo e
 * valor. Mudar a fase reinicia o relógio de "parado há N dias" (`fase_desde`).
 */

type Context = { params: Promise<{ id: string }> };
type Contato = { id: string; display_name?: string | null; name?: string | null; phone_number?: string | null };
const um = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

const ROTULO_DA_SITUACAO: Record<SituacaoDoProjeto, string> = {
  andamento: "Em andamento",
  esperando_cliente: "Esperando o cliente",
  pausado: "Pausado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

function dataBr(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export async function GET(_req: NextRequest, ctx: Context): Promise<Response> {
  const requestId = randomUUID();
  if (!instalacaoDeAgencia()) return fail("not_found", "Not found.", 404, { requestId });

  const authz = await requireRole("viewer", { requestId, resource: "converzon_projetos" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return fail("not_found", t("Projeto não encontrado."), 404, { requestId });

  const orgId = authz.org.orgId;
  const supabase = await createClient();
  const [projeto, itens, eventos] = await Promise.all([
    supabase
      .from("converzon_projetos")
      .select(
        "id, nome, tipo, situacao, fases, fase_atual, fase_desde, valor_centavos, prazo, concluido_em, notas, contacts:contact_id (id, display_name, name, phone_number)",
      )
      .eq("organization_id", orgId)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("converzon_projeto_itens")
      .select("id, fase, titulo, feito, feito_em, prazo, posicao")
      .eq("organization_id", orgId)
      .eq("projeto_id", id)
      .order("fase", { ascending: true })
      .order("posicao", { ascending: true }),
    supabase
      .from("converzon_projeto_eventos")
      .select("id, tipo, texto, created_at")
      .eq("organization_id", orgId)
      .eq("projeto_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (projeto.error || itens.error || eventos.error) {
    return fail("internal_error", t("Não consegui carregar o projeto."), 500, { requestId });
  }
  if (!projeto.data) return fail("not_found", t("Projeto não encontrado."), 404, { requestId });

  const p = projeto.data as {
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
    notas: string | null;
    contacts: Contato | Contato[] | null;
  };
  const contato = um(p.contacts);
  const corpo: ProjetoCompleto = {
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
    notas: p.notas,
    contato: contato ? { id: contato.id, nome: rotuloDoContato(contato) } : null,
    itens: (itens.data ?? []) as ProjetoCompleto["itens"],
    eventos: (eventos.data ?? []) as ProjetoCompleto["eventos"],
  };
  return ok(corpo, { requestId });
}

const edicaoSchema = z
  .object({
    nome: z.string().trim().min(1).max(160).optional(),
    situacao: z.enum(SITUACOES_DE_PROJETO).optional(),
    fase_atual: z.number().int().min(0).max(19).optional(),
    valor_centavos: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
    prazo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    notas: z.string().max(20000).nullable().optional(),
    contact_id: z.uuid().nullable().optional(),
  })
  .strict();

export async function PATCH(req: NextRequest, ctx: Context): Promise<Response> {
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
  const parsed = edicaoSchema.safeParse(json);
  if (!parsed.success) {
    return fail("validation_failed", t("Dados inválidos."), 422, { requestId, details: parsed.error.flatten() });
  }
  const pedido = parsed.data;

  const orgId = authz.org.orgId;
  const supabase = await createClient();
  const { data: atual, error: leituraErro } = await supabase
    .from("converzon_projetos")
    .select("id, fases, fase_atual, situacao, prazo, valor_centavos")
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  if (leituraErro) return fail("internal_error", t("Não foi possível salvar o projeto."), 500, { requestId });
  if (!atual) return fail("not_found", t("Projeto não encontrado."), 404, { requestId });
  const antes = atual as {
    fases: string[];
    fase_atual: number;
    situacao: SituacaoDoProjeto;
    prazo: string | null;
    valor_centavos: number | null;
  };

  if (pedido.contact_id) {
    const { data: contato } = await supabase
      .from("contacts")
      .select("id")
      .eq("organization_id", orgId)
      .eq("id", pedido.contact_id)
      .maybeSingle();
    if (!contato) return fail("not_found", t("Contato não encontrado."), 404, { requestId });
  }

  const mudancas: Record<string, unknown> = {};
  const historico: { tipo: string; texto: string }[] = [];

  if (pedido.nome !== undefined) mudancas.nome = pedido.nome;
  if (pedido.notas !== undefined) mudancas.notas = pedido.notas?.trim() ? pedido.notas : null;
  if (pedido.contact_id !== undefined) mudancas.contact_id = pedido.contact_id;

  if (pedido.fase_atual !== undefined && pedido.fase_atual !== antes.fase_atual) {
    if (pedido.fase_atual >= antes.fases.length) {
      return fail("validation_failed", t("Fase inválida."), 422, { requestId });
    }
    mudancas.fase_atual = pedido.fase_atual;
    mudancas.fase_desde = new Date().toISOString();
    const nomeDaFase = antes.fases[pedido.fase_atual] ?? "";
    historico.push({
      tipo: "fase",
      texto: pedido.fase_atual > antes.fase_atual ? `Avançou para ${nomeDaFase}` : `Voltou para ${nomeDaFase}`,
    });
  }

  if (pedido.situacao !== undefined && pedido.situacao !== antes.situacao) {
    mudancas.situacao = pedido.situacao;
    mudancas.concluido_em = pedido.situacao === "concluido" ? new Date().toISOString() : null;
    historico.push({ tipo: "situacao", texto: `Situação: ${ROTULO_DA_SITUACAO[pedido.situacao]}` });
  }

  if (pedido.prazo !== undefined && pedido.prazo !== antes.prazo) {
    mudancas.prazo = pedido.prazo;
    historico.push({ tipo: "edicao", texto: pedido.prazo ? `Prazo: ${dataBr(pedido.prazo)}` : "Prazo removido" });
  }

  if (pedido.valor_centavos !== undefined && pedido.valor_centavos !== antes.valor_centavos) {
    mudancas.valor_centavos = pedido.valor_centavos;
    historico.push({
      tipo: "edicao",
      texto: pedido.valor_centavos === null ? "Valor removido" : `Valor: ${valorEmReais(pedido.valor_centavos)}`,
    });
  }

  if (Object.keys(mudancas).length === 0) return ok({ id }, { requestId });

  const { error } = await supabase.from("converzon_projetos").update(mudancas).eq("organization_id", orgId).eq("id", id);
  if (error) return fail("internal_error", t("Não foi possível salvar o projeto."), 500, { requestId });

  if (historico.length > 0) {
    await supabase.from("converzon_projeto_eventos").insert(
      historico.map((h) => ({ ...h, organization_id: orgId, projeto_id: id, autor_user_id: authz.user.id })),
    );
  }
  return ok({ id }, { requestId });
}

export async function DELETE(_req: NextRequest, ctx: Context): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  if (!instalacaoDeAgencia()) return fail("not_found", "Not found.", 404, { requestId });

  // Excluir apaga checklist e histórico junto (cascade): gerente para cima.
  const authz = await requireRole("manager", { requestId, resource: "converzon_projetos" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return fail("not_found", t("Projeto não encontrado."), 404, { requestId });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("converzon_projetos")
    .delete()
    .eq("organization_id", authz.org.orgId)
    .eq("id", id)
    .select("id");
  if (error) return fail("internal_error", t("Não foi possível excluir o projeto."), 500, { requestId });
  if (!data || data.length === 0) return fail("not_found", t("Projeto não encontrado."), 404, { requestId });
  return ok({ id }, { requestId });
}
