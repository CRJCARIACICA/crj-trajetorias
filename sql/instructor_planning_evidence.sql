-- Rascunhos usam a tabela ui_drafts já existente. Evidências são snapshots
-- imutáveis; somente o servidor publica os arquivos privados.
create table if not exists public.workshop_instructor_evidences (
  id uuid primary key default gen_random_uuid(),
  instructor_user_id uuid not null default auth.uid() references public.profiles(id),
  created_by uuid not null default auth.uid() references public.profiles(id),
  request_id uuid not null,
  reference_month date not null check (extract(day from reference_month)=1),
  version integer not null check (version>0),
  plan_ids uuid[] not null,
  educator_user_ids uuid[] not null default '{}',
  snapshot jsonb not null,
  source_hash text not null,
  status text not null default 'pending' check (status in ('pending','generating','ready','failed')),
  pdf_path text,
  docx_path text,
  file_name text,
  pdf_sha256 text,
  docx_sha256 text,
  pdf_bytes bigint,
  docx_bytes bigint,
  processing_token uuid,
  processing_started_at timestamptz,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (instructor_user_id,request_id),
  unique (instructor_user_id,reference_month,version),
  check (status<>'ready' or (pdf_path is not null and docx_path is not null and pdf_bytes>0 and docx_bytes>0))
);
create index if not exists workshop_instructor_evidences_owner_month
  on public.workshop_instructor_evidences(instructor_user_id,reference_month desc,created_at desc);
create index if not exists workshop_instructor_evidences_educators
  on public.workshop_instructor_evidences using gin(educator_user_ids);
alter table public.workshop_instructor_evidences enable row level security;
revoke all on public.workshop_instructor_evidences from public,anon,authenticated;
grant select on public.workshop_instructor_evidences to authenticated;
grant insert(reference_month,request_id) on public.workshop_instructor_evidences to authenticated;
grant all on public.workshop_instructor_evidences to service_role;

create policy instructor_evidences_select on public.workshop_instructor_evidences
for select to authenticated using (
  app_private.is_active_staff() and (
    instructor_user_id=(select auth.uid())
    or exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and (
      p.role::text in ('coordenacao_geral','administrativo','monitoramento')
      or (p.role::text='educador' and p.id=any(educator_user_ids))
    ))
  )
);
create policy instructor_evidences_insert on public.workshop_instructor_evidences
for insert to authenticated with check (
  instructor_user_id=(select auth.uid()) and created_by=(select auth.uid())
  and status='pending' and pdf_path is null and docx_path is null
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.role::text='oficineiro')
);

create or replace function app_private.prepare_instructor_planning_evidence()
returns trigger language plpgsql security invoker set search_path='' as $fn$
declare
  actor uuid:=auth.uid();
  actor_name text;
  plans jsonb;
  total_lessons integer;
  complete_lessons integer;
