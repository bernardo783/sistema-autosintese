-- JÁ APLICADA em 23/09/2026 (migração "tarefas_autoria_e_horario_fixos" no Supabase). Guardada aqui como registro.
-- Gabriel 23/09/2026: sempre registrar quem criou a tarefa/demanda e a hora em
-- que ela subiu. No INSERT o banco preenche o autor com quem está logado (se o app
-- não mandou) e a hora do servidor; no UPDATE os dois nunca mudam.
-- Inserção pelo servidor (edge function / service role) fica sem autor: é o sistema.
create or replace function public.tarefas_autoria() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, auth.uid());
    new.criado_em  := now();
  else
    new.criado_por := old.criado_por;
    new.criado_em  := old.criado_em;
  end if;
  return new;
end $$;
drop trigger if exists trg_tarefas_autoria on public.tarefas;
create trigger trg_tarefas_autoria before insert or update on public.tarefas
  for each row execute function public.tarefas_autoria();
