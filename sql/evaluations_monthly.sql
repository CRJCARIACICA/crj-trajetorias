-- Avaliações mensais independentes: Anexo 7 (oficina), Anexos 12 e 13 (CFDH).
-- Links de jovens usam token não enumerável; respostas não exigem login ou cadastro.
create table public.evaluation_monthly_cycles (
  id uuid primary key default gen_random_uuid(),
  reference_month date not null check (reference_month = date_trunc('month', reference_month)::date),
  form_slug text not null check (form_slug in ('avaliacao-atividades','cfdh-avaliacao-jovens','cfdh-avaliacao-equipe')),
  workshop_id uuid references public.workshops(id) on delete restrict,
  public_token uuid not null unique default gen_random_uuid(),
  is_open boolean not null default true,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  check ((form_slug='avaliacao-atividades' and workshop_id is not null) or
         (form_slug in ('cfdh-avaliacao-jovens','cfdh-avaliacao-equipe') and workshop_id is null))
);
create unique index evaluation_monthly_cycle_identity on public.evaluation_monthly_cycles
  (reference_month, form_slug, workshop_id) nulls not distinct;
create index if not exists evaluation_cycles_created_by_idx on public.evaluation_monthly_cycles(created_by);
create index if not exists evaluation_cycles_workshop_idx on public.evaluation_monthly_cycles(workshop_id);

create table public.evaluation_monthly_responses (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.evaluation_monthly_cycles(id) on delete restrict,
  response_key uuid not null default gen_random_uuid(),
  staff_user_id uuid references auth.users(id),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cycle_id,response_key),
  unique(cycle_id,staff_user_id)
);
create index evaluation_monthly_responses_cycle on public.evaluation_monthly_responses(cycle_id,created_at);
create index if not exists evaluation_responses_staff_idx on public.evaluation_monthly_responses(staff_user_id);

alter table public.evaluation_monthly_cycles enable row level security;
alter table public.evaluation_monthly_responses enable row level security;
revoke all on public.evaluation_monthly_cycles, public.evaluation_monthly_responses from public, anon, authenticated;
grant select on public.evaluation_monthly_cycles, public.evaluation_monthly_responses to authenticated;
grant insert(reference_month,form_slug,workshop_id) on public.evaluation_monthly_cycles to authenticated;
grant update(is_open) on public.evaluation_monthly_cycles to authenticated;

create policy evaluation_cycles_read on public.evaluation_monthly_cycles for select to authenticated
  using (app_private.is_active_staff() and app_private.has_any_role(array['coordenacao_geral','educador','assistente_social','psicologo','terapeuta_ocupacional']));
create policy evaluation_cycles_insert on public.evaluation_monthly_cycles for insert to authenticated
  with check (app_private.is_active_staff() and app_private.has_any_role(array['coordenacao_geral','educador','assistente_social','psicologo','terapeuta_ocupacional']) and created_by=(select auth.uid()));
create policy evaluation_cycles_update on public.evaluation_monthly_cycles for update to authenticated
  using (app_private.is_active_staff() and app_private.has_any_role(array['coordenacao_geral','educador','assistente_social','psicologo','terapeuta_ocupacional']))
  with check (app_private.is_active_staff() and app_private.has_any_role(array['coordenacao_geral','educador','assistente_social','psicologo','terapeuta_ocupacional']));
create policy evaluation_responses_read on public.evaluation_monthly_responses for select to authenticated
  using (app_private.is_active_staff() and app_private.has_any_role(array['coordenacao_geral','educador','assistente_social','psicologo','terapeuta_ocupacional']));

