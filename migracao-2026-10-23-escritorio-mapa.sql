-- Escritório virtual, revisão de 23/10/2026: o movimento sai do canal da presença.
-- 'escritorio' = presença (todo mundo desde o login); 'escritorio-mapa' = pos/rumo (só quem está
-- com a tela aberta). Mesmas regras: só conta aprovada (is_aprovado barra modo restrito e sem perfil).
drop policy if exists escritorio_ler on realtime.messages;
drop policy if exists escritorio_enviar on realtime.messages;
create policy escritorio_ler on realtime.messages
  for select to authenticated
  using (
    (select realtime.topic()) in ('escritorio','escritorio-mapa')
    and realtime.messages.extension in ('presence','broadcast')
    and (select public.is_aprovado())
  );
create policy escritorio_enviar on realtime.messages
  for insert to authenticated
  with check (
    (select realtime.topic()) in ('escritorio','escritorio-mapa')
    and realtime.messages.extension in ('presence','broadcast')
    and (select public.is_aprovado())
  );
