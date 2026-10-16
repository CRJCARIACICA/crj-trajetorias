-- Monthly workshop configuration. Existing workshop IDs and evidence links are retained.
create table if not exists public.workshop_month_settings (
 workshop_id uuid not null references public.workshops(id) on delete cascade,
 reference_month date not null check(reference_month=date_trunc('month',reference_month)::date),
 configuration jsonb not null check(jsonb_typeof(configuration)='object'),
 revision integer not null default 1,
 synchronized_at timestamptz,
 inherited_from date,
 updated_by uuid references auth.users(id), updated_at timestamptz not null default now(),
 primary key(workshop_id,reference_month)
);
alter table public.workshop_calendar add column if not exists monthly_cancelled boolean not null default false;
create table if not exists public.workshop_month_changes (
 id bigint generated always as identity primary key,
 workshop_id uuid not null references public.workshops(id), reference_month date not null,
 changed_by uuid references auth.users(id), changed_at timestamptz not null default now(),
 reason text not null, source_table text not null, source_id uuid,
 before_data jsonb, after_data jsonb
);
alter table public.workshop_month_settings enable row level security;
alter table public.workshop_month_changes enable row level security;
grant select on public.workshop_month_settings,public.workshop_month_changes to authenticated;
create policy workshop_month_settings_read on public.workshop_month_settings for select to authenticated using(app_private.is_active_staff());
create policy workshop_month_changes_read on public.workshop_month_changes for select to authenticated using(app_private.is_active_staff());
create index workshop_month_changes_lookup on public.workshop_month_changes(workshop_id,reference_month,changed_at desc);

create or replace function app_private.ensure_workshop_month(p_id uuid,p_month date) returns void
language plpgsql security definer set search_path='' as $$
declare v_cfg jsonb; v_from date; v_base public.workshops; v_active boolean;
begin
 if p_month<>date_trunc('month',p_month)::date then raise exception 'Competência inválida'; end if;
 perform 1 from public.workshops where id=p_id for update;
 if exists(select 1 from public.workshop_month_settings where workshop_id=p_id and reference_month=p_month) then return; end if;
 select * into strict v_base from public.workshops where id=p_id;
 select configuration,reference_month into v_cfg,v_from from public.workshop_month_settings where workshop_id=p_id and reference_month<p_month order by reference_month desc limit 1;
 v_cfg:=coalesce(v_cfg,to_jsonb(v_base));
 if v_from is not null then v_cfg:=v_cfg-'execution_dates';end if;
 v_active:=coalesce((v_cfg->>'active')::boolean,true);
 if v_base.workshop_type='pontual' and date_trunc('month',v_base.planned_start_date)::date<>p_month then v_active:=false; end if;
 -- Period boundaries are evaluated for each month, not inherited as a permanent exclusion.
 v_cfg:=v_cfg||jsonb_build_object('active',v_active);
 insert into public.workshop_month_settings(workshop_id,reference_month,configuration,inherited_from,updated_by) values(p_id,p_month,v_cfg,v_from,auth.uid());
 insert into public.workshop_month_changes(workshop_id,reference_month,changed_by,reason,source_table,source_id,after_data) values(p_id,p_month,auth.uid(),case when v_from is null then 'Configuração inicial da competência' else 'Renovação automática a partir de '||to_char(v_from,'MM/YYYY') end,'workshop_month_settings',p_id,v_cfg);
end $$;

