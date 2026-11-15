import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireAuth } from "@/lib/auth/server";
import { instalacaoDeAgencia } from "@/lib/converzon/perfil-servidor";

import { ProjetosClient } from "./_components/ProjetosClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Projetos" };

/**
 * Fork Converzon — a execução de cada serviço vendido (lib/converzon/projetos.ts).
 * Só existe numa instalação de agência (`CONVERZON_PERFIL=agencia`); nas outras
 * responde 404, como se a tela não existisse.
 */
export default async function ProjetosPage() {
  if (!instalacaoDeAgencia()) notFound();
  await requireAuth();
  return <ProjetosClient />;
}
