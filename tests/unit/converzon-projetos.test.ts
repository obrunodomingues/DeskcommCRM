/**
 * Fork Converzon — a tela "Projetos" (app/app/projetos, lib/converzon/projetos.ts).
 *
 * As contas puras da tela, os modelos de cada tipo de serviço e o lugar da tela
 * no menu: só aparece numa instalação de agência (capacidade
 * `converzon_agencia`) e ocupa no menu lateral o lugar de Tarefas.
 */
import { describe, expect, it } from "vitest";

import {
  MODELOS_DE_PROJETO,
  TIPOS_DE_PROJETO,
  centavosDoTexto,
  diasNaFase,
  estadoDoPrazo,
  fasesDoModelo,
  itensIniciais,
  mostrarNoQuadro,
  percentualFeito,
  resumoDaSemana,
  somarDias,
  type ProjetoNaLista,
} from "@/lib/converzon/projetos";
import { NAV_CATALOG } from "@/lib/navigation/catalogo";
import { sidebarGroups } from "@/lib/navigation/registry";

const DIA = 86_400_000;
const AGORA = Date.parse("2026-11-20T12:00:00Z");

function projeto(p: Partial<ProjetoNaLista>): ProjetoNaLista {
  return {
    id: "p",
    nome: "Projeto",
    tipo: "site",
    situacao: "andamento",
    fases: ["Briefing", "Design"],
    fase_atual: 0,
    fase_desde: new Date(AGORA).toISOString(),
    valor_centavos: null,
    prazo: null,
    concluido_em: null,
    contato: null,
    itens_total: 0,
    itens_feitos: 0,
    itens_atrasados: 0,
    proximo_prazo: null,
    ...p,
  };
}

describe("Projetos — modelos por tipo de serviço", () => {
  it("todo tipo tem rótulo e pelo menos uma fase, sem fase repetida", () => {
    for (const tipo of TIPOS_DE_PROJETO) {
      const m = MODELOS_DE_PROJETO[tipo];
      expect(m.rotulo.length).toBeGreaterThan(0);
      expect(m.fases.length).toBeGreaterThan(0);
      expect(m.fases.length).toBeLessThanOrEqual(20); // a CHECK do SQL
      expect(new Set(fasesDoModelo(tipo)).size).toBe(m.fases.length);
    }
  });

  it("a estrutura completa tem as fases do site e mais Google, CRM e Google Ads", () => {
    const fases = fasesDoModelo("estrutura");
    for (const f of ["Briefing", "Design", "Desenvolvimento", "Publicação", "Google", "CRM", "Google Ads", "Entregue"]) {
      expect(fases).toContain(f);
    }
  });

  it("o checklist inicial sai com a fase certa e posições crescentes dentro da fase", () => {
    const itens = itensIniciais("site");
    expect(itens.length).toBeGreaterThan(0);
    expect(itens[0]).toMatchObject({ fase: 0, posicao: 1000 });
    for (const i of itens) expect(i.fase).toBeLessThan(fasesDoModelo("site").length);
    const daFase0 = itens.filter((i) => i.fase === 0).map((i) => i.posicao);
    expect(daFase0).toEqual([...daFase0].sort((a, b) => a - b));
  });

  it("nenhum texto dos modelos usa travessão", () => {
    const textos = TIPOS_DE_PROJETO.flatMap((t) => [
      MODELOS_DE_PROJETO[t].rotulo,
      ...MODELOS_DE_PROJETO[t].fases.flatMap((f) => [f.nome, ...f.itens]),
    ]);
    for (const texto of textos) expect(texto).not.toMatch(/[—–]/);
  });
});

