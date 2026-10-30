const {PGlite}=require('@electric-sql/pglite');
const {readFile}=require('node:fs/promises');
const path=require('node:path');
const test=require('node:test');
const assert=require('node:assert/strict');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('PTrampo reúne ações, agenda a janela e preserva presenças ao atualizar execução',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`
 create role anon; create role authenticated; create schema auth; create schema app_private;create schema technical_private;
 create function auth.uid() returns uuid language sql stable as $$select '${id(99)}'::uuid$$;
 create function app_private.has_any_role(text[]) returns boolean language sql stable as $$select coalesce(current_setting('test.allowed',true),'yes')='yes'$$;
 create function app_private.is_technical_staff(uuid) returns boolean language sql stable as $$select true$$;
 create table profiles(id uuid primary key,role text,active boolean);
 insert into profiles values('${id(99)}','psicologo',true);
 create table young_people(id uuid primary key,full_name text,status text,deleted_at timestamptz,birth_date date,cpf text,phone text,email text,neighborhood text,initial_form_status text);
 insert into young_people(id,full_name,status) values('${id(1)}','Jovem Um','ativo'),('${id(2)}','Jovem Dois','ativo'),('${id(3)}','Jovem Três','ativo');
 create table app_private.youth_signatures(youth_id uuid,signature_data text,updated_at timestamptz);
 create table methodology_form_submissions(id uuid primary key,payload jsonb,updated_at timestamptz);
 create table technical_service_youth(service_id uuid,youth_id uuid,participation_role text,unique(service_id,youth_id));
 create table technical_action_plans(id uuid primary key default gen_random_uuid(),plan_month date,action_type text,action_scope text,title text,objective text,planned_activities text,expected_results text,target_audience text,planned_date date,start_time time,end_time time,planned_duration_hours numeric,location_type text,location_details text,partners text,methodology_links jsonb,status text,created_by uuid,updated_by uuid,created_at timestamptz default now(),updated_at timestamptz default now(),check(end_time is null or start_time is null or end_time>start_time));
 create table technical_action_plan_professionals(plan_id uuid,professional_id uuid,responsibility text);
 create table technical_action_executions(id uuid primary key default gen_random_uuid(),plan_id uuid unique,execution_date date,actual_start time,actual_end time,execution_status text,execution_description text,results text,referrals text,observations text,methodology_links jsonb,service_record_id uuid,attendance_submission_id uuid);
 create table technical_action_attendance(id uuid primary key default gen_random_uuid(),execution_id uuid,plan_id uuid,youth_id uuid,present bool,participation_role text default 'participante',notes text,created_by uuid,created_at timestamptz default now(),unique(execution_id,youth_id));
 create table technical_action_checkin_windows(id uuid primary key default gen_random_uuid(),plan_id uuid unique,public_token uuid default gen_random_uuid(),opens_at timestamptz,closes_at timestamptz,active bool,execution_id uuid,created_by uuid,updated_at timestamptz default now());
 create table technical_action_checkin_presence(id uuid primary key default gen_random_uuid(),window_id uuid,plan_id uuid,youth_id uuid,present boolean,source text,updated_at timestamptz default now(),unique(window_id,youth_id));
 create table articulation_mobilization_requests(id uuid primary key default gen_random_uuid(),source_type text,source_title text,planned_date date);
 create function public.save_technical_action_execution_v2(p_execution jsonb,p_youth_ids uuid[]) returns jsonb language plpgsql set search_path=public,pg_temp as $f$
 declare v_plan uuid:=(p_execution->>'plan_id')::uuid;v_exec uuid;
 begin
   insert into technical_action_executions(plan_id,execution_date,actual_start,actual_end,execution_status,execution_description,results,referrals,observations,methodology_links)
   values(v_plan,nullif(p_execution->>'execution_date','')::date,nullif(p_execution->>'actual_start','')::time,nullif(p_execution->>'actual_end','')::time,p_execution->>'execution_status',p_execution->>'execution_description',p_execution->>'results',p_execution->>'referrals',p_execution->>'observations',p_execution->'methodology_links')
   on conflict(plan_id) do update set execution_description=excluded.execution_description returning id into v_exec;
   delete from technical_action_attendance where execution_id=v_exec;
   insert into technical_action_attendance(execution_id,plan_id,youth_id,present) select v_exec,v_plan,unnest(p_youth_ids),true;
   update technical_action_checkin_windows set active=false where plan_id=v_plan;
   return jsonb_build_object('execution_id',v_exec);
 end $f$;
 `);
 await db.exec(await readFile(path.join(__dirname,'../sql/ptrampo_projects.sql'),'utf8'));
 await db.exec(await readFile(path.join(__dirname,'../sql/ptrampo_rpc_private.sql'),'utf8'));
 const project={reference_month:'2026-11-01',title:'Projeto PTrampo',objective:'Objetivo',methodology:'Método',responsible_id:id(99),status:'rascunho'};
 const actions=Array.from({length:8},(_,i)=>({activity_number:i+1,title:`Ação ${i+1}`,objective:'Objetivo',planned_activities:'Atividade',expected_results:'Resultado',planned_date:'2026-11-03',start_time:'13:00',end_time:'15:00'}));
 const draft=await db.query('select public.save_ptrampo_project($1::jsonb,$2::jsonb) result',[JSON.stringify(project),JSON.stringify(actions.filter(a=>a.activity_number!==4))]);
 const projectId=draft.rows[0].result.id;
 assert.equal(draft.rows[0].result.action_count,7);
 assert.equal((await db.query('select count(*)::int n from technical_action_checkin_windows')).rows[0].n,0,'rascunho não abre listas');
 project.id=projectId;project.status='planejado';
 const existing=(await db.query('select activity_number,technical_plan_id from ptrampo_project_actions where project_id=$1',[projectId])).rows;
 for(const a of actions){a.technical_plan_id=existing.find(x=>x.activity_number===a.activity_number)?.technical_plan_id||''}
 await assert.rejects(db.query('select public.save_ptrampo_project($1::jsonb,$2::jsonb)',[JSON.stringify(project),JSON.stringify(actions.filter(a=>a.activity_number!==4))]),/oito ações/);
 assert.equal((await db.query('select status from ptrampo_projects where id=$1',[projectId])).rows[0].status,'rascunho','falha não altera o projeto');
 await db.query('select public.save_ptrampo_project($1::jsonb,$2::jsonb)',[JSON.stringify(project),JSON.stringify(actions)]);
 let result=await db.query('select activity_number,technical_plan_id from ptrampo_project_actions where project_id=$1 order by activity_number',[projectId]);assert.equal(result.rows.length,8);
 const planId=result.rows[0].technical_plan_id;
 result=await db.query('select opens_at::text,closes_at::text,active from technical_action_checkin_windows where plan_id=$1',[planId]);
 assert.match(result.rows[0].opens_at,/2026-11-03 16:00:00/);assert.match(result.rows[0].closes_at,/2026-11-03 18:00:00/);assert.equal(result.rows[0].active,true);
 await db.query("update technical_action_plans set planned_date='2020-01-02',start_time='13:00',end_time='15:00' where id=$1",[planId]);
 await db.query("insert into technical_action_executions(plan_id,execution_date,execution_status,execution_description) values($1,'2020-01-02','realizada','Realizada')",[planId]);
 await db.query("insert into methodology_form_submissions values($1,'{}',now())",[id(50)]);
 await db.query('update technical_action_executions set service_record_id=$2,attendance_submission_id=$3 where plan_id=$1',[planId,id(51),id(50)]);
 await db.query("insert into technical_action_attendance(execution_id,plan_id,youth_id,present,notes) select id,plan_id,$2,true,'Nota preservada' from technical_action_executions where plan_id=$1",[planId,id(1)]);
 await db.query("insert into technical_action_checkin_presence(window_id,plan_id,youth_id,present,source) select id,plan_id,$2,true,'public_link' from technical_action_checkin_windows where plan_id=$1",[planId,id(2)]);
 await db.query('select ptrampo_add_presence($1,$2::uuid[])',[planId,[id(3)]]);
 const attendance=await db.query('select youth_id from technical_action_attendance where plan_id=$1 order by youth_id',[planId]);
 assert.deepEqual(attendance.rows.map(x=>x.youth_id),[id(1),id(2),id(3)],'inclui presença anterior, link e acréscimo posterior');
 assert.equal((await db.query("select payload->>'participant_count' n from methodology_form_submissions where id=$1",[id(50)])).rows[0].n,'3','evidência é atualizada ao receber novas presenças');
 assert.equal((await db.query('select count(*)::int n from technical_service_youth where service_id=$1',[id(51)])).rows[0].n,2);
 const prior=(await db.query('select id,notes,created_at from technical_action_attendance where plan_id=$1 and youth_id=$2',[planId,id(1)])).rows[0];
 await db.query('select ptrampo_save_execution($1::jsonb,$2::uuid[])',[JSON.stringify({plan_id:planId,execution_date:'2020-01-02',execution_status:'realizada',execution_description:'Atualizada'}),[]]);
 const preserved=(await db.query('select id,notes,created_at from technical_action_attendance where plan_id=$1 and youth_id=$2',[planId,id(1)])).rows[0];
 assert.equal(preserved.id,prior.id);assert.equal(preserved.notes,'Nota preservada');assert.deepEqual(preserved.created_at,prior.created_at);
 const roster=await db.query('select ptrampo_action_presence($1) result',[planId]);assert.equal(roster.rows[0].result.length,3);
 // A função de planejamento também precisa funcionar com privilégios reais de cliente autenticado.
 await db.exec(`grant usage on schema auth,app_private,technical_private to authenticated; grant select,insert,update,delete on technical_action_plans,technical_action_plan_professionals to authenticated; set role authenticated`);
 const authDraft={...project,id:'',status:'rascunho',title:'Projeto criado pela equipe'};
 const authCreated=await db.query('select public.save_ptrampo_project($1::jsonb,$2::jsonb) r',[JSON.stringify(authDraft),JSON.stringify([actions[0]&&{...actions[0],technical_plan_id:''}])]);
 assert.equal(authCreated.rows[0].r.action_count,1);await db.exec('reset role');
 // Conversão realista: sete posições, três cópias da 8ª, currículos separado e solicitações respondidas preservadas.
 const legacyTitles=['1. Descobrindo o mundo do trabalho: por onde começar?','2. Habilidades','3. Primeiro emprego','5. Entrevista','6. Direitos','7. Futuro','8. Comunicação','8. Comunicação','8. Comunicação'];
 for(let i=0;i<legacyTitles.length;i++)await db.query(`insert into technical_action_plans(id,plan_month,action_type,title,planned_date,start_time,end_time,status,created_by,created_at) values($1,'2026-10-01','ptrampo',$2,('2026-11-03'::date + $3::int),'13:00','15:00','planejado',$4,now()+($3||' seconds')::interval)`,[id(100+i),legacyTitles[i],i,id(99)]);
 await db.query(`insert into technical_action_plans(id,plan_month,action_type,title,planned_date,start_time,end_time,status,created_by) values($1,'2026-10-01','ptrampo','Elaboração de currículos','2026-11-18','14:00','16:00','realizado',$2)`,[id(120),id(99)]);
 const reqs=['Descobrindo o mundo do trabalho: por onde começar?',...legacyTitles.slice(0,3),'4. Meu primeiro currículo: como apresentar minhas habilidades sem experiência?','4. Meu primeiro currículo: como apresentar minhas habilidades sem experiência?',legacyTitles[3],legacyTitles[5],legacyTitles[6]];
 for(let i=0;i<reqs.length;i++)await db.query(`insert into articulation_mobilization_requests(id,source_type,source_title,planned_date) values($1,'ptrampo',$2,'2026-11-12')`,[id(140+i),reqs[i]]);
 const legacyMigration=await readFile(path.join(__dirname,'../sql/ptrampo_existing_november_2026.sql'),'utf8');
 await db.exec(legacyMigration);await db.exec(legacyMigration);
 const converted=(await db.query("select id from ptrampo_projects where migration_key='novembro-2026-atividades-originais'")).rows[0].id;
 const linked=(await db.query('select activity_number,relationship from ptrampo_project_actions where project_id=$1',[converted])).rows;
 assert.equal(linked.filter(x=>x.relationship==='canonical').length,7);assert.equal(linked.filter(x=>x.relationship==='history').length,2);assert.equal(linked.filter(x=>x.relationship==='review').length,1);
 assert(!linked.some(x=>x.relationship==='canonical'&&x.activity_number===4));
 assert.equal((await db.query('select count(*)::int n from articulation_mobilization_requests where ptrampo_project_id=$1',[converted])).rows[0].n,9);
 await db.exec("select set_config('test.allowed','no',false)");
 await assert.rejects(db.query('select ptrampo_action_presence($1)',[planId]),/Sem permissão/);
 await assert.rejects(db.query('select ptrampo_add_presence($1,$2::uuid[])',[planId,[id(3)]]),/Somente a Equipe Técnica/);
});
