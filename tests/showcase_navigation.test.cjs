const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const source=read('src/meta4_3_ui.js').replace(/^import .*;\r?\n/gm,'');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
const settle=async()=>{for(let i=0;i<24;i++)await Promise.resolve()};
const navHtml='<aside class="sidebar"><nav class="nav"><a href="#calendario-geral" data-general-calendar-link>Calendário Geral</a><div class="sep"></div></nav></aside>';

function setup({hash='#dashboard',active=true,required=true,scheduleResponse,showcaseResponse}={}){
  const {window}=parseHTML('<html><head></head><body><div id="app">'+navHtml+'<main class="content"></main></div></body></html>');
  // Linkedom delega símbolos desconhecidos ao global Node compartilhado.
  delete window[Symbol.for('crj.meta43Ui')];
  const document=window.document,location={hash},microtasks=[],observers=[],calls=[];
  let now=Date.now(),timer=0;
  class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
  class Observer extends window.MutationObserver{constructor(fn){super(fn);observers.push(this)}}
  const client={
    auth:{getUser:async()=>({data:{user:{id:'educator'}}})},
    from(table){
      const call={table,filters:[]};calls.push(call);
      const query={select(){return query},eq(key,value){call.filters.push([key,value]);return query},maybeSingle(){
        if(table==='profiles')return Promise.resolve({data:{id:'educator',active},error:null});
        if(table==='goal_stage_schedule')return scheduleResponse?scheduleResponse(call):Promise.resolve({data:required?{reference_month:'2026-10-01'}:null,error:null});
        if(table==='professional_showcases')return showcaseResponse?showcaseResponse(call):Promise.resolve({data:null,error:null});
        throw new Error('Consulta inesperada: '+table);
      }};return query;
    }
  };
  const context=vm.createContext({window,document,location,console,Date:Clock,Intl,Map,Set,WeakMap,WeakSet,Promise,URLSearchParams,
    MutationObserver:Observer,HTMLFormElement:window.HTMLFormElement,apiMode:()=> 'live',supabaseClient:()=>client,
    captureRoute:host=>{const hash=location.hash;return ()=>location.hash===hash&&host.isConnected&&document.querySelector('.content')===host},
    queueMicrotask:fn=>microtasks.push(fn),setTimeout:()=>++timer,clearTimeout:()=>{}});
  const install=()=>vm.runInContext('(function(){'+source+'\n})();',context);
  install();
  return {window,document,location,calls,observers,install,
    nav:()=>document.querySelector('.sidebar .nav'),links:()=>document.querySelectorAll('.sidebar a[href="#mostra-profissoes"]'),
    content:()=>document.querySelector('.content'),requests:table=>calls.filter(c=>c.table===table).length,
    advance:ms=>{now+=ms},
    event:name=>window.dispatchEvent(new window.Event(name)),
    async turn(){await settle();const batch=microtasks.splice(0);batch.forEach(fn=>fn());await settle()},
    async flush(){for(let i=0;i<40;i++){await this.turn();if(!microtasks.length)return}throw new Error('A observação das próprias alterações não estabilizou')}
  };
}

test('respostas lentas e alterações simultâneas criam apenas uma entrada e uma consulta do menu',async()=>{
  const response=deferred(),s=setup({scheduleResponse:()=>response.promise});
  await s.turn();
  for(let i=0;i<8;i++){s.document.body.appendChild(s.document.createElement('div'));s.event('crj:features-ready');await s.turn()}
  assert.equal(s.requests('goal_stage_schedule'),1);
  response.resolve({data:{reference_month:'2026-10-01'},error:null});await s.flush();
  assert.equal(s.links().length,1);
  for(let i=0;i<10;i++){s.document.body.appendChild(s.document.createElement('div'));await s.flush()}
  assert.equal(s.requests('goal_stage_schedule'),1);
  assert.equal(s.links()[0].previousElementSibling.getAttribute('data-general-calendar-link'),'');
});

test('revalida a existência do item depois da consulta e elimina cópias já presentes',async()=>{
  const response=deferred(),s=setup({scheduleResponse:()=>response.promise});await s.turn();
  for(let i=0;i<8;i++){
    const a=s.document.createElement('a');a.href='#mostra-profissoes';a.dataset.meta43ShowcaseNav='1';a.textContent='Mostra Semestral';s.nav().appendChild(a);
  }
  response.resolve({data:{reference_month:'2026-10-01'},error:null});await s.flush();
  assert.equal(s.links().length,1);
});

