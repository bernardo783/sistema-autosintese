/* Testes dos formulários de avaliação (NPS) em autosintese.app.br/nps/trafego,
   /nps/agent-ia e /nps/trafego-agent-ia, da pesquisa de saída do churn e do painel
   Projetos > Pesquisa de Satisfação.
   Rodar:  node testes/nps.js

   Os formulários são a cópia do Yay "Avaliação mensal dos serviços da Auto Síntese",
   separada em três (Gabriel 30/09). Aqui se confere: as perguntas e a ordem, o que
   entra em cada formulário, as faixas das notas, o link do cliente, o corpo que vai
   pra edge, as três páginas, o gatilho do churn e as contas do painel. */
const fs=require('fs'), vm=require('vm'), path=require('path');
const raiz=path.join(__dirname,'..');
const ler=f=>fs.readFileSync(path.join(raiz,f),'utf8');
const JS=ler('nps/nps.js'), CSS=ler('nps/nps.css');
const PG={trafego:ler('nps/trafego/index.html'),ia:ler('nps/agent-ia/index.html'),integrados:ler('nps/trafego-agent-ia/index.html')};
const EDGE=ler('funcoes/pesquisa/index.ts'), SQL=ler('migracao-2026-09-30-nps-churn.sql');
const HTML=ler('index.html');

let falhas=0, total=0;
const ok=(n,c)=>{ total++; if(c) console.log('  ok  '+n); else { console.log('  FALHOU  '+n); falhas++; } };
const grupo=(t)=>console.log('\n\x1b[1m'+t+'\x1b[0m');

const A=require(path.join(raiz,'nps','nps.js'));
const ids=s=>A.visiveis(s,false).map(p=>p.id);

grupo('As perguntas do formulário original, na ordem');
{
  /* as 21 do Yay menos a primeira ("Qual serviço é prestado..."), que virou a URL */
  const yay=['Como você avalia os serviços de tráfego?',
   'O quanto o gestor de tráfego fornece informações claras e objetivas que ajudam a melhorar a tomada de decisão?',
   'Como você avalia os atendimentos e serviços da IA?',
   'O quanto o gerente auxilia na correção de erros, ajustes solicitados e sucesso do projeto?',
   'Como você avalia o gerente do projeto?','Como você avalia o gestor de tráfego do projeto?',
   'Como você avalia o projeto? Com a Auto Síntese, houve mudanças significativas no negócio?',
   'Desde o início do projeto, quanto das sugestões propostas pelos gerentes, com base em outros negócios, foram acatadas e executadas pela loja? Ainda nesse aspecto, se aceitas, o quão benéficas foram?',
   'Em relação a prazos, o quão satisfatório se apresenta o cumprimento deles?',
   'Se a Auto Síntese deixasse de existir hoje, o quanto isso afetaria no seu negócio?',
   'Quais ajustes você considera mais importantes no serviço de tráfego?','Quais ajustes você considera mais importantes no serviço de IA?',
   'Caso queira, descreva pontos de melhoria na condução do projeto até aqui.','Caso queira, descreva pontos fortes da condução do projeto até aqui.',
   'Considerando os dois serviços integrados, o quanto essa integração tem gerado melhora significativa na otimização de tempo dentro do processo comercial?',
   'Considerando a integração entre os serviços, o que mais tem gerado valor para a sua operação?',
   'Há algum ponto crítico que precise de atenção imediata no seu projeto?',
   'Em nível de importância e necessidade, qual dessas atualizações traria mais impacto ao projeto:',
   'Com base na sua satisfação com o projeto, o quanto você estaria disposto a indicar os serviços da Auto Síntese para outro lojista?',
   'Deixe aqui as informações de contato desse lojista que você acredita que se beneficiaria dos nossos serviços:'];
  ok('21 perguntas (as 20 do Yay + nome da loja)', A.PERGUNTAS.length===21);
  ok('a primeira é o nome da loja', A.PERGUNTAS[0].id==='loja'&&A.PERGUNTAS[0].req);
  yay.forEach((t,i)=>ok((i+1)+'. '+t.slice(0,60), A.PERGUNTAS[i+1]&&A.PERGUNTAS[i+1].t===t));
  ok('a pergunta do serviço saiu (o serviço é a URL)', !A.PERGUNTAS.some(p=>p.id==='servico'));
  const obrig=A.PERGUNTAS.filter(p=>p.req).map(p=>p.id).join(',');
  ok('obrigatórias iguais ao Yay (+ loja)', obrig==='loja,nota_trafego,gestor_clareza,nota_ia,gerente_apoio,aval_gerente,aval_gestor,aval_projeto,prazos,dependencia,integracao_tempo,nps');
  ok('abertura: título do Yay', PG.trafego.indexOf('<h1>Avaliação mensal dos serviços da Auto Síntese</h1>')>0);
  ok('abertura: texto dos 15 minutos', PG.trafego.indexOf('deve levar até 15 minutos.')>0);
  ok('encerramento: agradecimento', PG.trafego.indexOf('Agradecemos pela sua avaliação')>0);
  ok('encerramento: próximo ciclo', PG.trafego.indexOf('prestação dos serviços no próximo ciclo.')>0);
}

