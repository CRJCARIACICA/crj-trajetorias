-- Atendimento técnico metodológico: uma transação por atendimento, documentos
-- individuais e eventos de indicadores rastreáveis. Dados anteriores preservados.
create or replace function public.save_methodological_technical_service(
  p_record jsonb, p_youth_ids uuid[], p_professional_ids uuid[], p_documents jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_service public.technical_service_records;
  v_doc jsonb;
  v_doc_id uuid;
  v_first_doc uuid;
  v_youth uuid;
  v_related_pvida uuid;
  v_type text := p_record->>'program_type';
  v_date date;
begin
  if auth.uid() is null then raise exception 'Sessão não autenticada'; end if;
  if v_type not in ('pvida','ptrampo','outras-demandas') then
    raise exception 'Selecione PVida, PTrampo ou Outras Demandas';
  end if;
  if coalesce(cardinality(p_youth_ids),0)=0 or coalesce(cardinality(p_professional_ids),0)=0 then
    raise exception 'Informe jovem e técnico responsável';
  end if;
  if coalesce(p_record->>'service_type','individual')='individual' and cardinality(p_youth_ids)<>1 then
    raise exception 'Atendimento individual deve ter um único jovem';
  end if;
  if jsonb_typeof(p_documents)<>'array' then raise exception 'Documentos inválidos'; end if;
  if exists (
    select 1 from unnest(p_youth_ids) y
    where not exists (select 1 from jsonb_array_elements(p_documents) d
      where d->>'youth_id'=y::text and d->>'form_slug'=v_type)
  ) then raise exception 'Cada jovem precisa do formulário correspondente'; end if;
  if exists (select 1 from jsonb_array_elements(p_documents) d
      where not (d->>'youth_id')::uuid=any(p_youth_ids)
         or d->>'form_slug' not in (v_type,'acompanhamento')) then
    raise exception 'Documento incompatível com o atendimento';
  end if;
  v_date := (p_record->>'service_date')::date;
  insert into public.technical_service_records
    (service_date,service_type,program_type,reason,summary,status,duration_hours,created_by)
  values (v_date,coalesce(p_record->>'service_type','individual'),v_type,
    coalesce(nullif(btrim(p_record->>'reason'),''),'Atendimento da equipe técnica'),
    nullif(p_record->>'summary',''),coalesce(p_record->>'status','realizado'),
    nullif(p_record->>'duration_hours','')::numeric,auth.uid())
  returning * into v_service;
  insert into public.technical_service_youth(service_id,youth_id)
    select v_service.id,y from (select distinct unnest(p_youth_ids) y) q;
  insert into public.technical_service_professionals(service_id,professional_id,responsibility)
    select v_service.id,p,'Técnico responsável' from (select distinct unnest(p_professional_ids) p) q;
  for v_doc in select * from jsonb_array_elements(p_documents) loop
    if v_type='pvida' then
      v_related_pvida:=v_service.id;
    else
      select s.id into v_related_pvida
      from public.technical_service_records s
      join public.technical_service_youth sy on sy.service_id=s.id
      where sy.youth_id=(v_doc->>'youth_id')::uuid and s.program_type='pvida'
        and s.status<>'cancelado' and s.service_date<=v_date
      order by s.service_date desc,s.created_at desc,s.id desc limit 1;
    end if;
    insert into public.methodology_form_submissions
      (form_slug,youth_id,payload,sensitivity,record_state,source_type,source_id,created_by)
    values (v_doc->>'form_slug',(v_doc->>'youth_id')::uuid,
      coalesce(v_doc->'payload','{}'::jsonb)||jsonb_build_object('_pvida_service_id',v_related_pvida),
      'technical',coalesce(nullif(v_doc->>'record_state',''),'complete'),
      'technical_service_records',v_service.id,auth.uid())
    returning id into v_doc_id;
    if v_first_doc is null and v_doc->>'form_slug'=v_type then v_first_doc:=v_doc_id; end if;
  end loop;
  for v_youth in select distinct unnest(p_youth_ids) loop
    -- O resumo técnico não é copiado para a tabela de acesso ampliado.
    insert into public.service_records(youth_id,service_date,category,description,status)
    values (v_youth,v_date,case v_type when 'pvida' then 'PVida' when 'ptrampo' then 'PTrampo' else 'Outras Demandas' end,
      'Atendimento realizado pela Equipe Técnica',coalesce(p_record->>'status','realizado'));
    insert into public.journey_events(youth_id,event_type,title,details,visibility,event_date,source_type,source_id,created_by)
    values (v_youth,'atendimento',case v_type when 'pvida' then 'PVida' when 'ptrampo' then 'PTrampo' else 'Outras Demandas' end,
      'Atendimento técnico registrado','technical',v_date::timestamp at time zone 'America/Sao_Paulo',
      'technical_service_records',v_service.id,auth.uid());
  end loop;
  update public.technical_service_records set source_form_submission_id=v_first_doc where id=v_service.id;
  return jsonb_build_object('id',v_service.id,'source_form_submission_id',v_first_doc);
end $$;
revoke all on function public.save_methodological_technical_service(jsonb,uuid[],uuid[],jsonb) from public,anon;
grant execute on function public.save_methodological_technical_service(jsonb,uuid[],uuid[],jsonb) to authenticated;

-- Agregação usa o ID do jovem; múltiplos registros da mesma pessoa não duplicam
-- o indicador mensal. Excluem-se registros espelhados ou ligados à execução coletiva.
create or replace function app_private.sync_technical_fortalece_indicator(p_service_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.technical_service_records;
begin
  delete from public.indicator_events
   where source_type='technical_service_records' and source_id=p_service_id
     and indicator_code in ('M6.2_PVIDA_JOVENS','M6.2_OUTRAS_DEMANDAS');
  select * into s from public.technical_service_records where id=p_service_id;
  if not found or s.status='cancelado' or s.program_type not in ('pvida','outras-demandas')
     or s.legacy_service_record_id is not null or s.source_technical_action_plan_id is not null then return; end if;
  insert into public.indicator_events(indicator_code,youth_id,event_date,quantity,source_type,source_id)
  select 'M6.2_PVIDA_JOVENS',y.youth_id,s.service_date,1,'technical_service_records',s.id
  from public.technical_service_youth y where y.service_id=s.id;
  if s.program_type='outras-demandas' then
    insert into public.indicator_events(indicator_code,youth_id,event_date,quantity,source_type,source_id)
    select 'M6.2_OUTRAS_DEMANDAS',y.youth_id,s.service_date,1,'technical_service_records',s.id
    from public.technical_service_youth y where y.service_id=s.id;
  end if;
end $$;
revoke all on function app_private.sync_technical_fortalece_indicator(uuid) from public,anon,authenticated;
create or replace function app_private.trg_sync_technical_fortalece()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='technical_service_youth' then
    if tg_op in ('UPDATE','DELETE') then perform app_private.sync_technical_fortalece_indicator(old.service_id); end if;
    if tg_op in ('INSERT','UPDATE') then perform app_private.sync_technical_fortalece_indicator(new.service_id); end if;
  else
    perform app_private.sync_technical_fortalece_indicator(case when tg_op='DELETE' then old.id else new.id end);
  end if;
  return coalesce(new,old);
end $$;
revoke all on function app_private.trg_sync_technical_fortalece() from public,anon,authenticated;
drop trigger if exists trg_technical_fortalece_record on public.technical_service_records;
create trigger trg_technical_fortalece_record after insert or update or delete on public.technical_service_records
  for each row execute function app_private.trg_sync_technical_fortalece();
drop trigger if exists trg_technical_fortalece_youth on public.technical_service_youth;
create trigger trg_technical_fortalece_youth after insert or update or delete on public.technical_service_youth
  for each row execute function app_private.trg_sync_technical_fortalece();
update public.indicator_catalog set label='Jovens em PVida e Outras Demandas — Fortalece Família'
where code='M6.2_PVIDA_JOVENS';
do $$ declare r record; begin
  for r in select id from public.technical_service_records
    where program_type in ('pvida','outras-demandas')
      and legacy_service_record_id is null and source_technical_action_plan_id is null
  loop perform app_private.sync_technical_fortalece_indicator(r.id); end loop;
end $$;

-- Acompanhamentos já registrados pelo fluxo anterior de Outras Demandas
-- também integram a mesma meta, sem converter a demanda em um PVida.
create or replace function app_private.sync_other_demand_fortalece_followup()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='DELETE' then return old; end if;
  if lower(coalesce(new.followup_type,'')) like '%outras%'
     and lower(coalesce(new.status,'')) not in ('cancelado','cancelada','excluido','rascunho') then
    insert into public.indicator_events(indicator_code,youth_id,event_date,quantity,source_type,source_id)
    values ('M6.2_PVIDA_JOVENS',new.youth_id,new.followup_date,1,'followups',new.id)
    on conflict (indicator_code,source_type,source_id,youth_id)
    do update set event_date=excluded.event_date,quantity=excluded.quantity;
  end if;
  return new;
end $$;
revoke all on function app_private.sync_other_demand_fortalece_followup() from public,anon,authenticated;
drop trigger if exists zz_followup_fortalece_indicator on public.followups;
create trigger zz_followup_fortalece_indicator after insert or update on public.followups
  for each row execute function app_private.sync_other_demand_fortalece_followup();
insert into public.indicator_events(indicator_code,youth_id,event_date,quantity,source_type,source_id)
select 'M6.2_PVIDA_JOVENS',f.youth_id,f.followup_date,1,'followups',f.id
from public.followups f
where lower(coalesce(f.followup_type,'')) like '%outras%'
  and lower(coalesce(f.status,'')) not in ('cancelado','cancelada','excluido','rascunho')
on conflict (indicator_code,source_type,source_id,youth_id)
do update set event_date=excluded.event_date,quantity=excluded.quantity;
