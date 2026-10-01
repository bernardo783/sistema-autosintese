-- PARCERIA (Gabriel 30/09/2026, caso JR MOTORS VR): o cliente continua ativo e faz parte da
-- carteira, mas não gera receita (mensalidade zero). O gerente da ficha continua recebendo os
-- 10% sobre um VALOR DE REFERÊNCIA (o que o projeto valia), como despesa da empresa.
-- Na ficha (itens.projetos): parceria: true, parceriaRef: 900. No cadastro do Financeiro
-- (itens.clientes): parceria: true, valor 0, sem churn. Recebimentos mostra "Parceria".
--
-- 1. lc_auto: no card do Controle de Clientes, o 10% do gerente sai da referência, não da
--    mensalidade (que é zero). Gestor e social media seguem a regra de sempre.
CREATE OR REPLACE FUNCTION public.lc_auto(p_ficha text, p_val jsonb, p_old jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  k_mens text := '7fb37164-cc32-494c-a93c-c336afe163ea';
  k_ger  text := '46c3b98b-6590-4aff-bf80-ed03801206c7';
  k_gest text := 'b7e1c2a0-5d3f-4c8e-9a61-2f0d7c4e1a01';
  k_ini  text := '1c17a1d0-5e3a-4b62-9f77-0c4b8e2a51d9';
  k_soc  text := '50c1a1d0-7e2b-4c95-8a31-6d0f9b74e2c1';   -- quem é o social media
  k_rsoc text := '50c1a1d0-7e2b-4c95-8a31-6d0f9b74e2c2';   -- o que ele recebe por este cliente
  gest_base constant numeric := 100;
  soc_base  constant numeric := 200;
  num text := '^\s*-?[0-9]+(\.[0-9]+)?\s*$';
  v jsonb := coalesce(p_val,'{}'::jsonb); f jsonb;
  m numeric; m_ant numeric; g numeric; gt numeric; sc numeric; cad numeric; gbase numeric;
  d_ini date; hoje date; mes0 date; dim int;
  fator numeric := 1; fator_ini numeric := 1;
  parc boolean := false; parc_ref numeric := 0;
begin
  if p_ficha is null then return v; end if;
  f := lc_ficha(p_ficha);
  m := lc_mens_de(p_ficha);
  select case when (c->>'valor') ~ num then (c->>'valor')::numeric end into cad
    from itens ip, jsonb_array_elements(ip.dados) p, itens ic, jsonb_array_elements(ic.dados) c
   where ip.modulo='projetos' and ic.modulo='clientes' and p->>'id'=p_ficha and c->>'id'=p->>'clienteId' limit 1;
  if m is not null then v := v || jsonb_build_object(k_mens, m); end if;
  m     := case when (v->>k_mens)     ~ num then (v->>k_mens)::numeric end;
  g     := case when (v->>k_ger)      ~ num then (v->>k_ger)::numeric end;
  gt    := case when (v->>k_gest)     ~ num then (v->>k_gest)::numeric end;
  sc    := case when (v->>k_rsoc)     ~ num then (v->>k_rsoc)::numeric end;
  m_ant := case when (p_old->>k_mens) ~ num then (p_old->>k_mens)::numeric end;
  parc  := coalesce((f->>'parceria')='true', false);
  parc_ref := case when (f->>'parceriaRef') ~ num then (f->>'parceriaRef')::numeric else 0 end;

  d_ini := case when (v->>k_ini) ~ '^\d{4}-\d{2}-\d{2}' then left(v->>k_ini,10)::date end;
  hoje  := (now() at time zone 'America/Sao_Paulo')::date;
  if d_ini is not null then
    mes0 := date_trunc('month', d_ini)::date;
    dim  := extract(day from (mes0 + interval '1 month - 1 day'))::int;
    fator_ini := (dim - extract(day from d_ini)::int + 1)::numeric / dim;
    if date_trunc('month', hoje) = date_trunc('month', d_ini) then fator := fator_ini; end if;
  end if;

  -- parceria (Gabriel 30/09): mensalidade zero, gerente recebe 10% da referência; gestor e
  -- social media não recebem por ela (não há receita), igual à folha (folha_linhas_todas)
  if parc then
    v := v || jsonb_build_object(k_mens, 0);
    if coalesce(trim(f->>'gerente'),'')<>'' and not lc_socio(f->>'gerente') then
      v := v || jsonb_build_object(k_ger, round(parc_ref*0.10,2));
    else
      v := v - k_ger;
    end if;
    return v - k_gest - k_rsoc;
  -- gerente: 10% da mensalidade do mês (a proporção já está nela quando existe)
  elsif coalesce(trim(f->>'gerente'),'')<>'' and m is not null and not lc_socio(f->>'gerente') then
    gbase := case when fator < 1 then coalesce(cad,m)*fator else m end;
    if g is null or p_old is null or m_ant is distinct from m
       or g = round(coalesce(m_ant,m)*0.10,2)
       or g = round(coalesce(cad,m)*fator_ini*0.10,2) or g = round(coalesce(cad,m)*fator*0.10,2)
    then
      v := v || jsonb_build_object(k_ger, round(gbase*0.10,2));
    end if;
  else
    v := v - k_ger;
  end if;

  -- gestor: R$100 por conta, proporcional no mês em que o cliente entrou
  if coalesce(trim(f->>'responsavel'),'')<>'' and not lc_socio(f->>'responsavel') then
    if gt is null or gt = gest_base or gt = round(gest_base*fator_ini,2) or gt = round(gest_base*fator,2)
    then v := v || jsonb_build_object(k_gest, round(gest_base*fator,2)); end if;
  else v := v - k_gest; end if;

  -- social media: R$200 por projeto, some junto com a pessoa quando ela sai do campo
  if coalesce(trim(v->>k_soc),'')<>'' then
    if sc is null or sc = soc_base or sc = round(soc_base*fator_ini,2) or sc = round(soc_base*fator,2)
    then v := v || jsonb_build_object(k_rsoc, round(soc_base*fator,2)); end if;
  else v := v - k_rsoc; end if;

  return v;
end $function$;

-- 2. folha_linhas_todas: a linha do gerente de uma parceria entra todo mês com situação
--    'parceria', base = referência e ganho = 10% dela (não depende de recebimento). Gestor e
--    social media não têm linha na parceria (não há receita que os pague). A coluna cat
--    continua vindo da ficha: é ela que reparte o gerente entre Marketing e Tecnologia.
CREATE OR REPLACE FUNCTION public.folha_linhas_todas(p_comp text)
 RETURNS TABLE(pessoa text, papel text, ficha text, cliente text, situacao text, base numeric, cheio numeric, ganho numeric, ref text, cat text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with k as (select
    'a0009b64-6847-4477-be46-3dade84d5409'::uuid lc,
    'c1000000-0000-4000-8000-000000000001'::uuid ch,
    '7fb37164-cc32-494c-a93c-c336afe163ea' k_mens,
    '46c3b98b-6590-4aff-bf80-ed03801206c7' k_ger,
    'b7e1c2a0-5d3f-4c8e-9a61-2f0d7c4e1a01' k_gest,
    '35cf51e0-c581-473d-8b16-065f4b0e3dc3' k_gestu,
    '1c17a1d0-5e3a-4b62-9f77-0c4b8e2a51d9' k_ini,
    '50c1a1d0-7e2b-4c95-8a31-6d0f9b74e2c1' k_soc,
    '50c1a1d0-7e2b-4c95-8a31-6d0f9b74e2c2' k_rsoc,
    '^\s*-?[0-9]+(\.[0-9]+)?\s*$' num,
    to_char((now() at time zone 'America/Sao_Paulo')::date,'YYYY-MM-DD') hoje,
    to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM') comp_hoje),
fic as (select p from itens i, jsonb_array_elements(i.dados) p where i.modulo='projetos'),
cli as (select c from itens i, jsonb_array_elements(i.dados) c where i.modulo='clientes'),
rec as (select r from itens i, jsonb_array_elements(i.dados) r
         where i.modulo='recebimentos' and r->>'comp'=p_comp),
card as (select distinct on (t.ficha_id) t.ficha_id, coalesce(t.valores,'{}'::jsonb) val
           from tarefas t, k where t.lista_id in (k.lc,k.ch) and t.ficha_id is not null
          order by t.ficha_id, (t.lista_id=k.lc) desc, t.atualizado_em desc),
b0 as (select f.p fic, c.c cli, cd.val,
              (select r.r from rec r where r.r->>'clienteId'=c.c->>'id' limit 1) rec
         from fic f join card cd on cd.ficha_id=f.p->>'id'
                    join cli c on c.c->>'id'=f.p->>'clienteId'),
b1 as (select b0.*, k.*,
    coalesce((b0.fic->>'parceria')='true', false) parc,
    case when (b0.fic->>'parceriaRef') ~ k.num then (b0.fic->>'parceriaRef')::numeric else 0 end parc_ref,
    case when (b0.rec->>'valor') ~ k.num then (b0.rec->>'valor')::numeric
         when (b0.cli->>'valor') ~ k.num then (b0.cli->>'valor')::numeric else 0 end mens,
    case when coalesce((b0.fic->>'parceria')='true', false) then
              case when nullif(b0.cli->>'arquivadoEm','') is not null then null
                   when nullif(b0.cli->>'inicio','') is not null and p_comp < b0.cli->>'inicio' then null
                   else 'parceria' end
         when nullif(b0.cli->>'arquivadoEm','') is not null then null
         when b0.rec is not null then coalesce(nullif(b0.rec->>'status',''),
              case when (b0.rec->>'recebido')='true' then 'recebido'
                   when coalesce(nullif(b0.rec->>'venc',''),'9999') < k.hoje then 'inadimplente'
                   else 'areceber' end)
         when nullif(b0.cli->>'inicio','') is not null and p_comp < b0.cli->>'inicio' then null
         when nullif(b0.cli->>'churnComp','') is not null and p_comp > b0.cli->>'churnComp' then 'churn'
         when not coalesce((b0.cli->>'diaVenc') ~ '^[0-9]+$' and (b0.cli->>'diaVenc')::int between 1 and 31, false) then null
         when nullif(b0.cli->>'fim','') is not null and p_comp > b0.cli->>'fim' then null
         when p_comp < '2026-07' then null
         when p_comp > k.comp_hoje then 'areceber'
         when p_comp||'-'||lpad(least((b0.cli->>'diaVenc')::int,
                extract(day from (to_date(p_comp||'-01','YYYY-MM-DD') + interval '1 month - 1 day'))::int)::text,2,'0') < k.hoje
           then 'inadimplente'
         else 'areceber' end st
    from b0, k),
b2 as (select b1.*,
    case when st in ('recebido','churnpago') then mens
         when st='sinal' and (rec->>'sinal') ~ num then (rec->>'sinal')::numeric else 0 end pago,
    coalesce(st in ('recebido','churnpago','sinal','areceber','inadimplente','parceria'), false) devido,
    case when (val->>k_ini) ~ '^\d{4}-\d{2}-\d{2}' then left(val->>k_ini,10)::date end d_ini,
    (select pf.nome from perfis pf where pf.id::text = val->>k_gestu) gest_user,
    (select pf.nome from perfis pf where pf.id::text = val->>k_soc) soc_user
    from b1),
b3 as (select b2.*,
    case when st='parceria' then 1
         when mens>0 then least(1, pago/mens) when pago>0 then 1 else 0 end razao,
    case when d_ini is null then 1 else
      (extract(day from (date_trunc('month',d_ini) + interval '1 month - 1 day'))::int
         - extract(day from d_ini)::int + 1)::numeric
      / extract(day from (date_trunc('month',d_ini) + interval '1 month - 1 day'))::int end fator_ini
    from b2),
b as (select b3.*,
    case when d_ini is not null and to_char(d_ini,'YYYY-MM')=p_comp    then fator_ini else 1 end fator_comp,
    case when d_ini is not null and to_char(d_ini,'YYYY-MM')=comp_hoje then fator_ini else 1 end fator_hoje,
    case when (val->>k_ger)  ~ num then (val->>k_ger)::numeric  end v_ger,
    case when (val->>k_mens) ~ num then (val->>k_mens)::numeric end v_mens,
    case when (val->>k_gest) ~ num then (val->>k_gest)::numeric end v_gest,
    case when (val->>k_rsoc) ~ num then (val->>k_rsoc)::numeric end v_soc,
    case when (cli->>'valor') ~ num then (cli->>'valor')::numeric end v_cad
    from b3),
ger as (select trim(fic->>'gerente') pessoa, 'gerente'::text papel, fic->>'id' ficha,
               coalesce(cli->>'nome',fic->>'nome') cliente, st,
               case when st='parceria' then parc_ref else mens end base, razao, fic->>'categoria' cat,
    case when st='parceria' then round(parc_ref*0.10,2)
         when v_ger is not null and v_mens is not null and v_ger <> round(v_mens*0.10,2) then v_ger
         else round((case when fator_comp<1 then coalesce(v_cad,mens)*fator_comp else mens end)*0.10,2) end cheio
    from b where devido and coalesce(trim(fic->>'gerente'),'')<>'' and not lc_socio(fic->>'gerente')),
gest as (select coalesce(gest_user, trim(fic->>'responsavel')) pessoa, 'gestor'::text papel, fic->>'id' ficha,
                coalesce(cli->>'nome',fic->>'nome') cliente, st, mens base, razao, fic->>'categoria' cat,
    case when v_gest is null or v_gest in (100, round(100*fator_ini,2), round(100*fator_hoje,2))
         then round(100*fator_comp,2) else v_gest end cheio
    from b where devido and st<>'parceria' and coalesce(gest_user, trim(fic->>'responsavel'),'')<>''
             and not lc_socio(coalesce(gest_user, fic->>'responsavel'))),
soc as (select soc_user pessoa, 'social'::text papel, fic->>'id' ficha,
               coalesce(cli->>'nome',fic->>'nome') cliente, st, mens base, 1::numeric razao, fic->>'categoria' cat,
    case when v_soc is null or v_soc in (200, round(200*fator_ini,2), round(200*fator_hoje,2))
         then round(200*fator_comp,2) else v_soc end cheio
    from b where devido and st<>'parceria' and soc_user is not null and not lc_socio(soc_user)),
ven as (select trim(cc.sdr) pessoa, 'venda'::text papel, cc.ficha_id ficha,
               coalesce(cl.c->>'nome', cc.empresa) cliente,
               case when cc.ficha_id is null then 'sem_vinculo' else 'vinculada' end st,
               x.base, case when cc.ficha_id is null then 0 else 1 end::numeric razao,
               round(x.base*0.05,2) cheio, cc.id::text ref
    from crm_calls cc
    left join fic f on f.p->>'id'=cc.ficha_id
    left join cli cl on cl.c->>'id'=f.p->>'clienteId'
    cross join k
    cross join lateral (select coalesce(
        (select (r->>'valor')::numeric from itens i, jsonb_array_elements(i.dados) r
          where i.modulo='recebimentos' and r->>'clienteId'=cl.c->>'id' and (r->>'valor') ~ k.num
          order by r->>'comp' limit 1),
        case when (cl.c->>'valor') ~ k.num then (cl.c->>'valor')::numeric end,
        cc.fee, 0) base) x
    cross join lateral (select coalesce((select min(r->>'comp') from itens i, jsonb_array_elements(i.dados) r
        where i.modulo='recebimentos' and r->>'clienteId'=cl.c->>'id'
          and coalesce(nullif(r->>'status',''), case when r->>'recebido'='true' then 'recebido' end) in ('recebido','churnpago')),
      to_char(cc.data,'YYYY-MM')) mes) m
    where cc.status_lead='ganho' and m.mes=p_comp
      and coalesce(trim(cc.sdr),'')<>'' and not lc_socio(cc.sdr)),
fixo as (select e->>'nome' pessoa, (e->>'fixo')::numeric v
    from itens i, jsonb_array_elements(i.dados) e, k
    where i.modulo='folha_fixos' and e->>'tipo'='pessoa' and coalesce(e->>'desligado','false')<>'true'
      and (e->>'fixo') ~ k.num and (e->>'fixo')::numeric>0)
select pessoa, papel, ficha, cliente, st, base, cheio, round(cheio*razao,2), null::text, cat from ger
union all select pessoa, papel, ficha, cliente, st, base, cheio, round(cheio*razao,2), null::text, cat from gest
union all select pessoa, papel, ficha, cliente, st, base, cheio, round(cheio*razao,2), null::text, cat from soc
union all select pessoa, papel, ficha, cliente, st, base, cheio, round(cheio*razao,2), ref, null::text from ven
union all select pessoa, 'fixo', null, null, null, null, v, v, null::text, null::text from fixo
$function$;

-- 3. COMISSÃO INTEGRAL (Gabriel 30/09, F3 MULTIMARCAS): cobrança com comissaoCheia=true no
--    Recebimentos faz gerente e gestor receberem o mês cheio mesmo com o cliente pagando só o
--    sinal. Aplicado no banco por replace sobre folha_linhas_todas (ger: razao_ger; gest: razao):
--      ger : case when coalesce((rec->>'comissaoCheia')='true', false) then 1 else razao end razao_ger
--            ... select ... round(cheio*razao_ger,2) ... from ger
--      gest: case when coalesce((rec->>'comissaoCheia')='true', false) then 1 else razao end razao

