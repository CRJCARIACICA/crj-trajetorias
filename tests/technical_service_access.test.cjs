const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const strip=s=>s.replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,'');
const formsSource=fs.readdirSync(path.join(root,'bundle')).filter(x=>/^src__forms_js\..*\.part$/.test(x)).sort().map(x=>read('bundle/'+x)).join('');
const FORM_MAP=vm.runInNewContext(strip(formsSource)+'\nFORM_MAP;');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve()};
const person={id:'young-1',full_name:'Jovem Teste',preferred_name:'Apelido',neighborhood:'Castelo Branco',cpf:'12345678900',birth_date:'2007-01-01',status:'ativo'};
const profile=(role='assistente_social',active=true)=>({id:'staff-'+role,display_name:'Profissional '+role,role,active});

function setup({role='assistente_social',hash='#jovem/young-1',session}={}){
  const {window}=parseHTML('<html><head></head><body><div class="content"><div class="page-head"><div class="actions"><button data-action="new-service">+ Atendimento</button><button data-new-technical-service>+ Novo atendimento</button></div></div></div></body></html>');
  let actor=profile(role),loadSession=session||(()=>Promise.resolve({user:actor})),loaded=false,observations=0;
  const timers=new Map(),saved=[],created=[],reads=[],imports=[],alerts=[];let timerId=0;
  const location={hash};
  const client={from(table){
    reads.push(table);const filters=[];
    const q={select(){return q},eq(k,v){filters.push([k,v]);return q},is(){return q},order(){return q},maybeSingle(){return q},then(resolve,reject){
      const data=(table==='young_people'?[person,{...person,id:'young-2',full_name:'Outro Jovem'}]:table==='profiles'?[actor,profile('psicologo')]:table==='methodology_form_submissions'?[{source_type:'technical_service_records',source_id:'service-old',form_slug:'pvida',youth_id:'young-1',payload:{objectives:'Meta anterior'}}]:[]).filter(row=>filters.every(([k,v])=>row[k]===v));
      return Promise.resolve({data,error:null}).then(resolve,reject);
    }};return q;
  }};
  class FormData{
    constructor(form){this.form=form}
    get(name){const el=this.form.querySelector(`[name="${name}"]`);return el?.value??null}
  }
  const context=vm.createContext({window,document:window.document,location,URLSearchParams,Intl,Date,Map,Set,console,Promise,FormData,
    history:{replaceState(_a,_b,hash){location.hash=hash}},
    HashChangeEvent:window.Event,
    MutationObserver:class{observe(){observations++}disconnect(){}},
    setTimeout(fn){timers.set(++timerId,fn);return timerId},clearTimeout(id){timers.delete(id)},
    alert:message=>alerts.push(message),confirm:()=>false,FORM_MAP,
    apiMode:()=> 'live',supabaseClient:()=>client,getSession:()=>loadSession(),
    createTechnicalService:async row=>{saved.push(row);return {id:'service-1',...row}},
    createYouth:async payload=>{created.push(payload);return 'young-3'},
    importService:async url=>{imports.push(url);load();return {openTechnicalService:context.openTechnicalService}}
  });
  const permission=read('src/permissions.js').match(/export function canRegisterTechnicalService\(profile\)\{[\s\S]*?\n\}/)[0];
  vm.runInContext(strip(permission),context);
  function load(){if(loaded)return;loaded=true;vm.runInContext(strip(read('src/technical_service_flow.js')),context)}
  function bindYouth(){
    let source=read('bundle/src__app_js.004.part');
    source=source.slice(source.indexOf('  document.querySelector(\'[data-action="new-service"]\')'),source.indexOf('  document.querySelector(\'[data-action="new-followup"]\')'));
    vm.runInContext('{const youthId="young-1";'+source.replace(/import\(('.*?')\)/g,'importService($1)')+'}',context);
  }
  function bindArea(){
    let source=read('bundle/src__app_js.005.part');
    source=source.slice(source.indexOf('  document.querySelector(\'[data-new-technical-service]\')?.addEventListener'));
    source=source.slice(0,source.indexOf('  const dashboard=await listTechnicalTeamDashboard(month);'));
    vm.runInContext(source.replace(/import\(('.*?')\)/g,'importService($1)'),context);
  }
  return {window,document:window.document,context,location,timers,saved,created,reads,imports,alerts,load,bindYouth,bindArea,
    get observations(){return observations},
    setActor(p){actor=p},setSession(fn){loadSession=fn},
    eval:code=>vm.runInContext(code,context),
    open:async options=>{load();return context.openTechnicalService(options)},
    click(selector){window.document.querySelector(selector).dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true}))},
    async drain(){const batch=[...timers.values()];timers.clear();for(const fn of batch)await fn();await settle()}
  };
}

const modal=s=>s.document.querySelector('#technical-service-flow-modal');
function select(s,name,value){
  const el=modal(s).querySelector(`[name="${name}"]`);
  if(el.tagName==='SELECT')el.querySelectorAll('option').forEach(o=>{if(o.value===value)o.setAttribute('selected','');else o.removeAttribute('selected')});
  else el.value=value;
}
function complete(s){
  select(s,'program_type','pvida');modal(s).querySelector('[name="program_type"]').dispatchEvent(new s.window.Event('change'));select(s,'reason','Orientação de teste');
  // linkedom representa checked por atributo; o navegador disponibiliza ambos.
  modal(s).querySelector('[name="professional_ids"]').checked=true;
}

