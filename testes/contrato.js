/* Testes do formulário contratual público (contrato.html).
   Rodar:  node testes/contrato.js

   A página é a cópia do formulário do Yay ([AUTOSÍNTESE] ELABORAÇÃO CONTRATO
   SÍNTESE). Aqui se confere: fidelidade dos textos, ordem das 10 perguntas,
   validação de CPF/CNPJ/data, máscaras, a máquina de resposta parcial e que
   nenhuma chave secreta vazou pro arquivo público. */
const fs=require('fs'), vm=require('vm'), path=require('path');
const HTML=fs.readFileSync(path.join(__dirname,'..','contrato.html'),'utf8');

let falhas=0, total=0;
const ok=(n,c)=>{ total++; if(c) console.log('  ok  '+n); else { console.log('  FALHOU  '+n); falhas++; } };
const secao=(t)=>console.log('\n— '+t+' —');
const grupo=(t)=>console.log('\n\x1b[1m'+t+'\x1b[0m');

/* o script principal, sem a parte que precisa de DOM */
const scripts=HTML.match(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)||[];
const principal=scripts.map(s=>s.replace(/^<script[^>]*>/,'').replace(/<\/script>$/,'')).find(s=>s.indexOf('SUPA_URL')>=0)||'';
const logica=principal.slice(0,principal.indexOf('/* ---------- montagem'));
const crypto={getRandomValues:a=>{for(let i=0;i<a.length;i++)a[i]=(i*97+37)%256;return a;}};
const g={console,Date,Math,JSON,String,Number,Array,Object,Boolean,RegExp,parseInt,parseFloat,isNaN,Uint8Array,crypto};
g.window=g; vm.createContext(g);
vm.runInContext(logica+'\n;Object.assign(window,{dig,cpfValido,cnpjValido,dataValida,emailValido,foneValido,dataISO,mCNPJ,mCPF,mFone,uuidv4,PERGUNTAS,REGRAS});',g);

grupo('A página carrega');
{
  let erro=null; try{ new vm.Script(principal); }catch(e){ erro=e.message; }
  ok('o JavaScript é válido'+(erro?' — '+erro:''), !erro);
  ok('logica extraída não veio vazia', logica.length>1000);
}

grupo('Fidelidade ao formulário original do Yay');
{
  secao('tela de abertura');
  ok('título com a Loja de Veículos🚀', HTML.indexOf('parabéns pela decisão de evoluir e escalar os resultados da sua Loja de Veículos🚀')>0);
  ok('texto da formalização do projeto', HTML.indexOf('Dando sequência à formalização do projeto, é necessário o preenchimento do Formulário de informações Contratuais!')>0);
  ok('chamada pra iniciar', HTML.indexOf('Clique no botão abaixo para iniciar!')>0);
  ok('botão CLIQUE AQUI PARA ACELERAR', HTML.indexOf('CLIQUE AQUI PARA ACELERAR')>0);
  ok('banner de abertura (imagem original)', HTML.indexOf('1759851189_default.webp')>0);
  secao('tela de encerramento');
  ok('agradecimento', HTML.indexOf('Obrigado por preencher o formulário!')>0);
  ok('contrato e faturamento', HTML.indexOf('Com esses dados conseguiremos elaborar seu contrato e organizar o faturamento de forma segura e rápida.')>0);
  ok('equipe à disposição', HTML.indexOf('Em caso de dúvidas, nossa equipe está à disposição para ajudar.')>0);
  ok('banner de encerramento (imagem original)', HTML.indexOf('1759851344_default.webp')>0);
  secao('as 10 perguntas, na ordem exata');
  const esperado=['Nome da Empresa (Razão Social)','Nome Completo do Representante Legal','CNPJ da Empresa',
    'RG do Representante Legal','CPF do Representante Legal','Data de Nascimento do Representante Legal',
    'Endereço da Empresa','Email para contrato','Nome do Responsável Financeiro','Telefone do Responsável Financeiro'];
  ok('são exatamente 10', g.PERGUNTAS.length===10);
  esperado.forEach((t,i)=>ok((i+1)+'. '+t, g.PERGUNTAS[i]&&g.PERGUNTAS[i].t===t));
  ok('todo tipo de pergunta tem regra de validação', g.PERGUNTAS.every(p=>!!g.REGRAS[p.tipo]));
  secao('detalhes do original');
  ok('data em três campos Dia / Mês / Ano', HTML.indexOf('placeholder="Dia"')>0&&HTML.indexOf('placeholder="Mês"')>0&&HTML.indexOf('placeholder="Ano"')>0);
  ok('telefone com prefixo +55 (país BR)', HTML.indexOf('+55')>0);
  ok('dica "Pressione Enter ↵"', HTML.indexOf('Pressione <b>Enter ↵</b>')>0&&HTML.indexOf('pressione <b>')<0);
  ok('barra de progresso presente', HTML.indexOf('id="barra"')>0);
  ok('fonte Roboto e botão preto do tema', HTML.indexOf('Roboto')>0&&HTML.indexOf('--btn-bg:#000000')>0);
  ok('pixel do Facebook do original', HTML.indexOf("fbq('init','2022021961964985')")>0);
  ok('progresso salvo pra retomar depois', HTML.indexOf('localStorage.setItem(GUARDA')>0);
}

