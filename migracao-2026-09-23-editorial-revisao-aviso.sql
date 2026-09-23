-- =====================================================================================
-- Linha Editorial: vídeo em "EM REVISÃO (INTERNO)" avisa o grupo SÍNTESE - EDITORIAL (5.0).
-- 23/09/2026. JÁ APLICADA no Supabase.
--
-- Pedido do Gabriel: "quando a madu mover pra em revisão (interno), manda no grupo
-- SÍNTESE - EDITORIAL (5.0), ao invés de concluído". O aviso de concluída dessa rota
-- (edge lembrete-tarefa /concluida) é da outra frente; foi pedido pra ela tirar a Editorial.
-- Sai pelo WhatsApp do João (lembrete_inst_joao está no grupo), marcando o gerente da ficha.
-- Voltou pra revisão depois de MUDANÇAS: avisa de novo (versão nova pra revisar).
-- Tokens e JIDs ficam em segredos; este arquivo só aponta as chaves.
-- =====================================================================================
insert into segredos (chave, valor, descricao, atualizado_em) values
 ('wa_rota_editorial_revisao', '{"inst":"lembrete_inst_joao","jid":"lembrete_jid_sinteseeditorial50","nome":"SÍNTESE - EDITORIAL (5.0)"}',
  'Linha Editorial: video em revisao (interno) avisa este grupo', now())
on conflict (chave) do update set valor=excluded.valor, descricao=excluded.descricao, atualizado_em=now();

create or replace function public.wa_aviso_revisao_editorial()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_edv   uuid := '23b91ffd-0afa-4db1-8239-444bce201aad';   -- Edicao de Video
  v_rev   uuid := '52b1af6c-669e-4cff-be18-7bbe934c3c2d';   -- EM REVISAO (INTERNO)
  k_video text := '60f41d3f-0dd5-4700-90f1-87729c60808b';   -- Video final
  cfg jsonb; url text; tok text; chat text; f jsonb; v_cli text; v_link text;
  v_ger uuid; fr text; ator text; msg text;
begin
  if NEW.lista_id is distinct from v_edv or NEW.status_id is distinct from v_rev then return NEW; end if;
  if TG_OP='UPDATE' and OLD.status_id is not distinct from NEW.status_id and OLD.lista_id is not distinct from NEW.lista_id then return NEW; end if;
  if coalesce(NEW.rascunho,false) then return NEW; end if;
  begin
    select valor::jsonb into cfg from segredos where chave='wa_rota_editorial_revisao';
    if cfg is null then return NEW; end if;
    select rtrim(valor,'/') into url from segredos where chave='uazapi_url';
    select valor into tok  from segredos where chave=cfg->>'inst';
    select valor into chat from segredos where chave=cfg->>'jid';
    if url is null or tok is null or chat is null then return NEW; end if;

    f := case when NEW.ficha_id is not null then lc_ficha(NEW.ficha_id) end;
    v_cli := f->>'nome';
    v_link := nullif(trim(coalesce(NEW.valores->>k_video,'')),'');
    v_ger := perfil_por_nome(f->>'gerente');
    fr := wa_fone_de(v_ger);
    select nome into ator from perfis where id=auth.uid();
    msg := '*Vídeo em revisão (interno)*' || E'\n' || coalesce(NEW.titulo,'(sem título)')
        || case when v_cli is not null then E'\nCliente: ' || v_cli else '' end
        || case when ator is not null then E'\nEnviado por: ' || ator else '' end
        || E'\nGerente: ' || case when v_ger is null then 'sem gerente na ficha'
                                  when fr is not null then '@' || fr else (select nome from perfis where id=v_ger) end
        || case when v_link is not null then E'\nVídeo: ' || v_link else '' end
        || E'\nTarefa: https://autosintese.app.br/#t/' || NEW.id;
    perform net.http_post(
      url := url || '/send/text',
      body := jsonb_build_object('number', chat, 'text', msg, 'linkPreview', false,
                                 'track_source', 'sistema-autosintese', 'track_id', 'revisao:' || NEW.id)
              || case when fr is not null then jsonb_build_object('mentions', fr) else '{}'::jsonb end,
      headers := jsonb_build_object('token', tok, 'Content-Type', 'application/json'),
      timeout_milliseconds := 10000);
  exception when others then
    raise warning 'wa_aviso_revisao_editorial: nao enviou (%)', sqlerrm;
  end;
  return NEW;
end $$;
revoke all on function public.wa_aviso_revisao_editorial() from public, anon, authenticated;

drop trigger if exists trg_wa_aviso_revisao_editorial on public.tarefas;
create trigger trg_wa_aviso_revisao_editorial after insert or update of status_id, lista_id on public.tarefas
  for each row execute function public.wa_aviso_revisao_editorial();
