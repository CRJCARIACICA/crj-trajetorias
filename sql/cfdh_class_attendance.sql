-- Uma turma por planejamento CFDH, usando a mesma presença da aula quando transversal.
-- A ponte conserva a autoria original e não cria outra presença de oficina.
alter table public.cfdh_attendance
  add column if not exists source_workshop_attendance_id uuid,
  add column if not exists independent_cfdh_presence boolean not null default true;
create index if not exists cfdh_attendance_workshop_source_idx
  on public.cfdh_attendance(source_workshop_attendance_id) where source_workshop_attendance_id is not null;

create or replace function app_private.cfdh_class_own_presence()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
  -- Escritas diretas pertencem ao CFDH; escritas feitas pela ponte ficam identificadas como tal.
  if coalesce(current_setting('crj.cfdh_presence_sync',true),'')<>'on' then new.independent_cfdh_presence:=true; end if;
  return new;
end $fn$;
drop trigger if exists cfdh_class_own_presence on public.cfdh_attendance;
create trigger cfdh_class_own_presence before insert or update on public.cfdh_attendance
for each row execute function app_private.cfdh_class_own_presence();

create or replace function app_private.cfdh_class_attendance_indicator()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare r public.cfdh_attendance%rowtype;
begin
  r:=case when tg_op='DELETE' then old else new end;
  delete from public.indicator_events where indicator_code='M2.1_ATENDIMENTOS' and source_type='cfdh_attendance' and source_id=r.id;
  if tg_op<>'DELETE' and r.present and r.independent_cfdh_presence
     and not exists(select 1 from public.attendance atd where atd.id=r.source_workshop_attendance_id and atd.present) then
    insert into public.indicator_events(indicator_code,youth_id,event_date,quantity,source_type,source_id,source_mode)
    values('M2.1_ATENDIMENTOS',r.youth_id,r.attendance_date,1,'cfdh_attendance',r.id,'identified');
  end if;
  return case when tg_op='DELETE' then old else new end;
end $fn$;
drop trigger if exists cfdh_class_attendance_indicator on public.cfdh_attendance;
create trigger cfdh_class_attendance_indicator after insert or update or delete on public.cfdh_attendance
for each row execute function app_private.cfdh_class_attendance_indicator();

create or replace function app_private.cfdh_class_sync_presence(p_action_id uuid)
returns void language plpgsql security definer set search_path='' as $fn$
declare a public.cfdh_actions%rowtype; linked boolean; previous_setting text;
begin
  select * into a from public.cfdh_actions where id=p_action_id;
  if not found then return; end if;
  select p.plan_type='cfdh_transversal' and a.workshop_plan_lesson_id is not null
    and a.planning_status='complete' and a.execution_status<>'cancelada'
    into linked from public.educator_plans p where p.id=a.plan_id;
  linked:=coalesce(linked,false);
  previous_setting:=coalesce(current_setting('crj.cfdh_presence_sync',true),'');
  perform set_config('crj.cfdh_presence_sync','on',true);

  -- Remove somente projeções órfãs. Uma presença já registrada no CFDH é preservada.
  delete from public.cfdh_attendance ca
  where ca.action_id=a.id and not ca.independent_cfdh_presence and ca.source_workshop_attendance_id is not null
    and not (linked and exists(select 1 from public.attendance atd
      join public.workshop_sessions s on s.id=atd.session_id
      where atd.id=ca.source_workshop_attendance_id and atd.present and s.plan_lesson_id=a.workshop_plan_lesson_id));
  update public.cfdh_attendance ca set source_workshop_attendance_id=null
  where ca.action_id=a.id and ca.independent_cfdh_presence and ca.source_workshop_attendance_id is not null
    and not (linked and exists(select 1 from public.attendance atd
      join public.workshop_sessions s on s.id=atd.session_id
      where atd.id=ca.source_workshop_attendance_id and atd.present and s.plan_lesson_id=a.workshop_plan_lesson_id));
  if not linked then perform set_config('crj.cfdh_presence_sync',previous_setting,true); return; end if;
  insert into public.cfdh_attendance(action_id,plan_id,youth_id,attendance_date,present,notes,created_by,source_workshop_attendance_id,independent_cfdh_presence)
  select distinct on (atd.youth_id) a.id,a.plan_id,atd.youth_id,atd.attendance_date,true,
         'Presença compartilhada com a aula de oficina vinculada',atd.created_by,atd.id,false
  from public.attendance atd join public.workshop_sessions s on s.id=atd.session_id
  where s.plan_lesson_id=a.workshop_plan_lesson_id and atd.present
  order by atd.youth_id,atd.created_at,atd.id
  on conflict(action_id,youth_id) do update set
    source_workshop_attendance_id=excluded.source_workshop_attendance_id,
    present=true,
    attendance_date=case when public.cfdh_attendance.independent_cfdh_presence then public.cfdh_attendance.attendance_date else excluded.attendance_date end
  where public.cfdh_attendance.source_workshop_attendance_id is distinct from excluded.source_workshop_attendance_id
     or public.cfdh_attendance.present is distinct from true
     or (not public.cfdh_attendance.independent_cfdh_presence and public.cfdh_attendance.attendance_date is distinct from excluded.attendance_date);
  perform set_config('crj.cfdh_presence_sync',previous_setting,true);
