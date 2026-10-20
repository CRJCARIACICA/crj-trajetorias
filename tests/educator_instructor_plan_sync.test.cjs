const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),test=require('node:test');
const {parseHTML}=require('linkedom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const strip=s=>s.replace(/^import .*;\n/gm,'');
const FIELDS=['objective','proposed_activities','resources'];
const id=n=>'12345678-1234-4234-8234-'+String(n).padStart(12,'0');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
const settle=async()=>{for(let i=0;i<60;i++)await Promise.resolve()};
function setup({respond,mode='live'}={}){
  const {window}=parseHTML('<html><head></head><body><section class="content"></section></body></html>');
  const document=window.document,host=document.querySelector('.content'),calls=[],events=[],timers=new Map(),observers=[];let timerId=0;
  const rows=[1,2].map(n=>({id:id(n+10),plan_id:id(30),lesson_number:n,scheduled_date:'2026-11-0'+n,included:true,
    objective:'Objetivo salvo '+n,proposed_activities:'Atividades salvas '+n,resources:'Recursos salvos '+n,updated_at:'2026-10-20T18:00:00+00:00'}));
  const location={hash:'#oficinas?view=planejamento&month=2026-11&plan='+id(30)};
  const client={
    from(table){
      const call={table,filters:[],orders:[]};calls.push(call);
      const query={
        select(columns){call.columns=columns;return query},
        eq(key,value){call.filters.push([key,value]);return query},
        order(key){call.orders.push(key);return query},
        then(resolve,reject){return Promise.resolve().then(()=>respond?respond(call):({data:rows.map(r=>({...r})),error:null})).then(resolve,reject)}
      };
      return query;
    },
    rpc(){throw new Error('A consulta não deve gravar dados')}
  };
  class Observer{
    constructor(callback){this.callback=callback;observers.push(this)}
    observe(){}
  }
  const context=vm.createContext({window,document,location,console,Date,Intl,Map,WeakMap,Promise,Event:window.Event,CustomEvent:window.CustomEvent,MutationObserver:Observer,
    apiMode:()=>mode,supabaseClient:()=>client,
    setTimeout:(fn,delay)=>{timers.set(++timerId,{fn,delay});return timerId},clearTimeout:n=>timers.delete(n)});
  vm.runInContext(strip(read('src/educator_instructor_plan_sync.js')),context);
  const evalCode=code=>vm.runInContext(code,context);
  const h={window,document,host,location,context,rows,calls,events,observers,timers,eval:evalCode,
    mount(plan=id(30)){
      host.innerHTML='<form id="workshop-plan-form" data-plan-id="'+plan+'" data-workshop-id="'+id(40)+'">'+
        '<div class="methodology-form-workspace"><div class="methodology-form-editor"><textarea name="general_objective">Objetivo geral em edição</textarea>'+
        '<textarea name="general_methodology">Metodologia em edição</textarea><textarea name="expected_results">Resultados em edição</textarea>'+
        '<textarea name="general_resources">Recursos gerais em edição</textarea><textarea name="observations">Observações gerais em edição</textarea>'+
        rows.map(r=>'<div data-plan-lesson="'+r.id+'"><input name="theme" value="Tema em edição">'+
          FIELDS.map(k=>'<div class="field"><textarea name="'+k+'">Valor antigo '+k+'</textarea><small class="wc-owner-note"></small></div>').join('')+
          '<textarea name="cfdh_transversal">CFDH em edição</textarea><textarea name="observations">Observações da aula em edição</textarea></div>').join('')+
        '<select name="status"><option value="rascunho">Rascunho</option></select><button class="btn primary">Salvar planejamento</button></div>'+
        '<aside data-workshop-plan-preview>Prévia</aside></div></form>';
      return h.form();
    },
    form:()=>host.querySelector('#workshop-plan-form'),
    card:n=>host.querySelector('[data-plan-lesson="'+rows[n].id+'"]'),
    field:(n,key)=>h.card(n).querySelector('[name="'+key+'"]'),
    status:()=>h.form().querySelector('[data-eips-status]'),
    button:()=>h.form().querySelector('[data-eips-refresh]'),
    sync:(options={manual:true,force:true})=>{context.testOptions=options;return evalCode('syncInstructorFields(testOptions)')},
    controls:()=>evalCode('ensureControls()'),
    async runScheduled(){
      const scheduled=[...timers].filter(([,t])=>t.delay===80);
      for(const [key,{fn}] of scheduled){timers.delete(key);fn()}
      await settle();
    }
  };
  window.addEventListener('crj:instructor-plan-synced',event=>events.push(JSON.parse(JSON.stringify(event.detail))));
  h.mount();
  return h;
}

test('ação principal fica no início do planejamento e consulta os blocos oficiais pelo plano atual',async()=>{
  const s=setup();s.controls();s.controls();
  assert.equal(s.form().querySelectorAll('[data-eips-actions]').length,1);
  assert.equal(s.form().firstElementChild.dataset.eipsActions,'1');
  assert.equal(s.button().type,'button');assert(s.button().classList.contains('primary'));
  assert.equal(s.button().textContent,'Buscar planejamento do oficineiro');
  assert.equal(s.status().getAttribute('aria-live'),'polite');
  s.button().dispatchEvent(new s.window.Event('click'));await settle();
  assert.equal(s.calls.length,1);
  assert.equal(s.calls[0].table,'workshop_plan_lessons');
  assert.deepEqual(s.calls[0].filters,[['plan_id',id(30)]]);
  assert(FIELDS.every(k=>s.calls[0].columns.split(',').includes(k)));
  assert.equal(s.field(0,'objective').value,'Objetivo salvo 1');
  assert.equal(s.button().disabled,false);
  assert.match(s.status().textContent,/2 bloco\(s\) completo\(s\)/);
});

test('cada aula recebe os três campos por ID oficial e os campos do educador permanecem intactos',async()=>{
  const s=setup({respond:()=>({data:[{...s.rows[1]}, {...s.rows[0]}, {...s.rows[0],id:id(99),objective:'Aula de outro bloco'}],error:null})});
  const before=[...s.form().querySelectorAll('input,textarea,select')].filter(n=>!FIELDS.includes(n.name)).map(n=>[n,n.value]);
  const result=s.sync();await result;
  for(let n=0;n<2;n++)for(const key of FIELDS){
    assert.equal(s.field(n,key).value,s.rows[n][key]);assert.equal(s.field(n,key).readOnly,true);
    assert.equal(s.field(n,key).getAttribute('aria-readonly'),'true');
  }
  for(const [node,value] of before)assert.equal(node.value,value);
  assert.equal(s.events[0].matched,2);assert.equal(s.events[0].changed,6);assert.equal(s.events[0].unmatched,0);
});

test('a prévia é avisada depois de todos os blocos e mantém o mesmo formulário',async()=>{
  const s=setup(),form=s.form(),snapshots=[];let changes=0;
  form.addEventListener('input',()=>snapshots.push(s.rows.map((row,n)=>FIELDS.map(k=>s.field(n,k).value))));
  form.addEventListener('change',()=>{changes++});
  await s.sync();
  assert.equal(s.form(),form);
  assert.deepEqual(snapshots,[s.rows.map(row=>FIELDS.map(k=>row[k]))]);assert.equal(changes,1);
});

test('cada clique principal busca novamente o conteúdo recém-salvo, sem reutilizar cache',async()=>{
  const s=setup();await s.sync();s.rows[0].objective='Objetivo revisado no banco';
  s.button().dispatchEvent(new s.window.Event('click'));await settle();
  assert.equal(s.calls.length,2);assert.equal(s.field(0,'objective').value,'Objetivo revisado no banco');
  await s.sync();
  assert.equal(s.calls.length,3);assert.match(s.status().textContent,/já estavam atualizados/);
});

test('falha de consulta preserva descrições e permite tentar novamente no próprio botão',async()=>{
  let fail=true;const s=setup({respond:()=>fail?{data:null,error:{message:'Offline'}}:{data:s.rows,error:null}});
  const old=s.field(0,'objective').value;await s.sync();
  assert.equal(s.field(0,'objective').value,old);assert.equal(s.events.length,0);
  assert.match(s.status().textContent,/campos atuais foram preservados/);assert.equal(s.button().disabled,false);
  fail=false;s.button().dispatchEvent(new s.window.Event('click'));await settle();
  assert.equal(s.field(0,'objective').value,s.rows[0].objective);assert.equal(s.calls.length,2);
});

test('blocos ausentes, excluídos ou de outro plano não apagam os campos exibidos',async()=>{
  const s=setup({respond:()=>({data:[{...s.rows[0],plan_id:id(31)},{...s.rows[1],included:false}],error:null})});
  const old=FIELDS.map(k=>s.field(0,k).value);await s.sync();
  assert.deepEqual(FIELDS.map(k=>s.field(0,k).value),old);
  assert.match(s.status().textContent,/Nenhum bloco salvo corresponde/);assert.equal(s.events.length,0);
});

test('campos pendentes refletem o valor oficial salvo e são informados ao educador',async()=>{
  const s=setup();s.rows[0].proposed_activities=null;s.rows[0].resources='';await s.sync();
  assert.equal(s.field(0,'proposed_activities').value,'');assert.equal(s.field(0,'resources').value,'');
  assert.equal(s.events[0].filled,4);assert.equal(s.events[0].pending,2);assert.equal(s.events[0].completed,1);
  assert.match(s.status().textContent,/2 campo\(s\) ainda aguardam preenchimento/);
  assert.match(s.field(0,'resources').closest('.field').textContent,/ainda não salvou/);
});

test('trocar de planejamento durante a consulta já permite buscar o novo plano sem aguardar o anterior',async()=>{
  const gate=deferred();
  const s=setup({respond:call=>call.filters[0][1]===id(30)?gate.promise:
    {data:s.rows.map(r=>({...r,plan_id:id(31),objective:'Plano novo'})),error:null}});
  const oldForm=s.form(),first=s.sync();await settle();
  s.location.hash='#oficinas?view=planejamento&plan='+id(31);s.mount(id(31));
  await s.sync();assert.equal(s.calls.length,2);assert.equal(s.field(0,'objective').value,'Plano novo');
  gate.resolve({data:s.rows,error:null});await first;
  assert.equal(oldForm.isConnected,false);assert.equal(s.field(0,'objective').value,'Plano novo');
  assert.equal(s.events.length,1);assert.equal(s.events[0].planId,id(31));
});

test('remontar o mesmo plano invalida a resposta do formulário antigo e executa a consulta inicial do novo',async()=>{
  const gate=deferred();let count=0;
  const s=setup({respond:()=>++count===1?gate.promise:{data:s.rows.map(r=>({...r,objective:'Conteúdo atual'})),error:null}});
  const old=s.form(),first=s.sync();await settle();s.mount();
  s.eval('schedule()');await s.runScheduled();
  assert.notEqual(s.form(),old);assert.equal(s.calls.length,2);
  gate.resolve({data:s.rows.map(r=>({...r,objective:'Resposta antiga'})),error:null});await first;
  assert.equal(s.field(0,'objective').value,'Conteúdo atual');assert.equal(s.events.length,1);
});

test('navegar para outra aba impede a resposta atrasada de alterar campos ou emitir sucesso',async()=>{
  const gate=deferred(),s=setup({respond:()=>gate.promise});
  const old=s.field(0,'objective').value,first=s.sync();await settle();
  s.location.hash='#dashboard';gate.resolve({data:s.rows,error:null});await first;
  assert.equal(s.field(0,'objective').value,old);assert.equal(s.events.length,0);
  assert.equal(s.document.querySelectorAll('.ip-toast').length,0);
});

test('uma solicitação manual durante uma consulta é atendida em seguida',async()=>{
  const gate=deferred();let count=0;
  const s=setup({respond:()=>++count===1?gate.promise:{data:s.rows.map(r=>({...r,objective:'Consulta mais recente'})),error:null}});
  const first=s.sync();await settle();await s.sync();
  gate.resolve({data:s.rows,error:null});await first;await settle();
  assert.equal(s.calls.length,2);assert.equal(s.field(0,'objective').value,'Consulta mais recente');
});

test('observar atualizações de interface não repete consultas falhas e o retorno à aba refaz a busca',async()=>{
  const s=setup({respond:()=>({data:null,error:{message:'Offline'}})});
  await s.runScheduled();assert.equal(s.calls.length,1);
  for(let i=0;i<4;i++){s.observers[0].callback();await s.runScheduled()}
  assert.equal(s.calls.length,1);
  s.window.dispatchEvent(new s.window.Event('focus'));
  s.observers[0].callback();await s.runScheduled();
  assert.equal(s.calls.length,2);
});

test('resposta inválida e banco desconectado preservam o formulário e mostram retorno claro',async()=>{
  const s=setup({respond:()=>({data:null,error:null})});await s.sync();
  assert.match(s.status().textContent,/Não foi possível buscar/);assert.equal(s.field(0,'objective').value,'Valor antigo objective');
  const offline=setup({mode:'demo'});await offline.sync();
  assert.equal(offline.calls.length,0);assert.match(offline.status().textContent,/Banco ainda não conectado/);
});

test('o botão fica indisponível em formulário sem identificador de planejamento',async()=>{
  const s=setup();s.form().dataset.planId='';s.controls();await s.sync();
  assert.equal(s.button().disabled,true);assert.equal(s.calls.length,0);
  assert.match(s.status().textContent,/planejamento mensal salvo/);
});

test('consulta é carregada em todos os caminhos do planejamento do educador e de oficinas',()=>{
  const source=read('src/feature_loader.js'),match=source.match(/const ROUTE_FEATURES=(\{[\s\S]*?\n\});/);
  assert(match);const routes=vm.runInNewContext('('+match[1]+')');
  for(const name of ['educador','planejamento-educador','oficinas','oficina','workshops']){
    assert(routes[name].critical.includes('educator_instructor_plan_sync'),name);
  }
});
