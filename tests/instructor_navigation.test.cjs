const {parseHTML}=require('linkedom');
const vm=require('node:vm');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const test=require('node:test');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/instructor_management.js'),'utf8').replace(/^import .*;\n/,'').replace(/\nboot\(\);\s*$/,'');
function setup(){
 const {window}=parseHTML('<html><head></head><body></body></html>');
 const people=[{id:'a',display_name:'Alice',role:'oficineiro',active:true},{id:'b',display_name:'Bruno',role:'oficineiro',active:true},{id:'r',display_name:'Rafael',role:'oficineiro',active:true}];
 const extensions=people.map(p=>({user_id:p.id,email:p.id+'@example.test',phone:p.id+'-phone',specialty:p.id+'-area'}));
 const calls=[],actor={id:'educator',role:'educador',active:true};
 const client={auth:{getUser:async()=>({data:{user:{id:actor.id}}})},from(table){
  const filters=[];let one=false;
  const q={select(){return q},eq(k,v){filters.push([k,v]);return q},not(){return q},order(){return q},maybeSingle(){one=true;return q},then(resolve,reject){
   let data=table==='profiles'?(filters.some(([k])=>k==='id')?[actor]:people):table==='workshop_instructor_profiles'?extensions:[];
   return Promise.resolve({data:one?data[0]:data,error:null}).then(resolve,reject);
  }};return q;
 },rpc:async(name,args)=>{calls.push({name,args});return {error:null}}};
 class FormData{constructor(form){this.data=new Map([...form.querySelectorAll('[name]')].map(n=>[n.name,n.value]))}get(k){return this.data.get(k)??null}}
 const context=vm.createContext({window,document:window.document,location:{hash:'#oficinas?view=oficineiros'},apiMode:()=> 'live',supabaseClient:()=>client,FormData,console,Map,Set,setTimeout:()=>0});
 vm.runInContext(source,context);
 return {window,document:window.document,context,calls,people,open:id=>window.CRJInstructorManagement.open(id)};
}
const form=s=>s.document.querySelector('#im-edit-form');
const field=(s,name)=>form(s).querySelector(`[name="${name}"]`);
const click=(s,selector)=>s.document.querySelector(selector).dispatchEvent(new s.window.Event('click'));
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('each Edit opens exactly the requested instructor and clears stale Rafael forms',async()=>{
 const s=setup();
 for(const p of s.people){
  s.document.body.insertAdjacentHTML('beforeend','<div id="modal">Rafael stale form</div><div id="modal">Rafael stale form</div>');
  await s.open(p.id);
  assert.equal(field(s,'display_name').value,p.display_name);
  assert.equal(form(s).dataset.imInstructorId,p.id);
  assert.equal(field(s,'email').value,p.id+'@example.test');
  assert.equal(s.document.querySelectorAll('#modal').length,0);
  assert.equal(s.document.querySelectorAll('#instructor-management-modal').length,1);
 }
});
test('previous/next reaches every instructor and retains separate unsaved changes',async()=>{
 const s=setup();await s.open('a');
 assert(s.document.querySelector('[data-im-prev]').hasAttribute('disabled'));
 field(s,'phone').value='unsaved-alice';field(s,'phone').dispatchEvent(new s.window.Event('input'));
 click(s,'[data-im-next]');assert.equal(field(s,'display_name').value,'Bruno');assert.equal(field(s,'phone').value,'b-phone');
 click(s,'[data-im-next]');assert.equal(field(s,'display_name').value,'Rafael');
 assert(s.document.querySelector('[data-im-next]').hasAttribute('disabled'));
 assert.match(s.document.querySelector('#instructor-management-modal').textContent,/Cadastro 3 de 3/);
 click(s,'[data-im-prev]');click(s,'[data-im-prev]');
 assert.equal(field(s,'phone').value,'unsaved-alice');assert.equal(s.calls.length,0);
});
test('save after navigation updates only the visible instructor ID',async()=>{
 const s=setup();await s.open('a');click(s,'[data-im-next]');
 field(s,'phone').value='new-bruno';form(s).dispatchEvent(new s.window.Event('submit',{cancelable:true}));await flush();
 assert.equal(s.calls.length,1);assert.equal(s.calls[0].name,'workshop_update_instructor_profile');
 assert.equal(s.calls[0].args.p_user_id,'b');assert.equal(s.calls[0].args.p_payload.phone,'new-bruno');
 click(s,'[data-im-prev]');assert.equal(field(s,'phone').value,'a-phone');
});
test('late responses from older clicks cannot replace the last selected instructor',async()=>{
 const s=setup();let first,second;
 const pending=[new Promise(r=>first=r),new Promise(r=>second=r)];let index=0;
 s.context.deferredLoad=()=>pending[index++];vm.runInContext('loadInstructors=deferredLoad',s.context);
 const a=s.open('a'),b=s.open('b');second(s.people);await b;first(s.people);await a;
 assert.equal(form(s).dataset.imInstructorId,'b');
});
test('legacy modal replacement leaves one window with a scoped close button',()=>{
 const s=setup(),code=fs.readFileSync(path.join(root,'bundle/src__app_js.003.part'),'utf8');
 vm.runInContext(code.slice(code.indexOf('function modal('),code.indexOf('function youthSelect(')),s.context);
 vm.runInContext("modal('Rafael','old');modal('Bruno','new')",s.context);
 assert.equal(s.document.querySelectorAll('#modal').length,1);assert.match(s.document.querySelector('#modal').textContent,/Bruno/);
 click(s,'[data-close]');assert.equal(s.document.querySelectorAll('#modal').length,0);
});
