"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { SeletorDeContato } from "@/components/kanban/SeletorDeContato";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import {
  MODELOS_DE_PROJETO,
  TIPOS_DE_PROJETO,
  centavosDoTexto,
  type TipoDeProjeto,
} from "@/lib/converzon/projetos";
import type { Contact } from "@/lib/types/contacts";

/**
 * Fork Converzon — criar um projeto. O tipo de serviço escolhe as fases e o
 * checklist com que ele nasce (lib/converzon/projetos.ts); tudo é editável
 * depois, dentro do projeto.
 */
export function NovoProjetoDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoDeProjeto>("site");
  const [contato, setContato] = useState<Contact | null>(null);
  const [valor, setValor] = useState("");
  const [prazo, setPrazo] = useState("");

  const centavos = centavosDoTexto(valor);
  const valorInvalido = Number.isNaN(centavos);

  const criar = useMutation({
    mutationFn: () =>
      apiClient.post<{ data: { id: string } }>("/api/v1/converzon/projetos", {
        nome: nome.trim(),
        tipo,
        contact_id: contato?.id ?? null,
        valor_centavos: centavos,
        prazo: prazo || null,
      }),
    onError: showApiError,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["converzon-projetos"] });
      setNome("");
      setContato(null);
      setValor("");
      setPrazo("");
      onFechar();
      router.push(`/app/projetos/${r.data.id}`);
    },
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => (v ? null : onFechar())}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Novo projeto")}</DialogTitle>
          <DialogDescription>
            {t("O tipo de serviço define as fases e o checklist com que o projeto nasce. Dá para ajustar tudo depois.")}
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!nome.trim() || valorInvalido) return;
            criar.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="projeto-nome">{t("Nome do projeto")}</Label>
            <Input
              id="projeto-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder={t("Ex.: Site da Clínica Sorriso")}
              maxLength={160}
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t("Tipo de serviço")}</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoDeProjeto)}>
              <SelectTrigger aria-label={t("Tipo de serviço")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_DE_PROJETO.map((tp) => (
                  <SelectItem key={tp} value={tp}>
                    {MODELOS_DE_PROJETO[tp].rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-text-muted">
              {MODELOS_DE_PROJETO[tipo].fases.map((f) => f.nome).join(" → ")}
            </p>
          </div>

          <SeletorDeContato escolhido={contato} onEscolher={setContato} />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="projeto-valor">{t("Valor (R$)")}</Label>
              <Input
                id="projeto-valor"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="1.500,00"
                aria-invalid={valorInvalido}
              />
              {valorInvalido ? <p className="text-xs text-error-fg">{t("Use só números, ex.: 1.500,00")}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="projeto-prazo">{t("Prazo de entrega")}</Label>
              <Input id="projeto-prazo" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onFechar}>
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={!nome.trim() || valorInvalido || criar.isPending}>
              {criar.isPending ? t("Criando…") : t("Criar projeto")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
