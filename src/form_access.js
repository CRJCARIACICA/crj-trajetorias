import { getSession } from './api.js?v=20261004-2';
import { canFillForm, roleLabel } from './permissions.js?v=20261005-3';

const ANNEX_TO_SLUG={
  'Anexo 1':'formulario-inicial',
  'Anexo 2':'lista-presenca-contato',
  'Anexo 3':'acompanhamento',
  'Anexo 4':'pvida',
  'Anexo 5':'outras-demandas',
  'Anexo 6':'ptrampo',
  'Anexo 7':'avaliacao-atividades',
  'Anexo 8':'relatorio-mobilizacao',
  'Anexo 9':'emprestimo',
  'Anexo 10':'emprestimo-canhoto',
  'Anexo 11':'cfdh-planejamento',
  'Anexo 12':'cfdh-avaliacao-jovens',
  'Anexo 13':'cfdh-avaliacao-equipe',
};
const SLUG_LABEL={
  'formulario-inicial':'Anexo 1 · Formulário Inicial',
  'lista-presenca-contato':'Anexo 2 · Lista de Presença e Contato',
  acompanhamento:'Anexo 3 · Acompanhamento',
  pvida:'Anexo 4 · PVida',
  'outras-demandas':'Anexo 5 · Outras Demandas',
  ptrampo:'Anexo 6 · PTrampo',
  'avaliacao-atividades':'Anexo 7 · Avaliação das Atividades',
  'relatorio-mobilizacao':'Anexo 8 · Relatório de Mobilização',
  emprestimo:'Anexo 9 · Empréstimo',
  'emprestimo-canhoto':'Anexo 10 · Canhoto de Empréstimo',
  'cfdh-planejamento':'Anexo 11 · CFDH Planejamento',
  'cfdh-avaliacao-jovens':'Anexo 12 · CFDH Avaliação dos Jovens',
  'cfdh-avaliacao-equipe':'Anexo 13 · CFDH Avaliação Educadores e Oficineiros',
};

let currentRole=null;
let observer=null;
let scheduled=false;

