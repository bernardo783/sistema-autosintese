-- APLICADA em 19/10/2026 (migração suporte_anexar_chamado).
-- Anexo no "Problema no sistema" do Suporte (Gabriel 19/10/2026): foto, vídeo, documento.
-- Quem relata nem sempre enxerga a lista Correções (onde o chamado nasce), então o insert direto em
-- tarefa_anexos bateria na RLS. suporte_anexar registra o anexo só se o chamado é da lista Correções,
-- foi aberto pela própria pessoa há menos de 6 horas, o caminho é da pasta do chamado (t/<id>/...) e o
-- arquivo já está no bucket 'anexos' subido por ela. Limite por arquivo: o do bucket (50 MB).
create or replace function public.suporte_anexar(p_tarefa uuid, p_nome text, p_caminho text, p_mime text default null, p_bytes bigint default null)
 returns uuid language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_lista uuid := 'daadf852-a9fc-4676-9421-95e81b5c3d9e';
  v_quem uuid := auth.uid(); v_id uuid;
begin
  if v_quem is null then raise exception 'sem sessão'; end if;
  if not is_aprovado() then raise exception 'conta não aprovada'; end if;
  if not exists (select 1 from tarefas t where t.id = p_tarefa and t.lista_id = v_lista
                  and t.criado_por = v_quem and t.criado_em > now() - interval '6 hours') then
    raise exception 'só dá pra anexar no chamado que você acabou de abrir';
  end if;
  if coalesce(p_caminho,'') not like 't/' || p_tarefa::text || '/%' then
    raise exception 'caminho do anexo inválido';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'anexos' and o.name = p_caminho and o.owner = v_quem) then
    raise exception 'o arquivo não chegou ao servidor';
  end if;
  insert into tarefa_anexos (tarefa_id, tipo, nome, caminho, mime, bytes, autor)
  values (p_tarefa, 'arquivo', left(coalesce(nullif(btrim(p_nome),''),'anexo'),200), p_caminho, p_mime, p_bytes, v_quem)
  returning id into v_id;
  return v_id;
end $function$;
revoke all on function public.suporte_anexar(uuid,text,text,text,bigint) from public, anon;
grant execute on function public.suporte_anexar(uuid,text,text,text,bigint) to authenticated;
