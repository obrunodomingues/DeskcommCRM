import "server-only";

import { lerPerfil } from "@/lib/converzon/perfil";
import { env } from "@/lib/env";

/**
 * FORK CONVERZON — esta instalação é de agência (`CONVERZON_PERFIL=agencia`)?
 *
 * As telas e rotas que só fazem sentido numa agência (Projetos) respondem como
 * se não existissem nas outras instalações do mesmo fork. Só servidor: o ramo
 * vem do `.env` da VPS.
 */
export function instalacaoDeAgencia(): boolean {
  return lerPerfil(env.CONVERZON_PERFIL) === "agencia";
}

/** "Hoje" como data de calendário (AAAA-MM-DD) no fuso de Brasília. */
export function hojeEmBrasilia(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}
