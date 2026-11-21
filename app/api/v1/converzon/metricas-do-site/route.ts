/**
 * GET /api/v1/converzon/metricas-do-site?dias=7|28|90[&forcar=1] — fork Converzon.
 *
 * O que a tela "Métricas do site" mostra: o painel do Google Analytics 4
 * (`lib/converzon/ga4.ts`), quantas pessoas estão no site agora e o bloco "Do
 * site ao CRM" — leads novos no período e quantos chegaram pelo formulário do
 * site (fonte de captação), contados no banco com a RLS de quem pede.
 *
 * Falha do Google NÃO vira 500: volta `ga4: null` com o motivo, e a tela explica
 * o que fazer (configurar, dar acesso à conta de serviço, tentar de novo). Os
 * números do CRM aparecem mesmo assim.
 *
 * `forcar=1` ignora o cache só se o painel tiver mais de 1 minuto — é o botão
 * "Atualizar agora", e a cota da Data API é por propriedade.
 */
import { randomUUID } from "node:crypto";

import { ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { FUSO_DO_SITE, Ga4Erro, idadeDoCache, painelDoSite, pessoasNoSiteAgora } from "@/lib/converzon/ga4";
import { hojeNoFuso, periodoValido, somaDias, type PainelDoSite } from "@/lib/converzon/metricas-do-site";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Início do dia `data` (AAAA-MM-DD) no fuso do site, como instante ISO. */
function inicioDoDia(data: string): string {
  // O fuso do site é fixo e sem horário de verão desde 2019: -03:00.
  return new Date(`${data}T00:00:00-03:00`).toISOString();
}

export async function GET(req: Request): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "converzon_metricas_do_site" });
  if (!authz.ok) return authz.response;
  const { org } = authz;

  const url = new URL(req.url);
  const dias = periodoValido(url.searchParams.get("dias"));
  const idade = idadeDoCache(dias);
  const forcar = url.searchParams.get("forcar") === "1" && (idade === null || idade > 60_000);

  let ga4: PainelDoSite | null = null;
  let erro: { motivo: string; mensagem: string; email: string | null } | null = null;
  let agora: number | null = null;
  try {
    ga4 = await painelDoSite(dias, forcar);
    agora = await pessoasNoSiteAgora();
  } catch (e) {
    erro =
      e instanceof Ga4Erro
        ? { motivo: e.motivo, mensagem: e.message, email: e.email }
        : { motivo: "falha", mensagem: "Não consegui ler o Google Analytics agora.", email: null };
  }

  // Do site ao CRM — o mesmo período, contado no banco (RLS de quem pede).
  const hoje = hojeNoFuso(FUSO_DO_SITE);
  const desde = inicioDoDia(somaDias(hoje, -(dias - 1)));
  const supabase = await createClient();
  const [leads, doFormulario] = await Promise.all([
    supabase
      .from("crm_leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.orgId)
      .gte("created_at", desde),
    supabase
      .from("webhook_lead_captures")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org.orgId)
      .eq("outcome", "criado")
      .gte("received_at", desde),
  ]);

  return ok(
    {
      dias,
      ga4,
      erro,
      agora,
      crm: {
        leadsNovos: leads.error ? null : (leads.count ?? 0),
        doFormularioDoSite: doFormulario.error ? null : (doFormulario.count ?? 0),
      },
    },
    { requestId },
  );
}
