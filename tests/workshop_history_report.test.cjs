const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'bundle/src__api_js.005.part'),'utf8');
const start=source.indexOf('function reportDurationHours(');
const finish=source.indexOf('export async function downloadWorkshopMonthlyReport(',start);
const block=source.slice(start,finish).replace(/\bexport /g,'');
const ctx=vm.createContext({Date,Map,Set,Number,String,Boolean,Math});
vm.runInContext(block,ctx);
const lesson=(id,date,calendar='cal-'+id)=>({id,lesson_number:Number(id),scheduled_date:date,start_time:'19:00:00',end_time:'21:00:00',calendar_entry_id:calendar,included:true,theme:'Capoeira'});
const session=(id,date,calendar,plan_lesson_id=null)=>({id,session_date:date,start_time:'19:00',end_time:'21:00',calendar_entry_id:calendar,plan_lesson_id,duration_hours:2,content:'Roda'});
function report(lessons,sessions,attendance=[],createdLists=[],calendar=[],guests=[]){
  ctx.payload={planBundle:{plan:{id:'plan'},lessons,calendar},workshop:{},sessions,attendance,guests,report:null,records:[],team:[],createdLists};
  return vm.runInContext('buildWorkshopMonthlyReportBundle(payload)',ctx);
}
test('historical attendance is attributed using the shared calendar and never repeated as an extra class',()=>{
  const l=lesson('1','2026-10-28');
  const s=session('a','2026-10-28','cal-1');
  const r=report([l],[s],[{id:'p1',session_id:'a',youth_id:'y1'}, {id:'p2',session_id:'a',youth_id:'y2'}]);
  assert.equal(r.lesson_execution[0].executed,true);
  assert.equal(r.lesson_execution[0].participant_count,2);
  assert.equal(r.metrics.executed_lessons,1);
  assert.equal(r.metrics.extra_sessions,0);
  assert.equal(r.metrics.executed_hours,2);
  assert.equal(r.metrics.unique_participants,2);
});
test('an explicit link wins over a different same-day session',()=>{
  const l=lesson('1','2026-10-21');
  const r=report([l],[session('a','2026-10-21','cal-1','1'),session('b','2026-10-21',null)]);
  assert.equal(r.lesson_execution[0].session_id,'a');
  assert.equal(r.metrics.extra_sessions,0);assert.equal(r.metrics.executed_lessons,1);
});
test('ambiguous matching sessions or lessons are never guessed',()=>{
  const l=lesson('1','2026-10-14');
  let r=report([l],[session('a','2026-10-14','cal-1'),session('b','2026-10-14','cal-1')]);
  assert.equal(r.lesson_execution[0].executed,false);assert.equal(r.metrics.extra_sessions,2);
  r=report([lesson('1','2026-10-14',null),lesson('2','2026-10-14',null)],[session('a','2026-10-14',null)]);
  assert.equal(r.metrics.executed_planned_lessons,0);assert.equal(r.metrics.extra_sessions,1);
});
test('the fallback requires a unique date and start time, and rejects conflicting calendar links',()=>{
  const l=lesson('1','2026-10-02',null);
  let r=report([l],[session('a','2026-10-02',null)]);
  assert.equal(r.metrics.executed_lessons,1);
  r=report([lesson('1','2026-10-02','cal-1')],[session('a','2026-10-02','different-calendar')]);
  assert.equal(r.metrics.executed_planned_lessons,0);
  r=report([l],[{...session('a','2026-10-02',null),end_time:'20:00'}]);
  assert.equal(r.metrics.executed_lessons,1);assert.equal(r.lesson_execution[0].actual_end,'20:00');
  r=report([l],[{...session('a','2026-10-02',null),start_time:'18:00'}]);
  assert.equal(r.metrics.executed_planned_lessons,0);
});
test('a session explicitly linked to another lesson is never reassigned',()=>{
  const r=report([lesson('1','2026-10-02')],[session('a','2026-10-02','cal-1','other')]);
  assert.equal(r.metrics.executed_planned_lessons,0);assert.equal(r.metrics.extra_sessions,1);
});

test('a session linked to an excluded lesson is reconciled through its shared calendar',()=>{
  const active=lesson('1','2026-10-14','cal-1');
  const old={...lesson('2','2026-10-14',null),included:false};
  const r=report([active,old],[session('a','2026-10-14','cal-1','2')],[{id:'p',session_id:'a',youth_id:'y'}]);
  assert.equal(r.metrics.executed_lessons,1);assert.equal(r.metrics.extra_sessions,0);assert.equal(r.lesson_execution[0].participant_count,1);
});


test('a created list counts its class even before anybody is marked present',()=>{
  const r=report([lesson('1','2026-11-09')],[session('a','2026-11-09','cal-1','1')]);
  assert.equal(r.lesson_execution[0].executed,true);
  assert.equal(r.lesson_execution[0].participant_count,0);
  assert.equal(r.metrics.executed_lessons,1);
});

test('a list for an unplanned class still counts as one executed class',()=>{
  const r=report([], [session('extra','2026-11-09',null)]);
  assert.equal(r.metrics.executed_lessons,1);assert.equal(r.metrics.executed_planned_lessons,0);
  assert.equal(r.metrics.extra_sessions,1);assert.equal(r.metrics.executed_hours,2);
});