create or replace function app_private.validate_monthly_evaluation(p_slug text,p_payload jsonb)
returns void language plpgsql immutable set search_path='' as $$
declare allowed text[]; ratings text[]; item record; answered integer:=0;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' or length(p_payload::text)>16000 then
    raise exception 'Avaliação inválida ou muito longa.' using errcode='22023';
  end if;
  if p_slug='avaliacao-atividades' then
    allowed:=array['facilitator','cfdh','activity_type','other_activity','class_name','date','organization','space','content','facilitator_rating','learning','notes'];
    ratings:=array['organization','space','content','facilitator_rating','learning'];
  elsif p_slug='cfdh-avaliacao-jovens' then
    allowed:=array['reference_team','class_name','date','participation','group_participation','content','activities','educator_participation','youth_educator_relation','officineiro_participation','youth_officineiro_relation','space','materials','liked_most','liked_least','suggestion','notes'];
    ratings:=array['participation','group_participation','content','activities','educator_participation','youth_educator_relation','officineiro_participation','youth_officineiro_relation','space','materials'];
  elsif p_slug='cfdh-avaliacao-equipe' then
    allowed:=array['reference','class_name','date','participation','engagement','organization','content_fit','methodology','space','materials','planning_time','notes'];
    ratings:=array['participation','engagement','organization','content_fit','methodology','space','materials','planning_time'];
  else raise exception 'Anexo de avaliação inválido.' using errcode='22023';
  end if;
  for item in select key,value from jsonb_each(p_payload) loop
    if not (item.key=any(allowed)) or jsonb_typeof(item.value)<>'string' or length(item.value#>>'{}')>2500 then
      raise exception 'Campo de avaliação inválido: %',item.key using errcode='22023';
    end if;
    if item.key=any(ratings) and item.value#>>'{}'<>'' then
      if not ((item.value#>>'{}')=any(array['Péssimo(a)','Ruim','Regular','Bom/Boa','Ótimo(a)'])) then
        raise exception 'Resposta de avaliação inválida: %',item.key using errcode='22023';
      end if;
      answered:=answered+1;
    end if;
  end loop;
  if answered=0 then raise exception 'Responda pelo menos um dos itens de avaliação.' using errcode='22023'; end if;
  if p_slug='avaliacao-atividades' and coalesce(p_payload->>'cfdh','') not in ('','Sim','Não') then
    raise exception 'Resposta sobre CFDH inválida.' using errcode='22023';
  end if;
end $$;
revoke all on function app_private.validate_monthly_evaluation(text,jsonb) from public,anon,authenticated;

-- A existência do ciclo é separada por mês, anexo e oficina; cliques simultâneos reutilizam o mesmo link.
create or replace function public.evaluation_ensure_month(p_slug text,p_month date,p_workshop_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare c public.evaluation_monthly_cycles%rowtype;
begin
  if auth.uid() is null or not app_private.is_active_staff() or not app_private.has_any_role(array['coordenacao_geral','educador','assistente_social','psicologo','terapeuta_ocupacional']) then
    raise exception 'Sem permissão para gerenciar avaliações.' using errcode='42501';
  end if;
  if p_month is null or p_month<>date_trunc('month',p_month)::date then raise exception 'Mês de referência inválido.' using errcode='22023'; end if;
  if p_slug='avaliacao-atividades' then
    if p_workshop_id is null or not exists(select 1 from public.workshops w where w.id=p_workshop_id) then raise exception 'Oficina não encontrada.' using errcode='22023'; end if;
  elsif p_slug in ('cfdh-avaliacao-jovens','cfdh-avaliacao-equipe') then
    if p_workshop_id is not null then raise exception 'O CFDH usa o mês como referência.' using errcode='22023'; end if;
  else raise exception 'Anexo de avaliação inválido.' using errcode='22023';
  end if;
  insert into public.evaluation_monthly_cycles(reference_month,form_slug,workshop_id)
    values(p_month,p_slug,p_workshop_id) on conflict (reference_month,form_slug,workshop_id) do nothing;
  select * into c from public.evaluation_monthly_cycles where reference_month=p_month and form_slug=p_slug and workshop_id is not distinct from p_workshop_id;
  if not found then raise exception 'Não foi possível localizar a avaliação.'; end if;
  return jsonb_build_object('id',c.id,'reference_month',c.reference_month,'form_slug',c.form_slug,'workshop_id',c.workshop_id,'public_token',c.public_token,'is_open',c.is_open);
end $$;
revoke all on function public.evaluation_ensure_month(text,date,uuid) from public,anon,authenticated;
grant execute on function public.evaluation_ensure_month(text,date,uuid) to authenticated;

-- Apenas informações necessárias ao formulário público são devolvidas mediante o token.
create or replace function public.evaluation_public_context(p_token uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.evaluation_monthly_cycles%rowtype; label text;
begin
  select * into c from public.evaluation_monthly_cycles where public_token=p_token and is_open and form_slug in ('avaliacao-atividades','cfdh-avaliacao-jovens');
  if not found then raise exception 'Link inválido ou avaliação encerrada.' using errcode='22023'; end if;
  if c.workshop_id is not null then select name into label from public.workshops where id=c.workshop_id; end if;
  return jsonb_build_object('form_slug',c.form_slug,'reference_month',c.reference_month,'workshop_name',coalesce(label,''));
end $$;
revoke all on function public.evaluation_public_context(uuid) from public,anon,authenticated;
grant execute on function public.evaluation_public_context(uuid) to anon,authenticated;

create or replace function public.evaluation_public_submit(p_token uuid,p_response_key uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.evaluation_monthly_cycles%rowtype; normalized jsonb; label text;
begin
  if p_response_key is null then raise exception 'Identificador de envio inválido.' using errcode='22023'; end if;
  select * into c from public.evaluation_monthly_cycles where public_token=p_token and is_open and form_slug in ('avaliacao-atividades','cfdh-avaliacao-jovens');
  if not found then raise exception 'Link inválido ou avaliação encerrada.' using errcode='22023'; end if;
  perform app_private.validate_monthly_evaluation(c.form_slug,p_payload);
  normalized:=p_payload;
  if c.form_slug='avaliacao-atividades' then
    select name into label from public.workshops where id=c.workshop_id;
    normalized:=normalized||jsonb_build_object('activity_type','Oficina','class_name',coalesce(label,''));
  end if;
  insert into public.evaluation_monthly_responses(cycle_id,response_key,payload)
    values(c.id,p_response_key,normalized) on conflict (cycle_id,response_key) do nothing;
  return jsonb_build_object('received',true);
end $$;
revoke all on function public.evaluation_public_submit(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.evaluation_public_submit(uuid,uuid,jsonb) to anon,authenticated;

create or replace function public.evaluation_staff_submit(p_cycle_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.evaluation_monthly_cycles%rowtype;
begin
  if auth.uid() is null or not app_private.is_active_staff() or not app_private.has_any_role(array['coordenacao_geral','educador','assistente_social','psicologo','terapeuta_ocupacional']) then
    raise exception 'Sem permissão para responder a avaliação da equipe.' using errcode='42501';
  end if;
  select * into c from public.evaluation_monthly_cycles where id=p_cycle_id and form_slug='cfdh-avaliacao-equipe' and is_open;
  if not found then raise exception 'Avaliação da equipe indisponível.' using errcode='22023'; end if;
  perform app_private.validate_monthly_evaluation(c.form_slug,p_payload);
  insert into public.evaluation_monthly_responses(cycle_id,staff_user_id,payload)
    values(c.id,auth.uid(),p_payload)
    on conflict(cycle_id,staff_user_id) do update set payload=excluded.payload,updated_at=now();
  return jsonb_build_object('saved',true);
end $$;
revoke all on function public.evaluation_staff_submit(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.evaluation_staff_submit(uuid,jsonb) to authenticated;
