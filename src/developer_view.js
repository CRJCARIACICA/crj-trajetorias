import { apiMode, supabaseClient, getSession } from './api.js?v=20261004-2';
import { DEVELOPER_PREVIEW_KEY, developerPreviewScope, developerPreviewLabel, roleLabel } from './permissions.js?v=20261006-1';

let profile=null,developerState=null,scheduled=false,toastTimer=null,logoutBypass=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function client(){if(apiMode()!=='live')return null;return supabaseClient()}
function currentScope(){return profile?.developer_preview_enabled?developerPreviewScope():null}
function storedPreview(){try{return JSON.parse(sessionStorage.getItem(DEVELOPER_PREVIEW_KEY)||'null')}catch{return null}}
function active(){return Boolean(currentScope()&&developerState?.active_role)}
function scopeLabel(){return developerPreviewLabel()||roleLabel(developerState?.active_role)||'Educador'}

const ROLE_OPTIONS=[
  {scope:'geral',role:'coordenacao_geral',label:'Desenvolvedor · acesso total',detail:'Libera a navegação combinada e as permissões gerais de desenvolvimento.'},
  {scope:'coordenacao',role:'coordenacao_geral',label:'Coordenação Geral',detail:'Testar o app com a função de Coordenação Geral.'},
  {scope:'articulacao',role:'coordenacao_articulacao',label:'Coordenação de Articulação',detail:'Testar fluxos e gravações da Coordenação de Articulação.'},
  {scope:'articulacao',role:'articulador',label:'Articulador(a) Local',detail:'Testar fluxos e gravações da Articulação Local.'},
  {scope:'educadores',role:'educador',label:'Educador(a) Social',detail:'Função normal do Wemerson e fluxos da área do Educador.'},
  {scope:'equipe_tecnica',role:'assistente_social',label:'Assistente Social',detail:'Testar atendimentos, PVIDA, PTrampo e demais ações técnicas.'},
  {scope:'equipe_tecnica',role:'psicologo',label:'Psicólogo(a)',detail:'Testar atendimentos e execução da Equipe Técnica.'},
  {scope:'equipe_tecnica',role:'terapeuta_ocupacional',label:'Terapeuta Ocupacional',detail:'Testar atendimentos e execução da Equipe Técnica.'},
  {scope:'controlador_acesso',role:'controlador_acesso',label:'Controlador(a) de Acessos',detail:'Testar recepção, presença, salas e empréstimos.'},
  {scope:'administrativo',role:'administrativo',label:'Administrativo',detail:'Testar rotinas e permissões administrativas.'},
  {scope:'oficineiros',role:'oficineiro',label:'Oficineiro(a)',detail:'Testar o portal e os recursos do oficineiro.'},
  {scope:'monitoramento',role:'monitoramento',label:'Monitoramento / Gestão OSC',detail:'Testar monitoramento, indicadores e gestão.'},
];

