/**
 * Fork Converzon — horário do agente diferente num dia da semana (`por_dia`).
 *
 * O pedido do consultório: a IA atende seg–sex 08:00–18:00 e sábado só
 * 08:00–13:00. A janela padrão vale para os dias marcados; `por_dia` troca a
 * faixa de um dia. Faixa torta em `por_dia` é ignorada (o dia volta à padrão),
 * nunca derruba a janela inteira.
 */
import { describe, expect, it } from "vitest";

import {
  inicioDoPeriodoFechado,
  lerJanelaDeAtendimento,
  msAteAJanelaAbrir,
} from "@/lib/agent-engine/agent/janela-de-atendimento";

const config = (porDia: unknown) => ({
  filters: {
    business_hours: {
      timezone: "America/Sao_Paulo",
      start: "08:00",
      end: "18:00",
      weekdays: [1, 2, 3, 4, 5, 6],
      por_dia: porDia,
    },
  },
});

// 21/11/2026 é sábado; 23/11/2026 é segunda. Horário de Brasília = UTC-3.
const emBrasilia = (iso: string) => new Date(`${iso}-03:00`);

describe("janela com horário próprio no sábado", () => {
  const janela = lerJanelaDeAtendimento(config({ "6": { start: "08:00", end: "13:00" } }))!;

  it("lê a faixa do sábado", () => {
    expect(janela.por_dia).toEqual({ 6: { start: "08:00", end: "13:00" } });
  });

  it("sábado 12:30 está aberto; 13:30 está fechado e abre na segunda às 08:00", () => {
    expect(msAteAJanelaAbrir(janela, emBrasilia("2026-11-21T12:30:00"))).toBeNull();
    const ms = msAteAJanelaAbrir(janela, emBrasilia("2026-11-21T13:30:00"));
    // sábado 13:30 → segunda 08:00 = 1 dia (domingo inteiro) + 10h30 + 8h = 42h30
    expect(ms).toBe((42 * 60 + 30) * 60_000);
  });

  it("os outros dias seguem a faixa padrão (segunda 17:00 aberto)", () => {
    expect(msAteAJanelaAbrir(janela, emBrasilia("2026-11-23T17:00:00"))).toBeNull();
  });

  it("o período fechado do sábado começa às 13:00, não às 18:00", () => {
    const inicio = inicioDoPeriodoFechado(janela, emBrasilia("2026-11-21T15:00:00"));
    expect(inicio?.toISOString()).toBe(emBrasilia("2026-11-21T13:00:00").toISOString());
  });

  it("faixa torta no por_dia é ignorada: o dia usa a padrão", () => {
    const torta = lerJanelaDeAtendimento(config({ "6": { start: "13:00", end: "08:00" }, "9": { start: "08:00", end: "09:00" } }))!;
    expect(torta.por_dia).toBeUndefined();
    expect(msAteAJanelaAbrir(torta, emBrasilia("2026-11-21T17:00:00"))).toBeNull();
  });

  it("sem por_dia, nada muda", () => {
    const simples = lerJanelaDeAtendimento(config(undefined))!;
    expect(simples.por_dia).toBeUndefined();
    expect(msAteAJanelaAbrir(simples, emBrasilia("2026-11-21T17:00:00"))).toBeNull();
  });
});
