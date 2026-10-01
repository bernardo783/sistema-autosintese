-- Modo restrito (Gabriel 01/10/2026): usuário que só usa UMA lista (ADM TARAF em Novas Contas).
-- perfis.so_lista = id da lista. O app (rsAplicar/restrito) esconde barra lateral, busca, Início,
-- Avisos e todas as telas; qualquer navegação volta pra lista. Master nunca é restrito.
-- Quem marca é o master em Administrativo > Usuários > "Modo restrito: só usa esta lista"; ao marcar,
-- a pessoa vira membro da lista em no_membros (permissao 'editar'). Aplicada em 01/10/2026.
alter table public.perfis add column if not exists so_lista uuid;
