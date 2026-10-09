-- [FINANCEIRO] COBRANÇAS CLIENTES (Bernardo 09/10): o card recorrente vem com o checklist dos clientes
-- pendentes do dia no Recebimentos, em duas seções: "Em atraso" e "Vence hoje". Cada item: loja, nome e
-- WhatsApp do financeiro (contato "Financeiro" da ficha; senão o do fechamento; senão o dono, escrito
-- "dono"), valor e prazo. Mesma regra da tela (rcSituacao). Item já marcado continua marcado; item fora
-- dessas duas seções (escrito à mão) fica intacto.
create or replace function public.fin_fone(v text) returns text language sql immutable as $f$
  select case when d is null or d='' then null
    when length(s)=11 then '('||substr(s,1,2)||') '||substr(s,3,5)||'-'||substr(s,8)
    when length(s)=10 then '('||substr(s,1,2)||') '||substr(s,3,4)||'-'||substr(s,7)
    else '+'||d end
  from (select regexp_replace(coalesce(v,''),'\D','','g') d) x,
       lateral (select case when d like '55%' and length(d)>=12 then substr(d,3) else d end s) y
$f$;

create or replace function public.fin_nome(v text) returns text language sql immutable as $f$
  -- "BRUNA KESSIA DAS NEVES" -> "Bruna Kessia das Neves" (mesma regra do nomeGente da ficha)
  select nullif(trim(replace(replace(replace(replace(replace(replace(' '||initcap(lower(coalesce(v,'')))||' ',
    ' Da ',' da '),' De ',' de '),' Do ',' do '),' Das ',' das '),' Dos ',' dos '),' E ',' e ')),'')
$f$;

create or replace function public.fin_cobrancas_itens(p_hoje date default (now() at time zone 'America/Sao_Paulo')::date)
returns jsonb language sql stable security definer set search_path=public as $f$
with par as (select p_hoje hoje, to_char(p_hoje,'YYYY-MM') comp),
cli as (select e c from itens, jsonb_array_elements(dados) e where modulo='clientes' and e->>'arquivadoEm' is null),
rec as (select e r from itens, jsonb_array_elements(dados) e where modulo='recebimentos'),
fic as (select e f from itens, jsonb_array_elements(dados) e where modulo='projetos'),
-- mês corrente: registro do mês ou a regra do dia de vencimento
mes as (
  select c, r,
    coalesce(nullif(r->>'venc',''), case when (c->>'diaVenc') ~ '^\d+$' then to_char(make_date(extract(year from par.hoje)::int, extract(month from par.hoje)::int,
      least((c->>'diaVenc')::int, extract(day from (date_trunc('month',par.hoje)+interval '1 month - 1 day'))::int)),'YYYY-MM-DD') end) venc,
    case when r is not null then coalesce(nullif(r->>'status',''), case when (r->>'recebido')::boolean then 'recebido'
           when r->>'venc' < par.hoje::text then 'inadimplente' else 'areceber' end)
         when coalesce((c->>'parceria')::boolean,false) then 'parceria'
         when nullif(c->>'churnComp','') is not null and par.comp > c->>'churnComp' then 'churn'
         when not ((c->>'diaVenc') ~ '^\d+$' and (c->>'diaVenc')::int between 1 and 31) then null
         when nullif(c->>'fim','') is not null and par.comp > c->>'fim' then null
         when nullif(c->>'inicio','') is not null and par.comp < c->>'inicio' then null
         when make_date(extract(year from par.hoje)::int, extract(month from par.hoje)::int,
           least((c->>'diaVenc')::int, extract(day from (date_trunc('month',par.hoje)+interval '1 month - 1 day'))::int)) < par.hoje then 'inadimplente'
         else 'areceber' end sit,
    coalesce(nullif(r->>'valor','')::numeric, nullif(c->>'valor','')::numeric, 0) valor
  from par, cli left join rec on rec.r->>'clienteId'=cli.c->>'id' and rec.r->>'comp'=(select comp from par)),
-- meses anteriores marcados inadimplentes e ainda não perdidos
antes as (
  select c, r, r->>'venc' venc, 'inadimplente' sit, coalesce(nullif(r->>'valor','')::numeric,0) valor
  from par, rec join cli on cli.c->>'id'=rec.r->>'clienteId'
  where r->>'comp' < par.comp and r->>'status'='inadimplente' and not coalesce((r->>'recebido')::boolean,false) and not coalesce((r->>'perdido')::boolean,false)),
