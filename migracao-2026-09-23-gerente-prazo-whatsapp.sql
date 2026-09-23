-- =====================================================================================
-- Migrações de 23/09/2026: JÁ APLICADAS no Supabase (fuieonexmdupupcsyowg).
-- Este arquivo é o registro versionado do que está no banco; não precisa rodar de novo
-- (tudo é idempotente se rodar: create or replace / if not exists / drop if exists).
--
-- 1. Controle de Clientes: Mensalidade espelha o fee vigente (cobrança do mês em
--    Recebimentos, senão o cadastro); Remuneração Gerente (10%) e Remuneração Gestor
--    (R$100 padrão) calculadas pelo banco. Relato do Luiz: fee errado (Bueno/Santi),
--    projetos sem fee, remuneração indisponível.
-- 2. Gerente dono da carteira: no cliente em que é o gerente da ficha, mexe em tudo do
--    card; mensalidade/cadastro pelas RPCs cliente_mensalidade e cliente_atualizar.
-- 3. Prazo com horário: só hora cheia (HH:00), Brasília; tarefas.prazo_em pros webhooks.
-- 4. Tarefa da lista Campanhas que vai pra Concluído avisa o grupo de WhatsApp do squad
--    (squad 02 -> "SQUAD 2 - COMUNICAÇÃO", número do João via UAZAPI).
-- 5. Gerente cria espaço/pasta/lista e manda no que criou (compartilhar, fechar, excluir).
--
-- NÃO versionado de propósito: os tokens da UAZAPI (tabela segredos, chaves
-- uazapi_inst_<nome>). O do João foi cadastrado direto no banco em 23/09.
-- =====================================================================================

-- ---------- 1. Controle de Clientes: colunas automáticas ----------
update campos_lista set nome='Remuneração Gerente (10%)' where id='46c3b98b-6590-4aff-bf80-ed03801206c7';
insert into campos_lista (id,lista_id,nome,tipo,ordem,opcoes,largura,so_master,obrigatorio)
values ('b7e1c2a0-5d3f-4c8e-9a61-2f0d7c4e1a01','a0009b64-6847-4477-be46-3dade84d5409','Remuneração Gestor','moeda',4,'[]'::jsonb,150,true,false)
on conflict (id) do nothing;

CREATE OR REPLACE FUNCTION public.lc_ficha(p_ficha text)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select p from itens ip, jsonb_array_elements(ip.dados) p
   where ip.modulo='projetos' and p->>'id'=p_ficha limit 1
$function$;

-- fee vigente: cobrança do mês (Recebimentos) se tiver valor; senão, o cadastro
CREATE OR REPLACE FUNCTION public.lc_mens_de(p_ficha text)
 RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with cli as (
    select c from itens ip, jsonb_array_elements(ip.dados) p, itens ic, jsonb_array_elements(ic.dados) c
     where ip.modulo='projetos' and ic.modulo='clientes'
       and p->>'id'=p_ficha and c->>'id'=p->>'clienteId'
     limit 1
  ), rec as (
    select r from itens ir, jsonb_array_elements(ir.dados) r, cli
     where ir.modulo='recebimentos' and r->>'clienteId'=(cli.c->>'id')
       and r->>'comp'=to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM')
       and (r->>'valor') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$'
     limit 1
  )
  select coalesce(
    (select (r->>'valor')::numeric from rec),
    (select case when (c->>'valor') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then (c->>'valor')::numeric end from cli))
$function$;

-- Mensalidade + Rem. Gerente (10%, valor próprio fica até ser apagado) + Rem. Gestor (R$100 padrão)
CREATE OR REPLACE FUNCTION public.lc_auto(p_ficha text, p_val jsonb)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  k_mens text := '7fb37164-cc32-494c-a93c-c336afe163ea';
  k_ger  text := '46c3b98b-6590-4aff-bf80-ed03801206c7';
  k_gest text := 'b7e1c2a0-5d3f-4c8e-9a61-2f0d7c4e1a01';
  num text := '^\s*-?[0-9]+(\.[0-9]+)?\s*$';
  v jsonb := coalesce(p_val,'{}'::jsonb); f jsonb; m numeric; m0 numeric; g numeric;
