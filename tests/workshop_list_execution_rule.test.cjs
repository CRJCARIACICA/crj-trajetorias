const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),test=require('node:test');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const api=read('bundle/src__api_js.002.part'),reports=read('bundle/src__api_js.005.part');
const matcher=reports.slice(reports.indexOf('export function matchWorkshopLessons'),reports.indexOf('function buildWorkshopMonthlyReportBundle')).replace(/\bexport /g,'');
const create=api.slice(api.indexOf('async function resolveWorkshopLessonForSession('),api.indexOf('export async function updateWorkshopSession(')).replace(/\bexport /g,'');
function setup(lessons,plans=[{id:'plan'}]){
 const st={currentUser:{id:'u'},sessions:[],indicatorEvents:[],workshopCalendar:[]};let queries=0;
 const ctx=vm.createContext({Map,Set,Date,Number,String,Boolean,Math,mode:'mock',
  listWorkshopMonthlyPlans:async()=>{queries++;return plans},getWorkshopMonthlyPlan:async()=>({lessons}),
  durationHours:(a,b)=>(Number(b.slice(0,2))-Number(a.slice(0,2))),
  mock:()=>st,save:()=>{},uid:()=>`id${st.sessions.length}`,now:()=>'',
 });
 vm.runInContext(matcher+'\n'+create,ctx);
 return {ctx,st,queries:()=>queries};
}
const lesson=(id,date,time='19:00')=>({id,included:true,scheduled_date:date,start_time:time,calendar_entry_id:'cal-'+id});
test('opening a class/list associates the unique planned lesson without a separate manual step',async()=>{
 const h=setup([lesson('l1','2026-10-28')]);
 h.ctx.row={workshop_id:'w1',session_date:'2026-10-28',start_time:'19:00',end_time:'21:00',calendar_entry_id:'cal-l1'};
 const saved=await vm.runInContext('createWorkshopSession(row)',h.ctx);
 assert.equal(saved.plan_lesson_id,'l1');assert.equal(h.st.sessions.length,1);
});
test('a rescheduled class uses its unique calendar link and keeps the chosen execution date',async()=>{
 const h=setup([lesson('l1','2026-10-28')]);
 h.ctx.row={workshop_id:'w1',session_date:'2026-10-29',start_time:'20:00',end_time:'21:00',calendar_entry_id:'cal-l1'};
 const saved=await vm.runInContext('createWorkshopSession(row)',h.ctx);
 assert.equal(saved.plan_lesson_id,'l1');assert.equal(saved.session_date,'2026-10-29');
});
test('ambiguous lessons are not guessed; the created class remains an independent execution',async()=>{
 const h=setup([lesson('l1','2026-10-28'),lesson('l2','2026-10-28')]);
 h.ctx.row={workshop_id:'w1',session_date:'2026-10-28',start_time:'19:00',end_time:'21:00'};
 const saved=await vm.runInContext('createWorkshopSession(row)',h.ctx);
 assert.equal(saved.plan_lesson_id,null);assert.equal(h.st.sessions.length,1);
});
test('a class explicitly linked to its lesson does not depend on another planning query',async()=>{
 const h=setup([]);h.ctx.row={workshop_id:'w1',session_date:'2026-10-28',start_time:'19:00',end_time:'21:00',plan_lesson_id:'explicit'};
 assert.equal((await vm.runInContext('createWorkshopSession(row)',h.ctx)).plan_lesson_id,'explicit');assert.equal(h.queries(),0);
});
test('consolidating an empty attendance list preserves its actual class identity',async()=>{
 const source=read('bundle/src__api_js.007.part');
 const fn=source.slice(source.indexOf('export async function createWorkshopAttendanceSubmission('),source.indexOf('export async function listMethodologyClassificationCatalog(')).replace(/\bexport /g,'');
 let args;
 const ctx=vm.createContext({Number,String,getWorkshopAttendanceSheet:async()=>({session_id:'s1',workshop_name:'Capoeira',date:'2026-10-28',participants:[],participant_count:0}),
  saveFormSubmission:async(...a)=>{args=a;return {id:'doc1'}}});
 vm.runInContext(fn,ctx);const result=await vm.runInContext("createWorkshopAttendanceSubmission('s1')",ctx);
 assert.equal(result.id,'doc1');assert.equal(args[0],'lista-presenca-contato');assert.equal(args[2].participant_count,0);assert.equal(args[3].workshopSessionId,'s1');
});
test('the official document stores its class reference without changing unrelated forms',async()=>{
 const source=read('bundle/src__api_js.001.part');
 const fn=source.slice(source.indexOf('export async function saveFormSubmission('),source.indexOf('export async function listFormSubmissions(')).replace(/\bexport /g,'');
 const st={forms:[],journey:[],currentUser:{id:'u'}};
 const ctx=vm.createContext({Date,Intl,String,Array,Object,mode:'mock',mock:()=>st,save:()=>{},uid:()=>`doc${st.forms.length}`,now:()=>''});
 vm.runInContext(fn,ctx);
 const official=await vm.runInContext("saveFormSubmission('lista-presenca-contato',null,{participants:[]},{workshopSessionId:'class-1'})",ctx);
 assert.equal(official.source_type,'workshop_sessions');assert.equal(official.source_id,'class-1');
 const generic=await vm.runInContext("saveFormSubmission('outra-ficha',null,{},{workshopSessionId:'class-1'})",ctx);
 assert.equal(generic.source_type,undefined);assert.equal(generic.source_id,undefined);
});
test('creating the same planned list twice keeps just one execution marker',async()=>{
 const source=read('bundle/src__api_js.002.part');
 const fn=source.slice(source.indexOf('export async function listWorkshopCreatedLists('),source.indexOf('export async function enrollYouth(')).replace(/\bexport /g,'');
 const st={workshopCreatedLists:[]};const ctx=vm.createContext({Set,Array,mode:'mock',mock:()=>st,save:()=>{},now:()=>'2026-11-09'});
 vm.runInContext(fn,ctx);
 await vm.runInContext("registerWorkshopCreatedList('l1')",ctx);await vm.runInContext("registerWorkshopCreatedList('l1')",ctx);
 assert.equal(st.workshopCreatedLists.length,1);
 assert.equal((await vm.runInContext("listWorkshopCreatedLists(['l1'])",ctx)).length,1);
});
test('a failed download does not register a created list',async()=>{
 const source=read('bundle/src__api_js.002.part');
 const fn=source.slice(source.indexOf('export async function listWorkshopCreatedLists('),source.indexOf('export async function enrollYouth(')).replace(/\bexport /g,'');
 const st={workshopCreatedLists:[]};const ctx=vm.createContext({Set,Array,mode:'mock',mock:()=>st,save:()=>{},now:()=>'',downloadCrjDocumentRequest:async()=>{throw new Error('offline')}});
 vm.runInContext(fn,ctx);
 await assert.rejects(vm.runInContext("downloadWorkshopPlannedAttendance('l1','pdf')",ctx),/offline/);
 assert.equal(st.workshopCreatedLists.length,0);
});

test('removing a created list reverses its marker and preserves an audit copy',async()=>{
 const source=read('bundle/src__api_js.002.part');
 const fn=source.slice(source.indexOf('export async function listWorkshopCreatedLists('),source.indexOf('export async function enrollYouth(')).replace(/\bexport /g,'');
 const st={workshopCreatedLists:[]};const ctx=vm.createContext({Set,Array,mode:'mock',mock:()=>st,save:()=>{},now:()=>'2026-11-09'});
 vm.runInContext(fn,ctx);await vm.runInContext("registerWorkshopCreatedList('l1')",ctx);
 await vm.runInContext("archiveWorkshopCreatedList('l1')",ctx);
 assert.equal(st.workshopCreatedLists.length,0);assert.equal(st.workshopCreatedListTrash.length,1);
});
