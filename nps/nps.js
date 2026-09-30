'use strict';
/* Avaliação dos serviços da Auto Síntese (NPS), no lugar do formulário do Yay
   "Avaliação mensal dos serviços da Auto Síntese". São três formulários, um por
   serviço contratado (Gabriel 30/09):
     autosintese.app.br/nps/trafego/            só tráfego pago
     autosintese.app.br/nps/agent-ia/           só Agent IA
     autosintese.app.br/nps/trafego-agent-ia/   tráfego pago + Agent IA
   Cada URL é uma página curta que define window.SERVICO e carrega este arquivo.

   Dois jeitos de abrir:
   - link do cliente (?r=<código>): o sistema cria o código quando o card vai para
     o Controle de Churns. A página já sabe a loja e o gerente, então não pergunta;
   - link solto (sem código): serve pra qualquer cliente, e a primeira pergunta é o
     nome da loja. "?g=joao" diz de qual gerente é a avaliação.

   A página só conversa com a edge function 'pesquisa', nunca com a tabela. A
   chave publicável abaixo é pública por definição: não é segredo.

   Diferenças conscientes em relação ao Yay:
   - o Yay perguntava o serviço e depois mostrava todas as perguntas pra todo mundo;
     aqui o serviço vem da URL e cada formulário só tem as perguntas dele;
   - a nota de indicação vai de 0 a 10 (escala oficial de NPS; no Yay era 1 a 10). */
const SUPA_URL='https://fuieonexmdupupcsyowg.supabase.co';
const SUPA_KEY='sb_publishable_2M_nKV965uoo-o0-rP3UmQ_o5mJBgfL';
const ENDPOINT=SUPA_URL+'/functions/v1/pesquisa';

const SERVICOS={trafego:'Tráfego pago',ia:'Agent IA',integrados:'Tráfego pago + Agent IA'};
/* serviço -> pasta da página (o sistema monta o link do cliente com isto) */
const PAGINAS={trafego:'trafego',ia:'agent-ia',integrados:'trafego-agent-ia'};
const SERV=(typeof window!=='undefined'&&SERVICOS[window.SERVICO])?window.SERVICO:'';

const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function uuidv4(){
  try{ if(crypto&&crypto.randomUUID) return crypto.randomUUID(); }catch(_){}
  const b=new Uint8Array(16);
  try{ crypto.getRandomValues(b); }catch(_){ for(let i=0;i<16;i++) b[i]=Math.floor(Math.random()*256); }
  b[6]=(b[6]&0x0f)|0x40; b[8]=(b[8]&0x3f)|0x80;
  const h=[...b].map(x=>x.toString(16).padStart(2,'0'));
  return h[0]+h[1]+h[2]+h[3]+'-'+h[4]+h[5]+'-'+h[6]+h[7]+'-'+h[8]+h[9]+'-'+h[10]+h[11]+h[12]+h[13]+h[14]+h[15];
}
/* o que vem no endereço: r = código do cliente, g = primeiro nome do gerente */
function lerLink(busca){
  const o={r:'',g:''};
  try{
    const q=new URLSearchParams(busca||'');
    const r=(q.get('r')||'').trim(); if(UUID_V4.test(r)) o.r=r.toLowerCase();
    const g=(q.get('g')||'').trim().toLowerCase(); if(/^[a-z]{2,30}$/.test(g)) o.g=g;
  }catch(_){}
  return o;
}

/* ---------- as perguntas, na ordem do formulário original ----------
   tipo: texto (curto) | longo | escolha | escala (0..10) | nota (1..10)
   so:   serviços em que a pergunta aparece (sem 'so' = aparece nos três)
   req:  obrigatória (igual ao Yay) */
