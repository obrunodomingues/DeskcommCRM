/**
 * Fork Converzon — a tela "Início" (app/app/inicio).
 *
 * As contas puras do resumo (lib/converzon/inicio.ts) e o lugar da tela no
 * menu: primeiro item de Atendimento e a tela que abre ao entrar, sem passar
 * do teto de 15 itens do menu lateral.
 */
import { describe, expect, it } from "vitest";

import {
  caminhoDaTendencia,
  contarPorEtapa,
  escolherFunil,
  haQuantoTempo,
  iniciais,
  larguraDaBarra,
  nomeDaSaudacao,
  nomeDoContato,
  saudacao,
} from "@/lib/converzon/inicio";
import { NAV_CATALOG } from "@/lib/navigation/catalogo";
import { homeDaInterface } from "@/lib/navigation/interface";

describe("Início — contas do resumo", () => {
  it("saudação pela hora do dia", () => {
    expect(saudacao(8)).toBe("Bom dia");
    expect(saudacao(11)).toBe("Bom dia");
    expect(saudacao(12)).toBe("Boa tarde");
    expect(saudacao(17)).toBe("Boa tarde");
    expect(saudacao(18)).toBe("Boa noite");
    expect(saudacao(2)).toBe("Boa noite");
  });

  it("nome da saudação: título + primeiro nome, ou só o primeiro nome", () => {
    expect(nomeDaSaudacao("Dr. João Silva")).toBe("Dr. João");
    expect(nomeDaSaudacao("dra Ana Souza")).toBe("dra Ana");
    expect(nomeDaSaudacao("Ana Paula Souza")).toBe("Ana");
    expect(nomeDaSaudacao("  ")).toBe("");
    expect(nomeDaSaudacao(null)).toBe("");
  });

  it("nome do contato na ordem do WhatsApp, com reserva", () => {
    expect(nomeDoContato({ display_name: "Ana", name: "Ana Paula" })).toBe("Ana");
    expect(nomeDoContato({ display_name: " ", name: "Ana Paula" })).toBe("Ana Paula");
    expect(nomeDoContato({ phone_number: "+5561999990000" })).toBe("+5561999990000");
    expect(nomeDoContato(null)).toBe("Contato");
  });

  it("iniciais do primeiro e do último nome", () => {
    expect(iniciais("Ana Paula Rocha")).toBe("AR");
    expect(iniciais("juliana")).toBe("J");
    expect(iniciais("+55 61 9999")).toBe("?");
  });

  it("há quanto tempo, com o molde traduzível", () => {
    const agora = Date.parse("2026-11-12T15:00:00Z");
    expect(haQuantoTempo("2026-11-12T14:59:40Z", agora)).toBe("agora");
    expect(haQuantoTempo("2026-11-12T14:45:00Z", agora)).toBe("há 15 min");
    expect(haQuantoTempo("2026-11-12T12:00:00Z", agora)).toBe("há 3 h");
    expect(haQuantoTempo("2026-11-11T14:00:00Z", agora)).toBe("há 1 dia");
    expect(haQuantoTempo("2026-11-08T15:00:00Z", agora)).toBe("há 4 dias");
    expect(haQuantoTempo("2026-11-12T14:45:00Z", agora, (s) => s.replace("há", "hace"))).toBe("hace 15 min");
  });

  it("conta os leads em aberto por etapa, sem ganho nem perda, na ordem das etapas", () => {
    const etapas = [
      { id: "a", name: "Novo" },
      { id: "b", name: "Em contato" },
      { id: "g", name: "Ganho", is_won: true },
      { id: "p", name: "Perdido", is_lost: true },
    ];
    const leads = [{ stage_id: "a" }, { stage_id: "a" }, { stage_id: "b" }, { stage_id: "g" }, { stage_id: null }];
    expect(contarPorEtapa(etapas, leads)).toEqual([
      { nome: "Novo", abertos: 2 },
      { nome: "Em contato", abertos: 1 },
    ]);
  });

  it("escolhe o funil padrão; sem padrão, o primeiro por posição", () => {
    expect(escolherFunil([{ id: "x", position: 2 }, { id: "y", position: 1, is_default: true }])?.id).toBe("y");
    expect(escolherFunil([{ id: "x", position: 2 }, { id: "y", position: 1 }])?.id).toBe("y");
    expect(escolherFunil([])).toBeNull();
  });

  it("barra em % da maior, com um mínimo visível para quem não é zero", () => {
    expect(larguraDaBarra(10, 10)).toBe(100);
    expect(larguraDaBarra(1, 100)).toBe(4);
    expect(larguraDaBarra(0, 10)).toBe(0);
    expect(larguraDaBarra(3, 0)).toBe(0);
  });

  it("linha de tendência: vazia com menos de 2 pontos, senão um caminho que cabe no quadro", () => {
    expect(caminhoDaTendencia([5])).toBe("");
    const c = caminhoDaTendencia([1, 3, 2]);
    expect(c.startsWith("M0.0 37.0")).toBe(true);
    expect(c).toContain("L200.0");
  });
});

describe("Início — lugar no menu", () => {
  it("é o primeiro item de Atendimento e aparece no menu lateral, para qualquer papel", () => {
    const doGrupo = NAV_CATALOG.filter((d) => d.group === "atendimento");
    expect(doGrupo[0]?.href).toBe("/app/inicio");
    const inicio = NAV_CATALOG.find((d) => d.href === "/app/inicio");
    expect(inicio?.sidebar).toBe(true);
    expect(inicio && "minRole" in inicio ? inicio.minRole : undefined).toBeUndefined();
  });

  it("Meta Ads saiu do menu lateral (continua no hub de Análise) para o teto de 15 caber", () => {
    const meta = NAV_CATALOG.find((d) => d.href === "/app/ads/meta");
    expect(meta).toBeDefined();
    expect(meta && "sidebar" in meta ? meta.sidebar : undefined).toBeFalsy();
  });

  it("abre primeiro quando está no menu da pessoa; sem ele, continua o WhatsApp", () => {
    expect(homeDaInterface(undefined, false, "agent")).toBe("/app/inicio");
    expect(homeDaInterface({ preset: "completa", destinos: ["/app/inbox", "/app/agenda"] }, false, "admin")).toBe("/app/inbox");
  });
});