create or replace function public.list_workshops_for_month(p_month date) returns setof jsonb
language sql security invoker set search_path='' as $$
 select to_jsonb(w)||coalesce(s.configuration,prior.configuration,'{}'::jsonb)||jsonb_build_object('active',coalesce((coalesce(s.configuration,prior.configuration)->>'active')::boolean,w.active) and coalesce((coalesce(s.configuration,prior.configuration)->>'planned_start_date')::date,w.planned_start_date,p_month)<(p_month+interval '1 month')::date and coalesce((coalesce(s.configuration,prior.configuration)->>'planned_end_date')::date,w.planned_end_date,(p_month+interval '1 month')::date)>=p_month,'id',w.id,'reference_month',p_month,'monthly_revision',coalesce(s.revision,0),'inherited_from',coalesce(s.inherited_from,prior.reference_month))
 from public.workshops w
 left join public.workshop_month_settings s on s.workshop_id=w.id and s.reference_month=p_month
 left join lateral (select configuration,reference_month from public.workshop_month_settings where workshop_id=w.id and reference_month<p_month order by reference_month desc limit 1) prior on s.workshop_id is null
 order by coalesce(s.configuration->>'name',prior.configuration->>'name',w.name)
$$;

create or replace function app_private.sync_workshop_month(p_id uuid,p_month date) returns void
language plpgsql security definer set search_path='' as $$
declare cfg public.workshops; v jsonb; c public.workshop_calendar; oldc jsonb; d date; target_dates date[]; pid uuid; idx integer:=0; lid uuid; changed boolean; stamp text:='Alteração mensal '||to_char(p_month,'MM/YYYY')||' em '||to_char(timezone('America/Sao_Paulo',now()),'DD/MM/YYYY HH24:MI')||' por '||coalesce(auth.uid()::text,'renovação automática');
begin
 perform set_config('crj.monthly_sync',p_id::text||'/'||p_month::text,true);
 select configuration into strict v from public.workshop_month_settings where workshop_id=p_id and reference_month=p_month for update;
 select * into cfg from jsonb_populate_record(null::public.workshops,v);
 if cfg.active and cfg.schedule_mode='semanal_fixa' then
   select array_agg(x::date order by x) into target_dates from generate_series(p_month,(p_month+interval '1 month - 1 day')::date,interval '1 day') x where extract(dow from x)::integer=any(cfg.fixed_weekdays) and x::date>=coalesce(cfg.planned_start_date,p_month) and x::date<=coalesce(cfg.planned_end_date,(p_month+interval '1 month')::date);
 elsif cfg.active and cfg.workshop_type='pontual' and cfg.planned_start_date>=p_month and cfg.planned_start_date<(p_month+interval '1 month')::date then target_dates:=array[cfg.planned_start_date];
 elsif cfg.active and v ? 'execution_dates' then
   select array_agg(value::date) into target_dates from jsonb_array_elements_text(v->'execution_dates') where value::date>=p_month and value::date<(p_month+interval '1 month')::date;
 elsif cfg.active then
   select array_agg(distinct scheduled_date) into target_dates from public.workshop_calendar where workshop_id=p_id and scheduled_date>=p_month and scheduled_date<(p_month+interval '1 month')::date;
 end if;
 target_dates:=coalesce(target_dates,'{}'::date[]);
 -- Never delete calendar rows: every existing foreign key remains stable.
 for c in select * from public.workshop_calendar where workshop_id=p_id and scheduled_date>=p_month and scheduled_date<(p_month+interval '1 month')::date for update loop
   if c.status='realizada' or c.session_id is not null or exists(select 1 from public.workshop_sessions where calendar_entry_id=c.id) then continue; end if;
   oldc:=to_jsonb(c);
   if not(c.scheduled_date=any(target_dates)) then
     if c.status='planejada' then update public.workshop_calendar set status='cancelada',monthly_cancelled=true,notes=concat_ws(E'\n',notes,stamp||': aula retirada desta competência'),updated_at=now() where id=c.id returning * into c; end if;
   elsif c.status='planejada' or c.monthly_cancelled then
     -- A flexible calendar retains its per-date times; fixed rules take the monthly values.
     update public.workshop_calendar set status=case when monthly_cancelled then 'planejada' else status end,monthly_cancelled=false,start_time=case when cfg.schedule_mode='semanal_fixa' or cfg.workshop_type='pontual' or v ? 'execution_dates' then cfg.start_time else start_time end,end_time=case when cfg.schedule_mode='semanal_fixa' or cfg.workshop_type='pontual' or v ? 'execution_dates' then cfg.end_time else end_time end,location_type=cfg.location_type,location_other=cfg.location_other,notes=concat_ws(E'\n',notes,stamp),updated_at=now() where id=c.id returning * into c;
   end if;
   if oldc is distinct from to_jsonb(c) then
     insert into public.workshop_month_changes(workshop_id,reference_month,changed_by,reason,source_table,source_id,before_data,after_data) values(p_id,p_month,auth.uid(),stamp,'workshop_calendar',c.id,oldc,to_jsonb(c));
   end if;
 end loop;
 foreach d in array target_dates loop
   if not exists(select 1 from public.workshop_calendar where workshop_id=p_id and scheduled_date=d) and (cfg.schedule_mode='semanal_fixa' or cfg.workshop_type='pontual' or v ? 'execution_dates') then
     insert into public.workshop_calendar(workshop_id,scheduled_date,start_time,end_time,location_type,location_other,source,status,notes) values(p_id,d,cfg.start_time,cfg.end_time,cfg.location_type,cfg.location_other,'regra_fixa','planejada',stamp) returning * into c;
     insert into public.workshop_month_changes(workshop_id,reference_month,changed_by,reason,source_table,source_id,after_data) values(p_id,p_month,auth.uid(),stamp,'workshop_calendar',c.id,to_jsonb(c));
   end if;
 end loop;
 select id into pid from public.workshop_monthly_plans where workshop_id=p_id and plan_month=p_month;
 if pid is null and cfg.active then
   insert into public.workshop_monthly_plans(workshop_id,plan_month,instructor_user_id,educator_user_id) values(p_id,p_month,cfg.oficineiro_user_id,cfg.educator_user_id) returning id into pid;
 end if;
 if pid is not null then
   if exists(select 1 from public.workshop_monthly_plans where id=pid and status='arquivado') then raise exception 'Planejamento arquivado: reabra antes de alterar a competência.'; end if;
   update public.workshop_monthly_plans set instructor_user_id=cfg.oficineiro_user_id,educator_user_id=cfg.educator_user_id,updated_at=now() where id=pid;
   for c in select * from public.workshop_calendar where workshop_id=p_id and scheduled_date>=p_month and scheduled_date<(p_month+interval '1 month')::date order by scheduled_date,start_time,id loop
     idx:=idx+1;
     select id into lid from public.workshop_plan_lessons where plan_id=pid and calendar_entry_id=c.id;
     if lid is null and c.status<>'cancelada' then
       insert into public.workshop_plan_lessons(plan_id,calendar_entry_id,lesson_number,scheduled_date,start_time,end_time,location_type,location_other,theme,included) values(pid,c.id,idx,c.scheduled_date,c.start_time,c.end_time,c.location_type,c.location_other,'Aula '||idx,true) returning id into lid;
     elsif lid is not null and c.status<>'realizada' and c.session_id is null and not exists(select 1 from public.workshop_sessions where calendar_entry_id=c.id) then
       update public.workshop_plan_lessons set scheduled_date=c.scheduled_date,start_time=c.start_time,end_time=c.end_time,location_type=c.location_type,location_other=c.location_other,included=(c.status<>'cancelada'),updated_at=now() where id=lid;
     end if;
     -- CFDH retains its IDs and follows the same live calendar entry, never rewriting execution.
     update public.cfdh_actions set scheduled_date=c.scheduled_date,start_time=c.start_time,end_time=c.end_time,planned_duration_hours=greatest(0,extract(epoch from(c.end_time-c.start_time))/3600),location_type=c.location_type,location_other=c.location_other,execution_notes=concat_ws(E'\n',execution_notes,stamp||case when c.status='cancelada' then ': aula de origem cancelada' else ': vínculo de agenda atualizado' end),updated_at=now(),updated_by=auth.uid() where workshop_calendar_id=c.id and actual_date is null and coalesce(actual_duration_hours,0)=0;
   end loop;
   insert into public.workshop_month_changes(workshop_id,reference_month,changed_by,reason,source_table,source_id,after_data) values(p_id,p_month,auth.uid(),stamp||': responsáveis, blocos e agendas vinculadas sincronizados; conteúdo pedagógico e execuções preservados','workshop_monthly_plans',pid,jsonb_build_object('calendar_rows',idx));
 end if;
 update public.workshop_month_settings set synchronized_at=now() where workshop_id=p_id and reference_month=p_month;
 perform set_config('crj.monthly_sync','',true);
