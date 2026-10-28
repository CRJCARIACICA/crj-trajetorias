-- Testes integrados usam contas e dados fictícios apenas dentro da transação.
begin;
create temporary table denial_test as select gen_random_uuid() coordinator,gen_random_uuid() articulator,gen_random_uuid() requester,
 gen_random_uuid() req_denied,gen_random_uuid() req_other,gen_random_uuid() req_planned,
 gen_random_uuid() req_scheduled,gen_random_uuid() linked_strategy,gen_random_uuid() standalone_strategy,
 gen_random_uuid() month_plan,gen_random_uuid() action,gen_random_uuid() existing_plan;
grant select on denial_test to authenticated;
select set_config('request.jwt.claim.sub','',true);
insert into auth.users(id,email) select x,x::text||'@denial-test.invalid' from denial_test cross join lateral unnest(array[coordinator,articulator,requester]) x;
update public.profiles set role='coordenacao_articulacao',active=true,display_name='TESTE COORD' where id=(select coordinator from denial_test);
update public.profiles set role='articulador',active=true,display_name='TESTE ART' where id=(select articulator from denial_test);
update public.profiles set role='educador',active=true,display_name='TESTE SOLICITANTE' where id=(select requester from denial_test);
insert into public.articulation_mobilization_requests(id,source_type,source_title,requested_by,planned_date,status)
select req_denied,'oficina','TESTE NEGADA',requester,'2043-02-20'::date,'solicitado' from denial_test
union all select req_other,'oficina','TESTE OUTRA',requester,'2043-03-20'::date,'solicitado' from denial_test
union all select req_planned,'oficina','TESTE JÁ RESPONDIDA',requester,'2043-03-20'::date,'solicitado' from denial_test
union all select req_scheduled,'oficina','TESTE ORGANIZADA',requester,'2043-03-20'::date,'solicitado' from denial_test;
insert into public.articulation_mobilization_plans(id,request_id,articulator_user_id,mobilization_goal,status)
select existing_plan,req_planned,articulator,'Resposta anterior','planejado' from denial_test;
select set_config('request.jwt.claim.sub',(select articulator::text from denial_test),true);
insert into public.articulation_mobilization_strategies(id,reference_month,title,channel,request_ids,reference_user_id,review_status,created_by)
select linked_strategy,'2043-03-01'::date,'TESTE VINCULADA','WhatsApp',array[req_denied,req_other],articulator,'submitted',articulator from denial_test
union all select standalone_strategy,'2043-02-01'::date,'TESTE AUTÔNOMA','WhatsApp',array[]::uuid[],articulator,'approved',articulator from denial_test;
insert into public.articulation_monthly_mobilization_plans(id,reference_month,title,objective,created_by)
select month_plan,'2043-02-01','TESTE PLANO','Divulgação',coordinator from denial_test;
insert into public.articulation_mobilization_actions(id,monthly_plan_id,title,action_type,channel,location,scheduled_date,start_time,end_time,reference_user_id,strategy_ids,request_ids,objective,preparation_steps,execution_steps,resources,documents_before,documents_after,preparation_deadline,created_by)
select action,month_plan,'TESTE MOBILIZAÇÃO','Mobilização','WhatsApp','CRJ','2043-02-10','14:00','15:00',articulator,array[standalone_strategy],array[]::uuid[],'Divulgar','Preparar','Executar','Celular','Roteiro','Relatório','2043-02-09',coordinator from denial_test;

-- O solicitante não pode decidir a própria solicitação via RLS.
select set_config('request.jwt.claim.sub',(select requester::text from denial_test),true);
set local role authenticated;
do $test$
declare x denial_test%rowtype;
begin
 select * into x from denial_test;
 update public.articulation_mobilization_requests set status='negado',rejection_reason='Sem permissão' where id=x.req_denied;
 if found then raise exception 'Solicitante não deveria poder recusar pela API.'; end if;
end $test$;

select set_config('request.jwt.claim.sub',(select coordinator::text from denial_test),true);
do $test$
declare x denial_test%rowtype; r record; v jsonb;
begin
 select * into x from denial_test;
 begin
   update public.articulation_mobilization_requests set status='negado',rejection_reason='   ' where id=x.req_denied;
   raise exception 'Uma justificativa vazia foi aceita.';
 exception when check_violation then null; end;
 begin
   update public.articulation_mobilization_requests set status='negado',rejection_reason='Sem equipe' where id=x.req_planned;
   raise exception 'Uma solicitação respondida foi recusada.';
 exception when check_violation then null; end;
 update public.articulation_mobilization_requests set status='negado',rejection_reason='  Equipe indisponível.  ' where id=x.req_denied;
 select * into r from public.articulation_mobilization_requests where id=x.req_denied;
 if r.status<>'negado' or r.rejection_reason<>'Equipe indisponível.' or r.rejected_by<>x.coordinator or r.rejected_at is null then raise exception 'Decisão não foi registrada.'; end if;
 if (select request_ids from public.articulation_mobilization_strategies where id=x.linked_strategy)<>array[x.req_other] then raise exception 'Estratégia não teve a solicitação negada desvinculada.'; end if;
 if exists(select 1 from public.articulation_mobilization_plans where request_id=x.req_other) then raise exception 'Outra solicitação foi respondida indevidamente.'; end if;
 begin
   update public.articulation_mobilization_requests set status='solicitado' where id=x.req_denied;
   raise exception 'Uma recusa foi reaberta.';
 exception when check_violation then null; end;
 begin
   insert into public.articulation_mobilization_plans(request_id,articulator_user_id,status) values(x.req_denied,x.articulator,'planejado');
   raise exception 'Uma solicitação negada foi vinculada a plano.';
 exception when check_violation then null; end;
 v:=public.mobilization_command('publish',jsonb_build_object('id',x.month_plan,'expected_revision',1));
 if not (v->>'ok')::boolean then raise exception 'Publicação do plano falhou.';end if;
end $test$;

-- A pessoa que solicitou enxerga a decisão e o motivo na conversa dela.
select set_config('request.jwt.claim.sub',(select requester::text from denial_test),true);
do $test$
declare x denial_test%rowtype;
begin
 select * into x from denial_test;
 if not exists(select 1 from public.team_threads t join public.team_thread_messages m on m.thread_id=t.id
   where t.source_type='articulation_mobilization_request' and t.source_id=x.req_denied and t.status='negado'
   and m.sender_user_id=x.coordinator and m.body like '%Justificativa: Equipe indisponível.%') then
   raise exception 'O solicitante não encontrou a justificativa na conversa.';
 end if;
 if not exists(select 1 from public.staff_notifications n join public.team_threads t on t.id=n.source_id
   where n.recipient_user_id=x.requester and t.source_id=x.req_denied and n.message like '%Equipe indisponível.%') then
   raise exception 'Solicitante não recebeu a atualização.';
 end if;
end $test$;
rollback;
