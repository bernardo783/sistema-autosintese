/* crm.js — módulo comercial do Sistema AutoSíntese (Pipeline · Agenda · Origens · Anúncios).
   Carregado pelo index.html depois do script principal; usa os globais de lá
   (sb, currentUser, SESSION, esc, brl, toast, modal, confirmar, $, renderFunil, FN, lkHash).
   Regras: estágio só muda por crm_set_stage (RPC); todo evento vai para funnel_events;
   Contact ≠ Opportunity; telefone E.164 é a chave de dedup (no banco, crm_e164). */

const CRM_TIPOS_EVENTO={
  lead_created:['★','ev','Entrou no funil'], reopened:['↻','ev','Oportunidade reaberta'],
  touchpoint_added:['◎','ev','Novo toque de marketing'], sdr_first_response:['↩','ok','Primeiro contato do SDR'],
  lead_responded:['💬','ok','Lead respondeu'], qualified:['✓','ev','Qualificado'], unqualified:['✕','bad','Desqualificado'],
  appointment_created:['📅','cal','Sessão agendada'], appointment_confirmed:['✓','cal','Sessão confirmada'],
  appointment_rescheduled:['⇄','cal','Sessão reagendada'], appointment_canceled:['✕','bad','Sessão cancelada'],
  meeting_attended:['●','ok','Compareceu à reunião'], no_show:['○','bad','No-show'], proposal:['$','ev','Em negociação / proposta'],
  won:['🎉','ok','Venda fechada'], lost:['✕','bad','Perdido'], stage_changed:['→','','Mudou de estágio'],
  owner_changed:['👤','','Responsável alterado'], value_changed:['$','','Valor alterado'], note:['✎','','Anotação'],
  source_changed:['◎','','Origem alterada'], attendance_overridden:['✎','cal','Presença ajustada à mão'],
  whatsapp_first_message:['💬','ev','Primeira mensagem no WhatsApp']
};
const CRM_PRESETS=[['7d','7 dias'],['30d','30 dias'],['mes','Este mês'],['mes_ant','Mês passado'],['90d','90 dias'],['tudo','Tudo']];

const CRM={
  /* Comercial abre no Painel: e a tela que o time olha todo dia (Gabriel 15/09) */
  aba:'painel',
  f:{periodo:'30d',origem:'',sdr:'',closer:'',campanha:'',busca:''},
  d:{opps:[],estagios:[],motivos:[],origens:[],equipe:[],appts:[],google:[],origensMes:[]},
  carregou:false, carregando:false, erro:'', sel:null, semana:0, tl:{}, ocup:{}
};
try{ Object.assign(CRM.f, JSON.parse(localStorage.getItem('crm_filtros_v1')||'{}')); }catch(_){ /* sem filtro salvo */ }
const crmSalvarFiltros=()=>{ try{ localStorage.setItem('crm_filtros_v1',JSON.stringify(CRM.f)); }catch(_){ /* sem storage */ } };

/* ---------- PAINEL COMERCIAL (calls) ----------
   Replica o painel que o time tocava fora do sistema: cada reuniao vira uma linha
   em crm_calls e o Painel le so isso. Nao conversa com o pipeline (opportunities):
   la o registro nasce do lead; aqui nasce da call que o SDR agendou. */
const CC_ORIGENS=[['inbound','Inbound'],['outbound','Outbound'],['indicacao','Indicação'],['parceria','Parceria'],
  ['prospeccao_closer','Prospecção Closer'],['prospeccao_sdr','Prospecção SDR'],['social_selling','Social Selling'],
  ['repescagem','Repescagem'],['organico','Orgânico'],['landing_page','Landing Page'],
  /* ChatGPT: lead que chegou perguntando pra IA e caiu na gente (Gabriel 16/09) */
  ['chatgpt','ChatGPT']];
/* "Remarcada" veio da planilha do comercial: a call nao aconteceu e nao foi
   no-show — foi adiada. Nao entra na conta de show nem de no-show. */
const CC_CALL=[['agendado','Agendado','info'],['show','Show','ok'],['no_show','No-show','bad'],['remarcar','Remarcada','']];
const CC_LEAD=[['follow_up','Follow up','info'],['remarcar','Remarcar',''],['futuro','Futuro',''],['negociacao','Negociação','warn'],['ganho','Ganho','ok'],['perdido','Perdido','bad']];
/* rotulo em portugues; a chave segue em ingles (BANT) pra nao mexer no que ja foi lancado */
const CC_FALTOU=[['authority','Autoridade'],['budget','Orçamento'],['timing','Momento'],['need','Necessidade']];
const CC_VENDIDO=[['agent_ia','Agent IA'],['trafego','Tráfego'],['crm','CRM'],['maquina','Máquina de Vendas'],['agent_trafego','Agent IA + Tráfego'],['agent_crm','Agent IA + CRM']];
const CC_BANT=[['1','BANT 1'],['2','BANT 2'],['3','BANT 3'],['4','BANT 4']];
const ccNome=(tab,v)=>{ const r=(tab||[]).find(x=>x[0]===String(v||'')); return r?r[1]:''; };
const ccCor=(tab,v)=>{ const r=(tab||[]).find(x=>x[0]===String(v||'')); return r&&r[2]?r[2]:''; };
CRM.cc={mes:'',sdr:'',status:'',de:'',ate:''};
CRM.d.calls=[];

/* ---------- permissões ---------- */
const crmPode=()=>!!(currentUser&&(currentUser.role==='master'||currentUser.papel_crm));
const crmAdmin=()=>!!(currentUser&&(currentUser.role==='master'||['admin','gestor'].includes(currentUser.papel_crm)));
const crmPapel=()=>currentUser?(currentUser.role==='master'?'admin':(currentUser.papel_crm||'')):'';

/* ---------- utilitários ---------- */
const crmFone=(e164)=>{ const d=String(e164||'').replace(/\D/g,''); if(!d.startsWith('55')) return e164||''; const n=d.slice(2);
  if(n.length===11) return '('+n.slice(0,2)+') '+n.slice(2,7)+'-'+n.slice(7);
  if(n.length===10) return '('+n.slice(0,2)+') '+n.slice(2,6)+'-'+n.slice(6); return e164||''; };
const crmIni=(n)=>String(n||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
const crmPessoa=(id)=>CRM.d.equipe.find(p=>p.id===id)||null;
const crmNome=(id)=>{ const p=crmPessoa(id); return p?p.nome.split(' ')[0]:'—'; };
const crmAv=(id,cls)=>{ const p=crmPessoa(id); if(!p) return `<span class="crm-av vazio" title="sem responsável">?</span>`;
  return `<span class="crm-av ${cls||''}" title="${esc(p.nome)}">${p.foto?`<img src="${esc(p.foto)}" alt="">`:esc(crmIni(p.nome))}</span>`; };
const crmClosers=()=>CRM.d.equipe.filter(p=>p.papel_crm==='closer'||p.papel_crm==='admin'||p.papel_crm==='gestor'||p.role==='master');
const crmSdrs=()=>CRM.d.equipe.filter(p=>p.papel_crm==='sdr'||p.papel_crm==='admin'||p.papel_crm==='gestor'||p.role==='master');
const crmDia=(iso)=>iso?new Date(iso).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}).replace('.',''):'';
const crmHora=(iso)=>iso?new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}):'';
const crmQuando=(iso)=>iso?(crmDia(iso)+' '+crmHora(iso)):'';
const crmDias=(iso)=>iso?Math.max(0,Math.round((Date.now()-new Date(iso))/86400000)):0;
const crmEst=(k)=>CRM.d.estagios.find(e=>e.chave===k)||{chave:k,nome:k,cor:'#8a8a96'};
const crmOrigem=(k)=>CRM.d.origens.find(o=>o.key===k)||{key:k,name:k,paid:false};
const crmPct=(a,b)=>b?Math.round(a/b*1000)/10:0;
const crmIsoLocal=(d)=>{ const p=(n)=>String(n).padStart(2,'0'); return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); };
function crmJanela(){
  const hoje=new Date(); hoje.setHours(0,0,0,0);
  const m=(n)=>{ const d=new Date(hoje); d.setDate(d.getDate()+n); return d; };
  const p=CRM.f.periodo;
  if(p==='7d') return {de:m(-6),ate:m(1)};
  if(p==='30d') return {de:m(-29),ate:m(1)};
  if(p==='90d') return {de:m(-89),ate:m(1)};
  if(p==='mes') return {de:new Date(hoje.getFullYear(),hoje.getMonth(),1),ate:new Date(hoje.getFullYear(),hoje.getMonth()+1,1)};
  if(p==='mes_ant') return {de:new Date(hoje.getFullYear(),hoje.getMonth()-1,1),ate:new Date(hoje.getFullYear(),hoje.getMonth(),1)};
  return {de:new Date(2020,0,1),ate:m(3650)};
}
const crmNoPeriodo=(iso)=>{ if(!iso) return false; const j=crmJanela(), d=new Date(iso); return d>=j.de&&d<j.ate; };

/* ---------- carga ---------- */
async function crmCarregar(){
  if(CRM.carregando) return; CRM.carregando=true; CRM.erro='';
  try{
    const desde=new Date(); desde.setDate(desde.getDate()-60);
    const [e,m,o,q,a,g,v,cc]=await Promise.all([
      sb.from('wa_estagios').select('*').eq('ativo',true).order('ordem'),
      sb.from('lost_reasons').select('*').eq('ativo',true).order('ordem'),
      sb.from('lead_sources').select('*').eq('ativo',true).order('ordem'),
      sb.from('perfis').select('id,nome,foto,papel_crm,role').eq('aprovado',true).order('nome'),
      sb.from('appointments').select('*').gte('scheduled_start',desde.toISOString()).order('scheduled_start'),
      sb.rpc('crm_google_conectados'),
      sb.from('v_crm_origens').select('*'),
      sb.from('crm_calls').select('*').order('data',{ascending:false}).limit(5000)
    ]);
    const erro=[e,m,o,q,a,g,v].find(r=>r&&r.error); if(erro) throw erro.error;
    /* a tabela de calls e nova: se ainda nao existir no banco, o resto da tela continua de pe */
    CRM.d.calls=(cc&&!cc.error&&cc.data)||[];
    CRM.d.estagios=e.data||[]; CRM.d.motivos=m.data||[]; CRM.d.origens=o.data||[]; CRM.d.equipe=q.data||[];
    CRM.d.appts=a.data||[]; CRM.d.google=g.data||[]; CRM.d.origensMes=v.data||[];
    const ano=new Date(); ano.setDate(ano.getDate()-365);
    const ops=await sb.from('opportunities')
      .select('*, contact:contacts(*), ft:marketing_touchpoints!opportunities_first_touchpoint_id_fkey(*), lt:marketing_touchpoints!opportunities_last_touchpoint_id_fkey(*)')
      .or('status.eq.open,closed_at.gte.'+ano.toISOString()).order('created_at',{ascending:false}).limit(2000);
    if(ops.error) throw ops.error;
    CRM.d.opps=ops.data||[];
    CRM.carregou=true;
  }catch(err){ CRM.erro=(err&&err.message)||String(err); }
  CRM.carregando=false;
}
async function crmRecarregar(){ await crmCarregar(); crmPintar(); }
function crmPintar(){ const c=$('#content'); if(c&&(currentView==='funil'||String(currentView).indexOf('funil')===0)) crmRender(c); }

/* ---------- filtros ---------- */
function crmFiltrar(lista){
  const f=CRM.f, q=String(f.busca||'').toLowerCase(), qd=q.replace(/\D/g,'');
  return (lista||[]).filter(o=>{
    if(f.origem&&o.source!==f.origem) return false;
    if(f.sdr&&o.sdr_id!==f.sdr) return false;
    if(f.closer&&o.closer_id!==f.closer) return false;
    if(f.campanha){ const c=(o.ft&&(o.ft.campaign_name||o.ft.campaign_id))||''; if(c!==f.campanha) return false; }
    if(q){ const c=o.contact||{}; const alvo=[c.name,c.company,c.city,o.source_detail,o.ft&&o.ft.campaign_name,o.ft&&o.ft.ad_name].map(x=>String(x||'').toLowerCase()).join(' ');
      if(!alvo.includes(q)&&!(qd&&String(c.phone_e164||'').includes(qd))) return false; }
    return true;
  });
}
const crmCampanhas=()=>{ const s=new Set(); CRM.d.opps.forEach(o=>{ const c=o.ft&&(o.ft.campaign_name||o.ft.campaign_id); if(c) s.add(c); }); return [...s].sort(); };
window.crmFiltro=(k,v)=>{ CRM.f[k]=v; crmSalvarFiltros(); crmPintar(); };
window.crmLimpar=()=>{ CRM.f={periodo:CRM.f.periodo,origem:'',sdr:'',closer:'',campanha:'',busca:''}; crmSalvarFiltros(); crmPintar(); };
/* Uma linha (Gabriel 16/09): busca, periodo e um botao Filtros. Antes eram cinco
   seletores pequenos lado a lado, cada um com um rotulo dentro, brigando por espaco. */
function crmFiltrosHTML(){
  const f=CRM.f;
  const ativos=['origem','sdr','closer','campanha'].filter(k=>f[k]).length;
  const nomeDe=(k)=>{ const v=f[k]; if(!v) return '';
    if(k==='origem') return (CRM.d.origens.find(o=>o.key===v)||{}).name||v;
    if(k==='sdr'||k==='closer') return crmNome(v);
    return v; };
  const chips=['origem','sdr','closer','campanha'].filter(k=>f[k])
    .map(k=>`<button class="crm-chip" onclick="crmFiltro('${k}','')" title="Tirar este filtro">${esc(nomeDe(k))} <i>×</i></button>`).join('');
  return `<div class="crm-barra">
    <div class="crm-busca"><i>⌕</i><input placeholder="Buscar nome, telefone, empresa…" value="${esc(f.busca)}"
      oninput="CRM.f.busca=this.value;crmSalvarFiltros();clearTimeout(CRM._t);CRM._t=setTimeout(crmPintar,250)"></div>
    <div class="fin-tabs crm-per">${CRM_PRESETS.map(p=>`<button class="ftab${f.periodo===p[0]?' active':''}" onclick="crmFiltro('periodo','${p[0]}')">${p[1]}</button>`).join('')}</div>
    <button class="btn secondary small crm-bf${ativos?' on':''}" onclick="crmFiltrosModal()">Filtros${ativos?' · '+ativos:''}</button>
    ${chips}
  </div>`;
}
window.crmFiltrosModal=()=>{
  const f=CRM.f, opt=(v,n,sel)=>`<option value="${esc(v)}"${sel===v?' selected':''}>${esc(n)}</option>`;
  const campo=(id,lab,ops,val)=>`<div class="field"><label>${lab}</label><select id="${id}"><option value="">Todos</option>${ops.map(([v,n])=>opt(v,n,val)).join('')}</select></div>`;
  modal('Filtrar o pipeline',
    `<div class="crm-form">
      <div class="row2">
        ${campo('fl_origem','Origem',CRM.d.origens.map(o=>[o.key,o.name]),f.origem)}
        ${campo('fl_campanha','Campanha',crmCampanhas().map(c=>[c,c]),f.campanha)}
      </div>
      <div class="row2">
        ${campo('fl_sdr','SDR',crmSdrs().map(p=>[p.id,p.nome]),f.sdr)}
        ${campo('fl_closer','Closer',crmClosers().map(p=>[p.id,p.nome]),f.closer)}
      </div>
      <div class="crm-hint">O período e a busca ficam na barra, fora daqui.</div>
    </div>`,
    async ()=>{ ['origem','campanha','sdr','closer'].forEach(k=>{ const e=document.getElementById('fl_'+k); CRM.f[k]=e?e.value:''; });
      crmSalvarFiltros(); crmPintar(); return true; });
};

