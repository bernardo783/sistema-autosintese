-- 23/09/2026: JÁ APLICADA. "Documento do cliente" em Relacionamentos, na ficha: dados cadastrais
-- e contratuais do fechamento num lugar só. Moram em itens.clientes[].fechamento, que só o master
-- lê; esta RPC devolve pro master e pro gerente DA FICHA (tem CPF/RG: ninguém mais).
create or replace function public.cliente_documento(p_ficha text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare cid text; c jsonb;
begin
  if auth.uid() is null then raise exception 'sem sessão'; end if;
  if not (is_master() or gerente_da_ficha(p_ficha)) then return null; end if;
  cid := lc_ficha(p_ficha)->>'clienteId';
  if cid is null then return null; end if;
  select e into c from itens, jsonb_array_elements(dados) e where modulo='clientes' and e->>'id'=cid limit 1;
  if c is null then return null; end if;
  return jsonb_build_object(
    'nome', c->>'nome', 'resp', c->>'resp', 'tel', c->>'tel', 'nicho', c->>'nicho', 'servico', c->>'servico',
    'inicio', c->>'inicio', 'valor', c->'valor', 'diaVenc', c->'diaVenc', 'fim', c->>'fim',
    'fechamento', coalesce(c->'fechamento','{}'::jsonb) - 'gestorId' - 'gerenteId');
end $$;
revoke all on function public.cliente_documento(text) from public, anon;
grant execute on function public.cliente_documento(text) to authenticated;
