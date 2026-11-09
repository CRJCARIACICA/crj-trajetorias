-- Exclusion from the workshop history is a reversible calendar cancellation.
-- Keep all session, attendance and guest rows in place for an eventual reopen.
create or replace function app_private.cancel_workshop_session_for_recovery(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  s public.workshop_sessions%rowtype;
  c public.workshop_calendar%rowtype;
  v_calendar_id uuid;
  v_other_count integer;
begin
  if auth.uid() is null or not app_private.is_active_staff() or
    not app_private.has_any_role(array['coordenacao_geral','educador']::text[]) then
    raise exception 'Sem permissão para excluir aulas.' using errcode='42501';
  end if;
  select * into s from public.workshop_sessions where id=p_session_id for update;
  if not found then raise exception 'Aula não encontrada.'; end if;
  if s.session_date is null or s.start_time is null then
    raise exception 'Informe a data e o horário da aula antes de excluí-la, para possibilitar a recuperação no calendário.';
  end if;
  v_calendar_id:=s.calendar_entry_id;
  if v_calendar_id is null and s.plan_lesson_id is not null then
    select l.calendar_entry_id into v_calendar_id from public.workshop_plan_lessons l where l.id=s.plan_lesson_id;
  end if;
  if v_calendar_id is null then
    select x.id into v_calendar_id from public.workshop_calendar x
      where x.workshop_id=s.workshop_id and x.scheduled_date=s.session_date and x.start_time=s.start_time;
  end if;
  if v_calendar_id is null then
    insert into public.workshop_calendar(workshop_id,scheduled_date,start_time,end_time,location_type,location_other,source,status,session_id,created_by)
      values(s.workshop_id,s.session_date,s.start_time,s.end_time,s.location_type,s.location_other,'manual','realizada',s.id,auth.uid())
      on conflict (workshop_id,scheduled_date,start_time) do nothing returning id into v_calendar_id;
    if v_calendar_id is null then
      select x.id into v_calendar_id from public.workshop_calendar x
        where x.workshop_id=s.workshop_id and x.scheduled_date=s.session_date and x.start_time=s.start_time;
    end if;
  end if;
  select * into c from public.workshop_calendar where id=v_calendar_id for update;
  if not found or c.workshop_id<>s.workshop_id then raise exception 'A aula não possui um calendário válido nesta oficina.'; end if;
  -- Do not remove a different class that happens to share the calendar slot.
  select count(*) into v_other_count from public.workshop_sessions other
    left join public.workshop_plan_lessons l on l.id=other.plan_lesson_id
    where other.id<>s.id and other.workshop_id=s.workshop_id and (
      other.id=c.session_id or other.calendar_entry_id=c.id or l.calendar_entry_id=c.id or
      (other.calendar_entry_id is null and other.plan_lesson_id is null and
       other.session_date=c.scheduled_date and other.start_time=c.start_time)
    );
  if v_other_count>0 then
    raise exception 'Há outra aula vinculada ao mesmo horário. Confira o calendário antes de excluir esta aula.';
  end if;
  update public.workshop_calendar set status='cancelada',session_id=s.id,updated_at=pg_catalog.now()
    where id=c.id returning * into c;
  -- An entry already canceled may not trigger a status transition a second time.
  update public.workshop_checkin_windows set active=false where session_id=s.id and active;
  return pg_catalog.jsonb_build_object('calendar_id',c.id,'status',c.status);
end
$function$;
revoke all on function app_private.cancel_workshop_session_for_recovery(uuid) from public,anon;
grant execute on function app_private.cancel_workshop_session_for_recovery(uuid) to authenticated;
create or replace function public.cancel_workshop_session_for_recovery(p_session_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $function$ select app_private.cancel_workshop_session_for_recovery(p_session_id) $function$;
revoke all on function public.cancel_workshop_session_for_recovery(uuid) from public,anon;
grant execute on function public.cancel_workshop_session_for_recovery(uuid) to authenticated;
