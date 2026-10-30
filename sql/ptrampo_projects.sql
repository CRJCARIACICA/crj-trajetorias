-- Projeto PTrampo: um documento com até oito ações. Os registros técnicos originais
-- continuam sendo a fonte das execuções e presenças; não são apagados nem copiados.
create table if not exists public.ptrampo_projects (
  id uuid primary key default gen_random_uuid(),
  reference_month date not null check (extract(day from reference_month)=1),
  title text not null,
  objective text,
  methodology text,
  expected_results text,
  target_audience text,
  partners text,
  responsible_id uuid references public.profiles(id) on delete restrict,
  status text not null default 'rascunho' check (status in ('rascunho','planejado','concluido','cancelado')),
  report_summary text,
  report_outcomes text,
  report_next_steps text,
  migration_key text unique,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ptrampo_project_actions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.ptrampo_projects(id) on delete restrict,
  technical_plan_id uuid not null unique references public.technical_action_plans(id) on delete restrict,
  activity_number integer check (activity_number between 1 and 8),
  relationship text not null default 'canonical' check (relationship in ('canonical','history','review')),
  contribution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (relationship <> 'canonical' or activity_number is not null)
);
create unique index if not exists ptrampo_project_actions_slot_idx
  on public.ptrampo_project_actions(project_id,activity_number) where relationship='canonical';
create index if not exists ptrampo_project_actions_project_idx on public.ptrampo_project_actions(project_id);
create index if not exists ptrampo_projects_month_idx on public.ptrampo_projects(reference_month);

alter table public.articulation_mobilization_requests
  add column if not exists ptrampo_project_id uuid references public.ptrampo_projects(id) on delete restrict;
create index if not exists art_requests_ptrampo_project_idx
  on public.articulation_mobilization_requests(ptrampo_project_id) where ptrampo_project_id is not null;

alter table public.ptrampo_projects enable row level security;
alter table public.ptrampo_project_actions enable row level security;
revoke all on public.ptrampo_projects, public.ptrampo_project_actions from anon;
grant select,insert,update on public.ptrampo_projects, public.ptrampo_project_actions to authenticated;

create policy ptrampo_projects_read on public.ptrampo_projects for select to authenticated
  using (app_private.has_any_role(array['coordenacao_geral','monitoramento','assistente_social','psicologo','terapeuta_ocupacional']));
create policy ptrampo_projects_insert on public.ptrampo_projects for insert to authenticated
  with check (app_private.has_any_role(array['coordenacao_geral','assistente_social','psicologo','terapeuta_ocupacional']));
create policy ptrampo_projects_update on public.ptrampo_projects for update to authenticated
  using (app_private.has_any_role(array['coordenacao_geral','assistente_social','psicologo','terapeuta_ocupacional']))
  with check (app_private.has_any_role(array['coordenacao_geral','assistente_social','psicologo','terapeuta_ocupacional']));
create policy ptrampo_actions_read on public.ptrampo_project_actions for select to authenticated
  using (app_private.has_any_role(array['coordenacao_geral','monitoramento','assistente_social','psicologo','terapeuta_ocupacional']));
create policy ptrampo_actions_insert on public.ptrampo_project_actions for insert to authenticated
  with check (app_private.has_any_role(array['coordenacao_geral','assistente_social','psicologo','terapeuta_ocupacional']));
create policy ptrampo_actions_update on public.ptrampo_project_actions for update to authenticated
  using (app_private.has_any_role(array['coordenacao_geral','assistente_social','psicologo','terapeuta_ocupacional']))
  with check (app_private.has_any_role(array['coordenacao_geral','assistente_social','psicologo','terapeuta_ocupacional']));

-- Apenas ações PTrampo podem integrar um projeto PTrampo.
create function technical_private.validate_ptrampo_link()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if not exists(select 1 from public.technical_action_plans p where p.id=new.technical_plan_id and p.action_type='ptrampo') then
    raise exception 'Somente uma ação PTrampo pode ser vinculada ao projeto.';
  end if;
  return new;
