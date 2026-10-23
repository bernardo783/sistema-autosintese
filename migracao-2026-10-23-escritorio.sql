-- Escritório virtual (Gabriel 23/10/2026): presença ao vivo e chamada fixa por sala.
-- 1) Canal privado 'escritorio' do Realtime só para conta aprovada.
--    is_aprovado() já é falso para modo restrito (so_lista) e para quem não tem perfil.
create policy escritorio_ler on realtime.messages
  for select to authenticated
  using (
    (select realtime.topic()) = 'escritorio'
    and realtime.messages.extension in ('presence','broadcast')
    and (select public.is_aprovado())
  );
create policy escritorio_enviar on realtime.messages
  for insert to authenticated
  with check (
    (select realtime.topic()) = 'escritorio'
    and realtime.messages.extension in ('presence','broadcast')
    and (select public.is_aprovado())
  );

-- 2) Link da chamada de cada sala. Fica no banco (o repositório é público): só aprovado lê, só master troca.
create table if not exists public.escritorio_salas(
  id text primary key,
  link text not null default '',
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid
);
alter table public.escritorio_salas enable row level security;
create policy escritorio_salas_ler on public.escritorio_salas
  for select to authenticated using (public.is_aprovado());
create policy escritorio_salas_master on public.escritorio_salas
  for all to authenticated using (public.is_master()) with check (public.is_master());
create policy rs_bloqueia on public.escritorio_salas
  as restrictive for all to authenticated using (public.rs_lista() is null) with check (public.rs_lista() is null);
grant select, insert, update, delete on public.escritorio_salas to authenticated;

-- chamadas iniciais no Jitsi (gratuito), com um código aleatório que só existe no banco
insert into public.escritorio_salas(id, link)
select s, 'https://meet.jit.si/AutoSintese-' || s || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 14)
from unnest(array['squad01','squad02','comercial','socios','financeiro','edicao','reuniao','cafe']) s
on conflict (id) do nothing;

-- reverter:
-- drop policy if exists escritorio_ler on realtime.messages;
-- drop policy if exists escritorio_enviar on realtime.messages;
-- drop table if exists public.escritorio_salas;
