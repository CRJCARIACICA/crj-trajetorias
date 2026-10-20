const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const stripImports=s=>s.replace(/^import .*;\r?\n/gm,'');
const lifecycle=read('src/route_lifecycle.js').replace(/\bexport /g,'');
const appPart=read('bundle/src__app_js.005.part');
const renderSource=appPart.slice(appPart.indexOf('async function render(){'),appPart.indexOf("\nwindow.addEventListener('hashchange',render);"));
const routeSource=read('bundle/src__app_js.000.part').match(/^function route\(\).*$/m)[0];
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const settle=async()=>{for(let i=0;i<24;i++)await Promise.resolve()};

function environment(hash='#dashboard'){
  const {window}=parseHTML('<html><head></head><body><div id="app"><section class="content"></section></div></body></html>');
  const timers=new Map();let timerId=0;
  const location={hash};
  const context=vm.createContext({
    window,document:window.document,location,URL,URLSearchParams,Intl,Date,Map,Set,console,Promise,
    CustomEvent:window.CustomEvent,
    MutationObserver:class{observe(){}disconnect(){}},
    queueMicrotask,
    setTimeout:fn=>{timers.set(++timerId,fn);return timerId},
    clearTimeout:id=>timers.delete(id),
    setInterval:()=>0,clearInterval:()=>{}
  });
  window.requestIdleCallback=()=>0;
  vm.runInContext(lifecycle,context);
  const s={window,document:window.document,location,context,timers,
    eval:code=>vm.runInContext(code,context),
    content:()=>window.document.querySelector('.content'),
    mount(html='<div>Destino</div>'){window.document.querySelector('#app').innerHTML='<section class="content">'+html+'</section>'},
    event(name,route){window.dispatchEvent(new window.CustomEvent(name,{detail:{route,hash:location.hash}}))},
    async drain(){
      for(let i=0;i<20;i++){
        await settle();
        if(!timers.size)return;
        const batch=[...timers.entries()];timers.clear();
        for(const [,fn] of batch)await fn();
      }
      throw new Error('Fila de renderização não estabilizou');
    }
  };
  return s;
}
function core(hash){
  const s=environment(hash);
  const state={user:{id:'educator',role:'educador',active:true},documentSettings:{},agendaUnread:0};
  Object.assign(s.context,{
    state,app:s.document.querySelector('#app'),
    getSession:async()=>({user:state.user}),
    getDocumentSettings:async()=>({}),applyDocumentSettings:()=>{},
    agendaUnreadCount:async()=>0,
    layout:html=>'<div class="app-shell"><section class="content">'+html+'</section></div>',
    renderLogin:()=>{s.document.querySelector('#app').innerHTML='<p>Entrar</p>'},
    renderPending:()=>{s.document.querySelector('#app').innerHTML='<p>Acesso pendente</p>'},
    esc:value=>String(value),
    bindRoute:async()=>{},
    bindEducatorPageV2:async()=>{},bindCfdhShared:async()=>{},bindTechnicalPage:async()=>{},
    bindWorkshopDetailV2:async()=>{},bindJhonataoPage:async()=>{},bindAgendaPage:async()=>{},
    bindPublicWorkshopCheckinV2:async()=>{}
  });
  const pages=['pageDashboard','pageYouth','pageNewYouth','pageEditYouth','pageYouthProfile','pageForms','pageForm','pageWorkshops','pageWorkshopDetailV2','pageEducatorV2','pageCfdhShared','pageTechnicalTeam','renderJhonataoPage','renderAgendaPage','pageGoals','pageAggregate','pageTeam','pagePublicWorkshopCheckinV2'];
  pages.forEach(name=>s.context[name]=async()=>'<p data-page="'+name+'">'+s.location.hash+'</p>');
  s.eval(routeSource+'\n'+renderSource);
  s.render=()=>s.eval('render()');
  s.routes=s.eval('MODULE_ROUTES');
  return s;
}
function loader(hash,importer=async()=>({})){
  const s=environment(hash),imports=[];
  s.context.getSession=async()=>({user:{id:'test',role:'coordenacao_geral',active:true}});
  s.context.importFeature=url=>{imports.push(url);return importer(url)};
  const source=stripImports(read('src/feature_loader.js'))
    .replace('import(moduleUrl(name))','importFeature(moduleUrl(name))')
    .replaceAll('import.meta.url',"'https://example.test/src/feature_loader.js'");
  s.eval(source+'\nglobalThis.loaderApi={loadForRoute,featureSet};');
  s.timers.clear();
  s.imports=imports;
  s.activate=()=>s.context.loaderApi.loadForRoute(s.eval('routeName()'));
  s.ready=()=>s.eval('announceRouteReady()');
  s.routes=s.eval('MODULE_ROUTES');
  return s;
}

