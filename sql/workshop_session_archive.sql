-- Deleting a class is explicit and auditable. Its attendance records are kept
-- privately; the ordinary DELETE policy remains closed.
create table if not exists app_private.workshop_session_deletions (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  workshop_id uuid not null,
  deleted_by uuid not null,
  deleted_at timestamptz not null default now(),
  snapshot jsonb not null
);
alter table app_private.workshop_session_deletions enable row level security;
revoke all on table app_private.workshop_session_deletions from public, anon, authenticated;
revoke all on sequence app_private.workshop_session_deletions_id_seq from public, anon, authenticated;

create or replace function app_private.archive_workshop_session(p_session_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_session public.workshop_sessions%rowtype;
  v_snapshot jsonb;
  v_lesson_id uuid;
  v_matches integer;
  v_has_other_session boolean := false;
  v_list_marker jsonb;
begin
  if auth.uid() is null or not app_private.has_any_role(array['coordenacao_geral','educador']::text[]) then
    raise exception 'Sem permissão para excluir aulas.' using errcode = '42501';
  end if;
  select * into v_session from public.workshop_sessions where id=p_session_id for update;
  if not found then raise exception 'Aula não encontrada.'; end if;
  -- Resolve only an unambiguous lesson belonging to this workshop.
  select min(l.id::text)::uuid, count(*) into v_lesson_id, v_matches
    from public.workshop_plan_lessons l join public.workshop_monthly_plans p on p.id=l.plan_id
    where l.id=v_session.plan_lesson_id and l.included and p.workshop_id=v_session.workshop_id;
  if v_matches<>1 and v_session.calendar_entry_id is not null then
    select min(l.id::text)::uuid, count(*) into v_lesson_id, v_matches
      from public.workshop_plan_lessons l join public.workshop_monthly_plans p on p.id=l.plan_id
      where l.calendar_entry_id=v_session.calendar_entry_id and l.included and p.workshop_id=v_session.workshop_id;
  end if;
  if v_matches<>1 and v_session.start_time is not null then
    select min(l.id::text)::uuid, count(*) into v_lesson_id, v_matches
      from public.workshop_plan_lessons l join public.workshop_monthly_plans p on p.id=l.plan_id
      where p.workshop_id=v_session.workshop_id and l.included and l.scheduled_date=v_session.session_date
        and l.start_time=v_session.start_time
        and (v_session.calendar_entry_id is null or l.calendar_entry_id is null or l.calendar_entry_id=v_session.calendar_entry_id);
  end if;
  if v_matches=1 then
    perform 1 from public.workshop_plan_lessons where id=v_lesson_id for update;
    select exists(select 1 from public.workshop_sessions other
      where other.id<>p_session_id and other.workshop_id=v_session.workshop_id
        and (other.plan_lesson_id=v_lesson_id
          or (v_session.calendar_entry_id is not null and other.calendar_entry_id=v_session.calendar_entry_id)
          or (v_session.start_time is not null and v_session.end_time is not null
            and other.session_date=v_session.session_date and other.start_time=v_session.start_time and other.end_time=v_session.end_time)))
      into v_has_other_session;
    if not v_has_other_session then
      select pg_catalog.to_jsonb(m) into v_list_marker from public.workshop_created_attendance_lists m where m.lesson_id=v_lesson_id;
    end if;
  else
    v_lesson_id:=null;
  end if;
  v_snapshot := pg_catalog.jsonb_build_object(
    'session', pg_catalog.to_jsonb(v_session),
    'created_planned_list', v_list_marker,
    'attendance', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a)), '[]'::jsonb) from public.attendance a where a.session_id=p_session_id),
    'guests', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(g)), '[]'::jsonb) from public.workshop_guest_participations g where g.session_id=p_session_id),
    'guest_signatures', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(sig)), '[]'::jsonb) from app_private.workshop_guest_signatures sig join public.workshop_guest_participations g on g.id=sig.participation_id where g.session_id=p_session_id),
    'cfdh_attendance', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c)), '[]'::jsonb) from public.cfdh_attendance c join public.attendance a on a.id=c.source_workshop_attendance_id where a.session_id=p_session_id),
    'checkin_windows', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(w)), '[]'::jsonb) from public.workshop_checkin_windows w where w.session_id=p_session_id),
    'joint_evidence', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(e)), '[]'::jsonb) from public.joint_action_evidences e where e.source_type='workshop_sessions' and e.source_id=p_session_id)
  );
  insert into app_private.workshop_session_deletions(session_id,workshop_id,deleted_by,snapshot)
    values(p_session_id,v_session.workshop_id,auth.uid(),v_snapshot);
  if v_lesson_id is not null and not v_has_other_session then
    delete from public.workshop_created_attendance_lists where lesson_id=v_lesson_id;
  end if;
  delete from public.joint_action_evidences where source_type='workshop_sessions' and source_id=p_session_id;
  update public.workshop_calendar set session_id=null,
    status=case when status='realizada' then 'planejada' else status end,
    updated_at=pg_catalog.now() where session_id=p_session_id;
  delete from public.workshop_sessions where id=p_session_id;
end
$function$;
revoke all on function app_private.archive_workshop_session(uuid) from public, anon;
grant execute on function app_private.archive_workshop_session(uuid) to authenticated;

-- PostgREST entrypoint executes as the caller; only the private function is
-- privileged and it verifies the user's identity and role on every call.
create or replace function public.archive_workshop_session(p_session_id uuid)
returns void language sql security invoker set search_path = ''
as $function$ select app_private.archive_workshop_session(p_session_id) $function$;
revoke all on function public.archive_workshop_session(uuid) from public, anon;
grant execute on function public.archive_workshop_session(uuid) to authenticated;
