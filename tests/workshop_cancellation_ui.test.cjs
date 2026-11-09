const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const test=require('node:test'),assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const root=path.resolve(__dirname,'..');
const api=fs.readFileSync(path.join(root,'bundle/src__api_js.002.part'),'utf8');
const app=fs.readFileSync(path.join(root,'bundle/src__app_js.002.part'),'utf8');
const reports=fs.readFileSync(path.join(root,'bundle/src__app_js.007.part'),'utf8');
const cut=(s,start,end)=>s.slice(s.indexOf(start),s.indexOf(end,s.indexOf(start))).replace(/\bexport /g,'');
const ctx=vm.createContext({Date,Map,Set,Number,String,Boolean,Math,esc:v=>String(v??''),fmtDate:v=>String(v??''),workshopLocationLabel:()=>'',METHODOLOGY_HEADER_DATA:'data:image/png;base64,',isWorkshopLessonCancelled:l=>l?.calendar_status==='cancelada',educatorExecutionTypeLabel:s=>s,workshopReportDraft:()=>({})});
vm.runInContext(cut(api,'export function mergeWorkshopPlanCalendar','export async function getWorkshopMonthlyPlan'),ctx);
vm.runInContext(cut(app,'function workshopCalendarGrid','function workshopInstructorEvidencePreviewHtml'),ctx);
vm.runInContext(cut(app,'function workshopLessonDurationHours','function nextWorkshopPlanMonth'),ctx);
vm.runInContext(cut(reports,'function workshopReportPreviewHtml','function workshopReportEditorHtml'),ctx);
function html(value){return parseHTML('<html><body>'+value+'</body></html>').document}

test('calendar exposes re-open only on canceled classes and cancellation on performed classes',()=>{
 ctx.entries=[{id:'a',scheduled_date:'2026-10-02',status:'cancelada',workshops:{name:'Capoeira'}},{id:'b',scheduled_date:'2026-10-05',status:'realizada',workshops:{name:'Capoeira'}}];
 const d=html(vm.runInContext("workshopCalendarGrid(entries,'2026-10')",ctx));
 assert.equal(d.querySelector('[data-calendar-reopen="a"]').textContent,'Reabrir aula');
 assert.equal(d.querySelector('[data-calendar-cancel="a"]'),null);
 assert.equal(d.querySelector('[data-calendar-cancel="b"]').textContent,'Cancelar');
});

test('planning and report render cancelled classes while keeping hours and people out of totals',()=>{
 ctx.plan={id:'p',plan_month:'2026-10-01'};
 ctx.lessons=[{id:'l',calendar_entry_id:'c1',included:true,lesson_number:1,scheduled_date:'2026-10-02',start_time:'19:00',end_time:'21:00',theme:'Capoeira'}];
 ctx.calendar=[{id:'c1',status:'cancelada',scheduled_date:'2026-10-02',start_time:'19:00'},{id:'c2',status:'cancelada',scheduled_date:'2026-10-04',start_time:'19:00'}];
 const merged=vm.runInContext('mergeWorkshopPlanCalendar(plan,lessons,calendar)',ctx);
 assert.equal(merged.lessons.length,2);assert.equal(merged.lessons[0].calendar_status,'cancelada');assert.equal(merged.lessons[1].synthetic_calendar_lesson,true);
 ctx.bundle=merged;
 let d=html(vm.runInContext("workshopPlanPreviewHtml(bundle,{name:'Capoeira'},new Map())",ctx));
 const main=[...d.querySelectorAll('.workshop-plan-table tbody tr')];assert.equal(main.length,2);assert.match(main[0].textContent,/Cancelada/);assert.match(main[0].textContent,/0h/);
 ctx.reportBundle={plan:ctx.plan,workshop:{name:'Capoeira'},metrics:{cancelled_lessons:1,planned_lessons:0,executed_lessons:0},lesson_execution:[{cancelled:true,lesson_number:1,planned_date:'2026-10-02',planned_theme:'Capoeira',participant_count:0}],team:[],complementary_actions:[]};
 d=html(vm.runInContext('workshopReportPreviewHtml(reportBundle,{})',ctx));
 assert.match(d.querySelector('.workshop-report-table tbody tr').textContent,/Cancelada/);
 const cells=[...d.querySelectorAll('.workshop-report-table tbody tr td')];assert.equal(cells[3].textContent,'—');assert.equal(cells[5].textContent,'—');
 assert.match(d.querySelector('.report-kpi-table').textContent,/Aulas canceladas/);
});
