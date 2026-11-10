"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

import { Card } from "@/components/ui/card";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { partesDoCorpo } from "@/lib/notifications/mentions";
import type { Note } from "@/lib/types/messaging";
import { Note as NoteIcon } from "@/lib/ui/icons";

import { NoteMedia } from "./NoteCard";

/**
 * Fork Converzon — AS NOTAS INTERNAS FIXADAS NO PAINEL DO CONTATO.
 *
 * A nota continua no fio da conversa, no ponto em que foi escrita (`NoteCard`).
 * Aqui ela aparece de novo, junta, logo abaixo do contato: quem atende usa a nota como
 * lembrete do paciente, e no fio ela some rolando para cima a cada mensagem nova.
 *
 * LÊ, NÃO BUSCA. Quem busca as notas (com a permissão `inbox.notes.view` e o
 * Realtime) é o fio, via `useConversationNotes`, na chave `["notes", id]`. Este
 * painel observa a MESMA chave com `enabled: false`: nota escrita agora aparece
 * aqui na hora, apagada no fio some daqui, e não nasce uma segunda requisição
 * nem uma segunda régua de permissão. Sem dado no cache (sem permissão, ou o fio
 * ainda carregando) a seção não aparece — dizer "nenhuma nota" ali seria afirmar
 * o que não se leu. Só leitura: apagar continua no fio, onde está o contexto.
 */
export function NotasInternasDoPainel({ conversationId }: { conversationId: string }) {
  const t = useT();
  const localeDaData = useLocaleDeData();
  const { data: notas } = useQuery({
    queryKey: ["notes", conversationId] as const,
    enabled: false,
    queryFn: () =>
      apiClient.get<{ data: Note[] }>(`/api/v1/conversations/${conversationId}/notes`),
    select: (res) => res.data,
  });

  if (!notas) return null;

  const maisNovasPrimeiro = [...notas].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <section data-testid="inbox-notas-internas">
      <h3 className="text-xs font-semibold text-text">{t("Notas internas")}</h3>
      {maisNovasPrimeiro.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {t("Nenhuma nota interna nesta conversa.")}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {maisNovasPrimeiro.map((nota) => (
            <li key={nota.id}>
              <NotaDoPainel
                nota={nota}
                quando={format(new Date(nota.created_at), "dd/MM HH:mm", { locale: localeDaData })}
                autorPadrao={t("Alguém")}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NotaDoPainel({
  nota,
  quando,
  autorPadrao,
}: {
  nota: Note;
  quando: string;
  autorPadrao: string;
}) {
  return (
    <Card className="border-warning/40 bg-warning-bg p-2.5 text-xs text-warning-fg">
      <div className="flex items-center justify-between gap-2 text-[11px] font-semibold opacity-80">
        <span className="flex min-w-0 items-center gap-1.5">
          <NoteIcon size={12} weight="fill" aria-hidden />
          <span className="truncate">{nota.created_by_name ?? autorPadrao}</span>
        </span>
        <span className="shrink-0 tabular-nums">{quando}</span>
      </div>
      <NoteMedia note={nota} />
      {/* Mesmo corte do fio (`NoteCard`): a menção gravada sai como `@Nome`. */}
      {nota.body && (
        <p className="mt-1 whitespace-pre-wrap wrap-anywhere leading-snug">
          {partesDoCorpo(nota.body).map((parte, i) =>
            parte.mencao ? (
              <span key={i} className="rounded-sm bg-warning/25 px-0.5 font-semibold">
                {`@${parte.mencao.nome}`}
              </span>
            ) : (
              <span key={i}>{parte.texto}</span>
            ),
          )}
        </p>
      )}
    </Card>
  );
}
