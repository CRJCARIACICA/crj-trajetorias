import { CONFIG } from './config.js';

const ENDPOINT=`${CONFIG.supabaseUrl}/functions/v1/articulation-demand-public`;
const state={mode:null,youthId:null,found:false,signatureData:null,signed:false,lastResult:null};
const nativeFetch=window.fetch.bind(window);
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function notice(form,message,type='danger'){
  form.querySelector('[data-demand-identity-error]')?.remove();
  const d=document.createElement('div');d.dataset.demandIdentityError='1';d.className=`notice ${type}`;d.textContent=message;
  (form.querySelector('[data-demand-identity]')||form).prepend(d);
  d.scrollIntoView({behavior:'smooth',block:'center'});
}
function selectedWorkshops(form){return [...form.querySelectorAll('input[name="workshop_ids"]:checked')].map(x=>x.value)}
function updateEnrollmentBox(form){const box=form.querySelector('[data-enrollment-security]');if(box)box.classList.toggle('hidden',selectedWorkshops(form).length===0)}

async function identify(form){
  const cpf=String(form.querySelector('[data-id-cpf]')?.value||'').replace(/\D/g,'');
  const birth=String(form.querySelector('[data-id-birth]')?.value||'');
  const btn=form.querySelector('[data-id-search]');
  if(cpf.length!==11||!birth){notice(form,'Informe CPF e data de nascimento para consultar seu cadastro.');return}
  btn.disabled=true;btn.textContent='Consultando…';
  try{
    const r=await nativeFetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json','apikey':CONFIG.supabasePublishableKey},body:JSON.stringify({action:'identify',token:new URLSearchParams(location.search).get('t')||'',cpf,birth_date:birth})});
    const data=await r.json();if(!r.ok)throw new Error(data.error||'Falha ao consultar cadastro.');
    const out=form.querySelector('[data-id-result]');
    if(!data.found){state.mode=null;state.youthId=null;state.found=false;out.innerHTML='<div class="notice info"><b>Nenhum cadastro foi localizado com esses dados.</b><br>Se você nunca preencheu o Formulário Inicial, use “Ainda não tenho cadastro”.</div>';return}
    state.mode='existing';state.youthId=data.young_person_id;state.found=true;
    form.querySelector('[name="cpf"]').value=cpf;
    form.querySelector('[name="birth_date"]').value=birth;
    out.innerHTML=`<div class="notice success"><b>Cadastro encontrado e vinculado.</b><br>${esc(data.display_name||'Jovem')} · Formulário Inicial: <b>${data.initial_form_status==='completo'?'completo':'provisório'}</b>. Os campos já existentes serão reaproveitados no registro da demanda.</div>`;
  }catch(e){notice(form,e.message||String(e))}finally{btn.disabled=false;btn.textContent='Consultar cadastro'}
}

