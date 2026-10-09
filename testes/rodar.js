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
/* testes assíncronos registram a promessa aqui; o fim espera todas */
const PROMESSAS=[];

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
/* CRMs de formulário (Bernardo 08/10): a tabela CRM_FORMS mora perto do LTEL e os trechos de
   Respostas, Painel e Equipe leem dela; vai pronta em todo contexto, como no app. */
const CRM_FORMS_T=(()=>{ const m=HTML.match(/const CRM_FORMS=(\[[\s\S]*?\]);/); return m?vm.runInNewContext(m[1]):[]; })();
function rodar(codigo,ctx,exporta){
  const g=Object.assign({console,Date,Math,JSON,String,Number,Array,Object,Boolean,
    parseFloat,parseInt,isNaN,Promise,setTimeout,clearInterval,setInterval:()=>0,CRM_FORMS:CRM_FORMS_T},ctx||{});
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
grupo('Recebimentos: contas do mesmo dono acopladas (Gabriel 30/09)');
{
  const g=rodar(bloco('const GR_SEP=','const contasSemFicha=')+bloco('function rcAgrupar(','window.rcGrupoAbre='),
    {MAIUS:s=>String(s||'').toUpperCase(),DB:{projetos:[{clienteId:'a3',nome:'ALTOGIRO │ DHIONATAS',grupo:'ALTOGIRO'}]}},
    ['grupoDe','rcAgrupar','rcGrupoStatus','RC_LOTE']);
  const gf=(c)=>g.grupoDe(g.DB.projetos.find(p=>p.clienteId===c.id))||g.grupoDe({nome:c.nome});
  const rows=[{id:'x1',nome:'LEAL MOTOS'},{id:'a1',nome:'ALTOGIRO | MAYCON'},{id:'a2',nome:'ALTOGIRO | MOISÉS'},
    {id:'x2',nome:'GTR MOTORS'},{id:'a3',nome:'ALTOGIRO │ DHIONATAS'},{id:'s1',nome:'SABARÁ | CAYMAN'}];
  const r=g.rcAgrupar(rows,gf);
  ok('grupo vira uma linha só, no lugar da primeira conta', r.length===4&&r[1].grupo==='ALTOGIRO'&&r[1].membros.length===3);
  ok('cliente sem grupo continua linha comum, na ordem', r[0].conta.id==='x1'&&r[2].conta.id==='x2');
  ok('grupo com uma conta só na tela não acopla', r[3].conta&&r[3].conta.id==='s1');
  const st={a1:'recebido',a2:'areceber',a3:'recebido'};
  const S=g.rcGrupoStatus(r[1].membros,c=>st[c.id]);
  ok('status misto conta no formato feitos de previstos', S.igual===''&&S.texto==='2 de 3 recebidas');
  ok('status igual devolve o status do grupo', g.rcGrupoStatus(r[1].membros,()=>'areceber').igual==='areceber');
  ok('em lote só A receber, Inadimplente e Recebido', g.RC_LOTE.join()==='areceber,inadimplente,recebido');
}

grupo('Recebimentos: churn conta só o da competência (Gabriel 30/09)');
{
  const DB={clientes:[{id:'v',nome:'GAMA',diaVenc:3,valor:1300,churnComp:'2026-08',fim:'2026-08'},
      {id:'n',nome:'AURA',diaVenc:24,valor:1500,churnComp:'2026-09',fim:'2026-09'},{id:'a',nome:'LEAL',diaVenc:5,valor:1000}],
    recebimentos:[{comp:'2026-08',clienteId:'v',valor:1300,status:'churn'},{comp:'2026-09',clienteId:'n',valor:1500,status:'churn'}]};
  const g=rodar(bloco('const cliArq=','let cliArqVista')+bloco('function calcRecebimentos(comp){','/* Bloco B:'),
    {DB,hojeISO:()=>'2026-09-30',compNow:()=>'2026-09',vencOf:(c,d)=>c+'-'+String(d).padStart(2,'0')},['calcRecebimentos']);
  const R=g.calcRecebimentos('2026-09');
  ok('quem saiu em agosto segue marcado como churn em setembro (não volta a cobrar)', R.st(DB.clientes[0])==='churn');
  ok('mas o churn de setembro é só quem saiu em setembro', R.churnDoMes.length===1&&R.churnDoMes[0].id==='n');
  ok('receita perdida soma só o churn do mês', R.perdaChurn===1500);
  ok('o filtro e o cartão leem a lista do mês, não a de todos os tempos', /const foraChurn=\(r\)=>R\.st\(r\)!=='churn'\|\|\(statusFiltro==='churn'&&R\.churnMes\(r\)\)/.test(HTML)&&HTML.indexOf('${R.g.churn.length} cliente')<0);
}

grupo('Lançamentos: tabela por departamento, maior despesa primeiro (Gabriel 30/09)');
{
  const g=rodar(bloco('const ehMetaAds=','let lancGrAberto='),null,['ehMetaAds','ehFolhaPg','lancDepto','lancSub','lancAgrupar']);
  const D=(descricao,categoria,valor,tipo)=>({tipo:tipo||'despesa',descricao,categoria,valor});
  const rows=[D('Pix: Meta Ads: aporte, anúncios AutoSíntese','Comercial',1000),D('Cartão Nubank: Facebk *Vl6f7z5ea2','Comercial',354.03),
    D('Pix: Casa dos Dados','Comercial',100),
    D('Folha: Luan, Base mensal','Marketing',2552),D('Folha: Maria Eduarda, Editora','Marketing',1348),D('Pix: Modelo para criação de conteúdo','Marketing',200),
    D('Folha: Bernardo, Head','Sócios',3000),D('Folha: Gabriel, Head','Sócios',3000),
    D('Cartão Nubank: Openai (20 compras)','Tecnologia',7502.12),D('Cartão Nubank: Supabase','Tecnologia',723.97),D('Folha: Arthur, Head de Produto','Tecnologia',950),
    D('Pix: Pagamento contabilidade','Administrativo',890),
    D('Mensalidade: GTR MOTORS','Mensalidade Clientes',1500,'receita'),D('Mensalidade: NEGOCICAR','Mensalidade Clientes',1300,'receita'),
    D('Sem nada','',50)];
  const b=g.lancAgrupar(rows), nomes=b.map(x=>x.nome).join(' > '), de=n=>b.find(x=>x.nome===n);
  ok('o departamento é a categoria do lançamento', g.lancDepto(rows[0])==='Comercial'&&g.lancDepto(rows[3])==='Marketing'&&g.lancDepto(rows[14])==='Sem categoria');
  ok('despesas primeiro, do departamento maior para o menor, depois as receitas',
    nomes==='Tecnologia > Sócios > Marketing > Comercial > Administrativo > Sem categoria > Mensalidade Clientes');
  ok('o departamento soma os lançamentos dele', Math.abs(de('Comercial').total-1454.03)<0.001&&de('Comercial').itens.length===3&&de('Marketing').total===4100);
  ok('Pix "Meta Ads" e cartão "Facebk" viram o sub-bloco Meta Ads dentro do Comercial',
    de('Comercial').partes[0].nome==='Meta Ads'&&de('Comercial').partes[0].itens.length===2&&Math.abs(de('Comercial').partes[0].total-1354.03)<0.001&&de('Comercial').partes[1].item.valor===100);
  ok('folha vira um sub-bloco dentro do departamento dela', de('Marketing').partes[0].nome==='Folha de pagamento'&&de('Marketing').partes[0].total===3900&&de('Marketing').partes[1].item.valor===200);
  ok('departamento que é só folha não ganha sub-bloco', de('Sócios').partes.length===2&&de('Sócios').partes.every(p=>p.item));
  ok('sub-bloco de um lançamento só vira linha comum', de('Tecnologia').partes.length===3&&de('Tecnologia').partes.every(p=>p.item));
  ok('dentro do departamento, o maior primeiro', de('Tecnologia').partes[0].item.valor===7502.12&&de('Tecnologia').itens[2].valor===723.97);
  ok('receita nunca é Meta Ads nem folha', g.lancSub(D('Folha: estorno Facebk','Mensalidade Clientes',10,'receita'))==='');
  ok('a soma dos departamentos bate com a soma dos lançamentos', Math.abs(b.reduce((s,x)=>s+x.total,0)-rows.reduce((s,x)=>s+x.valor,0))<0.001);
  ok('as partes de cada departamento somam o departamento', b.every(x=>Math.abs(x.partes.reduce((s,p)=>s+p.total,0)-x.total)<0.001));
  ok('o cartão de Meta Ads saiu do topo', HTML.indexOf('lancSoMeta')<0&&HTML.indexOf('Meta Ads · total')<0&&HTML.indexOf('metaTudo')<0&&HTML.indexOf('onclick="lancMeta()"')<0);
  ok('bloco usa a mesma linha de grupo dos Recebimentos', /<td colspan="2"><button type="button" class="rc-gr-b"[^>]*onclick="lancBlocoAbre/.test(HTML));
  ok('lançamento sozinho fica linha comum', HTML.indexOf('if(b.itens.length<2) return linha(b.itens[0],0);')>0);
  ok('busca abre os blocos', HTML.indexOf('const aberto=(k)=>!!t||!!lancGrAberto[k];')>0);
}

grupo('Folha: o motor de fixos só gera conta de escritório (a equipe é calculada por departamento)');
{
  const DB={folhaFixos:[
      {id:'col_2',tipo:'pessoa',nome:'Bernardo',papel:'socio',dia:5,fixo:3000,ativo:false},
      {id:'fx_vr',nome:'Aluguel VR',freq:'mensal',dia:1,valor:1300,posPago:false,ativo:true,recorrente:true,esc:'Volta Redonda',descricao:'Aluguel'},
      {id:'fx_luz',nome:'Água e luz VR',freq:'mensal',dia:1,valor:292.31,ativo:true,recorrente:true,esc:'Volta Redonda',descricao:'Contas',variavel:true},
      {id:'col_8',nome:'Yghor',freq:'mensal',dia:28,valor:1260,posPago:true,ativo:true,recorrente:true,inicioComp:'2026-07',descricao:''}],
    folha:[]};
  let n=0; const g=rodar(bloco('function gerarFolhaCore(','/* ---------- FOLHA POR DEPARTAMENTO'),
    {DB,uid:()=>'id'+(++n),vencOf:(c,d)=>{ const [y,m]=c.split('-').map(Number); const last=new Date(y,m,0).getDate(); return c+'-'+String(Math.min(Math.max(1,Number(d)||1),last)).padStart(2,'0'); },
     fmtComp:c=>c.split('-').reverse().join('/')},['gerarFolhaCore']);
  const criados=g.gerarFolhaCore('2026-09'); const de=nome=>DB.folha.find(p=>p.comp==='2026-09'&&p.nome===nome);
  ok('gente não nasce mais do pré-definido, nem a antiga ativa sem escritório', criados===2&&!de('Bernardo')&&!de('Yghor'));
  ok('aluguel continua vencendo no próprio mês, com o valor cadastrado', de('Aluguel VR').venc==='2026-09-01'&&de('Aluguel VR').valor===1300);
  ok('conta variável nasce zerada pedindo preencher', de('Água e luz VR').valor===0);
  ok('rodar de novo não duplica', g.gerarFolhaCore('2026-09')===0&&DB.folha.length===2);
  ok('a despesa continua na competência (fpDataComp usa o fim do mês quando o venc é do mês seguinte)', /if\(p\.venc && String\(p\.venc\)\.slice\(0,7\)===comp\) return p\.venc;/.test(HTML));
}

grupo('Folha: outros pagamentos da equipe, passagem do Luan toda segunda (Bernardo 05/10)');
{
  const DSEM=['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
  const vencOf=(c,d)=>{ const [y,m]=c.split('-').map(Number); const last=new Date(y,m,0).getDate(); return c+'-'+String(Math.min(Math.max(1,Number(d)||1),last)).padStart(2,'0'); };
  const DB={folhaFixos:[
      {id:'pes_luan',tipo:'pessoa',nome:'Luan Peixoto Santiago',papel:'gestor'},
      {id:'ex1',tipo:'extra',pessoaId:'pes_luan',nome:'Luan Peixoto Santiago',descricao:'Passagem de ônibus',valor:120,freq:'semanal',diaSemana:1,dp:'Marketing',inicioComp:'2026-10',ativo:true,tarefaSerie:'serie-1'},
      {id:'ex2',tipo:'extra',pessoaId:'pes_luan',nome:'Luan Peixoto Santiago',descricao:'Inativo',valor:50,freq:'mensal',dia:10,ativo:false}],
    folha:[]};
  const fdSoma=(a,k)=>Math.round((a||[]).reduce((x,y)=>x+(Number(k?y[k]:y)||0),0)*100)/100;
  const g=rodar(bloco('const fdExtras=','function fdOutros('),{DB,DSEM,vencOf,fdSoma,hojeISO:()=>'2026-10-20'},['gerarExtrasCore','fdExtraId','fdExtraResumo']);
  const out=g.gerarExtrasCore('2026-10'), doMes=c=>DB.folha.filter(p=>p.comp===c);
  ok('outubro tem 4 segundas: 4 parcelas de R$ 120', out===4&&doMes('2026-10').every(p=>p.valor===120&&p.extra===true));
  ok('vencem nas segundas 05, 12, 19 e 26', doMes('2026-10').map(p=>p.venc).join()==='2026-10-05,2026-10-12,2026-10-19,2026-10-26');
  ok('id fixo ex_<extra>_<data>, igual ao que o banco usa', DB.folha[0].id==='ex_ex1_2026-10-05');
  ok('a parcela leva a série da tarefa e o departamento', DB.folha[0].serie==='serie-1'&&DB.folha[0].dp==='Marketing');
  ok('rodar de novo não duplica', g.gerarExtrasCore('2026-10')===0&&doMes('2026-10').length===4);
  ok('novembro tem 5 segundas: 5 parcelas', g.gerarExtrasCore('2026-11')===5);
  ok('antes de começar e inativo não geram', g.gerarExtrasCore('2026-09')===0&&!DB.folha.some(p=>p.fixoId==='ex2'));
  secao('uma linha por mês: 1/4 concluído, R$ 120 de R$ 480');
  DB.folha.find(p=>p.venc==='2026-10-05').pago=true; DB.folha.find(p=>p.venc==='2026-10-05').tarefaPagou='t1';
  const rs=g.fdExtraResumo('2026-10');
  ok('junta as 4 parcelas numa linha só', rs.length===1&&rs[0].total===4&&rs[0].fid==='ex1');
  ok('conta 1/4 e R$ 120 de R$ 480', rs[0].pagas===1&&rs[0].valorPago===120&&rs[0].valorTotal===480);
  ok('a próxima é a primeira em aberto (12/10) e duas já passaram sem pagar', rs[0].prox.venc==='2026-10-12'&&rs[0].atrasadas===2);
  ok('sabe quantas vieram pela tarefa', rs[0].pelaTarefa===1);
  ok('botão +1 paga a próxima em aberto; −1 desfaz a manual antes da que veio da tarefa',
    /x\.extra&&x\.fixoId===fid&&x\.comp===comp&&!x\.pago\)\.sort\(\(a,b\)=>\(a\.venc/.test(HTML)&&HTML.indexOf('pagas.find(x=>!x.tarefaPagou)||pagas[0]')>0);
  ok('a tela recarrega folha e Financeiro quando o banco mudou (tarefa concluída)', /if\(velhos\.length\) await recarregarModulos\(velhos\);/.test(HTML));
  const f=rodar(bloco('const fdEhProv=','/* junta as linhas do banco'),
    {DB:{folha:[{id:'ex_ex1_2026-10-05',comp:'2026-10',fixoId:'ex1',nome:'Luan Peixoto Santiago',pago:true,valor:120,extra:true},
                {id:'pg1',comp:'2026-10',fixoId:'pes_luan',nome:'Luan Peixoto Santiago',pago:true,valor:600}]},
     primNome:(x)=>String(x||'').trim().split(/\s+/)[0].toLowerCase()},['fdPagosDe']);
  const pg=f.fdPagosDe('2026-10',{id:'pes_luan',nome:'Luan Peixoto Santiago'});
  ok('passagem paga não abate o salário (fdPagosDe só vê o pagamento da folha)', pg.length===1&&pg[0].id==='pg1');
  ok('no lucro, o espelho da passagem conta como despesa comum', /&&!extrasFp\.has\(x\.id\)/.test(HTML));
  ok('pagar a passagem não pergunta o valor', /if\(!escN&&!p\.extra\)\{/.test(HTML));
  ok('Gastos de escritório: botão editar / + chave Pix na linha', HTML.indexOf("${fx.pix?'editar':'+ chave Pix'}")>0);
}

grupo('Recebimentos: mensalidade em parcelas, DL Repasse 500 + 250 + 250 e 2 x 500 (Bernardo 06/10)');
{
  const DB={financeiro:[{id:'rcs_dlr9',tipo:'receita',valor:500},{id:'outro',tipo:'receita',valor:1}]};
  const g=rodar(bloco('/* ---------- PARCELAS DA MENSALIDADE','function rcRegistro('),{DB,hojeISO:()=>'2026-10-06'},['rcIdDoLanc','rcParcNovas','rcParcSync']);
  ok('acha a cobrança pelo id da receita (rcp_, rcs_ e rc_)', g.rcIdDoLanc('rcp_dlr_2026o9_p2')==='dlr_2026o9'&&g.rcIdDoLanc('rcs_abc')==='abc'&&g.rcIdDoLanc('rc_abc')==='abc'&&g.rcIdDoLanc('x')===null);
  const ps=g.rcParcNovas({valor:1000,parcelamento:{n:2,dias:15}},'2026-10-25');
  ok('2 x R$ 500: dia 25/10 e 15 dias depois (09/11)', ps.length===2&&ps[0].valor===500&&ps[1].valor===500&&ps[0].venc==='2026-10-25'&&ps[1].venc==='2026-11-09');
  const p3=g.rcParcNovas({valor:1000,parcelamento:{n:3,dias:10}},'2026-10-25');
  ok('3 parcelas somam o valor certinho (a última leva o centavo)', Math.round(p3.reduce((a,p)=>a+p.valor,0)*100)===100000&&p3[2].venc==='2026-11-14');
  ok('sem parcelamento no cadastro, nasce como sempre', g.rcParcNovas({valor:1000},'2026-10-25')===null);
  const r={id:'dlr9',comp:'2026-09',nome:'DL REPASSE',valor:1000,venc:'2026-10-02',status:'sinal',sinal:500,
    parcelas:[{valor:500,venc:'2026-10-02',pagoEm:'2026-10-02'},{valor:250,venc:'2026-10-06',pagoEm:null},{valor:250,venc:'2026-10-12',pagoEm:null}]};
  g.rcParcSync(r);
  ok('1 de 3 paga: fica Sinal pago com R$ 500 e a próxima em 06/10', r.status==='sinal'&&r.sinal===500&&r.restanteVenc==='2026-10-06'&&r.recebido===false);
  ok('a receita vira parcela própria e o sinal antigo sai', DB.financeiro.some(x=>x.id==='rcp_dlr9_p1'&&x.valor===500&&x.pagoEm==='2026-10-02')&&!DB.financeiro.some(x=>x.id==='rcs_dlr9')&&DB.financeiro.some(x=>x.id==='outro'));
  r.parcelas[1].pagoEm='2026-10-06'; g.rcParcSync(r);
  ok('2 de 3: sinal soma R$ 750 (a comissão sai proporcional) e a próxima é 12/10', r.sinal===750&&r.restanteVenc==='2026-10-12');
  r.parcelas[2].pagoEm='2026-10-12'; g.rcParcSync(r);
  ok('todas pagas: Recebido em 12/10, com uma receita por parcela', r.status==='recebido'&&r.recebido===true&&r.recebidoEm==='2026-10-12'&&r.sinal===null&&DB.financeiro.filter(x=>String(x.id).indexOf('rcp_dlr9_p')===0).length===3);
  r.parcelas.forEach(p=>{ p.pagoEm=null; }); g.rcParcSync(r);
  ok('desfazer tudo volta a em aberto e tira as receitas', r.status===null&&r.recebido===false&&!DB.financeiro.some(x=>String(x.id).indexOf('rcp_dlr9_p')===0));
  ok('Status da cobrança em parcelas: Recebido marca todas, Sinal recebe a próxima', HTML.indexOf("if(novo==='sinal'){ rcVolta(); return rcParcReceber(cliId); }")>0);
  ok('mês novo nasce com as parcelas do cadastro', (HTML.match(/const ps=rcParcNovas\(c,r\.venc\); if\(ps\) r\.parcelas=ps;/g)||[]).length===2);
  ok('fechamento acha o gerente da receita de parcela', (HTML.match(/const k=rcIdDoLanc\(i\);/g)||[]).length===2);
}

grupo('Controle de Clientes: rodapé só com ticket médio e remuneração, cada um vê o seu (Gabriel 30/09)');
{
  const r=bloco('/* RODAPÉ DO CONTROLE DE CLIENTES','return `<div class="tk-bar">');
  ok('a linha Total da carteira saiu da tabela', HTML.indexOf('Total da carteira<small>')<0&&HTML.indexOf('${totRow}')<0);
  ok('ficam ticket médio, por gerente, por gestor e por social media', /porGest=tkm\+linhaRem\('Por gerente',meus\(G\)\)\+linhaRem\('Por gestor',meus\(S\)\)\+linhaRem\('Por social media',meus\(SM\)\)/.test(r));
  ok('quem não é master só vê a própria linha', /const meus=\(M\)=>\{ if\(mst\) return M;/.test(r)&&r.indexOf('primNome(k)===eu')>0);
  ok('a soma só aparece pro master', r.indexOf("${mst?`<span class=\"c tot\">soma")>0);
  ok('o rodapé não depende mais de ser gerente (gestor e social media veem o seu)', /if\(lc&&total&&currentUser\)\{/.test(r)&&r.indexOf('souGerente()')<0);
  ok('sócio continua fora', r.indexOf("const SOCIOS=['bernardo','jose','gabriel']")>0);
  const g={}; const src=r.slice(r.indexOf('const eu='),r.indexOf('/* ticket médio'));
  const ctx={mst:false,currentUser:{nome:'Luan Santiago'},primNome:(x)=>String(x==null?'':x).normalize('NFD').replace(/[̀-ͯ]/g,'').trim().split(/\s+/)[0].toLowerCase(),
    esc:s=>String(s??''),moedaCurta:v=>'R$ '+v};
  const vm=require('vm'); vm.createContext(ctx); vm.runInContext(src+';this.meus=meus;this.linhaRem=linhaRem;',ctx);
  const M={Luan:{ids:{a:1,b:1},v:300},Yghor:{ids:{c:1},v:200}};
  ok('gestor Luan só enxerga o Luan', JSON.stringify(Object.keys(ctx.meus(M)))==='["Luan"]');
  ok('linha do gestor sem a soma', ctx.linhaRem('Por gestor',ctx.meus(M)).indexOf('soma')<0&&ctx.linhaRem('Por gestor',ctx.meus(M)).indexOf('Luan · 2 clientes')>0);
  ctx.mst=true; vm.runInContext('mst=true',ctx);
  ok('master vê todos e a soma', Object.keys(ctx.meus(M)).length===2&&ctx.linhaRem('Por gestor',M).indexOf('soma · <b>R$ 500')>0);}

grupo('Folha por departamento: calculada do Controle de Clientes (Gabriel 30/09)');
{
  const DB={folhaFixos:[],folha:[],financeiro:[]};
  const g=rodar(bloco('const FD_INICIO=','async function fdCarregar('),{DB,
    brl:v=>'R$ '+Number(v).toFixed(2).replace('.',','),fmtComp:c=>c.split('-').reverse().join('/'),fchData:x=>String(x.data||'').slice(0,7),
    fchEhRepasse:x=>/repasse/i.test(x.categoria||''),vencOf:(c,d)=>{ const [y,m]=c.split('-').map(Number); const last=new Date(y,m,0).getDate(); return c+'-'+String(Math.min(Math.max(1,Number(d)||1),last)).padStart(2,'0'); },
    primNome:x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().split(/\s+/)[0].toLowerCase()},
    ['fdResumo','fdComo','fdLucro','fdSincronizar','fdVenc']);
  const P=[{id:'lu',nome:'Luan Peixoto Santiago',papel:'gestor',dp:'Marketing',dia:1,fixo:0},{id:'ke',nome:'Kennedy Lima',papel:'vendas',dp:'Comercial',dia:5,fixo:1600},
    {id:'ma',nome:'Maria Eduarda',papel:'social',dp:'Marketing',dia:20,fixo:2000},{id:'ar',nome:'Arthur Pagiatto',papel:'tec',dia:5,fixo:3800},
    {id:'be',nome:'Bernardo Antunes',papel:'socio',dia:5,fixo:3000},{id:'ga',nome:'Gabriel',papel:'socio',dia:5,fixo:3000},{id:'jo',nome:'José Carlos',papel:'socio',dia:5,fixo:3000},
    {id:'jv',nome:'João Vitor Lente',papel:'gerente',dp:'Marketing',dia:30,fixo:0}];
  const L=[{pessoa:'Luan Santiago',papel:'gestor',cliente:'A',situacao:'recebido',cheio:100,ganho:100},{pessoa:'Luan Santiago',papel:'gestor',cliente:'B',situacao:'areceber',cheio:73.33,ganho:0},
    {pessoa:'Luan Santiago',papel:'gerente',cliente:'C',situacao:'sinal',cheio:100,ganho:50},
    {pessoa:'Kennedy',papel:'venda',cliente:'GUI',situacao:'vinculada',cheio:75,ganho:75,ref:'c1'},{pessoa:'Kennedy',papel:'venda',cliente:'LEAL',situacao:'sem_vinculo',cheio:65,ganho:0,ref:'c2'},
    {pessoa:'Maria',papel:'social',cliente:'A',situacao:'inadimplente',cheio:200,ganho:200},{pessoa:'Kennedy',papel:'fixo',cheio:1600,ganho:1600},
    {pessoa:'João',papel:'gerente',cliente:'SO IA',situacao:'recebido',cheio:100,ganho:100,cat:'ia'},{pessoa:'João',papel:'gerente',cliente:'SO TRAFEGO',situacao:'recebido',cheio:100,ganho:100,cat:'trafego'},
    {pessoa:'João',papel:'gerente',cliente:'OS DOIS',situacao:'sinal',cheio:100,ganho:50,cat:'full'}];
  const R=g.fdResumo(P,L), de=(id)=>R.find(x=>x.p.id===id);
  ok('gestor: só o que o cliente pagou está garantido, o resto é teto', de('lu').variavel===150&&de('lu').total===150&&de('lu').teto===273.33);
  ok('fixo + comissão: Kennedy 1.600 + 5% da venda ligada', de('ke').total===1675&&de('ke').teto===1740);
  ok('linha "fixo" que vem do banco não soma duas vezes com o cadastro', de('ke').ls.every(l=>l.papel!=='fixo'));
  ok('social media conta a conta mesmo com cliente inadimplente', de('ma').total===2200);
  ok('nome casa pelo primeiro nome (Luan Santiago = Luan Peixoto Santiago)', de('lu').ls.length===3);
  ok('como é calculado: N de M no formato feitos de previstos', g.fdComo(de('lu'))==='10% da carteira, 1 de 1 cliente pagou · 1 de 2 contas pagas'&&g.fdComo(de('ke'))==='fixo R$ 1600,00 · 1 de 2 vendas ligadas ao cliente');
  ok('gerente dividido: só IA vai pra Tecnologia, só tráfego pra Marketing, os dois metade cada', de('jv').dps.Tecnologia.ganho===125&&de('jv').dps.Marketing.ganho===125&&de('jv').total===250);
  ok('gestor, social e fixo ficam no departamento da pessoa', de('lu').dps.Marketing.ganho===150&&!de('lu').dps.Tecnologia&&de('ke').dps.Comercial.ganho===1675);
  ok('a divisão aparece no como é calculado', /Marketing R\$ 125,00 \+ Tecnologia R\$ 125,00/.test(g.fdComo(de('jv'))));
  ok('folha vence dentro do próprio mês, dia 30 por padrão (Gabriel 30/09)', g.fdVenc('2026-09',{dia:30})==='2026-09-30'&&g.fdVenc('2026-09',{})==='2026-09-30'&&g.fdVenc('2026-02',{dia:30})==='2026-02-28');
  DB.financeiro.push({id:'r1',tipo:'receita',data:'2026-09-05',valor:100000,categoria:'Mensalidade Clientes'},{id:'r2',tipo:'receita',data:'2026-09-30',valor:7000,categoria:'Recarga de tokens — repasse'},
    {id:'d1',tipo:'despesa',data:'2026-09-10',valor:27000,categoria:'Tecnologia'},{id:'fp_x',tipo:'despesa',data:'2026-09-30',valor:1500,categoria:'Tecnologia',descricao:'Folha: Arthur, antecipação'},
    {id:'fp_esc',tipo:'despesa',data:'2026-09-01',valor:1300,categoria:'Escritórios',descricao:'Aluguel VR'});
  const Lu=g.fdLucro('2026-09',fdSomaTotal(R),P);
  function fdSomaTotal(R){ return Math.round(R.reduce((s,x)=>s+x.total,0)*100)/100; }
  ok('lucro = recebido (sem repasse) menos despesas (sem folha já paga, com escritório) menos a folha calculada', Lu.receita===100000&&Lu.oper===21300&&Lu.folha===17075&&Lu.lucro===61625);
  ok('de cada R$ 100 de lucro: 20 caixa, 10 Arthur, 70 divididos entre os 3 sócios', Lu.caixa===12325&&Lu.por.ar===6162.5&&Lu.por.be===14379.17&&Lu.por.ga===14379.17&&Lu.por.jo===14379.17);
  ok('sem lucro, ninguém divide nada', g.fdLucro('2026-08',0,P).por.be===0);
  /* provisao: o que falta pagar vira um registro por pessoa, atualizado a cada abertura */
  let n=g.fdSincronizar('2026-09',R);
  const prov=DB.folha.filter(f=>/^fd_/.test(f.id));
  ok('uma provisão por pessoa e departamento com valor, e ninguém sem valor', n===9&&prov.length===9&&prov.find(f=>f.id==='fd_2026-09_ke').valor===1675&&prov.every(f=>!f.pago&&f.valor>0));
  ok('gerente dividido gera duas provisões, cada uma no seu departamento', prov.find(f=>f.id==='fd_2026-09_jv').valor===125&&prov.find(f=>f.id==='fd_2026-09_jv').dp==='Marketing'&&prov.find(f=>f.id==='fd_2026-09_jv_tec').valor===125&&prov.find(f=>f.id==='fd_2026-09_jv_tec').dp==='Tecnologia'&&/parte de Tecnologia/.test(prov.find(f=>f.id==='fd_2026-09_jv_tec').descricao));
  DB.folha.push({id:'fdp_jv',comp:'2026-09',fixoId:'jv',nome:'João Vitor Lente',valor:100,pago:true,pagoEm:'2026-09-30'});
  g.fdSincronizar('2026-09',R);
  ok('pagamento do gerente abate as duas provisões na proporção', DB.folha.find(f=>f.id==='fd_2026-09_jv').valor===75&&DB.folha.find(f=>f.id==='fd_2026-09_jv_tec').valor===75);
  ok('o espelho no Financeiro usa o departamento da provisão', /categoria:escN\?'Escritórios':\(p\.dp\|\|\(\(fxp&&fxp\.dp\)\?fxp\.dp:'Folha de Pagamento'\)\)/.test(HTML));
  ok('provisão vence no dia da pessoa dentro do mês e leva a função', prov.find(f=>f.id==='fd_2026-09_ke').venc==='2026-09-05'&&/SDR, folha de 09\/2026/.test(prov.find(f=>f.id==='fd_2026-09_ke').descricao));
  DB.folha.push({id:'fdp_1',comp:'2026-09',fixoId:'ke',nome:'Kennedy Lima',valor:1000,pago:true,pagoEm:'2026-10-05'});
  DB.folha.push({id:'antigo',comp:'2026-09',fixoId:null,nome:'Arthur Pagiatto Nunes',valor:1500,pago:true,pagoEm:'2026-09-11',esc:''});
  g.fdSincronizar('2026-09',R);
  ok('pagamento parcial abate a provisão', DB.folha.find(f=>f.id==='fd_2026-09_ke').valor===675);
  ok('registro antigo sem vínculo casa pelo nome e abate também', DB.folha.find(f=>f.id==='fd_2026-09_ar').valor===2300);
  DB.folha.push({id:'fdp_2',comp:'2026-09',fixoId:'ke',nome:'Kennedy Lima',valor:675,pago:true,pagoEm:'2026-10-06'});
  g.fdSincronizar('2026-09',R);
  ok('pago tudo: a provisão some', !DB.folha.find(f=>f.id==='fd_2026-09_ke'));
  ok('divisão do lucro paga não abate a folha', (()=>{ DB.folha.push({id:'fdp_l',comp:'2026-09',fixoId:'be',nome:'Bernardo Antunes',valor:999,pago:true,lucro:true,pagoEm:'2026-10-05'}); g.fdSincronizar('2026-09',R); return DB.folha.find(f=>f.id==='fd_2026-09_be').valor===3000; })());
  n=g.fdSincronizar('2026-09',R); ok('nada mudou, nada grava', n===0);
  ok('o espelho no Financeiro pula a divisão do lucro', /if\(p\.lucro\) return; \/\* divisao do lucro nao e despesa \*\//.test(HTML)&&/DB\.folha\.filter\(p=>!p\.lucro\)\.map\(p=>'fp_'\+p\.id\)/.test(HTML));
  ok('o motor antigo só gera conta fixa de escritório', /f\.ativo&&f\.tipo!=='pessoa'&&String\(f\.esc\|\|''\)\.trim\(\)\)/.test(HTML));
  ok('quem não é master tem "Minha remuneração" no menu', /t:'Minha remuneração',f:\(\)=>minhaRemAbrir\(\)/.test(HTML));
  ok('fechamento liga o ganho do painel ao cliente', /id="fc_ganho"/.test(HTML)&&/from\('crm_calls'\)\.update\(\{ficha_id:data\.projetoId/.test(HTML));}

grupo('Volta do Controle de Churns pergunta o combinado (Gabriel 30/09, SPAÇO VEÍCULOS)');
{
  const g=rodar(bloco('function lcVoltaPatch(','window.lcReativar='),
    {CH_SAIDA:'sai',CH_PERDA:'per',CH_ULTPG:'ult',CH_MOTIVO:'mot',CH_GESTOR:'chg',LC_MENS:'mens',LC_VENC:'venc',LC_INI:'ini',VERBA_SEM:'verba',LC_ID:'LC',LC_ATIVO:'ATIVO'},['lcVoltaPatch']);
  const t={valores:{sai:'2026-09-10',per:500,mot:'Financeiro',mens:500,venc:26,verba:150,outro:'x'}};
  const p=g.lcVoltaPatch(t,{comp:'2026-10',dia:1,valor:600,verba:''});
  ok('card volta pro Controle de Clientes em 4. EM MANUTENÇÃO', p.lista_id==='LC'&&p.status_id==='ATIVO'&&p.status==='fazendo'&&p.arquivada_em===null);
  ok('saída, perda e motivo do churn saem', !('sai' in p.valores)&&!('per' in p.valores)&&!('mot' in p.valores)&&p.valores.outro==='x');
  ok('mensalidade, vencimento e início vêm do popup', p.valores.mens===600&&p.valores.venc===1&&p.valores.ini==='2026-10-01');
  ok('verba em branco some do card', !('verba' in p.valores));
  ok('verba informada entra', g.lcVoltaPatch(t,{comp:'2026-10',dia:1,valor:600,verba:300}).valores.verba===300);
  ok('o card original não é mexido', t.valores.mens===500&&t.valores.sai==='2026-09-10');
  const r=bloco('window.lcReativar=','/* Desfaz o churn no cadastro financeiro.');
  ok('popup pede mês, vencimento, mensalidade, verba e o que vai ser entregue', ['rv_comp','rv_dia','rv_val','rv_verba','rv_cat'].every(id=>r.indexOf('id="'+id+'"')>0));
  ok('não volta sem dizer o que vai ser entregue', r.indexOf("if(!catN){ toast('Diga o que vai ser entregue.'); return false; }")>0);
  ok('o cadastro do Financeiro recebe mensalidade, vencimento e mês da volta', r.indexOf('cli.valor=valor; cli.diaVenc=dia;')>0&&r.indexOf('lcDesfazerChurnFin(cli,comp)')>0);
  ok('a ficha grava o tipo entregue', r.indexOf("f.status='ativo'; f.categoria=catN;")>0);
  ok('não usa mais o confirmar simples', r.indexOf("{sim:'Voltar para ativo'}")<0&&r.indexOf("bs.textContent='Voltar para ativo'")>0);
}

grupo('Recebimentos: copiar telefone e mensagem de cobrança com o link do Asaas (Gabriel 02/10)');
{
  const g=rodar(bloco('const rcSoDig=','async function rcAsaasCarregar('),{},['rcSoDig','rcNorm','rcPrimeiroNome','rcAsaasDe','rcMensagem']);
  ok('telefone vira só números, pra colar na busca do WhatsApp', g.rcSoDig('(11) 94158-7844')==='11941587844');
  ok('primeiro nome com inicial maiúscula', g.rcPrimeiroNome('NIVALDO SILVA')==='Nivaldo'&&g.rcPrimeiroNome('thiago')==='Thiago'&&g.rcPrimeiroNome('')==='');
  const cobs=[{customer:'cus_1',nome:'Loja Um Ltda',doc:'11222333000144',link:'https://www.asaas.com/i/aaa',venc:'2026-10-05',valor:800,status:'PENDING'},
    {customer:'cus_1',nome:'Loja Um Ltda',doc:'11222333000144',link:'https://www.asaas.com/i/velha',venc:'2026-09-05',valor:800,status:'OVERDUE'},
    {customer:'cus_2',nome:'G MOTORS VEICULOS',doc:'',link:'https://www.asaas.com/i/bbb',venc:'2026-10-10',valor:1500,status:'PENDING'},
    {customer:'cus_3',nome:'Outro',doc:'99888777000166',link:'https://www.asaas.com/i/ccc',venc:'2026-10-01',valor:600,status:'OVERDUE'}];
  ok('acha pelo id do Asaas e prefere a cobrança da competência da tela', g.rcAsaasDe({nome:'X',asaas:{customerId:'cus_1'}},'2026-10',cobs).link==='https://www.asaas.com/i/aaa');
  ok('sem cobrança na competência, pega a mais antiga em aberto', g.rcAsaasDe({nome:'X',asaas:{customerId:'cus_1'}},'2026-11',cobs).link==='https://www.asaas.com/i/velha');
  ok('sem id, acha pelo CNPJ do contrato', g.rcAsaasDe({nome:'SPAÇO VEÍCULOS',contrato:{cnpj:'99.888.777/0001-66'}},'2026-10',cobs).link==='https://www.asaas.com/i/ccc');
  ok('sem id nem CNPJ, acha pelo nome (ignora acento e caixa)', g.rcAsaasDe({nome:'G Motors'},'2026-10',cobs).link==='https://www.asaas.com/i/bbb');
  ok('cliente que não está no Asaas não ganha link de outro', g.rcAsaasDe({nome:'NEGOCICAR'},'2026-10',cobs)===null&&g.rcAsaasDe({nome:'AB'},'2026-10',cobs)===null);
  const par=[{customer:'cus_a',nome:'JR MOTORS ABC',doc:'',link:'https://www.asaas.com/i/abc',venc:'2026-10-05'},{customer:'cus_b',nome:'JR MOTORS',doc:'',link:'https://www.asaas.com/i/jr',venc:'2026-10-05'}];
  ok('nome parecido não casa: JR MOTORS VR não pega o boleto do JR MOTORS ABC nem do JR MOTORS', g.rcAsaasDe({nome:'JR MOTORS VR'},'2026-10',par)===null);
  const dup=[{customer:'cus_a',nome:'PRIME VEICULOS LTDA',doc:'',link:'https://www.asaas.com/i/1',venc:'2026-10-05'},{customer:'cus_b',nome:'Prime Automóveis',doc:'',link:'https://www.asaas.com/i/2',venc:'2026-10-05'}];
  ok('dois clientes do Asaas com o mesmo nome base: ambíguo, sem link', g.rcAsaasDe({nome:'PRIME VEÍCULOS'},'2026-10',dup)===null);
  const m=g.rcMensagem({nome:'G MOTORS',resp:'NIVALDO'},'2026-10',cobs);
  ok('mensagem padrão com o nome e o link do Asaas', m.txt==='Olá Nivaldo, tudo bem? Segue boleto referente aos serviços prestados.\n\nhttps://www.asaas.com/i/bbb');
  ok('sem link e sem nome a mensagem continua boa', g.rcMensagem({nome:'NEGOCICAR',resp:''},'2026-10',cobs).txt==='Olá, tudo bem? Segue boleto referente aos serviços prestados.');
  ok('conta de grupo usa o link de qualquer conta do grupo', g.rcMensagem({nome:'ALTOGIRO | A',resp:'Thiago'},'2026-10',cobs,[{nome:'ALTOGIRO | A'},{nome:'ALTOGIRO | B',asaas:{customerId:'cus_3'}}]).link==='https://www.asaas.com/i/ccc');
  ok('a célula de contato tem os dois botões: copiar mensagem e copiar número', HTML.indexOf('onclick="rcCopiarMsg(this.dataset.c,this.dataset.g)"')>0&&HTML.indexOf("onclick=\"rcCopiarTxt(this.dataset.t,'Número copiado.')\"")>0);
  ok('os links vêm da edge só de leitura, só pro master, e ficam 10 min em memória', HTML.indexOf("sb.functions.invoke('asaas-links',{body:{}})")>0&&HTML.indexOf("currentUser.role!=='master'||(RC_ASAAS.cobrancas&&Date.now()-RC_ASAAS.em<600000)")>0);
}

grupo('Cobranças do dia: tarefa pro master até marcar Cobrei (Gabriel 01/10)');
{
  const g=rodar(bloco('const CB_LISTA=','let CB_LOCK=false;'),{NC_PAGADOR:'u_bernardo'},['cbPlano','cbChave','CB_LISTA']);
  const CB='c2000000-0000-4000-8000-0000000000c1';
  const clientes=[{id:'a',nome:'SPAÇO VEÍCULOS',diaVenc:1,valor:600},{id:'b',nome:'G MOTORS',diaVenc:10,valor:1500},{id:'c',nome:'PAGOU',diaVenc:1,valor:900},{id:'d',nome:'JÁ COBREI',diaVenc:1,valor:700},{id:'e',nome:'CHURN',diaVenc:1,valor:500},{id:'f',nome:'ARQUIVADO',diaVenc:1,valor:500},{id:'g',nome:'CONCLUÍ A TAREFA',diaVenc:1,valor:800}];
  const recs={c:{status:'recebido',venc:'2026-10-01'},d:{status:null,venc:'2026-10-01',cobradoEm:'2026-10-01'},e:{status:'churn',venc:'2026-10-01'},g:{status:'areceber',venc:'2026-10-01'}};
  const R={byCli:recs,st:(c)=>recs[c.id]?(recs[c.id].status||'areceber'):'',val:(c)=>c.valor};
  const tarefas=[{id:'t_g',lista_id:CB,status:'feito',concluida_em:'2026-10-01T12:00:00Z',valores:{cobranca:'g|2026-10'}},{id:'t_c',lista_id:CB,status:'todo',valores:{cobranca:'c|2026-10'}},{id:'t_d',lista_id:CB,status:'todo',valores:{cobranca:'d|2026-10'}}];
  const P=g.cbPlano({hoje:'2026-10-01',comp:'2026-10',R,clientes,tarefas,cliArq:(c)=>c.id==='f',vencOf:(comp,d)=>comp+'-'+String(d).padStart(2,'0'),brl:(v)=>'R$ '+v});
  ok('cria tarefa só pra quem venceu até hoje e não foi cobrado nem pagou (Spaço, dia 1)', P.criar.length===1&&P.criar[0].chave==='a|2026-10'&&P.criar[0].prazo==='2026-10-01');
  ok('título diz quem, quanto e quando venceu, sem travessão', P.criar[0].titulo==='Cobrar SPAÇO VEÍCULOS: R$ 600, venceu 01/10');
  ok('quem vence dia 10 ainda não entra; churn e arquivado nunca', !P.criar.some(x=>['b','e','f'].includes(x.cliId)));
  ok('pagou ou marcou Cobrei: a tarefa aberta é concluída', P.concluir.sort().join()==='t_c,t_d');
  ok('concluiu a tarefa no Início: reflete como Cobrei no Recebimentos', P.cobrar.length===1&&P.cobrar[0].cliId==='g'&&P.cobrar[0].em==='2026-10-01');
  const P2=g.cbPlano({hoje:'2026-10-05',comp:'2026-10',R,clientes,tarefas:tarefas.concat([{id:'t_a',lista_id:CB,status:'todo',valores:{cobranca:'a|2026-10'}}]),cliArq:(c)=>c.id==='f',vencOf:(comp,d)=>comp+'-'+String(d).padStart(2,'0'),brl:(v)=>'R$ '+v});
  ok('tarefa já existente e ainda aberta não duplica; continua cobrando até ser concluída', !P2.criar.some(x=>x.cliId==='a')&&!P2.concluir.includes('t_a'));
  ok('a tarefa nasce pro Bernardo, na lista Cobranças, com prazo no vencimento e chave do cliente+mês', HTML.indexOf("insert({lista_id:CB_LISTA,titulo:x.titulo,status:'todo',status_id:CB_ABERTO,prioridade:'alta',prazo:x.prazo,\n        responsavel_id:CB_QUEM,responsaveis:[CB_QUEM],valores:{cobranca:x.chave}")>0&&HTML.indexOf("const CB_QUEM=NC_PAGADOR;")>0);
  ok('Recebimentos ganhou a coluna Cobrei com a caixa e a data', HTML.indexOf('<th title="Já mandei a cobrança pro cliente neste mês">Cobrei</th>')>0&&HTML.indexOf("onchange=\"rcCobrado('${r.id}',this.checked)\"")>0);
  ok('sincroniza ao entrar, ao mudar status no Recebimentos e ao concluir a tarefa', HTML.indexOf("setTimeout(()=>{ cbSincronizar(); },300);")>0&&HTML.indexOf("await saveDB(); rcVolta(); cbSincronizar();")>0&&HTML.indexOf("if(t&&t.lista_id===CB_LISTA&&('status' in patch)){ try{ cbSincronizar(); }catch(_){} }")>0);
}

grupo('Modo restrito: usuário de uma lista só (Gabriel 01/10, ADM TARAF)');
{
  const g=rodar(bloco('const rsLista=','/* esconde os atalhos que essa pessoa não tem'),{currentUser:{id:'u1',role:'membro',so_lista:'c2000000-0000-4000-8000-0000000000b1'},TK:{listas:[]},document:{body:{classList:{add(){}}},getElementById:()=>null},esc:s=>String(s),spNome:l=>l.nome},['rsLista','restrito']);
  ok('membro com so_lista é restrito', g.restrito()===true&&g.rsLista()==='c2000000-0000-4000-8000-0000000000b1');
  g.currentUser.role='master'; ok('master nunca é restrito, mesmo com a lista marcada', g.restrito()===false);
  g.currentUser.role='membro'; g.currentUser.so_lista=''; ok('sem so_lista é acesso normal', g.restrito()===false);
  ok('toda tela fora da lista volta pra lista', HTML.indexOf("if(restrito()&&view!=='lista'){ if(TK.listaSel!==rsLista()) return spSelLista(rsLista()); view='lista'; }")>0);
  ok('trocar de lista cai sempre na lista dela', HTML.indexOf("if(restrito()&&id!==rsLista()) id=rsLista();")>0);
  ok('busca global não abre', HTML.indexOf("window.gsAbrir=(q)=>{\n  if(restrito()) return;")>0);
  ok('no login: barra só com a lista e abre nela, sem foto obrigatória', HTML.indexOf("if(restrito()){ rsAplicar(); spSelLista(rsLista()); NAV_PRONTO=true; return; }")>0);
  ok('CSS esconde barra lateral, busca e todos os atalhos menos o da lista', HTML.indexOf("body.restrito .sidebar,body.restrito .tb-esp,body.restrito .tb-busca,body.restrito #railbar .rl{display:none!important}")>0&&HTML.indexOf("body.restrito #railbar .rl.rs-ok{display:flex!important}")>0);
  ok('Usuários: master marca "Modo restrito: só usa esta lista" e a pessoa vira membro da lista', HTML.indexOf("Modo restrito: só usa esta lista")>0&&HTML.indexOf("if(campo==='so_lista'&&v){")>0&&HTML.indexOf("insert({tipo:'lista',no_id:v,user_id:uid,permissao:'editar'")>0);
  ok('menu do avatar sem Arquivados e sem remuneração no restrito', HTML.indexOf("...(restrito()?[]:[{ic:MICO.arq,t:'Arquivados'")>0);
}

grupo('Sigilo da mensalidade: gestor vê só a variável dele (Gabriel 01/10)');
{
  const fichas={m:{id:'m',nome:'MULTIKAP TAPETES',gerente:'Luan Santiago',responsavel:'Luan Santiago'},g:{id:'g',nome:'G MOTORS',gerente:'Luiz',responsavel:'Luan Santiago'},d:{id:'d',nome:'DL REPASSE',gerente:'João',responsavel:'Yghor'}};
  const ctx={LC_ID:'LC',LC_MENS:'mens',LC_SO_GERENCIA:['mens','remger'],LC_REM_GESTOR:'remg',LC_SOCIAL:'soc',LC_REM_SOCIAL:'remsoc',LC_GER_COL:'__g',LC_GEST:'gest',LC_INI:'ini',
    fichaDe:(id)=>fichas[id]||null,primNome:(x)=>String(x||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().split(/\s+/)[0].toLowerCase(),
    ehLC:(l)=>l==='LC',souGerente:()=>!!(ctx.currentUser&&(ctx.currentUser.role==='master'||ctx.currentUser.gerente)),
    souGestorDaFicha:(fid)=>{ const f=fichas[fid]; return !!(f&&ctx.primNome(f.responsavel)===ctx.primNome(ctx.currentUser.nome)); },
    currentUser:{id:'u_luan',nome:'Luan Santiago',role:'membro',gerente:false}};
  const g=rodar(bloco('const lcVeDinheiro=','const podeMexerCampo='),ctx,['lcVeDinheiro','gerenteDaFichaNome','lcVisivelProGestor']);
  ok('Luan não vê dinheiro (mensalidade, 10% dos outros): não é master nem gerente de carteira', g.lcVeDinheiro()===false);
  ok('Luan é gerente da MULTIKAP pelo nome, mesmo sem a flag', g.gerenteDaFichaNome('m')===true&&g.gerenteDaFichaNome('g')===false);
  ok('Luan vê os cards onde é gestor ou gerente, e não os outros', g.lcVisivelProGestor({lista_id:'LC',ficha_id:'m'})&&g.lcVisivelProGestor({lista_id:'LC',ficha_id:'g'})&&!g.lcVisivelProGestor({lista_id:'LC',ficha_id:'d'}));
  g.currentUser.nome='Luiz'; g.currentUser.gerente=true; ctx.currentUser=g.currentUser;
  ok('Luiz (gerente de carteira) vê a mensalidade', g.lcVeDinheiro()===true);
  const cel=bloco('const tkCelula=(t,c)=>{',"  if(c.id===LC_GER_COL){");
  ok('célula da mensalidade vira "-" pra quem não vê dinheiro', cel.indexOf("if(c.id===LC_MENS&&ehLC(t.lista_id)&&!lcVeDinheiro())")>0);
  ok('célula dos 10% do gerente só aparece pro gerente daquele cliente', cel.indexOf("if(c.id===LC_SO_GERENCIA[1]&&ehLC(t.lista_id)&&!lcVeDinheiro()&&!gerenteDaFichaNome(t.ficha_id))")>0);
  const cols=bloco("  if(lc){ const souGerDeAlgum=","  let grupos=tkGrupos();");
  ok('a coluna Mensalidade nunca entra pra quem não vê dinheiro; Rem. Gerente entra se ele é gerente de algum cliente', cols.indexOf("lcVeDinheiro()||LC_SO_GERENCIA.indexOf(c.id)<0||(c.id===LC_SO_GERENCIA[1]&&souGerDeAlgum)")>0);
  const res=bloco("    const tkm=(comV.length&&lcVeDinheiro())","porGest=tkm+linhaRem");
  ok('ticket médio (média da mensalidade) só pra quem vê dinheiro', res.length>0);
  ok('resumo por gerente usa o gerente pelo nome (Luan vê os 10% dele na MULTIKAP)', HTML.indexOf("if(mst||gerenteDaFichaNome(t.ficha_id)) poeEm(G,f.gerente")>0);
  ok('resumo do grupo esconde mensalidade somada de quem não vê dinheiro', HTML.indexOf("${lcVeDinheiro()?`<span>mensalidade somada")>0);
  ok('o card do cliente só mostra mensalidade pra master ou gerente de carteira', HTML.indexOf("const pcMensPode=(pid)=>!!(currentUser&&currentUser.role==='master')||souGerenteDaFicha(pid);")>0);
}

grupo('Início do cliente pede aprovação do master (Gabriel 30/09)');
{
  const avisos=[];
  const ctx={LC_INI:'ini',LC_MENS:'mens',ehLC:(l)=>l==='LC',fichaDe:(id)=>id==='f1'?{id:'f1',nome:'MIGUEL VEÍCULOS'}:null,
    tkNomeUser:(id)=>id==='u_luan'?'Luan Santiago':'',fmtDate:(s)=>s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4),brl:(v)=>'R$ '+Number(v).toFixed(2),
    esc:(s)=>String(s),hojeISO:()=>'2026-09-30',ntfCriar:(rows)=>{ avisos.push(...rows); },
    TK:{equipe:[{id:'u_gab',nome:'Gabriel',role:'master'},{id:'u_robo',nome:'Claude (robô)',role:'master'},{id:'u_luan',nome:'Luan Santiago',role:'membro'},{id:'u_joao',nome:'João',role:'membro'}]},
    currentUser:{id:'u_luan',role:'membro'}};
  const g=rodar(bloco('function lcProRata(','window.lcIniAprovar='),ctx,['lcProRata','lcIniPendente','lcIniEtiqueta','lcIniAvisar']);
  const p=g.lcProRata('2026-09-11',1500);
  ok('pro rata conta os dias que faltam no mês, inclusive o do início', p.dias===20&&p.dim===30&&p.valor===1000);
  ok('início no dia 1 é mês cheio', g.lcProRata('2026-10-01',1500).valor===1500);
  ok('fevereiro usa 28 dias', g.lcProRata('2026-02-15',2800).valor===1400);
  ok('data em branco não quebra', g.lcProRata('',900).valor===900);
  g.lcIniAvisar({lista_id:'LC',ficha_id:'f1',id:'t1',valores:{ini:'2026-09-11'}},'');
  ok('gestor definiu o Início: cada master recebe o pedido, menos o robô', avisos.length===1&&avisos[0].para==='u_gab');
  ok('o aviso diz quem definiu, a data e pede a aprovação', /Luan Santiago definiu o início em 11\/09\/2026/.test(avisos[0].texto)&&avisos[0].titulo==='Início de MIGUEL VEÍCULOS: aprovar o pro rata');
  ok('o pedido guarda tipo, data, autor e fica pendente', avisos[0].dados.tipo==='inicio'&&avisos[0].dados.ini==='2026-09-11'&&avisos[0].dados.por==='u_luan'&&avisos[0].dados.status==='pendente'&&avisos[0].ficha_id==='f1'&&avisos[0].tarefa_id==='t1');
  avisos.length=0;
  g.lcIniAvisar({lista_id:'LC',ficha_id:'f1',id:'t1',valores:{ini:'2026-09-11'}},'2026-09-11');
  ok('mexer em outra coluna sem mudar o Início não avisa', avisos.length===0);
  g.lcIniAvisar({lista_id:'OUTRA',ficha_id:'f1',id:'t1',valores:{ini:'2026-09-11'}},'');
  ok('fora do Controle de Clientes não avisa', avisos.length===0);
  g.currentUser={id:'u_gab',role:'master'};
  g.lcIniAvisar({lista_id:'LC',ficha_id:'f1',id:'t1',valores:{ini:'2026-09-11'}},'');
  ok('master definindo o Início não pede aprovação de ninguém', avisos.length===0);
  ok('pendente só abre a aprovação pro master', g.lcIniPendente({dados:{tipo:'inicio',status:'pendente'}})===true);
  g.currentUser={id:'u_luan',role:'membro'};
  ok('quem não é master não vê a aprovação', g.lcIniPendente({dados:{tipo:'inicio',status:'pendente'}})===false);
  ok('etiqueta: aguardando, aprovado com valor, recusado', g.lcIniEtiqueta({dados:{tipo:'inicio',status:'pendente'}}).indexOf('Aguardando sua aprovação')>0
    &&g.lcIniEtiqueta({dados:{tipo:'inicio',status:'aprovado',valor:1000}}).indexOf('Aprovado · R$ 1000.00')>0
    &&g.lcIniEtiqueta({dados:{tipo:'inicio',status:'recusado'}}).indexOf('tag churn')>0&&g.lcIniEtiqueta({})==='');
  const a=bloco('window.lcIniAprovar=','window.lcReativar=');
  ok('o master pode mudar o valor do pro rata ao aprovar', a.indexOf('id="ia_val"')>0&&a.indexOf("bs.textContent='Aprovar'")>0);
  ok('aprovar grava a cobrança do mês de entrada em Recebimentos', a.indexOf('DB.recebimentos.push(r)')>0&&a.indexOf('else if(!r.recebido) r.valor=valor;')>0);
  ok('recusar tira a data do card e avisa o gestor', a.indexOf('delete val[LC_INI]')>0&&a.indexOf("'Início de '+nome+' recusado'")>0);
  ok('o gestor recebe a resposta da aprovação', a.indexOf("'Início de '+nome+' aprovado'")>0);
  const tp=bloco('async function tkPatch(','/* ======================= TAREFAS RECORRENTES');
  ok('toda gravação de valores do card passa pelo aviso', tp.indexOf('lcIniAvisar(t,iniAntes)')>0&&tp.indexOf('iniAntes=t0?String(((t0.valores||{})[LC_INI])||\'\')')>0);
  const nt=bloco('window.ntfAbrir=','window.ntfTodasLidas=');
  ok('abrir o pedido pendente abre a aprovação, sem marcar como lido', nt.indexOf('if(lcIniPendente(n)){ lcIniAprovar(n); return; }')>0&&nt.indexOf('if(lcIniPendente(n))')<nt.indexOf("update({lida_em"));
}

grupo('Fechamento: o que ainda vai entrar é previsão do melhor cenário do mês (Gabriel 30/09)');
{
  const g=rodar(bloco('function fchPrevisao(','function fchPendentesHtml('),{},['fchPrevisao']);
  const linhas=[
    {ficha:'f_g',cliente:'G MOTORS',papel:'gerente',pessoa:'Luiz',cheio:150,situacao:'areceber'},
    {ficha:'f_g',cliente:'G MOTORS',papel:'gestor',pessoa:'Luan Santiago',cheio:100,situacao:'areceber'},
    {ficha:'f_s',cliente:'SABARÁ | SÉRGIO',papel:'gerente',pessoa:'Luiz',cheio:37.33,situacao:'areceber'},
    {ficha:'f_s',cliente:'SABARÁ | SÉRGIO',papel:'gestor',pessoa:'Luan Santiago',cheio:46.67,situacao:'areceber'},
    {ficha:'f_d',cliente:'DL REPASSE',papel:'gerente',pessoa:'João',cheio:100,situacao:'inadimplente'},
    {ficha:'f_d',cliente:'DL REPASSE',papel:'gestor',pessoa:'Yghor',cheio:100,situacao:'inadimplente'},
    {ficha:'f_b',cliente:'BLESSED',papel:'venda',pessoa:'Kennedy',cheio:75,situacao:'vinculada'},
    {ficha:null,papel:'fixo',pessoa:'Arthur',cheio:3800}];
  const o={comp:'2026-09',hoje:'2026-09-30',COMISSAO:['Luiz','João'],
    projetos:[{id:'f_g',clienteId:'g'},{id:'f_s',clienteId:'s'},{id:'f_d',clienteId:'d'},{id:'f_x',clienteId:'x'},{id:'f_j',clienteId:'j'}],
    gerCli:{g:'Luiz',s:'Luiz',d:'João',x:'João',j:'João'},
    rcb:[{id:'r1',clienteId:'g',nome:'G MOTORS',valor:1500,venc:'2026-09-10',recebido:false,status:null},
         {id:'r2',clienteId:'s',nome:'SABARÁ | SÉRGIO',valor:373.33,venc:'2026-10-05',recebido:false,status:'areceber'},
         {id:'r3',clienteId:'d',nome:'DL REPASSE',valor:1000,venc:'2026-09-05',recebido:false,status:'inadimplente'},
         {id:'r4',clienteId:'x',nome:'SÓ PRIME',valor:1500,venc:'2026-09-14',recebido:false,status:'churn'},
         {id:'r5',clienteId:'j',nome:'JÁ PAGOU',valor:900,venc:'2026-09-01',recebido:true,status:'recebido'},
         {id:'r6',clienteId:'j',nome:'SINAL',valor:800,sinal:300,venc:'2026-09-20',recebido:false,status:'sinal'}],
    rid:{},aReceber:[],desp:[],financeiro:[{id:'z1',tipo:'recebivel',descricao:'Adiantamento Fulano',valor:200,comp:'2026-09'},{id:'z2',tipo:'recebivel',descricao:'Velho',valor:999,comp:'2026-07'}],linhas};
  const P=g.fchPrevisao(o);
  ok('entra quem ainda pode pagar no mês: a receber, inadimplente, atrasado e o resto do sinal', P.A.map(p=>p.nome).sort().join('|')==='DL REPASSE|G MOTORS|SABARÁ | SÉRGIO|SINAL');
  ok('churn e quem já pagou ficam fora', !P.A.some(p=>/PRIME|PAGOU/.test(p.nome)));
  ok('o resto do sinal é o que falta', P.A.find(p=>p.nome==='SINAL').v===500);
  ok('total do melhor cenário', Math.abs(P.TA-(1500+373.33+1000+500))<0.01);
  ok('quem é pago por conta paga sai primeiro, pelas linhas da Folha com pro rata', Math.abs(P.pessoas['Luiz'].v-187.33)<0.01&&Math.abs(P.pessoas['Luan Santiago'].v-146.67)<0.01&&P.pessoas['João'].v===100&&P.pessoas['Yghor'].v===100);
  ok('comissão de venda e fixo não entram na conta', !P.pessoas['Kennedy']&&!P.pessoas['Arthur']);
  const gm=P.A.find(p=>p.nome==='G MOTORS');
  ok('G MOTORS: 1.500 − 250 = 1.250 de lucro novo → 250 caixa, 125 Arthur, 291,67 cada sócio', gm.its.find(i=>i[0]==='Caixa da empresa')[2]===250&&gm.its.find(i=>i[0]==='Arthur')[2]===125&&gm.its.find(i=>i[0]==='Gabriel')[2]===291.67);
  ok('vencida e não paga diz que venceu', /venceu dia 10\/09/.test(gm.quando)&&/vence 05\/10/.test(P.A.find(p=>p.nome==='SABARÁ | SÉRGIO').quando));
  ok('cliente sem linha na Folha (gerente sócio, por exemplo) não paga ninguém por conta', P.A.find(p=>p.nome==='SINAL').its[0][0]==='Caixa da empresa'&&P.A.find(p=>p.nome==='SINAL').its[0][2]===100);
  ok('recebível fora do caixa aparece de qualquer mês até voltar, com a competência na linha (Samuel jul/ago)', P.B.length===2&&P.B[0].nome==='Velho'&&/competência 07\/2026/.test(P.B[0].quando)&&P.B[1].nome==='Adiantamento Fulano'&&P.TB===1199);
  ok('caixa + Arthur + 3 sócios batem com o lucro novo', Math.abs((P.TX+P.TAR+P.TS*3)-(P.TA-P.TC))<0.05);
  const P2=g.fchPrevisao(Object.assign({},o,{linhas:null}));
  ok('sem as linhas da Folha (mês antigo) vale só o gerente de 10%', Math.abs(P2.pessoas['Luiz'].v-187.33)<0.01&&!P2.pessoas['Luan Santiago']);
  const html=bloco("function fchPendentesHtml(comp){","function renderFechamentoMes(c){");
  ok('a tela não fala mais de atraso de meses anteriores', html.indexOf('meses anteriores')<0&&html.indexOf('Melhor cenário')>0);
  ok('Fechamento e Recebimentos usam a mesma função', (HTML.match(/fchPendentesHtml\(comp\)/g)||[]).length>=2);
  ok('a filosofia continua: nada disso entrou no rateio, o destino na volta não é o mesmo para todos', html.indexOf('Dinheiro da empresa que está na mão de terceiro')>0&&html.indexOf('não é o mesmo para todos')>0);
}

grupo('Fechamento: upsell e downsell entram pela diferença (Gabriel 30/09)');
{
  const DB={projetos:[{id:'p1',clienteId:'a1',nome:'ALTOGIRO | MOISÉS',grupo:'ALTOGIRO',gerente:'Luiz'},{id:'p2',clienteId:'s1',nome:'SABARÁ | SÉRGIO',gerente:'Luiz'},
    {id:'p3',clienteId:'n1',nome:'NOVO CLIENTE',gerente:'João'},{id:'p4',clienteId:'j1',nome:'JR MOTORS VR',gerente:'João'}],
    clientes:[{id:'a1',valor:800},{id:'s1',valor:800},{id:'n1',valor:1500},{id:'j1',valor:900}],
    recebimentos:[{comp:'2026-09',clienteId:'s1',valor:373.33},{comp:'2026-09',clienteId:'j1',valor:0},{comp:'2026-08',clienteId:'s1',valor:800}]};
  const g=rodar(bloco('let FCH_MUD=','function renderFechamentoMes('),{DB,MAIUS:s=>String(s||'').toUpperCase(),fchN:v=>Number(v)||0,brl:v=>'R$ '+v,
    grupoDe:f=>{ const gr=String((f&&f.grupo)||'').trim(); if(gr) return gr.toUpperCase(); const m=String((f&&f.nome)||'').split(/\s+[|\u2502]\s+/); return m.length>1?m[0].trim().toUpperCase():''; }},
    ['fchMudResumo','fchMudGrupos']);
  const rows=[{cliente_id:'grupo:ALTOGIRO+SABARÁ',cliente_nome:'ALTOGIRO + SABARÁ',tipo:'upsell',valor_antes:1000,valor_novo:1600,aplicado_em:'2026-09-30T12:00:00Z'},
    {cliente_id:'j1',cliente_nome:'JR MOTORS VR',tipo:'downsell',valor_antes:900,valor_novo:0,aplicado_em:'2026-09-23T12:00:00Z'},
    {cliente_id:'x',cliente_nome:'OUTRO MÊS',tipo:'upsell',valor_antes:1,valor_novo:2,aplicado_em:'2026-08-02T12:00:00Z'}];
  const novos=[{id:'a1',valor:800},{id:'s1',valor:800},{id:'n1',valor:1500}];
  const M=g.fchMudResumo(rows,'2026-09',novos,{j1:'João'});
  ok('upsell entra pela diferença do que foi COBRADO no mês (pro rata do Sérgio), no gerente do grupo', Math.abs(M.entUp-173.33)<0.01&&Math.abs(M.entGer.Luiz-173.33)<0.01&&M.ups.length===1);
  ok('em outro mês, sem pro rata, vale o recorrente', Math.abs(g.fchMudResumo([Object.assign({},rows[0],{aplicado_em:'2026-10-05T12:00:00Z'})],'2026-10',[],{}).entUp-600)<0.01);
  ok('contas novas do grupo em upsell não viram cliente novo; as outras continuam', M.novos.length===1&&M.novos[0].id==='n1');
  ok('downsell entra como saída pela diferença, no gerente do cliente', M.saiDown===900&&M.saiGer['João']===900);
  ok('mudança de outro mês fica fora', M.ups.every(m=>m.cliente_nome!=='OUTRO MÊS'));
  ok('grupo:A+B vira lista de grupos', g.fchMudGrupos({cliente_id:'grupo:ALTOGIRO+SABARÁ'}).join(',')==='ALTOGIRO,SABARÁ'&&g.fchMudGrupos({cliente_id:'cli_1'}).length===0);
  ok('linha do bloco diz de quanto para quanto e avisa o pro rata do mês', M.linha(M.ups[0])[1]==='de R$ 1000 para R$ 1600 · neste mês R$ 1173.33 (pro rata)'&&Math.abs(M.linha(M.ups[0])[2]-173.33)<0.01);
  ok('saldo do mês soma upsell e downsell', /const SAIU=somaSt\('churn'\)\+somaSt\('churnpago'\)\+M\.saiDown;/.test(HTML)&&/const ENT=novos\.reduce\(\(s,x\)=>s\+fchN\(x\.valor\),0\)\+M\.entUp;/.test(HTML));}

grupo('Gastos de escritório em blocos por escritório (Gabriel 30/09)');
{
  const r=bloco('function fdEscritorios(comp){','window.fdEscFixos=()=>{');
  ok('um bloco por escritório, no mesmo componente do Fechamento', r.indexOf('<details class="fch-g"')>0&&r.indexOf('Escritório ${esc(e)}')>0);
  ok('bloco diz quantas contas estão pagas e o total', r.indexOf('${pagas} de ${ps.length} pagas')>0&&r.indexOf('<span class="fch-tv">${brl(tot)}</span>')>0);
  ok('do escritório que mais gasta pro que menos', r.indexOf("fdSoma(por[b],'valor')-fdSoma(por[a],'valor')")>0);
  ok('as contas com Pagar, Editar, Excluir e o preencher da conta variável continuam dentro', ['fpPagar','fpDesfazer','openFpModal','fpExcluir','preencher'].every(k=>r.indexOf(k)>0));
  ok('aberto ou fechado fica lembrado ao redesenhar', r.indexOf("fdEscAbre('${esc(e)}',this.open)")>0&&HTML.indexOf('window.fdEscAbre=(e,ab)=>{ fdEscAberto[e]=!!ab; };')>0);
  ok('Lançamentos: escritório vira sub-bloco dentro do departamento', /const lancSub=[\s\S]{0,400}return e\?'Escritório '\+e:''/.test(HTML));
  const g=rodar(bloco('const FCH_ESC=','const FCH_SETOR=')+bloco('const ehMetaAds=','function lancAgrupar('),null,['lancSub']);
  ok('aluguel de Volta Redonda cai no sub-bloco do escritório', g.lancSub({tipo:'despesa',categoria:'Escritórios',descricao:'Aluguel, Escritório Volta Redonda'})==='Escritório Volta Redonda');
  ok('conta de escritório sem o nome do imóvel fica solta', g.lancSub({tipo:'despesa',categoria:'Escritórios',descricao:'Internet'})==='');
  ok('a folha não vira escritório', g.lancSub({tipo:'despesa',categoria:'Sócios',descricao:'Folha: Bernardo, Head'})==='Folha de pagamento');
}

grupo('Controle de Clientes: Pagamento, Início e Vencimento centralizados como as colunas de pessoa (Gabriel 30/09)');
{
  ok('as três colunas curtas ganham tk-cen junto com pessoa', /\(c\.tipo==='pessoa'\|\|\(lc&&\[LC_SIT,LC_INI,LC_VENC\]\.indexOf\(c\.id\)>=0\)\)\?'tk-cen':''/.test(HTML));
  ok('data e trava centralizam dentro da célula', HTML.indexOf('.tk-tab td.tk-cen input.tk-cel{text-align:center}')>0&&HTML.indexOf('.tk-tab td.tk-cen .tk-trava{display:flex}')>0);
}

grupo('Downsell e upsell registrados na hora da mudança (Gabriel 30/09, JOTA\'S CAR)');
{
  const ins=[]; let modais=0;
  const ctx={CAT_LABEL:{trafego:'Tráfego Pago',ia:'Agent IA',full:'Tráfego + Agent IA',outro:'Outro'},brl:v=>'R$ '+v,esc:s=>String(s??''),
    fmtComp:c=>c.split('-').reverse().join('/'),compNow:()=>'2026-09',toast:()=>{},currentUser:{id:'u1'},LC_GEST:'gest',lcCardDe:()=>null,
    modal:(ti,b,onSave)=>{ modais++; setTimeout(()=>onSave(),0); },$:(s)=>({'#md_tipo':{value:'valor'},'#md_mot':{value:'cliente pediu desconto'},'#md_cat':{value:''}}[s]||null),document:{querySelectorAll:()=>[]},
    sb:{from:(tb)=>({insert:async (o)=>{ ins.push([tb,o]); return {error:null}; },update:()=>({eq:async()=>({error:null})})})}};
  const g=rodar(bloco('/* DOWNSELL E UPSELL NA HORA DA MUDANÇA','window.tkSetVal='),ctx,['lcMudRegistrar','lcMudAntesDeMudar','lcMudAplicarServico']);
  const f={id:'p1',clienteId:'c1',nome:'JOTA',categoria:'full',responsavel:'Yghor'};
  const run=async ()=>{
    const r1=await g.lcMudAntesDeMudar(f,{id:'c1'},'JOTA',1000,1500,'rec');
    ok('mensalidade subiu: registra upsell sem perguntar', modais===0&&ins.length===1&&ins[0][0]==='mrr_mudancas'&&ins[0][1].tipo==='upsell'&&ins[0][1].valor_antes===1000&&ins[0][1].valor_novo===1500&&ins[0][1].status==='aplicado'&&r1&&!r1.cat);
    const r2=await g.lcMudAntesDeMudar(f,{id:'c1'},'JOTA',1000,1000,'rec');
    ok('valor igual: nada a registrar', ins.length===1&&r2&&Object.keys(r2).length===0);
    vm.runInContext("LC_MUD_CTX={tipo:'servico',motivo:'cortou o tráfego',cat:'ia',servico:'Serviço: Tráfego + Agent IA para Agent IA'}",g);
    const r3=await g.lcMudAntesDeMudar(f,{id:'c1'},'JOTA',1500,1000,'rec');
    ok('mudança de serviço já respondida: não pergunta de novo e registra downsell com o serviço', modais===0&&ins.length===2&&ins[1][1].tipo==='downsell'&&ins[1][1].motivo==='Serviço: Tráfego + Agent IA para Agent IA · cortou o tráfego'&&r3.cat==='ia');
    ok('o contexto é consumido uma vez só', vm.runInContext('LC_MUD_CTX',g)===null);
    const r4=await g.lcMudAntesDeMudar(f,{id:'c1'},'JOTA',1500,1000,'rec');
    ok('mensalidade caiu sem contexto: abre a pergunta e registra o motivo', modais===1&&r4.motivo==='cliente pediu desconto'&&ins[ins.length-1][1].tipo==='downsell'&&ins[ins.length-1][1].motivo==='cliente pediu desconto');
    await g.lcMudAplicarServico(f,'ia');
    ok('ficar só com Agent IA tira o gestor de tráfego da ficha', f.categoria==='ia'&&f.responsavel==='');
    ok('só em um mês fica anotado no motivo', (await g.lcMudRegistrar({clienteId:'c1',nome:'X',antes:900,novo:800,motivo:'desconto',modo:'mes'}), ins[ins.length-1][1].motivo==='desconto · Só em 09/2026'));
  };
  const r=bloco("window.pcTipoSet=async (pid,k)=>{","it.categoria=k;");
  ok('reduzir o serviço na ficha pergunta a mensalidade que fica e registra downsell', r.indexOf("it.categoria==='full'&&(k==='ia'||k==='trafego')")>0&&r.indexOf("bs.textContent='Registrar downsell'")>0&&r.indexOf('LC_MUD_CTX={tipo:')>0);
  const tk=bloco('window.tkSetVal=async (id,campoId,v)=>{','/* ======================= LEMBRETES');
  ok('os dois caminhos da mensalidade (gerente e master) passam pela pergunta', (tk.match(/await lcMudAntesDeMudar\(/g)||[]).length===2);
  PROMESSAS.push(run());
}

grupo('Fechamento: folha por departamento e custo por setor (Gabriel 30/09)');
{
  const r=bloco('function renderFechamentoMes(c){','/* ======================= CONTRATOS');
  ok('a folha do fechamento agrupa pelo departamento da provisão, não pela função', /if\(!rat\)\{ const d=fdDpRec\(x\); \(porSet\[d\]=porSet\[d\]\|\|\[\]\)\.push\(x\); return; \}/.test(r)&&r.indexOf("Folha de pagamento por departamento: ${brl(TFOLHA)}")>0&&r.indexOf("FD_DEPS.concat(['Outros']).filter(s=>porSet[s])")>0);
  /* Gabriel 01/10: "tem que dividir os gerentes entre tecnologia e marketing" */
  ok('gerente é repartido entre Marketing e Tecnologia na proporção do 10% dele', /fdResumo\(fdPessoas\(\),FD\.linhas\)\.forEach/.test(r)&&/fdRateio\[primNome\(r\.p\.nome\)\]=ds\.map\(d=>\[d,r\.dps\[d\]\.ganho\/t\]\)/.test(r)&&/valor:fdR2\(fchN\(x\.valor\)\*f\),parte:/.test(r));
  ok('a linha repartida diz quanto foi pra cada departamento', r.split("(x.parte?' · '+x.parte:'')").length===3);
  ok('registro antigo cai no departamento da pessoa e a divisão do lucro fica fora', /x\.dp\|\|\(\(DB\.folhaFixos\|\|\[\]\)\.find\(f=>f\.id===x\.fixoId\)\|\|\{\}\)\.dp/.test(r)&&r.indexOf('!x.lucro&&!/aluguel|maria zilda/i')>0);
  ok('Custo por departamento é bloco clicável por setor, somando gente e outros gastos', r.indexOf("'<h2 style=\"margin-top:18px\">Custo por departamento: '")>0&&/lin\.map\(r=>fchBloco\(r\.d, r\.tot,/.test(r)&&/tot:r\.folha\+r\.oper/.test(r));
}

grupo('Padrão de tabela: título centralizado e linha entre as linhas (Gabriel 30/09)');
{
  ok('todo título de coluna centralizado, o primeiro à esquerda', /\n  th\{text-align:center\}\n  th:first-child\{text-align:left\}/.test(HTML));
  ok('nenhum título forçado à direita na mão', HTML.indexOf('<th style="text-align:right">')<0&&HTML.indexOf("style=\"text-align:right\"':''}>${t}</th>")<0);
  ok('coluna de dinheiro: número à direita, título centralizado', HTML.indexOf('.tk-tab td.tk-num{text-align:right}')>0&&HTML.indexOf('.tk-tab th.tk-num,.tk-tab td.tk-num{text-align:right}')<0);
  ok('linha horizontal entre as linhas em toda tabela', /th,td\{text-align:left;padding:13px 16px;font-size:13\.5px;border-bottom:1px solid var\(--line\)\}/.test(HTML)&&HTML.indexOf('.fchdoc .tablewrap td{padding:8px 0;border-bottom:1px solid #3a2670')>0);
}

grupo('Fechamento: clicar no escritório abre o que foi gasto (Gabriel 30/09)');
{
  const g=rodar(bloco('function fchTipoEsc(','const FCH_SETOR='),{fchN:v=>Number(v)||0,brl:v=>'R$ '+v,esc:s=>String(s??''),fchDT:(s)=>s?String(s).slice(0,10).split('-').reverse().join('/'):'-',window:{}},['fchKpiEsc','fchParcelaTxt','fchEscItem']);
  ok('parcela 3/10 vira "parcela 3 de 10, faltam 7"', g.fchParcelaTxt('Mercado Livre (parcela 3/10)')==='parcela 3 de 10, faltam 7'&&g.fchParcelaTxt('Cadeira (parcela 10/10)')==='última parcela (10 de 10)'&&g.fchParcelaTxt('Internet')==='');
  const h=g.fchKpiEsc({'Volta Redonda':[{descricao:'Aluguel, Escritório Volta Redonda',valor:1300,data:'2026-09-01',pagoEm:'2026-09-02'},{descricao:'Cartão Nubank: Mercado*Mercadolivre (parcela 3/10), Escritório Volta Redonda',valor:120,data:'2026-09-28'},{descricao:'Internet Nio Fibra, Escritório Volta Redonda (cartão)',valor:99,data:'2026-09-07'}],'Itajubá':[{descricao:'Aluguel, Escritório Itajubá',valor:775,data:'2026-09-01'}]},10000);
  ok('o nome do escritório é um botão que abre o detalhe', (h.match(/class="rc-gr-b" aria-expanded="false" data-k=/g)||[]).length===2&&h.indexOf('onclick="fchEscAbre(this)"')>0);
  ok('o detalhe é uma linha só por escritório, escondida, com uma tabela própria dentro', (h.match(/class="fch-esc-d" data-k="Volta_Redonda" hidden><td colspan="7"><table class="fch-esc-det"><thead>/g)||[]).length===1);
  ok('colunas alinhadas: Gasto, Tipo, Dia, Meio, Pagamento, Parcela, Valor', h.indexOf('<th>Gasto</th><th>Tipo</th><th>Dia</th><th>Meio</th><th>Pagamento</th><th>Parcela</th><th>Valor</th>')>0);
  ok('cada gasto: nome limpo, tipo em etiqueta, dia, meio, pago ou a pagar, parcela e valor', /<td class="fch-esc-n">Mercado Livre<\/td><td><span class="fch-esc-t compras">Compras e serviços<\/span><\/td><td>28\/09<\/td><td>cartão<\/td><td><em>a pagar<\/em><\/td><td>parcela 3 de 10, faltam 7<small>faltam R\$ 840<\/small><\/td><td class="money">R\$ 120<\/td>/.test(h));
  ok('a internet diz que veio no cartão e não repete o escritório', /<td class="fch-esc-n">Internet Nio Fibra<\/td><td><span class="fch-esc-t contas">Contas<\/span><\/td><td>07\/09<\/td><td>cartão<\/td>/.test(h)&&h.indexOf('Escritório Volta Redonda</td>')<0);
  ok('pago mostra o dia do pagamento; ordem aluguel, contas, compras', h.indexOf('pago 02/09')>0&&h.indexOf('fch-esc-t aluguel')<h.indexOf('fch-esc-t contas')&&h.indexOf('fch-esc-t contas')<h.indexOf('fch-esc-t compras'));
  const it=g.fchEscItem({descricao:'Água, luz e despesas — Escritório SJRP, Água de setembro: 1/4 da conta [Escritório São José do Rio Preto]'});
  ok('descrição crua vira nome + detalhe sem o escritório e sem o colchete', it.nome==='Água, luz e despesas'&&it.det==='Água de setembro: 1/4 da conta'&&it.meio==='');
  const it2=g.fchEscItem({descricao:'Pix: Faxina, Escritório Volta Redonda (Tainara)'});
  ok('Pix vira meio e o resto fica como detalhe', it2.meio==='Pix'&&it2.nome==='Faxina'&&it2.det==='(Tainara)');
  ok('o valor nunca quebra em duas linhas', HTML.indexOf('.fchdoc .tablewrap td.money{white-space:nowrap}')>0);
  ok('títulos sem alinhamento forçado', h.indexOf('<th style=')<0);
  ok('os blocos repetidos por escritório abaixo da tabela saíram', HTML.indexOf("its.length+' lançamentos')).join('')||'<div class=\"hint\">Nenhum gasto de escritório neste mês.</div>'")<0);
}

grupo('Lançamentos: repasse de tokens sai da receita e da despesa, margem nos cartões (Gabriel 30/09)');
{
  const r=bloco('function renderLanc(c){','  c.innerHTML=`');
  ok('repasse é o que tem categoria de repasse/antecipação/recarga, igual ao Fechamento', r.indexOf("fchEhRepasse(x)")>0);
  ok('receita e despesa mostradas já sem o repasse', r.indexOf('const rec=recBruta-repasse, desp=despBruta-repasse;')>0);
  ok('o repasse abate da Tecnologia no KPI por área', r.indexOf('porCat.Tecnologia=Math.max(0,porCat.Tecnologia-repasse)')>0);
  ok('margem = saldo sobre a receita sem repasse', r.indexOf('const margem=rec>0?(saldo/rec*100):null;')>0);
  const c=bloco('  c.innerHTML=`','  const tagTipo=');
  ok('a margem aparece no Saldo e no Comparativo', (c.match(/margem/g)||[]).length>=3&&c.indexOf('margem ${margem.toFixed(1).replace')>0);
  ok('os cartões dizem que o repasse ficou de fora', c.indexOf('sem o repasse de tokens')>0&&c.indexOf('OpenAI já abatida do repasse')>0);
  const g={fchEhRepasse:(x)=>['repasse','antecip','recarga'].some(k=>String(x.categoria||'').toLowerCase().includes(k))};
  const src=r.slice(r.indexOf('const recBruta='),r.indexOf('const cats='));
  vm.createContext(g); vm.runInContext('const base=[{tipo:"receita",valor:90000,categoria:"Mensalidade Clientes"},{tipo:"receita",valor:7293.45,categoria:"Recarga de tokens — repasse"},{tipo:"despesa",valor:8300,categoria:"Tecnologia"},{tipo:"despesa",valor:50000,categoria:"Sócios"}];'+src+';this.R={rec,desp,saldo,margem,tec:porCat.Tecnologia}',g);
  ok('setembro de exemplo: receita 90 mil, despesa 51 mil, margem 43,3%', g.R.rec===90000&&Math.abs(g.R.desp-51006.55)<0.01&&Math.abs(g.R.margem-43.33)<0.01&&Math.abs(g.R.tec-1006.55)<0.01);
}

grupo('Recebimentos: o que ainda vai entrar e quanto cada um leva (Gabriel 30/09)');
{
  const DB={financeiro:[{id:'rc_r1',tipo:'receita',data:'2026-09-05',valor:1500,descricao:'Mensalidade: GTR MOTORS',pagoEm:null},
      {id:'rc_r2',tipo:'receita',data:'2026-09-10',valor:1300,descricao:'Mensalidade: NEGOCICAR',pagoEm:'2026-09-10'}],
    recebimentos:[{id:'r1',comp:'2026-09',clienteId:'c1',nome:'GTR MOTORS',venc:'2026-09-05',valor:1500,status:'areceber'},
      {id:'r2',comp:'2026-09',clienteId:'c2',nome:'NEGOCICAR',venc:'2026-09-10',valor:1300,status:'recebido'},
      {id:'r3',comp:'2026-08',clienteId:'c3',nome:'LEAL MOTOS',venc:'2026-08-05',valor:1000,status:'inadimplente',cobravel:true}],
    projetos:[{clienteId:'c1',gerente:'Luiz'},{clienteId:'c2',gerente:'João'},{clienteId:'c3',gerente:'João'}]};
  const g=rodar(bloco('const fchN=(v)=>','const FCH_ESC=')+bloco('function fchBloco(','function fchSaldoMes(')+bloco('function fchPrevisao(','function renderFechamentoMes(c){'),
    {DB,FD:{comp:'',linhas:null,em:0},FD_INICIO:'2026-09',brl:v=>'R$ '+Number(v).toFixed(2),esc:s=>String(s??''),fmtComp:c=>c.split('-').reverse().join('/'),hojeISO:()=>'2026-09-30'},['fchPendentesHtml']);
  const h=g.fchPendentesHtml('2026-09');
  ok('lista quem ainda pode pagar no mês; quem pagou e o atraso de agosto ficam fora', h.indexOf('GTR MOTORS')>0&&h.indexOf('LEAL MOTOS')<0&&h.indexOf('NEGOCICAR')<0);
  ok('diz quanto cada um leva: gerente, caixa, Arthur e sócios', ['Luiz','Caixa da empresa','Arthur','José Carlos','Gabriel','Bernardo'].every(k=>h.indexOf(k)>0));
  ok('GTR: 1.500 menos 150 do gerente, 20% caixa = 270, Arthur 135, cada sócio 315', h.indexOf('R$ 150.00')>0&&h.indexOf('R$ 270.00')>0&&h.indexOf('R$ 135.00')>0&&h.indexOf('R$ 315.00')>0);
  ok('é o melhor cenário do mês, sem bloco de meses anteriores', h.indexOf('Melhor cenário de 09/2026')>0&&h.indexOf('meses anteriores')<0);
  ok('o Fechamento e o Recebimentos usam a mesma função', (HTML.match(/\$\{fchPendentesHtml\(comp\)\}/g)||[]).length===2);
  ok('no Recebimentos só o master vê (lê o financeiro)', /currentUser&&currentUser\.role==='master'\)\?`<div class="fchdoc"[\s\S]{0,400}O que ainda vai entrar, e quanto cada um leva quando entrar/.test(HTML));
}

grupo('Parceria: cliente ativo sem receita, gerente recebe 10% da referência (Gabriel 30/09, JR MOTORS VR)');
{
  const DB={clientes:[{id:'p',nome:'JR MOTORS VR',diaVenc:5,valor:0,parceria:true},{id:'a',nome:'LEAL',diaVenc:5,valor:1000}],recebimentos:[]};
  const g=rodar(bloco('const cliArq=','let cliArqVista')+bloco('function calcRecebimentos(comp){','/* Bloco B:'),
    {DB,hojeISO:()=>'2026-10-15',compNow:()=>'2026-10',vencOf:(c,d)=>c+'-'+String(d).padStart(2,'0')},['calcRecebimentos']);
  const R=g.calcRecebimentos('2026-10');
  ok('parceria tem status próprio, não é a receber nem inadimplente', R.st(DB.clientes[0])==='parceria'&&R.g.parceria.length===1&&R.g.inadimplente.length===1&&R.g.inadimplente[0].id==='a');
  ok('parceria não soma nada', R.val(DB.clientes[0])===0&&R.recebidoSoma===0);
  ok('Recebimentos mostra "Parceria" no lugar do status', HTML.indexOf("${s==='parceria'?'<option value=\"parceria\" selected>Parceria (sem mensalidade)</option>':''}")>0&&HTML.indexOf("parceria:'Parceria'")>0);
  ok('Folha rotula a linha', HTML.indexOf("parceria:'parceria, sem receita'")>0);
  const h=rodar(bloco('const lcSeloParceria=','/* ---------- FILTRO COMPOSTO'),{fichaDe:(id)=>({p:{parceria:true,parceriaRef:900},n:{}}[id]),esc:s=>String(s),brl:v=>'R$ '+v},['lcSeloParceria']);
  ok('card da parceria ganha a etiqueta com a referência', h.lcSeloParceria('p').indexOf('Parceria')>0&&h.lcSeloParceria('p').indexOf('R$ 900')>0&&h.lcSeloParceria('n')==='');
  ok('ficha tem o campo Parceria com valor de referência', HTML.indexOf('id="pc_parc"')>0&&HTML.indexOf('id="pc_parcref"')>0);
  ok('ligar a parceria zera a mensalidade do cadastro e tira o churn', HTML.indexOf("if(cli&&parc){ cli.parceria=true; cli.valor=0; cli.churnComp=null; cli.fim=''; }")>0);
  const SQL=fs.readFileSync(path.join(__dirname,'..','migracao-2026-09-30-parceria.sql'),'utf8');
  ok('banco: card da parceria recebe gerente 10% da referência e mensalidade zero', SQL.indexOf("v := v || jsonb_build_object(k_ger, round(parc_ref*0.10,2));")>0&&SQL.indexOf("v := v || jsonb_build_object(k_mens, 0);")>0);
  ok('banco: folha traz a linha do gerente todo mês com situação parceria', SQL.indexOf("case when st='parceria' then round(parc_ref*0.10,2)")>0&&SQL.indexOf("'inadimplente','parceria'), false) devido")>0);
  ok('banco: gestor e social media não recebem pela parceria', SQL.indexOf("from b where devido and st<>'parceria' and coalesce(gest_user")>0&&SQL.indexOf("return v - k_gest - k_rsoc;")>0);
}

grupo('Comissão integral com sinal (Gabriel 30/09, F3 MULTIMARCAS)');
{
  ok('a cobrança com sinal tem a caixa "comissão integral da equipe"', HTML.indexOf("onchange=\"rcComissaoCheia('${r.id}',this.checked)\"")>0&&HTML.indexOf('comissão integral da equipe')>0);
  ok('ligar grava comissaoCheia na cobrança do mês escolhido', /r\.comissaoCheia=!!on; if\(!on\) delete r\.comissaoCheia;\s*await saveDB\(\)/.test(HTML));
  ok('a regra está documentada na migração', fs.readFileSync(path.join(__dirname,'..','migracao-2026-09-30-parceria.sql'),'utf8').indexOf("(rec->>'comissaoCheia')='true'")>0);
}

grupo('Fechamento: imposto estimado sobre a receita com nota (Gabriel 30/09)');
{
  const g=rodar(bloco('const fchImpostoLer=','function fchImpostoCard('),{localStorage:{getItem:()=>null}},['fchImpostoLer','fchImposto']);
  ok('padrão: 40% com nota a 6%', g.fchImpostoLer().notas===40&&g.fchImpostoLer().aliq===6);
  ok('R$ 102.708,69 de receita: 40% com nota a 6% dá R$ 2.465,01', g.fchImposto(102708.69,40,6)===2465.01);
  ok('100% com nota a 6% dá 6% da receita', g.fchImposto(100000,100,6)===6000);
  const h=rodar(bloco('const fchImpostoLer=','function renderFechamentoMes(c){'),{localStorage:{getItem:(k)=>k==='fch_notas_pct'?'50':'8'},brl:v=>'R$ '+v,esc:s=>String(s),fchN:v=>Number(v)||0,document:{}},['fchImpostoCard']);
  const c=h.fchImpostoCard(100000,[],'2026-09');
  ok('o cartão lê o que a pessoa ajustou (50% a 8%) e mostra a parte da receita', c.indexOf('R$ 4000')>0&&c.indexOf('value="50"')>0&&c.indexOf('value="8"')>0&&c.indexOf('(4,0% da receita)')>0);
  ok('o imposto sai antes do rateio e aparece na Distribuição do lucro', HTML.indexOf('const LUCRO=dec(LUCROC-TAR-IMP);')>0&&HTML.indexOf('<tr><td>Imposto estimado <span')>0&&HTML.indexOf("O imposto estimado sai antes do rateio")>0);
  ok('mudar o percentual redesenha a distribuição', HTML.indexOf('onchange="fchImpostoMudou(true)"')>0&&/if\(fim\)\{ try\{ if\(finTab==='fechames'\) renderFinanceiro/.test(HTML));
  const r=rodar(bloco('const fchImpostoLer=','function fchImpostoCard('),{localStorage:{getItem:()=>null}},['fchEhImposto','fchImpostoReal']);
  ok('o lançamento "Imposto Simples Nacional" é o imposto do mês', r.fchEhImposto({tipo:'despesa',descricao:'Imposto Simples Nacional: declarado R$ 32.000 a 6%'})&&!r.fchEhImposto({tipo:'despesa',descricao:'Pix: contabilidade'})&&!r.fchEhImposto({tipo:'receita',descricao:'Imposto'}));
  ok('com o imposto lançado, a estimativa some do rateio (já está na despesa)', HTML.indexOf('const IMP=IMPR.length?0:dec(fchImposto(RMES,IMPO.notas,IMPO.aliq));')>0&&HTML.indexOf('já descontado na despesa líquida')>0);
  const h2=rodar(bloco('const fchImpostoLer=','function renderFechamentoMes(c){'),{localStorage:{getItem:()=>null},brl:v=>'R$ '+v,esc:s=>String(s),fchN:v=>Number(v)||0,fchDT:s=>s.split('-').reverse().join('/'),document:{}},['fchImpostoCard']);
  const c2=h2.fchImpostoCard(100000,[{valor:1920,declarado:32000,aliquota:6,venc:'2026-10-01',descricao:'Imposto Simples Nacional'}],'2026-09');
  ok('cartão mostra o imposto declarado de verdade, com vencimento', c2.indexOf('Imposto do mês')>0&&c2.indexOf('R$ 1920')>0&&c2.indexOf('declarado R$ 32000 a 6%')>0&&c2.indexOf('vence 01/10')>0);
  ok('sem lançamento, o cartão estimado tem o botão registrar', h2.fchImpostoCard(100000,[],'2026-09').indexOf('fchImpostoRegistrar()')>0);
  ok('o cartão está nos cartões do Fechamento, depois do Lucro', /margem de \$\{\(LU\/\(RMES\|\|1\)\*100\)\.toFixed\(1\)\}%<\/div><\/div>\s*\$\{fchImpostoCard\(RMES,IMPR,comp\)\}/.test(HTML));
}

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
    tkStatusDe:id=>({L4:[1,2,3,4],LF:[1,2,3,4],LS:[1,2,3,4]}[id]||[]), crmForm:id=>id==='LF'||id==='LS', crmSoResp:id=>id==='LS', $:()=>null, tkDesenhar:()=>{}},['visaoDe','visaoPadrao']);
  ok('lista comum abre em lista', g.visaoDe('L1')==='lista');
  ok('lista com 4+ status abre em board', g.visaoDe('L4')==='board');
  ok('lista de leads de formulário abre em Respostas, mesmo com 4+ status (Bernardo 08/10)', g.visaoDe('LF')==='tabela');
  ok('CRM Sofás abre em Respostas (só Respostas ali, Bernardo 08/10)', g.visaoDe('LS')==='tabela');
  g.TK.listaSel='LS'; g.tkVisao('painel');
  ok('CRM Sofás volta pra Respostas mesmo se a última aba foi o Painel', g.visaoDe('LS')==='tabela');
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
  ok('silencioso não reabre a lista inteira', /if\(!silencioso\)\{ (if\(currentView==='pessoal'\) mpPintar\(\); else )?render\('tarefas'\)/.test(src));
  ok('salvar aberto pelo Pessoal continua no Pessoal', /if\(!silencioso\)\{ if\(currentView==='pessoal'\) mpPintar\(\); else render\('tarefas'\)/.test(src));
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
    await testeTarefasPaginadas();
    grupo('Rodízio por receita: cliente novo vai pro gerente com menor carteira (Gabriel 01/10)');
    {
      const cod=bloco("let FC_SQ_VEZ='', FC_SQ_CART=[];","/* O closer pode trocar na mão");
      const DB={clientes:[{id:'c1',valor:3000},{id:'c2',valor:1000},{id:'c3',valor:5000,arquivadoEm:'2026-09-30'},{id:'c4',valor:900}],
        projetos:[{clienteId:'c1',gerente:'Luiz',squad:'01'},{clienteId:'c2',gerente:'João',squad:'02'},{clienteId:'c3',gerente:'João',squad:'02'},{clienteId:'c4',gerente:'João',squad:'02',status:'churn'}]};
      const sq=[{squad:'01',gerente:'Luiz Marcelo'},{squad:'02',gerente:'João Vitor'}];
      const g=rodar(cod,{DB,fcSquads:()=>sq,primNome:(x)=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().split(/\s+/)[0].toLowerCase(),cliArq:(c)=>!!(c&&c.arquivadoEm)},['fcProximoSquad','fcCarteiraGerente']);
      ok('carteira soma a mensalidade dos clientes ativos do gerente', g.fcCarteiraGerente('Luiz Marcelo')===3000);
      ok('cliente arquivado e cliente em churn ficam fora da carteira', g.fcCarteiraGerente('João Vitor')===1000);
      ok('a vez é de quem tem a menor carteira, mesmo tendo levado o último', g.fcProximoSquad()==='02');
      DB.clientes.push({id:'c5',valor:2000}); DB.projetos.push({clienteId:'c5',gerente:'João',squad:'02'});
      ok('empatou: volta a alternar (último foi o 02, agora é o 01)', g.fcProximoSquad()==='01');
      sq[1].gerente='';
      ok('squad sem gerente: não dá pra medir, alterna como antes', g.fcProximoSquad()==='01');
      ok('a tela explica a carteira de cada gerente', HTML.indexOf('Quem está mais baixo leva o próximo até empatar.')>0);
    }
    grupo('Início: concluir no Para hoje em lista sem coluna "feito" (Gabriel 01/10)');
    {
      const cod=bloco("const tkColunaDe=(lid,ok)=>","window.tkConcluir=")+bloco("window.iniConcluir=async","window.inicioPeriodo=");
      const t={id:'c1',lista_id:'CB',titulo:'Cobrar X',status:'todo',status_id:'a'};
      let gravado=null;
      const g=rodar(cod,{TK:{tarefas:[t]},tkStatusDe:(l)=>l==='CB'?[{id:'a',grupo:'nao_iniciado'},{id:'b',grupo:'fechado'}]:[],
        cnAntes:async()=>({}),cnDepois:()=>{},toast:()=>{},renderInicio:()=>{},spDesenhar:()=>{},recAgendar:()=>{},$:()=>null,
        sb:{from:()=>({update:(p)=>({eq:async()=>{ gravado=p; return {error:null}; }})})}},[]);
      PROMESSAS.push(g.iniConcluir({stopPropagation(){}},'c1').then(()=>{
        ok('grava a coluna fechada quando a lista não tem coluna feito', gravado&&gravado.status==='feito'&&gravado.status_id==='b');
        ok('a tarefa em memória sai de A cobrar', t.status_id==='b');
      }));
    }
    grupo('Uma logo por cliente: Controle de Clientes, editora e relatório (Gabriel 02/10)');
    {
      const cod=bloco("const logoFichaKey=(fid)=>","function logosCarregar(){");
      const DB={contasMeta:[{id:'act_1',fichaId:'F1'},{id:'act_2',fichaId:'F2'},{id:'act_3',fichaId:'F3'}]};
      let pediu=0;
      const g=rodar(cod+';window.__set=(v)=>{LOGOS_META=v;};',{DB,LOGOS_META:null,esc:(x)=>String(x),soAgentIA:(f)=>!!(f&&f.ia),fichaDe:(id)=>id==='IA'?{ia:1}:{id},
        logosCarregar:()=>{ pediu++; return Promise.resolve(); },document:{querySelectorAll:()=>[]}},['logoDe','logoDoCliente','lcLogoCel','logoFichaKey']);
      ok('sem logos carregadas: a lista pede uma vez só e mostra o espaço vazio', /class="lc-logo vz"/.test(g.lcLogoCel('F1'))&&/lc-logo/.test(g.lcLogoCel('F2'))&&pediu===1);
      g.__set({act_1:'data:conta1','ficha:F2':'data:ficha2'});
      ok('relatório usa a logo da própria conta quando existe', g.logoDe(DB.contasMeta[0])==='data:conta1'&&g.logoDe('act_1')==='data:conta1');
      ok('relatório sem logo própria usa a logo do cliente', g.logoDe(DB.contasMeta[1])==='data:ficha2'&&g.logoDe('act_2')==='data:ficha2');
      ok('conta sem logo e cliente sem logo: vazio', g.logoDe(DB.contasMeta[2])===''&&g.logoDoCliente('F3')==='');
      ok('logo do cliente: a da ficha ou, na falta, a de uma conta dele', g.logoDoCliente('F2')==='data:ficha2'&&g.logoDoCliente('F1')==='data:conta1');
      ok('miniatura no Controle de Clientes abre a aba Logos da ficha', /<img src="data:conta1"/.test(g.lcLogoCel('F1'))&&/abrirCliente\('F1','logos'\)/.test(g.lcLogoCel('F1'))&&!/ vz"/.test(g.lcLogoCel('F1')));
      ok('cliente só de Agent IA também tem logo na lista (Bernardo 07/10)', /class="lc-logo vz"/.test(g.lcLogoCel('IA'))&&/abrirCliente\('IA','logos'\)/.test(g.lcLogoCel('IA')));
      ok('a lista do Controle de Clientes desenha a miniatura antes do nome', HTML.indexOf("${ehLC(t.lista_id)?lcLogoCel(t.ficha_id):''}<span class=\"tk-titcel")>0);
      ok('a aba Logo mostra a logo dos relatórios para baixar', HTML.indexOf("lgBaixarRel('${esc(fid)}')")>0&&HTML.indexOf("const grade=(logos.length||rel)?")>0);
      /* Bernardo 05/10: a logo do cliente manda; a da conta (28/08) segurava a logo velha no relatório */
      g.__set({act_1:'data:conta1','ficha:F1':'data:ficha1'});
      ok('logo do cliente vence a da conta (lista, Contas de anúncio e PDF)', g.logoDe(DB.contasMeta[0])==='data:ficha1'&&g.logoDe('act_1')==='data:ficha1'&&g.logoDoCliente('F1')==='data:ficha1');
      ok('primeira imagem subida na ficha vira a logo do cliente quando ele não tem a própria (a da conta não segura)', /if\(!\(LOGOS_META\|\|\{\}\)\[logoFichaKey\(fid\)\]\)\{ try\{ const d=await lgMiniatura\(f\); if\(d\) await logoSalvar\(logoFichaKey\(fid\),d\);/.test(HTML));
      ok('logo trocada na Marca da conta também vira a do cliente', /const fidMk=\(contaMarca\(accId\)\|\|\{\}\)\.fichaId; if\(fidMk\) await logoSalvar\(logoFichaKey\(fidMk\), window\.__mkLogo\|\|''\)/.test(HTML));
      ok('Relatórios oferece aplicar as logos novas do card em lote', HTML.indexOf('window.rwUsarLogosNovas=async()=>')>0&&HTML.indexOf(".neq('logo','')")>0);
    }
    grupo('Pagamento do Controle de Clientes é espelho do Recebimentos (Bernardo 06/10)');
    {
      const C=[{id:'c1',nome:'PAGO',diaVenc:5},{id:'c2',nome:'ATRASADO',diaVenc:3},{id:'c3',nome:'NO PRAZO',diaVenc:20},
        {id:'c4',nome:'COMEÇA DEPOIS',diaVenc:10,inicio:'2026-11'},{id:'c5',nome:'PARCERIA',diaVenc:10,parceria:true},
        {id:'c6',nome:'CHURN',diaVenc:10,churnComp:'2026-09'},{id:'c7',nome:'CONTRATO ACABOU',diaVenc:10,fim:'2026-09'},
        {id:'c8',nome:'ARQUIVADO',diaVenc:10,arquivadoEm:'2026-10-01'},{id:'c9',nome:'SINAL',diaVenc:10},{id:'c10',nome:'SEM DIA'}];
      const P=C.map(c=>({id:'f_'+c.id,nome:c.nome,clienteId:c.id})).concat([{id:'f_grupo',nome:'CONTA DO GRUPO',pagaPor:'f_c1'}]);
      const DB={clientes:C,recebimentos:[{comp:'2026-10',clienteId:'c1',recebido:true},{comp:'2026-10',clienteId:'c9',status:'sinal',sinal:500}],projetos:P};
      const g=rodar(bloco('const cliArq=','let cliArqVista')+bloco('function calcRecebimentos(comp){','/* Bloco B:')+bloco('function lcPgDe(f){','const lcFVal='),
        {DB,cliComp:'2026-10',hojeISO:()=>'2026-10-06',compNow:()=>'2026-10',vencOf:(c,d)=>c+'-'+String(d).padStart(2,'0'),
         fichaDe:(id)=>DB.projetos.find(p=>p.id===id)||null,finDaFicha:(f)=>DB.clientes.find(c=>c.id===f.clienteId)||null},['calcRecebimentos','lcPgDe']);
      const R=g.calcRecebimentos('2026-10'), daAba={};
      Object.keys(R.g).forEach(k=>R.g[k].forEach(c=>{ daAba[c.id]=k==='semdia'?'':k; }));
      const dif=C.filter(c=>g.lcPgDe(P.find(p=>p.clienteId===c.id))!==(c.arquivadoEm?'':(daAba[c.id]||''))).map(c=>c.nome);
      ok('coluna Pagamento = aba Recebimentos (pago, atraso, prazo, início, parceria, churn, fim, arquivado, sinal, sem dia)', dif.length===0);
      ok('conta paga pela principal do grupo mostra a situação da principal', g.lcPgDe(P.find(p=>p.id==='f_grupo'))==='recebido');
      ok('a coluna Pagamento não tem mais o menu de troca', HTML.indexOf('lcPgMenu(')<0);
      ok('no card do cliente, o Pagamento é espelho só de leitura', HTML.indexOf('if(c.id===LC_SIT&&ehLC(lid))')>0);
    }
    grupo('Lista não volta pro começo ao salvar, e calendário estilo ClickUp (Bernardo 06/10)');
    {
      /* redesenho da mesma lista devolve a rolagem; trocou de lista, começa do início */
      const main={scrollTop:500}, est={w:{scrollLeft:900,scrollTop:40}};
      const alvo={querySelectorAll:()=>[{parentElement:est.w}]};
      const TK={escopo:'empresa',listaSel:'lc',visao:'lista'};
      const g=rodar(bloco('function tkRolagemLer(alvo){','function tkDesenharTela(c){'),
        {TK,currentView:'tarefas',document:{querySelector:()=>main,getElementById:()=>alvo},scrollY:0,scrollX:0,scrollTo:()=>{},
         requestAnimationFrame:(f)=>f(),
         tkDesenharTela:()=>{ est.w={scrollLeft:0,scrollTop:0}; main.scrollTop=0; }},['tkDesenhar']);
      g.tkDesenhar(alvo);                       /* primeira vez: só aprende a lista */
      main.scrollTop=500; est.w.scrollLeft=900; est.w.scrollTop=40;
      g.tkDesenhar(alvo);                       /* salvou uma célula: redesenha */
      ok('salvar uma célula mantém a rolagem lateral (coluna Início continua na tela)', est.w.scrollLeft===900&&est.w.scrollTop===40);
      ok('e mantém a rolagem de cima pra baixo', main.scrollTop===500);
      main.scrollTop=300; est.w.scrollLeft=700; TK.listaSel='outra';
      g.tkDesenhar(alvo);
      ok('trocar de lista começa do início', est.w.scrollLeft===0&&main.scrollTop===0);
      const cel=bloco("if(c.tipo==='data'){ const hid='tkd_'","const tp=(c.tipo==='numero'");
      ok('célula de data da lista abre o calendário do app, não o do navegador', /dtAbrir\(event,'\$\{hid\}'\)/.test(cel)&&/type="hidden"/.test(cel)&&!/type="date"/.test(cel)&&/tkSetVal/.test(cel));
      /* atalhos: dia certo para cada "hoje" */
      const comHoje=(iso)=>{ const R=Date; return class extends R{ constructor(...a){ if(a.length) super(...a); else super(iso+'T15:00:00'); } }; };
      const at=(iso)=>{ const h=rodar(bloco('const dtISO=','const dtDe=')+bloco('const DT_SEMC=','function dtPintar(){'),{Date:comHoje(iso)},['dtAtalhos','dtISO']);
        const o={}; h.dtAtalhos().forEach(a=>{ o[a.rot]=a.iso+' '+a.dica; }); return o; };
      const ter=at('2026-10-06'), sab=at('2026-10-10'), dom=at('2026-10-11'), seg=at('2026-10-12');
      ok('terça 06/10: hoje, amanhã, sábado 10, segunda 12, sábado 17, 20/10 e 03/11',
        ter['Hoje']==='2026-10-06 ter'&&ter['Amanhã']==='2026-10-07 qua'&&ter['Este fim de semana']==='2026-10-10 sáb'
        &&ter['Próxima semana']==='2026-10-12 seg'&&ter['Próximo fim de semana']==='2026-10-17 17 out'
        &&ter['Daqui a 2 semanas']==='2026-10-20 20 out'&&ter['Daqui a 4 semanas']==='2026-11-03 3 nov');
      ok('no sábado, "este fim de semana" é hoje e o próximo é o outro sábado', sab['Este fim de semana'].startsWith('2026-10-10')&&sab['Próximo fim de semana'].startsWith('2026-10-17'));
      ok('no domingo, "este fim de semana" é hoje e a próxima semana é amanhã', dom['Este fim de semana'].startsWith('2026-10-11')&&dom['Próxima semana'].startsWith('2026-10-12')&&dom['Próximo fim de semana'].startsWith('2026-10-17'));
      ok('na segunda, "próxima semana" é a segunda seguinte', seg['Próxima semana'].startsWith('2026-10-19')&&seg['Este fim de semana'].startsWith('2026-10-17'));
      ok('o calendário tem os atalhos ao lado do mês', HTML.indexOf("pop.classList.add('dt-cu')")>0&&HTML.indexOf('class="dt-at"')>0&&HTML.indexOf('.dtpop.dt-cu{')>0);
    }
    grupo('Cofre de senhas: copiar no modal, sem campo Cliente (Bernardo 07/10)');
    {
      const cod=bloco('/* Modal do cofre (Bernardo 07/10)','window.delSenha=');
      ok('o modal não pede mais o cliente', cod.indexOf("selFicha('m_ficha'")<0&&cod.indexOf("$('#m_ficha')")<0);
      ok('senha que já tinha cliente continua com ele ao salvar', cod.indexOf("fichaId:it.fichaId||''")>0);
      ok('login, senha e link têm botão de copiar dentro do modal', ['m_login','m_senha','m_url'].every(k=>cod.indexOf("linha(`<input id=\""+k+"\"")>0)&&cod.indexOf("onclick=\"smCopiar('${campo}','${rot}',this)\"")>0);
      ok('"Copiar acesso" leva login, senha e link juntos', cod.indexOf("'Login: '+l")>0&&cod.indexOf("'Senha: '+p")>0&&cod.indexOf("'Link: '+u")>0);
      ok('a senha abre escondida e o olho mostra', cod.indexOf('id="m_senha" class="sm-oculta"')>0&&HTML.indexOf('.sm-oculta.sm-ver{-webkit-text-security:none')>0);
      ok('a visibilidade continua indo pelo m_vis', cod.indexOf('<input type="hidden" id="m_vis" value="${vis}">')>0&&cod.indexOf("const priv=$('#m_vis').value==='priv';")>0);
      const g=rodar(bloco('const smIni=','function smFeito('),{},['smIni','smUrl']);
      ok('link sem https abre com https', g.smUrl('instagram.com')==='https://instagram.com'&&g.smUrl('http://a.b')==='http://a.b'&&g.smUrl('')==='');
      ok('a inicial do serviço vira o ícone', g.smIni(' instagram')==='I'&&g.smIni('')==='?');
      ok('na tabela, o link também copia', HTML.indexOf("onclick=\"copyLink('${r.id}')\"")>0&&HTML.indexOf('window.copyLink=')>0);
    }
    grupo('Contato da ficha: dono, grupo, financeiro e botões (Bernardo 07/10)');
    {
      const cod=bloco('/* CONTATO DA FICHA (Bernardo 07/10)','window.openProjCard=');
      const mk=(papel)=>rodar(cod,{esc:x=>String(x==null?'':x),zapsDe:f=>Array.isArray(f&&f.zaps)?f.zaps:[],
        zapDe:t=>{ const d=String(t||'').replace(/\D+/g,''); return d.length<10?'':'https://wa.me/55'+d; },
        mascTel:t=>'('+String(t).replace(/\D+/g,'').slice(0,2)+') '+String(t).replace(/\D+/g,'').slice(2),
        linkIg:v=>{ v=String(v||'').trim(); return !v?'':(/^https?:\/\//i.test(v)?v:'https://instagram.com/'+v.replace(/^@/,'')); },
        linkUrl:v=>{ v=String(v||'').trim(); return /^https?:\/\//i.test(v)?v:''; },
        PCX_I:{}, RW:{grupos:{}}, rwGrupo:()=>null, currentUser:{role:papel}, corDoNome:()=>'#000'},['pcContatoDados','pcContatoHtml','igArroba','nomeGente','pcIni']);
      const g=mk('master');
      const f={id:'p1',zaps:[{et:'Vendedor',nome:'Caio',num:'83966661111'},{et:'Dono',nome:'Irenio',num:'83988881234'},{et:'financeiro',nome:'Marta',num:'83977775678'}],
        instagram:'https://www.instagram.com/ireniojr/',drive:'https://drive.google.com/x'};
      const d=g.pcContatoDados(f,{resp:'Irenio',tel:'11900000000'});
      ok('WhatsApp do dono sai da agenda pela etiqueta Dono', d.donoTel==='83988881234');
      ok('financeiro sai da agenda pela etiqueta (sem diferenciar maiúscula)', d.finNome==='Marta'&&d.finTel==='83977775678');
      const d2=g.pcContatoDados({id:'p2'},{resp:'Paulo',tel:'11912345678',fechamento:{telFin:'11955554444'}});
      ok('sem agenda: dono pelo cadastro, financeiro pelo fechamento (respFin vazio = o próprio dono)', d2.donoTel==='11912345678'&&d2.finNome==='Paulo'&&d2.finTel==='11955554444');
      ok('Instagram vira @perfil, sem o link', g.igArroba('https://www.instagram.com/ireniojr/')==='@ireniojr'&&g.igArroba('@loja')==='@loja'&&g.igArroba('loja')==='@loja');
      const h=g.pcContatoHtml(f,{resp:'Irenio'}), hm=mk('membro').pcContatoHtml(f,{resp:'Irenio'});
      ok('master vê Financeiro e WhatsApp do financeiro', h.indexOf('>Financeiro<')>0&&h.indexOf('WhatsApp do financeiro')>0);
      ok('quem não é master não vê o financeiro', hm.indexOf('Financeiro<')<0&&hm.indexOf('Marta')<0&&hm.indexOf('77775678')<0);
      ok('Instagram e Drive viram botão, sem o endereço escrito', h.indexOf('>@ireniojr<')>0&&h.indexOf('>Abrir pasta<')>0&&h.indexOf('>https://www.instagram.com/ireniojr/<')<0);
      ok('os campos de editar continuam com os mesmos ids', h.indexOf('id="pc_insta"')>0&&h.indexOf('id="pc_drive"')>0);
      ok('grupo do WhatsApp aparece e vincula pelo seletor da aba Relatórios', h.indexOf('Grupo do WhatsApp')>0&&cod.indexOf("rwEscolher(fid,")>0);
      ok('nome em CAIXA ALTA vira nome de gente, com iniciais', g.nomeGente('GUILHERME CESAR DE OLIVEIRA')==='Guilherme Cesar de Oliveira'&&g.pcIni('GUILHERME CESAR DE OLIVEIRA')==='GO'&&g.pcIni('Marta (esposa)')==='M');
      ok('financeiro igual ao dono aparece como "o próprio dono"', g.pcContatoHtml({id:'p3'},{resp:'Paulo Lima',fechamento:{telFin:'11955554444'}}).indexOf('o próprio dono')>0);
      ok('mexer na agenda redesenha o Contato', HTML.indexOf("pcC.innerHTML=pcContatoHtml(f,c)")>0);
      ok('lápis e "adicionar" abrem só a linha, não a ficha inteira (Bernardo 07/10)', cod.indexOf('pcEditar(this)')<0&&cod.indexOf('onclick="pcEditarLinha(this)"')>0&&(HTML.match(/window\.pcEditarLinha=/g)||[]).length===1);
    }
    grupo('Tráfego pago da ficha: forma de pagamento dos anúncios e verba mensal (Bernardo 07/10)');
    {
      const cod=bloco('/* TRÁFEGO PAGO DA FICHA (Bernardo 07/10)','async function pcVerbaGravar(');
      const g=rodar(cod,{contasDoCliente:()=>[{id:'act_1'}],pagConta:(c)=>c.pag},['verbaMes','verbaDoMes','verbaMesDe','adsPagMeta','ADS_PAG']);
      ok('semanal vira mensal em mês de 30 dias (350 → 1.500)', g.verbaMes(350)===1500&&g.verbaMes(0)===0);
      ok('mensal vira semanal de volta (1.500 → 350; aceita vírgula)', g.verbaDoMes(1500)===350&&g.verbaDoMes('1000,00')===233.33);
      ok('mensal digitada aparece igual (2.000 não vira 2.000,01)', g.verbaMesDe({verbaMes:2000},g.verbaDoMes(2000))===2000&&g.verbaMesDe({verbaMes:2000},350)===1500);
      ok('opções: cartão, Pix ou boleto', JSON.stringify(g.ADS_PAG)===JSON.stringify(['Cartão de crédito','Pix','Boleto']));
      g.__mtDados=[{id:'act_1',pag:{prepago:true}}];
      ok('sem escolha na ficha, mostra o que o Meta diz (pré-pago)', g.adsPagMeta('p1')==='Pré-pago (Pix ou boleto)');
      g.__mtDados=[{id:'act_1',pag:{prepago:false,cartao:'Visa ····1234'}}];
      ok('… ou o cartão da conta', g.adsPagMeta('p1')==='Cartão Visa ····1234');
      g.__mtDados=[];
      ok('sem dado do Meta, fica vazio', g.adsPagMeta('p1')==='');
      ok('a ficha grava a forma escolhida e a verba pelo campo que mudou', HTML.indexOf("if(g('pc_adspag')!==null) it.adsPag=g('pc_adspag');")>0&&HTML.indexOf("await pcVerbaGravar(it,peloMes?verbaDoMes(em.value):g('pc_orc'));")>0);
      ok('atalho de campo de tráfego abre o painel do Meta (Bernardo 07/10)', HTML.indexOf("const PC_CAMPO_TRAF=['pc_adspag','pc_orc','pc_orcm','pc_aviso'];")>0&&HTML.indexOf("if(PC_CAMPO_TRAF.indexOf(fid)>=0){ if(pcMeta) return; pcMeta=true;")>0);
      ok('painel do Meta: conta, investido, leads e saldo', ['pmt-ac','Investido · ','por lead','Saldo da conta',"rwEscolherConta("].every(x=>bloco('function pcMetaTopo(it){','function pcProps(it){').indexOf(x)>0));
      ok('Tráfego pago tem forma de pagamento, verba semanal, verba mensal e avisar em', ["li('Forma de pagamento'","li('Verba semanal'","li('Verba mensal'","li('Avisar em'"].every(x=>HTML.indexOf(x)>0));
    }
    grupo('Ficha v3, parte 1: abas, grade única, tabelas com linhas e cabeçalho que gruda (Bernardo 07/10)');
    {
      ok('uma variável só pra coluna dos rótulos (topo, abas e tabelas)', HTML.indexOf('.pcx{--pc-pad:24px;--pc-k:210px}')>0&&HTML.indexOf('.modal.pcx .pcx-props .pr{grid-template-columns:var(--pc-k) minmax(0,1fr);gap:0;min-height:46px}')>0&&HTML.indexOf('.modal.pcx .pc-dl{grid-template-columns:var(--pc-k) minmax(0,1fr);border:1px solid var(--line)')>0);
      ok('aba ativa com sublinhado colado no texto', HTML.indexOf(".modal.pcx .pc-tabs .ftab.active::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:2px")>0);
      ok('topo também em tabela, com linha horizontal e vertical (Bernardo 07/10)', HTML.indexOf('id="pcxProps"><div class="pcx-ptab">')>0&&HTML.indexOf('.modal.pcx .pcx-ptab>.pr>.k{align-self:stretch;padding:8px 14px;border-right:1px solid var(--line)}')>0);
      ok('tabelas com linha vertical entre rótulo e valor', HTML.indexOf('.modal.pcx .pc-dl>.k{padding:8px 14px;border-right:1px solid var(--line)')>0);
      ok('cabeçalho que gruda com nome e status', HTML.indexOf('<div class="pcx-gruda" id="pcxGruda" aria-hidden="true"><div>${PCX_I.loja||\'\'}<b>${esc(it.nome)}</b><span class="pcx-gr-st">${pcStatusHtml(it)}</span></div></div>')>0&&HTML.indexOf("gr.classList.toggle('on',on)")>0);
    }
    grupo('Ficha v3, parte 2: Meta à esquerda, Itens relacionados em cartões e Atividade nova (Bernardo 07/10)');
    {
      ok('atalho do Meta no canto esquerdo, com pontinho quando o saldo acaba', HTML.indexOf('<div class="pcx-lrail"><button type="button" class="pcx-ri${pcMeta?\' on\':\'\'}" title="Meta Ads')>0&&HTML.indexOf('<span class="pcx-pt${rk.nivel===\'critico\'?\' critico\':\'\'}"></span>')>0);
      ok('aberto ou fechado fica lembrado', HTML.indexOf("let pcMeta=(()=>{ try{ return localStorage.getItem('pc_meta')==='1';")>0);
      ok('aba Contas fica só com as contas de anúncio', HTML.indexOf("cliAba==='contas'?('<p class=\"hint\" style=\"margin:0 0 12px\">Verba, saldo e forma de pagamento ficam no atalho do Meta, à esquerda.</p>'+abaContasCliente(it))")>0);
      const g=rodar(bloco('let LT_FIL=','window.ltCarregar='),{},['ltCat','ltIcone']);
      ok('atividade separa comentário, tarefa, pagamento e Meta', g.ltCat({cls:'nota'})==='com'&&g.ltCat({cls:'tarefa abre'})==='tar'&&g.ltCat({cls:'feito abre'})==='tar'&&g.ltCat({cls:'fin'})==='pag'&&g.ltCat({cls:'gasto alerta'})==='meta'&&g.ltCat({cls:'ficha'})==='fic');
      ok('cada registro com o ícone do tipo', g.ltIcone({cls:'tarefa abre'})==='mais'&&g.ltIcone({cls:'feito abre'})==='feito'&&g.ltIcone({cls:'fin'})==='din'&&g.ltIcone({cls:'gasto'})==='meta'&&g.ltIcone({cls:'ficha',html:'NPS: <b>Neutro</b>'})==='estrela');
      ok('filtros no topo e comentário com Responder', HTML.indexOf('<div class="pcx-fil" id="ltFil"></div>')>0&&HTML.indexOf("ltResponder(")>0&&HTML.indexOf('window.ltFiltrar=')>0);
      ok('caixa de comentário com barra de ferramentas', HTML.indexOf('<div class="pcx-ctool"><span class="pcx-ctipo">Comentário</span>')>0&&HTML.indexOf('onclick="ltArroba()"')>0);
      ok('Meta compara com a leitura anterior da mesma conta', HTML.indexOf("x.sub='dia anterior '+brl(p.g)")>0&&HTML.indexOf("o.meta={conta:d.conta||'',g:+d.gasto||0,l:+d.leads||0};")>0);
    }
    grupo('Anexos: envio em pedaços com retomada e limite num lugar só (Gabriel 01/10)');
    {
      const cod=bloco("const AX_MAX=52428800;","const axIcone=");
      const mk=(tusFalha)=>{ const log={direto:0,tus:null,prog:[],hdr:null};
        function Upload(f,o){ this.start=()=>{ log.tus=o;
          Promise.resolve(o.onBeforeRequest({setHeader:(k,v)=>{ log.hdr=v; }})).then(()=>{
            if(tusFalha) return o.onError(new Error(tusFalha));
            o.onProgress(6291456,f.size); o.onProgress(f.size,f.size); o.onSuccess(); }); }; }
        const g=rodar(cod,{tus:{Upload},SUPA_URL:'https://x.supabase.co',SUPA_KEY:'k',document:{},
          sb:{auth:{getSession:async()=>({data:{session:{access_token:'TOK'}}})},
              storage:{from:()=>({upload:async()=>{ log.direto++; return {error:null}; }})}}},['axSubir','AX_MAX_TXT','axProgTxt','axFmtB','AX_MAX']);
        return {g,log}; };
      const A=mk(''), B=mk('tus: falha de rede'), C=mk('tus: 413 maximum allowed size');
      PROMESSAS.push((async()=>{
        await A.g.axSubir('t/1/a.png',{size:1000,type:'image/png',name:'a.png'});
        ok('arquivo pequeno sobe de uma vez, sem pedaços', A.log.direto===1&&!A.log.tus);
        const r=await A.g.axSubir('t/1/v.mp4',{size:30*1048576,type:'video/mp4',name:'v.mp4'},(a,b)=>A.log.prog.push([a,b]));
        ok('arquivo grande sobe em pedaços de 6 MB no endpoint de retomada', !r.error&&A.log.tus&&A.log.tus.chunkSize===6291456&&/x\.storage\.supabase\.co\/storage\/v1\/upload\/resumable$/.test(A.log.tus.endpoint)&&A.log.direto===1);
        ok('vai pro bucket anexos com a chave do arquivo', A.log.tus.metadata.bucketName==='anexos'&&A.log.tus.metadata.objectName==='t/1/v.mp4');
        ok('cada pedaço usa o token da hora', A.log.hdr==='Bearer TOK');
        ok('avisa o progresso', A.log.prog.length===2&&A.log.prog[1][0]===30*1048576);
        ok('não retoma envio antigo (a chave muda a cada envio)', A.log.tus.storeFingerprintForResuming===false);
        const rb=await B.g.axSubir('t/1/v.mp4',{size:30*1048576,type:'video/mp4',name:'v.mp4'});
        ok('falhou o envio em partes e o arquivo cabe em 50 MB: cai no envio direto', !rb.error&&B.log.direto===1);
        const rc=await C.g.axSubir('t/1/g.mp4',{size:30*1048576,type:'video/mp4',name:'g.mp4'});
        ok('passou do limite do servidor: erro claro, sem tentar de novo', rc.error&&/limite do servidor/.test(rc.error.message)&&C.log.direto===0);
        ok('texto do limite sai de AX_MAX', A.g.AX_MAX_TXT===(A.g.AX_MAX>=1073741824?'5 GB':'50 MB'));
        ok('progresso legível', A.g.axProgTxt('v.mp4',1073741824,2147483648)==='Enviando v.mp4: 50% (1,00 GB de 2,00 GB)');
      })());
      ok('nenhum texto de tela com o limite escrito à mão', !/(passa de|até|at\\u00e9) 50 MB/.test(HTML));
      ok('os dois pontos de upload usam o envio em pedaços', HTML.split("const up=await axSubir(chave,f,(a,b)=>{ if(dz) dz.textContent=axProgTxt(f.name,a,b); });").length===3&&HTML.indexOf("sb.storage.from('anexos').upload(chave,f,{contentType:f.type")<0);
    }
/* ---------------- busca do Meta não congela; vínculo só pelo cliente ---------------- */
grupo('Tráfego: busca do Meta em andamento não vira laço infinito (Bernardo 05/10)');
{
  /* a ficha dispara a busca; o Tráfego pede de novo enquanto ela roda */
  const ctx={SESSION:{access_token:'x'},$:()=>null,META_URL:'u',currentView:'outra',toast:()=>{},
    mtSalvarCache:()=>{},aprenderLimites:async()=>{},ltGastos:async()=>{},metaDesenhar:()=>{},mtStatusTxt:()=>{},
    fetch:()=>new Promise(r=>setTimeout(()=>r({json:async()=>({ok:true,contas:[{id:'act_1'}]})}),30))};
  const g=rodar(bloco('window.metaCarregar=async','const contaMarca='),ctx,[]);
  const p1=g.metaCarregar(true);
  let viuContas=null;
  const p2=g.metaCarregar(true).then(()=>{ viuContas=(g.__mtDados||[]).length; });
  PROMESSAS.push(Promise.all([p1,p2]).then(()=>{
    ok('a segunda chamada espera a busca que já estava rodando (antes voltava na hora e o Tráfego entrava em laço)', viuContas===1);
    ok('a busca termina e libera a próxima', g.__mtBuscando===false);
  }));
  ok('o Tráfego só redesenha se a busca trouxe contas', HTML.indexOf("trafAba!=='contas'&&window.__mtDados&&window.__mtDados.length) render('trafego'); });")>0);
  ok('vínculo conta x cliente só pelo cliente: sem a janela em massa (Bernardo 05/10)', HTML.indexOf('abrirVinculos')<0&&HTML.indexOf('mtVinculosQuandoPronto')<0);
  ok('aba Contas da ficha usa o seletor do próprio cliente', HTML.indexOf("rwEscolherConta('${f.id}',()=>cliIrPara('${f.id}','contas'))")>0);
}
grupo('CRM: botão do WhatsApp abre a conversa DENTRO do sistema (Bernardo 08/10)');
{
  const cod=bloco('/* ======================= RESPOSTAS (Bernardo 08/10)','function tkViewLista(){');
  const C=[{id:'w',lista_id:'L',nome:'WhatsApp',tipo:'link'},{id:'d',lista_id:'L',nome:'Preencheu em',tipo:'data'}];
  const abriu=[];
  const ctx=(u,comPainel)=>Object.assign({TK:{listaSel:'L',tarefas:[{id:'a',lista_id:'L',titulo:'Ana Souza',valores:{w:'https://wa.me/11999990001',d:'2026-10-07'}}],campos:C,colsOff:{}},
    tkCamposDe:(l)=>C.filter(k=>k.lista_id===l),esc:(s)=>String(s==null?'':s),campoTexto:(c,v)=>String(v),arquivada:()=>false,
    tkSelo:()=>'<select></select>',tpSvg:()=>'',setTimeout:()=>0,toast:()=>{},currentUser:u},comPainel?{waDoLead:(f,n,o)=>abriu.push([f,n,o])}:{});
  const g=rodar(cod,ctx({role:'master'},true),['tkViewRespostas','rspWaBtn','rspWaAbrir','rspCel','rspFoneCel']);
  const t=g.TK.tarefas[0], b=g.rspWaBtn(t);
  ok('master: o botão chama o painel interno, não o wa.me', /<button type="button" class="tk-wa"/.test(b)&&/rspWaAbrir\('a'\)/.test(b)&&b.indexOf('wa.me')<0);
  g.rspWaAbrir('a');
  ok('abre o painel com o número com 55 e o nome do lead', abriu.length===1&&abriu[0][0]==='5511999990001'&&abriu[0][1]==='Ana Souza');
  ok('manda o id do card pro painel (Classificar e transferir)', abriu.length===1&&!!abriu[0][2]&&abriu[0][2].tarefa==='a');
  const h=g.tkViewRespostas();
  ok('Respostas: botão do WhatsApp logo depois do nome', /Ana Souza<\/button><button type="button" class="tk-wa"/.test(h));
  /* o numero continua escrito na coluna, com copiar e abrir no WhatsApp (Bernardo 08/10: "um não anula o outro") */
  ok('Respostas: coluna WhatsApp mostra o número legível', /<span class="rsp-num"[^>]*>\(11\) 99999-0001<\/span>/.test(h));
  ok('Respostas: botão de copiar o número', /rspCopiarFone\('\(11\) 99999-0001'\)/.test(h));
  ok('Respostas: botão que leva pro WhatsApp com o 55', /class="rsp-fb wa" href="https:\/\/wa\.me\/5511999990001"/.test(h));
  ok('número de fora do Brasil fica com o DDI', g.rspFoneCel('https://wa.me/351912345678').indexOf('>+351912345678<')>0);
  ok('texto que não é telefone fica como veio, sem botão', g.rspFoneCel('não tenho')==='não tenho');
  ok('a Lista mostra a mesma célula no lugar do link cru', /crmForm\(t\.lista_id\)\)\{ const cel=rspFoneCel\(/.test(HTML));
  const g2=rodar(cod,ctx({role:'colaborador',papel_crm:'sdr'},true),['rspWaBtn']);
  ok('quem não vê conversas (só master/gestor) continua indo pro wa.me', /<a class="tk-wa" href="https:\/\/wa\.me\/5511999990001"/.test(g2.rspWaBtn(g2.TK.tarefas[0])));
  const g4=rodar(cod,ctx({id:'u9',role:'colaborador',papel_crm:'sdr'},true),['rspWaBtn']);
  g4.TK.tarefas[0].responsaveis=['u9'];
  ok('vendedor responsável pelo lead abre a conversa dentro do sistema', /<button type="button" class="tk-wa"/.test(g4.rspWaBtn(g4.TK.tarefas[0])));
  const g3=rodar(cod,ctx({role:'master'},false),['rspWaBtn']);
  ok('sem o módulo de conversas carregado, cai no wa.me em vez de quebrar', /href="https:\/\/wa\.me\//.test(g3.rspWaBtn(g3.TK.tarefas[0])));
  ok('a Lista usa o mesmo botão', /rspWaBtn\(t\)(\+rspIgBtn\(t\))?:''/.test(HTML));
  ok('botão dentro do nome não herda o estilo de link do nome', /\.rsp-nm button:not\(\.tk-wa\)\{/.test(HTML));
  ok('conversas.js com cache novo', HTML.indexOf('comercial/conversas.js?v=8')>0);

  /* painel novo (Bernardo 08/10): faixa do número, enviar, agendar, transferir */
  const CJ=fs.readFileSync(path.join(__dirname,'..','comercial','conversas.js'),'utf8');
  const els={}, el=(id)=>els[id]||(els[id]={id,innerHTML:'',textContent:'',value:'',href:'',className:'',scrollTop:0,scrollHeight:0,clientHeight:0,style:{},
    classList:{toggle(c,on){ this[c]=!!on; }},remove(){ delete els[id]; },addEventListener(){},focus(){},select(){}});
  const chamadas=[], ls={}, avisos=[]; let ov=null, resp=null;
  const VEND=[{id:'u1',nome:'Bernardo Antunes',numero:'bernardo'},{id:'u2',nome:'Kennedy Lima',numero:'kennedy'}];
  const LEAD=(x)=>Object.assign({ok:true,chatid:'5511999990001@s.whatsapp.net',mensagens:[],por:'',perfil:'',fonePor:'',conectado:true,
    nums:['bernardo','kennedy','luana'],vendedores:VEND,responsaveis:[],eu:'u1',admin:true,agendadas:[]},x||{});
  const ctxP=(u)=>({document:{querySelector:(s)=>s.startsWith('#')?el(s.slice(1)):null,querySelectorAll:()=>[],getElementById:()=>null,
      createElement:()=>({style:{},addEventListener(){}}),head:{appendChild(){}},body:{appendChild(x){ ov=x; }}},
    localStorage:{getItem:(k)=>ls[k]||null,setItem:(k,v)=>{ ls[k]=String(v); }},
    currentUser:u,SESSION:{access_token:'x'},toast:(m)=>avisos.push(m),TK:{tarefas:[{id:'a',lista_id:'L',status_id:'s1',responsaveis:['u1']}]},
    tkStatusDe:()=>[{id:'s1',nome:'1. NOVO LEAD',cor:'#7c3aed'},{id:'s2',nome:'2. SEM RESPOSTA',cor:'#fb923c'}],
    fetch:async (url,o)=>{ const acao=url.split('/').pop(), b=o&&o.body?JSON.parse(o.body):{}; chamadas.push([acao,b]);
      const d=acao==='lead'?resp:acao==='agendar'?{ok:true,agendada:{id:'ag1',instancia:b.name,tipo:'texto',texto:b.texto,enviar_em:b.quando,status:'pendente',criado_por:'u1'}}:{ok:true,id:'m1'};
      return {json:async ()=>d,status:200}; }});
  const gc=rodar(CJ,ctxP({role:'master'}),[]);
  ls.waLdDe='bernardo';
  PROMESSAS.push((async ()=>{
    resp=LEAD();
    await gc.waDoLead('5511999990001','Ana Souza');
    ok('painel: sem conversa, explica e não trava', /Ainda não tem conversa/.test(els.waLdMsgs.innerHTML));
    ok('painel: pede a conversa do lead em todos os números (ação lead)', chamadas.some(c=>c[0]==='lead'&&c[1].fone==='5511999990001'));
    ok('painel: faixa "Enviando pelo WhatsApp de" com o número que vai sair', /Enviando pelo WhatsApp de <b>Bernardo<\/b>/.test(els.waLdPor.innerHTML));
    ok('painel: master pode trocar o número no seletor da faixa', /<select/.test(els.waLdPor.innerHTML)&&/value="kennedy"/.test(els.waLdPor.innerHTML)&&/value="bernardo" selected/.test(els.waLdPor.innerHTML));
    ok('painel: caixa com +, emoji, relógio e microfone', !!ov&&/Anexar foto, vídeo ou documento/.test(ov.innerHTML)&&/title="Emoji"/.test(ov.innerHTML)&&/Agendar mensagem/.test(ov.innerHTML)&&/id="waLdMic"/.test(ov.innerHTML)&&/<textarea id="waLdTexto"/.test(ov.innerHTML));
    ok('painel: sem card, sem botão roxo de etapa', els.waLdEt.style.display==='none');
    gc.waLdDe('luana'); ok('lembra o último número escolhido', ls.waLdDe==='luana');
    gc.waLdDe('bernardo');
    el('waLdTexto').value='Olá Ana, vi seu cadastro';
    await gc.waLdEnviar();
    const r=chamadas.find(c=>c[0]==='responder');
    ok('envia pelo número escolhido, pro número do lead', !!r&&r[1].name==='bernardo'&&r[1].chatid==='5511999990001@s.whatsapp.net'&&r[1].texto==='Olá Ana, vi seu cadastro');
    el('waLdTexto').value='Bom dia! Conseguiu ver o catálogo?'; el('waLdAgD').value='2099-01-02'; el('waLdAgH').value='09:00';
    await gc.waLdAgendar();
    const ag=chamadas.find(c=>c[0]==='agendar');
    ok('agendar: manda texto, número e o horário escolhido', !!ag&&ag[1].name==='bernardo'&&ag[1].texto==='Bom dia! Conseguiu ver o catálogo?'&&ag[1].quando===new Date('2099-01-02T09:00').toISOString());
    ok('agendar: a mensagem agendada aparece na conversa, com cancelar', /Agendada para/.test(els.waLdMsgs.innerHTML)&&/waLdCancelar\('ag1'\)/.test(els.waLdMsgs.innerHTML));
    ok('agendar: horário no passado não vai', (el('waLdTexto').value='x',el('waLdAgD').value='2000-01-01',await gc.waLdAgendar(),chamadas.filter(c=>c[0]==='agendar').length===1));
    resp=LEAD({por:'bernardo',responsaveis:['u1'],mensagens:[{id:'1',deNos:true,texto:'Oi',quando:'2026-10-08T12:00:00Z',por:'kennedy'},{id:'2',deNos:true,texto:'Tudo bem?',quando:'2026-10-08T13:00:00Z',por:'bernardo'}]});
    await gc.waDoLead('5511999990001','Ana Souza',{tarefa:'a'});
    ok('com o card: manda o id do card pro servidor', chamadas.filter(c=>c[0]==='lead').pop()[1].tarefa==='a');
    /* botão roxo agora muda a etapa; vendedor foi pro topo (Bernardo 08/10) */
    ok('com o card: botão roxo aparece e é de mudar etapa', els.waLdEt.style.display===''&&/id="waLdEt" title="Mudar de etapa"[^>]*onclick="waLdPop\(\\'cl\\'/.test(CJ));
    gc.waLdPop('cl');
    ok('botão roxo: lista as etapas sem o número e marca a atual', /Mover para/.test(els.waLdPop.innerHTML)&&/SEM RESPOSTA/.test(els.waLdPop.innerHTML)&&!/2\. SEM/.test(els.waLdPop.innerHTML)&&/class="wald-mi on" style="--c:#7c3aed"[^>]*>[^]*?NOVO LEAD</.test(els.waLdPop.innerHTML)&&!/atual/.test(els.waLdPop.innerHTML));
    gc.waLdPop('cl');
    ok('topo: vendedor do lead numa pílula que abre o transferir', /class="wald-cl wald-vd" title="Transferir para outro vendedor" onclick="waLdPop\('tr',event\)"/.test(els.waLdHead.innerHTML)&&/Bernardo Antunes/.test(els.waLdHead.innerHTML));
    ok('topo: sem o "Classificar" (a etapa é o botão roxo)', !/Classificar/.test(els.waLdHead.innerHTML));
    gc.waLdPop('tr');
    ok('transferir: lista os vendedores e marca o atual', /Kennedy Lima/.test(els.waLdPop.innerHTML)&&/atual/.test(els.waLdPop.innerHTML));
    ok('no CRM Sofás, transferir só pros 4 do responsável (crmResp)', /crmForm\(tt\.lista_id\)&&typeof crmResp==='function'\) LD\.vendedores=crmResp\(LD\.vendedores\)/.test(CJ));
    /* quem mandou vai em cima da sequência de balões, como no CRM AutoSíntese (Bernardo 08/10) */
    ok('histórico de dois números mostra por qual saiu cada mensagem', /class="wald-quem">[^]*?Kennedy</.test(els.waLdMsgs.innerHTML)&&/class="wald-quem">[^]*?Bernardo</.test(els.waLdMsgs.innerHTML));
    ok('disparo automático sai em balão verde; o do vendedor continua roxo', /\.cv-bal\.nos\.disp\{background:color-mix\(in srgb,var\(--ok\)/.test(CJ)&&/m\.disparo\?' disp':''/.test(CJ)&&/\.wald \.cv-bal\.nos\{background:color-mix\(in srgb,var\(--brand\)/.test(CJ));
    const gv=rodar(CJ,ctxP({role:'membro',papel_crm:'sdr'}),[]);
    const antes=chamadas.length;
    await gv.waDoLead('5511999990001','Ana Souza');
    ok('vendedor: sem o card não abre', chamadas.length===antes&&avisos.some(a=>/vendedor do lead/.test(a)));
    resp=LEAD({admin:false,nums:['kennedy'],por:'kennedy'});
    await gv.waDoLead('5511999990001','Ana Souza',{tarefa:'a'});
    ok('vendedor: com o card abre, e sem seletor de número', chamadas.length>antes&&!/<select/.test(els.waLdPor.innerHTML)&&/Kennedy/.test(els.waLdPor.innerHTML));
    ok('vendedor: a faixa diz que sai pelo WhatsApp dele', /Enviando pelo seu WhatsApp/.test(els.waLdPor.innerHTML));
    /* copiar o telefone no topo da conversa, pro VoIP (Bernardo 08/10) */
    ok('topo da conversa tem o copiar telefone, com folga até a pílula', /onclick="waLdCopiaFone\(\)"/.test(els.waLdHead.innerHTML)&&/\.wald-sub\{display:flex;[^}]*gap:6px 16px/.test(CJ));
  })());
}
grupo('Painel do CRM Sofás: mesma estrutura do Comercial, base separada (Bernardo 08/10)');
{
  const CJ=fs.readFileSync(path.join(__dirname,'..','crm.js'),'utf8');
  const i=CJ.indexOf("CRM.ccBase='crm_calls'"), j=CJ.indexOf('window.ccCarregarBase');
  const pint=[];
  const g=rodar('const CRM={cc:{mes:"",sdr:"x",status:"",de:"",ate:""},d:{calls:[{id:"a"}]}};\n'+CJ.slice(i,j),
    {crmPintar:()=>pint.push('comercial')},['ccCalls','ccPoe','ccPintar','ccUsar','CRM']);
  ok('Comercial continua lendo a crm_calls', g.CRM.ccBase==='crm_calls'&&g.ccCalls().length===1);
  g.ccUsar('sofas_calls',()=>pint.push('sofas')); g.ccPoe([{id:'s1'},{id:'s2'}]);
  ok('Sofás tem as calls dele, separadas', g.ccCalls().length===2&&g.CRM.d.calls.length===1);
  ok('cada base guarda os próprios filtros', g.CRM.cc.sdr===''&&(g.CRM.ccEstado.crm_calls||{}).sdr==='x');
  g.ccPintar(); ok('lá dentro, redesenha a lista (não a tela do Comercial)', pint.pop()==='sofas');
  g.ccUsar('crm_calls'); ok('voltando ao Comercial, tudo como estava', g.CRM.cc.sdr==='x'&&g.ccCalls().length===1);
  ok('lançar, editar e excluir gravam na base que está aberta', /sb\.from\(CRM\.ccBase\)\.insert/.test(CJ)&&/sb\.from\(CRM\.ccBase\)\.update/.test(CJ)&&/sb\.from\(CRM\.ccBase\)\.delete/.test(CJ));
  ok('a tela do Comercial sempre volta pra base da agência', /window\.crmRender=function\(c,viewPedida\)\{\n\s*ccUsar\('crm_calls'\)/.test(CJ));
  ok('CRM Sofás aponta pra sofas_calls', /const CRM_PAINEL=Object\.fromEntries\(CRM_FORMS\.map\(f=>\[f\.lista,f\.calls\]\)\);/.test(HTML)
     &&CRM_FORMS_T.some(f=>f.lista==='2e85f701-0616-4b74-9732-6ebfeba016b8'&&f.calls==='sofas_calls'));
  ok('aba Painel ao lado de Respostas, Lista e Quadro', /\['board',PCX_I\.quadro\+'Quadro'\],\.\.\.\(pnl\?\[\['painel'/.test(HTML)&&/TK\.visao==='painel'\?crmPainelView\(\)/.test(HTML));
  ok('CRM Sofás só em Respostas: sem Lista e sem Quadro, Painel ao lado', /const CRM_SO_RESP=Object\.fromEntries\(CRM_FORMS\.map\(f=>\[f\.lista,1\]\)\);/.test(HTML)&&/:soResp\?\[\['tabela',tpSvg\('tabela',14\)\+'Respostas'\],\.\.\.\(pnl\?/.test(HTML)&&/if\(soResp&&TK\.visao!=='tabela'&&TK\.visao!=='painel'(&&TK\.visao!=='anuncios')?\) TK\.visao='tabela';/.test(HTML));
  ok('Fechamento: lead de origem (CRMs de formulário) vai pro fechamento', /id="fc_lead"/.test(HTML)&&/leadId:leadO\.id/.test(HTML)&&/fcLeadsCarregar\(\);/.test(HTML));
  ok('CRM de formulário: Anúncios é uma lista na árvore de cada CRM', /if\(view==='crm-anuncios'\) return renderCrmAnuncios\(c\);/.test(HTML)&&/const CRM_ANUNCIOS=\{/.test(HTML)&&HTML.indexOf("['anuncios',tpSvg('megafone',14)")<0);
  /* busca de BM e de conta por nome ou ID, sem rolar a lista (Bernardo 08/10) */
  {
    const corte=(x,y)=>{ const i=HTML.indexOf(x), k=HTML.indexOf(y,i); return HTML.slice(i,k); };
    const code=[corte('const anuNorm=','\n'),corte('const ANU={','\n'),corte('const ANU_ST_CONTA=','window.anuBm=')].join('\n');
    const esc=(s)=>String(s).replace(/[&<>"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    const A=new Function('esc','document','window',code+';return {ANU,anuPopHTML};')(esc,{},{});
    A.ANU.bms=[{id:'1401858496860240',nome:'Síntese - Matriz Captação',contas:1,ct:[{id:'act_555',nome:'AMC ESTOFADOS'}]},{id:'2',nome:'Moto Shop',contas:2,ct:[]}];
    const vis=(q,k)=>{ A.ANU.popQ=q; return (A.anuPopHTML(k||'bm','L').match(/<button[^>]*class="anu-op[^"]*"(?![^>]*hidden)[^>]*>/g)||[]).length; };
    ok('BM: a busca aparece sempre, fixa no topo da lista', /anu-pop-busca/.test(A.anuPopHTML('bm','L'))&&/\.anu-pop-top\{position:sticky/.test(HTML));
    ok('BM: acha pelo nome sem acento, pelo ID e pelo nome ou ID da conta', vis('sintese')===1&&vis('1401858')===1&&vis('amc')===1&&vis('act_555')===1&&vis('555')===1&&vis('')===2);
    ok('BM: sem resultado avisa', vis('zzz')===0&&/Nada com esse nome ou ID/.test(A.anuPopHTML('bm','L')));
    A.ANU.cfg.L={bm_id:'2',bm_nome:'Moto Shop'}; A.ANU.bmContas['2']=[{id:'act_9',nome:'Conta A',status:1},{id:'act_10',nome:'Conta B',status:1}];
    ok('contas: a mesma busca, por nome ou ID', vis('conta b','contas')===1&&vis('act_9','contas')===1&&vis('','contas')===2);
  }
  /* Investido R$ 0 com lead de hoje (Bernardo 08/10): janela até hoje, anúncio duplicado somado, custo por lead e por formulário */
  {
    const i=HTML.indexOf('const ANU={'), k=HTML.indexOf('function anuView(){');
    const campos=[{id:'cA',lista_id:'L',nome:'Anúncio'},{id:'cC',lista_id:'L',nome:'Campanha'},{id:'cF',lista_id:'L',nome:'Formulário'},{id:'cW',lista_id:'L',nome:'WhatsApp'},{id:'cD',lista_id:'L',nome:'Preencheu em'}];
    const env={esc:(x)=>String(x),tkCamposDe:()=>campos,tkHoje:()=>'2026-10-08',RSP_DATA:'Preencheu em',TK:{tarefas:[]},arquivada:()=>false,tkStatus1:()=>null,
      DB:{recebimentos:[],clientes:[]},brl:(v)=>'R$ '+Number(v).toFixed(2).replace('.',','),document:{querySelector:()=>null}};
    const A=new Function(...Object.keys(env),HTML.slice(i,k)+';return {ANU,anuMontar,anuTotais,anuJanela,anuKpis};')(...Object.values(env));
    A.ANU.cfg.L={contas:[{id:'act_1'}]};
    const ad=(id,n,st,sp)=>({id,name:n,effective_status:st,campaign:{name:'C'},adset:{name:'X'+id},insights:{data:[{spend:String(sp)}]}});
    A.ANU.dados['L|last_30d|act_1']={ads:[ad('1','[02] Poltrona','ACTIVE',12.92),ad('5','[02] Poltrona','ADSET_PAUSED',117.16),ad('6','[01] Poltrona','ADSET_PAUSED',23.31)],erros:[]};
    const lead=(n,an,form)=>({id:n,lista_id:'L',titulo:n,criado_em:'2026-10-08T15:00:00Z',valores:{cA:an,cC:'C',cF:form,cW:'x',cD:'2026-10-08'}});
    env.TK.tarefas.push(lead('a','[02] Poltrona','Completo'),lead('b','[02] Poltrona','Completo'),lead('c','[01] Poltrona','Incompleto'),lead('d','','Completo'));
    const m=A.anuMontar('L'), t=A.anuTotais(m.linhas,m.leads);
    ok('Anúncios: "últimos 30 dias" termina hoje (lead e gasto de hoje entram)', A.anuJanela()[1]==='2026-10-08'&&A.anuJanela()[0]==='2026-09-09');
    ok('Anúncios: a mesma peça em dois conjuntos vira um cartão com o gasto somado', m.linhas.length===2&&Math.abs(m.linhas.find(l=>l.a.name==='[02] Poltrona').gasto-130.08)<0.001);
    ok('Anúncios: o investido do topo conta anúncio pausado (o filtro Só ativos mexe só na grade)', Math.abs(t.gasto-153.39)<0.001);
    ok('Anúncios: custo por lead conta todo lead com nome ou WhatsApp, até sem anúncio', t.leads===4&&Math.abs(t.cpl-153.39/4)<0.001);
    ok('Anúncios: custo por formulário completo', t.completos===3&&/Custo por formulário completo/.test(A.anuKpis(t,true)));
  }
  ok('no topo do CRM Sofás some o ícone da Lista e o do Quadro', /\$\{soBoard\|\|\(TK\.escopo==='lista'&&crmSoResp\(TK\.listaSel\)\)\?'':tpIb\('lista'/.test(HTML)&&/\$\{TK\.escopo==='lista'&&crmSoResp\(TK\.listaSel\)\?'':tpIb\('quadro'/.test(HTML));
  ok('crm.js com cache novo', HTML.indexOf('crm.js?v=29')>0);
}
grupo('CRM Motos e CRM Veículos: o mesmo código do CRM Sofás, cada um com a sua base (Bernardo 08/10)');
{
  const F=CRM_FORMS_T, por=(n)=>F.find(f=>f.nome===n)||{};
  ok('três CRMs na tabela: Sofás, Motos e Veículos', F.length===3&&['Sofás','Motos','Veículos'].every(n=>por(n).lista));
  ok('cada um com lista, Equipe, form do Yay e calls próprios', ['lista','equipe','form','calls'].every(k=>new Set(F.map(f=>f[k])).size===3));
  ok('Sofás segue com os ids de antes', por('Sofás').lista==='2e85f701-0616-4b74-9732-6ebfeba016b8'&&por('Sofás').equipe==='f1e2d3c4-0000-4a00-8b00-00000000d001'&&por('Sofás').form==='6ac516b64c1c87a7280d6fc9');
  ok('Motos e Veículos apontam pros forms do Yay de moto e de loja de veículos', por('Motos').form==='6a668e28d385e5003d03b895'&&por('Veículos').form==='6aac28b2030e048ade0c664c');
  ok('toda Equipe abre a mesma tela', /\.\.\.Object\.fromEntries\(CRM_FORMS\.map\(f=>\[f\.equipe,'crm-equipe'\]\)\)\};/.test(HTML));
  /* a Equipe lê e grava o rodízio do CRM que está aberto */
  const pedidos=[];
  const cod=bloco('/* ======================= CRM SOFÁS › EQUIPE (Bernardo 08/10)','async function renderPesquisa(c){');
  const g=rodar(cod,{TK:{listaSel:por('Motos').equipe},SESSION:{access_token:'x'},SUPA_URL:'',
    fetch:async()=>({json:async()=>({ok:true,instancias:[]})}),
    sb:{rpc:async(n,a)=>{ pedidos.push([n,a]); return {data:{form_id:a.p_form,vendedores:[],pausado:false}}; }}},['eqForm','eqCarregar']);
  ok('Equipe de Motos usa o form de motos', g.eqForm()==='6a668e28d385e5003d03b895');
  g.TK.listaSel=por('Veículos').equipe; ok('Equipe de Veículos usa o form de veículos', g.eqForm()==='6aac28b2030e048ade0c664c');
  g.TK.listaSel=por('Sofás').equipe; ok('Equipe de Sofás continua no form de sofás', g.eqForm()==='6ac516b64c1c87a7280d6fc9');
  g.TK.listaSel=por('Motos').equipe;
  PROMESSAS.push(g.eqCarregar().then(()=>ok('carrega o rodízio do CRM aberto', pedidos.length===1&&pedidos[0][0]==='crm_rodizio_ver'&&pedidos[0][1].p_form==='6a668e28d385e5003d03b895')));
  ok('salvar grava no form que está na tela (não num fixo)', HTML.indexOf("sb.rpc('crm_rodizio_salvar',{p_form:EQ.cfg.form_id,")>0&&HTML.indexOf('EQ_FORM')<0);
  ok('trocar de CRM no meio da carga não pinta a Equipe errada', /if\(form!==eqForm\(\)\) return;/.test(HTML)&&/currentView!=='crm-equipe'\|\|form!==eqForm\(\)\) return;/.test(HTML));
}
grupo('Novo lead pelo + nos CRMs de formulário, e a reserva do disparo (Bernardo 08/10)');
{
  ok('o + dentro do CRM abre o cadastro de lead, não a tela de tarefa', /if\(!id&&TK\.escopo==='lista'&&crmForm\(TK\.listaSel\)\)\{ crmLdNovo\(TK\.listaSel,grupoPre\); return; \}/.test(HTML));
  ok('abrir um lead que já existe continua indo pro cartão', /if\(id&&typeof crmLdAbrir==='function'&&crmLdAbrir\(id\)\) return;/.test(HTML));
  ok('cadastro grava tudo de uma vez pela RPC crm_lead_novo', HTML.indexOf("sb.rpc('crm_lead_novo',{p_lista:CLN.lid,p:{nome,whats:d,")>0);
  ok('cadastro enxuto: nome, WhatsApp, empresa, Instagram, cargo, cidade/UF, origem, vendedor e anotação', ['clnNome','clnWa','clnEmp','clnIg','clnCargo','clnCidade','clnUf','clnOrigem','clnVend','clnNota'].every(x=>HTML.indexOf('id="'+x+'"')>0)&&/WhatsApp<em>\*<\/em>/.test(HTML));
  ok('cadastro sem os 5 botões de origem e sem texto de ajuda', HTML.indexOf('cln-chip')<0&&HTML.indexOf('CLN_ORIGENS')<0&&HTML.indexOf('Buscando o próximo da vez')<0);
  ok('origem: escolhe das que já existem (sem Formulário) ou digita uma nova', /list="clnOrigens"/.test(HTML)&&/filter\(o=>o&&o!=='Formulário'\)/.test(HTML));
  ok('vendedor vem com quem cadastra e pode ficar vazio', /<option value="">Ninguém<\/option>\$\{equipeDe\(lid,eu\|\|null\)\.map\(u=>`<option value="\$\{u\.id\}"\$\{u\.id===eu\?' selected':''\}/.test(HTML));
  {
    const cod=bloco('/* ======================= NOVO LEAD (Bernardo 08/10)','function crmLdNovo(');
    const g=rodar(cod,{tkStatusDe:()=>[],tkCamposDe:()=>[{nome:'Origem',opcoes:['Formulário','Indicação','Evento','Feira de SP']}]},['clnOrigens','clnEhIndicacao']);
    ok('origens do CRM, já com as digitadas antes', JSON.stringify(g.clnOrigens('L'))==='["Indicação","Evento","Feira de SP"]');
    ok('"Indicado por" aparece só em Indicação (com ou sem acento)', g.clnEhIndicacao('indicacao')&&g.clnEhIndicacao(' Indicação ')&&!g.clnEhIndicacao('Evento'));
  }
  const cod=bloco('/* ======================= CARTÃO DO LEAD (Bernardo 08/10)','/* devolve true quando é lead de CRM');
  const g=rodar(cod,{},['clHistorico']);
  const h=g.clHistorico({descricao:'Lead cadastrado à mão por Bernardo Antunes · Indicação (indicado por João, da JR).'});
  ok('cartão entende o lead cadastrado à mão (quem, origem e quem indicou)', !!h.mao&&h.mao.por==='Bernardo Antunes'&&h.mao.origem==='Indicação'&&h.mao.ind==='João, da JR'&&h.obs==='');
  const h2=g.clHistorico({descricao:'Lead cadastrado à mão por Luana · Evento.'});
  ok('sem indicação também', !!h2.mao&&h2.mao.origem==='Evento'&&h2.mao.ind==='');
  const h3=g.clHistorico({descricao:'Lead do formulário "Loja de sofás" (Yay Forms).\nID da resposta no Yay: abc'});
  ok('lead do formulário continua como era', !h3.mao&&h3.form==='Loja de sofás');
  ok('cartão de lead manual mostra Origem, Indicado por e Cadastrado por', /\$\{h\.mao\?`<section class="cl-box"><h4>De onde veio<\/h4>\n\s*<div class="cl-kv"><span>Origem<\/span>\$\{ed\('origem','-'\)\}/.test(HTML));
  ok('Equipe explica a reserva do disparo', HTML.indexOf('a mensagem sai pelo número de <b>${esc(eqNomeAp(cfg.reserva))}</b> e o lead fica com ele')>0);
}
grupo('Equipe do CRM: card Disparo automático Yay Forms e botão Conectado (Bernardo 08/10)');
{
  ok('título novo, sem a descrição embaixo', HTML.indexOf('<h4>Disparo automático Yay Forms</h4></div>')>0&&HTML.indexOf('Disparo automático do formulário')<0);
  ok('conectado vira o botão verde e o Testar vem logo depois, com ícone', /class="eq-okb" title="WhatsApp conectado">\$\{PC_IC_OK\}Conectado<\/span>/.test(HTML)&&/class="eq-tst" onclick="instTestar\([^"]*"[^>]*>\$\{EQ_IC_ENV\}<span>Testar<\/span>/.test(HTML));
}
grupo('Seletor de emoji da conversa é conteúdo da mensagem, não ícone (Bernardo 08/10)');
{
  const CJ=fs.readFileSync(path.join(__dirname,'..','comercial','conversas.js'),'utf8');
  const m=CJ.match(/const EMOJIS='([^']*)'/);
  ok('lista de emoji escrita por código (o arquivo continua sem emoji solto)', !!m&&/^(\\u\{[0-9A-F]+\}|\s)+$/.test(m[1]));
}
grupo('Cartão do lead: abre como CRM, não como tarefa (Bernardo 08/10)');
{
  const cod=bloco('/* ======================= RESPOSTAS (Bernardo 08/10)','function tkViewLista(){')+'\n'+
    bloco('/* ======================= CARTÃO DO LEAD (Bernardo 08/10)','window.tkAbrir=(id,prazoPre,grupoPre)=>{');
  const nomes=['WhatsApp','Instagram','Cargo','Estado','Cidade','Campanha','Conjunto','Anúncio','Preencheu em','Mensagem automática','Formulário'];
  const C=nomes.map((n,i)=>({id:'c'+i,lista_id:'L',nome:n,tipo:n==='Preencheu em'?'data':'texto'})).concat([{id:'cx',lista_id:'L',nome:'Faturamento',tipo:'texto'}]);
  const ST=[{id:'s0',nome:'0. INCOMPLETO',grupo:'nao_iniciado',cor:'#888'},{id:'s1',nome:'1. NOVO LEAD',grupo:'nao_iniciado',cor:'#7c3aed'},
    {id:'s2',nome:'2. EM CONVERSA',grupo:'ativo',cor:'#2f7cf6'},{id:'s5',nome:'5. FECHADO',grupo:'feito',cor:'#3ec46d'},{id:'s6',nome:'6. PERDIDO',grupo:'fechado',cor:'#64748b'}];
  const lead={id:'a',lista_id:'L',titulo:'Ana Souza',status_id:'s2',criado_em:'2026-10-07T12:00:00Z',
    descricao:'Lead do formulário "Loja de sofás" (Yay Forms), anúncio AD1. ID da resposta no Yay: x1\n\nPreencheu de novo em 08/10/2026 14:32. ID da resposta no Yay: x2',
    valores:{c0:'https://wa.me/5561992054765',c1:'@anastore',c2:'Dono(a)',c3:'DF',c4:'Brasília',c5:'Campanha Sofás',c7:'AD1',c8:'2026-10-07',c9:'Pausada',c10:'Completo'}};
  const tarefa={id:'b',lista_id:'T',titulo:'Fazer post',valores:{}};
  const els={}, patches=[], status=[];
  const esc=(s)=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const g=rodar(cod,{TK:{listaSel:'L',tarefas:[lead,tarefa],campos:C,colsOff:{},listas:[{id:'L',nome:'Leads · Loja de sofás'}]},
    tkCamposDe:(l)=>C.filter(k=>k.lista_id===l),tkStatusDe:(l)=>l==='L'?ST:[],tkStatus1:(id)=>ST.find(s=>s.id===id)||null,
    esc,campoTexto:(c,v)=>v==null?'':String(v),arquivada:()=>false,tkSelo:()=>'',tpSvg:()=>'',toast:()=>{},
    equipeDe:()=>[{id:'u1',nome:'Kennedy'},{id:'u2',nome:'Luana'}],avatar:()=>'',tkNomeUser:()=>'Bernardo',tkmQuando:()=>'hoje',
    currentUser:{id:'u0',role:'master'},waDoLead:()=>{},setTimeout:()=>0,PC_IC:{ig:'<svg class="ig"></svg>'},
    sb:{from:()=>({select:()=>({eq:()=>({order:async ()=>({data:[],error:null})})})})},
    tkPatch:async (id,p)=>{ patches.push(p); Object.assign(lead,p); return true; },
    tkSetStatus:async (id,sid)=>{ status.push(sid); lead.status_id=sid; },
    document:{getElementById:(id)=>els[id]||null,querySelector:()=>null,addEventListener:()=>{},
      createElement:()=>({set id(v){ els[v]=this; },className:'',innerHTML:'',querySelector:()=>null}),body:{appendChild:()=>{}}}},
    ['crmLdAbrir','crmLdHtml','clHistorico','clCampoSalvar','clEtapa','clFone','clEtMenuHtml']);
  ok('lead de lista de formulário abre o cartão de lead', g.crmLdAbrir('a')===true&&!!els.clOv);
  ok('tarefa comum continua no painel de tarefa', g.crmLdAbrir('b')===false);
  const h=els.clOv.innerHTML;
  ok('nada de tarefa no cartão (prazo, prioridade, checklist, subtarefa)', !/Prazo|Prioridade|Checklist|Subtarefa/i.test(h));
  ok('topo: nome, cargo, cidade e estado', /value="Ana Souza"/.test(h)&&/Dono\(a\) · Brasília, DF/.test(h));
  ok('botão Conversar abre a conversa no sistema', /class="cl-wa" onclick="rspWaAbrir\('a'\)"/.test(h));
  ok('Instagram com link', /href="https:\/\/instagram\.com\/anastore"/.test(h));
  ok('sem foto do lead no topo: só o nome', h.indexOf('cl-av')<0);
  ok('Instagram é o ícone do Instagram, com link', /class="cl-ig" href="https:\/\/instagram\.com\/anastore"/.test(h));
  ok('etapa num botão só, com a etapa atual (sem a faixa do funil)', /class="cl-st"[^>]*><i><\/i>Em conversa</.test(h)&&h.indexOf('cl-passos')<0);
  { const mh=g.clEtMenuHtml(lead), sep=mh.indexOf('rc-sep');
    ok('menu da etapa: funil em ordem, a atual com ✓', mh.indexOf('>Novo lead<')<mh.indexOf('>Em conversa<')&&/>Em conversa<b>✓<\/b>/.test(mh));
    ok('menu da etapa: Incompleto e Perdido separados embaixo', sep>0&&mh.indexOf('>Incompleto<')>sep&&mh.indexOf('>Perdido<')>sep&&mh.indexOf('>Em conversa<')<sep);
    ok('nome da etapa em caixa normal, sem o número', /title="Mover para 2\. EM CONVERSA"><i[^>]*><\/i>Em conversa</.test(mh)); }
  ok('WhatsApp aparece formatado', /value="\(61\) 99205-4765"/.test(h));
  ok('de onde veio: campanha e anúncio; o que não veio fica avisado', /Campanha Sofás/.test(h)&&/AD1/.test(h)&&/<span>Conjunto<\/span><b class="vz">não veio/.test(h));
  ok('mensagem automática com selo', /class="cl-msg" data-v="Pausada"/.test(h));
  ok('campo extra da lista aparece em Outras informações', /Outras informações/.test(h)&&/<span>Faturamento<\/span>/.test(h));
  ok('vendedor responsável escolhido na lista do time', /Ninguém ainda<\/option><option value="u1">Kennedy/.test(h));
  const hi=g.clHistorico(lead);
  ok('histórico: formulário e "preencheu de novo", sem o código interno do Yay', hi.form==='Loja de sofás'&&hi.de[0]==='08/10/2026 14:32'&&!hi.obs&&h.indexOf('ID da resposta')<0);
  PROMESSAS.push((async ()=>{
    await g.clCampoSalvar('c0',{value:'(11) 98888-7777'},'whats');
    ok('WhatsApp editado grava no formato do formulário (wa.me com 55)', patches[0]&&patches[0].valores.c0==='https://wa.me/5511988887777');
    await g.clCampoSalvar('c1',{value:'https://instagram.com/novaloja/'},'insta');
    ok('Instagram editado grava como @perfil', patches[1]&&patches[1].valores.c1==='@novaloja');
    await g.clEtapa('s5');
    ok('clicar na etapa muda o status do lead', status[0]==='s5');
  })());
  ok('o tkAbrir desvia lead de CRM pro cartão', /window\.tkAbrir=\(id,prazoPre,grupoPre\)=>\{\s*\/\*[^*]*\*\/\s*if\(id&&typeof crmLdAbrir==='function'&&crmLdAbrir\(id\)\) return;/.test(HTML));
  { const i=HTML.indexOf('function cnPrecisa(t){'), j=HTML.indexOf('function cnPedir(t){'), k=HTML.indexOf("if(typeof crmForm==='function'&&crmForm(t.lista_id)) return false;",i);
    ok('"5. FECHADO" no CRM não pede relatório de tarefa concluída', i>0&&k>i&&k<j); }
}
grupo('Seta pro wa.me ao lado do número do lead (Bernardo 08/10)');
{
  const cod=bloco('/* ======================= RESPOSTAS (Bernardo 08/10)','function tkViewLista(){')+'\n'+
    bloco('/* ======================= CARTÃO DO LEAD (Bernardo 08/10)','window.tkAbrir=(id,prazoPre,grupoPre)=>{');
  const C=[{id:'w',lista_id:'L',nome:'WhatsApp',tipo:'link'},{id:'d',lista_id:'L',nome:'Preencheu em',tipo:'data'}];
  const lead={id:'a',lista_id:'L',titulo:'Ana',status_id:'',valores:{w:'https://wa.me/5561992054765',d:'2026-10-07'}};
  const esc=(s)=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const g=rodar(cod,{TK:{listaSel:'L',tarefas:[lead],campos:C,colsOff:{},listas:[]},tkCamposDe:(l)=>C.filter(k=>k.lista_id===l),
    tkStatusDe:()=>[],tkStatus1:()=>null,esc,campoTexto:(c,v)=>v==null?'':String(v),arquivada:()=>false,tkSelo:()=>'',tpSvg:()=>'',toast:()=>{},
    equipeDe:()=>[],currentUser:{id:'u0',role:'master'},waDoLead:()=>{},setTimeout:()=>0,
    document:{getElementById:()=>null,querySelector:()=>null,addEventListener:()=>{}}},['rspFoneCel','crmLdHtml']);
  const cel=g.rspFoneCel('https://wa.me/5561992054765');
  ok('tabela: seta ao lado do número leva pro wa.me', /href="https:\/\/wa\.me\/5561992054765"[^>]*><svg[^>]*><path d="M7 17 17 7"\/>/.test(cel));
  ok('tabela: o ícone do WhatsApp não se repete ao lado do número', cel.indexOf('M12 2a10 10')<0);
  const h=g.crmLdHtml(lead);
  ok('cartão: seta ao lado do número, abrindo o wa.me em outra aba', /<div class="cl-fone"><input[^>]*value="\(61\) 99205-4765"[^>]*><a class="cl-seta" href="https:\/\/wa\.me\/5561992054765" target="_blank"/.test(h));
  const semNum=Object.assign({},lead,{valores:{}});
  ok('cartão: sem número, sem seta', g.crmLdHtml(semNum).indexOf('cl-seta')<0);
  ok('cartão: o Contato abre com o Nome editável (Bernardo 08/10)', /<h4>Contato<\/h4>\s*<div class="cl-kv"><span>Nome<\/span><input class="cl-in" value="Ana"[^>]*onchange="clNome\(this\.value\)"/.test(h));
  ok('cartão: topo mostra o nome do cliente, sem campo de editar repetido', /<h2 class="cl-nome">Ana<\/h2>/.test(h)&&h.indexOf('<input class="cl-nome"')<0);
}
grupo('CRM Sofás: responsável só José, Bernardo, Kennedy e Luana (Bernardo 08/10)');
{
  const ini=HTML.indexOf('const crmForm='), fim=HTML.indexOf('\n',HTML.indexOf('const crmResp='));
  const C=[{id:'d',lista_id:'L',nome:'Preencheu em'}];
  const EQ=[{id:'ded3cac7-7462-4f76-9680-3af961b25344',nome:'José'},{id:'6b3b1d5d-2ee0-4529-a6c4-23d415678bff',nome:'Bernardo Antunes'},
    {id:'d4867474-1335-444f-a1f2-ab47a1add57c',nome:'Kennedy Lima'},{id:'x1',nome:'Maria'},{id:'x2',nome:'Gabriel'},{id:'x3',nome:'Luana Souza'},
    {id:'x4',nome:'Luanderson'},{id:'4708095e-00c0-4724-91f7-1e6478f77bf7',nome:'Claude (robô)'}];
  const g=rodar('const RSP_DATA="Preencheu em";\n'+HTML.slice(ini,fim)+'\n'+bloco('function equipeDe(lid,extra){','\n}\n')+'\n}',
    {TK:{campos:C,equipe:EQ,listaSel:'L'},espacoDaLista:()=>null,ESPACO_MKT:'m',EQ_MARKETING:[],LISTA_EDICAO:'e',EDITORA_PADRAO:'p'},['crmResp','equipeDe']);
  const nomes=(a)=>a.map(u=>u.nome).join(',');
  ok('lista do CRM: só José, Bernardo, Kennedy e Luana', nomes(g.equipeDe('L'))==='José,Bernardo Antunes,Kennedy Lima,Luana Souza');
  ok('Luana entra pelo primeiro nome quando ganhar login; "Luanderson" não', !/Luanderson/.test(nomes(g.crmResp(EQ))));
  ok('fora do CRM continua o time todo', g.equipeDe('OUTRA').length===EQ.length);
  ok('filtro "Responsáveis" da lista do CRM usa os mesmos quatro', /const doCrm=TK\.escopo==='lista'&&typeof crmForm==='function'&&crmForm\(TK\.listaSel\);\s*const pessoas=\[\.\.\.\(doCrm\?crmResp\(TK\.equipe\):TK\.equipe\)\]/.test(HTML));
  ok('menu rápido de responsável na linha do lead também', /\(typeof crmForm==='function'&&crmForm\(t\.lista_id\)\)\?crmResp\(TK\.equipe\):TK\.equipe/.test(HTML));
}
grupo('Respostas separada por etapa, estilo ClickUp (Bernardo 08/10)');
{
  const cod=bloco('/* ======================= RESPOSTAS (Bernardo 08/10)','function tkViewLista(){');
  const C=[{id:'w',lista_id:'L',nome:'WhatsApp',tipo:'link'},{id:'d',lista_id:'L',nome:'Preencheu em',tipo:'data'},{id:'e',lista_id:'L',nome:'Estado',tipo:'texto'}];
  const ST=[{id:'s3',nome:'3. EM CONVERSA',cor:'#2f7cf6',ordem:3},{id:'s1',nome:'1. NOVO LEAD',cor:'#7c3aed',ordem:1},
    {id:'s2',nome:'2. SEM RESPOSTA',cor:'#fb923c',ordem:2},{id:'s6',nome:'6. GANHOU',cor:'#3ec46d',ordem:6}];
  const T=[{id:'a',lista_id:'L',titulo:'Ana',status_id:'s1',valores:{d:'2026-10-07',e:'SP'}},
    {id:'b',lista_id:'L',titulo:'Beto',status_id:'s3',valores:{d:'2026-10-06',e:'RJ'}},
    {id:'c',lista_id:'L',titulo:'Caio',status_id:'s1',valores:{d:'2026-10-05',e:'DF'}},
    {id:'z',lista_id:'L',titulo:'Zeca',status_id:null,valores:{d:'2026-10-04'}}];
  const g=rodar(cod,{TK:{listaSel:'L',tarefas:T,campos:C,colsOff:{},fechadas:{}},tkCamposDe:(l)=>C.filter(k=>k.lista_id===l),
    tkStatusDe:()=>ST,esc:(s)=>String(s==null?'':s),campoTexto:(c,v)=>String(v),arquivada:()=>false,tkSelo:()=>'<select></select>',
    tpSvg:()=>'',setTimeout:()=>0,currentUser:{role:'master'},corTexto:()=>'#fff'},['tkViewRespostas','rspGrupos','RSP']);
  /* só a tabela: o funil do topo (opção 4) também escreve o nome das etapas */
  const h0=g.tkViewRespostas(), h=h0.slice(h0.indexOf('id="rspTab"'));
  const pos=(x)=>h.indexOf(x);
  ok('uma faixa por etapa com lead, na ordem do funil (não na ordem que veio do banco)', pos('>NOVO LEAD<')>0&&pos('>NOVO LEAD<')<pos('>EM CONVERSA<'));
  ok('pílula com a cor da etapa e sem o número na frente', /class="tk-selo" style="background-color:#7c3aed;[^"]*">NOVO LEAD<\/span>/.test(h)&&h.indexOf('1. NOVO LEAD')<0);
  ok('contagem em cada faixa', /NOVO LEAD<\/span>\s*<span class="tk-n rsp-gn">2</.test(h)&&/EM CONVERSA<\/span>\s*<span class="tk-n rsp-gn">1</.test(h));
  ok('cada etapa com lead tem o próprio cabeçalho de colunas', (h.match(/<tr class="rsp-ch">/g)||[]).length===3);
  ok('etapa vazia sai da tabela (fica só no funil do topo)', pos('>SEM RESPOSTA<')<0&&pos('>GANHOU<')<0&&h0.indexOf('>SEM RESPOSTA<')>0);
  ok('lead sem etapa vai num grupo no fim', pos('>Sem etapa<')>pos('>EM CONVERSA<')&&pos('>Zeca<')>pos('>Sem etapa<'));
  ok('leads ficam dentro da própria etapa', pos('>Ana<')>pos('>NOVO LEAD<')&&pos('>Ana<')<pos('>EM CONVERSA<')&&pos('>Beto<')>pos('>EM CONVERSA<'));
  ok('clicar na faixa recolhe a etapa', /onclick="tkToggle\('g','rs1'\)"/.test(h));
  g.TK.fechadas={grs1:true};
  const h2=g.tkViewRespostas();
  ok('etapa recolhida esconde os leads e o cabeçalho', h2.indexOf('>Ana<')<0&&h2.indexOf('>Beto<')>0&&(h2.match(/<tr class="rsp-ch">/g)||[]).length===2);
  ok('larguras das colunas numa <colgroup>, iguais em todas as etapas', /<colgroup><col data-k="nome" style="width:300px"><col data-k="data"/.test(h));
  ok('"marcar todos" marca só a etapa', /onchange="rspTodos\(this\.checked,'s1'\)"/.test(h)&&/window\.rspTodos=\(on,g\)=>/.test(HTML));
  ok('busca conta só linhas de lead e atualiza a contagem de cada etapa', HTML.indexOf("#rspTab tbody tr[data-b]")>0&&HTML.indexOf("#rspTab tbody.rsp-g")>0);
  ok('arrastar a borda muda a <col>', HTML.indexOf(`const col=tb.querySelector('col[data-k="'+k+'"]')`)>0);
  /* mudar de etapa sem abrir o card (Bernardo 08/10) */
  ok('setinha roxa na linha do lead, depois do nome', /Ana<\/button><button type="button" class="rsp-mv" title="Mudar de etapa"[^>]*rspMover\(event,'a'\)/.test(h));
  ok('linha arrasta', /draggable="true" ondragstart="rspPega\(event,'a'\)"/.test(h));
  ok('faixa da etapa recebe o lead arrastado; "Sem etapa" não', /onclick="tkToggle\('g','rs1'\)" ondragover="rspSobre/.test(h)&&/rspSoltaEtapa\(event,this,'s1'\)/.test(h)&&!/rspSoltaEtapa\(event,this,'sem'\)/.test(h0));
  ok('funil do topo também recebe', /class="rsp-fe[^"]*" data-g="s2"[^>]*rspSoltaEtapa\(event,this,'s2'\)/.test(h0));
  g.RSP.sel={a:1,c:1};
  ok('selecionados ganham "Mover para…"', /onclick="rspMover\(event,''\)">Mover para…</.test(g.tkViewRespostas()));
  g.RSP.sel={};
}
grupo('Respostas: mover lead de etapa sem abrir o card (Bernardo 08/10)');
{
  const cod=bloco('/* ======================= RESPOSTAS (Bernardo 08/10)','function tkViewLista(){');
  const ST=[{id:'s2',nome:'2. SEM RESPOSTA',cor:'#fb923c',ordem:2,grupo:'ativo'},{id:'s1',nome:'1. NOVO LEAD',cor:'#7c3aed',ordem:1,grupo:'nao_iniciado'},
    {id:'s6',nome:'6. GANHOU',cor:'#3ec46d',ordem:6,grupo:'feito'}];
  const T=[{id:'a',lista_id:'L',titulo:'Ana',status_id:'s1',valores:{}},{id:'b',lista_id:'L',titulo:'Beto',status_id:'s1',valores:{}},{id:'c',lista_id:'L',titulo:'Caio',status_id:'s2',valores:{}}];
  const menus=[], um=[], upd=[], toasts=[];
  const sb={from:()=>({update:(p)=>({in:async (c,ids)=>{ upd.push([p,ids]); return {error:null}; }})})};
  const g=rodar(cod,{TK:{listaSel:'L',tarefas:T,campos:[],colsOff:{},fechadas:{}},tkCamposDe:()=>[],tkStatusDe:()=>ST,tkStatus1:(id)=>ST.find(s=>s.id===id)||null,
    TK_G2ST:{nao_iniciado:'todo',ativo:'doing',feito:'feito'},cnPrecisa:()=>false,esc:(s)=>String(s==null?'':s),toast:(m)=>toasts.push(m),
    ctxAbrir:(ev,it)=>menus.push(it),tkSetStatus:async (id,sid)=>{ um.push([id,sid]); },tkDesenhar:()=>{},spDesenhar:()=>{},$:()=>null,sb,
    tkPegar:(ev,id)=>{ g.TK.arrastando=id; },tkAlvo:()=>{ const x=g.TK.arrastando; g.TK.arrastando=null; return x; },document:{querySelectorAll:()=>[]}},['RSP']);
  g.rspMover({},'a');
  const m=menus[0]||[];
  /* a atual fica no lugar dela no funil, marcada pela cor, sem o texto "atual" (Bernardo 08/10) */
  ok('setinha: menu com as etapas na ordem do funil, sem o número', m[0]&&m[0].cab==='Mover para'&&m[1].t==='NOVO LEAD'&&m[2].t==='SEM RESPOSTA'&&m[3].t==='GANHOU');
  ok('setinha: etapa atual marcada pela cor dela, não por texto', m[1].on===true&&m[1].cor==='#7c3aed'&&!m[2].on&&/\.ctxm button\.on\{background:color-mix\(in srgb,var\(--c/.test(HTML));
  PROMESSAS.push((async ()=>{
    await m[2].f();
    ok('escolher a etapa grava pelo caminho de sempre (tkSetStatus)', um.length===1&&um[0][0]==='a'&&um[0][1]==='s2');
    await g.rspMoverPara(['c'],'s2');
    ok('soltar na etapa em que ele já está não grava nada', um.length===1&&!upd.length);
    g.RSP.sel={a:1,b:1};
    g.rspMover({},'');
    ok('em lote: o título diz quantos', menus[1][0].cab==='Mover 2 leads para');
    await menus[1][2].f();
    ok('em lote: uma gravação só, com etapa e status', upd.length===1&&upd[0][1].join()==='a,b'&&upd[0][0].status_id==='s2'&&upd[0][0].status==='doing');
    ok('em lote: atualiza a tela, limpa a seleção e avisa', g.TK.tarefas[0].status_id==='s2'&&!Object.keys(g.RSP.sel).length&&toasts.some(t=>t==='2 leads foram para SEM RESPOSTA.'));
    const ev={preventDefault(){},stopPropagation(){},currentTarget:{classList:{add(){},remove(){}}},dataTransfer:{}};
    g.rspPega(ev,'c');
    await g.rspSoltaEtapa(ev,{classList:{remove(){}}},'s1');
    ok('arrastar e soltar numa etapa move o lead', um.length===2&&um[1][0]==='c'&&um[1][1]==='s1');
  })());
}
grupo('Respostas: etapa do funil filtra e relógio do lead no funil (Bernardo 08/10)');
{
  const cod=bloco('/* ======================= RESPOSTAS (Bernardo 08/10)','function tkViewLista(){');
  const C=[{id:'d',lista_id:'L',nome:'Preencheu em',tipo:'data'}];
  const ST=[{id:'s1',nome:'1. NOVO LEAD',cor:'#7c3aed',ordem:1,grupo:'nao_iniciado'},{id:'s3',nome:'3. EM CONVERSA',cor:'#a855f7',ordem:3,grupo:'ativo'},
    {id:'s6',nome:'6. GANHOU',cor:'#3ec46d',ordem:6,grupo:'feito'}];
  const agora=Date.now(), H=3600000;
  const T=[{id:'a',lista_id:'L',titulo:'Ana',status_id:'s1',criado_em:new Date(agora-2*H).toISOString(),valores:{}},
    {id:'b',lista_id:'L',titulo:'Beto',status_id:'s3',criado_em:new Date(agora-30*H).toISOString(),valores:{}},
    {id:'c',lista_id:'L',titulo:'Caio',status_id:'s6',criado_em:new Date(agora-5*24*H).toISOString(),concluida_em:new Date(agora-1*24*H).toISOString(),valores:{}},
    {id:'e',lista_id:'L',titulo:'Edu',status_id:'s6',criado_em:new Date(agora-3*24*H).toISOString(),concluida_em:new Date(agora-1*24*H).toISOString(),valores:{}}];
  const toasts=[];
  const g=rodar(cod,{TK:{listaSel:'L',tarefas:T,campos:C,colsOff:{},fechadas:{}},tkCamposDe:(l)=>C.filter(k=>k.lista_id===l),
    tkStatusDe:()=>ST,tkStatus1:(id)=>ST.find(s=>s.id===id)||null,esc:(s)=>String(s==null?'':s),campoTexto:(c,v)=>String(v),arquivada:()=>false,
    tkSelo:()=>'[st]',tpSvg:()=>'',setTimeout:()=>0,setInterval:()=>0,currentUser:{role:'master'},corTexto:()=>'#fff',
    tkDesenhar:()=>{},$:()=>null,toast:(m)=>toasts.push(m)},['tkViewRespostas','rspDur','rspIrEtapa','RSP']);
  ok('relógio em horas no 1º dia e em dias depois', g.rspDur(40*60000)==='40 min'&&g.rspDur(8*H)==='8 h'&&g.rspDur(23*H)==='23 h'&&g.rspDur(24*H)==='1 dia'&&g.rspDur(30*24*H)==='30 dias');
  const h=g.tkViewRespostas();
  ok('lead com menos de 6 h fica vermelho', /class="rsp-rel quente"[^>]*>[\s\S]*?<span>2 h<\/span>/.test(h));
  ok('depois das 6 h fica neutro, contando dias', /class="rsp-rel"[^>]*>[\s\S]*?<span>1 dia<\/span>/.test(h));
  ok('quem fechou para o relógio na hora de fechar', /class="rsp-rel fim"[^>]*>[\s\S]*?<span>4 dias<\/span>/.test(h));
  ok('GANHOU mostra a jornada média de compra', /GANHOU<\/span><b>2<\/b><small class="rsp-jm"[^>]*>jornada média 3 dias</.test(h));
  ok('sem filtro: todas as etapas na tabela e sem o "Ver todas"', h.indexOf('>Beto<')>0&&h.indexOf('>Ana<')>0&&h.indexOf('rsp-tudo')<0);
  g.rspIrEtapa('s3'); const h2=g.tkViewRespostas();
  ok('clicou em EM CONVERSA: só ela aparece', h2.indexOf('>Beto<')>0&&h2.indexOf('>Ana<')<0&&h2.indexOf('>Caio<')<0);
  ok('etapa escolhida marcada no funil e "Ver todas as etapas" aparece', /rsp-funil filtrado/.test(h2)&&/rsp-fe on" data-g="s3"/.test(h2)&&h2.indexOf('Ver todas as etapas')>0);
  g.rspIrEtapa('s3');
  ok('clicar de novo na mesma etapa volta a mostrar tudo', g.RSP.etapa==='');
  g.rspIrEtapa('s1'); g.rspIrEtapa('');
  ok('"Ver todas" volta a mostrar tudo', g.RSP.etapa==='');
  g.TK.tarefas=T.filter(x=>x.status_id!=='s1'); g.rspIrEtapa('s1');
  ok('etapa vazia não filtra: avisa', g.RSP.etapa===''&&/Nenhum lead em novo lead/.test(toasts.join('|')));
}
grupo('Respostas: funil no topo + etapas sem caixa, a opção 4 (Bernardo 08/10)');
{
  const cod=bloco('/* ======================= RESPOSTAS (Bernardo 08/10)','function tkViewLista(){');
  const C=[{id:'d',lista_id:'L',nome:'Preencheu em',tipo:'data'}];
  const ST=[{id:'s2',nome:'2. SEM RESPOSTA',cor:'#f97316',ordem:2},{id:'s1',nome:'1. NOVO LEAD',cor:'#7c3aed',ordem:1},{id:'s6',nome:'6. GANHOU',cor:'#3ec46d',ordem:6}];
  const T=[{id:'a',lista_id:'L',titulo:'Ana',status_id:'s1',valores:{d:'2026-10-07'}},{id:'b',lista_id:'L',titulo:'Bia',status_id:'s1',valores:{d:'2026-10-06'}},
    {id:'c',lista_id:'L',titulo:'Caio',status_id:'s2',valores:{d:'2026-10-05'}}];
  const g=rodar(cod,{TK:{listaSel:'L',tarefas:T,campos:C,colsOff:{},fechadas:{}},tkCamposDe:(l)=>C.filter(k=>k.lista_id===l),
    tkStatusDe:()=>ST,esc:(s)=>String(s==null?'':s),campoTexto:(c,v)=>String(v),arquivada:()=>false,tkSelo:()=>'',
    tpSvg:()=>'',setTimeout:()=>0,currentUser:{role:'master'},corTexto:()=>'#fff'},['tkViewRespostas']);
  const h=g.tkViewRespostas();
  const fun=(h.match(/<div class="rsp-funil"[^>]*>([\s\S]*?)<\/div>/)||[])[1]||'';
  const bt=fun.match(/<button[\s\S]*?<\/button>/g)||[];
  ok('funil no topo, antes da tabela', h.indexOf('rsp-funil')>0&&h.indexOf('rsp-funil')<h.indexOf('id="rspTab"'));
  ok('uma etapa por botão, na ordem do funil, com a contagem', bt.length===3&&/>NOVO LEAD<\/span><b>2</.test(bt[0])&&/>SEM RESPOSTA<\/span><b>1</.test(bt[1])&&/>GANHOU<\/span><b>0</.test(bt[2]));
  ok('cada etapa na própria cor; etapa vazia fica cinza', /--c:#7c3aed/.test(bt[0])&&/rsp-fe zero/.test(bt[2])&&!/zero/.test(bt[0]));
  ok('clicar na etapa mostra só ela (Bernardo 08/10)', /onclick="rspIrEtapa\('s1'\)"/.test(bt[0])&&/window\.rspIrEtapa=\(k\)=>/.test(HTML)&&HTML.indexOf("RSP.etapa=k||'';")>0);
  ok('etapa recolhida abre ao ser escolhida', HTML.indexOf("if(k&&TK.fechadas&&TK.fechadas['gr'+k]) TK.fechadas['gr'+k]=false;")>0);
  ok('etapas sem caixa, com a linha vertical entre as colunas (Bernardo 08/10)', HTML.indexOf('.tablewrap:has(> #rspTab){background:transparent;border:0;border-radius:0;box-shadow:none}')>0&&HTML.indexOf('#rspTab .rsp-g > tr:not(.tk-faixa) > *+*{border-left:1px solid var(--line)}')>0);
  ok('saiu o cartão com cantos redondos por etapa', HTML.indexOf('border-top-left-radius:12px}')<0||!/#rspTab \.rsp-ch > th:first-child\{border-left/.test(HTML));
  ok('busca atualiza o número do funil junto', HTML.indexOf(`const f=document.querySelector('.rsp-fe[data-g="'+g.dataset.g+'"] b'); if(f) f.textContent=c.textContent;`)>0);
}
grupo('Respostas: etapa vazia só no funil, selo leve na linha (Bernardo 08/10)');
{
  const cod=bloco('/* ======================= RESPOSTAS (Bernardo 08/10)','function tkViewLista(){');
  const C=[{id:'d',lista_id:'L',nome:'Preencheu em',tipo:'data'}];
  const ST=[{id:'s1',nome:'1. NOVO LEAD',cor:'#7c3aed',ordem:1},{id:'s4',nome:'4. REUNIÃO MARCADA',cor:'#f59e0b',ordem:4},{id:'s7',nome:'7. PERDEU',cor:'#e5484d',ordem:7}];
  const T=[{id:'a',lista_id:'L',titulo:'Ana',status_id:'s1',valores:{d:'2026-10-07'}},{id:'b',lista_id:'L',titulo:'Bia',status_id:'s7',valores:{d:'2026-10-06'}}];
  const g=rodar(cod,{TK:{listaSel:'L',tarefas:T,campos:C,colsOff:{},fechadas:{}},tkCamposDe:(l)=>C.filter(k=>k.lista_id===l),
    tkStatusDe:()=>ST,esc:(s)=>String(s==null?'':s),campoTexto:(c,v)=>String(v),arquivada:()=>false,tkSelo:()=>'',
    tpSvg:()=>'',setTimeout:()=>0,currentUser:{role:'master'},corTexto:()=>'#fff'},['tkViewRespostas']);
  const h=g.tkViewRespostas(), tab=h.slice(h.indexOf('id="rspTab"')), fun=h.slice(0,h.indexOf('id="rspTab"'));
  ok('etapa vazia não ocupa linha na lista', tab.indexOf('REUNIÃO MARCADA')<0&&tab.indexOf('tk-faixa vazio')<0);
  ok('etapa vazia continua no funil com o zero', /rsp-fe zero[^>]*>[\s\S]*?REUNIÃO MARCADA<\/span><b>0</.test(fun));
  ok('etapas com lead continuam na lista, na ordem', tab.indexOf('>NOVO LEAD<')>0&&tab.indexOf('>NOVO LEAD<')<tab.indexOf('>PERDEU<'));
  ok('clicar numa etapa vazia do funil avisa', HTML.indexOf("toast('Nenhum lead em '+")>0);
  ok('status da linha num selo leve, a cor cheia fica na pílula do grupo', /#rspTab \.tk-stsel\{background-color:color-mix\(in srgb,var\(--c\) 15%,transparent\)!important/.test(HTML));
}
grupo('CRM Sofás: planilha voltou ao jeito do vídeo das 17h (Bernardo 08/10)');
{
  ok('sem filtro de hoje, sem botões de data e sem aviso de pendentes', HTML.indexOf('rspAvisoPendentes')<0&&HTML.indexOf('RSP_PER')<0&&HTML.indexOf('class="rsp-per"')<0&&HTML.indexOf("let RSP={dir:-1,sel:{},q:'',larg:{}};")>0);
  ok('Filtros continua sem "Data de vencimento" na lista de lead (lead não tem prazo)', /\$\{tkFSemPrio\(\)\?`<p class="hint"[^`]*`:`<div class="tkp-sec">Data de vencimento<\/div>/.test(HTML)&&HTML.indexOf("if(tkFSemPrio()){ /* lead não tem prazo")>0&&HTML.indexOf("((F.prazo||F.de||F.ate)&&!tkFSemPrio()?1:0)")>0);
}
    await Promise.all(PROMESSAS);
    fimDosTestes();
  })();
}
/* ---------------- cliente só de Agent IA: nada de tráfego na ficha ---------------- */
grupo('Agent IA: ficha sem gestor, conta, verba, gasto, saldo e contas (Gabriel 23/09); logos ficam (Bernardo 07/10)');
{
  const g=rodar(bloco('const soAgentIA=',"/* A foto sai do perfil"),{},['soAgentIA']);
  ok('categoria ia é Agent IA', g.soAgentIA({categoria:'ia'})===true);
  ok('Tráfego + Agent IA não é', g.soAgentIA({categoria:'full'})===false);
  ok('sem tipo não é (palpite não conta)', g.soAgentIA({})===false);
  const props=bloco('function pcProps(it){','function pcFaixa(it){');
  ok('painel: gestor de tráfego some', /\$\{ia\?'':row\('pessoa'/.test(props));
  ok('conta, verba, gasto e saldo saíram do topo e moram no painel do Meta, à esquerda (Bernardo 07/10)', props.indexOf("row('conta'")<0&&props.indexOf("row('saldo'")<0&&props.indexOf("row('link'")<0&&HTML.indexOf('<div class="pcx-metac">${pcMetaTopo(it)}${tfCampos}')>0&&HTML.indexOf("cliAba==='contas'?(pcTrafegoPainel")<0);
  ok('Agent IA não tem campos de tráfego', HTML.indexOf("const tfCampos=soAgentIA(it)?'':`")>0);
  ok('aba Contas some para Agent IA; a barra de contas saiu da ficha para todos (Bernardo 07/10)', HTML.indexOf("pcGrupoBarra(it)}")<0 && (HTML.match(/\$\{soAgentIA\(it\)\?'':`<button class="ftab/g)||[]).length===1);
  ok('aba Logos aparece para todo cliente, inclusive Agent IA', /\n\s*<button class="ftab \$\{cliAba==='logos'/.test(HTML) && HTML.indexOf("if(soAgentIA(it)&&cliAba==='contas') cliAba='geral';")>0);
  ok('aba Logos não barra Agent IA', HTML.indexOf('Cliente só de Agent IA: não tem logo guardada')<0);
  ok('virar Agent IA tira o gestor', HTML.indexOf("if(k==='ia') it.responsavel='';")>0);
}

/* ---------------- emoji é proibido no sistema ---------------- */
grupo('Nenhum emoji na tela: usar ícone da ICO_LIB (Gabriel 23/09, "definitivamente")');
{
  /* emoji colorido (estilo WhatsApp). Símbolos de texto sem cor (✓ ✕ ★ ✎ ☑ ✔ ✦ ⚒ ☎ ✉ ♻ ▶ ●) podem. */
  const EMO=/(?![✓✕✎★☆☑✔✗✦⚑⚒☎✉♻▶◆▲●◉◎⌘])[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{2B50}\u{2B55}\u{231A}\u{231B}\u{23E9}-\u{23FA}]/gu;
  /* tira comentários (código lê, a tela não) antes de procurar */
  const semComentario=(t)=>t.replace(/<!--[\s\S]*?-->/g,'').replace(/\/\*[\s\S]*?\*\//g,'').replace(/(^|[^:\\'"`])\/\/[^\n]*/g,'$1');
  const achar=(arq)=>{ const t=semComentario(fs.readFileSync(path.join(__dirname,'..',arq),'utf8'));
    const out=[]; let m; EMO.lastIndex=0; while((m=EMO.exec(t))) out.push(m[0]+' …'+t.slice(Math.max(0,m.index-30),m.index+10).replace(/\n/g,' ')+'…'); return out; };
  ['index.html','crm.js','comercial/conversas.js','comercial/instancias.js','contrato.html'].forEach(arq=>{
    const a=achar(arq); ok(arq+': nenhum emoji'+(a.length?' (achei '+a.length+': '+a.slice(0,3).join(' | ')+')':''), a.length===0); });
  ok('ícone novo entra na ICO_LIB (ex.: alerta, chat, lixeira)', /\n\s*alerta:'/.test(HTML)&&/\n\s*chat:'/.test(HTML)&&/\n\s*lixeira:'/.test(HTML));
}

/* ---------------- Situação do Controle de Clientes ---------------- */
grupo('Situação: A receber / Inadimplente / Pago; valor antigo lido com o nome novo (Gabriel 23/09)');
{
  const g=rodar(bloco('const OPC_LEGADO=','const campoTexto='),{},['valCampo']);
  const SIT={id:'06102f93-48d6-4e1f-96fc-ed8c0ed4da15'}, OUTRA={id:'x'};
  ok('"OK" antigo aparece como Pago', g.valCampo(SIT,'OK')==='Pago');
  ok('"INADIMPLENTE" antigo aparece como Inadimplente', g.valCampo(SIT,'INADIMPLENTE')==='Inadimplente');
  ok('valor novo fica igual', g.valCampo(SIT,'A receber')==='A receber');
  ok('outra coluna não é mexida', g.valCampo(OUTRA,'OK')==='OK');
  ok('cores: A receber amarelo, Inadimplente vermelho, Pago verde', /'a receber':'#e6b13f',inadimplente:'#ef5b6b'/.test(HTML)&&/pago:'#3fcf8e'/.test(HTML));
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
  ok('Grupo, Colunas e Status da lista foram pro ⋯', /tkMenuGrupo\(\)/.test(bloco('window.tpMais=','async function tkPatch(')) && /tkMenuCols\(\)/.test(bloco('window.tpMais=','async function tkPatch(')));
  ok('tipo de tarefa e + Coluna saíram do ⋯ (Gabriel 23/09)', !/tkTipos\(\)|tkNovoCampo\(\)/.test(bloco('window.tpMais=','async function tkPatch(')));
  ok('+ Nova coluna mora dentro de Colunas', /\+ Nova coluna<\/button>/.test(bloco('window.tkMenuCols=','const CP_ORIGEM')));
  ok('nenhum botão ◈ Tipos na tela da lista nem no menu da barra lateral', HTML.indexOf('>◈ Tipos</button>')<0 && HTML.indexOf("t:'Tipos de tarefa'")<0);
  ok('no card dá pra escolher ou criar o tipo', /<option value="__novo">\+ Criar tipo…<\/option>/.test(HTML) && /window\.tkTipoTroca=/.test(HTML));
  ok('grupo vazio não ocupa linha (desce pra uma linha só)', HTML.indexOf('tl-vazios')>0);
  ok('Controle de Clientes mantém o topo dele', HTML.indexOf('if(!cli){ c.innerHTML=')>0);
}

/* ---------------- carga das tarefas passa do teto de 1000 do Supabase ---------------- */
/* Assíncrono: roda de dentro do bloco async da recorrência, antes do placar final. */
async function testeTarefasPaginadas(){
  grupo('Tarefas: carga passa do teto de 1000 linhas (Gabriel 24/09)');
  const g=rodar(bloco('async function tudoPaginado(monta){','async function tkCarregar(){'),{},['tudoPaginado']);
  /* dublê do PostgREST: devolve a faixa pedida, cortada no teto do servidor */
  const banco=(n,teto)=>{ const linhas=Array.from({length:n},(_,i)=>({id:i})); let pedidos=0;
    return {pedidos:()=>pedidos, monta:()=>({range:async(a,b)=>{ pedidos++; return {data:linhas.slice(a,Math.min(b+1,a+teto)),error:null}; }})}; };
  const b1=banco(1047,1000); const r1=await g.tudoPaginado(b1.monta);
  ok('1047 tarefas com teto 1000: vêm as 1047', r1.data.length===1047);
  ok('a mais nova (a que sumia) está lá', r1.data[1046].id===1046);
  ok('nenhuma repetida', new Set(r1.data.map(x=>x.id)).size===1047);
  const b2=banco(1047,500); const r2=await g.tudoPaginado(b2.monta);
  ok('teto do servidor menor (500): continua vindo tudo', r2.data.length===1047);
  const r3=await g.tudoPaginado(banco(0,1000).monta);
  ok('banco vazio: lista vazia, sem erro', r3.data.length===0&&!r3.error);
  const r4=await g.tudoPaginado(()=>({range:async()=>({data:null,error:{message:'caiu'}})}));
  ok('erro do banco sobe como erro (não vira lista vazia)', r4.error&&r4.error.message==='caiu'&&r4.data===null);
  const car=bloco('async function tkCarregar(){','const err=e.error');
  ok('tkCarregar busca as tarefas paginado', /tudoPaginado\(\(\)=>sb\.from\('tarefas'\)/.test(car));
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
    TK:{tarefas:[{lista_id:'LC',ficha_id:'f1',status_id:'s5'}]},tkStatus1:id=>id==='s5'?{nome:'5. CLIENTE ATIVO',cor:'#3ec46d'}:id==='s4'?{nome:'4. CHURN CONFIRMADO'}:null,
    CH_ID:'CH',lcCardDe:pid=>pid==='fc'?{lista_id:'CH',status_id:'s4'}:null,
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
  /* SPAÇO VEÍCULOS (Gabriel 30/09): trocar o status na ficha de quem está em churn só mudava a ficha */
  const hc=mst.pcStatusHtml({id:'fc',status:'churn'});
  ok('card no Controle de Churns: a etiqueta mostra o estágio do churn', /4\. CHURN CONFIRMADO/.test(hc)&&/tag churn/.test(hc));
  ok('o menu dele só oferece voltar para o Controle de Clientes', /if\(!t&&pcCardCH\(pid\)\)\{ ctxAbrir\(ev,\[\{cab:'Cliente no Controle de Churns'\},\s*\{ic:'○',t:'Voltar para Controle de Clientes',f:\(\)=>lcReativar\(pid\)\}\]\); return; \}/.test(cod));
  ok('sair de churn pelo status da ficha move o card, não só a ficha', /if\(k&&k!=='churn'&&pcCardCH\(pid\)\) return lcReativar\(pid\);/.test(cod));
}

grupo('Voltar do churn devolve a cobrança (Gabriel 30/09)');
{
  const DB={recebimentos:[{comp:'2026-09',clienteId:'a',status:'churn',churnEm:'2026-09-10'},{comp:'2026-09',clienteId:'b',status:'churnpago',recebido:true},
    {comp:'2026-07',clienteId:'c',status:'churn'}]};
  const g=rodar(bloco('function lcDesfazerChurnFin(','window.arqRestaurar='),{DB},['lcDesfazerChurnFin']);
  const a={id:'a',churnComp:'2026-09',fim:'2026-09'}, b={id:'b',churnComp:'2026-09',fim:'2026-09'}, c={id:'c',churnComp:'2026-07',fim:'2026-07'};
  ok('churn do próprio mês: cadastro limpo e a cobrança do mês reabre', g.lcDesfazerChurnFin(a,'2026-09')==='mes'&&!a.churnComp&&!a.fim&&DB.recebimentos[0].status===null&&DB.recebimentos[0].churnEm===null);
  ok('churn com o mês pago: a cobrança do mês fica como recebida', g.lcDesfazerChurnFin(b,'2026-09')==='mes'&&DB.recebimentos[1].status==='recebido');
  ok('saiu em mês anterior: a saída fica no histórico e a carteira volta a contar do mês da volta', g.lcDesfazerChurnFin(c,'2026-09')==='depois'&&!c.churnComp&&c.inicio==='2026-09'&&DB.recebimentos[2].status==='churn');
  ok('sem churn no cadastro não mexe em nada', g.lcDesfazerChurnFin({id:'z'},'2026-09')==='');
  ok('lcReativar chama a volta da cobrança no mês escolhido no popup e grava', /fin=lcDesfazerChurnFin\(cli,comp\);[\s\S]{0,200}try\{ await saveDB\(\); \}catch\(_\)\{\}/.test(HTML));
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
    abaFinCliente:()=>'<div>FIN</div>',currentUser:{role:'master'},lcPgDe:()=>'recebido',LC_PG:{recebido:{rot:'PAGO',cor:'#3fcf8e'}},LC_REM:'REM',
    DB:{recebimentos:[]},rcSituacao:()=>null,hojeISO:()=>'2026-09-23',contasDoCliente:()=>[],MT_LEADS:[],LT_PER:{},brl:v=>'R$ '+v,
    finDaFicha:()=>({valor:1500}),linkIg:()=>'',linkUrl:()=>'',zapsDe:()=>[],CAT_LABEL:{trafego:'Tráfego Pago'},pcSquadHtml:()=>'<i></i><span>01</span>',
    verbaSemDe:()=>null,souGerenteDaFicha:()=>false,pcCardLC:()=>({id:'t3',valores:{MENS:1500}}),LC_MENS:'MENS',compNow:()=>'2026-09',
    fmtComp:()=>'set/2026',lcMensVigente:()=>1200,
    pcStatusHtml:()=>'<button>4. EM MANUTENÇÃO</button>',avatarDoNome:n=>'',RISCO_COR:{},RISCO_TXT:{},localStorage:{getItem:()=>null,setItem(){}}},
    ['pcRelTarefas','pcRelPainel','pcProps']);
  const it={id:'f1',nome:'LEAL MOTOS',clienteId:'c1',categoria:'trafego',squad:'01',responsavel:'Luan',gerente:'João'};
  ok('relacionamentos: só as tarefas desse cliente, sem o card do Controle de Clientes', g.pcRelTarefas(it).length===2);
  const h=g.pcRelPainel(it);
  ok('dados do contrato ficam fechados no fim e só abrem ao clicar (Bernardo 07/10)', /<details class="pcx-rc pcx-det" ontoggle="if\(this\.open/.test(h)&&h.indexOf('Dados do contrato')>h.indexOf('Tarefas'));
  ok('tarefas em tabela com a lista de cada uma (Campanhas e Tecnologia)', /<span>Nome<\/span><span>Lista<\/span><span>Status<\/span>/.test(h)&&/Campanhas/.test(h)&&/03\. Tecnologia/.test(h));
  ok('prazo vencido fica marcado', /class="tarde">20\/09/.test(h));
  ok('financeiro mora em Relacionamentos (master)', /FIN/.test(h));
  const pp=g.pcProps(it);
  ok('propriedades: Status, Tipo, Squad, Gestor e Gerente; tráfego e Links não ficam mais no topo (Bernardo 07/10)',
    ['Status','Tipo','Squad','Gestor de tráfego','Gerente'].every(r=>pp.indexOf(r+'</span>')>0)
    &&['Conta de anúncio','Verba','Gasto','Saldo','Links'].every(r=>pp.indexOf('>'+r+'</span>')<0&&pp.indexOf(r+'</span>')<0));
  ok('Gerente vem antes do Gestor de tráfego no topo da ficha (Bernardo 07/10)', pp.indexOf('Gerente</span>')>0&&pp.indexOf('Gerente</span>')<pp.indexOf('Gestor de tráfego</span>'));
  ok('campo vazio marcado pra poder recolher', /class="pr vz"/.test(g.pcProps(Object.assign({},it,{squad:'',gerente:''})))&&/Recolher campos vazios/.test(pp));
  /* mensalidade na ficha (Gabriel 30/09) */
  ok('master vê a Mensalidade nos Itens relacionados e clica para mudar (Bernardo 07/10)', /<b>Mensalidade<\/b>/.test(h)&&/pcMensEditar\('f1'\)/.test(h)&&/R\$ 1200/.test(h));
  ok('valor só do mês avisa qual é o recorrente', /só em set\/2026 · recorrente R\$ 1500/.test(h));
  ok('Mensalidade saiu do topo e vem primeiro nos Itens relacionados', pp.indexOf('Mensalidade')<0&&h.indexOf('<b>Mensalidade</b>')<h.indexOf('<b>Tarefas</b>'));
  ok('pagamento do mês aparece na Mensalidade', /Este mês<\/span><span><span class="pcx-pill"[^>]*>Pago</.test(h));
  ok('mudar pela ficha usa o mesmo caminho da coluna da lista', /await tkSetVal\(M\.t\.id,LC_MENS,v\);/.test(cod));
  { const g2=rodar(cod,Object.assign({},g,{currentUser:{role:'membro'}}),['pcProps']);
    ok('quem não é master nem gerente do cliente não vê a Mensalidade nem os dados do contrato', !/Mensalidade/.test(g2.pcRelPainel(it))&&!/Dados do contrato/.test(g2.pcRelPainel(it))&&!/Mensalidade/.test(g2.pcProps(it))); }
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


grupo('Novo contrato / upsell do gerente (Gabriel 23/09)');
{
  const cod=bloco('const NC_CAMPOS=[','const ncCampos=');
  const g=rodar(cod,{esc:s=>String(s),ctSoDig:s=>String(s||'').replace(/\D/g,''),
    ctMascCNPJ:s=>s,ctMascCPF:s=>s},['ncMapear','ncFalta','ncTem']);
  const r={resp:'Thiago',tel:'(11) 9',contrato:{},fechamento:{razaoSocial:'ALTO GIRO LTDA',cnpj:'12345678000190',dono:'Thiago S',email:'a@b.c',endereco:'Rua X, 1'}};
  const d=g.ncMapear(r);
  ok('puxa os dados do Fechamento quando a ficha não tem contrato', d.razao==='ALTO GIRO LTDA'&&d.cnpj==='12345678000190'&&d.rep_nome==='Thiago S'&&d.tel==='(11) 9');
  const d2=g.ncMapear({contrato:{razao:'NOVA',endereco:'Rua A',bairro:'Centro',cidade_uf:'SP/SP',cep:'01000-000'},fechamento:{razaoSocial:'VELHA'}});
  ok('dados contratuais da ficha valem mais que o Fechamento e o endereço vira uma linha', d2.razao==='NOVA'&&d2.endereco==='Rua A, Centro, SP/SP, CEP 01000-000');
  ok('com tudo preenchido não falta nada', g.ncFalta(d).length===0);
  const f=g.ncFalta({razao:'X',rep_nome:'Y',email:'e',endereco:'r',cnpj:'',rep_cpf:''});
  ok('sem CNPJ e sem CPF não deixa seguir', f.length===1&&f[0]==='CNPJ ou CPF');
  ok('cliente sem nada no sistema cai no formulário aberto', !g.ncTem(g.ncMapear({contrato:{},fechamento:{}})));
  ok('só o gerente da ficha (ou o master) abre o novo contrato',
    /const podeNovoContrato=\(fid\)=>!!\(currentUser&&\(currentUser\.role==='master'\|\|souGerenteDaFicha\(fid\)\)\)/.test(HTML));
  ok('dados vêm pela RPC protegida, não da base de clientes', HTML.indexOf("sb.rpc('dados_contratuais'")>0&&HTML.indexOf("sb.rpc('salvar_dados_contratuais'")>0);
  ok('cobrança no AutoSíntese é fixa; Asaas e .docx são opcionais',
    /nc-fixo"><input type="checkbox" checked disabled> Cobrança no AutoSíntese/.test(HTML)&&HTML.indexOf('id="nc2_asaas"')>0&&HTML.indexOf('id="nc2_doc"')>0);
  ok('Asaas não é mais só do master', HTML.indexOf("${mst?`<label class=\"tk-chkline\" style=\"margin-top:6px\"><input type=\"checkbox\" id=\"nc2_asaas\">")<0);
  ok('manda a ficha de origem pra função checar o gerente', /origemFicha:String\(fid\)/.test(HTML));
  ok('o + do Controle de Clientes oferece contrato de cliente atual', /onclick="lcNovoPop\(event\)"/.test(HTML)&&/window\.lcNovoPop=/.test(HTML));
  const ed=require('fs').readFileSync(require('path').join(__dirname,'..','funcoes','fechamento','index.ts'),'utf8');
  ok('função fechamento recusa gerente que não é o da ficha', /gerenteDaFicha\(fid, quem\.nome\)/.test(ed)&&/if \(!fid\) return erro/.test(ed));
}

/* ---------------- Controle de Clientes: dinheiro e total da carteira ---------------- */
grupo('Controle de Clientes: colunas de dinheiro e total da carteira (Gabriel 23/09)');
{
  const cod=bloco('const moedaCurta=','window.tkMonEditar=');
  const g=rodar(cod,{},['moedaCurta']);
  ok('R$ colado e sem centavo quando é redondo', g.moedaCurta(1500)==='R$ 1.500');
  ok('com centavo quando precisa', g.moedaCurta(1449.44)==='R$ 1.449,44');
  ok('vazio fica vazio', g.moedaCurta('')===''&&g.moedaCurta(null)==='');
  /* 30/09: a linha Total da carteira saiu (dinheiro de folha fica na Folha); ver o grupo do rodapé */
  ok('títulos curtos das colunas de dinheiro', HTML.indexOf("'Remuneração Gerente (10%)':'Gerente 10%'")>0);
}

grupo('Pessoal no celular: chave Pessoal/Trabalho (Bernardo 04/10)');
{
  const TK={ws:[{id:'we',tipo:'empresa'},{id:'wp',tipo:'pessoal',dono:'u1'}],
    espacos:[{id:'e1',workspace_id:'we',nome:'Administrativo'},{id:'e0',workspace_id:null,nome:'Antigo'},{id:'ep',workspace_id:'wp',nome:'Geral'}],
    listas:[{id:'l1',espaco_id:'e1',nome:'Cobranças'},{id:'l0',espaco_id:'e0',nome:'Velha'},{id:'lp',espaco_id:'ep',nome:'Tarefas'},{id:'LC',espaco_id:'e1',nome:'Controle de Clientes'}],
    tarefas:[
      {id:'a',lista_id:'l1',prazo:'2026-10-04',responsaveis:['u1'],status:'todo'},
      {id:'b',lista_id:'l1',prazo:'2026-10-03',responsaveis:['u1'],status:'todo'},
      {id:'c',lista_id:'l1',prazo:'2026-10-02',responsaveis:['u1'],status:'feito'},
      {id:'d',lista_id:'lp',prazo:'2026-10-04',responsaveis:['u1'],status:'todo'},
      {id:'e',lista_id:'l1',prazo:'2026-10-04',responsaveis:['u2'],status:'todo'},
      {id:'f',lista_id:'LC',prazo:'2026-10-04',responsaveis:['u1'],status:'todo'},
      {id:'g',lista_id:'l1',prazo:'2026-10-04',responsaveis:['u1'],status:'todo',arquivada_em:'2026-10-01'},
      {id:'h',lista_id:'l1',prazo:'2026-10-04',responsaveis:['u1'],status:'todo',pai_id:'a'},
      {id:'i',lista_id:'l0',prazo:'2026-10-05',responsaveis:['u1'],status:'todo'},
      {id:'j',lista_id:'l1',prazo:'2026-10-04',responsaveis:['u1'],status:'feito'}]};
  const ctx={TK,currentUser:{id:'u1'},ehMinha:(t,u)=>(t.responsaveis||[]).indexOf(u)>=0,ehListaCli:(l)=>l==='LC',
    mpFeita:(t)=>t.status==='feito'||!!t.concluida_em,tkHoje:()=>'2026-10-04',spNome:(o)=>String((o&&o.nome)||'')};
  const g=rodar(bloco('function mpEhEmpresa(','/* Linha de tarefa do Trabalho.'),ctx,
    ['mpEhEmpresa','mpTrabTarefas','mpTrabDia','mpTrabAtrasadas','mpTrabFalta','mpTrabCaminho']);
  const ids=(a)=>a.map(t=>t.id).sort().join(',');
  ok('Trabalho = minhas, da empresa, sem arquivada, subtarefa nem card de cliente', ids(g.mpTrabTarefas())==='a,b,c,i,j');
  ok('tarefa do workspace pessoal não entra no Trabalho', !g.mpTrabTarefas().some(t=>t.id==='d'));
  ok('espaço sem workspace_id conta como empresa', g.mpEhEmpresa('l0')===true&&g.mpEhEmpresa('lp')===false);
  ok('o dia mostra as do dia, feitas ou não', ids(g.mpTrabDia('2026-10-04'))==='a,j');
  ok('atrasada é prazo vencido e não concluída', ids(g.mpTrabAtrasadas())==='b');
  ok('a bolinha conta atrasadas + as de hoje em aberto', g.mpTrabFalta()===2);
  ok('subtítulo mostra espaço › lista', g.mpTrabCaminho({lista_id:'l1'})==='Administrativo › Cobranças');
  ok('Trabalho só vale no celular', HTML.indexOf("function mpTrab(){ return MP_MODO==='T'&&window.innerWidth<=720; }")>0);
  ok('a escolha fica guardada no aparelho', HTML.indexOf("localStorage.setItem('mp_modo',MP_MODO)")>0);
  ok('Hábitos sai da barra de baixo em Trabalho', HTML.indexOf("abas.filter(a=>!(a[0]==='habitos'&&mpTrab()))")>0);
  ok('o chip do celular abre o menu curto; tablet segue no modal', HTML.indexOf("if(window.innerWidth<=720) mpModoMenu(ev); else mpWsMenu();")>0);
  ok('perfil, tema e sair continuam no fim do menu', HTML.indexOf("onclick=\"mpModoFecha();mpWsMenu()\"")>0);
  ok('lista da empresa não é pintada por cima do Pessoal', HTML.indexOf("if(currentView==='pessoal'&&(!c||c.id==='content')){ mpPintar(); return; }")>0);
  ok('chip volta pro menu curto mesmo depois de passar pelo corporativo', HTML.indexOf("if(e.onclick!==mpChip) e.onclick=mpChip;")>0);
  ok('Fechar do rodapé do cartão fecha (todos os .mcancel)', HTML.indexOf("ov.querySelectorAll('.mcancel').forEach(b=>{ b.onclick=fechar; });")>0);
  ok('sair do Pessoal fecha o menu e tira a maleta', HTML.indexOf("if(view!=='pessoal') mpSairTopo();")>0&&/function mpSairTopo\(\)\{\s*document\.body\.classList\.remove\('mob-pessoal','mp-trab'\)/.test(HTML)&&HTML.indexOf("'.topbar .mp-mala'")>0);
  ok('trocar de tela sem o render (spSelLista etc.) também limpa o topo do Pessoal', HTML.indexOf("if(currentView!=='pessoal'&&document.body.classList.contains('mob-pessoal')) mpSairTopo();")>0);
}

/* ---------------- WhatsApp na tela Usuários ---------------- */
grupo('Usuários: cadastrar/gerar número de WhatsApp pelo app (Bernardo 05/10)');
{
  const LISTA=[{name:'kennedy',conectado:true,dono:'5535999990000'},{name:'luana',conectado:true,perfil:'Luana'},
    {name:'ana',conectado:false},{name:'velho',erro:'token da instância inválido'}];
  const ctx={esc:(s)=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
    fmtFoneWa:(j)=>String(j||''),toast:()=>{},
    PERFIS:[{id:'u1',nome:'Kennedy Lima'},{id:'u2',nome:'Gabriel Souza'},{id:'u3',nome:'Ana Paula'}],
    US_WA:LISTA,document:{getElementById:()=>null}};
  ctx.instDe=(nome)=>LISTA.find(i=>i.name===String(nome).split(' ')[0].toLowerCase())||null;
  const g=rodar(bloco('function usWaEstado(','async function usWaCarregar('),ctx,['usWaEstado','usWaCelula','usWaSecao']);
  const cel=(id)=>g.usWaCelula(ctx.PERFIS.find(u=>u.id===id));
  ok('pessoa sem número ganha o botão cadastrar', /sem número/.test(cel('u2'))&&cel('u2').indexOf("usWaCadastrar('u2')")>0);
  ok('conectado só mostra o status', /conectado/.test(cel('u1'))&&!/button/.test(cel('u1')));
  ok('desconectado continua com o QR', cel('u3').indexOf("usWaConectar('ana')")>0);
  ok('token inválido oferece trocar token', g.usWaEstado(LISTA[3]).indexOf("usWaToken('velho')")>0);
  /* a seção lista só quem não casa com ninguém pelo primeiro nome */
  const el={innerHTML:''}; g.document={getElementById:(id)=>id==='usWaSec'?el:null}; g.usWaSecao();
  ok('seção mostra número sem usuário (luana, velho)', el.innerHTML.indexOf('<b>luana</b>')>0&&el.innerHTML.indexOf('<b>velho</b>')>0);
  ok('seção não repete número de quem já tem usuário', el.innerHTML.indexOf('<b>kennedy</b>')<0&&el.innerHTML.indexOf('<b>ana</b>')<0);
  ok('seção tem o botão de número novo', el.innerHTML.indexOf('usWaNovo()')>0&&/4 cadastrados · 2 sem usuário/.test(el.innerHTML));
  ok('o container fica embaixo da tabela de Usuários', HTML.indexOf('</tbody></table></div>\n   <div id="usWaSec"></div>')>0);
  ok('módulo novo com cache novo', HTML.indexOf('comercial/instancias.js?v=5')>0);
  const IJ=fs.readFileSync(path.join(__dirname,'..','comercial','instancias.js'),'utf8');
  ok('instancias.js tem o formulário (gerar ou colar token)', IJ.indexOf('window.instCadastrar=')>0&&IJ.indexOf("api('criar',{name})")>0&&IJ.indexOf("api('cadastrar',{name,token:tk})")>0);
  ok('token vai em campo de senha, nunca em texto aberto', /id="inst_tk" type="password"/.test(IJ)&&/id="inst_adm" type="password"/.test(IJ));
  ok('depois de cadastrar abre o QR se não estiver conectado', IJ.indexOf('if(!d.conectado) setTimeout(()=>instConectar(name),150);')>0);
}

/* ---------------- Contrato sai direto em Word ---------------- */
grupo('Contratos: Word direto, PDF pelo Word e assinatura no gov.br (Bernardo 05/10)');
{
  ok('a aba Contratos baixa o .docx direto (sem o editor de parágrafos)', HTML.indexOf("await ctGerar(ctModelo,d,'Contrato-'+ctModelo+'-'+nome);")>0&&HTML.indexOf('ctEditor(')<0);
  ok('o editor que perdia negrito saiu inteiro', HTML.indexOf('function ctAplica(')<0&&HTML.indexOf('ct-folha')<0&&HTML.indexOf('CT_ED')<0);
  ok('o .docx sai compactado (antes ~950 KB)', /generateAsync\(\{type:'blob',compression:'DEFLATE'/.test(HTML));
  ok('o contrato continua guardado em contratos_gerados', /async function ctGerar[\s\S]{0,900}from\('contratos_gerados'\)\.insert/.test(HTML));
  /* os passos: monta o aviso num DOM de mentira e confere o texto */
  let html='';
  const el={className:'',set innerHTML(v){ html=v; },get innerHTML(){ return html; },querySelectorAll:()=>[],onclick:null};
  const g=rodar(bloco('function ctPassosWord(','/* ---- tela ---- */'),{
    esc:(s)=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
    CT_CLIENTE:[['rep_rg','RG do representante']],CT_NEGOCIO:[],
    document:{createElement:()=>el,body:{appendChild:()=>{}}}},['ctPassosWord']);
  g.ctPassosWord('Contrato-marketing-Loja.docx',['rep_rg'],true);
  ok('o aviso diz o nome do arquivo e que ficou guardado', html.indexOf('Contrato-marketing-Loja.docx')>0&&/ficou guardado no sistema/.test(html));
  ok('o aviso lista o que ficou em branco pelo nome do campo', /Ficaram em branco: RG do representante/.test(html));
  ok('os três passos: Word, PDF e gov.br', /Ajuste no Word/.test(html)&&/Salvar como › PDF/.test(html)&&/assinador\.iti\.br/.test(html));
  g.ctPassosWord('x.docx',[],false);
  ok('sem campo em branco nem arquivo guardado, não promete o que não houve', !/Ficaram em branco/.test(html)&&!/ficou guardado/.test(html));
}

/* ---------------- Novas Contas: a fila no Financeiro ---------------- */
grupo('Novas Contas: pedido do Suporte cai na fila do Financeiro e telas conferem no banco (Bernardo 05/10)');
{
  ok('a lista Novas Contas abre a fila (restrito continua no formulário)', HTML.indexOf("if(TK.listaSel===NC_LISTA&&TK.escopo==='lista'){ return restrito()?ncFormulario(c):ncFila(c); }")>0);
  ok('a fila tem o botão de pedir dali mesmo', HTML.indexOf('onclick="ncNovaAqui()">+ Nova conta</button>')>0);
  ok('Minhas tarefas confere no banco ao abrir', HTML.indexOf("tkRevalidar(()=>TK.escopo==='minhas'&&currentView==='lista',()=>tkDesenhar($('#content')));")>0);
  ok('Trabalho (modo pessoal) confere no banco', HTML.indexOf("if(mpTrab()) tkRevalidar(()=>currentView==='pessoal',mpPintar);")>0);
  /* ordem da fila: em aberto primeiro, mais novo em cima; resolvidos depois */
  const ST={a:{id:'a',grupo:'nao_iniciado'},b:{id:'b',grupo:'ativo'},f:{id:'f',grupo:'feito'}};
  const T=[{id:'velho',lista_id:'NC',status_id:'a',criado_em:'2026-10-01',valores:{}},
           {id:'pago',lista_id:'NC',status_id:'f',criado_em:'2026-10-04',valores:{}},
           {id:'super',lista_id:'NC',status_id:'a',criado_em:'2026-10-05T14:28',valores:{}},
           {id:'arq',lista_id:'NC',status_id:'a',criado_em:'2026-10-05',arquivada_em:'x',valores:{}},
           {id:'outra',lista_id:'X',status_id:'a',criado_em:'2026-10-05',valores:{}}];
  const ctx={TK:{tarefas:T},NC_LISTA:'NC',NC_C:{sol:'s',rec:'r',anexo:'x',dep:'d',val:'v',venc:'w'},NC_AGUARDA:'z',
    arquivada:(t)=>!!t.arquivada_em,tkStatus1:(id)=>ST[id],tkSelo:(t)=>'['+t.id+']',esc:(s)=>String(s==null?'':s),brl:(v)=>'R$'+(v||0),fmtDate:(d)=>d};
  const g=rodar(bloco('function ncAprovarHTML(','window.ncAprovar='),ctx,['ncAprovarHTML']);
  const g2=rodar('const ncAprovarHTML=()=>"";'+bloco('function ncUltimasHTML(','/* Fila de Novas Contas'),ctx,['ncUltimasHTML']);
  const ordem=(h)=>(h.match(/tkAbrir\('([a-z]+)'\)/g)||[]).map(x=>x.slice(9,-2)).join(',');
  ok('fila: em aberto primeiro (mais novo em cima), depois os resolvidos', ordem(g2.ncUltimasHTML(0,true))==='super,velho,pago');
  ok('arquivado (cancelado) e outra lista não entram', !/arq|outra/.test(ordem(g2.ncUltimasHTML(20))));
  ok('o título abre o pedido completo', g2.ncUltimasHTML(0,true).indexOf("tkAbrir('super')")>0);
  ok('na fila não repete o título "Solicitações da equipe"; em Contas a Pagar continua', g2.ncUltimasHTML(0,true).indexOf('Solicitações da equipe')<0&&g2.ncUltimasHTML(20).indexOf('Solicitações da equipe')>0);
}

/* ---------------- Grupo com valor fechado (conta paga pela principal) ---------------- */
grupo('Grupo com valor fechado: conta coberta pela principal (Bernardo 05/10)');
{
  const FICHAS=[{id:'P',nome:'ALTOGIRO | JÔ ARAUJO'},{id:'A',nome:'ALTOGIRO | MAYCON',pagaPor:'P'},
    {id:'S',nome:'SABARÁ | CAYMAN',pagaPor:'P'},{id:'X',nome:'OUTRO | LOJA'}];
  const GR_SEP=/\s+[|│]\s+/;
  const ctx={DB:{projetos:FICHAS},MAIUS:(s)=>String(s).toUpperCase(),GR_SEP};
  const g=rodar(bloco('const grupoDe=(f)=>','/* contas ativas no Meta sem ficha'),ctx,['grupoDe','irmasDe','principalDoGrupo']);
  const F=(id)=>FICHAS.find(x=>x.id===id);
  ok('conta coberta aponta pra principal', g.principalDoGrupo(F('A'))==='P');
  ok('a própria principal acha o grupo fechado pelas irmãs', g.principalDoGrupo(F('P'))==='P');
  ok('Sabará (outro grupo, mesmo pagamento) também', g.principalDoGrupo(F('S'))==='P');
  ok('cliente comum não tem principal', g.principalDoGrupo(F('X'))==='');
  ok('situação de pagamento da coberta é a da principal', HTML.indexOf("if(f&&f.pagaPor&&f.pagaPor!==f.id){ const pr=fichaDe(f.pagaPor); if(pr&&!pr.pagaPor) return lcPgDe(pr); }")>0);
  ok('novo contrato em grupo fechado: R$ 0, sem Asaas, manda pagaPor', HTML.indexOf("pagaPor:princ||''}")>0&&HTML.indexOf("if(!(valor>0)&&!princ){ toast('Informe a mensalidade.')")>0&&HTML.indexOf("${princ?'':`<label class=\"tk-chkline\"><input type=\"checkbox\" id=\"nc2_asaas\">")>0);
}

/* ---------------- Logo dos relatórios: tirar e trocar ---------------- */
grupo('Logo dos relatórios: dá pra tirar e escolher qual vai (Bernardo 05/10)');
{
  ok('cartão da logo dos relatórios tem o x na ficha', HTML.indexOf(`onclick="lgTirarRel('\${esc(fid)}')">&times;</button>`)>0);
  ok('imagem da ficha tem "Usar nos relatórios"', HTML.indexOf(`onclick="lgUsarRel('\${x.id}','\${esc(fid)}')">\${LG_REL}</button>`)>0);
  ok('tirar limpa a logo do cliente e a da conta de anúncio dele', /window\.lgTirarRel=[\s\S]{0,600}logoSalvar\(logoFichaKey\(fid\),''\)[\s\S]{0,300}logoSalvar\(m\.id,''\)/.test(HTML));
  ok('usar gera a miniatura do arquivo guardado', /window\.lgUsarRel=[\s\S]{0,500}lgMiniatura\(new File\(\[blob\]/.test(HTML));
}

grupo('Controle de Clientes: Conta de anúncios no card (Bernardo 05/10)');
{
  const card=(gid)=>({valores:{G:gid}});
  const ctx={LC_GEST:'G',RW_BM:{nome:'Sintese Solucoes Tecnologicas LTDA',id:'1336723773532458'},esc:(x)=>String(x),
    RW_IC_META:'[m]',RW_IC_LINK:'[l]',currentUser:{id:'u1',role:'membro'},
    fichaDe:(id)=>({id}),fichaNoMeuSquad:(f)=>!!f&&f.id==='f_meu',
    contasDoCliente:(fid)=>fid==='f_com'?[{id:'act_1',nome:'MARCA'},{id:'act_2'}]:[],
    __mtDados:[{id:'act_1',nome:'CONTA NO META'}]};   /* o rodar() faz window = contexto */
  const g=rodar(bloco('function rwPodeConta(','window.rwTkContaAjuda='),ctx,['rwPodeConta','rwTkConta','rwBmAjudaHTML']);
  ok('gestor do card liga a conta', g.rwPodeConta('f_x',card('u1'))===true);
  ok('gestor de outro card não liga', g.rwPodeConta('f_x',card('u2'))===false&&g.rwPodeConta('f_x',card(''))===false);
  g.currentUser={id:'u9',role:'master'}; ok('master liga em qualquer card', g.rwPodeConta('f_x',card(''))===true);
  g.currentUser={id:'u7',role:'membro',gerente:true};
  ok('gerente liga só na carteira dele', g.rwPodeConta('f_meu',card(''))===true&&g.rwPodeConta('f_x',card(''))===false);
  ok('sem cliente no card não liga', g.rwPodeConta('',card('u7'))===false);
  ok('mostra o nome da conta no Meta, o ID e quantas mais', /CONTA NO META · act_1 \+1/.test(g.rwTkConta('f_com',true)));
  ok('quem pode: chip abre o seletor da aba (rwEscolherConta)', /rwTkContaEscolher\('f_com'\)/.test(g.rwTkConta('f_com',true))&&/ligar conta/.test(g.rwTkConta('f_sem',true)));
  ok('quem não pode: só lê, sem botão', !/onclick/.test(g.rwTkConta('f_com',false))&&/nenhuma conta ligada/.test(g.rwTkConta('f_sem',false)));
  ok('o "?" traz a BM e o ID pra copiar', /Sintese Solucoes Tecnologicas LTDA/.test(g.rwBmAjudaHTML())&&/1336723773532458/.test(g.rwBmAjudaHTML())&&/rwBmCopiar/.test(g.rwBmAjudaHTML()));
  ok('o seletor do card é o mesmo da aba', HTML.indexOf("window.rwTkContaEscolher=(fid)=>rwEscolherConta(fid,")>0);
  ok('o campo fica no card do Controle de Clientes, abaixo do Grupo WhatsApp', /id="tkRwG"[\s\S]{0,400}Conta de anúncios[\s\S]{0,300}id="tkRwC"/.test(HTML));
}

/* ---------------- conta coberta: vencimento igual aos outros ---------------- */
grupo('Controle de Clientes: conta paga pela principal mostra o vencimento dela (Bernardo 06/10)');
{
  ok('a coluna não escreve mais "pela <conta>"', HTML.indexOf('">pela ${esc(contaSufixo(pr))}</span>')<0);
  ok('a conta coberta usa o dia de vencimento do card da principal', HTML.indexOf("const d=Number(((pc&&pc.valores)||t.valores||{})[LC_VENC])||0;")>0);
  const g=rodar(bloco('function vencOf(comp,dia){','\n}')+'\n}',{},['vencOf']);
  ok('dia 30 vira o último dia em fevereiro', g.vencOf('2027-02',30)==='2027-02-28'&&g.vencOf('2026-10',30)==='2026-10-30');
}

/* ---------------- melhoria interna dispensa o cliente ---------------- */
grupo('Tarefa: "Melhoria interna" substitui o cliente obrigatório (Bernardo 06/10)');
{
  const g=rodar(bloco('function tkFaltaObrig(v){','/* selo do rascunho'),{tkPessoal:()=>false,
    exigeDaLista:(l)=>l==='CAMP'?['cliente']:[]},['tkFaltaObrig']);
  const base={lista_id:'CAMP',prazo:'2026-10-10',responsaveis:['u1']};
  ok('lista que exige cliente: sem cliente fica em rascunho', g.tkFaltaObrig(Object.assign({},base)).join()==='cliente');
  ok('marcou melhoria interna: sai do rascunho sem cliente', g.tkFaltaObrig(Object.assign({interna:true},base)).length===0);
  ok('melhoria interna não dispensa data nem responsável', g.tkFaltaObrig({lista_id:'CAMP',interna:true}).join()==='data,responsável');
  ok('o checkbox aparece só onde o cliente é obrigatório e grava junto', HTML.indexOf('id="tk_interna"')>0&&HTML.indexOf("if($('#tk_interna')) v.interna=!!$('#tk_interna').checked;")>0);
}

/* ---------------- Respostas: planilha estilo Yay ---------------- */
grupo('Lista de leads de formulário abre como a planilha de respostas do Yay (Bernardo 08/10)');
{
  const C=[{id:'w',lista_id:'L',nome:'WhatsApp',tipo:'link'},{id:'i',lista_id:'L',nome:'Instagram',tipo:'texto'},
           {id:'d',lista_id:'L',nome:'Preencheu em',tipo:'data'},{id:'c',lista_id:'L',nome:'Cargo',tipo:'select'}];
  const T=[{id:'a',lista_id:'L',titulo:'Ana',criado_em:'2026-10-08',valores:{w:'https://wa.me/5511999990000',i:'@ana',d:'2026-10-05',c:'Dono(a)'}},
           {id:'b',lista_id:'L',titulo:'Bia',criado_em:'2026-10-08',valores:{d:'2026-10-07',c:'Gerente'}},
           {id:'x',lista_id:'L',titulo:'Velho',criado_em:'2026-10-08',arquivada_em:'z',valores:{d:'2026-10-08'}}];
  const g=rodar(bloco('/* ======================= RESPOSTAS (Bernardo 08/10)','function tkViewLista(){'),{
    TK:{listaSel:'L',tarefas:T,campos:C.concat([{id:'o',lista_id:'O',nome:'Outra',tipo:'texto'}])},
    tkCamposDe:(l)=>C.filter(c=>c.lista_id===l),arquivada:(t)=>!!t.arquivada_em,tkSelo:(t)=>'[st:'+t.id+']',
    esc:(s)=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
    campoTexto:(c,v)=>String(v),tpSvg:()=>'<svg></svg>',PC_IC:{ig:'<svg class="ig"></svg>',sa:'',lap:'<svg class="lap"></svg>'}},['crmForm','tkViewRespostas','rspData','rspCel','rspIgDe','rspIgBtn']);
  ok('lista com "Preencheu em" é de formulário; as outras não', g.crmForm('L')===true&&g.crmForm('O')===false);
  const h=g.tkViewRespostas();
  ok('mais novo em cima, arquivado fora', h.indexOf('>Bia<')>0&&h.indexOf('>Bia<')<h.indexOf('>Ana<')&&h.indexOf('Velho')<0);
  ok('contagem de respostas', /2 respostas/.test(h));
  ok('data curta dd/mm/aa', g.rspData('2026-10-05')==='05/10/26');
  ok('WhatsApp vira o número escrito, com copiar e link pra conversa', /class="rsp-num"[^>]*>\(11\) 99999-0000</.test(h)&&/href="https:\/\/wa.me\/5511999990000"/.test(h));
  ok('Instagram vira o botão da ficha do cliente, com o @', /class="pc-chip rsp-ig" href="https:\/\/instagram.com\/ana"[^>]*><span class="pc-ci ig"><svg class="ig"><\/svg><\/span><span>@ana<\/span>/.test(h));
  ok('Instagram: link, @ e usuário solto viram o usuário', g.rspIgDe('https://www.instagram.com/sr.sofa1429?stkn=x')==='sr.sofa1429'&&g.rspIgDe('@@loja_ ')==='loja_'&&g.rspIgDe('Belaarte')==='Belaarte');
  {
    const ci={id:'i',nome:'Instagram',tipo:'texto'}, x=g.rspCel(ci,'Não temos',{id:'z'}), vz=g.rspCel(ci,'',{id:'z'}), ok1=g.rspCel(ci,'@ana',{id:'z'});
    ok('Instagram que não é @: x pequeno, o que o lead escreveu e o lápis sempre à vista', /class="rsp-ig-x"/.test(x)&&/>Não temos</.test(x)&&/class="rsp-ig-ed sempre"/.test(x));
    ok('Instagram vazio: só o lápis pra adicionar', vz.indexOf('rsp-ig-x')<0&&/Adicionar o Instagram/.test(vz));
    ok('Instagram certo: botão da ficha + lápis que aparece no hover', /pc-chip rsp-ig/.test(ok1)&&/class="rsp-ig-ed"/.test(ok1)&&ok1.indexOf('rsp-ig-x')<0);
    ok('lápis abre a edição na própria célula e grava pelo tkPatch', HTML.indexOf("rspIgEditar(this,'${t.id}','${c.id}')")>0&&/window\.rspIgEditar=[\s\S]{0,1200}tkPatch\(tid,\{valores:val\}/.test(HTML));
  }
  ok('Instagram: resposta que não é @ fica sem botão', g.rspIgDe('Não temos')===''&&g.rspIgDe('Fenix estofados')===''&&g.rspIgDe('')==='');
  ok('Lista: botão do Instagram só com @ válido', /class="tk-ig" href="https:\/\/instagram.com\/ana"/.test(g.rspIgBtn(T[0]))&&g.rspIgBtn(T[1])===''
    &&HTML.indexOf("crmForm(t.lista_id)?rspWaBtn(t)+rspIgBtn(t):''")>0);
  ok('sem a coluna Status na linha: a etapa já separa (Bernardo 08/10)', h.indexOf('[st:a]')<0);
  ok('lista de formulário abre em Respostas por padrão', HTML.indexOf("crmForm(id)?'tabela':")>0&&HTML.indexOf("TK.visao==='tabela'?tkViewRespostas():")>0);
}

/* ---------------- filtro sem Prioridade no CRM de formulário (Bernardo 08/10) ---------------- */
grupo('Lead de formulário não tem filtro de prioridade (Bernardo 08/10)');
{
  ok('a seção Prioridade some no CRM de formulário', HTML.indexOf("${tkFSemPrio()?'':`<div class=\"tkp-sec\" style=\"margin-top:14px\">Prioridade</div>")>0);
  ok('prioridade guardada não filtra o lead', HTML.indexOf("if(F.prios&&F.prios.length&&!tkFSemPrio()) arr=arr.filter(")>0);
  ok('nem conta no número do funil', HTML.indexOf("((F.prios&&F.prios.length&&!tkFSemPrio())?1:0)")>0);
  ok('vale só pra lista de formulário', HTML.indexOf("const tkFSemPrio=()=>TK.escopo==='lista'&&typeof crmForm==='function'&&crmForm(TK.listaSel);")>0);
}
/* ---------------- prioridade como bandeira (Bernardo 08/10) ---------------- */
grupo('Prioridade como bandeira no filtro e no menu rápido (Bernardo 08/10)');
{
  ok('filtro: cada prioridade é uma bandeira na cor dela', HTML.indexOf('class="tkp-chip tkp-prio${on?\' on\':\'\'}" style="--c:${cor}"')>0&&/tkp-prio[\s\S]{0,200}\$\{prioFlag\(cor,on\)\}/.test(HTML));
  ok('menu rápido da prioridade usa a bandeira, não o quadradinho', HTML.indexOf("${prioFlag(PRIO_COR[k],(t.prioridade||'med')===k)}")>0&&HTML.indexOf('border-radius:3px;background:${PRIO_COR[k]}')<0);
}

/* ---------------- filtro de data: atalhos + calendário (Bernardo 08/10) ---------------- */
grupo('Filtro de data: atalhos à esquerda e calendário do mês (Bernardo 08/10)');
{
  const F={prazo:'',de:'',ate:'',prios:[],resps:[]};
  const g=rodar(bloco('function tkDiaMais(','/* Redesenhar a mesma lista'),{TK:{filtro:F},tkHoje:()=>'2026-10-08',
    esc:(x)=>String(x==null?'':x),PRIO_COR:{urgente:'#e',alta:'#a',med:'#m',baixa:'#b'},TK_PRIO:{urgente:'Urgente',alta:'Alta',med:'Normal',baixa:'Baixa'},
    prioFlag:()=>'<i></i>',TK_MESES:['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'],
    svgIco:()=>'',avatar:()=>'',localStorage:{setItem(){}},tkDesenhar(){},$:()=>null,
    document:{getElementById:()=>null,addEventListener(){},removeEventListener(){}}},['tkPopFiltroHTML','tkPrazoBate']);
  let h=g.tkPopFiltroHTML();
  ok('atalhos na coluna da esquerda e o calendário do mês de hoje', /class="tkc-lado"/.test(h)&&/Outubro 2026/.test(h)&&h.indexOf('type="date"')<0&&/class="tkc-d hoje"[^>]*>8</.test(h));
  g.tkCalDia('2026-10-15');
  ok('1º clique marca o dia e já filtra só ele', F.de==='2026-10-15'&&F.ate==='2026-10-15'&&F.prazo==='');
  g.tkCalDia('2026-10-09');
  h=g.tkPopFiltroHTML();
  ok('2º clique fecha o período (antes do 1º, inverte)', F.de==='2026-10-09'&&F.ate==='2026-10-15'&&/09\/10\/26 → 15\/10\/26/.test(h)&&(h.match(/tkc-d den ponta/g)||[]).length===2);
  g.tkFPrazo('prox7'); h=g.tkPopFiltroHTML();
  ok('atalho limpa o período e fica marcado', F.de===''&&F.ate===''&&F.prazo==='prox7'&&/class="tkc-at on"[^>]*>Próximos 7 dias</.test(h));
  g.tkCalMes(1);
  ok('setas trocam o mês', /Novembro 2026/.test(g.tkPopFiltroHTML()));
}

/* ---------------- Equipe v2 do CRM Sofás (Bernardo 08/10) ---------------- */
grupo('Equipe do CRM Sofás: resumo, status no avatar e conectar pelo QR ali mesmo (Bernardo 08/10)');
{
  const els={content:{innerHTML:''}};
  const cfg={pode_editar:true,pausado:true,vez:0,placar:{bernardo:1},atualizado_por:'u1',atualizado_em:'2026-10-08T20:08:00Z',
    vendedores:[{apelido:'bernardo',perfil_id:'u1',ativo:true},{apelido:'kennedy',perfil_id:'u2',ativo:true},{apelido:'jose',perfil_id:'u3',ativo:false}]};
  const inst=[{name:'bernardo',conectado:true,dono:'5524999211100'},{name:'kennedy',conectado:false,ultimaQueda:'2026-10-08T19:40:00Z'}];
  const ctx={__EQ:{cfg,inst,carregou:true},currentView:'crm-equipe',currentUser:{role:'master'},$:(s)=>els.content,
    esc:(x)=>String(x==null?'':x),tkCrumb:()=>'',tkNomeUser:(id)=>({u1:'Bernardo Antunes',u2:'Kennedy Lima',u3:'José'})[id],
    avatar:()=>'<span class="eq-av"></span>',inicial:(n)=>String(n||'?')[0],TK:{equipe:[]},toast(){},document:{getElementById:()=>null}};
  /* o bloco declara o próprio EQ vazio: os dados do teste entram depois dele */
  const g=rodar(bloco('/* ======================= CRM SOFÁS › EQUIPE (Bernardo 08/10)','async function renderPesquisa(c){')+'\n;EQ=__EQ;',ctx,['eqDesenhar']);
  g.eqDesenhar(); const h=els.content.innerHTML;
  ok('disparo em destaque com o estado e o resumo em 3 números', /class="eq-disp"[^>]*--c:var\(--warn\)/.test(h)&&/Conectados<\/small><b>1 <em>de 3/.test(h)&&/Leads em 30 dias<\/small><b>1</.test(h));
  ok('pontinho de status no avatar (conectado, desconectado, sem número)', /eq-dot ok/.test(h)&&/eq-dot bad/.test(h)&&/eq-dot warn/.test(h));
  ok('desconectado: Reconectar pelo QR, com a hora em que caiu', /onclick="eqConectar\('kennedy'\)"[^>]*>[\s\S]{0,400}Reconectar \(QR\)/.test(h)&&/desconectado<span class="eq-stx">caiu /.test(h));
  ok('sem número: Conectar WhatsApp ali mesmo (master), sem o texto "sem número / nunca conectou"', /onclick="eqNovoNumero\('jose'\)"/.test(h)&&!/sem número|nunca conectou/.test(h));
  ok('o switch do rodízio fica sem o rótulo "No rodízio"', h.indexOf('No rodízio')<0&&/class="eq-sw/.test(h));
  ok('o switch do rodízio abre a linha, antes da posição e da foto', /<div class="eq-row[^"]*">\s*<div class="eq-rod"><button type="button" class="eq-sw/.test(h)&&h.indexOf('eq-rod')<h.indexOf('eq-avw'));
  ok('quem não está conectado ganha a vaga vazia do Testar (o botão principal alinha)', (h.match(/class="eq-tst vazio"/g)||[]).length===2&&(h.match(/class="eq-tst" onclick/g)||[]).length===1);
  ok('fora do rodízio não mostra mais o pontinho no lugar da posição', h.indexOf('<b>·</b>')<0);
  ok('quem saiu do rodízio fica separado embaixo', h.indexOf('Fora do rodízio')>0&&h.indexOf('Fora do rodízio')<h.indexOf("eqNovoNumero('jose')"));
  ok('pausado: o próximo da vez não depende de estar conectado (igual à edge lead)', /Próximo da vez<\/small><b>Bernardo</.test(h)&&/class="eq-row vez"/.test(h));
  g.currentUser.role='gestor'; g.eqDesenhar();
  ok('gestor não gera número (usa o token admin): só o aviso', els.content.innerHTML.indexOf("eqNovoNumero('jose')")<0&&/só master gera o número/.test(els.content.innerHTML));
  ok('o botão abre o "Gerar número novo" do instancias.js com o apelido', HTML.indexOf("instCadastrar(ap,v.perfil_id?")>0&&HTML.indexOf("{modo:'gerar'}")>0);
}

/* ---------------- CRM de formulário com o visual do Controle de Clientes ---------------- */
grupo('Respostas: mesmo visual do Controle de Clientes, colunas separadas (Bernardo 08/10)');
{
  const cod=bloco('/* ======================= RESPOSTAS (Bernardo 08/10)','function tkViewLista(){');
  const C=[{id:'w',lista_id:'L',nome:'WhatsApp',tipo:'link'},{id:'d',lista_id:'L',nome:'Preencheu em',tipo:'data'},{id:'e',lista_id:'L',nome:'Estado',tipo:'texto'}];
  const g=rodar(cod,{TK:{listaSel:'L',tarefas:[{id:'a',lista_id:'L',titulo:'Ana',valores:{w:'https://wa.me/5511999990001',d:'2026-10-07',e:'SP'}}],campos:C,colsOff:{}},
    tkCamposDe:(l)=>C.filter(k=>k.lista_id===l),esc:(s)=>String(s==null?'':s),campoTexto:(c,v)=>String(v),arquivada:()=>false,
    tkSelo:()=>'<select></select>',tpSvg:()=>'',setTimeout:()=>0},['tkViewRespostas']);
  const h=g.tkViewRespostas();
  ok('usa a tabela do Controle de Clientes (linha entre todas as colunas)', /<table class="tk-tab lc-tab" id="rspTab"/.test(h));
  ok('Nome e o relógio "No funil" nas duas primeiras colunas, sem Status', h.indexOf('>Nome</span>')<h.indexOf('No funil')&&h.indexOf('>Status<')<0);
  ok('valor curto (estado, data) fica no meio da coluna', /<td class="tk-cen">SP<\/td>/.test(h));
  ok('largura: cada título tem a borda de arrastar (como no ClickUp)', (h.match(/class="rsp-grip"/g)||[]).length>=4&&/rspArrasta\(event,'nome'\)/.test(h));
  ok('largura: tabela fixa, senão o texto não deixa a coluna diminuir', /#rspTab\{table-layout:fixed\}/.test(HTML)&&/id="rspTab" style="width:\d+px"/.test(h));
  ok('largura: fica só na memória da página (recarregou, volta ao padrão)', HTML.indexOf("let RSP={dir:-1,sel:{},q:'',larg:{}};")>0&&!/localStorage[^\n]*RSP\.larg/.test(HTML));
  ok('fixa as colunas depois de desenhar, como o Controle de Clientes', /lcFixarColunas\(\$\('#content'\)\)/.test(cod));
}

/* ---------------- Agenda do CRM ---------------- */
grupo('Agenda do CRM: calls de 1 h, 30 min de folga, sugestões e os ganchos (Bernardo 08/10)');
{
  const cod=bloco('/* ======================= AGENDA DO CRM (Bernardo 08/10)','/* ======================= CARTÃO DO LEAD (Bernardo 08/10)');
  const iso=(d)=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const g=rodar(cod,{tkISO:iso,tkHoje:()=>'2026-10-12',localStorage:{getItem:()=>null,setItem:()=>{}},TK:{tarefas:[],equipe:[]}},['caSlots','caSugestoes','caForm']);
  const livre=(sl,hm)=>{ const m=Number(hm.slice(0,2))*60+Number(hm.slice(3)); const x=sl.find(s=>s.s===m); return x&&x.livre; };
  const sl=g.caSlots([[9*60,10*60]],null);
  ok('call das 9h às 10h: 9:30 e 10:00 ficam ocupados (sem folga)', !livre(sl,'09:30')&&!livre(sl,'10:00'));
  ok('call das 9h às 10h: a próxima pode às 10:30', livre(sl,'10:30'));
  ok('call das 14h: 12:30 cabe (termina 13:30, folga de 30 min), 13:00 não', (s=>livre(s,'12:30')&&!livre(s,'13:00'))(g.caSlots([[14*60,15*60]],null)));
  ok('última call começa às 17h (nunca à noite)', sl[sl.length-1].s===17*60);
  ok('hoje: só a partir de 1 h depois de agora', (s=>!livre(s,'10:30')&&livre(s,'11:00'))(g.caSlots([],10*60)));
  const vazio=g.caSugestoes(()=>[], '2026-10-12', null, 3);
  ok('agenda vazia: primeira sugestão é 9h de hoje', vazio[0].dia==='2026-10-12'&&vazio[0].s===540&&vazio[0].motivo==='agenda livre no dia');
  ok('sugestões do mesmo dia ficam 2 h uma da outra', vazio.length===3&&vazio[1].s-vazio[0].s>=120&&(vazio[2].dia!==vazio[1].dia||vazio[2].s-vazio[1].s>=120));
  const c9=g.caSugestoes((d)=>d==='2026-10-12'?[[540,600]]:[], '2026-10-12', null, 3);
  ok('com call às 9h: o mais cedo é 10:30 e a preferida fica 2 h longe (12:00)', c9[0].s===630&&c9[0].motivo==='mais cedo livre'&&c9[1].s===720&&c9[1].motivo==='2 h de folga');
  const sab=g.caSugestoes(()=>[], '2026-10-10', null, 1);
  ok('sábado e domingo não entram: pula pra segunda', sab[0].dia==='2026-10-12');
  const F=CRM_FORMS_T;
  ok('cada CRM tem a sua lista Agenda', F.every(f=>f.agenda)&&new Set(F.map(f=>f.agenda)).size===F.length);
  ok('a Agenda abre a tela crm-agenda', /\.\.\.Object\.fromEntries\(CRM_FORMS\.map\(f=>\[f\.agenda,'crm-agenda'\]\)\)/.test(HTML)&&HTML.indexOf("if(view==='crm-agenda') return renderCaAgenda(c);")>0);
  ok('ir pra Reunião Marcada abre a janela de marcar', /if\(ok&&typeof caDepoisStatus==='function'\) caDepoisStatus\(id,sid\);/.test(HTML));
  ok('atalho ao lado do filtro, bloco no cartão e Google na Equipe', ['caAtalho():','caBoxLead(t):','caEqGoogle(v):'].every(k=>HTML.indexOf(k)>0));
  /* reunião/no-show só na Agenda, não na lista do Pipeline (Bernardo 08/10) */
  ok('lista do Pipeline sem "marcar horário", No-show e subgrupos A acontecer/No-show', HTML.indexOf('caChipLinha(t):')<0&&HTML.indexOf('rspNsBtn')<0&&HTML.indexOf('rspReuniao(')<0&&HTML.indexOf('no-show</small>')<0);
}

/* ---------------- Anexos nas anotações do lead ---------------- */
grupo('Cartão do lead: anexar arquivo nas anotações (Bernardo 08/10)');
{
  ok('botão Anexar arquivo, arrastar e colar no compositor', /class="cl-clip"[^\n]*onchange="clAnxEscolhe\(this\)"/.test(HTML)&&HTML.indexOf('ondrop="clAnxSolta(event)"')>0&&HTML.indexOf('onpaste="clAnxCola(event)"')>0);
  const cod=bloco('async function clNotas(tid){','window.clNotaApagar=async (mid)=>{');
  ok('linha do tempo junta anotações e anexos do lead', /from\('tarefa_comentarios'\)/.test(cod)&&/from\('tarefa_anexos'\)/.test(cod));
  ok('anexo sobe igual ao da tarefa (bucket anexos, envio em partes)', /axSubir\(chave,f,pinta\)/.test(cod)&&/'t\/'\+tid\+'\/'/.test(cod));
  ok('logo do cliente não aparece como anexo do lead', cod.indexOf('logo-')>0);
  ok('PDF e imagem abrem na prévia, o resto baixa', /tkmAnxPrever/.test(cod)&&/tkmAnxAbrir/.test(cod));
}

/* ---------------- Recebimentos: linha do grupo igual às contas ---------------- */
grupo('Recebimentos: linha do grupo (MEGA CENTER) igual às das contas (Bernardo 09/10)');
{
  const cod=bloco('const linhaGrupo=(g,m)=>{','rcGrIds={};');
  ok('grupo tem o Cobrei das contas, marcando todas de uma vez', /class="rc-cob"/.test(cod)&&/rc-cob-l/.test(cod)&&/rcCobradoGrupo\(this\.dataset\.g,this\.checked\)/.test(cod));
  ok('grupo tem Editar e ⋯ como as contas (pergunta qual conta)', /rcGrupoConta\(event,this\.dataset\.g,'editar'\)"[^>]*>Editar</.test(cod)&&/rcGrupoConta\(event,this\.dataset\.g,'acoes'\)"[^>]*>⋯</.test(cod));
  ok('sai o botão Ver/Fechar contas (abre pelo nome, com a setinha)', cod.indexOf('Fechar contas')<0);
  ok('status com o mesmo tamanho em todas as linhas', /#cBody \.stSel\{width:100%;min-width:168px\}/.test(HTML));
}

console.log('\n'+(falhas
  ? '\x1b[31m>>> '+falhas+' de '+total+' FALHARAM\x1b[0m\n'
  : '\x1b[32m>>> '+total+' verificações, todas passaram\x1b[0m\n'));
process.exit(falhas?1:0);
}
