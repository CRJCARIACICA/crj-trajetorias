import { CONFIG } from './config.js';

const qs=new URLSearchParams(location.search);
const workshopToken=qs.get('token');
const cfdhMode=Boolean(qs.get('cfdh'));
const checkinApp=document.querySelector('#checkin-app');
let publicDbPromise=null;
let observerTimer=null;

const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function publicDb(){
  if(publicDbPromise)return publicDbPromise;
  publicDbPromise=(async()=>{
    let mod;
    try{mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm')}
    catch{mod=await import('https://esm.sh/@supabase/supabase-js@2.117.2')}
    return mod.createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
  })();
  return publicDbPromise;
}

function notice(type,title,text=''){
  return `<div class="notice ${type}"><b>${esc(title)}</b>${text?`<br>${esc(text)}`:''}</div>`;
}

function decorateCpfOptionalField(form,field){
  if(!form||!field||field.dataset.cpfOptional==='1')return;
  field.dataset.cpfOptional='1';
  field.required=false;
  const wrap=field.closest('.field')||field.parentElement;
  const note=document.createElement('div');
  note.dataset.cpfPendingOption='1';
  note.style.marginTop='7px';
  note.innerHTML='<label class="check"><input type="checkbox" data-cpf-pending-toggle><span>Cadastrar sem CPF agora</span></label><small style="display:block;margin-top:5px">O cadastro e a inscrição serão criados normalmente. O CPF ficará sinalizado como pendência para preenchimento posterior.</small>';
  wrap?.appendChild(note);
  const toggle=note.querySelector('[data-cpf-pending-toggle]');
  toggle?.addEventListener('change',()=>{
    if(toggle.checked){field.value='';field.disabled=true;}
    else field.disabled=false;
    field.dispatchEvent(new Event('change',{bubbles:true}));
  });
}

function decorateStaffEnrollment(root=document){
  root.querySelectorAll?.('#modal form').forEach(form=>{
    if(form.dataset.workshopCpfEnhanced==='1')return;
    const text=String(form.closest('#modal')?.textContent||'').toLowerCase();
    const cpf=form.querySelector('input[name="cpf"]');
    const hasSecret=Boolean(form.querySelector('input[name="secret"],input[type="password"]'));
    if(!cpf||!hasSecret||!text.includes('oficina'))return;
    form.dataset.workshopCpfEnhanced='1';
    decorateCpfOptionalField(form,cpf);
  });
}

function redactBirthDate(root=document){
  if(!checkinApp||cfdhMode)return;
  root.querySelectorAll?.('.checkin-person span,.selected-person span').forEach(span=>{
    const text=String(span.textContent||'');
    if(!/Nascimento:/i.test(text))return;
    const cpf=(text.match(/CPF final\s+([^·]+)/i)||[])[1]?.trim()||'----';
    span.textContent=cpf==='----'?'CPF pendente':`CPF final ${cpf}`;
  });
}

function signatureBlock(){
  return '<div class="field"><label>Assinatura manuscrita</label><canvas class="signature-pad public-signature" data-cpf-free-signature></canvas><div class="actions"><button type="button" class="btn ghost" data-clear-cpf-free-signature>Limpar assinatura</button></div></div>';
}

function bindSignature(form){
  const canvas=form.querySelector('[data-cpf-free-signature]');
  if(!canvas)return()=>null;
  let moved=false,drawing=false,g=null,ratio=Math.max(window.devicePixelRatio||1,1);
  const rect=canvas.getBoundingClientRect();
  canvas.width=Math.max(600,Math.round((rect.width||600)*ratio));
  canvas.height=Math.round(180*ratio);
  g=canvas.getContext('2d');
  if(!g)return()=>null;
  g.scale(ratio,ratio);g.lineWidth=2;g.lineCap='round';g.strokeStyle='#17201e';
  const point=e=>{const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}};
  canvas.addEventListener('pointerdown',e=>{drawing=true;moved=true;const p=point(e);g.beginPath();g.moveTo(p.x,p.y);try{canvas.setPointerCapture?.(e.pointerId)}catch{}});
  canvas.addEventListener('pointermove',e=>{if(!drawing)return;const p=point(e);g.lineTo(p.x,p.y);g.stroke()});
  canvas.addEventListener('pointerup',()=>drawing=false);
  canvas.addEventListener('pointercancel',()=>drawing=false);
  form.querySelector('[data-clear-cpf-free-signature]')?.addEventListener('click',()=>{g.clearRect(0,0,canvas.width/ratio,canvas.height/ratio);moved=false});
  return()=>moved?canvas.toDataURL('image/png'):null;
}

