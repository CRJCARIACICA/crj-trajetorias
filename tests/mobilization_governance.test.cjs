const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const test=require('node:test'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const clean=s=>s.replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,'');
const clone=x=>JSON.parse(JSON.stringify(x));
function planner(){const ctx=vm.createContext({Intl,Date,Map,Set,console});vm.runInContext(clean(read('src/mobilization_planning.js')),ctx);return arg=>{ctx.input=arg;return clone(vm.runInContext('suggestMobilizations(input)',ctx))};}
const strategy=(id,overrides={})=>({id,reference_month:'2026-11-01',title:'Estratégia '+id,action_type:'Mobilização',channel:'WhatsApp',reference_user_id:id,collaborator_ids:[],request_ids:['r'+id],objective:'Divulgar a ação',proposed_date:'2026-11-03',deadline:'2026-11-06',review_status:'approved',...overrides});
const input=strategies=>({strategies,requests:strategies.map(s=>({id:s.request_ids[0],planned_date:'2026-11-10'})),month:'2026-11',today:'2026-11-01'});
test('WhatsApp reúne várias ações e articuladores em uma mobilização por canal',()=>{
 const result=planner()(input([strategy('a'),strategy('b')]));assert.equal(result.actions.length,1);
 assert.deepEqual(result.actions[0].request_ids,['ra','rb']);assert.deepEqual(result.actions[0].strategy_ids,['a','b']);assert.deepEqual(result.actions[0].collaborator_ids,['b']);
 assert.match(result.actions[0].documents_after,/Relatório/);assert.match(result.actions[0].preparation_steps,/1\./);
});
test('visitas a escolas diferentes e canais diferentes não são confundidos',()=>{
 const result=planner()(input([strategy('a',{channel:'Escola',location:'Escola A'}),strategy('b',{channel:'Escola',location:'Escola B'}),strategy('c',{channel:'Redes sociais'})]));
 assert.equal(result.actions.length,3);assert.deepEqual(new Set(result.actions.map(x=>x.location)),new Set(['Escola A','Escola B','CRJ / comunicação remota']));
});
test('feriados, reunião geral, prazo e conflito dos acompanhantes limitam a distribuição',()=>{
 const s=strategy('a',{proposed_date:'2026-11-02',deadline:'2026-11-03',collaborator_ids:['educator']});
 const x=input([s]);x.specialDays=[{calendar_date:'2026-11-02',name:'Finados',closure_policy:'auto_closed'}];x.busy=[{id:'lesson',date:'2026-11-03',start_time:'10:00',end_time:'21:00',title:'Aula',user_ids:['educator']}];
 const result=planner()(x);assert.equal(result.actions.length,0);assert.equal(result.unplaced.length,1);assert.match(result.unplaced[0].reason,/horário disponível/);
 x.busy=[];assert.equal(planner()(x).actions[0].scheduled_date,'2026-11-03');
});
test('inclui o máximo de articuladores disponíveis sem tirar educadores de outras ações',()=>{
 const x=input([strategy('a')]);x.people=[{id:'a',role:'articulador',active:true},{id:'b',role:'articulador',active:true},{id:'c',role:'articulador',active:true},{id:'educator',role:'educador',active:true}];
 x.busy=[{date:'2026-11-03',start_time:'14:00',end_time:'15:00',user_ids:['b']}];
 const a=planner()(x).actions[0];assert.equal(a.start_time,'15:00');assert.deepEqual(a.collaborator_ids,['b','c']);
});
test('propostas recusadas e ações já distribuídas não entram novamente',()=>{
 const a=strategy('a'),b=strategy('b',{review_status:'rejected'}),x=input([a,b]);x.existing=[{...a,id:'saved',strategy_ids:['a'],scheduled_date:'2026-11-03',start_time:'14:00',end_time:'15:00'}];
 const before=clone(x.existing);const result=planner()(x);assert.equal(result.actions.length,0);assert.deepEqual(x.existing,before);
});
function ui(hash='#articulacao?view=plano-geral'){
 const {window}=parseHTML('<html><head></head><body><section class="content"></section></body></html>'),storage=new Map();
 const ctx=vm.createContext({window,document:window.document,location:{hash},Intl,Date,Map,Set,console,URLSearchParams,
   localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
   FormData:class{constructor(form){this.fields=[...form.querySelectorAll('[name]')].filter(x=>x.type!=='checkbox'||x.checked).map(x=>[x.name,x.value])}[Symbol.iterator](){return this.fields[Symbol.iterator]()}},
   setTimeout:fn=>0,clearTimeout:()=>{},alert:()=>{},apiMode:()=> 'live',supabaseClient:()=>({})});
 vm.runInContext(clean(read('src/mobilization_planning.js')),ctx);
 vm.runInContext(clean(read('src/mobilization_governance.js')).replace(/const monthNow=/,'const mobMonthNow=').replaceAll('monthNow()','mobMonthNow()'),ctx);
 return {ctx,window,document:window.document,storage,eval:code=>vm.runInContext(code,ctx)};
}
function data(){return {plan:{id:'p',title:'Plano do mês',status:'published',revision:2},people:[{id:'a',display_name:'Articulador A',role:'articulador'},{id:'b',display_name:'Articulador B',role:'articulador'}],requests:[{id:'r',source_title:'Oficina'}],scope:[{id:'r',source_title:'Oficina'}],individualPlans:[],strategies:[],executions:[],interests:[],demandActions:[],versions:[],busy:[],specialDays:[],actions:[{id:'one',title:'Minha mobilização',reference_user_id:'a',collaborator_ids:[],request_ids:['r'],scheduled_date:'2026-11-03',start_time:'14:00',end_time:'15:00',channel:'WhatsApp',location:'CRJ'},{id:'two',title:'Mobilização de outro colega',reference_user_id:'b',collaborator_ids:[],request_ids:[],scheduled_date:'2026-11-04',start_time:'14:00',end_time:'15:00',channel:'Escola',location:'Escola B'}]};}
test('articulador vê suas ações e pode alternar para todas as respostas da coordenação',()=>{
 const s=ui();s.ctx.fixture={host:s.document.querySelector('.content'),me:{id:'a',role:'articulador'},month:'2026-11',data:data(),coordination:false};
 s.eval('render(fixture)');assert(s.document.querySelector('[data-mob-complete="one"]'));assert.equal(s.document.querySelector('[data-mob-complete="two"]'),null);
 // linkedom does not implement the browser select.value getter; set the filter explicitly.
 const scope=s.document.querySelector('[name="scope_filter"]');Object.defineProperty(scope,'value',{value:'mine',writable:true});s.eval('applyFilters(fixture)');assert.equal(s.document.querySelector('[data-mob-filter-action="two"]').hidden,true);
 scope.value='all';s.eval('applyFilters(fixture)');assert.equal(s.document.querySelector('[data-mob-filter-action="two"]').hidden,false);
});
test('coordenação recebe colunas de aprovação e edição de cada proposta',()=>{
 const s=ui('#coordenacao-articulacao?view=mobilizacao&section=estrategias');const d=data();d.strategies=[strategy('a',{created_by:'a'})];
 s.ctx.fixture={host:s.document.querySelector('.content'),me:{id:'coord',role:'coordenacao_articulacao'},month:'2026-11',data:d,coordination:true};s.eval('render(fixture)');
 assert.match(s.document.querySelector('.mob-table').textContent,/Articulador de referência/);assert.match(s.document.querySelector('.mob-table').textContent,/Meio de comunicação/);assert(s.document.querySelector('[data-mob-review="a"]'));assert(s.document.querySelector('[data-mob-edit-strategy="a"]'));
});
test('falha no salvamento mantém formulário e rascunho para tentar novamente',async()=>{
 const s=ui();s.eval("context={me:{id:'a'}};globalThis.testModal=showModal('Editar estratégia',text('Objetivo','objective','Texto preservado'),async()=>{throw new Error('Conflito de edição')},{key:'strategy:test'})");
 const form=s.document.querySelector('#mob-modal form'),b=form.querySelector('[type="submit"]');await form.onsubmit({preventDefault(){},submitter:b});
 assert.equal(form.querySelector('[name="objective"]').value,'Texto preservado');assert.match(form.querySelector('[data-mob-form-error]').textContent,/Conflito de edição/);assert.equal(b.disabled,false);assert.equal(s.storage.size,1);assert(s.document.querySelector('#mob-modal'));
});
test('estratégia identifica solicitações pendentes e preserva as que já têm resposta',()=>{
 const s=ui('#coordenacao-articulacao?view=mobilizacao&section=estrategias'),d=data();
 d.requests=[{id:'r1',source_title:'Oficina A',status:'planejado',planned_date:'2026-11-10'},{id:'r2',source_title:'Oficina B',status:'solicitado',planned_date:'2026-11-11'},{id:'r3',source_title:'Encerrada',status:'concluido'}];
 d.individualPlans=[{id:'p1',request_id:'r1',status:'planejado'}];
 s.ctx.fixture={host:s.document.querySelector('.content'),me:{id:'coord',role:'coordenacao_articulacao'},month:'2026-11',data:d,coordination:true};
 s.ctx.existing={id:'strategy1',title:'Estratégia',source_plan_id:'p1',request_ids:['r1'],revision:1,review_status:'approved'};
 s.eval('context=fixture; editStrategy(fixture,existing)');const modal=s.document.querySelector('#mob-modal');
 assert.match(modal.textContent,/solicitações pendentes selecionadas recebem uma resposta/);assert.match(modal.textContent,/Oficina A.*Já respondida/);assert.match(modal.textContent,/Oficina B.*Aguardando resposta/);assert.doesNotMatch(modal.textContent,/Encerrada/);
 assert(modal.querySelector('input[name="request_ids"][value="r1"]'));assert(modal.querySelector('input[name="request_ids"][value="r2"]'));
});
test('salvar estratégia envia todas as solicitações selecionadas numa única operação',async()=>{
 const s=ui('#coordenacao-articulacao?view=mobilizacao&section=estrategias'),d=data(),calls=[];
 d.requests=[{id:'r1',source_title:'Oficina A',status:'planejado',planned_date:'2026-11-10'},{id:'r2',source_title:'Oficina B',status:'solicitado',planned_date:'2026-11-11'}];
 d.individualPlans=[{id:'p1',request_id:'r1',status:'planejado'}];s.ctx.fixture={host:s.document.querySelector('.content'),me:{id:'coord',role:'coordenacao_articulacao'},month:'2026-11',data:d,coordination:true};
 s.ctx.existing={id:'strategy1',title:'Estratégia',source_plan_id:'p1',request_ids:['r1'],revision:4,review_status:'approved'};
 s.ctx.supabaseClient=()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:{ok:true}}}});
 s.eval('reload=async()=>{}; context=fixture; editStrategy(fixture,existing)');const form=s.document.querySelector('#mob-modal form');
 for(const input of form.querySelectorAll('input[name="request_ids"]')){input.checked=true;input.setAttribute('checked','')}
 const btn=form.querySelector('[type="submit"]');await form.onsubmit({preventDefault(){},submitter:btn});
 assert.equal(calls.length,1);assert.equal(calls[0].name,'mobilization_command');assert.equal(calls[0].args.p_command,'save_strategy');assert.deepEqual([...calls[0].args.p_payload.request_ids],['r1','r2']);assert.equal(calls[0].args.p_payload.expected_revision,4);
});
test('plano geral distingue solicitação respondida de mobilização organizada',()=>{
 const s=ui(),d=data();d.requests=[{id:'r',source_title:'Oficina',planned_date:'2026-11-10',status:'planejado'}];d.scope=d.requests;d.individualPlans=[{request_id:'r',status:'planejado'}];d.actions=[];d.strategies=[strategy('a',{request_ids:['r']})];
 s.ctx.fixture={host:s.document.querySelector('.content'),me:{id:'coord',role:'coordenacao_articulacao'},month:'2026-11',data:d,coordination:false};
 s.eval('render(fixture)');const page=s.document.querySelector('.content').textContent;assert.match(page,/Respondida · aguardando organização/);assert.match(page,/Estratégias vinculadas às solicitações/);assert.match(page,/Oficina/);
});
function renderer(){const ctx=vm.createContext({Intl,Date,Map,Set,console,Uint8Array,DataView,atob,BorderStyle:{SINGLE:1},AlignmentType:{LEFT:1,CENTER:2},Deno:{serve:()=>{}}});const source=read('supabase/functions/crj-export-document-safe/index.ts').replace(/^import[\s\S]*?from\s+["'][^"']+["'];?\s*/gm,'');vm.runInContext(source,ctx);return ctx;}
test('evidência mensal e relatório incluem etapas, nomes e documentos sem expor IDs internos',()=>{
 const c=renderer();c.fixture={title:'Mês',reference_month:'2026-11-01',coordinator_name:'Coordenação',status:'published',revision:2,actions:[{title:'WhatsApp',reference_name:'Referência',collaborator_names:['Educador'],requested_actions:['Jiu-jitsu','PVida'],preparation_steps:'ANTES',execution_steps:'DURANTE',documents_after:'DEPOIS',resources:'RECURSO',documents_before:'FORMULÁRIO'}]};
 const spec=vm.runInContext('mobilizationSpec("plano-geral-mobilizacao",fixture)',c),json=JSON.stringify(spec);for(const value of ['ANTES','DURANTE','DEPOIS','RECURSO','FORMULÁRIO','Referência','Educador','Jiu-jitsu','PVida'])assert(json.includes(value));assert(!json.includes('reference_user_id'));
 c.fixture={action_name:'Nome',executed_date:'2026-11-03',location:'Escola',mobilization_type:'Visita',positives:'Positivo',negatives:'Negativo',observations:'Observação'};
 const report=vm.runInContext('mobilizationSpec("relatorio-mobilizacao-acao",fixture)',c);assert(JSON.stringify(report).includes('Observação'));assert(JSON.stringify(report).includes('03/11/2026'));
});
test('PDF preserva até o final de etapas longas ao continuar em outra página',async()=>{
 const c=renderer(),texts=[],pages=[];c.PDFDocument={create:async()=>({embedFont:async()=>({}),embedPng:async()=>({scale:()=>({width:300,height:50})}),addPage(){const p={getHeight:()=>595.28,drawImage(){},drawRectangle(){},drawText:(t,o)=>{assert(o.y>=0);texts.push(t)}};pages.push(p);return p},getPages:()=>pages,getPageCount:()=>pages.length,save:async()=>Buffer.from('%PDF-test')})};c.StandardFonts={Helvetica:1,HelveticaBold:2};c.rgb=()=>({});c.fixture={readableRows:true,title:'Plano de mobilização',sections:[{rows:[['Etapas','etapa '.repeat(3000)+'FIM_DAS_ETAPAS']]}]};
 await vm.runInContext('makePdf(fixture,{type:"png",bytes:new Uint8Array([1])})',c);assert(pages.length>1);assert(texts.some(t=>t.includes('FIM_DAS_ETAPAS')));
});
