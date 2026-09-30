-- Início do cliente pede aprovação do master (Gabriel 30/09/2026).
-- Quando o gestor define a coluna Início de um card do Controle de Clientes, cada master
-- recebe um aviso em Notificações. O pedido e a decisão (pendente / aprovado com o valor
-- do pro rata / recusado / superado) ficam em notificacoes.dados:
--   {tipo:'inicio', ini:'AAAA-MM-DD', por:<uuid do gestor>, status, valor, decididoEm, decididoPor}
-- A resposta pro gestor usa tipo 'inicio_resposta'. Aplicada em 30/09/2026.
alter table public.notificacoes add column if not exists dados jsonb;