describe("Projetos — contas da tela", () => {
  it("prazo: atrasado antes de hoje, esta semana até 7 dias, em dia depois", () => {
    expect(estadoDoPrazo(null, "2026-11-20")).toBeNull();
    expect(estadoDoPrazo("2026-11-19", "2026-11-20")).toBe("atrasado");
    expect(estadoDoPrazo("2026-11-20", "2026-11-20")).toBe("esta_semana");
    expect(estadoDoPrazo("2026-11-27", "2026-11-20")).toBe("esta_semana");
    expect(estadoDoPrazo("2026-11-28", "2026-11-20")).toBe("em_dia");
  });

  it("somar dias atravessa mês e ano", () => {
    expect(somarDias("2026-11-28", 7)).toBe("2026-12-05");
    expect(somarDias("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("dias na fase contam dias inteiros e nunca ficam negativos", () => {
    expect(diasNaFase(new Date(AGORA - 3.5 * DIA).toISOString(), AGORA)).toBe(3);
    expect(diasNaFase(new Date(AGORA + DIA).toISOString(), AGORA)).toBe(0);
    expect(diasNaFase("lixo", AGORA)).toBe(0);
  });

  it("resumo da semana: atrasado pelo prazo do projeto ou de item; parado a partir de 7 dias", () => {
    const r = resumoDaSemana(
      [
        projeto({ id: "a", prazo: "2026-11-10" }),
        projeto({ id: "b", itens_atrasados: 2 }),
        projeto({ id: "c", proximo_prazo: "2026-11-22" }),
        projeto({ id: "d", fase_desde: new Date(AGORA - 8 * DIA).toISOString() }),
        projeto({ id: "e", situacao: "esperando_cliente" }),
        // Pausado, concluído e cancelado não contam em nada.
        projeto({ id: "f", situacao: "pausado", prazo: "2026-11-10" }),
        projeto({ id: "g", situacao: "concluido", itens_atrasados: 3 }),
      ],
      "2026-11-20",
      AGORA,
    );
    expect(r).toEqual({ atrasados: 2, vencendo: 1, parados: 1, esperandoCliente: 1 });
  });

  it("quadro: cancelado some, concluído fica 30 dias", () => {
    expect(mostrarNoQuadro({ situacao: "cancelado", concluido_em: null }, AGORA)).toBe(false);
    expect(mostrarNoQuadro({ situacao: "andamento", concluido_em: null }, AGORA)).toBe(true);
    expect(
      mostrarNoQuadro({ situacao: "concluido", concluido_em: new Date(AGORA - 10 * DIA).toISOString() }, AGORA),
    ).toBe(true);
    expect(
      mostrarNoQuadro({ situacao: "concluido", concluido_em: new Date(AGORA - 31 * DIA).toISOString() }, AGORA),
    ).toBe(false);
  });

  it("percentual do checklist", () => {
    expect(percentualFeito(0, 0)).toBe(0);
    expect(percentualFeito(1, 3)).toBe(33);
    expect(percentualFeito(5, 4)).toBe(100);
  });

  it("valor digitado vira centavos nos formatos que a gente digita", () => {
    expect(centavosDoTexto("")).toBeNull();
    expect(centavosDoTexto("1500")).toBe(150000);
    expect(centavosDoTexto("1.500")).toBe(150000);
    expect(centavosDoTexto("1.500,50")).toBe(150050);
    expect(centavosDoTexto("R$ 950,00")).toBe(95000);
    expect(centavosDoTexto("12.5")).toBe(1250);
    expect(Number.isNaN(centavosDoTexto("abc"))).toBe(true);
  });
});

describe("Projetos — lugar no menu", () => {
  const hrefsDoMenu = (capacidades: readonly ("converzon_agencia" | "propostas")[]) =>
    sidebarGroups(false, "admin", undefined, [], capacidades).flatMap((g) => g.items.map((i) => i.href));

  it("numa agência, Projetos aparece no menu lateral no lugar de Tarefas", () => {
    const menu = hrefsDoMenu(["converzon_agencia"]);
    expect(menu).toContain("/app/projetos");
    expect(menu).not.toContain("/app/tasks");
  });

  it("fora de uma agência, Projetos não aparece", () => {
    expect(hrefsDoMenu([])).not.toContain("/app/projetos");
  });

  it("Tarefas continua existindo no catálogo (hub do CRM e busca)", () => {
    expect(NAV_CATALOG.some((d) => d.href === "/app/tasks")).toBe(true);
  });
});
