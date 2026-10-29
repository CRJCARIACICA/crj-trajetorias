const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('bundle/src__app_js.002.part');
const actions=read('bundle/src__app_js.007.part');
const api=read('bundle/src__api_js.007.part');
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

test('turma mostra cada ação e a matriz nominal sem executar planejamento',async()=>{
  const source=app.slice(app.indexOf('function cfdhClassRosterHtml('),app.indexOf('async function bindCfdhClassLive('));
  const context={esc,fmtDate:x=>x||'—',route:()=>({params:new URLSearchParams('plan=p1&month=2026-10')}),
    state:{user:{role:'educador'}},permitted:()=>true,currentMonth:()=>'2026-10',
    cfdhTypeLabel:()=> 'CFDH estrutural',workshopTabs:()=>'<nav>Oficinas</nav>',
    cfdhOperationsHtml:b=>`<section>${b.actions.length} ações</section>`,
    getCfdhPlanBundle:async()=>({plan:{id:'p1',activity_title:'Circuito',plan_type:'cfdh_estrutural'},actions:[{id:'a1',action_number:1,scheduled_date:'2026-10-01'},{id:'a2',action_number:2,scheduled_date:'2026-10-02'}],roster:[{person_id:'y',display_name:'<script>alert(1)</script>',kind:'jovem',action_ids:['a2']}]}),
    getCfdhClassRoster:async()=>[{person_id:'y',display_name:'<script>alert(1)</script>',kind:'jovem',action_ids:['a2']}]};
  vm.createContext(context);vm.runInContext(source+';globalThis.page=pageCfdhWorkshopClass;',context);
  const html=await context.page();
  assert.match(html,/Turma CFDH · Circuito/);assert.match(html,/Acompanhamento virtual da turma/);
  assert.match(html,/Ação 1/);assert.match(html,/Ação 2/);assert.match(html,/✓ Presente/);
  assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
  assert.match(html,/observações da execução integram a relatoria/i);
});

test('lista transversal usa sessão da oficina e exige abrir a aula existente',async()=>{
  const source=api.slice(api.indexOf('export async function openCfdhCheckin('),api.indexOf('export async function getCfdhClassRoster(')).replace('export async','async');
  const records={action:{id:'a',planning_status:'complete',workshop_plan_lesson_id:'lesson'},session:{id:'session'}};
  const calls=[];
  const supabase={from(name){return {select(){return this},eq(){return this},single:async()=>({data:records.action}),maybeSingle:async()=>({data:records.session})}},
    rpc:async(name)=>{calls.push(name);return {data:[{public_token:'structural-token'}]}}};
  const context={mode:'live',supabase,openWorkshopCheckin:async id=>{calls.push('workshop:'+id);return {public_token:'shared-token'}}};
  vm.createContext(context);vm.runInContext(source+';globalThis.open=openCfdhCheckin;',context);
  assert.equal((await context.open('a')).public_token,'shared-token');assert.deepEqual(calls,['workshop:session']);
  records.session=null;await assert.rejects(()=>context.open('a'),/primeiro o acompanhamento da aula vinculada/);
  records.action.workshop_plan_lesson_id=null;assert.equal((await context.open('a')).public_token,'structural-token');
  records.action.planning_status='draft';await assert.rejects(()=>context.open('a'),/Conclua o planejamento/);
  records.action.planning_status='complete';records.action.execution_status='cancelada';await assert.rejects(()=>context.open('a'),/foi cancelada/);
});

test('ação exibe observações da relatoria e arquivos sem exigir presença prévia',()=>{
  const source=actions.slice(actions.indexOf('function cfdhOperationsHtml('),actions.indexOf('function cfdhPlanEditorHtml('));
  const context={esc,fmtDate:x=>x||'—',currentMonth:()=>'2026-10',permitted:()=>true};
  vm.createContext(context);vm.runInContext(source+';globalThis.renderActions=cfdhOperationsHtml;',context);
  const html=context.renderActions({plan:{id:'plan',planned_start:'2026-10-01'},workshops:[],evaluations:[],attendance_counts:{},actions:[{id:'a',action_number:1,planning_status:'complete',execution_status:'realizada',actual_duration_hours:2,execution_description:'Dinâmica',execution_notes:'Adaptação da atividade'}]});
  assert.match(html,/Observações para a relatoria/);assert.match(html,/Adaptação da atividade/);
  assert.match(html,/data-cfdh-list-pdf="a"/);assert.match(html,/data-cfdh-list-docx="a"/);
});

