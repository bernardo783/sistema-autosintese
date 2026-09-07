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
  aba:'pipeline',
  f:{periodo:'30d',origem:'',sdr:'',closer:'',campanha:'',busca:''},
  d:{opps:[],estagios:[],motivos:[],origens:[],equipe:[],appts:[],google:[],origensMes:[]},
  carregou:false, carregando:false, erro:'', sel:null, semana:0, tl:{}, ocup:{}
};
try{ Object.assign(CRM.f, JSON.parse(localStorage.getItem('crm_filtros_v1')||'{}')); }catch(_){ /* sem filtro salvo */ }
const crmSalvarFiltros=()=>{ try{ localStorage.setItem('crm_filtros_v1',JSON.stringify(CRM.f)); }catch(_){ /* sem storage */ } };

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
    const [e,m,o,q,a,g,v]=await Promise.all([
      sb.from('wa_estagios').select('*').eq('ativo',true).order('ordem'),
      sb.from('lost_reasons').select('*').eq('ativo',true).order('ordem'),
      sb.from('lead_sources').select('*').eq('ativo',true).order('ordem'),
      sb.from('perfis').select('id,nome,foto,papel_crm,role').eq('aprovado',true).order('nome'),
      sb.from('appointments').select('*').gte('scheduled_start',desde.toISOString()).order('scheduled_start'),
      sb.rpc('crm_google_conectados'),
      sb.from('v_crm_origens').select('*')
    ]);
    const erro=[e,m,o,q,a,g,v].find(r=>r&&r.error); if(erro) throw erro.error;
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
function crmFiltrosHTML(){
  const f=CRM.f, sel=(k,lab,ops)=>`<select class="${f[k]?'on':''}" onchange="crmFiltro('${k}',this.value)" title="${lab}"><option value="">${lab}: todos</option>${ops.map(([v,n])=>`<option value="${esc(v)}"${f[k]===v?' selected':''}>${esc(n)}</option>`).join('')}</select>`;
  const ativos=['origem','sdr','closer','campanha','busca'].filter(k=>f[k]).length;
  return `<div class="crm-filtros">
    ${sel('origem','Origem',CRM.d.origens.map(o=>[o.key,o.name]))}
    ${sel('sdr','SDR',crmSdrs().map(p=>[p.id,p.nome]))}
    ${sel('closer','Closer',crmClosers().map(p=>[p.id,p.nome]))}
    ${sel('campanha','Campanha',crmCampanhas().map(c=>[c,c]))}
    <input class="${f.busca?'on':''}" placeholder="Buscar nome, telefone, empresa…" value="${esc(f.busca)}" oninput="CRM.f.busca=this.value;crmSalvarFiltros();clearTimeout(CRM._t);CRM._t=setTimeout(crmPintar,250)">
    ${ativos?`<button class="crm-limpar" onclick="crmLimpar()">limpar ${ativos} filtro${ativos>1?'s':''}</button>`:''}
    <span style="margin-left:auto"></span>
    <div class="fin-tabs" style="margin:0">${CRM_PRESETS.map(p=>`<button class="ftab${f.periodo===p[0]?' active':''}" onclick="crmFiltro('periodo','${p[0]}')">${p[1]}</button>`).join('')}</div>
  </div>`;
}

/* ---------- render principal ---------- */
window.crmAba=(a)=>{ CRM.aba=a; crmPintar(); };
window.crmRender=function(c,viewPedida){
  if(!crmPode()){ c.innerHTML='<div class="empty">Acesso restrito ao time comercial. Peça ao administrador para liberar seu papel no CRM.</div>'; return; }
  const v=String(viewPedida||''); const mOpp=v.match(/^funil\/opp\/([0-9a-f-]{36})/);
  if(mOpp){ CRM.sel=mOpp[1]; }
  if(!CRM.carregou){ if(!CRM.carregando) crmCarregar().then(crmPintar); c.innerHTML=`<div class="page-head"><div><h2>Comercial</h2><div class="desc">Carregando o funil…</div></div></div>`; return; }
  const abas=[['pipeline','Pipeline'],['agenda','Agenda'],['origens','Origem da receita']].concat(currentUser.role==='master'?[['anuncios','Anúncios (Meta)']]:[]).concat(crmAdmin()?[['integracoes','Integrações']]:[]);
  const tabs=`<div class="fin-tabs" style="margin:0 0 14px">${abas.map(a=>`<button class="ftab${CRM.aba===a[0]?' active':''}" onclick="crmAba('${a[0]}')">${a[1]}</button>`).join('')}
    <span style="margin-left:auto"></span>
    ${crmAdmin()?`<button class="btn secondary small" onclick="crmEquipeModal()">Equipe comercial</button>`:''}
    <button class="btn small" onclick="crmNovoLead()">+ Lead</button></div>`;
  if(CRM.aba==='anuncios'&&typeof renderFunil==='function'){
    FN.sub='meta'; renderFunil(c);
    /* esconde as sub-abas antigas (Anúncios/WhatsApp) e põe as novas no lugar */
    const velho=[...c.querySelectorAll('.fin-tabs')].find(t=>t.innerHTML.includes('waAba(')); if(velho) velho.outerHTML=tabs;
    return;
  }
  const j=crmJanela();
  c.innerHTML=`<div class="page-head">
      <div><h2>Comercial</h2><div class="desc">${CRM.aba==='pipeline'?'Pipeline de oportunidades':CRM.aba==='agenda'?'Sessões estratégicas':CRM.aba==='integracoes'?'WhatsApp · Meta Ads · Google Agenda · Google Meet · Conversions API':'De onde vem a receita'}${CRM.aba==='integracoes'?'':` · ${esc(crmDia(j.de.toISOString()))} a ${esc(crmDia(new Date(j.ate-1).toISOString()))}`}${CRM.erro?` · <span style="color:var(--danger)">${esc(CRM.erro)}</span>`:''}</div></div>
      <div class="toolbar"><button class="btn secondary small" onclick="crmRecarregar()" title="Recarregar">↻</button></div>
    </div>${tabs}${CRM.aba==='origens'||CRM.aba==='integracoes'?'':crmFiltrosHTML()}
    ${CRM.aba==='pipeline'?crmPipelineHTML():CRM.aba==='agenda'?crmAgendaHTML():CRM.aba==='integracoes'?crmIntgHTML():crmOrigensHTML()}`;
  if(CRM.aba==='integracoes') crmIntgCarregar();
  if(CRM.sel) crmAbrirFicha(CRM.sel);
};

