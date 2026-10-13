-- APLICADA em 13/10/2026 (migração churn_financeiro_card), com o OK do Gabriel ("pode publicar").
-- CHURN SAI DO FINANCEIRO (Gabriel 02/10/2026): "se o cliente foi churn, tem que sair do financeiro
-- e controle de clientes". Caso CENTROCAR VEÍCULOS: o churn foi registrado pelo card em 30/09
-- (Arquivar cliente > Foi churn) e o cadastro do Financeiro continuou ativo, então outubro seguiu
-- prevendo a cobrança e a comissão do gerente e do gestor.
--
-- Raiz: nenhum caminho de churn pelo card tocava o cadastro (só Recebimentos grava churnComp), e o
-- gerente nem lê o módulo clientes. Agora o banco encerra junto:
--   cliente_churn_aplicar(ficha, mês)  faz o trabalho (interna, sem permissão pra ninguém chamar)
--   cliente_churn(ficha, mês)          RPC pro master, chamada pelo app depois de mover o card
--   trg_churn_financeiro               card foi pro Controle de Churns por quem NÃO é master: encerra
--                                      na mesma transação (cobre gerente e navegador desatualizado)
-- O master fica fora do gatilho de propósito: o fluxo dele em Recebimentos (rcStatusCli) muda o
-- cadastro na memória do navegador, move o card e só depois salva; se o gatilho gravasse no meio, o
-- salvar dele cairia em "alguém salvou enquanto você editava" e descartaria a marcação.
--
-- O que "encerrar" faz, igual ao churn marcado em Recebimentos:
--   cadastro: churnComp = fim = mês da saída (a cobrança para do mês seguinte em diante)
--   cobrança do mês da saída já recebida: vira churnpago ("saiu, pagou o último mês"); a receita
--     lançada não muda. Em aberto: fica como está, o financeiro decide (pagou ou não vai pagar)
--   cobranças de meses DEPOIS da saída ainda não recebidas e sem sinal: saem (senão o cliente
--     voltaria a ser cobrado e a gerar comissão naquele mês)
--   já estava em churn no cadastro: não mexe em nada (idempotente)
-- Antes de gravar, guarda clientes e recebimentos em itens_backup.

