-- As ações selecionadas em uma estratégia passam a ter respostas individuais
-- rastreáveis, sem alterar uma resposta existente ou antecipar a execução.
alter table public.articulation_mobilization_plans
  add column if not exists shared_strategy_id uuid references public.articulation_mobilization_strategies(id),
  add column if not exists shared_strategy_snapshot jsonb;
create index if not exists mobilization_plans_shared_strategy_idx
  on public.articulation_mobilization_plans(shared_strategy_id) where shared_strategy_id is not null;

create or replace function app_private.sync_shared_mobilization_responses()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); r public.articulation_mobilization_requests%rowtype;
  existing public.articulation_mobilization_plans%rowtype; original public.articulation_mobilization_plans%rowtype;
  v_goal text; v_strategies text[]; v_message text; v_places text; v_partners text; v_materials text;
  v_responsible text; v_schedule text; v_deadline date; v_notes text; v_snapshot jsonb; old_snapshot jsonb;
  v_status text; v_inserted uuid;
begin
  if actor is null or not app_private.is_active_staff() or not app_private.has_any_role(array['coordenacao_geral','coordenacao_articulacao']) then
    return new;
  end if;
  if new.review_status in ('rejected','changes_requested') then return new; end if;
  if tg_op='UPDATE' and not coalesce(new.request_ids,'{}'::uuid[]) <@ coalesce(old.request_ids,'{}'::uuid[])
     and exists(select 1 from public.articulation_mobilization_actions a where not a.cancelled and new.id=any(a.strategy_ids)
       and (exists(select 1 from public.articulation_mobilization_executions e where e.action_id=a.id and (e.completed or e.report_status='finalized'))
         or exists(select 1 from public.articulation_mobilization_interests i where i.action_id=a.id))) then
    raise exception 'Esta estratégia já possui execução ou interesses registrados. Crie outra estratégia para mobilizar novas solicitações.' using errcode='23514';
  end if;
  if new.source_plan_id is not null then
    select * into original from public.articulation_mobilization_plans where id=new.source_plan_id;
  end if;
  select string_agg(p.display_name,', ' order by p.display_name) into v_responsible
    from public.profiles p where p.id=new.reference_user_id or p.id=any(coalesce(new.collaborator_ids,'{}'::uuid[]));
  v_goal:=coalesce(nullif(btrim(new.objective),''),nullif(btrim(original.mobilization_goal),''));
  v_strategies:=array[coalesce(nullif(btrim(new.source_strategy),''),case new.channel
    when 'Escola' then 'Escolas' when 'CRJ' then 'Mobilização interna no CRJ'
    when 'Parceiro / rede' then 'OSCs / parceiros' when 'Outro' then 'Outra estratégia' else new.channel end)];
  v_message:=coalesce(nullif(btrim(original.main_message),''),nullif(btrim(new.execution_steps),''));
  v_places:=coalesce(nullif(btrim(new.location),''),nullif(btrim(original.places),''));
  v_partners:=nullif(btrim(original.partners),'');
  v_materials:=coalesce(nullif(btrim(new.resources),''),nullif(btrim(original.materials),''));
  v_responsible:=coalesce(v_responsible,nullif(btrim(original.responsible_text),''));
  v_schedule:=nullif(concat_ws(E'\n',nullif(btrim(original.schedule_text),''),
    case when nullif(btrim(new.preparation_steps),'') is not null then 'Preparação: '||new.preparation_steps end,
    case when nullif(btrim(new.execution_steps),'') is not null then 'Execução: '||new.execution_steps end),'');
  v_notes:='Resposta gerada a partir da estratégia compartilhada: '||new.title||'.';
  v_status:=case when new.review_status='draft' then 'em_elaboracao' else 'planejado' end;

  -- Ordens consistentes de bloqueio evitam disputa entre estratégias que
  -- selecionam as mesmas solicitações simultaneamente.
  for r in select * from public.articulation_mobilization_requests
    where id=any(coalesce(new.request_ids,'{}'::uuid[])) order by id for update
  loop
    if r.status in ('cancelado','dispensado','concluido','relatorio_finalizado','em_mobilizacao') then continue; end if;
    v_deadline:=least(new.deadline,original.mobilization_deadline,r.planned_date);
    v_snapshot:=jsonb_build_object('goal',v_goal,'strategies',to_jsonb(v_strategies),'message',v_message,
      'places',v_places,'partners',v_partners,'materials',v_materials,'responsible',v_responsible,
      'schedule',v_schedule,'deadline',v_deadline,'notes',v_notes);
    select * into existing from public.articulation_mobilization_plans where request_id=r.id for update;
    if existing.id is null then
      insert into public.articulation_mobilization_plans(request_id,articulator_user_id,mobilization_goal,target_audience,
        territories,attendance_target,strategies,main_message,places,partners,materials,responsible_text,schedule_text,
        mobilization_deadline,notes,status,record_state,shared_strategy_id,shared_strategy_snapshot)
      values(r.id,actor,v_goal,coalesce(nullif(btrim(r.target_audience),''),nullif(btrim(original.target_audience),'')),
        case when cardinality(coalesce(r.territories,'{}'::text[]))>0 then r.territories
          when cardinality(coalesce(original.territories,'{}'::text[]))>0 then original.territories
          when nullif(btrim(new.territory),'') is not null then regexp_split_to_array(new.territory,'\s*,\s*') else '{}'::text[] end,
        r.expected_participants,v_strategies,v_message,v_places,v_partners,v_materials,v_responsible,v_schedule,
        v_deadline,v_notes,v_status,'draft',new.id,v_snapshot)
      on conflict(request_id) do nothing returning id into v_inserted;
      if v_inserted is not null then
        update public.articulation_mobilization_requests set status=v_status,updated_at=now()
          where id=r.id and status in ('solicitado','em_elaboracao');
      end if;
    elsif existing.shared_strategy_id=new.id and existing.shared_strategy_snapshot is not null
        and existing.status in ('em_elaboracao','planejado') then
      old_snapshot:=jsonb_build_object('goal',existing.mobilization_goal,'strategies',to_jsonb(existing.strategies),
        'message',existing.main_message,'places',existing.places,'partners',existing.partners,'materials',existing.materials,
        'responsible',existing.responsible_text,'schedule',existing.schedule_text,'deadline',existing.mobilization_deadline,'notes',existing.notes);
      -- Se qualquer dado comum foi editado manualmente, nunca o sobrescreva.
      if old_snapshot=existing.shared_strategy_snapshot then
        if old_snapshot is distinct from v_snapshot or (existing.status='em_elaboracao' and v_status='planejado' and new.review_status in ('submitted','approved')) then
          update public.articulation_mobilization_plans set mobilization_goal=v_goal,strategies=v_strategies,main_message=v_message,
            places=v_places,partners=v_partners,materials=v_materials,responsible_text=v_responsible,schedule_text=v_schedule,
            mobilization_deadline=v_deadline,notes=v_notes,shared_strategy_snapshot=v_snapshot,
            status=case when status='em_elaboracao' and v_status='planejado' and new.review_status in ('submitted','approved') then 'planejado' else status end,
            updated_at=now() where id=existing.id returning * into existing;
        end if;
        update public.articulation_mobilization_requests set status=existing.status,updated_at=now()
          where id=r.id and status in ('solicitado','em_elaboracao') and status<>existing.status;
      end if;
    elsif existing.status not in ('cancelado') and r.status='solicitado' then
      -- Resposta anterior: somente repara a situação da solicitação.
      update public.articulation_mobilization_requests set status=existing.status,updated_at=now() where id=r.id and status='solicitado';
    end if;
  end loop;

  -- Se a estratégia já foi organizada no plano, acrescente as novas solicitações
  -- à ação existente. Execuções e relatórios já registrados não são alterados.
  update public.articulation_mobilization_actions a set request_ids=(
      select array_agg(distinct x order by x) from unnest(coalesce(a.request_ids,'{}'::uuid[])||coalesce(new.request_ids,'{}'::uuid[])) x
    ),revision=a.revision+1,updated_at=now(),updated_by=actor
  where not a.cancelled and new.id=any(a.strategy_ids)
    and not coalesce(new.request_ids,'{}'::uuid[]) <@ coalesce(a.request_ids,'{}'::uuid[])
    and not exists(select 1 from public.articulation_mobilization_executions e
      where e.action_id=a.id and (e.completed or e.report_status='finalized'))
    and not exists(select 1 from public.articulation_mobilization_interests i where i.action_id=a.id);
  return new;
end $$;
revoke all on function app_private.sync_shared_mobilization_responses() from public,anon,authenticated;
create trigger mobilization_strategy_shared_responses
  after insert or update of request_ids,title,channel,territory,location,objective,reference_user_id,collaborator_ids,deadline,preparation_steps,execution_steps,resources,review_status
  on public.articulation_mobilization_strategies for each row execute function app_private.sync_shared_mobilization_responses();

-- As respostas derivadas já estão representadas por sua estratégia original.
-- A importação não deve recriá-las como novas propostas independentes.
do $migration$
declare definition text; marker text:='where pl.status<>''cancelado'' and (date_trunc';
begin
  select pg_get_functiondef('app_private.mobilization_command(text,jsonb)'::regprocedure) into definition;
  if position('pl.shared_strategy_id is null' in definition)>0 then return; end if;
  if position(marker in definition)=0 or position(marker in substring(definition from position(marker in definition)+length(marker)))>0 then
    raise exception 'Importação de mobilizações não corresponde à versão esperada; migração interrompida.';
  end if;
  definition:=replace(definition,marker,'where pl.status<>''cancelado'' and pl.shared_strategy_id is null and (date_trunc');
  execute definition;
end $migration$;
