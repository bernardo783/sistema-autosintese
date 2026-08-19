/* Bateria de testes do Sistema AutoSíntese.
   Rodar:  node testes/rodar.js

   O app é um index.html só, sem build. Este arquivo recorta os blocos de lógica
   direto do HTML, roda cada um num contexto isolado com o mínimo de stubs e
   confere o comportamento. Não precisa de login, banco nem navegador.

   Estava tudo em /tmp e o sistema limpou a pasta — por isso mora aqui agora. */
const fs=require('fs'), vm=require('vm'), path=require('path');
const HTML=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

let falhas=0, total=0;
const ok=(n,c)=>{ total++; if(c) console.log('  ok  '+n); else { console.log('  FALHOU  '+n); falhas++; } };
const secao=(t)=>console.log('\n— '+t+' —');
const grupo=(t)=>console.log('\n\x1b[1m'+t+'\x1b[0m');

/* recorta de "de" até "ate" (exclusivo) */
function bloco(de,ate){
  const i=HTML.indexOf(de);
  if(i<0) throw new Error('não achei o trecho: '+de.slice(0,50));
  const j=HTML.indexOf(ate,i);
  if(j<0) throw new Error('não achei o fim: '+ate.slice(0,50));
  return HTML.slice(i,j);
}
/* `const x=...` dentro do contexto fica no escopo léxico e não vira propriedade
   global — só `function f(){}` e `window.x=` viram. Por isso os nomes a testar
   são exportados na mão no fim do trecho. */
function rodar(codigo,ctx,exporta){
  const g=Object.assign({console,Date,Math,JSON,String,Number,Array,Object,Boolean,
    parseFloat,parseInt,isNaN,Promise,setTimeout,clearInterval,setInterval:()=>0},ctx||{});
  g.window=g;
  vm.createContext(g);
  const fim=(exporta&&exporta.length)?('\n;try{Object.assign(window,{'+exporta.join(',')+'})}catch(e){}'):'';
  vm.runInContext(codigo+fim,g);
  return g;
}

/* ---------------- sintaxe do arquivo inteiro ---------------- */
grupo('O arquivo carrega');
{
  const blocos=HTML.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)||[];
  const corpo=HTML.replace(/[\s\S]*?<script(?![^>]*\bsrc=)[^>]*>/,'').replace(/<\/script>[\s\S]*$/,'');
  let erro=null;
  try{ new vm.Script(corpo); }catch(e){ erro=e.message; }
  ok('o JavaScript do index.html é válido', !erro || erro);
  if(erro) console.log('      '+erro);
  ok('tem exatamente um bloco de script', blocos.length===1);
  ok('não sobrou marca de conflito de merge', HTML.indexOf('<<<<<<<')<0);
}

/* ---------------- tempo útil ---------------- */
grupo('Tempo útil (8h–18h, seg a sex)');
{
  const g=rodar(bloco('const HH_DE=8','window.iniConcluir'),null,['minUteis','fmtUteis']);
  const D=s=>new Date(s);
  secao('dentro do expediente');
  ok('9h às 11h de uma quarta = 120min', g.minUteis(D('2026-08-12T09:00'),D('2026-08-12T11:00'))===120);
  ok('8h às 18h = 600min', g.minUteis(D('2026-08-12T08:00'),D('2026-08-12T18:00'))===600);
  secao('fora do expediente não conta');
  ok('19h às 20h = 0', g.minUteis(D('2026-08-12T19:00'),D('2026-08-12T20:00'))===0);
  ok('criada 19h, feita 9h do dia seguinte = 60min', g.minUteis(D('2026-08-12T19:00'),D('2026-08-13T09:00'))===60);
  secao('fim de semana não conta');
  ok('sábado inteiro = 0', g.minUteis(D('2026-08-15T08:00'),D('2026-08-15T18:00'))===0);
  ok('sexta 17h até segunda 9h = 120min', g.minUteis(D('2026-08-14T17:00'),D('2026-08-17T09:00'))===120);
  secao('limites');
  ok('fim antes do início = 0', g.minUteis(D('2026-08-12T11:00'),D('2026-08-12T09:00'))===0);
  ok('intervalo de anos não trava', g.minUteis(D('2020-01-01T09:00'),D('2026-08-12T09:00'))>0);
  ok('mostra 2h', g.fmtUteis(120)==='2h');
  ok('mostra 3h20', g.fmtUteis(200)==='3h20');
}

