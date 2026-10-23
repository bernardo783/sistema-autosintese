-- Escritório virtual (Gabriel 23/10/2026): chat na aba Pessoas, por mensagem, que NUNCA apaga.
-- para = null é o "Todos do escritório"; para = id de uma pessoa é a conversa só entre as duas.
-- Quem lê: conta aprovada, só o Todos e as conversas em que é uma das pontas (nem o master lê a
-- conversa dos outros). Quem escreve: a própria pessoa, só para e texto (id, de e hora são do banco).
-- Apagar e editar: ninguém, nem o master, nem o service role (o gatilho barra antes de qualquer RLS).
create table if not exists public.escritorio_chat(
  id bigint generated always as identity primary key,
  de uuid not null default auth.uid(),
  para uuid,
  texto text not null check (char_length(btrim(texto)) between 1 and 2000),
  criado_em timestamptz not null default now(),
  check (para is null or para <> de)
);
create index if not exists escritorio_chat_para on public.escritorio_chat(para, id desc);
create index if not exists escritorio_chat_de on public.escritorio_chat(de, id desc);
alter table public.escritorio_chat enable row level security;
create policy escritorio_chat_ler on public.escritorio_chat
  for select to authenticated
  using (public.is_aprovado() and (para is null or de = (select auth.uid()) or para = (select auth.uid())));
create policy escritorio_chat_escrever on public.escritorio_chat
  for insert to authenticated
  with check (de = (select auth.uid()) and public.is_aprovado());
create policy rs_bloqueia on public.escritorio_chat
  as restrictive for all to authenticated using (public.rs_lista() is null) with check (public.rs_lista() is null);
revoke all on public.escritorio_chat from anon, authenticated;   /* o Supabase dá tudo por padrão a tabela nova */
grant select on public.escritorio_chat to authenticated;
grant insert (para, texto) on public.escritorio_chat to authenticated;

create or replace function public.escritorio_chat_nunca_apaga() returns trigger
language plpgsql as $$
begin
  raise exception 'O chat do Escritório guarda tudo: mensagem não se apaga nem se edita.';
end $$;
create trigger escritorio_chat_nunca_apaga before update or delete on public.escritorio_chat
  for each row execute function public.escritorio_chat_nunca_apaga();
create trigger escritorio_chat_nunca_esvazia before truncate on public.escritorio_chat
  for each statement execute function public.escritorio_chat_nunca_apaga();

-- reverter (só se o Gabriel pedir; apaga o histórico):
-- drop table if exists public.escritorio_chat; drop function if exists public.escritorio_chat_nunca_apaga();
