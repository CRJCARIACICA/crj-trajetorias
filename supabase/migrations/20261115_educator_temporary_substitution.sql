
-- CRJ Trajetórias: substituição nominal, temporária, aprovada e auditável.
create table if not exists public.educator_substitutions (
  id uuid primary key default gen_random_uuid(),
  educator_id uuid not null references public.profiles(id),
  substitute_id uuid not null references public.profiles(id),
  requested_by uuid not null default auth.uid() references public.profiles(id),
  authorized_by uuid references public.profiles(id),
  reason text not null check (length(trim(reason)) >= 5),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'solicitada'
    check (status in ('solicitada','autorizada','recusada','revogada')),
  created_at timestamptz not null default now(),
  authorized_at timestamptz,
  check (educator_id <> substitute_id),
  check (ends_at > starts_at and ends_at <= starts_at + interval '31 days')
);
create index if not exists educator_substitutions_lookup on public.educator_substitutions(substitute_id,educator_id,status,starts_at,ends_at);
alter table public.educator_substitutions enable row level security;
revoke all on public.educator_substitutions from anon;
grant select,insert,update on public.educator_substitutions to authenticated;
drop policy if exists edu_substitution_read on public.educator_substitutions;
create policy edu_substitution_read on public.educator_substitutions for select to authenticated
using (app_private.has_any_role(array['coordenacao_geral']) or
       (app_private.is_active_staff() and (substitute_id = (select auth.uid()) or educator_id = (select auth.uid()))));
drop policy if exists edu_substitution_request on public.educator_substitutions;
create policy edu_substitution_request on public.educator_substitutions for insert to authenticated
with check (app_private.has_any_role(array['educador']) and
  substitute_id = (select auth.uid()) and requested_by = (select auth.uid())
  and status = 'solicitada' and authorized_by is null and authorized_at is null
  and starts_at > now() - interval '1 day' and ends_at > now());
drop policy if exists edu_substitution_approval on public.educator_substitutions;
create policy edu_substitution_approval on public.educator_substitutions for update to authenticated
using (app_private.has_any_role(array['coordenacao_geral']))
with check (app_private.has_any_role(array['coordenacao_geral']));

create or replace function app_private.validate_educator_substitution()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, app_private as $$
declare a_role text; b_role text;
begin
 select role::text into a_role from public.profiles where id=new.educator_id and active=true;
 select role::text into b_role from public.profiles where id=new.substitute_id and active=true;
 if a_role is distinct from 'educador' or b_role is distinct from 'educador' then
    raise exception 'Substituição permitida apenas entre educadores ativos';
 end if;
 if tg_op='UPDATE' then
    if (new.educator_id,new.substitute_id,new.starts_at,new.ends_at,new.reason,new.requested_by)
       is distinct from (old.educator_id,old.substitute_id,old.starts_at,old.ends_at,old.reason,old.requested_by) then
        raise exception 'Atribuições e período são imutáveis; faça nova solicitação';
    end if;
    if old.status <> 'solicitada' and new.status = 'autorizada' then
        raise exception 'Solicitação encerrada não pode ser reativada';
    end if;
    if new.status = 'autorizada' then
       if old.status <> 'solicitada' and old.status <> 'autorizada' then
         raise exception 'Não é possível autorizar esta solicitação';
       end if;
       new.authorized_by = coalesce(old.authorized_by,auth.uid());
       new.authorized_at = coalesce(old.authorized_at,now());
    else
       new.authorized_by=old.authorized_by;
       new.authorized_at=old.authorized_at;
    end if;
 end if;
 return new;
end $$;
drop trigger if exists validate_educator_substitution on public.educator_substitutions;
create trigger validate_educator_substitution before insert or update on public.educator_substitutions
for each row execute function app_private.validate_educator_substitution();
revoke all on function app_private.validate_educator_substitution() from public, anon, authenticated;

create or replace function app_private.can_substitute_educator(p_educator uuid)
returns boolean language sql stable security definer set search_path=pg_catalog, public, app_private as $$
 select auth.uid() is not null and exists (
   select 1 from public.educator_substitutions s
   join public.profiles actor on actor.id=s.substitute_id
   join public.profiles owner on owner.id=s.educator_id
   where s.educator_id=p_educator and s.substitute_id=auth.uid()
     and s.status='autorizada' and s.authorized_by is not null
     and now() between s.starts_at and s.ends_at
     and actor.active and actor.role::text='educador'
     and owner.active and owner.role::text='educador'
 )
$$;
revoke all on function app_private.can_substitute_educator(uuid) from public,anon;
grant execute on function app_private.can_substitute_educator(uuid) to authenticated;

drop policy if exists educator_substitute_plans_update on public.educator_plans;
create policy educator_substitute_plans_update on public.educator_plans for update to authenticated
using (app_private.can_substitute_educator(educator_user_id))
with check (app_private.can_substitute_educator(educator_user_id));
drop policy if exists educator_substitute_plans_insert on public.educator_plans;
create policy educator_substitute_plans_insert on public.educator_plans for insert to authenticated
with check (app_private.can_substitute_educator(educator_user_id));
drop policy if exists educator_substitute_records_update on public.educator_records;
create policy educator_substitute_records_update on public.educator_records for update to authenticated
using (app_private.can_substitute_educator(educator_user_id))
with check (app_private.can_substitute_educator(educator_user_id));
drop policy if exists educator_substitute_records_insert on public.educator_records;
create policy educator_substitute_records_insert on public.educator_records for insert to authenticated
with check (app_private.can_substitute_educator(educator_user_id));
drop policy if exists educator_substitute_reports_insert on public.educator_reports;
create policy educator_substitute_reports_insert on public.educator_reports for insert to authenticated
with check (app_private.can_substitute_educator(educator_user_id) and
 exists(select 1 from public.educator_plans p where p.id=plan_id and p.educator_user_id=educator_reports.educator_user_id));