/* ---------- PIPELINE ---------- */
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
  const card=(o)=>{ const c=o.contact||{}, org=crmOrigem(o.source), ft=o.ft;
    const ap=CRM.d.appts.find(a=>a.opportunity_id===o.id&&['scheduled','confirmed'].includes(a.status));
    return `<div class="crm-lc" draggable="true" ondragstart="CRM.arr='${o.id}'" onclick="crmAbrirFicha('${o.id}')">
      <div class="n">${esc(c.name||crmFone(c.phone_e164))}</div>
      <div class="t">${esc(c.company||(c.name?crmFone(c.phone_e164):''))}</div>
      <div class="src"><span class="crm-badge ${org.paid?'pago':'org'}">${esc(org.name)}</span>${ft&&(ft.campaign_name||ft.ad_name)?`<span class="crm-badge" title="${esc(ft.campaign_name||'')} · ${esc(ft.ad_name||'')}">${esc(ft.ad_name||ft.campaign_name)}</span>`:o.source_detail?`<span class="crm-badge">${esc(o.source_detail)}</span>`:''}</div>
      <div class="f"><span>${crmAv(o.sdr_id)}${o.closer_id?' '+crmAv(o.closer_id,'c'):''}</span>
        <span class="r">${o.status==='won'?esc(brl(o.revenue)):ap?'📅 '+esc(crmQuando(ap.scheduled_start)):o.value?esc(brl(o.value)):crmDias(o.updated_at)+'d'}</span></div>
    </div>`; };
  return `<div class="crm-kpis">
      <div class="crm-kpi"><div class="k">Leads no período</div><div class="v">${noPer.length}</div><div class="s">${pagos} de mídia paga · ${noPer.length-pagos} orgânico/indicação</div></div>
      <div class="crm-kpi"><div class="k">Em aberto</div><div class="v" style="color:var(--info)">${abertos.length}</div><div class="s">no pipeline agora</div></div>
      <div class="crm-kpi"><div class="k">Agendados</div><div class="v">${agend}</div><div class="s">${crmPct(agend,noPer.length)}% dos leads</div></div>
      <div class="crm-kpi"><div class="k">Compareceram</div><div class="v">${compar}</div><div class="s">show rate ${crmPct(compar,agend)}%</div></div>
      <div class="crm-kpi hi"><div class="k">Vendas</div><div class="v" style="color:var(--ok)">${ganhos.length}</div><div class="s">lead → venda ${crmPct(ganhos.length,noPer.length)}%</div></div>
      <div class="crm-kpi hi"><div class="k">Receita</div><div class="v">${receita?esc(brl(receita)):'—'}</div><div class="s">${ganhos.length?'ticket '+esc(brl(receita/ganhos.length)):''}</div></div>
    </div>
    <div class="crm-board">${cols.map(c=>`<div class="crm-col" ondragover="event.preventDefault();this.classList.add('hover')" ondragleave="this.classList.remove('hover')" ondrop="this.classList.remove('hover');crmSoltar(event,'${c.e.chave}')">
        <div class="crm-colh"><i style="background:${esc(c.e.cor)}"></i>${esc(c.e.nome)}<span>${c.its.length}</span></div>
        <div class="crm-cards">${c.its.map(card).join('')||'<div class="crm-vazio">arraste para cá</div>'}</div></div>`).join('')}</div>
    <p class="crm-hint">Cada movimento vira um evento imutável na linha do tempo. Ganho pede a receita; Perdido pede o motivo. Agendado, No-show e Compareceu também chegam pela Agenda.</p>`;
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
  ov.innerHTML=`<div class="modal"><div class="mhead"><h3>Oportunidade</h3><button class="x" onclick="crmFechar()">&times;</button></div>${crmFichaHTML(o)}</div>`;
  if(!CRM.tl[id]){
    const {data}=await sb.from('funnel_events').select('*').eq('opportunity_id',id).order('occurred_at',{ascending:true}).limit(500);
    CRM.tl[id]=data||[]; const ov2=document.getElementById('crmOv'); if(ov2&&CRM.sel===id) ov2.innerHTML=`<div class="modal"><div class="mhead"><h3>Oportunidade</h3><button class="x" onclick="crmFechar()">&times;</button></div>${crmFichaHTML(o)}</div>`;
  }
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
      return `<div class="e"><div class="h">${esc(crmDia(ev.occurred_at))}<br>${esc(crmHora(ev.occurred_at))}</div><i class="${t[1]}">${t[0]}</i>
        <div><b>${esc(t[2])}</b> <span class="who">· ${ev.actor_user_id?esc(crmNome(ev.actor_user_id)):({webhook_whatsapp:'WhatsApp',calendar:'Google Agenda',meet:'Google Meet',cron:'sistema',capi:'Meta CAPI'}[ev.source]||'sistema')}</span>${det?`<div>${det}</div>`:''}</div></div>`; }).join('')}</div>`;
  const ativos=CRM.d.estagios.filter(x=>!x.fim);
  return `<div class="crm-ficha">
    <div style="min-width:0">
      <div class="crm-fh"><div class="big">${esc(crmIni(c.name||'?'))}</div>
        <div><h3>${esc(c.name||crmFone(c.phone_e164))}</h3><div class="sub">${esc(crmFone(c.phone_e164))}${c.company?' · '+esc(c.company):''}${c.city?' · '+esc(c.city):''} · ciclo #${o.cycle}${ciclos>1?' de '+ciclos:''}</div></div>
        <span class="crm-badge ${o.status==='won'?'ok':o.status==='lost'?'bad':'info'}" style="margin-left:auto;font-size:12px"><i style="width:7px;height:7px;border-radius:50%;background:${esc(e.cor)};display:inline-block"></i> ${esc(e.nome)}</span></div>
      <div class="crm-acoes">
        ${o.status==='open'?`<select class="btn secondary small" style="padding:6px 10px" onchange="if(this.value)crmMover('${o.id}',this.value)"><option value="">Mover para…</option>${ativos.filter(x=>x.chave!==o.stage).map(x=>`<option value="${x.chave}">${esc(x.nome)}</option>`).join('')}</select>
          <button class="btn secondary small" onclick="crmAgendarModal('${o.id}')">📅 Agendar sessão</button>
          <button class="btn small ganho" onclick="crmGanhoModal('${o.id}')">🎉 Ganho</button>
          <button class="btn small perda" onclick="crmPerdaModal('${o.id}')">Perdido</button>`:
          `<button class="btn secondary small" onclick="crmMover('${o.id}','novo_lead')">↻ Reabrir</button>`}
        <button class="btn secondary small" onclick="crmResponsavelModal('${o.id}')">Responsáveis</button>
        <button class="btn secondary small" onclick="crmEditarModal('${o.id}')">Editar</button>
        <button class="btn secondary small" onclick="crmNotaModal('${o.id}')">+ nota</button>
        <a class="btn secondary small" href="https://wa.me/${esc(String(c.phone_e164||'').replace(/\D/g,''))}" target="_blank" rel="noopener" style="text-decoration:none">💬 WhatsApp</a>
      </div>
      <div class="crm-facts">
        <div class="crm-fact"><div class="k">SDR</div><div class="v">${crmAv(o.sdr_id)} ${esc(o.sdr_id?crmNome(o.sdr_id):'—')}</div></div>
        <div class="crm-fact"><div class="k">Closer</div><div class="v">${crmAv(o.closer_id,'c')} ${esc(o.closer_id?crmNome(o.closer_id):'—')}</div></div>
        <div class="crm-fact"><div class="k">Origem</div><div class="v"><span class="crm-badge ${org.paid?'pago':'org'}">${esc(org.name)}</span>${o.source_detail?' '+esc(o.source_detail):''}</div></div>
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
        <div><span>Telefone</span><b style="font-family:ui-monospace,monospace">${esc(c.phone_e164||'')}</b></div>
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

/* boot: se a tela do funil já estava aberta quando este arquivo carregou, redesenha */
try{ if(typeof currentView!=='undefined'&&String(currentView).indexOf('funil')===0){ const c=$('#content'); if(c) crmRender(c,currentView); } }catch(_){ /* ainda sem sessão */ }
