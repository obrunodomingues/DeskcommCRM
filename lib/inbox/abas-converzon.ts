/**
 * FORK CONVERZON — as abas do inbox do consultório.
 *
 * O upstream organiza o inbox por QUEM MANDA (Automático, Fila, Minhas, Todas).
 * O consultório atende com uma pessoa só e precisava de outra pergunta: "o que ainda não foi
 * respondido?". As abas visíveis viram três:
 *
 *   - Todas — tudo, como antes, e passa a ser a primeira e a padrão;
 *   - Novas mensagens — toda conversa aberta cuja última fala do cliente ainda
 *     não teve resposta (de ninguém: IA, CRM ou celular);
 *   - Aguardando resposta — as mesmas, mas só onde a IA saiu da conversa
 *     (ninguém no comando, ou uma pessoa assumiu): é o que depende de uma pessoa.
 *
 * Respondeu, a conversa sai das duas e fica só em Todas. Uma conversa pode estar
 * em Novas e Aguardando ao mesmo tempo (decisão do cliente, 10/11/2026).
 *
 * As abas antigas continuam existindo por baixo (`tabToFilter`, contagens,
 * deep-links): só deixaram de aparecer. Isso mantém o diff contra o upstream
 * pequeno e os testes de regra do upstream valendo.
 */
import type { ComandoDoBanco } from "@/lib/inbox/comando-da-conversa";

/** Os estados em que a IA não vai responder a próxima mensagem do cliente. */
export const COMANDOS_SEM_A_IA: readonly ComandoDoBanco[] = ["aguardando", "humano"];
