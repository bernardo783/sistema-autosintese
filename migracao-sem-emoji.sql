-- JÁ APLICADO em 23/09/2026. Guardado aqui como registro.
-- Gabriel 23/09/2026: "deve ser proibido emojis no sistema, definitivamente".
-- 22 listas tinham o emoji no próprio nome (ele fazia papel de ícone). O emoji saiu do nome
-- e a lista ganhou ícone da ICO_LIB (svg:<chave>). Mapa usado:
--   Fechamento lapis · Novas Contas mais · Edição de Vídeo filme · Leads alvo · Casa SJRP casa ·
--   Usuários equipe · Lançamentos cifrao · Reembolsos carteira · Contratos/Gerador de contratos documento ·
--   Agenda calendario · Controle de Churns queda · Painel grafico · Calls telefone ·
--   Novos Contratos/Processos prancheta · Contas recibo · Acessos chave · Pipeline funil ·
--   Controle de Clientes equipe · Recebimentos banco · Folha de Pagamento recibo
update public.listas set nome = btrim(regexp_replace(nome, '^[\U0001F300-\U0001FAFF☀-➿]️?\s*', ''))
 where nome ~ '^[\U0001F300-\U0001FAFF☀-➿]';
-- tipo de tarefa Churn: ⚠ (emoji) -> △ (símbolo de texto)
update public.tipos_tarefa set icone='△' where nome='Churn' and icone like '⚠%';
