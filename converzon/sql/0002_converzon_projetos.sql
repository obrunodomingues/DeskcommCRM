-- Fork Converzon — a tela "Projetos" (app/app/projetos): a execução de cada
-- serviço vendido, com fases, checklist e histórico. Junta o que o CRM antigo
-- tinha em duas telas (projetos e tarefas).
--
-- Três tabelas, todas por organização e com a MESMA RLS das tabelas do upstream
-- (ex.: calendar_locations): lê quem é da empresa, escreve atendente para cima,
-- e as três travas RESTRITIVAS do modo de suporte só leitura.
--
-- As fases de cada projeto são uma FOTO do modelo no momento da criação
-- (`fases`, jsonb com a lista de nomes): mudar o modelo no código não
-- reescreve projeto que já está andando.
--
-- Aditivo e idempotente: só cria tabelas, índices, gatilhos e políticas.
-- Desfazer:
--   drop table if exists public.converzon_projeto_eventos;
--   drop table if exists public.converzon_projeto_itens;
--   drop table if exists public.converzon_projetos;
--
-- Fora de supabase/migrations de propósito (o update.sh aplica as do upstream).
-- Aplicar à mão, ANTES de subir a imagem do fork que tem a tela.

create table if not exists public.converzon_projetos (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  nome             text not null check (char_length(btrim(nome)) between 1 and 160),
  tipo             text not null check (tipo in ('site', 'estrutura', 'trafego', 'ia', 'sistema', 'outro')),
  contact_id       uuid references public.contacts(id) on delete set null,
  situacao         text not null default 'andamento'
                   check (situacao in ('andamento', 'esperando_cliente', 'pausado', 'concluido', 'cancelado')),
  fases            jsonb not null check (jsonb_typeof(fases) = 'array' and jsonb_array_length(fases) between 1 and 20),
  fase_atual       smallint not null default 0 check (fase_atual >= 0),
  fase_desde       timestamptz not null default now(),
  valor_centavos   integer check (valor_centavos is null or valor_centavos >= 0),
  prazo            date,
  notas            text check (notas is null or char_length(notas) <= 20000),
  concluido_em     timestamptz,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint converzon_projetos_fase_no_intervalo check (fase_atual < jsonb_array_length(fases))
);

create index if not exists idx_converzon_projetos_org on public.converzon_projetos (organization_id, situacao);
create index if not exists idx_converzon_projetos_contato on public.converzon_projetos (contact_id);

create table if not exists public.converzon_projeto_itens (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  projeto_id       uuid not null references public.converzon_projetos(id) on delete cascade,
  fase             smallint not null check (fase >= 0),
  titulo           text not null check (char_length(btrim(titulo)) between 1 and 200),
  feito            boolean not null default false,
  feito_em         timestamptz,
  prazo            date,
  posicao          integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_converzon_projeto_itens_projeto on public.converzon_projeto_itens (projeto_id, fase, posicao);
create index if not exists idx_converzon_projeto_itens_org_prazo on public.converzon_projeto_itens (organization_id, prazo) where not feito;

create table if not exists public.converzon_projeto_eventos (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  projeto_id       uuid not null references public.converzon_projetos(id) on delete cascade,
  tipo             text not null check (tipo in ('criado', 'fase', 'situacao', 'item', 'nota', 'edicao')),
  texto            text not null check (char_length(texto) between 1 and 500),
  autor_user_id    uuid,
  created_at       timestamptz not null default now()
);

create index if not exists idx_converzon_projeto_eventos_projeto on public.converzon_projeto_eventos (projeto_id, created_at desc);

-- updated_at pelo mesmo gatilho das tabelas do upstream
drop trigger if exists trg_converzon_projetos_updated_at on public.converzon_projetos;
create trigger trg_converzon_projetos_updated_at
  before update on public.converzon_projetos
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_converzon_projeto_itens_updated_at on public.converzon_projeto_itens;
create trigger trg_converzon_projeto_itens_updated_at
  before update on public.converzon_projeto_itens
  for each row execute function public.fn_set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────
do $rls$
declare
  t text;
begin
  foreach t in array array['converzon_projetos', 'converzon_projeto_itens', 'converzon_projeto_eventos'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select using ((organization_id in (select fn_user_org_ids())) or fn_is_platform_admin())',
      t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert with check (fn_is_platform_admin_full() or ((organization_id in (select fn_user_org_ids())) and fn_role_at_least(organization_id, %L)))',
      t || '_insert', t, 'agent');

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update using (fn_is_platform_admin_full() or ((organization_id in (select fn_user_org_ids())) and fn_role_at_least(organization_id, %L))) with check (fn_is_platform_admin_full() or ((organization_id in (select fn_user_org_ids())) and fn_role_at_least(organization_id, %L)))',
      t || '_update', t, 'agent', 'agent');

    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete using (fn_is_platform_admin_full() or ((organization_id in (select fn_user_org_ids())) and fn_role_at_least(organization_id, %L)))',
      t || '_delete', t, 'agent');

    -- Travas do modo de suporte só leitura (restritivas, como no upstream)
    execute format('drop policy if exists support_write_insert on public.%I', t);
    execute format('create policy support_write_insert on public.%I as restrictive for insert to authenticated with check (fn_support_write_allowed(organization_id))', t);
    execute format('drop policy if exists support_write_update on public.%I', t);
    execute format('create policy support_write_update on public.%I as restrictive for update to authenticated using (fn_support_write_allowed(organization_id)) with check (fn_support_write_allowed(organization_id))', t);
    execute format('drop policy if exists support_write_delete on public.%I', t);
    execute format('create policy support_write_delete on public.%I as restrictive for delete to authenticated using (fn_support_write_allowed(organization_id))', t);

    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
  end loop;
end
$rls$;

notify pgrst, 'reload schema';
