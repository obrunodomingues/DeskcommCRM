/**
 * Fork Converzon — o visual do consultório (app/converzon.css).
 *
 * A barra lateral usa o tema OPOSTO ao da página. Ela só fica certa se os dois
 * blocos de tema do fork declararem o MESMO conjunto de variáveis e cobrirem
 * tudo o que o tema escuro do produto declara: a variável que faltar num bloco
 * chega à barra herdada da página (cor do tema errado) ou do produto (a paleta
 * Sage). Estes testes leem os arquivos, como as outras cercas de tema do repo.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const leia = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");
const semComentario = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Blocos `seletor { corpo }` de primeiro nível (o CSS do fork não aninha). */
function blocos(css: string): { seletor: string; props: Set<string> }[] {
  const saida: { seletor: string; props: Set<string> }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of semComentario(css).matchAll(re)) {
    const corpo = m[2] ?? "";
    const props = new Set([...corpo.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((p) => p[1] ?? ""));
    saida.push({ seletor: (m[1] ?? "").trim().replace(/\s+/g, " "), props });
  }
  return saida;
}

const FORK = blocos(leia("app/converzon.css"));
const claro = FORK.find((b) => b.seletor.startsWith(":root:root:root, "));
const escuro = FORK.find((b) => b.seletor.startsWith(':root:root:root[data-theme="dark"], '));

describe("visual do consultório — tokens", () => {
  it("existem os dois blocos, e cada um alcança a barra invertida", () => {
    expect(claro?.seletor).toContain(':root:root:root[data-theme="dark"] [data-lado-invertido]');
    expect(escuro?.seletor).toContain(':root:root:root:not([data-theme="dark"]) [data-lado-invertido]');
  });

  it("claro e escuro declaram exatamente as mesmas variáveis", () => {
    expect([...(claro?.props ?? [])].sort()).toEqual([...(escuro?.props ?? [])].sort());
    expect(claro?.props.size).toBeGreaterThan(60);
  });

  it("redeclaram as pontes, que se resolvem onde são declaradas", () => {
    for (const p of ["--background", "--foreground", "--card", "--popover", "--primary", "--muted", "--border", "--ring"]) {
      expect(claro?.props.has(p), p).toBe(true);
    }
  });

  it("cobrem tudo o que o tema escuro do produto declara", () => {
    const produto = blocos(leia("app/globals.css")).find((b) => b.seletor === '[data-theme="dark"]');
    expect(produto, "não achei o bloco [data-theme=\"dark\"] no globals.css").toBeDefined();
    const faltando = [...(produto?.props ?? [])].filter((p) => !escuro?.props.has(p));
    expect(faltando).toEqual([]);
  });
});

describe("visual do consultório — ligações", () => {
  it("o layout carrega o converzon.css DEPOIS do globals.css", () => {
    const layout = leia("app/layout.tsx");
    const global = layout.indexOf('import "./globals.css"');
    const fork = layout.indexOf('import "./converzon.css"');
    expect(global).toBeGreaterThan(-1);
    expect(fork).toBeGreaterThan(global);
  });

  it("a Inter é declarada pelo next/font e o arquivo existe", () => {
    expect(leia("app/layout.tsx")).toContain('"--font-converzon"');
    expect(existsSync(join(RAIZ, "app/fonts/inter-100-900-latin.woff2"))).toBe(true);
    expect(leia("app/converzon.css")).toMatch(/--font-atkinson:\s*var\(--font-converzon\)/);
  });

  it("a barra lateral, a da tela grande e a do celular, carrega a marca da inversão", () => {
    expect(leia("components/shell/Sidebar.tsx")).toContain("data-lado-invertido");
    expect(leia("components/shell/MobileSidebar.tsx")).toContain("data-lado-invertido");
  });

  it("a variante `dark:` acompanha a barra invertida", () => {
    const variante = leia("app/globals.css").match(/@custom-variant dark \((.*)\);/)?.[1] ?? "";
    expect(variante).toContain('[data-theme="dark"] *:not([data-lado-invertido], [data-lado-invertido] *)');
    expect(variante).toContain(':root:not([data-theme="dark"]) [data-lado-invertido] *');
  });
});
