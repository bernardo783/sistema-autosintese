/* Fechamento de contrato — SÓ José Carlos e Bernardo (Gabriel 23/09/2026: "pra ninguém, só pro
   josé carlos e bernardo"). Exceção: a "+ Nova conta deste cliente" da ficha (contaAdicional) usa
   esta mesma função e segue liberada pra master e gerente — é conta nova de cliente que já existe.
   Valida o payload e cria, numa transacao no banco (rpc fechamento_criar):
   cliente + ficha de projeto + cobranca da 1a parcela (+ receita no financeiro se ja pago).

   ago/2026: o formulario passa a mandar o SQUAD, e o gerente e o gestor saem do banco
   (perfis.cargo + perfis.squads).

   31/08/2026 (Gabriel):
   - ORIGEM do lead (inbound | outbound | indicacao) entra no payload e vai pra ficha.
   - CORRECAO: 'sinal' era recusado aqui, embora o banco ja soubesse tratar entrada + restante.
   - PAGAMENTO INTEGRAL: projeto pago a vista, SEM mensalidade.
   - ASAAS: fechamento enviado cria o cliente e a cobranca recorrente no Asaas sozinho.
     Regras que valem dinheiro:
       * NUNCA cobra o que ja foi recebido. 'pago' e 'sinal' -> a assinatura comeca no
         mes SEGUINTE (e conta uma cobranca a menos no prazo); 'integral' -> nenhuma cobranca.
       * PRAZO: 'fimContrato' (data da ultima mensalidade) vira maxPayments — numero exato
         de cobrancas. Sem fimContrato, a assinatura renova ate o churn (contrato Mensal).
       * Falha no Asaas NAO derruba o fechamento. O cliente nasce do mesmo jeito e o
         erro fica gravado em cliente.asaas.erro pra alguem resolver na mao.
       * Ambiente sai do prefixo da chave ($aact_hmlg_ = sandbox, $aact_prod_ = producao).
       * O Asaas nao tem idempotencia: antes de criar, procuramos o cliente por
         externalReference (o id do nosso cliente) e por CPF/CNPJ. */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const JSONH = { ...CORS, 'Content-Type': 'application/json' };
const ok = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: JSONH });
const erro = (m: string, s = 400) => ok({ ok: false, erro: m }, s);

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SRK = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SVC = { apikey: SRK, Authorization: 'Bearer ' + SRK, 'Content-Type': 'application/json' };

// Quem pode fazer fechamento de contrato (Gabriel 23/09/2026): José Carlos e Bernardo.
const PODE_FECHAR = ['ded3cac7-7462-4f76-9680-3af961b25344', '6b3b1d5d-2ee0-4529-a6c4-23d415678bff'];

// Compatibilidade com quem ainda manda 'gerente' em vez de 'squad'
const GERENTE_PARA_SQUAD: Record<string, string> = { luiz: '01', joao: '02' };

// Origem do lead: chave curta no banco, rotulo legivel pra tela.
const ORIGENS: Record<string, string> = {
  inbound: 'Inbound',
  outbound: 'Outbound',
  indicacao: 'Indicação',
};
const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const soDig = (s: string) => String(s || '').replace(/\D/g, '');
const hojeISO = () => new Date().toISOString().slice(0, 10);

/* ======================= ASAAS ======================= */
const ASAAS_KEY = (Deno.env.get('ASAAS_API_KEY') || '').trim();

function asaasBase(): string {
  const forc = semAcento(Deno.env.get('ASAAS_AMBIENTE') || '');
  if (forc === 'producao' || forc === 'production' || forc === 'prod') return 'https://api.asaas.com/v3';
  if (forc === 'sandbox' || forc === 'homologacao') return 'https://api-sandbox.asaas.com/v3';
  // sem override: o prefixo da propria chave decide. Chave de prod em sandbox (e vice-versa) da 401.
  return ASAAS_KEY.includes('_prod_') ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3';
}
const asaasAmbiente = () => (asaasBase().includes('sandbox') ? 'sandbox' : 'producao');

