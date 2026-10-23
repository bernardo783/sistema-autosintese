-- Escritório virtual, regras do Gather (Gabriel 23/10/2026): cada pessoa tem uma mesa fixa na sala do time.
-- A mesa é o índice (0 a 5) dentro da sala, na ordem da planta: fileira de cima da esquerda pra direita,
-- depois a de baixo. Só aprovado lê, só master muda. Quem ainda não tem linha ganha a primeira mesa
-- livre da sala do time, e o app do master grava a escolha na próxima vez que ele abre o Escritório.
create table if not exists public.escritorio_mesas(
  pessoa uuid primary key references public.perfis(id) on delete cascade,
  sala text not null,
  mesa int not null check (mesa between 0 and 11),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  unique (sala, mesa)
);
alter table public.escritorio_mesas enable row level security;
create policy escritorio_mesas_ler on public.escritorio_mesas
  for select to authenticated using (public.is_aprovado());
create policy escritorio_mesas_master on public.escritorio_mesas
  for all to authenticated using (public.is_master()) with check (public.is_master());
create policy rs_bloqueia on public.escritorio_mesas
  as restrictive for all to authenticated using (public.rs_lista() is null) with check (public.rs_lista() is null);
grant select, insert, update, delete on public.escritorio_mesas to authenticated;

-- mesas do time de hoje (sócios na dos sócios, squads, SDRs no Comercial, edição)
insert into public.escritorio_mesas(pessoa, sala, mesa)
select p.id, v.sala, v.mesa
from (values
  ('Bernardo Antunes','socios',0), ('Gabriel','socios',1), ('José','socios',2), ('Arthur','socios',3),
  ('Luiz','squad01',0), ('Luan Santiago','squad01',1),
  ('João','squad02',0), ('Yghor','squad02',1),
  ('Kennedy Lima','comercial',0), ('Luana','comercial',1),
  ('Maria','edicao',0)
) as v(nome, sala, mesa)
join public.perfis p on p.nome = v.nome and p.aprovado
on conflict do nothing;

-- reverter:
-- drop table if exists public.escritorio_mesas;
