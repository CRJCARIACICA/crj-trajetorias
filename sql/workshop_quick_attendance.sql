-- Marca somente inscrições ativas da aula, sem substituir os demais registros.
create or replace function public.mark_workshop_attendance_quick(p_session_id uuid, p_youth_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $function$
declare
  class_row public.workshop_sessions%rowtype;
  marked integer;
begin
  if auth.uid() is null or not app_private.has_any_role(array['coordenacao_geral','educador','oficineiro','administrativo']) then
    raise exception 'Seu perfil não pode registrar presenças';
  end if;
  if p_youth_ids is null or cardinality(p_youth_ids) = 0 or array_position(p_youth_ids, null) is not null then
    raise exception 'Selecione ao menos um jovem inscrito';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));
  select * into class_row from public.workshop_sessions where id = p_session_id;
  if not found then
    raise exception 'Aula não encontrada';
  end if;
  if exists (
    select 1 from public.workshop_calendar c
    where c.status = 'cancelada'
      and (c.id = class_row.calendar_entry_id or c.session_id = class_row.id)
  ) then
    raise exception 'A aula está cancelada';
  end if;
  if exists (
    select 1 from unnest(p_youth_ids) youth_id
    where not exists (
      select 1 from public.workshop_enrollments e
      where e.workshop_id = class_row.workshop_id and e.youth_id = youth_id and e.status = 'ativo'
    )
  ) then
    raise exception 'Há jovens sem inscrição ativa nesta oficina. Atualize a lista.';
  end if;
  insert into public.attendance(session_id, workshop_id, youth_id, attendance_date, present)
  select class_row.id, class_row.workshop_id, y.id, class_row.session_date, true
  from (select distinct unnest(p_youth_ids) as id) y
  on conflict (session_id, youth_id) where session_id is not null
  do update set present = true where not public.attendance.present;
  get diagnostics marked = row_count;
  return marked;
end
$function$;

revoke all on function public.mark_workshop_attendance_quick(uuid,uuid[]) from public, anon;
grant execute on function public.mark_workshop_attendance_quick(uuid,uuid[]) to authenticated;