create or replace function public.cliente_churn_aplicar(p_ficha text, p_comp text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_cli text; v_c jsonb; v_comp text; v_dia text; v_ja text;
  v_pago boolean := false; v_rem int := 0; v_adiant int := 0; v_ass boolean := false;
begin
  if p_ficha is null then return jsonb_build_object('ok',false,'motivo','ficha não informada'); end if;
  v_dia  := to_char((now() at time zone 'America/Sao_Paulo')::date,'YYYY-MM-DD');
  v_comp := case when coalesce(p_comp,'') ~ '^\d{4}-(0[1-9]|1[0-2])$' then p_comp else left(v_dia,7) end;
  v_cli  := lc_ficha(p_ficha)->>'clienteId';
  if coalesce(v_cli,'')='' then
    return jsonb_build_object('ok',false,'motivo','a ficha não tem cadastro no Financeiro');
  end if;

  -- uma chamada por vez, sempre na mesma ordem (clientes, depois recebimentos)
  perform 1 from itens where modulo='clientes' for update;
  perform 1 from itens where modulo='recebimentos' for update;

  select c into v_c from itens i, jsonb_array_elements(i.dados) c
   where i.modulo='clientes' and c->>'id'=v_cli limit 1;
  if v_c is null then
    return jsonb_build_object('ok',false,'motivo','o cliente não está no cadastro do Financeiro');
  end if;
  v_ass := coalesce(v_c->'asaas'->>'subscriptionId','')<>'' and coalesce(v_c->'asaas'->>'cancelado','')<>'true';
  v_ja  := nullif(v_c->>'churnComp','');
  if v_ja is not null then
    return jsonb_build_object('ok',true,'mudou',false,'cliente',v_c->>'nome','churnComp',v_ja,'assinatura',v_ass);
  end if;

  select
    coalesce(bool_or(r->>'comp'=v_comp
      and coalesce(nullif(r->>'status',''), case when r->>'recebido'='true' then 'recebido' end)='recebido'), false),
    count(*) filter (where r->>'comp'>v_comp and not (r->>'recebido'='true'
      or coalesce(r->>'status','') in ('recebido','churnpago','sinal')
      or coalesce(nullif(r->>'sinal',''),'0') !~ '^0+(\.0+)?$')),
    count(*) filter (where r->>'comp'>v_comp and (r->>'recebido'='true'
      or coalesce(r->>'status','') in ('recebido','churnpago','sinal')
      or coalesce(nullif(r->>'sinal',''),'0') !~ '^0+(\.0+)?$'))
    into v_pago, v_rem, v_adiant
    from itens i, jsonb_array_elements(i.dados) r
   where i.modulo='recebimentos' and r->>'clienteId'=v_cli;

  insert into itens_backup(motivo, modulo, dados)
  select 'cliente_churn '||v_cli||' '||v_comp||' (antes)', modulo, dados
    from itens where modulo='clientes' or (modulo='recebimentos' and (v_pago or v_rem>0));

  update itens t set dados=(select jsonb_agg(case when x.e->>'id'=v_cli
        then x.e || jsonb_build_object('churnComp',v_comp,'fim',v_comp) else x.e end order by x.o)
      from jsonb_array_elements(t.dados) with ordinality x(e,o))
   where t.modulo='clientes';

  if v_pago or v_rem>0 then
    update itens t set dados=coalesce((select jsonb_agg(
          case when x.e->>'clienteId'=v_cli and x.e->>'comp'=v_comp
                and coalesce(nullif(x.e->>'status',''), case when x.e->>'recebido'='true' then 'recebido' end)='recebido'
               then x.e || jsonb_build_object('status','churnpago','churnEm',v_dia)
               else x.e end order by x.o)
        from jsonb_array_elements(t.dados) with ordinality x(e,o)
       where not (x.e->>'clienteId'=v_cli and x.e->>'comp'>v_comp and not (x.e->>'recebido'='true'
              or coalesce(x.e->>'status','') in ('recebido','churnpago','sinal')
              or coalesce(nullif(x.e->>'sinal',''),'0') !~ '^0+(\.0+)?$'))), '[]'::jsonb)
     where t.modulo='recebimentos';
  end if;

  return jsonb_build_object('ok',true,'mudou',true,'cliente',v_c->>'nome','churnComp',v_comp,
    'mesPago',v_pago,'removidas',v_rem,'adiantadas',v_adiant,'assinatura',v_ass);
end $function$;

create or replace function public.cliente_churn(p_ficha text, p_comp text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if auth.uid() is null then raise exception 'sem sessão'; end if;
  if rs_lista() is not null then raise exception 'sem acesso'; end if;
  if not (is_master() or gerente_da_ficha(p_ficha)) then
    raise exception 'Só o master ou o gerente do cliente registram o churn no Financeiro.';
  end if;
  return cliente_churn_aplicar(p_ficha, p_comp);
end $function$;

create or replace function public.churn_financeiro_tg()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ch uuid := 'c1000000-0000-4000-8000-000000000001';      -- Controle de Churns
  v_saida text;
begin
  if new.ficha_id is null or new.lista_id is distinct from v_ch or old.lista_id is not distinct from v_ch then
    return null;
  end if;
  if is_master() then return null; end if;                    -- o master encerra pelo app
  v_saida := new.valores->>'c1000000-0000-4000-8000-000000000024';   -- Data de saída
  perform cliente_churn_aplicar(new.ficha_id, case when v_saida ~ '^\d{4}-\d{2}' then left(v_saida,7) end);
  return null;
end $function$;

revoke all on function public.cliente_churn_aplicar(text,text) from public, anon, authenticated;
revoke all on function public.churn_financeiro_tg() from public, anon, authenticated;
revoke all on function public.cliente_churn(text,text) from public, anon;
grant execute on function public.cliente_churn(text,text) to authenticated;

drop trigger if exists trg_churn_financeiro on public.tarefas;
create trigger trg_churn_financeiro after update of lista_id on public.tarefas
  for each row execute function churn_financeiro_tg();

-- Parceria que virou churn: sai da folha a partir do mês seguinte à saída (antes o ramo da
-- parceria nem olhava o churn e o gerente seguiria recebendo os 10% da referência pra sempre).
do $mig$
declare d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p
   where p.proname='folha_linhas_todas' and p.pronamespace='public'::regnamespace;
  n := replace(d, $a$else 'parceria' end$a$,
    $b$when nullif(b0.cli->>'churnComp','') is not null and p_comp > b0.cli->>'churnComp' then 'churn'
                   else 'parceria' end$b$);
  if n = d then raise exception 'folha_linhas_todas: ramo da parceria nao encontrado'; end if;
  execute n;
end $mig$;
