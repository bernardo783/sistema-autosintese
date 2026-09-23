-- JÁ APLICADO em 23/09/2026. Guardado aqui como registro.
-- Gabriel 23/09/2026: "se for squad1, o disparo tem que ser 11 91504-7150. Se for o squad2, 11 92174-2778".
-- 1) Mapa único squad -> número (lido pela edge lembrete-tarefa v9 e pelo trigger abaixo):
insert into segredos (chave, valor, descricao, atualizado_em)
values ('lembrete_squad_numero', '{"01":"luiz","02":"joao"}',
  'Número que dispara as mensagens de cada squad (Gabriel 23/09): 01 = Luiz 11 91504-7150 (lembrete_inst_luiz), 02 = João 11 92174-2778 (lembrete_inst_joao). Usado pela edge lembrete-tarefa e por wa_aviso_revisao_editorial.', now())
on conflict (chave) do update set valor=excluded.valor, descricao=excluded.descricao, atualizado_em=now();
-- 2) wa_aviso_revisao_editorial (migração "revisao_editorial_numero_do_squad"): o token sai de
--    lembrete_inst_<mapa[squad do cliente]>; sem squad, o da rota wa_rota_editorial_revisao (João).
-- 3) Edge lembrete-tarefa v9 (funcoes/lembrete-tarefa/index.ts): enviar e concluida escolhem o número pelo
--    squad da tarefa (tarefas.squad ou squad_da_ficha); reserva = quem clicou/criou, com aviso.
-- Não mexido de propósito: trg_wa_aviso_concluida continua DESLIGADO (a conclusão sai pela edge /concluida);
-- espelhar_video (vídeo pronto) já saía pelo número certo via wa_rota_campanhas_<pessoa>.
-- Conferido na UAZAPI: Luiz está em SQUAD1 e SÍNTESE - EDITORIAL (5.0); João em SQUAD 2 - COMUNICAÇÃO e no EDITORIAL.
