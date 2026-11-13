import type { Metadata } from "next";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { nomeDaSaudacao } from "@/lib/converzon/inicio";

import { InicioClient } from "./_components/InicioClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Início" };

/**
 * Fork Converzon — o resumo do dia. Qualquer pessoa da equipe abre: cada número
 * é lido com a sessão dela (`/api/v1/converzon/inicio`), então ninguém vê aqui o
 * que não veria nas telas de origem. Os números do site só aparecem para gerente.
 */
export default async function InicioPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  const gerente = !!activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;

  return <InicioClient nome={nomeDaSaudacao(user.full_name)} gerente={gerente} />;
}
