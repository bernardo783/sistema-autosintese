-- Cadastro da empresa e da equipe (sócios e colaboradores): CPF, RG, Pix, banco, nascimento, contatos.
-- Pedido do Gabriel (29/09/2026): guardar no sistema, SÓ master lê e edita.
-- Os dados em si NÃO ficam neste arquivo (repo público): foram inseridos direto no banco.

create table if not exists public.cadastro_empresa (
  id              smallint primary key default 1 check (id = 1),
  razao_social    text not null,
  cnpj            text,
  responsavel     text,
  tipo            text,
  servico         text,
  endereco        text,
  atualizado_em   timestamptz not null default now()
);

create table if not exists public.cadastro_pessoas (
  id              uuid primary key default gen_random_uuid(),
  perfil_id       uuid references public.perfis(id) on delete set null,
  vinculo         text not null check (vinculo in ('socio','colaborador')),
  nome_completo   text not null,
  telefone        text,
  nascimento      date,
  email           text,
  cpf             text,
  rg              text,
  pix             text,
  banco           text,
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create or replace function public.cadastro_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.atualizado_em := now(); return new; end $$;

drop trigger if exists trg_cadastro_empresa_touch on public.cadastro_empresa;
create trigger trg_cadastro_empresa_touch before update on public.cadastro_empresa
  for each row execute function public.cadastro_touch();
drop trigger if exists trg_cadastro_pessoas_touch on public.cadastro_pessoas;
create trigger trg_cadastro_pessoas_touch before update on public.cadastro_pessoas
  for each row execute function public.cadastro_touch();

alter table public.cadastro_empresa enable row level security;
alter table public.cadastro_pessoas enable row level security;

revoke all on public.cadastro_empresa, public.cadastro_pessoas from anon;
revoke all on public.cadastro_empresa, public.cadastro_pessoas from authenticated;
grant select, insert, update, delete on public.cadastro_empresa, public.cadastro_pessoas to authenticated;

drop policy if exists cadastro_empresa_master on public.cadastro_empresa;
create policy cadastro_empresa_master on public.cadastro_empresa
  for all to authenticated using (public.is_master()) with check (public.is_master());
drop policy if exists cadastro_pessoas_master on public.cadastro_pessoas;
create policy cadastro_pessoas_master on public.cadastro_pessoas
  for all to authenticated using (public.is_master()) with check (public.is_master());
