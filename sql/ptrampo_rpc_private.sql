-- Implementações privilegiadas vivem em um esquema não exposto à Data API.
-- Os pontos públicos são invoker e as funções internas verificam autenticação e função.
create schema if not exists ptrampo_private;
revoke all on schema ptrampo_private from public,anon;
grant usage on schema ptrampo_private to authenticated;

alter function public.ptrampo_action_presence(uuid) set schema ptrampo_private;
alter function public.ptrampo_save_execution(jsonb,uuid[]) set schema ptrampo_private;
alter function public.ptrampo_add_presence(uuid,uuid[]) set schema ptrampo_private;
revoke all on function ptrampo_private.ptrampo_action_presence(uuid) from public,anon;
revoke all on function ptrampo_private.ptrampo_save_execution(jsonb,uuid[]) from public,anon;
revoke all on function ptrampo_private.ptrampo_add_presence(uuid,uuid[]) from public,anon;
grant execute on function ptrampo_private.ptrampo_action_presence(uuid),
  ptrampo_private.ptrampo_save_execution(jsonb,uuid[]),ptrampo_private.ptrampo_add_presence(uuid,uuid[]) to authenticated;

create function public.ptrampo_action_presence(p_plan_id uuid)
returns jsonb language sql security invoker set search_path='' as $$
  select ptrampo_private.ptrampo_action_presence(p_plan_id)
$$;
create function public.ptrampo_save_execution(p_execution jsonb,p_youth_ids uuid[] default '{}'::uuid[])
returns jsonb language sql security invoker set search_path='' as $$
  select ptrampo_private.ptrampo_save_execution(p_execution,p_youth_ids)
$$;
create function public.ptrampo_add_presence(p_plan_id uuid,p_youth_ids uuid[])
returns jsonb language sql security invoker set search_path='' as $$
  select ptrampo_private.ptrampo_add_presence(p_plan_id,p_youth_ids)
$$;
revoke all on function public.ptrampo_action_presence(uuid),public.ptrampo_save_execution(jsonb,uuid[]),public.ptrampo_add_presence(uuid,uuid[]) from public,anon;
grant execute on function public.ptrampo_action_presence(uuid),public.ptrampo_save_execution(jsonb,uuid[]),public.ptrampo_add_presence(uuid,uuid[]) to authenticated;
