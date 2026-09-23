-- JÁ APLICADA em 23/09/2026 (migração "listas_fechar_quadro" no Supabase). Guardada aqui como registro.
-- "Fechar quadro" do Trello (Gabriel 23/09/2026): a lista fechada some da árvore
-- e fica em Arquivados, de onde volta. Só master fecha ou reabre; o resto pede ao
-- Bernardo por chamado (suporte_abrir_chamado).
alter table public.listas add column if not exists fechada_em timestamptz;
alter table public.listas add column if not exists fechada_por uuid references public.perfis(id);

create or replace function public.listas_trava_fechar() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if (new.fechada_em is distinct from old.fechada_em or new.fechada_por is distinct from old.fechada_por)
     and not public.is_master() then
    raise exception 'Só um master fecha ou reabre uma lista. Peça pelo menu da lista.';
  end if;
  return new;
end $$;
drop trigger if exists trg_listas_trava_fechar on public.listas;
create trigger trg_listas_trava_fechar before update on public.listas
  for each row execute function public.listas_trava_fechar();