end $fn$;

create or replace function app_private.cfdh_class_workshop_attendance_changed()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare x record;
begin
  for x in
    select distinct a.id from public.cfdh_actions a
    where (tg_op<>'INSERT' and exists(select 1 from public.cfdh_attendance ca where ca.action_id=a.id and ca.source_workshop_attendance_id=old.id))
       or (tg_op<>'DELETE' and exists(select 1 from public.workshop_sessions s where s.id=new.session_id and s.plan_lesson_id=a.workshop_plan_lesson_id))
       or (tg_op<>'INSERT' and exists(select 1 from public.workshop_sessions s where s.id=old.session_id and s.plan_lesson_id=a.workshop_plan_lesson_id))
    order by a.id
  loop perform app_private.cfdh_class_sync_presence(x.id); end loop;
  return case when tg_op='DELETE' then old else new end;
end $fn$;
drop trigger if exists cfdh_class_workshop_attendance on public.attendance;
create trigger cfdh_class_workshop_attendance after insert or update or delete on public.attendance
for each row execute function app_private.cfdh_class_workshop_attendance_changed();

-- Visitantes da aula compartilhada possuem presença nominal própria, sem criar
-- um jovem provisório nem repetir o atendimento em ações do mesmo encontro.
create or replace function app_private.cfdh_class_sync_guests(p_lesson uuid)
returns void language plpgsql security definer set search_path='' as $fn$
begin
  if p_lesson is null then return; end if;
  delete from public.indicator_events e where e.source_type in ('cfdh_workshop_guest','cfdh_workshop_guest_program') and exists(
      select 1 from public.workshop_guest_participations g join public.workshop_sessions s on s.id=g.session_id
      where g.id=e.source_id and s.plan_lesson_id=p_lesson);
  insert into public.indicator_events(indicator_code,youth_id,event_date,quantity,source_type,source_id,source_mode)
  select 'M2.1_ATENDIMENTOS',null,g.participation_date,1,'cfdh_workshop_guest',g.id,'identified'
  from public.workshop_guest_participations g join public.workshop_sessions s on s.id=g.session_id
  where s.plan_lesson_id=p_lesson and exists(
    select 1 from public.cfdh_actions a join public.educator_plans p on p.id=a.plan_id
    where a.workshop_plan_lesson_id=p_lesson and p.plan_type='cfdh_transversal'
      and a.planning_status='complete' and a.execution_status<>'cancelada');
  -- Visitante identificado pelo registro nominal contribui às metas de participação;
  -- metas de jovens únicos continuam exigindo um cadastro de jovem identificável.
  insert into public.indicator_events(indicator_code,youth_id,event_date,quantity,source_type,source_id,source_mode)
  select m.code,null,g.participation_date,1,'cfdh_workshop_guest_program',g.id,'identified'
  from public.workshop_guest_participations g join public.workshop_sessions s on s.id=g.session_id
  cross join (values
    ('pvida','M6.2_PVIDA_PARTICIPACOES'),('outras_demandas','M6.2_OUTRAS_DEMANDAS'),
    ('ficaadica','M6.3_CONSULTAS'),('passeio_cultural','M6.1_PARTICIPACOES_CULTURA'),
    ('mostra_profissoes','M4.5_PARTICIPANTES'),('mostra_profissoes','M6.4_MOSTRA_PARTICIPANTES')
  ) m(program,code)
  where s.plan_lesson_id=p_lesson and exists(
    select 1 from public.cfdh_actions a join public.educator_plans p on p.id=a.plan_id
    where a.workshop_plan_lesson_id=p_lesson and p.plan_type='cfdh_transversal'
      and a.planning_status='complete' and a.execution_status in ('realizada','parcial')
      and (a.program_metric_links @> jsonb_build_array(jsonb_build_object('program',m.program))
        or (m.program='passeio_cultural' and a.program_metric_links @> '[{"program":"vivencia_intercambio"}]'::jsonb)));
