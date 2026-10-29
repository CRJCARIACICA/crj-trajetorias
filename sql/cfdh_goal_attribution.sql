-- Os eventos CFDH mantêm sua origem e responsável legíveis no painel de metas.
-- A visão continua obedecendo às políticas de acesso das tabelas subjacentes.
create or replace view public.goal_indicator_actual_path
with (security_invoker=true) as
select v.event_id,v.indicator_code,v.youth_id,v.event_date,v.quantity,v.source_type,v.source_id,v.source_mode,
  case when v.source_type in ('cfdh_action_hours','cfdh_lesson_hours','cfdh_attendance','cfdh_program','cfdh_workshop_guest','cfdh_workshop_guest_program')
    then 'CFDH · '||coalesce(nullif(a.title,''),nullif(p.activity_title,''),'Circuito Formativo em Direitos Humanos')
    else v.activity_title end as activity_title,
  coalesce(v.responsible_user_id,a.updated_by,a.created_by,p.educator_user_id) as responsible_user_id,
  coalesce(v.responsible_name,pr.display_name) as responsible_name,
  coalesce(v.responsible_role,pr.role::text) as responsible_role,
  case when v.source_type in ('cfdh_action_hours','cfdh_lesson_hours','cfdh_attendance','cfdh_program','cfdh_workshop_guest','cfdh_workshop_guest_program')
    then coalesce(v.goal_stage,c.goal_stage) else v.goal_stage end as goal_stage,
  case when v.source_type in ('cfdh_action_hours','cfdh_lesson_hours','cfdh_attendance','cfdh_program','cfdh_workshop_guest','cfdh_workshop_guest_program')
    then coalesce(v.relation_mode,'count') else v.relation_mode end as relation_mode,
  case when v.source_type in ('cfdh_action_hours','cfdh_lesson_hours','cfdh_attendance','cfdh_program','cfdh_workshop_guest','cfdh_workshop_guest_program')
    then coalesce(v.rationale,'Contribuição da execução ou da presença nominal no circuito CFDH.') else v.rationale end as rationale
from public.goal_indicator_actual_path_all v
join public.indicator_catalog c on c.code=v.indicator_code and c.active=true
left join public.cfdh_attendance ca on v.source_type='cfdh_attendance' and ca.id=v.source_id
left join public.workshop_guest_participations g on v.source_type in ('cfdh_workshop_guest','cfdh_workshop_guest_program') and g.id=v.source_id
left join public.workshop_sessions s on s.id=g.session_id
left join lateral (
  select action.id,action.plan_id,action.title,action.updated_by,action.created_by
  from public.cfdh_actions action
  where (v.source_type in ('cfdh_action_hours','cfdh_program') and action.id=v.source_id)
     or (v.source_type='cfdh_attendance' and action.id=ca.action_id)
     or (v.source_type='cfdh_lesson_hours' and action.workshop_plan_lesson_id=v.source_id)
     or (v.source_type in ('cfdh_workshop_guest','cfdh_workshop_guest_program') and action.workshop_plan_lesson_id=s.plan_lesson_id)
  order by action.action_number,action.id limit 1
) a on true
left join public.educator_plans p on p.id=a.plan_id
left join public.profiles pr on pr.id=coalesce(v.responsible_user_id,a.updated_by,a.created_by,p.educator_user_id);
