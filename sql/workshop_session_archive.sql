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
begin
  if auth.uid() is null or not app_private.has_any_role(array['coordenacao_geral','educador']::text[]) then
    raise exception 'Sem permissão para excluir aulas.' using errcode = '42501';
  end if;
  select * into v_session from public.workshop_sessions where id=p_session_id for update;
  if not found then raise exception 'Aula não encontrada.'; end if;
  v_snapshot := pg_catalog.jsonb_build_object(
    'session', pg_catalog.to_jsonb(v_session),
    'attendance', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a)), '[]'::jsonb) from public.attendance a where a.session_id=p_session_id),
    'guests', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(g)), '[]'::jsonb) from public.workshop_guest_participations g where g.session_id=p_session_id),
    'guest_signatures', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(sig)), '[]'::jsonb) from app_private.workshop_guest_signatures sig join public.workshop_guest_participations g on g.id=sig.participation_id where g.session_id=p_session_id),
    'cfdh_attendance', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c)), '[]'::jsonb) from public.cfdh_attendance c join public.attendance a on a.id=c.source_workshop_attendance_id where a.session_id=p_session_id),
    'checkin_windows', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(w)), '[]'::jsonb) from public.workshop_checkin_windows w where w.session_id=p_session_id),
    'joint_evidence', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(e)), '[]'::jsonb) from public.joint_action_evidences e where e.source_type='workshop_sessions' and e.source_id=p_session_id)
  );
  insert into app_private.workshop_session_deletions(session_id,workshop_id,deleted_by,snapshot)
    values(p_session_id,v_session.workshop_id,auth.uid(),v_snapshot);
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
