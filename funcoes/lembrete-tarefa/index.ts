// lembrete-tarefa — botão "Notificar responsável" da tarefa (Gabriel 23/09/2026).
// Só gerente (perfis.gerente) ou master. A mensagem é montada AQUI a partir da tarefa no banco
// (o app só manda o id), e sai no grupo certo pelo WhatsApp de um gerente (Luiz ou João).
//
// Para onde vai (Gabriel 23/09): o GRUPO sai sozinho pela lista da tarefa + o responsável (tabela ROTAS).
// Não existe escolher grupo. Envia pelo WhatsApp do GERENTE QUE CRIOU a tarefa (Gabriel 23/09).
// Quem criou não é gerente com número: o do squad (01 = Luiz 11 91504-7150, 02 = João 11 92174-2778;
// mapa em lembrete_squad_numero). Fora do grupo: o outro gerente, com aviso.
// Responsáveis de grupos diferentes: uma mensagem por grupo.
//
// Configuração em public.segredos:
//   uazapi_url                 servidor UAZAPI (o mesmo do CRM)
//   lembrete_inst_<nome>       token da instância do gerente (lembrete_inst_luiz, lembrete_inst_joao)
//   lembrete_jid_<grupo>       cache do JID de cada grupo (grava sozinho na 1ª vez, achando pelo nome)
// Não usa o prefixo uazapi_inst_ de propósito: esses números são pessoais dos gerentes e não podem
// entrar na busca de conversas de lead nem no rodízio da landing.
//
//  POST /enviar   {tarefa_id}      manda o lembrete e devolve o(s) payload(s)
//  POST /status   {}               instâncias de lembrete + conectado?
//  POST /conectar {name}           QR pra reconectar o número do gerente
//  POST /concluida {tarefa_id}     "Demanda concluída" no grupo do responsável, com o "O que foi feito"
//                                  (qualquer pessoa aprovada que seja responsável/quem concluiu, gerente ou master)
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const SU = Deno.env.get('SUPABASE_URL') ?? '', SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const H = { apikey: SRK, Authorization: 'Bearer ' + SRK, 'Content-Type': 'application/json' };
const APP = 'https://autosintese.app.br/';
const PRIO: Record<string, string> = { urgente: 'Urgente', alta: 'Alta', med: 'Normal', baixa: 'Baixa' };
const ESPERA_MIN = 10;   // a mesma tarefa só é lembrada de novo depois disso
const CAMPANHAS = 'cd04ad6e-0cd2-4838-b050-49fcfebafe05', CORRECOES = 'daadf852-a9fc-4676-9421-95e81b5c3d9e',
  MELHORIAS = 'a7ca79cf-1b3d-488c-9330-29bdfac737dd', PASTA_EDITORIAL = 'c97f6238-396c-4e26-9623-14c9274766d8';
const P = { luan: 'fe486b96-f26a-40b7-96c3-ffa621b2fe64', yghor: '9a31fb28-69ea-4d98-a47c-c92437bdc763',
  gabriel: 'de5678d3-5b5e-4823-bc44-6d44a23ad830', arthur: 'a412cb58-8acd-48cb-b4d3-3ab1ebeb4af7', madu: 'fd1c84c0-b605-46b7-a83d-fe6cc5abb3b2' };
/* lista (ou pasta) + responsável -> nome do grupo no WhatsApp */
const ROTAS: { listas?: string[]; pasta?: string; pessoas: string[]; grupo: string; semConclusao?: boolean }[] = [
  { listas: [CAMPANHAS], pessoas: [P.luan], grupo: 'SQUAD1' },
  { listas: [CAMPANHAS], pessoas: [P.yghor], grupo: 'SQUAD 2 - COMUNICAÇÃO' },
  { listas: [CORRECOES, MELHORIAS], pessoas: [P.gabriel, P.arthur], grupo: 'Automação - Síntese' },
  /* Madu: o grupo do editorial é avisado quando o vídeo vai pra "EM REVISÃO (INTERNO)" (trigger
     trg_wa_aviso_revisao_editorial, sessão [03]), NÃO na conclusão. Aqui fica só o Notificar responsável. */
  { pasta: PASTA_EDITORIAL, pessoas: [P.madu], grupo: 'SÍNTESE - EDITORIAL (5.0)', semConclusao: true },
  /* gestores de tráfego também são cobrados na Linha Editorial, no grupo do squad (Gabriel 23/09) */
  { pasta: PASTA_EDITORIAL, pessoas: [P.luan], grupo: 'SQUAD1' },
  { pasta: PASTA_EDITORIAL, pessoas: [P.yghor], grupo: 'SQUAD 2 - COMUNICAÇÃO' },
];
const chaveGrupo = (s: string) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

