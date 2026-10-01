-- Cobranças do dia (Gabriel 01/10/2026). Aplicada em 01/10 (migração lista_cobrancas_do_dia).
-- Lista "Cobranças" em Administrativo > Financeiro: o sistema cria sozinho uma tarefa pro Bernardo
-- (master, NC_PAGADOR) para cada cobrança do mês que venceu e ainda não foi cobrada nem recebida
-- (cbSincronizar no front; chave em tarefas.valores.cobranca = clienteId|AAAA-MM). A caixa "Cobrei"
-- do Recebimentos (recebimento.cobradoEm) e a conclusão da tarefa são a mesma coisa.
insert into listas (id, espaco_id, pasta_id, nome, ordem, icone, privado, estrutura_restrita, exige)
values ('c2000000-0000-4000-8000-0000000000c1','f2fb9098-6f57-4856-a460-9e5f3d884e3a','f1e2d3c4-0000-4a00-8b00-00000000f000','Cobranças',4,'svg:sino',true,false,'{}')
on conflict (id) do nothing;
insert into status_lista (id, lista_id, nome, cor, grupo, ordem) values
 ('c2000000-0000-4000-8000-00000000c101','c2000000-0000-4000-8000-0000000000c1','1. A COBRAR','#e6b13f','nao_iniciado',0),
 ('c2000000-0000-4000-8000-00000000c102','c2000000-0000-4000-8000-0000000000c1','2. COBRADO','#3fcf8e','fechado',1)
on conflict (id) do nothing;