function showNoCpfRegistration(){
  if(!checkinApp||!workshopToken||cfdhMode)return;
  checkinApp.innerHTML=`
    <button class="btn ghost checkin-back" type="button" data-cpf-free-back>← Voltar</button>
    <div class="checkin-step-head"><span class="step-badge">3</span><div><h2>Cadastrar sem CPF</h2><p>O CPF poderá ser preenchido depois.</p></div></div>
    ${notice('warn','CPF ficará pendente','A inscrição e a presença podem ser registradas agora. O cadastro continuará sinalizado para complementação.')}
    <form id="provisional-form" class="stack" novalidate data-cpf-free-form>
      <div class="field"><label>Nome completo</label><input class="input" name="full_name" required></div>
      <div class="field"><label>Data de nascimento</label><input class="input" type="date" name="birth_date" required></div>
      <div class="field"><label>E-mail</label><input class="input" name="email" type="email" required></div>
      <div class="field"><label>Bairro</label><input class="input" name="neighborhood" required></div>
      <div class="field"><label>Criar senha da oficina</label><input class="input" name="secret" type="password" minlength="4" maxlength="32" required><small>Essa senha continuará sendo a forma principal de confirmar as próximas presenças.</small></div>
      ${signatureBlock()}
      <div data-cpf-free-status></div>
      <button class="btn primary" type="submit">Cadastrar, inscrever e confirmar presença</button>
    </form>`;
  checkinApp.querySelector('[data-cpf-free-back]')?.addEventListener('click',()=>location.reload());
  const form=checkinApp.querySelector('[data-cpf-free-form]');
  const getSignature=bindSignature(form);
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const status=form.querySelector('[data-cpf-free-status]');status.innerHTML='';
    if(!form.reportValidity())return;
    const signature=getSignature();
    if(!signature){status.innerHTML=notice('danger','Assinatura obrigatória','Assine no quadro antes de continuar.');return}
    const fd=new FormData(form),btn=form.querySelector('button[type="submit"]');
    btn.disabled=true;btn.textContent='Registrando...';
    try{
      const db=await publicDb();
      const {data,error}=await db.rpc('workshop_checkin_create_provisional',{
        p_token:workshopToken,
        p_full_name:String(fd.get('full_name')||'').trim(),
        p_birth_date:fd.get('birth_date'),
        p_cpf:null,
        p_email:String(fd.get('email')||'').trim(),
        p_neighborhood:String(fd.get('neighborhood')||'').trim(),
        p_signature_data:signature,
        p_secret:fd.get('secret')
      });
      if(error)throw error;
      showRecoverySuccess('Cadastro, inscrição e presença registrados','O CPF ficou pendente no cadastro e poderá ser preenchido posteriormente.',data||{});
    }catch(err){
      btn.disabled=false;btn.textContent='Cadastrar, inscrever e confirmar presença';
      status.innerHTML=notice('danger','Não foi possível concluir',err?.message||String(err));
    }
  });
}

function decorateCpfEntryChoice(){
  if(!checkinApp||cfdhMode)return;
  const form=checkinApp.querySelector('#cpf-check-form');
  if(!form||form.dataset.noCpfOption==='1')return;
  form.dataset.noCpfOption='1';
  const button=document.createElement('button');
  button.type='button';button.className='btn secondary';button.dataset.noCpfNow='1';button.textContent='Não tenho CPF agora';
  const help=document.createElement('small');
  help.textContent='Você pode iniciar o cadastro e se inscrever na oficina; o CPF ficará pendente para completar depois.';
  form.append(button,help);
  button.addEventListener('click',showNoCpfRegistration);
}

function decorateExistingCheckinForms(){
  if(!checkinApp||cfdhMode)return;
  const enroll=checkinApp.querySelector('#enroll-existing-form');
  const enrollCpf=enroll?.querySelector('input[name="cpf"]');
  if(enrollCpf)decorateCpfOptionalField(enroll,enrollCpf);
  const provisional=checkinApp.querySelector('#provisional-form:not([data-cpf-free-form])');
  const provisionalCpf=provisional?.querySelector('input[name="cpf"]');
  if(provisionalCpf)decorateCpfOptionalField(provisional,provisionalCpf);
}

async function resolveCandidateId(){
  if(!workshopToken)return null;
  const candidateKey=`crj_checkin_candidate_v4:${workshopToken}`;
  const stored=sessionStorage.getItem(candidateKey);
  if(stored)return stored;
  const cpf=sessionStorage.getItem(`crj_checkin_cpf_v4:${workshopToken}`);
  if(!cpf)return null;
  const db=await publicDb();
  const {data,error}=await db.rpc('workshop_checkin_cpf_status',{p_token:workshopToken,p_cpf:cpf});
  if(error)throw error;
  if(data?.kind==='youth'&&data.candidate_id){sessionStorage.setItem(candidateKey,data.candidate_id);return data.candidate_id}
  return null;
}

