const {PGlite}=require('@electric-sql/pglite');
const {readFile}=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const test=require('node:test');

// Banco local isolado com as colunas usadas pelo painel, sem dados reais.
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
test('referências e monitoramento respeitam funções, modo desenvolvedor e consolidação',async t=>{
  const db=new PGlite();
  t.after(()=>db.close());
  await db.exec(`
    create role anon; create role authenticated; create schema auth; create schema app_private;
    grant usage on schema auth,app_private,public to authenticated,anon;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table public.profiles(id uuid primary key,display_name text,role text,team text,active boolean,developer_preview_enabled boolean default false);
    create table app_private.developer_accounts(user_id uuid,enabled boolean,active_scope text,active_role text,base_role text);
    create function app_private."current_role"() returns text language sql stable security definer as $$ select role from public.profiles where id=auth.uid() and active $$;
    create function app_private.is_active_staff() returns boolean language sql stable security definer as $$ select exists(select 1 from public.profiles where id=auth.uid() and active and role<>'pendente') $$;
    create function app_private.developer_total_mode() returns boolean language sql stable security definer as $$ select exists(select 1 from app_private.developer_accounts where user_id=auth.uid() and enabled and active_scope='geral' and active_role is not null) $$;
    create function app_private.has_any_role(allowed text[]) returns boolean language sql stable security definer as $$ select case when app_private.developer_total_mode() then true else coalesce(app_private."current_role"()=any(allowed),false) end $$;
    create table public.young_people(id uuid primary key,birth_date date,status text);
    create table public.workshops(id uuid primary key,name text,active boolean,educator_user_id uuid);
    create table public.attendance(id uuid,attendance_date date,youth_id uuid,workshop_id uuid,present boolean);
    create table public.provisional_people(id uuid,linked_youth_id uuid,birth_date date);
    create table public.workshop_guest_participations(id uuid,participation_date date,provisional_person_id uuid,workshop_id uuid);
    create table public.technical_service_records(id uuid,service_date date,program_type text,status text,legacy_service_record_id uuid);
    create table public.technical_service_youth(service_id uuid,youth_id uuid);
    create table public.technical_action_plans(id uuid,action_type text);
    create table public.technical_action_executions(id uuid,plan_id uuid,execution_date date,execution_status text,service_record_id uuid);
    create table public.technical_action_attendance(execution_id uuid,youth_id uuid,present boolean);
    create table public.service_records(id uuid,service_date date,category text,status text,youth_id uuid);
    create table public.followups(id uuid,followup_date date,youth_id uuid,status text);
    create table public.cfdh_attendance(id uuid,attendance_date date,youth_id uuid,present boolean);
    create table public.access_daily_lists(id uuid,list_date date);
    create table public.access_presence_records(id uuid,list_id uuid,youth_id uuid,birth_date date);
    create table public.access_presence_rooms(presence_id uuid,room_id uuid);
    create table public.access_resources(id uuid,name text,active boolean,resource_type text,allow_free_use boolean);
    grant select on public.profiles to authenticated;
  `);
  await db.exec(await readFile(path.join(__dirname,'../sql/articulation_youth_monitor.sql'),'utf8'));
  await db.exec(`
    insert into profiles(id,display_name,role,team,active) values
      ('${id(1)}','Articulador','articulador','Articulação',true),('${id(2)}','Educadora','educador','Educadores',true),
      ('${id(3)}','Oficineiro','oficineiro','Oficineiros',true),('${id(4)}','Coordenação','coordenacao_geral','Gestão',true),
      ('${id(5)}','Segunda articuladora','articulador','Articulação',true),('${id(6)}','Desenvolvedor','articulador','Articulação',true),
      ('${id(7)}','Desenvolvedor inativo','educador','Educadores',false);
    update profiles set developer_preview_enabled=true where id in ('${id(6)}','${id(7)}');
    insert into app_private.developer_accounts values ('${id(6)}',true,'geral','coordenacao_geral','educador'),('${id(7)}',true,'geral','coordenacao_geral','educador');
    insert into educator_articulator_assignments(educator_user_id,articulator_user_id) values('${id(2)}','${id(1)}');
    insert into young_people values ('${id(11)}','2006-01-01','ativo'),('${id(12)}','2009-01-01','ativo');
    insert into workshops values ('${id(21)}','Oficina A',true,'${id(2)}'),('${id(22)}','Oficina B',true,null);
    insert into attendance values ('${id(31)}','2026-10-01','${id(11)}','${id(21)}',true),('${id(32)}','2026-10-01','${id(12)}','${id(22)}',true),('${id(33)}','2026-10-02','${id(11)}','${id(21)}',true),('${id(34)}','2026-10-02','${id(12)}','${id(21)}',false);
    insert into provisional_people values ('${id(40)}',null,'2005-03-01');
    insert into workshop_guest_participations values ('${id(41)}','2026-10-01','${id(40)}','${id(22)}');
    insert into technical_service_records values ('${id(51)}','2026-10-01','pvida','realizado','${id(55)}'),('${id(52)}','2026-10-02','ptrampo','realizado',null);
    insert into technical_service_youth values ('${id(51)}','${id(11)}'),('${id(52)}','${id(12)}');
    insert into service_records values ('${id(55)}','2026-10-01','PVida','realizado','${id(11)}');
    insert into technical_action_plans values ('${id(61)}','pvida'),('${id(62)}','ptrampo');
    insert into technical_action_executions values ('${id(71)}','${id(61)}','2026-10-01','realizada','${id(51)}'),('${id(72)}','${id(62)}','2026-10-02','realizada','${id(52)}');
    insert into technical_action_attendance values ('${id(71)}','${id(11)}',true),('${id(72)}','${id(12)}',true);
    insert into access_daily_lists values ('${id(81)}','2026-10-01'),('${id(82)}','2026-10-02');
    insert into access_resources values ('${id(91)}','Sala 1',true,'room',true),('${id(92)}','Sala 2',true,'room',true);
    insert into access_presence_records values ('${id(101)}','${id(81)}','${id(11)}',null),('${id(102)}','${id(82)}','${id(12)}',null);
    insert into access_presence_rooms values ('${id(101)}','${id(91)}'),('${id(101)}','${id(92)}'),('${id(102)}','${id(92)}');
  `);
  await db.exec('set role authenticated');
  const as=async n=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[n?id(n):'']);
  const get=async(scope,item=null)=>(await db.query('select public.articulation_youth_monitor($1,$2,$3,$4) as result',['2026-10-01','2026-10-02',scope,item])).rows[0].result;
  const save=async ids=>db.query('select public.save_educator_articulator_assignments($1,$2)',[id(2),ids.map(id)]);
  await t.test('conta pessoas, participações e dias sem duplicar atendimento vinculado',async()=>{
    await as(1);const all=await get('all');assert.equal(all.people,3);assert.equal(all.participations,8);assert.equal(all.days,2);assert.equal(all.average,2.5);
    assert.equal((await get('reference')).participations,2);assert.equal((await get('reference')).people,1);
    assert.equal((await get('workshop',id(22))).people,2);assert.equal((await get('pvida')).participations,1);assert.equal((await get('ptrampo')).participations,1);
    assert.equal((await get('free')).participations,2);assert.equal((await get('room',id(91))).participations,1);
  });
  await t.test('articulador comum não pode alterar referências',async()=>{
    await as(1);await assert.rejects(()=>save([1,5]),/Somente a Coordenação Geral/);
  });
  await t.test('modo desenvolvedor total autorizado pode salvar várias referências',async()=>{
    await as(6);await save([1,5]);const rows=await db.query('select count(*) as n from educator_articulator_assignments');assert.equal(Number(rows.rows[0].n),2);
    await assert.rejects(()=>save([3]),/Selecione somente articuladores ativos/);assert.equal(Number((await db.query('select count(*) as n from educator_articulator_assignments')).rows[0].n),2);
  });
  await t.test('desenvolvedor em Coordenação Geral continua elegível pela função base de educador',async()=>{
    await db.exec(`reset role; update profiles set role='coordenacao_geral',team='Coordenação' where id='${id(6)}'; update app_private.developer_accounts set active_scope='coordenacao',active_role='coordenacao_geral' where user_id='${id(6)}'; set role authenticated;`);
    await as(6);await db.query('select public.save_educator_articulator_assignments($1,$2)',[id(6),[id(1)]]);
    assert.equal(Number((await db.query('select count(*) as n from educator_articulator_assignments where educator_user_id=$1',[id(6)])).rows[0].n),1);
  });
  await t.test('uma futura conta de Coordenação Geral pode atualizar e limpar referências',async()=>{
    await as(4);await save([5]);assert.equal(Number((await db.query('select count(*) as n from educator_articulator_assignments where educator_user_id=$1',[id(2)])).rows[0].n),1);await save([]);assert.equal(Number((await db.query('select count(*) as n from educator_articulator_assignments where educator_user_id=$1',[id(2)])).rows[0].n),0);
  });
  await t.test('contas inativas, outros perfis e acessos anônimos permanecem bloqueados',async()=>{
    await as(7);await assert.rejects(()=>save([1]),/Somente a Coordenação Geral/);await assert.rejects(()=>get('all'),/Acesso permitido/);
    await as(3);await assert.rejects(()=>get('all'),/Acesso permitido/);
    await as(null);await assert.rejects(()=>get('all'),/Acesso permitido/);
  });
});
