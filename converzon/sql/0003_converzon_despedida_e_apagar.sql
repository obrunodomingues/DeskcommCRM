-- Fork Converzon — "sem resposta" mais esperto e o "apagar de vez".
--
-- 1. `converzon_eh_despedida(texto)`: a mensagem é só agradecimento/despedida
--    ("obrigado", "ok, obrigada!", "valeu, até mais", "🙏")? Então não pede
--    resposta. Conservadora de propósito: qualquer "?" ou palavra fora da lista
--    (uma pergunta, um "vou pensar", um "sim") devolve FALSO — melhor uma
--    conversa a mais na aba do que um paciente esquecido.
--
-- 2. `converzon_sem_resposta(conversations)` v2. Continua verdadeiro quando o
--    cliente falou por último, agora contando só a fala que PEDE resposta:
--      - mensagem apagada pelo cliente (`revoked_at`) não conta;
--      - despedida não conta (item 1);
--      - "Não precisa responder" (`metadata.converzon_dispensada_em`) zera o
--        relógio: só conta o que chegar DEPOIS do clique.
--    Passa de `immutable` para `stable` porque agora lê `messages` (índice
--    `idx_messages_conversation_sent`).
--
-- 3. `converzon_apagar_contato_completo(contato, organização)`: some com o
--    contato, conversas, mensagens, cards do funil e compromissos passados ou
--    cancelados, numa transação só. Recusa se houver consulta FUTURA marcada
--    (`consulta_futura`). Reusa `fn_apagar_contato_com_historico` (migration
--    0488) para a parte que o produto já sabe apagar. Só o service_role executa:
--    a rota `/api/v1/converzon/contatos/[id]/apagar` cobra o papel antes.
--
-- Idempotente (create or replace). Desfazer: aplicar de novo o 0001 (volta a
-- regra antiga) e `drop function` das duas novas.
-- Aplicar à mão, ANTES de subir a imagem do fork que tem o botão de apagar e o
-- "Não precisa responder" (ver converzon/README.md).

create or replace function public.converzon_eh_despedida(p_texto text)
returns boolean
language plpgsql
immutable
set search_path = public
as $despedida$
declare
  v_texto text;
  v_palavra text;
  v_agradece boolean := false;
begin
  if p_texto is null or btrim(p_texto) = '' then return false; end if;
  if position('?' in p_texto) > 0 then return false; end if;

  v_texto := lower(translate(p_texto,
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇç',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'));
  v_texto := btrim(regexp_replace(regexp_replace(v_texto, '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'));

  -- Só emoji ou pontuação (sem "?"): 👍, 🙏, ❤️, "!!".
  if v_texto = '' then return true; end if;
  if v_texto ~ '[0-9]' then return false; end if;
  if array_length(string_to_array(v_texto, ' '), 1) > 10 then return false; end if;
  if v_texto ~ '(^| )ate (mais|logo|breve)( |$)' then v_agradece := true; end if;

  foreach v_palavra in array string_to_array(v_texto, ' ') loop
    if v_palavra ~ '^(obrigad[oa]s?|obg|brigad[oa]s?|grat[oa]s?|valeu|vlw|tchau|tchauzinho|agradec[a-z]*|abencoe)$' then
      v_agradece := true;
    elsif v_palavra not in (
      'muito', 'mto', 'mt', 'muita', 'ate', 'mais', 'logo', 'breve', 'pela', 'pelo', 'pelas', 'pelos',
      'atencao', 'retorno', 'ajuda', 'informacao', 'informacoes', 'doutor', 'doutora', 'dr', 'dra',
      'fernanda', 'deus', 'igualmente', 'abraco', 'abracos', 'beijo', 'beijos', 'bjs', 'bj', 'de', 'nada',
      'viu', 'e', 'a', 'o', 'ok', 'okay', 'certo', 'perfeito', 'combinado', 'beleza', 'blz', 'otimo',
      'otima', 'show', 'entendi', 'tudo', 'bom', 'boa', 'por', 'enquanto', 'semana', 'dia', 'noite',
      'tarde', 'novamente', 'sempre', 'voce', 'vc', 'todos', 'gentileza', 'carinho', 'paciencia', 'seu',
      'sua', 'tb', 'tambem', 'ta', 'esta'
    ) then
      return false;
    end if;
  end loop;

  return v_agradece;
end;
$despedida$;

comment on function public.converzon_eh_despedida(text)
  is 'Fork Converzon: verdadeiro quando a mensagem é só agradecimento/despedida (ou só emoji), sem pergunta. Usada por converzon_sem_resposta.';

revoke execute on function public.converzon_eh_despedida(text) from public, anon;
grant  execute on function public.converzon_eh_despedida(text) to authenticated, service_role;


create or replace function public.converzon_sem_resposta(public.conversations)
returns boolean
language sql
stable
set search_path = public
as $sem_resposta$
  select coalesce((
    select $1.last_inbound_at > c.corte
       and exists (
         select 1
           from public.messages m
          where m.conversation_id = $1.id
            and m.direction = 'inbound'
            and m.revoked_at is null
            and m.sent_at > c.corte
            and not public.converzon_eh_despedida(m.body)
       )
      from (
        select greatest(
          coalesce($1.last_outbound_at, '-infinity'::timestamptz),
          case when ($1.metadata ->> 'converzon_dispensada_em') ~ '^\d{4}-\d{2}-\d{2}T'
               then ($1.metadata ->> 'converzon_dispensada_em')::timestamptz
               else '-infinity'::timestamptz
          end
        ) as corte
      ) c
  ), false) and $1.last_inbound_at is not null;
$sem_resposta$;

comment on function public.converzon_sem_resposta(public.conversations)
  is 'Fork Converzon v2: verdadeiro quando o cliente falou por último com algo que pede resposta (ignora mensagem apagada, despedida e o "Não precisa responder"). Base das abas Sem resposta e Precisam de você.';

revoke execute on function public.converzon_sem_resposta(public.conversations) from public, anon;
grant  execute on function public.converzon_sem_resposta(public.conversations) to authenticated, service_role;


create or replace function public.converzon_apagar_contato_completo(p_contact_id uuid, p_organization_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $apagar$
declare
  v_compromissos integer := 0;
  v_cards integer := 0;
  v_apagou boolean;
begin
  if not exists (
    select 1 from public.contacts where id = p_contact_id and organization_id = p_organization_id
  ) then
    raise exception 'contato_nao_encontrado' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.calendar_appointments
     where contact_id = p_contact_id and organization_id = p_organization_id
       and status <> 'cancelled' and starts_at > now()
  ) then
    raise exception 'consulta_futura' using errcode = 'P0001';
  end if;

  delete from public.calendar_appointments
   where contact_id = p_contact_id and organization_id = p_organization_id;
  get diagnostics v_compromissos = row_count;

  delete from public.crm_leads
   where contact_id = p_contact_id and organization_id = p_organization_id;
  get diagnostics v_cards = row_count;

  v_apagou := public.fn_apagar_contato_com_historico(p_contact_id, p_organization_id);

  return jsonb_build_object('apagou', coalesce(v_apagou, false), 'cards', v_cards, 'compromissos', v_compromissos);
end;
$apagar$;

comment on function public.converzon_apagar_contato_completo(uuid, uuid)
  is 'Fork Converzon: apaga contato, conversas, mensagens, cards do funil e compromissos passados/cancelados numa transação. Recusa com consulta futura. Só service_role.';

revoke execute on function public.converzon_apagar_contato_completo(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.converzon_apagar_contato_completo(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