test('a página da Mostra conclui o carregamento sem reagir infinitamente ao próprio HTML',async()=>{
  const s=setup({hash:'#mostra-profissoes'});await s.flush();
  assert(s.content().querySelector('[data-showcase-form]'));
  assert.equal(s.requests('professional_showcases'),1);
  assert.equal(s.links().length,1);assert(s.links()[0].classList.contains('active'));
});

test('eventos e mudanças incidentais preservam o formulário em edição',async()=>{
  const s=setup({hash:'#mostra-profissoes'});await s.flush();
  const form=s.content().querySelector('[data-showcase-form]'),title=form.querySelector('[name="title"]');title.value='Título em edição';
  for(const name of ['crj:features-ready','crj:route-rendered','focus']){s.event(name);await s.flush()}
  s.document.body.appendChild(s.document.createElement('div'));await s.flush();
  assert.equal(s.content().querySelector('[data-showcase-form]'),form);
  assert.equal(title.value,'Título em edição');assert.equal(s.requests('professional_showcases'),1);
});

test('resposta atrasada da Mostra não substitui a página seguinte',async()=>{
  const response=deferred(),s=setup({hash:'#mostra-profissoes',showcaseResponse:()=>response.promise});await s.turn();
  assert(s.requests('professional_showcases')>0);
  s.location.hash='#dashboard';s.content().innerHTML='<p>Painel atual</p>';s.event('hashchange');await s.turn();
  response.resolve({data:null,error:null});await s.flush();
  assert.equal(s.content().textContent,'Painel atual');assert.equal(s.links().length,1);
  assert(!s.links()[0].classList.contains('active'));
});

test('troca do contêiner durante a consulta ignora o menu antigo e monta só o atual',async()=>{
  const response=deferred(),s=setup({scheduleResponse:()=>response.promise});await s.turn();const oldNav=s.nav();
  s.document.querySelector('.sidebar').outerHTML=navHtml;s.event('crj:route-rendered');await s.turn();
  response.resolve({data:{reference_month:'2026-10-01'},error:null});await s.flush();
  assert.equal(oldNav.querySelectorAll('[data-meta43-showcase-nav]').length,0);assert.equal(s.links().length,1);
});

test('o menu continua condicionado ao perfil ativo e ao cronograma do mês',async()=>{
  for(const options of [{active:false},{required:false}]){
    const s=setup(options);await s.flush();assert.equal(s.links().length,0);
    s.document.body.appendChild(s.document.createElement('div'));await s.flush();assert.equal(s.links().length,0);
  }
});

test('uma falha temporária libera nova consulta e o retorno ao foco atualiza a exigência',async()=>{
  let attempt=0,required=true;
  const s=setup({scheduleResponse:async()=>++attempt===1?{data:null,error:new Error('Offline')}:{data:required?{reference_month:'2026-10-01'}:null,error:null}});
  await s.flush();assert.equal(s.links().length,0);s.event('focus');await s.flush();assert.equal(s.links().length,1);
  required=false;s.event('focus');await s.flush();assert.equal(s.links().length,0);
});

test('voltar à Mostra e substituir seu contêiner monta a tela novamente uma única vez',async()=>{
  const s=setup({hash:'#mostra-profissoes'});await s.flush();
  s.location.hash='#dashboard';s.content().innerHTML='<p>Painel</p>';s.event('hashchange');await s.flush();
  s.location.hash='#mostra-profissoes';s.content().outerHTML='<main class="content"></main>';s.event('crj:route-rendered');await s.flush();
  assert(s.content().querySelector('[data-showcase-form]'));assert.equal(s.requests('professional_showcases'),2);assert.equal(s.links().length,1);
});

test('carregar o módulo por outra URL não instala outro observador',async()=>{
  const s=setup();await s.flush();const count=s.observers.length;
  s.install();await s.flush();assert.equal(s.observers.length,count);assert.equal(s.links().length,1);
});

test('os dois caminhos de importação usam a mesma versão da Meta 4.3',()=>{
  const guard=read('src/initial_form_numeric_guard.js'),loader=read('src/feature_loader.js');
  const version=guard.match(/meta4_3_ui\.js\?v=([^'"]+)/)[1];
  const context=vm.createContext({window:{addEventListener(){},requestIdleCallback(){}},document:{addEventListener(){},querySelector:()=>null},
    location:{hash:'#dashboard'},Map,Set,Promise,URL,console,queueMicrotask:()=>{},setTimeout:()=>0,clearTimeout:()=>{},
    routeName:()=> 'dashboard',getSession:async()=>null});
  const code=loader.replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.url',"'https://example.test/src/feature_loader.js'");
  vm.runInContext(code,context);
  assert.equal(vm.runInContext("moduleUrl('meta4_3_ui')",context),'./meta4_3_ui.js?v='+version);
});
