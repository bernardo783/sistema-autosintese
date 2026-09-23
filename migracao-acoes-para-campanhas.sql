-- Ações do Dia → Campanhas (Gabriel 23/09/2026) — JÁ APLICADA via MCP (186 tarefas movidas, lista removida)
-- "Deixa tudo em Campanhas; o que tem nas Ações do Dia vai pra Campanhas e o histórico não pode ser apagado."
-- ATENÇÃO: tarefas.lista_id é ON DELETE CASCADE — apagar a lista antes de mover apagaria as tarefas.
-- Por isso: move tudo, confere que ficou vazia (senão aborta) e só então remove a lista.
begin;
-- sem 186 avisos "➡ tarefa → Pendente" pra equipe, e sem mexer no "atualizada em" do histórico
alter table public.tarefas disable trigger trg_ntf_tarefas;
alter table public.tarefas disable trigger tarefas_touch_trg;

update public.tarefas set
  lista_id  = 'cd04ad6e-0cd2-4838-b050-49fcfebafe05',
  status_id = case
    when status_id = 'da11a000-0000-4000-8000-0000000000a1' then '4bcaa499-0d3b-4f7c-a371-44fcde20c3ca'::uuid  -- A fazer → Pendente
    when status_id = 'da11a000-0000-4000-8000-0000000000a2' then '112201f6-21e7-4276-bcd6-30d89fbc440b'::uuid  -- Fazendo → Em progresso
    when status_id = 'da11a000-0000-4000-8000-0000000000a3' then '3c53c4fb-a2ed-4535-b539-14606e56eb78'::uuid  -- Feito → Concluído
    when status = 'feito'   then '3c53c4fb-a2ed-4535-b539-14606e56eb78'::uuid
    when status = 'fazendo' then '112201f6-21e7-4276-bcd6-30d89fbc440b'::uuid
    else '4bcaa499-0d3b-4f7c-a371-44fcde20c3ca'::uuid end
where lista_id = 'da11a000-0000-4000-8000-000000000001';

alter table public.tarefas enable trigger trg_ntf_tarefas;
alter table public.tarefas enable trigger tarefas_touch_trg;

-- vídeo aprovado na Edição agora vira "Subir vídeo" em Campanhas, coluna Pendente
create or replace function public.espelhar_video()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_edv   uuid := '23b91ffd-0afa-4db1-8239-444bce201aad';   -- Edicao de Video
  v_dest  uuid := 'cd04ad6e-0cd2-4838-b050-49fcfebafe05';   -- Campanhas (era Acoes do Dia)
  v_st    uuid := '4bcaa499-0d3b-4f7c-a371-44fcde20c3ca';   -- coluna Pendente
  v_campo text; v_link text; v_gestor uuid; v_cliente text;
begin
  if NEW.lista_id <> v_edv then return NEW; end if;
  if NEW.status <> 'feito' then return NEW; end if;
  if TG_OP='UPDATE' and OLD.status = 'feito' then return NEW; end if;
  if exists (select 1 from tarefas t where t.espelho_de = NEW.id) then return NEW; end if;
  select c.id::text into v_campo from campos_lista c where c.lista_id = v_edv and c.nome = 'Vídeo final' limit 1;
  if v_campo is not null then v_link := NEW.valores->>v_campo; end if;
  select p.id into v_gestor from perfis p where p.cargo = 'gestor de trafego' and coalesce(NEW.squad,'') = any(p.squads) limit 1;
  select e->>'nome' into v_cliente from itens, jsonb_array_elements(dados) e where modulo='projetos' and e->>'id' = NEW.ficha_id limit 1;
  insert into tarefas (lista_id, status_id, titulo, descricao, ficha_id, squad, responsavel_id,
                       responsaveis, prazo, status, prioridade, espelho_de, criado_por)
  values (v_dest, v_st,
          'Subir video: ' || coalesce(v_cliente, NEW.titulo),
          case when v_link is null or v_link='' then 'Video aprovado na edicao. O link do material editado ainda nao foi preenchido.'
               else 'Material editado: ' || v_link end,
          NEW.ficha_id, NEW.squad, v_gestor,
          case when v_gestor is null then '{}'::uuid[] else array[v_gestor] end,
          current_date, 'todo', 'med', NEW.id, NEW.criado_por);
  return NEW;
end $function$;

-- trava: se sobrou QUALQUER tarefa, aborta tudo (o cascade apagaria)
do $$ begin
  if exists (select 1 from public.tarefas where lista_id = 'da11a000-0000-4000-8000-000000000001') then
    raise exception 'Ainda há tarefas em Ações do Dia — nada foi apagado.';
  end if;
end $$;

delete from public.no_membros where no_id = 'da11a000-0000-4000-8000-000000000001';
delete from public.listas where id = 'da11a000-0000-4000-8000-000000000001';   -- leva junto as 3 colunas dela
commit;