begin
  if p_ficha is null then return v; end if;
  f := lc_ficha(p_ficha);
  m0 := case when (v->>k_mens) ~ num then (v->>k_mens)::numeric end;
  m := lc_mens_de(p_ficha);
  if m is not null then v := v || jsonb_build_object(k_mens, m); end if;
  m := case when (v->>k_mens) ~ num then (v->>k_mens)::numeric end;
  g := case when (v->>k_ger) ~ num then (v->>k_ger)::numeric end;
  if coalesce(trim(f->>'gerente'),'')<>'' and m is not null then
    if g is null or (m0 is not null and g = round(m0*0.10,2)) then
      v := v || jsonb_build_object(k_ger, round(m*0.10,2));
    end if;
  else v := v - k_ger; end if;
  if coalesce(trim(f->>'responsavel'),'')<>'' then
    if coalesce(v->>k_gest,'')='' then v := v || jsonb_build_object(k_gest, 100); end if;
  else v := v - k_gest; end if;
  return v;
end $function$;

CREATE OR REPLACE FUNCTION public.lc_sincronizar_mensalidades()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare n integer;
begin
  update tarefas t set valores=lc_auto(t.ficha_id, t.valores)
   where t.lista_id='a0009b64-6847-4477-be46-3dade84d5409' and t.ficha_id is not null
     and coalesce(t.valores,'{}'::jsonb) is distinct from lc_auto(t.ficha_id, t.valores);
  get diagnostics n=row_count;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.lc_mens_itens_tg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin perform lc_sincronizar_mensalidades(); return null; end $function$;

CREATE OR REPLACE FUNCTION public.lc_mens_tarefa_tg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if new.lista_id='a0009b64-6847-4477-be46-3dade84d5409' and new.ficha_id is not null then
    new.valores := lc_auto(new.ficha_id, new.valores);
  end if;
  return new;
end $function$;

drop trigger if exists trg_lc_mens_itens on public.itens;
create trigger trg_lc_mens_itens after insert or update on public.itens
  for each row when (new.modulo in ('clientes','projetos','recebimentos'))
  execute function public.lc_mens_itens_tg();
drop trigger if exists trg_lc_mens_tarefa on public.tarefas;
create trigger trg_lc_mens_tarefa before insert or update of lista_id, ficha_id on public.tarefas
  for each row execute function public.lc_mens_tarefa_tg();

-- ---------- 2. Gerente dono da carteira ----------
CREATE OR REPLACE FUNCTION public.gerente_da_ficha(p_ficha text)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select public.is_gerente() and exists (
    select 1 from itens i, jsonb_array_elements(i.dados) e, perfis p
     where i.modulo='projetos' and e->>'id'=p_ficha and p.id=auth.uid()
       and public.prim_nome(p.nome) is not null
       and public.prim_nome(e->>'gerente')=public.prim_nome(p.nome))
$function$;

-- trava das colunas do financeiro: master e o gerente da ficha mexem em tudo;
-- os demais só no valor exato que a automação calcula
CREATE OR REPLACE FUNCTION public.tarefas_trava_campos()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare r record; auto jsonb;
begin
  if is_master() then return new; end if;
  if new.ficha_id is not null and gerente_da_ficha(new.ficha_id)
     and (old.ficha_id is not distinct from new.ficha_id or gerente_da_ficha(old.ficha_id)) then
    return new;
  end if;
  for r in select id::text as cid, nome from campos_lista
            where lista_id=new.lista_id and so_master loop
    if coalesce(new.valores->>r.cid,'') is distinct from coalesce(old.valores->>r.cid,'') then
      if new.lista_id='a0009b64-6847-4477-be46-3dade84d5409' then
        if auto is null then auto := lc_auto(new.ficha_id, old.valores); end if;
        if (new.valores->r.cid) is not distinct from (auto->r.cid) then continue; end if;
      end if;
      raise exception 'O campo "%" só o master ou o gerente do cliente alteram.', r.nome;
    end if;
  end loop;
  return new;
