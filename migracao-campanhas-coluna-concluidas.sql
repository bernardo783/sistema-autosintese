-- Campanhas: tarefas concluídas pelo checkbox que ficaram na coluna Pendente (23/09/2026)
-- JÁ APLICADA via MCP. Corrigiu 2 tarefas de ago/2026. O bug (checkbox não mexia na coluna)
-- foi corrigido no app no commit 176dcea (tkColunaDe).
begin;
alter table public.tarefas disable trigger trg_ntf_tarefas;   -- sem aviso pra equipe
alter table public.tarefas disable trigger tarefas_touch_trg;  -- sem mexer no "atualizada em"
update public.tarefas t set status_id = '3c53c4fb-a2ed-4535-b539-14606e56eb78'   -- Concluído
 where t.lista_id = 'cd04ad6e-0cd2-4838-b050-49fcfebafe05' and t.status = 'feito'
   and t.status_id in (select id from public.status_lista where lista_id = t.lista_id and grupo not in ('feito','fechado'));
alter table public.tarefas enable trigger trg_ntf_tarefas;
alter table public.tarefas enable trigger tarefas_touch_trg;
commit;