drop policy if exists educator_substitute_reports_update on public.educator_reports;
create policy educator_substitute_reports_update on public.educator_reports for update to authenticated
using (app_private.can_substitute_educator(educator_user_id))
with check (app_private.can_substitute_educator(educator_user_id));
drop policy if exists educator_substitute_month_plans_update on public.workshop_monthly_plans;
create policy educator_substitute_month_plans_update on public.workshop_monthly_plans for update to authenticated
using (app_private.can_substitute_educator(educator_user_id))
with check (app_private.can_substitute_educator(educator_user_id));
drop policy if exists educator_substitute_month_reports_insert on public.workshop_monthly_reports;
create policy educator_substitute_month_reports_insert on public.workshop_monthly_reports for insert to authenticated
with check (app_private.can_substitute_educator(educator_user_id) and
 exists(select 1 from public.workshop_monthly_plans p where p.id=plan_id and p.educator_user_id=workshop_monthly_reports.educator_user_id));
drop policy if exists educator_substitute_month_reports_update on public.workshop_monthly_reports;
create policy educator_substitute_month_reports_update on public.workshop_monthly_reports for update to authenticated
using (app_private.can_substitute_educator(educator_user_id))
with check (app_private.can_substitute_educator(educator_user_id));
drop policy if exists educator_substitute_lessons_update on public.workshop_plan_lessons;
create policy educator_substitute_lessons_update on public.workshop_plan_lessons for update to authenticated
using (exists(select 1 from public.workshop_monthly_plans p where p.id=plan_id and app_private.can_substitute_educator(p.educator_user_id)))
with check (exists(select 1 from public.workshop_monthly_plans p where p.id=plan_id and app_private.can_substitute_educator(p.educator_user_id)));

create table if not exists public.educator_substitution_audit(
 id bigint generated by default as identity primary key,
 substitution_id uuid not null references public.educator_substitutions(id),
 actor_id uuid not null references public.profiles(id),
 educator_id uuid not null references public.profiles(id),
 table_name text not null,
 record_id uuid not null,
 action text not null,
 changed_fields text[] not null default '{}',
 occurred_at timestamptz not null default now()
);
alter table public.educator_substitution_audit enable row level security;
revoke all on public.educator_substitution_audit from anon,authenticated;
grant select on public.educator_substitution_audit to authenticated;
drop policy if exists educator_substitution_audit_read on public.educator_substitution_audit;
create policy educator_substitution_audit_read on public.educator_substitution_audit for select to authenticated
using (app_private.has_any_role(array['coordenacao_geral']) or
 (app_private.is_active_staff() and (actor_id=auth.uid() or educator_id=auth.uid())));
create or replace function app_private.audit_educator_substitution()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,app_private as $$
declare target uuid; sid uuid; diffs text[];
begin
 if auth.uid() is null then return new; end if;
 if tg_table_name in ('educator_reports','workshop_monthly_reports') then
   target:=new.educator_user_id;
 elsif tg_table_name = 'workshop_plan_lessons' then
   select educator_user_id into target from public.workshop_monthly_plans where id=new.plan_id;
 else
   target:=new.educator_user_id;
 end if;
 if target is null or target=auth.uid() or not app_private.can_substitute_educator(target) then
   return new;
 end if;
 if tg_op='UPDATE' then
   if (to_jsonb(new)->>'educator_user_id') is distinct from (to_jsonb(old)->>'educator_user_id')
      or (to_jsonb(new)->>'plan_id') is distinct from (to_jsonb(old)->>'plan_id') then
      raise exception 'A substituição não pode transferir titularidade ou vínculo do documento';
   end if;
   select coalesce(array_agg(k order by k),'{}'::text[]) into diffs
   from jsonb_object_keys(to_jsonb(new)) k
   where (to_jsonb(new)->k) is distinct from (to_jsonb(old)->k);
 else diffs:=array['novo_registro']; end if;
 select id into sid from public.educator_substitutions
  where educator_id=target and substitute_id=auth.uid() and status='autorizada'
  and now() between starts_at and ends_at order by authorized_at desc nulls last limit 1;
 if sid is not null then
  insert into public.educator_substitution_audit(substitution_id,actor_id,educator_id,table_name,record_id,action,changed_fields)
  values(sid,auth.uid(),target,tg_table_name,new.id,tg_op,diffs);
 end if;
 return new;
end $$;
revoke all on function app_private.audit_educator_substitution() from public,anon,authenticated;
do $$
declare t text;
begin
 foreach t in array array['educator_plans','educator_records','educator_reports','workshop_monthly_plans','workshop_monthly_reports','workshop_plan_lessons'] loop
   execute format('drop trigger if exists educator_substitution_audit_trigger on public.%I',t);
   execute format('create trigger educator_substitution_audit_trigger after insert or update on public.%I for each row execute function app_private.audit_educator_substitution()',t);
 end loop;
end $$;
