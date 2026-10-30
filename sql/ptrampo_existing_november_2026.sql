-- Conversão reversível baseada em dados identificáveis do projeto de novembro/2026.
-- A atividade 4 permanece pendente por decisão do usuário; nenhum registro é apagado.
do $$
declare v_project uuid; v_creator uuid; v_responsible uuid; v_count integer; v_numbers integer[];
begin
  -- Os bloqueios evitam concorrer com edições enquanto se avaliam os mesmos dados.
  perform 1 from public.technical_action_plans p where p.action_type='ptrampo'
    and p.planned_date >= date '2026-11-01' and p.planned_date < date '2026-12-01'
    and (p.title ~ '^\s*[1-8]\.' or (lower(trim(p.title))='elaboração de currículos' and p.planned_date=date '2026-11-18')) for update;
  select count(*),array_agg(distinct (regexp_match(title,'^\s*([1-8])\.'))[1]::int order by (regexp_match(title,'^\s*([1-8])\.'))[1]::int)
    into v_count,v_numbers from public.technical_action_plans
    where action_type='ptrampo' and planned_date >= date '2026-11-01' and planned_date < date '2026-12-01' and title ~ '^\s*[1-8]\.';
  if v_count<>9 or v_numbers<>array[1,2,3,5,6,7,8] then
    raise exception 'As ações numeradas de novembro mudaram; revisar antes da conversão.';
  end if;
  select count(*) into v_count from public.technical_action_plans
    where action_type='ptrampo' and lower(trim(title))='elaboração de currículos' and planned_date=date '2026-11-18';
  if v_count<>1 then raise exception 'O registro de currículos para revisão mudou; conversão interrompida.'; end if;
  select p.created_by,pp.professional_id into v_creator,v_responsible
    from public.technical_action_plans p left join lateral
      (select professional_id from public.technical_action_plan_professionals where plan_id=p.id order by (responsibility='responsavel') desc limit 1) pp on true
    where p.action_type='ptrampo' and p.planned_date=date '2026-11-03' and p.title ~ '^\s*1\.' order by p.created_at desc limit 1;
  insert into public.ptrampo_projects(reference_month,title,responsible_id,status,migration_key,created_by)
    values('2026-11-01','Projeto PTrampo · novembro/2026',v_responsible,'rascunho','novembro-2026-atividades-originais',v_creator)
    on conflict(migration_key) do nothing;
  select id into v_project from public.ptrampo_projects where migration_key='novembro-2026-atividades-originais';
  if exists(select 1 from public.ptrampo_project_actions a join public.technical_action_plans p on p.id=a.technical_plan_id
    where a.project_id<>v_project and p.action_type='ptrampo' and p.planned_date>=date '2026-11-01' and p.planned_date<date '2026-12-01'
      and (p.title ~ '^\s*[1-8]\.' or (lower(trim(p.title))='elaboração de currículos' and p.planned_date=date '2026-11-18'))) then
    raise exception 'Uma das ações já pertence a outro projeto; conversão interrompida.';
  end if;
  -- A cópia mais recente de cada número é a ação editável. As demais versões
  -- continuam disponíveis como histórico, inclusive suas presenças e execuções.
  with numbered as (
    select id,(regexp_match(title,'^\s*([1-8])\.'))[1]::int number,
      row_number() over(partition by (regexp_match(title,'^\s*([1-8])\.'))[1] order by created_at desc,id desc) position
    from public.technical_action_plans where action_type='ptrampo'
      and planned_date>=date '2026-11-01' and planned_date<date '2026-12-01' and title ~ '^\s*[1-8]\.'
  )
  insert into public.ptrampo_project_actions(project_id,technical_plan_id,activity_number,relationship)
    select v_project,id,number,case when position=1 then 'canonical' else 'history' end from numbered
    on conflict(technical_plan_id) do nothing;
  insert into public.ptrampo_project_actions(project_id,technical_plan_id,activity_number,relationship)
    select v_project,id,null,'review' from public.technical_action_plans
    where action_type='ptrampo' and lower(trim(title))='elaboração de currículos' and planned_date=date '2026-11-18'
    on conflict(technical_plan_id) do nothing;
  -- As solicitações são reunidas por títulos constatados no plano e pelo título
  -- da ação 4, mantendo todas as respostas e estratégias já vinculadas.
  perform 1 from public.articulation_mobilization_requests r where r.source_type='ptrampo'
    and r.planned_date>=date '2026-11-01' and r.planned_date<date '2026-12-01'
    and (regexp_replace(r.source_title,'^\s*[1-8]\.\s*','') in (
      select regexp_replace(p.title,'^\s*[1-8]\.\s*','') from public.technical_action_plans p
      where p.action_type='ptrampo' and p.planned_date>=date '2026-11-01' and p.planned_date<date '2026-12-01' and p.title ~ '^\s*[1-8]\.')
      or regexp_replace(r.source_title,'^\s*[1-8]\.\s*','')='Meu primeiro currículo: como apresentar minhas habilidades sem experiência?') for update;
  select count(*) into v_count from public.articulation_mobilization_requests r where r.source_type='ptrampo'
    and r.planned_date>=date '2026-11-01' and r.planned_date<date '2026-12-01'
    and (regexp_replace(r.source_title,'^\s*[1-8]\.\s*','') in (
      select regexp_replace(p.title,'^\s*[1-8]\.\s*','') from public.technical_action_plans p
      where p.action_type='ptrampo' and p.planned_date>=date '2026-11-01' and p.planned_date<date '2026-12-01' and p.title ~ '^\s*[1-8]\.')
      or regexp_replace(r.source_title,'^\s*[1-8]\.\s*','')='Meu primeiro currículo: como apresentar minhas habilidades sem experiência?');
  if v_count<>9 then raise exception 'As solicitações de PTrampo mudaram; revisar antes da conversão.'; end if;
  if exists(select 1 from public.articulation_mobilization_requests r where r.source_type='ptrampo'
    and r.planned_date>=date '2026-11-01' and r.planned_date<date '2026-12-01' and r.ptrampo_project_id is not null and r.ptrampo_project_id<>v_project
    and (regexp_replace(r.source_title,'^\s*[1-8]\.\s*','') in (
      select regexp_replace(p.title,'^\s*[1-8]\.\s*','') from public.technical_action_plans p
      where p.action_type='ptrampo' and p.planned_date>=date '2026-11-01' and p.planned_date<date '2026-12-01' and p.title ~ '^\s*[1-8]\.')
      or regexp_replace(r.source_title,'^\s*[1-8]\.\s*','')='Meu primeiro currículo: como apresentar minhas habilidades sem experiência?')) then
    raise exception 'Uma solicitação já pertence a outro projeto; conversão interrompida.';
  end if;
  update public.articulation_mobilization_requests r set ptrampo_project_id=v_project
    where r.source_type='ptrampo' and r.ptrampo_project_id is null
      and r.planned_date>=date '2026-11-01' and r.planned_date<date '2026-12-01'
      and (regexp_replace(r.source_title,'^\s*[1-8]\.\s*','') in (
        select regexp_replace(p.title,'^\s*[1-8]\.\s*','') from public.technical_action_plans p
        where p.action_type='ptrampo' and p.planned_date>=date '2026-11-01' and p.planned_date<date '2026-12-01' and p.title ~ '^\s*[1-8]\.')
        or regexp_replace(r.source_title,'^\s*[1-8]\.\s*','')='Meu primeiro currículo: como apresentar minhas habilidades sem experiência?');
end $$;