end $fn$;
create or replace function app_private.cfdh_class_guest_changed()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare old_lesson uuid; new_lesson uuid;
begin
  if tg_op<>'INSERT' then
    delete from public.indicator_events where source_type in ('cfdh_workshop_guest','cfdh_workshop_guest_program') and source_id=old.id;
    select plan_lesson_id into old_lesson from public.workshop_sessions where id=old.session_id;
  end if;
  if tg_op<>'DELETE' then select plan_lesson_id into new_lesson from public.workshop_sessions where id=new.session_id; end if;
  perform app_private.cfdh_class_sync_guests(old_lesson);
  if new_lesson is distinct from old_lesson then perform app_private.cfdh_class_sync_guests(new_lesson); end if;
  return case when tg_op='DELETE' then old else new end;
end $fn$;
drop trigger if exists cfdh_class_guest_changed on public.workshop_guest_participations;
create trigger cfdh_class_guest_changed after insert or update or delete on public.workshop_guest_participations
for each row execute function app_private.cfdh_class_guest_changed();

-- As horas de ações na mesma aula são a união dos intervalos; minutos já lançados
-- na oficina são descontados para que a mesma carga horária não seja somada duas vezes.
create or replace function app_private.cfdh_class_lesson_hours(p_lesson uuid)
returns void language plpgsql security definer set search_path='' as $fn$
declare h numeric:=0; unknown_h numeric:=0; already_h numeric:=0; event_dt date;
begin
  if p_lesson is null then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cfdh-hours:'||p_lesson::text,0));
  delete from public.indicator_events where indicator_code='M6.1_CFDH_HORAS' and source_type='cfdh_lesson_hours' and source_id=p_lesson;
  with intervals as (
    select tsrange(coalesce(a.actual_date,a.scheduled_date)+a.actual_start,
      least(coalesce(a.actual_date,a.scheduled_date)+a.actual_end,
        coalesce(a.actual_date,a.scheduled_date)+a.actual_start+make_interval(secs=>(a.actual_duration_hours*3600)::double precision)),'[)') as period
    from public.cfdh_actions a
    where a.workshop_plan_lesson_id=p_lesson and a.execution_status in ('realizada','parcial')
      and a.actual_duration_hours>=2 and coalesce(a.actual_date,a.scheduled_date) is not null
      and a.actual_start is not null and a.actual_end>a.actual_start
  ), merged as (select unnest(range_agg(period)) as period from intervals)
  select coalesce(sum(extract(epoch from upper(period)-lower(period))/3600),0) into h from merged;
  select coalesce(max(actual_duration_hours),0),min(coalesce(actual_date,scheduled_date))
    into unknown_h,event_dt from public.cfdh_actions
   where workshop_plan_lesson_id=p_lesson and execution_status in ('realizada','parcial') and actual_duration_hours>=2
     and (actual_start is null or actual_end is null or actual_end<=actual_start);
  select coalesce(sum(greatest(s.cfdh_minutes,0))/60.0,0),coalesce(min(s.session_date),event_dt)
    into already_h,event_dt from public.workshop_sessions s where s.plan_lesson_id=p_lesson;
  if event_dt is null then
    select min(coalesce(actual_date,scheduled_date)) into event_dt from public.cfdh_actions
      where workshop_plan_lesson_id=p_lesson and execution_status in ('realizada','parcial') and actual_duration_hours>=2;
  end if;
  h:=greatest(greatest(h,unknown_h)-already_h,0);
  if h>0 and event_dt is not null then
    insert into public.indicator_events(indicator_code,youth_id,event_date,quantity,source_type,source_id,source_mode)
    values('M6.1_CFDH_HORAS',null,event_dt,h,'cfdh_lesson_hours',p_lesson,'identified');
  end if;