async function asaasFetch(caminho: string, init?: RequestInit) {
  // ATENCAO: GET no Asaas nao pode ter body — o CDN devolve 403.
  const r = await fetch(asaasBase() + caminho, {
    ...(init || {}),
    headers: {
      'Content-Type': 'application/json',
      // User-Agent e obrigatorio pra contas criadas depois de 13/06/2024
      'User-Agent': 'SistemaAutoSintese/1.0 (Deno; ' + asaasAmbiente() + ')',
      access_token: ASAAS_KEY,
      ...((init && (init.headers as Record<string, string>)) || {}),
    },
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const e = j && Array.isArray(j.errors) && j.errors[0];
    throw new Error((e && (e.description || e.code)) || ('Asaas HTTP ' + r.status));
  }
  return j;
}

// soma meses preservando o dia (31/01 + 1 mes = 28/02)
function addMes(iso: string, n: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const base = new Date(Date.UTC(a, m - 1 + n, 1));
  const ultimo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, ultimo));
  return base.toISOString().slice(0, 10);
}
// meses cheios entre duas datas YYYY-MM-DD (so ano/mes importam pro prazo)
function mesesEntre(a: string, b: string): number {
  if (!a || !b) return 0;
  const [a1, m1] = a.split('-').map(Number);
  const [a2, m2] = b.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1);
}
// Cartao de credito nao da pra cobrar pela API sem os dados do cartao:
// UNDEFINED deixa o cliente escolher na fatura, entre os meios habilitados na conta.
function tipoCobranca(forma: string): string {
  const f = semAcento(forma);
  if (f.includes('pix')) return 'PIX';
  if (f.includes('boleto')) return 'BOLETO';
  return 'UNDEFINED';
}

type AsaasIn = {
  cid: string; nome: string; cnpj: string; cpf: string; email: string; telefone: string;
  endereco: string; valor: number; dataPagamento: string; formaPagamento: string;
  statusPagamento: string; sinalValor: number; fimContrato: string;
};

