begin;
alter table public.educator_substitutions drop constraint educator_substitutions_check1;
alter table public.educator_substitutions add constraint educator_substitutions_period
check (ends_at > starts_at and (
  ends_at <= starts_at + interval '31 days' or
  (ends_at = 'infinity'::timestamptz and substitute_id = '9271d8b9-3029-4ce3-a7c6-f8515728775d' and educator_id = 'b6168ed4-f140-44c3-94bc-436b7393274b')
));
alter policy edu_substitution_request on public.educator_substitutions
with check (app_private.has_any_role(array['educador']) and
  substitute_id = (select auth.uid()) and requested_by = (select auth.uid()) and
  status = 'solicitada' and authorized_by is null and authorized_at is null and
  starts_at > now() - interval '1 day' and ends_at > now() and isfinite(ends_at));
create or replace function app_private.validate_educator_substitution()
returns trigger language plpgsql security definer set search_path = pg_catalog, public, app_private as $$
declare a_role text; b_role text;
begin
 select role::text into a_role from public.profiles where id=new.educator_id and active=true;
 select role::text into b_role from public.profiles where id=new.substitute_id and active=true;
 if new.ends_at = 'infinity'::timestamptz and not (new.substitute_id = '9271d8b9-3029-4ce3-a7c6-f8515728775d'::uuid and new.educator_id = 'b6168ed4-f140-44c3-94bc-436b7393274b'::uuid) then
    raise exception 'Vínculo permanente não autorizado';
 end if;
 if a_role is distinct from 'educador' or (b_role is distinct from 'educador' and not (new.ends_at = 'infinity'::timestamptz and b_role is not null)) then
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
create or replace function app_private.can_substitute_educator(p_educator uuid)
returns boolean language sql stable security definer set search_path=pg_catalog, public, app_private as $$
 select auth.uid() is not null and exists (
   select 1 from public.educator_substitutions s
   join public.profiles actor on actor.id=s.substitute_id
   join public.profiles owner on owner.id=s.educator_id
   where s.educator_id=p_educator and s.substitute_id=auth.uid()
     and s.status='autorizada' and s.authorized_by is not null
     and now() between s.starts_at and s.ends_at
     and actor.active and (actor.role::text='educador' or s.ends_at='infinity'::timestamptz)
     and owner.active and owner.role::text='educador'
 )
$$;

create policy educator_delegate_read on public.educator_plans for select to authenticated using ((select auth.uid()) = '9271d8b9-3029-4ce3-a7c6-f8515728775d' and (app_private.can_substitute_educator(educator_user_id)));
create policy educator_delegate_read on public.educator_records for select to authenticated using ((select auth.uid()) = '9271d8b9-3029-4ce3-a7c6-f8515728775d' and (app_private.can_substitute_educator(educator_user_id)));
create policy educator_delegate_read on public.educator_reports for select to authenticated using ((select auth.uid()) = '9271d8b9-3029-4ce3-a7c6-f8515728775d' and (app_private.can_substitute_educator(educator_user_id)));
create policy educator_delegate_read on public.workshop_monthly_plans for select to authenticated using ((select auth.uid()) = '9271d8b9-3029-4ce3-a7c6-f8515728775d' and (app_private.can_substitute_educator(educator_user_id)));
create policy educator_delegate_read on public.workshop_monthly_reports for select to authenticated using ((select auth.uid()) = '9271d8b9-3029-4ce3-a7c6-f8515728775d' and (app_private.can_substitute_educator(educator_user_id)));
create policy educator_delegate_read on public.workshop_plan_lessons for select to authenticated using ((select auth.uid()) = '9271d8b9-3029-4ce3-a7c6-f8515728775d' and (exists (select 1 from public.workshop_monthly_plans p where p.id=plan_id and app_private.can_substitute_educator(p.educator_user_id))));
create policy educator_delegate_read on public.workshops for select to authenticated using ((select auth.uid()) = '9271d8b9-3029-4ce3-a7c6-f8515728775d' and (app_private.can_substitute_educator(educator_user_id) or app_private.can_substitute_educator(created_by)));
create policy educator_delegate_read on public.workshop_sessions for select to authenticated using ((select auth.uid()) = '9271d8b9-3029-4ce3-a7c6-f8515728775d' and (app_private.can_substitute_educator(educator_user_id) or app_private.can_substitute_educator(created_by)));

insert into public.educator_substitutions
  (educator_id, substitute_id, requested_by, authorized_by, reason, starts_at, ends_at, status, authorized_at)
values ('b6168ed4-f140-44c3-94bc-436b7393274b', '9271d8b9-3029-4ce3-a7c6-f8515728775d', '9271d8b9-3029-4ce3-a7c6-f8515728775d', '9271d8b9-3029-4ce3-a7c6-f8515728775d',
  'Acesso permanente aos registros da educadora', now(), 'infinity', 'autorizada', now());
commit;
