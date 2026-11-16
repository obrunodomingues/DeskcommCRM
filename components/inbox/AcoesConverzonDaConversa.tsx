"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { roleAtLeast } from "@/lib/auth/types";
import { Checks, DotsThree, Trash } from "@/lib/ui/icons";

/**
 * Fork Converzon — duas ações a mais no cabeçalho da conversa.
 *
 * - "Não precisa responder": o cliente falou por último, mas não espera nada
 *   (despedida longa, "vou pensar"...). Tira a conversa das abas "Sem resposta"
 *   e "Precisam de você" sem mandar nada a ninguém.
 * - "Apagar contato e conversas" (gerente para cima): some com golpista ou
 *   oferta comercial — contato, conversas, mensagens e cards do funil.
 */
export function AcoesConverzonDaConversa({
  conversationId,
  contactId,
  nomeDoContato,
  clienteFalouPorUltimo,
  encerrada,
}: {
  conversationId: string;
  contactId: string | null;
  nomeDoContato: string;
  clienteFalouPorUltimo: boolean;
  encerrada: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const { activeOrg } = useAuth();
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const podeApagar = !!contactId && roleAtLeast(activeOrg?.role, "manager");

  const atualizarListas = () => {
    qc.invalidateQueries({ queryKey: ["conversations"] });
    qc.invalidateQueries({ queryKey: ["conversation-counts"] });
  };

  const dispensar = useMutation({
    mutationFn: () => apiClient.post(`/api/v1/converzon/conversas/${conversationId}/nao-precisa-responder`, {}),
    onError: showApiError,
    onSuccess: () => {
      atualizarListas();
      toast.success(t("Conversa tirada da aba Sem resposta."));
    },
  });

  const apagar = useMutation({
    mutationFn: () => apiClient.post(`/api/v1/converzon/contatos/${contactId}/apagar`, {}),
    onError: showApiError,
    onSuccess: () => {
      atualizarListas();
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["kanban"] });
      toast.success(t("Contato e conversas apagados."));
      router.push("/app/inbox");
    },
  });

  return (
    <>
      {clienteFalouPorUltimo && !encerrada && (
        <Button
          size="sm"
          variant="ghost"
          disabled={dispensar.isPending}
          title={t("Tira a conversa da aba Sem resposta sem mandar nada ao contato. Se ele escrever de novo, ela volta.")}
          onClick={() => dispensar.mutate()}
        >
          <Checks aria-hidden />
          {t("Não precisa responder")}
        </Button>
      )}
      {podeApagar && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" aria-label={t("Mais ações")} title={t("Mais ações")}>
              <DotsThree weight="bold" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="text-error focus:text-error" onSelect={() => setConfirmarApagar(true)}>
              <Trash aria-hidden />
              {t("Apagar contato e conversas")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <AlertDialog open={confirmarApagar} onOpenChange={setConfirmarApagar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("Apagar {nome} do CRM?").replace("{nome}", nomeDoContato)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Some o contato, todas as conversas e mensagens, os cards do funil e os compromissos passados ou cancelados. Não dá para desfazer. Se a pessoa escrever de novo, ela aparece como um contato novo.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-error text-white hover:brightness-95"
              disabled={apagar.isPending}
              onClick={() => apagar.mutate()}
            >
              {t("Apagar de vez")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
