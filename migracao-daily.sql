-- ============================================================
-- Daily dos Squads — tabelas, RLS e a lista que recebe as ações
-- Rodar UMA vez no SQL Editor do Supabase (projeto fuieonexmdupupcsyowg).
-- É idempotente: pode rodar de novo sem quebrar nada.
-- ============================================================

-- 1) A reunião ------------------------------------------------
create table if not exists public.dailies (
  id             uuid primary key default gen_random_uuid(),
  data           date not null default current_date,
  squad          text not null,
  iniciada_em    timestamptz not null default now(),
  encerrada_em   timestamptz,
  encerrada_auto boolean not null default false,
  pausada_seg    integer not null default 0,
  criado_por     uuid references public.perfis(id),
  criado_em      timestamptz not null default now(),
  unique (data, squad)
);
comment on table public.dailies is
  'Reuniao diaria de cada squad. Duracao = encerrada_em - iniciada_em - pausada_seg.';

-- 2) As contas que entraram na fila do dia --------------------
create table if not exists public.daily_itens (
  id              uuid primary key default gen_random_uuid(),
  daily_id        uuid not null references public.dailies(id) on delete cascade,
  ficha_id        text not null,
  motivos         text[] not null default '{}',
  conferido_conta boolean not null default false,
  conferido_wpp   boolean not null default false,
  nota            text,
  visto_em        timestamptz,
  unique (daily_id, ficha_id)
);
comment on table public.daily_itens is
  'Contas revisadas na daily. visto_em alimenta o rodizio (quem esta ha mais tempo sem revisao).';

-- 3) Liga a tarefa à daily que a gerou ------------------------
alter table public.tarefas
  add column if not exists origem_daily uuid references public.dailies(id) on delete set null;

create index if not exists daily_itens_ficha_idx  on public.daily_itens(ficha_id);
create index if not exists dailies_squad_data_idx on public.dailies(squad, data desc);

-- 4) RLS: mesmo recorte por squad do resto do sistema ---------
alter table public.dailies     enable row level security;
alter table public.daily_itens enable row level security;

drop policy if exists dailies_rw on public.dailies;
create policy dailies_rw on public.dailies for all
  using (is_aprovado() and (is_master()
      or coalesce(array_length(meus_squads(),1),0)=0
      or squad = any(meus_squads())))
  with check (is_aprovado() and (is_master()
      or coalesce(array_length(meus_squads(),1),0)=0
      or squad = any(meus_squads())));

drop policy if exists daily_itens_rw on public.daily_itens;
create policy daily_itens_rw on public.daily_itens for all
  using (is_aprovado() and exists (select 1 from public.dailies d
      where d.id = daily_id and (is_master()
        or coalesce(array_length(meus_squads(),1),0)=0
        or d.squad = any(meus_squads()))))
  with check (is_aprovado() and exists (select 1 from public.dailies d
      where d.id = daily_id and (is_master()
        or coalesce(array_length(meus_squads(),1),0)=0
        or d.squad = any(meus_squads()))));

-- 5) A lista onde as ações do dia caem ------------------------
--    Marketing > Tráfego > 🗓️ Ações do Dia
insert into public.listas (id, espaco_id, pasta_id, nome, ordem)
values ('da11a000-0000-4000-8000-000000000001',
        '547007c2-ec8c-4ec2-ba1e-b02a158bdb18',
        '797a0345-a80b-4361-bc91-eeb491360d18',
        '🗓️ Ações do Dia', 0)
on conflict (id) do nothing;

insert into public.status_lista (id, lista_id, nome, cor, grupo, ordem) values
  ('da11a000-0000-4000-8000-0000000000a1','da11a000-0000-4000-8000-000000000001','A fazer','#8b95a5','nao_iniciado',0),
  ('da11a000-0000-4000-8000-0000000000a2','da11a000-0000-4000-8000-000000000001','Fazendo','#2f7cf6','ativo',1),
  ('da11a000-0000-4000-8000-0000000000a3','da11a000-0000-4000-8000-000000000001','Feito','#3ec46d','feito',2)
on conflict (id) do nothing;

-- 6) Cofre de senhas passa a ser só do master -----------------
--    'senhas' sai da lista de módulos livres. Membro perde leitura E escrita.
--    O index.html foi ajustado junto: saveDB não regrava mais esse módulo e a
--    aba Senhas some para quem não é master. Rode os dois juntos.
drop policy if exists aprovados_leem on public.itens;
create policy aprovados_leem on public.itens for select
  using (is_aprovado() and (is_master()
     or modulo = any (array['projetos','links','trafego','contas_meta'])));

drop policy if exists aprovados_atualizam on public.itens;
create policy aprovados_atualizam on public.itens for update
  using (is_aprovado() and (is_master()
     or modulo = any (array['projetos','links','trafego','contas_meta'])))
  with check (is_aprovado() and (is_master()
     or modulo = any (array['projetos','links','trafego','contas_meta'])));

drop policy if exists aprovados_inserem on public.itens;
create policy aprovados_inserem on public.itens for insert
  with check (is_aprovado() and criado_por = auth.uid() and (is_master()
     or modulo = any (array['projetos','links','trafego','contas_meta'])));

drop policy if exists aprovados_apagam on public.itens;
create policy aprovados_apagam on public.itens for delete
  using (is_aprovado() and (is_master()
     or modulo = any (array['projetos','links','trafego','contas_meta'])));

-- Confere ------------------------------------------------------
select 'dailies' t, count(*) from public.dailies
union all select 'daily_itens', count(*) from public.daily_itens
union all select 'lista Ações do Dia', count(*) from public.listas
  where id='da11a000-0000-4000-8000-000000000001';
