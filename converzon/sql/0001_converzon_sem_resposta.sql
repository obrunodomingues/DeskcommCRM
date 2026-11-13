-- Fork Converzon — campo calculado "a última fala do cliente ainda não teve resposta".
--
-- Base das abas "Novas mensagens" e "Aguardando resposta" do inbox.
-- `awaiting_since` não serve sozinho: quando a conversa é respondida, o
-- `fn_mark_conversation_message` regrava a coluna com `last_inbound_at` (nunca
-- com NULL), então "não está vazia" não quer dizer "está esperando". O que diz é
-- comparar as duas pontas, e o PostgREST não compara coluna com coluna num
-- filtro — por isso um campo calculado, no mesmo molde de `comando_da_conversa`
-- (migration 0404): parâmetro SEM NOME, para não ser publicado em /rpc.
--
-- Qualquer envio conta como resposta (IA, CRM, celular, lembrete): é o
-- `last_outbound_at`, gravado pelo mesmo `fn_mark_conversation_message`.
--
-- Aditivo e idempotente: só cria a função. Não altera tabela nem dado.
-- Desfazer: drop function public.converzon_sem_resposta(public.conversations);
--
-- Fora de supabase/migrations de propósito: o update.sh da VPS aplica as
-- migrations do upstream, e esta é do fork. Aplicar à mão, antes de subir a
-- imagem do fork (ver converzon/README.md).

create or replace function public.converzon_sem_resposta(public.conversations)
returns boolean
language sql
immutable
set search_path = public
as $sem_resposta$
  select $1.last_inbound_at is not null
     and $1.last_inbound_at > coalesce($1.last_outbound_at, '-infinity'::timestamptz);
$sem_resposta$;

comment on function public.converzon_sem_resposta(public.conversations)
  is 'Fork Converzon: verdadeiro quando a última mensagem do cliente é mais nova que a última resposta enviada. Campo calculado do PostgREST (?converzon_sem_resposta=eq.true), base das abas Novas mensagens e Aguardando resposta.';

revoke execute on function public.converzon_sem_resposta(public.conversations) from public, anon;
grant  execute on function public.converzon_sem_resposta(public.conversations) to authenticated, service_role;

notify pgrst, 'reload schema';
