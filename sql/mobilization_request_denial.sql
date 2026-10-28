-- A recusa encerra somente solicitações ainda pendentes e preserva sua história.
alter table public.articulation_mobilization_requests
  add column if not exists rejection_reason text,
  add column if not exists rejected_by uuid references public.profiles(id),
  add column if not exists rejected_at timestamptz;

alter table public.articulation_mobilization_requests
  drop constraint articulation_mobilization_requests_status_check;
alter table public.articulation_mobilization_requests
  add constraint articulation_mobilization_requests_status_check
  check (status in ('solicitado','em_elaboracao','planejado','em_mobilizacao','concluido','relatorio_finalizado','dispensado','cancelado','negado'));

-- A API já autoriza alterações à Articulação. O gatilho também valida o ator,
-- a transição e a justificativa, inclusive para chamadas diretas à API.
create or replace function app_private.guard_mobilization_request_denial()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.status='negado' or new.rejection_reason is not null or new.rejected_by is not null or new.rejected_at is not null then
      raise exception 'A solicitação deve ser criada antes de ser recusada.' using errcode='23514';
    end if;
    return new;
  end if;
  if old.status='negado' then
    if new.status is distinct from old.status or new.rejection_reason is distinct from old.rejection_reason
       or new.rejected_by is distinct from old.rejected_by or new.rejected_at is distinct from old.rejected_at then
      raise exception 'A solicitação negada deve manter a decisão e a justificativa registradas.' using errcode='23514';
    end if;
    return new;
  end if;
  if new.status='negado' then
    if auth.uid() is null or not app_private.is_active_staff() or not app_private.is_articulation_role() then
      raise exception 'Somente a equipe de Articulação pode recusar a solicitação.' using errcode='42501';
    end if;
    if old.status<>'solicitado' then
      raise exception 'Somente solicitações que aguardam resposta podem ser recusadas.' using errcode='23514';
    end if;
    new.rejection_reason:=nullif(btrim(new.rejection_reason),'');
    if new.rejection_reason is null or char_length(new.rejection_reason)>2000 then
      raise exception 'Informe uma justificativa para o solicitante, com até 2.000 caracteres.' using errcode='23514';
    end if;
    if exists(select 1 from public.articulation_mobilization_plans p where p.request_id=old.id and p.status<>'cancelado') then
      raise exception 'Esta solicitação já possui resposta. Atualize o plano existente antes de tomar outra decisão.' using errcode='23514';
    end if;
    if exists(select 1 from public.articulation_mobilization_actions a where not a.cancelled and
         (old.id=any(a.request_ids) or exists(select 1 from public.articulation_mobilization_strategies s where s.id=any(a.strategy_ids) and old.id=any(s.request_ids)))) then
      raise exception 'Esta solicitação já está em uma mobilização organizada. Ajuste ou cancele a ação antes de recusá-la.' using errcode='23514';
    end if;
    new.rejected_by:=auth.uid();
    new.rejected_at:=now();
    new.updated_at:=now();
  elsif new.rejection_reason is not null or new.rejected_by is not null or new.rejected_at is not null then
    raise exception 'A justificativa de recusa exige uma solicitação negada.' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function app_private.guard_mobilization_request_denial() from public,anon,authenticated;
create trigger guard_mobilization_request_denial before insert or update on public.articulation_mobilization_requests
for each row execute function app_private.guard_mobilization_request_denial();

-- Ao desvincular uma solicitação negada, não reprocessar as demais solicitações
-- da estratégia nem gerar respostas/mensagens que não foram solicitadas.
do $migration$
declare definition text; marker text:='begin
  if actor is null or not app_private.is_active_staff()';
begin
  select pg_get_functiondef('app_private.sync_shared_mobilization_responses()'::regprocedure) into definition;
  if position('Desvinculação exclusiva de solicitação negada' in definition)=0 then
    if position(marker in definition)=0 or position(marker in substring(definition from position(marker in definition)+length(marker)))>0 then
      raise exception 'Sincronização de estratégias não corresponde à versão esperada.';
    end if;
    definition:=replace(definition,marker,$replacement$begin
  -- Desvinculação exclusiva de solicitação negada: não reprocessar as restantes.
  if tg_op='UPDATE' and new.request_ids is distinct from old.request_ids
    and coalesce(new.request_ids,'{}'::uuid[]) <@ coalesce(old.request_ids,'{}'::uuid[])
    and (to_jsonb(new)-array['request_ids','revision','updated_at','updated_by'])=(to_jsonb(old)-array['request_ids','revision','updated_at','updated_by'])
    and not exists(select 1 from unnest(old.request_ids) removed(request_id) where not removed.request_id=any(new.request_ids)
      and not exists(select 1 from public.articulation_mobilization_requests denied_request where denied_request.id=removed.request_id and denied_request.status='negado')) then
    return new;
  end if;
  if actor is null or not app_private.is_active_staff()$replacement$);
    execute definition;
  end if;
