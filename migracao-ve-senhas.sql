-- Cofre de senhas liberado por pessoa (Gabriel 23/09/2026: "libera o acesso de
-- senhas pro gerente João").
--
-- Antes: o módulo 'senhas' do itens era só do master (migracao-daily.sql, passo 6).
-- Agora: master OU quem tem perfis.ve_senhas = true. Só master liga o campo
-- (UPDATE em perfis já é só master; salvar_meu_perfil não toca nele).
-- O index.html foi ajustado junto (podeSenhas()): a aba Senhas aparece e o
-- saveDB passa a gravar esse módulo para quem tem o campo ligado.

alter table public.perfis add column if not exists ve_senhas boolean not null default false;

create or replace function public.pode_senhas() returns boolean
  language sql stable security definer set search_path = public as $$
  select is_master() or exists (
    select 1 from public.perfis p
     where p.id = auth.uid() and p.aprovado and p.ve_senhas)
$$;
revoke all on function public.pode_senhas() from public;
grant execute on function public.pode_senhas() to authenticated;

drop policy if exists aprovados_leem on public.itens;
create policy aprovados_leem on public.itens for select
  using (is_aprovado() and (is_master()
     or modulo = any (array['projetos','links','trafego','contas_meta'])
     or (modulo = 'senhas' and pode_senhas())));

drop policy if exists aprovados_atualizam on public.itens;
create policy aprovados_atualizam on public.itens for update
  using (is_aprovado() and (is_master()
     or modulo = any (array['projetos','links','trafego','contas_meta'])
     or (modulo = 'senhas' and pode_senhas())))
  with check (is_aprovado() and (is_master()
     or modulo = any (array['projetos','links','trafego','contas_meta'])
     or (modulo = 'senhas' and pode_senhas())));
-- insert/delete continuam como estão: a linha 'senhas' já existe, e apagar o
-- cofre inteiro segue só com master.

-- João (gerente do squad 02)
update public.perfis set ve_senhas = true
 where id = '7d2d310a-0490-4e83-a660-8b4fe9c75e1a';

-- Confere ------------------------------------------------------
select p.nome, p.role, p.ve_senhas from public.perfis p
 where p.role = 'master' or p.ve_senhas order by p.nome;