/* abas que na verdade sao telas do index.html, emprestadas pro Comercial */
const CRM_EXT={fechamento:'renderFechamento',contratos:'renderContratos',leads:'renderLeads'};

/* ---------- render principal ---------- */
window.crmAba=(a)=>{ CRM.aba=a; crmPintar(); };
window.crmRender=function(c,viewPedida){
  if(!crmPode()){ c.innerHTML='<div class="empty">Acesso restrito ao time comercial. Peça ao administrador para liberar seu papel no CRM.</div>'; return; }
  const v=String(viewPedida||''); const mOpp=v.match(/^funil\/opp\/([0-9a-f-]{36})/);
  if(mOpp){ CRM.sel=mOpp[1]; }
  /* #funil/aba/<nome>: e assim que as listas do espaco Comercial abrem cada tela */
  const mAba=v.match(/^funil\/aba\/([a-z_]+)$/); if(mAba) CRM.aba=(mAba[1]==='calls'?'painel':mAba[1]);
  if(!CRM.carregou){ if(!CRM.carregando) crmCarregar().then(crmPintar); c.innerHTML=`<div class="page-head"><div><h2>Comercial</h2><div class="desc">Carregando o funil…</div></div></div>`; return; }
  /* Fechamento, Contratos e Leads sao telas do index.html que agora moram aqui
     (Gabriel 15/09): o fluxo comercial inteiro numa tela so. Contratos e Leads
     seguem a mesma regra de antes — podeContratos(). */
  const temCt=(typeof podeContratos==='function')&&podeContratos();
  const abas=[['painel','Painel'],['calls','Calls'],['pipeline','Pipeline'],['agenda','Agenda']]
    .filter(a=>a[0]!=='calls')
    .concat(typeof renderFechamento==='function'?[['fechamento','Fechamento']]:[])
    .concat(temCt&&typeof renderContratos==='function'?[['contratos','Contratos']]:[])
    .concat(temCt&&typeof renderLeads==='function'?[['leads','Leads']]:[])
    .concat([['origens','Origem da receita']])
    .concat(currentUser.role==='master'?[['anuncios','Anúncios (Meta)']]:[]).concat(crmAdmin()?[['integracoes','Integrações']]:[])
    /* Comercial fica so com Painel e Pipeline (Gabriel 16/09). As telas continuam
       existindo e abrem pela URL; o que saiu foi a aba no alto — voltar e tirar
       esta linha. */
    .filter(a=>['painel','pipeline'].indexOf(a[0])>=0);
  const tabs=`<div class="fin-tabs" style="margin:0 0 14px">${abas.map(a=>`<button class="ftab${CRM.aba===a[0]?' active':''}" onclick="crmAba('${a[0]}')">${a[1]}</button>`).join('')}
    <span style="margin-left:auto"></span>
    ${CRM_EXT[CRM.aba]?'':(CRM.aba==='painel'||CRM.aba==='calls'?`<button class="btn small" onclick="crmCallModal()">+ Nova call</button>`:`<button class="btn small" onclick="crmNovoLead()">+ Lead</button>`)}</div>`;
  /* tela emprestada: deixa ela desenhar tudo e so recoloca a barra de abas
     logo abaixo do cabecalho dela, pra dar pra voltar pras outras. */
  if(CRM_EXT[CRM.aba]){
    const fn=window[CRM_EXT[CRM.aba]];
    if(typeof fn==='function'){
      fn(c);
      const ph=c.querySelector('.page-head');
      if(ph) ph.insertAdjacentHTML('afterend',tabs); else c.insertAdjacentHTML('afterbegin',tabs);
      return;
    }
  }
  if(CRM.aba==='anuncios'&&typeof renderFunil==='function'){
    FN.sub='meta'; renderFunil(c);
    /* esconde as sub-abas antigas (Anúncios/WhatsApp) e põe as novas no lugar */
    const velho=[...c.querySelectorAll('.fin-tabs')].find(t=>t.innerHTML.includes('waAba(')); if(velho) velho.outerHTML=tabs;
    return;
  }
  const j=crmJanela();
  c.innerHTML=`<div class="page-head">
      <div><h2>Comercial</h2><div class="desc">${CRM.aba==='painel'?ccMesNome():CRM.aba==='calls'?'Calls registradas':CRM.aba==='pipeline'?'Pipeline de oportunidades':CRM.aba==='agenda'?'Sessões estratégicas':CRM.aba==='integracoes'?'WhatsApp · Meta Ads · Google Agenda · Google Meet · Conversions API':'De onde vem a receita'}${CRM.aba==='integracoes'||CRM.aba==='painel'||CRM.aba==='calls'?'':` · ${esc(crmDia(j.de.toISOString()))} a ${esc(crmDia(new Date(j.ate-1).toISOString()))}`}${CRM.erro?` · <span style="color:var(--danger)">${esc(CRM.erro)}</span>`:''}</div></div>
      <div class="toolbar">${crmAdmin()?`<button class="btn secondary small" onclick="crmEquipeModal()" title="Quem é SDR e quem é closer">Equipe</button>`:''}<button class="btn secondary small" onclick="crmRecarregar()" title="Recarregar">↻</button></div>
    </div>${tabs}${CRM.aba==='origens'||CRM.aba==='integracoes'||CRM.aba==='painel'||CRM.aba==='calls'?'':crmFiltrosHTML()}
    ${CRM.aba==='painel'?(ccPainelHTML()+ccCallsHTML()):CRM.aba==='pipeline'?crmPipelineHTML():CRM.aba==='agenda'?crmAgendaHTML():CRM.aba==='integracoes'?crmIntgHTML():crmOrigensHTML()}`;
  if(CRM.aba==='integracoes') crmIntgCarregar();
  if(CRM.sel) crmAbrirFicha(CRM.sel);
};

/* ---------- PIPELINE ---------- */
/* Icone por etapa do pipeline (Gabriel 16/09): mesma leitura do quadro que o time
   usava fora do sistema. A cor sai do proprio estagio (wa_estagios.cor), como a
   bolinha que ficava aqui antes — etapa sem icone conhecido volta pra bolinha. */
const CRM_ICO_ET={
  para_atender:'<path d="M3 4h18l-7 8.2V19l-4 2v-8.8z"/>',
  ligacao:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  agendado:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
  follow_up:'<path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1"/><path d="M20.5 3.5v5h-5"/>',
  ganho:'<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5.5h3V7a3 3 0 0 1-3 3M7 5.5H4V7a3 3 0 0 0 3 3"/>',
  perdido:'<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>'
};
function crmIcoEtapa(e){
  const cor=esc(e.cor||'#8a8a96'), d=CRM_ICO_ET[e.chave];
  if(!d) return '<i style="background:'+cor+'"></i>';
  return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="'+cor+'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none">'+d+'</svg>';
}
function crmTemp(o){
  const base=o.first_lead_reply_at||o.first_inbound_at||o.created_at;
  const dias=base?Math.floor((Date.now()-new Date(base).getTime())/864e5):999;
  if(dias<=2) return {k:'quente',rot:'Quente'};
  if(dias<=7) return {k:'morno',rot:'Morno'};
  return {k:'frio',rot:'Frio'};
}
function crmPipelineHTML(){
  const base=crmFiltrar(CRM.d.opps);
  const vis=base.filter(o=>o.status==='open'||crmNoPeriodo(o.closed_at));
  const noPer=base.filter(o=>crmNoPeriodo(o.created_at));
  const abertos=base.filter(o=>o.status==='open');
  const ganhos=base.filter(o=>o.status==='won'&&crmNoPeriodo(o.won_at));
  const receita=ganhos.reduce((s,o)=>s+(+o.revenue||0),0);
  const agend=base.filter(o=>o.appointment_at&&crmNoPeriodo(o.appointment_at)).length;
  const compar=base.filter(o=>o.attended_at&&crmNoPeriodo(o.attended_at)).length;
  const pagos=noPer.filter(o=>crmOrigem(o.source).paid).length;
  const cols=CRM.d.estagios.map(e=>({e,its:vis.filter(o=>o.stage===e.chave)}));
  /* Temperatura do lead (Gabriel 16/09): sai do comportamento, nao de campo na mao.
     Dias desde o ultimo sinal real — resposta do lead; se nunca respondeu, a entrada. */
  const card=(o)=>{ const c=o.contact||{}, tp=crmTemp(o);
    return `<div class="crm-lc" draggable="true" ondragstart="CRM.arr='${o.id}'" onclick="crmAbrirFicha('${o.id}')">
      <div class="crm-lch"><div class="n">${esc(c.name||crmFone(c.phone_e164))}</div><span class="tag ${tp.k}">${tp.rot}</span></div>
      <div class="t">${esc(crmFone(c.phone_e164))}</div>
    </div>`; };
  /* Pipeline e so o quadro (Gabriel 16/09): KPI e explicacao saem daqui — numero
     do periodo continua inteiro no Painel. */
  return `<div class="crm-board">${cols.map(c=>`<div class="crm-col" ondragover="event.preventDefault();this.classList.add('hover')" ondragleave="this.classList.remove('hover')" ondrop="this.classList.remove('hover');crmSoltar(event,'${c.e.chave}')">
        <div class="crm-colh">${crmIcoEtapa(c.e)}${esc(c.e.nome)}<span>${c.its.length}</span></div>
        <div class="crm-cards">${c.its.map(card).join('')||'<div class="crm-vazio">arraste para cá</div>'}</div></div>`).join('')}</div>`;
}
window.crmSoltar=async (ev,est)=>{ ev.preventDefault(); const id=CRM.arr; CRM.arr=null; if(id) await crmMover(id,est); };
window.crmMover=async (id,est,meta)=>{
  if(est==='ganho'&&!(meta&&meta.revenue)) return crmGanhoModal(id);
  if(est==='perdido'&&!(meta&&meta.lost_reason_id)) return crmPerdaModal(id);
  if(est==='agendado'&&!(meta&&meta.appointment_id)) return crmAgendarModal(id);
  const {data,error}=await sb.rpc('crm_set_stage',{p_opp:id,p_stage:est,p_meta:meta||{},p_source:'ui'});
  if(error){ toast('Erro: '+error.message); return false; }
  toast(crmEst(est).nome+'.'); await crmCarregar(); delete CRM.tl[id]; crmPintar(); return data;
};

/* ---------- FICHA ---------- */
window.crmFechar=()=>{ CRM.sel=null; const o=document.getElementById('crmOv'); if(o) o.remove(); if(String(location.hash).includes('/opp/')) lkHash('v','funil'); };
window.crmAbrirFicha=async (id)=>{
  const o=CRM.d.opps.find(x=>x.id===id); if(!o){ toast('Oportunidade não encontrada.'); return; }
  CRM.sel=id; lkHash('v','funil/opp/'+id);
  let ov=document.getElementById('crmOv');
  if(!ov){ ov=document.createElement('div'); ov.className='overlay crm-ov'; ov.id='crmOv'; ov.onclick=(e)=>{ if(e.target===ov) crmFechar(); }; document.body.appendChild(ov); }
  ov.innerHTML=crmPainelHTML(o);
  if(!CRM.tl[id]){
    const {data}=await sb.from('funnel_events').select('*').eq('opportunity_id',id).order('occurred_at',{ascending:true}).limit(500);
    /* o segundo render perdia as acoes e o nome do lead — agora as duas passadas usam o mesmo molde */
    CRM.tl[id]=data||[]; const ov2=document.getElementById('crmOv'); if(ov2&&CRM.sel===id) ov2.innerHTML=crmPainelHTML(o);
  }
};
/* Molde do painel (Gabriel 16/09): cabecalho, o que fazer com o lead, a ficha rolando
   e um rodape preso embaixo. Antes as acoes ficavam no meio da ficha e, no painel
   estreito, viravam uma pilha de botoes de larguras diferentes. */
function crmPainelHTML(o){
  const c=o.contact||{};
  return `<div class="modal">
    <div class="mhead crm-mh">
      <div class="big">${esc(crmIni(c.name||'?'))}</div>
      <div class="q"><h3>${esc(c.name||crmFone(c.phone_e164))}</h3>
        <div class="sub">${esc(crmFone(c.phone_e164))}${c.company?' · '+esc(c.company):''} · ciclo #${o.cycle}</div></div>
      <span class="crm-badge ${o.status==='won'?'ok':o.status==='lost'?'bad':'info'}"><i style="width:7px;height:7px;border-radius:50%;background:${esc(crmEst(o.stage).cor)};display:inline-block"></i> ${esc(crmEst(o.stage).nome)}</span>
      <button class="x" onclick="crmFechar()" aria-label="Fechar">&times;</button></div>
    ${crmAcoesHTML(o)}${crmFichaHTML(o)}${crmRodapeHTML(o)}</div>`;
}
/* As duas acoes que fecham o dia ficam sempre a mao; o resto entra no "mais". */
function crmRodapeHTML(o){
  const c=o.contact||{}, fone=String(c.phone_e164||'').replace(/\D/g,'');
  if(o.status!=='open') return `<div class="crm-rod">
    <button class="btn secondary" onclick="crmMover('${o.id}','novo_lead')">↻ Reabrir</button>
    <button class="btn secondary crm-mais" onclick="crmMaisMenu(event,'${o.id}')" aria-label="Mais ações">···</button></div>`;
  return `<div class="crm-rod">
    <button class="btn secondary" onclick="crmAgendarModal('${o.id}')">📅 Agendar</button>
    <button class="btn ganho" onclick="crmGanhoModal('${o.id}')">🎉 Ganho</button>
    <button class="btn secondary crm-mais" onclick="crmMaisMenu(event,'${o.id}')" aria-label="Mais ações">···</button></div>`;
}
window.crmMaisMenu=(ev,id)=>{
  ev.stopPropagation();
  const o=CRM.d.opps.find(x=>x.id===id); if(!o) return;
  const c=o.contact||{}, fone=String(c.phone_e164||'').replace(/\D/g,'');
  document.querySelectorAll('.crm-menu').forEach(x=>x.remove());
  const itens=[
    o.status==='open'?['Marcar como perdido',`crmPerdaModal('${id}')`,'perda']:null,
    ['Responsáveis',`crmResponsavelModal('${id}')`],
    ['Editar oportunidade',`crmEditarModal('${id}')`],
    ['Adicionar nota',`crmNotaModal('${id}')`],
    fone?['Abrir no WhatsApp',`window.open('https://wa.me/${fone}','_blank','noopener')`]:null,
  ].filter(Boolean);
  const m=document.createElement('div'); m.className='crm-menu';
  m.innerHTML=itens.map(i=>`<button class="${i[2]||''}" onclick="document.querySelectorAll('.crm-menu').forEach(x=>x.remove());${i[1]}">${esc(i[0])}</button>`).join('');
  ev.currentTarget.parentElement.appendChild(m);
  setTimeout(()=>document.addEventListener('click',function fecha(){ document.querySelectorAll('.crm-menu').forEach(x=>x.remove()); document.removeEventListener('click',fecha); },{once:true}),0);
};
/* Painel do lead (Gabriel 16/09): abre encostado na direita e a primeira coisa
   que aparece e o que fazer com o lead — mover de etapa e definir responsavel. */
