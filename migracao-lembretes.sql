-- Notificar responsável (Gabriel 23/09/2026) — JÁ APLICADA via MCP no projeto fuieonexmdupupcsyowg.
-- Histórico dos lembretes mandados pelo botão da tarefa (função lembrete-tarefa, fonte em funcoes/).
-- Quem grava é a função (service role); no app, gerente e master leem. Também é a trava de 10 min.
create table if not exists public.tarefa_lembretes (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  enviado_por uuid references public.perfis(id),
  enviado_em timestamptz not null default now(),
  instancia text,
  grupo text,
  ok boolean not null default false,
  erro text,
  payload jsonb not null default '{}'::jsonb
);
create index if not exists tarefa_lembretes_tarefa on public.tarefa_lembretes (tarefa_id, enviado_em desc);
alter table public.tarefa_lembretes enable row level security;
drop policy if exists tarefa_lembretes_leem on public.tarefa_lembretes;
create policy tarefa_lembretes_leem on public.tarefa_lembretes for select
  using (public.is_master() or public.is_gerente());

-- Configuração (tabela segredos, NÃO versionar valores):
--   lembrete_inst_luiz / lembrete_inst_joao  token da instância UAZAPI de cada gerente (gravado pelo Gabriel)
--   lembrete_jid_<grupo>                     JID de cada grupo, a função grava sozinha na 1ª vez
-- O grupo de cada lembrete sai da tabela ROTAS em funcoes/lembrete-tarefa/index.ts (lista + responsável).