grupo('Três formulários: cada um só com as perguntas do serviço');
{
  ok('só tráfego: 17 perguntas', ids('trafego').length===17);
  ok('só Agent IA: 15 perguntas', ids('ia').length===15);
  ok('tráfego + Agent IA: 21 perguntas (todas)', ids('integrados').length===21);
  ok('tráfego não tem as de IA nem as de integração', !ids('trafego').some(i=>/^(nota_ia|ajustes_ia|integracao_)/.test(i)));
  ok('Agent IA não tem as de tráfego nem as de integração', !ids('ia').some(i=>/^(nota_trafego|gestor_clareza|aval_gestor|ajustes_trafego|integracao_)/.test(i)));
  ok('Agent IA não pergunta do gestor de tráfego', ids('ia').indexOf('aval_gestor')<0&&ids('ia').indexOf('gestor_clareza')<0);
  ok('as comuns aparecem nos três', ['gerente_apoio','aval_gerente','aval_projeto','prazos','dependencia','ponto_critico','prioridade','nps','indicacao']
    .every(i=>ids('trafego').indexOf(i)>=0&&ids('ia').indexOf(i)>=0&&ids('integrados').indexOf(i)>=0));
  ok('a ordem do original é mantida em cada formulário', ['trafego','ia','integrados'].every(s=>{
    const todos=A.PERGUNTAS.map(p=>p.id); let ult=-1; return ids(s).every(i=>{ const k=todos.indexOf(i); const bom=k>ult; ult=k; return bom; }); }));
  ok('serviço desconhecido não monta formulário', A.visiveis('outro',false).length===0);
  const corpo=A.corpoDe({loja:'Loja X',nota_trafego:9,nota_ia:7,nps:10,aval_gestor:'bom'},'ia',false);
  ok('resposta de tráfego não vai no formulário de IA', corpo.nota_trafego===undefined&&corpo.aval_gestor===undefined);
  ok('corpo leva o que vale', corpo.loja==='Loja X'&&corpo.nota_ia===7&&corpo.nps===10);
}

grupo('Link do cliente (pesquisa de saída) e link solto');
{
  const r='753d4d97-2c31-4ecf-94d4-de00880f3214';
  ok('?r= com o código do cliente', A.lerLink('?r='+r).r===r);
  ok('código que não é uuid é ignorado', A.lerLink('?r=123').r===''&&A.lerLink('?r=<script>').r==='');
  ok('?g= com o primeiro nome do gerente', A.lerLink('?g=Joao').g==='joao');
  ok('gerente com caractere estranho é ignorado', A.lerLink('?g=jo%20ao').g===''&&A.lerLink('?g=a').g==='');
  ok('sem nada no endereço', A.lerLink('').r===''&&A.lerLink('').g==='');
  ok('link do cliente não pergunta a loja', A.visiveis('trafego',true)[0].id!=='loja'&&A.visiveis('trafego',true).length===16);
  ok('link solto pergunta a loja primeiro', A.visiveis('ia',false)[0].id==='loja');
  ok('corpo do link do cliente não leva loja', A.corpoDe({loja:'X Y',nps:9},'trafego',true).loja===undefined);
  ok('pastas das páginas', A.PAGINAS.trafego==='trafego'&&A.PAGINAS.ia==='agent-ia'&&A.PAGINAS.integrados==='trafego-agent-ia');
  ok('a página pede o contexto do código à edge', JS.indexOf("fetch(ENDPOINT+'?r='+LINK.r")>0);
  ok('já respondida: mostra o encerramento, não o formulário', JS.indexOf('Esta avaliação já foi respondida')>0);
  ok('cliente que saiu não lê "mês que se passou"', JS.indexOf("CTX.tipo==='churn'")>0&&JS.indexOf('serviços prestados durante o projeto')>0);
}