-- entrada parcelada do mês (igual ao bloco "Entradas parceladas" da tela): o restante tem data própria
sinal as (
  select c, r, coalesce(nullif(r->>'restanteVenc',''), r->>'venc') venc, 'sinal' sit,
    greatest(0, coalesce(nullif(r->>'valor','')::numeric,0)-coalesce(nullif(r->>'sinal','')::numeric,0)) valor
  from par, rec join cli on cli.c->>'id'=rec.r->>'clienteId' where r->>'status'='sinal' and r->>'comp'=par.comp),
pend as (
  select c, r, venc, sit, valor from mes, par where sit='inadimplente' or (sit='areceber' and venc=par.hoje::text)
  union all select c, r, venc, sit, valor from antes
  union all select c, r, venc, sit, valor from sinal, par where valor>0 and venc is not null and venc <= par.hoje::text),
-- contato do financeiro: agenda da ficha (etiqueta Financeiro) > fechamento > dono
ct as (
  select p.*, z.nome z_nome, z.num z_num
  from pend p left join lateral (
    select zz->>'nome' nome, zz->>'num' num from fic, jsonb_array_elements(coalesce(f->'zaps','[]'::jsonb)) zz
    where f->>'clienteId'=p.c->>'id' and lower(trim(zz->>'et'))='financeiro' limit 1) z on true),
fmt as (
  select *,
    coalesce(nullif(z_nome,''), nullif(c->'fechamento'->>'respFin',''), case when nullif(c->'fechamento'->>'telFin','') is not null then coalesce(nullif(c->'fechamento'->>'dono',''), c->>'resp') end) fin_nome,
    coalesce(nullif(z_num,''), nullif(c->'fechamento'->>'telFin','')) fin_tel,
    (select hoje from par) - venc::date dias
  from ct),
linha as (
  select venc, c->>'nome' loja,
    case when dias>0 then 'Em atraso' else 'Vence hoje' end g,
    upper(coalesce(c->>'nome','?')) || ' — ' ||
    case when fin_nome is not null or fin_tel is not null
      then coalesce(public.fin_nome(fin_nome),'Financeiro') || coalesce(' · ' || public.fin_fone(fin_tel),'')
      else 'Financeiro não cadastrado · dono: ' || coalesce(public.fin_nome(c->>'resp'),'?') || coalesce(' · ' || public.fin_fone(c->>'tel'),'') end
    || ' · R$ ' || replace(to_char(valor,'FM999G999G990'),',','.')
    || case when sit='sinal' then ' (restante da entrada)' else '' end
    || case when dias=1 then ' · 1 dia em atraso' when dias>1 then ' · '||dias||' dias em atraso' else '' end t
  from fmt)
select coalesce(jsonb_agg(jsonb_build_object('t',t,'ok',false,'g',g) order by g, venc, loja),'[]'::jsonb) from linha
$f$;

-- grava no card aberto da série, mantendo o que já foi marcado
create or replace function public.fin_cobrancas_sync() returns int language plpgsql security definer set search_path=public as $f$
declare
  serie constant uuid := '9812b00d-ff12-48c5-90c5-d776192198dd';
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  novos jsonb := public.fin_cobrancas_itens(hoje);
  t record; marcados text[]; ck jsonb; n int := 0;
begin
  for t in select id, checklist from tarefas
           where (id=serie or recorrencia->>'serie'=serie::text) and concluida_em is null
             and arquivada_em is null and (prazo is null or prazo<=hoje)
  loop
    select coalesce(array_agg(split_part(x->>'t',' — ',1)),'{}') into marcados
      from jsonb_array_elements(coalesce(t.checklist,'[]'::jsonb)) x
      where (x->>'ok')::boolean and x->>'g' in ('Em atraso','Vence hoje');
    select coalesce(jsonb_agg(case when split_part(x->>'t',' — ',1)=any(marcados) then jsonb_set(x,'{ok}','true') else x end),'[]'::jsonb)
      || coalesce((select jsonb_agg(y) from jsonb_array_elements(coalesce(t.checklist,'[]'::jsonb)) y
                   where coalesce(y->>'g','') not in ('Em atraso','Vence hoje')),'[]'::jsonb)
      into ck from jsonb_array_elements(novos) x;
    if ck is distinct from t.checklist then
      update tarefas set checklist=ck where id=t.id; n := n+1;
    end if;
  end loop;
  return n;
end $f$;

-- dado de cobrança: nada disso é chamável pelo app (só o cron, que roda como dono)
revoke all on function public.fin_cobrancas_itens(date) from public, anon, authenticated;
revoke all on function public.fin_cobrancas_sync() from public, anon, authenticated;

-- dias úteis, 7h às 19h de Brasília (10h-22h UTC), de hora em hora
select cron.schedule('fin-cobrancas-checklist', '0 10-22 * * 1-5', 'select public.fin_cobrancas_sync()');
