// lembrete-tarefa — botão "Notificar responsável" da tarefa (Gabriel 23/09/2026).
// Só gerente (perfis.gerente) ou master. A mensagem é montada AQUI a partir da tarefa no banco
// (o app só manda o id), e sai no grupo da empresa pelo WhatsApp do gerente do squad da tarefa.
//
// Configuração em public.segredos:
//   uazapi_url                 servidor UAZAPI (o mesmo do CRM)
//   lembrete_inst_<nome>       token da instância do gerente (ex.: lembrete_inst_luiz)
//   lembrete_sq<squad>         qual instância manda os lembretes do squad (lembrete_sq01 = luiz)
//   lembrete_grupo             JID do grupo da empresa (xxxx@g.us)
// Não usa o prefixo uazapi_inst_ de propósito: esses números são pessoais dos gerentes e não podem
// entrar na busca de conversas de lead nem no rodízio da landing.
//
//  POST /enviar   {tarefa_id}      manda o lembrete e devolve o payload
//  POST /status   {}               instâncias de lembrete + conectado? + grupo configurado
//  POST /conectar {name}           QR pra conectar o número do gerente
//  POST /grupos   {name}           grupos em que esse número está (pra escolher o da empresa)
//  POST /definir_grupo {jid,nome}  grava o grupo da empresa (lembrete_grupo)
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const SU = Deno.env.get('SUPABASE_URL') ?? '', SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const H = { apikey: SRK, Authorization: 'Bearer ' + SRK, 'Content-Type': 'application/json' };
const APP = 'https://autosintese.app.br/';
const PRIO: Record<string, string> = { urgente: 'Urgente', alta: 'Alta', med: 'Normal', baixa: 'Baixa' };
const ESPERA_MIN = 10;   // a mesma tarefa só é lembrada de novo depois disso