/* ---------------- calendário ---------------- */
grupo('Calendário próprio');
{
  const g=rodar(bloco('const DT_MES=','let DT={'),{esc:s=>String(s==null?'':s)},
    ['dtISO','dtDe','dtCurto','dtGrade','dtCampo','dtRel']);
  secao('datas');
  ok('ISO', g.dtISO(new Date(2026,7,10))==='2026-08-10');
  ok('dd/mm', g.dtCurto('2026-08-10')==='10/08');
  ok('vazio não vira data', g.dtDe('')===null);
  secao('grade do mês');
  const ag=g.dtGrade(2026,7,'2026-08-10','2026-08-10');
  ok('sempre 6 semanas', ag.length===42);
  ok('agosto tem 31 dias', ag.filter(d=>!d.fora).length===31);
  ok('marca o escolhido', ag.filter(d=>d.sel).length===1);
  ok('fevereiro bissexto tem 29', g.dtGrade(2024,1,'','').filter(d=>!d.fora).length===29);
  ok('dezembro emenda no ano seguinte', g.dtGrade(2026,11,'','')[41].iso.slice(0,4)==='2027');
}

/* ---------------- prazo relativo ---------------- */
grupo('Prazo relativo no cartão');
{
  const g=rodar(bloco('const DT_MES=','let DT={'),{esc:s=>String(s==null?'':s)},['dtDe','dtISO','dtRel']);
  ok('hoje', g.dtRel('2026-08-10','2026-08-10')==='Hoje');
  ok('amanhã', g.dtRel('2026-08-11','2026-08-10')==='Amanhã');
  ok('daqui 45 dias', g.dtRel('2026-09-24','2026-08-10')==='45d');
  ok('vencida há 5 dias', g.dtRel('2026-08-05','2026-08-10')==='5d atrás');
  ok('vira o ano', g.dtRel('2027-01-10','2026-08-10')==='153d');
  ok('vazio não quebra', g.dtRel('','2026-08-10')==='');
}

/* ---------------- ordem alfabética ---------------- */
grupo('Ordem alfabética');
{
  const g=rodar(bloco('const porNome=','const brl ='),null,['porNome','alfab']);
  const n=a=>g.alfab(a).map(x=>x.nome).join(', ');
  ok('acento no lugar certo', n([{nome:'Bruno'},{nome:'Ágata'}])==='Ágata, Bruno');
  ok('João antes de José', n([{nome:'José'},{nome:'João'}])==='João, José');
  ok('maiúscula não pula na frente', n([{nome:'arthur'},{nome:'Bruno'},{nome:'Ana'}])==='Ana, arthur, Bruno');
  ok('nulo não quebra', g.alfab(null).length===0);
  ok('não altera o original', (()=>{const o=[{nome:'B'},{nome:'A'}]; g.alfab(o); return o[0].nome==='B';})());
}

/* ---------------- estimativa em texto ---------------- */
grupo('Leitura de duração escrita à mão');
{
  const g=rodar(bloco('function estMinutos(s){','window.tkAbrir='),null,['estMinutos','estTexto']);
  ok('1h30', g.estMinutos('1h30')===90);
  ok('45min', g.estMinutos('45min')===45);
  ok('só número vira minutos', g.estMinutos('90')===90);
  ok('texto solto é recusado', g.estMinutos('umas horas')===null);
  ok('vazio é vazio', g.estMinutos('')===null);
  ok('ida e volta', g.estTexto(g.estMinutos('1h30'))==='1h30');
}