function setupSignature(form){
  const canvas=form.querySelector('[data-signature-canvas]');if(!canvas)return;
  const ctx=canvas.getContext('2d');ctx.lineWidth=3;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#10211d';
  let drawing=false,last=null;
  const point=e=>{const r=canvas.getBoundingClientRect(),p=e.touches?.[0]||e;return {x:(p.clientX-r.left)*(canvas.width/r.width),y:(p.clientY-r.top)*(canvas.height/r.height)}};
  const start=e=>{e.preventDefault();drawing=true;last=point(e)};
  const move=e=>{if(!drawing)return;e.preventDefault();const p=point(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;state.signed=true;state.signatureData=canvas.toDataURL('image/png')};
  const end=e=>{if(!drawing)return;e?.preventDefault?.();drawing=false;if(state.signed)state.signatureData=canvas.toDataURL('image/png')};
  canvas.addEventListener('pointerdown',start);canvas.addEventListener('pointermove',move);window.addEventListener('pointerup',end);
  form.querySelector('[data-signature-clear]')?.addEventListener('click',()=>{ctx.clearRect(0,0,canvas.width,canvas.height);state.signed=false;state.signatureData=null});
}

function enhance(form){
  if(form.dataset.identityEnhanced==='1')return;form.dataset.identityEnhanced='1';
  const identityCard=form.querySelector('input[name="full_name"]')?.closest('section.card');
  if(identityCard){
    const sec=document.createElement('section');sec.className='card';sec.dataset.demandIdentity='1';sec.innerHTML=`<h2 class="section-title">Antes de preencher: consulte seu cadastro</h2><p class="sub">A demanda precisa ficar ligada ao seu Formulário Inicial. Se você já tiver cadastro, consulte antes de continuar. Se não tiver, o sistema cria um cadastro provisório ao enviar.</p><div class="actions"><button class="btn secondary" type="button" data-have-registration>Já tenho cadastro</button><button class="btn secondary" type="button" data-new-registration>Ainda não tenho cadastro</button></div><div class="hidden" data-id-lookup style="margin-top:14px"><div class="grid"><div class="field"><label>CPF</label><input data-id-cpf inputmode="numeric" placeholder="Somente números"></div><div class="field"><label>Data de nascimento</label><input data-id-birth type="date"></div></div><div class="actions"><button class="btn primary" type="button" data-id-search>Consultar cadastro</button></div></div><div data-id-result style="margin-top:12px"></div>`;
    identityCard.before(sec);
    sec.querySelector('[data-have-registration]').onclick=()=>{state.mode=null;state.youthId=null;state.found=false;sec.querySelector('[data-id-lookup]').classList.remove('hidden');sec.querySelector('[data-id-result]').innerHTML='<div class="notice info">Informe CPF e data de nascimento e clique em consultar. A demanda só será ligada depois da confirmação.</div>'};
    sec.querySelector('[data-new-registration]').onclick=()=>{state.mode='new';state.youthId=null;state.found=false;sec.querySelector('[data-id-lookup]').classList.add('hidden');sec.querySelector('[data-id-result]').innerHTML='<div class="notice success"><b>Novo cadastro provisório.</b><br>Ao enviar a demanda, os campos informados serão usados para iniciar o Formulário Inicial.</div>'};
    sec.querySelector('[data-id-search]').onclick=()=>identify(form);
  }

  const firstWorkshop=form.querySelector('input[name="workshop_ids"]');const workshopCard=firstWorkshop?.closest('section.card');
  if(workshopCard){
    const box=document.createElement('div');box.dataset.enrollmentSecurity='1';box.className='hidden';box.innerHTML=`<div class="notice info" style="margin-top:16px"><b>Inscrição formal na oficina</b><br>Para entrar na lista de presença, a inscrição precisa de assinatura e de uma senha pessoal. A senha será usada para confirmar sua presença nas aulas.</div><div class="field"><label>Assinatura do jovem</label><canvas data-signature-canvas width="760" height="190" style="display:block;width:100%;height:170px;border:1px solid #cfdad6;border-radius:12px;background:#fff;touch-action:none"></canvas><div class="actions" style="margin-top:8px"><button class="btn secondary" type="button" data-signature-clear>Limpar assinatura</button></div></div><div class="grid"><div class="field"><label>Crie sua senha de presença *</label><input type="password" data-checkin-secret minlength="4" maxlength="32" autocomplete="new-password"></div><div class="field"><label>Confirme a senha *</label><input type="password" data-checkin-secret-confirm minlength="4" maxlength="32" autocomplete="new-password"></div></div><p class="tiny">Se CPF, e-mail ou bairro ainda estiverem vazios no cadastro, complete esses campos acima antes da inscrição.</p>`;
    workshopCard.appendChild(box);form.querySelectorAll('input[name="workshop_ids"]').forEach(x=>x.addEventListener('change',()=>updateEnrollmentBox(form)));setupSignature(form);updateEnrollmentBox(form);
  }
}

window.fetch=async(input,init={})=>{
  const url=typeof input==='string'?input:input?.url||'';
  if(url.includes('/functions/v1/articulation-demand-public')&&String(init?.method||'GET').toUpperCase()==='POST'&&typeof init?.body==='string'){
    try{
      const body=JSON.parse(init.body);
      if(body?.action==='submit'){
        const form=document.querySelector('#demand-form');
        body.identity_mode=state.mode;body.existing_youth_id=state.youthId;body.signature_data=state.signatureData;
        body.secret=String(form?.querySelector('[data-checkin-secret]')?.value||'');
        init={...init,body:JSON.stringify(body)};
      }
    }catch{}
  }
  const response=await nativeFetch(input,init);
  if(url.includes('/functions/v1/articulation-demand-public')&&typeof init?.body==='string'){
    try{const b=JSON.parse(init.body);if(b?.action==='submit'){const d=await response.clone().json();if(response.ok)state.lastResult=d}}catch{}
  }
  return response;
};

document.addEventListener('submit',e=>{
  const form=e.target;if(!(form instanceof HTMLFormElement)||form.id!=='demand-form')return;
  if(!state.mode){e.preventDefault();e.stopImmediatePropagation();notice(form,'Antes de enviar, consulte se você já possui cadastro no CRJ ou confirme que ainda não possui.');return}
  if(state.mode==='existing'&&!state.found){e.preventDefault();e.stopImmediatePropagation();notice(form,'Consulte e confirme seu cadastro existente antes de enviar.');return}
  const selected=selectedWorkshops(form);
  if(selected.length){
    const secret=String(form.querySelector('[data-checkin-secret]')?.value||''),confirm=String(form.querySelector('[data-checkin-secret-confirm]')?.value||'');
    if(!state.signed||!state.signatureData){e.preventDefault();e.stopImmediatePropagation();notice(form,'Assine a inscrição para entrar na oficina.');return}
    if(secret.length<4||secret.length>32){e.preventDefault();e.stopImmediatePropagation();notice(form,'Crie uma senha de presença com 4 a 32 caracteres.');return}
    if(secret!==confirm){e.preventDefault();e.stopImmediatePropagation();notice(form,'A confirmação da senha não confere.');return}
  }
},true);

const observer=new MutationObserver(()=>{
  const form=document.querySelector('#demand-form');if(form)enhance(form);
  if(state.lastResult&&!form){
    const sub=document.querySelector('#demand-app .sub');
    if(sub&&state.lastResult.linked_existing)sub.innerHTML=state.lastResult.initial_form_status==='completo'?'Sua demanda foi ligada ao seu <b>cadastro já existente</b>. O Formulário Inicial permanece completo.':'Sua demanda foi ligada ao seu <b>cadastro já existente</b>. Os dados pendentes do Formulário Inicial poderão ser completados depois.';
  }
});
observer.observe(document.documentElement,{childList:true,subtree:true});
const first=document.querySelector('#demand-form');if(first)enhance(first);
