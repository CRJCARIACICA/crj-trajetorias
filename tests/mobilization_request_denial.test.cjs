const {PGlite}=require('@electric-sql/pglite');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {parseHTML}=require('linkedom');
const test=require('node:test'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>readFileSync(path.join(root,p),'utf8');
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;

test('recusa guarda a decisão, avisa o solicitante e protege a cobertura',async t=>{
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(`
  create role anon; create role authenticated; create schema auth; create schema app_private;
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table public.profiles(id uuid primary key,display_name text,role text,team text,active boolean);
  create function app_private.is_active_staff() returns boolean language sql stable security definer as $$select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active)$$;
  create function app_private.has_any_role(a text[]) returns boolean language sql stable security definer as $$select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and p.role=any(a))$$;
  create function app_private.is_articulation_role() returns boolean language sql stable security definer as $$select exists(select 1 from public.profiles p where p.id=auth.uid() and p.active and p.role in ('articulador','coordenacao_articulacao','coordenacao_geral'))$$;
  create table public.articulation_mobilization_requests(id uuid primary key,source_title text,objective text,requested_by uuid,status text constraint articulation_mobilization_requests_status_check check(status in ('solicitado','em_elaboracao','planejado','em_mobilizacao','concluido','relatorio_finalizado','dispensado','cancelado')),planned_date date,target_audience text,territories text[],expected_participants integer,updated_at timestamptz default now());
  create table public.articulation_mobilization_plans(id uuid primary key default gen_random_uuid(),request_id uuid unique,articulator_user_id uuid,mobilization_goal text,target_audience text,territories text[],attendance_target integer,strategies text[],main_message text,places text,partners text,materials text,responsible_text text,schedule_text text,mobilization_deadline date,notes text,status text,record_state text,updated_at timestamptz default now());
  create table public.articulation_mobilization_strategies(id uuid primary key,source_plan_id uuid,source_strategy text,title text,channel text,objective text,territory text,location text,reference_user_id uuid,collaborator_ids uuid[],deadline date,preparation_steps text,execution_steps text,resources text,request_ids uuid[],review_status text,revision integer default 1,updated_at timestamptz default now(),updated_by uuid);
  create table public.articulation_mobilization_actions(id uuid primary key,strategy_ids uuid[],request_ids uuid[],revision integer default 1,updated_at timestamptz,updated_by uuid,cancelled boolean default false);
  create table public.articulation_mobilization_executions(id uuid,action_id uuid,completed boolean,report_status text);
  create table public.articulation_mobilization_interests(id uuid,action_id uuid);
  create table public.team_threads(id uuid primary key default gen_random_uuid(),source_type text,source_id uuid,created_by uuid,status text default 'aberto',updated_at timestamptz default now());
  create table public.team_thread_messages(id uuid primary key default gen_random_uuid(),thread_id uuid,sender_user_id uuid,message_type text,body text,metadata jsonb);
  create function app_private.ensure_team_thread(a text,b text,c text,d uuid,e uuid,f uuid,g text,h text,i jsonb) returns uuid language plpgsql as $$declare x uuid;begin insert into public.team_threads(source_type,source_id,created_by) values(c,d,e) returning id into x;return x;end$$;
  create function app_private.mobilization_command(cmd text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
  declare row record; count_imported integer:=0; missing integer; mon date;
  begin
    if cmd='import' then mon:=(p->>'month')::date;
      for row in select pl.* from public.articulation_mobilization_plans pl join public.articulation_mobilization_requests r on r.id=pl.request_id where pl.status<>'cancelado' and (date_trunc('month',r.planned_date)::date=mon) loop count_imported:=count_imported+1;end loop;
    end if;
    select count(*) into missing from public.articulation_mobilization_requests r where r.status not in ('cancelado','concluido','relatorio_finalizado');
    return jsonb_build_object('imported',count_imported,'missing',missing);
  end $$;
  insert into profiles values ('${id(1)}','Coordenação','coordenacao_articulacao','Articulação',true),('${id(2)}','Articulador','articulador','Articulação',true),('${id(3)}','Solicitante','educador','Educação',true),('${id(4)}','Inativo','articulador','Articulação',false);
 `);
 await db.exec(read('sql/mobilization_shared_responses.sql'));
 await db.exec(read('sql/mobilization_request_denial.sql'));
 await db.exec(`
  insert into public.articulation_mobilization_requests(id,source_title,requested_by,status,planned_date,territories) values
  ('${id(11)}','Oficina A','${id(3)}','solicitado','2030-11-20',array[]::text[]),
  ('${id(12)}','Oficina B','${id(3)}','solicitado','2030-11-20',array[]::text[]),
  ('${id(13)}','Com plano','${id(3)}','solicitado','2030-11-20',array[]::text[]),
  ('${id(14)}','Organizada','${id(3)}','solicitado','2030-11-20',array[]::text[]),
  ('${id(15)}','Já concluída','${id(3)}','concluido','2030-11-20',array[]::text[]);
  insert into public.team_threads(source_type,source_id,created_by) values('articulation_mobilization_request','${id(11)}','${id(3)}');
  insert into public.articulation_mobilization_plans(id,request_id,status) values('${id(21)}','${id(13)}','planejado');
  select set_config('request.jwt.claim.sub','${id(2)}',false);
  insert into public.articulation_mobilization_strategies(id,title,channel,request_ids,review_status) values('${id(31)}','Proposta','WhatsApp',array['${id(11)}'::uuid,'${id(12)}'::uuid],'submitted');
  insert into public.articulation_mobilization_actions(id,strategy_ids,request_ids) values('${id(41)}',array[]::uuid[],array['${id(14)}'::uuid]);
 `);
 const deny=(request,reason)=>db.query("update public.articulation_mobilization_requests set status='negado',rejection_reason=$1 where id=$2",[reason,request]);
 await t.test('apenas a Articulação ativa pode recusar, com justificativa',async()=>{
   await db.exec("select set_config('request.jwt.claim.sub','',false)");
   await assert.rejects(()=>deny(id(11),'Sem equipe'),/justificativa|Articulação/);
   await db.exec(`select set_config('request.jwt.claim.sub','${id(3)}',false)`);
   await assert.rejects(()=>deny(id(11),'Sem equipe'),/Somente a equipe de Articulação/);
   await db.exec(`select set_config('request.jwt.claim.sub','${id(4)}',false)`);
   await assert.rejects(()=>deny(id(11),'Sem equipe'),/Somente a equipe de Articulação/);
   await db.exec(`select set_config('request.jwt.claim.sub','${id(1)}',false)`);
   await assert.rejects(()=>deny(id(11),'  '),/justificativa/);
   await assert.rejects(()=>deny(id(13),'Sem equipe'),/já possui resposta/);
   await assert.rejects(()=>deny(id(14),'Sem equipe'),/já está em uma mobilização organizada/);
   await assert.rejects(()=>deny(id(15),'Sem equipe'),/aguardam resposta/);
 });
 await t.test('decisão gera uma mensagem, retira o vínculo e não responde outras solicitações',async()=>{
   await deny(id(11),'  Equipe indisponível neste período.  ');
   const r=(await db.query('select * from public.articulation_mobilization_requests where id=$1',[id(11)])).rows[0];
   assert.equal(r.status,'negado');assert.equal(r.rejection_reason,'Equipe indisponível neste período.');assert.equal(r.rejected_by,id(1));assert(r.rejected_at);
   const s=(await db.query('select * from public.articulation_mobilization_strategies where id=$1',[id(31)])).rows[0];assert.deepEqual(s.request_ids,[id(12)]);assert.equal(s.revision,2);
   assert.equal((await db.query('select count(*) n from public.articulation_mobilization_plans where request_id=$1',[id(12)])).rows[0].n,0);
   const messages=(await db.query('select t.status,m.body,m.sender_user_id from public.team_threads t join public.team_thread_messages m on m.thread_id=t.id where t.source_id=$1',[id(11)])).rows;
   assert.equal(messages.length,1);assert.equal(messages[0].status,'negado');assert.equal(messages[0].sender_user_id,id(1));assert.match(messages[0].body,/Justificativa: Equipe indisponível neste período/);
   assert.equal((await db.query("select app_private.mobilization_command('publish','{}') r")).rows[0].r.missing,3);
 });
 await t.test('histórico não pode ser reaberto nem vinculado em plano, estratégia ou ação',async()=>{
   await assert.rejects(()=>db.query("update public.articulation_mobilization_requests set status='solicitado' where id=$1",[id(11)]),/manter a decisão/);
   await assert.rejects(()=>db.query("update public.articulation_mobilization_requests set rejection_reason='Outro motivo' where id=$1",[id(11)]),/manter a decisão/);
   await assert.rejects(()=>db.query("insert into public.articulation_mobilization_plans(request_id,status) values($1,'planejado')",[id(11)]),/foi negada/);
   await assert.rejects(()=>db.query('update public.articulation_mobilization_strategies set request_ids=request_ids||$1::uuid where id=$2',[id(11),id(31)]),/foi negada/);
   await assert.rejects(()=>db.query("insert into public.articulation_mobilization_actions(id,request_ids) values($1,array[$2::uuid])",[id(42),id(11)]),/foi negada/);
 });
});

function articulationUi(){
 const {window}=parseHTML('<html><head></head><body><div class="content"></div></body></html>');
 const alerts=[],ctx=vm.createContext({window,document:window.document,location:{hash:'#articulacao'},Intl,Date,Map,Set,console,URLSearchParams,alert:s=>alerts.push(s),setTimeout:()=>0,requestAnimationFrame:()=>{},apiMode:()=> 'live',supabaseClient:()=>({})});
 vm.runInContext(read('src/articulation_workspace.js').replace(/^import .*;\r?\n/gm,'').replace('\nboot();','\n'),ctx);
 return {ctx,document:window.document,alerts,eval:code=>vm.runInContext(code,ctx)};
}
test('área separa pendentes e recusadas e mostra o motivo com segurança',()=>{
 const s=articulationUi();s.ctx.rows=[{id:'p',source_type:'oficina',source_title:'Pendente',status:'solicitado'},{id:'d',source_title:'Negada',status:'negado',rejection_reason:'<b>Motivo</b>'},{id:'a',source_title:'Respondida',status:'planejado'}];s.ctx.plans=new Map([['a',{status:'planejado'}]]);
 s.document.querySelector('.content').innerHTML=s.eval('requestsView(rows,plans)');
 const html=s.document.querySelector('.content').innerHTML;
 assert.match(html,/Pendentes \(1\)/);assert.match(html,/Solicitações negadas \(1\)/);assert.match(html,/Solicitação negada por:/);assert(html.includes('&lt;b&gt;Motivo&lt;/b&gt;'));
 assert(s.document.querySelector('[data-reject-request="p"]'));assert.equal(s.document.querySelector('[data-reject-request="d"]'),null);assert.equal(s.document.querySelector('[data-answer-request="d"]'),null);
});
test('formulário exige motivo e salva apenas a solicitação ainda pendente',async()=>{
 const s=articulationUi(),calls=[];s.ctx.request={id:'p',source_title:'Ação',status:'solicitado'};
 s.ctx.supabaseClient=()=>({from(table){const q={update(value){calls.push({table,value,filters:[]});return q},eq(k,v){calls.at(-1).filters.push([k,v]);return q},select(){return q},maybeSingle:async()=>({data:{id:'p'},error:null})};return q}});
 s.eval('rejectMobilizationRequest(request)');const form=s.document.querySelector('#art-modal form'),button=form.querySelector('[type="submit"]'),reason=form.querySelector('[data-f="rejection_reason"]');
 reason.value='   ';await form.onsubmit({preventDefault(){},submitter:button,currentTarget:form});assert.match(s.alerts.at(-1),/Informe a justificativa/);assert.equal(calls.length,0);
 reason.value='  Indisponibilidade de equipe  ';await form.onsubmit({preventDefault(){},submitter:button,currentTarget:form});
 assert.equal(calls.length,1);assert.equal(calls[0].table,'articulation_mobilization_requests');assert.equal(calls[0].value.status,'negado');assert.equal(calls[0].value.rejection_reason,'Indisponibilidade de equipe');assert.deepEqual(calls[0].filters,[['id','p'],['status','solicitado']]);assert.equal(s.document.querySelector('#art-modal'),null);
});
