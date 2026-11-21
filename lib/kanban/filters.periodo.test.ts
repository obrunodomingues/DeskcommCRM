import { describe, expect, it } from "vitest";

import { applyFilters, filtersFromParams, filtersToParams } from "./filters";
import type { Lead } from "@/lib/types/leads";

const leads = [
  { id: "outubro", title: "Indicação", tags: [], created_at: "2026-11-01T01:59:00Z", status: "open" },
  { id: "novembro", title: "Formulário", tags: [], created_at: "2026-11-01T03:01:00Z", status: "open" },
  { id: "perdido", title: "WhatsApp", tags: [], created_at: "2026-11-01T03:01:00Z", status: "lost" },
  { id: "dia-dois", title: "WhatsApp", tags: [], created_at: "2026-11-02T03:10:00Z", status: "open" },
] as unknown as Lead[];

describe("data de entrada no funil", () => {
  it("mantém a visão padrão e combina mês ou dia no fuso da organização com outros filtros", () => {
    expect(applyFilters(leads, {})).toEqual(leads);
    const ids = (entrada: string) =>
      applyFilters(leads, { periodoDeEntrada: entrada, status: "open" }, { fuso: "America/Sao_Paulo" })
        .map(({ id }) => id);
    expect(ids("2026-10")).toEqual(["outubro"]);
    expect(ids("2026-11")).toEqual(["novembro", "dia-dois"]);
    expect(ids("2026-11-01")).toEqual(["novembro"]);
  });

  it("preserva o período na URL e ignora datas inválidas", () => {
    for (const entrada of ["2026-11", "2024-02-29"]) {
      const params = new URLSearchParams(filtersToParams({ periodoDeEntrada: entrada }));
      expect(filtersFromParams(params).periodoDeEntrada).toBe(entrada);
    }
    for (const entrada of ["2026-13", "2026-02-29", "2026-06-31", "2026"]) {
      expect(filtersFromParams(new URLSearchParams({ entrada })).periodoDeEntrada).toBeUndefined();
    }
  });
});
