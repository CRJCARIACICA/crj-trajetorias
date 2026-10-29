const {PGlite}=require('@electric-sql/pglite');
const {readFile}=require('node:fs/promises');
const path=require('node:path');
const test=require('node:test');
const assert=require('node:assert/strict');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('atendimento, formulários e indicadores são transacionais e deduplicados por jovem',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`
    create role anon; create role authenticated; create schema auth; create schema app_private;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create table public.technical_service_records(
      id uuid primary key default gen_random_uuid(),service_date date not null,service_type text,program_type text,
      reason text,summary text,status text,duration_hours numeric,created_by uuid,created_at timestamptz default now(),
      source_form_submission_id uuid,legacy_service_record_id uuid,source_technical_action_plan_id uuid);
    create table public.technical_service_youth(service_id uuid references public.technical_service_records(id),youth_id uuid,primary key(service_id,youth_id));
    create table public.technical_service_professionals(service_id uuid references public.technical_service_records(id),professional_id uuid,responsibility text,primary key(service_id,professional_id));
    create table public.methodology_form_submissions(id uuid primary key default gen_random_uuid(),form_slug text,youth_id uuid,payload jsonb,sensitivity text,record_state text,source_type text,source_id uuid,created_by uuid);
    create table public.service_records(id uuid primary key default gen_random_uuid(),youth_id uuid,service_date date,category text,description text,status text);
    create table public.journey_events(id uuid primary key default gen_random_uuid(),youth_id uuid,event_type text,title text,details text,visibility text,event_date timestamptz,source_type text,source_id uuid,created_by uuid);
    create table public.indicator_events(id uuid primary key default gen_random_uuid(),indicator_code text,youth_id uuid,event_date date,quantity numeric,source_type text,source_id uuid,
      unique(indicator_code,source_type,source_id,youth_id));
    create table public.followups(id uuid primary key default gen_random_uuid(),youth_id uuid,followup_date date,followup_type text,status text);
    create table public.indicator_catalog(code text primary key,label text);
    insert into public.indicator_catalog values('M6.2_PVIDA_JOVENS','PVida');
    grant usage on schema public,auth to authenticated;
    grant select,insert,update on public.technical_service_records,public.technical_service_youth,public.technical_service_professionals,public.methodology_form_submissions,public.service_records,public.journey_events to authenticated;
    select set_config('request.jwt.claim.sub','${id(1)}',false);
  `);
  await db.exec(await readFile(path.join(__dirname,'../sql/technical_methodological_service.sql'),'utf8'));
  const save=async(program,youth,date='2026-10-10',extra=[])=>db.query(
    'select public.save_methodological_technical_service($1::jsonb,$2::uuid[],$3::uuid[],$4::jsonb) as result',
    [JSON.stringify({program_type:program,service_type:'individual',service_date:date,status:'realizado',reason:'Síntese privada',summary:'Evolução privada'}),
      [youth],[id(1)],JSON.stringify([{youth_id:youth,form_slug:program,payload:{full_name:'Teste'}},...extra])]);
  const a=(await save('pvida',id(2))).rows[0].result;
  const b=(await save('outras-demandas',id(2),'2026-10-11')).rows[0].result;
  await save('pvida',id(3),'2026-10-12');
  const counts=await db.query(`select count(*) as records,count(distinct youth_id) as people from indicator_events
     where indicator_code='M6.2_PVIDA_JOVENS' and event_date between '2026-10-01' and '2026-10-31'`);
  assert.equal(Number(counts.rows[0].records),3);
  assert.equal(Number(counts.rows[0].people),2);
  assert.equal(Number((await db.query("select count(*) n from indicator_events where indicator_code='M6.2_OUTRAS_DEMANDAS'")).rows[0].n),1);
  assert.equal((await db.query('select sensitivity from methodology_form_submissions where id=$1',[a.source_form_submission_id])).rows[0].sensitivity,'technical');
  assert.equal((await db.query("select payload->>'_pvida_service_id' as pvida from methodology_form_submissions where id=$1",[b.source_form_submission_id])).rows[0].pvida,a.id);
  assert.equal((await db.query('select description from service_records limit 1')).rows[0].description,'Atendimento realizado pela Equipe Técnica');
  assert.equal((await db.query('select source_id from journey_events limit 1')).rows[0].source_id,a.id);
  const before=Number((await db.query('select count(*) n from technical_service_records')).rows[0].n);
  await assert.rejects(()=>save('pvida',id(2),'2026-10-15',[{youth_id:id(3),form_slug:'pvida',payload:{}}]),/incompatível/);
  await assert.rejects(()=>save('atendimento',id(2)),/Selecione PVida/);
  assert.equal(Number((await db.query('select count(*) n from technical_service_records')).rows[0].n),before);
  await db.query("update technical_service_records set status='cancelado' where id=$1",[a.id]);
  assert.equal(Number((await db.query("select count(*) n from indicator_events where source_id=$1",[a.id])).rows[0].n),0);
  await db.query("insert into followups(youth_id,followup_date,followup_type,status) values($1,'2026-10-20','Outras Demandas','ativo')",[id(2)]);
  assert.equal(Number((await db.query("select count(*) n from indicator_events where source_type='followups' and indicator_code='M6.2_PVIDA_JOVENS'")).rows[0].n),1);
});
