// Porteiro da avaliação pública dos serviços (NPS): autosintese.app.br/nps/trafego,
// /nps/agent-ia e /nps/trafego-agent-ia.
// Mesmo desenho do 'contrato': a página estática NÃO fala com a tabela, só com
// esta função, que valida e grava com service_role. O anon não tem acesso nenhum
// a pesquisa_satisfacao, e o honeypot é conferido aqui no servidor.
//
// GET  ?r=<id>  link do cliente (código criado pelo sistema quando o card vai para o
//               Controle de Churns): devolve a loja, o gerente e se já foi respondida.
//               Só responde por fichas criadas pelo sistema (as que têm ficha_id).
// POST body: { id, servico, g?, final?, hp_site?, ua?, ...respostas }
//   id      = uuid v4: o código do link do cliente, ou um gerado no navegador
//             (estável entre respostas parciais)
//   servico = 'trafego' | 'ia' | 'integrados' (vem da URL da página)
//   g       = primeiro nome do gerente, só no link solto (?g=joao)
//   final   = true no envio final (marca enviado_em e dispara o aviso no sininho)
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json'};
const j=(o:unknown,s=200)=>new Response(JSON.stringify(o),{status:s,headers:cors});

const UUID_V4=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// textos: [mínimo, máximo] (espelham os CHECKs)
const TXT:Record<string,[number,number]>={
  loja:[2,200], aval_gerente:[1,4000], aval_gestor:[1,4000], aval_projeto:[1,4000], sugestoes:[1,4000],
  ajustes_trafego:[1,4000], ajustes_ia:[1,4000], melhorias:[1,4000], pontos_fortes:[1,4000],
  integracao_valor:[1,4000], ponto_critico:[1,4000], indicacao:[1,500]
};
// notas: [mínimo, máximo]
const NOTA:Record<string,[number,number]>={
  nota_trafego:[1,10], gestor_clareza:[0,10], nota_ia:[1,10], gerente_apoio:[0,10],
  prazos:[0,10], dependencia:[0,10], integracao_tempo:[0,10], nps:[0,10]
};
const OPC:Record<string,string[]>={
  servico:['trafego','ia','integrados'],
  prioridade:['integrador','social','ambos','nenhum']
};
// primeiro nome, sem acento e minúsculo: "João Pedro" -> "joao" (mesma ideia do prim_nome do banco)
const prim=(s:unknown)=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g,'');

function limpar(body:any):Record<string,unknown>{
  const out:Record<string,unknown>={};
  for(const k of Object.keys(TXT)){
    let v=body[k]; if(v===undefined||v===null) continue;
    v=String(v).trim(); if(!v) continue;
    const [min,max]=TXT[k];
    if(v.length>max) v=v.slice(0,max);
    if(v.length<min) continue;
    out[k]=v;
  }
  for(const k of Object.keys(NOTA)){
    const v=body[k]; if(v===undefined||v===null||v==='') continue;
    const n=Number(v); const [min,max]=NOTA[k];
    if(Number.isInteger(n)&&n>=min&&n<=max) out[k]=n;
  }
  for(const k of Object.keys(OPC)){
    const v=String(body[k]||''); if(OPC[k].indexOf(v)>=0) out[k]=v;
  }
  if(body.ua) out.ua=String(body.ua).slice(0,300);
  return out;
}