test('an extra list at the same planned slot does not double classes, hours or the same youth',()=>{
  const a=session('a','2026-10-21','cal-1','1'),b=session('b','2026-10-21',null);
  const r=report([lesson('1','2026-10-21')],[a,b],[{id:'p1',session_id:'a',youth_id:'y1'},{id:'p2',session_id:'b',youth_id:'y1'},{id:'p3',session_id:'b',youth_id:'y2'}]);
  assert.equal(r.metrics.executed_lessons,1);assert.equal(r.metrics.extra_sessions,0);assert.equal(r.metrics.executed_hours,2);
  assert.equal(r.metrics.participation_records,2);assert.equal(r.lesson_execution[0].participant_count,2);
});

test('distinct scheduled lessons with different explicit links remain separate even at the same time',()=>{
  const a=session('a','2026-10-21','cal-1','1'),b=session('b','2026-10-21','cal-2','2');
  const r=report([lesson('1','2026-10-21'),lesson('2','2026-10-21')],[a,b]);
  assert.equal(r.metrics.executed_lessons,2);assert.equal(r.metrics.executed_hours,4);
});


test('creating an empty planned list counts its lesson, including a future date, without inventing hours',()=>{
  const l=lesson('1','2026-12-09');
  const r=report([l],[],[],[{lesson_id:'1',created_at:'2026-11-09T15:00:00Z'}]);
  assert.equal(r.lesson_execution[0].executed,true);assert.equal(r.lesson_execution[0].execution_source,'lista_criada');
  assert.equal(r.lesson_execution[0].participant_count,0);assert.equal(r.metrics.executed_lessons,1);
  assert.equal(r.metrics.executed_hours,0);assert.equal(r.metrics.pending_lessons,0);
});

test('a generated list and its actual class count only once',()=>{
  const l=lesson('1','2026-10-28');
  const r=report([l],[session('s1','2026-10-28','cal-1','1')],[],[{lesson_id:'1'}]);
  assert.equal(r.metrics.executed_lessons,1);assert.equal(r.metrics.extra_sessions,0);assert.equal(r.metrics.executed_hours,2);
});

test('calendar cancellation overrides the list, class, attendance and hours',()=>{
  const l={...lesson('1','2026-10-02'),included:false};
  const s={...session('s','2026-10-02','cal-1','1'),workshop_id:'w',cfdh_minutes:60};
  const calendar=[{id:'cal-1',status:'cancelada',workshop_id:'w',scheduled_date:'2026-10-02',start_time:'19:00'}];
  const attendance=[{id:'a',session_id:'s',youth_id:'y'}],guests=[{id:'g',session_id:'s',provisional_person_id:'p'}];
  let r=report([l],[s],attendance,[{lesson_id:'1'}],calendar,guests);
  assert.equal(r.lesson_execution.length,1);assert.equal(r.lesson_execution[0].cancelled,true);
  assert.equal(r.lesson_execution[0].executed,false);assert.equal(r.lesson_execution[0].participant_count,0);
  for(const key of ['planned_lessons','executed_lessons','pending_lessons','planned_hours','executed_hours','participation_records','unique_participants','extra_sessions','cfdh_minutes'])assert.equal(r.metrics[key],0,key);
  assert.equal(r.metrics.cancelled_lessons,1);assert.equal(r.complementary_actions.length,0);
  calendar[0].status='realizada';
  r=report([{...l,included:true}],[s],attendance,[{lesson_id:'1'}],calendar,guests);
  assert.equal(r.metrics.cancelled_lessons,0);assert.equal(r.metrics.executed_lessons,1);
  assert.equal(r.metrics.participation_records,2);assert.equal(r.metrics.executed_hours,2);
});

test('an old unlinked session on a unique canceled slot is excluded without affecting another slot',()=>{
  const l=lesson('1','2026-10-02');
  const old={...session('old','2026-10-02',null),workshop_id:'w'};
  const other={...session('other','2026-10-02',null),workshop_id:'w',start_time:'17:00',end_time:'18:00',duration_hours:1};
  const cal=[{id:'cal-1',status:'cancelada',workshop_id:'w',scheduled_date:'2026-10-02',start_time:'19:00'}];
  const r=report([l],[old,other],[{id:'p1',session_id:'old',youth_id:'y1'},{id:'p2',session_id:'other',youth_id:'y2'}],[],cal);
  assert.equal(r.metrics.cancelled_lessons,1);assert.equal(r.metrics.planned_lessons,0);
  assert.equal(r.metrics.executed_lessons,1);assert.equal(r.metrics.extra_sessions,1);
  assert.equal(r.metrics.executed_hours,1);assert.equal(r.metrics.unique_participants,1);
});

test('calendar status for a session linked through its lesson takes precedence even without times',()=>{
  ctx.caseSessions=[{id:'s',plan_lesson_id:'1'}];
  ctx.caseLessons=[{id:'1',calendar_entry_id:'cal-1'}];
  ctx.caseCalendar=[{id:'cal-1',status:'cancelada'}];
  assert.equal(vm.runInContext('filterCancelledWorkshopSessions(caseSessions,caseCalendar,caseLessons).length',ctx),0);
});
