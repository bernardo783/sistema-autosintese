-- Modo Pessoal (aplicada em 23/08/2026 como "modo_pessoal_habitos_agenda")
-- Tudo aqui é privado do dono — nem master enxerga, mesma regra do workspace pessoal.
-- A agenda conversa com o Google via edge function "google-agenda" (secrets
-- GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET; callback público, demais ações com JWT).

create table public.habitos (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  nome text not null,
  icone text not null default 'ih-raio',
  cor text not null default '#a78bfa',
  dias smallint[] not null default '{1,2,3,4,5}',        -- 0=Dom .. 6=Sáb
  meta_tipo text not null default 'sem' check (meta_tipo in ('sem','mes','ano')),
  meta_qtd int not null default 5 check (meta_qtd > 0),
  ordem int not null default 0,
  arquivado boolean not null default false,
  criado_em timestamptz not null default now()
);

create table public.habito_checks (
  id uuid primary key default gen_random_uuid(),
  habito_id uuid not null references public.habitos(id) on delete cascade,
  dono uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  criado_em timestamptz not null default now(),
  unique (habito_id, dia)
);
create index habito_checks_dono_dia on public.habito_checks (dono, dia);

create table public.agenda_eventos (
  id uuid primary key default gen_random_uuid(),
  dono uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  titulo text not null,
  dia date not null,
  hora time,
  feito boolean not null default false,
  gcal_id text unique,                                    -- preenchido quando o evento existe no Google
  criado_em timestamptz not null default now()
);
create index agenda_eventos_dono_dia on public.agenda_eventos (dono, dia);

create table public.agenda_google (
  dono uuid primary key references auth.users(id) on delete cascade,
  google_email text,
  refresh_token text,
  conectado_em timestamptz not null default now()
);

alter table public.habitos enable row level security;
alter table public.habito_checks enable row level security;
alter table public.agenda_eventos enable row level security;
alter table public.agenda_google enable row level security;

create policy habitos_dono on public.habitos for all
  using (dono = auth.uid()) with check (dono = auth.uid() and is_aprovado());
create policy habito_checks_dono on public.habito_checks for all
  using (dono = auth.uid()) with check (dono = auth.uid() and is_aprovado());
create policy agenda_eventos_dono on public.agenda_eventos for all
  using (dono = auth.uid()) with check (dono = auth.uid() and is_aprovado());

-- conexão Google: o dono só LÊ o status (nunca o token); escrita é da edge function (service role)
create policy agenda_google_ve on public.agenda_google for select using (dono = auth.uid());
create policy agenda_google_desconecta on public.agenda_google for delete using (dono = auth.uid());
revoke all on public.agenda_google from authenticated;
grant select (dono, google_email, conectado_em), delete on public.agenda_google to authenticated;
