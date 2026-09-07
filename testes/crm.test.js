/* Testes do módulo CRM (crm.js). Rodar:  node testes/crm.test.js
   Carrega o crm.js num contexto isolado com stubs dos globais do index.html
   e confere as funções puras + os renders com dados fictícios. Sem rede, sem banco. */
const fs=require('fs'), vm=require('vm'), path=require('path');
const SRC=fs.readFileSync(path.join(__dirname,'..','crm.js'),'utf8');
let falhas=0,total=0;
const ok=(n,c)=>{ total++; if(c) console.log('  ok  '+n); else { console.log('  FALHOU  '+n); falhas++; } };
const grupo=(t)=>console.log('\n\x1b[1m'+t+'\x1b[0m');

const el=()=>({innerHTML:'',classList:{toggle(){},add(){},remove(){}},remove(){},querySelector(){return null;},querySelectorAll(){return [];},dataset:{},style:{},value:''});
const g={console,Date,Math,JSON,String,Number,Array,Object,Boolean,RegExp,Set,Map,parseInt,parseFloat,isNaN,Promise,setTimeout,clearTimeout,
  localStorage:{getItem(){return null;},setItem(){}}, location:{hash:''}, fetch:()=>Promise.reject(new Error('sem rede')),
  document:{getElementById:()=>null,createElement:el,body:{appendChild(){}},querySelectorAll:()=>[]},
  sb:null, currentUser:{id:'u-gab',nome:'Gabriel',role:'master'}, SESSION:null, currentView:'x',
  esc:(s)=>(s??'').toString().replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
  brl:(n)=>'R$ '+(Number(n)||0).toFixed(2).replace('.',','), toast(){}, modal(){}, confirmar:async()=>true, $:()=>null,
  renderFunil(){}, FN:{}, lkHash(){}, SUPA_URL:'https://x.supabase.co'};
g.window=g; vm.createContext(g);
vm.runInContext(SRC+'\n;Object.assign(window,{CRM,crmFiltrar,crmJanela,crmPct,crmFone,crmNoPeriodo,crmPipelineHTML,crmOrigensHTML,crmAgendaHTML,crmFichaHTML,crmIsoLocal,crmEst,crmOrigem});',g);

grupo('Carrega e exporta');
ok('crm.js é JS válido e definiu crmRender', typeof g.crmRender==='function');
ok('funções puras exportadas', ['crmFiltrar','crmJanela','crmPct','crmFone'].every(f=>typeof g[f]==='function'));

grupo('Utilitários');
ok('crmPct evita divisão por zero', g.crmPct(5,0)===0 && g.crmPct(1,4)===25);
ok('crmFone formata celular BR', g.crmFone('+5517998124430')==='(17) 99812-4430');
ok('crmFone formata fixo BR', g.crmFone('+551733334444')==='(17) 3333-4444');
ok('crmFone devolve o que veio se não reconhece', g.crmFone('+14155550000')==='+14155550000');

grupo('Janela de período');
g.CRM.f.periodo='7d'; let j=g.crmJanela();
ok('7 dias: janela de 7 dias até amanhã', Math.round((j.ate-j.de)/86400000)===7);
g.CRM.f.periodo='mes'; j=g.crmJanela();
ok('este mês começa no dia 1', j.de.getDate()===1 && j.de.getMonth()===new Date().getMonth());
g.CRM.f.periodo='tudo'; j=g.crmJanela();
ok('tudo: janela aberta', j.de.getFullYear()===2020);
g.CRM.f.periodo='30d';
ok('hoje está no período de 30 dias', g.crmNoPeriodo(new Date().toISOString()));
ok('60 dias atrás não está', !g.crmNoPeriodo(new Date(Date.now()-60*86400000).toISOString()));
ok('nulo não está', !g.crmNoPeriodo(null));