/* ---------------- visão por lista ---------------- */
grupo('Cada lista lembra da própria visão');
{
  const loja={};
  const g=rodar(bloco("const VIS_KEY=",'window.tkVisao=')+bloco('window.tkVisao=(v)=>{','window.tkEscopo='),{
    localStorage:{getItem:k=>loja[k]||null,setItem:(k,v)=>{loja[k]=v;}},
    LC_ID:'LC', TK:{listaSel:'',visao:'lista',lcVista:''},
    tkStatusDe:id=>({L4:[1,2,3,4]}[id]||[]), $:()=>null, tkDesenhar:()=>{}},['visaoDe','visaoPadrao']);
  ok('lista comum abre em lista', g.visaoDe('L1')==='lista');
  ok('lista com 4+ status abre em board', g.visaoDe('L4')==='board');
  g.TK.listaSel='L1'; g.tkVisao('board');
  ok('L1 guardou board', g.visaoDe('L1')==='board');
  ok('L2 não foi junto', g.visaoDe('L2')==='lista');
  ok('gravou no navegador', /L1/.test(loja['tk_visao_lista']||''));
}

/* ---------------- só minhas ---------------- */
grupo('Só minhas (tarefas individuais)');
{
  const g=rodar(bloco('const meuPessoalWs=','window.pessoalEnter='),{
    currentUser:{id:'u1'},
    TK:{ws:[{id:'W1',tipo:'pessoal',dono:'u1'},{id:'W0',tipo:'empresa',dono:null},
            {id:'W2',tipo:'pessoal',dono:'u2'}],
        espacos:[{id:'E1',workspace_id:'W1'},{id:'E2',workspace_id:'W2'},{id:'E0',workspace_id:'W0'}],
        listas:[{id:'L1',espaco_id:'E1',ordem:1},{id:'L0',espaco_id:'E1',ordem:0},{id:'LX',espaco_id:'E2'}],
        tarefas:[{id:'T1',lista_id:'L0',status:'todo'},{id:'T2',lista_id:'L0',status:'feito'},
                 {id:'T3',lista_id:'E0',status:'todo'},{id:'T4',lista_id:'L0',status:'todo',arquivada_em:'2026-08-01'}]},
    arquivada:t=>!!(t&&t.arquivada_em), esc:s=>String(s==null?'':s), toast:()=>{}},
    ['meuPessoalWs','meuPessoalLista','ehPessoal','minhasPessoais']);
  ok('acha o meu workspace pessoal', (g.meuPessoalWs()||{}).id==='W1');
  ok('ignora o de outra pessoa', (g.meuPessoalWs()||{}).dono==='u1');
  ok('pega a primeira lista pela ordem', (g.meuPessoalLista()||{}).id==='L0');
  ok('reconhece tarefa pessoal', g.ehPessoal({lista_id:'L0'})===true);
  ok('nao confunde com tarefa da empresa', g.ehPessoal({lista_id:'E0'})===false);
  ok('lista as minhas', g.minhasPessoais().map(t=>t.id).join(',')==='T1,T2');
  ok('arquivada fica de fora', g.minhasPessoais().every(t=>t.id!=='T4'));
  g.currentUser={id:'u9'};
  ok('quem nao tem workspace nao ve nada', g.meuPessoalLista()===null && g.minhasPessoais().length===0);
}

