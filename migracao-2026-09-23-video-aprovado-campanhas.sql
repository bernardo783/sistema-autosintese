-- =====================================================================================
-- Vídeo aprovado -> demanda em Campanhas + aviso (23/09/2026). JÁ APLICADA no Supabase.
--
-- Pedido do Gabriel: vídeo concluído na Edição de Vídeo (APROVADO, pela Madu) vira demanda
-- em Marketing > Tráfego Pago > Campanhas, já em Pendente, atribuída ao GESTOR DA FICHA do
-- cliente (Projetos), com a coluna "Gestor de Tráfego" preenchida. NUNCA pelo squad: a
-- hierarquia de squad não bate com a carteira de cada gestor/gerente.
-- Avisa: o gestor pelo "Atribuída a você" do sistema (trg_ntf_tarefas), o gerente da ficha
-- por notificação própria, e o grupo de WhatsApp do responsável, marcando gestor e gerente
-- quando há telefone.
--
-- Grupo = rota do RESPONSÁVEL, a mesma do botão "Notificar responsável" (edge lembrete-tarefa):
--   Luan  -> SQUAD1                 (pelo WhatsApp do Luiz)
--   Yghor -> SQUAD 2 - COMUNICAÇÃO  (pelo WhatsApp do João)
--   ficha sem gestor -> grupo do gerente (Luiz -> SQUAD1, João -> SQUAD 2)
-- Reusa os segredos lembrete_inst_<gerente> (token) e lembrete_jid_<grupo> (JID); os tokens
-- NÃO estão neste arquivo. Se as ROTAS da edge mudarem, atualizar wa_rota_campanhas_*.
--
-- O app (index.html, tkSetStatus) criava um segundo card "[VÍDEO]" por cima deste trigger;
-- esse trecho saiu no mesmo commit.
-- =====================================================================================

insert into segredos (chave, valor, descricao, atualizado_em) values
 ('wa_rota_campanhas_luan',  '{"inst":"lembrete_inst_luiz","jid":"lembrete_jid_squad1","nome":"SQUAD1"}', 'Campanhas: grupo do Luan', now()),
 ('wa_rota_campanhas_luiz',  '{"inst":"lembrete_inst_luiz","jid":"lembrete_jid_squad1","nome":"SQUAD1"}', 'Campanhas: grupo do gerente Luiz (demanda sem gestor)', now()),
 ('wa_rota_campanhas_yghor', '{"inst":"lembrete_inst_joao","jid":"lembrete_jid_squad2comunicacao","nome":"SQUAD 2 - COMUNICAÇÃO"}', 'Campanhas: grupo do Yghor', now()),
 ('wa_rota_campanhas_joao',  '{"inst":"lembrete_inst_joao","jid":"lembrete_jid_squad2comunicacao","nome":"SQUAD 2 - COMUNICAÇÃO"}', 'Campanhas: grupo do gerente Joao (demanda sem gestor)', now())
on conflict (chave) do update set valor=excluded.valor, descricao=excluded.descricao, atualizado_em=now();

-- pessoa da equipe pelo nome escrito na ficha (primeiro nome, como o resto do sistema)
CREATE OR REPLACE FUNCTION public.perfil_por_nome(p_nome text)
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select id from perfis
   where aprovado and prim_nome(nome) is not null and prim_nome(nome)=prim_nome(p_nome)
   order by (role='master') , nome limit 1
$function$;

-- telefone pra marcar no WhatsApp: perfil, senão o número uazapi_fone_<nome>
CREATE OR REPLACE FUNCTION public.wa_fone_de(p_user uuid)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare d text; n text;
begin
  if p_user is null then return null; end if;
  select regexp_replace(coalesce(telefone,''),'\D','','g'), prim_nome(nome) into d, n from perfis where id=p_user;
  if coalesce(d,'')='' then
    select regexp_replace(coalesce(valor,''),'\D','','g') into d from segredos where chave='uazapi_fone_'||n;
  end if;
  if coalesce(d,'')='' then return null; end if;
  if length(d)<=11 then d := '55'||d; end if;
  return d;
end $function$;