end $fn$;

create or replace function app_private.cfdh_class_action_changed()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare x record; v_action_id uuid;
begin
  v_action_id:=case when tg_op='DELETE' then old.id else new.id end;
  delete from public.indicator_events where indicator_code='M6.1_CFDH_HORAS' and source_type='cfdh_action_hours' and source_id=v_action_id;
  if tg_op<>'DELETE' then
    if new.workshop_plan_lesson_id is null and new.execution_status in ('realizada','parcial')
       and coalesce(new.actual_duration_hours,0)>=2 and coalesce(new.actual_date,new.scheduled_date) is not null then
      insert into public.indicator_events(indicator_code,youth_id,event_date,quantity,source_type,source_id,source_mode)
      values('M6.1_CFDH_HORAS',null,coalesce(new.actual_date,new.scheduled_date),new.actual_duration_hours,'cfdh_action_hours',new.id,'identified');
    end if;
    perform app_private.cfdh_class_sync_presence(new.id);
    perform app_private.cfdh_class_lesson_hours(new.workshop_plan_lesson_id);
    perform app_private.cfdh_class_sync_guests(new.workshop_plan_lesson_id);
  end if;
  if tg_op<>'INSERT' and (tg_op='DELETE' or old.workshop_plan_lesson_id is distinct from new.workshop_plan_lesson_id) then
    perform app_private.cfdh_class_lesson_hours(old.workshop_plan_lesson_id);
    perform app_private.cfdh_class_sync_guests(old.workshop_plan_lesson_id);
  end if;
  return case when tg_op='DELETE' then old else new end;
end $fn$;
drop trigger if exists cfdh_class_action_changed on public.cfdh_actions;
create trigger cfdh_class_action_changed after insert or update or delete on public.cfdh_actions
for each row execute function app_private.cfdh_class_action_changed();

create or replace function app_private.cfdh_class_session_changed()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare x record;
begin
  if tg_op<>'INSERT' and (tg_op='DELETE' or old.plan_lesson_id is distinct from new.plan_lesson_id) then
    delete from public.indicator_events e where e.source_type in ('cfdh_workshop_guest','cfdh_workshop_guest_program') and exists(
      select 1 from public.workshop_guest_participations g where g.id=e.source_id and g.session_id=old.id);
  end if;
  for x in select a.id from public.cfdh_actions a
    where (tg_op<>'DELETE' and a.workshop_plan_lesson_id=new.plan_lesson_id)
       or (tg_op<>'INSERT' and a.workshop_plan_lesson_id=old.plan_lesson_id)
  loop
    perform app_private.cfdh_class_sync_presence(x.id);
    perform app_private.sync_cfdh_program_indicators(x.id);
  end loop;
  if tg_op<>'DELETE' then perform app_private.cfdh_class_lesson_hours(new.plan_lesson_id); perform app_private.cfdh_class_sync_guests(new.plan_lesson_id); perform app_private.cfdh_class_reconcile_program(new.plan_lesson_id); end if;
  if tg_op<>'INSERT' and (tg_op='DELETE' or old.plan_lesson_id is distinct from new.plan_lesson_id) then
    perform app_private.cfdh_class_lesson_hours(old.plan_lesson_id);
    perform app_private.cfdh_class_sync_guests(old.plan_lesson_id);
    perform app_private.cfdh_class_reconcile_program(old.plan_lesson_id);
  end if;
  return case when tg_op='DELETE' then old else new end;