/* ---------------- workspaces ---------------- */
grupo('Workspaces (empresa + os seus)');
{
  const loja={};
  const g=rodar(bloco("const WS_NOME='AutoSíntese';",'window.wsTrocar='),{
    localStorage:{getItem:k=>loja[k]||null,setItem:(k,v)=>{loja[k]=v;}},
    document:{documentElement:{setAttribute(){},removeAttribute(){}},querySelector:()=>null},
    currentUser:{id:'u1'},
    TK:{ws:[{id:'W0',nome:'AutoSíntese',tipo:'empresa',dono:null},
            {id:'W1',nome:'Privado',tipo:'pessoal',dono:'u1'},
            {id:'W2',nome:'Do outro',tipo:'pessoal',dono:'u2'}]},
    esc:s=>String(s==null?'':s)},
    ['wsEmpresa','wsMinhas','wsTodas','wsAtual','wsNome','espacoDaAtual','WS_SEL']);
  ok('acha o da empresa', (g.wsEmpresa()||{}).nome==='AutoSíntese');
  ok('lista so os meus pessoais', g.wsMinhas().map(w=>w.nome).join(',')==='Privado');
  ok('nao mostra o pessoal de outro', g.wsTodas().every(w=>w.id!=='W2'));
  ok('empresa vem primeiro', g.wsTodas()[0].tipo==='empresa');
  secao('qual esta ativo');
  ok('sem escolha, cai no da empresa', (g.wsAtual()||{}).id==='W0');
  ok('o nome acompanha', g.wsNome()==='AutoSíntese');
  secao('a arvore filtra por workspace');
  ok('espaco sem workspace conta como da empresa', g.espacoDaAtual({})===true);
  ok('espaco da empresa aparece', g.espacoDaAtual({workspace_id:'W0'})===true);
  ok('espaco do privado nao aparece no da empresa', g.espacoDaAtual({workspace_id:'W1'})===false);
}