-- rota -> {token, chat, nome}; tenta cada pessoa na ordem (gestor, depois gerente)
CREATE OR REPLACE FUNCTION public.wa_rota_campanhas(p_pessoas uuid[])
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare u uuid; cfg jsonb; tok text; chat text;
begin
  foreach u in array coalesce(p_pessoas,'{}') loop
    continue when u is null;
    select valor::jsonb into cfg from segredos where chave='wa_rota_campanhas_'||(select prim_nome(nome) from perfis where id=u);
    continue when cfg is null;
    select valor into tok  from segredos where chave=cfg->>'inst';
    select valor into chat from segredos where chave=cfg->>'jid';
    if coalesce(tok,'')<>'' and coalesce(chat,'')<>'' then
      return jsonb_build_object('token',tok,'chat',chat,'nome',cfg->>'nome');
    end if;
  end loop;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.espelhar_video()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_edv   uuid := '23b91ffd-0afa-4db1-8239-444bce201aad';   -- Edicao de Video
  v_dest  uuid := 'cd04ad6e-0cd2-4838-b050-49fcfebafe05';   -- Campanhas
  v_pend  uuid := '4bcaa499-0d3b-4f7c-a371-44fcde20c3ca';   -- Pendente
  k_gest  text := '23e19830-84d4-4fc1-be91-c6b8fceb1fbb';   -- Campanhas: Gestor de Trafego
  k_video text := '60f41d3f-0dd5-4700-90f1-87729c60808b';   -- Edicao: Video final
  k_lcg   text := '35cf51e0-c581-473d-8b16-065f4b0e3dc3';   -- Controle de Clientes: Gestor de Trafego
  gr_n text; gr_v text; f jsonb; v_cli text; v_link text; v_gestor uuid; v_gerente uuid;
  v_sq text; v_id uuid; val jsonb; rota jsonb; url text; ator text;
  fg text; fr text; linha_g text; linha_r text; ments text[] := '{}'; msg text;