grupo('Faixas das notas');
{
  const P=id=>A.PERGUNTAS.find(p=>p.id===id);
  ok('nota de 1 a 10: 0 não vale', !A.respondida(P('nota_trafego'),0)&&A.respondida(P('nota_trafego'),1)&&A.respondida(P('nota_trafego'),10));
  ok('escala de 0 a 10: 0 vale, 11 não', A.respondida(P('prazos'),0)&&!A.respondida(P('prazos'),11));
  ok('indicação (NPS) é 0 a 10', A.respondida(P('nps'),0)&&P('nps').tipo==='escala');
  ok('obrigatória vazia não passa', !A.valida(P('aval_gerente'),'  '));
  ok('opcional vazia passa', A.valida(P('melhorias'),''));
  ok('escolha fora da lista não vale', !A.respondida(P('prioridade'),'outro'));
  ok('loja precisa de 2 letras', !A.respondida(P('loja'),'x')&&A.respondida(P('loja'),'JR'));
}

grupo('As três páginas');
{
  ok('/nps/trafego define o serviço trafego', /window\.SERVICO='trafego'/.test(PG.trafego));
  ok('/nps/agent-ia define o serviço ia', /window\.SERVICO='ia'/.test(PG.ia));
  ok('/nps/trafego-agent-ia define o serviço integrados', /window\.SERVICO='integrados'/.test(PG.integrados));
  const sem=h=>h.replace(/window\.SERVICO='[a-z]+'/,'').replace(/Formulário de avaliação \(NPS\): [^.]+\./,'');
  ok('as três páginas só diferem no serviço', sem(PG.trafego)===sem(PG.ia)&&sem(PG.ia)===sem(PG.integrados));
  ok('carregam o CSS e o JS compartilhados', Object.values(PG).every(h=>h.indexOf('/nps/nps.css?v=')>0&&h.indexOf('/nps/nps.js?v=')>0));
  ok('noindex (não aparece no Google)', Object.values(PG).every(h=>h.indexOf('noindex')>0));
  ok('honeypot presente', Object.values(PG).every(h=>h.indexOf('id="hp_site"')>0));
  ok('mesmo visual do contrato: roxo e logo', CSS.indexOf('--brand:#6E0AD6')>=0&&CSS.indexOf('--logo:url(data:image/png')>=0);
  ok('fala com a edge pesquisa, não com a tabela', JS.indexOf("'/functions/v1/pesquisa'")>0&&JS.indexOf('/rest/v1/')<0);
  ok('nenhuma chave secreta no público', !/service_role|sb_secret_/.test(JS+PG.trafego+PG.ia+PG.integrados));
  ok('o JS compila', (()=>{ try{ new vm.Script(JS); return true; }catch(e){ console.log(e.message); return false; } })());
}

grupo('Edge pesquisa');
{
  ok('aceita os três serviços', /servico:\['trafego','ia','integrados'\]/.test(EDGE));
  ok('não depende mais de /joao e /luiz', EDGE.indexOf('gerente invalido')<0&&EDGE.indexOf('7d2d310a')<0);
  ok('GET só abre ficha criada pelo sistema', EDGE.indexOf('if(!x||!x.ficha_id) return j({ok:true,existe:false})')>0);
  ok('link do cliente: loja do navegador não troca a da ficha', EDGE.indexOf('if(atual&&atual.ficha_id) delete campos.loja')>0);
  ok('final exige loja, serviço e indicação', EDGE.indexOf("tem('loja')&&tem('servico')&&tem('nps')")>0);
  ok('reenvio de avaliação concluída não regrava', EDGE.indexOf('jaEnviada:true')>0);
  ok('limite por IP e honeypot continuam', EDGE.indexOf('muitas tentativas')>0&&EDGE.indexOf('body.hp_site')>0);
  ok('mesmos campos de nota da página', ['nota_trafego','gestor_clareza','nota_ia','gerente_apoio','prazos','dependencia','integracao_tempo','nps']
    .every(k=>EDGE.indexOf(k+':[')>0&&A.PERGUNTAS.some(p=>p.id===k)));
}

