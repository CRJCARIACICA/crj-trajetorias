const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),test=require('node:test');
const {parseHTML}=require('linkedom');
const {webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const strip=s=>s.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*/gm,'').replace(/\bexport /g,'');
const id=n=>'12345678-1234-4234-8234-'+String(n).padStart(12,'0');
const user={id:id(1),role:'oficineiro',active:true};
const FIELDS=['objective','proposed_activities','resources'];
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
const settle=async()=>{for(let i=0;i<40;i++)await Promise.resolve()};
function setup({storage=new Map(),draftRead=async()=>[],rpc}={}){
  const {window}=parseHTML('<html><head></head><body><section class="content"></section></body></html>');
  const document=window.document,host=document.querySelector('.content'),timers=new Map(),drafts=new Map(),calls=[],downloads=[];let timerId=0;
  const lessons=[1,2].map(n=>({id:id(n+10),plan_id:id(30),lesson_number:n,objective:'',proposed_activities:'',resources:'',updated_at:'2000-01-01T00:00:00+00:00'}));
  const c={
    from(table){
      const q={select(){return q},eq(){return q},in(){return q},order(){return q},limit(){return q},
        single:async()=>({data:{...lessons[0]},error:null}),
        then:(resolve,reject)=>Promise.resolve(draftRead()).then(data=>({data,error:null})).then(resolve,reject)};
      return q;
    },
    rpc:async(name,args)=>{
      calls.push({name,args});
      if(rpc)return rpc(name,args,lessons);
      const row=lessons.find(x=>x.id===args.p_lesson_id);
      Object.assign(row,{objective:args.p_objective.trim(),proposed_activities:args.p_proposed_activities.trim(),resources:args.p_resources.trim(),updated_at:'2026-10-20T17:30:00.123456+00:00'});
      return {data:{ok:true,lesson:{...row}},error:null};
    },
    auth:{getSession:async()=>({data:{session:{access_token:'TEST_SESSION_ONLY'}}})},
    storage:{from:()=>({download:async file=>{downloads.push(file);return {data:new Blob([file.endsWith('.pdf')?'%PDF-fixture':'PKxxfixture']),error:null}}})}
  };
  const objectUrls=[],context=vm.createContext({window,document,location:{hash:'#oficineiro?view=planejamento&month=2026-11-01'},URLSearchParams,Date,Intl,Map,Set,Promise,Uint8Array,TextDecoder,console,
    crypto:webcrypto,alert:message=>calls.push({alert:message}),
    URL:{createObjectURL:blob=>{objectUrls.push(blob);return 'blob:test'},revokeObjectURL:()=>{}},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    apiMode:()=> 'live',supabaseClient:()=>c,CONFIG:{supabaseUrl:'https://example.invalid',supabasePublishableKey:'TEST_PUBLIC_KEY'},
    saveUiDraft:async(key,payload)=>{drafts.set(key,payload);calls.push({draftSaved:key});return {payload}},
    deleteUiDraft:async key=>{drafts.delete(key);calls.push({draftDeleted:key})},
    setTimeout:fn=>{timers.set(++timerId,fn);return timerId},clearTimeout:n=>timers.delete(n),
    fetch:async()=>{throw new Error('Unexpected HTTP request')}
  });
  vm.runInContext(strip(read('src/instructor_planning.js')),context);
  const evalCode=code=>vm.runInContext(code,context);
  const h={window,document,host,context,c,lessons,storage,drafts,calls,downloads,objectUrls,timers,user,
    eval:evalCode,form:n=>host.querySelector('[data-ip-lesson-form="'+lessons[n].id+'"]'),
    async bind(){
      context.fixture={lessons};context.actor=user;
      return evalCode('bindInstructorPlanning(document.querySelector(".content"),fixture,actor)');
    },
    input(form,key,value){const node=form.querySelector('[name="'+key+'"]');node.value=value;node.dispatchEvent(new window.Event('input',{bubbles:true}))},
    save(form){context.testForm=form;context.actor=user;return evalCode('saveInstructorBlock(testForm,actor,{requireComplete:true})')},
    async drain(){
      for(let n=0;n<20;n++){await settle();if(!timers.size)return;const batch=[...timers.values()];timers.clear();for(const fn of batch)await fn()}
      throw new Error('Timers did not stabilize');
    }
  };
  host.innerHTML=lessons.map(l=>'<form data-no-draft data-ip-lesson-form="'+l.id+'" data-ip-updated-at="'+l.updated_at+'">'+
    FIELDS.map(k=>'<textarea name="'+k+'" required></textarea>').join('')+'<div class="ip-actions"><button type="submit">Salvar este bloco</button><span data-ip-save-state></span></div></form>').join('')+
    evalCode("planningEvidenceFooter('2026-11-01',true)");
  return h;
}
function fill(h,form,prefix){for(const k of FIELDS)h.input(form,k,prefix+' '+k)}
test('salvar um bloco preserva todas as descrições digitadas nos demais',async()=>{
  const s=setup();await s.bind();const a=s.form(0),b=s.form(1);fill(s,a,'A');fill(s,b,'B ainda não salvo');
  await s.save(a);
  assert.equal(s.form(0),a);assert.equal(s.form(1),b);
  for(const k of FIELDS)assert.equal(b.querySelector('[name="'+k+'"]').value,'B ainda não salvo '+k);
  assert.equal(s.lessons[1].objective,'');
  assert.match(a.querySelector('[data-ip-save-state]').textContent,/Salvo e conferido/);
  assert(s.storage.has('crj_instructor_plan_v1:'+user.id+':'+s.lessons[1].id));
});
test('erro de salvamento mantém campos, rascunho e botão utilizável',async()=>{
  const s=setup({rpc:async()=>({data:null,error:{message:'Sem conexão'}})});await s.bind();const form=s.form(0);fill(s,form,'Preservar');
  await assert.rejects(s.save(form),/Sem conexão/);
  assert.equal(form.querySelector('[name="objective"]').value,'Preservar objective');
  assert.equal(form.querySelector('button[type="submit"]').disabled,false);
  assert(s.storage.has('crj_instructor_plan_v1:'+user.id+':'+s.lessons[0].id));
  assert.match(form.querySelector('[data-ip-save-state]').textContent,/Sem conexão/);
});
test('resposta sem as três descrições não é apresentada como salvamento bem-sucedido',async()=>{
  const s=setup({rpc:async(name,args)=>({data:{ok:true,lesson:{id:args.p_lesson_id,objective:'',proposed_activities:'',resources:'',updated_at:'2026-10-20'}},error:null})});
  await s.bind();fill(s,s.form(0),'Texto');await assert.rejects(s.save(s.form(0)),/não confirmou todas/);
  assert.equal(s.form(0).dataset.ipDirty,'1');
  assert.equal(s.form(0).querySelector('[name="objective"]').value,'Texto objective');
});
test('texto digitado enquanto a gravação está em andamento vira novo rascunho',async()=>{
  const pending=deferred();let args;
  const s=setup({rpc:async(name,p)=>{args=p;return pending.promise}});await s.bind();const form=s.form(0);fill(s,form,'Primeiro');
  const task=s.save(form);s.input(form,'resources','Novo recurso digitado durante o salvamento');
  pending.resolve({data:{ok:true,lesson:{id:args.p_lesson_id,objective:args.p_objective,proposed_activities:args.p_proposed_activities,resources:args.p_resources,updated_at:'2026-10-20T17:40:00+00:00'}},error:null});await task;
  assert.equal(form.querySelector('[name="resources"]').value,'Novo recurso digitado durante o salvamento');
  assert.equal(form.dataset.ipDirty,'1');
  assert.match(form.querySelector('[data-ip-save-state]').textContent,/novas alterações/);
});
test('rascunhos são recuperados pelo identificador do bloco, sem depender da ordem dos formulários',async()=>{
  const storage=new Map(),first=setup({storage});await first.bind();fill(first,first.form(1),'Bloco 2');
  const second=setup({storage});second.host.insertBefore(second.form(1),second.form(0));await second.bind();
  assert.equal(second.form(1).querySelector('[name="objective"]').value,'Bloco 2 objective');
  assert.equal(second.form(0).querySelector('[name="objective"]').value,'');
  assert.match(second.form(1).querySelector('[data-ip-save-state]').textContent,/Rascunho recuperado/);
});
test('rascunho remoto atrasado não sobrescreve texto que já está sendo digitado',async()=>{
  const remote=deferred(),s=setup({draftRead:()=>remote.promise}),binding=s.bind();
  fill(s,s.form(0),'Digitação atual');
  remote.resolve([{draft_key:'instructor-planning:'+user.id+':'+s.lessons[0].id,expires_at:'2099-01-01',payload:{user_id:user.id,lesson_id:s.lessons[0].id,fields:{objective:'Velho',proposed_activities:'Velho',resources:'Velho'},changed_at:'2098-01-01'}}]);
  await binding;assert.equal(s.form(0).querySelector('[name="objective"]').value,'Digitação atual objective');
});
test('autosave atrasado termina antes da limpeza do rascunho já confirmado',async()=>{
  const s=setup(),remote=deferred();await s.bind();
  s.context.saveUiDraft=async(key,payload)=>{await remote.promise;s.drafts.set(key,payload)};
  fill(s,s.form(0),'Texto');const timer=[...s.timers.values()][0];s.timers.clear();timer();await settle();
  const save=s.save(s.form(0));await settle();remote.resolve();await save;
  assert.equal(s.drafts.size,0);
});
test('conflito entre sessões mantém o rascunho e oferece consulta da versão salva',async()=>{
  const s=setup({rpc:async()=>({error:{code:'40001',message:'Atualizado em outra sessão'}})});await s.bind();fill(s,s.form(0),'Meu texto');
  await assert.rejects(s.save(s.form(0)));
  assert.equal(s.form(0).querySelector('[name="objective"]').value,'Meu texto objective');
  assert(s.form(0).querySelector('[data-ip-consult-saved]'));
});
test('Gerar evidência só fica disponível quando todos os blocos estão completos',async()=>{
  const s=setup();await s.bind();const button=s.host.querySelector('[data-ip-generate-evidence]');
  assert.equal(button.disabled,true);fill(s,s.form(0),'A');assert.equal(button.disabled,true);
  fill(s,s.form(1),'B');assert.equal(button.disabled,false);
  s.input(s.form(1),'resources','   ');assert.equal(button.disabled,true);
});
test('botão geral confirma todos os blocos antes de gerar e disponibiliza PDF e DOCX',async()=>{
  const s=setup();await s.bind();fill(s,s.form(0),'A');fill(s,s.form(1),'B');let fetched=0;
  s.context.fetch=async(url,options)=>{
    fetched++;assert.equal(s.calls.filter(x=>x.name==='workshop_instructor_save_lesson_v2').length,2);
    assert(s.lessons.every(l=>FIELDS.every(k=>l[k].trim())));
    const body=JSON.parse(options.body);assert.equal(body.reference_month,'2026-11-01');assert(body.request_id);
    return {ok:true,json:async()=>({id:id(100),status:'ready',version:1,file_name:'Planejamento_v1',pdf_path:'persistido.pdf',docx_path:'persistido.docx'})};
  };
  const button=s.host.querySelector('[data-ip-generate-evidence]');button.dispatchEvent(new s.window.Event('click'));await settle();
  assert.equal(fetched,1);assert.equal(s.host.querySelectorAll('[data-ip-evidence-download]').length,2);
  assert.match(s.host.querySelector('[data-ip-evidence-state]').textContent,/Evidência armazenada/);
  assert.equal(s.form(0).querySelector('[name="objective"]').value,'A objective');
  assert.equal(button.disabled,false);
});
test('falha na geração não apaga os blocos que acabaram de ser salvos',async()=>{
  const s=setup();await s.bind();fill(s,s.form(0),'A');fill(s,s.form(1),'B');
  s.context.fetch=async()=>({ok:false,json:async()=>({error:'Falha ao armazenar arquivos'})});
  s.host.querySelector('[data-ip-generate-evidence]').dispatchEvent(new s.window.Event('click'));await settle();
  assert.equal(s.form(1).querySelector('[name="resources"]').value,'B resources');
  assert.equal(s.lessons[1].resources,'B resources');
  assert.match(s.host.querySelector('[data-ip-evidence-state]').textContent,/Falha ao armazenar/);
});
test('download usa o arquivo privado armazenado da versão selecionada',async()=>{
  const s=setup();s.context.evidence={id:id(100),status:'ready',version:2,file_name:'Planejamento_v2',pdf_path:'id/versao2.pdf',docx_path:'id/versao2.docx'};
  s.window.HTMLAnchorElement.prototype.click=()=>{};
  await s.eval("downloadPlanningEvidence(evidence,'pdf')");await s.eval("downloadPlanningEvidence(evidence,'docx')");
  assert.deepEqual(s.downloads,['id/versao2.pdf','id/versao2.docx']);assert.equal(s.objectUrls.length,2);
});
test('formulários de bloco usam chave estável e excluem a restauração genérica por índice',()=>{
  const source=read('src/instructor_portal.js'),at=source.indexOf('function lessonHtml('),end=source.indexOf('\nfunction planningHtml',at);
  const html=new Function('esc','fmtDate','time5',source.slice(at,end)+';return lessonHtml({id:"lesson-id",lesson_number:1,updated_at:"now"},{});')(String,String,String);
  assert.match(html,/id="instructor-lesson-lesson-id"/);assert.match(html,/data-no-draft/);
  assert.doesNotMatch(source,/setTimeout\(\(\)=>renderPortal\(true\),350\)/);
});
