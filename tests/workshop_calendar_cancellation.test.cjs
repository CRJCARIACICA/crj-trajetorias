const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync(path.join(__dirname,'../sql/workshop_calendar_cancellation.sql'),'utf8');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [calendar,lesson,session,workshop,user,windowId,markerPerson]=[1,2,3,4,5,6,7].map(id);
async function setup(){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated;
 create schema auth; create schema app_private;
 grant usage on schema app_private,auth,public to anon,authenticated;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
 create function app_private.is_active_staff() returns boolean language sql stable as $$ select coalesce(current_setting('test.active',true)='yes',false) $$;
 create function app_private.has_any_role(allowed text[]) returns boolean language sql stable as $$ select coalesce(current_setting('test.role_name',true)=any(allowed),false) $$;
 create table public.workshop_calendar(id uuid primary key,workshop_id uuid not null,scheduled_date date,start_time time,status text,monthly_cancelled boolean default false,session_id uuid,updated_at timestamptz default now());
 create table public.workshop_plan_lessons(id uuid primary key,calendar_entry_id uuid,included boolean default true,updated_at timestamptz default now());
 create table public.workshop_sessions(id uuid primary key,workshop_id uuid,session_date date,start_time time,plan_lesson_id uuid,calendar_entry_id uuid);
 create table public.workshop_checkin_windows(id uuid primary key,session_id uuid,active boolean default true);
 create table public.workshop_created_attendance_lists(lesson_id uuid primary key);
 create table public.attendance(id uuid primary key,session_id uuid);
 create table public.workshop_month_changes(id bigint generated always as identity,workshop_id uuid,reference_month date,changed_by uuid,reason text,source_table text,source_id uuid,before_data jsonb,after_data jsonb);
 insert into public.workshop_calendar(id,workshop_id,scheduled_date,start_time,status) values ('${calendar}','${workshop}','2026-10-02','19:00','realizada');
 insert into public.workshop_plan_lessons(id,calendar_entry_id,included) values ('${lesson}','${calendar}',true);
 insert into public.workshop_sessions values ('${session}','${workshop}','2026-10-02','19:00','${lesson}','${calendar}');
 insert into public.workshop_checkin_windows values ('${windowId}','${session}',true);
 insert into public.workshop_created_attendance_lists values ('${lesson}');
 insert into public.attendance values ('${markerPerson}','${session}');
 set test.uid='${user}';set test.active='yes';set test.role_name='educador';`);
 await db.exec(migration);return db;
}
test('cancel and reopen preserve data, stop check-in, and resist automatic recancellation',async()=>{
 const db=await setup();try{
  await db.query(`update public.workshop_calendar set status='cancelada' where id=$1`,[calendar]);
  let {rows:[r]}=await db.query(`select c.status,l.included,l.included_before_cancellation,w.active,(select count(*)::int from public.attendance) attendance,(select count(*)::int from public.workshop_created_attendance_lists) markers from public.workshop_calendar c join public.workshop_plan_lessons l on l.calendar_entry_id=c.id join public.workshop_checkin_windows w on w.id=$1 where c.id=$2`,[windowId,calendar]);
  assert.equal(r.status,'cancelada');assert.equal(r.included,false);assert.equal(r.included_before_cancellation,true);assert.equal(r.active,false);assert.equal(r.attendance,1);assert.equal(r.markers,1);
  await assert.rejects(db.query(`update public.workshop_checkin_windows set active=true where id=$1`,[windowId]),/aula está cancelada/i);
  await assert.rejects(db.query(`insert into public.workshop_created_attendance_lists values ($1)`,[lesson]),/aula está cancelada/i);
  await assert.rejects(db.query(`insert into public.workshop_sessions values ($1,$2,'2026-10-02','19:00',null,null)`,[id(8),workshop]),/aula está cancelada/i);
  await db.exec('set role authenticated');
  await db.query('select public.reopen_workshop_calendar_entry($1)',[calendar]);
  await db.exec('reset role');
  ({rows:[r]}=await db.query(`select c.status,c.manually_reopened,l.included,l.included_before_cancellation,w.active,(select count(*)::int from public.workshop_month_changes) audit from public.workshop_calendar c join public.workshop_plan_lessons l on l.calendar_entry_id=c.id join public.workshop_checkin_windows w on w.id=$1 where c.id=$2`,[windowId,calendar]));
  assert.equal(r.status,'realizada');assert.equal(r.included,true);assert.equal(r.included_before_cancellation,null);assert.equal(r.manually_reopened,true);assert.equal(r.active,false);assert.equal(r.audit,2);
  await db.exec(`set crj.monthly_sync='rebuild';`);
  await db.query(`update public.workshop_calendar set status='cancelada',monthly_cancelled=true where id=$1`,[calendar]);
  ({rows:[r]}=await db.query('select status,monthly_cancelled from public.workshop_calendar where id=$1',[calendar]));assert.equal(r.status,'realizada');assert.equal(r.monthly_cancelled,false);
  await db.exec(`set crj.monthly_sync='';`);
  await db.query(`update public.workshop_calendar set status='cancelada' where id=$1`,[calendar]);
  ({rows:[r]}=await db.query('select status from public.workshop_calendar where id=$1',[calendar]));assert.equal(r.status,'cancelada');
 }finally{await db.close()}
});
test('an older session with a unique matching slot is preserved and reopens as executed',async()=>{
 const db=await setup();try{
  await db.query('update public.workshop_sessions set plan_lesson_id=null,calendar_entry_id=null where id=$1',[session]);
  await db.query(`update public.workshop_calendar set status='cancelada' where id=$1`,[calendar]);
  let {rows:[r]}=await db.query('select active from public.workshop_checkin_windows where id=$1',[windowId]);assert.equal(r.active,false);
  await db.exec('set role authenticated');await db.query('select public.reopen_workshop_calendar_entry($1)',[calendar]);await db.exec('reset role');
  ({rows:[r]}=await db.query('select status from public.workshop_calendar where id=$1',[calendar]));assert.equal(r.status,'realizada');
 }finally{await db.close()}
});
test('a canceled planned class reopens as planned and a previously excluded lesson remains excluded',async()=>{
 const db=await setup();try{
  await db.exec(`delete from public.workshop_checkin_windows;delete from public.attendance;delete from public.workshop_sessions; update public.workshop_plan_lessons set included=false;update public.workshop_calendar set status='cancelada';set role authenticated`);
  await db.query('select public.reopen_workshop_calendar_entry($1)',[calendar]);await db.exec('reset role');
  const {rows:[r]}=await db.query('select c.status,l.included from public.workshop_calendar c join public.workshop_plan_lessons l on l.calendar_entry_id=c.id');
  assert.equal(r.status,'planejada');assert.equal(r.included,false);
 }finally{await db.close()}
});
test('unauthorized users cannot reopen a canceled class',async()=>{
 const db=await setup();try{
  await db.exec(`update public.workshop_calendar set status='cancelada';set test.role_name='oficineiro';set role authenticated`);
  await assert.rejects(db.query('select public.reopen_workshop_calendar_entry($1)',[calendar]),/Sem permissão/i);
  await db.exec('reset role;set role anon');
  await assert.rejects(db.query('select public.reopen_workshop_calendar_entry($1)',[calendar]),/permission denied/i);
  await db.exec('reset role');const {rows:[r]}=await db.query('select status from public.workshop_calendar');assert.equal(r.status,'cancelada');
 }finally{await db.close()}
});