end $$;
revoke all on function technical_private.validate_ptrampo_link() from public,anon,authenticated;
create trigger ptrampo_validate_link before insert or update of technical_plan_id on public.ptrampo_project_actions
  for each row execute function technical_private.validate_ptrampo_link();

-- Os horários são gravados antecipadamente. A validação do link já existente no
-- sistema aplica opens_at/closes_at no servidor, sem depender de navegador aberto.
create function technical_private.sync_ptrampo_window(p_plan_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_plan public.technical_action_plans%rowtype; v_has_execution boolean;
begin
  if not exists(select 1 from public.ptrampo_project_actions a
    where a.technical_plan_id=p_plan_id and a.relationship='canonical') then return; end if;
  select * into v_plan from public.technical_action_plans where id=p_plan_id and action_type='ptrampo';
  if not found then return; end if;
  select exists(select 1 from public.technical_action_executions e where e.plan_id=p_plan_id) into v_has_execution;
  if v_plan.status='cancelado' then
    update public.technical_action_checkin_windows set active=false,updated_at=now() where plan_id=p_plan_id;
  elsif v_plan.status in ('planejado','em_andamento','realizado')
      and v_plan.planned_date is not null and v_plan.start_time is not null and v_plan.end_time is not null then
    insert into public.technical_action_checkin_windows(plan_id,opens_at,closes_at,active,created_by)
    values(p_plan_id,(v_plan.planned_date+v_plan.start_time) at time zone 'America/Sao_Paulo',
      (v_plan.planned_date+v_plan.end_time) at time zone 'America/Sao_Paulo',true,v_plan.created_by)
    on conflict(plan_id) do update set opens_at=excluded.opens_at,closes_at=excluded.closes_at,
      active=true,updated_at=now() where not v_has_execution;
  end if;
end $$;
revoke all on function technical_private.sync_ptrampo_window(uuid) from public,anon,authenticated;

create function technical_private.ptrampo_link_window_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform technical_private.sync_ptrampo_window(new.technical_plan_id);
  return new;
end $$;
revoke all on function technical_private.ptrampo_link_window_trigger() from public,anon,authenticated;
create trigger ptrampo_link_window after insert or update of technical_plan_id,relationship on public.ptrampo_project_actions
  for each row execute function technical_private.ptrampo_link_window_trigger();

create function technical_private.ptrampo_plan_window_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform technical_private.sync_ptrampo_window(new.id);
  return new;
end $$;
revoke all on function technical_private.ptrampo_plan_window_trigger() from public,anon,authenticated;
create trigger ptrampo_plan_window after update of planned_date,start_time,end_time,status on public.technical_action_plans
  for each row execute function technical_private.ptrampo_plan_window_trigger();

-- Salva o documento e suas ações no mesmo comando. Ao editar ações existentes,
-- mantém participantes, profissionais adicionais e vínculos metodológicos.
create function public.save_ptrampo_project(p_project jsonb,p_actions jsonb default '[]'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_id uuid; v_month date; v_status text; v_responsible uuid; v_a jsonb; v_plan public.technical_action_plans%rowtype;
  v_position integer; v_plan_id uuid; v_count integer; v_rel text;
begin
  if auth.uid() is null or not app_private.has_any_role(array['coordenacao_geral','assistente_social','psicologo','terapeuta_ocupacional']) then
    raise exception 'Sem permissão para planejar PTrampo.' using errcode='42501';
  end if;
  if jsonb_typeof(coalesce(p_actions,'[]'::jsonb))<>'array' then raise exception 'Lista de ações inválida.'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_actions,'[]'::jsonb)) a group by a->>'activity_number' having count(*)>1)
    or exists(select 1 from jsonb_array_elements(coalesce(p_actions,'[]'::jsonb)) a where nullif(a->>'technical_plan_id','') is not null group by a->>'technical_plan_id' having count(*)>1) then
    raise exception 'Uma ação ou posição foi informada mais de uma vez.';
  end if;
  v_month:=date_trunc('month',(p_project->>'reference_month')::date)::date;
  v_status:=coalesce(nullif(p_project->>'status',''),'rascunho');
  v_responsible:=nullif(p_project->>'responsible_id','')::uuid;
  if v_status not in ('rascunho','planejado','concluido','cancelado') then raise exception 'Situação inválida.'; end if;
  if nullif(trim(p_project->>'title'),'') is null then raise exception 'Informe o título do projeto.'; end if;
  if v_responsible is not null and not app_private.is_technical_staff(v_responsible) then raise exception 'Escolha profissional da Equipe Técnica como responsável.'; end if;
  if v_status='planejado' then
    if v_responsible is null or nullif(trim(p_project->>'objective'),'') is null or nullif(trim(p_project->>'methodology'),'') is null then
      raise exception 'Informe responsável, objetivo e metodologia para concluir o projeto.';
    end if;
    if jsonb_array_length(p_actions)<>8 then raise exception 'Preencha as oito ações antes de concluir.'; end if;
    for v_a in select value from jsonb_array_elements(p_actions) loop
      if nullif(trim(v_a->>'title'),'') is null or nullif(trim(v_a->>'objective'),'') is null
        or nullif(trim(v_a->>'planned_activities'),'') is null or nullif(trim(v_a->>'expected_results'),'') is null
        or nullif(v_a->>'planned_date','') is null or nullif(v_a->>'start_time','') is null or nullif(v_a->>'end_time','') is null then
        raise exception 'Preencha título, objetivo, metodologia, resultados, data e horários das oito ações.';
      end if;
    end loop;
  end if;
  if nullif(p_project->>'id','') is null then
    insert into public.ptrampo_projects(reference_month,title,objective,methodology,expected_results,target_audience,partners,responsible_id,status,created_by,updated_by)
    values(v_month,trim(p_project->>'title'),nullif(trim(p_project->>'objective'),''),nullif(trim(p_project->>'methodology'),''),
      nullif(trim(p_project->>'expected_results'),''),nullif(trim(p_project->>'target_audience'),''),nullif(trim(p_project->>'partners'),''),v_responsible,v_status,auth.uid(),auth.uid()) returning id into v_id;
  else
    v_id:=(p_project->>'id')::uuid;
    update public.ptrampo_projects set reference_month=v_month,title=trim(p_project->>'title'),
      objective=nullif(trim(p_project->>'objective'),''),methodology=nullif(trim(p_project->>'methodology'),''),
      expected_results=nullif(trim(p_project->>'expected_results'),''),target_audience=nullif(trim(p_project->>'target_audience'),''),
      partners=nullif(trim(p_project->>'partners'),''),responsible_id=v_responsible,status=v_status,updated_by=auth.uid(),updated_at=now() where id=v_id;
    if not found then raise exception 'Projeto não encontrado ou sem acesso.'; end if;
  end if;
  for v_a in select value from jsonb_array_elements(coalesce(p_actions,'[]'::jsonb)) loop
    v_position:=(v_a->>'activity_number')::integer;
    if v_position not between 1 and 8 then raise exception 'Número de ação inválido.'; end if;
    v_plan_id:=nullif(v_a->>'technical_plan_id','')::uuid;
    if v_plan_id is null and nullif(trim(v_a->>'title'),'') is null then continue; end if;
    if v_plan_id is not null then
      select a.relationship into v_rel from public.ptrampo_project_actions a
        where a.project_id=v_id and a.technical_plan_id=v_plan_id;
      if not found then raise exception 'Ação não pertence a este projeto.'; end if;
      if exists(select 1 from public.ptrampo_project_actions a where a.project_id=v_id and a.relationship='canonical'
        and a.activity_number=v_position and a.technical_plan_id<>v_plan_id) then raise exception 'Já existe uma ação neste número.'; end if;
      select * into v_plan from public.technical_action_plans where id=v_plan_id and action_type='ptrampo';
      if not found then raise exception 'Ação PTrampo não localizada.'; end if;
      update public.technical_action_plans set title=coalesce(nullif(trim(v_a->>'title'),''),title),
        objective=nullif(trim(v_a->>'objective'),''),planned_activities=nullif(trim(v_a->>'planned_activities'),''),
        expected_results=nullif(trim(v_a->>'expected_results'),''),
        planned_date=nullif(v_a->>'planned_date','')::date,start_time=nullif(v_a->>'start_time','')::time,
        end_time=nullif(v_a->>'end_time','')::time,
        planned_duration_hours=case when nullif(v_a->>'start_time','') is not null and nullif(v_a->>'end_time','') is not null
          then round(extract(epoch from ((v_a->>'end_time')::time-(v_a->>'start_time')::time))::numeric/3600,2) else null end,
        location_type=coalesce(nullif(v_a->>'location_type',''),location_type),location_details=nullif(trim(v_a->>'location_details'),''),
        status=case when status in ('realizado','cancelado','em_andamento') then status when v_status='planejado' then 'planejado' else status end,
        updated_by=auth.uid(),updated_at=now() where id=v_plan_id;
      update public.ptrampo_project_actions set activity_number=v_position,relationship='canonical',updated_at=now()
        where project_id=v_id and technical_plan_id=v_plan_id;
    else
      insert into public.technical_action_plans(plan_month,action_type,action_scope,title,objective,planned_activities,expected_results,
        target_audience,planned_date,start_time,end_time,planned_duration_hours,location_type,location_details,partners,methodology_links,status,created_by,updated_by)
      values(v_month,'ptrampo','coletiva',trim(v_a->>'title'),nullif(trim(v_a->>'objective'),''),nullif(trim(v_a->>'planned_activities'),''),
        nullif(trim(v_a->>'expected_results'),''),nullif(trim(p_project->>'target_audience'),''),
        nullif(v_a->>'planned_date','')::date,nullif(v_a->>'start_time','')::time,nullif(v_a->>'end_time','')::time,
        case when nullif(v_a->>'start_time','') is not null and nullif(v_a->>'end_time','') is not null then round(extract(epoch from ((v_a->>'end_time')::time-(v_a->>'start_time')::time))::numeric/3600,2) else null end,
        coalesce(nullif(v_a->>'location_type',''),'crj'),nullif(trim(v_a->>'location_details'),''),nullif(trim(p_project->>'partners'),''),
        '[{"goal":"Meta 6","stage":"6.4","nucleus":"Núcleo Economia Criativa, Trabalho e Renda","axis":"Tô no Topo","item":"Plano de Possibilidades de Trabalhos Individuais ou Coletivos (PTrampo)","purpose":"PTrampo","relation_mode":"primary","counts_toward_indicator":true}]'::jsonb,
        case when v_status='planejado' then 'planejado' else 'rascunho' end,auth.uid(),auth.uid()) returning id into v_plan_id;
      if v_responsible is not null then
        insert into public.technical_action_plan_professionals(plan_id,professional_id,responsibility) values(v_plan_id,v_responsible,'responsavel');
      end if;
      insert into public.ptrampo_project_actions(project_id,technical_plan_id,activity_number,relationship)
        values(v_id,v_plan_id,v_position,'canonical');
    end if;
  end loop;
  select count(*) into v_count from public.ptrampo_project_actions where project_id=v_id and relationship='canonical';
  if v_status='planejado' and v_count<>8 then raise exception 'O projeto precisa conter oito ações.'; end if;
  return jsonb_build_object('id',v_id,'action_count',v_count,'status',v_status);