end $function$;

-- mensalidade pelo gerente: 'rec' = daqui em diante (cadastro), 'mes' = só a cobrança do mês.
-- Gerente mexeu: abre tarefa em Novas Contas pro financeiro ajustar o Asaas + mrr_mudancas.
CREATE OR REPLACE FUNCTION public.cliente_mensalidade(p_ficha text, p_valor numeric, p_modo text, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_lista  uuid := 'c2000000-0000-4000-8000-0000000000b1';  -- Novas Contas (fila do financeiro)
  v_status uuid := 'c2000000-0000-4000-8000-00000000b101';  -- 1. SOLICITADO
  v_dono   uuid := '6b3b1d5d-2ee0-4529-a6c4-23d415678bff';  -- Bernardo Antunes
  v_quem uuid := auth.uid(); v_nome text; cid text; c jsonb; antes numeric; comp text;
  v_tipo text; v_tarefa uuid; dia int; ult int; y int; mo int; achou boolean;
begin
  if v_quem is null then raise exception 'sem sessão'; end if;
  if not (is_master() or gerente_da_ficha(p_ficha)) then
    raise exception 'só o master ou o gerente deste cliente mudam a mensalidade';
  end if;
  if p_modo not in ('rec','mes') then raise exception 'modo inválido'; end if;
  if p_valor is null or p_valor < 0 then raise exception 'valor inválido'; end if;
  select nome into v_nome from perfis where id=v_quem;
  cid := lc_ficha(p_ficha)->>'clienteId';
  if cid is null then raise exception 'cliente sem cadastro financeiro'; end if;
  select e into c from itens, jsonb_array_elements(dados) e where modulo='clientes' and e->>'id'=cid limit 1;
  if c is null then raise exception 'cliente não encontrado no cadastro'; end if;
  antes := case when (c->>'valor') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then (c->>'valor')::numeric else 0 end;
  comp := to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM');

  if p_modo='rec' then
    if p_valor = antes then return jsonb_build_object('ok',true,'mudou',false); end if;
    update itens t set dados=(select jsonb_agg(case
        when x.e->>'clienteId'=cid and x.e->>'comp'<comp and coalesce(x.e->>'valor','')=''
        then x.e||jsonb_build_object('valor',antes) else x.e end order by x.o)
      from jsonb_array_elements(t.dados) with ordinality x(e,o))
     where t.modulo='recebimentos';
    update itens t set dados=(select jsonb_agg(case when x.e->>'id'=cid
        then x.e||jsonb_build_object('valor',p_valor) else x.e end order by x.o)
      from jsonb_array_elements(t.dados) with ordinality x(e,o))
     where t.modulo='clientes';
  else
    select exists(select 1 from itens, jsonb_array_elements(dados) e
      where modulo='recebimentos' and e->>'clienteId'=cid and e->>'comp'=comp) into achou;
    if achou then
      update itens t set dados=(select jsonb_agg(case
          when x.e->>'clienteId'=cid and x.e->>'comp'=comp
          then x.e||jsonb_build_object('valor',p_valor) else x.e end order by x.o)
        from jsonb_array_elements(t.dados) with ordinality x(e,o))
       where t.modulo='recebimentos';
    else
      dia := case when (c->>'diaVenc') ~ '^[0-9]+$' then (c->>'diaVenc')::int end;
      y := split_part(comp,'-',1)::int; mo := split_part(comp,'-',2)::int;
      ult := extract(day from (make_date(y,mo,1) + interval '1 month - 1 day'))::int;
      update itens set dados=coalesce(dados,'[]'::jsonb)||jsonb_build_array(jsonb_build_object(
        'id',substr(md5(random()::text||clock_timestamp()::text),1,13),'comp',comp,'clienteId',cid,
        'nome',upper(coalesce(c->>'nome','')),'resp',coalesce(c->>'resp',''),'tel',coalesce(c->>'tel',''),
        'valor',p_valor,
        'venc',case when dia between 1 and 31 then to_char(make_date(y,mo,least(dia,ult)),'YYYY-MM-DD') end,
        'recebido',false,'recebidoEm',null,'status',null))
       where modulo='recebimentos';
    end if;
  end if;

  if not is_master() then
    v_tipo := case when p_valor>antes then 'upsell' when p_valor<antes then 'downsell' else 'vencimento' end;
    insert into tarefas (lista_id, titulo, descricao, status, status_id, prioridade, responsavel_id, responsaveis, criado_por)
    values (v_lista,
      left(case v_tipo when 'upsell' then 'Upsell' when 'downsell' then 'Downsell' else 'Mensalidade' end
           || case when p_modo='mes' then ' (só '||comp||')' else '' end || ': ' || coalesce(c->>'nome',''),160),
      'Aplicado no sistema por '||coalesce(v_nome,'?')||E'\n\n'||
      'Mensalidade: R$ '||to_char(antes,'FM999999990D00')||' → R$ '||to_char(p_valor,'FM999999990D00')||
      case when p_modo='mes' then ', só na cobrança de '||comp else ', daqui em diante' end||
      case when nullif(btrim(coalesce(p_motivo,'')),'') is null then '' else E'\n\n'||btrim(p_motivo) end||
      E'\n\nO cadastro e o card já estão com o valor novo. Falta ajustar a cobrança no Asaas.',
      'todo', v_status, 'med', v_dono, array[v_dono], v_quem)
    returning id into v_tarefa;
    if p_modo='rec' and v_tipo<>'vencimento' then
      insert into mrr_mudancas (cliente_id, cliente_nome, tipo, valor_antes, valor_novo, motivo, status,
                                tarefa_id, criado_por, aplicado_por, aplicado_em)
      values (cid, coalesce(c->>'nome',''), v_tipo, antes, p_valor, nullif(btrim(coalesce(p_motivo,'')),''),
              'aplicado', v_tarefa, v_quem, v_quem, now());
    end if;
  end if;
  return jsonb_build_object('ok',true,'mudou',true,'antes',antes,'depois',p_valor);
end $function$;

-- serviço, nicho e links da ficha vão pro cadastro (quem não é master não lê `clientes`)
CREATE OR REPLACE FUNCTION public.cliente_atualizar(p_ficha text, p_patch jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare cid text; limpo jsonb;
begin
  if auth.uid() is null then raise exception 'sem sessão'; end if;
  if not (is_master() or gerente_da_ficha(p_ficha)) then
    raise exception 'só o master ou o gerente deste cliente alteram o cadastro';
  end if;
  cid := lc_ficha(p_ficha)->>'clienteId';
  if cid is null then return jsonb_build_object('ok',false,'erro','sem cadastro'); end if;
  select coalesce(jsonb_object_agg(k, p_patch->k),'{}'::jsonb) into limpo
    from jsonb_object_keys(coalesce(p_patch,'{}'::jsonb)) k
   where k in ('servico','produtos','nicho','instagram','drive','grupoWpp')
     and jsonb_typeof(p_patch->k)='string';
  if limpo='{}'::jsonb then return jsonb_build_object('ok',true,'mudou',false); end if;
  update itens t set dados=(select jsonb_agg(case when x.e->>'id'=cid
      then x.e||limpo else x.e end order by x.o)
    from jsonb_array_elements(t.dados) with ordinality x(e,o))
   where t.modulo='clientes'
     and exists (select 1 from jsonb_array_elements(t.dados) e where e->>'id'=cid and (e||limpo) is distinct from e);
  return jsonb_build_object('ok',true);
end $function$;

revoke all on function public.lc_mens_de(text) from public, anon, authenticated;
revoke all on function public.lc_ficha(text) from public, anon, authenticated;
revoke all on function public.lc_auto(text, jsonb) from public, anon, authenticated;
revoke all on function public.lc_sincronizar_mensalidades() from public, anon, authenticated;
revoke all on function public.lc_mens_itens_tg() from public, anon, authenticated;
revoke all on function public.lc_mens_tarefa_tg() from public, anon, authenticated;
revoke all on function public.gerente_da_ficha(text) from public, anon, authenticated;
revoke all on function public.cliente_mensalidade(text,numeric,text,text) from public, anon;
revoke all on function public.cliente_atualizar(text,jsonb) from public, anon;
grant execute on function public.cliente_mensalidade(text,numeric,text,text) to authenticated;
grant execute on function public.cliente_atualizar(text,jsonb) to authenticated;

-- ---------- 3. Prazo com horário (só hora cheia, Brasília) ----------
alter table public.tarefas drop constraint if exists tarefas_hora_cheia;
alter table public.tarefas
  add constraint tarefas_hora_cheia check (hora is null or hora ~ '^([01][0-9]|2[0-3]):00$');
alter table public.tarefas
  add column if not exists prazo_em timestamptz
  generated always as (
    case when prazo is not null and hora ~ '^([01][0-9]|2[0-3]):00$'
         then timezone('America/Sao_Paulo', prazo + make_time(substr(hora,1,2)::int, 0, 0))
    end) stored;
comment on column public.tarefas.hora is 'Horario do prazo, so hora cheia (HH:00), horario de Brasilia. Nulo = prazo so com data.';
comment on column public.tarefas.prazo_em is 'Prazo com horario em timestamptz (America/Sao_Paulo). Nulo quando o prazo nao tem hora; use `prazo` nesse caso.';

-- ---------- 4. Campanha concluída -> grupo de WhatsApp do squad ----------
-- config (sem token): segredos 'wa_grupo_squad_<squad>' = {"inst":"<apelido>","chat":"<id>@g.us","nome":"..."}
insert into segredos (chave, valor, descricao, atualizado_em) values
 ('wa_grupo_squad_02', '{"inst":"joao","chat":"120363424663848929@g.us","nome":"SQUAD 2 - COMUNICAÇÃO"}',
  'Grupo que recebe as campanhas concluidas do squad 02 (numero do Joao)', now())
on conflict (chave) do nothing;

CREATE OR REPLACE FUNCTION public.wa_aviso_concluida()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_campanhas uuid := 'cd04ad6e-0cd2-4838-b050-49fcfebafe05';
  gr_novo text; gr_velho text; sq text; cfg jsonb; url text; tok text;
  cli text; resp text; ator text; msg text;
begin
  if new.lista_id is distinct from v_campanhas then return new; end if;
  select grupo into gr_novo from status_lista where id=new.status_id;
  if coalesce(gr_novo,'') <> 'feito' then return new; end if;
  if TG_OP='UPDATE' then
    if old.status_id is not distinct from new.status_id and old.lista_id is not distinct from new.lista_id then return new; end if;
    select grupo into gr_velho from status_lista where id=old.status_id;
    if old.lista_id = v_campanhas and coalesce(gr_velho,'')='feito' then return new; end if;
  end if;

  sq := coalesce(nullif(trim(new.squad),''), nullif(trim(squad_da_ficha(new.ficha_id)),''));
  if sq is null then return new; end if;
  select valor::jsonb into cfg from segredos where chave='wa_grupo_squad_'||sq;
  if cfg is null or coalesce(cfg->>'chat','')='' then return new; end if;
  select rtrim(valor,'/') into url from segredos where chave='uazapi_url';
  select valor into tok from segredos where chave='uazapi_inst_'||coalesce(cfg->>'inst','');
  if url is null or tok is null then return new; end if;

  cli := case when new.ficha_id is not null then (lc_ficha(new.ficha_id)->>'nome') end;
  select string_agg(p.nome, ', ') into resp from perfis p
   where p.id = any(coalesce(new.responsaveis, case when new.responsavel_id is null then '{}'::uuid[] else array[new.responsavel_id] end));
  select nome into ator from perfis where id=auth.uid();

  msg := '*Tarefa concluída*' || E'\n' || coalesce(new.titulo,'(sem título)')
      || case when cli is not null then E'\nCliente: ' || cli else '' end
      || case when resp is not null then E'\nResponsável: ' || resp else '' end
      || case when ator is not null then E'\nConcluída por: ' || ator else '' end
      || E'\n' || to_char(now() at time zone 'America/Sao_Paulo','DD/MM "às" HH24:MI')
      || E'\nhttps://autosintese.app.br/#t/' || new.id;

  begin
    perform net.http_post(
      url := url || '/send/text',
      body := jsonb_build_object('number', cfg->>'chat', 'text', msg, 'linkPreview', false),
      headers := jsonb_build_object('token', tok, 'Content-Type', 'application/json'),
      timeout_milliseconds := 10000);
  exception when others then
    raise warning 'wa_aviso_concluida: nao enviou (%)', sqlerrm;
  end;
  return new;
end $function$;
revoke all on function public.wa_aviso_concluida() from public, anon, authenticated;
drop trigger if exists trg_wa_aviso_concluida on public.tarefas;
create trigger trg_wa_aviso_concluida after insert or update of status_id, lista_id on public.tarefas
  for each row execute function public.wa_aviso_concluida();

-- ---------- 5. Gerente cria e manda no que criou ----------
alter table public.espacos add column if not exists criado_por uuid default auth.uid();
alter table public.pastas  add column if not exists criado_por uuid default auth.uid();
alter table public.listas  add column if not exists criado_por uuid default auth.uid();

CREATE OR REPLACE FUNCTION public.no_gerenciavel(p_tipo text, p_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select public.is_master() or (public.is_gerente() and auth.uid() is not null and auth.uid() = (
    case p_tipo when 'espaco' then (select criado_por from espacos where id=p_id)
                when 'pasta'  then (select criado_por from pastas  where id=p_id)
                when 'lista'  then (select criado_por from listas  where id=p_id) end))
$function$;

-- gerente criou: vira membro 'editar'; espaço da empresa nasce privado
CREATE OR REPLACE FUNCTION public.no_criado_tg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare tp text := case TG_TABLE_NAME when 'espacos' then 'espaco' when 'pastas' then 'pasta' else 'lista' end;
begin
  if auth.uid() is null or is_master() or not is_gerente() then return new; end if;
  new.criado_por := auth.uid();
  if tp='espaco' then
    if exists (select 1 from workspaces w where w.id=((to_jsonb(new)->>'workspace_id')::uuid) and w.tipo='empresa') then
      new := jsonb_populate_record(new, jsonb_build_object('privado', true));
    end if;
  end if;
  insert into no_membros (tipo, no_id, user_id, permissao, criado_por)
  values (tp, new.id, auth.uid(), 'editar', auth.uid())
  on conflict (tipo, no_id, user_id) do update set permissao='editar';
  return new;
end $function$;
revoke all on function public.no_criado_tg() from public, anon, authenticated;

drop trigger if exists trg_no_criado on public.espacos;
drop trigger if exists trg_no_criado on public.pastas;
drop trigger if exists trg_no_criado on public.listas;
create trigger trg_no_criado before insert on public.espacos for each row execute function public.no_criado_tg();
create trigger trg_no_criado before insert on public.pastas  for each row execute function public.no_criado_tg();
create trigger trg_no_criado before insert on public.listas  for each row execute function public.no_criado_tg();

drop policy if exists no_membros_gerente on public.no_membros;
create policy no_membros_gerente on public.no_membros for all to authenticated
  using (public.no_gerenciavel(tipo, no_id)) with check (public.no_gerenciavel(tipo, no_id));
