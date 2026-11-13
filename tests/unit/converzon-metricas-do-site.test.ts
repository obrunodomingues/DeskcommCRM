import { describe, expect, it } from "vitest";

import {
  agrupar,
  caminhoLimpo,
  hojeNoFuso,
  montarSerie,
  nomeDaCidade,
  nomeDaOrigem,
  nomeDaPagina,
  periodoAnteriorComparavel,
  periodoValido,
  somaDias,
  variacao,
} from "@/lib/converzon/metricas-do-site";
import { NAV_CATALOG } from "@/lib/navigation/catalogo";

/** FORK CONVERZON — as regras puras da tela "Métricas do site". */
describe("nomes legíveis", () => {
  it("origem: direto, Google pago e orgânico, IA, redes", () => {
    expect(nomeDaOrigem("(direct)", "(none)")).toBe("Direto (digitou ou salvou o endereço)");
    expect(nomeDaOrigem("google", "cpc")).toBe("Google (anúncio)");
    expect(nomeDaOrigem("google", "organic")).toBe("Google");
    expect(nomeDaOrigem("gemini.google.com", "referral")).toBe("Gemini");
    expect(nomeDaOrigem("instagram.com", "paid")).toBe("Instagram (anúncio)");
    expect(nomeDaOrigem("meta", "cpc")).toBe("Meta (anúncio)");
    expect(nomeDaOrigem("(not set)", "")).toBe("Não identificada");
    expect(nomeDaOrigem("(data not available)", "(data not available)")).toBe("Não identificada");
    expect(nomeDaOrigem("exemplo.com.br", "referral")).toBe("exemplo.com.br");
  });

  it("página: caminho limpo, título sem o sufixo do site, raiz e blog", () => {
    expect(caminhoLimpo("/rinoplastia.html?utm_source=x")).toBe("/rinoplastia");
    expect(caminhoLimpo("/index.html")).toBe("/");
    expect(caminhoLimpo("/contato/")).toBe("/contato");
    expect(nomeDaPagina("/", "Qualquer coisa")).toBe("Início");
    expect(nomeDaPagina("/rinoplastia", "Rinoplastia em Brasília | Nome do Site")).toBe("Rinoplastia em Brasília");
    expect(nomeDaPagina("/rinoplastia", "Rinoplastia · Nome do Site — Slogan do site")).toBe("Rinoplastia");
    expect(nomeDaPagina("/pos-operatorio", "Pós-operatório em casa | Nome")).toBe("Pós-operatório em casa");
    expect(nomeDaPagina("/blog/um-artigo", "Um artigo — Nome do Site")).toBe("Blog: Um artigo");
    expect(nomeDaPagina("/sem-titulo", "(not set)")).toBe("/sem-titulo");
  });

  it("cidade com acento", () => {
    expect(nomeDaCidade("Brasilia")).toBe("Brasília");
    expect(nomeDaCidade("Recife")).toBe("Recife");
  });
});

describe("agrupar", () => {
  it("soma por nome, ordena e junta o resto em 'Outras'", () => {
    const r = agrupar(
      [
        ["Google", 10],
        ["Direto", 5],
        ["Google", 5],
        ["Bing", 1],
        ["Zero", 0],
      ],
      2,
      "Outras",
    );
    expect(r).toEqual([
      { nome: "Google", valor: 15 },
      { nome: "Direto", valor: 5 },
      { nome: "Outras", valor: 1 },
    ]);
  });
});

describe("série por dia", () => {
  it("cobre todos os dias, zera os que o GA4 omitiu e alinha o período anterior por posição", () => {
    const atual = new Map([["20261110", { visitas: 7, visitantes: 5 }]]);
    const anterior = new Map([
      ["20261107", 3],
      ["20261105", 9],
    ]);
    const s = montarSerie("2026-11-10", 3, atual, anterior);
    expect(s.map((p) => p.data)).toEqual(["2026-11-08", "2026-11-09", "2026-11-10"]);
    expect(s[2]).toEqual({ data: "2026-11-10", visitas: 7, visitantes: 5, visitasAnterior: 3 });
    expect(s[0]).toEqual({ data: "2026-11-08", visitas: 0, visitantes: 0, visitasAnterior: 9 });
  });

  it("só compara com o período anterior quando ele tem visita em 80% dos dias", () => {
    const dias = (comVisita: number, total: number) =>
      Array.from({ length: total }, (_, i) => ({ visitasAnterior: i < comVisita ? 5 : 0 }));
    expect(periodoAnteriorComparavel(dias(8, 10))).toBe(true);
    expect(periodoAnteriorComparavel(dias(7, 10))).toBe(false);
    expect(periodoAnteriorComparavel([])).toBe(false);
  });

  it("datas e período", () => {
    expect(somaDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(hojeNoFuso("America/Sao_Paulo", new Date("2026-11-11T01:30:00Z"))).toBe("2026-11-10");
    expect(periodoValido("90")).toBe(90);
    expect(periodoValido("15")).toBe(28);
    expect(variacao(12, 10)).toBeCloseTo(20);
    expect(variacao(5, 0)).toBeNull();
  });
});

describe("menu", () => {
  it("Inbox virou WhatsApp e Métricas do site está em Análise", () => {
    const inbox = NAV_CATALOG.find((d) => d.href === "/app/inbox");
    expect(inbox?.label).toBe("WhatsApp");
    expect(inbox?.icon).toBe("WhatsappLogo");
    const metricas = NAV_CATALOG.find((d) => d.href === "/app/metricas-do-site");
    expect(metricas).toMatchObject({ label: "Métricas do site", group: "analise", minRole: "manager", sidebar: true });
  });
});
