-- Meta 4 / Etapa 4.2. Metodologia CRJ, seção 13.1, páginas impressas 48–53.
-- One planned occurrence, not one percentage per plan. No synthetic execution.
create or replace view public.goal_socioaffirmative_activity_path
with (security_invoker=true) as
with candidates as (
 select 'workshop_plan_lessons'::text source_type,l.id source_id,
 'lesson:'||l.id activity_key, l.scheduled_date planned_date,
 w.name||' · Aula '||l.lesson_number title,
 coalesce(p.educator_user_id,p.instructor_user_id,p.created_by) responsible_user_id,
 'N1.E1 · Cola Aê · Oficinas permanentes'::text classification,
 exists(select 1 from public.workshop_sessions s where s.plan_lesson_id=l.id and s.duration_hours>0 and nullif(trim(s.content),'') is not null and exists(select 1 from public.attendance atd where atd.session_id=s.id)) is_executed,
 true can_project,0 priority
 from public.workshop_plan_lessons l
 join public.workshop_monthly_plans p on p.id=l.plan_id
 join public.workshops w on w.id=p.workshop_id
 where l.included is distinct from false and l.scheduled_date is not null
 and p.status in ('finalizado','concluido','concluído','planejado','realizado')
 union all
 select 'cfdh_actions',a.id,
 case when p.plan_type='cfdh_transversal' and a.workshop_plan_lesson_id is not null then 'lesson:'||a.workshop_plan_lesson_id else 'cfdh:'||a.id end,
 a.scheduled_date,coalesce(nullif(a.title,''),p.activity_title)||' · Ação '||a.action_number,
 coalesce(a.created_by,p.educator_user_id),
 'N1.E1 · Cola Aê · Circuito Formativo em Direitos Humanos',
 a.execution_status='realizada' and a.actual_duration_hours>0 and nullif(trim(a.execution_description),'') is not null,
 a.execution_status not in ('cancelada','nao_realizada','não realizada'),1
 from public.cfdh_actions a join public.educator_plans p on p.id=a.plan_id
 where a.scheduled_date is not null and a.planning_status='complete'
 and (a.nucleus_code='N1' or p.plan_type in ('cfdh_estrutural','cfdh_transversal'))
 union all
 select 'technical_action_plans',p.id,'technical:'||p.id,p.planned_date,p.title,p.created_by,
 'N1 · '||case when p.action_type='pvida' then 'Fortalece Família · PVida' else 'Vínculo metodológico explícito' end,
 exists(select 1 from public.technical_action_executions e where e.plan_id=p.id and e.execution_status='realizada' and e.duration_hours>0 and nullif(trim(e.execution_description),'') is not null),
 p.status not in ('cancelado','cancelada','nao_realizado'),2
 from public.technical_action_plans p
 where p.planned_date is not null and p.status<>'rascunho'
 and (p.action_type in ('pvida','outras_demandas') or exists(
 select 1 from jsonb_array_elements(coalesce(p.methodology_links,'[]'::jsonb)) j
 where j->>'nucleus_code'='N1' or j->>'nucleus' ilike '%socioafirmativo%'))
 union all
 select 'educator_plans',p.id,'educator:'||p.id,p.planned_start,p.activity_title,p.educator_user_id,
 'N1 · Atividade complementar do Núcleo Socioafirmativo',
 exists(select 1 from public.educator_reports r where r.plan_id=p.id and r.execution_status in ('realizado','realizada') and nullif(trim(r.actual_description),'') is not null),
 p.status not in ('cancelado','cancelada','nao_realizado'),2
 from public.educator_plans p
 where p.planned_start is not null and p.status<>'rascunho'
 and p.plan_type not in ('cfdh_estrutural','cfdh_transversal','oficina')
 and (p.nucleus ilike '%socioafirmativo%' or exists(
 select 1 from jsonb_array_elements(coalesce(p.methodology_links,'[]'::jsonb)) j
 where j->>'nucleus_code'='N1' or j->>'nucleus' ilike '%socioafirmativo%'))
 union all
 select 'access_resource_bookings',b.id,'booking:'||b.id,
 (b.scheduled_start at time zone 'America/Sao_Paulo')::date,
 coalesce(b.activity,b.item_description,'Empréstimo/agendamento'),coalesce(b.controller_user_id,b.created_by),
 'N1.E1 · Cola Aê · Empréstimo de equipamentos e agendamento de salas',
 b.actual_return_at is not null and b.receipt_submission_id is not null,
 b.status not in ('cancelado','cancelada','recusado'),2
 from public.access_resource_bookings b where b.scheduled_start is not null and b.status<>'rascunho'
 union all
 select 'articulation_actions',a.id,'articulation:'||a.id,a.planned_date,a.title,a.responsible_user_id,
 'N1 · Ação de articulação com vínculo explícito à Etapa 4.2',
 a.executed_date is not null and a.status in ('realizado','realizada','concluido','concluida') and nullif(trim(a.evidence_notes),'') is not null,
 a.status not in ('cancelado','cancelada','nao_realizado'),2
 from public.articulation_actions a where a.planned_date is not null and a.status<>'rascunho'
 and exists(select 1 from public.record_methodology_links r where r.source_type='articulation_actions' and r.source_id=a.id and r.goal_stage='4.2')
), deduplicated as (
 select distinct on (activity_key) c.*,
 bool_or(is_executed) over(partition by activity_key) completed,
 bool_or(can_project) over(partition by activity_key) projected
 from candidates c order by activity_key,priority
)
select source_type,source_id,activity_key,planned_date,title,responsible_user_id,classification,
 coalesce(completed,false) is_executed,coalesce(projected,false) can_project,
 date_trunc('month',planned_date)::date reference_month,
 count(*) over(partition by date_trunc('month',planned_date)) planned_count,
 (round(100::numeric*row_number() over(partition by date_trunc('month',planned_date) order by completed desc,projected desc,activity_key)/count(*) over(partition by date_trunc('month',planned_date)),2)-round(100::numeric*(row_number() over(partition by date_trunc('month',planned_date) order by completed desc,projected desc,activity_key)-1)/count(*) over(partition by date_trunc('month',planned_date)),2))::numeric(14,2) percentage_share
