-- 23/09/2026: JÁ APLICADA. Fechamento de contrato sai da barra lateral do gerente e fica só
-- dentro do Administrativo (Jurídico > 📋 Novos Contratos, que abre a tela de fechamento).
-- Pra ele não perder o acesso, os gerentes (Luiz, João) entram na pasta Jurídico e na lista
-- Novos Contratos. O "Gerador de contratos" (lista privada na mesma pasta) continua fechado.
insert into no_membros (tipo, no_id, user_id, permissao, criado_por)
select x.tipo, x.no_id::uuid, p.id, 'editar', '6b3b1d5d-2ee0-4529-a6c4-23d415678bff'
  from perfis p, (values ('pasta','669dd5f7-3229-4aa1-906d-33518df9c00c'),      -- Jurídico
                         ('lista','f1e2d3c4-0000-4a00-8b00-000000000001')) x(tipo,no_id)  -- Novos Contratos
 where p.gerente and p.role<>'master' and p.aprovado
on conflict (tipo, no_id, user_id) do update set permissao='editar';
