const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/articulation_monitor.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export async function mountArticulationMonitor','async function mountArticulationMonitor');

function screen(rpc) {
  const {window}=parseHTML('<html><head></head><body><div class="content"></div></body></html>');
  Object.defineProperty(window.HTMLElement.prototype,'elements',{configurable:true,get(){return Object.fromEntries([...this.querySelectorAll('[name]')].map(el=>[el.name,el]))}});
  window.HTMLElement.prototype.reportValidity=()=>true;
  const ctx=vm.createContext({document:window.document,window,Intl,Date,Math,Number,String,Array,Promise,console,apiMode:()=> 'live',supabaseClient:()=>({rpc}),captureRoute:()=>()=>true});
  vm.runInContext(source+'\nglobalThis.mount=mountArticulationMonitor;',ctx);
  return {window,document:window.document,host:window.document.querySelector('.content'),mount:()=>ctx.mount(window.document.querySelector('.content'))};
}
const options={educators:[{name:'Talita'}],workshops:[{id:'w1',name:'Oficina A',active:true,is_reference:true}],rooms:[{id:'r1',name:'LabStudio',active:true}]};
const metrics={people:2,participations:3,average:1.5,days:2,timeline:[{date:'2026-10-01',people:2,participations:3}],ages:[{label:'18 a 24 anos',total:2}]};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function selectValue(select,value){for(const option of select.querySelectorAll('option'))option.removeAttribute('selected');select.querySelector(`option[value="${value}"]`).setAttribute('selected','');}

test('monta o panorama e mostra critérios, referências e métricas',async()=>{
  const calls=[];const s=screen(async(name,args)=>{calls.push({name,args});return {data:name==='articulation_monitor_options'?options:metrics,error:null}});
  await s.mount();assert.match(s.host.textContent,/Talita/);assert.match(s.host.textContent,/Jovens em geral/);assert.match(s.host.textContent,/Participações por dia/);assert.match(s.host.textContent,/Faixa etária/);assert.match(s.host.textContent,/1,5/);
  assert.equal(calls[1].args.p_scope,'all');assert.equal(calls[1].args.p_selected_id,null);
});
test('seleciona salas e oficinas e envia apenas o filtro escolhido',async()=>{
  const calls=[];const s=screen(async(name,args)=>{calls.push({name,args});return {data:name==='articulation_monitor_options'?options:metrics,error:null}});
  await s.mount();const scope=s.host.querySelector('[name="scope"]'),item=s.host.querySelector('[name="item"]'),form=s.host.querySelector('form');
  selectValue(scope,'room');scope.dispatchEvent(new s.window.Event('change'));assert.match(s.host.textContent,/LabStudio/);selectValue(item,'r1');form.dispatchEvent(new s.window.Event('submit',{cancelable:true}));await tick();
  assert.equal(calls.at(-1).args.p_scope,'room');assert.equal(calls.at(-1).args.p_selected_id,'r1');
  selectValue(scope,'reference');scope.dispatchEvent(new s.window.Event('change'));form.dispatchEvent(new s.window.Event('submit',{cancelable:true}));await tick();
  assert.equal(calls.at(-1).args.p_scope,'reference');assert.equal(calls.at(-1).args.p_selected_id,null);
});
test('erros de consulta são exibidos e não se transformam em dados vazios',async()=>{
  const s=screen(async(name)=>name==='articulation_monitor_options'?{data:options}:{error:{message:'Falha no banco'}});
  await s.mount();assert.match(s.host.textContent,/Não foi possível carregar os indicadores: Falha no banco/);
});