function crmAcoesHTML(o){
  const ets=(CRM.d.estagios||[]).filter(e=>e.chave!==o.stage);
  const eq=(CRM.d.equipe||[]).filter(p=>p.papel_crm||p.role==='master');
  return `<div class="crm-acoes">
    <div class="lb">Mover etapa</div>
    <div class="bts">${ets.map(e=>`<button class="btn secondary small" onclick="crmMover('${o.id}','${e.chave}')">${crmIcoEtapa(e)}${esc(e.nome)}</button>`).join('')}</div>
    ${eq.length?`<div class="lb">Atribuir</div>
    <div class="bts">${eq.map(p=>`<button class="btn secondary small${o.sdr_id===p.id?' on':''}" onclick="crmAtribuir('${o.id}','${p.id}')">${esc(p.nome)}</button>`).join('')}</div>`:''}
  </div>`;
}
window.crmAtribuir=async (id,uid)=>{
  const {error}=await sb.rpc('crm_atualizar',{p_opp:id,p:{sdr_id:uid}});
  if(error){ toast('Erro: '+error.message); return; }
  toast('Responsável: '+crmNome(uid));
  await crmCarregar(); crmPintar(); crmAbrirFicha(id);
};
function crmFichaHTML(o){
  const c=o.contact||{}, org=crmOrigem(o.source), ft=o.ft, lt=o.lt, e=crmEst(o.stage);
  const appts=CRM.d.appts.filter(a=>a.opportunity_id===o.id).sort((a,b)=>a.scheduled_start<b.scheduled_start?1:-1);
  const ap=appts.find(a=>['scheduled','confirmed'].includes(a.status))||appts[0];
  const tl=CRM.tl[o.id];
  const ciclos=CRM.d.opps.filter(x=>x.contact_id===o.contact_id).length;
  const motivo=o.lost_reason_id?(CRM.d.motivos.find(m=>m.id===o.lost_reason_id)||{}).name:'';
  const tlHTML=!tl?'<div class="crm-hint">Carregando linha do tempo…</div>':!tl.length?'<div class="crm-hint">Nada registrado ainda.</div>':
    `<div class="crm-tl">${tl.slice().reverse().map(ev=>{ const t=CRM_TIPOS_EVENTO[ev.event_type]||['·','',ev.event_type]; const m=ev.metadata||{};
      let det='';
      if(ev.event_type==='stage_changed') det=`${esc(crmEst(ev.previous_stage).nome)} → <strong>${esc(crmEst(ev.new_stage).nome)}</strong>`;
      else if(ev.event_type==='note') det=`<div class="msg">${esc(m.texto||'')}</div>`;
      else if(ev.event_type==='won') det=`<strong>${esc(brl(m.revenue))}</strong>`;
      else if(ev.event_type==='lost') det=esc((CRM.d.motivos.find(x=>x.id===m.lost_reason_id)||{}).name||'')+(m.lost_notes?` · ${esc(m.lost_notes)}`:'');
      else if(ev.event_type==='appointment_created') det=`${esc(crmQuando(m.scheduled_start))}${m.closer_id?' · closer '+esc(crmNome(m.closer_id)):''}${m.meet_url?` · <a href="${esc(m.meet_url)}" target="_blank" rel="noopener" style="color:var(--brand2)">Meet</a>`:''}`;
      else if(ev.event_type==='appointment_rescheduled') det=`${esc(crmQuando(m.de))} → <strong>${esc(crmQuando(m.para))}</strong>`;
      else if(ev.event_type==='appointment_canceled') det=esc(m.motivo||'');
      else if(ev.event_type==='owner_changed') det=`SDR ${esc(crmNome(m.para&&m.para.sdr_id!==undefined?m.para.sdr_id:(m.de||{}).sdr_id))} · closer ${esc(crmNome(m.para&&m.para.closer_id!==undefined?m.para.closer_id:(m.de||{}).closer_id))}`;
      else if(ev.event_type==='value_changed') det=`${esc(brl(m.de))} → <strong>${esc(brl(m.para))}</strong>`;
      else if(ev.event_type==='lead_created') det=`${esc(crmOrigem(m.source).name)}${m.source_detail?' · '+esc(m.source_detail):''}`;
      else if(ev.event_type==='source_changed') det=`${esc(crmOrigem(m.de).name)} → <strong>${esc(crmOrigem(m.para).name)}</strong>`;
      else if(ev.event_type==='attendance_overridden') det=esc({attended:'Compareceu',no_show:'No-show',undetermined:'Indeterminado'}[m.para]||m.para||'');
      return `<div class="e"><div class="h">${esc(crmDia(ev.occurred_at))} · ${esc(crmHora(ev.occurred_at))}</div><i class="${t[1]}">${t[0]}</i>
        <div><b>${esc(t[2])}</b> <span class="who">· ${ev.actor_user_id?esc(crmNome(ev.actor_user_id)):({webhook_whatsapp:'WhatsApp',calendar:'Google Agenda',meet:'Google Meet',cron:'sistema',capi:'Meta CAPI'}[ev.source]||'sistema')}</span>${det?`<div>${det}</div>`:''}</div></div>`; }).join('')}</div>`;
  const ativos=CRM.d.estagios.filter(x=>!x.fim);
  return `<div class="crm-ficha">
    <div style="min-width:0">
      <div class="crm-facts">
        <div class="crm-fact"><div class="k">SDR</div><div class="v">${crmAv(o.sdr_id)} ${esc(o.sdr_id?crmNome(o.sdr_id):'—')}</div></div>
        <div class="crm-fact"><div class="k">Closer</div><div class="v">${crmAv(o.closer_id,'c')} ${esc(o.closer_id?crmNome(o.closer_id):'—')}</div></div>
        <div class="crm-fact"><div class="k">Primeiro contato</div><div class="v">${esc(crmQuando(o.first_inbound_at||o.created_at))}</div></div>
        <div class="crm-fact"><div class="k">Próxima atividade</div><div class="v">${ap&&['scheduled','confirmed'].includes(ap.status)?'Sessão · '+esc(crmQuando(ap.scheduled_start)):o.next_activity?esc(o.next_activity)+(o.next_activity_at?' · '+esc(crmQuando(o.next_activity_at)):''):'<span style="color:var(--fraco)">—</span>'}</div></div>
        <div class="crm-fact"><div class="k">Valor estimado</div><div class="v">${o.value?esc(brl(o.value)):'<span style="color:var(--fraco)">—</span>'}</div></div>
        <div class="crm-fact"><div class="k">Receita</div><div class="v" style="color:${o.revenue?'var(--ok)':'var(--fraco)'}">${o.revenue?esc(brl(o.revenue)):'—'}</div></div>
        <div class="crm-fact"><div class="k">${o.status==='lost'?'Motivo da perda':'Atualizado'}</div><div class="v">${o.status==='lost'?esc(motivo||'—')+(o.lost_notes?' · '+esc(o.lost_notes):''):esc(crmQuando(o.updated_at))}</div></div>
      </div>
      ${o.notes?`<div class="crm-box"><h4>Observações</h4><div style="font-size:13px;white-space:pre-wrap">${esc(o.notes)}</div></div>`:''}
      <div class="crm-box"><h4>Linha do tempo <span style="color:var(--fraco);font-weight:500;font-size:12px">quem fez, quando</span></h4>${tlHTML}</div>
    </div>
    <div>
      <div class="crm-box"><h4>Origem do lead <button class="btn secondary small" onclick="this.closest('.crm-box').querySelector('.crm-orig').classList.toggle('ids')">IDs</button></h4>
        <div class="crm-orig">
          <div class="st"><i></i><div><div class="k">Canal</div><div class="v">${esc(org.name)}${ft&&ft.source_type?' · '+esc(ft.source_type==='ad'?'Click-to-WhatsApp':ft.source_type):''}</div>${ft?`<div class="id">${ft.ctwa_clid?'ctwa_clid '+esc(ft.ctwa_clid):''}${ft.source_url?' · '+esc(ft.source_url):''}</div>`:''}</div></div>
          ${ft?`<div class="st"><i></i><div><div class="k">Campanha</div><div class="v">${esc(ft.campaign_name||'(nome ainda não sincronizado)')}</div><div class="id">${esc(ft.campaign_id||'—')}</div></div></div>
          <div class="st"><i></i><div><div class="k">Conjunto</div><div class="v">${esc(ft.adset_name||'—')}</div><div class="id">${esc(ft.adset_id||'—')}</div></div></div>
          <div class="st"><i></i><div><div class="k">Anúncio</div><div class="v">${esc(ft.ad_name||ft.headline||'—')}</div><div class="id">${esc(ft.ad_id||ft.source_id||'—')}</div></div></div>`
          :`<div class="st"><i></i><div><div class="k">Detalhe</div><div class="v">${esc(o.source_detail||'sem campanha vinculada')}</div></div></div>`}
        </div>
        ${ft?`<div class="crm-hint" style="margin-top:8px">Primeiro toque: ${esc(crmQuando(ft.happened_at))}${lt&&lt.id!==ft.id?` · último toque: ${esc(crmQuando(lt.happened_at))} (${esc(lt.ad_name||lt.campaign_name||'outro anúncio')})`:''}. A origem histórica nunca é sobrescrita.</div>`:''}
      </div>
      <div class="crm-box"><h4>Agendamento ${o.status==='open'?`<button class="btn secondary small" onclick="crmAgendarModal('${o.id}')">${ap&&['scheduled','confirmed'].includes(ap.status)?'novo':'agendar'}</button>`:''}</h4>
        ${ap?`<div class="crm-mini">
          <div><span>Quando</span><b>${esc(crmQuando(ap.scheduled_start))}–${esc(crmHora(ap.scheduled_end))}</b></div>
          <div><span>Closer</span><b>${esc(crmNome(ap.closer_id))}</b></div>
          <div><span>Meet</span><b>${ap.meet_url?`<a href="${esc(ap.meet_url)}" target="_blank" rel="noopener" style="color:var(--brand2)">${esc(ap.meet_url.replace('https://',''))}</a>`:'—'}</b></div>
          <div><span>Status</span><b>${crmApStatus(ap)}</b></div></div>
          ${['scheduled','confirmed'].includes(ap.status)?`<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
            <button class="btn secondary small" onclick="crmPresenca('${ap.id}','attended')">Compareceu</button>
            <button class="btn secondary small" onclick="crmPresenca('${ap.id}','no_show')">No-show</button>
            <button class="btn secondary small" onclick="crmReagendarModal('${ap.id}')">Reagendar</button>
            <button class="btn secondary small" onclick="crmCancelarAp('${ap.id}')">Cancelar</button></div>`:''}
          ${appts.length>1?`<div class="crm-hint">${appts.length} agendamentos neste ciclo.</div>`:''}`
        :'<div class="crm-hint" style="margin:0">Nenhuma sessão marcada.</div>'}
      </div>
      <div class="crm-box"><h4>Contato</h4><div class="crm-mini">
        ${c.email?`<div><span>E-mail</span><b>${esc(c.email)}</b></div>`:''}
        ${c.wa_profile_name?`<div><span>Nome no WhatsApp</span><b>${esc(c.wa_profile_name)}</b></div>`:''}
        <div><span>Ciclos comerciais</span><b>${ciclos}</b></div>
        <div><span>Desde</span><b>${esc(crmDia(c.first_seen_at||c.created_at))}</b></div></div></div>
    </div></div>`;
}
const crmApStatus=(ap)=>{ const m={scheduled:['Agendada','info'],confirmed:['Confirmada','info'],rescheduled:['Reagendada',''],canceled:['Cancelada','bad'],attended:['Compareceu','ok'],no_show:['No-show','bad'],undetermined:['Indeterminado','warn']}[ap.status]||[ap.status,''];
  return `<span class="crm-badge ${m[1]}">${m[0]}</span>`; };

