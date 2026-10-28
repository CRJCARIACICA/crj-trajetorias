-- Referências de mobilização e monitoramento consolidado da Articulação.
-- Dados técnicos e de controle de acesso permanecem protegidos por suas RLS.
create table if not exists public.educator_articulator_assignments (
  educator_user_id uuid not null references public.profiles(id),
  articulator_user_id uuid not null references public.profiles(id),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (educator_user_id, articulator_user_id),
  constraint educator_articulator_distinct check (educator_user_id <> articulator_user_id)
);
create index if not exists educator_articulator_assignments_art_idx on public.educator_articulator_assignments (articulator_user_id);
alter table public.educator_articulator_assignments enable row level security;
revoke all on public.educator_articulator_assignments from public, anon;
grant select, insert, update, delete on public.educator_articulator_assignments to authenticated;

-- Sem confiar em metadados editáveis pelo usuário; o perfil ativo é consultado no banco.
create or replace function app_private.can_monitor_articulation()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.active
      and p.role::text <> 'pendente'
      and (p.role::text in ('articulador','coordenacao_articulacao','coordenacao_geral')
        or app_private.developer_total_mode()
        or translate(lower(coalesce(p.team,'')), 'áàâãéêíóôõúç', 'aaaaeeiooouc') like '%articula%')
  )
$$;
revoke all on function app_private.can_monitor_articulation() from public, anon;
grant execute on function app_private.can_monitor_articulation() to authenticated;

-- O desenvolvedor pode assumir outra função temporariamente. Sua função base
-- continua elegível para os vínculos da equipe enquanto a prévia estiver ativa.
create or replace function app_private.is_reference_educator(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p left join app_private.developer_accounts d on d.user_id=p.id
    where p.id=p_user and p.active and (p.role::text='educador' or (p.developer_preview_enabled and d.enabled and d.base_role::text='educador'))
  )
$$;
create or replace function app_private.is_reference_articulator(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.profiles p left join app_private.developer_accounts d on d.user_id=p.id
    where p.id=p_user and p.active and p.role::text<>'pendente'
      and (p.role::text in ('articulador','coordenacao_articulacao')
        or translate(lower(coalesce(p.team,'')), 'áàâãéêíóôõúç', 'aaaaeeiooouc') like '%articula%'
        or (p.developer_preview_enabled and d.enabled and d.base_role::text in ('articulador','coordenacao_articulacao')))
  )
$$;
revoke all on function app_private.is_reference_educator(uuid),app_private.is_reference_articulator(uuid) from public, anon;
grant execute on function app_private.is_reference_educator(uuid),app_private.is_reference_articulator(uuid) to authenticated;

create policy educator_articulator_select on public.educator_articulator_assignments for select to authenticated
using (app_private.can_monitor_articulation() or educator_user_id = (select auth.uid()));
create policy educator_articulator_insert on public.educator_articulator_assignments for insert to authenticated
with check ((app_private.is_active_staff() and app_private.has_any_role(array['coordenacao_geral']))
  and app_private.is_reference_educator(educator_user_id)
  and app_private.is_reference_articulator(articulator_user_id));
create policy educator_articulator_update on public.educator_articulator_assignments for update to authenticated
using ((app_private.is_active_staff() and app_private.has_any_role(array['coordenacao_geral'])))
with check ((app_private.is_active_staff() and app_private.has_any_role(array['coordenacao_geral']))
  and app_private.is_reference_educator(educator_user_id)
  and app_private.is_reference_articulator(articulator_user_id));
create policy educator_articulator_delete on public.educator_articulator_assignments for delete to authenticated
using ((app_private.is_active_staff() and app_private.has_any_role(array['coordenacao_geral'])));

-- Salva todas as referências do educador na mesma transação, aplicando RLS.
create or replace function public.save_educator_articulator_assignments(p_educator uuid,p_articulators uuid[])
returns void language plpgsql security invoker set search_path = '' as $$
declare v_articulators uuid[] := coalesce(p_articulators, '{}'::uuid[]);
begin
  if auth.uid() is null or not app_private.is_active_staff() or not app_private.has_any_role(array['coordenacao_geral']) then
    raise exception 'Somente a Coordenação Geral pode alterar as referências.' using errcode='42501';
  end if;
  if not app_private.is_reference_educator(p_educator) then
    raise exception 'Educador ativo não encontrado.' using errcode='22023';
  end if;
  if exists(select 1 from unnest(v_articulators) x(id) where x.id is null or not app_private.is_reference_articulator(x.id)) then
    raise exception 'Selecione somente articuladores ativos.' using errcode='22023';
  end if;
  delete from public.educator_articulator_assignments a where a.educator_user_id=p_educator and not (a.articulator_user_id=any(v_articulators));
  insert into public.educator_articulator_assignments(educator_user_id,articulator_user_id,created_by,updated_by)
    select p_educator,x.id,auth.uid(),auth.uid() from (select distinct unnest(v_articulators) as id) x
    on conflict (educator_user_id,articulator_user_id) do nothing;