grupo('Filtros');
const agora=new Date().toISOString();
g.CRM.d.estagios=[{chave:'novo_lead',nome:'Novo lead',cor:'#888'},{chave:'agendado',nome:'Agendado',cor:'#7b68ee'},{chave:'ganho',nome:'Ganho',cor:'#3fcf8e',fim:'ganho'},{chave:'perdido',nome:'Perdido',cor:'#ef5b6b',fim:'perdido'}];
g.CRM.d.origens=[{key:'meta_ads',name:'Meta Ads',paid:true},{key:'indicacao',name:'Indicação',paid:false}];
g.CRM.d.equipe=[{id:'s1',nome:'Loane Silva',papel_crm:'sdr'},{id:'s2',nome:'Kennedy Souza',papel_crm:'sdr'},{id:'c1',nome:'José',papel_crm:'closer'},{id:'u-gab',nome:'Gabriel',role:'master'}];
g.CRM.d.motivos=[{id:'m1',name:'Timing'}];
g.CRM.d.appts=[];
g.CRM.d.opps=[
 {id:'o1',contact_id:'k1',cycle:1,stage:'novo_lead',status:'open',source:'meta_ads',sdr_id:'s1',created_at:agora,updated_at:agora,contact:{name:'Marcelo Duarte',phone_e164:'+5517998124430',company:'Auto Duarte'},ft:{campaign_name:'Agente IA',ad_name:'Vídeo madrugada',happened_at:agora}},
 {id:'o2',contact_id:'k2',cycle:1,stage:'agendado',status:'open',source:'indicacao',source_detail:'Yghor',sdr_id:'s2',closer_id:'c1',created_at:agora,updated_at:agora,appointment_at:agora,contact:{name:'Carla Menezes',phone_e164:'+5511988771200'},ft:null},
 {id:'o3',contact_id:'k3',cycle:2,stage:'ganho',status:'won',source:'meta_ads',sdr_id:'s1',closer_id:'c1',revenue:5950,created_at:agora,updated_at:agora,won_at:agora,closed_at:agora,contact:{name:'Rogério Lima',phone_e164:'+5516992310044'},ft:{campaign_name:'Agente IA',ad_name:'Carrossel',happened_at:agora}},
 {id:'o4',contact_id:'k4',cycle:1,stage:'perdido',status:'lost',source:'meta_ads',sdr_id:'s2',lost_reason_id:'m1',created_at:'2026-01-05T10:00:00Z',updated_at:'2026-01-06T10:00:00Z',lost_at:'2026-01-06T10:00:00Z',closed_at:'2026-01-06T10:00:00Z',contact:{name:'Antigo',phone_e164:'+5517900000000'},ft:null}
];
const F=()=>{ g.CRM.f={periodo:'30d',origem:'',sdr:'',closer:'',campanha:'',busca:''}; };
F(); ok('sem filtro devolve tudo', g.crmFiltrar(g.CRM.d.opps).length===4);
F(); g.CRM.f.origem='indicacao'; ok('filtro por origem', g.crmFiltrar(g.CRM.d.opps).map(o=>o.id).join()==='o2');
F(); g.CRM.f.sdr='s1'; ok('filtro por SDR (Loane)', g.crmFiltrar(g.CRM.d.opps).map(o=>o.id).join()==='o1,o3');
F(); g.CRM.f.sdr='s2'; ok('filtro por SDR (Kennedy)', g.crmFiltrar(g.CRM.d.opps).map(o=>o.id).join()==='o2,o4');
F(); g.CRM.f.closer='c1'; ok('filtro por closer', g.crmFiltrar(g.CRM.d.opps).length===2);
F(); g.CRM.f.campanha='Agente IA'; ok('filtro por campanha', g.crmFiltrar(g.CRM.d.opps).length===2);
F(); g.CRM.f.busca='998124430'; ok('busca por telefone (só dígitos)', g.crmFiltrar(g.CRM.d.opps).map(o=>o.id).join()==='o1');
F(); g.CRM.f.busca='carla'; ok('busca por nome, sem caixa', g.crmFiltrar(g.CRM.d.opps).map(o=>o.id).join()==='o2');
F(); g.CRM.f.busca='yghor'; ok('busca acha quem indicou', g.crmFiltrar(g.CRM.d.opps).map(o=>o.id).join()==='o2');
F(); g.CRM.f.origem='meta_ads'; g.CRM.f.sdr='s1'; ok('filtros combinam (E)', g.crmFiltrar(g.CRM.d.opps).map(o=>o.id).join()==='o1,o3');

