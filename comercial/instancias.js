/* Comercial › Instâncias — números de WhatsApp na UAZAPI (QR code, status, rodízio da landing).
   Arquivo separado do crm.js de propósito: ele só acrescenta a aba, sem mexer no módulo.
   O navegador nunca vê token: tudo passa pela função wa-uazapi com o login do usuário.
   O servidor UAZAPI é compartilhado com o CRM do grupo: aqui não existe apagar nem
   desconectar número — isso derrubaria o número lá também. Só status, QR, teste, envio
   e, desde 05/10, cadastrar/gerar número novo (só master, pela tela Usuários). */
(function(){
  const URL_='https://fuieonexmdupupcsyowg.supabase.co/functions/v1/wa-uazapi';
  const IN={lista:[],fila:[],placar:{},servidor:'',erro:'',carregou:false,carregando:false,qr:null,qrNome:'',qrTimer:null,ativa:false,master:false,podeGerar:false};
  const $=(s)=>document.querySelector(s);
  const barra=(c)=>[...c.querySelectorAll('.fin-tabs')].find(t=>t.innerHTML.includes('crmAba('))||null;
  const esc=(s)=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  /* SESSION e currentUser são `let` do index.html (escopo global, mas não window.*) */
  const cu=()=>{ try{ return currentUser; }catch(_){ return null; } };
  const ses=()=>{ try{ return SESSION; }catch(_){ return null; } };
  const podeAdmin=()=>{ const u=cu(); return !!(u&&(u.role==='master'||['admin','gestor'].includes(u.papel_crm))); };
  async function api(acao,corpo){
    const S=ses(); if(!S||!S.access_token){ throw new Error('Sessão expirada: entre de novo.'); }
    const r=await fetch(URL_+'/'+acao,{method:corpo?'POST':'GET',headers:{authorization:'Bearer '+S.access_token,'content-type':'application/json'},body:corpo?JSON.stringify(corpo):undefined});
    const d=await r.json().catch(()=>({ok:false,erro:'resposta inválida'}));
    if(!d.ok){ const e=new Error(d.erro||('erro '+r.status)); e.dados=d; throw e; }
    return d;
  }
  async function carregar(){
    if(IN.carregando) return; IN.carregando=true;
    try{ const d=await api('listar'); IN.lista=d.instancias||[]; IN.fila=d.fila||[]; IN.placar=d.placar||{}; IN.servidor=d.servidor||''; IN.erro='';
      IN.master=!!d.master; IN.podeGerar=!!d.podeGerar; }
    catch(e){ IN.erro=e.message||'falha'; }
    IN.carregou=true; IN.carregando=false;
  }
  const fmtFone=(jid)=>{ const d=String(jid||'').replace(/@.*$/,'').replace(/\D/g,''); if(!d) return '';
    const n=d.startsWith('55')&&d.length>=12?d.slice(2):d; return n.length===11?`(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`:(n.length===10?`(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`:d); };
  const quando=(iso)=>{ if(!iso) return ''; const d=new Date(iso); return isNaN(d)?'':d.toLocaleDateString('pt-BR')+' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}); };

  function html(){
    if(!IN.carregou) return '<div class="empty">Carregando instâncias…</div>';
    const L=IN.lista, on=L.filter(i=>i.conectado).length;
    const linha=(i)=>`<div class="crm-row">
      <div style="width:40px;height:40px;border-radius:50%;background:var(--panel2);display:grid;place-items:center;overflow:hidden;flex:none">${i.foto?`<img src="${esc(i.foto)}" style="width:100%;height:100%;object-fit:cover">`:'<span style="font-size:18px"><svg class="emi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg></span>'}</div>
      <div class="g"><b>${esc(i.name)}</b> ${i.dono?'· '+esc(fmtFone(i.dono)):''} ${i.perfil?`<span style="color:var(--muted)">· ${esc(i.perfil)}</span>`:''}
        ${i.envioLanding?`<span class="crm-badge info" title="Entra no rodízio da primeira mensagem pros leads da landing /ads">rodízio ${i.ordemRodizio}º${IN.placar[i.name]?' · '+IN.placar[i.name]+' lead'+(IN.placar[i.name]===1?'':'s')+' em 30d':''}</span>`:''}
        <small>${i.erro?esc(i.erro):(i.conectado?'conectado':(i.status||'desconectado'))}${i.ultimaQueda&&!i.conectado&&!i.erro?' · caiu '+esc(quando(i.ultimaQueda))+(i.motivoQueda?' ('+esc(i.motivoQueda)+')':''):''}${i.nomeUazapi&&i.nomeUazapi!==i.name?' · '+esc(i.nomeUazapi):''}</small></div>
      <span class="crm-badge ${i.conectado?'ok':(i.erro?'warn':'bad')}">${i.conectado?'conectado':(i.erro?'erro':'desconectado')}</span>
      <div class="acts">
        ${i.erro?'':(i.conectado
          ?`<button class="btn secondary small" onclick="instTestar('${esc(i.name)}')">Testar</button>`
          :`<button class="btn small" onclick="instConectar('${esc(i.name)}')">Conectar (QR)</button>`)}
        ${podeAdmin()&&!i.erro?`<button class="btn secondary small" title="${i.envioLanding?'Tirar do rodízio da landing':'Entrar no rodízio da landing'}" onclick="instRodizio('${esc(i.name)}',${i.envioLanding?'false':'true'})">${i.envioLanding?'Sair do rodízio':'Entrar no rodízio'}</button>`:''}
      </div></div>`;
    return `${IN.erro?`<div class="crm-hint" style="color:var(--danger);margin:0 0 10px">${esc(IN.erro)}</div>`:''}
    <div class="crm-intg"><div class="crm-ic wide">
      <div class="hd"><div class="lg" style="font-size:22px"><svg class="emi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg></div><div><h4>Instâncias de WhatsApp (UAZAPI)</h4><div class="sub">Um número por SDR · ${on}/${L.length} conectado${L.length===1?'':'s'} · rodízio da landing: ${IN.fila.length?esc(IN.fila.join(' → ')):'ninguém'}${IN.servidor?' · '+esc(IN.servidor):''}</div></div>
        <div class="acts"><button class="btn secondary small" onclick="instRecarregar()" title="Recarregar">↻</button></div></div>
      ${L.length?L.map(linha).join(''):'<div class="crm-vazio">Nenhum número cadastrado. Pra incluir um, um master usa <b>Usuários › WhatsApp</b>.</div>'}
      <div class="crm-hint">Pra conectar: clique em <b>Conectar (QR)</b>, e no celular do SDR abra <b>WhatsApp › Dispositivos conectados › Conectar dispositivo</b> e aponte pro código. Quem está no <b>rodízio</b> reveza a primeira mensagem pros leads de autosintese.app.br/ads: cada lead cai pra quem atendeu menos nos últimos 30 dias, e número desconectado é pulado na hora. Esses números também atendem o CRM do grupo, por isso desconectar ou apagar só pelo painel da UAZAPI.</div>
    </div></div>`;
  }

  /* ---- ações ---- */
  /* a tela Usuarios tambem mostra os numeros: redesenha a coluna dela quando a lista muda */
  const avisaUsuarios=()=>{ if(typeof window.usWaCarregar==='function'&&document.getElementById('usWaSec')) usWaCarregar(); };
  window.instRecarregar=()=>{ IN.carregou=false; if(window.crmPintar) crmPintar(); carregar().then(()=>{ if(window.crmPintar) crmPintar(); avisaUsuarios(); }); };
  window.instRodizio=async(name,dentro)=>{
    try{ const d=await api('rodizio',{name,dentro});
      toast(dentro?(name+' entrou no rodízio da landing.'):(name+' saiu do rodízio.'));
      IN.fila=d.fila||IN.fila; instRecarregar(); }catch(e){ toast('Erro: '+e.message); }
  };
  window.instTestar=async(name)=>{
    const num=prompt('Mandar mensagem de teste pra qual número? (com DDD)', ''); if(!num) return;
    try{ await api('testar',{name,number:num,text:'Teste da AutoSíntese Este número está conectado ao sistema.'}); toast('Enviada. Confere no WhatsApp.'); }catch(e){ toast('Erro: '+e.message); }
  };
  /* QR: modal que pede um código novo a cada 20 s até conectar */
  window.instConectar=(name)=>{ IN.qrNome=name; IN.qr=null; instQrModal(); instQrPuxar(); };
  window.instQrFechar=()=>{ if(IN.qrTimer) clearTimeout(IN.qrTimer); IN.qrTimer=null; const m=$('#instQrOv'); if(m) m.remove(); instRecarregar(); };
  window.instQrCodigo=async()=>{ const f=prompt('Número do celular que vai conectar (com DDD):',''); if(!f) return; await instQrPuxar(f); };
  function instQrModal(){
    const ov=document.createElement('div'); ov.id='instQrOv';
    ov.style.cssText='position:fixed;inset:0;z-index:10500;background:rgba(0,0,0,.72);display:grid;place-items:center;padding:20px';
    ov.innerHTML=`<div style="width:100%;max-width:420px;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px;text-align:center;position:relative">
      <button class="x" onclick="instQrFechar()" style="position:absolute;top:10px;right:12px;font-size:22px;background:none;border:0;color:var(--muted);cursor:pointer">×</button>
      <div style="font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:var(--muted)">Conectar WhatsApp</div>
      <h3 style="margin:6px 0 4px">${esc(IN.qrNome)}</h3>
      <div id="instQrCorpo" style="min-height:300px;display:grid;place-items:center;color:var(--muted)">Gerando QR code…</div>
      <div style="font-size:12px;color:var(--muted);margin-top:10px">No celular: <b>WhatsApp › Dispositivos conectados › Conectar dispositivo</b>. O QR se renova sozinho a cada 20 s.</div>
      <div style="margin-top:10px"><button class="btn secondary small" onclick="instQrCodigo()">Prefiro digitar um código</button></div>
    </div>`;
    ov.addEventListener('click',(e)=>{ if(e.target===ov) instQrFechar(); });
    document.body.appendChild(ov);
  }
  async function instQrPuxar(fone){
    const c=$('#instQrCorpo'); if(!c) return;
    try{
      const d=await api('conectar',fone?{name:IN.qrNome,fone}:{name:IN.qrNome});
      if(!$('#instQrCorpo')) return;
      if(d.conectado){ c.innerHTML=`<div><div style="font-size:44px"><svg class="emi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><path d="M22 4L12 14.6l-3-3"/></svg></div><div style="font-weight:800;font-size:18px;margin-top:6px">Conectado</div><div style="color:var(--muted);margin-top:4px">${esc(fmtFone(d.dono))}${d.perfil?' · '+esc(d.perfil):''}</div></div>`;
        if(IN.qrTimer) clearTimeout(IN.qrTimer); IN.qrTimer=setTimeout(instQrFechar,2500); return; }
      if(d.paircode) c.innerHTML=`<div><div style="color:var(--muted);font-size:13px;margin-bottom:8px">Digite este código no celular:<br><b>Conectar com número de telefone</b></div><div style="font-size:34px;font-weight:800;letter-spacing:.18em;background:var(--panel2);border-radius:12px;padding:14px">${esc(d.paircode)}</div></div>`;
      else if(d.qr) c.innerHTML=`<img src="${d.qr}" alt="QR code" style="width:280px;height:280px;border-radius:12px;background:#fff;padding:10px;box-sizing:border-box">`;
      else c.textContent='Não veio QR. Tenta de novo.';
      IN.qrTimer=setTimeout(()=>instQrPuxar(fone),fone?15000:20000);
    }catch(e){ c.innerHTML='<div style="color:var(--danger)">'+esc(e.message)+'</div>'; }
  }

  /* ---- cadastro de número pela tela Usuários (Bernardo 05/10) ----
     Antes o token entrava no cofre na mão, pelo SQL Editor do Supabase. Agora o master
     cola o token de uma instância que já existe na UAZAPI, ou gera uma nova aqui mesmo
     (com o token admin do servidor, salvo uma vez). Os tokens vão direto pra função
     wa-uazapi e nunca voltam pra tela. Depois de cadastrar, já abre o QR. */
  const apelidoDe=(s)=>String(s||'').trim().split(/\s+/)[0].toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]/g,'').slice(0,20);
  function instCss(){
    if($('#instCss')) return;
    const st=document.createElement('style'); st.id='instCss';
    st.textContent=`.inst-modo{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .field .inst-op{display:flex;gap:10px;align-items:flex-start;margin:0;padding:12px;border:1px solid var(--line);border-radius:12px;background:var(--panel2);cursor:pointer;color:var(--txt)}
      .field .inst-op:hover{border-color:var(--fraco)}
      .field .inst-op:has(input:checked){border-color:var(--brand);box-shadow:inset 0 0 0 1px var(--brand)}
      .field .inst-op input{width:auto;margin:2px 0 0;accent-color:var(--brand);flex:none}
      .inst-op b{display:block;font-size:13.5px}
      .inst-op small{display:block;color:var(--muted);font-size:12px;margin-top:3px;line-height:1.4}
      .field>label>small{color:var(--fraco);margin-left:6px}
      @media (max-width:720px){.inst-modo{grid-template-columns:1fr}}`;
    document.head.appendChild(st);
  }
  window.instCadastrar=async(apelido,quem,opc)=>{
    opc=opc||{};
    if(!IN.carregou) await carregar();
    if(!IN.master){ toast('Só master cadastra número de WhatsApp.'); return; }
    instCss();
    const modo0=opc.modo||(IN.podeGerar?'gerar':'token');
    const tituloM=quem?('WhatsApp de '+esc(String(quem).trim().split(/\s+/)[0])):'Novo número de WhatsApp';
    modal(tituloM,`
      <p class="hint" style="margin:0 0 14px">Um número por pessoa do comercial. As mensagens dele entram no pipeline e nas conversas do sistema.</p>
      <div class="field"><label>Apelido do número</label><input id="inst_ap" value="${esc(apelidoDe(apelido))}" placeholder="ex: luana" maxlength="20" autocomplete="off" spellcheck="false">
        <div class="hint" style="margin-top:6px">O primeiro nome da pessoa no sistema, sem acento. É ele que liga o número à pessoa.</div></div>
      <div class="field"><label>Como</label><div class="inst-modo">
        <label class="inst-op"><input type="radio" name="inst_modo" value="gerar"${modo0==='gerar'?' checked':''}><span><b>Gerar número novo</b><small>Cria a instância na UAZAPI e já abre o QR code</small></span></label>
        <label class="inst-op"><input type="radio" name="inst_modo" value="token"${modo0==='token'?' checked':''}><span><b>Já tenho o token</b><small>A instância já existe no painel da UAZAPI</small></span></label>
      </div></div>
      <div id="inst_p_gerar">${IN.podeGerar?'':`<div class="field"><label>Token admin do servidor<small>${esc(IN.servidor)}</small></label><input id="inst_adm" type="password" autocomplete="new-password" spellcheck="false" placeholder="só na primeira vez">
        <div class="hint" style="margin-top:6px">Fica guardado no servidor e nunca volta pra tela. Depois disso, gerar número é um clique.</div></div>`}</div>
      <div id="inst_p_token"><div class="field"><label>Token da instância</label><input id="inst_tk" type="password" autocomplete="new-password" spellcheck="false" placeholder="cole aqui">
        <div class="hint" style="margin-top:6px">Painel da UAZAPI › instância › Token. Fica guardado no servidor e nunca volta pra tela.</div></div></div>`,
      async()=>{
        const ov=[...document.querySelectorAll('.overlay')].pop();
        const modo=(ov.querySelector('input[name=inst_modo]:checked')||{}).value;
        const name=apelidoDe(ov.querySelector('#inst_ap').value);
        if(name.length<2){ toast('Apelido: o primeiro nome da pessoa, só letras e números.'); return false; }
        const bt=ov.querySelector('.msave'), txt=bt.textContent; bt.disabled=true; bt.textContent='Aguarde…';
        try{
          let d;
          if(modo==='gerar'){
            const adm=ov.querySelector('#inst_adm');
            if(adm){ const v=adm.value.trim();
              if(!v){ toast('Cole o token admin do servidor (só na primeira vez), ou use "Já tenho o token".'); return false; }
              await api('admin-token',{token:v}); IN.podeGerar=true; }
            try{ d=await api('criar',{name}); }
            catch(e){
              /* token admin guardado foi recusado: reabre pedindo de novo */
              if(!(e.dados&&e.dados.precisaAdmin)) throw e;
              IN.podeGerar=false; toast(e.message); setTimeout(()=>instCadastrar(name,quem,{modo:'gerar'}),150); return true;
            }
          }else{
            const tk=ov.querySelector('#inst_tk').value.trim();
            if(!tk){ toast('Cole o token da instância.'); return false; }
            try{ d=await api('cadastrar',{name,token:tk}); }
            catch(e){
              if(!(e.dados&&e.dados.existe)) throw e;
              const sim=typeof confirmar==='function'
                ?await confirmar('Trocar o token de "'+name+'"?','Já existe um número com esse apelido e outro token. O token novo entra no lugar do antigo.',{sim:'Sim, trocar',nao:'Não'})
                :confirm('Já existe "'+name+'" com outro token. Trocar?');
              if(!sim) return false;
              d=await api('cadastrar',{name,token:tk,substituir:true});
            }
          }
          if(d.aviso) toast('Atenção: '+d.aviso);
          else toast(modo==='gerar'?('Número "'+name+'" criado. Escaneie o QR.'):('Número "'+name+'" cadastrado.'));
          IN.carregou=false; await carregar(); avisaUsuarios();
          if(!d.conectado) setTimeout(()=>instConectar(name),150);
          return true;
        }catch(e){ toast('Erro: '+e.message); return false; }
        finally{ bt.disabled=false; bt.textContent=txt; }
      });
    const ov=[...document.querySelectorAll('.overlay')].pop(); if(!ov) return;
    const pinta=()=>{ const m=(ov.querySelector('input[name=inst_modo]:checked')||{}).value;
      ov.querySelector('#inst_p_gerar').style.display=m==='gerar'?'':'none';
      ov.querySelector('#inst_p_token').style.display=m==='token'?'':'none';
      const b=ov.querySelector('.msave'); if(b) b.textContent=m==='gerar'?'Gerar e mostrar QR':'Cadastrar'; };
    ov.querySelectorAll('input[name=inst_modo]').forEach(r=>r.addEventListener('change',pinta)); pinta();
    const f=ov.querySelector(opc.modo==='token'?'#inst_tk':'#inst_ap'); if(f) f.focus();
  };

  /* ---- entra na aba Comercial sem mexer no crm.js ----
     O CRM guarda a aba num const próprio (fora do window), então a aba "instancias"
     é controlada aqui: quem clica passa por crmAba, e a gente anota. */
  function ligar(){
    const orig=window.crmRender, origAba=window.crmAba;
    if(typeof orig!=='function'||typeof origAba!=='function'||orig.__inst) return false;
    window.crmAba=(a)=>{ IN.ativa=(a==='instancias'); origAba(a); };
    const novo=function(c,view){
      orig.call(this,c,view);
      const bar=barra(c); if(!bar) return;
      injeta(c);
      if(!IN.ativa) return;
      bar.querySelectorAll('.ftab').forEach(x=>x.classList.toggle('active',x.dataset.inst==='1'));
      let n=bar.nextSibling; while(n){ const nx=n.nextSibling; n.remove(); n=nx; }
      bar.insertAdjacentHTML('afterend',html());
      const d=c.querySelector('.page-head .desc'); if(d) d.textContent='Números de WhatsApp do time · QR code e status';
      if(!IN.carregou&&!IN.carregando) carregar().then(()=>{ if(IN.ativa&&window.crmPintar) crmPintar(); });
    };
    novo.__inst=true; window.crmRender=novo; return true;
  }
  /* Comercial nao tem mais essa aba (Gabriel 16/09): o lead do WhatsApp entra
     direto na coluna "Para atender" do pipeline, e a instancia de cada pessoa
     mora na tela Usuarios. A funcao fica aqui, desligada, porque o resto do
     arquivo (QR, status, envio) continua sendo usado de la. */
  function injeta(){ return; }
  if(!ligar()){ let t=0; const iv=setInterval(()=>{ if(ligar()||++t>50) clearInterval(iv); },200); }

  /* Usado pela tela Usuarios: carrega a lista e devolve a instancia de uma pessoa.
     O vinculo é pelo apelido da instancia (kennedy, luana) contra o primeiro nome. */
  window.instLista=async()=>{ if(!IN.carregou) await carregar(); return IN.lista; };
  window.instDe=(nome)=>{
    const p=String(nome||'').trim().split(/\s+/)[0].toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'');
    return (IN.lista||[]).find(i=>i.name===p)||null;
  };
  window.instRecarregarLista=async()=>{ IN.carregou=false; await carregar(); return IN.lista; };
  window.instPodeCadastrar=()=>IN.master;
})();
