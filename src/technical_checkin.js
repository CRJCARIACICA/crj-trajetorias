import { CONFIG } from './config.js';

const app=document.querySelector('#technical-checkin-app');
const contextBox=document.querySelector('#technical-checkin-context');
const qs=new URLSearchParams(location.search);
const token=qs.get('token');
const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const onlyDigits=v=>String(v||'').replace(/\D/g,'');
const fmtDate=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const fmtTime=v=>String(v||'').slice(0,5);
let db=null,ctx=null,current=null,lastSearch={method:'name',value:''};

const FIELD_LABELS={birth_date:'data de nascimento',cpf:'CPF',phone:'telefone',email:'e-mail',neighborhood:'bairro',signature:'assinatura'};

function notice(type,title,text=''){
  return `<div class="notice ${type}"><b>${esc(title)}</b>${text?`<br>${esc(text)}`:''}</div>`;
}
function shell(title,body,step='2',back=true){
  app.innerHTML=`${back?'<button class="btn ghost" type="button" data-tc-back>← Voltar</button>':''}<div class="checkin-step-head"><span class="step-badge">${step}</span><div><h2>${esc(title)}</h2></div></div>${body}`;
  if(back)app.querySelector('[data-tc-back]')?.addEventListener('click',home);
}
async function getDb(){
  if(db)return db;
  let mod;
  try{mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm')}
  catch{mod=await import('https://esm.sh/@supabase/supabase-js@2.117.2')}
  db=mod.createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
  return db;
}
async function rpc(name,args={}){
  const client=await getDb();
  const {data,error}=await client.rpc(name,args);
  if(error)throw error;
  return data;
}
function renderContext(){
  if(!ctx?.ok)return;
  const when=[fmtDate(ctx.date),[fmtTime(ctx.start_time),fmtTime(ctx.end_time)].filter(Boolean).join('–')].filter(Boolean).join(' · ');
  contextBox.innerHTML=`<div class="notice success technical-checkin-context"><h2>${esc(ctx.title||'Ação da Equipe Técnica')}</h2><div>${esc(when)}</div>${ctx.location?`<div>${esc(ctx.location)}</div>`:''}${ctx.responsible_technical?`<div><b>Equipe:</b> ${esc(ctx.responsible_technical)}</div>`:''}</div>`;
}
function home(){
  current=null;
  app.innerHTML=`<div class="checkin-step-head"><span class="step-badge">1</span><div><h2>Identificação</h2><p>Um jovem por vez.</p></div></div><div class="question-card"><h3>Você já possui cadastro ou Formulário Inicial no CRJ?</h3><div class="choice-grid"><button class="choice-card" type="button" data-tc-existing><b>Sim</b><span>Localizar meu cadastro por nome ou CPF.</span></button><button class="choice-card" type="button" data-tc-new><b>Não / primeira vez</b><span>Iniciar o Formulário Inicial provisório e registrar a presença.</span></button></div></div>`;
  app.querySelector('[data-tc-existing]').addEventListener('click',searchScreen);
  app.querySelector('[data-tc-new]').addEventListener('click',firstTimeScreen);
}
function searchScreen(){
  shell('Localizar cadastro',`<div class="notice info"><b>Busca institucional</b><br>A lista final usa sempre o nome completo do cadastro.</div><div class="form-grid"><div class="field"><label>Pesquisar por nome</label><input class="input" data-tc-name autocomplete="off" placeholder="Digite pelo menos 3 letras"></div><div class="field"><label>Pesquisar por CPF</label><input class="input" data-tc-cpf inputmode="numeric" autocomplete="off" placeholder="Digite o CPF completo"></div></div><div class="tc-results" data-tc-results><div class="empty">Digite o nome ou CPF para pesquisar.</div></div>`);
  const name=app.querySelector('[data-tc-name]'),cpf=app.querySelector('[data-tc-cpf]'),box=app.querySelector('[data-tc-results]');
  let timer=null,seq=0;
  const run=(method)=>{
    clearTimeout(timer);
    if(method==='name'&&name.value)cpf.value='';
    if(method==='cpf'&&cpf.value)name.value='';
    const value=(method==='cpf'?cpf.value:name.value).trim();
    lastSearch={method,value};
    if((method==='name'&&value.length<3)||(method==='cpf'&&onlyDigits(value).length<11)){
      box.innerHTML=`<div class="empty">${method==='cpf'?'Digite o CPF completo com 11 dígitos.':'Digite pelo menos 3 letras.'}</div>`;return;
    }
    const my=++seq;
    timer=setTimeout(async()=>{
      box.innerHTML='<div class="empty">Pesquisando...</div>';
      try{
        const data=await rpc('technical_checkin_search',{p_token:token,p_query:value,p_method:method});
        if(my!==seq)return;
        if(!data?.ok){box.innerHTML=notice('danger','Lista indisponível','Este link foi encerrado ou expirou.');return}
        const rows=data.results||[];
        box.innerHTML=rows.map(r=>`<button type="button" class="tc-person" data-youth="${esc(r.youth_id)}"><b>${esc(r.full_name)}</b><span>${esc(r.neighborhood||'Bairro não informado')} · ${r.initial_form_status==='completo'?'Cadastro completo':'Cadastro com pendências'}</span></button>`).join('')||`<div class="empty">Nenhum cadastro localizado.</div><button type="button" class="btn secondary" data-tc-first>Iniciar cadastro provisório</button>`;
        box.querySelectorAll('[data-youth]').forEach(b=>b.addEventListener('click',()=>confirmIdentity(b.dataset.youth,rows.find(x=>x.youth_id===b.dataset.youth))));
        box.querySelector('[data-tc-first]')?.addEventListener('click',firstTimeScreen);
      }catch(err){box.innerHTML=notice('danger','Erro na pesquisa',err.message||String(err))}
    },220);
  };
  name.addEventListener('input',()=>run('name'));
  cpf.addEventListener('input',()=>run('cpf'));
}
function confirmIdentity(youthId,row){
  current={youthId,row};
  const method=lastSearch.method==='cpf'?'cpf':'name';
  const field=method==='cpf'?`<div class="field"><label>Confirme o CPF completo</label><input class="input" name="identifier" inputmode="numeric" value="${method==='cpf'?esc(lastSearch.value):''}" required></div>`:`<div class="field"><label>Confirme sua data de nascimento</label><input class="input" type="date" name="birth_date" required></div>`;
  shell('Confirmar identidade',`<div class="selected-person"><b>${esc(row?.full_name||'Cadastro localizado')}</b><span>${esc(row?.neighborhood||'')}</span></div><form id="tc-confirm" class="stack">${field}<button class="btn primary">Continuar</button></form>`,'3');
  app.querySelector('#tc-confirm').addEventListener('submit',async e=>{
    e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;btn.textContent='Confirmando...';
    try{
      const fd=new FormData(e.target),data=await rpc('technical_checkin_confirm_identity',{p_token:token,p_youth_id:youthId,p_method:method,p_identifier:method==='cpf'?fd.get('identifier'):null,p_birth_date:method==='name'?fd.get('birth_date'):null});
      if(!data?.ok){throw new Error(data?.reason==='identity_mismatch'?'Os dados informados não conferem com o cadastro.':'Não foi possível confirmar a identidade.')}
      current={...current,...data};
      if((data.missing_fields||[]).length)completeProfileScreen(data);else readyScreen(data);
    }catch(err){btn.disabled=false;btn.textContent='Continuar';e.target.querySelector('.notice.danger')?.remove();e.target.insertAdjacentHTML('afterbegin',notice('danger','Não foi possível confirmar',err.message||String(err)))}
  });
}
function signatureField(){
  return `<div class="field"><label>Assinatura manuscrita</label><canvas class="tc-signature" data-tc-signature></canvas><div class="actions"><button type="button" class="btn ghost" data-tc-clear>Limpar assinatura</button></div></div>`;
}
function bindSignature(root){
  const canvas=root.querySelector('[data-tc-signature]');if(!canvas)return()=>null;
  const ratio=Math.max(window.devicePixelRatio||1,1),rect=canvas.getBoundingClientRect();
  canvas.width=Math.max(600,Math.round((rect.width||600)*ratio));canvas.height=Math.round(180*ratio);
  const g=canvas.getContext('2d');g.scale(ratio,ratio);g.lineWidth=2;g.lineCap='round';g.strokeStyle='#17201e';
  let drawing=false,moved=false;
  const point=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
  canvas.addEventListener('pointerdown',e=>{drawing=true;moved=true;const p=point(e);g.beginPath();g.moveTo(p.x,p.y);try{canvas.setPointerCapture(e.pointerId)}catch{}});
  canvas.addEventListener('pointermove',e=>{if(!drawing)return;const p=point(e);g.lineTo(p.x,p.y);g.stroke()});
  canvas.addEventListener('pointerup',()=>drawing=false);canvas.addEventListener('pointercancel',()=>drawing=false);
  root.querySelector('[data-tc-clear]')?.addEventListener('click',()=>{g.clearRect(0,0,canvas.width/ratio,canvas.height/ratio);moved=false});
  return()=>moved?canvas.toDataURL('image/png'):null;
}
function completeProfileScreen(state){
  const missing=new Set(state.missing_fields||[]),fields=[];
  if(missing.has('birth_date'))fields.push('<div class="field"><label>Data de nascimento</label><input class="input" type="date" name="birth_date" required></div>');
  if(missing.has('cpf'))fields.push('<div class="field"><label>CPF</label><input class="input" name="cpf" inputmode="numeric" required></div>');
  if(missing.has('phone'))fields.push('<div class="field"><label>Telefone</label><input class="input" name="phone" inputmode="tel" required></div>');
  if(missing.has('email'))fields.push('<div class="field"><label>E-mail</label><input class="input" name="email" type="email" required></div>');
  if(missing.has('neighborhood'))fields.push('<div class="field"><label>Bairro</label><input class="input" name="neighborhood" required></div>');
  const needsSig=missing.has('signature')||!state.has_signature;
  shell('Completar dados necessários',`<div class="notice warn"><b>Cadastro com pendências para esta presença</b><br>Preencha apenas os dados básicos que ainda faltam. O Formulário Inicial poderá ser completado depois.</div><div class="selected-person"><b>${esc(state.full_name)}</b></div><form id="tc-complete" class="stack">${fields.join('')}${needsSig?signatureField():''}<button class="btn primary">Salvar e registrar presença</button></form>`,'4');
  const form=app.querySelector('#tc-complete'),getSig=bindSignature(form);
  form.addEventListener('submit',async e=>{
    e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;btn.textContent='Salvando...';
    try{
      const fd=new FormData(e.target),payload={};for(const [k,v] of fd.entries())payload[k]=String(v||'').trim();const sig=getSig();
      if(needsSig&&!sig)throw new Error('Faça a assinatura antes de continuar.');
      const updated=await rpc('technical_checkin_complete_profile',{p_token:token,p_claim_token:state.claim_token,p_payload:payload,p_signature_data:sig});
      await markPresence(updated.claim_token||state.claim_token,null,updated.full_name||state.full_name);
    }catch(err){btn.disabled=false;btn.textContent='Salvar e registrar presença';e.target.querySelector('.notice.danger')?.remove();e.target.insertAdjacentHTML('afterbegin',notice('danger','Não foi possível concluir',err.message||String(err)))}
  });
}
function readyScreen(state){
  shell('Registrar presença',`<div class="notice success"><b>Cadastro confirmado</b><br>A evidência será emitida com o nome completo.</div><div class="selected-person"><b>${esc(state.full_name)}</b></div><button type="button" class="btn primary" data-tc-mark>Confirmar presença</button>`,'4');
  app.querySelector('[data-tc-mark]').addEventListener('click',async e=>{e.currentTarget.disabled=true;e.currentTarget.textContent='Registrando...';try{await markPresence(state.claim_token,null,state.full_name)}catch(err){e.currentTarget.disabled=false;e.currentTarget.textContent='Confirmar presença';app.insertAdjacentHTML('afterbegin',notice('danger','Não foi possível registrar',err.message||String(err)))}});
}
async function markPresence(claimToken,signatureData,fullName){
  const data=await rpc('technical_checkin_mark_presence',{p_token:token,p_claim_token:claimToken,p_signature_data:signatureData});
  success(data?.full_name||fullName||'Presença registrada');
}
function firstTimeScreen(){
  shell('Primeiro cadastro',`<div class="notice info"><b>Formulário Inicial provisório</b><br>Este cadastro entra na trajetória do CRJ e poderá ser completado posteriormente. A presença será registrada com o nome completo.</div><form id="tc-first" class="stack"><div class="field"><label>Nome completo</label><input class="input" name="full_name" autocomplete="name" required></div><div class="form-grid"><div class="field"><label>Data de nascimento</label><input class="input" type="date" name="birth_date" required></div><div class="field"><label>CPF</label><input class="input" name="cpf" inputmode="numeric"></div></div><div class="form-grid"><div class="field"><label>Telefone</label><input class="input" name="phone" inputmode="tel"></div><div class="field"><label>E-mail</label><input class="input" name="email" type="email"></div></div><div class="field"><label>Bairro</label><input class="input" name="neighborhood"></div>${signatureField()}<button class="btn primary">Cadastrar e registrar presença</button></form>`,'3');
  const form=app.querySelector('#tc-first'),getSig=bindSignature(form);
  form.addEventListener('submit',async e=>{
    e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;btn.textContent='Cadastrando...';
    try{
      const fd=new FormData(e.target),payload={};for(const [k,v] of fd.entries())payload[k]=String(v||'').trim();const sig=getSig();if(!sig)throw new Error('Faça a assinatura antes de continuar.');
      const data=await rpc('technical_checkin_register_first_time',{p_token:token,p_payload:payload,p_signature_data:sig});
      await markPresence(data.claim_token,null,data.full_name||payload.full_name);
    }catch(err){btn.disabled=false;btn.textContent='Cadastrar e registrar presença';e.target.querySelector('.notice.danger')?.remove();e.target.insertAdjacentHTML('afterbegin',notice('danger','Não foi possível cadastrar',err.message||String(err)))}
  });
}
function success(name){
  shell('Presença registrada',`<div class="tc-success"><div class="notice success"><b>${esc(name)}</b><br>Presença confirmada com sucesso.</div><p>O registro já está vinculado à ação da Equipe Técnica e será incluído na evidência pelo nome completo.</p><button type="button" class="btn primary" data-tc-next>Registrar próxima pessoa</button></div>`,'✓',false);
  app.querySelector('[data-tc-next]').addEventListener('click',home);
}
async function boot(){
  if(!token){contextBox.innerHTML='';app.innerHTML=notice('danger','Link inválido','O token da lista não foi informado.');return}
  try{
    ctx=await rpc('technical_checkin_context',{p_token:token});
    if(!ctx?.ok){app.innerHTML=notice('danger','Lista indisponível','Este link foi encerrado ou expirou.');return}
    renderContext();home();
  }catch(err){app.innerHTML=notice('danger','Não foi possível abrir a lista',err.message||String(err))}
}
boot();
