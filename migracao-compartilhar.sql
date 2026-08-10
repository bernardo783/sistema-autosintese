-- ============================================================
-- Compartilhar espaço, pasta e lista com pessoas (modelo ClickUp)
-- Tudo nasce ABERTO. Você fecha o que quiser e escolhe quem entra.
--
-- ESTENDE o que já existe — não substitui. O modelo de workspace
-- (ws_visivel: empresa é de todos, pessoal é do dono) continua valendo;
-- as regras novas entram POR CIMA dele, nunca no lugar.
--
-- Rodar UMA vez no SQL Editor, DEPOIS que o index.html novo estiver no ar.
-- Idempotente.
-- ============================================================

-- 1) Marca de privado em cada nível ---------------------------
alter table public.espacos add column if not exists privado boolean not null default false;
alter table public.pastas  add column if not exists privado boolean not null default false;
alter table public.listas  add column if not exists privado boolean not null default false;

-- 2) Quem tem acesso a cada nó fechado ------------------------
create table if not exists public.no_membros (
  id         uuid primary key default gen_random_uuid(),
  tipo       text not null check (tipo in ('espaco','pasta','lista')),
  no_id      uuid not null,
  user_id    uuid not null references public.perfis(id) on delete cascade,
  permissao  text not null default 'editar' check (permissao in ('ver','editar')),
  criado_em  timestamptz not null default now(),
  criado_por uuid references public.perfis(id),
  unique (tipo, no_id, user_id)
);
comment on table public.no_membros is
  'Quem enxerga cada espaco/pasta/lista fechado. privado=false significa aberto a todos.';
create index if not exists no_membros_user_idx on public.no_membros(user_id);
create index if not exists no_membros_no_idx   on public.no_membros(tipo, no_id);

-- 3) A regra de um nó só: aberto = todos; fechado = só convidado -----
--    p_id nulo (lista sem pasta) devolve true, então a herança não trava.
create or replace function public.no_liberado(p_tipo text, p_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select case
    when p_id is null then true
    when public.is_master() then true
    when not coalesce((
      select case p_tipo
        when 'espaco' then (select privado from espacos where id=p_id)
        when 'pasta'  then (select privado from pastas  where id=p_id)
        else               (select privado from listas  where id=p_id) end
    ), false) then true
    else exists (select 1 from no_membros m
                 where m.tipo=p_tipo and m.no_id=p_id and m.user_id=auth.uid())
  end
$$;

-- 4) lista_visivel ganha a herança, mantendo a regra de workspace ----
--    Como tarefas, status_lista e campos_lista já chamam essa função,
--    todas elas passam a respeitar o compartilhamento sem tocar nas policies.
create or replace function public.lista_visivel(lid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
      select 1 from public.listas l join public.espacos e on e.id = l.espaco_id
       where l.id = lid and public.ws_visivel(e.workspace_id)
    )
    and public.no_liberado('lista',  lid)
    and public.no_liberado('espaco', (select espaco_id from public.listas where id=lid))
    and public.no_liberado('pasta',  (select pasta_id  from public.listas where id=lid))
$$;

-- Só leitura: convidado como "ver" enxerga, mas não escreve.
create or replace function public.lista_editavel(lid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.lista_visivel(lid) and (
    public.is_master()
    or not exists (select 1 from no_membros m
                   where m.user_id=auth.uid() and m.permissao='ver'
                     and ((m.tipo='lista'  and m.no_id=lid)
                       or (m.tipo='pasta'  and m.no_id=(select pasta_id  from public.listas where id=lid))
                       or (m.tipo='espaco' and m.no_id=(select espaco_id from public.listas where id=lid))))
  )
$$;

-- 5) RLS da tabela nova ---------------------------------------
alter table public.no_membros enable row level security;
drop policy if exists no_membros_leem on public.no_membros;
create policy no_membros_leem on public.no_membros for select using (public.is_aprovado());
drop policy if exists no_membros_master on public.no_membros;
create policy no_membros_master on public.no_membros for all
  using (public.is_master()) with check (public.is_master());

-- 6) Espaço e pasta: soma a regra nova à de workspace ---------
drop policy if exists espacos_leem on public.espacos;
create policy espacos_leem on public.espacos for select
  using (public.ws_visivel(workspace_id) and public.no_liberado('espaco', id));
drop policy if exists espacos_escrevem on public.espacos;
create policy espacos_escrevem on public.espacos for all
  using (public.ws_visivel(workspace_id) and public.no_liberado('espaco', id))
  with check (public.ws_visivel(workspace_id));

drop policy if exists pastas_tudo on public.pastas;
create policy pastas_tudo on public.pastas for all
  using (exists (select 1 from espacos e where e.id=pastas.espaco_id and public.ws_visivel(e.workspace_id))
         and public.no_liberado('espaco', pastas.espaco_id)
         and public.no_liberado('pasta',  pastas.id))
  with check (exists (select 1 from espacos e where e.id=pastas.espaco_id and public.ws_visivel(e.workspace_id)));

-- Lista: leitura pela função (que já tem a herança); escrita mantém a regra antiga
-- para que criar lista nova continue funcionando.
drop policy if exists listas_tudo on public.listas;
create policy listas_tudo on public.listas for all
  using (public.lista_visivel(id))
  with check (exists (select 1 from espacos e where e.id=listas.espaco_id and public.ws_visivel(e.workspace_id)));

-- 7) Tarefa: mantém squad + visibilidade da lista, e agora respeita "só ver"
drop policy if exists tarefas_atualizam on public.tarefas;
create policy tarefas_atualizam on public.tarefas for update
  using (public.tarefa_visivel(ficha_id, squad) and public.lista_editavel(lista_id))
  with check (public.tarefa_visivel(ficha_id, squad) and public.lista_editavel(lista_id));
drop policy if exists tarefas_apagam on public.tarefas;
create policy tarefas_apagam on public.tarefas for delete
  using (public.tarefa_visivel(ficha_id, squad) and public.lista_editavel(lista_id));
drop policy if exists tarefas_inserem on public.tarefas;
create policy tarefas_inserem on public.tarefas for insert
  with check (public.tarefa_visivel(ficha_id, squad) and public.lista_editavel(lista_id));
-- tarefas_leem fica como está: já usa lista_visivel, que agora tem a herança.

-- 8) Confere ---------------------------------------------------
select 'no_membros' t, count(*)::text n from public.no_membros
union all select 'espacos privados', count(*)::text from public.espacos where privado
union all select 'pastas privadas',  count(*)::text from public.pastas  where privado
union all select 'listas privadas',  count(*)::text from public.listas  where privado
union all select 'ws_visivel intacta',
  (select case when count(*)=1 then 'sim' else 'NAO' end::text from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ws_visivel');
