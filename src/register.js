import { CONFIG } from './config.js';

const FUNCTIONS = [
  ['coordenacao_geral','Coordenação Geral'],
  ['coordenacao_articulacao','Coordenação de Articulação'],
  ['articulador','Articulador(a) Local'],
  ['educador','Educador(a) Social'],
  ['assistente_social','Assistente Social'],
  ['psicologo','Psicólogo(a)'],
  ['terapeuta_ocupacional','Terapeuta Ocupacional'],
  ['controlador_acesso','Controlador(a) de Acessos'],
  ['administrativo','Administrativo'],
  ['oficineiro','Oficineiro(a)'],
  ['monitoramento','Monitoramento / Gestão OSC'],
];

function safe(text){
  return String(text??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function errorText(value){
  if(!value)return '';
  if(value instanceof Error)return value.message||'';
  if(typeof value==='string')return value;
  if(typeof value==='object'){
    for(const key of ['message','error_description','details','hint','error']){
      const part=value?.[key];
      if(typeof part==='string'&&part.trim())return part.trim();
    }
    try{return JSON.stringify(value)}catch{}
  }
  return String(value);
}
function showMessage(text,type=''){
  const el=document.querySelector('#login-message');
  if(el) el.innerHTML=`<div class="notice ${type}" style="margin-top:12px">${safe(errorText(text)||'Não foi possível concluir a operação.')}</div>`;
}

async function registerCollaborator(form){
  const fd=new FormData(form);
  const name=String(fd.get('display_name')||'').trim();
  const role=String(fd.get('registration_role')||'');
  const keyword=String(fd.get('registration_keyword')||'');
  const email=String(fd.get('email')||'').trim();
  const password=String(fd.get('password')||'');

  if(name.length<3) throw new Error('Informe o nome completo do colaborador.');
  if(!role) throw new Error('Selecione a função do colaborador.');
  if(!email) throw new Error('Informe o e-mail.');
  if(password.length<6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  if(!keyword) throw new Error('Informe a palavra-chave de cadastro.');

  const res=await fetch(`${CONFIG.supabaseUrl}/functions/v1/crj-register`,{
    method:'POST',
    headers:{'Content-Type':'application/json','apikey':CONFIG.supabasePublishableKey},
    body:JSON.stringify({name,role,email,password,keyword}),
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(errorText(data?.error)||errorText(data)||'Não foi possível criar o cadastro.');
  return data;
}

function enhanceRegistration(){
  const form=document.querySelector('#login-form');
  const originalSignup=document.querySelector('#signup-btn');
  if(!form||!originalSignup||form.dataset.registrationEnhanced==='1') return;
  form.dataset.registrationEnhanced='1';

  const nameInput=form.querySelector('[name="display_name"]');
  const nameField=nameInput?.closest('.field');
  if(nameField){
    const label=nameField.querySelector('label');
    if(label) label.textContent='Nome completo do colaborador';
  }

  const emailInput=form.querySelector('[name="email"]');
  const passwordInput=form.querySelector('[name="password"]');
  const actions=originalSignup.closest('.actions');
  const loginButton=actions?.querySelector('button[type="submit"]');

  const switcher=document.createElement('div');
  switcher.className='auth-switcher';
  switcher.innerHTML=`
    <button type="button" class="auth-switch active" data-auth-mode="login">Entrar</button>
    <button type="button" class="auth-switch" data-auth-mode="register">Criar conta</button>
  `;
  form.before(switcher);

  const extras=document.createElement('div');
  extras.className='registration-extra';
  extras.innerHTML=`
    <div class="field">
      <label>Função</label>
      <select name="registration_role">
        <option value="">Selecione a função</option>
        ${FUNCTIONS.map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}
      </select>
    </div>
    <div class="field">
      <label>Palavra-chave de validação</label>
      <input class="input" name="registration_keyword" type="password" autocomplete="off" placeholder="Palavra-chave da equipe">
      <small>Solicitada somente para criar uma nova conta. Não é usada no login.</small>
    </div>
  `;
  actions?.before(extras);

  const signupButton=originalSignup.cloneNode(true);
  signupButton.textContent='Cadastrar colaborador';
  originalSignup.replaceWith(signupButton);

  let mode='login';
  const notice=form.nextElementSibling?.classList?.contains('notice') ? form.nextElementSibling : null;

  function setMode(next){
    mode=next;
    const isRegister=mode==='register';
    nameField?.classList.toggle('auth-register-only',!isRegister);
    extras.classList.toggle('auth-register-only',!isRegister);
    if(nameInput) nameInput.required=isRegister;
    const roleInput=form.querySelector('[name="registration_role"]');
    const keyInput=form.querySelector('[name="registration_keyword"]');
    if(roleInput) roleInput.required=isRegister;
    if(keyInput) keyInput.required=isRegister;

    if(loginButton) loginButton.style.display=isRegister?'none':'';
    signupButton.style.display=isRegister?'':'none';
    if(passwordInput) passwordInput.autocomplete=isRegister?'new-password':'current-password';

    switcher.querySelectorAll('[data-auth-mode]').forEach(b=>b.classList.toggle('active',b.dataset.authMode===mode));
    if(notice){
      notice.innerHTML=isRegister
        ? 'Crie a conta informando <b>nome completo</b>, <b>função</b>, e-mail, senha e a palavra-chave interna. A palavra-chave é usada apenas nesta etapa.'
        : 'Para acessar uma conta já criada, informe apenas o <b>e-mail</b> e a <b>senha</b> cadastrados.';
    }
    const msg=document.querySelector('#login-message');
    if(msg) msg.innerHTML='';
  }

  switcher.querySelectorAll('[data-auth-mode]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.authMode)));

  signupButton.addEventListener('click',async()=>{
    if(mode!=='register')return;
    signupButton.disabled=true;
    const original=signupButton.textContent;
    signupButton.textContent='Criando conta...';
    try{
      const result=await registerCollaborator(form);
      const email=emailInput?.value||'';
      form.reset();
      if(emailInput) emailInput.value=email;
      setMode('login');
      showMessage(`Conta criada para ${result.user?.display_name||'o colaborador'} como ${result.user?.role_label||'função selecionada'}. Agora entre usando somente e-mail e senha.`,'success');
      passwordInput?.focus();
    }catch(err){
      showMessage(errorText(err)||'Não foi possível criar a conta.','danger');
    }finally{
      signupButton.disabled=false;
      signupButton.textContent=original;
    }
  });

  setMode('login');
}

const observer=new MutationObserver(enhanceRegistration);
observer.observe(document.documentElement,{subtree:true,childList:true});
enhanceRegistration();
