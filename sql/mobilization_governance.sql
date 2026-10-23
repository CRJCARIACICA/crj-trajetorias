-- Monthly mobilization: proposals -> coordination -> operational plan -> execution.
-- All writes use an authenticated command with explicit role and revision checks.
create table public.articulation_mobilization_strategies (
  id uuid primary key default gen_random_uuid(), reference_month date not null check(extract(day from reference_month)=1),
  source_plan_id uuid references public.articulation_mobilization_plans(id), source_strategy text,
  source_updated_at timestamptz, source_changed boolean not null default false,
  title text not null, action_type text not null default 'Mobilização', channel text not null,
  territory text, location text, objective text, request_ids uuid[] not null default '{}',
  reference_user_id uuid references public.profiles(id), collaborator_ids uuid[] not null default '{}',
  proposed_date date, start_time time, end_time time, deadline date,
  preparation_steps text, execution_steps text, resources text, documents_before text, documents_after text,
  review_status text not null default 'submitted' check(review_status in ('draft','submitted','approved','changes_requested','rejected')),
  review_notes text, reviewed_by uuid references public.profiles(id), reviewed_at timestamptz,
  created_by uuid not null references public.profiles(id), updated_by uuid references public.profiles(id),
  revision integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(source_plan_id,source_strategy), check((start_time is null and end_time is null) or end_time>start_time)
);
create table public.articulation_monthly_mobilization_plans (
  id uuid primary key default gen_random_uuid(), reference_month date not null unique check(extract(day from reference_month)=1),
  title text not null, objective text, coverage_notes text, status text not null default 'draft' check(status in ('draft','published')),
  revision integer not null default 1, published_at timestamptz, created_by uuid not null references public.profiles(id), updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.articulation_mobilization_actions (
  id uuid primary key default gen_random_uuid(), monthly_plan_id uuid not null references public.articulation_monthly_mobilization_plans(id),
  title text not null, action_type text not null, channel text not null, territory text, location text,
  scheduled_date date not null, start_time time not null, end_time time not null check(end_time>start_time),
  reference_user_id uuid not null references public.profiles(id), collaborator_ids uuid[] not null default '{}',
  strategy_ids uuid[] not null default '{}', request_ids uuid[] not null default '{}', objective text,
  preparation_steps text, execution_steps text, resources text, documents_before text, documents_after text,
  preparation_deadline date, notes text, cancelled boolean not null default false, cancellation_reason text, revision integer not null default 1,
  created_by uuid not null references public.profiles(id), updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.articulation_mobilization_executions (
  id uuid primary key default gen_random_uuid(), action_id uuid not null references public.articulation_mobilization_actions(id),
  user_id uuid not null references public.profiles(id), completed boolean not null default false, completed_at timestamptz,
  action_name text, executed_date date, location text, mobilization_type text, positives text, negatives text, observations text,
  report_status text not null default 'draft' check(report_status in ('draft','finalized')), revision integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(action_id,user_id)
);
create table public.articulation_mobilization_plan_versions (
  id uuid primary key default gen_random_uuid(), monthly_plan_id uuid not null references public.articulation_monthly_mobilization_plans(id),
  plan_revision integer not null, published boolean not null, snapshot jsonb not null,
  submission_id uuid references public.methodology_form_submissions(id), created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  unique(monthly_plan_id,plan_revision,published)
);
alter table public.articulation_demand_actions add column mobilization_action_id uuid unique references public.articulation_mobilization_actions(id);
create table public.articulation_mobilization_interests (
  id uuid primary key default gen_random_uuid(), action_id uuid not null references public.articulation_mobilization_actions(id),
  demand_record_id uuid not null unique references public.articulation_demand_records(id), young_person_id uuid not null references public.young_people(id),
  contact_status text not null default 'pending' check(contact_status in ('pending','contacted','interested','enrolled','unreachable','declined')),
  followup_date date, followup_notes text, followed_by uuid references public.profiles(id), revision integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(action_id,young_person_id)
);
create index on public.articulation_mobilization_strategies(reference_month,review_status);
create index on public.articulation_mobilization_actions(monthly_plan_id,scheduled_date);
create index on public.articulation_mobilization_executions(user_id,action_id);
create index on public.articulation_mobilization_plan_versions(monthly_plan_id,created_at desc);
create index on public.articulation_mobilization_interests(action_id,contact_status,followup_date);
create index on public.articulation_mobilization_interests(young_person_id);

alter table public.articulation_mobilization_strategies enable row level security;
alter table public.articulation_monthly_mobilization_plans enable row level security;
alter table public.articulation_mobilization_actions enable row level security;
alter table public.articulation_mobilization_executions enable row level security;
alter table public.articulation_mobilization_plan_versions enable row level security;
alter table public.articulation_mobilization_interests enable row level security;
revoke all on public.articulation_mobilization_strategies,public.articulation_monthly_mobilization_plans,public.articulation_mobilization_actions,public.articulation_mobilization_executions,public.articulation_mobilization_plan_versions,public.articulation_mobilization_interests from anon,authenticated;
grant select on public.articulation_mobilization_strategies,public.articulation_monthly_mobilization_plans,public.articulation_mobilization_actions,public.articulation_mobilization_executions,public.articulation_mobilization_plan_versions,public.articulation_mobilization_interests to authenticated;
create policy mobilization_strategies_read on public.articulation_mobilization_strategies for select to authenticated using(app_private.is_articulation_role());
create policy mobilization_monthly_read on public.articulation_monthly_mobilization_plans for select to authenticated using(app_private.is_active_staff() and (status='published' or app_private.has_any_role(array['coordenacao_geral','coordenacao_articulacao'])));
create policy mobilization_actions_read on public.articulation_mobilization_actions for select to authenticated using(exists(select 1 from public.articulation_monthly_mobilization_plans p where p.id=monthly_plan_id));
create policy mobilization_execution_read on public.articulation_mobilization_executions for select to authenticated using(app_private.is_active_staff() and (user_id=auth.uid() or app_private.is_articulation_role() or exists(select 1 from public.articulation_mobilization_actions a where a.id=action_id and (a.reference_user_id=auth.uid() or auth.uid()=any(a.collaborator_ids)))));
create policy mobilization_versions_read on public.articulation_mobilization_plan_versions for select to authenticated using(app_private.is_active_staff() and (published or app_private.has_any_role(array['coordenacao_geral','coordenacao_articulacao'])));
create policy mobilization_interests_read on public.articulation_mobilization_interests for select to authenticated using(app_private.is_articulation_role());

create or replace function app_private.mobilization_uuid_array(j jsonb) returns uuid[] language sql immutable set search_path='' as $$
  select coalesce(array_agg(distinct x::uuid),'{}'::uuid[]) from jsonb_array_elements_text(case when jsonb_typeof(j)='array' then j else '[]'::jsonb end) t(x)
$$;

create or replace function app_private.validate_mobilization_slot(a public.articulation_mobilization_actions) returns void language plpgsql set search_path='' as $$
declare ids uuid[]:=array_append(a.collaborator_ids,a.reference_user_id); day public.crj_calendar_special_days%rowtype;
begin
  if extract(isodow from a.scheduled_date)>5 or a.start_time<'10:00' or a.end_time>'21:00' or a.end_time<=a.start_time then raise exception 'A mobilização deve ocorrer de segunda a sexta-feira, entre 10h e 21h.';end if;
  if extract(isodow from a.scheduled_date)=1 and a.start_time<'16:30' and a.end_time>'13:00' then raise exception 'Conflito com a reunião geral de segunda-feira, 13h às 16h30.';end if;
  select * into day from public.crj_calendar_special_days where calendar_date=a.scheduled_date;
  if found and (day.closure_policy='auto_closed' or day.approval_status='closed' or (day.closure_policy='approval_required' and day.approval_status<>'open')) then raise exception '%: o CRJ está fechado ou aguarda autorização de abertura.',day.name;end if;
  if exists(select 1 from public.articulation_mobilization_actions x join public.articulation_monthly_mobilization_plans p on p.id=x.monthly_plan_id where not x.cancelled and x.id<>a.id and (x.monthly_plan_id=a.monthly_plan_id or p.status='published') and x.scheduled_date=a.scheduled_date and x.start_time<a.end_time and x.end_time>a.start_time and array_append(x.collaborator_ids,x.reference_user_id)&&ids) then raise exception 'Um colaborador já está em outra mobilização neste horário.';end if;
  if exists(select 1 from public.workshop_calendar w join public.workshops p on p.id=w.workshop_id where w.scheduled_date=a.scheduled_date and w.status<>'cancelada' and not coalesce(w.monthly_cancelled,false) and w.start_time<a.end_time and w.end_time>a.start_time and (p.educator_user_id=any(ids) or p.oficineiro_user_id=any(ids))) then raise exception 'Educador ou oficineiro possui aula neste horário. Ajuste a equipe ou o horário.';end if;
  if exists(select 1 from public.calendar_events e where (e.starts_at at time zone 'America/Sao_Paulo')::date=a.scheduled_date and e.status<>'cancelled' and (e.starts_at at time zone 'America/Sao_Paulo')::time<a.end_time and (e.ends_at at time zone 'America/Sao_Paulo')::time>a.start_time and (e.organizer_user_id=any(ids) or e.assignee_user_id=any(ids) or exists(select 1 from public.calendar_event_technicians t where t.event_id=e.id and t.technician_user_id=any(ids)))) then raise exception 'Um colaborador possui compromisso na agenda neste horário.';end if;
  if exists(select 1 from public.cfdh_actions c join public.cfdh_action_responsibles r on r.action_id=c.id where c.scheduled_date=a.scheduled_date and c.execution_status<>'cancelada' and c.start_time<a.end_time and c.end_time>a.start_time and r.user_id=any(ids)) then raise exception 'Um colaborador possui ação CFDH neste horário.';end if;
end $$;

create or replace function app_private.mobilization_snapshot(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.articulation_monthly_mobilization_plans%rowtype; vid uuid; sid uuid; payload jsonb;
begin
  if auth.uid() is null or not app_private.has_any_role(array['coordenacao_geral','coordenacao_articulacao']) then raise exception 'Somente a coordenação pode gerar evidência.' using errcode='42501';end if;
  select * into strict p from public.articulation_monthly_mobilization_plans where id=p_id;
  select id into vid from public.articulation_mobilization_plan_versions where monthly_plan_id=p_id and plan_revision=p.revision and published=(p.status='published');
  if vid is not null then return vid;end if;
  payload:=to_jsonb(p)||jsonb_build_object('coordinator_name',(select display_name from public.profiles where id=auth.uid()),'actions',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('reference_name',(select display_name from public.profiles where id=a.reference_user_id),'collaborator_names',(select jsonb_agg(display_name order by display_name) from public.profiles where id=any(a.collaborator_ids)),'requested_actions',(select jsonb_agg(source_title order by source_title) from public.articulation_mobilization_requests where id=any(a.request_ids))) order by a.scheduled_date,a.start_time) from public.articulation_mobilization_actions a where a.monthly_plan_id=p_id and not a.cancelled),'[]'::jsonb));
  insert into public.articulation_mobilization_plan_versions(monthly_plan_id,plan_revision,published,snapshot,created_by) values(p_id,p.revision,p.status='published',payload,auth.uid()) returning id into vid;
  insert into public.methodology_form_submissions(form_slug,payload,sensitivity,created_by,record_state,source_type,source_id) values('plano-geral-mobilizacao',payload,'team',auth.uid(),case when p.status='published' then 'complete' else 'draft' end,'articulation_mobilization_plan_versions',vid) returning id into sid;
  update public.articulation_mobilization_plan_versions set submission_id=sid where id=vid;
  return vid;
