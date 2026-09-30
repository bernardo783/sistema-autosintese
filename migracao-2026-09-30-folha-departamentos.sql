-- Folha de Pagamento por departamento (Gabriel, 30/09/2026).
-- Ninguem mais tem valor pre-definido: a parte variavel de cada pessoa sai do Controle de
-- Clientes e dos Recebimentos. Esta migracao so cria estrutura; nenhum dado entra aqui.
--
-- folha_linhas(comp) devolve uma linha por pessoa x cliente x papel:
--   gerente  10% da mensalidade do mes (pro rata no mes de entrada), contando o que o cliente ja pagou;
--            o app reparte o gerente entre Marketing e Tecnologia pela categoria do cliente (cat):
--            so tráfego = Marketing, so Agent IA = Tecnologia, os dois = metade cada
--   gestor   R$ 100 por conta (pro rata no mes de entrada), contando o que o cliente ja pagou
--   social   R$ 200 por conta em que a pessoa e a social media (nao depende do pagamento)
--   venda    5% da primeira mensalidade, pro SDR do ganho do painel Comercial, quando o
--            closer liga o ganho ao cliente (crm_calls.ficha_id); conta no mes em que o
--            cliente paga a primeira mensalidade
--   fixo     o fixo mensal de quem tem (cadastro da Folha)
-- "cheio" e o que a pessoa recebe se o cliente pagar tudo; "ganho" e o que ja esta garantido.
-- Master ve todas as linhas; os outros so as proprias (casadas pelo primeiro nome).

alter table public.crm_calls add column if not exists ficha_id text;
alter table public.crm_calls add column if not exists vinculado_em timestamptz;
alter table public.crm_calls add column if not exists vinculado_por uuid;

drop function if exists public.folha_linhas(text);
drop function if exists public.folha_linhas_todas(text);
create or replace function public.folha_linhas_todas(p_comp text)
returns table(pessoa text, papel text, ficha text, cliente text, situacao text,
              base numeric, cheio numeric, ganho numeric, ref text, cat text)
language sql stable security definer set search_path to 'public'
as $f$
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
    case when (b0.rec->>'valor') ~ k.num then (b0.rec->>'valor')::numeric
         when (b0.cli->>'valor') ~ k.num then (b0.cli->>'valor')::numeric else 0 end mens,
    /* mesma regra do calcRecebimentos do app */
    case when nullif(b0.cli->>'arquivadoEm','') is not null then null
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
    coalesce(st in ('recebido','churnpago','sinal','areceber','inadimplente'), false) devido,
    case when (val->>k_ini) ~ '^\d{4}-\d{2}-\d{2}' then left(val->>k_ini,10)::date end d_ini,
    (select pf.nome from perfis pf where pf.id::text = val->>k_gestu) gest_user,
    (select pf.nome from perfis pf where pf.id::text = val->>k_soc) soc_user
    from b1),
b3 as (select b2.*,
    case when mens>0 then least(1, pago/mens) when pago>0 then 1 else 0 end razao,
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
               coalesce(cli->>'nome',fic->>'nome') cliente, st, mens base, razao, fic->>'categoria' cat,
    /* valor combinado a mao no card vale; senao, 10% da mensalidade DO MES olhado */
    case when v_ger is not null and v_mens is not null and v_ger <> round(v_mens*0.10,2) then v_ger
         /* pro rata no mes de entrada sobre o valor de cadastro: a cobranca do 1o mes pode ja vir proporcional */
         else round((case when fator_comp<1 then coalesce(v_cad,mens)*fator_comp else mens end)*0.10,2) end cheio
    from b where devido and coalesce(trim(fic->>'gerente'),'')<>'' and not lc_socio(fic->>'gerente')),
gest as (select coalesce(gest_user, trim(fic->>'responsavel')) pessoa, 'gestor'::text papel, fic->>'id' ficha,
                coalesce(cli->>'nome',fic->>'nome') cliente, st, mens base, razao, fic->>'categoria' cat,
    case when v_gest is null or v_gest in (100, round(100*fator_ini,2), round(100*fator_hoje,2))
         then round(100*fator_comp,2) else v_gest end cheio
    from b where devido and coalesce(gest_user, trim(fic->>'responsavel'),'')<>''
             and not lc_socio(coalesce(gest_user, fic->>'responsavel'))),
soc as (select soc_user pessoa, 'social'::text papel, fic->>'id' ficha,
               coalesce(cli->>'nome',fic->>'nome') cliente, st, mens base, 1::numeric razao, fic->>'categoria' cat,
    case when v_soc is null or v_soc in (200, round(200*fator_ini,2), round(200*fator_hoje,2))
         then round(200*fator_comp,2) else v_soc end cheio
    from b where devido and soc_user is not null and not lc_socio(soc_user)),
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
    /* mes da comissao = mes da PRIMEIRA mensalidade paga do cliente ligado (Blessed fechou em
       26/08 e pagou em setembro: a comissao e de setembro); sem pagamento ou sem cliente ligado,
       vale o mes da call. Ajuste da sessao paralela, 30/09 a noite, direto no banco. */
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
$f$;

create or replace function public.folha_linhas(p_comp text default null)
returns table(pessoa text, papel text, ficha text, cliente text, situacao text,
              base numeric, cheio numeric, ganho numeric, ref text, cat text)
language sql stable security definer set search_path to 'public'
as $f$
  select l.pessoa, l.papel, l.ficha, l.cliente, l.situacao,
         /* mensalidade e dado de master e de gerente: gestor e social media nao veem */
         case when is_master() or l.papel in ('gerente','venda','fixo') then l.base end,
         l.cheio, l.ganho, l.ref, l.cat
    from folha_linhas_todas(coalesce(nullif(p_comp,''),
           to_char(now() at time zone 'America/Sao_Paulo','YYYY-MM'))) l
   where is_aprovado()
     and (is_master() or prim_nome(l.pessoa) = (select prim_nome(nome) from perfis where id=auth.uid()))
$f$;

revoke all on function public.folha_linhas_todas(text) from public, anon, authenticated;
revoke all on function public.folha_linhas(text) from public, anon;
grant execute on function public.folha_linhas(text) to authenticated;

-- Aplicado em seguida (migracao lc_auto_gerente_pro_rata): a coluna "Remuneracao Gerente (10%)"
-- do Controle de Clientes passou a ter o mesmo pro rata da Folha no mes de entrada, sobre o
-- valor de cadastro (declara `cad`/`gbase`, le clientes.valor e usa
-- gbase := case when fator < 1 then coalesce(cad,m)*fator else m end). Valor combinado a mao
-- continua respeitado. Os cards foram recalculados com lc_auto(ficha, valores, valores).
