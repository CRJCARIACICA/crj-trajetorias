begin;
create temporary table planning_test_ctx as
select gen_random_uuid() as instructor,gen_random_uuid() as other_instructor,gen_random_uuid() as educator,
gen_random_uuid() as workshop,gen_random_uuid() as plan,gen_random_uuid() as lesson1,gen_random_uuid() as lesson2,
gen_random_uuid() as request1,gen_random_uuid() as request2;
grant select on planning_test_ctx to authenticated;
insert into auth.users(id,email)
select instructor,instructor::text||'@planning-test.invalid' from planning_test_ctx
union all select other_instructor,other_instructor::text||'@planning-test.invalid' from planning_test_ctx
union all select educator,educator::text||'@planning-test.invalid' from planning_test_ctx;
update public.profiles set role='oficineiro',active=true,display_name='TESTE TEMPORÁRIO OFICINEIRO'
 where id in(select instructor from planning_test_ctx union select other_instructor from planning_test_ctx);
update public.profiles set role='educador',active=true,display_name='TESTE TEMPORÁRIO EDUCADOR'
 where id=(select educator from planning_test_ctx);
insert into public.workshops(id,name,oficineiro_user_id,educator_user_id,created_by)
select workshop,'__TESTE_TEMPORARIO_EVIDENCIA__',instructor,educator,educator from planning_test_ctx;
insert into public.workshop_monthly_plans(id,workshop_id,plan_month,instructor_user_id,educator_user_id,created_by)
select plan,workshop,'2027-03-01',instructor,educator,educator from planning_test_ctx;
insert into public.workshop_plan_lessons(id,plan_id,lesson_number,scheduled_date,theme,updated_at)
select lesson1,plan,1,date '2027-03-02','Tema de teste',timestamptz '2000-01-01' from planning_test_ctx
union all select lesson2,plan,2,date '2027-03-04','Tema de teste',timestamptz '2000-01-01' from planning_test_ctx;
select set_config('request.jwt.claim.sub',(select instructor::text from planning_test_ctx),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select instructor::text from planning_test_ctx),'role','authenticated')::text,true);
set local role authenticated;
do $test$
declare c record; result jsonb; evidence jsonb; repeated jsonb; latest timestamptz; denied boolean:=false;
begin
 select * into c from planning_test_ctx;
 result:=public.workshop_instructor_save_lesson_v2(c.lesson1,'Objetivo preservado','Atividade preservada','Recurso preservado','2000-01-01');
 if result->>'ok'<>'true' or result->'lesson'->>'objective'<>'Objetivo preservado' then raise exception 'Falha: salvamento não confirmado';end if;
 if (select objective is not null from public.workshop_plan_lessons where id=c.lesson2) then raise exception 'Falha: outro bloco foi alterado';end if;
 begin
  perform public.workshop_instructor_save_lesson_v2(c.lesson1,'Texto antigo','Texto antigo','Texto antigo','1999-01-01');
 exception when serialization_failure then denied:=true;
 end;
 if not denied then raise exception 'Falha: alteração concorrente aceita';end if;
 denied:=false;
 begin perform public.workshop_create_instructor_evidence('2027-03-01',c.request1);
 exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Falha: evidência com bloco incompleto aceita';end if;
 result:=public.workshop_instructor_save_lesson_v2(c.lesson2,'Segundo objetivo','Segunda atividade','Segundo recurso','2000-01-01');
 evidence:=public.workshop_create_instructor_evidence('2027-03-01',c.request1);
 repeated:=public.workshop_create_instructor_evidence('2027-03-01',c.request1);
 if evidence->>'id' is distinct from repeated->>'id' then raise exception 'Falha: solicitação repetida duplicou evidência';end if;
 if (select count(*) from public.workshop_instructor_evidences where instructor_user_id=c.instructor)<>1 then raise exception 'Falha: quantidade de evidências';end if;
 if (select snapshot->'plans'->0->'lessons'->0->>'objective' from public.workshop_instructor_evidences where id=(evidence->>'id')::uuid)<>'Objetivo preservado' then raise exception 'Falha: snapshot não corresponde aos blocos';end if;
 if (select snapshot->>'total_lessons' from public.workshop_instructor_evidences where id=(evidence->>'id')::uuid)<>'2' then raise exception 'Falha: blocos não consolidados';end if;
 repeated:=public.workshop_create_instructor_evidence('2027-03-01',c.request2);
 if repeated->>'version'<>'2' then raise exception 'Falha: versionamento';end if;
 denied:=false;
 begin update public.workshop_instructor_evidences set status='ready' where id=(evidence->>'id')::uuid;
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Falha: cliente pode publicar arquivos';end if;
 select updated_at into latest from public.workshop_plan_lessons where id=c.lesson1;
 perform public.workshop_instructor_save_lesson_v2(c.lesson1,'Nova descrição','Nova atividade','Novo recurso',latest);
 if (select snapshot->'plans'->0->'lessons'->0->>'objective' from public.workshop_instructor_evidences where id=(evidence->>'id')::uuid)<>'Objetivo preservado' then raise exception 'Falha: edição alterou evidência anterior';end if;
end $test$;
select set_config('request.jwt.claim.sub',(select other_instructor::text from planning_test_ctx),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select other_instructor::text from planning_test_ctx),'role','authenticated')::text,true);
do $test$
declare c record; denied boolean:=false;
begin
 select * into c from planning_test_ctx;
 if (select count(*) from public.workshop_instructor_evidences)<>0 then raise exception 'Falha: outro oficineiro acessou evidências';end if;
 begin perform public.workshop_instructor_save_lesson_v2(c.lesson1,'Invasão','Invasão','Invasão',now());
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Falha: outro oficineiro alterou bloco';end if;
end $test$;
select set_config('request.jwt.claim.sub',(select educator::text from planning_test_ctx),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select educator::text from planning_test_ctx),'role','authenticated')::text,true);
do $test$
begin
 if (select count(*) from public.workshop_instructor_evidences where instructor_user_id=(select instructor from planning_test_ctx))<>2 then raise exception 'Falha: educador responsável não consulta evidências';end if;
end $test$;
reset role;
do $test$
begin
 if not exists(select 1 from public.workshop_instructor_audit_log where instructor_user_id=(select instructor from planning_test_ctx)
 and details->>'type'='planning_block_content_backup'
 and details->'before_fields'->>'objective'='Objetivo preservado') then raise exception 'Falha: cópia anterior não preservada';end if;
end $test$;
rollback;
select 'passed: save, other-block preservation, conflict, completeness, snapshot, idempotency, versions, immutable history, RLS and content backup; fixtures rolled back' as validation;
