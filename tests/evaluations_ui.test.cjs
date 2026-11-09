const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const test=require('node:test'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const formSource=fs.readdirSync(path.join(root,'bundle')).filter(x=>/^src__forms_js\..*\.part$/.test(x)).sort().map(x=>read('bundle/'+x)).join('').replace(/\bexport /g,'');
const sharedSource=read('src/evaluation_shared.js').replace(/^import .*;\s*$/gm,'').replace(/\bexport /g,'');
const publicSource=read('src/evaluation_public.js').replace(/^import .*;\s*$/gm,'').replace(/async function db\(\)\{[\s\S]*?\n\}/,'async function db(){return fakeDb;}');
const expose='globalThis.shared={evaluationFields,evaluationTitle,evaluationFormHtml,evaluationValues,evaluationInsights,evaluationInsightsHtml,EVALUATION_SLUGS};';
const settle=async()=>{for(let i=0;i<30;i++)await Promise.resolve()};
function context(extra={}){const c=vm.createContext({Date,Intl,String,Number,Map,Set,Object,Array,Math,URL,URLSearchParams,console,...extra});vm.runInContext(formSource+'\n'+sharedSource+'\n'+expose,c);return c}

test('os três anexos mantêm perguntas próprias e identificam automaticamente a oficina',()=>{
 const c=context(),s=c.shared;
 assert.equal(s.evaluationFields(s.EVALUATION_SLUGS.workshop).filter(x=>x.type==='rating').length,5);
 assert.equal(s.evaluationFields(s.EVALUATION_SLUGS.youth).filter(x=>x.type==='rating').length,10);
 assert.equal(s.evaluationFields(s.EVALUATION_SLUGS.team).filter(x=>x.type==='rating').length,8);
 const {document}=parseHTML(s.evaluationFormHtml(s.EVALUATION_SLUGS.workshop,{workshopName:'Capoeira <turma>'}));
 assert.equal(document.querySelector('[name=class_name]').getAttribute('value'),'Capoeira <turma>');
 assert.equal(document.querySelector('[name=class_name]').hasAttribute('readonly'),true);
 assert.equal(document.querySelector('[name=activity_type]').getAttribute('value'),'Oficina');
 assert.equal(document.querySelector('[name=other_activity]'),null);
});

test('insights usam denominador de cada pergunta, separam anexos e protegem comentários',()=>{
 const c=context(),s=c.shared,rows=[{payload:{organization:'Bom/Boa',space:'Ruim',notes:'<script>oi</script>'}},{payload:{organization:'Ótimo(a)'}},{payload:{organization:'Regular'}}];
 const result=s.evaluationInsights(s.EVALUATION_SLUGS.workshop,rows);
 assert.equal(result.total,3);assert.equal(result.questions.find(x=>x.key==='organization').positivePercent,67);
 assert.equal(result.questions.find(x=>x.key==='space').total,1);assert.equal(result.questions.find(x=>x.key==='space').positivePercent,0);
 assert.equal(result.highest.key,'organization');assert.equal(result.lowest.key,'space');
 const html=s.evaluationInsightsHtml(s.EVALUATION_SLUGS.workshop,rows);
 assert.match(html,/&lt;script&gt;oi&lt;\/script&gt;/);assert.doesNotMatch(html,/<script>/);
 assert.equal(s.evaluationInsights(s.EVALUATION_SLUGS.youth,[]).total,0);
});

test('jovens abrem link sem login, reusam a chave em falhas e outras pessoas podem responder no mesmo dispositivo',async()=>{
 const {window}=parseHTML('<html><body><div id="evaluation-public"></div></body></html>');
 const token='00000000-0000-4000-8000-000000000111',storage=new Map(),calls=[];let attempt=0,ids=0;
 const fakeDb={rpc:async(name,args)=>{
  calls.push({name,args});
  if(name==='evaluation_public_context')return {data:{form_slug:'avaliacao-atividades',reference_month:'2026-11-01',workshop_name:'Capoeira'}};
  if(++attempt===1)return {error:{message:'Falha temporária'}};
  return {data:{received:true}};
 }};
 const c=context({window,document:window.document,location:{hash:'#'+token},fakeDb,CONFIG:{},
  sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
  crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++ids).padStart(12,'0')}`}});
 c.esc=c.shared.escapeEvaluation||vm.runInContext('escapeEvaluation',c);
 vm.runInContext(publicSource,c);await settle();
 let form=window.document.querySelector('[data-evaluation-form]');assert(form);
 const bind=()=>{form=window.document.querySelector('[data-evaluation-form]');Object.defineProperty(form,'elements',{value:{namedItem:key=>key==='organization'?{value:'Bom/Boa'}:key==='class_name'?{value:'Capoeira'}:key==='activity_type'?{value:'Oficina'}:null}})};
 bind();form.dispatchEvent(new window.Event('submit',{cancelable:true}));await settle();assert.match(window.document.querySelector('[data-evaluation-error]').textContent,/Falha temporária/);
 form.dispatchEvent(new window.Event('submit',{cancelable:true}));await settle();assert.match(window.document.querySelector('#evaluation-public').textContent,/Avaliação enviada/);
 const first=calls.filter(x=>x.name==='evaluation_public_submit');assert.equal(first.length,2);assert.equal(first[0].args.p_response_key,first[1].args.p_response_key);
 window.document.querySelector('[data-evaluation-another]').click();bind();form.dispatchEvent(new window.Event('submit',{cancelable:true}));await settle();
 const sent=calls.filter(x=>x.name==='evaluation_public_submit');assert.notEqual(sent[2].args.p_response_key,sent[1].args.p_response_key);
});

test('menu mostra os anexos do mês, cria links independentes e abre resultados da oficina selecionada',async()=>{
 const {window}=parseHTML('<html><head></head><body><section class="content"></section></body></html>');
 const location={hash:'#avaliacoes?month=2026-11',href:'https://crj.example/crj-trajetorias/#avaliacoes?month=2026-11'};
 const state={workshops:[{id:'w1',name:'Capoeira',active:true},{id:'w2',name:'Jiu-jitsu',active:true}],cycles:[],responses:[]};
 const fakeClient={from(table){
  const q={filters:{},start:0,end:999,patch:null,select(){return this},eq(k,v){this.filters[k]=v;return this},order(){return this},range(a,b){this.start=a;this.end=b;return this},update(p){this.patch=p;return this},
   then(resolve,reject){try{
    const list=table==='workshops'?state.workshops:table==='evaluation_monthly_cycles'?state.cycles:state.responses;
    const rows=list.filter(x=>Object.entries(this.filters).every(([k,v])=>x[k]===v));
    if(this.patch)rows.forEach(x=>Object.assign(x,this.patch));
    return Promise.resolve({data:rows.slice(this.start,this.end+1),error:null}).then(resolve,reject);
   }catch(e){return Promise.reject(e).then(resolve,reject)}}};return q;
 },rpc:async(name,arg)=>{
  if(name==='evaluation_ensure_month'){
   let item=state.cycles.find(x=>x.reference_month===arg.p_month&&x.form_slug===arg.p_slug&&x.workshop_id===arg.p_workshop_id);
   if(!item){item={id:'id'+(state.cycles.length+1),form_slug:arg.p_slug,reference_month:arg.p_month,workshop_id:arg.p_workshop_id,public_token:'token'+(state.cycles.length+1),is_open:true};state.cycles.push(item)}return {data:item};
  }
  return {data:{saved:true}};
 }};
 const c=context({window,document:window.document,location,alert:message=>{throw Error(message)},navigator:{clipboard:{writeText:async()=>{}}},
  getSession:async()=>({user:{id:'staff',role:'educador',active:true,display_name:'Educador'}}),supabaseClient:()=>fakeClient,captureRoute:()=>()=>location.hash.startsWith('#avaliacoes'),
  setTimeout:()=>0,clearTimeout:()=>{}});
 c.esc=vm.runInContext('escapeEvaluation',c);
 const workspace=read('src/evaluation_workspace.js').replace(/^import .*;\s*$/gm,'');
 vm.runInContext(workspace+'\nglobalThis.renderEvaluationWorkspace=render;',c);
 await c.renderEvaluationWorkspace();
 assert.match(window.document.querySelector('.content').textContent,/Capoeira/);assert.match(window.document.querySelector('.content').textContent,/Anexo 12/);assert.match(window.document.querySelector('.content').textContent,/Anexo 13/);
 const generate=window.document.querySelector('[data-ev-create][data-workshop="w1"]');generate.click();await settle();
 assert.equal(state.cycles.length,1);assert.equal(state.cycles[0].reference_month,'2026-11-01');assert.equal(state.cycles[0].workshop_id,'w1');
 const link=window.document.querySelector('.ev-link input');assert.match(link.value,/avaliacao\.html#token1/);
 state.responses.push({id:'r1',cycle_id:'id1',payload:{organization:'Ótimo(a)'},created_at:'2026-11-09T00:00:00Z'});
 window.document.querySelector('[data-ev-insights="id1"]').click();await settle();
 assert.match(window.document.querySelector('.ev-modal').textContent,/1\s*resposta\(s\) recebida\(s\)/);
 assert.match(window.document.querySelector('.ev-modal').textContent,/100%/);
});