begin
  select display_name into actor_name from public.profiles
   where id=actor and active and role::text='oficineiro';
  if actor is null or actor_name is null then
    raise exception 'Somente o oficineiro ativo pode gerar sua evidência.' using errcode='42501';
  end if;
  if new.reference_month is null or extract(day from new.reference_month)<>1 then
    raise exception 'Competência inválida.' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||'/'||new.reference_month::text,0));
  -- Uma única consulta captura cabeçalhos e blocos no mesmo snapshot MVCC.
  select jsonb_agg(jsonb_build_object(
    'id',p.id,'workshop_id',p.workshop_id,'workshop_name',coalesce(w.name,'Oficina'),
    'plan_month',p.plan_month,'educator_user_id',coalesce(p.educator_user_id,w.educator_user_id),
    'general_objective',p.general_objective,'general_methodology',p.general_methodology,
    'expected_results',p.expected_results,'general_resources',p.general_resources,
    'observations',p.observations,'updated_at',p.updated_at,
    'lessons',coalesce(l.rows,'[]'::jsonb)
  ) order by coalesce(w.name,''),p.id)
  into plans
  from public.workshop_monthly_plans p
  left join public.workshops w on w.id=p.workshop_id
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id',x.id,'lesson_number',x.lesson_number,'scheduled_date',x.scheduled_date,
      'start_time',x.start_time,'end_time',x.end_time,
      'location_type',x.location_type,'location_other',x.location_other,
      'theme',x.theme,'objective',x.objective,'proposed_activities',x.proposed_activities,
      'resources',x.resources,'cfdh_transversal',x.cfdh_transversal,
      'observations',x.observations,'updated_at',x.updated_at
    ) order by x.scheduled_date,x.lesson_number,x.id) rows
    from public.workshop_plan_lessons x where x.plan_id=p.id and x.included
  ) l on true
  where p.instructor_user_id=actor and p.plan_month=new.reference_month and p.status<>'arquivado';
  if plans is null then
    raise exception 'Não há planejamento disponível nesta competência.' using errcode='P0001';
  end if;
  if exists(select 1 from jsonb_array_elements(plans) p where jsonb_array_length(p->'lessons')=0) then
    raise exception 'Há oficina sem blocos de aula nesta competência. Solicite a conferência da equipe.' using errcode='P0001';
  end if;
  select count(*),count(*) filter(where
    coalesce(btrim(l->>'objective'),'')<>'' and
    coalesce(btrim(l->>'proposed_activities'),'')<>'' and
    coalesce(btrim(l->>'resources'),'')<>'')
  into total_lessons,complete_lessons
  from jsonb_array_elements(plans) p cross join lateral jsonb_array_elements(p->'lessons') l;
  if total_lessons=0 or complete_lessons<>total_lessons then
    raise exception 'Preencha Objetivo, Atividades propostas e Recursos necessários em todos os blocos antes de gerar a evidência.' using errcode='P0001';
  end if;
  new.instructor_user_id:=actor;
  new.created_by:=actor;
  select coalesce(max(e.version),0)+1 into new.version from public.workshop_instructor_evidences e
    where e.instructor_user_id=actor and e.reference_month=new.reference_month;
  select array_agg((p->>'id')::uuid),
         coalesce(array_agg(distinct (p->>'educator_user_id')::uuid) filter(where p->>'educator_user_id' is not null),'{}'::uuid[])
    into new.plan_ids,new.educator_user_ids from jsonb_array_elements(plans) p;
  new.snapshot:=jsonb_build_object('schema_version',1,'instructor_user_id',actor,
    'instructor_name',actor_name,'reference_month',new.reference_month,
    'total_lessons',total_lessons,'plans',plans);
  new.source_hash:=encode(sha256(convert_to(new.snapshot::text,'UTF8')),'hex');
  new.status:='pending';
  new.created_at:=now();new.updated_at:=now();
  new.pdf_path:=null;new.docx_path:=null;
  return new;
end;
$fn$;
revoke all on function app_private.prepare_instructor_planning_evidence() from public,anon,authenticated;
create trigger prepare_instructor_planning_evidence before insert
on public.workshop_instructor_evidences for each row
execute function app_private.prepare_instructor_planning_evidence();