async function rest(path: string) { const r = await fetch(`${SU}/rest/v1/${path}`, { headers: H }); return r.ok ? await r.json() : []; }
async function quem(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const r = await fetch(`${SU}/auth/v1/user`, { headers: { authorization: auth, apikey: SRK } });
  if (!r.ok) return null;
  const u = await r.json(); if (!u?.id) return null;
  const p = (await rest(`perfis?id=eq.${u.id}&select=id,nome,role,gerente,aprovado,squads`))[0];
  if (!p || !p.aprovado) return null;
  return p;
}
async function segredos() {
  const m: Record<string, string> = {};
  for (const x of await rest('segredos?or=(chave.eq.uazapi_url,chave.like.lembrete_*)&select=chave,valor')) m[x.chave] = x.valor;
  return m;
}
async function uaz(url: string, token: string, path: string, method = 'GET', body?: unknown) {
  const r = await fetch(url + path, { method, headers: { token, 'Content-Type': 'application/json', Accept: 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j: any = {}; try { j = JSON.parse(t); } catch { j = { bruto: t.slice(0, 300) }; }
  return { ok: r.ok, status: r.status, j };
}
const digitos = (s: unknown) => { let d = String(s ?? '').replace(/\D/g, ''); if (d && d.length <= 11) d = '55' + d; return d; };
/* hoje e horários no fuso de São Paulo */
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const dataBR = (iso: string) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
function situacao(prazo: string | null, feita: boolean) {
  if (feita) return 'concluída';
  if (!prazo) return 'sem prazo';
  const n = Math.round((Date.parse(prazo + 'T12:00:00Z') - Date.parse(hojeSP() + 'T12:00:00Z')) / 864e5);
  if (n === 0) return 'vence hoje';
  if (n === 1) return 'vence amanhã';
  if (n > 1) return `vence em ${n} dias`;
  return n === -1 ? 'atrasada 1 dia' : `atrasada ${-n} dias`;
}

const horaSP = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)).replace(', ', ' às ');
async function gruposDoNumero(url: string, token: string) {
  const g = await uaz(url, token, '/group/list?force=false&noparticipants=true').catch(() => ({ ok: false, j: {} as any }));
  const arr: any[] = Array.isArray(g.j) ? g.j : (g.j?.groups || []);
  const m: Record<string, string> = {}; for (const x of arr) { const jid = x.JID || x.jid || x.id; const nm = x.Name || x.name || x.subject || ''; if (jid && nm) m[chaveGrupo(nm)] = jid; }
  return m;
}

/* ---------- número que dispara (Gabriel 23/09: "disparo é sempre do número do gerente que criou") ----------
   1º o número do gerente que criou a tarefa (lembrete_inst_<primeiro nome>); 2º, se quem criou não
   é gerente com número, o do squad da tarefa/ficha (lembrete_squad_numero: 01 = Luiz 11 91504-7150,
   02 = João 11 92174-2778); 3º o outro gerente, e o app recebe aviso de que saiu pelo número errado. */
async function squadDa(t: any) {
  let sq = String(t.squad || '').trim();
  if (!sq && t.ficha_id) {
    const r = await fetch(`${SU}/rest/v1/rpc/squad_da_ficha`, { method: 'POST', headers: H, body: JSON.stringify({ fid: String(t.ficha_id) }) });
    if (r.ok) sq = String((await r.json()) || '').trim();
  }
  return sq;
}
function numeroDoSquad(S: Record<string, string>, sq: string) {
  try { return String((JSON.parse(S.lembrete_squad_numero || '{}') as Record<string, string>)[sq] || ''); } catch { return ''; }
}
/* ordem de tentativa: o preferido (gerente que criou, ou o do squad), depois a reserva, depois o resto */
const ordemPor = (nomes: string[], pref: string, reserva: string) =>
  [...nomes].sort((x, y) => (x === pref ? 0 : x === reserva ? 1 : 2) - (y === pref ? 0 : y === reserva ? 1 : 2));
/* o número que deveria disparar: o do gerente que criou, se ele tiver número; senão o do squad */
const numeroQueDispara = (nomes: string[], criador: string, doSquad: string) => (criador && nomes.includes(criador)) ? criador : doSquad;
const avisoNumero = (pref: string, por: string, grupo: string) =>
  (pref && por && por !== pref) ? `"${grupo}" saiu pelo número de ${por}: o número de ${pref} não está no grupo` : '';

/* ---------- conclusão com relatório ----------
   Chamada pelo app logo depois de gravar a conclusão. Manda uma vez por conclusão: se já existe
   aviso de conclusão ok depois do concluida_em, não repete. */
async function concluida(b: any, user: any, chefe: boolean, S: Record<string, string>, url: string, inst: (n: string) => string, nomes: string[]) {
  const tid = String(b.tarefa_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(tid)) return J({ ok: false, erro: 'tarefa' }, 400);
  const t = (await rest(`tarefas?id=eq.${tid}&select=id,titulo,prioridade,status,lista_id,ficha_id,squad,responsavel_id,responsaveis,criado_por,concluida_em,concluida_por,conclusao_texto`))[0];
  if (!t) return J({ ok: false, erro: 'Tarefa não encontrada.' }, 404);
  if (t.status !== 'feito' || !String(t.conclusao_texto || '').trim()) return J({ ok: false, erro: 'A tarefa não está concluída com relatório.' }, 409);
  const ids: string[] = (t.responsaveis && t.responsaveis.length) ? t.responsaveis : (t.responsavel_id ? [t.responsavel_id] : []);
  if (!chefe && !ids.includes(user.id) && t.concluida_por !== user.id) return J({ ok: false, erro: 'Só quem é da tarefa avisa a conclusão.' }, 403);
  if (t.concluida_em) {
    const ja = await rest(`tarefa_lembretes?tarefa_id=eq.${tid}&tipo=eq.conclusao&ok=eq.true&enviado_em=gte.${encodeURIComponent(t.concluida_em)}&select=id&limit=1`);
    if (ja.length) return J({ ok: true, enviados: [], ja: true });
  }
  const lista = (await rest(`listas?id=eq.${t.lista_id}&select=nome,pasta_id`))[0] || {};
  const rotas = ROTAS.filter((r) => !r.semConclusao && ((r.listas && r.listas.includes(t.lista_id)) || (r.pasta && r.pasta === lista.pasta_id)));
  if (!rotas.length) return J({ ok: false, erro: 'sem grupo pra essa lista' }, 409);
  const pessoas: any[] = ids.length ? await rest(`perfis?id=in.(${ids.join(',')})&select=id,nome,telefone`) : [];
  const ger = t.criado_por ? (await rest(`perfis?id=eq.${t.criado_por}&select=id,nome,telefone`))[0] : null;
  const porGrupo: Record<string, any[]> = {};
  for (const p of pessoas) { const r = rotas.find((x) => x.pessoas.includes(p.id)); if (r) (porGrupo[r.grupo] = porGrupo[r.grupo] || []).push(p); }
  if (!Object.keys(porGrupo).length) return J({ ok: false, erro: 'sem grupo pra esse responsável' }, 409);
  /* manda pelo número do gerente que criou (o @ também é ele); sem número, o do squad */
  const dono = chaveGrupo(String(ger?.nome || '').split(' ')[0]);
  const sq = await squadDa(t), pref = numeroQueDispara(nomes, dono, numeroDoSquad(S, sq));
  const ordem = ordemPor(nomes, pref, numeroDoSquad(S, sq));
  const cache: Record<string, Record<string, string>> = {};
  const enviados: any[] = [], erros: string[] = [];
  for (const nomeGrupo of Object.keys(porGrupo)) {
    const k = chaveGrupo(nomeGrupo); let jid = '', por = '';
    for (const n of ordem) { cache[n] = cache[n] || await gruposDoNumero(url, inst(n)); if (cache[n][k]) { jid = cache[n][k]; por = n; break; } }
    if (!jid) { erros.push(`nenhum WhatsApp de gerente está no grupo "${nomeGrupo}"`); continue; }
    const quem = porGrupo[nomeGrupo];
    const gerTel = ger ? digitos(ger.telefone) : '';
    const payload = {
      tarefa: t.titulo || '(sem título)',
      responsaveis: quem.map((p) => ({ nome: p.nome, telefone: digitos(p.telefone) || null })),
      o_que_foi_feito: String(t.conclusao_texto).trim(),
      concluida_em: t.concluida_em ? horaSP(t.concluida_em) : null,
      link: APP + '#t/' + t.id,
      flag: PRIO[t.prioridade] || 'Normal',
      gerente: ger ? { nome: ger.nome, telefone: gerTel || null } : null,
      grupo: nomeGrupo,
    };
    const texto = [
      `✅ *Demanda concluída*`, ``,
      `*${payload.responsaveis.map((p) => p.nome).join(', ')}* matou a demanda:`, ``,
      `*Tarefa:* ${payload.tarefa}`,
      `*O que foi feito:* ${payload.o_que_foi_feito}`,
      `*Concluída em:* ${payload.concluida_em || 'agora'}`,
      `*Flag:* ${payload.flag}`,
      `*Gerente:* ${ger ? (gerTel ? '@' + gerTel : ger.nome) : 'não informado'}`,
      `*Link:* ${payload.link}`,
    ].join('\n');
    const r = await uaz(url, inst(por), '/send/text', 'POST',
      { number: jid, text: texto, linkPreview: false, ...(gerTel ? { mentions: gerTel } : {}), track_source: 'sistema-autosintese', track_id: 'conclusao:' + t.id });
    const erro = r.ok ? null : String(r.j?.error || r.j?.message || ('uazapi ' + r.status));
    await fetch(`${SU}/rest/v1/tarefa_lembretes`, { method: 'POST', headers: H,
      body: JSON.stringify({ tarefa_id: t.id, enviado_por: user.id, instancia: por, grupo: nomeGrupo, ok: r.ok, erro, payload, tipo: 'conclusao' }) });
    if (r.ok) { enviados.push({ grupo: nomeGrupo, por, payload }); const a = avisoNumero(pref, por, nomeGrupo); if (a) erros.push(a); }
    else erros.push(`"${nomeGrupo}": ${erro}`);
  }
  if (!enviados.length) return J({ ok: false, erro: erros.join('; ') || 'não enviou' }, 502);
  return J({ ok: true, enviados, avisos: erros });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const acao = new URL(req.url).pathname.split('/').filter(Boolean).pop() || '';
  const user = await quem(req);
  if (!user) return J({ ok: false, erro: 'Faça login no sistema.' }, 401);
  const chefe = user.role === 'master' || !!user.gerente;
  let b: any = {}; try { b = await req.json(); } catch { b = {}; }
  const S = await segredos();
  const url = String(S.uazapi_url || '').replace(/\/+$/, '');
  if (!url) return J({ ok: false, erro: 'UAZAPI não configurada.' }, 500);
  const inst = (nome: string) => S['lembrete_inst_' + nome] || '';
  const nomes = Object.keys(S).filter((k) => k.startsWith('lembrete_inst_') && S[k]).map((k) => k.slice('lembrete_inst_'.length));

  if (acao !== 'concluida' && !chefe) return J({ ok: false, erro: 'Só gerente ou master pode notificar o responsável.' }, 403);
  if (acao === 'status') {
    const L = await Promise.all(nomes.map(async (n) => {
      const st = await uaz(url, inst(n), '/instance/status').catch(() => ({ ok: false, j: {} as any }));
      return { name: n, conectado: !!st.j?.status?.loggedIn, perfil: st.j?.instance?.profileName || null };
    }));
    return J({ ok: true, instancias: L });
  }
  if (acao === 'conectar') {
    const n = String(b.name || ''); const tk = inst(n);
    if (!tk) return J({ ok: false, erro: 'número de lembrete não cadastrado: ' + n }, 404);
    const st = await uaz(url, tk, '/instance/status');
    if (st.j?.status?.loggedIn) return J({ ok: true, conectado: true });
    const c = await uaz(url, tk, '/instance/connect', 'POST', {});
    const qr = c.j?.instance?.qrcode || c.j?.qrcode || '';
    return J({ ok: !!qr, conectado: false, qr: qr ? (qr.startsWith('data:') ? qr : 'data:image/png;base64,' + qr) : null, erro: qr ? undefined : (c.j?.error || 'sem QR') });
  }
  if (acao === 'concluida') return concluida(b, user, chefe, S, url, inst, nomes);
  if (acao !== 'enviar') return J({ ok: false, erro: 'ação desconhecida' }, 404);

  /* ---------- enviar ---------- */
  const tid = String(b.tarefa_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(tid)) return J({ ok: false, erro: 'tarefa' }, 400);
  const t = (await rest(`tarefas?id=eq.${tid}&select=id,titulo,prazo,hora,prioridade,status,squad,ficha_id,lista_id,responsavel_id,responsaveis,criado_por`))[0];
  if (!t) return J({ ok: false, erro: 'Tarefa não encontrada.' }, 404);
  if (t.status === 'feito') return J({ ok: false, erro: 'Essa tarefa já está concluída: não tem o que lembrar.' }, 409);
  const lista = (await rest(`listas?id=eq.${t.lista_id}&select=nome,pasta_id`))[0] || {};
  const rotas = ROTAS.filter((r) => (r.listas && r.listas.includes(t.lista_id)) || (r.pasta && r.pasta === lista.pasta_id));
  if (!rotas.length) return J({ ok: false, erro: 'Essa lista não tem grupo de lembrete configurado.' }, 409);
  const desde = new Date(Date.now() - ESPERA_MIN * 60000).toISOString();
  const rec = await rest(`tarefa_lembretes?tarefa_id=eq.${tid}&tipo=eq.lembrete&ok=eq.true&enviado_em=gte.${encodeURIComponent(desde)}&select=enviado_em&limit=1`);
  if (rec.length) return J({ ok: false, erro: `Essa tarefa já foi lembrada nos últimos ${ESPERA_MIN} minutos.` }, 429);

  const ids: string[] = (t.responsaveis && t.responsaveis.length) ? t.responsaveis : (t.responsavel_id ? [t.responsavel_id] : []);
  if (!ids.length) return J({ ok: false, erro: 'A tarefa não tem responsável.' }, 400);
  const pessoas: any[] = await rest(`perfis?id=in.(${ids.join(',')})&select=id,nome,telefone`);
  /* agrupa os responsáveis pelo grupo de destino */
  const porGrupo: Record<string, any[]> = {}; const semGrupo: string[] = [];
  for (const p of pessoas) { const r = rotas.find((x) => x.pessoas.includes(p.id));
    if (r) (porGrupo[r.grupo] = porGrupo[r.grupo] || []).push(p); else semGrupo.push(p.nome); }
  if (!Object.keys(porGrupo).length)
    return J({ ok: false, erro: `Não há grupo de lembrete pra ${semGrupo.join(', ')} em ${lista.nome || 'esta lista'}.` }, 409);

  /* quem manda: o número do gerente que criou a tarefa; sem número, o do squad; reserva = quem clicou.
     Grupos de cada número vêm da UAZAPI uma vez por pedido; o JID achado fica em lembrete_jid_<grupo>. */
  const eu = chaveGrupo(String(user.nome || '').split(' ')[0]);
  const criador = t.criado_por ? chaveGrupo(String(((await rest(`perfis?id=eq.${t.criado_por}&select=nome`))[0] || {}).nome || '').split(' ')[0]) : '';
  const sq = await squadDa(t), pref = numeroQueDispara(nomes, criador, numeroDoSquad(S, sq));
  const ordem = ordemPor(nomes, pref, eu);
  const gruposDe: Record<string, Record<string, string>> = {};
  async function grupos(n: string) {
    if (gruposDe[n]) return gruposDe[n];
    const g = await uaz(url, inst(n), '/group/list?force=false&noparticipants=true').catch(() => ({ ok: false, j: {} as any }));
    const arr: any[] = Array.isArray(g.j) ? g.j : (g.j?.groups || []);
    const m: Record<string, string> = {}; for (const x of arr) { const jid = x.JID || x.jid || x.id; const nm = x.Name || x.name || x.subject || ''; if (jid && nm) m[chaveGrupo(nm)] = jid; }
    return (gruposDe[n] = m);
  }
  const enviados: any[] = [], erros: string[] = [];
  for (const nomeGrupo of Object.keys(porGrupo)) {
    const k = chaveGrupo(nomeGrupo);
    let jid = '', por = '';
    for (const n of ordem) { const m = await grupos(n); if (m[k]) { jid = m[k]; por = n; break; } }
    if (!jid) { erros.push(`nenhum WhatsApp de gerente está no grupo "${nomeGrupo}"`); continue; }
    fetch(`${SU}/rest/v1/segredos`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ chave: 'lembrete_jid_' + k, valor: jid, descricao: 'JID do grupo ' + nomeGrupo + ' (achado pelo nome)', atualizado_em: new Date().toISOString() }) }).catch(() => {});
    const quem = porGrupo[nomeGrupo];
    const payload = {
      tarefa: t.titulo || '(sem título)',
      responsaveis: quem.map((p) => ({ nome: p.nome, telefone: digitos(p.telefone) || null })),
      prazo: situacao(t.prazo, t.status === 'feito'),
      data_prazo: t.prazo ? dataBR(t.prazo) : null,
      horario_prazo: t.hora ? String(t.hora).slice(0, 5) : null,
      link: APP + '#t/' + t.id,
      flag: PRIO[t.prioridade] || 'Normal',
      grupo: nomeGrupo,
      enviado_por: user.nome,
    };
    const marca = payload.responsaveis.map((p) => p.telefone ? '@' + p.telefone : '*' + p.nome + '*').join(' ');
    const texto = [
      `🔔 *Lembrete de tarefa*`, ``,
      `${marca}, lembrete da tarefa abaixo:`, ``,
      `*Tarefa:* ${payload.tarefa}`,
      `*Prazo:* ${payload.prazo}`,
      `*Data:* ${payload.data_prazo || 'sem data'}`,
      `*Horário:* ${payload.horario_prazo || 'sem horário'}`,
      `*Flag:* ${payload.flag}`,
      `*Link:* ${payload.link}`, ``,
      `_Enviado por ${user.nome} pelo sistema AutoSíntese_`,
    ].join('\n');
    const mencoes = payload.responsaveis.map((p) => p.telefone).filter(Boolean).join(',');
    const r = await uaz(url, inst(por), '/send/text', 'POST',
      { number: jid, text: texto, linkPreview: false, ...(mencoes ? { mentions: mencoes } : {}), track_source: 'sistema-autosintese', track_id: 'lembrete:' + t.id });
    const erro = r.ok ? null : String(r.j?.error || r.j?.message || ('uazapi ' + r.status));
    await fetch(`${SU}/rest/v1/tarefa_lembretes`, { method: 'POST', headers: H,
      body: JSON.stringify({ tarefa_id: t.id, enviado_por: user.id, instancia: por, grupo: nomeGrupo, ok: r.ok, erro, payload }) });
    if (r.ok) { enviados.push({ grupo: nomeGrupo, por, payload }); const a = avisoNumero(pref, por, nomeGrupo); if (a) erros.push(a); }
    else erros.push(`"${nomeGrupo}": ${erro}`);
  }
  if (!enviados.length) return J({ ok: false, erro: 'Não enviou: ' + erros.join('; ') }, 502);
  return J({ ok: true, enviados, avisos: erros.concat(semGrupo.length ? [`sem grupo pra ${semGrupo.join(', ')}`] : []) });
});
