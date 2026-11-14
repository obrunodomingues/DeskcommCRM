import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { visibleInboxTabs } from "@/components/inbox/InboxFilters";
import { tabToFilter } from "@/components/inbox/InboxLayout";
import { corDeQuemEnviou } from "@/components/inbox/MessageBubble";
import { COMANDOS_SEM_A_IA, ETIQUETA_DE_CLIENTE } from "@/lib/inbox/abas-converzon";
import { ordenarPorChegada } from "@/lib/kanban/ordem-da-coluna";

/**
 * FORK CONVERZON — as regras que o consultório pediu, presas por teste.
 * Ver converzon/README.md e lib/inbox/abas-converzon.ts.
 */
describe("inbox do consultório", () => {
  it("mostra Todas primeiro, depois Novas, Aguardando e Clientes, e o passado no fim", () => {
    expect(visibleInboxTabs("admin", "all")).toEqual([
      "all",
      "novas",
      "aguardando_resposta",
      "clientes",
      "closed",
      "archived",
    ]);
  });

  it("Clientes pede só a etiqueta do contato, sem status: a conversa nunca sai da aba", () => {
    expect(tabToFilter("clientes")).toEqual({ cliente: true });
    expect(ETIQUETA_DE_CLIENTE).toBe("cliente");
  });

  it("lista e contagem da aba Clientes leem o mesmo campo, com a mesma etiqueta", () => {
    // O badge tem de contar o que a aba mostra: os dois lados pedem
    // `tags_do_contato` contendo ETIQUETA_DE_CLIENTE, e nada mais.
    const lista = readFileSync("app/api/v1/conversations/_handler.ts", "utf8");
    const contagem = readFileSync("app/api/v1/conversations/counts/route.ts", "utf8");
    const predicado = 'contains("tags_do_contato", [ETIQUETA_DE_CLIENTE])';
    expect(lista).toContain(`if (q.cliente) query = query.${predicado}`);
    expect(contagem).toContain(`countExact().${predicado}`);
  });

  it("marcar cliente também desliga a IA (o mesmo par do sempre atendimento humano)", () => {
    const rota = readFileSync("app/api/v1/converzon/clientes/[id]/route.ts", "utf8");
    expect(rota).toContain("ai_opt_out: true, force_human: true");
    expect(rota).toContain('requireRole("manager"');
  });

  it("Novas mensagens pede o que está sem resposta, aberto e fora de grupo", () => {
    expect(tabToFilter("novas")).toEqual({
      sem_resposta: true,
      exclude_finished: true,
      is_group: false,
    });
  });

  it("Aguardando resposta é o mesmo recorte, só onde a IA saiu", () => {
    expect(tabToFilter("aguardando_resposta")).toEqual({
      sem_resposta: true,
      exclude_finished: true,
      is_group: false,
      comando: COMANDOS_SEM_A_IA,
    });
    expect(COMANDOS_SEM_A_IA).toEqual(["aguardando", "humano"]);
  });

  it("Todas não filtra nada", () => {
    expect(tabToFilter("all")).toEqual({});
  });
});

describe("cor do balão por quem respondeu", () => {
  it("celular é azul, IA é roxo, CRM fica na cor da marca", () => {
    expect(corDeQuemEnviou("external_device")).toContain("#2563eb");
    expect(corDeQuemEnviou("ai")).toContain("#7c3aed");
    expect(corDeQuemEnviou("user")).toBeUndefined();
    expect(corDeQuemEnviou("crm")).toBeUndefined();
    expect(corDeQuemEnviou(null)).toBeUndefined();
  });
});

describe("ordem dos cards na coluna do funil", () => {
  it("põe quem chegou por último na coluna em cima", () => {
    const leads = [
      { id: "a", stage_changed_at: "2026-11-01T10:00:00Z", created_at: "2026-10-01T10:00:00Z" },
      { id: "b", stage_changed_at: "2026-11-05T10:00:00Z", created_at: "2026-10-02T10:00:00Z" },
      { id: "c", stage_changed_at: "2026-11-03T10:00:00Z", created_at: "2026-10-03T10:00:00Z" },
    ];
    expect(ordenarPorChegada(leads).map((l) => l.id)).toEqual(["b", "c", "a"]);
  });

  it("sem stage_changed_at usa a criação, e empate desempata pelo id", () => {
    const leads = [
      { id: "a", stage_changed_at: null, created_at: "2026-11-02T10:00:00Z" },
      { id: "c", stage_changed_at: "2026-11-02T10:00:00Z", created_at: "2026-10-01T10:00:00Z" },
      { id: "b", stage_changed_at: "2026-11-02T10:00:00Z", created_at: "2026-10-01T10:00:00Z" },
    ];
    expect(ordenarPorChegada(leads).map((l) => l.id)).toEqual(["c", "b", "a"]);
  });

  it("não mexe na lista recebida", () => {
    const leads = [
      { id: "a", stage_changed_at: "2026-11-01T10:00:00Z" },
      { id: "b", stage_changed_at: "2026-11-05T10:00:00Z" },
    ];
    ordenarPorChegada(leads);
    expect(leads.map((l) => l.id)).toEqual(["a", "b"]);
  });
});
