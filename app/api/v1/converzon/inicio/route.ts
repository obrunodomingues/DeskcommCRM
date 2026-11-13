import { randomUUID } from "node:crypto";

import { idsDeContatosPessoais } from "@/app/api/v1/conversations/_handler";
import { horariosLivresDaOrg } from "@/lib/agenda/consulta";
import { ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type Role } from "@/lib/auth/types";
import { idsDosCanaisDesativados } from "@/lib/channels/desativado";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { painelDoSite } from "@/lib/converzon/ga4";
import {
  contarPorEtapa,
  escolherFunil,
  type MensagemNova,
  type ProximaConsulta,
  type ResumoDoInicio,
} from "@/lib/converzon/inicio";
import { CONVERSATION_TERMINAL_STATUSES } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Fork Converzon — os números da tela "Início" (`app/app/inicio`).
 *
 * Tudo pela sessão de quem pede (RLS) e com o filtro de organização explícito:
 * cada pessoa vê no resumo só o que já veria nas telas de origem. As "novas
 * mensagens" usam o MESMO recorte da aba "Novas mensagens" do WhatsApp
 * (`conversations/counts`): sem pessoal, sem canal desativado, sem grupo.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

type Contato = { display_name?: string | null; name?: string | null; phone_number?: string | null };
/** O PostgREST devolve o embutido como objeto ou lista, conforme a relação. */
const um = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "converzon_inicio" });
  if (!authz.ok) return authz.response;
  const orgId = authz.org.orgId;
  const gerente = ROLE_RANK[authz.org.role as Role] >= ROLE_RANK.manager;

  const supabase = await createClient();
  const agora = new Date();
  const seteDiasAtras = new Date(agora.getTime() - 7 * DIA_MS).toISOString();
  const daquiSeteDias = new Date(agora.getTime() + 7 * DIA_MS).toISOString();
  const terminais = `(${CONVERSATION_TERMINAL_STATUSES.join(",")})`;

  const [pessoais, desativados] = await Promise.all([
    idsDeContatosPessoais(supabase, orgId).catch(() => [] as string[]),
    idsDosCanaisDesativados(supabase, orgId).catch(() => [] as string[]),
  ]);
  const semResposta = <Q extends { not(c: string, op: string, v: string): Q }>(q: Q): Q => {
    let r = q.not("status", "in", terminais);
    if (pessoais.length > 0) r = r.not("contact_id", "in", `(${pessoais.join(",")})`);
    if (desativados.length > 0) r = r.not("channel_session_id", "in", `(${desativados.join(",")})`);
    return r;
  };

  const [contagem, lista, antiga, novos, doForm, consultasCont, consultasLista, funis] = await Promise.all([
    semResposta(
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("converzon_sem_resposta", true)
        .eq("is_group", false),
    ),
    semResposta(
      supabase
        .from("conversations")
        .select(
          "id, last_inbound_at, last_message_preview, comando_da_conversa, contacts:contact_id (display_name, name, phone_number)",
        )
        .eq("organization_id", orgId)
        .eq("converzon_sem_resposta", true)
        .eq("is_group", false),
    )
      .order("last_inbound_at", { ascending: false })
      .limit(5),
    semResposta(
      supabase
        .from("conversations")
        .select("last_inbound_at")
        .eq("organization_id", orgId)
        .eq("converzon_sem_resposta", true)
        .eq("is_group", false),
    )
      .order("last_inbound_at", { ascending: true })
      .limit(1),
    supabase
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("created_at", seteDiasAtras),
    supabase
      .from("webhook_lead_captures")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("outcome", "criado")
      .gte("received_at", seteDiasAtras),
    supabase
      .from("calendar_appointments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .neq("status", "cancelled")
      .gte("starts_at", agora.toISOString())
      .lt("starts_at", daquiSeteDias),
    supabase
      .from("calendar_appointments")
      .select(
        "id, starts_at, title, location_kind, contacts:contact_id (display_name, name, phone_number), calendar_event_types:event_type_id (name)",
      )
      .eq("organization_id", orgId)
      .neq("status", "cancelled")
      .gte("starts_at", agora.toISOString())
      .order("starts_at", { ascending: true })
      .limit(5),
    supabase
      .from("crm_pipelines")
      .select("id, name, is_default, position")
      .eq("organization_id", orgId)
      .eq("is_archived", false),
  ]);

  // ── Mensagens ──
  const linhas = (lista.data ?? []) as {
    id: string;
    last_inbound_at: string | null;
    last_message_preview: string | null;
    comando_da_conversa: string | null;
    contacts: Contato | Contato[] | null;
  }[];
  const mensagens: MensagemNova[] = linhas.map((c) => ({
    conversaId: c.id,
    nome: rotuloDoContato(um(c.contacts)),
    previa: c.last_message_preview,
    recebidaEm: c.last_inbound_at ?? agora.toISOString(),
    comando: c.comando_da_conversa,
  }));
  const maisAntiga = ((antiga.data ?? []) as { last_inbound_at: string | null }[])[0]?.last_inbound_at ?? null;

  // ── Consultas ──
  const consultas: ProximaConsulta[] = (
    (consultasLista.data ?? []) as {
      id: string;
      starts_at: string;
      title: string | null;
      location_kind: string | null;
      contacts: Contato | Contato[] | null;
      calendar_event_types: { name: string | null } | { name: string | null }[] | null;
    }[]
  ).map((a) => {
    const contato = um(a.contacts);
    return {
      id: a.id,
      inicio: a.starts_at,
      nome: contato ? rotuloDoContato(contato) : a.title?.trim() || "Consulta",
      tipo: um(a.calendar_event_types)?.name ?? null,
      teleconsulta: a.location_kind === "google_meet" || a.location_kind === "video",
    };
  });

  // O próximo horário que um paciente novo consegue marcar pelo site ou pela IA:
  // o primeiro tipo de agendamento ativo, com a mesma conta de horários livres
  // que eles usam (grade, antecedência mínima e ocupados).
  let proximaVaga: string | null = null;
  let vagas30Dias: number | null = null;
  try {
    const { data: tipo } = await supabase
      .from("calendar_event_types")
      .select("id")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("position", { ascending: true })
      .order("name", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (tipo?.id) {
      const livres = await horariosLivresDaOrg(supabase, orgId, {
        eventTypeId: tipo.id as string,
        de: agora,
        ate: new Date(agora.getTime() + 30 * DIA_MS),
        agora,
      });
      if (livres.ok) {
        vagas30Dias = livres.slots.length;
        const primeiro = [...livres.slots].sort((a, b) => a.inicio.getTime() - b.inicio.getTime())[0];
        proximaVaga = primeiro ? primeiro.inicio.toISOString() : null;
      }
    }
  } catch {
    // Sem agenda publicada ou sem acesso: o cartão mostra só as consultas.
  }

  // ── Funil ──
  let funil: ResumoDoInicio["funil"] = { nome: null, abertos: null, etapas: [] };
  const escolhido = escolherFunil((funis.data ?? []) as { id: string; name: string; is_default: boolean | null; position: number | null }[]);
  if (escolhido) {
    const [etapas, leads] = await Promise.all([
      supabase
        .from("crm_stages")
        .select("id, name, is_won, is_lost, position")
        .eq("organization_id", orgId)
        .eq("pipeline_id", escolhido.id)
        .eq("is_archived", false)
        .order("position", { ascending: true }),
      supabase
        .from("crm_leads")
        .select("stage_id")
        .eq("organization_id", orgId)
        .eq("pipeline_id", escolhido.id)
        .eq("status", "open")
        .limit(5000),
    ]);
    if (!etapas.error && !leads.error) {
      const porEtapa = contarPorEtapa(etapas.data ?? [], leads.data ?? []);
      funil = { nome: escolhido.name, abertos: porEtapa.reduce((s, e) => s + e.abertos, 0), etapas: porEtapa };
    }
  }

  // ── Site (só gerente; o Google é lido com cache de 10 min) ──
  let site: ResumoDoInicio["site"] = null;
  if (gerente) {
    try {
      const painel = await painelDoSite(7, false);
      site = { visitas7Dias: painel.totais.atual.visitas, serie: painel.serie.map((p) => p.visitas) };
    } catch {
      site = { visitas7Dias: null, serie: [] };
    }
  }

  const resumo: ResumoDoInicio = {
    mensagens: { semResposta: contagem.error ? null : (contagem.count ?? 0), maisAntiga, lista: mensagens },
    pacientes: {
      novos7Dias: novos.error ? null : (novos.count ?? 0),
      doFormulario7Dias: doForm.error ? null : (doForm.count ?? 0),
    },
    consultas: {
      proximos7Dias: consultasCont.error ? null : (consultasCont.count ?? 0),
      lista: consultas,
      proximaVaga,
      vagas30Dias,
    },
    funil,
    site,
  };
  return ok(resumo, { requestId });
}