end $$;

create or replace function app_private.capture_mobilization_interest() returns trigger language plpgsql security definer set search_path='' as $$
declare aid uuid;
begin
  select mobilization_action_id into aid from public.articulation_demand_actions where id=new.demand_action_id;
  if aid is not null and new.young_person_id is not null then
    insert into public.articulation_mobilization_interests(action_id,demand_record_id,young_person_id) values(aid,new.id,new.young_person_id) on conflict(action_id,young_person_id) do nothing;
  end if;
  return new;
end $$;
create trigger capture_mobilization_interest after insert or update of young_person_id,demand_action_id on public.articulation_demand_records for each row execute function app_private.capture_mobilization_interest();

create or replace function app_private.mark_mobilization_proposal_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if (to_jsonb(new)-array['updated_at','status','actual_reach','actual_participants','positives','difficulties','youth_expectations','execution_notes','completed_at','record_state','incomplete_fields']) is distinct from (to_jsonb(old)-array['updated_at','status','actual_reach','actual_participants','positives','difficulties','youth_expectations','execution_notes','completed_at','record_state','incomplete_fields']) then
    update public.articulation_mobilization_strategies set source_changed=true,updated_at=now(),revision=revision+1 where source_plan_id=new.id;
    update public.articulation_monthly_mobilization_plans mp set status='draft',updated_at=now(),revision=revision+1 where exists(select 1 from public.articulation_mobilization_actions a join public.articulation_mobilization_strategies st on st.id=any(a.strategy_ids) where a.monthly_plan_id=mp.id and not a.cancelled and st.source_plan_id=new.id);
  end if;
  return new;