const TRAF=['trafego','integrados'], IA=['ia','integrados'], INTEG=['integrados'];
const ZERO_DEZ={nada:'0 = Nada',muito:'10 = Muito'};
const PERGUNTAS=[
 {id:'loja', tipo:'texto', req:true, max:200,
  t:'Qual o nome da sua loja?'},
 {id:'nota_trafego', tipo:'nota', req:true, so:TRAF,
  t:'Como você avalia os serviços de tráfego?',
  d:'<strong>Considere</strong>: volume, alinhamento com a estratégia e perfil'},
 {id:'gestor_clareza', tipo:'escala', req:true, so:TRAF, rot:ZERO_DEZ,
  t:'O quanto o gestor de tráfego fornece informações claras e objetivas que ajudam a melhorar a tomada de decisão?'},
 {id:'nota_ia', tipo:'nota', req:true, so:IA,
  t:'Como você avalia os atendimentos e serviços da IA?',
  d:'<strong>Considere</strong>: cumprimento do objetivo previsto, triagem aos vendedores e tempo otimizado'},
 {id:'gerente_apoio', tipo:'escala', req:true, rot:ZERO_DEZ,
  t:'O quanto o gerente auxilia na correção de erros, ajustes solicitados e sucesso do projeto?'},
 {id:'aval_gerente', tipo:'longo', req:true,
  t:'Como você avalia o gerente do projeto?',
  d:'Gerente é aquele responsável por alinhamentos, desenvolvimento de estratégias e coordenação da operação'},
 {id:'aval_gestor', tipo:'longo', req:true, so:TRAF,
  t:'Como você avalia o gestor de tráfego do projeto?',
  d:'Gestor de tráfego é aquele responsável por garantir o saldo da conta, enviar relatórios, subir campanhas e acompanhar métricas.'},
 {id:'aval_projeto', tipo:'longo', req:true,
  t:'Como você avalia o projeto? Com a Auto Síntese, houve mudanças significativas no negócio?',
  d:'Exemplo: a gestão do comercial ficou mais clara, tempo de resposta melhorou muito, há muito mais demanda, entre outros cenários'},
 {id:'sugestoes', tipo:'longo',
  t:'Desde o início do projeto, quanto das sugestões propostas pelos gerentes, com base em outros negócios, foram acatadas e executadas pela loja? Ainda nesse aspecto, se aceitas, o quão benéficas foram?'},
 {id:'prazos', tipo:'escala', req:true, rot:{nada:'0 = Nada satisfatório',muito:'10 = Muito satisfatório'},
  t:'Em relação a prazos, o quão satisfatório se apresenta o cumprimento deles?',
  d:'Prazos para edição, subir campanhas, ajustes na IA, entre outras necessidades'},
 {id:'dependencia', tipo:'escala', req:true, rot:ZERO_DEZ,
  t:'Se a Auto Síntese deixasse de existir hoje, o quanto isso afetaria no seu negócio?'},
 {id:'ajustes_trafego', tipo:'longo', so:TRAF,
  t:'Quais ajustes você considera mais importantes no serviço de tráfego?'},
 {id:'ajustes_ia', tipo:'longo', so:IA,
  t:'Quais ajustes você considera mais importantes no serviço de IA?'},
 {id:'melhorias', tipo:'longo',
  t:'Caso queira, descreva pontos de melhoria na condução do projeto até aqui.'},
 {id:'pontos_fortes', tipo:'longo',
  t:'Caso queira, descreva pontos fortes da condução do projeto até aqui.'},
 {id:'integracao_tempo', tipo:'escala', req:true, so:INTEG, rot:ZERO_DEZ,
  t:'Considerando os dois serviços integrados, o quanto essa integração tem gerado melhora significativa na otimização de tempo dentro do processo comercial?'},
 {id:'integracao_valor', tipo:'longo', so:INTEG,
  t:'Considerando a integração entre os serviços, o que mais tem gerado valor para a sua operação?'},
 {id:'ponto_critico', tipo:'longo',
  t:'Há algum ponto crítico que precise de atenção imediata no seu projeto?'},
 {id:'prioridade', tipo:'escolha',
  t:'Em nível de importância e necessidade, qual dessas atualizações traria mais impacto ao projeto:',
  opcoes:[['integrador','Auto Síntese ser um integrador'],['social','Auto Síntese fornecer mais serviços de divulgação (social media)'],['ambos','Ambos'],['nenhum','Nenhum dos itens acima']]},
 {id:'nps', tipo:'escala', req:true, rot:{nada:'0 = Nada provável',muito:'10 = Extremamente provável'},
  t:'Com base na sua satisfação com o projeto, o quanto você estaria disposto a indicar os serviços da Auto Síntese para outro lojista?'},
 {id:'indicacao', tipo:'texto', max:500,
  t:'Deixe aqui as informações de contato desse lojista que você acredita que se beneficiaria dos nossos serviços:',
  d:'Nome do decisor, telefone de contato e nome da loja'}
];
const ehNumero=p=>p.tipo==='escala'||p.tipo==='nota';
/* a pergunta entra no formulário desse serviço? */
const aplica=(p,servico)=>!p.so||p.so.indexOf(servico)>=0;
/* a sequência de um formulário, na ordem. semLoja: link do cliente, a loja já é conhecida */
const visiveis=(servico,semLoja)=>SERVICOS[servico]?PERGUNTAS.filter(p=>aplica(p,servico)&&!(semLoja&&p.id==='loja')):[];
function respondida(p,v){
  if(ehNumero(p)){ const n=Number(v); const min=p.tipo==='nota'?1:0; return v!==''&&v!=null&&Number.isInteger(n)&&n>=min&&n<=10; }
  if(p.tipo==='escolha') return !!(p.opcoes||[]).find(o=>o[0]===v);
  const s=String(v==null?'':v).trim();
  return p.id==='loja'?s.length>=2:s.length>=1;
}
const valida=(p,v)=>p.req?respondida(p,v):(v==null||String(v).trim()===''||respondida(p,v));
/* o corpo que vai pra edge: só o que é desse formulário e está bem respondido */
function corpoDe(r,servico,semLoja){
  const o={};
  visiveis(servico,semLoja).forEach(p=>{ const v=(r||{})[p.id]; if(respondida(p,v)) o[p.id]=ehNumero(p)?Number(v):String(v).trim(); });
  return o;
}

