-- NPS no sistema, no lugar do Yay Forms (Gabriel 30/09).
-- Três formulários, um por serviço: autosintese.app.br/nps/trafego, /nps/agent-ia e
-- /nps/trafego-agent-ia. Toda vez que um card vai para o Controle de Churns, o banco
-- cria a pesquisa de saída daquele cliente (uma linha em pesquisa_satisfacao, ainda
-- sem respostas) e avisa o gerente da ficha no sininho. O link do cliente leva o id
-- dessa linha (?r=<id>), então a resposta já chega ligada à ficha e ao gerente.
--
-- A tabela, a edge 'pesquisa' e o aviso de resposta nasceram em
-- migracao-2026-09-23-pesquisa-satisfacao.sql (já aplicada, tabela vazia). Aqui ela
-- deixa de depender de /joao e /luiz: o gerente é o da ficha, qualquer um.

-- 1. A tabela aceita qualquer gerente, sabe o tipo da pesquisa e de qual ficha ela é
alter table public.pesquisa_satisfacao drop constraint if exists pesquisa_satisfacao_gerente_check;
alter table public.pesquisa_satisfacao alter column gerente drop not null;
alter table public.pesquisa_satisfacao
  add column if not exists tipo text not null default 'mensal',
  add column if not exists ficha_id text,
  add column if not exists tarefa_id uuid references public.tarefas(id) on delete set null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname='pesquisa_satisfacao_tipo_check') then
    alter table public.pesquisa_satisfacao add constraint pesquisa_satisfacao_tipo_check check (tipo in ('mensal','churn'));
  end if;
  if not exists (select 1 from pg_constraint where conname='pesquisa_satisfacao_gerente_tam') then
    alter table public.pesquisa_satisfacao add constraint pesquisa_satisfacao_gerente_tam check (char_length(gerente) <= 80);
  end if;
end $$;
create index if not exists pesquisa_satisfacao_ficha on public.pesquisa_satisfacao (ficha_id) where ficha_id is not null;

-- 2. Tipo do cliente na ficha (Projetos) -> qual dos três formulários
create or replace function public.nps_servico(p_cat text)
returns text language sql immutable as $$
  select case p_cat when 'trafego' then 'trafego' when 'ia' then 'ia' when 'full' then 'integrados' end
$$;

-- 3. Garante a pesquisa de saída em aberto de uma ficha (uso interno: gatilho e RPC)
create or replace function public.pesquisa_churn_criar(p_ficha text, p_tarefa uuid)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid; f jsonb; v_nome text;
begin
  select id into v_id from pesquisa_satisfacao
   where ficha_id = p_ficha and tipo = 'churn' and enviado_em is null
   order by criado_em desc limit 1;
  if v_id is not null then return v_id; end if;
  f := lc_ficha(p_ficha);
  v_nome := nullif(trim(coalesce(f->>'nome', (select titulo from tarefas where id = p_tarefa), '')), '');
  insert into pesquisa_satisfacao (id, tipo, ficha_id, tarefa_id, loja, servico, gerente, gerente_id)
  values (gen_random_uuid(), 'churn', p_ficha, p_tarefa,
          case when char_length(v_nome) >= 2 then left(v_nome, 200) end,
          nps_servico(f->>'categoria'),
          nullif(left(trim(coalesce(f->>'gerente', '')), 80), ''),
          perfil_por_nome(f->>'gerente'))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.pesquisa_churn_criar(text, uuid) from public, anon, authenticated;

-- 4. Card entrou no Controle de Churns: cria a pesquisa de saída e avisa o gerente da
--    ficha (sem gerente na ficha, avisa os masters). Card saiu de lá (cliente voltou):
--    a pesquisa que ninguém respondeu some. Nunca trava o churn: erro vira só aviso no log.
create or replace function public.nps_churn_tg()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_ch uuid := 'c1000000-0000-4000-8000-000000000001';   -- Controle de Churns
  v_ger uuid; v_cli text;