begin
  if NEW.lista_id is distinct from v_edv then return NEW; end if;
  select grupo into gr_n from status_lista where id=NEW.status_id;
  if not (coalesce(gr_n,'')='feito' or (NEW.status_id is null and NEW.status='feito')) then return NEW; end if;
  if TG_OP='UPDATE' then
    select grupo into gr_v from status_lista where id=OLD.status_id;
    if coalesce(gr_v,'')='feito' or (OLD.status_id is null and OLD.status='feito') then return NEW; end if;
  end if;
  if exists (select 1 from tarefas t where t.espelho_de = NEW.id) then return NEW; end if;

  f := case when NEW.ficha_id is not null then lc_ficha(NEW.ficha_id) end;
  v_cli := f->>'nome';
  v_link := nullif(trim(coalesce(NEW.valores->>k_video,'')),'');
  -- gestor: o da ficha (Projetos); ficha vazia -> o do card no Controle de Clientes. Nunca o do squad.
  v_gestor := perfil_por_nome(f->>'responsavel');
  if v_gestor is null and NEW.ficha_id is not null then
    select (t.valores->>k_lcg)::uuid into v_gestor from tarefas t
     where t.lista_id='a0009b64-6847-4477-be46-3dade84d5409' and t.ficha_id=NEW.ficha_id
       and (t.valores->>k_lcg) ~ '^[0-9a-f-]{36}$' limit 1;
  end if;
  v_gerente := perfil_por_nome(f->>'gerente');
  v_sq := coalesce(nullif(trim(f->>'squad'),''), nullif(trim(NEW.squad),''));

  val := case when v_gestor is null then '{}'::jsonb else jsonb_build_object(k_gest, v_gestor) end;
  insert into tarefas (lista_id, status_id, titulo, descricao, ficha_id, squad, responsavel_id,
                       responsaveis, prazo, status, prioridade, espelho_de, criado_por, valores)
  values (v_dest, v_pend,
          left('Subir vídeo: ' || coalesce(nullif(trim(NEW.titulo),''), v_cli, 'vídeo'), 200),
          'Vídeo aprovado na Edição de Vídeo' || coalesce(' ('||v_cli||')','') || '.'
            || case when v_link is null then E'\nO link do vídeo final ainda não foi preenchido na edição.'
                    else E'\nVídeo final: ' || v_link end
            || case when nullif(trim(coalesce(NEW.descricao,'')),'') is null then ''
                    else E'\n\nDa edição:\n' || NEW.descricao end,
          NEW.ficha_id, v_sq, v_gestor,
          case when v_gestor is null then '{}'::uuid[] else array[v_gestor] end,
          current_date, 'todo', coalesce(NEW.prioridade,'med'), NEW.id,
          coalesce(auth.uid(), NEW.criado_por), val)
  returning id into v_id;

  -- aviso no sistema pro gerente da ficha (o gestor ja recebe "Atribuida a voce")
  if v_gerente is not null and v_gerente is distinct from auth.uid() and v_gerente is distinct from v_gestor then
    insert into notificacoes (para, titulo, texto, tarefa_id, criado_por)
    values (v_gerente, 'Vídeo pronto: ' || coalesce(v_cli, NEW.titulo),
            'Demanda de subir aberta em Campanhas' || coalesce(' para ' || (select nome from perfis where id=v_gestor), ', sem gestor na ficha'),
            v_id, auth.uid());
  end if;

  -- aviso no grupo do responsavel (rota da Campanhas); nunca trava a aprovacao
  begin
    rota := wa_rota_campanhas(array[v_gestor, v_gerente]);
    select rtrim(valor,'/') into url from segredos where chave='uazapi_url';
    if rota is not null and url is not null then
      fg := wa_fone_de(v_gestor); fr := wa_fone_de(v_gerente);
      if fg is not null then ments := ments || fg; end if;
      if fr is not null and fr is distinct from fg then ments := ments || fr; end if;
      linha_g := case when v_gestor is null then 'sem gestor na ficha'
                      when fg is not null then '@' || fg else (select nome from perfis where id=v_gestor) end;
      linha_r := case when v_gerente is null then 'sem gerente na ficha'
                      when fr is not null then '@' || fr else (select nome from perfis where id=v_gerente) end;
      select nome into ator from perfis where id=auth.uid();
      msg := '*Vídeo pronto pra subir*' || E'\n' || coalesce(NEW.titulo,'')
          || case when v_cli is not null then E'\nCliente: ' || v_cli else '' end
          || E'\nGestor: ' || linha_g
          || E'\nGerente: ' || linha_r
          || case when ator is not null then E'\nAprovado por: ' || ator else '' end
          || case when v_link is not null then E'\nVídeo final: ' || v_link else '' end
          || E'\nDemanda em Campanhas: https://autosintese.app.br/#t/' || v_id;
      perform net.http_post(
        url := url || '/send/text',
        body := jsonb_build_object('number', rota->>'chat', 'text', msg, 'linkPreview', false,
                                   'track_source', 'sistema-autosintese', 'track_id', 'video:' || NEW.id)
                || case when array_length(ments,1) > 0 then jsonb_build_object('mentions', array_to_string(ments, ',')) else '{}'::jsonb end,
        headers := jsonb_build_object('token', rota->>'token', 'Content-Type', 'application/json'),
        timeout_milliseconds := 10000);
    end if;
  exception when others then
    raise warning 'espelhar_video: aviso no WhatsApp nao saiu (%)', sqlerrm;
  end;
  return NEW;
end $function$;

drop trigger if exists trg_espelhar_video on public.tarefas;
create trigger trg_espelhar_video after insert or update of status, status_id on public.tarefas
  for each row execute function public.espelhar_video();

revoke all on function public.espelhar_video() from public, anon, authenticated;
revoke all on function public.wa_rota_campanhas(uuid[]) from public, anon, authenticated;
revoke all on function public.wa_fone_de(uuid) from public, anon, authenticated;
revoke all on function public.perfil_por_nome(text) from public, anon, authenticated;

-- rota por gerente/squad criada antes nesta mesma data, substituída pela rota do responsável
drop function if exists public.wa_grupo_da_ficha(text,text);
delete from segredos where chave='wa_grupo_gerente_joao';
