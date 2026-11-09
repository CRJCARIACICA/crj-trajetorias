-- A manual re-opening remains in effect during monthly calendar regeneration.
alter table public.workshop_calendar add column if not exists manually_reopened boolean not null default false;
alter table public.workshop_plan_lessons add column if not exists included_before_cancellation boolean;

-- Older sessions sometimes have no foreign keys. Match these only if the
-- workshop, date and time identify exactly one session and calendar entry.
create or replace function app_private.workshop_session_matches_calendar(p_session_id uuid, p_calendar_id uuid)
returns boolean language sql stable security definer set search_path = '' as $function$
  select exists (
    select 1 from public.workshop_sessions s
    join public.workshop_calendar c on c.id=p_calendar_id
    left join public.workshop_plan_lessons l on l.id=s.plan_lesson_id
    where s.id=p_session_id and (
      s.calendar_entry_id=c.id or c.session_id=s.id or l.calendar_entry_id=c.id or (
        s.calendar_entry_id is null and s.plan_lesson_id is null and
        s.workshop_id=c.workshop_id and s.session_date=c.scheduled_date and s.start_time=c.start_time and
        (select count(*) from public.workshop_calendar c2 where c2.workshop_id=c.workshop_id and c2.scheduled_date=c.scheduled_date and c2.start_time=c.start_time)=1 and
        (select count(*) from public.workshop_sessions s2 where s2.workshop_id=c.workshop_id and s2.session_date=c.scheduled_date and s2.start_time=c.start_time)=1
      )
    )
  )
$function$;
revoke all on function app_private.workshop_session_matches_calendar(uuid,uuid) from public, anon, authenticated;

create or replace function app_private.workshop_calendar_reopen_guard()
returns trigger language plpgsql set search_path = '' as $function$
declare v_sync text := coalesce(pg_catalog.current_setting('crj.monthly_sync',true),'');
begin
  if v_sync<>'' and old.manually_reopened and old.status<>'cancelada' and new.status='cancelada' then
    new.status:=old.status;
    new.monthly_cancelled:=false;
    new.manually_reopened:=true;
  elsif v_sync='' and old.status is distinct from new.status then
    new.monthly_cancelled:=false;
    if new.status='cancelada' then new.manually_reopened:=false;
    elsif old.status='cancelada' then new.manually_reopened:=true;
    else new.manually_reopened:=old.manually_reopened;
    end if;
  end if;
  return new;
end
$function$;
create trigger workshop_calendar_reopen_guard before update of status,monthly_cancelled
on public.workshop_calendar for each row execute function app_private.workshop_calendar_reopen_guard();

create or replace function app_private.workshop_calendar_status_to_plan()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_sync text:=coalesce(pg_catalog.current_setting('crj.monthly_sync',true),'');
begin
  if old.status is not distinct from new.status or (old.status<>'cancelada' and new.status<>'cancelada') then return new; end if;
  if new.status='cancelada' then
    update public.workshop_plan_lessons set included_before_cancellation=coalesce(included_before_cancellation,included),included=false,updated_at=pg_catalog.now()
      where calendar_entry_id=new.id;
    update public.workshop_checkin_windows win set active=false
      where win.active and exists (
        select 1 from public.workshop_sessions s
        where s.id=win.session_id and app_private.workshop_session_matches_calendar(s.id,new.id)
      );
  else
    update public.workshop_plan_lessons set included=coalesce(included_before_cancellation,true),included_before_cancellation=null,updated_at=pg_catalog.now()
      where calendar_entry_id=new.id;
  end if;
  if v_sync='' then
    insert into public.workshop_month_changes(workshop_id,reference_month,changed_by,reason,source_table,source_id,before_data,after_data)
      values(new.workshop_id,pg_catalog.date_trunc('month',new.scheduled_date::timestamp)::date,auth.uid(),
        case when new.status='cancelada' then 'Aula cancelada no calendário; vínculos e presenças preservados' else 'Aula reaberta no calendário' end,
        'workshop_calendar',new.id,pg_catalog.to_jsonb(old),pg_catalog.to_jsonb(new));
  end if;
  return new;
