-- Teste transacional do banco existente: não persiste colaboradores ou solicitações fictícias.
begin;
create temporary table shared_mob_test as select gen_random_uuid() coordinator,gen_random_uuid() articulator,gen_random_uuid() educator,
  gen_random_uuid() req_original,gen_random_uuid() req_pending,gen_random_uuid() req_answered,gen_random_uuid() strategy,
  gen_random_uuid() source_plan,gen_random_uuid() existing_plan,gen_random_uuid() month_plan,gen_random_uuid() action;
grant select on shared_mob_test to authenticated;
select set_config('request.jwt.claim.sub','',true);
insert into auth.users(id,email) select x,x::text||'@shared-mob-test.invalid' from shared_mob_test cross join lateral unnest(array[coordinator,articulator,educator]) x;
update public.profiles set role='coordenacao_articulacao',active=true,display_name='TESTE COORD' where id=(select coordinator from shared_mob_test);
update public.profiles set role='articulador',active=true,display_name='TESTE ART' where id=(select articulator from shared_mob_test);
update public.profiles set role='educador',active=true,display_name='TESTE EDU' where id=(select educator from shared_mob_test);
insert into public.articulation_mobilization_requests(id,source_type,source_title,requested_by,planned_date,target_audience,territories,expected_participants,status)
select req_original,'oficina','TESTE A',educator,'2043-02-20','Público A',array['A'],20,'planejado' from shared_mob_test
union all select req_pending,'oficina','TESTE B',educator,'2043-02-15','Público B',array['Bairro B'],12,'solicitado' from shared_mob_test
union all select req_answered,'oficina','TESTE C',educator,'2043-02-16','Público C',array['C'],9,'solicitado' from shared_mob_test;
insert into public.articulation_mobilization_plans(id,request_id,articulator_user_id,mobilization_goal,strategies,main_message,materials,mobilization_deadline,status)
select source_plan,req_original,articulator,'Objetivo original',array['WhatsApp'],'Mensagem comum','Cartazes','2043-02-18','planejado' from shared_mob_test
union all select existing_plan,req_answered,articulator,'Resposta manual preservada',array['Escolas'],'Mensagem própria','Panfletos','2043-02-14','planejado' from shared_mob_test;
insert into public.articulation_mobilization_strategies(id,reference_month,source_plan_id,source_strategy,title,channel,objective,request_ids,reference_user_id,collaborator_ids,deadline,execution_steps,resources,review_status,created_by)
select strategy,'2043-02-01',source_plan,'WhatsApp','TESTE COMPARTILHADA','WhatsApp','Objetivo comum',array[req_original],articulator,array[educator],'2043-02-18','Divulgar programação','Celular','approved',coordinator from shared_mob_test;
insert into public.articulation_monthly_mobilization_plans(id,reference_month,title,status,created_by)
select month_plan,'2043-02-01','TESTE PLANO','published',coordinator from shared_mob_test;
insert into public.articulation_mobilization_actions(id,monthly_plan_id,title,action_type,channel,location,scheduled_date,start_time,end_time,reference_user_id,strategy_ids,request_ids,created_by)
select action,month_plan,'TESTE MOBILIZAÇÃO','Mobilização','WhatsApp','CRJ','2043-02-10','14:00','15:00',articulator,array[strategy],array[req_original],coordinator from shared_mob_test;
select set_config('request.jwt.claim.sub',(select coordinator::text from shared_mob_test),true);
set local role authenticated;
do $test$
declare c record;s record;p record;result jsonb;initial_count integer;
begin
 select * into c from shared_mob_test;
 select * into s from public.articulation_mobilization_strategies where id=c.strategy;
 result:=public.mobilization_command('save_strategy',jsonb_build_object('id',s.id,'expected_revision',s.revision,
   'request_ids',jsonb_build_array(c.req_original,c.req_pending,c.req_answered),'review_status','approved'));
 select * into p from public.articulation_mobilization_plans where request_id=c.req_pending;
 if p.id is null or p.shared_strategy_id<>c.strategy or p.mobilization_goal<>'Objetivo comum' or p.main_message<>'Mensagem comum' or p.materials<>'Celular' then raise exception 'A resposta compartilhada não recebeu dados comuns.';end if;
 if p.target_audience<>'Público B' or p.territories<>array['Bairro B'] or p.attendance_target<>12 or p.mobilization_deadline<>'2043-02-15' then raise exception 'Dados próprios da solicitação não foram preservados.';end if;
 if (select status from public.articulation_mobilization_requests where id=c.req_pending)<>'planejado' then raise exception 'A solicitação não foi marcada como respondida.';end if;
 if (select mobilization_goal from public.articulation_mobilization_plans where id=c.existing_plan)<>'Resposta manual preservada' then raise exception 'Uma resposta anterior foi substituída.';end if;
 if not (select request_ids @> array[c.req_original,c.req_pending,c.req_answered] from public.articulation_mobilization_actions where id=c.action) then raise exception 'Ação organizada não recebeu as solicitações.';end if;
 if (select status from public.articulation_monthly_mobilization_plans where id=c.month_plan)<>'draft' then raise exception 'O plano publicado não voltou para revisão.';end if;
 if exists(select 1 from public.articulation_mobilization_executions where action_id=c.action) then raise exception 'Uma execução foi registrada indevidamente.';end if;
 select count(*) into initial_count from public.articulation_mobilization_plans where request_id=c.req_pending;
 result:=public.mobilization_command('save_strategy',jsonb_build_object('id',s.id,'expected_revision',(result->'strategy'->>'revision')::int,
   'request_ids',jsonb_build_array(c.req_original,c.req_pending,c.req_answered),'review_status','approved'));
 if (select count(*) from public.articulation_mobilization_plans where request_id=c.req_pending)<>initial_count then raise exception 'Salvamento repetido duplicou resposta.';end if;
 perform public.mobilization_command('import',jsonb_build_object('month','2043-02-01'));
 if exists(select 1 from public.articulation_mobilization_strategies where source_plan_id=p.id) then raise exception 'Resposta compartilhada foi importada como nova proposta.';end if;
end $test$;
rollback;