/* ---------------- temas ---------------- */
grupo('Temas (escuro, preto, claro, branco)');
{
  const css=HTML.slice(HTML.indexOf('<style>'),HTML.indexOf('</style>'));
  const bloco1=(sel)=>{ const i=css.indexOf(sel); return i<0?null:css.slice(i,css.indexOf('}',i)); };
  const toks=(b)=>(b||'').match(/--[a-z0-9]+(?=\s*:)/g)||[];
  const base=toks(bloco1(':root{'));
  ok('a paleta base define os tokens', base.length>10);
  ['claro','preto','branco'].forEach(nome=>{
    const b=bloco1(':root[data-tema="'+nome+'"]{');
    ok('tema '+nome+' existe', !!b);
    const faltando=base.filter(x=>toks(b).indexOf(x)<0);
    ok('tema '+nome+' cobre todos os tokens', faltando.length===0);
    if(faltando.length) console.log('      sem par: '+faltando.join(', '));
  });
  secao('preto e branco são de verdade');
  ok('preto usa #000000 no fundo', /data-tema="preto"\]\{[^}]*--bg:\s*#000000/.test(css));
  ok('branco usa #ffffff no fundo', /data-tema="branco"\]\{[^}]*--bg:\s*#ffffff/.test(css));
  secao('cada tema avisa o navegador');
  ['claro','branco'].forEach(n=>ok(n+' declara color-scheme light',
    new RegExp('data-tema="'+n+'"\\]\\{[^}]*color-scheme\\s*:\\s*light').test(css)));
  ok('preto declara color-scheme dark', /data-tema="preto"\]\{[^}]*color-scheme\s*:\s*dark/.test(css));
  secao('nenhuma cor de fundo escuro escapou');
  /* Pastel claro como cor de TEXTO só funciona sobre fundo escuro: no tema branco
     ele lava e fica ilegível. Foi o que quebrou o branco na primeira versão. */
  const semPaleta=HTML.replace(/:root(?:\[data-tema="[a-z]+"\])?\{[^}]*\}/g,'');
  const pasteis=['#fbbf24','#f87171','#34d399','#60a5fa','#7db0ff','#2dd4bf'];
  pasteis.forEach(c=>ok('nenhum '+c+' fora da paleta', semPaleta.indexOf(c)<0));
  ok('existe token --info para o azul', /--info\s*:/.test(HTML));
  ['claro','preto','branco'].forEach(n=>ok('tema '+n+' define --info',
    new RegExp('data-tema="'+n+'"\\]\\{[^}]*--info\\s*:').test(HTML)));

  secao('texto recortado em gradiente');
  /* Título da página usa background-clip:text. Com a ponta em #fff fixo, o tema
     branco dava texto branco sobre branco — foi o 'tudo apagado' de 17/08. */
  ok('o gradiente do título usa token', /linear-gradient\(90deg,var\(--tit1\),var\(--tit2\)\)/.test(HTML));
  ok('nenhum #fff fixo em gradiente de texto',
     !/linear-gradient\([^)]*#fff[^)]*\)[^{}]*background-clip:text/.test(HTML));
  ['claro','branco'].forEach(n=>{
    const m=HTML.match(new RegExp('data-tema="'+n+'"\\]\\{[^}]*--tit1:\\s*(#[0-9a-fA-F]{6})'));
    ok('tema '+n+' tem título escuro', !!m && (parseInt(m[1].slice(1,3),16)<0x60));
  });
  ['escuro','preto'].forEach(n=>{
    const bloco = n==='escuro' ? HTML.slice(HTML.indexOf(':root{'),HTML.indexOf('}',HTML.indexOf(':root{')))
                               : (HTML.match(new RegExp('data-tema="'+n+'"\\]\\{[^}]*'))||[''])[0];
    const m=bloco.match(/--tit1:\s*(#[0-9a-fA-F]{6})/);
    ok('tema '+n+' tem título claro', !!m && (parseInt(m[1].slice(1,3),16)>0xc0));
  });

  secao('hover não pode desaparecer no claro');
  ok('hover virou token', css.indexOf('var(--hov1)')>0);
  ['claro','branco'].forEach(n=>ok(n+' escurece no hover em vez de clarear',
    new RegExp('data-tema="'+n+'"\\]\\{[^}]*--hov1:\\s*rgba\\((?!255)').test(css)));
}

/* ---------------- funil de captação ---------------- */
grupo('Funil de captação (métricas puras, sem rede)');
{
  const g=rodar(bloco('const DT_MES=','let DT={')+bloco('const FN_ACT=','async function fnBuscar('),{
    MT_LEADS:['lead','leadgen_grouped','onsite_conversion.lead_grouped','offsite_conversion.fb_pixel_lead','onsite_conversion.messaging_conversation_started_7d'],
    esc:s=>String(s==null?'':s)},
    ['fnMetricas','fnVar','fnSerie','fnJanelaAnterior','fnPresetJanela','fnLeads','FN']);
  const ins={spend:'812.50',impressions:'40000',reach:'25000',clicks:'950',frequency:'1.6',
    actions:[{action_type:'lead',value:'12'},{action_type:'onsite_conversion.messaging_conversation_started_7d',value:'7'},
             {action_type:'link_click',value:'900'}]};
  secao('métricas do período');
  const m=g.fnMetricas(ins);
  ok('leads soma formulário e WhatsApp', m.leads===19);
  ok('só o WhatsApp separado', m.zap===7);
  ok('CPL = gasto ÷ leads', Math.round(m.cpl*100)/100===42.76);
  ok('CTR em %', m.ctr===2.4);
  ok('CPC', Math.round(m.cpc*1000)/1000===0.855);
  ok('CPM por mil', Math.round(m.cpm*100)/100===20.31);
  ok('clique→lead em %', m.txLead===2);
  ok('sem insight devolve null', g.fnMetricas(null)===null);
  ok('sem lead não divide por zero', g.fnMetricas({spend:'10',clicks:'0'}).cpl===0);
  secao('comparação com o período anterior');
  const ant=g.fnMetricas({spend:'700',impressions:'30000',clicks:'800',actions:[{action_type:'lead',value:'20'}]});
  const v=g.fnVar(m,ant);
  ok('gasto subiu ~16%', v.gasto===16.1);
  ok('leads caíram 5%', v.leads===-5);
  ok('CPL subiu (custo pior)', v.cpl>0);
  ok('sem anterior, sem variação', Object.keys(g.fnVar(m,null)).length===0);
  ok('anterior zerado vira 100%', g.fnVar({leads:5},{leads:0}).leads===100);
  secao('janela do período anterior');
  const j=g.fnJanelaAnterior('2026-08-08','2026-08-14');
  ok('7 dias antes de 8–14/08 é 1–7/08', j.de==='2026-08-01'&&j.ate==='2026-08-07');
  const j1=g.fnJanelaAnterior('2026-08-10','2026-08-10');
  ok('um dia só compara com o dia anterior', j1.de==='2026-08-09'&&j1.ate==='2026-08-09');
  ok('vira o mês', g.fnJanelaAnterior('2026-09-01','2026-09-03').de==='2026-08-29');
  ok('data inválida não quebra', g.fnJanelaAnterior('','')===null);
  secao('série diária');
  const s=g.fnSerie([{d:'2026-08-10',s:'100',acts:[{action_type:'lead',value:'3'}]},{d:'2026-08-11',s:'50',acts:[]}]);
  ok('gasto por dia', s[0].gasto===100&&s[1].gasto===50);
  ok('leads por dia', s[0].leads===3&&s[1].leads===0);
  ok('vazio não quebra', g.fnSerie(null).length===0);
  secao('presets');
  ok('hoje é hoje', g.fnPresetJanela('today').de===g.fnPresetJanela('today').ate);
  ok('7 dias termina ontem', g.fnPresetJanela('last_7d').ate<g.fnPresetJanela('today').de);
  ok('este mês começa no dia 1', /-01$/.test(g.fnPresetJanela('this_month').de));
}

/* ---------------- leads do formulário ---------------- */
grupo('Leads do Yay Forms no funil');
{
  const g=rodar(bloco('const fnFormsResumo=','window.fnQualificar='),null,['fnFormsResumo']);
  const r=g.fnFormsResumo([{qualificado:true},{qualificado:true},{qualificado:false},{qualificado:null},{}]);
  ok('conta o total', r.total===5);
  ok('separa qualificados', r.qual===2);
  ok('separa desqualificados', r.desq===1);
  ok('sem avaliação inclui nulo e ausente', r.pend===2);
  ok('lista vazia não quebra', g.fnFormsResumo([]).total===0);
  ok('nulo não quebra', g.fnFormsResumo(null).total===0);
}

/* ---------------- fechamento: squad -> gerente e gestor ---------------- */
grupo('Fechamento: o squad decide gerente e gestor');
{
  const g=rodar(bloco('function fcSquads(){','window.fcSquadMudou='),{
    TK:{equipe:[
      {id:'a',nome:'Luiz',cargo:'gerente',squads:['01']},
      {id:'b',nome:'Luan Santiago',cargo:'gestor de trafego',squads:['01']},
      {id:'c',nome:'João',cargo:'gerente',squads:['02']},
      {id:'d',nome:'Yghor',cargo:'gestor de trafego',squads:['02']},
      {id:'e',nome:'Maria',cargo:'editora de video',squads:[]},
      {id:'f',nome:'Bernardo',cargo:'gerente de projetos',squads:[]}]},
    SQUADS:()=>['01','02','03']},['fcSquads']);
  const s=g.fcSquads();
  ok('lista os squads em ordem', s.map(x=>x.squad).join(',')==='01,02,03');
  ok('squad 01: gerente Luiz', s[0].gerente==='Luiz');
  ok('squad 01: gestor Luan', s[0].gestor==='Luan Santiago');
  ok('squad 02: gerente João', s[1].gerente==='João');
  ok('squad 02: gestor Yghor', s[1].gestor==='Yghor');
  ok('squad sem gente vem vazio, não quebra', s[2].gerente===''&&s[2].gestor==='');
  ok('gerente de projetos não é confundido com gerente', !s.some(x=>x.gerente==='Bernardo'));
  ok('editora não entra', !s.some(x=>x.gestor==='Maria'));
}

/* ---------------- funil de WhatsApp ---------------- */
grupo('Funil de WhatsApp (o telefone é a chave)');
{
  const g=rodar(bloco('let WA={','async function waCarregar('),{Date},['waFone','waFoneBonito','waResumo','waEst','waAbertos','WA']);
  secao('telefone vira chave');
  ok('com máscara', g.waFone('(17) 99999-0000')==='5517999990000');
  ok('sem DDI ganha 55', g.waFone('17999990000')==='5517999990000');
  ok('fixo com 10 dígitos', g.waFone('1733334444')==='551733334444');
  ok('já com 55 não duplica', g.waFone('5517999990000')==='5517999990000');
  ok('zero na frente sai', g.waFone('017999990000')==='5517999990000');
  ok('bonito de volta', g.waFoneBonito('5517999990000')==='(17) 99999-0000');
  ok('vazio não quebra', g.waFone('')==='');
  secao('resumo do funil');
  g.WA.estagios=[{chave:'novo',fim:null},{chave:'reuniao',fim:null},{chave:'ganho',fim:'ganho'},{chave:'perdido',fim:'perdido'}];
  const L=[{estagio:'novo',criado_em:'2026-08-10',utm_campaign:'Camp A'},
           {estagio:'ganho',criado_em:'2026-08-11',valor:1500,campanha:'Camp A'},
           {estagio:'ganho',criado_em:'2026-08-12',valor:2500,origem:'indicacao'},
           {estagio:'perdido',criado_em:'2026-08-12'},
           {estagio:'reuniao',criado_em:'2026-07-01'}];
  const r=g.waResumo(L,'2026-08-10','2026-08-31');
  ok('conta só quem entrou no período', r.entraram===4);
  ok('ganhos', r.ganhos===2);
  ok('perdidos', r.perdidos===1);
  ok('em aberto = entraram − ganhos − perdidos', r.emAberto===1);
  ok('taxa de fechamento', r.txGanho===50);
  ok('receita soma os fechados', r.valor===4000);
  ok('ticket médio', r.ticket===2000);
  ok('origem agrupa campanha e utm', r.origem['Camp A']===2);
  ok('sem origem cai em indicação/organico', r.origem['indicacao']===1);
  ok('em aberto (geral) ignora ganho e perdido', g.waAbertos(L).length===2);
  ok('sem período conta tudo', g.waResumo(L,'','').entraram===5);
}

/* ---------------- autosave da tarefa ---------------- */
grupo('Autosave da tarefa (sem botão Salvar)');
{
  /* O que dá pra testar sem DOM real: a regra de que obrigatório AVISA no silencioso
     e BLOQUEIA no explícito, e que a validação de título vem antes de qualquer gravação. */
  const src=bloco('async function tkmSalvar(t,lid,cps,silencioso){','/* ---------- PAINEL DA TAREFA');
  ok('existe', src.length>500);
  ok('no silencioso, obrigatório não trava', /aviso\('Falta o cliente'\); if\(!silencioso\)/.test(src));
  ok('no silencioso, squad não trava', /aviso\('Falta o squad'\); if\(!silencioso\)/.test(src));
  ok('mas título vazio nunca grava', /if\(!v\.titulo\)\{ aviso\([^)]*\); return false; \}/.test(src));
  ok('tarefa nova usa insert com retorno', /\.insert\(Object\.assign\([\s\S]*?\)\)\.select\(\)\.single\(\)/.test(src));
  ok('e daí em diante vira update', /window\.__tkmT=criada/.test(src));
  ok('painel fechado não tenta salvar', /if\(!\$\('#tk_tit'\)\) return false/.test(src));
  ok('silencioso não reabre a lista inteira', /if\(!silencioso\)\{ render\('tarefas'\)/.test(src));
  const abrir=bloco('window.tkAbrir=(id,prazoPre,grupoPre)=>{','async function tkmSalvar(');
  ok('rodapé sem botão Salvar', abrir.indexOf('tkmAuto')>0 && abrir.indexOf("class=\"btn small msave\"")<0);
  ok('texto salva com debounce, select na hora', /rapido\?80:600/.test(abrir));
  ok('fechar o painel grava o que ficou pendente', /const fechar=\(\)=>\{ if\(window\.__tkmTimer\)/.test(abrir));
}

console.log('\n'+(falhas
  ? '\x1b[31m>>> '+falhas+' de '+total+' FALHARAM\x1b[0m\n'
  : '\x1b[32m>>> '+total+' verificações, todas passaram\x1b[0m\n'));
process.exit(falhas?1:0);