end $$;
revoke all on function public.save_ptrampo_project(jsonb,jsonb) from public,anon;
grant execute on function public.save_ptrampo_project(jsonb,jsonb) to authenticated;

create function public.ptrampo_action_presence(p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_data jsonb;
begin
  if auth.uid() is null or not app_private.has_any_role(array['coordenacao_geral','monitoramento','assistente_social','psicologo','terapeuta_ocupacional']) then
    raise exception 'Sem permissão para consultar as presenças.' using errcode='42501';
  end if;
  if not exists(select 1 from public.ptrampo_project_actions where technical_plan_id=p_plan_id) then raise exception 'Ação não vinculada a projeto PTrampo.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('youth_id',q.id,'full_name',q.full_name) order by q.full_name),'[]'::jsonb) into v_data
  from public.young_people q where q.id in (
    select youth_id from public.technical_action_attendance where plan_id=p_plan_id and present
    union select youth_id from public.technical_action_checkin_presence where plan_id=p_plan_id and present
  );
  return v_data;
end $$;
revoke all on function public.ptrampo_action_presence(uuid) from public,anon;
grant execute on function public.ptrampo_action_presence(uuid) to authenticated;

-- v2 substitui a lista. Unir com as presenças antigas evita perdas ao editar.
create function public.ptrampo_save_execution(p_execution jsonb,p_youth_ids uuid[] default '{}'::uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_ids uuid[]; v_result jsonb; v_prior jsonb; v_row jsonb; v_exec uuid;
begin
  if auth.uid() is null or not app_private.has_any_role(array['assistente_social','psicologo','terapeuta_ocupacional']) then
    raise exception 'Somente a Equipe Técnica pode registrar execução.' using errcode='42501'; end if;
  v_id:=nullif(p_execution->>'plan_id','')::uuid;
  if not exists(select 1 from public.ptrampo_project_actions where technical_plan_id=v_id and relationship='canonical') then raise exception 'Ação não localizada no projeto.'; end if;
  perform 1 from public.technical_action_plans where id=v_id for update;
  select coalesce(jsonb_agg(to_jsonb(a)),'[]'::jsonb) into v_prior from public.technical_action_attendance a where a.plan_id=v_id;
  select coalesce(array_agg(distinct youth_id),'{}'::uuid[]) into v_ids from (
    select unnest(coalesce(p_youth_ids,'{}'::uuid[])) youth_id
    union select youth_id from public.technical_action_attendance where plan_id=v_id and present
    union select youth_id from public.technical_action_checkin_presence where plan_id=v_id and present
  ) q where youth_id is not null;
  v_result:=public.save_technical_action_execution_v2(p_execution,v_ids);
  v_exec:=nullif(v_result->>'execution_id','')::uuid;
  -- A função legada recria linhas de presença; restabelece identidade e anotações anteriores.
  for v_row in select value from jsonb_array_elements(v_prior) loop
    insert into public.technical_action_attendance(id,execution_id,plan_id,youth_id,present,participation_role,notes,created_by,created_at)
      values((v_row->>'id')::uuid,v_exec,v_id,(v_row->>'youth_id')::uuid,(v_row->>'present')::boolean,
        coalesce(v_row->>'participation_role','participante'),v_row->>'notes',nullif(v_row->>'created_by','')::uuid,(v_row->>'created_at')::timestamptz)
    on conflict(execution_id,youth_id) do update set id=excluded.id,
      present=public.technical_action_attendance.present or excluded.present,
      participation_role=excluded.participation_role,notes=excluded.notes,created_by=excluded.created_by,created_at=excluded.created_at;
  end loop;
  -- Uma relatoria salva antes do fim não encerra antecipadamente a lista planejada.
  update public.technical_action_checkin_windows w set active=true,updated_at=now()
    from public.technical_action_plans p where w.plan_id=v_id and p.id=w.plan_id
      and p.status<>'cancelado' and now() between w.opens_at and w.closes_at;
  return v_result;
end $$;
revoke all on function public.ptrampo_save_execution(jsonb,uuid[]) from public,anon;
grant execute on function public.ptrampo_save_execution(jsonb,uuid[]) to authenticated;

-- Se uma assinatura chegar depois da relatoria, atualiza a lista, a trajetória
-- e a evidência da mesma execução sem pedir que alguém a salve de novo.
create function technical_private.sync_ptrampo_checkin_presence()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_ex public.technical_action_executions%rowtype; v_participants jsonb;
begin
  if not new.present or not exists(select 1 from public.ptrampo_project_actions a where a.technical_plan_id=new.plan_id and a.relationship='canonical') then return new; end if;
  perform 1 from public.technical_action_plans p where p.id=new.plan_id for update;
  select * into v_ex from public.technical_action_executions where plan_id=new.plan_id and execution_status<>'cancelada';
  if not found then return new; end if;
  insert into public.technical_action_attendance(execution_id,plan_id,youth_id,present,created_by)
    values(v_ex.id,new.plan_id,new.youth_id,true,auth.uid())
    on conflict(execution_id,youth_id) do update set present=true;
  if v_ex.service_record_id is not null then
    insert into public.technical_service_youth(service_id,youth_id,participation_role)
      values(v_ex.service_record_id,new.youth_id,'atendido') on conflict(service_id,youth_id) do nothing;
  end if;
  if v_ex.attendance_submission_id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('number',q.rn,'name',q.full_name,'full_name',q.full_name,
      'signature_data',coalesce(q.signature_data,''),'birth_date',coalesce(q.birth_date::text,''),'cpf',coalesce(q.cpf,''),
      'phone',coalesce(q.phone,''),'email',coalesce(q.email,''),'neighborhood',coalesce(q.neighborhood,''),
      'initial_form_status',coalesce(q.initial_form_status,'')) order by q.rn),'[]'::jsonb) into v_participants
    from (select y.*,sig.signature_data,row_number() over(order by y.full_name,y.id) rn
      from public.technical_action_attendance a join public.young_people y on y.id=a.youth_id
      left join lateral (select s.signature_data from app_private.youth_signatures s where s.youth_id=y.id order by s.updated_at desc nulls last limit 1) sig on true
      where a.execution_id=v_ex.id and a.present) q;
    update public.methodology_form_submissions set payload=jsonb_set(jsonb_set(payload,'{participants}',v_participants,true),
      '{participant_count}',to_jsonb(jsonb_array_length(v_participants)),true),updated_at=now() where id=v_ex.attendance_submission_id;
  end if;
  return new;