end
$function$;
create trigger workshop_calendar_status_to_plan after update of status on public.workshop_calendar
for each row execute function app_private.workshop_calendar_status_to_plan();

-- A canceled class cannot have a fresh list activated until it is reopened.
create or replace function app_private.workshop_canceled_checkin_guard()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.active and exists (
    select 1 from public.workshop_calendar c
      where c.status='cancelada' and app_private.workshop_session_matches_calendar(new.session_id,c.id)
  ) then raise exception 'A aula está cancelada. Reabra-a no calendário antes de abrir a lista.'; end if;
  return new;
end
$function$;
create trigger workshop_canceled_checkin_guard before insert or update of active on public.workshop_checkin_windows
for each row execute function app_private.workshop_canceled_checkin_guard();

create or replace function app_private.workshop_canceled_list_guard()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if exists(select 1 from public.workshop_plan_lessons l join public.workshop_calendar c on c.id=l.calendar_entry_id
    where l.id=new.lesson_id and c.status='cancelada') then
    raise exception 'A aula está cancelada. Reabra-a no calendário antes de gerar a lista.';
  end if;
  return new;
end
$function$;
create trigger workshop_canceled_list_guard before insert on public.workshop_created_attendance_lists
for each row execute function app_private.workshop_canceled_list_guard();

create or replace function app_private.workshop_canceled_session_guard()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if exists (
    select 1 from public.workshop_calendar c
    left join public.workshop_plan_lessons l on l.id=new.plan_lesson_id
    where c.status='cancelada' and (
      c.id=new.calendar_entry_id or c.id=l.calendar_entry_id or
      (new.calendar_entry_id is null and new.plan_lesson_id is null and c.workshop_id=new.workshop_id
        and c.scheduled_date=new.session_date and c.start_time=new.start_time)
    )
  ) then raise exception 'A aula está cancelada. Reabra-a no calendário antes de registrar uma aula.'; end if;
  return new;
end
$function$;
create trigger workshop_canceled_session_guard before insert on public.workshop_sessions
for each row execute function app_private.workshop_canceled_session_guard();

-- Reopening keeps the same calendar, lesson, list, and session identifiers.
create or replace function app_private.reopen_workshop_calendar_entry(p_calendar_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare c public.workshop_calendar%rowtype; v_has_session boolean;
begin
  if auth.uid() is null or not app_private.is_active_staff() or
    not app_private.has_any_role(array['coordenacao_geral','coordenacao_articulacao','articulador','educador','administrativo']::text[]) then
    raise exception 'Sem permissão para reabrir aulas.' using errcode='42501';
  end if;
  select * into c from public.workshop_calendar where id=p_calendar_id for update;
  if not found then raise exception 'Aula não encontrada no calendário.'; end if;
  if c.status<>'cancelada' then raise exception 'Esta aula não está cancelada.'; end if;
  select exists(select 1 from public.workshop_sessions s
    where app_private.workshop_session_matches_calendar(s.id,c.id)) into v_has_session;
  update public.workshop_calendar set status=case when v_has_session then 'realizada' else 'planejada' end,updated_at=pg_catalog.now()
    where id=c.id returning * into c;
  return pg_catalog.to_jsonb(c);
end
$function$;
revoke all on function app_private.reopen_workshop_calendar_entry(uuid) from public, anon;
grant execute on function app_private.reopen_workshop_calendar_entry(uuid) to authenticated;
create or replace function public.reopen_workshop_calendar_entry(p_calendar_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $function$ select app_private.reopen_workshop_calendar_entry(p_calendar_id) $function$;
revoke all on function public.reopen_workshop_calendar_entry(uuid) from public, anon;
grant execute on function public.reopen_workshop_calendar_entry(uuid) to authenticated;

-- Reconcile existing cancellations without deleting lists or attendance.
update public.workshop_plan_lessons l
set included_before_cancellation=true,included=false,updated_at=pg_catalog.now()
from public.workshop_calendar c
where c.id=l.calendar_entry_id and c.status='cancelada' and l.included=true;

update public.workshop_checkin_windows win set active=false
where win.active and exists (
  select 1 from public.workshop_calendar c
  where c.status='cancelada' and app_private.workshop_session_matches_calendar(win.session_id,c.id)
);