function slugFromHash(){
  const raw=(location.hash||'').replace(/^#/,'').split('?')[0];
  if(raw==='novo-jovem'||raw.startsWith('editar-jovem/'))return 'formulario-inicial';
  if(raw.startsWith('formulario/'))return decodeURIComponent(raw.split('/')[1]||'');
  return null;
}
function allowed(slug){return Boolean(currentRole&&canFillForm(currentRole,slug))}
function deny(slug){
  const label=SLUG_LABEL[slug]||'Este formulário';
  sessionStorage.setItem('crj_form_access_notice',label+' não está liberado para '+roleLabel(currentRole)+'.');
  if(!location.hash.startsWith('#formularios'))location.hash='#formularios';
}
function guardRoute(){
  const slug=slugFromHash();
  if(slug&&!allowed(slug))deny(slug);
}
function addControllerNavigation(){
  if(currentRole!=='controlador_acesso')return;
  const nav=document.querySelector('.sidebar .nav');
  if(!nav)return;
  if(!nav.querySelector('a[href="#formularios"]')){
    const sep=nav.querySelector('.sep');
    const a=document.createElement('a');
    a.href='#formularios';a.innerHTML='<span>▤</span><span>Formulários</span>';
    nav.insertBefore(a,sep||null);
  }
  if(!nav.querySelector('a[href="#agenda"]')){
    const sep=nav.querySelector('.sep');
    const a=document.createElement('a');
    a.href='#agenda';a.innerHTML='<span>▦</span><span>Agenda</span>';
    nav.insertBefore(a,sep||null);
  }
  document.querySelectorAll('.sidebar-footer small').forEach(el=>{
    if(el.textContent.trim()==='controlador_acesso')el.textContent='Controlador(a) de Acessos';
  });
}
function ensureRoleOption(){
  document.querySelectorAll('select[name="role"],select[data-team-role]').forEach(select=>{
    if(!select.querySelector('option[value="controlador_acesso"]')){
      const option=document.createElement('option');
      option.value='controlador_acesso';option.textContent='Controlador(a) de Acessos';
      const admin=select.querySelector('option[value="administrativo"]');
      select.insertBefore(option,admin||null);
    }
  });
}
function slugForCard(card){
  const text=(card.textContent||'').replace(/\s+/g,' ');
  for(const [annex,slug] of Object.entries(ANNEX_TO_SLUG)){
    const re=new RegExp('\\b'+annex.replace(' ','\\s+')+'\\b','i');
    if(re.test(text))return slug;
  }
  const nav=card.querySelector('[data-nav^="formulario/"]');
  if(nav)return String(nav.getAttribute('data-nav')||'').split('?')[0].split('/')[1]||null;
  if(card.querySelector('[data-nav="novo-jovem"]'))return 'formulario-inicial';
  return null;
}
function decorateFormsPage(){
  if(!location.hash.startsWith('#formularios'))return;
  document.querySelectorAll('.content .card').forEach(card=>{
    const slug=slugForCard(card);if(!slug)return;
    const ok=allowed(slug);
    card.classList.toggle('form-access-denied',!ok);
    card.querySelectorAll('button,[data-nav]').forEach(btn=>{
      if(!ok){
        btn.dataset.formAccessBlocked='1';
        if(btn.tagName==='BUTTON')btn.disabled=true;
      }else{
        delete btn.dataset.formAccessBlocked;
        if(btn.tagName==='BUTTON'&&btn.dataset.permissionDisabled!=='1')btn.disabled=false;
      }
    });
    let badge=card.querySelector('[data-form-access-badge]');
    if(!badge){badge=document.createElement('div');badge.dataset.formAccessBadge='1';badge.style.marginTop='10px';card.appendChild(badge)}
    badge.innerHTML=ok
      ?'<span class="pill success">Permitido para preenchimento</span>'
      :'<span class="pill warn">Somente consulta / sem permissão para preencher</span>';
  });
  const notice=sessionStorage.getItem('crj_form_access_notice');
  if(notice){
    sessionStorage.removeItem('crj_form_access_notice');
    const head=document.querySelector('.content .page-head');
    if(head){const div=document.createElement('div');div.className='notice danger';div.style.marginBottom='14px';div.textContent=notice;head.insertAdjacentElement('afterend',div)}
  }
}
function protectInitialButtons(){
  document.querySelectorAll('[data-nav="novo-jovem"],[data-nav^="editar-jovem/"]').forEach(btn=>{
    if(!allowed('formulario-inicial')){
      btn.dataset.formAccessBlocked='1';
      if(btn.tagName==='BUTTON')btn.disabled=true;
    }
  });
}
function protectModalButtons(){
  document.querySelectorAll('[data-modal-nav]').forEach(btn=>{
    const nav=String(btn.dataset.modalNav||'').split('?')[0];
    if(!nav.startsWith('formulario/'))return;
    const slug=nav.split('/')[1]||'';
    if(!allowed(slug)){
      btn.dataset.formAccessBlocked='1';
      btn.disabled=true;
      btn.title='Seu perfil não possui permissão para preencher este formulário.';
    }
  });
}
function apply(){
  if(!currentRole)return;
  addControllerNavigation();ensureRoleOption();decorateFormsPage();protectInitialButtons();protectModalButtons();guardRoute();
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply()})}

document.addEventListener('click',e=>{
  const target=e.target.closest?.('[data-nav],[data-modal-nav],a[href]');if(!target||!currentRole)return;
  const nav=target.getAttribute('data-nav')||target.getAttribute('data-modal-nav')||target.getAttribute('href')?.replace(/^#/,'')||'';
  let slug=null;
  const clean=nav.split('?')[0];
  if(clean==='novo-jovem'||clean.startsWith('editar-jovem/'))slug='formulario-inicial';
  else if(clean.startsWith('formulario/'))slug=clean.split('/')[1]||null;
  if(slug&&!allowed(slug)){
    e.preventDefault();e.stopImmediatePropagation();deny(slug);
  }
},true);
window.addEventListener('hashchange',()=>setTimeout(schedule,0));

(async()=>{
  try{currentRole=(await getSession())?.user?.role||null}catch{}
  if(!currentRole)return;
  observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  apply();
})();
