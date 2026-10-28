const {PGlite}=require('@electric-sql/pglite');
const {readFile}=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const test=require('node:test');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;

test('uma estratégia da coordenação responde as solicitações selecionadas preservando registros',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`
  create role anon;create role authenticated;create schema auth;create schema app_private;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table public.profiles(id uuid primary key,display_name text,role text,active boolean);
  create function app_private.is_active_staff() returns boolean language sql stable security definer as $$select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active)$$;
  create function app_private.has_any_role(a text[]) returns boolean language sql stable security definer as $$select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and p.role=any(a))$$;
  create table public.articulation_mobilization_requests(id uuid primary key,source_title text,status text,planned_date date,target_audience text,territories text[],expected_participants integer,updated_at timestamptz default now());
  create table public.articulation_mobilization_plans(id uuid primary key default gen_random_uuid(),request_id uuid unique,articulator_user_id uuid,mobilization_goal text,target_audience text,territories text[],attendance_target integer,strategies text[],main_message text,places text,partners text,materials text,responsible_text text,schedule_text text,mobilization_deadline date,notes text,status text,record_state text,updated_at timestamptz default now());
  create table public.articulation_mobilization_strategies(id uuid primary key,source_plan_id uuid,source_strategy text,title text,channel text,objective text,territory text,location text,reference_user_id uuid,collaborator_ids uuid[],deadline date,preparation_steps text,execution_steps text,resources text,request_ids uuid[],review_status text,revision integer default 1);
  create table public.articulation_mobilization_actions(id uuid primary key,strategy_ids uuid[],request_ids uuid[],revision integer default 1,updated_at timestamptz,updated_by uuid,cancelled boolean default false);
  create table public.articulation_mobilization_executions(id uuid,action_id uuid,completed boolean,report_status text);
  create table public.articulation_mobilization_interests(id uuid,action_id uuid);
  create function app_private.mobilization_command(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
  declare row record; count_imported integer:=0; mon date;
  begin
    if cmd='import' then mon:=(p->>'month')::date;
      for row in select pl.* from public.articulation_mobilization_plans pl join public.articulation_mobilization_requests r on r.id=pl.request_id where pl.status<>'cancelado' and (date_trunc('month',r.planned_date)::date=mon) loop count_imported:=count_imported+1;end loop;
    end if;
    return jsonb_build_object('imported',count_imported);
  end $$;
  insert into profiles values ('${id(1)}','Coordenadora','coordenacao_articulacao',true),('${id(2)}','Articulador','articulador',true),('${id(3)}','Educadora','educador',true);
  insert into articulation_mobilization_requests(id,source_title,status,planned_date,target_audience,territories,expected_participants) values
    ('${id(11)}','Ação original','planejado','2026-11-20','Turma A',array['Centro'],20),
    ('${id(12)}','Ação pendente','solicitado','2026-11-15','Turma B',array['Castelo Branco'],12),
    ('${id(13)}','Já respondida','solicitado','2026-11-16','Turma C',array['Outro bairro'],8),
    ('${id(14)}','Concluída','concluido','2026-11-17',null,array[]::text[],null),
    ('${id(15)}','Nova ação','solicitado','2026-11-21',null,array[]::text[],9),
    ('${id(16)}','Ação após execução','solicitado','2026-11-22',null,array[]::text[],9),
    ('${id(17)}','Proposta comum','solicitado','2026-11-22',null,array[]::text[],9),
    ('${id(18)}','Proposta recusada','solicitado','2026-11-22',null,array[]::text[],9);
  insert into articulation_mobilization_plans(id,request_id,articulator_user_id,mobilization_goal,target_audience,territories,strategies,main_message,places,partners,materials,responsible_text,schedule_text,mobilization_deadline,notes,status,record_state) values
    ('${id(21)}','${id(11)}','${id(2)}','Objetivo anterior','Público original',array['Origem'],array['WhatsApp'],'Mensagem original','Praça','Parceiro','Cartazes','Responsável','Cronograma original','2026-11-18','Observação original','planejado','draft'),
    ('${id(22)}','${id(13)}','${id(2)}','Objetivo preservado','Público C',array['Outro bairro'],array['Escolas'],'Mensagem própria','Escola','Outra rede','Panfleto','Responsável C','Cronograma C','2026-11-14','Não sobrescrever','planejado','draft');
  select set_config('request.jwt.claim.sub','${id(1)}',false);
 `);
 await db.exec(await readFile(path.join(__dirname,'../sql/mobilization_shared_responses.sql'),'utf8'));
 await t.test('responde pendentes, preserva dados próprios e não registra execução',async()=>{
  await db.exec(`insert into articulation_mobilization_strategies values ('${id(31)}','${id(21)}','WhatsApp','Estratégia comum','WhatsApp','Objetivo comum','Território','Praça','${id(2)}',array['${id(3)}'::uuid],'2026-11-18','Preparar materiais','Divulgar','Materiais',array['${id(11)}'::uuid,'${id(12)}'::uuid,'${id(13)}'::uuid,'${id(14)}'::uuid],'approved',1)`);
  const p=(await db.query('select * from articulation_mobilization_plans where request_id=$1',[id(12)])).rows[0];
  assert.equal(p.mobilization_goal,'Objetivo comum');assert.equal(p.target_audience,'Turma B');assert.deepEqual(p.territories,['Castelo Branco']);assert.equal(p.attendance_target,12);assert.equal(p.main_message,'Mensagem original');assert.equal(p.materials,'Materiais');assert.equal(p.shared_strategy_id,id(31));assert.equal(p.mobilization_deadline.toISOString().slice(0,10),'2026-11-15');assert.equal(p.status,'planejado');
  const old=(await db.query('select * from articulation_mobilization_plans where request_id=$1',[id(13)])).rows[0];assert.equal(old.mobilization_goal,'Objetivo preservado');assert.equal(old.notes,'Não sobrescrever');
  assert.equal((await db.query('select status from articulation_mobilization_requests where id=$1',[id(12)])).rows[0].status,'planejado');
  assert.equal((await db.query('select status from articulation_mobilization_requests where id=$1',[id(14)])).rows[0].status,'concluido');
  assert.equal(Number((await db.query('select count(*) n from articulation_mobilization_executions')).rows[0].n),0);
 });
 await t.test('salvar de novo não duplica e atualiza ação já organizada',async()=>{
  await db.exec(`insert into articulation_mobilization_actions(id,strategy_ids,request_ids) values ('${id(41)}',array['${id(31)}'::uuid],array['${id(11)}'::uuid,'${id(12)}'::uuid,'${id(13)}'::uuid,'${id(14)}'::uuid]);`);
  await db.query('update articulation_mobilization_strategies set request_ids=request_ids||$1::uuid where id=$2',[id(15),id(31)]);
  const a=(await db.query('select * from articulation_mobilization_actions where id=$1',[id(41)])).rows[0];assert(a.request_ids.includes(id(15)));assert.equal(a.revision,2);
  assert.equal(Number((await db.query('select count(*) n from articulation_mobilization_plans where request_id=$1',[id(15)])).rows[0].n),1);
  await db.query('update articulation_mobilization_strategies set request_ids=request_ids where id=$1',[id(31)]);
  assert.equal(Number((await db.query('select count(*) n from articulation_mobilization_plans where request_id=$1',[id(15)])).rows[0].n),1);
  assert.equal((await db.query('select revision from articulation_mobilization_actions where id=$1',[id(41)])).rows[0].revision,2);
 });
 await t.test('preserva edições manuais e impede vinculação retroativa a ação executada',async()=>{
  await db.query('update articulation_mobilization_plans set main_message=$1 where request_id=$2',['Mensagem ajustada manualmente',id(12)]);
  await db.query('update articulation_mobilization_strategies set resources=$1 where id=$2',['Novo material',id(31)]);
  const p=(await db.query('select * from articulation_mobilization_plans where request_id=$1',[id(12)])).rows[0];assert.equal(p.main_message,'Mensagem ajustada manualmente');assert.equal(p.materials,'Materiais');
  const untouched=(await db.query('select * from articulation_mobilization_plans where request_id=$1',[id(15)])).rows[0];assert.equal(untouched.materials,'Novo material');
  await db.exec(`insert into articulation_mobilization_executions values ('${id(51)}','${id(41)}',true,'finalized')`);
  await assert.rejects(()=>db.query('update articulation_mobilization_strategies set request_ids=request_ids||$1::uuid where id=$2',[id(16),id(31)]),/já possui execução ou interesses registrados/);
  const a=(await db.query('select * from articulation_mobilization_actions where id=$1',[id(41)])).rows[0];assert(!a.request_ids.includes(id(16)));assert.equal(a.revision,2);
  assert.equal(Number((await db.query('select count(*) n from articulation_mobilization_plans where request_id=$1',[id(16)])).rows[0].n),0);
 });
 await t.test('interesses já captados também impedem alterar retroativamente a ação',async()=>{
  await db.exec(`delete from articulation_mobilization_executions where action_id='${id(41)}'; insert into articulation_mobilization_interests values ('${id(52)}','${id(41)}');`);
  await assert.rejects(()=>db.query('update articulation_mobilization_strategies set request_ids=request_ids||$1::uuid where id=$2',[id(16),id(31)]),/já possui execução ou interesses registrados/);
  assert.equal(Number((await db.query('select count(*) n from articulation_mobilization_plans where request_id=$1',[id(16)])).rows[0].n),0);
 });
 await t.test('não cria propostas duplicadas ao importar planos compartilhados',async()=>{
  const result=(await db.query("select app_private.mobilization_command('import',$1::jsonb) r",[JSON.stringify({month:'2026-11-01'})])).rows[0].r;
  assert.equal(result.imported,2);
 });
 await t.test('articulador comum e estratégia recusada não respondem solicitações automaticamente',async()=>{
  await db.exec(`select set_config('request.jwt.claim.sub','${id(2)}',false); insert into articulation_mobilization_strategies values ('${id(32)}',null,null,'Proposta','WhatsApp','Objetivo',null,null,'${id(2)}',array[]::uuid[],null,null,null,null,array['${id(17)}'::uuid],'submitted',1);`);
  assert.equal(Number((await db.query('select count(*) n from articulation_mobilization_plans where request_id=$1',[id(17)])).rows[0].n),0);
  await db.exec(`select set_config('request.jwt.claim.sub','${id(1)}',false); insert into articulation_mobilization_strategies values ('${id(33)}',null,null,'Recusada','WhatsApp','Objetivo',null,null,'${id(2)}',array[]::uuid[],null,null,null,null,array['${id(18)}'::uuid],'rejected',1);`);
  assert.equal(Number((await db.query('select count(*) n from articulation_mobilization_plans where request_id=$1',[id(18)])).rows[0].n),0);
 });
});
