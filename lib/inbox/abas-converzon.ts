/**
 * FORK CONVERZON — as abas do inbox do consultório.
 *
 * O upstream organiza o inbox por QUEM MANDA (Automático, Fila, Minhas, Todas).
 * O consultório atende com uma pessoa só e precisava de outra pergunta: "o que ainda não foi
 * respondido?". As abas visíveis viram quatro:
 *
 *   - Todas — tudo, como antes, e passa a ser a primeira e a padrão;
 *   - Novas mensagens — toda conversa aberta cuja última fala do cliente ainda
 *     não teve resposta (de ninguém: IA, CRM ou celular);
 *   - Aguardando resposta — as mesmas, mas só onde a IA saiu da conversa
 *     (ninguém no comando, ou uma pessoa assumiu): é o que depende de uma pessoa;
 *   - Clientes — as conversas de quem já é cliente (ver abaixo).
 *
 * Respondeu, a conversa sai das duas primeiras e fica só em Todas. Uma conversa
 * pode estar em Novas e Aguardando ao mesmo tempo (decisão do cliente, 10/11/2026).
 *
 * A aba Clientes (pedido de 14/11/2026) não depende de resposta: entra toda
 * conversa cujo CONTATO tem a etiqueta `cliente`, em qualquer status (fechada e
 * arquivada inclusive), e não sai mais. A marca vem do botão "Marcar como
 * cliente" do painel do contato (`components/inbox/MarcarComoCliente.tsx`), que
 * também liga o "sempre atendimento humano": a IA para de responder esse
 * contato. Cliente que escreve e fica sem resposta continua aparecendo também em
 * Novas e Aguardando, para nenhuma mensagem dele passar despercebida.
 *
 * As abas antigas continuam existindo por baixo (`tabToFilter`, contagens,
 * deep-links): só deixaram de aparecer. Isso mantém o diff contra o upstream
 * pequeno e os testes de regra do upstream valendo.
 */
import type { ComandoDoBanco } from "@/lib/inbox/comando-da-conversa";

/** Os estados em que a IA não vai responder a próxima mensagem do cliente. */
export const COMANDOS_SEM_A_IA: readonly ComandoDoBanco[] = ["aguardando", "humano"];

/**
 * A etiqueta do CONTATO que põe as conversas dele na aba Clientes. Minúscula
 * porque `contacts.tags` é gravado normalizado (`lib/contacts/tag-normalizada.ts`).
 * A conversa enxerga a etiqueta do contato pelo campo calculado `tags_do_contato`
 * (migration 0323), o mesmo que o filtro de etiquetas do inbox já usa.
 */
export const ETIQUETA_DE_CLIENTE = "cliente";