grupo('Pipeline');
F(); let html=g.crmPipelineHTML();
ok('kanban tem uma coluna por estágio ativo', (html.match(/class="crm-col"/g)||[]).length===4);
ok('perdido antigo (fora do período) não aparece no kanban', !html.includes('Antigo'));
ok('ganho do período aparece na coluna Ganho com a receita', html.includes('Rogério Lima') && html.includes('R$ 5950,00'));
ok('KPI de leads separa pago de orgânico', /3<\/div><div class="s">2 de mídia paga · 1 orgânico\/indicação/.test(html));
ok('origem aparece como etiqueta no card', html.includes('crm-badge pago">Meta Ads') && html.includes('crm-badge org">Indicação'));
ok('quem indicou aparece no card', html.includes('>Yghor<'));
F(); g.CRM.f.sdr='s2'; html=g.crmPipelineHTML();
ok('com filtro de SDR só os cards dela ficam', html.includes('Carla Menezes') && !html.includes('Marcelo Duarte'));

grupo('Ficha');
F(); g.CRM.tl={o3:[{event_type:'lead_created',occurred_at:agora,actor_user_id:'s1',source:'ui',metadata:{source:'meta_ads'}},{event_type:'won',occurred_at:agora,actor_user_id:'c1',source:'ui',metadata:{revenue:5950}}]};
html=g.crmFichaHTML(g.CRM.d.opps[2]);
ok('ficha mostra origem → campanha → anúncio', html.includes('Agente IA') && html.includes('Carrossel'));
ok('ficha mostra SDR e closer pelo primeiro nome', html.includes('Loane') && html.includes('José'));
ok('linha do tempo mostra a venda com valor', html.includes('Venda fechada') && html.includes('R$ 5950,00'));
ok('oportunidade fechada oferece Reabrir e não Ganho', html.includes('Reabrir') && !html.includes('🎉 Ganho'));
html=g.crmFichaHTML(g.CRM.d.opps[1]);
ok('sem touchpoint mostra o detalhe da origem (quem indicou)', html.includes('Yghor'));

grupo('Origem da receita');
const mes=g.crmIsoLocal(new Date()).slice(0,7);
g.CRM.d.origensMes=[{mes:mes+'-01',source:'meta_ads',leads:10,respondidos:7,agendados:4,compareceram:3,vendas:2,receita:11900},{mes:mes+'-01',source:'indicacao',leads:3,respondidos:3,agendados:2,compareceram:2,vendas:1,receita:7900}];
g.CRM.mes=null; html=g.crmOrigensHTML();
ok('total da receita soma as origens', html.includes('R$ 19800,00'));
ok('participação da mídia paga = 60,1%', html.includes('60.1%') || html.includes('60,1%'));
ok('sem mês anterior, mostra "novo"', html.includes('novo'));
g.CRM.d.origensMes=[]; html=g.crmOrigensHTML();
ok('mês vazio não quebra e orienta', html.includes('Nenhum lead neste mês'));

grupo('Agenda');
g.CRM.d.appts=[{id:'a1',opportunity_id:'o2',closer_id:'c1',sdr_id:'s2',status:'scheduled',scheduled_start:new Date(Date.now()+3600000).toISOString(),scheduled_end:new Date(Date.now()+7200000).toISOString(),meet_url:'https://meet.google.com/abc-defg-hij'}];
g.CRM.d.google=[{user_id:'c1',google_email:'jose@x.com'}];
F(); html=g.crmAgendaHTML();
ok('semana tem 6 colunas de dia', (html.match(/class="dh/g)||[]).length===6);
ok('closer conectado aparece como Google ok', html.includes('Google ok'));
ok('próxima sessão lista o lead e o Meet', html.includes('Carla Menezes') && html.includes('Meet'));
F(); g.CRM.f.closer='s1'; html=g.crmAgendaHTML();
ok('filtro de closer some com a sessão de outro closer', !html.includes('Carla Menezes'));

console.log('\n'+(falhas?('\x1b[31m>>> '+falhas+' de '+total+' FALHARAM\x1b[0m'):('\x1b[32m>>> '+total+' testes ok\x1b[0m')));
process.exit(falhas?1:0);