test('assistente social e psicólogo abrem no primeiro clique pelo jovem, antes do carregamento do complemento',async t=>{
  for(const role of ['assistente_social','psicologo'])await t.test(role,async()=>{
    const pending=deferred(),s=setup({role,session:()=>pending.promise});s.bindYouth();
    s.click('[data-action="new-service"]');await settle();
    assert.equal(modal(s),null);assert.equal(s.alerts.length,0);
    pending.resolve({user:profile(role)});await settle();
    assert(modal(s));assert(modal(s).querySelector('[data-tsf-selected="young-1"]'));
    assert(modal(s).querySelector(`[name="professional_ids"][value="staff-${role}"][checked]`));
    assert.equal(s.location.hash,'#jovem/young-1');assert.equal(s.imports.length,1);
  });
});

test('Novo atendimento da Área Técnica carrega o mesmo formulário sem depender de observadores ou outra navegação',async()=>{
  const s=setup({role:'psicologo',hash:'#equipe-tecnica'});s.bindArea();
  s.click('[data-new-technical-service]');await settle();
  assert(modal(s));assert.equal(modal(s).querySelectorAll('[data-tsf-selected]').length,0);
  assert.match(modal(s).textContent,/Novo atendimento da Equipe Técnica/);
  assert.equal(s.observations,0);
  const search=modal(s).querySelector('[data-tsf-search]');search.value='12345678900';search.dispatchEvent(new s.window.Event('input'));
  s.click('[data-tsf-person="young-1"]');
  assert(modal(s).querySelector('[data-tsf-selected="young-1"]'));
});

test('apresenta apenas os três tipos e troca as perguntas conforme o anexo',async()=>{
  const s=setup();await s.open({initialYouthId:'young-1'});
  const program=modal(s).querySelector('[name="program_type"]');
  assert.deepEqual([...program.querySelectorAll('option')].map(o=>o.value).filter(Boolean),['pvida','ptrampo','outras-demandas']);
  select(s,'program_type','ptrampo');program.dispatchEvent(new s.window.Event('change'));
  assert(modal(s).querySelector('[data-tsf-field="work_desire"]'));
  assert(modal(s).querySelector('[data-tsf-field="monitor_short"]'));
  assert(modal(s).querySelector('[data-tsf-field="followup_type"]'));
  const work=modal(s).querySelector('[data-tsf-field="work_desire"] textarea');work.value='Trabalhar com informática';
  select(s,'program_type','outras-demandas');program.dispatchEvent(new s.window.Event('change'));
  assert(modal(s).querySelector('[data-tsf-field="demand"]'));
  select(s,'program_type','ptrampo');program.dispatchEvent(new s.window.Event('change'));
  assert.equal(modal(s).querySelector('[data-tsf-field="work_desire"] textarea').value,'Trabalhar com informática');
});

test('salva resposta do anexo correspondente e o complemento habilitado junto ao atendimento',async()=>{
  const s=setup();await s.open({initialYouthId:'young-1'});complete(s);
  modal(s).querySelector('[data-tsf-field="objectives"] textarea').value='Concluir os estudos';
  modal(s).querySelector('[data-tsf-enable-accompaniment]').checked=true;
  modal(s).querySelector('[data-tsf-complete-accompaniment]').checked=true;
  modal(s).querySelector('[data-tsf-field="mother_education"] select').value='Ensino médio completo';
  modal(s).querySelector('form').dispatchEvent(new s.window.Event('submit',{cancelable:true}));await settle();
  assert.equal(s.saved[0].program_type,'pvida');
  assert.equal(s.saved[0].documents.length,2);
  assert.equal(s.saved[0].documents[0].payload.objectives,'Concluir os estudos');
  assert.equal(s.saved[0].documents[0].record_state,'complete');
  assert.equal(s.saved[0].documents[1].form_slug,'acompanhamento');
  assert.equal(s.saved[0].documents[1].youth_id,'young-1');
  assert.equal(s.saved[0].documents[1].record_state,'complete');
});

test('cadastra jovem sem sair do atendimento usando o Formulário Inicial',async()=>{
  const s=setup({hash:'#equipe-tecnica'});await s.open();
  s.click('[data-tsf-new-person]');
  const reg=modal(s).querySelector('[data-tsf-registration]');
  reg.querySelector('[data-tsf-field="full_name"] input').value='Jovem Nova';
  reg.querySelector('[data-tsf-field="preferred_name"] input').value='Nova';
  reg.querySelector('[data-tsf-field="birth_date"] input').value='2007-02-03';
  s.click('[data-tsf-create-person]');await settle();
  assert.equal(s.created.length,1);assert.equal(s.created[0].full_name,'Jovem Nova');
  assert(modal(s).querySelector('[data-tsf-selected="young-3"]'));
});

