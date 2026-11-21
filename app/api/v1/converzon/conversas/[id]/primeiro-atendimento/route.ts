import { createHash, randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { comIdempotencia } from "@/lib/api/idempotency";
import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { autorizarContatoParaIA } from "@/lib/ai/elegibilidade/autorizacao";
import { requireRole } from "@/lib/auth/require-role";
import { estadoDaJanela } from "@/lib/channels/janela";
import { instalacaoDeAgencia } from "@/lib/converzon/perfil-servidor";
import { montarPrimeiroAtendimento } from "@/lib/converzon/primeiro-atendimento";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
const ENDPOINT = "converzon.primeiro_atendimento";
const ENVIADOS = ["sent", "delivered", "read"];
const EM_CURSO = ["queued", "sending"];

function idDaMensagem(conversa: string, posicao: number): string {
  const s = createHash("sha256").update([ENDPOINT, conversa, String(posicao)].join(":")).digest("hex");
  return [s.slice(0, 8), s.slice(8, 12), "5" + s.slice(13, 16), "8" + s.slice(17, 20), s.slice(20, 32)].join("-");
}

async function contexto(ctx: Context, requestId: string) {
  if (!instalacaoDeAgencia()) return { kind: "error", response: fail("not_found", "Ação indisponível.", 404, { requestId }) } as const;
  const auth = await requireRole("agent", { requestId, resource: "conversations" });
  if (!auth.ok) return { kind: "error", response: auth.response } as const;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) {
    return { kind: "error", response: fail("validation_failed", "Conversa inválida.", 422, { requestId }) } as const;
  }
  return { kind: "ok", id, auth, db: await createClient(), orgId: auth.org.orgId } as const;
}

async function lerSituacao(db: Awaited<ReturnType<typeof createClient>>, orgId: string, id: string, requestId: string) {
  const { data: conversa, error } = await db.from("conversations")
    .select("contact_id, channel, is_group, status, last_inbound_at, assigned_to_user_id, channel_session_id")
    .eq("organization_id", orgId).eq("id", id).maybeSingle();
  if (error) throw new ApiError(500, "internal_error", undefined, requestId, "Não foi possível ler a conversa.");
  if (!conversa?.contact_id || conversa.channel !== "whatsapp" || conversa.is_group ||
      ["closed", "archived", "resolved"].includes(conversa.status)) return null;

  const contactId = conversa.contact_id;
  const ids = [0, 1, 2].map((i) => idDaMensagem(id, i));
  const [contato, lead, mensagens, outraMensagem, canal] = await Promise.all([
    db.from("contacts").select("name, display_name, is_personal, is_blocked, is_anonymized, force_human, ai_opt_out, tags")
      .eq("organization_id", orgId).eq("id", contactId).maybeSingle(),
    db.from("crm_leads").select("custom_fields, crm_pipelines!inner(name)")
      .eq("organization_id", orgId).eq("crm_pipelines.organization_id", orgId)
      .eq("contact_id", contactId).eq("status", "open").eq("crm_pipelines.name", "Comercial")
      .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("messages").select("id, status")
      .eq("organization_id", orgId).eq("conversation_id", id).in("id", ids),
    db.from("messages").select("id")
      .eq("organization_id", orgId).eq("conversation_id", id).eq("direction", "outbound")
      .is("revoked_at", null).not("id", "in", "(" + ids.join(",") + ")")
      .in("status", [...ENVIADOS, ...EM_CURSO]).limit(1),
    db.from("channel_sessions").select("provider")
      .eq("organization_id", orgId).eq("id", conversa.channel_session_id)
      .is("archived_at", null).maybeSingle(),
  ]);
  if (contato.error || lead.error || mensagens.error || outraMensagem.error || canal.error) {
    throw new ApiError(500, "internal_error", undefined, requestId, "Não foi possível conferir o lead.");
  }
  if (!canal.data || estadoDaJanela(canal.data.provider, conversa.last_inbound_at, new Date()).tipo === "fechada") return null;
  const c = contato.data;
  if (!c || !lead.data || c.is_personal || c.is_blocked || c.is_anonymized || c.force_human ||
      c.ai_opt_out || c.tags?.includes("cliente") || outraMensagem.data.length > 0) return null;
  return {
    ids,
    contactId,
    assignedTo: conversa.assigned_to_user_id,
    nome: c.name || c.display_name,
    campos: lead.data.custom_fields as Record<string, unknown> | null,
    status: new Map(mensagens.data.map((m) => [m.id, m.status])),
  };
}

