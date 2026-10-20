const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const strip=s=>s.replace(/^import[\s\S]*?from\s+['"][^'"]+['"];?\s*/gm,'').replace(/\bexport /g,'');
const id=n=>'12345678-1234-4234-8234-'+String(n).padStart(12,'0');
const clone=x=>JSON.parse(JSON.stringify(x));
function renderer(extra={}){
  const ctx=vm.createContext({console,Date,Uint8Array,DataView,atob,TextDecoder,BorderStyle:{SINGLE:1},AlignmentType:{LEFT:1,CENTER:2},...extra});
  vm.runInContext(strip(read('supabase/functions/_shared/instructor_planning_renderer.ts')),ctx);
  return ctx;
}
function fixture(){
  return {id:id(100),instructor_user_id:id(1),reference_month:'2026-11-01',version:1,status:'pending',created_at:'2026-10-20T17:30:00Z',updated_at:'2026-10-20T17:30:00Z',
    snapshot:{instructor_name:'Oficineiro Teste',reference_month:'2026-11-01',total_lessons:1,plans:[{id:id(30),workshop_name:'Oficina de teste',lessons:[{lesson_number:1,scheduled_date:'2026-11-03',start_time:'14:00',end_time:'16:00',theme:'Tema',objective:'Objetivo salvo',proposed_activities:'Atividades salvas',resources:'Recursos salvos'}]}]}};
}
function edge({role='oficineiro',uploadFailure=false,claimFailure=false,pdf,ready=false}={}){
  const row=fixture(),events=[],uploads=[],removed=[];if(ready)Object.assign(row,{status:'ready',file_name:'Anterior',pdf_path:'old.pdf',docx_path:'old.docx'});
  function query(table,service){
    let patch=null;const filters=[];
    const q={select(){return q},eq(k,v){filters.push([k,v]);return q},
      update(value){patch=value;return q},
      single:async()=>{
        if(table==='profiles')return {data:{id:id(1),role,active:true},error:null};
        return {data:row.instructor_user_id===id(1)?clone(row):null,error:null};
      },
      async maybeSingle(){return execute()},
      then(resolve,reject){return Promise.resolve(execute()).then(resolve,reject)}
    };
    function execute(){
      if(!service)throw new Error('Client attempted metadata update');
      if(patch?.status==='generating'&&claimFailure)return {data:null,error:null};
      if(!filters.every(([k,v])=>row[k]===v))return {data:null,error:null};
      Object.assign(row,patch);events.push(patch?.status||'query');return {data:{id:row.id},error:null};
    }
    return q;
  }
  const userClient={auth:{getUser:async()=>({data:{user:{id:id(1)}},error:null})},from:table=>query(table,false),
    rpc:async()=>{events.push('snapshot');return {data:{id:row.id,status:row.status,version:row.version},error:null}}};
  const serviceClient={from:table=>query(table,true),storage:{from:()=>({
    upload:async(path,bytes,options)=>{
      if(uploadFailure&&path.endsWith('.docx'))return {error:{message:'Storage failure'}};
      uploads.push({path,bytes,options});events.push(path.endsWith('.pdf')?'upload-pdf':'upload-docx');return {data:{path},error:null};
    },
    remove:async paths=>{removed.push(...paths);return {error:null}}
  })}};
  const render=renderer(),ctx=vm.createContext({
    console:{error:()=>{}},Request,Response,TextDecoder,Uint8Array,crypto:webcrypto,
    createClient:()=>{},makePdf:()=>{},makeDocx:()=>{},loadHeader:()=>{},
    planningEvidenceSpec:input=>{render.evidence=input;return vm.runInContext('planningEvidenceSpec(evidence)',render)},
    Deno:{serve:()=>{}}
  });
  vm.runInContext(strip(read('supabase/functions/crj-instructor-planning-evidence/index.ts')),ctx);
  ctx.dependencies={
    clientFactory:(url,key)=>key==='server-secret'?serviceClient:userClient,
    env:name=>({SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'server-secret'})[name],
    renderPdf:async()=>pdf||new Uint8Array(Buffer.from('%PDF-TEST')),
    renderDocx:async()=>new Uint8Array([0x50,0x4b,0x03,0x04,1,2,3,4]),
    headerLoader:async()=>({type:'png',bytes:new Uint8Array([1])}),
    uuid:()=>id(200),clock:()=>new Date('2026-10-20T17:35:00Z')
  };
  const handler=vm.runInContext('createEvidenceHandler(dependencies)',ctx);
  return {row,events,uploads,removed,handler,
    request:(body={reference_month:'2026-11-01',request_id:id(300)},auth=true)=>handler(new Request('https://example.invalid/evidence',{method:'POST',headers:{...(auth?{Authorization:'Bearer test-session'}:{}),'Content-Type':'application/json'},body:JSON.stringify(body)}))};
}
test('servidor armazena PDF e DOCX antes de publicar a evidência',async()=>{
  const s=edge(),response=await s.request(),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.status,'ready');assert.equal(s.uploads.length,2);
  assert.deepEqual(s.events,['snapshot','generating','upload-pdf','upload-docx','ready']);
  assert.equal(s.row.pdf_sha256.length,64);assert.equal(s.row.docx_sha256.length,64);
  assert(s.uploads.every(x=>x.options.upsert===false));
  assert.match(s.row.pdf_path,new RegExp('^'+id(1)+'/'+id(100)+'/'));
  assert.equal(body.snapshot,undefined);
});
test('falha em um formato remove o arquivo parcial e mantém a evidência recuperável',async()=>{
  const s=edge({uploadFailure:true}),response=await s.request();
  assert.equal(response.status,500);assert.equal(s.row.status,'failed');
  assert.equal(s.removed.length,1);assert.match(s.removed[0],/\.pdf$/);
  assert.equal(s.row.pdf_path,undefined);assert.equal(s.row.snapshot.plans[0].lessons[0].objective,'Objetivo salvo');
});
test('nova tentativa da mesma evidência pronta devolve os arquivos já armazenados',async()=>{
  const s=edge({ready:true}),response=await s.request(),body=await response.json();
  assert.equal(response.status,200);assert.equal(body.pdf_path,'old.pdf');assert.equal(s.uploads.length,0);
  assert.deepEqual(s.events,['snapshot']);
});
test('disputa de geração retorna em processamento e não faz upload concorrente',async()=>{
  const s=edge({claimFailure:true}),response=await s.request();
  assert.equal(response.status,202);assert.equal(s.uploads.length,0);
});
test('um PDF inválido não é publicado nem carregado no armazenamento',async()=>{
  const s=edge({pdf:new Uint8Array([1,2,3,4,5])}),response=await s.request();
  assert.equal(response.status,500);assert.equal(s.row.status,'failed');assert.equal(s.uploads.length,0);
});
test('perfil sem permissão e requisição sem sessão são recusados antes da geração',async()=>{
  const denied=edge({role:'educador'});assert.equal((await denied.request()).status,403);assert.equal(denied.events.length,0);
  const anonymous=edge();assert.equal((await anonymous.request(undefined,false)).status,401);assert.equal(anonymous.events.length,0);
});
test('competência e identificador da solicitação são validados',async()=>{
  const s=edge();assert.equal((await s.request({reference_month:'2026-13-01',request_id:id(300)})).status,400);
  assert.equal((await s.request({reference_month:'2026-11-01',request_id:'invalid'})).status,400);
  assert.equal(s.uploads.length,0);
});
test('documento usa o conteúdo congelado e inclui as três descrições de cada bloco',()=>{
  const ctx=renderer(),e=fixture();ctx.evidence=e;
  const spec=vm.runInContext('planningEvidenceSpec(evidence)',ctx);
  const table=spec.sections.find(s=>s.table)?.table;
  assert.equal(table.rows[0][4],'Objetivo salvo');assert.equal(table.rows[0][5],'Atividades salvas');assert.equal(table.rows[0][6],'Recursos salvos');
  assert.match(spec.title,/EVIDÊNCIA/);
});
test('PDF pagina descrições extensas até o final sem cortar os textos',async()=>{
  const texts=[],pages=[];
  const doc={
    embedFont:async()=>({}),embedPng:async()=>({scale:()=>({width:500,height:80})}),embedJpg:async()=>({scale:()=>({width:500,height:80})}),
    addPage(){const p={getHeight:()=>595.28,drawImage(){},drawRectangle(){},drawText:text=>texts.push(text)};pages.push(p);return p},
    getPages:()=>pages,getPageCount:()=>pages.length,save:async()=>Buffer.from('%PDF-test')
  };
  const ctx=renderer({PDFDocument:{create:async()=>doc},StandardFonts:{Helvetica:'normal',HelveticaBold:'bold'},rgb:()=>({})});
  const e=fixture(),lesson=e.snapshot.plans[0].lessons[0];
  lesson.objective=('objetivo '.repeat(600))+'FIM_OBJETIVO';
  lesson.proposed_activities=('atividade '.repeat(600))+'FIM_ATIVIDADE';
  lesson.resources=('recurso '.repeat(600))+'FIM_RECURSO';
  ctx.evidence=e;ctx.header={type:'png',bytes:new Uint8Array([1])};
  await vm.runInContext('makePdf(planningEvidenceSpec(evidence),header)',ctx);
  const all=texts.join(' ');
  assert(pages.length>1);assert.match(all,/FIM_OBJETIVO/);assert.match(all,/FIM_ATIVIDADE/);assert.match(all,/FIM_RECURSO/);
});
test('fontes das funções de evidência têm sintaxe válida de módulo',()=>{
  for(const file of ['supabase/functions/_shared/instructor_planning_renderer.ts','supabase/functions/crj-instructor-planning-evidence/index.ts']){
    const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:read(file),encoding:'utf8'});
    assert.equal(result.status,0,file+'\n'+result.stderr);
  }
});
