-- CFDH Transversal: vínculo direto com aula da oficina
-- 2026-10-21
-- Revoga a dependência da marcação prévia no planejamento da oficina.

create or replace function app_private.cfdh_workshop_reference_text(
  p_action_number integer,
  p_circuit_title text,
  p_action_title text,
  p_action_theme text,
  p_objective text,
  p_activities text,
  p_resources text,
  p_duration_hours numeric
)
returns text
language sql
immutable
set search_path to ''
as $function$
  select concat_ws(E'\n',
    'CFDH transversal vinculado · Ação ' || coalesce(p_action_number,0)::text,
    case when nullif(btrim(coalesce(p_action_theme,'')),'') is not null then 'Tema: ' || btrim(p_action_theme) end,
    case when nullif(btrim(coalesce(p_objective,'')),'') is not null then 'Objetivo específico: ' || btrim(p_objective) end,
    case when p_duration_hours is not null then 'Duração: ' || p_duration_hours::text || ' horas' end
  );
$function$;

create or replace function app_private.refresh_workshop_lesson_cfdh_text(p_lesson_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_text text;
begin
  if p_lesson_id is null then return; end if;
  if not exists(select 1 from public.workshop_plan_lessons l where l.id=p_lesson_id) then return; end if;

  select string_agg(
    app_private.cfdh_workshop_reference_text(
      a.action_number,p.activity_title,a.title,a.action_theme,a.objective,
      a.activities,a.resources,a.planned_duration_hours
    ),
    E'\n\n' order by a.action_number,a.id
  )
  into v_text
  from public.cfdh_actions a
  join public.educator_plans p on p.id=a.plan_id
  where a.workshop_plan_lesson_id=p_lesson_id
    and p.plan_type='cfdh_transversal';

  update public.workshop_plan_lessons
  set cfdh_transversal=nullif(btrim(coalesce(v_text,'')),''),
      updated_at=now()
  where id=p_lesson_id;
end
$function$;

create or replace function app_private.refresh_cfdh_workshop_plan_reference()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_plan_type text;
begin
  if tg_op='DELETE' then
    if old.workshop_plan_lesson_id is not null then
      perform app_private.refresh_workshop_lesson_cfdh_text(old.workshop_plan_lesson_id);
    end if;
    return old;
  end if;

  if tg_op='UPDATE' and old.workshop_plan_lesson_id is not null then
    perform app_private.refresh_workshop_lesson_cfdh_text(old.workshop_plan_lesson_id);
  end if;

  if new.workshop_plan_lesson_id is null then return new; end if;

  select plan_type into v_plan_type
  from public.educator_plans
  where id=new.plan_id;

  if v_plan_type='cfdh_transversal' then
    perform app_private.refresh_workshop_lesson_cfdh_text(new.workshop_plan_lesson_id);
  end if;
  return new;
end
$function$;

drop trigger if exists trg_refresh_cfdh_workshop_plan_reference on public.cfdh_actions;
create trigger trg_refresh_cfdh_workshop_plan_reference
after insert or update of action_number,title,action_theme,objective,planned_duration_hours,workshop_plan_lesson_id,plan_id
on public.cfdh_actions
for each row execute function app_private.refresh_cfdh_workshop_plan_reference();

drop trigger if exists trg_refresh_cfdh_workshop_plan_reference_delete on public.cfdh_actions;
create trigger trg_refresh_cfdh_workshop_plan_reference_delete
after delete on public.cfdh_actions
for each row execute function app_private.refresh_cfdh_workshop_plan_reference();

create or replace function app_private.sync_cfdh_action_to_workshop(p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  a public.cfdh_actions%rowtype;
  p public.educator_plans%rowtype;
  w public.workshops%rowtype;
  mp public.workshop_monthly_plans%rowtype;
  lesson public.workshop_plan_lessons%rowtype;
  cal public.workshop_calendar%rowtype;
  old_lesson_id uuid;
begin
  if auth.uid() is null
     or not app_private.is_active_staff()
     or not app_private.has_any_role(array['coordenacao_geral','educador','assistente_social','psicologo','terapeuta_ocupacional']) then
    raise exception 'Acesso não autorizado.';
  end if;

  select * into a from public.cfdh_actions where id=p_action_id;
  if not found then raise exception 'Ação CFDH não encontrada.'; end if;

  select * into p from public.educator_plans where id=a.plan_id;
  if not found or p.plan_type<>'cfdh_transversal' then
    return jsonb_build_object('ok',true,'synced',false,'reason','not_transversal');
  end if;
  if a.workshop_id is null then raise exception 'A ação CFDH transversal precisa estar vinculada a uma oficina.'; end if;

  select * into w from public.workshops where id=a.workshop_id and active=true;
  if not found then raise exception 'Oficina vinculada não encontrada ou inativa.'; end if;
  old_lesson_id:=a.workshop_plan_lesson_id;

  select l.* into lesson
  from public.workshop_plan_lessons l
  join public.workshop_monthly_plans x on x.id=l.plan_id
  where x.workshop_id=a.workshop_id
    and l.included=true
    and l.calendar_entry_id is not null
    and (
      (a.workshop_plan_lesson_id is not null and l.id=a.workshop_plan_lesson_id)
      or (a.workshop_calendar_id is not null and l.calendar_entry_id=a.workshop_calendar_id)
      or (a.scheduled_date is not null and l.scheduled_date=a.scheduled_date
          and (a.start_time is null or l.start_time is not distinct from a.start_time))
    )
    and (a.scheduled_date is null or x.plan_month=date_trunc('month',a.scheduled_date)::date)
  order by
    case when l.id=a.workshop_plan_lesson_id then 0 else 1 end,
    case when l.calendar_entry_id=a.workshop_calendar_id then 0 else 1 end,
    l.updated_at desc,l.id
  limit 1;

  if lesson.id is null then
    raise exception 'Nenhuma aula disponível do planejamento desta oficina corresponde ao vínculo selecionado.';
  end if;

  select * into mp from public.workshop_monthly_plans where id=lesson.plan_id;
  if not found then raise exception 'Planejamento mensal da oficina não encontrado.'; end if;

  select * into cal
  from public.workshop_calendar
  where id=lesson.calendar_entry_id
    and workshop_id=a.workshop_id
    and status<>'cancelada';
  if not found then raise exception 'A aula selecionada não possui uma ocorrência ativa no calendário da oficina.'; end if;

  update public.cfdh_actions
  set workshop_plan_lesson_id=lesson.id,
      workshop_calendar_id=cal.id,
      schedule_mode='workshop_planned',
      scheduled_date=lesson.scheduled_date,
      start_time=lesson.start_time,
      end_time=lesson.end_time,
      planned_duration_hours=case
        when lesson.start_time is not null and lesson.end_time is not null and lesson.end_time>lesson.start_time
        then round((extract(epoch from (lesson.end_time-lesson.start_time))/3600)::numeric,2)
        else planned_duration_hours
      end,
      location_type=lesson.location_type,
      location_other=lesson.location_other,
      updated_by=auth.uid(),
      updated_at=now()
  where id=a.id
  returning * into a;

  perform app_private.refresh_workshop_lesson_cfdh_text(lesson.id);
  if old_lesson_id is not null and old_lesson_id is distinct from lesson.id then
    perform app_private.refresh_workshop_lesson_cfdh_text(old_lesson_id);
  end if;

  if w.educator_user_id is not null then
    insert into public.cfdh_action_responsibles(action_id,user_id,assigned_by)
    values(a.id,w.educator_user_id,auth.uid())
    on conflict(action_id,user_id) do nothing;
  end if;

  return jsonb_build_object(
    'ok',true,'synced',true,'mode','linked_workshop_plan_lesson',
    'workshop_plan_id',mp.id,
    'workshop_plan_lesson_id',lesson.id,
    'workshop_calendar_id',cal.id,
    'reference_educator_id',w.educator_user_id
  );
end
$function$;

update public.workshop_plan_lessons l
set cfdh_transversal=null,
    updated_at=now()
where btrim(coalesce(l.cfdh_transversal,''))='CFDH transversal previsto nesta aula.'
  and not exists(
    select 1
    from public.cfdh_actions a
    join public.educator_plans p on p.id=a.plan_id
    where a.workshop_plan_lesson_id=l.id
      and p.plan_type='cfdh_transversal'
  );

do $block$
declare r record;
begin
  for r in
    select distinct a.workshop_plan_lesson_id as lesson_id
    from public.cfdh_actions a
    join public.educator_plans p on p.id=a.plan_id
    where a.workshop_plan_lesson_id is not null
      and p.plan_type='cfdh_transversal'
  loop
    perform app_private.refresh_workshop_lesson_cfdh_text(r.lesson_id);
  end loop;
end
$block$;