/* ---------- montagem (só no navegador) ---------- */
if(typeof document!=='undefined') (function(){
const $=s=>document.querySelector(s);
const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const SETA='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';
const CHECK='<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M2.5 8.5 6 12l7.5-8"/></svg>';
const TOQUE=window.matchMedia&&matchMedia('(pointer:coarse)').matches;

if(!SERV){ document.body.innerHTML='<div style="padding:40px;font-family:Roboto,sans-serif">Link inválido.</div>'; return; }
$('#servNome').textContent=SERVICOS[SERV];

const LINK=lerLink(location.search);
const GUARDA='nps-v1-'+SERV+'-'+(LINK.r||'livre');
const salvo=(()=>{try{return JSON.parse(localStorage.getItem(GUARDA))||{}}catch(_){return {}}})();
const respostas=salvo.respostas||{};
const RID=LINK.r||salvo.rid||uuidv4();
let CTX=null;           // {loja, gerente, tipo}: só no link do cliente
let atualId=null;       // id da pergunta na tela (null = abertura)
let finalizado=false;
const semLoja=()=>!!(CTX&&CTX.loja);
const seq=()=>visiveis(SERV,semLoja());

$('#perguntas').innerHTML=visiveis(SERV,false).map(p=>{
  let campo='';
  if(p.tipo==='escolha'){
    campo=`<div class="opcs">${p.opcoes.map((o,k)=>`<button type="button" class="opc${respostas[p.id]===o[0]?' sel':''}" data-v="${o[0]}">
      <span class="let">${String.fromCharCode(65+k)}</span><span>${esc(o[1])}</span>
      <svg class="ok" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M2.5 8.5 6 12l7.5-8"/></svg></button>`).join('')}</div>`;
  } else if(ehNumero(p)){
    const de=p.tipo==='nota'?1:0, ns=[]; for(let n=de;n<=10;n++) ns.push(n);
    campo=`<div class="escala${de===1?' de1':''}">${ns.map(n=>`<button type="button" class="nota${String(respostas[p.id])===String(n)?' sel':''}" data-v="${n}">${n}</button>`).join('')}</div>
      ${p.rot?`<div class="rot"><span>${esc(p.rot.nada)}</span><span>${esc(p.rot.muito)}</span></div>`:''}`;
  } else if(p.tipo==='longo'){
    campo=`<textarea id="c-${p.id}" rows="1" maxlength="4000" placeholder="Digite sua resposta aqui...">${esc(respostas[p.id])}</textarea>`;
  } else {
    campo=`<div class="linha"><input id="c-${p.id}" type="text" maxlength="${p.max||300}" placeholder="Digite sua resposta aqui..." autocomplete="off" value="${esc(respostas[p.id])}"></div>`;
  }
  const dica=p.tipo==='longo'&&!TOQUE?'<span class="dica"><b>Shift ⇧ + Enter ↵</b> para fazer uma quebra de linha.</span>'
    :(p.tipo==='escolha'||ehNumero(p))?'':'<span class="dica">Pressione <b>Enter ↵</b></span>';
  return `
 <section class="tela perg" id="t-${p.id}">
  <div class="miolo">
   <div class="num"><span class="n"></span>${SETA}</div>
   <h2>${esc(p.t)}${p.req?' *':''}</h2>
   ${p.d?`<p class="desc">${p.d}</p>`:''}
   <div class="resp">${campo}</div>
   ${p.req?'':'<div class="opcional">Opcional</div>'}
   <div class="erro" id="e-${p.id}"></div>
   <div class="acao"><button class="btn" data-ok>OK ${CHECK}</button>${dica}</div>
  </div>
 </section>`;
}).join('');

function guardar(){ if(finalizado) return; try{localStorage.setItem(GUARDA,JSON.stringify({respostas,atualId,rid:RID}))}catch(_){} }
function limparErro(id){ const e=$('#e-'+id); if(e) e.classList.remove('on'); }
function crescer(el){ el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,320)+'px'; el.style.overflowY=el.scrollHeight>320?'auto':'hidden'; }

visiveis(SERV,false).forEach(p=>{
  const tela=$('#t-'+p.id);
  tela.querySelector('[data-ok]').addEventListener('click',avancar);
  if(p.tipo==='escolha'||ehNumero(p)){
    tela.querySelectorAll('[data-v]').forEach(b=>b.addEventListener('click',()=>escolher(p,b.dataset.v)));
    return;
  }
  const el=$('#c-'+p.id);
  if(p.tipo==='longo') setTimeout(()=>crescer(el),0);
  el.addEventListener('input',()=>{ respostas[p.id]=el.value; guardar(); limparErro(p.id); if(p.tipo==='longo') crescer(el); });
  el.addEventListener('keydown',ev=>{
    if(ev.key!=='Enter') return;
    if(p.tipo==='longo'&&(ev.shiftKey||TOQUE)) return;   // quebra de linha
    ev.preventDefault(); avancar();
  });
});

/* clique numa opção/nota: marca, pisca e avança sozinho (igual ao Yay) */
let passando=null;
function escolher(p,v){
  if(ehNumero(p)) v=Number(v);
  respostas[p.id]=v; guardar(); limparErro(p.id);
  const tela=$('#t-'+p.id);
  tela.querySelectorAll('[data-v]').forEach(b=>{ const on=String(b.dataset.v)===String(v); b.classList.toggle('sel',on); b.classList.toggle('pisca',on&&p.tipo==='escolha'); });
  clearTimeout(passando); passando=setTimeout(()=>{ if(atualId===p.id) avancar(); },p.tipo==='escolha'?520:340);
}

/* teclado: Enter na abertura; letras nas escolhas */
document.addEventListener('keydown',ev=>{
  if(ev.ctrlKey||ev.metaKey||ev.altKey) return;
  if(atualId===null&&$('#t-abre').classList.contains('ativa')){ if(ev.key==='Enter'&&!$('#btIniciar').disabled){ ev.preventDefault(); iniciar(); } return; }
  const p=PERGUNTAS.find(x=>x.id===atualId); if(!p) return;
  const alvo=ev.target&&ev.target.tagName;
  if(alvo==='INPUT'||alvo==='TEXTAREA') return;
  if(p.tipo==='escolha'){
    const k=ev.key.toUpperCase().charCodeAt(0)-65;
    if(ev.key.length===1&&k>=0&&k<p.opcoes.length){ ev.preventDefault(); escolher(p,p.opcoes[k][0]); return; }
  }
  if(ev.key==='Enter'){ ev.preventDefault(); avancar(); }
});

/* ---------- envio pra edge function ---------- */
async function enviarEdge(final){
  if(($('#hp_site')||{}).value) return {ok:true};
  const corpo=Object.assign(corpoDe(respostas,SERV,semLoja()),{id:RID,servico:SERV,final:!!final,ua:navigator.userAgent.slice(0,300)});
  if(LINK.g) corpo.g=LINK.g;
  const r=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPA_KEY},body:JSON.stringify(corpo)});
  let d={}; try{ d=await r.json(); }catch(_){}
  return {ok:r.ok&&d.ok!==false,status:r.status,d};
}
function sincronizar(){ enviarEdge(false).catch(()=>{}); }