grupo('Banco: todo churn pede a pesquisa de saída');
{
  ok('gatilho na tarefa que muda de lista', /create trigger trg_nps_churn after insert or update of lista_id on public\.tarefas/.test(SQL));
  ok('olha o Controle de Churns (mesmo id do sistema)', SQL.indexOf("'c1000000-0000-4000-8000-000000000001'")>0&&/const CH_ID='c1000000-0000-4000-8000-000000000001'/.test(HTML));
  ok('cria a pesquisa e avisa o gerente da ficha', SQL.indexOf('perform pesquisa_churn_criar(NEW.ficha_id, NEW.id)')>0&&SQL.indexOf("'Pesquisa de saída: '")>0);
  ok('cliente voltou: a pesquisa sem resposta some', /OLD\.lista_id = v_ch and NEW\.lista_id is distinct from v_ch[\s\S]{0,200}enviado_em is null/.test(SQL));
  ok('erro na pesquisa nunca trava o churn', SQL.indexOf('exception when others then')>0);
  ok('tipo do cliente escolhe o formulário', /when 'trafego' then 'trafego' when 'ia' then 'ia' when 'full' then 'integrados'/.test(SQL));
  ok('só master ou o gerente da ficha pega o link', SQL.indexOf('is_master() or gerente_da_ficha(p_ficha)')>0);
  ok('função interna fechada pra fora', SQL.indexOf('revoke all on function public.pesquisa_churn_criar(text, uuid) from public, anon, authenticated')>0);
  ok('sem emoji e sem travessão nos avisos', !/\p{Extended_Pictographic}/u.test(SQL)&&SQL.split('\n').filter(l=>!/^\s*--/.test(l)).join('\n').indexOf('—')<0);
}

grupo('Regras do sistema: sem emoji e sem travessão na tela');
{
  const ps=HTML.slice(HTML.indexOf('/* ---------- PESQUISA DE SATISFAÇÃO'),HTML.indexOf('/* ---------- FINANCEIRO (central)'));
  const emoji=/\p{Extended_Pictographic}/u;
  const pub=JS+PG.trafego+PG.ia+PG.integrados;
  ok('sem emoji nos formulários', !emoji.test(pub));
  ok('sem emoji no painel', !emoji.test(ps));
  ok('sem travessão nos formulários', pub.indexOf('—')<0);
  ok('sem travessão no painel', ps.indexOf('—')<0);
  ok('nenhum rótulo do painel em --fraco', !/\.ps-card h3\{[^}]*--fraco/.test(HTML)&&!/\.ps-qa \.q\{[^}]*--fraco/.test(HTML));
}

