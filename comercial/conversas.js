/* Comercial › Conversas — WhatsApp dos números do time, dentro do sistema.
   Só master e gestor entram: o número é pessoal do SDR e tem conversa que não é de trabalho.
   A lista e o histórico vêm ao vivo da UAZAPI (fonte da verdade, com todo o histórico);
   a tabela wa_mensagens + Realtime só avisam "chegou algo novo" pra tela se atualizar sozinha.
   Token nunca chega no navegador: tudo passa pela função wa-uazapi com o login do usuário. */
(function(){
  const URL_='https://fuieonexmdupupcsyowg.supabase.co/functions/v1/wa-uazapi';
  /* de qual anuncio veio cada conversa (Gabriel 15/09): a UAZAPI manda isso dentro
     da mensagem, o banco extrai pra wa_chats e a Meta devolve os nomes. */
  const URL_AD='https://fuieonexmdupupcsyowg.supabase.co/functions/v1/wa-ads/Wd7nQx2pLm5R';
  const CV={aba:false,num:'',nums:[],chats:[],total:0,busca:'',carregando:false,carregou:false,erro:'',
            sel:null,msgs:[],carregandoMsgs:false,enviando:false,inscrito:false,rascunho:{},
            ads:{},adsCarregou:false,fAd:'',resolvendo:false};
  const $=(s)=>document.querySelector(s);
  const cu=()=>{ try{ return currentUser; }catch(_){ return null; } };
  const ses=()=>{ try{ return SESSION; }catch(_){ return null; } };
  const podeVer=()=>{ const u=cu(); return !!(u&&(u.role==='master'||['admin','gestor'].includes(u.papel_crm))); };
  const esc=(s)=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const barra=(c)=>[...c.querySelectorAll('.fin-tabs')].find(t=>t.innerHTML.includes('crmAba('))||null;

  async function api(acao,corpo){
    const S=ses(); if(!S||!S.access_token) throw new Error('Sessão expirada — entre de novo.');
    const r=await fetch(URL_+'/'+acao,{method:corpo?'POST':'GET',headers:{authorization:'Bearer '+S.access_token,'content-type':'application/json'},body:corpo?JSON.stringify(corpo):undefined});
    const d=await r.json().catch(()=>({ok:false,erro:'resposta inválida'}));
    if(!d.ok) throw new Error(d.erro||('erro '+r.status));
    return d;
  }
  const fmtFone=(f)=>{ const d=String(f||'').replace(/\D/g,''); const n=d.startsWith('55')&&d.length>=12?d.slice(2):d;
    return n.length===11?`(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`:(n.length===10?`(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`:('+'+d)); };
  function hora(iso){ if(!iso) return ''; const d=new Date(iso); if(isNaN(d)) return '';
    const hj=new Date(), mesmo=d.toDateString()===hj.toDateString();
    const ont=new Date(hj); ont.setDate(hj.getDate()-1);
    if(mesmo) return d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    if(d.toDateString()===ont.toDateString()) return 'ontem';
    return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'}); }
  const diaDe=(iso)=>{ const d=new Date(iso); const hj=new Date(); const ont=new Date(hj); ont.setDate(hj.getDate()-1);
    if(d.toDateString()===hj.toDateString()) return 'Hoje';
    if(d.toDateString()===ont.toDateString()) return 'Ontem';
    return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}); };
  const inicial=(n)=>String(n||'?').trim().charAt(0).toUpperCase();

  /* ---------- dados ---------- */
  async function carregarNums(){
    const d=await api('listar');
    CV.nums=(d.instancias||[]).filter(i=>!i.erro);
    if(!CV.num){ const c=CV.nums.find(i=>i.conectado); CV.num=(c||CV.nums[0]||{}).name||''; }
  }
  /* de onde veio cada conversa: chatid -> {campanha, conjunto, anuncio} */
  async function carregarAds(){
    const S=ses(); if(!S||!S.access_token) return;
    try{
      const r=await fetch(URL_AD+'/listar',{headers:{authorization:'Bearer '+S.access_token}});
      const d=await r.json().catch(()=>({}));
      if(d&&d.ok){ CV.ads={}; (d.conversas||[]).forEach(c=>{ CV.ads[c.chatid]=c; }); }
    }catch(_){ /* sem rastreio nao impede de conversar */ }
    CV.adsCarregou=true;
  }
  /* so o admin pede: uma ida a Meta por anuncio novo, o resto vem do cache */
  window.cvResolverAds=async ()=>{
    const S=ses(); if(!S||!S.access_token||CV.resolvendo) return;
    CV.resolvendo=true; if(window.crmPintar) crmPintar();
    try{
      const r=await fetch(URL_AD+'/resolver',{headers:{authorization:'Bearer '+S.access_token}});
      const d=await r.json().catch(()=>({}));
      if(typeof toast==='function') toast(d&&d.ok
        ? ((d.resolvidos||0)+' de '+(d.consultados||0)+' anúncios identificados.')
        : ('Meta: '+((d&&d.erro)||'falhou')));
      await carregarAds();
    }catch(e){ if(typeof toast==='function') toast('Erro: '+e.message); }
    CV.resolvendo=false; if(window.crmPintar) crmPintar();
  };
  window.cvFiltroAd=(v)=>{ CV.fAd=v; if(window.crmPintar) crmPintar(); };
  const adDe=(chatid)=>CV.ads[chatid]||null;
  const adNome=(a)=>a?(a.ad_nome||a.ad_titulo||('anúncio '+String(a.ad_id).slice(-6))):'';

  async function carregarChats(){
    if(!CV.num||CV.carregando) return; CV.carregando=true;
    try{ const d=await api('chats',{name:CV.num,busca:CV.busca||undefined,limit:40});
      CV.chats=d.chats||[]; CV.total=d.total||0; CV.erro=''; }
    catch(e){ CV.erro=e.message||'falha'; CV.chats=[]; }
    CV.carregando=false; CV.carregou=true;
    if(!CV.adsCarregou) carregarAds().then(()=>{ if(CV.aba&&window.crmPintar) crmPintar(); });
  }
  async function carregarMsgs(silencioso){
    if(!CV.sel) return;
    if(!silencioso) CV.carregandoMsgs=true;
    try{ const d=await api('mensagens',{name:CV.num,chatid:CV.sel.chatid,limit:60}); CV.msgs=d.mensagens||[]; }
    catch(e){ if(!silencioso) toast('Erro: '+e.message); }
    CV.carregandoMsgs=false;
  }
  /* Realtime: qualquer mensagem nova no número em foco repuxa a thread e a lista */
  function inscrever(){
    if(CV.inscrito||typeof sb==='undefined'||!sb.channel) return;
    try{
      sb.channel('wa-conversas').on('postgres_changes',{event:'INSERT',schema:'public',table:'wa_mensagens'},()=>{
        if(!CV.aba) return;
        carregarChats().then(()=>{ if(CV.aba&&window.crmPintar) crmPintar(); });
        if(CV.sel) carregarMsgs(true).then(()=>{ if(CV.aba) pintarThread(); });
      }).subscribe();
      CV.inscrito=true;
    }catch(_){ /* sem realtime, fica o ↻ */ }
  }

  /* ---------- html ---------- */
  function listaHTML(){
    if(CV.carregando&&!CV.chats.length) return '<div class="cv-vazio">Carregando conversas…</div>';
    if(!CV.chats.length) return `<div class="cv-vazio">${CV.busca?'Nada com esse nome.':'Nenhuma conversa neste número.'}</div>`;
    const vis=CV.fAd?CV.chats.filter(c=>{ const a=adDe(c.chatid); return a&&String(a.ad_id)===CV.fAd; }):CV.chats;
    if(!vis.length) return '<div class="cv-vazio">Nenhuma conversa desse anúncio nesta lista.</div>';
    return vis.map(c=>{ const a=adDe(c.chatid);
      return `<button class="cv-item${CV.sel&&CV.sel.chatid===c.chatid?' on':''}" onclick="cvAbrir('${esc(c.chatid)}')">
      <span class="cv-av">${c.foto?`<img src="${esc(c.foto)}" alt="" loading="lazy">`:esc(inicial(c.nome))}</span>
      <span class="cv-txt"><span class="cv-l1"><b>${esc(c.nome||fmtFone(c.fone))}</b><i>${esc(hora(c.quando))}</i></span>
        <span class="cv-l2"><span>${esc(c.previa||'—')}</span>${c.naoLidas?`<em>${c.naoLidas}</em>`:''}</span>
        ${a?`<span class="cv-ad" title="${esc((a.campanha_nome||'campanha não identificada')+' › '+(a.adset_nome||'conjunto não identificado'))}">${esc(a.ad_app||'meta')} · ${esc(adNome(a))}</span>`:''}
      </span></button>`; }).join('');
  }
  /* faixa "veio deste anuncio" no topo da conversa: campanha > conjunto > anuncio */
  function origemHTML(){
    const a=CV.sel?adDe(CV.sel.chatid):null; if(!a) return '';
    const kv=(r,v)=>`<span class="cv-ok"><i>${esc(r)}</i>${esc(v||'não identificado')}</span>`;
    return `<div class="cv-origem">
      <span class="cv-oico">◎</span>
      ${kv('Campanha',a.campanha_nome)}${kv('Conjunto',a.adset_nome)}${kv('Anúncio',a.ad_nome||a.ad_titulo)}
      <span class="cv-ofim">${esc(a.ad_app||'')}${a.ad_em?' · '+esc(hora(a.ad_em)):''}</span>
    </div>`;
  }
  function threadHTML(){
    if(!CV.sel) return '<div class="cv-nada">Escolha uma conversa à esquerda.</div>';
    if(CV.carregandoMsgs) return origemHTML()+'<div class="cv-nada">Carregando mensagens…</div>';
    if(!CV.msgs.length) return origemHTML()+'<div class="cv-nada">Sem mensagens nesta conversa.</div>';
    let dia='', out=origemHTML();
    CV.msgs.forEach(m=>{
      const d=diaDe(m.quando);
      if(d!==dia){ dia=d; out+=`<div class="cv-dia"><span>${esc(d)}</span></div>`; }
      const anexo=m.arquivo?`<a href="${esc(m.arquivo)}" target="_blank" rel="noopener" class="cv-anexo">abrir arquivo</a>`:'';
      out+=`<div class="cv-bal ${m.deNos?'nos':'eles'}">${m.texto?esc(m.texto):'<i>(sem texto)</i>'}${anexo}
        <span class="cv-hr">${esc(hora(m.quando))}${m.deNos&&m.status?' · '+esc(String(m.status).toLowerCase()):''}</span></div>`;
    });
    return out;
  }
  function html(){
    if(!podeVer()) return '<div class="crm-vazio">As conversas de WhatsApp são visíveis só para master e gestor.</div>';
    const seletor=CV.nums.map(n=>`<button class="ftab${n.name===CV.num?' active':''}" onclick="cvNum('${esc(n.name)}')">${esc(n.perfil||n.name)}${n.conectado?'':' (off)'}</button>`).join('');
    return `${CV.erro?`<div class="crm-hint" style="color:var(--danger);margin:0 0 10px">${esc(CV.erro)}</div>`:''}
    <div class="cv-top"><div class="fin-tabs" style="margin:0">${seletor}</div>
      <span style="margin-left:auto"></span>
      ${(()=>{ const m={}; Object.values(CV.ads).forEach(a=>{ if(a&&a.ad_id) m[a.ad_id]=adNome(a); });
        const ids=Object.keys(m); if(!ids.length) return '';
        return `<select class="cv-fad${CV.fAd?' on':''}" onchange="cvFiltroAd(this.value)" title="Filtrar por anúncio">
          <option value="">Todos os anúncios (${ids.length})</option>
          ${ids.map(id=>`<option value="${esc(id)}"${CV.fAd===id?' selected':''}>${esc(m[id])}</option>`).join('')}</select>`; })()}
      ${cu()&&(cu().role==='master'||cu().papel_crm==='admin')?`<button class="btn secondary small" onclick="cvResolverAds()" ${CV.resolvendo?'disabled':''} title="Busca na Meta o nome de campanha, conjunto e anúncio">${CV.resolvendo?'buscando…':'↻ nomes dos anúncios'}</button>`:''}
      <input class="cv-busca" placeholder="Buscar conversa…" value="${esc(CV.busca)}" oninput="cvBuscar(this.value)">
      <button class="btn secondary small" onclick="cvRecarregar()" title="Recarregar">↻</button></div>
    <div class="cv-grid">
      <div class="cv-lista">${listaHTML()}</div>
      <div class="cv-conv">
        ${CV.sel?`<div class="cv-cab"><span class="cv-av">${CV.sel.foto?`<img src="${esc(CV.sel.foto)}" alt="">`:esc(inicial(CV.sel.nome))}</span>
          <div><b>${esc(CV.sel.nome||'')}</b><small>${esc(fmtFone(CV.sel.fone))}</small></div>
          <a class="btn secondary small" href="https://wa.me/${esc(String(CV.sel.fone||'').replace(/\D/g,''))}" target="_blank" rel="noopener" style="margin-left:auto;text-decoration:none">Abrir no WhatsApp</a></div>`:''}
        <div class="cv-msgs" id="cvMsgs">${threadHTML()}</div>
        ${CV.sel?`<div class="cv-resp"><textarea id="cvTexto" rows="1" placeholder="Escreva uma resposta…" oninput="cvCresce(this)" onkeydown="cvTecla(event)">${esc(CV.rascunho[CV.sel.chatid]||'')}</textarea>
          <button class="btn small" onclick="cvEnviar()"${CV.enviando?' disabled':''}>${CV.enviando?'Enviando…':'Enviar'}</button></div>`:''}
      </div></div>
    <div class="crm-hint">Você está vendo o WhatsApp de ${esc((CV.nums.find(n=>n.name===CV.num)||{}).perfil||CV.num)} ao vivo. O que sai daqui aparece igual no celular e no CRM do grupo.</div>`;
  }
  function pintarThread(){
    const m=$('#cvMsgs'); if(!m) return;
    const fim=m.scrollTop+m.clientHeight>=m.scrollHeight-60;
    m.innerHTML=threadHTML();
    if(fim||CV.rolarFim){ m.scrollTop=m.scrollHeight; CV.rolarFim=false; }
  }

  /* ---------- ações ---------- */
  window.cvNum=(n)=>{ CV.num=n; CV.sel=null; CV.msgs=[]; CV.chats=[]; CV.carregou=false;
    carregarChats().then(()=>{ if(CV.aba&&window.crmPintar) crmPintar(); }); if(window.crmPintar) crmPintar(); };
  window.cvRecarregar=()=>{ CV.carregou=false; CV.chats=[];
    Promise.all([carregarChats(),CV.sel?carregarMsgs(true):null]).then(()=>{ if(CV.aba&&window.crmPintar) crmPintar(); }); if(window.crmPintar) crmPintar(); };
  window.cvBuscar=(v)=>{ CV.busca=v; clearTimeout(CV._t); CV._t=setTimeout(()=>{
    carregarChats().then(()=>{ if(CV.aba){ const l=document.querySelector('.cv-lista'); if(l) l.innerHTML=listaHTML(); } }); },300); };
  window.cvAbrir=(id)=>{
    const c=CV.chats.find(x=>x.chatid===id); if(!c) return;
    CV.sel=c; CV.msgs=[]; CV.rolarFim=true;
    if(c.naoLidas){ c.naoLidas=0; api('lido',{name:CV.num,chatid:id}).catch(()=>{}); }
    if(window.crmPintar) crmPintar();
    carregarMsgs().then(()=>{ if(CV.aba&&window.crmPintar) crmPintar(); });
  };
  window.cvCresce=(t)=>{ if(CV.sel) CV.rascunho[CV.sel.chatid]=t.value; t.style.height='auto'; t.style.height=Math.min(t.scrollHeight,140)+'px'; };
  window.cvTecla=(e)=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); cvEnviar(); } };
  window.cvEnviar=async()=>{
    const t=$('#cvTexto'); if(!t||!CV.sel||CV.enviando) return;
    const texto=t.value.trim(); if(!texto) return;
    CV.enviando=true; t.value=''; delete CV.rascunho[CV.sel.chatid];
    CV.msgs.push({id:'tmp'+Date.now(),deNos:true,texto,quando:new Date().toISOString(),status:'enviando'});
    CV.rolarFim=true; pintarThread();
    try{ await api('responder',{name:CV.num,chatid:CV.sel.chatid,texto});
      await carregarMsgs(true); CV.rolarFim=true; pintarThread(); carregarChats().then(()=>{ const l=document.querySelector('.cv-lista'); if(l&&CV.aba) l.innerHTML=listaHTML(); });
    }catch(e){ toast('Não enviou: '+e.message); t.value=texto; CV.msgs.pop(); pintarThread(); }
    CV.enviando=false;
    const b=document.querySelector('.cv-resp .btn'); if(b){ b.disabled=false; b.textContent='Enviar'; }
  };

  /* ---------- css ---------- */
  const CSS=`
  .cv-top{display:flex;align-items:center;gap:10px;margin:0 0 12px;flex-wrap:wrap}
  .cv-busca{background:var(--panel2);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:7px 11px;font-size:13px;min-width:190px}
  .cv-grid{display:grid;grid-template-columns:320px minmax(0,1fr);gap:14px;height:min(66vh,620px)}
  .cv-lista{background:var(--panel);border:1px solid var(--line);border-radius:14px;overflow-y:auto;padding:6px}
  .cv-ad{display:block;font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;color:var(--brand2);
    font-weight:700;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .cv-fad{background:var(--panel2);border:1px solid var(--line);color:var(--txt);border-radius:999px;
    padding:6px 12px;font:inherit;font-size:12.5px;max-width:230px;cursor:pointer}
  .cv-fad.on{border-color:var(--brand)}
  .cv-origem{display:flex;align-items:center;gap:16px;flex-wrap:wrap;background:var(--panel2);
    border:1px solid var(--line);border-radius:11px;padding:10px 14px;margin:0 0 12px}
  .cv-oico{color:var(--brand2);font-size:13px}
  .cv-ok{display:flex;flex-direction:column;gap:2px;font-size:12.5px;color:var(--txt);min-width:0}
  .cv-ok>i{font-size:9.5px;letter-spacing:.11em;text-transform:uppercase;color:var(--fraco);font-weight:700;font-style:normal}
  .cv-ofim{margin-left:auto;font-size:11px;color:var(--fraco);text-transform:uppercase;letter-spacing:.06em}
  .cv-item{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:none;border:0;border-radius:10px;padding:9px 10px;cursor:pointer;color:var(--txt)}
  .cv-item:hover{background:var(--panel2)} .cv-item.on{background:var(--cardh)}
  .cv-av{width:38px;height:38px;flex:none;border-radius:50%;background:var(--panel2);display:grid;place-items:center;overflow:hidden;font-weight:700;font-size:14px;color:var(--muted)}
  .cv-av img{width:100%;height:100%;object-fit:cover}
  .cv-txt{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
  .cv-l1{display:flex;align-items:baseline;gap:8px}
  .cv-l1 b{font-size:13px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
  .cv-l1 i{font-style:normal;font-size:11px;color:var(--fraco);flex:none}
  .cv-l2{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--fraco)}
  .cv-l2 span{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .cv-l2 em{font-style:normal;background:var(--brand);color:#fff;border-radius:10px;padding:0 6px;font-size:11px;font-weight:700}
  .cv-conv{background:var(--panel);border:1px solid var(--line);border-radius:14px;display:flex;flex-direction:column;min-width:0}
  .cv-cab{display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--line)}
  .cv-cab b{font-size:14px;display:block} .cv-cab small{font-size:12px;color:var(--fraco)}
  .cv-msgs{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:7px}
  .cv-dia{text-align:center;margin:8px 0 4px}
  .cv-dia span{background:var(--panel2);color:var(--fraco);font-size:11px;border-radius:8px;padding:3px 10px}
  .cv-bal{max-width:76%;padding:8px 11px 6px;border-radius:12px;font-size:13px;line-height:1.42;white-space:pre-wrap;word-break:break-word;position:relative}
  .cv-bal.eles{align-self:flex-start;background:var(--panel2);border-bottom-left-radius:4px}
  .cv-bal.nos{align-self:flex-end;background:rgba(123,104,238,.18);border-bottom-right-radius:4px}
  .cv-hr{display:block;text-align:right;font-size:10px;color:var(--fraco);margin-top:3px}
  .cv-anexo{display:block;font-size:12px;margin-top:4px;color:var(--brand2)}
  .cv-resp{display:flex;align-items:flex-end;gap:8px;padding:10px 12px;border-top:1px solid var(--line)}
  .cv-resp textarea{flex:1;resize:none;background:var(--panel2);border:1px solid var(--line);color:var(--txt);border-radius:10px;padding:9px 12px;font:inherit;font-size:13px;line-height:1.4;max-height:140px}
  .cv-vazio,.cv-nada{color:var(--fraco);font-size:13px;text-align:center;padding:26px 12px;margin:auto}
  @media(max-width:860px){ .cv-grid{grid-template-columns:1fr;height:auto}
    .cv-lista{max-height:300px} .cv-conv{min-height:420px} }`;
  function estilo(){ if(document.getElementById('cvCss')) return;
    const s=document.createElement('style'); s.id='cvCss'; s.textContent=CSS; document.head.appendChild(s); }

  /* ---------- entra na aba Comercial sem mexer no crm.js ---------- */
  function ligar(){
    const orig=window.crmRender, origAba=window.crmAba;
    if(typeof orig!=='function'||typeof origAba!=='function'||orig.__cv) return false;
    const antesAba=origAba;
    window.crmAba=(a)=>{ CV.aba=(a==='conversas'); antesAba(a); };
    const novo=function(c,view){
      orig.call(this,c,view);
      const bar=barra(c); if(!bar) return;
      injeta(c);
      if(!CV.aba) return;
      bar.querySelectorAll('.ftab').forEach(x=>x.classList.toggle('active',x.dataset.cv==='1'));
      let n=bar.nextSibling; while(n){ const nx=n.nextSibling; n.remove(); n=nx; }
      estilo();
      bar.insertAdjacentHTML('afterend',html());
      const d=c.querySelector('.page-head .desc'); if(d) d.textContent='WhatsApp do time · conversas ao vivo';
      const m=$('#cvMsgs'); if(m) m.scrollTop=m.scrollHeight;
      if(podeVer()&&!CV.carregou&&!CV.carregando){
        (CV.nums.length?Promise.resolve():carregarNums()).then(carregarChats).then(()=>{ inscrever(); if(CV.aba&&window.crmPintar) crmPintar(); })
          .catch(e=>{ CV.erro=e.message; CV.carregou=true; if(CV.aba&&window.crmPintar) crmPintar(); });
      }
    };
    novo.__cv=true; if(orig.__inst) novo.__inst=true; window.crmRender=novo; return true;
  }
  /* Comercial nao tem mais essa aba (Gabriel 16/09): o lead do WhatsApp entra
     direto na coluna "Para atender" do pipeline, e a instancia de cada pessoa
     mora na tela Usuarios. A funcao fica aqui, desligada, porque o resto do
     arquivo (QR, status, envio) continua sendo usado de la. */
  function injeta(){ return; }
  if(!ligar()){ let t=0; const iv=setInterval(()=>{ if(ligar()||++t>60) clearInterval(iv); },200); }
})();