/* ---------- modais ---------- */
const crmSelEquipe=(id,lista,atual,vazio)=>`<select id="${id}"><option value="">${vazio||'—'}</option>${lista.map(p=>`<option value="${p.id}"${p.id===atual?' selected':''}>${esc(p.nome)}</option>`).join('')}</select>`;
const crmVal=(id)=>{ const el=document.getElementById(id); return el?String(el.value||'').trim():''; };
window.crmNovoLead=()=>{
  const eu=currentUser||{}; const sdrPadrao=eu.papel_crm==='sdr'?eu.id:'';
  modal('Novo lead',`<div class="crm-form">
    <div class="row2"><div class="field"><label>Nome</label><input id="cl_nome" placeholder="como a pessoa se apresentou"></div>
      <div class="field"><label>WhatsApp *</label><input id="cl_tel" placeholder="(17) 99999-0000"></div></div>
    <div class="row2"><div class="field"><label>Empresa / loja</label><input id="cl_emp"></div><div class="field"><label>Cidade</label><input id="cl_cid"></div></div>
    <div class="row2"><div class="field"><label>Origem *</label><select id="cl_src" onchange="crmNovoLeadOrigem()">${CRM.d.origens.map(o=>`<option value="${o.key}"${o.key==='indicacao'?' selected':''}>${esc(o.name)}</option>`).join('')}</select></div>
      <div class="field"><label id="cl_det_l">Quem indicou</label><input id="cl_det" placeholder="nome de quem indicou"></div></div>
    <div id="cl_camp" class="row2" style="display:none"><div class="field"><label>Campanha (nome no Meta)</label><input id="cl_campn"></div><div class="field"><label>Anúncio (nome ou ID)</label><input id="cl_ad"></div></div>
    <div class="row3"><div class="field"><label>SDR</label>${crmSelEquipe('cl_sdr',crmSdrs(),sdrPadrao,'sem SDR')}</div>
      <div class="field"><label>Closer</label>${crmSelEquipe('cl_closer',crmClosers(),'','definir depois')}</div>
      <div class="field"><label>Valor estimado (R$/mês)</label><input id="cl_val" inputmode="decimal" placeholder="5900"></div></div>
    <div class="field"><label>Observações</label><textarea id="cl_obs" rows="2"></textarea></div>
    <div class="crm-hint">Se o telefone já tiver uma oportunidade aberta, o lead entra nela (não duplica). Leads de anúncio chegam sozinhos pelo WhatsApp — use este formulário para indicação, orgânico, evento, base.</div>
  </div>`, async ()=>{
    const src=crmVal('cl_src'); const org=crmOrigem(src);
    const p={telefone:crmVal('cl_tel'),nome:crmVal('cl_nome'),empresa:crmVal('cl_emp'),cidade:crmVal('cl_cid'),source:src,source_detail:crmVal('cl_det'),
      sdr_id:crmVal('cl_sdr'),closer_id:crmVal('cl_closer'),valor:crmVal('cl_val').replace(/\./g,'').replace(',','.'),notas:crmVal('cl_obs'),via:'ui'};
    if(org.paid){ p.campaign_name=crmVal('cl_campn'); const ad=crmVal('cl_ad'); if(/^\d{8,}$/.test(ad)) p.ad_id=ad; else p.ad_name=ad; if(p.ad_name&&!p.campaign_name) p.campaign_name=p.ad_name; }
    const {data,error}=await sb.rpc('crm_criar_lead',{p});
    if(error){ toast('Erro: '+error.message); return false; }
    toast(data&&data.nova?'Lead no funil.':'Telefone já existia: registrado na oportunidade aberta.');
    await crmCarregar(); crmPintar(); if(data&&data.opportunity_id) crmAbrirFicha(data.opportunity_id); return true;
  });
  setTimeout(crmNovoLeadOrigem,0);
};
window.crmNovoLeadOrigem=()=>{ const src=crmVal('cl_src'), org=crmOrigem(src); const l=document.getElementById('cl_det_l'), d=document.getElementById('cl_det'), c=document.getElementById('cl_camp'); if(!l) return;
  const rot={indicacao:['Quem indicou','nome de quem indicou'],organico:['Como chegou','Instagram, Google, site…'],formulario:['Formulário','nome do formulário'],evento:['Evento','nome do evento'],outbound:['Lista / abordagem',''],base:['Cliente / histórico',''],meta_ads:['Observação da origem','ex.: veio pelo anúncio mas fora do rastreio'],google_ads:['Palavra-chave / campanha','']}[src]||['Detalhe da origem',''];
  l.textContent=rot[0]; d.placeholder=rot[1]; c.style.display=org.paid?'grid':'none'; };

window.crmGanhoModal=(id)=>{ const o=CRM.d.opps.find(x=>x.id===id)||{};
  modal('Fechou! 🎉',`<div class="crm-form"><div class="row2"><div class="field"><label>Receita (R$) *</label><input id="cg_val" inputmode="decimal" value="${o.value||''}" placeholder="5950"></div>
    <div class="field"><label>Closer</label>${crmSelEquipe('cg_closer',crmClosers(),o.closer_id||(crmPapel()==='closer'?currentUser.id:''),'—')}</div></div>
    <div class="crm-hint">A receita é o que alimenta ROAS, ROI e CAC. Se a oportunidade veio de anúncio com ctwa_clid, a venda será devolvida à Meta (CAPI) numa fase futura.</div></div>`,
    async ()=>{ const v=Number(crmVal('cg_val').replace(/\./g,'').replace(',','.')); if(!v||v<=0){ toast('Informe a receita.'); return false; }
      const r=await crmMover(id,'ganho',{revenue:v,closer_id:crmVal('cg_closer')||undefined}); return r!==false; }); };
window.crmPerdaModal=(id)=>{
  modal('Marcar como perdido',`<div class="crm-form"><div class="field"><label>Motivo *</label><select id="cp_mot">${CRM.d.motivos.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Detalhe</label><textarea id="cp_obs" rows="2" placeholder="o que aconteceu"></textarea></div></div>`,
    async ()=>{ const r=await crmMover(id,'perdido',{lost_reason_id:crmVal('cp_mot'),lost_notes:crmVal('cp_obs')}); return r!==false; }); };
window.crmResponsavelModal=(id)=>{ const o=CRM.d.opps.find(x=>x.id===id)||{};
  modal('Responsáveis',`<div class="crm-form"><div class="row2"><div class="field"><label>SDR</label>${crmSelEquipe('cr_sdr',crmSdrs(),o.sdr_id,'sem SDR')}</div><div class="field"><label>Closer</label>${crmSelEquipe('cr_closer',crmClosers(),o.closer_id,'sem closer')}</div></div></div>`,
    async ()=>{ const {error}=await sb.rpc('crm_atualizar',{p_opp:id,p:{sdr_id:crmVal('cr_sdr'),closer_id:crmVal('cr_closer')}}); if(error){ toast('Erro: '+error.message); return false; }
      await crmCarregar(); delete CRM.tl[id]; crmPintar(); return true; }); };
window.crmEditarModal=(id)=>{ const o=CRM.d.opps.find(x=>x.id===id)||{}; const c=o.contact||{};
  modal('Editar oportunidade',`<div class="crm-form">
    <div class="row2"><div class="field"><label>Nome</label><input id="ce_nome" value="${esc(c.name||'')}"></div><div class="field"><label>Empresa</label><input id="ce_emp" value="${esc(c.company||'')}"></div></div>
    <div class="row2"><div class="field"><label>E-mail (convite do Meet)</label><input id="ce_email" value="${esc(c.email||'')}"></div><div class="field"><label>Cidade</label><input id="ce_cid" value="${esc(c.city||'')}"></div></div>
    <div class="row2"><div class="field"><label>Origem</label><select id="ce_src">${CRM.d.origens.map(s=>`<option value="${s.key}"${s.key===o.source?' selected':''}>${esc(s.name)}</option>`).join('')}</select></div><div class="field"><label>Detalhe da origem</label><input id="ce_det" value="${esc(o.source_detail||'')}"></div></div>
    <div class="row2"><div class="field"><label>Valor estimado (R$)</label><input id="ce_val" value="${o.value||''}"></div><div class="field"><label>Próxima atividade</label><input id="ce_next" value="${esc(o.next_activity||'')}" placeholder="ex.: follow-up quinta"></div></div>
  </div>`, async ()=>{
    const up={name:crmVal('ce_nome')||null,company:crmVal('ce_emp')||null,email:crmVal('ce_email')||null,city:crmVal('ce_cid')||null};
    const r1=await sb.from('contacts').update(up).eq('id',o.contact_id); if(r1.error){ toast('Erro: '+r1.error.message); return false; }
    const p={}; const nv=crmVal('ce_val').replace(/\./g,'').replace(',','.'); if(String(o.value||'')!==nv) p.value=nv;
    if(crmVal('ce_src')!==o.source||crmVal('ce_det')!==(o.source_detail||'')){ p.source=crmVal('ce_src'); p.source_detail=crmVal('ce_det'); }
    if(crmVal('ce_next')!==(o.next_activity||'')) p.next_activity=crmVal('ce_next');
    if(Object.keys(p).length){ const r2=await sb.rpc('crm_atualizar',{p_opp:id,p}); if(r2.error){ toast('Erro: '+r2.error.message); return false; } }
    await crmCarregar(); delete CRM.tl[id]; crmPintar(); return true; }); };
window.crmNotaModal=(id)=>{ modal('Anotação',`<div class="crm-form"><div class="field"><textarea id="cn_txt" rows="4" placeholder="o que aconteceu nessa conversa"></textarea></div></div>`,
  async ()=>{ const t=crmVal('cn_txt'); if(!t) return false; const {error}=await sb.rpc('crm_atualizar',{p_opp:id,p:{note:t}}); if(error){ toast('Erro: '+error.message); return false; } delete CRM.tl[id]; crmPintar(); return true; }); };

window.crmEquipeModal=()=>{
  const papeis=[['','— sem CRM —'],['sdr','SDR'],['closer','Closer'],['gestor','Gestor'],['admin','Admin']];
  modal('Equipe comercial',`<div class="crm-equipe">${CRM.d.equipe.map(p=>`<div>${crmAv(p.id)}<b>${esc(p.nome)}${p.role==='master'?' <span class="crm-badge">master</span>':''}</b>
    ${p.role==='master'?'<span class="crm-badge pago">admin</span>':`<select data-id="${p.id}">${papeis.map(x=>`<option value="${x[0]}"${(p.papel_crm||'')===x[0]?' selected':''}>${x[1]}</option>`).join('')}</select>`}</div>`).join('')}
    <div class="crm-hint">SDR e closer entram nos filtros e podem mover leads; não veem credenciais nem configurações. Quem não tem papel não vê a aba Comercial. Para agendar na agenda de um closer, ele precisa conectar o Google (aba Agenda).</div></div>`,
    async ()=>{ const sels=[...document.querySelectorAll('.crm-equipe select[data-id]')]; let erro=null;
      for(const s of sels){ const p=CRM.d.equipe.find(x=>x.id===s.dataset.id); if(!p||(p.papel_crm||'')===s.value) continue;
        const {error}=await sb.from('perfis').update({papel_crm:s.value||null}).eq('id',p.id); if(error) erro=error; }
      if(erro){ toast('Erro: '+erro.message); return false; } await crmCarregar(); crmPintar(); toast('Equipe atualizada.'); return true; }); };

