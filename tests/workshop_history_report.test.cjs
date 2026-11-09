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
function report(lessons,sessions,attendance=[]){
  ctx.payload={planBundle:{plan:{id:'plan'},lessons},workshop:{},sessions,attendance,guests:[],report:null,records:[],team:[]};
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
  assert.equal(r.metrics.extra_sessions,1);
});
test('ambiguous matching sessions or lessons are never guessed',()=>{
  const l=lesson('1','2026-10-14');
  let r=report([l],[session('a','2026-10-14','cal-1'),session('b','2026-10-14','cal-1')]);
  assert.equal(r.lesson_execution[0].executed,false);assert.equal(r.metrics.extra_sessions,2);
  r=report([lesson('1','2026-10-14',null),lesson('2','2026-10-14',null)],[session('a','2026-10-14',null)]);
  assert.equal(r.metrics.executed_lessons,0);assert.equal(r.metrics.extra_sessions,1);
});
test('the fallback requires a unique date and start time, and rejects conflicting calendar links',()=>{
  const l=lesson('1','2026-10-02',null);
  let r=report([l],[session('a','2026-10-02',null)]);
  assert.equal(r.metrics.executed_lessons,1);
  r=report([lesson('1','2026-10-02','cal-1')],[session('a','2026-10-02','different-calendar')]);
  assert.equal(r.metrics.executed_lessons,0);
  r=report([l],[{...session('a','2026-10-02',null),end_time:'20:00'}]);
  assert.equal(r.metrics.executed_lessons,1);assert.equal(r.lesson_execution[0].actual_end,'20:00');
  r=report([l],[{...session('a','2026-10-02',null),start_time:'18:00'}]);
  assert.equal(r.metrics.executed_lessons,0);
});
test('a session explicitly linked to another lesson is never reassigned',()=>{
  const r=report([lesson('1','2026-10-02')],[session('a','2026-10-02','cal-1','other')]);
  assert.equal(r.metrics.executed_lessons,0);assert.equal(r.metrics.extra_sessions,1);
});

test('a session linked to an excluded lesson is reconciled through its shared calendar',()=>{
  const active=lesson('1','2026-10-14','cal-1');
  const old={...lesson('2','2026-10-14',null),included:false};
  const r=report([active,old],[session('a','2026-10-14','cal-1','2')],[{id:'p',session_id:'a',youth_id:'y'}]);
  assert.equal(r.metrics.executed_lessons,1);assert.equal(r.metrics.extra_sessions,0);assert.equal(r.lesson_execution[0].participant_count,1);
});
