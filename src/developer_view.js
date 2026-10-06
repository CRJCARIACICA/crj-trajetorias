import { apiMode, supabaseClient, getSession } from './api.js?v=20261004-2';
import { DEVELOPER_PREVIEW_KEY, DEVELOPER_PREVIEW_SCOPES, developerPreviewScope, developerPreviewLabel } from './permissions.js?v=20261006-1';

let profile=null,scheduled=false,toastTimer=null;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function client(){if(apiMode()!=='live')return null;return supabaseClient()}
function currentScope(){return profile?.developer_preview_enabled?developerPreviewScope():null}
function active(){return Boolean(currentScope())}
function scopeLabel(){return developerPreviewLabel()||'Educador'}

function style(){
  if(document.querySelector('#developer-view-style'))return;
  const s=document.createElement('style');s.id='developer-view-style';s.textContent=`
.dev-view-button{width:100%;margin-top:10px;border:1px dashed #77a899;background:#edf7f3;color:#0a5a49;border-radius:11px;padding:10px 12px;font-weight:800;cursor:pointer;text-align:left;min-height:52px;position:relative;z-index:5}.dev-view-button:hover{background:#e0f2eb}.dev-view-button:focus-visible{outline:3px solid rgba(11,91,76,.25);outline-offset:2px}.dev-view-button.active{background:#0b5b4c;color:#fff;border-style:solid}.dev-view-banner{margin:0 0 14px;border:1px solid #8fc8b7;background:#edf9f5;border-radius:13px;padding:11px 13px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.dev-view-banner strong{color:#0a5a49}.dev-view-modal-bg{position:fixed;inset:0;background:rgba(7,35,29,.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px}.dev-view-modal{width:min(620px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:18px;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,.25)}.dev-view-modal h3{margin:0 0 6px}.dev-view-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:14px}.dev-view-option{border:1px solid #d7e3df;background:#fff;border-radius:12px;padding:12px;text-align:left;cursor:pointer;min-height:70px}.dev-view-option:hover{background:#f5faf8}.dev-view-option.selected{border-color:#0b6b58;background:#eaf6f2}.dev-view-option b{display:block}.dev-view-option small{color:#687872}.dev-readonly-mark{opacity:.58!important;cursor:not-allowed!important}.dev-toast{position:fixed;right:20px;bottom:20px;z-index:100500;background:#163f36;color:#fff;padding:11px 14px;border-radius:11px;max-width:340px;box-shadow:0 14px 40px rgba(0,0,0,.22)}@media(max-width:620px){.dev-view-options{grid-template-columns:1fr}}
`;
  document.head.appendChild(s)
}
function toast(msg){document.querySelector('.dev-toast')?.remove();const d=document.createElement('div');d.className='dev-toast';d.textContent=msg;document.body.appendChild(d);clearTimeout(toastTimer);toastTimer=setTimeout(()=>d.remove(),3200)}
function clearPreview(){sessionStorage.removeItem(DEVELOPER_PREVIEW_KEY)}
function setPreview(scope){if(!DEVELOPER_PREVIEW_SCOPES[scope])return;sessionStorage.setItem(DEVELOPER_PREVIEW_KEY,JSON.stringify({enabled:true,scope,owner:profile?.id||null,started_at:new Date().toISOString()}))}
function reloadToCurrent(){
  const url=new URL(location.href);url.searchParams.set('_dv',Date.now().toString());
  location.replace(url.toString())
}

function openModal(){
  if(!profile?.developer_preview_enabled)return;
  document.querySelector('#developer-view-modal')?.remove();
  const current=currentScope();
  const bg=document.createElement('div');bg.id='developer-view-modal';bg.className='dev-view-modal-bg';
  const teamOptions=Object.entries(DEVELOPER_PREVIEW_SCOPES).filter(([k])=>k!=='geral').map(([scope,cfg])=>`<button type="button" class="dev-view-option ${current===scope?'selected':''}" data-dev-scope="${scope}"><b>${esc(cfg.label)}</b><small>Simular navegação e permissões visuais desta equipe.</small></button>`).join('');
  bg.innerHTML=`<div class="dev-view-modal"><div style="display:flex;justify-content:space-between;gap:12px;align-items:start"><div><h3>Visualizar como desenvolvedor</h3><p class="muted" style="margin:0">Seu perfil real permanece <b>Educador</b>. Escolha uma visão para acompanhar a interface do sistema.</p></div><button class="btn ghost" type="button" data-dev-close>✕</button></div><div class="notice info" style="margin-top:14px"><b>Somente visualização.</b> O modo desenvolvedor não altera seu cargo real e não amplia gravações no banco. Para registrar ou editar, volte ao modo Normal · Educador.</div><div class="dev-view-options"><button type="button" class="dev-view-option ${!current?'selected':''}" data-dev-normal><b>Normal · Educador</b><small>Permissões padrão do seu perfil.</small></button><button type="button" class="dev-view-option ${current==='geral'?'selected':''}" data-dev-scope="geral"><b>Visão geral</b><small>Combina a navegação dos setores disponíveis para acompanhamento.</small></button>${teamOptions}</div></div>`;
  document.body.appendChild(bg)
}

