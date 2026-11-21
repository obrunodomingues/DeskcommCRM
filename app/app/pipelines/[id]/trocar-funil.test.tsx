import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PipelinePageClient } from "./_client";

// Polyfills que o Radix Select exige e o jsdom não tem (mesmo padrão de
// components/kanban/MoveToOtherPipelineDialog.test.tsx).
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
window.HTMLElement.prototype.setPointerCapture = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

/**
 * Troca rápida de funil no cabeçalho do quadro.
 *
 * O `h1` com o nome do funil vira o gatilho de um `Select` quando há mais de
 * um funil vivo: pular de funil sem voltar à lista. Com um funil só, `h1`
 * puro — seletor de uma opção é ruído permanente.
 */

const push = vi.fn();
const replace = vi.fn();
const estado = vi.hoisted(() => ({
  agencia: false,
  query: "",
  leads: [] as Array<{ id: string; contact_id: string; title: string; tags: string[]; contact_tags?: string[]; created_at: string }>,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push }),
  usePathname: () => "/app/pipelines/p-1",
  useSearchParams: () => new URLSearchParams(estado.query),
}));
vi.mock("@/hooks/kanban/useBoard", () => ({
  useBoard: () => ({
    data: {
      pipeline: { id: "p-1", name: "Vendas", vocabulary: null, settings: null },
      stages: [],
      leads: estado.leads,
    },
    isLoading: false,
    error: null,
    pulses: new Map(),
    realtimeStatus: "SUBSCRIBED",
    seguranca: { divergencias: 0, ultimaVerificacao: null },
  }),
}));
vi.mock("@/hooks/kanban/useBulkAction", () => ({
  useBulkAction: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useUser: () => ({ id: "u-1" }),
  useActiveOrg: () => ({ orgId: "org-1", role: "agent", capacidades_ligadas: estado.agencia ? ["converzon_agencia"] : [] }),
  useAuth: () => ({ activeOrg: { role: "agent" } }),
  usePermission: () => false,
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({
  useAssignableMembers: () => ({ data: [] }),
}));
vi.mock("@/hooks/kanban/useAssignableAgents", () => ({
  useAssignableAgents: () => ({ data: [] }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/kanban/NewLeadDialog", () => ({ NewLeadDialog: () => null }));
vi.mock("@/components/kanban/KanbanBoard", () => ({
  KanbanBoard: ({ leads }: { leads: typeof estado.leads }) => <div>{leads.map((lead) => <p key={lead.id}>{lead.title}</p>)}</div>,
}));
vi.mock("@/components/kanban/BulkActionBar", () => ({ BulkActionBar: () => null }));

const FUNIS = [
  { id: "p-1", name: "Vendas" },
  { id: "p-2", name: "Suporte" },
  { id: "p-3", name: "Parcerias" },
];

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  estado.query = "";
  estado.agencia = false;
  estado.leads = [];
});

describe("troca rápida de funil", () => {
  it("com um funil só, mostra o h1 e nenhum seletor", () => {
    render(
      <PipelinePageClient
        pipelineId="p-1"
        initialName="Vendas"
        role="admin"
        funis={[{ id: "p-1", name: "Vendas" }]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Vendas" })).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("com vários funis, o título vira seletor com os funis vivos", async () => {
    render(
      <PipelinePageClient pipelineId="p-1" initialName="Vendas" role="admin" funis={FUNIS} />,
    );

    // O h1 continua existindo para leitor de tela, escondido do olho.
    expect(screen.getByRole("heading", { name: "Vendas" })).toBeTruthy();

    const seletor = screen.getByRole("combobox", { name: "Trocar de funil: Vendas" });
    await userEvent.click(seletor);

    expect(await screen.findByRole("option", { name: "Vendas" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Suporte" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Parcerias" })).toBeTruthy();
  });

  it("escolher outro funil navega para o quadro dele, sem query string", async () => {
    render(
      <PipelinePageClient pipelineId="p-1" initialName="Vendas" role="admin" funis={FUNIS} />,
    );

    await userEvent.click(screen.getByRole("combobox", { name: "Trocar de funil: Vendas" }));
    await userEvent.click(await screen.findByRole("option", { name: "Suporte" }));

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/app/pipelines/p-2");
  });

  it("escolher o funil atual não navega", async () => {
    render(
      <PipelinePageClient pipelineId="p-1" initialName="Vendas" role="admin" funis={FUNIS} />,
    );

    await userEvent.click(screen.getByRole("combobox", { name: "Trocar de funil: Vendas" }));
    await userEvent.click(await screen.findByRole("option", { name: "Vendas" }));

    expect(push).not.toHaveBeenCalled();
  });
});

it("retira o contato marcado do quadro e mostra um card dele na aba Clientes", async () => {
  estado.agencia = true;
  estado.leads = [
    { id: "l-1", contact_id: "c-1", title: "Cliente", tags: [], contact_tags: ["cliente"], created_at: "2026-11-21T12:00:00Z" },
    { id: "l-2", contact_id: "c-1", title: "Card antigo do cliente", tags: [], contact_tags: ["cliente"], created_at: "2026-11-10T12:00:00Z" },
    { id: "l-3", contact_id: "c-2", title: "Oportunidade", tags: ["cliente"], created_at: "2026-11-20T12:00:00Z" },
  ];
  render(<PipelinePageClient pipelineId="p-1" initialName="Vendas" role="admin" funis={FUNIS.slice(0, 1)} />);
  expect(screen.getByText("Oportunidade")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Cliente" })).toBeNull();

  await userEvent.click(screen.getByRole("button", { name: "Clientes" }));
  expect(screen.getByRole("button", { name: "Cliente" })).toBeTruthy();
  expect(screen.queryByText("Card antigo do cliente")).toBeNull();
  expect(screen.queryByText("Oportunidade")).toBeNull();
});

it("escolhe o mês inteiro e um dia junto aos filtros do quadro", async () => {
  estado.agencia = true;
  estado.leads = [
    { id: "l-1", contact_id: "c-1", title: "Lead de outubro", tags: [], created_at: "2026-10-21T12:00:00Z" },
    { id: "l-2", contact_id: "c-2", title: "Lead de novembro", tags: [], created_at: "2026-11-02T12:00:00Z" },
  ];
  const tela = <PipelinePageClient pipelineId="p-1" initialName="Vendas" role="admin" funis={FUNIS.slice(0, 1)} />;
  const { rerender } = render(tela);
  expect(screen.getByText("Lead de outubro")).toBeTruthy();
  expect(screen.getByText("Lead de novembro")).toBeTruthy();

  await userEvent.click(screen.getByRole("combobox", { name: "Mês de entrada" }));
  await userEvent.click(await screen.findByRole("option", { name: "novembro de 2026" }));
  expect(replace).toHaveBeenLastCalledWith("/app/pipelines/p-1?entrada=2026-11", { scroll: false });
  estado.query = "entrada=2026-11";
  rerender(<PipelinePageClient pipelineId="p-1" initialName="Vendas" role="admin" funis={FUNIS.slice(0, 1)} />);
  expect(screen.queryByText("Lead de outubro")).toBeNull();
  expect(screen.getByText("Lead de novembro")).toBeTruthy();

  await userEvent.click(screen.getByRole("combobox", { name: "Dia de entrada" }));
  await userEvent.click(await screen.findByRole("option", { name: /^02$/ }));
  expect(replace).toHaveBeenLastCalledWith("/app/pipelines/p-1?entrada=2026-11-02", { scroll: false });
});
