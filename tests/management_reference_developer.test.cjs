const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../src/management_workspace.js'),'utf8').replace(/^import .*;\r?\n/gm,'');

test('educador no modo desenvolvedor como coordenação continua listado para receber referência',async()=>{
  const user={id:'dev',display_name:'Educador desenvolvedor',role:'coordenacao_geral',team:'Coordenação',active:true,developer_preview_enabled:true};
  const profiles=[user,{id:'art',display_name:'Articuladora',role:'articulador',team:'Articulação',active:true}];
  const client={auth:{getUser:async()=>({data:{user:{id:'dev'}}})},rpc:async name=>name==='developer_get_my_state'?{data:{is_developer:true,base_role:'educador'}}:{data:null},from(table){
    const q={select(){return this},eq(){return this},gte(){return this},order(){return this},limit(){return this},maybeSingle(){return Promise.resolve({data:table==='profiles'?{...user}:null})},then(resolve){resolve({data:table==='profiles'?profiles:[]})}};return q;
  }};
  const window={addEventListener(){}},document={querySelector(){return null}},location={hash:'#coordenacao-geral?view=equipes'};
  const ctx=vm.createContext({window,document,location,URLSearchParams,Intl,Date,Map,Set,console,Promise,apiMode:()=> 'live',supabaseClient:()=>client,captureRoute:()=>()=>true,setTimeout:()=>0,clearTimeout(){},MutationObserver:class{observe(){}}});
  vm.runInContext(source,ctx);
  const me=await vm.runInContext('profile()',ctx);assert.equal(me.role,'coordenacao_geral');assert.equal(me.developer_base_role,'educador');
  ctx.loadedProfile=me;vm.runInContext('me=loadedProfile',ctx);const html=await vm.runInContext('renderTeams()',ctx);
  assert.match(html,/data-mw-art-reference="dev"/);assert.match(html,/Educador desenvolvedor/);assert.match(html,/Articuladora/);
});
