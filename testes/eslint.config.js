// ESLint só para o módulo CRM (crm.js). O index.html segue sem lint por ora.
const globais=['crmAba','crmAbrirFicha','crmAgendarModal','crmCancelarAp','crmConectarGoogle','crmEditarModal','crmEquipeModal','crmFechar','crmFiltro','crmGanhoModal','crmLimpar','crmMes','crmMover','crmNotaModal','crmNovoLead','crmNovoLeadOrigem','crmOcupacao','crmPerdaModal','crmPresenca','crmReagendarModal','crmRender','crmResponsavelModal','crmSemana','crmSoltar','sb','currentUser','SESSION','esc','brl','toast','modal','confirmar','$','renderFunil','FN','lkHash','SUPA_URL','currentView'];
module.exports=[{
  files:['crm.js','testes/crm.test.js'],
  languageOptions:{ecmaVersion:2022,sourceType:'script',
    globals:Object.assign({window:'readonly',document:'readonly',localStorage:'readonly',location:'readonly',fetch:'readonly',console:'readonly',setTimeout:'readonly',clearTimeout:'readonly',Date:'readonly',require:'readonly',module:'readonly',__dirname:'readonly',process:'readonly'},
      Object.fromEntries(globais.map(g=>[g,'readonly'])))},
  rules:{'no-undef':'error','no-unused-vars':['warn',{args:'none'}],'no-redeclare':'error','no-dupe-keys':'error','no-unreachable':'error','eqeqeq':'warn'}
}];
