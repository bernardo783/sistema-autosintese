-- ============================================================
-- Formulário de informações Contratuais (autosintese.app.br/contrato)
-- Cópia do formulário do Yay Forms. O cliente preenche sem login; a resposta
-- cai na aba "Respostas" do sistema e avisa comercial + masters no sininho.
--
-- Já aplicado no projeto fuieonexmdupupcsyowg (ago/2026) via MCP, em 4 passos.
-- Este arquivo é o estado final consolidado e idempotente, para registro/recriação.
--
-- ARQUITETURA (importante): a página pública NÃO escreve na tabela. Quem grava é a
-- edge function 'contrato' (service_role), que valida, confere o honeypot no servidor
-- e limita por IP. Sem isso, o anon com UPDATE conseguiria vandalizar todas as
-- respostas parciais de uma vez (PATCH com filtro arbitrário) e floodar o sininho.
-- A edge function está versionada no Supabase (não neste repo) — ver get_edge_function.
-- ============================================================

-- 1) Tabela ---------------------------------------------------
create table if not exists public.contratos_form (
  id              uuid primary key default gen_random_uuid(),  -- gerado no NAVEGADOR (uuid v4)
  criado_em       timestamptz not null default now(),
  enviado_em      timestamptz,                                  -- null = parcial; setado = completa
  razao_social    text, representante text, cnpj text, rg text, cpf text,
  nascimento      date, endereco text, email text, resp_financeiro text, telefone text,
  ua              text,
  ip_hash         text,                                         -- SHA-256(ip) p/ rate-limit; não guarda IP cru
  visto_em        timestamptz,
  visto_por       uuid references public.perfis(id)
);
-- campos nullable (parcial entra pela metade); checks valem quando preenchidos
do $$ declare c record; begin
  for c in select conname from pg_constraint
    where conrelid='public.contratos_form'::regclass and contype='c'
  loop execute format('alter table public.contratos_form drop constraint %I', c.conname); end loop;
end $$;
alter table public.contratos_form
  add constraint cf_ck_razao  check (razao_social    is null or char_length(razao_social)    between 2 and 300),
  add constraint cf_ck_rep    check (representante   is null or char_length(representante)   between 2 and 300),
  add constraint cf_ck_cnpj   check (cnpj            is null or char_length(cnpj)            between 14 and 20),
  add constraint cf_ck_rg     check (rg              is null or char_length(rg)              between 2 and 40),
  add constraint cf_ck_cpf    check (cpf             is null or char_length(cpf)             between 11 and 16),
  add constraint cf_ck_end    check (endereco        is null or char_length(endereco)        between 2 and 500),
  add constraint cf_ck_email  check (email           is null or (position('@' in email) > 1 and char_length(email) <= 200)),
  add constraint cf_ck_rfin   check (resp_financeiro is null or char_length(resp_financeiro) between 2 and 300),
  add constraint cf_ck_tel    check (telefone        is null or char_length(telefone)        between 10 and 25),
  add constraint cf_ck_ua     check (ua              is null or char_length(ua)              <= 300);
create index if not exists cf_ip_janela on public.contratos_form(ip_hash, criado_em);

-- 2) RLS: público não toca; a edge (service_role) grava; a equipe lê -----------
alter table public.contratos_form enable row level security;
-- ninguém do anon/authenticated insere/atualiza direto — só a edge function
revoke insert, update, delete, truncate, references, trigger on public.contratos_form from anon;
revoke insert on public.contratos_form from authenticated;

drop policy if exists cf_le on public.contratos_form;
create policy cf_le on public.contratos_form for select using (public.is_aprovado());
drop policy if exists cf_marca_visto on public.contratos_form;
create policy cf_marca_visto on public.contratos_form for update
  using (public.is_aprovado()) with check (public.is_aprovado());
drop policy if exists cf_apaga on public.contratos_form;
create policy cf_apaga on public.contratos_form for delete using (public.is_master());

-- 3) Aviso no sininho quando a resposta é CONCLUÍDA -----------
create or replace function public.ntf_contrato_form()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if (tg_op='INSERT' and new.enviado_em is not null)
     or (tg_op='UPDATE' and old.enviado_em is null and new.enviado_em is not null) then
    insert into notificacoes(para, titulo, texto)
    select p.id,
           '📑 Formulário contratual recebido: '||coalesce(new.razao_social,'(sem nome)'),
           'Representante: '||coalesce(new.representante,'—')||' · '||coalesce(new.email,'—')
    from perfis p
    where p.aprovado and (p.role='master' or p.cargo ilike '%comercial%');
  end if;
  return new;
end $$;
drop trigger if exists trg_ntf_contrato_form on public.contratos_form;
create trigger trg_ntf_contrato_form after insert or update on public.contratos_form
  for each row execute function public.ntf_contrato_form();

-- 4) Confere ---------------------------------------------------
select 'contratos_form' t, count(*)::text n from public.contratos_form
union all select 'policies', (select count(*)::text from pg_policy where polrelid='public.contratos_form'::regclass);
