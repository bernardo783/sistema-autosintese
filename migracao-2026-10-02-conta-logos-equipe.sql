-- Logo do cliente no relatório de tráfego: quem é da equipe consegue salvar.
-- Antes só o master gravava em conta_logos, mas o resto da mesma tela (nome e cores da marca)
-- mora em itens.contas_meta, que qualquer usuário aprovado já edita. Resultado: gestor/gerente
-- trocava nome e cor, e a logo dava "new row violates row-level security policy".
-- Agora inserir e atualizar seguem a mesma regra do contas_meta (is_aprovado). Apagar a linha
-- continua só do master (a tela "remove" a logo gravando vazio, não apagando).
-- O modo restrito (rs_bloqueia) continua valendo por cima.

drop policy if exists conta_logos_ins on public.conta_logos;
create policy conta_logos_ins on public.conta_logos
  for insert to authenticated with check (is_aprovado());

drop policy if exists conta_logos_upd on public.conta_logos;
create policy conta_logos_upd on public.conta_logos
  for update to authenticated using (is_aprovado()) with check (is_aprovado());