end $$;
revoke all on function public.save_educator_articulator_assignments(uuid,uuid[]) from public, anon;
grant execute on function public.save_educator_articulator_assignments(uuid,uuid[]) to authenticated;

-- A função privilegiada reside em schema não exposto, valida o perfil e retorna
-- somente totais e faixas etárias; nunca devolve IDs ou conteúdos de atendimento.
create or replace function app_private.articulation_monitor_options()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app_private.can_monitor_articulation() then
    raise exception 'Acesso permitido somente à Articulação e à Coordenação Geral.' using errcode='42501';
  end if;
  return jsonb_build_object(
    'educators', coalesce((select jsonb_agg(jsonb_build_object('name',p.display_name) order by p.display_name)
      from public.educator_articulator_assignments a join public.profiles p on p.id=a.educator_user_id
      where a.articulator_user_id=auth.uid() and p.active),'[]'::jsonb),
    'workshops', coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'active',w.active,
      'is_reference',exists(select 1 from public.educator_articulator_assignments a where a.educator_user_id=w.educator_user_id and a.articulator_user_id=auth.uid())) order by w.name)
      from public.workshops w),'[]'::jsonb),
    'rooms', coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'active',r.active) order by r.name)
      from public.access_resources r where r.resource_type='room' and (r.allow_free_use or exists(select 1 from public.access_presence_rooms pr where pr.room_id=r.id))),'[]'::jsonb)
  );
end $$;
revoke all on function app_private.articulation_monitor_options() from public, anon;
grant execute on function app_private.articulation_monitor_options() to authenticated;
create or replace function public.articulation_monitor_options()
returns jsonb language sql stable security invoker set search_path = '' as $$ select app_private.articulation_monitor_options() $$;
revoke all on function public.articulation_monitor_options() from public, anon;
grant execute on function public.articulation_monitor_options() to authenticated;