function style(){
  if(document.querySelector('#developer-view-style'))return;
  const s=document.createElement('style');s.id='developer-view-style';s.textContent=`
.dev-view-button{width:100%;margin-top:10px;border:1px dashed #77a899;background:#edf7f3;color:#0a5a49;border-radius:11px;padding:10px 12px;font-weight:800;cursor:pointer;text-align:left;min-height:52px;position:relative;z-index:5}.dev-view-button:hover{background:#e0f2eb}.dev-view-button:focus-visible{outline:3px solid rgba(11,91,76,.25);outline-offset:2px}.dev-view-button.active{background:#0b5b4c;color:#fff;border-style:solid}.dev-view-banner{margin:0 0 14px;border:1px solid #8fc8b7;background:#edf9f5;border-radius:13px;padding:11px 13px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.dev-view-banner strong{color:#0a5a49}.dev-view-modal-bg{position:fixed;inset:0;background:rgba(7,35,29,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px}.dev-view-modal{width:min(720px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:18px;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,.25)}.dev-view-modal h3{margin:0 0 6px}.dev-view-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:14px}.dev-view-option{border:1px solid #d7e3df;background:#fff;border-radius:12px;padding:12px;text-align:left;cursor:pointer;min-height:76px}.dev-view-option:hover{background:#f5faf8}.dev-view-option.selected{border-color:#0b6b58;background:#eaf6f2}.dev-view-option b{display:block}.dev-view-option small{display:block;color:#687872;margin-top:3px;line-height:1.35}.dev-view-option[disabled]{opacity:.55;cursor:wait}.dev-toast{position:fixed;right:20px;bottom:20px;z-index:100500;background:#163f36;color:#fff;padding:11px 14px;border-radius:11px;max-width:380px;box-shadow:0 14px 40px rgba(0,0,0,.22)}.dev-live-pill{display:inline-flex;align-items:center;gap:5px;margin-top:4px;padding:3px 7px;border-radius:999px;background:#dff4eb;color:#075b49;font-size:11px;font-weight:800}@media(max-width:620px){.dev-view-options{grid-template-columns:1fr}}
`;
  document.head.appendChild(s)
}
function toast(msg){document.querySelector('.dev-toast')?.remove();const d=document.createElement('div');d.className='dev-toast';d.textContent=msg;document.body.appendChild(d);clearTimeout(toastTimer);toastTimer=setTimeout(()=>d.remove(),3600)}
function clearPreview(){sessionStorage.removeItem(DEVELOPER_PREVIEW_KEY)}
function setPreview(scope,role){sessionStorage.setItem(DEVELOPER_PREVIEW_KEY,JSON.stringify({enabled:true,scope,role,owner:profile?.id||null,started_at:new Date().toISOString()}))}
function reloadToCurrent(){const url=new URL(location.href);url.searchParams.set('_dv',Date.now().toString());location.replace(url.toString())}
async function refreshDeveloperState(){const {data,error}=await client().rpc('developer_get_my_state');if(error)throw error;developerState=data||{is_developer:false};return developerState}
async function applyRole(scope,role){
  const {data,error}=await client().rpc('developer_set_my_role',{p_role:role,p_scope:scope});
  if(error)throw error;
  developerState=data||developerState;
  if(profile&&data?.current_role){profile.role=data.current_role;profile.team=data.current_team||profile.team}
  setPreview(scope,role);
}
async function resetRole(){
  const {data,error}=await client().rpc('developer_reset_my_role');
  if(error)throw error;
  developerState=data||developerState;
  if(profile&&data?.current_role){profile.role=data.current_role;profile.team=data.current_team||profile.team}
  clearPreview();
}

function openModal(){
  if(!profile?.developer_preview_enabled||!developerState?.is_developer)return;
  document.querySelector('#developer-view-modal')?.remove();
  const current=currentScope(),currentRole=developerState?.active_role||'';
  const bg=document.createElement('div');bg.id='developer-view-modal';bg.className='dev-view-modal-bg';
  const options=ROLE_OPTIONS.map(o=>`<button type="button" class="dev-view-option ${current===o.scope&&currentRole===o.role?'selected':''}" data-dev-role="${o.role}" data-dev-scope="${o.scope}"><b>${esc(o.label)}</b><small>${esc(o.detail)}</small></button>`).join('');
  bg.innerHTML=`<div class="dev-view-modal"><div style="display:flex;justify-content:space-between;gap:12px;align-items:start"><div><h3>Função de desenvolvimento</h3><p class="muted" style="margin:0">Exclusivo do Wemerson. Escolha a função efetiva usada para testar o sistema.</p></div><button class="btn ghost" type="button" data-dev-close>✕</button></div><div class="notice warn" style="margin-top:14px"><b>Alterações reais estão habilitadas.</b><br>Enquanto uma função de desenvolvimento estiver ativa, criar, editar, excluir, aprovar, registrar presenças e demais ações gravam no banco normalmente. A identidade que executa a ação continua sendo a conta do Wemerson.</div><div class="dev-view-options"><button type="button" class="dev-view-option ${!current&&!developerState?.active_role?'selected':''}" data-dev-normal><b>Normal · Educador(a) Social</b><small>Restaura a função normal e encerra o modo de desenvolvimento.</small></button>${options}</div></div>`;
  document.body.appendChild(bg)
}

