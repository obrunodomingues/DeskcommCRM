import type { Metadata } from "next";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";

import { MetricasDoSiteClient } from "./_components/MetricasDoSiteClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Métricas do site" };

/**
 * Fork Converzon — "Métricas do site": o Google Analytics do site dentro do CRM,
 * com gráficos. Mesmo corte de papel da rota (`manager`+).
 */
export default async function MetricasDoSitePage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  const t = (texto: string) => traduzir(texto, user.idioma);
  const podeVer = !!activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Métricas do site")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("As visitas do site pelo Google Analytics, comparadas com o período anterior.")}
        </p>
      </header>
      {podeVer ? (
        <MetricasDoSiteClient />
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("Só gerentes e administradores veem as métricas do site.")}
        </p>
      )}
    </div>
  );
}