/* ---------- navegação ---------- */
function mostrar(id){
  const s=seq();
  document.querySelectorAll('.tela').forEach(t=>t.classList.remove('ativa'));
  let alvo, pos=-1;
  if(id==='fim') alvo=$('#t-fim');
  else if(id===null) alvo=$('#t-abre');
  else { pos=s.findIndex(p=>p.id===id); alvo=$('#t-'+id); }
  alvo.classList.add('ativa'); atualId=(id==='fim')?'fim':id; guardar();
  const done=id==='fim'?s.length:Math.max(pos,0);
  const pct=Math.round(done/s.length*100);
  $('#barra i').style.width=pct+'%'; $('#barra').setAttribute('aria-label',pct+'% concluído');
  const naPergunta=pos>=0;
  $('#nav').hidden=!naPergunta; $('#navAnt').disabled=pos<=0;
  window.scrollTo(0,0);
  if(naPergunta){
    alvo.querySelector('.num .n').textContent=pos+1;
    const el=$('#c-'+id); if(el&&!TOQUE) setTimeout(()=>el.focus(),60);
  }
}
function iniciar(){ mostrar(seq()[0].id); }
window.iniciar=iniciar;
window.voltar=()=>{ const s=seq(), i=s.findIndex(p=>p.id===atualId); if(i>0) mostrar(s[i-1].id); };
function avancar(){
  if(atualId===null){ iniciar(); return; }
  const s=seq(), i=s.findIndex(p=>p.id===atualId); if(i<0) return;
  const p=s[i], v=respostas[p.id];
  if(!valida(p,v)){
    const e=$('#e-'+p.id);
    e.textContent=p.tipo==='escolha'||ehNumero(p)?'Esta etapa é necessária':'Por favor, preencha o campo corretamente';
    e.classList.add('on'); return;
  }
  if(i===s.length-1){ enviar(); return; }
  sincronizar();
  mostrar(s[i+1].id);
}
window.avancar=avancar;