/* ---------- AGENDA ---------- */
async function crmEdge(corpo){
  if(!SESSION||!SESSION.access_token) throw new Error('sem login');
  const r=await fetch(SUPA_URL+'/functions/v1/google-agenda',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+SESSION.access_token},body:JSON.stringify(corpo)});
  const j=await r.json().catch(()=>({erro:'resposta inválida'}));
  if(!r.ok||j.erro) throw new Error(({sem_login:'Faça login de novo.',closer_desconectado:'Esse closer ainda não conectou o Google Agenda.',desconectado:'Conecte o Google Agenda primeiro.',reconectar:'A conexão com o Google expirou: reconecte.',sem_permissao_crm:'Sem permissão no CRM.',google_criar:'O Google não criou o evento: '+(j.detalhe||''),oportunidade_fechada:'Essa oportunidade já está fechada.'})[j.erro]||(j.erro+(j.detalhe?': '+j.detalhe:'')));
  return j;
}
const crmGoogleDe=(uid)=>CRM.d.google.find(g=>g.user_id===uid)||null;
window.crmConectarGoogle=async ()=>{ try{ const j=await crmEdge({acao:'authurl'}); window.open(j.url,'_blank','noopener'); toast('Autorize na aba que abriu e volte aqui; depois toque em ↻.'); }catch(e){ toast(e.message); } };
window.crmSemana=(n)=>{ CRM.semana+=n; crmPintar(); };
function crmAgendaHTML(){
  const hoje=new Date(); hoje.setHours(0,0,0,0);
  const seg=new Date(hoje); seg.setDate(seg.getDate()-((seg.getDay()+6)%7)+CRM.semana*7);
  const dias=[0,1,2,3,4,5].map(i=>{ const d=new Date(seg); d.setDate(d.getDate()+i); return d; });
  const fim=new Date(seg); fim.setDate(fim.getDate()+6);
  const f=CRM.f;
  const aps=CRM.d.appts.filter(a=>a.status!=='rescheduled'&&a.status!=='canceled').filter(a=>{ const d=new Date(a.scheduled_start); return d>=seg&&d<fim; })
    .filter(a=>(!f.closer||a.closer_id===f.closer)&&(!f.sdr||a.sdr_id===f.sdr))
    .filter(a=>{ if(!f.origem&&!f.campanha&&!f.busca) return true; const o=CRM.d.opps.find(x=>x.id===a.opportunity_id); return o&&crmFiltrar([o]).length; });
  const H0=8,H1=19;
  const nomeOpp=(a)=>{ const o=CRM.d.opps.find(x=>x.id===a.opportunity_id); const c=o&&o.contact||{}; return {n:c.name||crmFone(c.phone_e164)||'Lead',e:c.company||'',o}; };
  let w=`<div class="hh"></div>`+dias.map(d=>`<div class="dh${crmIsoLocal(d)===crmIsoLocal(hoje)?' hoje':''}">${d.toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','')}<small>${d.getDate()} ${d.toLocaleDateString('pt-BR',{month:'short'}).replace('.','')}</small></div>`).join('');
  for(let h=H0;h<=H1;h++){ w+=`<div class="hh">${String(h).padStart(2,'0')}:00</div>`+dias.map(d=>{ const ini=new Date(d); ini.setHours(h,0,0,0);
      const its=aps.filter(a=>{ const s=new Date(a.scheduled_start); return s.getFullYear()===d.getFullYear()&&s.getMonth()===d.getMonth()&&s.getDate()===d.getDate()&&s.getHours()===h; });
      const passado=ini<new Date();
      return `<div class="c${crmIsoLocal(d)===crmIsoLocal(hoje)?' hoje':''}${!its.length&&!passado?' livre':''}" ${!its.length&&!passado?`onclick="crmAgendarModal('',${ini.getTime()})" title="Agendar às ${String(h).padStart(2,'0')}:00"`:''}>${its.map(a=>{ const x=nomeOpp(a); const dur=Math.max(30,(new Date(a.scheduled_end)-new Date(a.scheduled_start))/60000);
        return `<div class="crm-ev ${a.status}${passado?' passado':''}" style="height:${Math.round(dur/60*44)-4}px" onclick="event.stopPropagation();crmAbrirFicha('${a.opportunity_id}')" title="${esc(x.n)} · ${esc(crmNome(a.closer_id))}">${esc(crmHora(a.scheduled_start))} ${esc(x.n)}<small>${esc(x.e||('closer '+crmNome(a.closer_id)))}${a.meet_url?' · Meet':''}</small></div>`; }).join('')}</div>`; }).join(''); }
  const eu=currentUser||{}; const meuG=crmGoogleDe(eu.id);
  const closers=crmClosers();
  const meus=CRM.d.appts.filter(a=>(!f.closer||a.closer_id===f.closer)&&(!f.sdr||a.sdr_id===f.sdr));
  const prox=meus.filter(a=>['scheduled','confirmed'].includes(a.status)&&new Date(a.scheduled_start)>=new Date()).slice(0,6);
  const pend=meus.filter(a=>['scheduled','confirmed'].includes(a.status)&&new Date(a.scheduled_end)<new Date()).slice(-8);
  return `<div class="toolbar" style="margin:0 0 12px;gap:8px;flex-wrap:wrap">
      <button class="btn secondary small" onclick="crmSemana(-1)">‹</button><button class="btn secondary small" onclick="CRM.semana=0;crmPintar()">Hoje</button><button class="btn secondary small" onclick="crmSemana(1)">›</button>
      <b style="font-size:14px">${esc(crmDia(seg.toISOString()))} – ${esc(crmDia(new Date(fim-1).toISOString()))}</b>
      <span style="margin-left:auto"></span>
      ${meuG?`<span class="crm-badge ok" title="${esc(meuG.google_email||'')}">● Google conectado</span>`:`<button class="btn secondary small" onclick="crmConectarGoogle()">Conectar meu Google Agenda</button>`}
      <button class="btn small" onclick="crmAgendarModal('')">📅 Agendar sessão</button></div>
    <div class="crm-week">${w}</div>
    <div class="crm-legenda"><span><i style="background:var(--brand)"></i>Agendada</span><span><i style="background:var(--ok)"></i>Compareceu</span><span><i style="background:var(--danger)"></i>No-show</span><span><i style="background:var(--warn)"></i>Indeterminado</span>
      <span style="margin-left:auto">Closers: ${closers.map(p=>`${esc(p.nome.split(' ')[0])} ${crmGoogleDe(p.id)?'<span class="crm-badge ok">Google ok</span>':'<span class="crm-badge warn">sem Google</span>'}`).join(' · ')||'nenhum closer definido (Equipe comercial)'}</span></div>
    ${pend.length?`<div class="crm-box" style="margin-top:14px"><h4>Reuniões passadas sem presença marcada <span class="crm-badge warn">${pend.length}</span></h4><div class="crm-mini">${pend.map(a=>{ const x=nomeOpp(a); return `<div><span>${esc(crmQuando(a.scheduled_start))} · ${esc(x.n)} · ${esc(crmNome(a.closer_id))}</span><b><button class="btn secondary small" onclick="crmPresenca('${a.id}','attended')">Compareceu</button> <button class="btn secondary small" onclick="crmPresenca('${a.id}','no_show')">No-show</button></b></div>`; }).join('')}</div>
      <div class="crm-hint">Na Fase 7 isso passa a vir sozinho do Google Meet (quem entrou e por quanto tempo). Até lá, o closer confirma aqui.</div></div>`:''}
    ${prox.length?`<div class="crm-box" style="margin-top:14px"><h4>Próximas sessões</h4><div class="crm-mini">${prox.map(a=>{ const x=nomeOpp(a); return `<div><span>${esc(crmQuando(a.scheduled_start))} · <a href="#" onclick="event.preventDefault();crmAbrirFicha('${a.opportunity_id}')" style="color:var(--brand2)">${esc(x.n)}</a>${x.e?' · '+esc(x.e):''}</span><b>${esc(crmNome(a.sdr_id))} → ${esc(crmNome(a.closer_id))}${a.meet_url?` · <a href="${esc(a.meet_url)}" target="_blank" rel="noopener" style="color:var(--brand2)">Meet</a>`:''}</b></div>`; }).join('')}</div></div>`:''}`;
}
window.crmAgendarModal=(oppId,ts)=>{
  const abertos=CRM.d.opps.filter(o=>o.status==='open').sort((a,b)=>String((a.contact||{}).name||'').localeCompare(String((b.contact||{}).name||'')));
  const o=abertos.find(x=>x.id===oppId)||null;
  const closers=crmClosers(); const eu=currentUser||{};
  const closerPad=(o&&o.closer_id)||(crmPapel()==='closer'?eu.id:(closers.find(p=>crmGoogleDe(p.id))||{}).id||'');
  const ini=ts?new Date(ts):(()=>{ const d=new Date(); d.setDate(d.getDate()+1); d.setHours(10,0,0,0); return d; })();
  modal('Agendar sessão estratégica',`<div class="crm-form">
    <div class="field"><label>Oportunidade *</label>${o?`<input value="${esc((o.contact||{}).name||crmFone((o.contact||{}).phone_e164))}${(o.contact||{}).company?' · '+esc((o.contact||{}).company):''}" disabled><input type="hidden" id="ca_opp" value="${o.id}">`
      :`<select id="ca_opp"><option value="">escolha…</option>${abertos.map(x=>`<option value="${x.id}">${esc((x.contact||{}).name||crmFone((x.contact||{}).phone_e164))}${(x.contact||{}).company?' · '+esc((x.contact||{}).company):''} · ${esc(crmEst(x.stage).nome)}</option>`).join('')}</select>`}</div>
    <div class="row3"><div class="field"><label>Closer *</label><select id="ca_closer" onchange="crmOcupacao()">${closers.map(p=>`<option value="${p.id}"${p.id===closerPad?' selected':''}>${esc(p.nome)}${crmGoogleDe(p.id)?'':' (sem Google)'}</option>`).join('')}</select></div>
      <div class="field"><label>Dia *</label><input id="ca_dia" type="date" value="${crmIsoLocal(ini)}" onchange="crmOcupacao()"></div>
      <div class="field"><label>Duração</label><select id="ca_dur"><option value="30">30 min</option><option value="45">45 min</option><option value="60" selected>1 hora</option><option value="90">1h30</option></select></div></div>
    <div class="field"><label>Horário *</label><div class="crm-slots" id="ca_slots"></div><input type="hidden" id="ca_hora" value="${String(ini.getHours()).padStart(2,'0')}:${String(ini.getMinutes()).padStart(2,'0')}"><div class="crm-ocup" id="ca_ocup">Consultando a agenda do closer…</div></div>
    <div class="field"><label>Observação para o convite</label><input id="ca_obs" placeholder="opcional"></div>
    <div class="crm-hint">Cria o evento na agenda Google do closer com um Meet exclusivo, grava o link na oportunidade e move para “Agendado”. Se o lead tiver e-mail na ficha, recebe o convite.</div>
  </div>`, async ()=>{
    const opp=crmVal('ca_opp'), closer=crmVal('ca_closer'), dia=crmVal('ca_dia'), hora=crmVal('ca_hora');
    if(!opp||!closer||!dia||!hora){ toast('Escolha oportunidade, closer, dia e horário.'); return false; }
    const inicio=new Date(dia+'T'+hora+':00');
    try{ const j=await crmEdge({acao:'crm_agendar',opportunity_id:opp,closer_id:closer,inicio:inicio.toISOString(),duracao_min:Number(crmVal('ca_dur'))||60,obs:crmVal('ca_obs')});
      toast('Sessão marcada: '+j.quando+(j.meet_url?' · Meet criado':'')); await crmCarregar(); delete CRM.tl[opp]; crmPintar(); return true;
    }catch(e){ toast(e.message); return false; }
  });
  setTimeout(crmOcupacao,0);
};
window.crmOcupacao=async ()=>{
  const closer=crmVal('ca_closer'), dia=crmVal('ca_dia'), box=document.getElementById('ca_slots'), oc=document.getElementById('ca_ocup'); if(!box) return;
  const hsel=crmVal('ca_hora');
  const pinta=(blocos,conectado)=>{
    const ocupado=(h,m)=>{ const t=new Date(dia+'T'+String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':00').getTime(); const fim=t+30*60000;
      return blocos.some(b=>{ const bi=new Date(b.inicio).getTime(), bf=new Date(b.fim).getTime(); return bi<fim&&bf>t; })
        || CRM.d.appts.some(a=>a.closer_id===closer&&['scheduled','confirmed'].includes(a.status)&&new Date(a.scheduled_start).getTime()<fim&&new Date(a.scheduled_end).getTime()>t); };
    const slots=[]; for(let h=8;h<=19;h++) for(const m of [0,30]){ const hh=String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'); const oc2=ocupado(h,m); const passado=new Date(dia+'T'+hh+':00')<new Date();
      slots.push(`<div class="crm-slot${hh===hsel?' on':''}${oc2||passado?' ocupado':''}" ${oc2||passado?'':`onclick="document.getElementById('ca_hora').value='${hh}';[...this.parentNode.children].forEach(x=>x.classList.remove('on'));this.classList.add('on')"`}>${hh}</div>`); }
    box.innerHTML=slots.join('');
    oc.innerHTML=conectado?(blocos.length?`Ocupado na agenda do closer: ${blocos.map(b=>esc(crmHora(b.inicio))+'–'+esc(crmHora(b.fim))+(b.titulo?' '+esc(b.titulo):'')).join(' · ')}`:'Agenda do closer livre nesse dia.'):'<span style="color:var(--warn)">Esse closer não conectou o Google Agenda — sem disponibilidade real; o agendamento vai falhar até ele conectar.</span>';
  };
  pinta([],true); if(!closer||!dia) return;
  try{ const j=await crmEdge({acao:'crm_ocupacao',closer_id:closer,dia}); pinta(j.blocos||[],j.conectado!==false); }catch(e){ oc.textContent=e.message; }
};
window.crmReagendarModal=(apId)=>{ const ap=CRM.d.appts.find(a=>a.id===apId); if(!ap) return; const ini=new Date(ap.scheduled_start);
  modal('Reagendar sessão',`<div class="crm-form"><input type="hidden" id="ca_closer" value="${ap.closer_id}"><div class="row2"><div class="field"><label>Dia</label><input id="ca_dia" type="date" value="${crmIsoLocal(ini)}" onchange="crmOcupacao()"></div><div class="field"><label>Duração</label><select id="ca_dur"><option value="30">30 min</option><option value="45">45 min</option><option value="60" selected>1 hora</option><option value="90">1h30</option></select></div></div>
    <div class="field"><label>Horário</label><div class="crm-slots" id="ca_slots"></div><input type="hidden" id="ca_hora" value="${String(ini.getHours()).padStart(2,'0')}:${String(ini.getMinutes()).padStart(2,'0')}"><div class="crm-ocup" id="ca_ocup"></div></div></div>`,
    async ()=>{ const inicio=new Date(crmVal('ca_dia')+'T'+crmVal('ca_hora')+':00');
      try{ const j=await crmEdge({acao:'crm_reagendar',appointment_id:apId,inicio:inicio.toISOString(),duracao_min:Number(crmVal('ca_dur'))||60}); toast('Reagendado: '+j.quando); await crmCarregar(); delete CRM.tl[ap.opportunity_id]; crmPintar(); return true; }
      catch(e){ toast(e.message); return false; } });
  setTimeout(crmOcupacao,0); };
window.crmCancelarAp=async (apId)=>{ const ap=CRM.d.appts.find(a=>a.id===apId); if(!ap) return;
  const ok=await confirmar('Cancelar esta sessão?','O evento sai da agenda do closer e o lead fica no estágio atual.',{sim:'Cancelar sessão',nao:'Voltar'}); if(!ok) return;
  try{ await crmEdge({acao:'crm_cancelar',appointment_id:apId,motivo:''}); toast('Sessão cancelada.'); await crmCarregar(); delete CRM.tl[ap.opportunity_id]; crmPintar(); }catch(e){ toast(e.message); } };
window.crmPresenca=async (apId,st)=>{ const ap=CRM.d.appts.find(a=>a.id===apId); if(!ap) return;
  try{ const j=await crmEdge({acao:'crm_presenca',appointment_id:apId,status:st}); toast(st==='attended'?'Compareceu registrado.':st==='no_show'?'No-show registrado.':'Marcado como indeterminado.'); if(j.aviso_estagio) toast(j.aviso_estagio); await crmCarregar(); delete CRM.tl[ap.opportunity_id]; crmPintar(); }catch(e){ toast(e.message); } };

