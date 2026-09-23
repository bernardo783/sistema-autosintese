-- =====================================================================================
-- Tarefa em RASCUNHO (23/09/2026). JÁ APLICADA no Supabase.
--
-- Pedido do Gabriel: criar tarefa estava "cheio de viadagem". Obrigatório de verdade só:
-- cliente (nas listas que pedem cliente, hoje as do Marketing), data e responsável.
-- Digitou o título (ou a descrição), a tarefa já existe como rascunho: só quem criou
-- enxerga e ninguém é avisado. Completou os três, sai do rascunho sozinha e o banco avisa
-- como tarefa nova ("Nova tarefa" pro squad, "Atribuída a você" pro responsável).
-- Quem liga/desliga o rascunho é o app (formulário e criação rápida do quadro); tarefa
-- criada pelo sistema (cards de cliente, vídeo aprovado, contas, repetições) nasce false.
-- =====================================================================================

alter table public.tarefas add column if not exists rascunho boolean not null default false;
comment on column public.tarefas.rascunho is 'Tarefa em rascunho: so o criado_por enxerga e nao gera aviso. Vira false quando tem cliente (se a lista exige), prazo e responsavel.';

drop policy if exists tarefas_leem on public.tarefas;
create policy tarefas_leem on public.tarefas for select
  using (tarefa_visivel_em(ficha_id, squad, lista_id) and lista_visivel(lista_id)
         and (not rascunho or criado_por = auth.uid()));

drop policy if exists tarefas_atualizam on public.tarefas;
create policy tarefas_atualizam on public.tarefas for update
  using (tarefa_visivel_em(ficha_id, squad, lista_id) and lista_visivel(lista_id)
         and (not rascunho or criado_por = auth.uid()))
  with check (tarefa_visivel_em(ficha_id, squad, lista_id) and lista_visivel(lista_id)
         and (not rascunho or criado_por = auth.uid()));

-- avisos (ntf_tarefas): rascunho não avisa; saiu do rascunho = avisa como tarefa nova.
-- Remendo aplicado por substituição de texto na função existente (ela é de outra frente):
--   declare ... nasce boolean := false;
--   if TG_OP='DELETE' and coalesce(OLD.rascunho,false) then return OLD; end if;
--   if TG_OP<>'DELETE' then
--     if coalesce(NEW.rascunho,false) then return NEW; end if;
--     nasce := TG_OP='INSERT' or (TG_OP='UPDATE' and coalesce(OLD.rascunho,false));
--   end if;
--   "if TG_OP='INSERT' then" (bloco Nova tarefa)      -> "if nasce then"
--   "if TG_OP='UPDATE' then" (cálculo dos novos resp.) -> "if TG_OP='UPDATE' and not nasce then"
do $$
declare s text;
begin
  s := pg_get_functiondef('public.ntf_tarefas()'::regprocedure);
  if position('nasce := TG_OP' in s) > 0 then return; end if;   -- já aplicado
  s := replace(s, $q$novos uuid[] := '{}'; staff uuid[]; d uuid;$q$,
                  $q$novos uuid[] := '{}'; staff uuid[]; d uuid; nasce boolean := false;$q$);
  s := replace(s, $q$  if TG_OP='DELETE' then
    -- tarefa_id nulo$q$,
                  $q$  if TG_OP='DELETE' and coalesce(OLD.rascunho,false) then return OLD; end if;
  if TG_OP<>'DELETE' then
    if coalesce(NEW.rascunho,false) then return NEW; end if;
    nasce := TG_OP='INSERT' or (TG_OP='UPDATE' and coalesce(OLD.rascunho,false));
  end if;
  if TG_OP='DELETE' then
    -- tarefa_id nulo$q$);
  s := replace(s, $q$    if TG_OP='INSERT' then
      if NEW.arquivada_em is null then$q$,
                  $q$    if nasce then
      if NEW.arquivada_em is null then$q$);
  s := replace(s, $q$    if TG_OP='UPDATE' then
      select coalesce(array_agg(x),'{}') into novos$q$,
                  $q$    if TG_OP='UPDATE' and not nasce then
      select coalesce(array_agg(x),'{}') into novos$q$);
  if position('nasce := TG_OP' in s)=0 or position('if nasce then' in s)=0 or position('and not nasce then' in s)=0 then
    raise exception 'ntf_tarefas mudou: o remendo do rascunho nao encaixou';
  end if;
  execute s;
end $$;