create or replace function public.workshop_create_instructor_evidence(p_reference_month date,p_request_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $fn$
declare evidence public.workshop_instructor_evidences%rowtype;
begin
  if auth.uid() is null then raise exception 'Sessão inválida.' using errcode='42501';end if;
  if p_request_id is null then raise exception 'Solicitação inválida.' using errcode='22023';end if;
  select * into evidence from public.workshop_instructor_evidences
    where instructor_user_id=auth.uid() and request_id=p_request_id;
  if evidence.id is null then
    insert into public.workshop_instructor_evidences(reference_month,request_id)
      values(p_reference_month,p_request_id)
      on conflict(instructor_user_id,request_id) do nothing;
    select * into evidence from public.workshop_instructor_evidences
      where instructor_user_id=auth.uid() and request_id=p_request_id;
  end if;
  if evidence.reference_month is distinct from p_reference_month then
    raise exception 'A solicitação pertence a outra competência.' using errcode='22023';
  end if;
  return jsonb_build_object('id',evidence.id,'status',evidence.status,'version',evidence.version);
end;
$fn$;
revoke all on function public.workshop_create_instructor_evidence(date,uuid) from public,anon;
grant execute on function public.workshop_create_instructor_evidence(date,uuid) to authenticated;

-- A operação de escrita já é restrita ao titular no RPC existente. Esta camada
-- privada acrescenta trava, controle de versão e cópia anterior/posterior.
create or replace function app_private.instructor_save_lesson_checked(
  p_lesson_id uuid,p_objective text,p_proposed_activities text,p_resources text,
  p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path='' as $fn$
declare actor uuid:=auth.uid(); before_row public.workshop_plan_lessons%rowtype;
  owner_id uuid; result jsonb;
begin
  if actor is null or not exists(select 1 from public.profiles p where p.id=actor and p.active and p.role::text='oficineiro') then
    raise exception 'Somente oficineiros ativos podem salvar este bloco.' using errcode='42501';
  end if;
  select l.* into before_row from public.workshop_plan_lessons l where l.id=p_lesson_id for update;
  select instructor_user_id into owner_id from public.workshop_monthly_plans where id=before_row.plan_id;
  if before_row.id is null or owner_id is distinct from actor then
    raise exception 'Bloco não encontrado ou sem permissão.' using errcode='42501';
  end if;
  if coalesce(before_row.objective,'')=btrim(coalesce(p_objective,''))
     and coalesce(before_row.proposed_activities,'')=btrim(coalesce(p_proposed_activities,''))
     and coalesce(before_row.resources,'')=btrim(coalesce(p_resources,'')) then
    return jsonb_build_object('ok',true,'lesson',to_jsonb(before_row),'plan_id',before_row.plan_id,'already_saved',true);
  end if;
  if p_expected_updated_at is null or before_row.updated_at is distinct from p_expected_updated_at then
    raise exception 'Este bloco foi atualizado em outra sessão. Seu texto foi preservado como rascunho; consulte a versão salva antes de continuar.' using errcode='40001';
  end if;
  result:=public.workshop_instructor_update_lesson(p_lesson_id,p_objective,p_proposed_activities,p_resources);
  if coalesce((result->>'ok')::boolean,false) is not true or result->'lesson' is null then
    raise exception 'O banco não confirmou o salvamento. Seu rascunho foi preservado.' using errcode='P0001';
  end if;
  insert into public.workshop_instructor_audit_log(actor_user_id,instructor_user_id,action,details)
    values(actor,actor,'update',jsonb_build_object(
      'type','planning_block_content_backup','lesson_id',p_lesson_id,'plan_id',before_row.plan_id,
      'before_fields',jsonb_build_object('objective',before_row.objective,'proposed_activities',before_row.proposed_activities,'resources',before_row.resources),
      'after_fields',jsonb_build_object('objective',result->'lesson'->>'objective','proposed_activities',result->'lesson'->>'proposed_activities','resources',result->'lesson'->>'resources')));
  return result;
end;
$fn$;
revoke all on function app_private.instructor_save_lesson_checked(uuid,text,text,text,timestamptz) from public,anon;
grant execute on function app_private.instructor_save_lesson_checked(uuid,text,text,text,timestamptz) to authenticated;
create or replace function public.workshop_instructor_save_lesson_v2(
  p_lesson_id uuid,p_objective text,p_proposed_activities text,p_resources text,p_expected_updated_at timestamptz
) returns jsonb language sql security invoker set search_path='' as $fn$
  select app_private.instructor_save_lesson_checked(p_lesson_id,p_objective,p_proposed_activities,p_resources,p_expected_updated_at);
$fn$;
revoke all on function public.workshop_instructor_save_lesson_v2(uuid,text,text,text,timestamptz) from public,anon;
grant execute on function public.workshop_instructor_save_lesson_v2(uuid,text,text,text,timestamptz) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('instructor-planning-evidence','instructor-planning-evidence',false,20971520,
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do nothing;
create policy instructor_planning_files_select on storage.objects
for select to authenticated using (
  bucket_id='instructor-planning-evidence' and exists(
    select 1 from public.workshop_instructor_evidences e
    where e.status='ready' and (e.pdf_path=name or e.docx_path=name)
  )
);
-- Upload, troca de arquivos e confirmação de status pertencem apenas à Edge Function.
notify pgrst,'reload schema';