create or replace function app_private.articulation_youth_monitor(p_start date,p_end date,p_scope text,p_selected_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not app_private.can_monitor_articulation() then
    raise exception 'Acesso permitido somente à Articulação e à Coordenação Geral.' using errcode='42501';
  end if;
  if p_start is null or p_end is null or p_start>p_end or p_end-p_start>730 then
    raise exception 'Selecione um período válido de até 731 dias.' using errcode='22023';
  end if;
  if p_scope is null or p_scope not in ('all','pvida','ptrampo','outras','workshops','reference','workshop','free','room') then
    raise exception 'Filtro de monitoramento inválido.' using errcode='22023';
  end if;
  if p_scope in ('workshop','room') and p_selected_id is null then
    raise exception 'Selecione uma oficina ou uma sala.' using errcode='22023';
  end if;
  with events as (
    select 'workshops'::text kind,a.attendance_date event_date,'y:'||a.youth_id::text person_key,y.birth_date,a.workshop_id as item_id
      from public.attendance a join public.young_people y on y.id=a.youth_id
      where a.present and y.status<>'excluido' and a.attendance_date between p_start and p_end
    union all
    select 'workshops',g.participation_date,case when pp.linked_youth_id is not null then 'y:'||pp.linked_youth_id::text else 'p:'||pp.id::text end,
      coalesce(y.birth_date,pp.birth_date),g.workshop_id
      from public.workshop_guest_participations g join public.provisional_people pp on pp.id=g.provisional_person_id
      left join public.young_people y on y.id=pp.linked_youth_id
      where g.participation_date between p_start and p_end and (y.id is null or y.status<>'excluido')
    union all
    select case s.program_type when 'pvida' then 'pvida' when 'ptrampo' then 'ptrampo' when 'outras-demandas' then 'outras' else 'services' end,
      s.service_date,'y:'||sy.youth_id::text,y.birth_date,null::uuid
      from public.technical_service_records s join public.technical_service_youth sy on sy.service_id=s.id
      join public.young_people y on y.id=sy.youth_id
      where s.service_date between p_start and p_end and s.status not in ('cancelado','cancelada') and y.status<>'excluido'
      and not exists (select 1 from public.technical_action_executions e join public.technical_action_attendance a on a.execution_id=e.id and a.present
        where e.service_record_id=s.id and e.execution_status in ('realizada','parcial') and a.youth_id=sy.youth_id)
    union all
    select case p.action_type when 'pvida' then 'pvida' when 'ptrampo' then 'ptrampo' when 'outras-demandas' then 'outras' else 'services' end,
      e.execution_date,'y:'||a.youth_id::text,y.birth_date,null::uuid
      from public.technical_action_executions e join public.technical_action_plans p on p.id=e.plan_id
      join public.technical_action_attendance a on a.execution_id=e.id and a.present join public.young_people y on y.id=a.youth_id
      where e.execution_date between p_start and p_end and e.execution_status in ('realizada','parcial') and y.status<>'excluido'
    union all
    select case lower(s.category) when 'pvida' then 'pvida' when 'ptrampo' then 'ptrampo' when 'outras demandas' then 'outras' else 'services' end,
      s.service_date,'y:'||s.youth_id::text,y.birth_date,null::uuid
      from public.service_records s join public.young_people y on y.id=s.youth_id
      where s.service_date between p_start and p_end and s.status not in ('cancelado','cancelada') and y.status<>'excluido'
      and not exists (select 1 from public.technical_service_records t where t.legacy_service_record_id=s.id)
    union all
    select 'services',f.followup_date,'y:'||f.youth_id::text,y.birth_date,null::uuid
      from public.followups f join public.young_people y on y.id=f.youth_id
      where f.followup_date between p_start and p_end and f.status not in ('cancelado','cancelada') and y.status<>'excluido'
    union all
    select 'cfdh',a.attendance_date,'y:'||a.youth_id::text,y.birth_date,null::uuid
      from public.cfdh_attendance a join public.young_people y on y.id=a.youth_id
      where a.present and a.attendance_date between p_start and p_end and y.status<>'excluido'
    union all
    select 'free',l.list_date,case when p.youth_id is null then 'a:'||p.id::text else 'y:'||p.youth_id::text end,
      coalesce(y.birth_date,p.birth_date),null::uuid
      from public.access_presence_records p join public.access_daily_lists l on l.id=p.list_id
      left join public.young_people y on y.id=p.youth_id
      where l.list_date between p_start and p_end and (y.id is null or y.status<>'excluido')
      and exists(select 1 from public.access_presence_rooms pr join public.access_resources r on r.id=pr.room_id
        where pr.presence_id=p.id and r.resource_type='room' and r.allow_free_use
          and (p_scope<>'room' or pr.room_id=p_selected_id))
  ), filtered as (
    select * from events e where p_scope='all' or e.kind=p_scope
      or (p_scope='reference' and e.kind='workshops' and exists (
        select 1 from public.workshops w join public.educator_articulator_assignments a on a.educator_user_id=w.educator_user_id
        where w.id=e.item_id and a.articulator_user_id=auth.uid()))
      or (p_scope='workshop' and e.kind='workshops' and e.item_id=p_selected_id)
      or (p_scope='room' and e.kind='free')
  ), people as (
    select person_key,max(birth_date) birth_date from filtered group by person_key
  ), days as (
    select event_date,count(distinct person_key)::integer as people,count(*)::integer as participations
      from filtered group by event_date
  ), ages as (
    select case when birth_date is null or birth_date>p_end then 'Não informada'
      when extract(year from age(p_end,birth_date))<15 then 'Até 14 anos'
      when extract(year from age(p_end,birth_date))<18 then '15 a 17 anos'
      when extract(year from age(p_end,birth_date))<25 then '18 a 24 anos'
      when extract(year from age(p_end,birth_date))<30 then '25 a 29 anos'
      else '30 anos ou mais' end as label from people
  ), age_counts as (select label,count(*)::integer as total from ages group by label)
  select jsonb_build_object(
    'people',(select count(*) from people), 'participations',(select count(*) from filtered),
    'days',(select count(*) from days), 'average',(select coalesce(round(avg(people),1),0) from days),
    'timeline',coalesce((select jsonb_agg(jsonb_build_object('date',event_date,'people',people,'participations',participations) order by event_date) from days),'[]'::jsonb),
    'ages',coalesce((select jsonb_agg(jsonb_build_object('label',label,'total',total) order by case label when 'Até 14 anos' then 1 when '15 a 17 anos' then 2 when '18 a 24 anos' then 3 when '25 a 29 anos' then 4 when '30 anos ou mais' then 5 else 6 end) from age_counts),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function app_private.articulation_youth_monitor(date,date,text,uuid) from public, anon;
grant execute on function app_private.articulation_youth_monitor(date,date,text,uuid) to authenticated;
create or replace function public.articulation_youth_monitor(p_start date,p_end date,p_scope text,p_selected_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select app_private.articulation_youth_monitor(p_start,p_end,p_scope,p_selected_id)
$$;
revoke all on function public.articulation_youth_monitor(date,date,text,uuid) from public, anon;
grant execute on function public.articulation_youth_monitor(date,date,text,uuid) to authenticated;