function showRecoverySuccess(title,text,state={}){
  if(!checkinApp)return;
  checkinApp.innerHTML=`<div class="checkin-success"><div class="success-mark">✓</div><h2>${esc(title)}</h2><p>${esc(text)}</p>${state.schedule?`<div class="notice success"><b>Oficina</b><br>${esc(state.schedule)}</div>`:''}${state.requires_initial_completion?notice('warn','Cadastro com pendências','Complete os dados pendentes do Formulário Inicial assim que possível.'):''}<button type="button" class="btn primary" data-recovery-next>Registrar próxima pessoa</button></div>`;
  checkinApp.querySelector('[data-recovery-next]')?.addEventListener('click',()=>location.reload());
}

async function showBirthDateRecovery(){
  if(!checkinApp||!workshopToken||cfdhMode)return;
  try{
    const candidateId=await resolveCandidateId();
    if(!candidateId)throw new Error('Não foi possível identificar o cadastro selecionado. Volte e pesquise novamente.');
    const db=await publicDb();
    const {data:state,error}=await db.rpc('workshop_checkin_candidate_state',{p_token:workshopToken,p_youth_id:candidateId});
    if(error)throw error;
    if(!state?.enrollment_id)throw new Error('Não encontramos uma inscrição ativa nesta oficina.');
    checkinApp.innerHTML=`
      <button class="btn ghost checkin-back" type="button" data-recovery-back>← Voltar</button>
      <div class="checkin-step-head"><span class="step-badge">3</span><div><h2>Esqueci minha senha</h2><p>Confirme sua data de nascimento para registrar esta presença.</p></div></div>
      <div class="selected-person"><b>${esc(state.display_name||'Cadastro localizado')}</b><span>${state.cpf_last4&&state.cpf_last4!=='----'?`CPF final ${esc(state.cpf_last4)}`:'CPF pendente'}</span></div>
      ${notice('info','Validação alternativa','A data cadastrada não é exibida. Informe seu aniversário completo para confirmar a identidade. Após 5 erros, novas tentativas ficam bloqueadas por 15 minutos.')}
      <form class="stack" data-birth-recovery-form>
        <div class="field"><label>Data de nascimento</label><input class="input" type="date" name="birth_date" required></div>
        <div data-birth-recovery-status></div>
        <button class="btn primary" type="submit">Confirmar presença com aniversário</button>
      </form>`;
    checkinApp.querySelector('[data-recovery-back]')?.addEventListener('click',()=>location.reload());
    const form=checkinApp.querySelector('[data-birth-recovery-form]');
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const status=form.querySelector('[data-birth-recovery-status]'),btn=form.querySelector('button[type="submit"]');
      status.innerHTML='';btn.disabled=true;btn.textContent='Confirmando...';
      const birthDate=new FormData(form).get('birth_date');
      const {data,error}=await db.rpc('workshop_checkin_mark_by_birth_date',{p_token:workshopToken,p_enrollment_id:state.enrollment_id,p_birth_date:birthDate});
      if(error){btn.disabled=false;btn.textContent='Confirmar presença com aniversário';status.innerHTML=notice('danger','Não foi possível confirmar',error.message);return}
      showRecoverySuccess('Presença confirmada','A presença foi registrada usando a validação pela data de nascimento.',data||{});
    });
  }catch(err){
    checkinApp.insertAdjacentHTML('afterbegin',notice('danger','Não foi possível abrir a recuperação',err?.message||String(err)));
  }
}

function decorateForgotPassword(){
  if(!checkinApp||cfdhMode)return;
  const form=checkinApp.querySelector('#pin-form');
  if(!form||form.dataset.birthRecovery==='1')return;
  form.dataset.birthRecovery='1';
  const button=document.createElement('button');
  button.type='button';button.className='btn ghost';button.dataset.forgotWorkshopPassword='1';button.textContent='Esqueci minha senha';
  form.appendChild(button);
  button.addEventListener('click',showBirthDateRecovery);
}

function apply(){
  decorateStaffEnrollment(document);
  if(!checkinApp||!workshopToken||cfdhMode)return;
  redactBirthDate(checkinApp);
  decorateCpfEntryChoice();
  decorateExistingCheckinForms();
  decorateForgotPassword();
}

const observer=new MutationObserver(()=>{
  clearTimeout(observerTimer);
  observerTimer=setTimeout(apply,25);
});
observer.observe(document.body,{childList:true,subtree:true});
apply();