/* ---------- ORIGEM DA RECEITA ---------- */
CRM.mes=null;
window.crmMes=(n)=>{ const [y,m]=(CRM.mes||crmIsoLocal(new Date()).slice(0,7)).split('-').map(Number); const d=new Date(y,m-1+n,1); CRM.mes=crmIsoLocal(d).slice(0,7); crmPintar(); };
function crmOrigensHTML(){
  const mes=CRM.mes||crmIsoLocal(new Date()).slice(0,7); const [y,m]=mes.split('-').map(Number);
  const ant=crmIsoLocal(new Date(y,m-2,1)).slice(0,7);
  const rows=CRM.d.origensMes.filter(r=>String(r.mes).slice(0,7)===mes), rowsAnt=CRM.d.origensMes.filter(r=>String(r.mes).slice(0,7)===ant);
  const porOrigem=CRM.d.origens.map(s=>{ const r=rows.find(x=>x.source===s.key)||{}, a=rowsAnt.find(x=>x.source===s.key)||{};
    return {s,leads:+r.leads||0,resp:+r.respondidos||0,ag:+r.agendados||0,comp:+r.compareceram||0,vendas:+r.vendas||0,receita:+r.receita||0,antReceita:+a.receita||0,antLeads:+a.leads||0}; }).filter(x=>x.leads||x.receita||x.antReceita);
  const tot=(k)=>porOrigem.reduce((s,x)=>s+x[k],0);
  const receita=tot('receita'), leads=tot('leads'), vendas=tot('vendas');
  const pago=porOrigem.filter(x=>x.s.paid), org=porOrigem.filter(x=>!x.s.paid);
  const soma=(arr,k)=>arr.reduce((s,x)=>s+x[k],0);
  const delta=(a,b)=>{ if(!b) return a?'<span class="up">novo</span>':''; const v=Math.round((a-b)/b*100); return `<span class="${v>=0?'up':'down'}">${v>=0?'▲':'▼'} ${Math.abs(v)}%</span>`; };
  const nomeMes=new Date(y,m-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const linha=(x)=>`<tr><td><span class="crm-badge ${x.s.paid?'pago':'org'}">${esc(x.s.name)}</span></td><td class="r">${x.leads}</td><td class="r">${x.resp}</td><td class="r">${x.ag}</td><td class="r">${x.comp}</td><td class="r">${x.vendas}</td><td class="r">${crmPct(x.vendas,x.leads)}%</td><td class="r"><b>${x.receita?esc(brl(x.receita)):'—'}</b></td><td class="r">${receita?crmPct(x.receita,receita)+'%':'—'}</td><td style="min-width:110px"><div class="crm-share ${x.s.paid?'':'org'}"><i style="width:${receita?Math.round(x.receita/receita*100):0}%"></i></div></td><td class="r">${delta(x.receita,x.antReceita)}</td></tr>`;
  return `<div class="toolbar" style="margin:0 0 12px;gap:8px">
      <button class="btn secondary small" onclick="crmMes(-1)">‹</button><b style="font-size:14px;text-transform:capitalize">${esc(nomeMes)}</b><button class="btn secondary small" onclick="crmMes(1)">›</button>
      <span class="crm-hint" style="margin:0 0 0 8px">comparado com ${esc(new Date(y,m-2,1).toLocaleDateString('pt-BR',{month:'long'}))}</span></div>
    <div class="crm-kpis">
      <div class="crm-kpi hi"><div class="k">Receita do mês</div><div class="v">${receita?esc(brl(receita)):'—'}</div><div class="s">${vendas} venda${vendas===1?'':'s'} · ${leads} lead${leads===1?'':'s'}</div></div>
      <div class="crm-kpi"><div class="k">Mídia paga</div><div class="v" style="color:var(--brand2)">${soma(pago,'receita')?esc(brl(soma(pago,'receita'))):'—'}</div><div class="s">${receita?crmPct(soma(pago,'receita'),receita):0}% da receita · ${soma(pago,'leads')} leads · ${soma(pago,'vendas')} vendas</div></div>
      <div class="crm-kpi"><div class="k">Indicação / orgânico</div><div class="v" style="color:var(--info2)">${soma(org,'receita')?esc(brl(soma(org,'receita'))):'—'}</div><div class="s">${receita?crmPct(soma(org,'receita'),receita):0}% da receita · ${soma(org,'leads')} leads · ${soma(org,'vendas')} vendas</div></div>
      <div class="crm-kpi"><div class="k">Ticket médio</div><div class="v">${vendas?esc(brl(receita/vendas)):'—'}</div><div class="s">lead → venda ${crmPct(vendas,leads)}%</div></div>
    </div>
    <div class="card" style="padding:0;overflow:auto"><table class="crm-tbl">
      <tr><th>Origem</th><th class="r">Leads</th><th class="r">Resp.</th><th class="r">Agend.</th><th class="r">Compar.</th><th class="r">Vendas</th><th class="r">Lead→venda</th><th class="r">Receita</th><th class="r">% receita</th><th></th><th class="r">vs. mês ant.</th></tr>
      ${porOrigem.length?porOrigem.sort((a,b)=>b.receita-a.receita||b.leads-a.leads).map(linha).join(''):'<tr><td colspan="11" style="text-align:center;color:var(--fraco);padding:24px">Nenhum lead neste mês ainda. Use “+ Lead” para indicação/orgânico; os de anúncio chegam pelo WhatsApp.</td></tr>'}
      ${porOrigem.length?`<tr class="tot"><td>Total</td><td class="r">${leads}</td><td class="r">${tot('resp')}</td><td class="r">${tot('ag')}</td><td class="r">${tot('comp')}</td><td class="r">${vendas}</td><td class="r">${crmPct(vendas,leads)}%</td><td class="r">${esc(brl(receita))}</td><td class="r">100%</td><td></td><td class="r">${delta(receita,rowsAnt.reduce((s,r)=>s+(+r.receita||0),0))}</td></tr>`:''}
    </table></div>
    <p class="crm-hint">Mês = mês em que o lead entrou (data da oportunidade). Receita conta quando a oportunidade é marcada como Ganho. Investimento em mídia, CPL, CAC e ROAS por origem entram quando a sincronização com a Meta (Fase 4) estiver no ar.</p>`;
}

/* ---------- INTEGRAÇÕES (admin) ---------- */
const CRM_LOGOS={
  whatsapp:`<svg viewBox="0 0 48 48"><path fill="#25D366" d="M24 4C13 4 4 13 4 24c0 3.6 1 7 2.7 10L4 44l10.3-2.6C17.2 43 20.5 44 24 44c11 0 20-9 20-20S35 4 24 4z"/><path fill="#fff" d="M33.6 28.3c-.5-.3-3-1.5-3.5-1.7-.5-.2-.8-.3-1.2.3-.3.5-1.3 1.7-1.6 2-.3.3-.6.4-1.1.1-.5-.3-2.1-.8-4.1-2.5-1.5-1.3-2.5-3-2.8-3.5-.3-.5 0-.8.2-1 .2-.2.5-.6.8-.9.3-.3.3-.5.5-.8.2-.3.1-.6 0-.9-.1-.3-1.2-2.8-1.6-3.8-.4-1-.9-.9-1.2-.9h-1c-.3 0-.9.1-1.4.6-.5.5-1.8 1.8-1.8 4.3s1.9 5 2.1 5.3c.3.3 3.7 5.6 8.9 7.9 1.2.5 2.2.9 3 1.1 1.2.4 2.4.3 3.3.2 1-.2 3-1.2 3.5-2.4.4-1.2.4-2.2.3-2.4-.1-.3-.4-.4-.9-.6z"/></svg>`,
  meta:`<svg viewBox="0 0 48 48"><defs><linearGradient id="crmMetaG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0064E0"/><stop offset="1" stop-color="#7B68EE"/></linearGradient></defs><path fill="none" stroke="url(#crmMetaG)" stroke-width="5.5" stroke-linecap="round" d="M6 30c0-7 3.5-14 8-14 5 0 8 8 10 12 2 4 5 12 10 12 4.5 0 8-7 8-14s-3.5-12-8-12c-5 0-8 8-10 12-2 4-5 14-10 14-4.5 0-8-3-8-10z"/></svg>`,
  gcal:`<svg viewBox="0 0 48 48"><rect x="8" y="10" width="32" height="30" rx="4" fill="#fff"/><rect x="8" y="10" width="32" height="8" rx="4" fill="#1A73E8"/><rect x="8" y="14" width="32" height="4" fill="#1A73E8"/><rect x="8" y="32" width="8" height="8" fill="#188038"/><rect x="32" y="32" width="8" height="8" fill="#FBBC04"/><rect x="8" y="18" width="8" height="14" fill="#4285F4" opacity=".15"/><path fill="#EA4335" d="M32 40h8l-8 8z"/><text x="24" y="33" font-size="13" font-weight="700" fill="#1A73E8" text-anchor="middle" font-family="Inter,system-ui,sans-serif">31</text></svg>`,
  meet:`<svg viewBox="0 0 48 48"><path fill="#00832D" d="M8 16h14v16H8z"/><path fill="#0066DA" d="M8 32h14v8H12a4 4 0 0 1-4-4z"/><path fill="#E94235" d="M8 16v-4a4 4 0 0 1 4-4h10v8z"/><path fill="#2684FC" d="M22 8h10v8H22z"/><path fill="#00AC47" d="M22 32h10v8H22z"/><path fill="#FFBA00" d="M32 16v16l8 6V10z"/><path fill="#00AC47" d="M32 16v16h-10V16z" opacity=".35"/></svg>`,
  capi:`<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="18" fill="none" stroke="#7B68EE" stroke-width="3"/><path fill="none" stroke="#a78bfa" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" d="M15 27l6-6 5 5 8-9M28 17h6v6"/></svg>`
};
CRM.intg={saude:null,logs:null,meta:null,carregando:false,erro:''};
async function crmAdminEdge(corpo){
  if(!SESSION||!SESSION.access_token) throw new Error('sem login');
  const r=await fetch(SUPA_URL+'/functions/v1/wa-admin',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+SESSION.access_token},body:JSON.stringify(corpo)});
  const j=await r.json().catch(()=>({erro:'resposta inválida'}));
  if(!r.ok||(j.erro&&!('ok' in j))) throw new Error(j.detalhe?j.erro+': '+j.detalhe:(j.erro||'erro'));
  return j;
}
async function crmIntgCarregar(){
  if(CRM.intg.carregando) return; CRM.intg.carregando=true;
  try{ const [s,w]=await Promise.all([crmAdminEdge({acao:'saude'}), sb.from('whatsapp_connections').select('*').order('created_at')]);
    CRM.intg.saude=s; CRM.d.wa=(w.data||[]); CRM.intg.erro=''; }
  catch(e){ CRM.intg.erro=e.message; }
  CRM.intg.carregando=false; crmPintar();
}
const crmRel=(iso)=>{ if(!iso) return 'nunca'; const m=Math.round((Date.now()-new Date(iso))/60000); if(m<1) return 'agora'; if(m<60) return m+' min atrás'; const h=Math.round(m/60); if(h<48) return h+' h atrás'; return crmDia(iso); };
function crmIntgHTML(){
  const s=CRM.intg.saude, wa=CRM.d.wa||[]; const h=(p)=>((s&&s.health)||[]).find(x=>x.provider===p)||{};
  const google=(s&&s.google)||CRM.d.google.map(g=>({dono:g.user_id,google_email:g.google_email}));
  const closers=crmClosers(); const closersG=closers.filter(c=>google.some(g=>g.dono===c.id));
  const capi=(s&&s.capi)||{};
  const conectados=wa.filter(c=>c.connection_status==='connected').length;
  const st=(cls,txt)=>`<span class="st ${cls}"><i></i>${txt}</span>`;
  const tile=(lg,nome,status,sub)=>`<div class="crm-hc"><div class="lg">${CRM_LOGOS[lg]}</div><div style="min-width:0"><b>${nome}</b>${status}<small>${sub}</small></div></div>`;
  const saude=`<div class="crm-intg-saude">
    ${tile('whatsapp','WhatsApp', wa.length?(conectados===wa.length?st('ok','Conectado'):conectados?st('warn','Instável'):st('bad','Erro')):st('off','Sem número'), wa.length?`${conectados}/${wa.length} números · webhook ${crmRel(s&&s.ultimo_webhook)}`:'conecte o primeiro número')}
    ${tile('meta','Meta Ads', h('meta_ads').status==='connected'?st('ok','Conectado'):h('meta_ads').status==='error'?st('bad','Erro'):st('off','Não testado'), h('meta_ads').details&&h('meta_ads').details.conta?esc(h('meta_ads').details.conta.nome||''):'sincronização automática na Fase 4')}
    ${tile('gcal','Google Agenda', closersG.length?st('ok','Conectado'):google.length?st('warn','Sem closer'):st('off','Ninguém conectou'), `${google.length} conta${google.length===1?'':'s'} · ${closersG.length}/${closers.length} closers`)}
    ${tile('meet','Google Meet', closersG.length?st('ok','Meet exclusivo por sessão'):st('off','Depende da Agenda'), 'presença automática na Fase 7')}
    ${tile('capi','Conversions API', (capi.accepted||capi.sent)?st('ok','Enviando'):capi.error?st('bad','Erro'):st('off','Fase 9'), `${capi.pending||0} pendente · ${capi.accepted||0} aceito · ${capi.error||0} erro`)}
  </div>`;
  const waRows=wa.length?wa.map(c=>`<div class="crm-row">${crmAv(c.assigned_user_id)}<div class="g"><b>${esc(c.name)}</b> ${c.phone_number?'· '+esc(c.phone_number):''} ${c.coexistence?'<span class="crm-badge info">coexistência</span>':''} ${c.quality_rating?`<span class="crm-badge ${c.quality_rating==='GREEN'?'ok':c.quality_rating==='RED'?'bad':'warn'}">qualidade ${esc(c.quality_rating)}</span>`:''}
      <small>SDR ${esc(c.assigned_user_id?crmNome(c.assigned_user_id):'—')} · WABA ${esc(c.waba_id||'—')} · Phone ID ${esc(c.phone_number_id||'—')} · webhook ${esc(crmRel(c.last_webhook_at))}${c.last_error?` · <span style="color:var(--danger)">${esc(c.last_error)}</span>`:''}</small></div>
      <span class="crm-badge ${c.connection_status==='connected'?'ok':c.connection_status==='error'?'bad':c.connection_status==='pending'?'warn':''}">${{connected:'conectado',pending:'aguardando token/teste',error:'erro',degraded:'instável',disconnected:'desconectado'}[c.connection_status]||c.connection_status}</span>
      <div class="acts"><button class="btn secondary small" onclick="crmWaTestar('${c.id}')">Testar</button><button class="btn secondary small" onclick="crmWaToken('${c.id}')">${c.token_secret_id?'Reconectar':'Token'}</button><button class="btn secondary small" onclick="crmWaEditar('${c.id}')">Editar</button></div></div>`).join('')
    :'<div class="crm-vazio">Nenhum número conectado. Cada SDR tem o seu; conecte e vincule.</div>';
  const metaDet=h('meta_ads').details||{};
  return `${CRM.intg.erro?`<div class="crm-hint" style="color:var(--danger);margin:0 0 10px">${esc(CRM.intg.erro)}</div>`:''}${saude}
  <div class="crm-intg">
    <div class="crm-ic wide"><div class="hd"><div class="lg">${CRM_LOGOS.whatsapp}</div><div><h4>WhatsApp Business Platform</h4><div class="sub">Cloud API oficial da Meta · um número por SDR · leads de anúncio entram sozinhos no pipeline</div></div>
        <div class="acts"><button class="btn secondary small" onclick="crmWaWebhook()">Webhook</button><button class="btn secondary small" onclick="crmWaLogs()">Logs técnicos</button><button class="btn small" onclick="crmWaNovo()">+ Conectar número</button></div></div>
      ${waRows}<div id="crmWaExtra"></div>
      <div class="crm-hint">O SDR não mexe em token: o administrador conecta o número aqui e vincula ao SDR. Para manter o app WhatsApp Business no celular (coexistência), a AutoSíntese precisa concluir a verificação de Tech Provider na Meta; o Embedded Signup entra aqui assim que for aprovado.</div></div>
    <div class="crm-ic"><div class="hd"><div class="lg">${CRM_LOGOS.meta}</div><div><h4>Meta Ads</h4><div class="sub">Campanhas, conjuntos, anúncios, investimento</div></div><div class="acts"><button class="btn secondary small" onclick="crmMetaTestar()">Testar conexão</button></div></div>
      <div class="crm-kv">
        <span>Business</span><b>${esc(metaDet.conta&&metaDet.conta.business||'—')}</b>
        <span>Ad Account</span><b>${esc(metaDet.conta?metaDet.conta.nome+' · '+metaDet.conta.id:'act_1784945562132417')}</b>
        <span>Token</span><b>${metaDet.token?esc(metaDet.token)+' ('+esc(metaDet.usuario||'')+')':'guardado nos segredos do servidor'}</b>
        <span>Permissões</span><b>${(metaDet.permissoes||[]).length?esc(metaDet.permissoes.join(', ')):'—'}</b>
        <span>Status</span><b>${h('meta_ads').status==='connected'?'<span class="crm-badge ok">conectado</span>':h('meta_ads').status==='error'?`<span class="crm-badge bad">erro</span> ${esc(h('meta_ads').last_error||'')}`:'<span class="crm-badge">não testado</span>'} · ${esc(crmRel(h('meta_ads').checked_at))}</b>
        <span>Sincronização</span><b><span class="crm-fase">Fase 4 · a cada hora, campanhas → conjuntos → anúncios → insights diários</span></b>
      </div></div>
    <div class="crm-ic"><div class="hd"><div class="lg">${CRM_LOGOS.gcal}</div><div><h4>Google Agenda</h4><div class="sub">Sessão estratégica na agenda do closer, com convite</div></div><div class="acts">${crmGoogleDe((currentUser||{}).id)?'<span class="crm-badge ok">minha conta ok</span>':'<button class="btn secondary small" onclick="crmConectarGoogle()">Conectar a minha</button>'}</div></div>
      ${closers.length?closers.map(c=>{ const g=google.find(x=>x.dono===c.id); return `<div class="crm-row">${crmAv(c.id,'c')}<div class="g"><b>${esc(c.nome)}</b> <span class="crm-badge">${esc(c.papel_crm||'master')}</span><small>${g?esc(g.google_email||'conectado')+(g.conectado_em?' · desde '+esc(crmDia(g.conectado_em)):''):'ainda não conectou — ele precisa entrar em Comercial → Agenda → “Conectar meu Google Agenda”'}</small></div>${g?'<span class="crm-badge ok">conectado</span>':'<span class="crm-badge warn">pendente</span>'}</div>`; }).join(''):'<div class="crm-vazio">Defina os closers em “Equipe comercial”.</div>'}
      <div class="crm-hint">Escopo: só eventos da agenda (calendar.events). O token de cada pessoa fica no servidor.</div></div>
    <div class="crm-ic"><div class="hd"><div class="lg">${CRM_LOGOS.meet}</div><div><h4>Google Meet</h4><div class="sub">Um Meet exclusivo por sessão · comparecimento</div></div></div>
      <div class="crm-kv">
        <span>Criação do Meet</span><b>${closersG.length?'<span class="crm-badge ok">ativa</span> junto com o evento da Agenda':'<span class="crm-badge warn">aguardando</span> um closer com Google conectado'}</b>
        <span>Presença</span><b>manual (Compareceu / No-show na Agenda) · <span class="crm-fase">Fase 7 · automática pela Meet REST API: quem entrou, quando, por quanto tempo</span></b>
        <span>Regra automática</span><b>≥ 1 participante externo à AutoSíntese por ≥ 5 min (configurável)</b>
      </div></div>
    <div class="crm-ic"><div class="hd"><div class="lg">${CRM_LOGOS.capi}</div><div><h4>Conversions API</h4><div class="sub">Devolve a venda à Meta (Purchase) para otimizar os anúncios</div></div></div>
      <div class="crm-kv">
        <span>Pendente</span><b>${capi.pending||0}</b><span>Enviado</span><b>${capi.sent||0}</b><span>Aceito</span><b>${capi.accepted||0}</b><span>Erro</span><b>${capi.error||0}</b>
        <span>Regra</span><b>só oportunidades com ctwa_clid do anúncio; 1 Purchase por venda (idempotente); valor em BRL</b>
        <span>Status</span><b><span class="crm-fase">Fase 9 · Conversions API for Business Messaging</span></b>
      </div></div>
  </div>`;
}
window.crmWaNovo=(id)=>{ const c=id?(CRM.d.wa||[]).find(x=>x.id===id):null;
  modal(c?'Editar número':'Conectar número do WhatsApp',`<div class="crm-form">
    <div class="row2"><div class="field"><label>Nome (como aparece aqui)</label><input id="wn_nome" value="${esc(c?c.name:'')}" placeholder="WhatsApp da Loane"></div><div class="field"><label>SDR responsável</label>${crmSelEquipe('wn_sdr',crmSdrs(),c?c.assigned_user_id:'','—')}</div></div>
    <div class="row2"><div class="field"><label>Phone Number ID *</label><input id="wn_pid" value="${esc(c?c.phone_number_id||'':'')}" placeholder="ex.: 556712345678901"></div><div class="field"><label>WABA ID</label><input id="wn_waba" value="${esc(c?c.waba_id||'':'')}" placeholder="ex.: 102987654321"></div></div>
    <div class="row2"><div class="field"><label>Número (só referência)</label><input id="wn_tel" value="${esc(c?c.phone_number||'':'')}" placeholder="+55 17 99700-1101"></div>${c?'':`<div class="field"><label>Access token (fica no cofre)</label><input id="wn_tok" type="password" autocomplete="off" placeholder="EAAG…"></div>`}</div>
    <div class="crm-hint">Onde achar: Meta for Developers → seu app → WhatsApp → Configuração da API. O token vai direto para o cofre do servidor (Vault); ninguém vê depois. Use um token de System User sem expiração.</div></div>`,
    async ()=>{ const row={name:crmVal('wn_nome')||'WhatsApp',assigned_user_id:crmVal('wn_sdr')||null,phone_number_id:crmVal('wn_pid')||null,waba_id:crmVal('wn_waba')||null,phone_number:crmVal('wn_tel')||null};
      if(!row.phone_number_id){ toast('Informe o Phone Number ID.'); return false; }
      let cid=id;
      if(c){ const {error}=await sb.from('whatsapp_connections').update(row).eq('id',id); if(error){ toast('Erro: '+error.message); return false; } }
      else { row.created_by=(currentUser||{}).id; const {data,error}=await sb.from('whatsapp_connections').insert(row).select('id').single(); if(error){ toast('Erro: '+error.message); return false; } cid=data.id;
        const tok=crmVal('wn_tok'); if(tok){ const r=await sb.rpc('crm_wa_salvar_token',{p_conn:cid,p_token:tok}); if(r.error){ toast('Número salvo, mas o token falhou: '+r.error.message); } } }
      toast(c?'Número atualizado.':'Número salvo. Testando…'); await crmIntgCarregar(); if(!c) crmWaTestar(cid); return true; }); };
