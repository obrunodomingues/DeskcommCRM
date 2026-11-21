import { describe, expect, it } from "vitest";

import { linksDoPortfolio, montarPrimeiroAtendimento, respostasDeclaradas } from "./primeiro-atendimento";

describe("primeiro atendimento da Converzon", () => {
  it("usa o horário de Brasília e as seis respostas do cadastro, inclusive no formato antigo", () => {
    const antigos = {
      "Já possui site": "Não tenho",
      Segmento: "Imóveis",
      "Objetivo principal": "Vender de forma online",
      "Quando pretende começar": "Esse mês",
      Investimento: "Ainda não sei",
      "Instagram ou site": "@exemplo",
    };
    expect(respostasDeclaradas(antigos)).toHaveLength(6);
    const [abertura, prova, convite] = montarPrimeiroAtendimento("Joana Exemplo", antigos, new Date("2026-11-21T11:00:00Z"));
    expect(abertura).toBe("Bom dia, Joana! Aqui é o Bruno da Converzon, prazer!\nRecebi seu cadastro: trabalha com imóveis, não tem site e tem como foco vender de forma online.");
    expect(prova).toContain("https://ronaldocarvalhocorretordeimoveis.com/");
    expect(prova.match(/https:\/\//g)).toHaveLength(3);
    expect(convite).toContain("site, CRM e agente de IA");
    expect(convite).toContain("tráfego pago e da criação de conteúdo");
    expect(convite.split("\n")).toHaveLength(2);
  });

  it("diz Boa tarde e Boa noite nos limites do relógio de Brasília", () => {
    const abrir = (hora: string) => montarPrimeiroAtendimento("Ana", {}, new Date(hora))[0];
    expect(abrir("2026-11-21T15:00:00Z")).toMatch(/^Boa tarde, Ana!/);
    expect(abrir("2026-11-21T21:00:00Z")).toMatch(/^Boa noite, Ana!/);
  });

  it("usa a resposta nova em vez do rótulo legado e encaixa profissão sem inferir pelo nome", () => {
    const [abertura] = montarPrimeiroAtendimento("Lia", {
      segmento: "Arquiteta", Segmento: "Advocacia", ja_possui_site: "Sim",
    }, new Date("2026-11-21T11:00:00Z"));
    expect(abertura).toContain("é arquiteta e já tem site");
    expect(abertura).not.toContain("Advocacia");
    expect(linksDoPortfolio("arquiteta")[0]).toBe("https://ht-arquitetura.com/");
  });

  it("usa uma abertura de WhatsApp quando não há formulário nem nome confiável", () => {
    const [abertura] = montarPrimeiroAtendimento("+5535999990000", {}, new Date("2026-11-21T11:00:00Z"));
    expect(abertura).toBe("Bom dia! Aqui é o Bruno da Converzon, prazer!\nRecebi sua mensagem.");
  });
});
