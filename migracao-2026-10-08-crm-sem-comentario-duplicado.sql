-- CRM de formulário: o robô não repete no comentário o que já está no contato do lead
-- (Bernardo 08/10: "Esse Claude [robô] roubou a duplicidade. Tudo já está na informação de
-- contato ali. Você pode tirar essa mensagem que ele manda na inicial").
-- Antes: todo lead novo ganhava "📋 Respostas do formulário (Yay Forms)" com nome, WhatsApp,
-- Instagram e cargo, tudo já nos campos do card. Agora o comentário só nasce com o que NÃO tem
-- campo no card (ex.: "média de motos vendidas" do CRM Motos, ou o cargo quando o card ficou sem).
-- Sem sobra, não tem comentário; o que já existia e virou duplicado sai.

-- cópia dos comentários antigos antes de apagar/reescrever
create table if not exists bkp_comentarios_respostas_20261008 as
  select * from tarefa_comentarios
   where autor = '4708095e-00c0-4724-91f7-1e6478f77bf7' and texto like '📋 Respostas do formulário (Yay Forms)%';

create or replace function public.crm_respostas_comentar(l leads, tid uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare robo uuid := '4708095e-00c0-4724-91f7-1e6478f77bf7'; idr text := coalesce(l.externo_id, l.id::text);
        tem_cargo boolean; extras text; txt text; cid uuid;
begin
  select coalesce(bool_or(coalesce(t.valores->>c.id::text, '') <> ''), false) into tem_cargo
    from tarefas t join campos_lista c on c.lista_id = t.lista_id and c.nome = 'Cargo' where t.id = tid;
  select string_agg(a.rot || ': ' || a.resp, E'\n' order by a.k) into extras from (
    select b.key k, b.resp,
      case when b.tit ~* 'whats|tele?fone|celular' then 'WhatsApp'
           when b.tit ~* 'instagram' then 'Instagram'
           when b.tit ~* 'cargo' or (b.tit ~ '^[0-9a-f]{24}$' and b.resp ~* 'dono|vendedor|gerente|marketing') then 'Cargo'
           when b.tit ~* 'vendid' then 'Vendas por mês'
           when b.tit ~* 'nome' then 'Nome'
           when b.tit ~* 'e-?mail' then 'E-mail'
           when b.tit ~ '^[0-9a-f]{24}$' then 'Resposta'
           else b.tit end rot
      from (select k.key, trim(k.value->>'fieldTitle') tit,
                   trim(case jsonb_typeof(k.value->'content')
                          when 'array' then (select string_agg(x, ', ') from jsonb_array_elements_text(k.value->'content') x)
                          else k.value->>'content' end) resp
              from jsonb_each(coalesce(coalesce(l.bruto->'response', l.bruto)->'answers', '{}'::jsonb)) k
             where jsonb_typeof(k.value) = 'object') b) a
   where coalesce(a.resp, '') <> '' and a.rot not in ('Nome', 'WhatsApp', 'Instagram') and not (a.rot = 'Cargo' and tem_cargo);

  select id into cid from tarefa_comentarios
   where tarefa_id = tid and autor = robo and texto like '%ID da resposta no Yay: ' || idr || '%' limit 1;
  if extras is null then
    if cid is not null then delete from tarefa_comentarios where id = cid; end if;
    return;
  end if;
  txt := '📋 Do formulário (não está no contato)' || E'\n' || extras || E'\nID da resposta no Yay: ' || idr;
  if cid is null then
    insert into tarefa_comentarios (tarefa_id, autor, texto, criado_em)
    values (tid, robo, txt, coalesce((coalesce(l.bruto->'response', l.bruto)->>'createdAt')::timestamptz, l.recebido_em, now()));
  else
    update tarefa_comentarios set texto = txt, editado_em = now() where id = cid and texto is distinct from txt;
  end if;
end $function$;

-- refaz o comentário dos leads que já estão no CRM
select crm_respostas_comentar(l, l.tarefa_id) from leads l where l.tarefa_id is not null;