test('relatoria baixável inclui a descrição e as observações de cada ação',async()=>{
  const edge=read('supabase/functions/crj-export-document-safe/index.ts');
  const source=edge.slice(edge.indexOf('async function cfdhReportSpec('),edge.indexOf('async function educatorRecordSpec('));
  const data={educator_reports:{id:'report',plan_id:'plan'},educator_plans:{id:'plan',activity_title:'Circuito'},cfdh_actions:[{action_number:1,execution_description:'Roda de conversa',execution_notes:'Ajustamos o tempo'}]};
  const client={from(table){return {select(){return this},eq(){return this},single:async()=>({data:data[table]}),order:async()=>({data:data[table]})}}};
  const ctx={array:x=>x||[],brDate:x=>x||'',safeName:x=>x};vm.createContext(ctx);vm.runInContext(source+';globalThis.spec=cfdhReportSpec;',ctx);
  const doc=await ctx.spec(client,'report');const row=doc.sections.find(x=>x.title==='Execução e observações por ação').rows[0];
  assert.match(row[1],/Roda de conversa/);assert.match(row[1],/Observações: Ajustamos o tempo/);
});

test('PDF continua observações longas até o final em páginas seguintes',async()=>{
  const edge=read('supabase/functions/crj-export-document-safe/index.ts');
  const code=edge.slice(edge.indexOf('function wrapText('),edge.indexOf('const border ='));
  const printed=[];let pages=[];
  const pdf={embedFont:async()=>({}),embedPng:async()=>({scale:()=>({width:300,height:45})}),
    addPage:()=>{const p={getHeight:()=>595,getWidth:()=>842,drawImage(){},drawRectangle(){},drawText(text){printed.push(text)}};pages.push(p);return p},
    getPages:()=>pages,getPageCount:()=>pages.length,save:async()=>new Uint8Array([1,2,3])};
  const ctx={PDFDocument:{create:async()=>pdf},StandardFonts:{Helvetica:'a',HelveticaBold:'b'},rgb:()=>({}),
    pdfSafe:x=>String(x??''),s:x=>String(x??''),Uint8Array};
  vm.createContext(ctx);vm.runInContext(code+';globalThis.makePdf=makePdf;',ctx);
  await ctx.makePdf({title:'RELATORIO',sections:[{title:'Execução e observações por ação',rows:[['Ação 1',('observação detalhada '.repeat(1300))+' MARCADOR_FINAL']]}]}, {type:'png',bytes:new Uint8Array()});
  assert(pages.length>1);assert(printed.some(x=>x.includes('MARCADOR_FINAL')));
});

test('painel considera apenas execução e soma intervalos compartilhados uma vez',()=>{
  const code=api.slice(api.indexOf('export function countCfdhExecutedHours('),api.indexOf('export async function listCfdhMonthDashboard(')).replace('export function','function');
  const ctx={Date,Number,Map};vm.createContext(ctx);vm.runInContext(code+';globalThis.count=countCfdhExecutedHours;',ctx);
  const base={workshop_plan_lesson_id:'lesson',actual_date:'2026-10-02',execution_status:'realizada',actual_duration_hours:2};
  const rows=[{...base,actual_start:'09:00',actual_end:'11:00'},{...base,actual_start:'10:00',actual_end:'12:00'},
    {execution_status:'cancelada',actual_duration_hours:8}, {execution_status:'planejada',actual_duration_hours:5},
    {execution_status:'realizada',actual_duration_hours:2}, {execution_status:'realizada',actual_duration_hours:1}];
  assert.equal(ctx.count(rows),5);assert.equal(ctx.count(rows,0),6);
});