end $migration$;

-- Bloqueios evitam que uma operação simultânea volte a vincular uma recusa.
create or replace function app_private.guard_denied_mobilization_links()
returns trigger language plpgsql security definer set search_path='' as $$
declare r record; ids uuid[];
begin
  if tg_table_name='articulation_mobilization_plans' then
    if new.status='cancelado' then return new; end if;
    ids:=array[new.request_id];
  elsif tg_table_name='articulation_mobilization_actions' then
    if new.cancelled then return new; end if;
    ids:=coalesce(new.request_ids,'{}'::uuid[]);
  else
    ids:=coalesce(new.request_ids,'{}'::uuid[]);
  end if;
  for r in select id,status from public.articulation_mobilization_requests where id=any(ids) order by id for share loop
    if r.status='negado' then
      raise exception 'A solicitação foi negada e não pode ser vinculada a uma mobilização.' using errcode='23514';
    end if;
  end loop;
  return new;
end $$;
revoke all on function app_private.guard_denied_mobilization_links() from public,anon,authenticated;
create trigger guard_denied_mobilization_plan before insert or update of request_id,status on public.articulation_mobilization_plans
for each row execute function app_private.guard_denied_mobilization_links();
create trigger guard_denied_mobilization_strategy before insert or update of request_ids on public.articulation_mobilization_strategies
for each row execute function app_private.guard_denied_mobilization_links();
create trigger guard_denied_mobilization_action before insert or update of request_ids,cancelled on public.articulation_mobilization_actions
for each row execute function app_private.guard_denied_mobilization_links();

create or replace function app_private.complete_mobilization_request_denial()
returns trigger language plpgsql security definer set search_path='' as $$
declare thread_id uuid;
begin
  if old.status='negado' or new.status<>'negado' then return new; end if;
  update public.articulation_mobilization_strategies s
    set request_ids=array_remove(s.request_ids,new.id),revision=s.revision+1,updated_at=now(),updated_by=new.rejected_by
    where new.id=any(s.request_ids);
  select t.id into thread_id from public.team_threads t
    where t.source_type='articulation_mobilization_request' and t.source_id=new.id;
  if thread_id is null then
    thread_id:=app_private.ensure_team_thread('mobilizacao','Mobilização · '||new.source_title,
      'articulation_mobilization_request',new.id,new.requested_by,null,'Articulação',
      coalesce(new.objective,'Solicitação de apoio da Articulação.'),jsonb_build_object('status','solicitado'));
  end if;
  update public.team_threads set status='negado',updated_at=now() where id=thread_id;
  insert into public.team_thread_messages(thread_id,sender_user_id,message_type,body,metadata)
    values(thread_id,new.rejected_by,'status','Solicitação de mobilização negada.'||E'\nJustificativa: '||new.rejection_reason,
      jsonb_build_object('status','negado','request_id',new.id));
  return new;
end $$;
revoke all on function app_private.complete_mobilization_request_denial() from public,anon,authenticated;
create trigger complete_mobilization_request_denial after update of status on public.articulation_mobilization_requests
for each row execute function app_private.complete_mobilization_request_denial();

-- O plano mensal não pode exigir cobertura de solicitações encerradas por recusa.
do $migration$
declare definition text; marker text:='r.status not in (''cancelado'',''concluido'',''relatorio_finalizado'')';
begin
  select pg_get_functiondef('app_private.mobilization_command(text,jsonb)'::regprocedure) into definition;
  if position('r.status not in (''cancelado'',''concluido'',''relatorio_finalizado'',''dispensado'',''negado'')' in definition)>0 then return; end if;
  if position(marker in definition)=0 or position(marker in substring(definition from position(marker in definition)+length(marker)))>0 then
    raise exception 'Publicação do plano não corresponde à versão esperada.';
  end if;
  definition:=replace(definition,marker,'r.status not in (''cancelado'',''concluido'',''relatorio_finalizado'',''dispensado'',''negado'')');
  execute definition;
end $migration$;
