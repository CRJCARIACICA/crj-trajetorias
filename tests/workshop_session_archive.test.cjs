const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync(path.join(__dirname,'../sql/workshop_session_archive.sql'),'utf8');
const session='00000000-0000-4000-8000-000000000011',workshop='00000000-0000-4000-8000-000000000012',user='00000000-0000-4000-8000-000000000013';
async function setup(){
 const db=new PGlite();
 await db.exec(`
 create role anon; create role authenticated;
 create schema auth; create schema app_private;
 grant usage on schema app_private,auth,public to authenticated,anon;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
 create function app_private.has_any_role(allowed text[]) returns boolean language sql stable as $$ select coalesce(current_setting('test.role_name',true)=any(allowed),false) $$;
 create table public.workshop_sessions(id uuid primary key,workshop_id uuid not null,session_date date);
 create table public.attendance(id uuid primary key,session_id uuid references public.workshop_sessions(id) on delete cascade,youth_id uuid);
 create table public.workshop_guest_participations(id uuid primary key,session_id uuid references public.workshop_sessions(id) on delete cascade);
 create table app_private.workshop_guest_signatures(participation_id uuid references public.workshop_guest_participations(id) on delete cascade, signature_data text);
 create table public.cfdh_attendance(id uuid primary key,source_workshop_attendance_id uuid);
 create table public.workshop_checkin_windows(id uuid primary key,session_id uuid references public.workshop_sessions(id) on delete cascade);
 create table public.joint_action_evidences(id uuid primary key,source_type text,source_id uuid);
 create table public.workshop_calendar(id uuid primary key,session_id uuid references public.workshop_sessions(id) on delete set null,status text,updated_at timestamptz);
 insert into public.workshop_sessions values ('${session}','${workshop}','2026-10-28');
 insert into public.attendance values ('00000000-0000-4000-8000-000000000021','${session}','00000000-0000-4000-8000-000000000022');
 insert into public.workshop_guest_participations values ('00000000-0000-4000-8000-000000000023','${session}');
 insert into app_private.workshop_guest_signatures values ('00000000-0000-4000-8000-000000000023','signature');
 insert into public.cfdh_attendance values ('00000000-0000-4000-8000-000000000027','00000000-0000-4000-8000-000000000021');
 insert into public.workshop_checkin_windows values ('00000000-0000-4000-8000-000000000024','${session}');
 insert into public.joint_action_evidences values ('00000000-0000-4000-8000-000000000025','workshop_sessions','${session}');
 insert into public.workshop_calendar values ('00000000-0000-4000-8000-000000000026','${session}','realizada',now());
 `);
 await db.exec(migration);return db;
}
test('authorized exclusion archives attendance and guests, updates calendar, and is inaccessible to ordinary staff',async()=>{
 const db=await setup();
 try{
  await db.exec(`set test.uid='${user}'; set test.role_name='educador'; set role authenticated`);
  await assert.rejects(db.query('select * from app_private.workshop_session_deletions'),/permission denied/i);
  await db.query('select public.archive_workshop_session($1::uuid)',[session]);
  await db.exec('reset role');
  const {rows:[x]}=await db.query(`select snapshot,deleted_by from app_private.workshop_session_deletions`);
  assert.equal(x.deleted_by,user);assert.equal(x.snapshot.attendance.length,1);assert.equal(x.snapshot.guests.length,1);assert.equal(x.snapshot.guest_signatures.length,1);assert.equal(x.snapshot.cfdh_attendance.length,1);assert.equal(x.snapshot.checkin_windows.length,1);assert.equal(x.snapshot.joint_evidence.length,1);
  const {rows:[counts]}=await db.query(`select (select count(*)::int from public.workshop_sessions) sessions,(select count(*)::int from public.attendance) attendances,(select status from public.workshop_calendar limit 1) status`);
  assert.equal(counts.sessions,0);assert.equal(counts.attendances,0);assert.equal(counts.status,'planejada');
 } finally {await db.close()}
});
test('another role cannot delete and all records remain in place',async()=>{
 const db=await setup();
 try{
  await db.exec(`set test.uid='${user}'; set test.role_name='articulador'; set role authenticated`);
  await assert.rejects(db.query('select public.archive_workshop_session($1::uuid)',[session]),/Sem permissão/);
  await db.exec('reset role');
  const {rows:[x]}=await db.query('select (select count(*)::int from public.workshop_sessions) sessions,(select count(*)::int from app_private.workshop_session_deletions) archives');
  assert.equal(x.sessions,1);assert.equal(x.archives,0);
 } finally {await db.close()}
});
