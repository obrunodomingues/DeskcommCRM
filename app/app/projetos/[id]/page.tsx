import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireAuth } from "@/lib/auth/server";
import { instalacaoDeAgencia } from "@/lib/converzon/perfil-servidor";

import { ProjetoClient } from "./_components/ProjetoClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Projeto" };

/** Fork Converzon — um projeto: fases, checklist, notas e histórico. */
export default async function ProjetoPage({ params }: { params: Promise<{ id: string }> }) {
  if (!instalacaoDeAgencia()) notFound();
  await requireAuth();
  const { id } = await params;
  return <ProjetoClient id={id} />;
}
