-- Novo contrato / upsell pelo gerente (Gabriel 23/09/2026).
-- O gerente nao le o modulo 'clientes' (RLS de itens). Para puxar os dados contratuais
-- do cliente DELE, uma funcao que so responde para o master ou para o gerente da ficha.
-- Devolve so o que o contrato pede: nada de closer, sdr, link da call ou resumo da venda.
create or replace function public.dados_contratuais(p_ficha text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when not (public.is_master() or public.gerente_da_ficha(p_ficha)) then null else (
    select jsonb_build_object(
      'nome', c->>'nome', 'valor', c->'valor', 'diaVenc', c->'diaVenc', 'servico', c->>'servico',
      'resp', c->>'resp', 'tel', c->>'tel',
      'contrato', coalesce(c->'contrato','{}'::jsonb),
      'fechamento', coalesce(c->'fechamento','{}'::jsonb) - array['closer','sdr','linkCall','resumo',
        'enviadoEm','enviadoPor','gerenteId','gestorId','especificidades','integracoes','origem','origemRotulo'])
    from itens ip, jsonb_array_elements(ip.dados) f, itens ic, jsonb_array_elements(ic.dados) c
    where ip.modulo='projetos' and f->>'id'=p_ficha
      and ic.modulo='clientes' and c->>'id'=f->>'clienteId'
    limit 1) end
$$;
revoke all on function public.dados_contratuais(text) from public, anon;
grant execute on function public.dados_contratuais(text) to authenticated;

-- o gerente gera o .docx no navegador: precisa ler o modelo
drop policy if exists modelos_gerente_le on public.contrato_modelos;
create policy modelos_gerente_le on public.contrato_modelos for select using (public.is_gerente());

-- e o contrato gerado fica guardado no sistema (so grava; ler continua com o master)
drop policy if exists contratos_gerados_gerente_insere on public.contratos_gerados;
create policy contratos_gerados_gerente_insere on public.contratos_gerados for insert
  with check (public.is_gerente() and gerado_por = auth.uid());

-- Grava de volta o que o gerente corrigiu, no cliente da ficha (so chaves do contrato, so valor preenchido).
-- Assim o proximo upsell ja vem preenchido. Mesmo portao: master ou gerente da ficha.
create or replace function public.salvar_dados_contratuais(p_ficha text, p_dados jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare cid text; atual jsonb; novo jsonb;
begin
  if not (public.is_master() or public.gerente_da_ficha(p_ficha)) then
    return jsonb_build_object('ok',false,'erro','sem permissao'); end if;
  select f->>'clienteId' into cid from itens ip, jsonb_array_elements(ip.dados) f
   where ip.modulo='projetos' and f->>'id'=p_ficha limit 1;
  if coalesce(cid,'')='' then return jsonb_build_object('ok',false,'erro','ficha sem cliente'); end if;
  select coalesce(e->'contrato','{}'::jsonb) into atual from itens, lateral jsonb_array_elements(dados) e
   where modulo='clientes' and e->>'id'=cid limit 1;
  if atual is null then return jsonb_build_object('ok',false,'erro','cliente nao encontrado'); end if;
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into novo from jsonb_each(coalesce(p_dados,'{}'::jsonb))
   where key in ('razao','cnpj','endereco_completo','rep_nome','rep_cargo','rep_rg','rep_cpf','rep_nascimento','tel','email')
     and jsonb_typeof(value)='string' and btrim(value #>> '{}')<>'' and length(value #>> '{}')<=300;
  if coalesce(atual->>'endereco','')<>'' then novo := novo - 'endereco_completo'; end if;
  update itens t set dados = (
    select jsonb_agg(case when e.c->>'id'=cid then jsonb_set(e.c,'{contrato}',atual || novo) else e.c end order by e.ord)
    from jsonb_array_elements(t.dados) with ordinality e(c, ord)
  ), atualizado_em=now()
  where t.modulo='clientes';
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.salvar_dados_contratuais(text,jsonb) from public, anon;
grant execute on function public.salvar_dados_contratuais(text,jsonb) to authenticated;