function respostaDeErro(err: unknown, requestId: string): Response {
  if (err instanceof ApiError) return fail(err.code, err.message, err.status, { requestId });
  return fail("internal_error", "Não foi possível concluir o primeiro atendimento. Confira a conversa e tente novamente.", 500, { requestId });
}

export async function GET(_req: NextRequest, ctx: Context): Promise<Response> {
  const requestId = randomUUID();
  const c = await contexto(ctx, requestId);
  if (c.kind === "error") return c.response;
  try {
    const situacao = await lerSituacao(c.db, c.orgId, c.id, requestId);
    const podeEnviar = !!situacao && (!situacao.assignedTo || situacao.assignedTo === c.auth.user.id)
      && situacao.ids.some((id) => !ENVIADOS.includes(situacao.status.get(id) ?? ""));
    return ok({ podeEnviar }, { requestId });
  } catch (err) {
    return respostaDeErro(err, requestId);
  }
}

export async function POST(_req: NextRequest, ctx: Context): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const c = await contexto(ctx, requestId);
  if (c.kind === "error") return c.response;
  try {
    const resultado = await comIdempotencia({
      db: c.db, organizationId: c.orgId, endpoint: ENDPOINT, chave: c.id, corpo: { conversa: c.id },
      executar: async () => {
        const situacao = await lerSituacao(c.db, c.orgId, c.id, requestId);
        if (!situacao || (situacao.assignedTo && situacao.assignedTo !== c.auth.user.id)) {
          throw new ApiError(409, "conflict", undefined, requestId, "O primeiro atendimento está indisponível nesta conversa.");
        }
        const blocos = montarPrimeiroAtendimento(situacao.nome, situacao.campos, new Date());
        for (const [i, id] of situacao.ids.entries()) {
          const status = situacao.status.get(id);
          if (status && ENVIADOS.includes(status)) continue;
          if (status === "failed") {
            throw new ApiError(409, "conflict", undefined, requestId, "Reenvie a mensagem que falhou na conversa e depois volte ao botão.");
          }
          if (status && EM_CURSO.includes(status)) {
            throw new ApiError(409, "idempotency_in_progress", undefined, requestId, "Aguarde a confirmação da mensagem antes de continuar.");
          }
          const atual = await lerSituacao(c.db, c.orgId, c.id, requestId);
          if (!atual || (atual.assignedTo && atual.assignedTo !== c.auth.user.id)) {
            throw new ApiError(409, "conflict", undefined, requestId, "A conversa mudou durante o primeiro atendimento. Confira as mensagens.");
          }
          const enviada = await sendMessageHandler(c.db, {
            organization_id: c.orgId,
            actor: { type: "user", id: c.auth.user.id, role: c.auth.org.role },
            requestId,
            internalMessageId: id,
            primeiroAtendimentoConverzon: true,
          }, {
            conversation_id: c.id,
            type: "text",
            body: blocos[i],
            metadata: { converzon_primeiro_atendimento: i + 1 },
          });
          if (!ENVIADOS.includes(enviada.status)) {
            throw new ApiError(409, "conflict", undefined, requestId, "O WhatsApp ainda não confirmou este bloco. Confira o status na conversa e retome pelo botão.");
          }
        }
        await autorizarContatoParaIA(c.db, {
          organizationId: c.orgId, contactId: situacao.contactId, reason: "retomada_manual", apenasSeNaoAutorizado: true,
        });
        return { resposta: { enviados: blocos.length }, status: 200 };
      },
    });
    if (resultado.tipo === "em_curso" || resultado.tipo === "conflito") {
      return fail("idempotency_in_progress", "Um primeiro atendimento já está em andamento.", 409, { requestId });
    }
    return ok(resultado.resposta, { requestId });
  } catch (err) {
    return respostaDeErro(err, requestId);
  }
}