grupo('Validação de verdade (melhor que o original)');
{
  secao('CPF com dígito verificador');
  ok('CPF válido passa', g.cpfValido('529.982.247-25'));
  ok('dígito errado reprova', !g.cpfValido('529.982.247-24'));
  ok('tudo igual reprova', !g.cpfValido('111.111.111-11'));
  ok('curto reprova', !g.cpfValido('1234567890'));
  secao('CNPJ com dígito verificador');
  ok('CNPJ válido passa', g.cnpjValido('11.222.333/0001-81'));
  ok('dígito errado reprova', !g.cnpjValido('11.222.333/0001-80'));
  ok('tudo igual reprova', !g.cnpjValido('11.111.111/1111-11'));
  secao('data de nascimento');
  ok('29/02/2000 existe', g.dataValida('29/02/2000'));
  ok('31/02/1990 não existe', !g.dataValida('31/02/1990'));
  ok('12/07/1985 passa', g.dataValida('12/07/1985'));
  ok('futuro reprova', !g.dataValida('12/07/2030'));
  ok('antes de 1900 reprova', !g.dataValida('12/07/1899'));
  ok('vira ISO pro banco', g.dataISO('12/07/1985')==='1985-07-12');
  secao('email e telefone');
  ok('email válido passa', g.emailValido('financeiro@empresa.com.br'));
  ok('email sem domínio reprova', !g.emailValido('financeiro@'));
  ok('celular 11 dígitos passa', g.foneValido('(17) 98123-4567'));
  ok('fixo 10 dígitos passa', g.foneValido('(17) 3123-4567'));
  ok('9 dígitos reprova', !g.foneValido('812345678'));
  secao('máscaras enquanto digita');
  ok('CNPJ ganha pontuação', g.mCNPJ('11222333000181')==='11.222.333/0001-81');
  ok('CPF ganha pontuação', g.mCPF('52998224725')==='529.982.247-25');
  ok('celular ganha parênteses', g.mFone('17981234567')==='(17) 98123-4567');
  ok('fixo ganha parênteses', g.mFone('1731234567')==='(17) 3123-4567');
}

grupo('Envio pela edge function (tabela fechada pro público)');
{
  ok('não fala com a tabela direto', principal.indexOf('/rest/v1/contratos_form')<0);
  ok('fala com a edge function contrato', principal.indexOf('/functions/v1/contrato')>0);
  ok('cada visita tem uuid v4 próprio', principal.indexOf('const RID=salvo.rid||uuidv4()')>0);
  secao('uuid v4 gerado no navegador é válido');
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  ok('formato uuid v4 mesmo sem randomUUID', UUID.test(g.uuidv4()));
  secao('resposta parcial e envio final');
  ok('o OK válido sincroniza (parcial)', principal.indexOf('sincronizar(); // resposta parcial')>0);
  ok('o envio final manda final:true', principal.indexOf('enviarEdge(true)')>0);
  ok('honeypot conferido antes de qualquer rede', principal.indexOf("if(($('#hp_site')||{}).value) return {ok:true}")>0);
  ok('429 vira mensagem de "muitos envios"', principal.indexOf('res.status===429')>0);
  secao('bug do localStorage recriado — corrigido');
  ok('guardar() vira no-op depois de finalizar', principal.indexOf('function guardar(){ if(finalizado) return;')>0);
  ok('finaliza ANTES de limpar e mostrar tela final',
     principal.indexOf('finalizado=true;')<principal.indexOf('localStorage.removeItem(GUARDA)'));
  secao('colar telefone com +55 (bug do DDI) — corrigido');
  ok("colar '+55 17 98123-4567' vira (17) 98123-4567", g.mFone('+55 17 98123-4567')==='(17) 98123-4567');
  ok('sem DDI segue normal', g.mFone('17981234567')==='(17) 98123-4567');
  ok('espalha data colada nos 3 campos', HTML.indexOf('function espalharData')>0);
  secao('limites espelham o banco');
  ok('perguntas de texto carregam limite (max)', g.PERGUNTAS.filter(p=>p.tipo==='texto'||p.tipo==='email').every(p=>p.max>0));
  ok('endereço vai até 500 (como o banco)', (g.PERGUNTAS.find(p=>p.id==='endereco')||{}).max===500);
  ok('o template aplica maxlength nos inputs', HTML.indexOf('maxlength="${p.max}"')>0);
}

grupo('Nada de segredo em página pública');
{
  ok('só a chave publicável', HTML.indexOf('sb_publishable_')>0);
  ok('sem service_role', HTML.indexOf('service_role')<0);
  ok('sem sb_secret', HTML.indexOf('sb_secret')<0);
  ok('fora do radar do Google (noindex)', HTML.indexOf('noindex')>0);
}

console.log('\n'+(falhas?('\x1b[31m>>> '+falhas+' de '+total+' falharam\x1b[0m'):('\x1b[32m>>> '+total+' verificações, todas passaram\x1b[0m')));
process.exit(falhas?1:0);
