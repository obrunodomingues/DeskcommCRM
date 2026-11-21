"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Checks, Trash } from "@/lib/ui/icons";

/**
 * Fork Converzon — duas ações a mais no cabeçalho da conversa.
 *
 * - "Não precisa responder": o cliente falou por último, mas não espera nada
 *   (despedida longa, "vou pensar"...). Tira a conversa das abas "Sem resposta"
 *   e "Precisam de você" sem mandar nada a ninguém.
 * - "Excluir contato" (gerente para cima), à vista e não num menu: some com
 *   golpista ou oferta comercial — contato, conversas, mensagens e cards do funil.
 */
export function AcoesConverzonDaConversa({
  conversationId,
  contactId,
  nomeDoContato,
  clienteFalouPorUltimo,
  encerrada,
  whatsappIndividual,
}: {
  conversationId: string;
  contactId: string | null;
  nomeDoContato: string;
  clienteFalouPorUltimo: boolean;
  encerrada: boolean;
  whatsappIndividual: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const { activeOrg } = useAuth();
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const podeApagar = !!contactId && roleAtLeast(activeOrg?.role, "manager");
  const primeiroAtendimentoUrl = "/api/v1/converzon/conversas/" + conversationId + "/primeiro-atendimento";
  const chaveDoPrimeiroAtendimento = ["converzon-primeiro-atendimento", conversationId];
  const podeConsultarPrimeiroAtendimento =
    !!contactId && !encerrada && whatsappIndividual && roleAtLeast(activeOrg?.role, "agent") &&
    !!activeOrg?.capacidades_ligadas?.includes("converzon_agencia");
  const primeiroAtendimento = useQuery({
    queryKey: chaveDoPrimeiroAtendimento,
    queryFn: () => apiClient.get<{ data: { podeEnviar: boolean } }>(primeiroAtendimentoUrl),
    enabled: podeConsultarPrimeiroAtendimento,
    retry: false,
    staleTime: 0,
  });

  const atualizarListas = () => {
    qc.invalidateQueries({ queryKey: ["conversations"] });
    qc.invalidateQueries({ queryKey: ["conversation-counts"] });
  };

  const enviarPrimeiroAtendimento = useMutation({
    mutationFn: () => apiClient.post(primeiroAtendimentoUrl, {}),
    onError: showApiError,
    onSuccess: () => toast.success(t("Primeiro atendimento enviado.")),
    onSettled: () => {
      atualizarListas();
      void qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      void qc.invalidateQueries({ queryKey: chaveDoPrimeiroAtendimento });
    },
  });

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
      {podeConsultarPrimeiroAtendimento &&
        (primeiroAtendimento.data?.data.podeEnviar || enviarPrimeiroAtendimento.isPending) && (
          <Button
            size="sm"
            variant="outline"
            data-testid="enviar-primeiro-atendimento"
            disabled={enviarPrimeiroAtendimento.isPending}
            onClick={() => enviarPrimeiroAtendimento.mutate()}
          >
            {t(enviarPrimeiroAtendimento.isPending ? "Enviando 1º atendimento…" : "Enviar 1º atendimento")}
          </Button>
        )}
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
        <Button
          size="sm"
          variant="outline"
          className="text-error hover:text-error"
          disabled={apagar.isPending}
          title={t("Apagar contato e conversas")}
          onClick={() => setConfirmarApagar(true)}
        >
          <Trash aria-hidden />
          {t("Excluir contato")}
        </Button>
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
