import { describe, expect, it } from "vitest";

import { montarLembrete } from "@/app/api/v1/cron/agenda-reminder/route";
import { ordenarPorChegada, ordenarPorPosicao } from "@/lib/kanban/ordem-da-coluna";
import { sidebarGroups } from "@/lib/navigation/registry";

/**
 * Fork Converzon — pedidos do consultório de 19/11/2026:
 *
 * - menu: Funil, Tarefas, Contatos e Métricas do site sobem para o lugar de
 *   Respostas rápidas (só com `converzon_consultorio`);
 * - funil: só a coluna Novo sai por chegada, as outras pela ordem manual;
 * - lembrete: `{{link}}` traz o link do Meet da teleconsulta.
 */

const hrefs = (grupos: ReturnType<typeof sidebarGroups>) =>
  grupos.flatMap((g) => g.items.map((d) => d.href));

describe("menu do consultório", () => {
  const produto = sidebarGroups(true, null, undefined, undefined, []);
  const consultorio = sidebarGroups(true, null, undefined, undefined, ["converzon_consultorio"]);

  it("só reordena: as mesmas portas, nenhuma a mais nem a menos", () => {
    expect([...hrefs(consultorio)].sort()).toEqual([...hrefs(produto)].sort());
  });

  it("Funil, Tarefas e Contatos sobem para o primeiro grupo, antes de Respostas rápidas", () => {
    const primeiro = consultorio[0]!.items.map((d) => d.href);
    const sobem = ["/app/kanban", "/app/tasks", "/app/contacts"].filter((h) => hrefs(produto).includes(h));
    expect(sobem.length).toBeGreaterThan(0);
    const posicoes = sobem.map((h) => primeiro.indexOf(h));
    expect(posicoes.every((i) => i >= 0)).toBe(true);
    expect([...posicoes].sort((a, b) => a - b)).toEqual(posicoes);
    const respostas = primeiro.indexOf("/app/templates");
    if (respostas >= 0) expect(Math.max(...posicoes)).toBeLessThan(respostas);
  });

  it("sem a capacidade, o menu segue o do produto", () => {
    const agencia = sidebarGroups(true, null, undefined, undefined, ["converzon_agencia"]);
    expect(agencia[0]!.items.map((d) => d.href)).not.toContain("/app/kanban");
    expect(produto[0]!.items.map((d) => d.href)).not.toContain("/app/kanban");
  });
});

describe("ordem das colunas do funil", () => {
  const cards = [
    { id: "a", position_in_stage: 3000, stage_changed_at: "2026-11-19T10:00:00Z" },
    { id: "b", position_in_stage: 1000, stage_changed_at: "2026-11-18T10:00:00Z" },
    { id: "c", position_in_stage: 2000, stage_changed_at: "2026-11-17T10:00:00Z" },
    { id: "d", position_in_stage: 2000, stage_changed_at: "2026-11-16T10:00:00Z" },
  ];

  it("ordem manual: posição crescente, empate pelo id", () => {
    expect(ordenarPorPosicao(cards).map((c) => c.id)).toEqual(["b", "c", "d", "a"]);
  });

  it("por chegada: o mais recente em cima", () => {
    expect(ordenarPorChegada(cards).map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("lembrete com o link do Meet", () => {
  const base = {
    nomeDoContato: "Maria Souza",
    titulo: "Teleconsulta",
    quando: new Date("2026-11-27T17:00:00Z"),
    timezone: "America/Sao_Paulo",
    local: null,
    molde: "Olá, {{primeiro_nome}}! Link: {{link}}",
  };

  it("{{link}} vira o link da reunião", () => {
    expect(montarLembrete({ ...base, link: "https://meet.google.com/abc-defg-hij" })).toBe(
      "Olá, Maria! Link: https://meet.google.com/abc-defg-hij",
    );
  });

  it("sem link pronto, {{link}} sai vazio em vez de ficar no texto", () => {
    expect(montarLembrete(base)).toBe("Olá, Maria! Link: ");
  });
});