grupo('Painel: contas');
{
  const ps=HTML.slice(HTML.indexOf('/* ---------- PESQUISA DE SATISFAÇÃO'),HTML.indexOf('let psMes='));
  const g={console,Math,JSON,String,Number,Object,Array,Date,isNaN}; vm.createContext(g);
  g.esc=s=>String(s==null?'':s);
  vm.runInContext(ps+';Object.assign(this,{psNps,psSatisf,psClasse,psRisco,psTemCritico,psUltimas,psComp,psZona,psGer,psLink,PS_PAG,PS_SERV});',g);
  const n=g.psNps([{nps:10},{nps:9},{nps:8},{nps:6},{nps:0},{nps:null}]);
  ok('NPS: 2 promotores, 1 neutro, 2 detratores de 5 = 0', n.nps===0&&n.pro===2&&n.neu===1&&n.det===2&&n.t===5);
  ok('NPS: todos 10 = 100', g.psNps([{nps:10},{nps:9}]).nps===100);
  ok('NPS: sem notas = vazio', g.psNps([]).nps===null);
  ok('satisfação: média só do que foi respondido', g.psSatisf({nota_trafego:8,gestor_clareza:6,nota_ia:null,nps:0,dependencia:0})===7);
  ok('satisfação: 8 = satisfeito, 6 = neutro, 5,9 = insatisfeito', g.psClasse(8)==='satisfeito'&&g.psClasse(6)==='neutro'&&g.psClasse(5.9)==='insatisfeito');
  ok('"não", "Nada." e "-" não são ponto crítico', !g.psTemCritico('não')&&!g.psTemCritico('Nada.')&&!g.psTemCritico(' - ')&&!g.psTemCritico('Não.'));
  ok('texto de verdade é ponto crítico', g.psTemCritico('saldo acabou'));
  ok('risco baixo sem sinais', g.psRisco({nps:9,gerente_apoio:9,dependencia:9}).nivel==='baixo');
  ok('risco médio com 1 sinal', g.psRisco({nps:6,gerente_apoio:9,dependencia:9}).nivel==='medio');
  ok('risco alto com 2 sinais', g.psRisco({nps:6,gerente_apoio:9,dependencia:3}).nivel==='alto');
  ok('risco alto com indicação até 4', g.psRisco({nps:4,gerente_apoio:10,dependencia:10}).nivel==='alto');
  const u=g.psUltimas([{gerente:'Luiz',loja:'Sabará Motors',enviado_em:'2026-09-02T10:00:00Z',nps:3},
    {gerente:'Luiz',loja:'SABARA MOTORS ',enviado_em:'2026-09-20T10:00:00Z',nps:9},{gerente:'João',loja:'Sabará Motors',enviado_em:'2026-09-01T10:00:00Z',nps:5}]);
  ok('uma avaliação por loja (a mais recente, sem ligar pra acento/maiúscula)', u.length===2&&u.find(r=>r.gerente==='Luiz').nps===9);
  ok('mês no horário de Brasília (01/10 00h UTC ainda é setembro)', g.psComp('2026-10-01T02:00:00Z')==='2026-09'&&g.psComp('2026-10-01T03:00:00Z')==='2026-10');
  ok('zonas do NPS', g.psZona(80).t==='Excelência'&&g.psZona(50).t==='Qualidade'&&g.psZona(0).t==='Aperfeiçoamento'&&g.psZona(-1).t==='Crítico');
  ok('gerente é o primeiro nome da ficha, qualquer um', g.psGer({gerente:'Luan Santiago'})==='Luan'&&g.psGer({gerente:null})==='Sem gerente');
  ok('link do cliente leva o código', g.psLink('integrados','abc')==='https://autosintese.app.br/nps/trafego-agent-ia/?r=abc');
  ok('link solto do gerente leva o nome', g.psLink('ia','','joao')==='https://autosintese.app.br/nps/agent-ia/?g=joao');
  ok('link solto sem gerente', g.psLink('trafego','','')==='https://autosintese.app.br/nps/trafego/');
  ok('painel e formulário usam as mesmas pastas', JSON.stringify(g.PS_PAG)===JSON.stringify(A.PAGINAS));
  ok('painel e formulário chamam os serviços igual', JSON.stringify(g.PS_SERV)===JSON.stringify(A.SERVICOS));
}

grupo('Sistema: onde a pesquisa de saída aparece');
{
  ok('lista Pesquisa de Satisfação abre a tela pesquisa', /\[LPESQ\]:'pesquisa'/.test(HTML));
  ok('só master e gerente enxergam a lista', /lid!==LPESQ\|\|souGerente\(\)/.test(HTML));
  ok('rota barra quem não é gerente', /view==='pesquisa'\)\{\s*if\(!souGerente\(\)\)/.test(HTML));
  ok('churn pelo formulário já abre o link da pesquisa', /if\(ok&&t\.ficha_id\) setTimeout\(\(\)=>\{ try\{ psSaida\(t\.ficha_id\)/.test(HTML));
  ok('ficha do cliente em churn tem o botão Pesquisa de saída', HTML.indexOf(`onclick="psSaida('\${esc(it.id)}')">Pesquisa de saída</button>`)>0);
  ok('o botão pede o link ao banco', HTML.indexOf("sb.rpc('pesquisa_churn_link',{p_ficha:fid})")>0);
  ok('contador na gramática "feitos de previstos"', HTML.indexOf('${saidas.length-abertas.length} de ${saidas.length} respondidas')>0);
  ok('criar link vive na barra do topo, uma vez', (HTML.match(/onclick="psCopiar\(\)"/g)||[]).length===1);
}

console.log('\n'+(falhas?'\x1b[31m>>> '+falhas+' de '+total+' FALHARAM\x1b[0m':'\x1b[32m>>> '+total+' testes, todos ok\x1b[0m'));
process.exit(falhas?1:0);