window.crmWaEditar=(id)=>crmWaNovo(id);
window.crmWaToken=(id)=>{ modal('Token do número',`<div class="crm-form"><div class="field"><label>Novo access token</label><input id="wt_tok" type="password" autocomplete="off" placeholder="EAAG…"></div><div class="crm-hint">Substitui o anterior no cofre e testa a conexão em seguida.</div></div>`,
  async ()=>{ const tok=crmVal('wt_tok'); if(!tok){ toast('Cole o token.'); return false; } const r=await sb.rpc('crm_wa_salvar_token',{p_conn:id,p_token:tok}); if(r.error){ toast('Erro: '+r.error.message); return false; } toast('Token guardado. Testando…'); crmWaTestar(id); return true; }); };
window.crmWaTestar=async (id)=>{ try{ const j=await crmAdminEdge({acao:'wa_testar',conn_id:id}); toast(j.ok?`Conectado: ${j.numero||''} ${j.nome?'('+j.nome+')':''}${j.coexistencia?' · coexistência ativa':''}`:'Falhou: '+(j.detalhe||j.erro)); }catch(e){ toast(e.message); } await crmIntgCarregar(); };
window.crmWaWebhook=async ()=>{ try{ const j=await crmAdminEdge({acao:'wa_webhook_info'}); const box=document.getElementById('crmWaExtra'); if(!box) return;
    box.innerHTML=`<div class="crm-box" style="margin-top:10px"><h4>Webhook para colar no app da Meta <button class="btn secondary small" onclick="this.closest('.crm-box').remove()">fechar</button></h4>
      <div class="crm-kv"><span>Callback URL</span><b>${j.url?`<span class="crm-copy" onclick="navigator.clipboard.writeText('${esc(j.url)}').then(()=>toast('Copiado.'))">${esc(j.url)}</span>`:'WA_WEBHOOK_SECRET não configurado nos segredos do servidor'}</b>
      <span>Verify token</span><b>${j.verify_token?`<span class="crm-copy" onclick="navigator.clipboard.writeText('${esc(j.verify_token)}').then(()=>toast('Copiado.'))">${esc(j.verify_token)}</span>`:'—'}</b>
      <span>Campos</span><b>messages (e, na coexistência, smb_message_echoes, smb_app_state_sync, history)</b></div><div class="crm-hint">${esc(j.aviso||'')}</div></div>`; }catch(e){ toast(e.message); } };
window.crmWaLogs=async ()=>{ try{ const j=await crmAdminEdge({acao:'wa_logs',n:40}); const box=document.getElementById('crmWaExtra'); if(!box) return;
    box.innerHTML=`<div class="crm-box" style="margin-top:10px"><h4>Últimos webhooks <button class="btn secondary small" onclick="this.closest('.crm-box').remove()">fechar</button></h4><div class="crm-log">${(j.logs||[]).length?j.logs.map(l=>`${esc(crmQuando(l.received_at))}  ${esc((l.event_type||'').padEnd(18))}  ${esc(l.status.padEnd(10))}  ${l.attempts?'tent.'+l.attempts:''}  ${esc(l.error||'')}`).join('\n'):'Nenhum webhook registrado ainda (o registro bruto entra com o novo endpoint da Fase 3).'}</div></div>`; }catch(e){ toast(e.message); } };
window.crmMetaTestar=async ()=>{ try{ const j=await crmAdminEdge({acao:'meta_testar'}); toast(j.ok?`Meta ok: ${j.usuario||''} · ${j.conta?j.conta.nome:''}`:'Meta: '+(j.detalhe||j.erro)); }catch(e){ toast(e.message); } await crmIntgCarregar(); };

/* =====================================================================
   PAINEL COMERCIAL — Painel (métricas) e Calls (lançamento)
   ===================================================================== */

/* ---------- PAINEL ---------- */
/* icones de linha dos cartoes, no tamanho do rotulo */
const PC_ICO={
  cal:'<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z"/>',
  ok:'<circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>',
  no:'<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>',
  alerta:'<path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  trofeu:'<path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18"/><path d="M6 2h12v7a6 6 0 01-12 0V2zM9 22h6M12 15v7"/>',
  pct:'<path d="M19 5L5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  cifrao:'<path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>',
  ciclo:'<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/>',
  gente:'<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>'
};
const pcIco=(k)=>`<svg class="pc-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PC_ICO[k]||''}</svg>`;
/* mes de trabalho do Painel: vazio = mes corrente */
const ccMes=()=>CRM.cc.mes||crmIsoLocal(new Date()).slice(0,7);
const CC_MESES=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
function ccMesNome(){ const [y,m]=ccMes().split('-').map(Number);
  const n=CC_MESES[m-1]||''; return n.charAt(0).toUpperCase()+n.slice(1)+' '+y; }
window.ccPular=(n)=>{ const [y,m]=ccMes().split('-').map(Number); const d=new Date(y,m-1+n,1);
  CRM.cc.mes=crmIsoLocal(d).slice(0,7); crmPintar(); };
window.ccIrMes=(qual,v)=>{ const [y,m]=ccMes().split('-').map(Number);
  CRM.cc.mes=(qual==='m'? y+'-'+String(+v).padStart(2,'0') : v+'-'+String(m).padStart(2,'0')); crmPintar(); };
const ccDoMes=()=>(CRM.d.calls||[]).filter(c=>String(c.data||'').slice(0,7)===ccMes());
const ccNum=(v)=>Number(v||0);
/* quem aparece nos seletores: quem ja foi lançado + a equipe com papel no CRM.
   A planilha tem gente sem login aqui, entao o nome e texto, nao id. */