from deduplicated;
revoke all on public.goal_socioaffirmative_activity_path from public,anon;
grant select on public.goal_socioaffirmative_activity_path to authenticated;

-- Extend the existing public contracts without discarding other indicators.
-- The guard makes this patch repeatable; each base definition is preserved once.
do $$
declare forecast_sql text;actual_sql text;
begin
 select pg_get_viewdef('public.goal_indicator_forecast'::regclass,true) into forecast_sql;
 if position('goal_socioaffirmative_activity_path' in forecast_sql)=0 then
 execute 'create or replace view public.goal_indicator_forecast with (security_invoker=true) as select * from ('||rtrim(forecast_sql,'; '||chr(10))||') previous where indicator_code<>''M4.2_ATIVIDADES_PERCENTUAL'' union all select ''M4.2_ATIVIDADES_PERCENTUAL''::text,planned_date,percentage_share,source_type,source_id,title,responsible_user_id,classification||'' · Atividade planejada; contribuição proporcional ao total do mês'',''high''::text from public.goal_socioaffirmative_activity_path where not is_executed and can_project';
 end if;
 select pg_get_viewdef('public.goal_indicator_actual_path'::regclass,true) into actual_sql;
 if position('goal_socioaffirmative_activity_path' in actual_sql)=0 then
 execute 'create or replace view public.goal_indicator_actual_path with (security_invoker=true) as select * from ('||rtrim(actual_sql,'; '||chr(10))||') previous where indicator_code<>''M4.2_ATIVIDADES_PERCENTUAL'' union all select a.source_id,''M4.2_ATIVIDADES_PERCENTUAL''::text,null::uuid,a.planned_date,a.percentage_share,a.source_type,a.source_id,''identified''::public.record_source_mode,a.title,a.responsible_user_id,p.display_name,p.role::text,''4.2''::text,''count''::text,a.classification||'' · Execução vinculada ao planejamento; contribuição proporcional ao total do mês'' from public.goal_socioaffirmative_activity_path a left join public.profiles p on p.id=a.responsible_user_id where a.is_executed';
 end if;
end $$;
