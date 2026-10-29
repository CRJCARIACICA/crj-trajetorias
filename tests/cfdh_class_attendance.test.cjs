const {PGlite}=require('@electric-sql/pglite');
const {readFile}=require('node:fs/promises');
const path=require('node:path');
const test=require('node:test');
const assert=require('node:assert/strict');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('turma CFDH compartilha presença e deduplica horas na aula vinculada',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  await db.exec(`
    create role anon;create role authenticated;create schema auth;create schema app_private;
    create function auth.uid() returns uuid language sql stable as $$select '${id(99)}'::uuid$$;
    create function app_private.is_active_staff() returns boolean language sql stable as $$select true$$;
    create function app_private.has_any_role(text[]) returns boolean language sql stable as $$select true$$;
    create table public.educator_plans(id uuid primary key,plan_type text,activity_title text);
    create table public.cfdh_actions(id uuid primary key,plan_id uuid references public.educator_plans(id),workshop_plan_lesson_id uuid,workshop_id uuid,program_metric_links jsonb,planning_status text,execution_status text,scheduled_date date,actual_date date,actual_start time,actual_end time,actual_duration_hours numeric,action_number int,title text,location_type text,location_other text,start_time time,end_time time);
    create table public.workshop_sessions(id uuid primary key,plan_lesson_id uuid,session_date date,cfdh_minutes int default 0);
    create table public.workshops(id uuid primary key,name text);
    create table public.young_people(id uuid primary key,preferred_name text,full_name text,birth_date date,cpf text,phone text,email text,neighborhood text,initial_form_status text);
    create table public.provisional_people(id uuid primary key,full_name text,birth_date date,cpf text,phone text,email text,neighborhood text);
    create table public.attendance(id uuid primary key,session_id uuid,workshop_id uuid,youth_id uuid,attendance_date date,present boolean,created_by uuid,created_at timestamptz default now());
    create table public.cfdh_attendance(id uuid primary key default gen_random_uuid(),action_id uuid,plan_id uuid,youth_id uuid,attendance_date date,present boolean,notes text,created_by uuid,unique(action_id,youth_id));
    create table public.cfdh_enrollments(id uuid primary key,plan_id uuid,youth_id uuid,status text);
    create table public.workshop_enrollments(id uuid primary key,workshop_id uuid,youth_id uuid,status text);
    create table public.workshop_guest_participations(id uuid primary key,session_id uuid,provisional_person_id uuid,participation_date date);
    create table app_private.cfdh_enrollment_secrets(enrollment_id uuid,signature_data text);
    create table app_private.workshop_enrollment_secrets(enrollment_id uuid,signature_data text);
    create table app_private.youth_signatures(youth_id uuid,signature_data text);
    create table app_private.workshop_guest_signatures(participation_id uuid,signature_data text);
    create table public.indicator_events(id uuid primary key default gen_random_uuid(),indicator_code text,youth_id uuid,event_date date,quantity numeric,source_type text,source_id uuid,source_mode text);
    create function app_private.sync_cfdh_program_indicators(p_action_id uuid) returns void language plpgsql security definer as $f$
    declare a public.cfdh_actions%rowtype;v_oficina boolean:=false;v_hours numeric:=0;
    begin
      select * into a from public.cfdh_actions where id=p_action_id;
      delete from public.indicator_events where source_type='cfdh_program' and source_id=p_action_id;
      if a.execution_status in ('realizada','parcial') and a.program_metric_links @> '[{"program":"pvida"}]'::jsonb then
        insert into public.indicator_events(indicator_code,event_date,quantity,source_type,source_id) values('M6.2_PVIDA_HORAS',a.actual_date,a.actual_duration_hours,'cfdh_program',a.id);
        insert into public.indicator_events(indicator_code,youth_id,event_date,quantity,source_type,source_id)
          select 'M6.2_PVIDA_PARTICIPACOES',youth_id,a.actual_date,1,'cfdh_program',a.id from public.cfdh_attendance where action_id=a.id and present;
      end if;
      if v_oficina and v_hours>0 then
        null;
      end if;
    end $f$;
    create function public.stub_workshop_attendance() returns trigger language plpgsql as $f$
    begin
      delete from public.indicator_events where source_type='attendance' and source_id=coalesce(new.id,old.id);
      if tg_op<>'DELETE' and new.present then
        insert into public.indicator_events(indicator_code,youth_id,event_date,quantity,source_type,source_id) values('M2.1_ATENDIMENTOS',new.youth_id,new.attendance_date,1,'attendance',new.id);
      end if;
      return coalesce(new,old);
    end $f$;
    create trigger stub_workshop_attendance after insert or update or delete on public.attendance for each row execute function public.stub_workshop_attendance();
  `);
  await db.exec(await readFile(path.join(__dirname,'../sql/cfdh_class_attendance.sql'),'utf8'));
  await db.exec(`
    insert into public.young_people(id,full_name,initial_form_status) values('${id(1)}','Jovem Teste','completo');
    insert into public.educator_plans values('${id(2)}','cfdh_estrutural','Circuito estrutural'),('${id(3)}','cfdh_transversal','Circuito transversal');
    insert into public.cfdh_actions(id,plan_id,planning_status,execution_status,scheduled_date,action_number,title)
      values('${id(4)}','${id(2)}','complete','planejada','2026-10-01',1,'Estrutural');
    insert into public.cfdh_attendance(action_id,plan_id,youth_id,attendance_date,present)
      values('${id(4)}','${id(2)}','${id(1)}','2026-10-01',true);
  `);
  const count=async(sql)=>Number((await db.query(sql)).rows[0].n);
  assert.equal(await count("select count(*) n from indicator_events where indicator_code='M2.1_ATENDIMENTOS'"),1);
  assert.equal(await count("select count(*) n from indicator_events where indicator_code='M6.1_CFDH_HORAS'"),0);
  await db.exec(`update cfdh_actions set execution_status='realizada',actual_date='2026-10-01',actual_duration_hours=2 where id='${id(4)}';`);
  assert.equal(await count("select sum(quantity) n from indicator_events where source_type='cfdh_action_hours'"),2);
  await db.exec(`
    insert into public.cfdh_actions(id,plan_id,workshop_plan_lesson_id,workshop_id,planning_status,execution_status,scheduled_date,action_number,title)
      values('${id(5)}','${id(3)}','${id(8)}','${id(9)}','complete','planejada','2026-10-02',1,'Transversal 1'),('${id(6)}','${id(3)}','${id(8)}','${id(9)}','complete','planejada','2026-10-02',2,'Transversal 2');
    insert into public.workshops values('${id(9)}','Oficina');
    insert into public.workshop_sessions(id,plan_lesson_id,session_date) values('${id(7)}','${id(8)}','2026-10-02');
    insert into public.attendance(id,session_id,workshop_id,youth_id,attendance_date,present) values('${id(10)}','${id(7)}','${id(9)}','${id(1)}','2026-10-02',true);
  `);
  assert.equal(await count("select count(*) n from cfdh_attendance where source_workshop_attendance_id is not null"),2);
  assert.equal(await count("select count(*) n from indicator_events where indicator_code='M2.1_ATENDIMENTOS'"),2,'uma presença estrutural e uma da oficina');
  const roster=(await db.query(`select public.staff_cfdh_class_roster('${id(3)}') roster`)).rows[0].roster;
  assert.equal(roster.length,1);assert.equal(roster[0].action_ids.length,2);
  await db.exec(`insert into provisional_people(id,full_name) values('${id(11)}','Visitante Teste');insert into workshop_guest_participations(id,session_id,provisional_person_id,participation_date) values('${id(12)}','${id(7)}','${id(11)}','2026-10-02');`);
  assert.equal(await count("select count(*) n from indicator_events where source_type='cfdh_workshop_guest'"),1,'visitante conta uma única vez para a aula');
  const withGuest=(await db.query(`select public.staff_cfdh_class_roster('${id(3)}') roster`)).rows[0].roster;assert.equal(withGuest.length,2);assert.equal(withGuest.find(r=>r.kind==='visitante').action_ids.length,2);
  await db.exec(`delete from workshop_guest_participations where id='${id(12)}'`);
  await db.exec(`
    update cfdh_actions set execution_status='realizada',actual_date='2026-10-02',actual_start='09:00',actual_end='11:00',actual_duration_hours=2,program_metric_links='[{"program":"pvida"}]' where id='${id(5)}';
    update cfdh_actions set execution_status='realizada',actual_date='2026-10-02',actual_start='10:00',actual_end='12:00',actual_duration_hours=2,program_metric_links='[{"program":"pvida"}]' where id='${id(6)}';
  `);
  assert.equal(await count("select sum(quantity) n from indicator_events where source_type='cfdh_lesson_hours'"),3,'intervalos sobrepostos contam uma vez');
  assert.equal(await count("select sum(quantity) n from indicator_events where indicator_code='M6.2_PVIDA_HORAS'"),3,'vínculo PVida soma os intervalos sem sobreposição');
  assert.equal(await count("select count(*) n from indicator_events where indicator_code='M6.2_PVIDA_PARTICIPACOES'"),1,'participação nominal vinculada conta uma vez na mesma aula');
  await db.exec(`insert into workshop_guest_participations(id,session_id,provisional_person_id,participation_date) values('${id(12)}','${id(7)}','${id(11)}','2026-10-02')`);
  assert.equal(await count("select count(*) n from indicator_events where indicator_code='M6.2_PVIDA_PARTICIPACOES'"),2,'visitante tem uma participação nominal na meta vinculada');
  await db.exec(`delete from workshop_guest_participations where id='${id(12)}'`);
  assert.equal(await count("select count(*) n from indicator_events where indicator_code='M6.2_PVIDA_PARTICIPACOES'"),1);
  await db.exec(`update workshop_sessions set cfdh_minutes=60 where id='${id(7)}'`);
  assert.equal(await count("select sum(quantity) n from indicator_events where source_type='cfdh_lesson_hours'"),2,'horas já lançadas na oficina são descontadas');
  await db.exec(`update cfdh_attendance set notes='Registro próprio' where action_id='${id(5)}';delete from attendance where id='${id(10)}';`);
  assert.equal(await count("select count(*) n from cfdh_attendance where source_workshop_attendance_id is not null"),0);
  assert.equal(await count(`select count(*) n from cfdh_attendance where action_id='${id(5)}'`),1,'registro próprio não é apagado');
  assert.equal(await count(`select count(*) n from cfdh_attendance where action_id='${id(6)}'`),0,'projeção órfã é removida');
  assert.equal(await count("select count(*) n from indicator_events where indicator_code='M2.1_ATENDIMENTOS'"),2);
  await db.exec(`update cfdh_actions set execution_status='cancelada' where id='${id(5)}'`);
  assert.equal(await count("select sum(quantity) n from indicator_events where source_type='cfdh_lesson_hours'"),1);
});
