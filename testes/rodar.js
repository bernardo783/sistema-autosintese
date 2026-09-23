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
  /* OPC_PAL e a paleta de cores que o usuario escolhe para opcoes de campo (vira fundo
     de chip, nao texto) — fica fora da checagem de proposito. */
  const semPaleta=HTML.replace(/:root(?:\[data-tema="[a-z]+"\])?\{[^}]*\}/g,'').replace(/const OPC_PAL=\[[^\]]*\];/,'');
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
  /* Gabriel 23/09: nada trava. Faltou cliente/data/responsável, a tarefa nasce em rascunho. */
  ok('cliente/data/responsável faltando vira rascunho, não trava', /v\.rascunho=falta\.length>0/.test(src)&&!/aviso\('Falta o cliente'\)/.test(src));
  ok('squad não trava: sai do cliente ou do seu squad', /v\.squad=meusSquads\(\)\[0\]/.test(src)&&!/aviso\('Falta o squad'\)/.test(src));
  ok('definitiva não volta a ser rascunho', /v\.rascunho=falta\.length>0&&\(!t\|\|_eraRasc\)/.test(src));
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

/* ---------------- botão do topo por aba ---------------- */
grupo('Modo Pessoal: o botão do topo acompanha a aba');
{
  const g=rodar(bloco('const MP_ACAO={','function mpPintar()'),
    {tkHoje:()=>'2026-08-23',MP:{dia:'2026-09-01'}},['MP_ACAO']);   /* dia aberto ≠ hoje */
  ok('em Tarefas o botão cria TAREFA', g.MP_ACAO.tarefas[0]==='+ Nova tarefa'&&/mpIrTarNova/.test(g.MP_ACAO.tarefas[1]));
  ok('em Agenda o botão cria EVENTO', g.MP_ACAO.agenda[0]==='+ Novo evento'&&/mpEvtSlot/.test(g.MP_ACAO.agenda[1]));
  ok('nas abas de hábito segue criando hábito',
     ['inicio','habitos','progresso'].every(k=>g.MP_ACAO[k][0]==='+ Novo hábito'&&/mpHabitoModal/.test(g.MP_ACAO[k][1])));
  ok('o botão lê a tabela, não é mais fixo',
     HTML.indexOf("'<div class=\"toolbar\"><button class=\"btn small\" onclick=\"'+ac[1]+'\">'+ac[0]+'</button></div></div>'")>0
     && HTML.indexOf('onclick="mpHabitoModal()">+ Novo hábito</button></div></div>')<0);
  secao('nenhuma aba fica sem ação própria');
  const lista=(HTML.match(/const abas=\[[\s\S]*?\];/)||[''])[0];
  const chaves=(lista.match(/\['([a-z]+)',/g)||[]).map(s=>s.slice(2,-2));
  ok('achou as abas no código', chaves.length>=4);   /* Progresso saiu das abas em ago/2026 */
  chaves.forEach(k=>ok('aba "'+k+'" tem ação própria', !!g.MP_ACAO[k]));
  secao('hora que já vem preenchida no evento');
  ok('vendo outro dia, sugere 9h', g.mpEvtHoraSug()===9);
  const gh=rodar(bloco('const MP_ACAO={','function mpPintar()'),
    {tkHoje:()=>'2026-08-23',MP:{dia:'2026-08-23'}},['MP_ACAO']);   /* dia aberto = hoje */
  ok('vendo hoje, sugere a próxima hora cheia', gh.mpEvtHoraSug()===Math.min(23,new Date().getHours()+1));
  ok('nunca passa das 23h', gh.mpEvtHoraSug()<=23&&gh.mpEvtHoraSug()>=1);
}

/* ---------------- hábito: data de início ---------------- */
grupo('Hábito: a partir de quando começa');
{
  /* 2026-08-23 é um DOMINGO — o cenário do Gabriel: monta no domingo, começa segunda. */
  const TK="const tkISO=(d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');\n"
    +"function tkDiaMais(base,n){ const d=new Date(base+'T12:00:00'); d.setDate(d.getDate()+n); return tkISO(d); }\n"
    +"const tkHoje=()=>'2026-08-23';\nlet MP={habitos:[],checks:[]};\n";
  const g=rodar(TK
    +bloco('const mpDe=(iso)=>','async function mpCarregar')
    +bloco('const mpCk=(hid,iso)=>','function mpWsAtivo')
    +bloco('function mpMetaProg(h){','\n/* ---------- tela ---------- */')
    +bloco('function mpHIniOps(){','window.mpHIniSet'),
    null,['mpIni','mpProg','mpComeca','mpSegDa','MP']);

  secao('a semana vai de segunda a domingo');
  ok('domingo 23/08 pertence à semana que abriu 17/08', g.mpSegDa('2026-08-23')==='2026-08-17');
  ok('segunda 24/08 abre a semana seguinte', g.mpSegDa('2026-08-24')==='2026-08-24');
  ok('essa semana fecha no domingo 30/08', tkDiaMaisT(g.mpSegDa('2026-08-24'),6)==='2026-08-30');

  secao('antes do início o hábito não é previsto');
  const academia={dias:[1,2,3,4,5],inicio:'2026-08-24'};      // seg a sex, começando segunda
  ok('sexta passada (21/08) não conta', g.mpProg(academia,'2026-08-21')===false);
  ok('segunda 24/08 conta', g.mpProg(academia,'2026-08-24')===true);
  ok('sexta 28/08 conta', g.mpProg(academia,'2026-08-28')===true);
  const leitura={dias:[0,1,2,3,4,5,6],inicio:'2026-08-24'};   // todo dia, começando segunda
  ok('o domingo de hoje NÃO conta (é o pedido dele)', g.mpProg(leitura,'2026-08-23')===false);
  ok('mas o domingo 30/08, dentro da 1ª semana, conta', g.mpProg(leitura,'2026-08-30')===true);

  secao('o dia da semana continua mandando');
  const sabadao={dias:[6],inicio:'2026-08-24'};
  ok('só sábado: segunda não conta', g.mpProg(sabadao,'2026-08-24')===false);
  ok('só sábado: sábado 29/08 conta', g.mpProg(sabadao,'2026-08-29')===true);

  secao('hábito antigo sem data cai no dia da criação');
  ok('usa criado_em quando inicio é nulo', g.mpIni({criado_em:'2026-08-10T15:00:00-03:00'}).slice(0,4)==='2026');
  ok('inicio explícito ganha do criado_em', g.mpIni({inicio:'2026-08-24',criado_em:'2026-08-01T12:00:00Z'})==='2026-08-24');

  secao('o que a tela mostra enquanto não começou');
  ok('amanhã vira "começa amanhã"', g.mpComeca('2026-08-24')==='começa amanhã');
  ok('depois vira "começa terça, 25/08"', g.mpComeca('2026-08-25')==='começa terça, 25/08');
  ok('meta avisa que ainda não começou', g.mpMetaProg({id:'x',meta_tipo:'sem',meta_qtd:5,inicio:'2026-08-24'}).futuro===true);
  ok('hábito já valendo não fica marcado como futuro', g.mpMetaProg({id:'x',meta_tipo:'sem',meta_qtd:5,inicio:'2026-08-01'}).futuro===false);

  secao('atalhos do modal, montando num domingo');
  const ops=Object.fromEntries(g.mpHIniOps());
  ok('Hoje = domingo 23/08', ops['Hoje']==='2026-08-23');
  ok('Amanhã = segunda 24/08', ops['Amanhã']==='2026-08-24');
  ok('Próxima segunda = 24/08 (mesmo dia, de propósito)', ops['Próxima segunda']==='2026-08-24');

  secao('o campo existe no modal e vai pro banco');
  ok('campo "Começa em" no formulário', HTML.indexOf('<label>Começa em</label>')>0);
  ok('grava a coluna inicio', HTML.indexOf('inicio:st.ini||tkHoje()')>0);
  ok('modal abre com o início do hábito ao editar', HTML.indexOf('ini:h?mpIni(h):tkHoje()')>0);
}
function tkDiaMaisT(base,n){ const d=new Date(base+'T12:00:00'); d.setDate(d.getDate()+n);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

/* ---------------- gerador de contrato liga no formulário ---------------- */
grupo('Contratos: formulário novo alimenta o gerador de .docx');
{
  ok('a aba Respostas foi consolidada (não existe mais)', HTML.indexOf('data-view="respostas"')<0 && HTML.indexOf('renderRespostas')<0);
  ok('o gerador lê contratos_form (não a tabela antiga)', HTML.indexOf("sb.from('contratos_form').select('*').not('enviado_em'")>0 && HTML.indexOf('contrato_leads')<0);
  ok('mapeia para o formato do .docx', HTML.indexOf('contratante_razao:r.razao_social')>0 && HTML.indexOf('rep_nascimento:r.nascimento')>0);
  ok('o link do formulário aponta pra página nova', HTML.indexOf("const CT_LINK='https://autosintese.app.br/contrato'")>0);
  ok('Contratos liberado para master + comercial', /function podeContratos\(\)\{ return !!currentUser && \(currentUser\.role==='master' \|\| \/comerc\/i\.test/.test(HTML));
  ok('atalho Contratos no rail, revelado por papel', HTML.indexOf('id="navContratos"')>0 && HTML.indexOf("if(podeContratos()){ show($('#navContratos'))")>0);
}

/* ---------------- camada mobile ---------------- */
grupo('Camada mobile (720px)');
{
  const css=HTML.slice(HTML.indexOf('<style>'),HTML.indexOf('</style>'));
  const i=css.indexOf('@media(max-width:720px');
  let depth=0, j=css.indexOf('{',i), k=j;
  for(k=j;k<css.length;k++){ if(css[k]==='{')depth++; else if(css[k]==='}'){depth--; if(!depth)break; } }
  const bloco720=css.slice(i,k+1);
  ok('o breakpoint de celular existe', i>0);
  ok('viewport meta presente', HTML.indexOf('width=device-width')>0);
  secao('o que quebrava no celular');
  ok('tabela rola de lado em vez de esmagar', /\.tablewrap\{[^}]*overflow-x:auto/.test(css));
  ok('formulário de duas colunas vira uma', bloco720.indexOf('.row2{grid-template-columns:1fr}')>0);
  ok('painel da tarefa em tela cheia', bloco720.indexOf('.overlay.folha .modal{width:100vw')>0);
  ok('coluna do board cabe no dedo', /\.tk-col\{flex:0 0 84vw/.test(bloco720));
  ok('iOS não dá zoom no campo focado', /input,select,textarea\{font-size:16px/.test(bloco720));
  ok('calendário não vaza da tela', /\.dtpop\{width:min\(246px/.test(bloco720));
  ok('pílulas de período rolam', /\.fin-tabs\{flex-wrap:nowrap;overflow-x:auto/.test(bloco720));
  secao('nada disso vaza pro desktop');
  const antes=css.slice(0,i);
  ok('fora do breakpoint, tk-col segue 282px', /\.tk-col\{flex:0 0 282px/.test(antes));
  ok('fora do breakpoint, row2 segue 2 colunas', /\.row2\{display:grid;grid-template-columns:1fr 1fr/.test(antes));
}

/* ---------------- logos do cliente ---------------- */
grupo('Logos do cliente: guardadas na ficha, baixadas na Linha Editorial');
{
  const cod=bloco('const LG_PREF=',"window.tkmAtvCarregar=");
  const ED='23b91ffd-0afa-4db1-8239-444bce201aad';
  const g=rodar('const LISTA_EDICAO="'+ED+'";'+cod,{
    uid:()=>'abc12',
    TK:{listas:[{id:ED,pasta_id:'p-edit'},{id:'l-roteiro',pasta_id:'p-edit'},{id:'l-traf',pasta_id:'p-traf'},{id:'l-solta'}]}
  },['lgChave','ehEditorial','LG_PREF']);
  secao('quais listas mostram a aba Logo');
  ok('Edição de Vídeo', g.ehEditorial(ED));
  ok('outra lista da mesma pasta (Linha Editorial)', g.ehEditorial('l-roteiro'));
  ok('lista do Tráfego Pago não', !g.ehEditorial('l-traf'));
  ok('lista sem pasta não', !g.ehEditorial('l-solta'));
  ok('sem lista não', !g.ehEditorial(''));
  secao('nome do arquivo no armazenamento');
  const k=g.lgChave('T1','Logo 710 Veículos (final).png');
  ok('fica na pasta do card do cliente, marcado como logo', k.indexOf('t/T1/'+g.LG_PREF)===0);
  ok('tira espaço e acento do nome', k==='t/T1/logo-abc12_Logo_710_Ve_culos_final_.png');
  ok('a busca da aba casa com o prefixo', cod.indexOf(".like('caminho','t/'+tid+'/'+LG_PREF+'%')")>0);
  secao('ligações na tela');
  ok('ficha tem a aba Logos', HTML.indexOf(`onclick="cliIrPara('\${it.id}','logos')">\${PCX_I.foto}Logos</button>`)>0);
  ok('painel da tarefa troca para a aba Logo', HTML.indexOf("['Det','Atv','Rel','Logo'].forEach")>0);
  ok('aba Logo acompanha a troca de cliente', HTML.indexOf("sel.addEventListener('change',lgTk)")>0);
}

/* ---------------- cofre de senhas por pessoa ---------------- */
grupo('Senhas: master e quem tem ve_senhas (João, 23/09)');
{
  const cod=bloco('const podeSenhas=','const acessoVisivel=');
  const pode=(u)=>rodar('var currentUser='+JSON.stringify(u)+';'+cod,{},['podeSenhas']).podeSenhas();
  ok('master vê', pode({role:'master'}));
  ok('membro com ve_senhas vê', pode({role:'membro',ve_senhas:true}));
  ok('membro sem o campo não vê', !pode({role:'membro'}));
  ok('sem login não vê', !pode(null));
  ok('saveDB só grava o cofre de quem pode', HTML.indexOf(".concat(podeSenhas()?['senhas']:[])")>0);
  ok('aba Senhas segue a mesma regra', HTML.indexOf('const mst=podeSenhas();')>0);
  const sql=fs.readFileSync(path.join(__dirname,'..','migracao-ve-senhas.sql'),'utf8');
  ok('banco: leitura e escrita do cofre por pode_senhas()', (sql.match(/modulo = 'senhas' and pode_senhas\(\)/g)||[]).length===3);
}

/* ---------------- Acessos para todos ---------------- */
grupo('Acessos: ninguém perde a tela (Gabriel 23/09)');
{
  const cod=bloco('const TL_FIXAS=','/* esconde os atalhos');
  const bloq=(off,v)=>rodar('var currentUser={telas_off:'+JSON.stringify(off)+'};'
    +cod.replace(/const tlLista=[\s\S]*?\n(?=const tlOff)/,''),{},['tlBloqueada']).tlBloqueada(v);
  ok('Acessos marcado como desligado continua aberto', !bloq(['acessos'],'acessos'));
  ok('Suporte segue aberto', !bloq(['reembolsos'],'reembolsos'));
  ok('outra tela desligada continua bloqueada', bloq(['processos'],'processos'));
  ok('Acessos saiu da lista de telas que se desligam', /TL_FIXAS\.indexOf\(b\.dataset\.view\)<0/.test(cod));
  const sql=fs.readFileSync(path.join(__dirname,'..','migracao-acessos-todos.sql'),'utf8');
  ok('banco: convite só "ver", só nos nós fechados', sql.indexOf("p_uid, 'ver'")>0 && sql.indexOf('where n.privado')>0);
  ok('banco: quem for aprovado depois ganha sozinho', sql.indexOf('after insert or update of aprovado on public.perfis')>0);
}


/* ---------------- tarefas recorrentes ---------------- */
grupo('Tarefas recorrentes (Gabriel 23/09)');
{
  const cod=bloco('const DT_MES=','/* 6 semanas fixas')+bloco('const TK_G2ST=','\n')+'\n'+bloco('const TK_ST=','\n')+'\n'
    +bloco('/* ======================= TAREFAS RECORRENTES','/* ---------- editor da repetição');
  /* banco falso: update/insert com os filtros que a trava usa */
  const BANCO=[];
  const tab=()=>{ const st={f:[]}; const api={
    update(p){st.op='u';st.p=p;return api;}, insert(r){st.op='i';st.r=r;return api;},
    eq(k,v){st.f.push(r=>r[k]===v);return api;},
    is(k){ if(k==='recorrencia->>gerou') st.f.push(r=>!(r.recorrencia&&r.recorrencia.gerou)); return api; },
    select(){return api;}, single(){return api;},
    then(res){ if(st.op==='u'){ const rs=BANCO.filter(r=>st.f.every(f=>f(r))); rs.forEach(r=>Object.assign(r,JSON.parse(JSON.stringify(st.p)))); res({data:rs.map(r=>({id:r.id})),error:null}); }
      else { const r=JSON.parse(JSON.stringify(st.r)); BANCO.push(r); res({data:r,error:null}); } } }; return api; };
  let avisos=[];
  const g=rodar(cod,{sb:{from:tab},TK:{tarefas:[]},currentUser:{id:'eu'},currentView:'x',crypto:{randomUUID:()=>'n'+(BANCO.length+1)},
    toast:m=>avisos.push(m),tkStatusDe:()=>[{id:'s1',grupo:'nao_iniciado'},{id:'s9',grupo:'feito'}],
    respDe:t=>t.responsaveis||[t.responsavel_id],arquivada:t=>!!t.arquivada_em,primeiroNome:x=>String(x).split(' ')[0],
    tkNomeUser:id=>({ls:'Luan',yg:'Yghor',jo:'João'}[id]||id),esc:x=>x,spDesenhar(){},tkDesenhar(){},renderInicio(){},$:()=>null,clearTimeout},
    ['recProxima','recPresets','recRotulo','recVerificar','dtISO','recPrimeira']);
  const Q='2026-09-23';                                     /* uma quarta */
  const P=(k)=>g.recPresets(Q).find(x=>x.k===k).r;
  const seq=(rec,de,n)=>{ const o=[]; let r=Object.assign({},rec,{base:de,n:1}), t={prazo:de};
    for(let i=0;i<n;i++){ const x=g.recProxima(r,t); if(!x) break; o.push(x.prazo.slice(8)+'/'+x.prazo.slice(5,7)); r=Object.assign({},r,{base:x.nom,n:r.n+1}); t={prazo:x.prazo}; }
    return o.join(' '); };
  secao('datas');
  ok('semanal na quarta', seq({r:P('sem'),anc:Q,fds:true},Q,3)==='30/09 07/10 14/10');
  ok('a cada 2 semanas', seq({r:P('quinz'),anc:Q,fds:true},Q,3)==='07/10 21/10 04/11');
  ok('todo dia útil pula sábado e domingo', seq({r:P('util'),anc:Q,fds:true},'2026-09-25',2)==='28/09 29/09');
  ok('mensal no dia 23, sábado empurra pra segunda', seq({r:P('mes'),anc:Q,fds:true},Q,4)==='23/10 23/11 23/12 25/01');
  ok('dia 31 não escorrega depois de fevereiro', seq({r:{u:'m',cada:1,mes:'dia'},anc:'2026-01-31',fds:false},'2026-01-31',3)==='28/02 31/03 30/04');
  ok('1º dia útil do mês', seq({r:P('mesu1'),anc:Q,fds:true},Q,3)==='01/10 02/11 01/12');
  ok('segunda e quinta', seq({r:{u:'s',cada:1,dias:[1,4]},anc:Q,fds:true},Q,4)==='24/09 28/09 01/10 05/10');
  ok('para na data de término', seq({r:P('sem'),anc:Q,fds:true,fim:{t:'data',d:'2026-10-10'}},Q,5)==='30/09 07/10');
  ok('3 vezes ao todo = a atual + 2', seq({r:P('sem'),anc:Q,fds:true,fim:{t:'vezes',n:3}},Q,5)==='30/09 07/10');
  ok('rótulo no jeito do ClickUp', g.recRotulo({p:'sem',anc:Q})==='Semanalmente na quarta'&&g.recRotulo({p:'sem',anc:'2026-09-26'})==='Semanalmente no sábado');
  secao('sem prazo: começa de hoje');
  const pri=(rec,h)=>g.recPrimeira(Object.assign({anc:h,fds:true},rec),h).prazo;
  ok('toda segunda, hoje quarta 23/09 → seg 28/09', pri({r:{u:'s',cada:1,dias:[1]}},Q)==='2026-09-28');
  ok('semanal no dia de hoje → hoje', pri({r:P('sem')},Q)===Q);
  ok('1º dia útil: o de setembro já passou → 01/10', pri({r:P('mesu1')},Q)==='2026-10-01');
  ok('último dia útil: o de setembro ainda vem → 30/09', pri({r:P('mesuu')},Q)==='2026-09-30');
  ok('todo dia útil num sábado → segunda', pri({r:P('util')},'2026-09-26')==='2026-09-28');
  secao('criar a próxima');
  (async()=>{
    const t={id:'t1',lista_id:'L',titulo:'Saldo Meta',status:'feito',prazo:'2026-09-24',iniciada_em:'2026-09-22',responsaveis:['ls'],checklist:[{t:'a',ok:true}],
      recorrencia:{p:'custom',r:{u:'s',cada:1,dias:[1,4]},anc:'2026-09-24',base:'2026-09-24',quem:{ids:['ls','yg','jo'],rev:true,i:1},gat:'concluir',nova:true,fds:true,fim:{t:'nunca'},n:1}};
    BANCO.push(JSON.parse(JSON.stringify(t))); g.TK.tarefas=[t];
    await g.recVerificar(); const n=g.TK.tarefas[1];
    ok('concluiu: nasce a próxima na seg 28/09, início anda junto', n&&n.prazo==='2026-09-28'&&n.iniciada_em==='2026-09-26');
    ok('revezando: a próxima é do Yghor', n&&n.responsavel_id==='yg');
    ok('nasce no 1º status, checklist desmarcado', n&&n.status_id==='s1'&&n.checklist[0].ok===false);
    await g.recVerificar(); ok('checar de novo não duplica', BANCO.length===2);
    const velha=JSON.parse(JSON.stringify(t)); velha.recorrencia.gerou=null; g.TK.tarefas=[velha];
    await g.recVerificar(); ok('outro navegador desatualizado não cria outra (trava no banco)', BANCO.length===2);
    BANCO.length=0;
    const f={id:'f1',lista_id:'L',titulo:'Fim',status:'feito',prazo:'2026-12-30',responsaveis:['x'],
      recorrencia:{p:'sem',r:{u:'s',cada:1,dias:[3]},anc:'2026-12-30',base:'2026-12-30',quem:{ids:[]},gat:'concluir',nova:true,fds:true,fim:{t:'data',d:'2026-12-31'},n:4}};
    BANCO.push(JSON.parse(JSON.stringify(f))); g.TK.tarefas=[f];
    await g.recVerificar(); ok('passou da data de término: não nasce outra', g.TK.tarefas.length===1&&f.recorrencia.gerou==='fim');
    BANCO.length=0;
    const b={id:'b1',lista_id:'L',titulo:'Relatório',status:'feito',prazo:'2026-10-01',responsaveis:['ba'],checklist:[],
      recorrencia:{p:'mesu1',r:{u:'m',cada:1,mes:'util1'},anc:'2026-10-01',base:'2026-10-01',quem:{ids:[]},gat:'concluir',nova:false,fds:true,fim:{t:'nunca'},n:1}};
    BANCO.push(JSON.parse(JSON.stringify(b))); g.TK.tarefas=[b];
    await g.recVerificar(); ok('modo reabrir: a mesma tarefa volta com prazo 02/11', g.TK.tarefas.length===1&&b.status==='todo'&&b.prazo==='2026-11-02');
    BANCO.length=0;
    g.TK.listas=[{id:'L'},{id:'K'}];
    g.tkStatusDe=(lid)=>lid==='K'?[{id:'k1',nome:'Briefing',grupo:'nao_iniciado'},{id:'k2',nome:'Produção',grupo:'ativo'},{id:'k9',nome:'Feito',grupo:'feito'}]:[];
    const d={id:'d1',lista_id:'L',titulo:'Vídeo semanal',status:'feito',prazo:'2026-09-23',responsaveis:['me'],valores:{c1:5},checklist:[],
      recorrencia:{p:'sem',r:{u:'s',cada:1,dias:[3]},anc:'2026-09-23',base:'2026-09-23',quem:{ids:[]},gat:'concluir',nova:true,fds:true,fim:{t:'nunca'},n:1,dest:{lista_id:'K',status:'k2'}}};
    BANCO.push(JSON.parse(JSON.stringify(d))); g.TK.tarefas=[d];
    await g.recVerificar(); const dn=g.TK.tarefas[1];
    ok('nasce na lista escolhida, na coluna escolhida do Kanban', dn&&dn.lista_id==='K'&&dn.status_id==='k2'&&dn.status==='fazendo');
    ok('trocou de lista: campos da lista antiga não vão junto', dn&&Object.keys(dn.valores).length===0);
    d.recorrencia.dest={lista_id:'sumiu',status:'x'}; d.recorrencia.gerou=null; BANCO.length=0; BANCO.push(JSON.parse(JSON.stringify(d))); g.TK.tarefas=[d];
    await g.recVerificar(); const dx=g.TK.tarefas[1];
    ok('lista apagada: volta pra lista da própria tarefa', dx&&dx.lista_id==='L'&&dx.status==='todo');
    ok('banco: migração cria a coluna recorrencia', /add column if not exists recorrencia jsonb/.test(fs.readFileSync(path.join(__dirname,'..','migracao-recorrencia.sql'),'utf8')));
    fimDosTestes();
  })();
}
/* ---------------- cliente só de Agent IA: nada de tráfego na ficha ---------------- */
grupo('Agent IA: ficha sem gestor, conta, verba, gasto, saldo, contas e logos (Gabriel 23/09)');
{
  const g=rodar(bloco('const soAgentIA=',"/* A foto sai do perfil"),{},['soAgentIA']);
  ok('categoria ia é Agent IA', g.soAgentIA({categoria:'ia'})===true);
  ok('Tráfego + Agent IA não é', g.soAgentIA({categoria:'full'})===false);
  ok('sem tipo não é (palpite não conta)', g.soAgentIA({})===false);
  const props=bloco('function pcProps(it){','function pcFaixa(it){');
  ok('painel: gestor de tráfego some', /\$\{ia\?'':row\('pessoa'/.test(props));
  ok('painel: conta, verba, gasto e saldo somem', /\$\{ia\?'':`\$\{row\('conta'/.test(props) && props.indexOf("row('saldo'")>0);
  ok('abas Contas e Logos e barra de contas somem', HTML.indexOf("${soAgentIA(it)?'':pcGrupoBarra(it)}")>0 && (HTML.match(/\$\{soAgentIA\(it\)\?'':`<button class="ftab/g)||[]).length===2);
  ok('virar Agent IA tira o gestor', HTML.indexOf("if(k==='ia') it.responsavel='';")>0);
}

/* ---------------- notificar responsável ---------------- */
grupo('Notificar responsável (Gabriel 23/09)');
{
  ok('botão só aparece pra gerente/master, em tarefa aberta (não concluída, não arquivada) de lista com grupo', HTML.indexOf("${(t&&souGerente()&&!arquivada(t)&&t.status!=='feito'&&lbTemGrupo(t))?`<button class=\"btn ghost small\" type=\"button\" onclick=\"tkLembrar(event,")>0);
  ok('o app manda só o id da tarefa (mensagem montada no servidor)', /lbApi\('enviar',\{tarefa_id:id\}\)/.test(HTML));
  const fn=fs.readFileSync(path.join(__dirname,'..','funcoes','lembrete-tarefa','index.ts'),'utf8');
  ok('servidor barra quem não é gerente nem master (menos o aviso de conclusão)', /const chefe = user\.role === 'master' \|\| !!user\.gerente/.test(fn) && /if \(acao !== 'concluida' && !chefe\) return J\(\{ ok: false, erro: 'Só gerente ou master pode notificar o responsável\.' \}, 403\)/.test(fn));
  ['tarefa:','responsaveis:','prazo:','data_prazo:','horario_prazo:','link:','flag:'].forEach(k=>ok('payload tem '+k.replace(':',''), fn.indexOf('    '+k)>0));
  ok('trava de 10 minutos por tarefa', /ESPERA_MIN = 10/.test(fn));
  ok('grupo automático: Luan → SQUAD1, Yghor → SQUAD 2, Gabriel/Arthur → Automação, Madu → SÍNTESE - EDITORIAL (5.0)',
    /grupo: 'SQUAD1'/.test(fn)&&/grupo: 'SQUAD 2 - COMUNICAÇÃO'/.test(fn)&&/grupo: 'Automação - Síntese'/.test(fn)&&/grupo: 'SÍNTESE - EDITORIAL \(5\.0\)'/.test(fn));
  ok('servidor recusa lembrar tarefa concluída', /t\.status === 'feito'\) return J/.test(fn));
  {
    const g=rodar(bloco('const tkColunaDe=','window.tkConcluir='),{tkStatusDe:()=>[{id:'p',grupo:'nao_iniciado'},{id:'e',grupo:'ativo'},{id:'c',grupo:'feito'}]},['tkColunaDe']);
    ok('checkbox concluído leva o cartão pra coluna Concluído', g.tkColunaDe('L',true)==='c');
    ok('checkbox desmarcado volta pra Pendente', g.tkColunaDe('L',false)==='p');
    const s=rodar(bloco('const tkColunaDe=','window.tkConcluir='),{tkStatusDe:()=>[]},['tkColunaDe']);
    ok('lista sem colunas próprias não mexe em coluna', s.tkColunaDe('L',true)===null);
  }
  ok('Linha Editorial cobra também os gestores de tráfego (Luan → SQUAD1, Yghor → SQUAD 2)',
    /pasta: PASTA_EDITORIAL, pessoas: \[P\.luan\], grupo: 'SQUAD1'/.test(fn)&&/pasta: PASTA_EDITORIAL, pessoas: \[P\.yghor\], grupo: 'SQUAD 2 - COMUNICAÇÃO'/.test(fn));
  ok('Madu na Editorial: conclusão não avisa o SÍNTESE - EDITORIAL (aviso é na revisão interna)',
    /pessoas: \[P\.madu\], grupo: 'SÍNTESE - EDITORIAL \(5\.0\)', semConclusao: true/.test(fn) && /ROTAS\.filter\(\(r\) => !r\.semConclusao &&/.test(fn));
  ok('não existe escolher grupo no app', HTML.indexOf('lbEscolherGrupo')<0 && fn.indexOf('definir_grupo')<0);
}

/* ---------------- fee do mês no Controle de Clientes ---------------- */
grupo('Controle de Clientes mostra o fee de Recebimentos (Gabriel 23/09)');
{
  const cod=bloco('function lcMensVigente(','let LC_SYNC=');
  const g=rodar('var DB={recebimentos:[{comp:"2026-09",clienteId:"a",valor:1500},{comp:"2026-08",clienteId:"a",valor:900},{comp:"2026-09",clienteId:"b",valor:""}]};'+cod,{},['lcMensVigente']);
  ok('mudou só setembro em Recebimentos: o controle mostra 1500', g.lcMensVigente({id:'a',valor:1000},'2026-09')===1500);
  ok('mês sem cobrança lançada: vale o cadastro', g.lcMensVigente({id:'a',valor:1000},'2026-10')===1000);
  ok('cobrança sem valor: vale o cadastro', g.lcMensVigente({id:'b',valor:800},'2026-09')===800);
  ok('gravar clientes ou recebimentos acerta o controle', HTML.indexOf("if(sujos.some(([m])=>m==='clientes'||m==='recebimentos')) setTimeout(()=>{ lcSyncMens()")>0);
}

/* ---------------- conclusão com relatório ---------------- */
grupo('Concluir pede "O que foi feito" (Gabriel 23/09)');
{
  const cod=bloco('function cnPrecisa(','function cnPedir(');
  const g=rodar(cod,{ehLC:(l)=>l==='LC',espacoDaLista:(l)=>l==='PES'?{workspace_id:'w2'}:{workspace_id:null},
    wsTodas:()=>[{id:'w2',tipo:'pessoal'}]},['cnPrecisa']);
  ok('tarefa comum aberta pede o relatório', g.cnPrecisa({lista_id:'L',status:'todo'}));
  ok('já concluída não pede de novo', !g.cnPrecisa({lista_id:'L',status:'feito'}));
  ok('Controle de Clientes não pede (coluna é estágio do cliente)', !g.cnPrecisa({lista_id:'LC',status:'todo'}));
  ok('workspace pessoal não pede', !g.cnPrecisa({lista_id:'PES',status:'todo'}));
  const passa=(nome,trecho)=>ok(nome+' pede o relatório antes de concluir', trecho.indexOf('cnAntes(')>=0);
  passa('checkbox da lista', bloco('window.tkConcluir=','window.tkToggle='));
  passa('select de status simples', bloco('window.tkStatus=','/* Checkbox da lista'));
  passa('arrastar no board simples', bloco('window.tkSoltar=','window.tkSoltarDia='));
  passa('colunas próprias (select, board, menu)', bloco('window.tkSetStatus=','/* ---------- Vídeo APROVADO'));
  passa('painel da tarefa', bloco('async function tkmSalvar(','/* ---------- PAINEL DA TAREFA'));
  passa('Início', bloco('window.iniConcluir=','window.inicioPeriodo='));
  passa('Só minhas', bloco('window.pessoalVirar=','window.pessoalApagar='));
  ok('sem texto não conclui (botão só fecha com texto)', /if\(!v\)\{ o\.querySelector\('#cnAviso'\)/.test(cod+bloco('function cnPedir(','async function cnAntes(')));
  const fn=fs.readFileSync(path.join(__dirname,'..','funcoes','lembrete-tarefa','index.ts'),'utf8');
  ['tarefa:','responsaveis:','o_que_foi_feito:','concluida_em:','link:','flag:','gerente:'].forEach(k=>ok('aviso de conclusão tem '+k.replace(':',''), fn.indexOf('      '+k)>0));
  ok('gerente da demanda = quem criou a tarefa', /t\.criado_por \? \(await rest\(`perfis\?id=eq\.\$\{t\.criado_por\}/.test(fn));
}

/* ---------------- Controle de Clientes visão B ---------------- */
grupo('Controle de Clientes: funil + lista (Gabriel 23/09)');
{
  ok('abre em Lista', /const visaoPadrao=\(id\)=>id===LC_ID\?'lista'/.test(HTML));
  ok('fileiras de pílulas saíram (viraram Pessoa ▾ e Tipo ▾)', HTML.indexOf("lcAlertaContas()+lcAtalhos()+lcChips()")<0 && HTML.indexOf('lcBtnPessoa()+lcBtnTipo()+lcBtnFiltro()')>0);
  ok('faixa do funil em cima da lista', HTML.indexOf("(TK.visao==='lista'?lcFunil():'')")>0);
  ok('clicar no estágio filtra (e clicar de novo tira)', /TK\.lcF\.estagio=\(a\.length===1&&a\[0\]===id\)\?\[\]:\[id\]/.test(HTML));
  ok('quadro: coluna vazia vira faixa fina', HTML.indexOf("lcb-fina")>0);
}

/* ---------------- topo minimalista das listas ---------------- */
grupo('Topo minimalista e tabela mais leve (Gabriel 23/09)');
{
  ok('abas de texto Minhas | Recorrentes', HTML.indexOf('<div class="tp-abas">')>0);
  ok('ícones sem borda: buscar, filtrar, responsável, lista, quadro, ⋯ e +', ["tpIb('lupa'","tpIb('funil'","tpIb('pessoa'","tpIb('lista'","tpIb('quadro'","tpIb('pts'",'class="tp-mais"'].every(k=>HTML.indexOf(k)>0));
  ok('Grupo, Colunas, Status da lista e Tipos foram pro ⋯', /tkMenuGrupo\(\)/.test(bloco('window.tpMais=','async function tkPatch(')) && /tkTipos\(\)/.test(bloco('window.tpMais=','async function tkPatch(')));
  ok('grupo vazio não ocupa linha (desce pra uma linha só)', HTML.indexOf('tl-vazios')>0);
  ok('Controle de Clientes mantém o topo dele', HTML.indexOf('if(!cli){ c.innerHTML=')>0);
}

function fimDosTestes(){
/* ---------------- tipo de cliente no Controle de Clientes ---------------- */
grupo('Controle de Clientes: filtro por tipo e selo "sem tipo" (Gabriel 23/09)');
{
  const cod=bloco('const lcTipoDe=','window.lcTipoF=');
  const F={a:{categoria:'trafego'},b:{categoria:'ia'},c:{categoria:'ia'},d:{},e:{categoria:'xyz'}};
  const g=rodar('const CAT_LABEL={trafego:"Tráfego Pago",ia:"Agent IA",full:"Tráfego + Agent IA",outro:"Outro"};'+cod,{
    TK:{lcTipo:'',lcVista:''}, esc:s=>String(s),
    fichaDe:id=>F[id], tkFiltradas:()=>Object.keys(F).map(k=>({ficha_id:k}))
  },['lcTipoDe','lcTipos']);
  ok('categoria da ficha vira o tipo', g.lcTipoDe(F.a)==='trafego');
  ok('sem categoria é "sem tipo"', g.lcTipoDe(F.d)==='(sem)');
  ok('categoria desconhecida é "sem tipo"', g.lcTipoDe(F.e)==='(sem)');
  const h=g.lcTipos();
  ok('mostra as quatro opções da ficha', ['Tráfego Pago','Agent IA','Tráfego + Agent IA','Outro'].every(x=>h.indexOf(x)>0));
  ok('conta Agent IA = 2', /Agent IA<span class="lc-n">2</.test(h));
  ok('aponta os 2 sem tipo', /Sem tipo<span class="lc-n">2</.test(h));
  ok('o atalho "Agente" saiu das pílulas de pessoa', HTML.indexOf("pil('(ia)','Agente'")<0);
}
/* ---------------- gerente é o master das contas dele ---------------- */
grupo('Controle de Clientes: gerente mexe em tudo nos clientes dele (Gabriel 23/09)');
{
  const cod=bloco('const souGerenteDaFicha=','const campoTexto=');
  const F={meu:{gerente:'Luiz Marcelo'},outro:{gerente:'João'}};
  const trava={so_master:true}, livre={so_master:false};
  const ctx=(u)=>rodar(cod,{currentUser:u,fichaDe:id=>F[id]||null,
    primNome:x=>String(x||'').trim().split(/\s+/)[0].toLowerCase()},['souGerenteDaFicha','podeMexerCampo']);
  const ger=ctx({nome:'Luiz',role:'membro',gerente:true});
  ok('gerente mexe no campo travado do cliente dele', ger.podeMexerCampo(trava,{ficha_id:'meu'})===true);
  ok('gerente NÃO mexe no cliente de outro gerente', ger.podeMexerCampo(trava,{ficha_id:'outro'})===false);
  ok('sem a tarefa (formulário) continua só master', ger.podeMexerCampo(trava)===false);
  const gest=ctx({nome:'Luiz',role:'membro',gerente:false});
  ok('mesmo nome, mas sem ser gerente: não mexe', gest.podeMexerCampo(trava,{ficha_id:'meu'})===false);
  const mst=ctx({nome:'Bernardo',role:'master'});
  ok('master mexe em tudo', mst.podeMexerCampo(trava,{ficha_id:'outro'})===true);
  ok('campo livre: todo mundo', gest.podeMexerCampo(livre,{ficha_id:'outro'})===true);
}
/* ---------------- prazo com horário (só hora cheia) ---------------- */
grupo('Tarefas: prazo com horário, só hora cheia (23/09)');
{
  const cod=bloco('const HORAS_CHEIAS=','/* campo: botão com a data');
  const g=rodar('const dtCurto=iso=>iso.slice(8,10)+"/"+iso.slice(5,7);'+cod,{esc:s=>String(s)},['HORAS_CHEIAS','horaCheia','horaOpcoes','dtRotulo']);
  ok('24 opções, de 00:00 a 23:00', g.HORAS_CHEIAS.length===24&&g.HORAS_CHEIAS[0]==='00:00'&&g.HORAS_CHEIAS[23]==='23:00');
  ok('nenhuma opção com minuto quebrado', g.HORAS_CHEIAS.every(h=>/:00$/.test(h)));
  ok('15:17 vira 15:00', g.horaCheia('15:17')==='15:00');
  ok('9 vira 09:00', g.horaCheia('9')==='09:00');
  ok('vazio e lixo ficam vazios', g.horaCheia('')===''&&g.horaCheia(null)===''&&g.horaCheia('abc')===''&&g.horaCheia('25:00')==='');
  ok('rótulo: 18/09 às 15:00', g.dtRotulo('2026-09-18','15:00')==='18/09 às 15:00');
  ok('rótulo sem hora: só a data', g.dtRotulo('2026-09-18','')==='18/09');
  ok('opção marcada é a hora da tarefa', /value="15:00" selected/.test(g.horaOpcoes('15:00')));
  let pat=null;
  const q=rodar('const dtCurto=iso=>iso;'+cod+bloco('window.tkQaPrazo=','/* bandeira abre menu'),
    {esc:s=>String(s),tkPatch:(id,p)=>{pat=p;}},[]);
  q.tkQaPrazo('x','2026-09-18','15:00');
  ok('cartão grava data e hora juntas', pat&&pat.prazo==='2026-09-18'&&pat.hora==='15:00');
  q.tkQaPrazo('x','2026-09-18','14:43');
  ok('hora quebrada vinda de fora vira hora cheia', pat&&pat.hora==='14:00');
  q.tkQaPrazo('x','');
  ok('tirou o prazo: some o horário junto', pat&&pat.prazo===null&&pat.hora===null);
}

/* ---------------- contas do mesmo cliente (Alto Giro, Sabará) ---------------- */
grupo('Contas do mesmo cliente: grupo, contas irmãs e conta do Meta sem ficha (Gabriel 23/09)');
{
  const cod=bloco("const LC_REM=",'function pcGrupoBarra(');
  const P=[{id:'a',nome:'ALTOGIRO | JÔ ARAUJO',grupo:'ALTOGIRO'},{id:'b',nome:'ALTOGIRO │ DHIONATAS'},{id:'c',nome:'altogiro | marcos'},
           {id:'d',nome:'SABARÁ | CAYMAN'},{id:'e',nome:'TOP TRADE'}];
  const g=rodar(cod,{MAIUS:x=>String(x==null?'':x).toLocaleUpperCase('pt-BR'),DB:{projetos:P},
    fichaDaConta:id=>id==='act_ligada'?P[0]:null,
    window:{__mtDados:[{id:'act_ligada',status:1},{id:'act_solta',status:1},{id:'act_parada',status:2}]}},['grupoDe','irmasDe','contaSufixo','contasSemFicha']);
  g.window.__mtDados=[{id:'act_ligada',status:1},{id:'act_solta',status:1},{id:'act_parada',status:2}];
  ok('grupo explícito na ficha', g.grupoDe(P[0])==='ALTOGIRO');
  ok('grupo pelo prefixo, com a barra │ também', g.grupoDe(P[1])==='ALTOGIRO');
  ok('prefixo em minúscula vira o mesmo grupo', g.grupoDe(P[2])==='ALTOGIRO');
  ok('cliente sem barra não tem grupo', g.grupoDe(P[4])==='');
  ok('Altogiro tem 3 contas irmãs', g.irmasDe(P[0]).length===3);
  ok('Sabará não mistura com Altogiro', g.irmasDe(P[3]).length===1);
  ok('nome da conta sem o grupo', g.contaSufixo(P[1])==='DHIONATAS');
  ok('só conta ativa e sem ficha entra no alerta', g.contasSemFicha().map(x=>x.id).join()==='act_solta');
}

/* ---------------- gerente manda no que criou ---------------- */
grupo('Espaços: gerente compartilha, duplica e exclui o que ELE criou (Gabriel 23/09)');
{
  const cod=bloco('const nmEhMaster=','window.spCompartilhar=');
  const N={e1:{criado_por:'luiz'},e2:{criado_por:'bernardo'},e3:{}};
  const ctx=(u)=>rodar(cod,{currentUser:u,spNo:(t,id)=>N[id]||null},['nmEhMaster','nmPodeGerir']);
  const luiz=ctx({id:'luiz',role:'membro',gerente:true});
  ok('gerente gerencia o espaço que criou', luiz.nmPodeGerir('espaco','e1')===true);
  ok('gerente NÃO gerencia o que outro criou', luiz.nmPodeGerir('espaco','e2')===false);
  ok('espaço antigo, sem criador: só master', luiz.nmPodeGerir('espaco','e3')===false);
  const semGer=ctx({id:'luiz',role:'membro',gerente:false});
  ok('quem não é gerente não gerencia nem o que criou', semGer.nmPodeGerir('espaco','e1')===false);
  const mst=ctx({id:'bernardo',role:'master'});
  ok('master gerencia tudo', mst.nmPodeGerir('espaco','e3')===true);
}

/* ---------------- rascunho: só cliente, data e responsável são obrigatórios ---------------- */
grupo('Tarefa em rascunho até ter cliente, data e responsável (Gabriel 23/09)');
{
  const cod=bloco('const tkPessoal=','/* criar digitando direto na coluna');
  const L={camp:{exige:['cliente'],pessoal:false},tec:{exige:[],pessoal:false},pes:{exige:[],pessoal:true}};
  const g=rodar(cod,{esc:s=>String(s),exigeDaLista:(lid)=>L[lid].exige,
    espacoDaLista:(lid)=>({workspace_id:L[lid].pessoal?'wp':'we'}),TK:{ws:[{id:'wp',tipo:'pessoal'},{id:'we',tipo:'empresa'}]}},
    ['tkPessoal','tkFaltaObrig','tkFaltaTxt']);
  ok('Campanhas só com título: falta cliente, data e responsável',
    JSON.stringify(g.tkFaltaObrig({lista_id:'camp'}))===JSON.stringify(['cliente','data','responsável']));
  ok('Campanhas completa: nada falta', g.tkFaltaObrig({lista_id:'camp',ficha_id:'f',prazo:'2026-09-24',responsaveis:['u']}).length===0);
  ok('lista sem cliente (Tecnologia): só data e responsável', JSON.stringify(g.tkFaltaObrig({lista_id:'tec'}))===JSON.stringify(['data','responsável']));
  ok('workspace pessoal nunca é rascunho', g.tkFaltaObrig({lista_id:'pes'}).length===0);
  ok('texto do que falta', g.tkFaltaTxt(['cliente','data','responsável'])==='cliente, data e responsável');
  ok('quick-add do quadro não abre mais o formulário pedindo cliente', HTML.indexOf("Essa lista pede o cliente, escolha pra salvar")<0);
}

/* ---------------- renomear clicando no título da ficha (ClickUp) ---------------- */
grupo('Ficha: renomear o cliente clicando no nome (Gabriel 23/09)');
{
  const cod=bloco('window.cliNomeInline=','window.cliRenomear=');
  const chamadas=[];
  const g=rodar(cod,{MAIUS:x=>String(x).toUpperCase(),toast:()=>{},openProjCard:()=>{},
    document:{createRange:()=>{ throw new Error('sem DOM'); }},getSelection:()=>null,
    cliRenomearSalvar:(fid,novo)=>{ chamadas.push([fid,novo]); return Promise.resolve(true); }},[]);
  const campo=(txt)=>({textContent:txt,isContentEditable:false,contentEditable:'inherit',
    classList:{add(){},remove(){}},focus(){},blur(){ if(this.onblur) this.onblur(); }});
  const tecla=(el,k)=>el.onkeydown({key:k,preventDefault(){},stopPropagation(){}});
  let el=campo('SANTI AUTOMÓVEIS'); g.cliNomeInline(el,'f1');
  ok('clicar deixa o nome editável', el.contentEditable==='plaintext-only'||el.contentEditable==='true');
  el.textContent='Santi  Automóveis   SJRP'; tecla(el,'Enter');
  ok('Enter grava o nome novo (espaços limpos)', chamadas.length===1&&chamadas[0][0]==='f1'&&chamadas[0][1]==='Santi Automóveis SJRP');
  el=campo('BAHAMAS'); g.cliNomeInline(el,'f2'); el.textContent='Outro nome'; tecla(el,'Escape');
  ok('Esc desiste e volta o nome', chamadas.length===1&&el.textContent==='BAHAMAS');
  el=campo('BAHAMAS'); g.cliNomeInline(el,'f2'); el.textContent='bahamas'; el.blur();
  ok('mesmo nome (só caixa diferente) não grava', chamadas.length===1);
  ok('só master ou gerente do cliente veem o nome clicável', /\(master\|\|souGerenteDaFicha\(it\.id\)\)\s*\?`<div class="pc-nome ed"/.test(HTML));
}

/* ---------------- topo da ficha: estágio e squad clicáveis ---------------- */
grupo('Ficha: estágio e squad clicáveis no topo (Gabriel 23/09)');
{
  const cod=bloco('const pcCardLC=','window.pcEditar=');
  const mk=(u,ger)=>rodar(cod,{currentUser:u,esc:s=>String(s),LC_ID:'LC',
    TK:{tarefas:[{lista_id:'LC',ficha_id:'f1',status_id:'s5'}]},tkStatus1:id=>id==='s5'?{nome:'5. CLIENTE ATIVO',cor:'#3ec46d'}:null,
    ST_LABEL:{ativo:'Cliente ativo'},PRJ_NORM:()=>'ativo',sqEtiqueta:q=>'<span>'+q+'</span>',
    souGerenteDaFicha:()=>ger,DB:{projetos:[]},SQUADS:()=>['01','02']},['pcStatusHtml','pcSquadHtml']);
  const it={id:'f1',squad:'01',status:'ativo'};
  const mst=mk({role:'master'},false), ger=mk({role:'membro',gerente:true},true), gest=mk({role:'membro'},false);
  ok('etiqueta mostra o estágio do card e abre a lista', /5\. CLIENTE ATIVO/.test(mst.pcStatusHtml(it))&&/pcStatusMenu/.test(mst.pcStatusHtml(it)));
  ok('sem card: cai no status da ficha', /Cliente ativo/.test(mst.pcStatusHtml({id:'fx',status:'ativo'})));
  ok('master: squad clicável pra trocar', /pcSquadMenu/.test(mst.pcSquadHtml(it))&&/Mudar o squad/.test(mst.pcSquadHtml(it)));
  ok('gerente do cliente: squad clicável pra PEDIR', /Abrir solicitação de mudança de squad/.test(ger.pcSquadHtml(it)));
  ok('gestor: squad só aparece, sem clique', !/pcSquadMenu/.test(gest.pcSquadHtml(it))&&/01/.test(gest.pcSquadHtml(it)));
  ok('pedido de squad vira chamado de suporte pro Bernardo', /suporte_abrir_chamado/.test(cod));
}

/* ---------------- ficha estilo ClickUp: propriedades, atividade, relacionamentos ---------------- */
grupo('Ficha estilo ClickUp: propriedades e Relacionamentos (Gabriel 23/09)');
{
  const cod=bloco('const PCX_I=','function pcFaixa(it){');
  const T=[{id:'t1',ficha_id:'f1',lista_id:'CAMP',titulo:'Subir vídeo',prazo:'2026-09-20',status:'todo',prioridade:'alta'},
           {id:'t2',ficha_id:'f1',lista_id:'TEC',titulo:'SUBIR n8n',prazo:'2026-09-30',status:'feito'},
           {id:'t3',ficha_id:'f1',lista_id:'LC',titulo:'CARD DO CLIENTE'},
           {id:'t4',ficha_id:'f2',lista_id:'CAMP',titulo:'outro cliente'}];
  const g=rodar(cod,{esc:s=>String(s),TK:{tarefas:T,listas:[{id:'CAMP',nome:'Campanhas'},{id:'TEC',nome:'03. Tecnologia'}]},
    ehListaCli:l=>l==='LC',arquivada:()=>false,spNome:l=>l.nome,tkHoje:()=>'2026-09-23',tkStatus1:()=>null,tkCorLinha:()=>'#888',
    TK_ST:{todo:'A fazer',feito:'Concluída'},PRIO_COR:{},TK_PRIO:{alta:'Alta'},dtCurto:x=>x.slice(8,10)+'/'+x.slice(5,7),tkCaminho:()=>'',
    abaFinCliente:()=>'<div>FIN</div>',currentUser:{role:'master'},contasDoCliente:()=>[],MT_LEADS:[],LT_PER:{},brl:v=>'R$ '+v,
    finDaFicha:()=>({}),linkIg:()=>'',linkUrl:()=>'',zapsDe:()=>[],CAT_LABEL:{trafego:'Tráfego Pago'},pcSquadHtml:()=>'<i></i><span>01</span>',
    pcStatusHtml:()=>'<button>4. EM MANUTENÇÃO</button>',avatarDoNome:n=>'',RISCO_COR:{},RISCO_TXT:{},localStorage:{getItem:()=>null,setItem(){}}},
    ['pcRelTarefas','pcRelPainel','pcProps']);
  const it={id:'f1',nome:'LEAL MOTOS',clienteId:'c1',categoria:'trafego',squad:'01',responsavel:'Luan',gerente:'João'};
  ok('relacionamentos: só as tarefas desse cliente, sem o card do Controle de Clientes', g.pcRelTarefas(it).length===2);
  const h=g.pcRelPainel(it);
  ok('documento do cliente vem primeiro', h.indexOf('Documento do cliente')>0&&h.indexOf('Documento do cliente')<h.indexOf('Campanhas'));
  ok('tarefas agrupadas por lista (Campanhas e Tecnologia)', /Campanhas/.test(h)&&/03\. Tecnologia/.test(h));
  ok('prazo vencido fica marcado', /class="p tarde">20\/09/.test(h));
  ok('financeiro mora em Relacionamentos (master)', /FIN/.test(h));
  const pp=g.pcProps(it);
  ok('propriedades: Status, Tipo, Squad, Gestor, Gerente, Conta, Verba, Gasto, Saldo, Links',
    ['Status','Tipo','Squad','Gestor de tráfego','Gerente','Conta de anúncio','Verba','Gasto','Saldo','Links'].every(r=>pp.indexOf('>'+r+'</span>')>0||pp.indexOf(r+'</span>')>0));
  ok('campo vazio marcado pra poder recolher', /class="pr vz"/.test(pp)&&/Recolher campos vazios/.test(pp));
  ok('cartão principal sem aba Financeiro', !/onclick="cliIrPara\('\$\{it\.id\}','fin'\)">Financeiro/.test(HTML));
  ok('barra da direita: Detalhes, Atividade e Relacionamentos', /title="Detalhes"/.test(HTML)&&/title="Atividade"/.test(HTML)&&/title="Relacionamentos"/.test(HTML));
}

/* ---------------- aba Ficha limpa e Atividade sem repetição ---------------- */
grupo('Ficha: aba Ficha limpa e Atividade sem o nome repetido (Gabriel 23/09)');
{
  const cod=bloco('function ltDeEvento(e,eu,master){','window.ltCarregar=');
  const g=rodar(cod,{esc:s=>String(s),tkNomeUser:()=>'',ltTexto:s=>s,LC_NIVEL:{}},['ltDeEvento']);
  const o=g.ltDeEvento({tipo:'gasto',texto:'CENTROCAR VEÍCULOS: R$ 410,07 últimos 7 dias · 40 leads',dados:{nivel:'atencao'}},'u',false);
  ok('Meta sem o nome do cliente: "Meta R$ 410,07 em 7 dias"', o.html==='<b>Meta</b> R$ 410,07 em 7 dias · 40 leads');
  ok('saldo curto continua com bolinha de alerta', /alerta/.test(o.cls));
  ok('aba Ficha não repete Gestor/Gerente/Squad/Status/Categoria do topo',
    HTML.indexOf("selPessoa('pc_resp'")<0&&HTML.indexOf("id=\"pc_status\"")<0&&HTML.indexOf("${cat('Time')}")<0);
  ok('gestor e gerente se escolhem no topo', /window\.pcPessoaMenu=/.test(HTML)&&/pcPessoaMenu\(event/.test(HTML));
  ok('campo vazio mostra "Vazio" em vez de "definir"', HTML.indexOf(`leitura==='definir'?'<span class="pcx-vz">Vazio</span>'`)>0);
  ok('checklist enxuto com "+ Adicionar item"', HTML.indexOf('placeholder="+ Adicionar item"')>0);
}

console.log('\n'+(falhas
  ? '\x1b[31m>>> '+falhas+' de '+total+' FALHARAM\x1b[0m\n'
  : '\x1b[32m>>> '+total+' verificações, todas passaram\x1b[0m\n'));
process.exit(falhas?1:0);
}
