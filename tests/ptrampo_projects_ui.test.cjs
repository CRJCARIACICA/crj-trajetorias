const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const root=path.join(__dirname,'..');
function getModule(file,ending,expose){
 let s=readFileSync(path.join(root,file),'utf8').replace(/^import .*;\n/gm,'');
 if(ending)s=s.slice(0,s.indexOf(ending));
 s+='\n'+expose;
 const ctx={window:{addEventListener(){}},location:{hash:'#equipe-tecnica'},console,URL,URLSearchParams,Intl,Date,Set,Map,Array,Number,String};vm.createContext(ctx);vm.runInContext(s,ctx);return ctx;
}
test('planejamento macro mostra oito posições e preserva registros em revisão',()=>{
 const c=getModule('src/ptrampo_projects.js','css();new MutationObserver',`globalThis.api={bundle,cardHtml,actionEditor,setMe:x=>me=x};`);c.api.setMe({active:true,role:'psicologo'});
 const data={projects:[],links:[{id:'l1',project_id:'p',technical_plan_id:'a1',activity_number:1,relationship:'canonical'},{id:'lr',project_id:'p',technical_plan_id:'ar',relationship:'review'}],plans:[{id:'a1',title:'Ação de abertura',planned_date:'2026-11-03',start_time:'13:00',end_time:'15:00',status:'planejado'},{id:'ar',title:'Currículos',planned_date:'2026-11-18'}],executions:[]};
 const b=c.api.bundle({id:'p',title:'Projeto',reference_month:'2026-11-01',status:'rascunho'},data);const html=c.api.cardHtml(b),{document}=parseHTML(`<main>${html}</main>`);
 assert.equal(document.querySelectorAll('.ptr-slot').length,9);assert.match(document.body?.textContent||html,/Ação 4 · pendente de definição/);assert.match(html,/Currículos/);assert.match(html,/Relatório do projeto/);
 const edit=c.api.actionEditor(4,null,[data.plans[1]]);assert.match(edit,/Manter sem vínculo/);assert.match(edit,/Currículos/);assert(!edit.includes('selected'));
});
test('Articulação apresenta uma unidade PTrampo com histórico e conta pendência uma vez',()=>{
 const c=getModule('src/articulation_workspace.js','window.addEventListener(\'hashchange\'',`globalThis.api={requestsView,pendingUnits};`);
 const r=[{id:'a',ptrampo_project_id:'p',source_type:'ptrampo',source_title:'Ação 1',status:'solicitado',support_types:[]},{id:'b',ptrampo_project_id:'p',source_type:'ptrampo',source_title:'Ação 2',status:'solicitado',support_types:[]},{id:'c',ptrampo_project_id:'p',source_type:'ptrampo',source_title:'Ação 3',status:'negado',rejection_reason:'Motivo registrado',support_types:[]},{id:'d',source_type:'oficina',source_title:'Oficina',status:'solicitado',support_types:[]}];
 assert.equal(c.api.pendingUnits(r),2);const html=c.api.requestsView(r,new Map()),{document}=parseHTML(`<main>${html}</main>`);
 assert.match(html,/Pendentes \(2\)/);assert.equal(document.querySelectorAll('details').length,1);assert.match(html,/Motivo registrado/);assert.equal(document.querySelectorAll('[data-answer-request]').length,3);
});