async function asaasCriar(o: AsaasIn): Promise<Record<string, unknown>> {
  if (!ASAAS_KEY) return { ok: false, erro: 'ASAAS_API_KEY não está configurada nos secrets do Supabase.' };
  const doc = soDig(o.cnpj) || soDig(o.cpf);
  if (!doc) return { ok: false, erro: 'Sem CNPJ nem CPF no fechamento — o Asaas exige um dos dois.' };

  const res: Record<string, unknown> = {
    ok: true, ambiente: asaasAmbiente(), em: new Date().toISOString(),
  };

  // 1) cliente: procura antes de criar (o Asaas aceita duplicado sem reclamar)
  let customer = '';
  try {
    const q1 = await asaasFetch('/customers?limit=1&externalReference=' + encodeURIComponent(o.cid));
    if (q1 && Array.isArray(q1.data) && q1.data[0]) customer = String(q1.data[0].id || '');
    if (!customer) {
      const q2 = await asaasFetch('/customers?limit=1&cpfCnpj=' + doc);
      if (q2 && Array.isArray(q2.data) && q2.data[0]) customer = String(q2.data[0].id || '');
    }
  } catch (_) { /* consulta falhou: segue e tenta criar */ }

  if (customer) {
    res.clienteJaExistia = true;
  } else {
    const cep = soDig((o.endereco.match(/\b\d{5}-?\d{3}\b/) || [''])[0]);
    const c = await asaasFetch('/customers', {
      method: 'POST',
      body: JSON.stringify({
        name: o.nome,
        cpfCnpj: doc,
        email: o.email || undefined,
        mobilePhone: soDig(o.telefone) || undefined,
        address: o.endereco || undefined,
        postalCode: cep || undefined,
        externalReference: o.cid,
        observations: 'Criado pelo Fechamento de contrato do Sistema AutoSíntese.',
      }),
    });
    customer = String(c.id || '');
  }
  res.customerId = customer;
  if (!customer) { res.ok = false; res.erro = 'O Asaas não devolveu o id do cliente.'; return res; }

  const bt = tipoCobranca(o.formaPagamento);
  res.formaCobranca = bt;

  // 2) projeto pago a vista: nada a cobrar. O dinheiro ja entrou.
  if (o.statusPagamento === 'integral') {
    res.nota = 'Projeto pago à vista — nenhuma cobrança criada no Asaas.';
    return res;
  }

  // 3) sinal: o restante da entrada vira uma cobranca avulsa na data do acerto
  if (o.statusPagamento === 'sinal') {
    const restante = Math.round((o.valor - o.sinalValor) * 100) / 100;
    if (restante > 0) {
      const venc = o.dataPagamento < hojeISO() ? hojeISO() : o.dataPagamento;
      const p = await asaasFetch('/payments', {
        method: 'POST',
        body: JSON.stringify({
          customer, billingType: bt, value: restante, dueDate: venc,
          description: 'Restante da entrada — ' + o.nome,
          externalReference: o.cid + ':restante',
        }),
      });
      res.paymentId = p.id; res.invoiceUrl = p.invoiceUrl; res.restante = restante;
    }
  }

  // 4) mensalidade recorrente. 'pago' e 'sinal' ja acertaram o mes corrente fora do
  //    Asaas — a assinatura comeca no mes seguinte, senao cobra duas vezes.
  const jaAcertou = o.statusPagamento === 'pago' || o.statusPagamento === 'sinal';

  /* PRAZO: 'fimContrato' e a data da ULTIMA mensalidade. Viramos isso em
     maxPayments (numero exato de cobrancas) em vez de endDate, que e ambiguo
     quanto a cobrar ou nao no proprio dia. Sem fimContrato, a assinatura
     renova ate o churn — que e o caso do contrato Mensal. */
  const total = o.fimContrato ? Math.max(1, mesesEntre(o.dataPagamento, o.fimContrato) + 1) : 0;
  const cobrancas = total ? total - (jaAcertou ? 1 : 0) : 0;
  if (total && cobrancas <= 0) {
    res.nota = 'O contrato inteiro ja foi acertado fora do Asaas — nenhuma assinatura criada.';
    return res;
  }

  let primeira = jaAcertou ? addMes(o.dataPagamento, 1) : o.dataPagamento;
  if (primeira < hojeISO()) primeira = hojeISO();

  const corpo: Record<string, unknown> = {
    customer, billingType: bt, value: o.valor, nextDueDate: primeira, cycle: 'MONTHLY',
    description: 'Mensalidade — ' + o.nome,
    externalReference: o.cid,
  };
  if (cobrancas > 0) corpo.maxPayments = cobrancas;

  const s = await asaasFetch('/subscriptions', { method: 'POST', body: JSON.stringify(corpo) });
  res.subscriptionId = s.id;
  res.proximoVencimento = s.nextDueDate || primeira;
  if (cobrancas > 0) { res.cobrancas = cobrancas; res.fimContrato = o.fimContrato; }
  return res;
}