test('todas as páginas de módulo são reconhecidas na primeira abertura, antes de consultas acessórias',async t=>{
  const s=core();
  for(const name of Object.keys(s.routes)){
    await t.test(name,async()=>{
      s.location.hash='#'+name+'?month=2026-10';
      s.context.agendaUnreadCount=async()=>{throw new Error('Contador indisponível')};
      await s.render();
      assert.equal(s.content().querySelector('[data-crj-route-pending]').dataset.crjRoutePending,name);
      assert.doesNotMatch(s.content().textContent,/Página não encontrada/);
      assert.equal(s.window.__CRJ_ROUTE_READY__.hash,s.location.hash);
    });
  }
});
test('menus nativos continuam renderizando suas páginas',async()=>{
  const s=core();
  for(const name of ['dashboard','jovens','novo-jovem','editar-jovem/id','jovem/id','formularios','formulario/pvida/id','oficinas','oficina/id','educador','cfdh','equipe-tecnica','jhonatao','agenda','metas','lancamento-geral','equipe']){
    s.location.hash='#'+name;await s.render();
    assert(s.content().querySelector('[data-page]'),name);
    assert.doesNotMatch(s.content().textContent,/Página não encontrada/);
  }
});
test('endereços realmente inexistentes continuam exibindo página não encontrada',async()=>{
  const s=core('#nao-existe');await s.render();
  assert.match(s.content().textContent,/Página não encontrada/);
});
test('uma resposta antiga não substitui o menu aberto mais recentemente',async()=>{
  const s=core('#dashboard'),old=deferred();
  s.context.pageDashboard=()=>old.promise;
  const first=s.render();await settle();
  s.location.hash='#calendario-geral';await s.render();
  old.resolve('<p>Painel antigo</p>');await first;
  assert(s.content().querySelector('[data-crj-route-pending="calendario-geral"]'));
  assert.doesNotMatch(s.content().textContent,/Painel antigo|Página não encontrada/);
});
test('um erro atrasado da página anterior não cobre a página atual',async()=>{
  const s=core('#dashboard'),old=deferred();
  s.context.pageDashboard=()=>old.promise;
  const first=s.render();await settle();
  s.location.hash='#caixa-equipes';await s.render();
  old.reject(new Error('Falha antiga'));await first;
  assert(s.content().querySelector('[data-crj-route-pending="caixa-equipes"]'));
});
test('a proteção compara o hash completo, incluindo mês e aba',async()=>{
  const s=core('#oficinas?month=2026-10'),old=deferred();
  s.context.pageWorkshops=()=>s.location.hash.includes('2026-10')?old.promise:Promise.resolve('<p>Novembro</p>');
  const first=s.render();await settle();
  s.location.hash='#oficinas?month=2026-11';await s.render();
  old.resolve('<p>Outubro</p>');await first;
  assert.equal(s.content().textContent,'Novembro');
});
test('restauração lenta da sessão não reaplica uma navegação anterior',async()=>{
  const s=core('#dashboard'),old=deferred();
  s.context.state.user=null;let n=0;
  s.context.getSession=()=>++n===1?old.promise:Promise.resolve({user:{id:'current',role:'educador',active:true}});
  const first=s.render();s.location.hash='#controlador-acesso';await s.render();
  old.resolve({user:{id:'old',role:'administrativo',active:true}});await first;
  assert.equal(s.context.state.user.id,'current');
  assert(s.content().querySelector('[data-crj-route-pending="controlador-acesso"]'));
});
test('login e acesso pendente são preservados',async()=>{
  const s=core('#calendario-geral');
  s.context.state.user=null;s.context.getSession=async()=>null;await s.render();
  assert.match(s.document.body.textContent,/Entrar/);assert.equal(s.window.__CRJ_ROUTE_READY__,null);
  s.context.state.user={id:'pending',role:'pendente'};await s.render();
  assert.match(s.document.body.textContent,/Acesso pendente/);
});
test('a guarda também invalida uma tentativa anterior para o mesmo endereço',()=>{
  const s=environment('#educador');
  const first=s.eval('beginNavigation()'),second=s.eval('beginNavigation()');
  assert.equal(first(),false);assert.equal(second(),true);
});
test('retornar ao mesmo endereço com outro contêiner invalida os dados antigos',()=>{
  const s=environment('#caixa-equipes'),current=s.eval('captureRoute()');
  s.mount();assert.equal(current(),false);
});
test('pré-carregamento busca o módulo sem executar seu boot ou consultas',async()=>{
  const s=loader('#dashboard');
  await s.eval("window.__crjFeatureLoader.preload('controlador-acesso')");
  assert.equal(s.imports.length,0);
  const links=s.document.head.querySelectorAll('link[rel="modulepreload"]');
  assert.equal(links.length,1);
  assert.match(links[0].href,/\/src\/access_controller\.js\?v=/);
});
test('módulos aguardam a montagem do destino pelo roteador',async()=>{
  const s=loader('#controlador-acesso');await s.activate();
  assert.equal(s.imports.length,0);
  s.ready();await s.activate();assert.equal(s.imports.length,1);
});
test('cada área é ativada na primeira visita, sem evento de foco',async t=>{
  const sample=loader('#dashboard');
  for(const name of Object.keys(sample.routes)){
    await t.test(name,async()=>{
      const s=loader('#'+name);let activated=0;
      s.window.addEventListener('crj:features-ready',event=>{
        if(event.detail.route===name){activated++;s.content().innerHTML='<p>Área carregada</p>'}
      });
      s.ready();await s.activate();
      assert.equal(activated,1);
      assert.equal(s.content().textContent,'Área carregada');
      assert(s.imports.some(url=>url.startsWith('./'+s.routes[name].module+'.js')));
    });
  }
});
test('revisitar uma área em cache ativa o novo contêiner automaticamente',async()=>{
  const s=loader('#caixa-equipes');let activated=0;
  s.window.addEventListener('crj:features-ready',()=>{activated++;s.content().innerHTML='<p>Caixa '+activated+'</p>'});
  s.ready();await s.activate();const imported=s.imports.length;
  s.mount();s.ready();await s.activate();
  assert.equal(s.imports.length,imported);
  assert.equal(s.content().textContent,'Caixa 2');
});
test('um carregamento lento não ativa a rota que já foi abandonada',async()=>{
  const old=deferred(),seen=[];
  const s=loader('#calendario-geral',url=>url.includes('/general_calendar.js')?old.promise:Promise.resolve({}));
  s.window.addEventListener('crj:features-ready',event=>seen.push(event.detail.route));
  s.ready();const first=s.activate();
  s.location.hash='#controlador-acesso';s.mount();s.ready();await s.activate();
  old.resolve({});await first;
  assert.deepEqual(seen,['controlador-acesso']);
});
test('uma falha de conexão permite tentar novamente na própria página',async()=>{
  let fail=true;const s=loader('#controlador-acesso',async()=>{if(fail)throw new Error('Offline');return {}});
  s.window.addEventListener('crj:features-ready',()=>{s.content().innerHTML='<p>Carregado</p>'});
  s.ready();await s.activate();
  assert.match(s.content().textContent,/Não foi possível abrir esta página/);
  fail=false;s.content().querySelector('[data-crj-route-retry]').dispatchEvent(new s.window.Event('click'));
  await settle();
  assert.equal(s.content().textContent,'Carregado');
  assert(s.imports.some(url=>url.includes('&retry=1')));
});
test('falha em um complemento não impede o módulo dono da página',async()=>{
  const s=loader('#documentos-evidencias',async url=>{if(url.includes('/evidence_exports.js'))throw new Error('Complemento indisponível');return {}});
  let activated=false;s.window.addEventListener('crj:features-ready',()=>{activated=true});
  s.ready();await s.activate();
  assert.equal(activated,true);
  assert.equal(s.content().querySelector('[data-crj-route-retry]'),null);
});