function installButton(){
  const footer=document.querySelector('.sidebar-footer');if(!footer)return;
  let b=footer.querySelector('[data-developer-view-button]');
  if(!b){b=document.createElement('button');b.type='button';b.dataset.developerViewButton='1';footer.appendChild(b)}
  b.className='dev-view-button'+(active()?' active':'');
  b.innerHTML=active()?`◉ Desenvolvedor · ${esc(scopeLabel())}<br><small style="font-weight:600;opacity:.85">Clique para trocar ou sair</small>`:`◉ Visualizar como desenvolvedor<br><small style="font-weight:600;opacity:.8">Geral ou por equipe</small>`;
}
function installBanner(){
  if(!active()){document.querySelector('[data-dev-banner]')?.remove();return}
  const content=document.querySelector('.content');if(!content)return;
  let d=content.querySelector('[data-dev-banner]');
  if(!d){d=document.createElement('div');d.dataset.devBanner='1';d.className='dev-view-banner';content.prepend(d)}
  d.innerHTML=`<div><strong>Modo desenvolvedor · ${esc(scopeLabel())}</strong><br><span class="muted">Simulação visual em somente leitura. Seu cargo real continua Educador.</span></div><div class="actions"><button type="button" class="btn secondary" data-dev-change>Trocar visão</button><button type="button" class="btn" data-dev-exit>Sair do modo</button></div>`
}

const writeWords=/\b(salvar|editar|excluir|apagar|remover|criar|novo|nova|registrar|adicionar|incluir|inscrever|atendimento|aprovar|recusar|cancelar|concluir|enviar|gerar\s+link|planejar|responder|restaurar|reabrir|vincular|desvincular|atribuir|alterar)\b/i;
const safeWords=/\b(voltar|visualizar|ver|consultar|buscar|filtrar|pdf|docx|imprimir|baixar|download|detalhes|fechar|trocar visão|sair do modo)\b/i;
function markReadonly(){
  if(!active())return;
  document.querySelectorAll('.content button,.content [role="button"]').forEach(b=>{
    if(b.closest('[data-dev-banner]')||b.closest('#developer-view-modal'))return;
    const txt=(b.textContent||'').trim();if(!txt||safeWords.test(txt)||!writeWords.test(txt))return;
    b.dataset.devWriteBlocked='1';b.classList.add('dev-readonly-mark');b.title='Modo desenvolvedor: somente visualização.'
  })
}
function handleClick(e){
  const t=e.target.closest?.('button,[role="button"],[data-action],[data-nav],a');if(!t)return;
  if(t.matches('[data-developer-view-button],[data-dev-change]')){e.preventDefault();e.stopImmediatePropagation();openModal();return}
  if(t.matches('[data-dev-close]')){e.preventDefault();document.querySelector('#developer-view-modal')?.remove();return}
  if(t.matches('[data-dev-normal]')){e.preventDefault();clearPreview();reloadToCurrent();return}
  if(t.matches('[data-dev-scope]')){e.preventDefault();setPreview(t.dataset.devScope);reloadToCurrent();return}
  if(t.matches('[data-dev-exit]')){e.preventDefault();clearPreview();reloadToCurrent();return}
  if(t.matches('[data-action="logout"]')){clearPreview();return}
  if(!active()||t.closest('#developer-view-modal')||t.closest('[data-dev-banner]'))return;
  const txt=(t.textContent||'').trim();
  if(t.dataset.devWriteBlocked==='1'||(writeWords.test(txt)&&!safeWords.test(txt))){e.preventDefault();e.stopImmediatePropagation();toast('Modo desenvolvedor é somente visualização. Saia do modo para executar esta ação.')}
}
function guardSubmit(e){if(!active()||e.target?.closest?.('#developer-view-modal'))return;e.preventDefault();e.stopImmediatePropagation();toast('Formulários não são enviados no modo desenvolvedor. Saia do modo para registrar alterações.')}
function apply(){if(!profile?.developer_preview_enabled)return;style();installButton();installBanner();markReadonly()}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply()})}

async function boot(){
  for(let i=0;i<100;i++){if(apiMode()==='live')break;await sleep(100)}
  if(apiMode()!=='live')return;
  let session=null;try{session=await getSession()}catch{}
  if(!session?.user?.id){clearPreview();return}
  const r=await client().from('profiles').select('id,display_name,role,team,active,developer_preview_enabled').eq('id',session.user.id).maybeSingle();
  if(r.error||!r.data?.developer_preview_enabled){const had=Boolean(developerPreviewScope());clearPreview();if(had)location.reload();return}
  profile=r.data;
  const storedOwner=(()=>{try{return JSON.parse(sessionStorage.getItem(DEVELOPER_PREVIEW_KEY)||'null')?.owner||null}catch{return null}})();
  if(storedOwner&&storedOwner!==profile.id)clearPreview();
  document.addEventListener('click',handleClick,true);document.addEventListener('submit',guardSubmit,true);
  window.addEventListener('hashchange',schedule);new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true});schedule()
}
boot();