end $fn$;
drop trigger if exists cfdh_class_session_changed on public.workshop_sessions;
create trigger cfdh_class_session_changed after insert or update or delete on public.workshop_sessions
for each row execute function app_private.cfdh_class_session_changed();

-- Uma ação em uma aula já registrada não gera uma segunda carga de oficina.
do $block$
declare def text; target text:='  if v_oficina and v_hours>0 then'; replacement text:='  if v_oficina and v_hours>0 and not exists(select 1 from public.workshop_sessions s where a.workshop_plan_lesson_id is not null and s.plan_lesson_id=a.workshop_plan_lesson_id) then';
begin
  select pg_get_functiondef('app_private.sync_cfdh_program_indicators(uuid)'::regprocedure) into def;
  if position(replacement in def)=0 then
    if position(target in def)=0 then raise exception 'Definição dos indicadores CFDH mudou; revise antes da migração.'; end if;
    execute replace(def,target,replacement);
  end if;
end $block$;

-- Um mesmo encontro pode ter mais de uma ação transversal. Seus vínculos são
-- preservados, mas cada indicador/participante só recebe uma contribuição por aula.
create or replace function app_private.cfdh_class_reconcile_program(p_lesson uuid)
returns void language plpgsql security definer set search_path='' as $fn$
declare x record;
begin
  if p_lesson is null then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cfdh-program:'||p_lesson::text,0));
  for x in select a.id from public.cfdh_actions a where a.workshop_plan_lesson_id=p_lesson order by a.id loop
    perform app_private.sync_cfdh_program_indicators(x.id);
  end loop;
  -- Nas metas horárias, contabilize a união dos intervalos efetivamente executados.
  with hour_events as (
    select e.id,e.indicator_code,a.actual_duration_hours,a.actual_start,a.actual_end,
      coalesce(a.actual_date,a.scheduled_date) event_date
    from public.indicator_events e join public.cfdh_actions a on a.id=e.source_id
    where e.source_type='cfdh_program' and e.youth_id is null and a.workshop_plan_lesson_id=p_lesson
      and e.indicator_code in ('M6.2_PVIDA_HORAS','M6.1_OFICINAS_HORAS','M4.6_CURSO_HORAS','M6.4_CURSO_HORAS')
  ), intervals as (
    select indicator_code,tsrange(event_date+actual_start,
      least(event_date+actual_end,event_date+actual_start+make_interval(secs=>(actual_duration_hours*3600)::double precision)),'[)') period
    from hour_events where event_date is not null and actual_start is not null and actual_end>actual_start and actual_duration_hours>0
  ), merged as (
    select indicator_code,unnest(range_agg(period)) period from intervals group by indicator_code
  ), totals as (
    select indicator_code,sum(extract(epoch from upper(period)-lower(period))/3600) hours from merged group by indicator_code
  ), fallback as (
    select indicator_code,max(actual_duration_hours) hours from hour_events
    where actual_start is null or actual_end is null or actual_end<=actual_start or event_date is null group by indicator_code
  ), representative as (
    select indicator_code,(array_agg(id order by id))[1] id from hour_events group by indicator_code
  )
  update public.indicator_events e set quantity=greatest(coalesce(t.hours,0),coalesce(f.hours,0))
  from representative r left join totals t on t.indicator_code=r.indicator_code
    left join fallback f on f.indicator_code=r.indicator_code
  where e.id=r.id and greatest(coalesce(t.hours,0),coalesce(f.hours,0))>0;
  with duplicates as (
    select e.id,row_number() over(partition by e.indicator_code,e.youth_id
      order by case when e.youth_id is null and e.indicator_code in ('M6.2_PVIDA_HORAS','M6.1_OFICINAS_HORAS','M4.6_CURSO_HORAS','M6.4_CURSO_HORAS') then e.id end,
               a.action_number,a.id,e.id) n
    from public.indicator_events e join public.cfdh_actions a on a.id=e.source_id
    where e.source_type='cfdh_program' and a.workshop_plan_lesson_id=p_lesson
  ) delete from public.indicator_events e using duplicates d where e.id=d.id and d.n>1;
