-- =====================================================================================
-- Renomear cliente: master OU gerente do cliente (23/09/2026). JÁ APLICADA no Supabase.
-- O nome mora em quatro lugares: ficha (projetos), cadastro (clientes), cobranças
-- (recebimentos) e o card do Controle de Clientes/Churns (tarefas.titulo). Quem não é
-- master não lê clientes/recebimentos, então a troca passa por esta RPC. O app manda o
-- nome já em CAIXA ALTA (MAIUS pt-BR) e faz a checagem fina de duplicidade (nomeChave).
-- =====================================================================================
create or replace function public.cliente_renomear(p_ficha text, p_nome text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare novo text := btrim(coalesce(p_nome,'')); cid text; antes text;
begin
  if auth.uid() is null then raise exception 'sem sessão'; end if;
  if not (is_master() or gerente_da_ficha(p_ficha)) then
    raise exception 'só o master ou o gerente deste cliente renomeiam';
  end if;
  if length(novo) < 2 then raise exception 'nome muito curto'; end if;
  select p->>'clienteId', p->>'nome' into cid, antes from itens, jsonb_array_elements(dados) p
   where modulo='projetos' and p->>'id'=p_ficha limit 1;
  if antes is null then raise exception 'cliente não encontrado'; end if;
  if exists (select 1 from itens, jsonb_array_elements(dados) p
              where modulo='projetos' and p->>'id'<>p_ficha and upper(btrim(p->>'nome'))=upper(novo)) then
    raise exception 'já existe um cliente com esse nome';
  end if;

  update itens t set dados=(select jsonb_agg(case when x.e->>'id'=p_ficha
      then x.e||jsonb_build_object('nome',novo) else x.e end order by x.o)
    from jsonb_array_elements(t.dados) with ordinality x(e,o))
   where t.modulo='projetos';
  if cid is not null then
    update itens t set dados=(select jsonb_agg(case when x.e->>'id'=cid
        then x.e||jsonb_build_object('nome',novo) else x.e end order by x.o)
      from jsonb_array_elements(t.dados) with ordinality x(e,o))
     where t.modulo='clientes';
    update itens t set dados=(select jsonb_agg(case when x.e->>'clienteId'=cid
        then x.e||jsonb_build_object('nome',novo) else x.e end order by x.o)
      from jsonb_array_elements(t.dados) with ordinality x(e,o))
     where t.modulo='recebimentos'
       and exists (select 1 from jsonb_array_elements(t.dados) e where e->>'clienteId'=cid);
  end if;
  update tarefas set titulo=novo
   where ficha_id=p_ficha
     and lista_id in ('a0009b64-6847-4477-be46-3dade84d5409','c1000000-0000-4000-8000-000000000001','f1e2d3c4-0000-4a00-8b00-000000000001');
  return jsonb_build_object('ok',true,'antes',antes,'depois',novo);
end $$;
revoke all on function public.cliente_renomear(text,text) from public, anon;
grant execute on function public.cliente_renomear(text,text) to authenticated;