begin
  begin
    if NEW.ficha_id is null then return NEW; end if;
    if NEW.lista_id = v_ch and (TG_OP = 'INSERT' or OLD.lista_id is distinct from v_ch) then
      perform pesquisa_churn_criar(NEW.ficha_id, NEW.id);
      select gerente_id, loja into v_ger, v_cli from pesquisa_satisfacao
       where ficha_id = NEW.ficha_id and tipo = 'churn' and enviado_em is null
       order by criado_em desc limit 1;
      insert into notificacoes (para, titulo, texto, ficha_id, criado_por)
      select p.id, 'Pesquisa de saída: ' || coalesce(v_cli, NEW.titulo, 'cliente'),
             'O cliente foi para o Controle de Churns. Abra a ficha e envie o link da pesquisa de saída.',
             NEW.ficha_id, auth.uid()
        from perfis p
       where p.aprovado and (p.id = v_ger or (v_ger is null and p.role = 'master'));
    elsif TG_OP = 'UPDATE' and OLD.lista_id = v_ch and NEW.lista_id is distinct from v_ch then
      delete from pesquisa_satisfacao
       where ficha_id = NEW.ficha_id and tipo = 'churn' and enviado_em is null;
    end if;
  exception when others then
    raise warning 'nps_churn_tg: pesquisa de saida nao foi criada (%)', sqlerrm;
  end;
  return NEW;
end $$;

drop trigger if exists trg_nps_churn on public.tarefas;
create trigger trg_nps_churn after insert or update of lista_id on public.tarefas
  for each row execute function public.nps_churn_tg();

-- 5. O botão "Pesquisa de saída" da ficha: devolve o link do cliente que está no
--    Controle de Churns (cria a pesquisa se ainda não existe, caso dos churns antigos).
create or replace function public.pesquisa_churn_link(p_ficha text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_ch uuid := 'c1000000-0000-4000-8000-000000000001';
  v_t uuid; r pesquisa_satisfacao;
begin
  if not (is_master() or gerente_da_ficha(p_ficha)) then
    raise exception 'Só o master ou o gerente do cliente abre a pesquisa de saída.';
  end if;
  select id into v_t from tarefas where lista_id = v_ch and ficha_id = p_ficha order by criado_em desc limit 1;
  if v_t is null then raise exception 'Este cliente não está no Controle de Churns.'; end if;
  -- a que está em aberto primeiro; se não há, a última respondida
  select * into r from pesquisa_satisfacao
   where ficha_id = p_ficha and tipo = 'churn'
   order by (enviado_em is null) desc, criado_em desc limit 1;
  if r.id is null then
    select * into r from pesquisa_satisfacao where id = pesquisa_churn_criar(p_ficha, v_t);
  end if;
  return jsonb_build_object('id', r.id, 'servico', r.servico, 'loja', r.loja, 'enviado_em', r.enviado_em);
end $$;
revoke all on function public.pesquisa_churn_link(text) from public, anon;
grant execute on function public.pesquisa_churn_link(text) to authenticated;

-- 6. Aviso no sininho quando a avaliação é concluída: masters + o gerente dela.
--    Pesquisa de saída leva a ficha junto (clicar no aviso abre o cliente).
--    Sem emoji e sem travessão (regra do sistema).
create or replace function public.ntf_pesquisa_satisfacao()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare alerta boolean; tit text;
begin
  if (tg_op='INSERT' and new.enviado_em is not null)
     or (tg_op='UPDATE' and old.enviado_em is null and new.enviado_em is not null) then
    alerta := coalesce(new.nps,10) <= 6
           or coalesce(new.dependencia,10) <= 5
           or length(regexp_replace(coalesce(new.ponto_critico,''),'^\s*(n[aã]o|nenhum[a]?|nada|n/?a|-|\.)?\s*\.?\s*$','','i')) > 0;
    tit := case when new.tipo = 'churn' then 'Pesquisa de saída respondida: '
                when alerta then 'Avaliação com alerta: '
                else 'Avaliação recebida: ' end
           || coalesce(new.loja,'(sem nome)');
    insert into notificacoes(para, titulo, texto, ficha_id)
    select p.id, tit,
           'Nota de indicação '||coalesce(new.nps::text,'-')
           ||coalesce(', gerente '||nullif(split_part(trim(new.gerente),' ',1),''),'')
           ||case when coalesce(new.dependencia,10) <= 5 then ', baixa dependência ('||new.dependencia||')' else '' end,
           new.ficha_id
    from perfis p
    where p.aprovado and (p.role='master' or p.id = new.gerente_id);
  end if;
  return new;
end $$;

-- 7. A tela do painel mora na árvore: Projetos > Pesquisa de Satisfação (lista-tela, sem
--    tarefas). Só entra junto com a publicação do index.html que sabe abrir a tela.
insert into public.listas (id, espaco_id, nome, ordem, icone, privado)
values ('f1e2d3c4-0000-4a00-8b00-00000000b001','b5063e34-0d77-4200-9210-14c75adc176e','Pesquisa de Satisfação',3,'svg:grafico',false)
on conflict (id) do nothing;
