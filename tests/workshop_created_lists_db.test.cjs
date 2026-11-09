const fs=require('node:fs'),path=require('node:path'),test=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync(path.join(__dirname,'../sql/workshop_created_attendance_lists.sql'),'utf8');
const user='00000000-0000-4000-8000-000000000001',visible='00000000-0000-4000-8000-000000000011',hidden='00000000-0000-4000-8000-000000000012',excluded='00000000-0000-4000-8000-000000000013';
async function setup(){
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create schema app_private;
 grant usage on schema auth,app_private,public to authenticated,anon;
 create table auth.users(id uuid primary key);insert into auth.users values ('${user}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function app_private.is_active_staff() returns boolean language sql stable as $$select coalesce(current_setting('test.active',true)='yes',false)$$;
 create function app_private.has_any_role(allowed text[]) returns boolean language sql stable as $$select coalesce(current_setting('test.role_name',true)=any(allowed),false)$$;
 create table public.workshop_sessions(id uuid primary key);
 create table public.workshop_plan_lessons(id uuid primary key,included boolean not null,visible boolean not null);
 insert into public.workshop_plan_lessons values ('${visible}',true,true),('${hidden}',true,false),('${excluded}',false,true);
 alter table public.workshop_plan_lessons enable row level security;grant select on public.workshop_plan_lessons to authenticated;
 create policy lesson_visible on public.workshop_plan_lessons for select to authenticated using (visible);
 `);await db.exec(sql);return db;
}
test('active authorized staff can create a list marker once, without modifying the lesson',async()=>{
 const db=await setup();try{
  await db.exec(`set test.uid='${user}';set test.active='yes';set role authenticated`);
  await db.query('insert into public.workshop_created_attendance_lists (lesson_id) values ($1) on conflict (lesson_id) do nothing',[visible]);
  await db.query('insert into public.workshop_created_attendance_lists (lesson_id) values ($1) on conflict (lesson_id) do nothing',[visible]);
  const {rows}=await db.query('select lesson_id,created_by from public.workshop_created_attendance_lists');
  assert.equal(rows.length,1);assert.equal(rows[0].created_by,user);assert.equal(rows[0].lesson_id,visible);
  await assert.rejects(db.query('delete from public.workshop_created_attendance_lists where lesson_id=$1',[visible]),/permission denied/i);
 }finally{await db.close()}
});
test('anonymous, inactive or unauthorized staff cannot register a planned lesson',async()=>{
 const db=await setup();try{
  await db.exec(`set test.uid='${user}';set test.active='yes';set role authenticated`);
  await assert.rejects(db.query('insert into public.workshop_created_attendance_lists (lesson_id) values ($1)',[hidden]),/row.level security/i);
  await assert.rejects(db.query('insert into public.workshop_created_attendance_lists (lesson_id) values ($1)',[excluded]),/row.level security/i);
  await db.exec("set test.active='no'");
  await assert.rejects(db.query('insert into public.workshop_created_attendance_lists (lesson_id) values ($1)',[visible]),/row.level security/i);
  await db.exec('reset role;set role anon');
  await assert.rejects(db.query('select * from public.workshop_created_attendance_lists'),/permission denied/i);
 }finally{await db.close()}
});


test('an educator can remove an empty created list while keeping an audit copy',async()=>{
 const db=await setup();try{
  await db.exec(`set test.uid='${user}';set test.active='yes';set test.role_name='educador';set role authenticated`);
  await db.query('insert into public.workshop_created_attendance_lists (lesson_id) values ($1)',[visible]);
  await db.query('select public.archive_workshop_created_list($1::uuid)',[visible]);
  const {rows}=await db.query('select * from public.workshop_created_attendance_lists');assert.equal(rows.length,0);
  await assert.rejects(db.query('select * from app_private.workshop_created_list_deletions'),/permission denied/i);
  await db.exec('reset role');const audit=await db.query('select deleted_by,snapshot from app_private.workshop_created_list_deletions');
  assert.equal(audit.rows.length,1);assert.equal(audit.rows[0].deleted_by,user);assert.equal(audit.rows[0].snapshot.lesson_id,visible);
 }finally{await db.close()}
});

test('a non-educator cannot remove a list or alter its execution marker',async()=>{
 const db=await setup();try{
  await db.exec(`set test.uid='${user}';set test.active='yes';set test.role_name='articulador';set role authenticated`);
  await db.query('insert into public.workshop_created_attendance_lists (lesson_id) values ($1)',[visible]);
  await assert.rejects(db.query('select public.archive_workshop_created_list($1::uuid)',[visible]),/Sem permissão/);
  const {rows}=await db.query('select * from public.workshop_created_attendance_lists');assert.equal(rows.length,1);
 }finally{await db.close()}
});