async function rest(path: string) { const r = await fetch(`${SU}/rest/v1/${path}`, { headers: H }); return r.ok ? await r.json() : []; }
async function quem(req: Request) {
  const auth = req.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const r = await fetch(`${SU}/auth/v1/user`, { headers: { authorization: auth, apikey: SRK } });
  if (!r.ok) return null;
  const u = await r.json(); if (!u?.id) return null;
  const p = (await rest(`perfis?id=eq.${u.id}&select=id,nome,role,gerente,aprovado,squads`))[0];
  if (!p || !p.aprovado || !(p.role === 'master' || p.gerente)) return null;
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const acao = new URL(req.url).pathname.split('/').filter(Boolean).pop() || '';
  const user = await quem(req);
  if (!user) return J({ ok: false, erro: 'Só gerente ou master pode notificar o responsável.' }, 403);
  let b: any = {}; try { b = await req.json(); } catch { b = {}; }
  const S = await segredos();
  const url = String(S.uazapi_url || '').replace(/\/+$/, '');
  if (!url) return J({ ok: false, erro: 'UAZAPI não configurada.' }, 500);
  const inst = (nome: string) => S['lembrete_inst_' + nome] || '';
  const nomes = Object.keys(S).filter((k) => k.startsWith('lembrete_inst_') && S[k]).map((k) => k.slice('lembrete_inst_'.length));

  if (acao === 'status') {
    const L = await Promise.all(nomes.map(async (n) => {
      const st = await uaz(url, inst(n), '/instance/status').catch(() => ({ ok: false, j: {} as any }));
      return { name: n, conectado: !!st.j?.status?.loggedIn, perfil: st.j?.instance?.profileName || null,
        squads: Object.keys(S).filter((k) => /^lembrete_sq/.test(k) && S[k] === n).map((k) => k.slice('lembrete_sq'.length)) };
    }));
    return J({ ok: true, instancias: L, grupo: S.lembrete_grupo || null });
  }
  if (acao === 'conectar' || acao === 'grupos') {
    const n = String(b.name || ''); const tk = inst(n);
    if (!tk) return J({ ok: false, erro: 'número de lembrete não cadastrado: ' + n }, 404);
    if (acao === 'conectar') {
      const st = await uaz(url, tk, '/instance/status');
      if (st.j?.status?.loggedIn) return J({ ok: true, conectado: true });
      const c = await uaz(url, tk, '/instance/connect', 'POST', {});
      const qr = c.j?.instance?.qrcode || c.j?.qrcode || '';
      return J({ ok: !!qr, conectado: false, qr: qr ? (qr.startsWith('data:') ? qr : 'data:image/png;base64,' + qr) : null, erro: qr ? undefined : (c.j?.error || 'sem QR') });
    }
    const g = await uaz(url, tk, '/group/list?force=false&noparticipants=true');
    const arr: any[] = Array.isArray(g.j) ? g.j : (g.j?.groups || []);
    return J({ ok: g.ok, grupos: arr.map((x: any) => ({ jid: x.JID || x.jid || x.id, nome: x.Name || x.name || x.subject || '' })).filter((x) => x.jid), erro: g.ok ? undefined : (g.j?.error || g.status) });
  }
  if (acao === 'definir_grupo') {
    const jid = String(b.jid || '');
    if (!/@g\.us$/.test(jid)) return J({ ok: false, erro: 'grupo inválido' }, 400);
    const r = await fetch(`${SU}/rest/v1/segredos`, { method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ chave: 'lembrete_grupo', valor: jid, descricao: 'Grupo da empresa pros lembretes de tarefa: ' + String(b.nome || '').slice(0, 80) + ' (escolhido no app por ' + user.nome + ')', atualizado_em: new Date().toISOString() }) });
    return J({ ok: r.ok, erro: r.ok ? undefined : 'não salvou' });
  }
  if (acao !== 'enviar') return J({ ok: false, erro: 'ação desconhecida' }, 404);

  /* ---------- enviar ---------- */
  const tid = String(b.tarefa_id || '');
  if (!/^[0-9a-f-]{36}$/i.test(tid)) return J({ ok: false, erro: 'tarefa' }, 400);
  const t = (await rest(`tarefas?id=eq.${tid}&select=id,titulo,prazo,hora,prioridade,status,squad,responsavel_id,responsaveis,arquivada_em`))[0];
  if (!t) return J({ ok: false, erro: 'Tarefa não encontrada.' }, 404);
  if (user.role !== 'master' && t.squad && !(user.squads || []).includes(t.squad))
    return J({ ok: false, erro: `Essa tarefa é do squad ${t.squad}: quem lembra é o gerente dele.` }, 403);
  const desde = new Date(Date.now() - ESPERA_MIN * 60000).toISOString();
  const rec = await rest(`tarefa_lembretes?tarefa_id=eq.${tid}&ok=eq.true&enviado_em=gte.${encodeURIComponent(desde)}&select=enviado_em&limit=1`);
  if (rec.length) return J({ ok: false, erro: `Essa tarefa já foi lembrada nos últimos ${ESPERA_MIN} minutos.` }, 429);

  const ids: string[] = (t.responsaveis && t.responsaveis.length) ? t.responsaveis : (t.responsavel_id ? [t.responsavel_id] : []);
  const pessoas: any[] = ids.length ? await rest(`perfis?id=in.(${ids.join(',')})&select=id,nome,telefone`) : [];
  if (!pessoas.length) return J({ ok: false, erro: 'A tarefa não tem responsável.' }, 400);
  const squad = t.squad || (user.squads || [])[0] || '';
  const nomeInst = S['lembrete_sq' + squad] || '';
  const grupo = S.lembrete_grupo || '';
  if (!nomeInst || !inst(nomeInst)) return J({ ok: false, erro: `O WhatsApp do gerente do squad ${squad || '(sem squad)'} ainda não está ligado ao sistema.` }, 409);
  if (!grupo) return J({ ok: false, erro: 'O grupo da empresa ainda não foi escolhido.' }, 409);

  const payload = {
    tarefa: t.titulo || '(sem título)',
    responsaveis: pessoas.map((p) => ({ nome: p.nome, telefone: digitos(p.telefone) || null })),
    prazo: situacao(t.prazo, t.status === 'feito'),
    data_prazo: t.prazo ? dataBR(t.prazo) : null,
    horario_prazo: t.hora ? String(t.hora).slice(0, 5) : null,
    link: APP + '#t/' + t.id,
    flag: PRIO[t.prioridade] || 'Normal',
    squad: squad || null,
    enviado_por: user.nome,
  };
  const marca = payload.responsaveis.map((p) => p.telefone ? '@' + p.telefone : '*' + p.nome + '*').join(' ');
  const texto = [
    `🔔 *Lembrete de tarefa*`,
    ``,
    `${marca}, lembrete da tarefa abaixo:`,
    ``,
    `*Tarefa:* ${payload.tarefa}`,
    `*Prazo:* ${payload.prazo}`,
    `*Data:* ${payload.data_prazo || 'sem data'}`,
    `*Horário:* ${payload.horario_prazo || 'sem horário'}`,
    `*Flag:* ${payload.flag}`,
    `*Link:* ${payload.link}`,
    ``,
    `_Enviado por ${user.nome} pelo sistema AutoSíntese_`,
  ].join('\n');
  const mencoes = payload.responsaveis.map((p) => p.telefone).filter(Boolean).join(',');
  const r = await uaz(url, inst(nomeInst), '/send/text', 'POST',
    { number: grupo, text: texto, linkPreview: false, ...(mencoes ? { mentions: mencoes } : {}), track_source: 'sistema-autosintese', track_id: 'lembrete:' + t.id });
  const erro = r.ok ? null : String(r.j?.error || r.j?.message || ('uazapi ' + r.status));
  await fetch(`${SU}/rest/v1/tarefa_lembretes`, { method: 'POST', headers: H,
    body: JSON.stringify({ tarefa_id: t.id, enviado_por: user.id, instancia: nomeInst, grupo, ok: r.ok, erro, payload }) });
  if (!r.ok) return J({ ok: false, erro: 'O WhatsApp não enviou: ' + erro + (r.status === 401 ? ' (o número do gerente está desconectado)' : '') }, 502);
  return J({ ok: true, payload, por: nomeInst });
});
