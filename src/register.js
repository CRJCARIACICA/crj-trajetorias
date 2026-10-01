
import { CONFIG } from './config.js';

const FUNCTIONS = [
  ['coordenacao_geral','Coordenação Geral'],
  ['coordenacao_articulacao','Coordenação de Articulação'],
  ['articulador','Articulador(a) Local'],
  ['educador','Educador(a) Social'],
  ['assistente_social','Assistente Social'],
  ['psicologo','Psicólogo(a)'],
  ['terapeuta_ocupacional','Terapeuta Ocupacional'],
  ['administrativo','Administrativo'],
  ['oficineiro','Oficineiro(a)'],
  ['monitoramento','Monitoramento / Gestão OSC'],
];

function showMessage(text,type=''){
  const el=document.querySelector('#login-message');
  if(el) el.innerHTML=`<div class="notice ${type}" style="margin-top:12px">${String(text).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}</div>`;
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
    headers:{
      'Content-Type':'application/json',
      'apikey':CONFIG.supabasePublishableKey,
    },
    body:JSON.stringify({name,role,email,password,keyword}),
  });

  const data=await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error||'Não foi possível criar o cadastro.');

  return data;
}

function enhanceRegistration(){
  const form=document.querySelector('#login-form');
  const signup=document.querySelector('#signup-btn');
  if(!form||!signup||form.dataset.registrationEnhanced==='1') return;
  form.dataset.registrationEnhanced='1';

  const nameInput=form.querySelector('[name="display_name"]');
  const nameField=nameInput?.closest('.field');
  if(nameField){
    const label=nameField.querySelector('label');
    if(label) label.innerHTML='Nome completo do colaborador <span class="muted">(para novo cadastro)</span>';
    nameInput.required=false;
  }

  const actions=signup.closest('.actions');
  const extras=document.createElement('div');
  extras.className='registration-extra';
  extras.innerHTML=`
    <div class="divider">dados para novo cadastro</div>
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
      <small>Usada somente para autorizar a criação da conta.</small>
    </div>
  `;
  actions?.before(extras);

  const cleanButton=signup.cloneNode(true);
  signup.replaceWith(cleanButton);

  cleanButton.addEventListener('click',async()=>{
    cleanButton.disabled=true;
    const original=cleanButton.textContent;
    cleanButton.textContent='Criando conta...';
    try{
      const result=await registerCollaborator(form);
      showMessage(`Cadastro criado para ${result.user?.display_name||'o colaborador'} como ${result.user?.role_label||'função selecionada'}. Entrando no sistema...`,'success');
      form.querySelector('[name="registration_keyword"]').value='';
      setTimeout(()=>form.requestSubmit(),350);
    }catch(err){
      showMessage(err.message,'danger');
    }finally{
      cleanButton.disabled=false;
      cleanButton.textContent=original;
    }
  });
}

const observer=new MutationObserver(enhanceRegistration);
observer.observe(document.documentElement,{subtree:true,childList:true});
enhanceRegistration();
