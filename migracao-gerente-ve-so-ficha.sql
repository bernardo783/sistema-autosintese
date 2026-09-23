-- JÁ APLICADA em 23/09/2026 (migração "gerente_ve_so_clientes_da_ficha" no Supabase). Guardada aqui como registro.
-- Gabriel 23/09/2026: "Luiz só vê os projetos que ele é gerente". Gerente (perfis.gerente,
-- não master) vê tarefa de cliente só quando está na ficha (gerente ou gestor), não o squad
-- inteiro. Tarefa sem cliente segue a regra de squad. Gestor e master não mudam.
-- A visão cruzada da Edição de Vídeo (tarefa_visivel_em + listas_visao_cruzada) continua.
-- Conferido simulando o login: Luiz 43 cards = 43 fichas dele; João 41 = 41; Luan 49 e Yghor 40 (squad inteiro).
create or replace function public.tarefa_visivel(fid text, sq text)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_aprovado() and (
    case when public.is_gerente() and not public.is_master() and nullif(fid,'') is not null
      then public.sou_da_ficha(fid)
    else (
      coalesce(array_length(public.meus_squads(),1),0) = 0
      or coalesce(nullif(sq,''), nullif(public.squad_da_ficha(fid),'')) is null
      or coalesce(nullif(sq,''), nullif(public.squad_da_ficha(fid),'')) = any (public.meus_squads())
      or public.sou_da_ficha(fid))
    end)
$$;
