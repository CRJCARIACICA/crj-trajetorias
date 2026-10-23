const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const helper=read('src/workshop_connection.js').replace(/\bexport /g,'');
const api=read('bundle/src__api_js.005.part');
const openApi=api.slice(api.indexOf('export async function openWorkshopCheckin('),api.indexOf('export async function linkProvisionalToYouth(')).replace(/^export /,'');
const appSource=read('bundle/src__app_js.009.part');
const dialog=appSource.slice(appSource.indexOf('async function openWorkshopCheckinDialogV2('),appSource.indexOf('async function bindWorkshopDetailV2('));
const checkin=read('src/checkin.js');
const boot=checkin.slice(checkin.indexOf('async function openCheckin(){'),checkin.lastIndexOf('await openCheckin();'));
const settle=async()=>{for(let i=0;i<24;i++)await Promise.resolve()};

function environment(rpc){
  const {window}=parseHTML('<html><body><button data-open-checkin="session-7"><b>Abrir lista virtual</b></button><div id="checkin-app"></div></body></html>');
  const notices=[];
  const context=vm.createContext({
    document:window.document,URL,Promise,Error,TypeError,console,
    setTimeout:fn=>{queueMicrotask(fn);return 1},
    mode:'live',supabase:{rpc},db:{rpc},ctx:null,token:'test-list',
    app:window.document.querySelector('#checkin-app'),
    location:{href:'https://crjcariacica.github.io/crj-trajetorias/'},
    navigator:{clipboard:{writeText:async()=>{}}},
    esc:s=>String(s),rpcName:name=>name,
    notice:(type,title,message)=>`<div class="notice ${type}">${title} ${message}</div>`,
    toast:(message,type)=>notices.push({message,type}),
    modal:(title,html)=>{window.document.querySelector('#checkin-app').innerHTML=html},
    mainButtons:()=>{window.document.querySelector('#checkin-app').innerHTML='<button>Identificação</button>'}
  });
  vm.runInContext(helper+'\n'+openApi+'\n'+dialog+'\n'+boot,context);
  return {context,window,notices,run:code=>vm.runInContext(code,context),button:window.document.querySelector('[data-open-checkin]')};
}

test('opening recovers a failed fetch and reuses the same session on every attempt',async()=>{
  const calls=[];
  const h=environment(async(name,args)=>{
    calls.push({name,args});
    return calls.length===1?{error:{message:'TypeError: Failed to fetch'}}:{data:[{public_token:'list-7'}],error:null};
  });
  const result=await h.run("openWorkshopCheckin('session-7')");
  assert.equal(result.public_token,'list-7');
  assert.equal(calls.length,2);
  assert.ok(calls.every(c=>c.name==='open_workshop_checkin'&&c.args.p_session_id==='session-7'));
});

test('opening recovers a lost RPC response without inserting a second class',async()=>{
  let attempts=0;
  const h=environment(async()=>{
    if(++attempts===1)throw new TypeError('Failed to fetch');
    return {data:{public_token:'same-window'}};
  });
  assert.equal((await h.run("openWorkshopCheckin('session-7')")).public_token,'same-window');
  assert.equal(attempts,2);
});

test('permission and session validation errors are preserved without retries',async()=>{
  for(const message of ['Acesso não autorizado.','Sessão não encontrada.']){
    let attempts=0;
    const h=environment(async()=>{attempts++;return {error:{message}}});
    await assert.rejects(h.run("openWorkshopCheckin('session-7')"),error=>error.message===message);
    assert.equal(attempts,1);
  }
});

test('the opening button is restored after connection exhaustion and can be used again',async()=>{
  let attempts=0,offline=true;
  const h=environment(async()=>{
    attempts++;
    return offline?{error:{message:'TypeError: Failed to fetch'}}:{data:[{public_token:'list-7'}]};
  });
  const original=h.button.innerHTML;
  await h.run('openWorkshopCheckinDialogV2(document.querySelector("[data-open-checkin]"))');
  assert.equal(attempts,3);
  assert.equal(h.button.disabled,false);
  assert.equal(h.button.innerHTML,original);
  assert.match(h.notices[0].message,/conexão com o banco falhou/);
  offline=false;
  await h.run('openWorkshopCheckinDialogV2(document.querySelector("[data-open-checkin]"))');
  assert.equal(h.button.disabled,false);
  const link=h.window.document.querySelector('a');
  assert.equal(new URL(link.href).searchParams.get('token'),'list-7');
});

test('a double click while opening calls the service once',async()=>{
  let resolve,attempts=0;
  const h=environment(()=>{attempts++;return new Promise(r=>{resolve=r})});
  const first=h.run('openWorkshopCheckinDialogV2(document.querySelector("[data-open-checkin]"))');
  assert.equal(h.button.disabled,true);
  await h.run('openWorkshopCheckinDialogV2(document.querySelector("[data-open-checkin]"))');
  assert.equal(attempts,1);
  resolve({data:[{public_token:'list-7'}]});
  await first;
  assert.equal(h.button.disabled,false);
});

test('an empty RPC result cannot generate a link with an undefined token',async()=>{
  const h=environment(async()=>({data:[]}));
  await h.run('openWorkshopCheckinDialogV2(document.querySelector("[data-open-checkin]"))');
  assert.equal(h.window.document.querySelector('a'),null);
  assert.match(h.notices[0].message,/lista não foi aberta/);
  assert.equal(h.button.disabled,false);
});

test('public list retries a failed context request and uses the actual lesson date',async()=>{
  let attempts=0;
  const h=environment(async()=>{
    attempts++;
    return attempts<2?{error:{message:'Load failed'}}:{data:[{workshop_name:'Jiu-jitsu',session_date:'2026-10-23'}]};
  });
  await h.run('openCheckin()');
  assert.equal(attempts,2);
  assert.equal(h.context.ctx.session_date,'2026-10-23');
  assert.match(h.context.app.textContent,/Identificação/);
});

test('public list offers a working retry button after persistent network failure',async()=>{
  let offline=true,attempts=0;
  const h=environment(async()=>{
    attempts++;
    return offline?{error:{message:'NetworkError when attempting to fetch resource.'}}:{data:[{session_date:'2026-10-23'}]};
  });
  await h.run('openCheckin()');
  assert.equal(attempts,3);
  assert.match(h.context.app.textContent,/conexão com o banco falhou/);
  const retry=h.context.app.querySelector('[data-checkin-retry]');
  assert.ok(retry);
  offline=false;
  retry.click();
  await settle();
  assert.match(h.context.app.textContent,/Identificação/);
  assert.equal(attempts,4);
});

test('an expired list stays blocked and points users to the team for reopening',async()=>{
  let attempts=0;
  const h=environment(async()=>{attempts++;return {data:[]}});
  await h.run('openCheckin()');
  assert.equal(attempts,1);
  assert.match(h.context.app.textContent,/Peça à equipe para reabrir/);
  assert.doesNotMatch(h.context.app.textContent,/Identificação/);
});