function installButton(){
  const footer=document.querySelector('.sidebar-footer');if(!footer)return;
  let b=footer.querySelector('[data-developer-view-button]');
  if(!b){b=document.createElement('button');b.type='button';b.dataset.developerViewButton='1';footer.appendChild(b)}
  b.className='dev-view-button'+(active()?' active':'');
  const role=developerState?.active_role?roleLabel(developerState.active_role):'Educador(a) Social';
  b.innerHTML=active()?`◉ Desenvolvimento · ${esc(role)}<br><small style="font-weight:600;opacity:.88">Gravação habilitada · clique para trocar</small>`:`◉ Função de desenvolvimento<br><small style="font-weight:600;opacity:.8">Trocar função para testar o app</small>`;
}
function installBanner(){
  if(!active()){document.querySelector('[data-dev-banner]')?.remove();return}
  const content=document.querySelector('.content');if(!content)return;
  let d=content.querySelector('[data-dev-banner]');
  if(!d){d=document.createElement('div');d.dataset.devBanner='1';d.className='dev-view-banner';content.prepend(d)}
  const role=roleLabel(developerState?.active_role);
  d.innerHTML=`<div><strong>Modo desenvolvedor · ${esc(role)}</strong><br><span class="muted">Função efetiva alterada para testes. Alterações e registros estão habilitados.</span><br><span class="dev-live-pill">● gravação real no banco</span></div><div class="actions"><button type="button" class="btn secondary" data-dev-change>Trocar função</button><button type="button" class="btn" data-dev-exit>Voltar para Educador</button></div>`
}

async function handleClick(e){
  const t=e.target.closest?.('button,[role="button"],[data-action],a');if(!t)return;
  if(t.matches('[data-developer-view-button],[data-dev-change]')){e.preventDefault();e.stopImmediatePropagation();openModal();return}
  if(t.matches('[data-dev-close]')){e.preventDefault();document.querySelector('#developer-view-modal')?.remove();return}
  if(t.matches('[data-dev-normal],[data-dev-exit]')){
    e.preventDefault();e.stopImmediatePropagation();
    try{t.disabled=true;await resetRole();reloadToCurrent()}catch(err){t.disabled=false;toast(err?.message||String(err))}
    return;
  }
  if(t.matches('[data-dev-role][data-dev-scope]')){
    e.preventDefault();e.stopImmediatePropagation();
    try{
      document.querySelectorAll('#developer-view-modal button').forEach(b=>b.disabled=true);
      await applyRole(t.dataset.devScope,t.dataset.devRole);
      reloadToCurrent();
    }catch(err){document.querySelectorAll('#developer-view-modal button').forEach(b=>b.disabled=false);toast(err?.message||String(err))}
    return;
  }
  if(t.matches('[data-action="logout"]')){
    if(logoutBypass)return;
    if(developerState?.active_role){
      e.preventDefault();e.stopImmediatePropagation();
      try{await resetRole()}catch(err){console.warn('Não foi possível restaurar a função antes de sair:',err)}
      clearPreview();logoutBypass=true;t.click();
    }else clearPreview();
  }
}
function apply(){if(!profile?.developer_preview_enabled||!developerState?.is_developer)return;style();installButton();installBanner()}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply()})}

async function boot(){
  for(let i=0;i<100;i++){if(apiMode()==='live')break;await sleep(100)}
  if(apiMode()!=='live')return;
  let session=null;try{session=await getSession()}catch{}
  if(!session?.user?.id){clearPreview();return}
  const r=await client().from('profiles').select('id,display_name,role,team,active,developer_preview_enabled').eq('id',session.user.id).maybeSingle();
  if(r.error||!r.data?.developer_preview_enabled){clearPreview();return}
  profile=r.data;
  try{await refreshDeveloperState()}catch(err){console.warn('Não foi possível validar a conta de desenvolvedor:',err);clearPreview();return}
  if(!developerState?.is_developer){clearPreview();return}
  const stored=storedPreview();
  if(stored?.owner&&stored.owner!==profile.id)clearPreview();
  if(developerState.active_scope&&developerState.active_role){
    if(!stored||stored.scope!==developerState.active_scope||stored.role!==developerState.active_role)setPreview(developerState.active_scope,developerState.active_role);
  }else if(stored)clearPreview();
  document.addEventListener('click',handleClick,true);
  window.addEventListener('hashchange',schedule);
  new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true});
  schedule();
}
boot();