async function ipHash(req:Request):Promise<string>{
  const ip=(req.headers.get('x-forwarded-for')||'').split(',')[0].trim()||'0';
  const buf=await crypto.subtle.digest('SHA-256', new TextEncoder().encode('pesquisa:'+ip));
  return Array.from(new Uint8Array(buf)).slice(0,12).map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function sb(su:string,srk:string,path:string,init:RequestInit){
  return fetch(`${su}/rest/v1/${path}`,{...init,headers:{apikey:srk,authorization:`Bearer ${srk}`,'Content-Type':'application/json',...(init.headers||{})}});
}

Deno.serve(async (req)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
  const su=Deno.env.get('SUPABASE_URL'), srk=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if(req.method==='GET'){
    const r=new URL(req.url).searchParams.get('r')||'';
    if(!r) return j({ok:true,pronto:true});
    if(!su||!srk) return j({ok:false,erro:'ambiente'},500);
    if(!UUID_V4.test(r)) return j({ok:true,existe:false});
    const q=await sb(su,srk,`pesquisa_satisfacao?id=eq.${r}&select=loja,gerente,servico,tipo,enviado_em,ficha_id`,{method:'GET'});
    const x=q.ok?((await q.json())[0]||null):null;
    // código desconhecido ou ficha de link solto: a página segue como link solto
    if(!x||!x.ficha_id) return j({ok:true,existe:false});
    return j({ok:true,existe:true,enviada:!!x.enviado_em,loja:x.loja||'',gerente:String(x.gerente||'').trim().split(/\s+/)[0],
      servico:x.servico||'',tipo:x.tipo||''});
  }
  if(req.method!=='POST') return j({ok:false,erro:'metodo'},405);
  if(!su||!srk) return j({ok:false,erro:'ambiente'},500);

  let body:any; try{ body=await req.json(); }catch(_){ return j({ok:false,erro:'json'},400); }

  // robô que preenche o campo oculto recebe 'ok' e nada grava
  if(body.hp_site) return j({ok:true,ignorado:true});

  const id=String(body.id||'');
  if(!UUID_V4.test(id)) return j({ok:false,erro:'id invalido'},400);
  const final=!!body.final;
  const campos=limpar(body);

  const r0=await sb(su,srk,`pesquisa_satisfacao?id=eq.${id}&select=id,enviado_em,ficha_id,loja,servico,nps`,{method:'GET'});
  const existentes=r0.ok?await r0.json():[];
  const atual=(Array.isArray(existentes)&&existentes[0])||null;
  // reenvio de avaliação concluída: idempotente, não regrava nem re-notifica
  if(atual&&atual.enviado_em) return j({ok:true,jaEnviada:true});
  // link do cliente: a loja é a da ficha, o que vier do navegador não troca
  if(atual&&atual.ficha_id) delete campos.loja;

  // ficha nova (link solto): no máximo 20 por IP por hora, e o gerente vem do ?g=
  if(!atual){
    const desde=new Date(Date.now()-3600e3).toISOString();
    const iph=await ipHash(req);
    const rc=await sb(su,srk,`pesquisa_satisfacao?ip_hash=eq.${iph}&criado_em=gte.${desde}&select=id`,{method:'GET',headers:{Prefer:'count=exact'}});
    const total=Number((rc.headers.get('content-range')||'*/0').split('/')[1]||0);
    if(total>=20) return j({ok:false,erro:'muitas tentativas'},429);
    (campos as any).ip_hash=iph;
    (campos as any).tipo='mensal';
    const g=String(body.g||'').toLowerCase();
    if(/^[a-z]{2,30}$/.test(g)){
      const rp=await sb(su,srk,'perfis?aprovado=eq.true&gerente=eq.true&select=id,nome',{method:'GET'});
      const ps=rp.ok?await rp.json():[];
      const p=(Array.isArray(ps)?ps:[]).find((x:any)=>prim(x.nome)===g);
      if(p){ (campos as any).gerente=String(p.nome).slice(0,80); (campos as any).gerente_id=p.id; }
    }
  }

  // final só vale com o mínimo que o painel precisa: loja, serviço e a nota de indicação
  if(final){
    const a:any=atual||{};
    const tem=(k:string)=>campos[k]!==undefined||(a[k]!==undefined&&a[k]!==null&&a[k]!=='');
    if(!(tem('loja')&&tem('servico')&&tem('nps'))) return j({ok:false,erro:'incompleta'},400);
  }

  // UPSERT atômico por id: parcial + final quase juntos viram merge, não colisão.
  const linha:Record<string,unknown>={id,...campos};
  if(final) linha.enviado_em=new Date().toISOString();
  const up=await sb(su,srk,'pesquisa_satisfacao?on_conflict=id',{method:'POST',
    headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(linha)});
  if(!up.ok) return j({ok:false,erro:'gravar',detalhe:await up.text()},500);
  return j({ok:true,gravado:true,final});
});