end $$;
revoke all on function technical_private.sync_ptrampo_checkin_presence() from public,anon,authenticated;
create trigger ptrampo_checkin_sync after insert or update of present on public.technical_action_checkin_presence
  for each row execute function technical_private.sync_ptrampo_checkin_presence();

create function public.ptrampo_add_presence(p_plan_id uuid,p_youth_ids uuid[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_window uuid; v_youth uuid; v_ex public.technical_action_executions%rowtype; v_result jsonb;
begin
  if auth.uid() is null or not app_private.has_any_role(array['assistente_social','psicologo','terapeuta_ocupacional']) then
    raise exception 'Somente a Equipe Técnica pode adicionar presenças.' using errcode='42501'; end if;
  if not exists(select 1 from public.ptrampo_project_actions a join public.technical_action_plans p on p.id=a.technical_plan_id
    where a.technical_plan_id=p_plan_id and a.relationship='canonical' and p.planned_date is not null and p.start_time is not null
      and (p.planned_date+p.start_time) at time zone 'America/Sao_Paulo' <= now() and p.status<>'cancelado') then
    raise exception 'A ação ainda não ocorreu, foi cancelada ou não está vinculada ao projeto.'; end if;
  if exists(select 1 from unnest(coalesce(p_youth_ids,'{}'::uuid[])) u(id)
    where not exists(select 1 from public.young_people y where y.id=u.id and y.deleted_at is null and y.status<>'excluido')) then raise exception 'Há jovem não encontrado ou excluído.'; end if;
  perform 1 from public.technical_action_plans where id=p_plan_id for update;
  select * into v_ex from public.technical_action_executions where plan_id=p_plan_id;
  if found and v_ex.execution_status='cancelada' then raise exception 'Não é possível adicionar presença a uma execução cancelada.'; end if;
  perform technical_private.sync_ptrampo_window(p_plan_id);
  select id into v_window from public.technical_action_checkin_windows where plan_id=p_plan_id;
  if v_window is null then raise exception 'Defina data e horários da ação antes de registrar presença.'; end if;
  foreach v_youth in array coalesce(p_youth_ids,'{}'::uuid[]) loop
    insert into public.technical_action_checkin_presence(window_id,plan_id,youth_id,present,source)
    values(v_window,p_plan_id,v_youth,true,'staff_manual') on conflict(window_id,youth_id) do update set present=true,updated_at=now();
  end loop;
  return jsonb_build_object('ok',true,'added',coalesce(array_length(p_youth_ids,1),0),'execution_updated',v_ex.id is not null);
end $$;
revoke all on function public.ptrampo_add_presence(uuid,uuid[]) from public,anon;
grant execute on function public.ptrampo_add_presence(uuid,uuid[]) to authenticated;
