import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConversationHeader } from "@/components/inbox/ConversationHeader";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

/**
 * Fork Converzon: o cabeçalho da conversa no CONSULTÓRIO (capacidade
 * `converzon_consultorio`, posta pelo layout quando não há CONVERZON_PERFIL).
 *
 * Quem atende sozinho não usa Liberar, Transferir nem Lembrar, e entende
 * "Devolver para IA" melhor que "Devolver ao automático". Na agência (sem a
 * capacidade) o cabeçalho segue o do produto.
 */

const capacidades = vi.hoisted(() => ({ atual: [] as string[] }));

vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "u1", support: null, is_platform_admin: false },
    activeOrg: { orgId: "org-1", role: "owner", capacidades_ligadas: capacidades.atual },
  }),
}));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({
  useClaimConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useReleaseConversation", () => ({
  useReleaseConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useCloseConversation", () => ({
  useCloseConversation: () => ({ mutate: vi.fn(), isPending: false }),
  useReopenConversation: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useResumeAiAttendance", () => ({
  useResumeAiAttendance: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/usePauseAiAttendance", () => ({
  usePauseAiAttendance: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/ai/useAutomaticoAtivo", () => ({
  useAutomaticoAtivo: () => ({ data: true }),
}));
vi.mock("@/hooks/contacts/usePersonalContact", () => ({
  useMarkPersonalContact: () => ({ mutate: vi.fn(), isPending: false }),
  useUnmarkPersonalContact: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/contacts/useCarteiraDoContato", () => ({
  useCarteiraDoContato: () => ({ data: { dono_user_id: null }, isLoading: false }),
  useDefinirCarteira: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({
  useAssignableMembers: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/components/kanban/OwnerBadge", () => ({ OwnerBadge: () => null }));
vi.mock("@/components/inbox/ReassignDialog", () => ({ ReassignDialog: () => null }));
vi.mock("@/components/inbox/SnoozeButton", () => ({
  SnoozeButton: () => <span data-testid="botao-lembrar" />,
}));
vi.mock("@/components/inbox/JanelaSelo", () => ({ JanelaSelo: () => null }));
vi.mock("@/components/inbox/AcoesConverzonDaConversa", () => ({ AcoesConverzonDaConversa: () => null }));
vi.mock("@/components/inbox/ChannelLogo", () => ({ ChannelLogo: () => null }));
vi.mock("@/hooks/voice/useVoiceSessionStatus", () => ({
  useVoiceSessionStatus: () => ({ data: { configured: true, paired: true } }),
}));
vi.mock("@/components/voice/VoiceCallContext", () => ({
  useVoiceCall: () => ({ call: null, startCall: vi.fn() }),
}));

/** Minha, com o automático calado: o estado em que Liberar e a volta aparecem juntos. */
function conversaMinhaComAutomaticoCalado(): ConversationWithContact {
  return {
    id: "conv-1",
    organization_id: "org-1",
    contact_id: "contato-1",
    channel_session_id: "sess-1",
    channel: "whatsapp",
    status: "open",
    status_changed_at: new Date().toISOString(),
    service_revision: 3,
    assigned_to_user_id: "u1",
    assigned_to_user_name: "Eu",
    assignee_kind: "user",
    assigned_at: new Date().toISOString(),
    bot_silenced_until: new Date(Date.now() + 10 * 60_000).toISOString(),
    last_inbound_at: null,
    last_outbound_at: null,
    last_message_at: null,
    last_message_preview: null,
    unread_count_for_assignee: 0,
    is_group: false,
    group_chat_id: null,
    tags: [],
    metadata: {},
    snooze_until: null,
    contacts: {
      id: "contato-1",
      display_name: "Paciente",
      name: "Paciente",
      phone_number: "+5511999999999",
      tags: [],
      is_blocked: false,
      is_personal: false,
      is_anonymized: false,
    },
    channel_sessions: null,
  } as unknown as ConversationWithContact;
}

beforeEach(() => {
  capacidades.atual = [];
});

describe("cabeçalho da conversa no consultório (fork Converzon)", () => {
  it("consultório: sem Liberar, Transferir e Lembrar, e a volta diz 'Devolver para IA'", () => {
    capacidades.atual = ["converzon_consultorio"];
    render(<ConversationHeader conversation={conversaMinhaComAutomaticoCalado()} />);
    expect(screen.queryByRole("button", { name: "Liberar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Transferir" })).toBeNull();
    expect(screen.queryByTestId("botao-lembrar")).toBeNull();
    expect(screen.getByTestId("devolver-ao-automatico").textContent).toContain("Devolver para IA");
  });

  it("agência: o cabeçalho continua o do produto", () => {
    capacidades.atual = ["converzon_agencia"];
    render(<ConversationHeader conversation={conversaMinhaComAutomaticoCalado()} />);
    expect(screen.getByRole("button", { name: "Liberar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Transferir" })).toBeTruthy();
    expect(screen.getByTestId("botao-lembrar")).toBeTruthy();
    expect(screen.getByTestId("devolver-ao-automatico").textContent).toContain("Devolver ao automático");
  });

  it("agência em que uma pessoa só atende: o mesmo cabeçalho enxuto do consultório", () => {
    capacidades.atual = ["converzon_agencia", "converzon_atende_sozinho"];
    render(<ConversationHeader conversation={conversaMinhaComAutomaticoCalado()} />);
    expect(screen.queryByRole("button", { name: "Liberar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Transferir" })).toBeNull();
    expect(screen.queryByTestId("botao-lembrar")).toBeNull();
    expect(screen.getByTestId("devolver-ao-automatico").textContent).toContain("Devolver para IA");
  });
});