end $fn$;
create or replace function app_private.cfdh_class_program_from_action()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
  if tg_op<>'DELETE' then perform app_private.cfdh_class_reconcile_program(new.workshop_plan_lesson_id); end if;
  if tg_op<>'INSERT' and (tg_op='DELETE' or old.workshop_plan_lesson_id is distinct from new.workshop_plan_lesson_id) then
    perform app_private.cfdh_class_reconcile_program(old.workshop_plan_lesson_id);
  end if;
  return case when tg_op='DELETE' then old else new end;
end $fn$;
drop trigger if exists z_cfdh_class_program_from_action on public.cfdh_actions;
create trigger z_cfdh_class_program_from_action after insert or update or delete on public.cfdh_actions
for each row execute function app_private.cfdh_class_program_from_action();
create or replace function app_private.cfdh_class_program_from_presence()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare lesson uuid;
begin
  select a.workshop_plan_lesson_id into lesson from public.cfdh_actions a where a.id=case when tg_op='DELETE' then old.action_id else new.action_id end;
  perform app_private.cfdh_class_reconcile_program(lesson);
  return case when tg_op='DELETE' then old else new end;
end $fn$;
drop trigger if exists z_cfdh_class_program_from_presence on public.cfdh_attendance;
create trigger z_cfdh_class_program_from_presence after insert or update or delete on public.cfdh_attendance
for each row execute function app_private.cfdh_class_program_from_presence();

