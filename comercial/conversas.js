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
    const S=ses(); if(!S||!S.access_token) throw new Error('Sessão expirada: entre de novo.');
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
        <span class="cv-l2"><span>${esc(c.previa||'-')}</span>${c.naoLidas?`<em>${c.naoLidas}</em>`:''}</span>
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
  .wald{width:min(440px,100vw);background:var(--panel);border-left:1px solid var(--line);display:flex;flex-direction:column;height:100vh}
  .wald-h{display:flex;align-items:center;gap:10px;padding:13px 16px;border-bottom:1px solid var(--line)}
  .wald-h .q{flex:1;min-width:0}
  .wald-h b{display:block;font-size:15px;line-height:1.2;overflow-wrap:anywhere}
  .wald-h small{color:var(--fraco);font-size:12px}
  .wald-h .x{background:none;border:0;color:var(--muted);font-size:22px;cursor:pointer;line-height:1}
  .wald .cv-msgs{flex:1}
  /* painel do lead (Bernardo 08/10): topo com Classificar, faixa do numero, caixa com +, emoji, relogio e microfone */
  .wald{position:relative;height:100dvh;max-height:100vh}
  .wald-h{align-items:flex-start}
  .wald-av{width:42px;height:42px;border-radius:50%;background:var(--panel2);color:var(--muted);display:grid;place-items:center;font-weight:700;flex:none}
  .wald-av.sm{width:26px;height:26px;font-size:12px;background:var(--brand);color:#fff}
  .wald-nm{display:flex;align-items:center;gap:6px}
  .wald-nm input{flex:1;background:var(--panel2);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:5px 8px;font:inherit;font-weight:700;font-size:14px}
  .wald-cl{margin-top:6px;display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:11.5px;font-weight:700;background:var(--panel2);border:1px solid var(--line);color:var(--txt);border-radius:999px;padding:3px 10px;cursor:pointer}
  .wald-cl i{width:8px;height:8px;border-radius:50%;background:var(--c,var(--brand))}
  .wald-cl:hover{border-color:var(--brand)}
  .wald-ib{width:32px;height:32px;border-radius:50%;border:0;background:transparent;color:var(--muted);display:inline-grid;place-items:center;cursor:pointer;flex:none;text-decoration:none}
  .wald-ib:hover{background:var(--hov2);color:var(--txt)}
  .wald-ib.sm{width:22px;height:22px;border-radius:6px;border:1px solid var(--line)}
  .wald-ib.bd{border-radius:8px;border:1px solid var(--line)}
  .wald-tr{position:absolute;right:16px;bottom:150px;width:46px;height:46px;border-radius:50%;z-index:2;cursor:pointer;display:grid;place-items:center;
    background:color-mix(in srgb,var(--brand) 22%,var(--panel));border:1px solid var(--brand);color:var(--brand2);box-shadow:var(--shadow)}
  .wald-tr:hover{background:var(--brand);color:#fff}
  .wald-pe{border-top:1px solid var(--line);padding:10px 12px 12px;display:flex;flex-direction:column;gap:8px}
  .wald-por{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:8px 12px}
  .wald-por:empty{display:none}
  .wald-por span{flex:1;min-width:0}
  .wald-por b{color:var(--txt)}
  .wald-por select{background:var(--panel);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:3px 6px;font:inherit;font-size:12px}
  .wald-off{color:var(--danger);font-style:normal;font-weight:700}
  .wald-arq{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .wald-arq:empty{display:none}
  .wald-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:999px;padding:4px 6px 4px 10px;font-size:12.5px}
  .wald-chip small{color:var(--fraco)}
  .wald-chip button{background:none;border:0;color:var(--muted);font-size:16px;cursor:pointer;line-height:1}
  .wald-dica{display:block;color:var(--fraco);font-size:11.5px;line-height:1.35}
  .wald-cx{display:flex;align-items:flex-end;gap:8px}
  .wald-in{flex:1;min-width:0;display:flex;align-items:flex-end;gap:2px;background:var(--panel2);border:1px solid var(--line);border-radius:22px;padding:4px}
  .wald-in:focus-within{border-color:var(--brand)}
  .wald-in textarea{flex:1;min-width:0;resize:none;background:transparent;border:0;outline:none;color:var(--txt);font:inherit;font-size:13.5px;line-height:1.4;padding:7px 4px;max-height:140px}
  .wald-rec{display:none;flex:1;align-items:center;gap:10px;background:var(--panel2);border:1px solid var(--danger);border-radius:22px;padding:10px 14px;font-size:13px}
  .wald-rec i{width:9px;height:9px;border-radius:50%;background:var(--danger);animation:waldPisca 1s infinite}
  @keyframes waldPisca{50%{opacity:.25}}
  .wald-mic{width:44px;height:44px;border-radius:50%;border:0;background:var(--brand);color:#fff;display:grid;place-items:center;cursor:pointer;flex:none}
  .wald-mic:hover{filter:brightness(1.1)}
  .wald-mic:disabled{opacity:.5;cursor:default}
  .wald-pop{display:none;position:absolute;z-index:3;background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:8px;box-shadow:var(--shadow);font-size:13px;max-width:calc(100% - 24px)}
  .wald-pop.on{display:block}
  .wald-pop.mais{left:12px;bottom:68px;width:200px}
  .wald-pop.em{left:12px;bottom:68px}
  .wald-pop.ag{right:12px;bottom:68px;width:240px}
  .wald-pop.tr{right:16px;bottom:204px;width:260px}
  .wald-pop.cl{left:66px;top:92px;width:220px;max-height:50vh;overflow:auto}
  .wald-pop b{display:block;padding:4px 6px 6px}
  .wald-pop label{display:flex;flex-direction:column;gap:3px;color:var(--fraco);font-size:11.5px;margin:4px 6px}
  .wald-pop input{background:var(--panel);border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:6px 8px;font:inherit;font-size:13px}
  .wald-pop .btn{width:calc(100% - 12px);margin:8px 6px 6px}
  .wald-pop .wald-dica{padding:4px 6px}
  .wald-mi{display:flex;align-items:center;gap:10px;width:100%;background:none;border:0;color:var(--txt);font:inherit;font-size:13px;text-align:left;padding:8px 8px;border-radius:8px;cursor:pointer}
  .wald-mi:hover:not(:disabled),.wald-mi.on{background:var(--hov2)}
  .wald-mi:disabled{cursor:default}
  .wald-mi small{margin-left:auto;color:var(--fraco)}
  .wald-dot{width:9px;height:9px;border-radius:50%;flex:none}
  .wald-em{display:grid;grid-template-columns:repeat(8,32px);gap:2px}
  .wald-em button{width:32px;height:32px;border:0;background:none;border-radius:8px;font-size:19px;cursor:pointer;padding:0}
  .wald-em button:hover{background:var(--hov2)}
  .wald-img{display:block;max-width:240px;max-height:260px;border-radius:8px;margin-bottom:4px}
  .wald-aud{display:block;width:240px;max-width:100%;height:36px}
  .wald-ag{background:transparent!important;border:1px dashed var(--brand);color:var(--muted)}
  .wald-ag.erro{border-color:var(--danger)}
  .wald-agt{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:var(--brand2);margin-bottom:3px}
  .wald-ag.erro .wald-agt{color:var(--danger)}
  .wald-agt svg{width:13px;height:13px}
  .wald-anx{display:inline-flex;align-items:center;gap:5px;color:var(--txt)}
  .wald-anx svg{width:13px;height:13px}
  .wald-err{color:var(--danger);font-size:11.5px;margin-top:3px}
  .wald-lk{display:block;margin:4px 0 0 auto;background:none;border:0;color:var(--fraco);font:inherit;font-size:11.5px;cursor:pointer;text-decoration:underline}
  .wald-lk:hover{color:var(--txt)}
  @media(max-width:720px){ .wald-em{grid-template-columns:repeat(7,32px)} .wald-tr{bottom:156px} }
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

  /* ---------- Conversa de UM lead (Gabriel 18/09; painel novo Bernardo 08/10) ----------
     Chamada pela ficha do pipeline e pelo CRM de formulario. "Preciso dessa interface aqui
     quando abrir a conversa do whatsapp" (Bernardo 08/10): historico de todos os numeros do
     time, sai pelo numero do responsavel do card, com anexo (+), emoji, audio, agendamento
     (relogio), Classificar (status do card) e o botao roxo que transfere o lead pra outro
     vendedor. Master/gestor veem tudo; o vendedor ve os leads em que e responsavel e envia
     so pelo proprio numero (a funcao wa-uazapi confere as duas coisas). */
  const LD={fone:'',nome:'',tarefa:'',chatid:'',por:'',perfil:'',fonePor:'',conectado:true,msgs:[],agendadas:[],vendedores:[],
            resp:[],nums:[],admin:false,eu:'',carregando:false,erro:'',enviando:false,arq:null,pop:'',rec:null,porFixo:false,iv:null};
  const nomeNum=(n)=>String(n||'').replace(/^./,(c)=>c.toUpperCase());
  const lembraDe=(n)=>{ try{ if(n) localStorage.setItem('waLdDe',n); else return localStorage.getItem('waLdDe')||''; }catch(_){ return ''; } };
  const MAX_ARQ=16*1024*1024;
  /* seletor de emoji (pedido do Bernardo 08/10): o emoji vai DENTRO da mensagem do WhatsApp, nao e
     icone da tela (regra do Gabriel 23/09 continua valendo pro resto). Escritos por codigo pra
     ficar claro que e conteudo. */
  const EMOJIS='\u{1F600} \u{1F601} \u{1F602} \u{1F60A} \u{1F642} \u{1F609} \u{1F60D} \u{1F970} \u{1F60E} \u{1F929} \u{1F605} \u{1F62C} \u{1F914} \u{1F644} \u{1F62E} \u{1F622} \u{1F64F} \u{1F44D} \u{1F44C} \u{1F44F} \u{1F64C} \u{1F44B} \u{1F91D} \u{1F4AA} \u{1F389} \u{2728} \u{2764}\u{FE0F} \u{1F525} \u{1F4AF} \u{2B50} \u{2705} \u{274C} \u{1F6CB}\u{FE0F} \u{1F6CF}\u{FE0F} \u{1FA91} \u{1F3E0} \u{1F4F8} \u{1F4DE} \u{1F4CD} \u{1F4C5} \u{23F0} \u{1F69A} \u{1F4B0} \u{1F4B3} \u{1F381} \u{1F4E6} \u{1F4DD} \u{1F440}'.split(' ');
  const sv=(d,w)=>`<svg width="${w||18}" height="${w||18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const IC={mais:sv('<path d="M12 5v14M5 12h14"/>'),emoji:sv('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>'),
    relogio:sv('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),mic:sv('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',20),
    enviar:sv('<path d="M5 12h14M13 6l6 6-6 6"/>',20),troca:sv('<path d="M7 7h12l-3-3M17 17H5l3 3"/>',20),lapis:sv('<path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16z"/>',13),
    foto:sv('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',16),doc:sv('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',16),
    fora:sv('<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',16)};
  const tarefaDe=(id)=>{ try{ return (TK.tarefas||[]).find(x=>x.id===id)||null; }catch(_){ return null; } };
  const urlOk=(u)=>/^https?:\/\//i.test(String(u||''));
  const dataHora=(iso)=>{ const d=new Date(iso); if(isNaN(d)) return '';
    return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+' às '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); };
  /* status da UAZAPI em ingles -> como o WhatsApp mostra */
  const stTxt=(x)=>({read:'lida',played:'ouvida',delivered:'entregue',deliveryack:'entregue',sent:'enviada',serverack:'enviada',pending:'enviando'})[String(x).toLowerCase()]||String(x).toLowerCase();
  const ROT_TIPO={image:'Foto',video:'Vídeo',document:'Documento',ptt:'Áudio'};

  window.waDoLead=async (fone,nome,op)=>{
    op=op||{}; const u=cu();
    if(!u||!(podeVer()||(u.papel_crm&&op.tarefa))){ toast('As conversas do WhatsApp são visíveis só para master, gestor e o vendedor do lead.'); return; }
    if(LD.rec) waLdRecCancelar();
    Object.assign(LD,{fone:String(fone||''),nome:nome||'',tarefa:op.tarefa||'',chatid:'',por:'',perfil:'',fonePor:'',conectado:true,msgs:[],agendadas:[],
      vendedores:[],resp:[],nums:[],admin:false,eu:'',carregando:true,erro:'',enviando:false,arq:null,pop:'',porFixo:false});
    estilo(); waLdModal(); waLdPinta();
    await ldCarregar();
    clearInterval(LD.iv);
    LD.iv=setInterval(()=>{ if(!$('#waLdOv')){ clearInterval(LD.iv); return; }
      if(document.visibilityState==='visible'&&!LD.enviando&&!LD.rec&&!LD.pop) ldCarregar(true); },25000);
  };
  async function ldCarregar(silencioso){
    try{
      const d=await api('lead',{fone:LD.fone,tarefa:LD.tarefa||undefined});
      LD.msgs=d.mensagens||[]; LD.chatid=d.chatid||''; LD.agendadas=d.agendadas||[]; LD.vendedores=d.vendedores||[];
      LD.resp=d.responsaveis||[]; LD.nums=d.nums||[]; LD.admin=!!d.admin; LD.eu=d.eu||''; LD.erro='';
      /* o master pode ter escolhido outro numero no seletor: vale enquanto o painel estiver aberto */
      if(!LD.porFixo||!LD.nums.includes(LD.por)){ LD.porFixo=false; LD.por=d.por||''; }
      if(!LD.por&&LD.nums.length){ const ult=lembraDe(); LD.por=LD.nums.includes(ult)?ult:LD.nums[0]; }
      if(LD.por===d.por){ LD.perfil=d.perfil||''; LD.fonePor=d.fonePor||''; LD.conectado=d.conectado!==false; }
      else { LD.perfil=''; LD.fonePor=''; LD.conectado=true; }
    }catch(e){ if(!silencioso) LD.erro=e.message||'falha'; }
    LD.carregando=false; waLdPinta();
  }
  function waLdModal(){
    waLdFechar();
    const ov=document.createElement('div'); ov.id='waLdOv';
    ov.style.cssText='position:fixed;inset:0;z-index:10600;background:rgba(0,0,0,.72);display:flex;align-items:stretch;justify-content:flex-end';
    ov.innerHTML='<div class="wald" id="waLd"><div class="wald-h" id="waLdHead"></div><div class="cv-msgs" id="waLdMsgs"></div>'+
      '<button class="wald-tr" id="waLdTr" title="Transferir para outro vendedor" onclick="waLdPop(\'tr\',event)">'+IC.troca+'</button>'+
      '<div class="wald-pe" id="waLdPe"><div class="wald-por" id="waLdPor"></div><div class="wald-arq" id="waLdArq"></div>'+
      '<div class="wald-cx"><div class="wald-in" id="waLdIn">'+
        '<button class="wald-ib" title="Anexar foto, vídeo ou documento" onclick="waLdPop(\'mais\',event)">'+IC.mais+'</button>'+
        '<button class="wald-ib" title="Emoji" onclick="waLdPop(\'em\',event)">'+IC.emoji+'</button>'+
        '<textarea id="waLdTexto" rows="1" placeholder="Digite uma mensagem…" oninput="waLdCresce(this)" onkeydown="waLdTecla(event)"></textarea>'+
        '<button class="wald-ib" title="Agendar mensagem" onclick="waLdPop(\'ag\',event)">'+IC.relogio+'</button></div>'+
      '<div class="wald-rec" id="waLdRec"></div>'+
      '<button class="wald-mic" id="waLdMic" onclick="waLdMic()" title="Gravar áudio">'+IC.mic+'</button></div></div>'+
      '<div class="wald-pop" id="waLdPop"></div><input type="file" id="waLdFile" hidden onchange="waLdArquivo(this)"></div>';
    ov.addEventListener('click',(e)=>{ if(e.target===ov){ waLdFechar(); return; }
      if(LD.pop&&!e.target.closest('#waLdPop')){ LD.pop=''; ldPop(); } });
    document.body.appendChild(ov);
  }
  window.waLdFechar=()=>{ if(LD.rec) waLdRecCancelar(); clearInterval(LD.iv); LD.pop=''; const o=$('#waLdOv'); if(o) o.remove(); };
  function ldHead(){
    const t=LD.tarefa?tarefaDe(LD.tarefa):null;
    let cls='';
    if(t&&typeof tkStatusDe==='function'){ const st=typeof tkStatus1==='function'?tkStatus1(t.status_id):null;
      cls=`<button class="wald-cl" onclick="waLdPop('cl',event)"${st?` style="--c:${esc(st.cor)}"`:''}>${st?'<i></i>'+esc(st.nome):'Classificar'} ▾</button>`; }
    const n=String(LD.fone).replace(/\D/g,'');
    return `<span class="wald-av">${esc(inicial(LD.nome||'?'))}</span>
      <div class="q"><div class="wald-nm" id="waLdNm"><b>${esc(LD.nome||fmtFone(LD.fone))}</b>${t?`<button class="wald-ib sm" title="Editar nome" onclick="waLdNome()">${IC.lapis}</button>`:''}</div>
        <small>${esc(fmtFone(LD.fone))}</small>${cls}</div>
      <a class="wald-ib bd" title="Abrir no WhatsApp" href="https://wa.me/${esc(n)}" target="_blank" rel="noopener">${IC.fora}</a>
      <button class="x" onclick="waLdFechar()" aria-label="Fechar">&times;</button>`;
  }
  function ldMidia(m){
    const u=urlOk(m.arquivo)?m.arquivo:'', t=String(m.tipo||''), leg=(m.texto&&!/^(\u{1F4F7}|\u{1F3A5}|\u{1F3A4}|\u{1F4C4})/u.test(m.texto))?esc(m.texto):'';
    if(u&&/Image|Sticker/.test(t)) return `<a href="${esc(u)}" target="_blank" rel="noopener"><img class="wald-img" src="${esc(u)}" alt="" loading="lazy"></a>${leg}`;
    if(u&&/Video/.test(t)) return `<video class="wald-img" controls preload="metadata" src="${esc(u)}"></video>${leg}`;
    if(u&&/Audio|Ptt/.test(t)) return `<audio class="wald-aud" controls preload="none" src="${esc(u)}"></audio>`;
    return (m.texto?esc(m.texto):'<i>(sem texto)</i>')+(u?`<a href="${esc(u)}" target="_blank" rel="noopener" class="cv-anexo">abrir arquivo</a>`:'');
  }
  function ldMsgs(){
    if(LD.carregando) return '<div class="cv-nada">Procurando a conversa…</div>';
    if(LD.erro) return '<div class="cv-nada">'+esc(LD.erro)+'</div>';
    let out='', dia='';
    const varios=new Set(LD.msgs.filter(m=>m.deNos&&m.por).map(m=>m.por)).size>1;
    if(!LD.msgs.length&&!LD.agendadas.length) out+='<div class="cv-nada">Ainda não tem conversa com '+esc(fmtFone(LD.fone))+' em nenhum número do time.<br>Escreva a primeira mensagem aqui embaixo.</div>';
    LD.msgs.forEach(m=>{
      const d=diaDe(m.quando);
      if(d!==dia){ dia=d; out+=`<div class="cv-dia"><span>${esc(d)}</span></div>`; }
      out+=`<div class="cv-bal ${m.deNos?'nos':'eles'}">${ldMidia(m)}<span class="cv-hr">${(varios&&m.deNos)?'via '+esc(nomeNum(m.por))+' · ':''}${esc(hora(m.quando))}${m.deNos&&m.status?' · '+esc(stTxt(m.status)):''}</span></div>`;
    });
    LD.agendadas.forEach(a=>{
      const err=a.status==='erro', arq=a.tipo&&a.tipo!=='texto'?'<span class="wald-anx">'+IC.doc+esc(a.nome_arquivo||ROT_TIPO[a.tipo]||'Arquivo')+'</span>':'';
      out+=`<div class="cv-bal nos wald-ag${err?' erro':''}"><div class="wald-agt">${IC.relogio} ${err?'Não saiu':'Agendada'} para ${esc(dataHora(a.enviar_em))}${a.instancia!==LD.por?' · '+esc(nomeNum(a.instancia)):''}</div>`+
        `${arq}${arq&&a.texto?'<br>':''}${esc(a.texto||'')}${err&&a.erro?`<div class="wald-err">${esc(a.erro)}</div>`:''}`+
        `<button class="wald-lk" onclick="waLdCancelar('${esc(a.id)}')">cancelar</button></div>`;
    });
    return out;
  }
  function ldPor(){
    if(LD.carregando||LD.erro||!LD.chatid) return '';
    if(!LD.por) return 'Você não tem um número de WhatsApp cadastrado para enviar (tela Usuários › WhatsApp).';
    const perf=LD.perfil&&LD.perfil.toLowerCase()!==LD.por?' ('+esc(LD.perfil)+')':'';
    const sel=(LD.admin&&LD.nums.length>1)?`<select title="Trocar o número" onchange="waLdDe(this.value)">${LD.nums.map(n=>`<option value="${esc(n)}"${n===LD.por?' selected':''}>${esc(nomeNum(n))}</option>`).join('')}</select>`:'';
    return `<span>Enviando pelo WhatsApp de <b>${esc(nomeNum(LD.por))}</b>${perf}${LD.fonePor?' • '+esc(fmtFone(LD.fonePor)):''}${LD.conectado?'':' <em class="wald-off">desconectado</em>'}</span>${sel}`;
  }
  function ldArq(){
    if(!LD.arq) return '';
    const kb=LD.arq.file.size/1024, tam=kb>1024?(kb/1024).toFixed(1)+' MB':Math.max(1,Math.round(kb))+' KB';
    return `<span class="wald-chip">${LD.arq.tipo==='image'||LD.arq.tipo==='video'?IC.foto:IC.doc} ${esc(LD.arq.nome)} <small>${tam}</small>
      <button onclick="waLdTiraArq()" title="Tirar o anexo">&times;</button></span><small class="wald-dica">O texto da caixa vai como legenda.</small>`;
  }
  function ldPop(){
    const p=$('#waLdPop'); if(!p) return;
    p.className='wald-pop'+(LD.pop?' on '+LD.pop:'');
    if(!LD.pop){ p.innerHTML=''; return; }
    if(LD.pop==='mais') p.innerHTML=`<button class="wald-mi" onclick="waLdEscolhe('midia')">${IC.foto} Foto ou vídeo</button><button class="wald-mi" onclick="waLdEscolhe('doc')">${IC.doc} Documento</button>`;
    else if(LD.pop==='em') p.innerHTML='<div class="wald-em">'+EMOJIS.map(e=>`<button onclick="waLdEmoji('${e}')">${e}</button>`).join('')+'</div>';
    else if(LD.pop==='ag'){
      const am=new Date(); am.setDate(am.getDate()+1);
      const dd=am.getFullYear()+'-'+String(am.getMonth()+1).padStart(2,'0')+'-'+String(am.getDate()).padStart(2,'0');
      const o=LD.arq?'o arquivo anexado':'a mensagem escrita na caixa';
      p.innerHTML=`<b>Agendar mensagem</b><label>Dia<input type="date" id="waLdAgD" value="${dd}"></label><label>Hora<input type="time" id="waLdAgH" value="09:00"></label>
        <button class="btn small" onclick="waLdAgendar()">Agendar</button><small class="wald-dica">Envia ${o} pelo WhatsApp de ${esc(nomeNum(LD.por))} no horário marcado.</small>`;
    }
    else if(LD.pop==='tr') p.innerHTML='<b>Transferir para</b>'+LD.vendedores.map(v=>{ const at=LD.resp.includes(v.id);
        return `<button class="wald-mi" ${at?'disabled':''} onclick="waLdTransferir('${esc(v.id)}')"><span class="wald-av sm">${esc(inicial(v.nome))}</span>${esc(v.nome)}${at?'<small>atual</small>':''}</button>`; }).join('')+
      '<small class="wald-dica">O lead passa a ser de quem você escolher, e as próximas mensagens saem pelo WhatsApp dessa pessoa.</small>';
    else if(LD.pop==='cl'){ const t=tarefaDe(LD.tarefa), sts=t&&typeof tkStatusDe==='function'?tkStatusDe(t.lista_id):[];
      p.innerHTML=sts.map(s=>`<button class="wald-mi${t.status_id===s.id?' on':''}" onclick="waLdStatus('${esc(s.id)}')"><i class="wald-dot" style="background:${esc(s.cor)}"></i>${esc(s.nome)}</button>`).join('')||'<small class="wald-dica">Essa lista não tem status.</small>'; }
  }
  function ldMic(){
    const b=$('#waLdMic'), inp=$('#waLdIn'), rb=$('#waLdRec'), t=$('#waLdTexto'); if(!b) return;
    const pronto=!!((t&&t.value.trim())||LD.arq);
    if(LD.rec){ const s=Math.floor((Date.now()-LD.rec.ini)/1000);
      inp.style.display='none'; rb.style.display='flex';
      rb.innerHTML=`<i></i> Gravando ${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}<span style="flex:1"></span><button class="wald-lk" onclick="waLdRecCancelar()">cancelar</button>`;
      b.innerHTML=IC.enviar; b.title='Enviar o áudio'; }
    else { inp.style.display=''; rb.style.display='none'; b.innerHTML=pronto?IC.enviar:IC.mic; b.title=pronto?'Enviar':'Gravar áudio'; }
    b.disabled=!!LD.enviando||!LD.por||!LD.chatid;
  }
  function waLdPinta(){
    const h=$('#waLdHead'); if(!h) return;
    h.innerHTML=ldHead();
    const c=$('#waLdMsgs'), noFim=c.scrollHeight-c.scrollTop-c.clientHeight<80;
    c.innerHTML=ldMsgs(); if(noFim||LD.enviando) c.scrollTop=c.scrollHeight;
    $('#waLdPor').innerHTML=ldPor();
    $('#waLdArq').innerHTML=ldArq();
    $('#waLdPe').style.display=(LD.carregando||LD.erro||!LD.chatid)?'none':'';
    const tr=$('#waLdTr'), podeTr=!!(LD.tarefa&&LD.vendedores.length>1&&(LD.admin||LD.resp.includes(LD.eu)));
    tr.style.display=podeTr?'':'none';
    ldPop(); ldMic();
  }
  window.waLdPop=(k,e)=>{ if(e) e.stopPropagation(); LD.pop=LD.pop===k?'':k; ldPop(); };
  window.waLdDe=(n)=>{ if(!LD.nums.includes(n)) return; LD.por=n; LD.porFixo=true; LD.perfil=''; LD.fonePor=''; LD.conectado=true; lembraDe(n); waLdPinta(); };
  window.waLdCresce=(t)=>{ t.style.height='auto'; t.style.height=Math.min(t.scrollHeight,140)+'px'; ldMic(); };
  window.waLdTecla=(e)=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); waLdEnviar(); } };
  window.waLdEmoji=(em)=>{ const t=$('#waLdTexto'); if(!t) return;
    const a=t.selectionStart??t.value.length, b=t.selectionEnd??t.value.length;
    t.value=t.value.slice(0,a)+em+t.value.slice(b); t.focus(); t.selectionStart=t.selectionEnd=a+em.length; waLdCresce(t); };
  window.waLdEscolhe=(k)=>{ const f=$('#waLdFile'); if(!f) return; f.accept=k==='midia'?'image/*,video/*':''; f.value=''; LD.pop=''; ldPop(); f.click(); };
  window.waLdArquivo=(inp)=>{ const f=inp.files&&inp.files[0]; if(!f) return;
    if(f.size>MAX_ARQ){ toast('Arquivo grande demais: o WhatsApp aceita até 16 MB.'); return; }
    const tipo=/^image\//.test(f.type)&&!/svg/.test(f.type)?'image':/^video\//.test(f.type)?'video':'document';
    LD.arq={file:f,tipo,nome:f.name||'arquivo'}; waLdPinta(); const t=$('#waLdTexto'); if(t) t.focus(); };
  window.waLdTiraArq=()=>{ LD.arq=null; waLdPinta(); };
  /* sobe pro bucket anexos (pasta wa/<quem>): a funcao gera um link temporario pra UAZAPI baixar */
  async function sobe(file,nome){
    const u=cu(); if(!u) throw new Error('Sessão expirada: entre de novo.');
    const limpo=String(nome||'arquivo').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\w.-]+/g,'-').replace(/^-+|-+$/g,'').slice(-80)||'arquivo';
    const caminho='wa/'+u.id+'/'+Date.now()+'-'+limpo;
    const {error}=await sb.storage.from('anexos').upload(caminho,file,{contentType:file.type||'application/octet-stream',upsert:false});
    if(error) throw new Error('não subiu o arquivo: '+error.message);
    return caminho;
  }
  window.waLdEnviar=async ()=>{
    if(LD.enviando||!LD.chatid||!LD.por) return;
    const t=$('#waLdTexto'), texto=(t?t.value:'').trim(), arq=LD.arq;
    if(!texto&&!arq) return;
    LD.enviando=true;
    const tmp={id:'tmp'+Date.now(),deNos:true,texto:arq?((ROT_TIPO[arq.tipo]||'Arquivo')+': '+arq.nome+(texto?'\n'+texto:'')):texto,quando:new Date().toISOString(),status:'enviando',por:LD.por};
    LD.msgs.push(tmp); LD.arq=null; if(t){ t.value=''; t.style.height='auto'; }
    waLdPinta();
    try{
      if(arq) await api('midia',{name:LD.por,chatid:LD.chatid,caminho:await sobe(arq.file,arq.nome),tipo:arq.tipo,nome:arq.nome,texto});
      else await api('responder',{name:LD.por,chatid:LD.chatid,texto});
      lembraDe(LD.por); tmp.status='enviada';
    }catch(e){ toast('Não enviou: '+e.message); LD.msgs=LD.msgs.filter(m=>m!==tmp); LD.arq=arq; LD.enviando=false; waLdPinta();
      const t2=$('#waLdTexto'); if(t2&&texto){ t2.value=texto; waLdCresce(t2); } return; }
    LD.enviando=false; waLdPinta(); setTimeout(()=>{ if($('#waLdOv')) ldCarregar(true); },1500);
  };
  /* audio: grava no navegador e manda como mensagem de voz (ptt) */
  async function gravar(){
    if(!navigator.mediaDevices||!window.MediaRecorder){ toast('Este navegador não grava áudio.'); return; }
    let st; try{ st=await navigator.mediaDevices.getUserMedia({audio:true}); }catch(_){ toast('Libere o microfone para gravar áudio.'); return; }
    const mt=['audio/ogg;codecs=opus','audio/webm;codecs=opus','audio/mp4','audio/webm'].find(x=>MediaRecorder.isTypeSupported(x))||'';
    const rec=new MediaRecorder(st,mt?{mimeType:mt}:undefined), partes=[];
    const R={rec,st,ini:Date.now(),cancelado:false,iv:null};
    rec.ondataavailable=(e)=>{ if(e.data&&e.data.size) partes.push(e.data); };
    rec.onstop=()=>{ st.getTracks().forEach(x=>x.stop()); clearInterval(R.iv); if(LD.rec===R) LD.rec=null; ldMic();
      if(R.cancelado||!partes.length||Date.now()-R.ini<800) return;
      const tipo=String(rec.mimeType||mt||'audio/webm').split(';')[0], ext=tipo.includes('ogg')?'ogg':tipo.includes('mp4')?'m4a':'webm';
      enviarAudio(new Blob(partes,{type:tipo}),ext); };
    LD.rec=R; rec.start(); R.iv=setInterval(ldMic,500); ldMic();
  }
  async function enviarAudio(blob,ext){
    if(!LD.chatid||!LD.por) return;
    const tmp={id:'tmp'+Date.now(),deNos:true,texto:'Áudio',quando:new Date().toISOString(),status:'enviando',por:LD.por};
    LD.enviando=true; LD.msgs.push(tmp); waLdPinta();
    try{ const caminho=await sobe(new File([blob],'audio.'+ext,{type:blob.type}),'audio.'+ext);
      await api('midia',{name:LD.por,chatid:LD.chatid,caminho,tipo:'ptt'}); tmp.status='enviada'; }
    catch(e){ toast('O áudio não saiu: '+e.message); LD.msgs=LD.msgs.filter(m=>m!==tmp); }
    LD.enviando=false; waLdPinta(); setTimeout(()=>{ if($('#waLdOv')) ldCarregar(true); },1500);
  }
  window.waLdMic=()=>{
    if(LD.rec){ LD.rec.rec.stop(); return; }
    const t=$('#waLdTexto'); if((t&&t.value.trim())||LD.arq){ waLdEnviar(); return; }
    if(LD.por&&LD.chatid&&!LD.enviando) gravar();
  };
  window.waLdRecCancelar=()=>{ if(LD.rec){ LD.rec.cancelado=true; try{ LD.rec.rec.stop(); }catch(_){} } };
  window.waLdAgendar=async ()=>{
    const d=($('#waLdAgD')||{}).value, h=($('#waLdAgH')||{}).value, t=$('#waLdTexto'), texto=(t?t.value:'').trim(), arq=LD.arq;
    if(!d||!h){ toast('Escolha o dia e a hora.'); return; }
    if(!texto&&!arq){ toast('Escreva na caixa a mensagem que vai ser agendada.'); return; }
    const quando=new Date(d+'T'+h);
    if(isNaN(quando)||quando.getTime()<Date.now()+60000){ toast('Escolha um horário no futuro.'); return; }
    const bt=document.querySelector('#waLdPop .btn'); if(bt){ bt.disabled=true; bt.textContent='Agendando…'; }
    try{
      const corpo={name:LD.por,chatid:LD.chatid,quando:quando.toISOString(),tarefa:LD.tarefa||undefined,texto};
      if(arq) Object.assign(corpo,{caminho:await sobe(arq.file,arq.nome),tipo:arq.tipo,nome:arq.nome});
      const r=await api('agendar',corpo);
      LD.agendadas.push(r.agendada); LD.agendadas.sort((a,b)=>String(a.enviar_em).localeCompare(String(b.enviar_em)));
      LD.arq=null; if(t){ t.value=''; t.style.height='auto'; } LD.pop='';
      waLdPinta(); const c=$('#waLdMsgs'); if(c) c.scrollTop=c.scrollHeight;
      toast('Mensagem agendada para '+dataHora(r.agendada.enviar_em)+'.');
    }catch(e){ toast('Não agendou: '+e.message); if(bt){ bt.disabled=false; bt.textContent='Agendar'; } }
  };
  window.waLdCancelar=async (id)=>{
    try{ await api('cancelar',{id}); LD.agendadas=LD.agendadas.filter(a=>a.id!==id); waLdPinta(); toast('Agendamento cancelado.'); }
    catch(e){ toast('Não cancelou: '+e.message); }
  };
  window.waLdStatus=async (sid)=>{
    LD.pop=''; ldPop();
    if(typeof tkSetStatus==='function') await tkSetStatus(LD.tarefa,sid);
    waLdPinta();
  };
  window.waLdNome=()=>{
    const box=$('#waLdNm'); if(!box) return;
    box.innerHTML=`<input id="waLdNmIn" value="${esc(LD.nome)}" maxlength="120" onkeydown="if(event.key==='Enter')this.blur();if(event.key==='Escape'){this.dataset.x=1;this.blur()}" onblur="waLdNomeSalva(this)">`;
    const i=$('#waLdNmIn'); i.focus(); i.select();
  };
  window.waLdNomeSalva=async (i)=>{
    const v=String(i.value||'').trim();
    if(i.dataset.x||!v||v===LD.nome){ waLdPinta(); return; }
    if(typeof tkPatch==='function'&&await tkPatch(LD.tarefa,{titulo:v},'Nome atualizado')) LD.nome=v;
    waLdPinta();
  };
  window.waLdTransferir=async (id)=>{
    const v=LD.vendedores.find(x=>x.id===id); if(!v||!LD.tarefa) return;
    LD.pop=''; ldPop();
    const prim=String(v.nome).split(' ')[0];
    const ok=typeof confirmar==='function'
      ? await confirmar('Transferir o lead para '+prim+'?','O lead passa a ser de '+prim+' e as próximas mensagens saem pelo WhatsApp de '+prim+'.',{sim:'Transferir',nao:'Cancelar'})
      : window.confirm('Transferir o lead para '+prim+'?');
    if(!ok) return;
    if(typeof tkPatch!=='function'||!(await tkPatch(LD.tarefa,{responsaveis:[id],responsavel_id:id},'Lead transferido para '+prim+'.'))) return;
    LD.resp=[id];
    /* o vendedor que passou o lead adiante perde o acesso a conversa */
    if(!LD.admin){ waLdFechar(); return; }
    LD.porFixo=false; ldCarregar(true);
  };
})();
