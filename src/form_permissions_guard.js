import { supabaseClient } from './api.js?v=20261004-2';
import { FORM_FILL_ROLES, canFillForm, roleLabel } from './permissions.js?v=20261005-1';

let currentRole=null;
let currentUserId=null;
let scheduled=false;

const youthBoundSlugs=new Set(['formulario-inicial','acompanhamento','pvida','outras-demandas','ptrampo']);

function toast(message){
  const old=document.querySelector('[data-form-permission-toast]');
  old?.remove();
  const el=document.createElement('div');
  el.dataset.formPermissionToast='1';
  el.className='pill danger';
  el.textContent=message;
  Object.assign(el.style,{position:'fixed',right:'20px',bottom:'20px',zIndex:'2147483000',padding:'12px 16px',boxShadow:'0 10px 35px rgba(0,0,0,.22)',maxWidth:'360px'});
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),4200);
}

function slugFromTargetRoute(raw=''){
  const route=String(raw||'').replace(/^#/,'').split('?')[0];
  if(route==='novo-jovem'||route.startsWith('editar-jovem/'))return 'formulario-inicial';
  if(route.startsWith('formulario/'))return route.split('/')[1]||null;
  return null;
}

function allowed(slug){
  if(!slug||!currentRole)return false;
  return canFillForm(currentRole,slug);
}

function roleAccessText(){
  if(!currentRole)return 'Seu perfil atual';
  return roleLabel(currentRole)||currentRole;
}

function blockRouteIfNeeded(){
  if(!currentRole)return;
  const slug=slugFromTargetRoute(location.hash);
  if(!slug||allowed(slug))return;
  const content=document.querySelector('.content');
  if(!content||content.dataset.formAccessBlocked===slug)return;
  content.dataset.formAccessBlocked=slug;
  const annex=Object.entries(FORM_FILL_ROLES).find(([key])=>key===slug)?.[0]||slug;
  content.innerHTML=`<div class="page-head"><div><h2>Preenchimento não autorizado</h2><p>As permissões de formulários seguem a função cadastrada na equipe.</p></div></div><div class="notice danger"><b>${escapeHtml(roleAccessText())}</b> não possui permissão para preencher este formulário.<br><small>Formulário: ${escapeHtml(annex)}. A visualização de registros existentes continua sujeita às regras de acesso e sensibilidade do sistema.</small></div><div class="actions" style="margin-top:16px"><button class="btn primary" type="button" data-form-permission-back>Voltar aos formulários</button></div>`;
  content.querySelector('[data-form-permission-back]')?.addEventListener('click',()=>{location.hash='formularios'});
}

function escapeHtml(v=''){
  return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function disableRouteButton(btn,slug){
  if(!btn||!slug||allowed(slug))return;
  btn.disabled=true;
  btn.setAttribute('aria-disabled','true');
  btn.title='Seu perfil não possui permissão para preencher este formulário.';
  btn.classList.remove('primary');
  btn.classList.add('secondary');
  if(!btn.dataset.permissionLabeled){
    btn.dataset.permissionLabeled='1';
    if(/^(Preencher|Cadastrar|Abrir pela trajetória|Preencher lista|Uso livre)$/i.test((btn.textContent||'').trim())){
      btn.textContent='Sem permissão para preencher';
    }
  }
}

function decorateForms(){
  if(!currentRole)return;

  document.querySelectorAll('[data-nav]').forEach(btn=>{
    const slug=slugFromTargetRoute(btn.dataset.nav||'');
    if(slug)disableRouteButton(btn,slug);
  });
  document.querySelectorAll('[data-modal-nav]').forEach(btn=>{
    const slug=slugFromTargetRoute(btn.dataset.modalNav||'');
    if(slug)disableRouteButton(btn,slug);
  });

  document.querySelectorAll('[data-action="new-youth-form"]').forEach(btn=>{
    const hasYouthForm=Object.keys(FORM_FILL_ROLES).some(slug=>youthBoundSlugs.has(slug)&&allowed(slug));
    if(!hasYouthForm){
      btn.disabled=true;
      btn.title='Seu perfil não possui formulários individuais de jovem para preencher.';
    }
  });

  // Garante que o cargo Controlador(a) de Acessos apareça mesmo em clientes que ainda tenham cache antigo do app.
  document.querySelectorAll('[data-team-role]').forEach(select=>{
    if(!select.querySelector('option[value="controlador_acesso"]')){
      const option=document.createElement('option');
      option.value='controlador_acesso';
      option.textContent='Controlador(a) de Acessos';
      select.appendChild(option);
    }
  });

  // Fallback visual para o Controlador de Acessos caso o layout principal tenha sido montado com permissions.js em cache.
  if(currentRole==='controlador_acesso'){
    const nav=document.querySelector('.sidebar .nav');
    if(nav&&!nav.querySelector('a[href="#formularios"]')){
      const sep=nav.querySelector('.sep');
      const link=document.createElement('a');
      link.href='#formularios';
      link.innerHTML='<span>▤</span><span>Formulários</span>';
      if(sep)nav.insertBefore(link,sep);else nav.appendChild(link);
    }
  }
}

function enforce(){
  scheduled=false;
  decorateForms();
  blockRouteIfNeeded();
}
function scheduleEnforce(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(enforce);
}

async function resolveRole(){
  try{
    const client=supabaseClient();
    const {data:{session}}=await client.auth.getSession();
    if(!session?.user)return;
    currentUserId=session.user.id;
    const {data,error}=await client.from('profiles').select('role').eq('id',currentUserId).single();
    if(error)throw error;
    currentRole=data?.role||null;
    scheduleEnforce();
  }catch(err){
    console.warn('Não foi possível aplicar a matriz visual de formulários:',err);
  }
}

document.addEventListener('click',e=>{
  if(!currentRole)return;
  const routeBtn=e.target.closest?.('[data-nav],[data-modal-nav]');
  if(routeBtn){
    const route=routeBtn.dataset.nav||routeBtn.dataset.modalNav||'';
    const slug=slugFromTargetRoute(route);
    if(slug&&!allowed(slug)){
      e.preventDefault();
      e.stopImmediatePropagation();
      toast('Preenchimento não autorizado para '+roleAccessText()+'.');
      return;
    }
  }
  const newYouthForm=e.target.closest?.('[data-action="new-youth-form"]');
  if(newYouthForm){
    const hasYouthForm=Object.keys(FORM_FILL_ROLES).some(slug=>youthBoundSlugs.has(slug)&&allowed(slug));
    if(!hasYouthForm){
      e.preventDefault();
      e.stopImmediatePropagation();
      toast('Seu perfil não possui formulários individuais de jovem para preencher.');
    }
  }
},true);

window.addEventListener('hashchange',scheduleEnforce);
const observer=new MutationObserver(scheduleEnforce);
observer.observe(document.documentElement,{childList:true,subtree:true});
resolveRole();