function team(){
  const s=environment('#caixa-equipes');
  const source=stripImports(read('src/team_comms.js')).replace(/^\(async\(\)=>\{if\(booting\)[^\n]*\n/gm,'');
  s.eval(source);
  s.context.fixtureData=async()=>({threads:[],profiles:[]});
  s.eval("me={id:'test',role:'educador',active:true};loadData=()=>fixtureData();detailHtml=async()=>'<p>Conversa</p>';threadList=()=>'<p>Lista</p>';bind=()=>{};refreshBadge=async()=>{};updateNavBadge=()=>{};unreadCount=()=>0;");
  s.render=()=>s.eval('render()');
  return s;
}
test('Caixa das Equipes remonta ao receber o evento de módulos prontos',async()=>{
  const s=team();s.event('crj:features-ready','caixa-equipes');await s.drain();
  assert.match(s.content().textContent,/Caixa das Equipes/);
  s.mount();s.event('crj:features-ready','caixa-equipes');await s.drain();
  assert(s.content().querySelector('.tc-shell'));
});
test('Caixa das Equipes descarta a resposta antiga e conclui a troca de filtro em andamento',async()=>{
  const s=team(),old=deferred();let calls=0;
  s.context.fixtureData=()=>++calls===1?old.promise:Promise.resolve({threads:[],profiles:[]});
  const first=s.render();
  s.location.hash='#caixa-equipes?filter=nao-lidas';s.mount('<p>Novo filtro</p>');
  await s.render();old.resolve({threads:[],profiles:[]});await first;
  assert.equal(s.content().textContent,'Novo filtro');
  await s.drain();assert(s.content().querySelector('.tc-shell'));
});
test('Documentos e Evidências termina de carregar o último filtro selecionado',async()=>{
  const s=environment('#documentos-evidencias'),old=deferred();let calls=0;
  const source=stripImports(read('src/document_drafts.js')).replace(/^boot\(\);[ \t]*$/gm,'');
  s.eval(source);s.context.fixtureData=()=>++calls===1?old.promise:Promise.resolve([]);
  s.eval("me={id:'test',role:'educador',active:true};load=()=>fixtureData();");
  const first=s.eval('render()');
  s.location.hash='#documentos-evidencias?filter=todos';s.mount('<p>Destino</p>');
  await s.eval('render()');old.resolve([]);await first;
  assert.equal(s.content().textContent,'Destino');
  await s.drain();assert(s.content().querySelector('[data-document-drafts-page]'));
});

test('todos os módulos e imports locais necessários estão incluídos na publicação',()=>{
  const workflow=read('.github/workflows/deploy.yml');
  const published=new Set([...workflow.matchAll(/^\s+(src\/[\w.-]+\.js) \\/gm)].map(m=>m[1]));
  ['src/app.js','src/api.js','src/forms.js','src/agenda.js'].forEach(p=>published.add(p));
  const s=loader('#dashboard');
  for(const name of Object.keys(s.routes)){
    const features=s.context.loaderApi.featureSet(name).critical;
    assert(features.includes(s.routes[name].module),name);
  }
  const loaderText=read('src/feature_loader.js');
  for(const match of loaderText.matchAll(/(?:critical|deferred):\s*\[([^\]]*)\]/g)){
    for(const item of match[1].matchAll(/'([\w_]+)'/g))assert(published.has('src/'+item[1]+'.js'),'Módulo não publicado: '+item[1]);
  }
  assert(published.has('src/educator_instructor_plan_sync.js'));
  for(const file of published){
    if(!fs.existsSync(path.join(root,file)))continue;
    for(const match of read(file).matchAll(/(?:from\s*|import\s*\(?\s*)['"](\.\/[^'"]+)['"]/g)){
      const target=path.posix.normalize(path.posix.join(path.posix.dirname(file),match[1].split('?')[0]));
      assert(published.has(target),file+' depende de arquivo não publicado: '+target);
    }
  }
});
test('JavaScript alterado e app montado têm sintaxe válida de módulo ES',()=>{
  const fragments=fs.readdirSync(path.join(root,'bundle')).filter(p=>/^src__app_js\..*\.part$/.test(p)).sort();
  const app=fragments.map(p=>read('bundle/'+p)).join('');
  const sources=[['app.js montado',app],...fs.readdirSync(path.join(root,'src')).filter(p=>p.endsWith('.js')).map(p=>['src/'+p,read('src/'+p)])];
  for(const [name,source] of sources){
    const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
    assert.equal(result.status,0,name+'\n'+result.stderr);
  }
});
