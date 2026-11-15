-- CRJ Trajetórias: métricas do oficineiro, somente leitura, com controle por vínculo da oficina.
-- SECURITY INVOKER (padrão) respeita o RLS dos dados dos jovens.
CREATE OR REPLACE FUNCTION public.instructor_performance_summary(p_month date DEFAULT (date_trunc('month'::text, (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::date, p_workshop_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_start date;
  v_end date;
  v_first date;
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Sessão autenticada obrigatória' using errcode='42501';
  end if;
  select role::text into v_role from public.profiles
  where id=v_user and active is true;
  if v_role is distinct from 'oficineiro' then
    raise exception 'Este painel é exclusivo de oficineiros ativos' using errcode='42501';
  end if;
  if p_month is null then raise exception 'Selecione um mês válido'; end if;
  v_start := date_trunc('month',p_month)::date;
  if p_month <> v_start
      or v_start > date_trunc('month',(now() at time zone 'America/Sao_Paulo'))::date
      or v_start < date '2020-01-01' then
    raise exception 'Mês de referência inválido ou futuro';
  end if;
  v_end := (v_start + interval '1 month')::date;
  v_first := (v_start - interval '5 months')::date;

  if p_workshop_id is not null and not exists(
    select 1 from public.workshops w where w.id=p_workshop_id and w.oficineiro_user_id=v_user
  ) then
    raise exception 'Oficina não vinculada à sua conta' using errcode='42501';
  end if;

  with
  own_workshops as (
    select w.id,w.name from public.workshops w
    where w.oficineiro_user_id=v_user and (p_workshop_id is null or w.id=p_workshop_id)
  ),
  periods as (
    select generate_series(v_first::timestamp,v_start::timestamp,interval '1 month')::date as month
  ),
  verified_sessions as (
    select s.id, s.workshop_id,s.session_date,
           date_trunc('month',s.session_date)::date as month
    from public.workshop_sessions s
    join own_workshops w on w.id=s.workshop_id
    where s.session_date >= v_first
      and s.session_date < v_end
      and s.session_date <= (now() at time zone 'America/Sao_Paulo')::date
      and not exists (
        select 1 from public.workshop_calendar c
        where (c.id=s.calendar_entry_id or c.session_id=s.id)
        and (
          c.status in ('cancelada','cancelado','excluida','excluido','nao_realizada','nao_realizado')
          or (coalesce(c.monthly_cancelled,false) and not coalesce(c.manually_reopened,false))
        )
      )
      and (
        exists(select 1 from public.attendance a where a.session_id=s.id)
        or exists(select 1 from public.workshop_created_attendance_lists l where l.lesson_id=s.plan_lesson_id)
        or exists(select 1 from public.workshop_calendar c where (c.id=s.calendar_entry_id or c.session_id=s.id) and c.status='realizada')
      )
  ),
  presences as (
    select distinct a.session_id, a.youth_id, s.workshop_id, s.month
    from public.attendance a join verified_sessions s on s.id=a.session_id
    where a.present=true and a.youth_id is not null
  ),
  guest_visits as (
    select distinct g.id,s.id as session_id,s.workshop_id,s.month,g.provisional_person_id
    from public.workshop_guest_participations g
    join verified_sessions s on s.id=g.session_id
  ),
  members as (
    select distinct on (e.workshop_id,e.youth_id)
           e.workshop_id,e.youth_id,e.enrolled_at::date as enrolled_on,
           e.ended_at::date as ended_on,
           coalesce(nullif(y.preferred_name,''),nullif(y.full_name,''),'Jovem') as youth_name,
           nullif(trim(y.phone),'') as phone
    from public.workshop_enrollments e
    join own_workshops w on w.id=e.workshop_id
    join public.young_people y on y.id=e.youth_id and y.status <> 'excluido'
    where e.enrolled_at::date < v_end
      and (e.ended_at is null or e.ended_at::date>=v_first)
      and e.status not in ('cancelado','excluido')
    order by e.workshop_id,e.youth_id,e.enrolled_at desc
  ),
  expected as (
    select s.id as session_id, s.workshop_id, s.month,s.session_date,m.youth_id
    from verified_sessions s
    join members m on m.workshop_id=s.workshop_id
      and s.session_date >= m.enrolled_on
      and (m.ended_on is null or s.session_date <= m.ended_on)
  ),
  month_totals as (
    select p.month,
      (select count(*) from verified_sessions s where s.month=p.month)::int as sessions,
      (select count(*) from presences a where a.month=p.month)::int as registered_participations,
      (select count(*) from guest_visits g where g.month=p.month)::int as guest_participations,
      (select count(distinct a.youth_id) from presences a where a.month=p.month)::int as unique_registered,
      (select count(*) from expected x where x.month=p.month)::int as possible_attendances,
      (select count(*) from expected x join presences a on a.session_id=x.session_id and a.youth_id=x.youth_id where x.month=p.month)::int as attended_opportunities
    from periods p
  ),
  enriched_months as (
    select t.*,
      (t.registered_participations+t.guest_participations)::int as total_participations,
      case when t.possible_attendances=0 then null
        else round(100.0*t.attended_opportunities/t.possible_attendances,1)
      end as attendance_rate
    from month_totals t
  ),
  current_members as (
    select m.*
    from members m where m.enrolled_on < v_end and (m.ended_on is null or m.ended_on >= v_start)
  ),
  youth_performance as (
    select m.workshop_id,m.youth_id,m.youth_name,m.phone,
       (select count(*) from expected x where x.workshop_id=m.workshop_id and x.youth_id=m.youth_id and x.month=v_start)::int as possible,
       (select count(*) from expected x
          join presences a on a.session_id=x.session_id and a.youth_id=x.youth_id
          where x.workshop_id=m.workshop_id and x.youth_id=m.youth_id and x.month=v_start)::int as attended,
       (select max(s.session_date) from presences a
          join verified_sessions s on s.id=a.session_id
          where a.workshop_id=m.workshop_id and a.youth_id=m.youth_id and a.month<=v_start)::date as last_seen,
       (select count(*) from (
          select x.session_id from expected x
          where x.workshop_id=m.workshop_id and x.youth_id=m.youth_id and x.month=v_start
          order by x.session_date desc,x.session_id desc limit 3
        ) recent where not exists (
            select 1 from presences a
            where a.session_id=recent.session_id and a.youth_id=m.youth_id
        ))::int as missed_last_3
    from current_members m
  )
  select jsonb_build_object(
   'month',to_char(v_start,'YYYY-MM'),
   'scope',case when p_workshop_id is null then 'all' else 'workshop' end,
   'workshops',coalesce((
      select jsonb_agg(jsonb_build_object('id',w.id,'name',w.name) order by w.name)
      from own_workshops w
    ),'[]'::jsonb),
   'months',coalesce((
      select jsonb_agg(jsonb_build_object(
        'month',to_char(m.month,'YYYY-MM'),'sessions',m.sessions,
        'participations',m.total_participations,'registered_participations',m.registered_participations,
        'guest_participations',m.guest_participations,'unique_registered',m.unique_registered,
        'possible',m.possible_attendances,'attended',m.attended_opportunities,
        'attendance_rate',m.attendance_rate
      ) order by m.month) from enriched_months m
    ),'[]'::jsonb),
   'enrolled_youth', (select count(*) from current_members),
   'students',coalesce((
      select jsonb_agg(jsonb_build_object(
       'workshop_id',y.workshop_id,'youth_id',y.youth_id,
       'name',y.youth_name,'phone',y.phone,
       'possible',y.possible,'attended',y.attended,
       'missing',greatest(0,y.possible-y.attended),'missed_last_3',y.missed_last_3,
       'attendance_rate',case when y.possible=0 then null else round(100.0*y.attended/y.possible,1) end,
       'last_seen',y.last_seen,
       'attention',case when y.possible=0 then 'sem_base' when y.missed_last_3>=2 then 'contatar' when y.missed_last_3>=1 then 'acompanhar' else 'frequente' end
      ) order by y.attended desc,y.youth_name) from youth_performance y
    ),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$function$
;
revoke all on function public.instructor_performance_summary(date,uuid) from public,anon;
grant execute on function public.instructor_performance_summary(date,uuid) to authenticated;
comment on function public.instructor_performance_summary(date,uuid) is 'Desempenho de oficinas do oficineiro autenticado, com contatos restritos aos jovens matriculados em suas turmas.';
