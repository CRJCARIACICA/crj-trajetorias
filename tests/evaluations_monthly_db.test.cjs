const fs=require('node:fs'),path=require('node:path');
const test=require('node:test'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const sql=fs.readFileSync(path.join(__dirname,'../sql/evaluations_monthly.sql'),'utf8');
const educator='00000000-0000-4000-8000-000000000001', other='00000000-0000-4000-8000-000000000002', workshop='00000000-0000-4000-8000-000000000011', workshop2='00000000-0000-4000-8000-000000000012';
const key='10000000-0000-4000-8000-000000000001';
async function setup(){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth; create schema app_private;
 grant usage on schema public,auth to anon,authenticated; grant usage on schema app_private to authenticated;
 create table auth.users(id uuid primary key); insert into auth.users values ('${educator}'),('${other}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create function app_private.is_active_staff() returns boolean language sql stable as $$select coalesce(current_setting('test.active',true)='yes',false)$$;
 create function app_private.has_any_role(roles text[]) returns boolean language sql stable as $$select coalesce(current_setting('test.role_name',true)=any(roles),false)$$;
 create table public.workshops(id uuid primary key,name text not null); insert into public.workshops values ('${workshop}','Capoeira'),('${workshop2}','Jiu-jitsu');
 grant select on public.workshops to authenticated;
 `);
 await db.exec(sql);return db;
}
async function staff(db,role='educador',id=educator){await db.exec(`reset role; set test.uid='${id}'; set test.active='yes'; set test.role_name='${role}'; set role authenticated`)}
async function ensure(db,slug,month='2026-11-01',workshopId=null){return (await db.query('select public.evaluation_ensure_month($1,$2,$3) c',[slug,month,workshopId])).rows[0].c}

test('oficinas e anexos CFDH têm ciclos mensais independentes e links estáveis',async()=>{
 const db=await setup();try{
  await staff(db);const a=await ensure(db,'avaliacao-atividades','2026-11-01',workshop),same=await ensure(db,'avaliacao-atividades','2026-11-01',workshop);
  const next=await ensure(db,'avaliacao-atividades','2026-12-01',workshop),b=await ensure(db,'avaliacao-atividades','2026-11-01',workshop2);
  const youth=await ensure(db,'cfdh-avaliacao-jovens'),team=await ensure(db,'cfdh-avaliacao-equipe');
  assert.equal(a.id,same.id);assert.equal(a.public_token,same.public_token);
  assert.equal(new Set([a.id,next.id,b.id,youth.id,team.id]).size,5);
  await assert.rejects(ensure(db,'avaliacao-atividades','2026-11-02',workshop),/Mês de referência inválido/);
  await assert.rejects(ensure(db,'cfdh-avaliacao-jovens','2026-11-01',workshop),/CFDH usa o mês/);
 }finally{await db.close()}
});

test('link público permite envio idempotente e não permite leitura das respostas ou de outros anexos',async()=>{
 const db=await setup();try{
  await staff(db);const a=await ensure(db,'avaliacao-atividades','2026-11-01',workshop),team=await ensure(db,'cfdh-avaliacao-equipe');
  await db.exec('reset role;set role anon');
  const context=(await db.query('select public.evaluation_public_context($1::uuid) c',[a.public_token])).rows[0].c;
  assert.equal(context.workshop_name,'Capoeira');assert.equal(context.form_slug,'avaliacao-atividades');assert.equal(context.id,undefined);
  await assert.rejects(db.query('select * from public.evaluation_monthly_responses'),/permission denied/i);
  await assert.rejects(db.query('select * from public.evaluation_monthly_cycles'),/permission denied/i);
  await assert.rejects(db.query('select public.evaluation_public_context($1::uuid)',[team.public_token]),/inválido ou avaliação encerrada/);
  const send=payload=>db.query('select public.evaluation_public_submit($1::uuid,$2::uuid,$3::jsonb)',[a.public_token,key,JSON.stringify(payload)]);
  await assert.rejects(send({organization:'inexistente'}),/Resposta de avaliação inválida/);
  await assert.rejects(send({organization:'Bom\/Boa',cpf:'123'}),/Campo de avaliação inválido/);
  await assert.rejects(send({notes:'sem nota'}),/pelo menos um/);
  await send({organization:'Bom/Boa',notes:'Foi bom',class_name:'outra oficina'});await send({organization:'Bom/Boa',notes:'Foi bom'});
  await staff(db,'psicologo',other);const {rows}=await db.query('select * from public.evaluation_monthly_responses');
  assert.equal(rows.length,1);assert.equal(rows[0].payload.class_name,'Capoeira');assert.equal(rows[0].staff_user_id,null);
  await db.query('update public.evaluation_monthly_cycles set is_open=false where id=$1',[a.id]);
  await db.exec('reset role;set role anon');
  await assert.rejects(send({organization:'Bom/Boa'}),/inválido ou avaliação encerrada/);
 }finally{await db.close()}
});

test('somente equipe autorizada responde o Anexo 13, uma resposta editável por profissional',async()=>{
 const db=await setup();try{
  await staff(db);const cycle=await ensure(db,'cfdh-avaliacao-equipe');
  const submit=p=>db.query('select public.evaluation_staff_submit($1::uuid,$2::jsonb)',[cycle.id,JSON.stringify(p)]);
  await submit({engagement:'Bom/Boa',notes:'Primeira versão'});await submit({engagement:'Ótimo(a)',notes:'Atualizada'});
  let rows=(await db.query('select * from public.evaluation_monthly_responses')).rows;
  assert.equal(rows.length,1);assert.equal(rows[0].payload.notes,'Atualizada');
  await staff(db,'assistente_social',other);await submit({engagement:'Regular'});
  rows=(await db.query('select * from public.evaluation_monthly_responses')).rows;assert.equal(rows.length,2);
  await staff(db,'articulador',other);await assert.rejects(submit({engagement:'Regular'}),/Sem permissão/);
  assert.equal((await db.query('select * from public.evaluation_monthly_responses')).rows.length,0);
  await db.exec('reset role;set role anon');await assert.rejects(submit({engagement:'Regular'}),/permission denied/i);
 }finally{await db.close()}
});