async function quemChama(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.toLowerCase().startsWith('bearer ')) return null;
  const r = await fetch(URL_ + '/auth/v1/user', { headers: { apikey: SRK, Authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json();
  if (!u?.id) return null;
  const p = await fetch(URL_ + '/rest/v1/perfis?id=eq.' + u.id + '&select=id,nome,aprovado,role,gerente', { headers: SVC });
  const rows = await p.json();
  const perfil = Array.isArray(rows) ? rows[0] : null;
  if (!perfil || !perfil.aprovado) return null;
  return { id: u.id as string, nome: String(perfil.nome || ''), master: perfil.role === 'master', gerente: !!perfil.gerente };
}

// mesmo criterio do banco (prim_nome): primeiro nome, sem acento, minusculo
const primNome = (t: string) => semAcento(String(t || '').trim()).split(/\s+/)[0] || '';
async function gerenteDaFicha(fid: string, nome: string): Promise<boolean> {
  const r = await fetch(URL_ + '/rest/v1/itens?modulo=eq.projetos&select=dados', { headers: SVC });
  const rows = (await r.json().catch(() => [])) as Array<{ dados: Array<Record<string, unknown>> }>;
  const f = (Array.isArray(rows) && rows[0] && Array.isArray(rows[0].dados) ? rows[0].dados : [])
    .find(x => String(x.id) === fid);
  const eu = primNome(nome);
  return !!(f && eu && primNome(String(f.gerente || '')) === eu);
}

// Quem toca o squad, direto do banco: o gerente e o gestor de trafego.
async function equipeDoSquad(squad: string) {
  const q = `${URL_}/rest/v1/perfis?select=id,nome,cargo,squads&aprovado=eq.true&squads=cs.{"${squad}"}`;
  const r = await fetch(q, { headers: SVC });
  const rows = (await r.json().catch(() => [])) as Array<{ id: string; nome: string; cargo: string }>;
  const acha = (c: string) => (Array.isArray(rows) ? rows : []).find(x => String(x.cargo || '') === c) || null;
  return { gerente: acha('gerente'), gestor: acha('gestor de trafego') };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return erro('metodo nao suportado', 405);

  const quem = await quemChama(req);
  if (!quem) return erro('Faça login para enviar um fechamento.', 403);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* vazio */ }
  const S = (k: string) => String(b[k] ?? '').trim();

  /* quem pode: José Carlos e Bernardo; conta adicional de cliente que já existe, master e gerente */
  const contaAdicional = S('contaAdicional') === 'sim';
  if (!PODE_FECHAR.includes(quem.id) && !(contaAdicional && (quem.master || quem.gerente)))
    return erro('Fechamento de contrato é só com o José Carlos ou o Bernardo.', 403);
  /* Novo contrato / upsell (Gabriel 23/09/2026): o gerente só mexe nos clientes DELE.
     A conta nasce a partir de uma ficha (origemFicha) cujo gerente tem que ser quem chama. */
  if (contaAdicional && !quem.master && !PODE_FECHAR.includes(quem.id)) {
    const fid = S('origemFicha');
    if (!fid) return erro('Abra o novo contrato a partir da ficha do cliente.', 403);
    if (!(await gerenteDaFicha(fid, quem.nome))) return erro('Só o gerente deste cliente cria contrato novo para ele.', 403);
  }

  const nome = S('nome');
  const plano = S('plano');
  let squad = S('squad');
  if (!squad) squad = GERENTE_PARA_SQUAD[S('gerente').toLowerCase()] || '';
  const valor = Number(String(b.valor ?? '').toString().replace(',', '.'));
  const dataPagamento = S('dataPagamento');
  const temTrafego = /tr[aá]fego/i.test(plano);
  const statusPagamento = S('statusPagamento');
  const ehSinal = statusPagamento === 'sinal';
  const ehIntegral = statusPagamento === 'integral';

  const origemBruta = semAcento(S('origem'));
  const origem = ORIGENS[origemBruta] ? origemBruta : '';
  if (origemBruta && !origem) return erro('Origem do lead inválida.');

  if (nome.length < 2) return erro('Informe o nome da empresa.');
  if (!plano) return erro('Selecione o plano.');
  if (!S('tipoContrato')) return erro('Selecione o tipo de contrato.');
  if (!(valor > 0)) return erro(ehIntegral ? 'Informe o valor do projeto.' : 'Informe a mensalidade.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataPagamento)) return erro(ehIntegral ? 'Informe a data do pagamento.' : 'Informe a data de pagamento da primeira parcela.');
  if (!S('formaPagamento')) return erro('Selecione a forma de pagamento.');
  if (!['pago', 'aguardando', 'sinal', 'integral'].includes(statusPagamento)) return erro('Selecione o status do pagamento.');
  if (!S('sdr')) return erro('Informe o SDR responsável.');
  if (!S('closer')) return erro('Informe o closer responsável.');
  if (!squad) return erro('Selecione o squad responsável.');
  if (!S('resumo')) return erro('Escreva o resumo operacional da venda.');

  const fimContrato = S('fimContrato');
  if (fimContrato && !/^\d{4}-\d{2}-\d{2}$/.test(fimContrato)) return erro('Data de fim do contrato inválida.');
  if (fimContrato && fimContrato < dataPagamento) return erro('O fim do contrato não pode ser antes da 1ª parcela.');

  const sinalValor = ehSinal ? Number(String(b.sinalValor ?? '').toString().replace(',', '.')) : 0;
  const sinalData = ehSinal ? S('sinalData') : '';
  if (ehSinal) {
    if (!(sinalValor > 0)) return erro('Informe o valor do sinal.');
    if (sinalValor >= valor) return erro('O sinal precisa ser menor que a mensalidade.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sinalData)) return erro('Informe quando o sinal entrou.');
  }

  const eq = await equipeDoSquad(squad);
  if (!eq.gerente) return erro(`O squad ${squad} não tem gerente cadastrado em Usuários (cargo "gerente").`);
  const gestorNome = S('gestor') || (eq.gestor ? eq.gestor.nome : '');
  if (temTrafego && !gestorNome) return erro(`Plano com tráfego, mas o squad ${squad} não tem gestor de tráfego cadastrado.`);

  const payload = {
    nome, plano, valor, dataPagamento,
    nicho: S('nicho'), dono: S('dono'), telFin: S('telFin'), respFin: S('respFin') || S('dono'),
    gestor: temTrafego ? gestorNome : '', gerente: eq.gerente.nome, squad,
    statusPagamento,
    sinalValor, sinalData,
    origem,
    fechamento: {
      razaoSocial: S('razaoSocial'), cnpj: S('cnpj'), dono: S('dono'), cpf: S('cpf'), rg: S('rg'),
      repCargo: S('repCargo'), nascimento: S('nascimento'), origemFicha: S('origemFicha'),
      plano, tipoContrato: S('tipoContrato'), fimContrato, integracoes: S('integracoes'),
      especificidades: S('especificidades'),
      respFin: S('respFin'), telFin: S('telFin'), email: S('email'), endereco: S('endereco'),
      mensalidade: ehIntegral ? 0 : valor,
      valorProjeto: ehIntegral ? valor : 0,
      semMensalidade: ehIntegral,
      formaPagamento: S('formaPagamento'), dataPagamento,
      statusPagamento, sinalValor, sinalData,
      origem, origemRotulo: origem ? ORIGENS[origem] : '',
      sdr: S('sdr'), closer: S('closer'), squad, gerente: eq.gerente.nome, gestor: gestorNome,
      gerenteId: eq.gerente.id, gestorId: eq.gestor ? eq.gestor.id : null,
      linkCall: S('linkCall'), resumo: S('resumo'),
      enviadoPor: quem.nome, enviadoEm: new Date().toISOString(),
      contaAdicional,
    },
  };

  const r = await fetch(URL_ + '/rest/v1/rpc/fechamento_criar', {
    method: 'POST', headers: SVC, body: JSON.stringify({ p: payload }),
  });
  const res = await r.json().catch(() => null);
  if (!r.ok) return erro('Falha ao gravar: ' + JSON.stringify(res), 500);
  if (!res?.ok) return erro(String(res?.erro || 'Falha ao gravar.'));

  /* Asaas depois do banco: o cliente ja existe, entao nada aqui pode derruba-lo.
     Se der errado, o erro fica gravado na ficha e alguem resolve na mao. */
  let asaas: Record<string, unknown>;
  if (String(b.asaas ?? 'sim') === 'nao') {
    asaas = { ok: false, pulado: true, erro: 'Cadastro no Asaas desmarcado no formulário.' };
  } else {
    try {
      asaas = await asaasCriar({
        cid: String(res.clienteId || ''), nome: nome.toUpperCase(),
        cnpj: S('cnpj'), cpf: S('cpf'), email: S('email'),
        telefone: S('telFin'), endereco: S('endereco'),
        valor, dataPagamento, formaPagamento: S('formaPagamento'),
        statusPagamento, sinalValor, fimContrato,
      });
    } catch (e) {
      asaas = { ok: false, ambiente: asaasAmbiente(), em: new Date().toISOString(),
        erro: String((e as Error)?.message || e) };
    }
  }
  try {
    await fetch(URL_ + '/rest/v1/rpc/fechamento_asaas_marcar', {
      method: 'POST', headers: SVC,
      body: JSON.stringify({ p_cid: res.clienteId, p_asaas: asaas }),
    });
  } catch (_) { /* o fechamento nao pode cair por causa disso */ }

  return ok({ ok: true, clienteId: res.clienteId, projetoId: res.projetoId,
    squad, gerente: eq.gerente.nome, gerenteId: eq.gerente.id, gestor: gestorNome, origem, asaas });
});