end $$;

create or replace function app_private.save_workshop_month(p_id uuid,p_month date,p_configuration jsonb,p_revision integer,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare oldrow public.workshop_month_settings; v jsonb; cfg public.workshops; devices jsonb;
begin
 if auth.uid() is null or not app_private.has_any_role(array['coordenacao_geral','coordenacao_articulacao','educador','administrativo']) then raise exception 'Sem permissão para configurar oficinas.'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Informe o motivo da alteração.'; end if;
 if p_id is null then
   select * into cfg from jsonb_populate_record(null::public.workshops,p_configuration);
   insert into public.workshops(name,category,workshop_type,schedule_mode,fixed_weekdays,planned_start_date,planned_end_date,start_time,end_time,location_type,location_other,planning_notes,oficineiro_user_id,educator_user_id,active,days)
   values(cfg.name,cfg.category,cfg.workshop_type,cfg.schedule_mode,cfg.fixed_weekdays,cfg.planned_start_date,cfg.planned_end_date,cfg.start_time,cfg.end_time,cfg.location_type,cfg.location_other,cfg.planning_notes,cfg.oficineiro_user_id,cfg.educator_user_id,coalesce(cfg.active,true),cfg.days) returning id into p_id;
 end if;
 perform 1 from public.workshops where id=p_id for update;
 select * into oldrow from public.workshop_month_settings where workshop_id=p_id and reference_month=p_month for update;
 if coalesce(oldrow.revision,0)<>p_revision then raise exception 'A competência foi alterada por outra pessoa. Reabra antes de salvar.'; end if;
 perform app_private.ensure_workshop_month(p_id,p_month);
 select * into oldrow from public.workshop_month_settings where workshop_id=p_id and reference_month=p_month for update;
 select jsonb_object_agg(key,value) into v from jsonb_each(p_configuration) where key=any(array['name','category','workshop_type','schedule_mode','fixed_weekdays','planned_start_date','planned_end_date','start_time','end_time','location_type','location_other','planning_notes','oficineiro_user_id','educator_user_id','active','days','methodology_devices','execution_dates']);
 v:=oldrow.configuration||coalesce(v,'{}'::jsonb);
 select * into cfg from jsonb_populate_record(null::public.workshops,v);
 if nullif(btrim(cfg.name),'') is null or cfg.workshop_type not in ('permanente','temporaria','pontual') or cfg.schedule_mode not in ('semanal_fixa','calendario_flexivel') or cfg.active is null then raise exception 'Configuração inválida.'; end if;
 if cfg.active and (cfg.start_time is null or cfg.end_time is null or cfg.end_time<=cfg.start_time or cfg.planned_start_date is null or cfg.location_type is null) then raise exception 'Preencha período, horário e local válidos.'; end if;
 if cfg.location_type is not null and cfg.location_type not in ('LABPoca','Sala de computadores','Sala de dança','Trampo Coletivo','Externa','Outro') then raise exception 'Local inválido'; end if;
 if cfg.active and cfg.schedule_mode='semanal_fixa' and (coalesce(array_length(cfg.fixed_weekdays,1),0)=0 or not(cfg.fixed_weekdays<@array[0,1,2,3,4,5,6]::smallint[])) then raise exception 'Selecione dias válidos da semana.'; end if;
 if cfg.workshop_type='temporaria' and cfg.planned_end_date is null then raise exception 'Informe o término da oficina temporária.'; end if;
 if v ? 'execution_dates' then
   if jsonb_typeof(v->'execution_dates')<>'array' then raise exception 'Lista de datas inválida';end if;
   if exists(select 1 from jsonb_array_elements_text(v->'execution_dates') x where x::date<p_month or x::date>=(p_month+interval '1 month')::date) then raise exception 'Todas as datas devem pertencer à competência selecionada.';end if;
 end if;
 update public.workshop_month_settings set configuration=v,revision=revision+1,updated_by=auth.uid(),updated_at=now(),inherited_from=null where workshop_id=p_id and reference_month=p_month;
 insert into public.workshop_month_changes(workshop_id,reference_month,changed_by,reason,source_table,source_id,before_data,after_data) values(p_id,p_month,auth.uid(),p_reason,'workshop_month_settings',p_id,oldrow.configuration,v);
 perform app_private.sync_workshop_month(p_id,p_month);
 return jsonb_build_object('workshop_id',p_id,'reference_month',p_month,'revision',oldrow.revision+1,'synchronized',true);
end $$;
create or replace function public.save_workshop_month(p_id uuid,p_month date,p_configuration jsonb,p_revision integer,p_reason text) returns jsonb language sql security invoker set search_path='' as $$select app_private.save_workshop_month(p_id,p_month,p_configuration,p_revision,p_reason)$$;

-- Atomic regeneration used by existing planning/calendar buttons.
create or replace function app_private.refresh_workshop_month(p_id uuid,p_month date) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not app_private.has_any_role(array['coordenacao_geral','coordenacao_articulacao','educador','administrativo']) then raise exception 'Sem permissão.'; end if;
 perform app_private.ensure_workshop_month(p_id,p_month);perform app_private.sync_workshop_month(p_id,p_month);return jsonb_build_object('synchronized',true);
end $$;
create or replace function public.refresh_workshop_month(p_id uuid,p_month date) returns jsonb language sql security invoker set search_path='' as $$ select app_private.refresh_workshop_month(p_id,p_month) $$;

create or replace function app_private.audit_workshop_month_link() returns trigger language plpgsql security definer set search_path='' as $$
declare ctx text:=current_setting('crj.monthly_sync',true); b jsonb; a jsonb;
begin
 if ctx is null or ctx='' then return new; end if;
 a:=to_jsonb(new);if tg_op='UPDATE' then b:=to_jsonb(old); end if;
 if b is distinct from a then
 insert into public.workshop_month_changes(workshop_id,reference_month,changed_by,reason,source_table,source_id,before_data,after_data) values(split_part(ctx,'/',1)::uuid,split_part(ctx,'/',2)::date,auth.uid(),'Vínculo atualizado ao salvar configuração mensal',tg_table_name,new.id,b,a);
 end if;return new;
end $$;
revoke all on function app_private.audit_workshop_month_link() from public,anon,authenticated;
create trigger workshop_month_audit_lesson after insert or update on public.workshop_plan_lessons for each row execute function app_private.audit_workshop_month_link();
create trigger workshop_month_audit_plan after insert or update on public.workshop_monthly_plans for each row execute function app_private.audit_workshop_month_link();
create trigger workshop_month_audit_cfdh after update on public.cfdh_actions for each row execute function app_private.audit_workshop_month_link();

-- Daily renewal creates current/next month once. Explicit future overrides are never replaced.
create or replace function app_private.renew_workshop_months() returns void language plpgsql security definer set search_path='' as $$
declare w record; m date; base date:=date_trunc('month',timezone('America/Sao_Paulo',now()))::date; existed boolean;
begin
 for w in select id from public.workshops loop
  for m in select x::date from generate_series(base,(base+interval '1 month')::date,interval '1 month') x loop
   existed:=exists(select 1 from public.workshop_month_settings where workshop_id=w.id and reference_month=m);
   perform app_private.ensure_workshop_month(w.id,m);
   if not exists(select 1 from public.workshop_monthly_plans where workshop_id=w.id and plan_month=m and status='arquivado') and (not existed or exists(select 1 from public.workshop_month_settings where workshop_id=w.id and reference_month=m and synchronized_at is null)) then perform app_private.sync_workshop_month(w.id,m); end if;
  end loop;
 end loop;
end $$;
revoke all on function app_private.ensure_workshop_month(uuid,date),app_private.sync_workshop_month(uuid,date),app_private.renew_workshop_months() from public,anon,authenticated;
revoke all on function app_private.save_workshop_month(uuid,date,jsonb,integer,text),app_private.refresh_workshop_month(uuid,date) from public,anon;
grant execute on function app_private.save_workshop_month(uuid,date,jsonb,integer,text),app_private.refresh_workshop_month(uuid,date) to authenticated;
revoke all on function public.list_workshops_for_month(date),public.save_workshop_month(uuid,date,jsonb,integer,text),public.refresh_workshop_month(uuid,date) from public,anon;
grant execute on function public.list_workshops_for_month(date),public.save_workshop_month(uuid,date,jsonb,integer,text),public.refresh_workshop_month(uuid,date) to authenticated;
-- Snapshot existing current/next configuration without changing any agenda at rollout.
do $$ declare w record; m date; base date:=date_trunc('month',timezone('America/Sao_Paulo',now()))::date; begin for w in select id from public.workshops loop for m in select x::date from generate_series(base,(base+interval '1 month')::date,interval '1 month') x loop perform app_private.ensure_workshop_month(w.id,m); end loop;end loop;end $$;
update public.workshop_month_settings set synchronized_at=now() where reference_month=date_trunc('month',timezone('America/Sao_Paulo',now()))::date;
select cron.schedule('crj-renovar-oficinas-mensais','5 3 * * *','select app_private.renew_workshop_months()');
create or replace function app_private.sync_monthly_joint_agenda() returns trigger language plpgsql security definer set search_path='' as $$
declare ctx text:=current_setting('crj.monthly_sync',true); oldevent jsonb; newevent jsonb; cancelled boolean;
begin
 if ctx is null or ctx='' or new.calendar_event_id is null or new.source_type not in ('workshop_plan_lessons','cfdh_actions') then return new; end if;
 if new.action_date is null or new.start_time is null or new.end_time is null or new.end_time<=new.start_time then return new;end if;
 select to_jsonb(e) into oldevent from public.calendar_events e where id=new.calendar_event_id for update;
 cancelled:=new.status in ('cancelado','cancelada','cancelled');
 update public.calendar_events set title='[AÇÃO] '||new.title,starts_at=(new.action_date+new.start_time) at time zone 'America/Sao_Paulo',ends_at=(new.action_date+new.end_time) at time zone 'America/Sao_Paulo',location=new.location,location_details=new.location,status=case when cancelled then 'cancelled' else 'confirmed' end,updated_at=now() where id=new.calendar_event_id returning to_jsonb(calendar_events.*) into newevent;
 insert into public.calendar_event_history(event_id,actor_user_id,action,changes,note) values(new.calendar_event_id,auth.uid(),case when cancelled then 'cancelled' else 'edited' end,jsonb_build_object('before',oldevent,'after',newevent,'joint_action_id',new.id),'Atualização automática ao salvar configuração mensal da oficina');
 insert into public.workshop_month_changes(workshop_id,reference_month,changed_by,reason,source_table,source_id,before_data,after_data) values(split_part(ctx,'/',1)::uuid,split_part(ctx,'/',2)::date,auth.uid(),'Agenda compartilhada sincronizada com a configuração mensal','calendar_events',new.calendar_event_id,oldevent,newevent);
 return new;
end $$;
revoke all on function app_private.sync_monthly_joint_agenda() from public,anon,authenticated;
create trigger workshop_month_joint_agenda after update on public.joint_actions for each row execute function app_private.sync_monthly_joint_agenda();