end $$;
revoke all on function app_private.mark_mobilization_proposal_changed() from public,anon,authenticated;
create trigger mark_mobilization_proposal_changed after update on public.articulation_mobilization_plans for each row execute function app_private.mark_mobilization_proposal_changed();

create or replace function app_private.mobilization_command(cmd text, p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); coord boolean; s public.articulation_mobilization_strategies%rowtype; m public.articulation_monthly_mobilization_plans%rowtype;
  a public.articulation_mobilization_actions%rowtype; e public.articulation_mobilization_executions%rowtype; v public.articulation_mobilization_plan_versions%rowtype;
  sid uuid; eid uuid; rid uuid; uid uuid; did uuid; result jsonb; item jsonb; oldjson jsonb; mon date; imported integer:=0; strategy text; row record; missing integer;
begin
  if actor is null or not app_private.is_active_staff() then raise exception 'Sessão inválida ou colaborador inativo.' using errcode='42501';end if;
  coord:=app_private.has_any_role(array['coordenacao_geral','coordenacao_articulacao']);
  if cmd in ('save_month','save_action','generate_actions','publish','evidence','review','import','cancel_action') and not coord then raise exception 'Esta operação é exclusiva da coordenação.' using errcode='42501';end if;
  if cmd in ('save_strategy','register_interest','followup') and not app_private.is_articulation_role() then raise exception 'Operação exclusiva da Articulação.' using errcode='42501';end if;

  if cmd='import' then
    mon:=date_trunc('month',(p->>'month')::date)::date;
    for row in select pl.*,r.source_title,r.source_type,r.planned_date,r.target_audience req_audience from public.articulation_mobilization_plans pl join public.articulation_mobilization_requests r on r.id=pl.request_id where pl.status<>'cancelado' and (date_trunc('month',r.planned_date)::date=mon or date_trunc('month',pl.mobilization_deadline)::date=mon) loop
      foreach strategy in array row.strategies loop
        insert into public.articulation_mobilization_strategies(reference_month,source_plan_id,source_strategy,source_updated_at,title,action_type,channel,territory,location,objective,request_ids,reference_user_id,deadline,preparation_steps,execution_steps,resources,documents_before,documents_after,review_status,created_by,updated_by)
        values(mon,row.id,strategy,row.updated_at,row.source_title||' · '||strategy,row.source_type,case when strategy ilike '%whats%' then 'WhatsApp' when strategy ilike '%escola%' or strategy ilike '%educação%' then 'Escola' when strategy ilike '%redes sociais%' then 'Redes sociais' when strategy ilike '%rua%' then 'Mobilização de rua' when strategy ilike '%busca%' then 'Busca ativa' when strategy ilike '%CRJ%' then 'CRJ' else 'Parceiro / rede' end,array_to_string(row.territories,', '),row.places,row.mobilization_goal,array[row.request_id],row.articulator_user_id,least(row.mobilization_deadline,row.planned_date),row.schedule_text,row.main_message,row.materials,'Preparar divulgação e formulário de interesse.','Relatório de mobilização e respostas de interesse.','submitted',row.articulator_user_id,actor)
        on conflict(source_plan_id,source_strategy) do update set source_changed=true where articulation_mobilization_strategies.source_updated_at<excluded.source_updated_at;
        imported:=imported+1;
      end loop;
    end loop;
    return jsonb_build_object('ok',true,'imported',imported);
  elsif cmd in ('save_strategy','review') then
    if p->>'id' is not null then select * into strict s from public.articulation_mobilization_strategies where id=(p->>'id')::uuid for update;end if;
    if s.id is not null and s.revision is distinct from (p->>'expected_revision')::integer then raise exception 'Outra pessoa alterou esta estratégia. Consulte as novidades antes de salvar.' using errcode='40001';end if;
    if cmd='review' then
      if s.id is null then raise exception 'Estratégia não encontrada.';end if;
      if p->>'review_status' not in ('approved','rejected','changes_requested') then raise exception 'Decisão inválida.';end if;
      if p->>'review_status'<>'approved' and nullif(btrim(p->>'review_notes'),'') is null then raise exception 'Informe a devolutiva para recusar ou solicitar ajustes.';end if;
      update public.articulation_mobilization_strategies set review_status=p->>'review_status',review_notes=nullif(btrim(p->>'review_notes'),''),reviewed_by=actor,reviewed_at=now(),revision=revision+1,updated_at=now(),updated_by=actor where id=s.id returning * into s;
    else
      if not coord and s.id is not null and s.created_by<>actor then raise exception 'Você só pode editar suas próprias propostas.' using errcode='42501';end if;
      oldjson:=case when s.id is not null then to_jsonb(s) else '{}'::jsonb end;
      s:=jsonb_populate_record(s,p - array['id','created_by','updated_by','review_status','review_notes','reviewed_by','reviewed_at','revision','created_at','updated_at','source_plan_id','source_strategy','source_updated_at','source_changed']);
      if nullif(btrim(s.title),'') is null or nullif(btrim(s.channel),'') is null then raise exception 'Informe o título e o meio de comunicação.';end if;
      s.reference_month:=date_trunc('month',s.reference_month)::date;
      s.request_ids:=coalesce(s.request_ids,'{}');s.collaborator_ids:=coalesce(s.collaborator_ids,'{}');
      if exists(select 1 from unnest(s.request_ids) x where not exists(select 1 from public.articulation_mobilization_requests where id=x)) then raise exception 'Solicitação vinculada inválida.';end if;
      if not coord and (p->>'review_status') not in ('draft','submitted') then raise exception 'Envie a proposta para aprovação da coordenação.' using errcode='42501';end if;
      s.review_status:=case when coord then coalesce(nullif(p->>'review_status',''),s.review_status,'submitted') else coalesce(p->>'review_status','submitted') end;
      if s.review_status='approved' and not coord then raise exception 'Aprovação restrita à coordenação.' using errcode='42501';end if;
      if s.review_status='approved' then s.reviewed_by:=actor;s.reviewed_at:=now();end if;
      s.id:=coalesce(s.id,gen_random_uuid());s.created_by:=coalesce(s.created_by,actor);s.updated_by:=actor;s.updated_at:=now();s.created_at:=coalesce(s.created_at,now());s.revision:=coalesce((oldjson->>'revision')::integer,0)+1;s.source_changed:=false;
      if s.source_plan_id is not null then select updated_at into s.source_updated_at from public.articulation_mobilization_plans where id=s.source_plan_id;end if;
      insert into public.articulation_mobilization_strategies select s.* on conflict(id) do update set title=excluded.title,reference_month=excluded.reference_month,action_type=excluded.action_type,channel=excluded.channel,territory=excluded.territory,location=excluded.location,objective=excluded.objective,request_ids=excluded.request_ids,reference_user_id=excluded.reference_user_id,collaborator_ids=excluded.collaborator_ids,proposed_date=excluded.proposed_date,start_time=excluded.start_time,end_time=excluded.end_time,deadline=excluded.deadline,preparation_steps=excluded.preparation_steps,execution_steps=excluded.execution_steps,resources=excluded.resources,documents_before=excluded.documents_before,documents_after=excluded.documents_after,review_status=excluded.review_status,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,updated_by=excluded.updated_by,updated_at=excluded.updated_at,revision=excluded.revision,source_changed=false,source_updated_at=excluded.source_updated_at;
    end if;
    -- Any revised approval invalidates publication of the current operational plan.
    update public.articulation_monthly_mobilization_plans mp set status='draft',revision=revision+1,updated_at=now(),updated_by=actor where exists(select 1 from public.articulation_mobilization_actions ac where ac.monthly_plan_id=mp.id and s.id=any(ac.strategy_ids));
    return jsonb_build_object('ok',true,'strategy',to_jsonb(s));
  elsif cmd='save_month' then
    mon:=date_trunc('month',(p->>'reference_month')::date)::date;
    perform pg_advisory_xact_lock(hashtextextended('mobilization-month:'||mon::text,0));
    select * into m from public.articulation_monthly_mobilization_plans where reference_month=mon for update;
    if m.id is not null and m.revision is distinct from (p->>'expected_revision')::integer then raise exception 'O plano foi alterado. Consulte as novidades antes de salvar.' using errcode='40001';end if;
    insert into public.articulation_monthly_mobilization_plans(reference_month,title,objective,coverage_notes,created_by,updated_by) values(mon,coalesce(nullif(btrim(p->>'title'),''),'Plano geral de mobilização'),p->>'objective',p->>'coverage_notes',actor,actor)
    on conflict(reference_month) do update set title=excluded.title,objective=excluded.objective,coverage_notes=excluded.coverage_notes,status='draft',revision=articulation_monthly_mobilization_plans.revision+1,updated_at=now(),updated_by=actor returning * into m;
    return jsonb_build_object('ok',true,'plan',to_jsonb(m));
  elsif cmd in ('save_action','generate_actions') then
    select * into strict m from public.articulation_monthly_mobilization_plans where id=(p->>'monthly_plan_id')::uuid for update;
    if m.revision is distinct from (p->>'plan_revision')::integer then raise exception 'O plano mudou. Consulte as novidades antes de salvar as ações.' using errcode='40001';end if;
    for item in select value from jsonb_array_elements(case when cmd='save_action' then jsonb_build_array(p) else p->'actions' end) loop
      a:=null;oldjson:='{}'::jsonb;
      if item->>'id' is not null then
        select * into strict a from public.articulation_mobilization_actions where id=(item->>'id')::uuid and monthly_plan_id=m.id for update;
        if a.revision is distinct from (item->>'expected_revision')::integer then raise exception 'Esta ação foi alterada em outro computador.' using errcode='40001';end if;
        if exists(select 1 from public.articulation_mobilization_executions where action_id=a.id and completed) and (to_jsonb(a)->'strategy_ids' is distinct from item->'strategy_ids' or to_jsonb(a)->'request_ids' is distinct from item->'request_ids') then raise exception 'Uma ação com execução registrada deve manter os vínculos originais.';end if;
        oldjson:=to_jsonb(a);
      end if;
      a:=jsonb_populate_record(a,item - array['id','monthly_plan_id','revision','created_by','updated_by','created_at','updated_at']);
      a.id:=coalesce(a.id,gen_random_uuid());a.monthly_plan_id:=m.id;a.created_by:=coalesce(a.created_by,actor);a.updated_by:=actor;a.created_at:=coalesce(a.created_at,now());a.updated_at:=now();a.revision:=coalesce((oldjson->>'revision')::integer,0)+1;
      a.cancelled:=coalesce(a.cancelled,false);
      if a.cancelled then raise exception 'Esta ação foi cancelada. Distribua a estratégia em uma nova ação.';end if;
      a.collaborator_ids:=coalesce(a.collaborator_ids,'{}');a.strategy_ids:=coalesce(a.strategy_ids,'{}');a.request_ids:=coalesce(a.request_ids,'{}');
      if date_trunc('month',a.scheduled_date)::date<>m.reference_month then raise exception 'A data da ação deve pertencer à competência do plano.';end if;
      if cardinality(a.strategy_ids)=0 or exists(select 1 from unnest(a.strategy_ids) x where not exists(select 1 from public.articulation_mobilization_strategies st where st.id=x and st.review_status='approved' and not st.source_changed and st.reference_month=m.reference_month)) then raise exception 'Inclua apenas estratégias aprovadas para esta competência.';end if;
      if exists(select 1 from public.articulation_mobilization_actions x where x.monthly_plan_id=m.id and not x.cancelled and x.id<>a.id and x.strategy_ids&&a.strategy_ids) then raise exception 'Uma estratégia já está distribuída em outra ação. Edite a ação existente.';end if;
      if exists(select 1 from unnest(a.request_ids) x where not exists(select 1 from public.articulation_mobilization_requests r where r.id=x)) then raise exception 'Solicitação vinculada não encontrada.';end if;
      if exists(select 1 from public.articulation_mobilization_strategies st where st.id=any(a.strategy_ids) and (not st.request_ids<@a.request_ids or (st.deadline is not null and a.scheduled_date>st.deadline))) or exists(select 1 from public.articulation_mobilization_requests r where r.id=any(a.request_ids) and r.planned_date<a.scheduled_date) then raise exception 'A ação perdeu solicitações de origem ou foi marcada após o prazo. Revise os vínculos e a data.';end if;
      if not exists(select 1 from public.profiles where id=a.reference_user_id and active and role::text in ('articulador','coordenacao_articulacao','coordenacao_geral')) or exists(select 1 from unnest(a.collaborator_ids) x where not exists(select 1 from public.profiles where id=x and active)) then raise exception 'Escolha articulador de referência e colaboradores ativos.';end if;
      if nullif(btrim(a.title),'') is null or nullif(btrim(a.location),'') is null then raise exception 'Informe título e local da mobilização.';end if;
      perform app_private.validate_mobilization_slot(a);
      insert into public.articulation_mobilization_actions select a.* on conflict(id) do update set title=excluded.title,action_type=excluded.action_type,channel=excluded.channel,territory=excluded.territory,location=excluded.location,scheduled_date=excluded.scheduled_date,start_time=excluded.start_time,end_time=excluded.end_time,reference_user_id=excluded.reference_user_id,collaborator_ids=excluded.collaborator_ids,strategy_ids=excluded.strategy_ids,request_ids=excluded.request_ids,objective=excluded.objective,preparation_steps=excluded.preparation_steps,execution_steps=excluded.execution_steps,resources=excluded.resources,documents_before=excluded.documents_before,documents_after=excluded.documents_after,preparation_deadline=excluded.preparation_deadline,notes=excluded.notes,revision=excluded.revision,updated_at=excluded.updated_at,updated_by=actor;
    end loop;
    update public.articulation_monthly_mobilization_plans set status='draft',revision=revision+1,updated_at=now(),updated_by=actor where id=m.id;
    return jsonb_build_object('ok',true);
  elsif cmd='cancel_action' then
    select * into strict a from public.articulation_mobilization_actions where id=(p->>'id')::uuid for update;
    if a.revision is distinct from (p->>'expected_revision')::integer then raise exception 'A ação mudou em outro computador.' using errcode='40001';end if;
    if nullif(btrim(p->>'reason'),'') is null then raise exception 'Informe o motivo do cancelamento.';end if;
    if exists(select 1 from public.articulation_mobilization_executions where action_id=a.id) or exists(select 1 from public.articulation_mobilization_interests where action_id=a.id) then raise exception 'Ação com execução ou interesse registrado deve manter seu histórico. Edite o planejamento sem cancelar os registros.';end if;
    update public.articulation_mobilization_actions set cancelled=true,cancellation_reason=p->>'reason',revision=revision+1,updated_at=now(),updated_by=actor where id=a.id;
    update public.articulation_monthly_mobilization_plans set status='draft',revision=revision+1,updated_at=now(),updated_by=actor where id=a.monthly_plan_id;
    update public.articulation_demand_public_links set active=false where demand_action_id in(select id from public.articulation_demand_actions where mobilization_action_id=a.id);
    update public.articulation_demand_actions set status='cancelado',updated_at=now() where mobilization_action_id=a.id;
    return jsonb_build_object('ok',true);
  elsif cmd in ('publish','evidence') then
    select * into strict m from public.articulation_monthly_mobilization_plans where id=(p->>'id')::uuid for update;
    if m.revision is distinct from (p->>'expected_revision')::integer then raise exception 'O plano mudou. Atualize antes de gerar a evidência.' using errcode='40001';end if;
    if cmd='publish' then
      if nullif(btrim(m.objective),'') is null or not exists(select 1 from public.articulation_mobilization_actions where monthly_plan_id=m.id and not cancelled) then raise exception 'Preencha o objetivo geral e distribua pelo menos uma ação.';end if;
      for a in select * from public.articulation_mobilization_actions where monthly_plan_id=m.id and not cancelled loop
        if nullif(btrim(a.objective),'') is null or nullif(btrim(a.preparation_steps),'') is null or nullif(btrim(a.execution_steps),'') is null or nullif(btrim(a.resources),'') is null or nullif(btrim(a.documents_before),'') is null or nullif(btrim(a.documents_after),'') is null or a.preparation_deadline is null or a.preparation_deadline>a.scheduled_date then raise exception 'Complete objetivo, etapas, recursos, documentos e prazo de preparação de cada ação.';end if;
        if exists(select 1 from public.articulation_mobilization_strategies st where st.id=any(a.strategy_ids) and (st.review_status<>'approved' or st.source_changed or not st.request_ids<@a.request_ids or (st.deadline is not null and st.deadline<a.scheduled_date))) then raise exception 'Há estratégia alterada, não aprovada ou fora do prazo. Revise as ações.';end if;
        perform app_private.validate_mobilization_slot(a);
      end loop;
      select count(*) into missing from public.articulation_mobilization_requests r where r.status not in ('cancelado','concluido','relatorio_finalizado') and (date_trunc('month',r.planned_date)::date=m.reference_month or exists(select 1 from public.articulation_mobilization_plans ip where ip.request_id=r.id and date_trunc('month',ip.mobilization_deadline)::date=m.reference_month) or exists(select 1 from public.articulation_mobilization_strategies st where st.reference_month=m.reference_month and r.id=any(st.request_ids))) and not exists(select 1 from public.articulation_mobilization_actions ac where ac.monthly_plan_id=m.id and not ac.cancelled and r.id=any(ac.request_ids));
      if missing>0 then raise exception '% solicitação(ões) ainda sem mobilização. Cubra todas antes de publicar.',missing;end if;
      update public.articulation_monthly_mobilization_plans set status='published',published_at=now(),updated_at=now(),updated_by=actor where id=m.id;
      -- Reuse the established public demand form and provisional Initial Form.
      for a in select * from public.articulation_mobilization_actions where monthly_plan_id=m.id and not cancelled loop
        insert into public.articulation_demand_actions(origin_type,title,requested_by,articulator_user_id,objective,target_audience,territories,planned_date,status,source_type,source_route,source_title,requester_role,methodological_action,mobilization_action_id)
        values('articulacao_planejada',a.title,actor,a.reference_user_id,a.objective,(select string_agg(source_title,'; ') from public.articulation_mobilization_requests where id=any(a.request_ids)),array[a.territory],a.scheduled_date,'planejado','outra','#articulacao?view=plano-geral',a.title,app_private.current_role(),'Mobilização e banco de interesses',a.id)
        on conflict(mobilization_action_id) do update set title=excluded.title,objective=excluded.objective,planned_date=excluded.planned_date,articulator_user_id=excluded.articulator_user_id,target_audience=excluded.target_audience,updated_at=now();
      end loop;
    end if;
    eid:=app_private.mobilization_snapshot(m.id);select * into v from public.articulation_mobilization_plan_versions where id=eid;
    return jsonb_build_object('ok',true,'version',to_jsonb(v));
  elsif cmd in ('complete','report','register_interest') then
    select * into strict a from public.articulation_mobilization_actions where id=(p->>'action_id')::uuid;
    select * into strict m from public.articulation_monthly_mobilization_plans where id=a.monthly_plan_id;
    if m.status<>'published' or a.cancelled then raise exception 'A coordenação precisa publicar o plano antes da execução.';end if;
    if (not coord or cmd in ('complete','report')) and actor<>a.reference_user_id and not actor=any(a.collaborator_ids) then raise exception 'Você não está vinculado a esta ação.' using errcode='42501';end if;
    if cmd='register_interest' then
      select id into did from public.articulation_demand_actions where mobilization_action_id=a.id;
      if did is null then raise exception 'Formulário de interesse ainda indisponível.';end if;
      uid:=nullif(p->>'young_person_id','')::uuid;
      item:=coalesce(p->'form','{}'::jsonb)||jsonb_build_object('demand_action_id',did,'articulator_user_id',actor,'articulator_name',(select display_name from public.profiles where id=actor),'mapping_action_name',a.title,'mapping_location_type','Território');
      if nullif(btrim(item->>'desired_workshop'),'') is null then raise exception 'Informe a ação ou atividade de interesse do jovem.';end if;
      if uid is null then
        if nullif(btrim(item->>'full_name'),'') is null then raise exception 'Informe o nome completo.';end if;
        perform pg_advisory_xact_lock(hashtextextended('mobilization-youth:'||lower(btrim(item->>'full_name')),0));
        select y.id into uid from public.young_people y where y.status='ativo' and ((nullif(regexp_replace(item->>'cpf','\D','','g'),'') is not null and regexp_replace(y.cpf,'\D','','g')=regexp_replace(item->>'cpf','\D','','g')) or (y.birth_date=nullif(item->>'birth_date','')::date and lower(btrim(y.full_name))=lower(btrim(item->>'full_name')))) order by y.updated_at desc limit 1;
      end if;
      if uid is not null and exists(select 1 from public.articulation_mobilization_interests where action_id=a.id and young_person_id=uid) then return jsonb_build_object('ok',true,'already_registered',true);end if;
      result:=public.save_articulation_demand_with_youth(item,uid,uid is null);
      if nullif(btrim(item->>'availability_note'),'') is not null then update public.articulation_demand_records set notes=item->>'availability_note' where id=(result->>'demand_id')::uuid;end if;
      return result;
    end if;
    select * into e from public.articulation_mobilization_executions where action_id=a.id and user_id=actor for update;
    if e.id is not null and e.revision is distinct from (p->>'expected_revision')::integer then raise exception 'Sua resposta mudou em outro computador. Atualize antes de salvar.' using errcode='40001';end if;
    if cmd='complete' then
      insert into public.articulation_mobilization_executions(action_id,user_id,completed,completed_at) values(a.id,actor,true,now()) on conflict(action_id,user_id) do update set completed=true,completed_at=coalesce(articulation_mobilization_executions.completed_at,now()),revision=articulation_mobilization_executions.revision+1,updated_at=now() returning * into e;
    else
      if p->>'report_status' not in ('draft','finalized') then raise exception 'Situação do relatório inválida.';end if;
      if p->>'report_status'='finalized' and (nullif(btrim(p->>'action_name'),'') is null or nullif(p->>'executed_date','') is null or nullif(btrim(p->>'location'),'') is null or nullif(btrim(p->>'mobilization_type'),'') is null or nullif(btrim(p->>'positives'),'') is null or nullif(btrim(p->>'negatives'),'') is null) then raise exception 'Preencha nome da ação, data, local, tipo, pontos positivos e negativos.';end if;
      insert into public.articulation_mobilization_executions(action_id,user_id,completed,completed_at,action_name,executed_date,location,mobilization_type,positives,negatives,observations,report_status)
      values(a.id,actor,coalesce(e.completed,false) or p->>'report_status'='finalized',case when p->>'report_status'='finalized' then coalesce(e.completed_at,now()) else e.completed_at end,p->>'action_name',nullif(p->>'executed_date','')::date,p->>'location',p->>'mobilization_type',p->>'positives',p->>'negatives',p->>'observations',p->>'report_status')
      on conflict(action_id,user_id) do update set completed=excluded.completed,completed_at=excluded.completed_at,action_name=excluded.action_name,executed_date=excluded.executed_date,location=excluded.location,mobilization_type=excluded.mobilization_type,positives=excluded.positives,negatives=excluded.negatives,observations=excluded.observations,report_status=excluded.report_status,revision=articulation_mobilization_executions.revision+1,updated_at=now() returning * into e;
      insert into public.methodology_form_submissions(form_slug,payload,sensitivity,created_by,record_state,source_type,source_id)
      values('relatorio-mobilizacao-acao',to_jsonb(e)||jsonb_build_object('responsible_name',(select display_name from public.profiles where id=actor),'requested_actions',(select jsonb_agg(source_title) from public.articulation_mobilization_requests where id=any(a.request_ids))),'team',actor,case when e.report_status='finalized' then 'complete' else 'draft' end,'articulation_mobilization_executions',e.id)
      on conflict(source_type,source_id,form_slug) where source_type is not null and source_id is not null do update set payload=excluded.payload,record_state=excluded.record_state,updated_at=now();
    end if;
    return jsonb_build_object('ok',true,'execution',to_jsonb(e));
  elsif cmd='followup' then
    update public.articulation_mobilization_interests set contact_status=p->>'contact_status',followup_date=nullif(p->>'followup_date','')::date,followup_notes=p->>'followup_notes',followed_by=actor,revision=revision+1,updated_at=now() where id=(p->>'id')::uuid and revision=(p->>'expected_revision')::integer returning id into rid;
    if rid is null then raise exception 'Este interesse mudou. Consulte as novidades antes de salvar.' using errcode='40001';end if;
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Comando de mobilização desconhecido.';
end $$;

-- Exposed wrapper never bypasses authorization; privileged implementation stays private.
create or replace function public.mobilization_command(p_command text,p_payload jsonb default '{}'::jsonb) returns jsonb language sql security invoker set search_path='' as $$select app_private.mobilization_command(p_command,p_payload)$$;
revoke all on function public.mobilization_command(text,jsonb) from public,anon;
revoke all on function app_private.mobilization_command(text,jsonb),app_private.mobilization_snapshot(uuid),app_private.capture_mobilization_interest(),app_private.validate_mobilization_slot(public.articulation_mobilization_actions),app_private.mobilization_uuid_array(jsonb) from public,anon;
grant execute on function public.mobilization_command(text,jsonb),app_private.mobilization_command(text,jsonb) to authenticated;

-- Keep the existing identity workflow available to both coordination roles.
do $patch$ declare definition text; begin
  select pg_get_functiondef('public.save_articulation_demand_with_youth(jsonb,uuid,boolean)'::regprocedure) into definition;
  definition:=replace(definition,'array[''articulador'',''coordenacao_articulacao'']','array[''articulador'',''coordenacao_articulacao'',''coordenacao_geral'']');
  execute definition;
end $patch$;
