-- Conclusão com relatório (Gabriel 23/09/2026) — JÁ APLICADA via MCP.
-- Concluir tarefa pede "O que foi feito nesta tarefa?" (texto livre, obrigatório); o app grava aqui
-- e a função lembrete-tarefa (/concluida) manda "Demanda concluída" no grupo do responsável.
alter table public.tarefas add column if not exists conclusao_texto text;
alter table public.tarefas add column if not exists concluida_por uuid references public.perfis(id);
comment on column public.tarefas.conclusao_texto is 'O que foi feito (preenchido pelo responsável ao concluir)';
alter table public.tarefa_lembretes add column if not exists tipo text not null default 'lembrete';  -- 'lembrete' | 'conclusao'

-- O aviso antigo de campanha concluída (sessão [03]) sairia em dobro: só o trigger foi desligado.
-- A função wa_aviso_concluida e o segredo wa_grupo_squad_02 continuam no banco.
drop trigger if exists trg_wa_aviso_concluida on public.tarefas;
notify pgrst, 'reload schema';