let enviando=false;
async function enviar(){
  if(enviando) return; enviando=true;
  const ultimo=atualId;
  const btns=document.querySelectorAll('#t-'+ultimo+' .btn, #nav button');
  btns.forEach(b=>b.disabled=true);
  let res; try{ res=await enviarEdge(true); }catch(_){ res={ok:false}; }
  if(res.ok){
    finalizado=true;
    try{localStorage.removeItem(GUARDA)}catch(_){}
    mostrar('fim'); return;
  }
  enviando=false; btns.forEach(b=>b.disabled=false);
  const e=$('#e-'+ultimo);
  e.textContent=res.status===429
    ? 'Recebemos muitos envios agora há pouco. Aguarde um minuto e pressione OK de novo.'
    : (res.d&&res.d.erro==='incompleta')
      ? 'Faltou responder o nome da loja ou a nota de indicação. Volte e confira, por favor.'
      : 'Não foi possível enviar agora. Verifique sua conexão e pressione OK de novo, suas respostas estão guardadas.';
  e.classList.add('on');
}

/* retoma de onde parou */
function retomar(){
  if(finalizado) return;
  if(salvo.atualId&&salvo.atualId!=='fim'&&seq().some(p=>p.id===salvo.atualId)) mostrar(salvo.atualId);
}

/* ---------- link do cliente: a edge diz de quem é o código ---------- */
function aplicarContexto(d){
  if(!d||!d.existe) return;
  if(d.enviada){
    finalizado=true;
    $('#t-fim h1').textContent='Esta avaliação já foi respondida';
    $('#t-fim p').textContent='Recebemos as suas respostas. Agradecemos pelo seu tempo.';
    mostrar('fim'); return;
  }
  CTX={loja:String(d.loja||'').trim(),gerente:String(d.gerente||'').trim(),tipo:d.tipo||''};
  if(CTX.loja){ $('#cliNome').textContent=CTX.loja; $('#chipCli').hidden=false; }
  if(CTX.gerente){ $('#gerNome').textContent=CTX.gerente; $('#chipGer').hidden=false; }
  /* cliente que saiu: o texto de "mês que se passou" e "próximo ciclo" não cabe */
  if(CTX.tipo==='churn'){
    document.title='Avaliação dos serviços da Auto Síntese';
    $('#t-abre h1').textContent='Avaliação dos serviços da Auto Síntese';
    $('#t-abre p').textContent='Este formulário tem como objetivo coletar a sua avaliação sobre os serviços prestados durante o projeto, permitindo identificar pontos fortes e corrigir pontos fracos. O preenchimento deve levar até 15 minutos.';
    $('#t-fim p').textContent='Suas respostas serão analisadas com atenção para orientar melhorias na prestação dos nossos serviços.';
  }
}
if(LINK.r){
  const bt=$('#btIniciar'); bt.disabled=true;
  fetch(ENDPOINT+'?r='+LINK.r,{headers:{'apikey':SUPA_KEY}})
    .then(r=>r.json()).then(aplicarContexto).catch(()=>{})
    .then(()=>{ bt.disabled=false; retomar(); });
} else retomar();
})();

if(typeof module!=='undefined') module.exports={PERGUNTAS,SERVICOS,PAGINAS,aplica,visiveis,respondida,valida,corpoDe,uuidv4,lerLink};
