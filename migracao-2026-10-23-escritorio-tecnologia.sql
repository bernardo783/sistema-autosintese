-- Escritório virtual (Gabriel 23/10/2026: sala dos sócios "nada a ver"): a sala vira Tecnologia e Projetos.
-- Sócio fica na sala do time dele: o José vai pro Comercial (mesa 2, a do lado do Kennedy e da Luana).
update public.escritorio_salas set id = 'tecnologia' where id = 'socios'
  and not exists (select 1 from public.escritorio_salas where id = 'tecnologia');
update public.escritorio_mesas set sala = 'tecnologia' where sala = 'socios';
update public.escritorio_mesas m set sala = 'comercial', mesa = 2, atualizado_em = now()
from public.perfis p
where p.id = m.pessoa and p.nome = 'José'
  and not exists (select 1 from public.escritorio_mesas x where x.sala = 'comercial' and x.mesa = 2);

-- o Arthur fica na fileira de cima, do lado do Gabriel (a mesa que o José deixou)
update public.escritorio_mesas m set mesa = 2, atualizado_em = now() from public.perfis p
where p.id = m.pessoa and p.nome = 'Arthur' and m.sala = 'tecnologia'
  and not exists (select 1 from public.escritorio_mesas x where x.sala = 'tecnologia' and x.mesa = 2);

-- reverter:
-- update public.escritorio_mesas m set mesa = 3 from public.perfis p where p.id = m.pessoa and p.nome = 'Arthur';
-- update public.escritorio_mesas m set sala = 'tecnologia', mesa = 2 from public.perfis p where p.id = m.pessoa and p.nome = 'José';
-- update public.escritorio_mesas set sala = 'socios' where sala = 'tecnologia';
-- update public.escritorio_salas set id = 'socios' where id = 'tecnologia';