test('acompanhamento preserva respostas anteriores e grava a evolução na evidência',async()=>{
  const s=setup();await s.open({initialYouthId:'young-1',initialProgram:'pvida',followupServiceId:'service-old'});
  assert.equal(modal(s).querySelector('[data-tsf-field="objectives"] textarea').value,'Meta anterior');
  modal(s).querySelector('[name="reason"]').value='Revisão do plano';
  modal(s).querySelector('[name="summary"]').value='Avançou na matrícula';
  modal(s).querySelector('[name="professional_ids"]').checked=true;
  modal(s).querySelector('form').dispatchEvent(new s.window.Event('submit',{cancelable:true}));await settle();
  assert.equal(s.saved[0].documents[0].payload._previous_service_id,'service-old');
  assert.equal(s.saved[0].documents[0].payload._technical_note,'Avançou na matrícula');
});

test('permissão é atualizada após troca de conta e revogação de perfil, sem reutilizar a sessão anterior',async()=>{
  const s=setup({role:'educador'});
  assert.equal(await s.open(),false);assert.equal(s.reads.length,0);
  s.setActor(profile('assistente_social'));assert.equal(await s.open(),true);
  s.click('[data-tsf-close]');s.setActor(profile('psicologo'));assert.equal(await s.open(),true);
  assert(modal(s).querySelector('[value="staff-psicologo"][checked]'));
  s.click('[data-tsf-close]');s.setActor(profile('psicologo',false));assert.equal(await s.open(),false);
  assert.equal(modal(s),null);assert.match(s.document.body.textContent,/não possui permissão/);
  s.setSession(async()=>null);assert.equal(await s.open(),false);
});

test('cliques simultâneos criam uma única janela e uma única carga dos jovens',async()=>{
  const pending=deferred(),s=setup({session:()=>pending.promise});
  const first=s.open(),second=s.open();pending.resolve({user:profile()});
  assert.equal(await first,true);assert.equal(await second,false);
  assert.equal(s.document.querySelectorAll('#technical-service-flow-modal').length,1);
  assert.equal(s.reads.filter(x=>x==='young_people').length,1);
});

test('salvar preserva jovem e técnico selecionados e atualiza a trajetória já aberta',async()=>{
  const s=setup();let refreshes=0;s.window.addEventListener('hashchange',()=>refreshes++);
  await s.open({initialYouthId:'young-1',returnYouthId:'young-1'});complete(s);
  modal(s).querySelector('form').dispatchEvent(new s.window.Event('submit',{cancelable:true}));await settle();
  assert.equal(s.saved.length,1);assert.deepEqual(Array.from(s.saved[0].youth_ids),['young-1']);
  assert.deepEqual(Array.from(s.saved[0].professional_ids),['staff-assistente_social']);
  assert.equal(s.saved[0].reason,'Orientação de teste');assert.equal(modal(s),null);assert.equal(refreshes,1);
});

test('falha ao salvar mantém dados e permite tentar novamente sem perder a seleção',async()=>{
  const s=setup();await s.open({initialYouthId:'young-1'});complete(s);
  s.context.createTechnicalService=async()=>{throw new Error('Conexão indisponível')};
  modal(s).querySelector('form').dispatchEvent(new s.window.Event('submit',{cancelable:true}));await settle();
  assert(modal(s));assert(modal(s).querySelector('[data-tsf-selected="young-1"]'));
  assert.equal(modal(s).querySelector('[name="reason"]').value,'Orientação de teste');
  assert.equal(modal(s).querySelector('[type="submit"]').disabled,false);
  assert.match(s.document.body.textContent,/Conexão indisponível/);
});

test('erro de perfil não bloqueia nova tentativa e links antigos preservam o jovem',async()=>{
  const s=setup({hash:'#equipe-tecnica?new=service&youth=young-1&return_youth=young-1&month=2026-10'});
  s.setSession(async()=>{throw new Error('Falha de rede')});s.load();await s.eval('autoOpen()');
  assert.equal(modal(s),null);assert.match(s.location.hash,/new=service/);
  s.setSession(async()=>({user:profile()}));await s.eval('autoOpen()');
  assert(modal(s).querySelector('[data-tsf-selected="young-1"]'));
  assert.equal(s.location.hash,'#equipe-tecnica?month=2026-10');
});

test('resposta tardia não abre atendimento sobre outro menu',async()=>{
  const pending=deferred(),s=setup({session:()=>pending.promise});
  const opening=s.open();s.location.hash='#metas';pending.resolve({user:profile()});
  assert.equal(await opening,false);assert.equal(modal(s),null);
});

test('proteção visual não cancela clique técnico enquanto o perfil ainda está carregando',async()=>{
  const pending=deferred(),s=setup({session:()=>pending.promise});
  const source=strip(read('src/youth_profile_enhancements.js'));
  // Módulos ES têm escopos próprios, como este bloco da VM.
  s.eval('{'+source+'}');s.bindYouth();
  s.click('[data-action="new-service"]');await settle();
  assert.equal(s.alerts.length,0);pending.resolve({user:profile()});await settle();
  assert(modal(s));
});
