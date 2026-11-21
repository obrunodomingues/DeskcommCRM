import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  send: vi.fn(),
  wait: vi.fn<(ms: number) => Promise<void>>(),
  authorize: vi.fn(),
  statuses: new Map<string, string>(),
  active: false,
  result: null as { resposta: { enviados: number }; status: number } | null,
  personal: false,
  alreadyAnswered: false,
}));

vi.mock("node:timers/promises", () => ({
  default: { setTimeout: mock.wait },
  setTimeout: mock.wait,
}));
vi.mock("@/lib/converzon/perfil-servidor", () => ({ instalacaoDeAgencia: () => true }));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({ ok: true, user: { id: "operador" }, org: { orgId: "org", role: "manager" } }),
}));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/app/api/v1/messages/_handler", () => ({ sendMessageHandler: mock.send }));
vi.mock("@/lib/ai/elegibilidade/autorizacao", () => ({ autorizarContatoParaIA: mock.authorize }));
vi.mock("@/lib/api/idempotency", () => ({
  comIdempotencia: async ({ executar }: { executar: () => Promise<NonNullable<typeof mock.result>> }) => {
    if (mock.result) return { tipo: "replay", ...mock.result };
    if (mock.active) return { tipo: "em_curso" };
    mock.active = true;
    try {
      mock.result = await executar();
      return { tipo: "executou", ...mock.result };
    } finally {
      mock.active = false;
    }
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      let outbound = false;
      const reply = () => ({
        data: table === "conversations"
          ? { contact_id: "contact", channel: "whatsapp", is_group: false, status: "open",
              channel_session_id: "channel", last_inbound_at: null }
          : table === "channel_sessions"
            ? { provider: "waha" }
            : table === "contacts"
            ? { name: "Lead Exemplo", is_personal: mock.personal }
            : table === "crm_leads"
              ? [
                  { custom_fields: {}, source_metadata: {} },
                  { custom_fields: { segmento: "imóveis", ja_possui_site: "Não tenho", objetivo_principal: "Gerar mais leads" },
                    source_metadata: { nome_declarado: "Maria Exemplo" } },
                ]
              : outbound
                ? mock.alreadyAnswered ? [{ id: "other" }] : []
                : [...mock.statuses].map(([id, status]) => ({ id, status })),
        error: null,
      });
      const chain = {
        select: () => chain,
        eq: (key: string) => {
          if (key === "direction") outbound = true;
          return chain;
        },
        in: () => chain,
        not: () => chain,
        is: () => chain,
        limit: () => chain,
        order: () => chain,
        maybeSingle: async () => reply(),
        then: (resolve: (value: ReturnType<typeof reply>) => void) => resolve(reply()),
      };
      return chain;
    },
  }),
}));

import { POST } from "./route";

const req = new Request("https://example.invalid", { method: "POST" }) as NextRequest;
const ctx = { params: Promise.resolve({ id: "24871f80-a9f4-4c1e-8f05-8cf6dcb588b8" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mock.statuses.clear();
  mock.result = null;
  mock.active = false;
  mock.personal = false;
  mock.alreadyAnswered = false;
  mock.wait.mockReset().mockResolvedValue(undefined);
  mock.send.mockImplementation(async (_db, options: { internalMessageId: string }) => {
    mock.statuses.set(options.internalMessageId, "sent");
    return { status: "sent" };
  });
});

describe("botão Enviar 1º atendimento", () => {
  it("envia os três blocos em ordem, registra a continuação e ignora repetição do clique", async () => {
    expect((await POST(req, ctx)).status).toBe(200);
    expect((await POST(req, ctx)).status).toBe(200);
    expect(mock.send.mock.calls.map((call) => call[2].metadata.converzon_primeiro_atendimento)).toEqual([1, 2, 3]);
    expect(mock.wait.mock.calls).toEqual([[6_000], [9_000]]);
    expect(mock.wait.mock.invocationCallOrder[0]).toBeGreaterThan(mock.send.mock.invocationCallOrder[0]!);
    expect(mock.wait.mock.invocationCallOrder[0]).toBeLessThan(mock.send.mock.invocationCallOrder[1]!);
    expect(mock.wait.mock.invocationCallOrder[1]).toBeGreaterThan(mock.send.mock.invocationCallOrder[1]!);
    expect(mock.wait.mock.invocationCallOrder[1]).toBeLessThan(mock.send.mock.invocationCallOrder[2]!);
    expect(mock.send.mock.calls[0]?.[2]?.body).toContain("Maria! Aqui é o Bruno da Converzon, prazer!\nRecebi seu cadastro: trabalha com imóveis, não tem site e busca gerar mais leads.");
    expect(mock.authorize).toHaveBeenCalledTimes(1);
    expect(mock.send.mock.calls[0]?.[1]?.actor.type).toBe("user");
  });

  it("retoma do bloco pendente quando o envio anterior parou no meio", async () => {
    mock.send.mockImplementationOnce(async (_db, options: { internalMessageId: string }) => {
      mock.statuses.set(options.internalMessageId, "sent");
      return { status: "sent" };
    }).mockRejectedValueOnce(new Error("conexão interrompida"));
    expect((await POST(req, ctx)).status).toBe(500);
    expect(mock.authorize).not.toHaveBeenCalled();
    expect((await POST(req, ctx)).status).toBe(200);
    expect(mock.send.mock.calls.map((call) => call[2].metadata.converzon_primeiro_atendimento)).toEqual([1, 2, 2, 3]);
  });

  it("confere se houve outro atendimento durante a pausa antes de enviar o próximo bloco", async () => {
    mock.wait.mockImplementationOnce(async () => { mock.alreadyAnswered = true; });
    expect((await POST(req, ctx)).status).toBe(409);
    expect(mock.send).toHaveBeenCalledTimes(1);
    expect(mock.authorize).not.toHaveBeenCalled();
  });

  it("evita uma segunda abordagem quando houve outra resposta ou a conversa é pessoal", async () => {
    mock.alreadyAnswered = true;
    expect((await POST(req, ctx)).status).toBe(409);
    mock.alreadyAnswered = false;
    mock.personal = true;
    expect((await POST(req, ctx)).status).toBe(409);
    expect(mock.send).not.toHaveBeenCalled();
  });
});
