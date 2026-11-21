"use client";

import { useMemo, useState } from "react";

import { MarcarComoCliente } from "@/components/inbox/MarcarComoCliente";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import type { Stage } from "@/lib/kanban/types";
import type { Lead } from "@/lib/types/leads";
import { LeadDossier } from "./LeadDossier";

export function ClientesDoFunil({
  pipelineId,
  stages,
  leads,
  leadDoLink,
}: {
  pipelineId: string;
  stages: Stage[];
  leads: Lead[];
  leadDoLink?: Lead;
}) {
  const t = useT();
  const [selecionado, setSelecionado] = useState<string | null>();
  const aberto = selecionado === undefined ? leadDoLink : leads.find((lead) => lead.id === selecionado);
  const clientes = useMemo(() => {
    const porContato = new Map<string, Lead>();
    for (const lead of leads.toSorted((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))) {
      if (lead.contact_id && !porContato.has(lead.contact_id)) porContato.set(lead.contact_id, lead);
    }
    return Array.from(porContato.values());
  }, [leads]);

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      {clientes.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-6 text-sm text-muted-foreground">
          {t("Nenhum cliente neste funil.")}
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {clientes.map((lead) => (
            <li key={lead.contact_id} className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-3">
              <div className="min-w-0 flex-1">
                <Button
                  variant="ghost"
                  className="block h-auto max-w-full truncate px-1 py-1 text-left"
                  onClick={() => setSelecionado(lead.id)}
                >
                  {lead.title}
                </Button>
                {lead.contact_phone && <p className="truncate px-1 text-xs text-muted-foreground">{lead.contact_phone}</p>}
              </div>
              {lead.contact_id && (
                <MarcarComoCliente contactId={lead.contact_id} tags={lead.contact_tags ?? []} />
              )}
            </li>
          ))}
        </ul>
      )}
      {aberto && (
        <LeadDossier
          key={aberto.id}
          open
          onOpenChange={(open) => { if (!open) setSelecionado(null); }}
          lead={aberto}
          pipelineId={pipelineId}
          stageName={stages.find((stage) => stage.id === aberto.stage_id)?.name ?? ""}
        />
      )}
    </div>
  );
}
