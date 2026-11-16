"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { roleAtLeast } from "@/lib/auth/types";
import { ETIQUETA_DE_CLIENTE } from "@/lib/inbox/abas-converzon";
import { CheckCircle } from "@/lib/ui/icons";

/**
 * FORK CONVERZON — o botão "Marcar como cliente" do card do contato no inbox.
 *
 * Marcar põe a etiqueta `cliente` no contato (as conversas dele passam a morar na
 * aba Clientes) e desliga a IA para ele. Desmarcar existe para corrigir um clique
 * errado. A regra das duas pontas está em app/api/v1/converzon/clientes/[id].
 *
 * Só gerente para cima vê o botão: é o mesmo papel que a rota exige.
 */
export function MarcarComoCliente({
  contactId,
  tags,
  disabled = false,
}: {
  contactId: string;
  tags: readonly string[];
  disabled?: boolean;
}) {
  const t = useT();
  const { activeOrg } = useAuth();
  const qc = useQueryClient();
  const [confirmar, setConfirmar] = useState(false);
  const ehCliente = tags.includes(ETIQUETA_DE_CLIENTE);

  const trocar = useMutation({
    mutationFn: async (marcar: boolean) =>
      marcar
        ? apiClient.post(`/api/v1/converzon/clientes/${contactId}`, {})
        : apiClient.delete(`/api/v1/converzon/clientes/${contactId}`),
    onError: showApiError,
    onSuccess: (_data, marcar) => {
      // O inbox lê o contato por `conversation.contacts`: sem invalidar a lista e
      // as contagens, a conversa não mudaria de aba até recarregar a página.
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation-counts"] });
      qc.invalidateQueries({ queryKey: ["contact", contactId] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      toast.success(marcar ? t("Contato marcado como cliente.") : t("Contato desmarcado como cliente."));
    },
  });

  if (!roleAtLeast(activeOrg?.role, "manager")) return null;
  // A aba Clientes é da agência (`converzon_agencia`); no consultório o botão
  // levaria para uma aba que não aparece.
  if (!activeOrg?.capacidades_ligadas?.includes("converzon_agencia")) return null;

  return (
    <>
      <Button
        size="sm"
        variant={ehCliente ? "ghost" : "outline"}
        className="h-7 px-2 text-xs"
        disabled={disabled || trocar.isPending}
        onClick={() => setConfirmar(true)}
      >
        <CheckCircle size={12} className="mr-1" weight="regular" aria-hidden />
        {ehCliente ? t("Desmarcar cliente") : t("Marcar como cliente")}
      </Button>
      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ehCliente ? t("Desmarcar este cliente?") : t("Marcar este contato como cliente?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {ehCliente
                ? t(
                    "As conversas dele saem da aba Clientes. A IA continua fora das conversas que já estão com a equipe: para ela voltar a responder, use Devolver ao automático na conversa.",
                  )
                : t(
                    "As conversas dele vão para a aba Clientes e ficam lá, mesmo depois de fechadas. A IA para de responder este contato: daqui em diante, só a equipe atende.",
                  )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => trocar.mutate(!ehCliente)}>
              {ehCliente ? t("Desmarcar") : t("Marcar como cliente")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