function ccPessoas(){
  const s=new Set();
  (CRM.d.calls||[]).forEach(c=>{ if(c.sdr) s.add(c.sdr); if(c.closer) s.add(c.closer); });
  crmSdrs().concat(crmClosers()).forEach(p=>s.add(p.nome.split(' ')[0]));
  return [...s].filter(Boolean).sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
/* anos que aparecem no seletor: os que tem call + o corrente */
function ccAnos(){
  const s=new Set((CRM.d.calls||[]).map(c=>String(c.data||'').slice(0,4)).filter(Boolean));
  s.add(String(new Date().getFullYear())); s.add(ccMes().slice(0,4));
  return [...s].sort().reverse();
}

function ccPainelHTML(){
  const cs=ccDoMes();
  const agendadas=cs.length;
  const shows=cs.filter(c=>c.status_call==='show').length;
  const noShows=cs.filter(c=>c.status_call==='no_show').length;
  const realizadas=shows+noShows;                      /* agendado ainda nao aconteceu */
  const ganhos=cs.filter(c=>c.status_lead==='ganho');
  const tcv=ganhos.reduce((s,c)=>s+ccNum(c.valor),0);
  const mrr=ganhos.reduce((s,c)=>s+ccNum(c.fee),0);
  const pct=(a,b)=>b?Math.round(a/b*1000)/10:0;
  const vg=(n)=>String(n).replace('.',',');
  const [ay,am]=ccMes().split('-').map(Number);

  /* agendamentos por SDR: todo mundo que agendou algo no mes, do maior pro menor */
  const porSdr={}; cs.forEach(c=>{ const k=c.sdr||'sem SDR'; porSdr[k]=(porSdr[k]||0)+1; });
  const sdrs=Object.entries(porSdr).sort((a,b)=>b[1]-a[1]);

  /* motivos de perda: so quem foi marcado como perdido conta */
  const perdidos=cs.filter(c=>c.status_lead==='perdido');
  /* um perdido pode ter mais de um motivo; cada um conta no seu */
  const temFaltou=(c,k)=>String(c.faltou||'').split('|').includes(k);
  const motivos=CC_FALTOU.map(([k,n])=>({k,n,q:perdidos.filter(c=>temFaltou(c,k)).length}))
    .sort((a,b)=>b.q-a.q);

  const card=(rot,val,sub,ico,cor)=>`<div class="pc-card">
      <div class="pc-k">${esc(rot)}${ico?pcIco(ico):''}</div>
      <div class="pc-v"${cor?` style="color:var(--${cor})"`:''}>${val}</div>
      ${sub?`<div class="pc-s">${sub}</div>`:''}</div>`;

  return `<div class="pc-topo">
      <div>
        <div class="pc-eyebrow">Painel</div>
        <h3 class="pc-mes">${esc(ccMesNome())}</h3>
        <div class="pc-sub">${agendadas} call${agendadas===1?'':'s'} no período</div>
      </div>
      <div class="pc-sel">
        <button class="btn secondary small" onclick="ccPular(-1)" title="Mês anterior">‹</button>
        <select onchange="ccIrMes('m',this.value)" title="Mês">${CC_MESES.map((n,i)=>`<option value="${i+1}"${am===i+1?' selected':''}>${n.charAt(0).toUpperCase()+n.slice(1)}</option>`).join('')}</select>
        <select onchange="ccIrMes('a',this.value)" title="Ano">${ccAnos().map(a=>`<option value="${a}"${String(ay)===a?' selected':''}>${a}</option>`).join('')}</select>
        <button class="btn secondary small" onclick="ccPular(1)" title="Próximo mês">›</button>
      </div>
    </div>

    <div class="pc-sec">Volume</div>
    <div class="pc-grid">
      ${card('Total agendadas',agendadas,realizadas?realizadas+' de '+agendadas+' já aconteceram':'nenhuma realizada ainda','cal')}
      ${card('Shows',shows,realizadas?shows+' de '+realizadas+' realizadas':'—','ok','ok')}
      ${card('No-shows',noShows,realizadas?noShows+' de '+realizadas+' realizadas':'—','no','danger')}
      ${card('Taxa de no-show',realizadas?vg(pct(noShows,realizadas))+'%':'—','sobre as realizadas','alerta')}
    </div>

    <div class="pc-sec">Resultado</div>
    <div class="pc-grid">
      ${card('Ganhos',ganhos.length,shows?ganhos.length+' de '+shows+' shows':'nenhum show ainda','trofeu','ok')}
      ${card('Taxa de conversão',shows?vg(pct(ganhos.length,shows))+'%':'—','ganhos sobre shows','pct','brand2')}
      ${card('TCV total',tcv?esc(brl(tcv)):'—','valor fechado no mês','cifrao')}
      ${card('MRR gerado',mrr?esc(brl(mrr)):'—','fee mensal recorrente','ciclo','info2')}
    </div>

    <div class="pc-sec">Ticket médio</div>
    <div class="pc-banner">
      <div class="pc-k">Ticket médio</div>
      <div class="pc-big">${ganhos.length?esc(brl(mrr/ganhos.length)):'—'}</div>
      <div class="pc-s">${ganhos.length?'MRR ÷ Ganhos · '+ganhos.length+' venda'+(ganhos.length===1?'':'s')+' no mês · contrato médio '+esc(brl(tcv/ganhos.length)):'nenhuma venda no mês'}</div>
    </div>

    <div class="pc-sec">${pcIco('gente')} Agendamentos por SDR</div>
    ${sdrs.length?`<div class="pc-grid">${sdrs.map(([n,q])=>card(n,q,agendadas?vg(pct(q,agendadas))+'% do mês':'')).join('')}</div>`
      :'<div class="hint" style="margin-bottom:14px">Ninguém agendou neste mês.</div>'}

    <div class="pc-sec">Motivos de perda</div>
    ${perdidos.length?`<div class="pc-perdas">${motivos.map(m=>`<div class="pc-perda">
        <div class="pc-pl"><span>${esc(m.n)}</span><b>${m.q} de ${perdidos.length} · ${vg(pct(m.q,perdidos.length))}%</b></div>
        <div class="pc-bar"><i style="width:${perdidos.length?Math.round(m.q/perdidos.length*100):0}%"></i></div>
      </div>`).join('')}</div>`
      :'<div class="hint">Nenhuma call perdida neste mês.</div>'}

    <p class="crm-hint">Mês = data da call. Taxa de no-show e conversão ignoram as calls ainda agendadas — só entram depois que a reunião acontece. Ticket médio é o MRR do mês dividido pelas vendas — a mensalidade média de quem entrou. O contrato médio (TCV ÷ vendas) aparece ao lado: somar TCV com MRR contava o mesmo dinheiro duas vezes.</p>`;
}

/* ---------- CALLS (lançamento) ---------- */
window.ccFiltro=(k,v)=>{ CRM.cc[k]=v; crmPintar(); };
window.ccLimpar=()=>{ CRM.cc={mes:CRM.cc.mes,sdr:'',status:'',de:'',ate:''}; crmPintar(); };
function ccFiltradas(){
  const f=CRM.cc;
  return (CRM.d.calls||[]).filter(c=>{
    if(f.sdr&&c.sdr!==f.sdr) return false;
    if(f.status&&c.status_lead!==f.status) return false;
    const d=String(c.data||'');
    if(f.de&&d<f.de) return false;
    if(f.ate&&d>f.ate) return false;
    return true;
  });
}
function ccCallsHTML(){
  const todas=CRM.d.calls||[], vis=ccFiltradas();
  const ativos=['sdr','status','de','ate'].filter(k=>CRM.cc[k]).length;
  /* so o status do lead vira pilula; o da call e texto, como no painel original */
  const pil=(v)=>{ const n=ccNome(CC_LEAD,v); return n?`<span class="pc-pill ${ccCor(CC_LEAD,v)}">${esc(n)}</span>`:'<span class="pc-vazio">—</span>'; };
  const linha=(c)=>`<tr>
    <td class="pc-dt">${esc(fmtDate(String(c.data||'').slice(0,10)))}</td>
    <td class="pc-org">${esc(ccNome(CC_ORIGENS,c.origem)||'—')}</td>
    <td class="pc-lead">${esc(c.lead||'—')}</td>
    <td class="pc-emp">${esc(c.empresa||'—')}</td>
    <td>${esc(c.sdr||'—')}</td>
    <td>${c.closer?esc(c.closer):'<span class="pc-vazio">—</span>'}</td>
    <td class="pc-call">${esc(ccNome(CC_CALL,c.status_call)||'—')}</td>
    <td>${pil(c.status_lead)}</td>
    <td class="r">${c.valor?esc(brl(c.valor)):'<span class="pc-vazio">—</span>'}</td>
    <td class="r">${c.fee?esc(brl(c.fee)):'<span class="pc-vazio">—</span>'}</td>
    <td class="r"><span class="pc-acoes">
      <button class="pc-ib" title="Editar esta call" onclick="crmCallModal('${c.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></button>
      <button class="pc-ib del" title="Excluir esta call" onclick="ccExcluir('${c.id}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg></button>
    </span></td></tr>`;

  /* Calls viraram uma secao do Painel (Gabriel 16/09): era a mesma informacao em duas abas. */
  return `<div class="pc-sec">Calls registradas</div>
    <div class="pc-sub" style="margin:-6px 0 12px">${vis.length} de ${todas.length} call${todas.length===1?'':'s'}${ativos?' · '+ativos+' filtro'+(ativos>1?'s':'')+' ativo'+(ativos>1?'s':''):''}</div>

    <div class="pc-fbox"><div class="pc-filtros">
      <span class="pc-fl"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3z"/></svg>Filtros</span>
      <input type="date" class="${CRM.cc.de?'on':''}" value="${esc(CRM.cc.de)}" title="A partir de" onchange="ccFiltro('de',this.value)">
      <input type="date" class="${CRM.cc.ate?'on':''}" value="${esc(CRM.cc.ate)}" title="Até" onchange="ccFiltro('ate',this.value)">
      <select class="${CRM.cc.status?'on':''}" onchange="ccFiltro('status',this.value)" title="Status do lead"><option value="">Todos os status</option>${CC_LEAD.map(s=>`<option value="${s[0]}"${CRM.cc.status===s[0]?' selected':''}>${esc(s[1])}</option>`).join('')}</select>
      <select class="${CRM.cc.sdr?'on':''}" onchange="ccFiltro('sdr',this.value)" title="SDR"><option value="">Todos os SDRs</option>${ccPessoas().map(n=>`<option value="${esc(n)}"${CRM.cc.sdr===n?' selected':''}>${esc(n)}</option>`).join('')}</select>
      ${ativos?`<button class="pc-limpar" onclick="ccLimpar()">limpar filtros</button>`:''}
    </div></div>

    <div class="pc-tbox"><table class="pc-tbl">
      <thead><tr><th>Data</th><th>Origem</th><th>Lead</th><th>Empresa</th><th>SDR</th><th>Closer</th><th>Call</th><th>Lead</th><th class="r">Venda</th><th class="r">Fee</th><th></th></tr></thead>
      <tbody>${vis.length?vis.map(linha).join('')
        :`<tr><td colspan="11" class="pc-nada">${todas.length?'Nenhuma call com esses filtros.':'Nenhuma call lançada ainda — use “+ Nova call”.'}</td></tr>`}</tbody>
    </table></div>`;
}

/* clicar no botao ja marcado desmarca: sem isso, quem erra a opcao fica preso
   com ela (radio nativo nao desmarca sozinho e nao ha "nenhum" na lista). */
window.ccTog=(el)=>{
  if(el.dataset.on==='1') el.checked=false;
  document.querySelectorAll('input[name="'+el.name+'"]').forEach(x=>{ x.dataset.on=x.checked?'1':'0'; });
};

/* ---------- modal de lançamento ---------- */
window.crmCallModal=(id)=>{
  const c=(CRM.d.calls||[]).find(x=>String(x.id)===String(id))||{};
  const novo=!c.id;
  const opt=(tab,v)=>tab.map(o=>`<option value="${esc(o[0])}"${String(v||'')===o[0]?' selected':''}>${esc(o[1])}</option>`).join('');
  const pessoas=ccPessoas();
  const dl=`<datalist id="ccPessoas">${pessoas.map(n=>`<option value="${esc(n)}">`).join('')}</datalist>`;
  /* cada opcao e um botao: clicar marca, clicar de novo desmarca (Gabriel 15/09).
     O radio continua ali, invisivel, pra manter teclado e leitor de tela. */
  /* `multi` liga caixa de marcar em vez de radio: na planilha do comercial um
     lead perdido some por mais de um motivo ("orcamento E momento"), entao O Que
     Faltou aceita varios. Guardado como "budget|timing". */
  const ops=(nome,tab,v,multi)=>{ const sel=String(v||'').split('|').filter(Boolean);
    return `<div class="pc-ops">${tab.map(o=>{ const on=multi?sel.includes(o[0]):String(v||'')===o[0];
      return `<label class="pc-opt"><input type="${multi?'checkbox':'radio'}" name="${nome}" value="${esc(o[0])}"${on?' checked data-on="1"':' data-on="0"'}${multi?'':' onclick="ccTog(this)"'}><span>${esc(o[1])}</span></label>`;}).join('')}</div>`; };
  const campo=(lab,html)=>`<div class="cc-f"><label>${esc(lab)}</label>${html}</div>`;
  const inp=(id2,val,ph,extra)=>`<input id="${id2}" value="${esc(val==null?'':val)}"${ph?` placeholder="${esc(ph)}"`:''}${extra||''}>`;

  modal(novo?'Nova call':'Editar call',`<div class="cc-form">${dl}
    <div class="cc-2">
      ${campo('Data da Call',`<input type="date" id="cc_data" value="${esc(String(c.data||'').slice(0,10)||crmIsoLocal(new Date()))}">`)}
      ${campo('Origem do Lead',`<select id="cc_origem" class="cx">${opt(CC_ORIGENS,c.origem||'inbound')}</select>`)}
    </div>
    <div class="cc-2">
      ${campo('Quem Agendou',inp('cc_sdr',c.sdr,'nome de quem agendou',' list="ccPessoas"'))}
      ${campo('Quem Vendeu',inp('cc_closer',c.closer,'— nenhum —',' list="ccPessoas"'))}
    </div>
    <div class="cc-2">
      ${campo('Status da Call',`<select id="cc_scall" class="cx">${opt(CC_CALL,c.status_call||'agendado')}</select>`)}
      ${campo('Status do Lead',`<select id="cc_slead" class="cx">${opt(CC_LEAD,c.status_lead||'follow_up')}</select>`)}
    </div>
    <div class="cc-2">
      ${campo('Nome do Lead',inp('cc_lead',c.lead,'com quem você falou'))}
      ${campo('Empresa',inp('cc_empresa',c.empresa,''))}
    </div>
    <div class="cc-2">
      ${campo('BANT',`<select id="cc_bant"><option value="">—</option>${opt(CC_BANT,c.bant)}</select>`)}
      ${campo('Nicho',inp('cc_nicho',c.nicho,'ex.: concessionária'))}
    </div>
    <div class="cc-2">
      ${campo('Valor da Venda (R$)',`<input type="number" step="0.01" min="0" id="cc_valor" value="${c.valor||''}" placeholder="0">`)}
      ${campo('Fee Mensal (R$)',`<input type="number" step="0.01" min="0" id="cc_fee" value="${c.fee||''}" placeholder="0">`)}
    </div>
    <div class="cc-2">
      ${campo('Prazo do Projeto',inp('cc_pproj',c.prazo_projeto,'Ex: 30 dias'))}
      ${campo('Prazo de Implementação',inp('cc_pimpl',c.prazo_impl,'Ex: 10 dias'))}
    </div>
    ${campo('O Que Faltou',ops('cc_faltou',CC_FALTOU,c.faltou,true))}
    ${campo('O Que Foi Vendido',ops('cc_vendido',CC_VENDIDO,c.vendido))}
    ${campo('Observações',`<textarea id="cc_obs" rows="3">${esc(c.obs||'')}</textarea>`)}
  </div>`, async ()=>{
    const rd=(n)=>{ const e=document.querySelector(`input[name="${n}"]:checked`); return e?e.value:null; };
    const rdm=(n)=>{ const v=[...document.querySelectorAll(`input[name="${n}"]:checked`)].map(e=>e.value); return v.length?v.join('|'):null; };
    const num=(k)=>{ const v=crmVal(k); return v===''?null:Number(v); };
    const row={
      data:crmVal('cc_data')||null, origem:crmVal('cc_origem')||'inbound',
      sdr:crmVal('cc_sdr')||null, closer:crmVal('cc_closer')||null,
      status_call:crmVal('cc_scall'), status_lead:crmVal('cc_slead'),
      lead:crmVal('cc_lead')||null, empresa:crmVal('cc_empresa')||null,
      bant:crmVal('cc_bant')||null, nicho:crmVal('cc_nicho')||null,
      valor:num('cc_valor'), fee:num('cc_fee'),
      prazo_projeto:crmVal('cc_pproj')||null, prazo_impl:crmVal('cc_pimpl')||null,
      faltou:rdm('cc_faltou'), vendido:rd('cc_vendido'), obs:crmVal('cc_obs')||null
    };
    if(!row.data){ toast('Informe a data da call.'); return false; }
    if(novo) row.criado_por=(currentUser||{}).id||null;
    const r=novo ? await sb.from('crm_calls').insert(row).select().single()
                 : await sb.from('crm_calls').update(row).eq('id',c.id).select().single();
    if(r.error){ toast('Erro: '+r.error.message); return false; }
    if(novo) CRM.d.calls.unshift(r.data);
    else { const i=CRM.d.calls.findIndex(x=>String(x.id)===String(c.id)); if(i>=0) CRM.d.calls[i]=r.data; }
    CRM.d.calls.sort((a,b)=>String(b.data).localeCompare(String(a.data)));
    toast(novo?'Call lançada.':'Call atualizada.'); crmPintar(); return true;
  });
};
window.ccExcluir=async (id)=>{
  const c=(CRM.d.calls||[]).find(x=>String(x.id)===String(id))||{};
  const ok=await confirmar('Excluir esta call?',
    `${c.lead?c.lead+' · ':''}${c.empresa||''}${c.data?' · '+fmtDate(String(c.data).slice(0,10)):''}. Ela sai do Painel e das contas do mês. Não dá para desfazer.`,
    {sim:'Sim, excluir',nao:'Não'});
  if(!ok) return;
  const {error}=await sb.from('crm_calls').delete().eq('id',id);
  if(error){ toast('Erro: '+error.message); return; }
  CRM.d.calls=CRM.d.calls.filter(x=>String(x.id)!==String(id));
  toast('Call excluída.'); crmPintar();
};

/* boot: se a tela do funil já estava aberta quando este arquivo carregou, redesenha */
try{ if(typeof currentView!=='undefined'&&String(currentView).indexOf('funil')===0){ const c=$('#content'); if(c) crmRender(c,currentView); } }catch(_){ /* ainda sem sessão */ }