-- Lista nominal limitada às permissões de leitura existentes (sem CPF ou assinatura).
create or replace function public.staff_cfdh_class_roster(p_plan_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $fn$
  with names as (
    select y.id::text person_id,coalesce(nullif(y.preferred_name,''),y.full_name) display_name,'jovem'::text kind
    from public.cfdh_enrollments e join public.young_people y on y.id=e.youth_id
    where e.plan_id=p_plan_id and e.status='ativo'
    union
    select y.id::text,coalesce(nullif(y.preferred_name,''),y.full_name),'jovem'
    from public.cfdh_attendance ca join public.young_people y on y.id=ca.youth_id
    where ca.plan_id=p_plan_id and ca.present
    union
    select g.provisional_person_id::text,p.full_name,'visitante'
    from public.cfdh_actions a join public.workshop_sessions s on s.plan_lesson_id=a.workshop_plan_lesson_id
    join public.workshop_guest_participations g on g.session_id=s.id
    join public.provisional_people p on p.id=g.provisional_person_id
    where a.plan_id=p_plan_id and a.planning_status='complete' and a.execution_status<>'cancelada'
  ), presence as (
    select ca.youth_id::text person_id,'jovem'::text kind,ca.action_id
    from public.cfdh_attendance ca where ca.plan_id=p_plan_id and ca.present
    union
    select g.provisional_person_id::text,'visitante',a.id
    from public.cfdh_actions a join public.workshop_sessions s on s.plan_lesson_id=a.workshop_plan_lesson_id
    join public.workshop_guest_participations g on g.session_id=s.id
    where a.plan_id=p_plan_id and a.planning_status='complete' and a.execution_status<>'cancelada'
  )
  select coalesce(jsonb_agg(jsonb_build_object('person_id',n.person_id,'display_name',n.display_name,'kind',n.kind,
    'action_ids',coalesce((select jsonb_agg(distinct pr.action_id) from presence pr where pr.person_id=n.person_id and pr.kind=n.kind),'[]'::jsonb)) order by n.display_name),'[]'::jsonb)
  from names n
$fn$;
revoke all on function public.staff_cfdh_class_roster(uuid) from public,anon;
grant execute on function public.staff_cfdh_class_roster(uuid) to authenticated;

-- A evidência da ação mostra também visitantes e assinaturas da aula compartilhada.
create or replace function app_private.staff_cfdh_attendance_sheet(p_action_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare a public.cfdh_actions%rowtype; p public.educator_plans%rowtype; w public.workshops%rowtype; rows jsonb;
begin
  if auth.uid() is null or not app_private.is_active_staff()
     or not app_private.has_any_role(array['coordenacao_geral','educador','assistente_social','psicologo','terapeuta_ocupacional','monitoramento'])
  then raise exception 'Acesso não autorizado.'; end if;
  select * into a from public.cfdh_actions where id=p_action_id;
  if not found then raise exception 'Ação CFDH não encontrada.'; end if;
  select * into p from public.educator_plans where id=a.plan_id;
  select * into w from public.workshops where id=a.workshop_id;
  select coalesce(jsonb_agg(x.obj order by x.sort_name),'[]'::jsonb) into rows from (
    select coalesce(nullif(y.preferred_name,''),y.full_name) sort_name,
      jsonb_build_object('record_id',att.id,'person_id',y.id,'record_kind','youth',
       'display_name',coalesce(nullif(y.preferred_name,''),y.full_name),'full_name',y.full_name,
       'birth_date',y.birth_date,'cpf',y.cpf,'phone',y.phone,'email',y.email,'neighborhood',y.neighborhood,
       'initial_form_status',y.initial_form_status,
       'signature_data',coalesce(cs.signature_data,ws.signature_data,ys.signature_data)) obj
    from public.cfdh_attendance att join public.young_people y on y.id=att.youth_id
    left join public.cfdh_enrollments e on e.plan_id=a.plan_id and e.youth_id=y.id and e.status='ativo'
    left join app_private.cfdh_enrollment_secrets cs on cs.enrollment_id=e.id
    left join public.workshop_enrollments we on we.workshop_id=a.workshop_id and we.youth_id=y.id and we.status='ativo'
    left join app_private.workshop_enrollment_secrets ws on ws.enrollment_id=we.id
    left join app_private.youth_signatures ys on ys.youth_id=y.id
    where att.action_id=a.id and att.present
    union all
    select pp.full_name,jsonb_build_object('record_id',g.id,'person_id',pp.id,'record_kind','visitor',
      'display_name',pp.full_name,'full_name',pp.full_name,'birth_date',pp.birth_date,'cpf',pp.cpf,
      'phone',pp.phone,'email',pp.email,'neighborhood',pp.neighborhood,'initial_form_status','visitante',
      'signature_data',gs.signature_data)
    from public.workshop_sessions s join public.workshop_guest_participations g on g.session_id=s.id
    join public.provisional_people pp on pp.id=g.provisional_person_id
    left join app_private.workshop_guest_signatures gs on gs.participation_id=g.id
    where s.plan_lesson_id=a.workshop_plan_lesson_id and a.planning_status='complete' and a.execution_status<>'cancelada'
  ) x;
  return jsonb_build_object('action_id',a.id,'plan_id',a.plan_id,
    'activity','CFDH · '||coalesce(p.activity_title,'Circuito Formativo em Direitos Humanos'),
    'action_title',a.title,'workshop_name',w.name,
    'location',case when a.location_type='Externa' then 'Externa'||case when nullif(a.location_other,'') is not null then ' - '||a.location_other else '' end
      when a.location_type='Outro' then coalesce(nullif(a.location_other,''),'Outro') else coalesce(nullif(a.location_type,''),'CRJ Cariacica') end,
    'date',coalesce(a.actual_date,a.scheduled_date),'start_time',coalesce(a.actual_start,a.start_time),'end_time',coalesce(a.actual_end,a.end_time),
    'participant_count',jsonb_array_length(rows),'participants',rows);
end $fn$;

-- Apenas os gatilhos internos podem recalcular presença e indicadores.
revoke all on function app_private.cfdh_class_sync_presence(uuid) from public,anon,authenticated;
revoke all on function app_private.cfdh_class_sync_guests(uuid) from public,anon,authenticated;
revoke all on function app_private.cfdh_class_lesson_hours(uuid) from public,anon,authenticated;
revoke all on function app_private.cfdh_class_reconcile_program(uuid) from public,anon,authenticated;
revoke all on function app_private.cfdh_class_own_presence() from public,anon,authenticated;
revoke all on function app_private.cfdh_class_attendance_indicator() from public,anon,authenticated;
revoke all on function app_private.cfdh_class_workshop_attendance_changed() from public,anon,authenticated;
revoke all on function app_private.cfdh_class_guest_changed() from public,anon,authenticated;
revoke all on function app_private.cfdh_class_action_changed() from public,anon,authenticated;
revoke all on function app_private.cfdh_class_session_changed() from public,anon,authenticated;
revoke all on function app_private.cfdh_class_program_from_action() from public,anon,authenticated;
revoke all on function app_private.cfdh_class_program_from_presence() from public,anon,authenticated;

-- Preenche vínculos anteriores já existentes, sem criar novas presenças de oficina.
do $backfill$
declare x record;
begin
  for x in select a.id from public.cfdh_actions a
    where a.planning_status='complete' and a.execution_status<>'cancelada'
      and exists(select 1 from public.workshop_sessions s join public.attendance atd on atd.session_id=s.id
                 where s.plan_lesson_id=a.workshop_plan_lesson_id and atd.present)
  loop perform app_private.cfdh_class_sync_presence(x.id); end loop;
  for x in select a.id from public.cfdh_actions a where a.execution_status in ('realizada','parcial')
    and a.workshop_plan_lesson_id is not null and a.program_metric_links @> '[{"program":"oficina"}]'::jsonb
    and exists(select 1 from public.workshop_sessions s where s.plan_lesson_id=a.workshop_plan_lesson_id)
  loop perform app_private.sync_cfdh_program_indicators(x.id); end loop;
  for x in select distinct a.workshop_plan_lesson_id from public.cfdh_actions a
    where a.workshop_plan_lesson_id is not null and a.execution_status in ('realizada','parcial')
  loop perform app_private.cfdh_class_reconcile_program(x.workshop_plan_lesson_id); end loop;
  for x in select distinct a.workshop_plan_lesson_id from public.cfdh_actions a
    where a.workshop_plan_lesson_id is not null and a.planning_status='complete' and a.execution_status<>'cancelada'
      and exists(select 1 from public.workshop_sessions s join public.workshop_guest_participations g on g.session_id=s.id where s.plan_lesson_id=a.workshop_plan_lesson_id)
  loop perform app_private.cfdh_class_sync_guests(x.workshop_plan_lesson_id); end loop;
  for x in select distinct a.workshop_plan_lesson_id from public.cfdh_actions a
    where a.workshop_plan_lesson_id is not null and a.execution_status in ('realizada','parcial')
      and coalesce(a.actual_duration_hours,0)>=2
  loop perform app_private.cfdh_class_lesson_hours(x.workshop_plan_lesson_id); end loop;
  insert into public.indicator_events(indicator_code,youth_id,event_date,quantity,source_type,source_id,source_mode)
  select 'M6.1_CFDH_HORAS',null,coalesce(a.actual_date,a.scheduled_date),a.actual_duration_hours,'cfdh_action_hours',a.id,'identified'
  from public.cfdh_actions a where a.workshop_plan_lesson_id is null and a.execution_status in ('realizada','parcial')
    and coalesce(a.actual_duration_hours,0)>=2 and coalesce(a.actual_date,a.scheduled_date) is not null
    and not exists(select 1 from public.indicator_events e where e.indicator_code='M6.1_CFDH_HORAS' and e.source_type='cfdh_action_hours' and e.source_id=a.id);
  for x in select * from public.cfdh_attendance where independent_cfdh_presence loop
    update public.cfdh_attendance set present=x.present where id=x.id;
  end loop;
end $backfill$;
