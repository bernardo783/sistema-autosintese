-- Tarefas recorrentes (23/09/2026)
-- Rodar UMA vez no SQL Editor do Supabase (projeto fuieonexmdupupcsyowg). Pode repetir sem medo.
-- A regra de repetição mora na própria tarefa (jsonb). O front cria a próxima ocorrência
-- e usa recorrencia->>'gerou' como trava para dois navegadores não criarem a mesma.
alter table public.tarefas add column if not exists recorrencia jsonb;

-- a aba "Recorrentes" busca só as séries ativas
create index if not exists tarefas_recorrencia_ativa
  on public.tarefas ((recorrencia->>'gerou'))
  where recorrencia is not null;

notify pgrst, 'reload schema';
