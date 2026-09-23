-- Acessos (Administrativo) para TODOS os usuários (Gabriel 23/09/2026:
-- "todos usuários devem ter acesso a aba acessos do administrativo").
--
-- A lista Acessos (f1e2d3c4-...a001) é uma tela, não guarda tarefa. Quem não
-- tem convite no caminho dela (espaço Administrativo, pasta e a própria lista,
-- quando fechados) não enxerga o nó na árvore. Aqui cada usuário aprovado
-- ganha convite 'ver' SÓ nos nós fechados desse caminho — e todo usuário
-- aprovado no futuro ganha o mesmo, por trigger.
--
-- 'ver' e não 'editar': a tela Acessos grava links/senhas no itens (com regra
-- própria), não em tarefas; ninguém ganha poder de editar listas do
-- Administrativo. Convite que a pessoa já tinha (ex.: 'editar') fica como está.
--
-- O index.html foi ajustado junto: Acessos saiu da lista de telas que dá pra
-- desligar por usuário (igual ao Suporte).
-- Idempotente: pode rodar de novo.

create or replace function public.liberar_acessos(p_uid uuid) returns void
  language plpgsql security definer set search_path = public as $$
declare
  v_lista uuid := 'f1e2d3c4-0000-4a00-8b00-00000000a001';
  v_pasta uuid; v_espaco uuid;
begin
  select pasta_id, espaco_id into v_pasta, v_espaco from public.listas where id = v_lista;
  insert into public.no_membros (tipo, no_id, user_id, permissao)
  select n.tipo, n.id, p_uid, 'ver'
    from (select 'espaco'::text tipo, id, privado from public.espacos where id = v_espaco
          union all
          select 'pasta', id, privado from public.pastas where id = v_pasta
          union all
          select 'lista', id, privado from public.listas where id = v_lista) n
   where n.privado
  on conflict (tipo, no_id, user_id) do nothing;
end $$;
revoke all on function public.liberar_acessos(uuid) from public, anon, authenticated;

-- Todo mundo que já está aprovado
select public.liberar_acessos(p.id) from public.perfis p where p.aprovado and p.role <> 'master';

-- Quem for aprovado daqui pra frente
create or replace function public.liberar_acessos_tg() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.aprovado and (tg_op = 'INSERT' or not coalesce(old.aprovado, false)) then
    perform public.liberar_acessos(new.id);
  end if;
  return new;
end $$;
drop trigger if exists perfis_liberar_acessos on public.perfis;
create trigger perfis_liberar_acessos after insert or update of aprovado on public.perfis
  for each row execute function public.liberar_acessos_tg();

-- Confere: o que fica aberto no Administrativo para quem só tem esse convite.
-- (listas e pastas NÃO fechadas do mesmo espaço aparecem junto — é a regra da árvore)
with a as (select pasta_id, espaco_id from public.listas where id = 'f1e2d3c4-0000-4a00-8b00-00000000a001')
select 'pasta' tipo, p.nome, p.privado from public.pastas p, a where p.espaco_id = a.espaco_id
union all
select 'lista', l.nome, l.privado from public.listas l, a where l.espaco_id = a.espaco_id
order by 1, 2;
