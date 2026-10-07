import { apiMode, supabaseClient } from './api.js?v=20261004-2';
import { FORMS } from './forms.js';

let me=null;
let timer=null;
const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const labels={
  'levantamento-demanda':'Levantamento de Demanda',
  'acao-levantamento-demanda':'Ação de Levantamento de Demanda',
  'plano-mobilizacao':'Plano de Mobilização',
  'acao-articulacao':'Ação da Articulação'
};

function c(){
  if(apiMode()!=='live') throw new Error('Banco ainda não conectado.');
  return supabaseClient();
}
function isRoute(){return location.hash.split('?')[0]==='#documentos-evidencias'}
function titleFromSlug(slug){
  const f=FORMS.find(x=>x.slug===slug);
  return f?`${f.annex} — ${f.title}`:(labels[slug]||slug||'Documento');
}
function errorText(err,fallback='Não foi possível concluir a operação.'){
  if(!err)return fallback;
  if(typeof err==='string')return err;
  return err.message||err.error_description||err.details||err.hint||fallback;
}
function addCss(){
  if(document.querySelector('#document-delete-css'))return;
  const s=document.createElement('style');
  s.id='document-delete-css';
  s.textContent=`
    .dd-delete-btn{border-color:#d7a6a6!important;color:#9f2727!important;background:#fff!important}
    .dd-delete-btn:hover{background:#fff1f1!important}
    .dd-trash-btn{border-style:dashed!important}
    .dd-trash-backdrop{position:fixed;inset:0;z-index:2147483250;background:rgba(4,17,21,.72);display:grid;place-items:center;padding:14px}
    .dd-trash-modal{width:min(850px,96vw);max-height:90vh;overflow:auto;background:#fff;border-radius:16px;box-shadow:0 18px 60px rgba(0,0,0,.28)}
    .dd-trash-modal header{position:sticky;top:0;background:#fff;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:16px 18px;border-bottom:1px solid #e3e9e7;z-index:2}
    .dd-trash-modal .body{padding:16px 18px}
    .dd-trash-item{border:1px solid #e2e9e6;border-radius:12px;padding:12px;margin:9px 0}
    .dd-trash-item h4{margin:0 0 5px}.dd-trash-meta{font-size:12px;color:#68746f}.dd-trash-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
  `;
  document.head.appendChild(s);
}
async function ready(){
  if(me?.id)return true;
  if(apiMode()!=='live')return false;
  try{
    const cl=c();
    const {data:{user}}=await cl.auth.getUser();
    if(!user)return false;
    const {data,error}=await cl.from('profiles').select('id,display_name,role,active').eq('id',user.id).single();
    if(error)throw error;
    me=data;
    return me?.active!==false;
  }catch(e){
    console.warn('Falha ao preparar exclusão de documentos:',errorText(e));
    return false;
  }
}
async function trashDocument(id,title,button,row){
  const message=`Tem certeza que deseja excluir "${title}"?\n\nO documento será movido para a lixeira e poderá ser restaurado por até 24 horas.`;
  if(!window.confirm(message))return;
  button.disabled=true;
  const old=button.textContent;
  button.textContent='Excluindo…';
  try{
    if(!(await ready()))throw new Error('Sessão inválida ou perfil inativo.');
    const now=new Date().toISOString();
    const {error}=await c().from('methodology_form_submissions').update({deleted_at:now,deleted_by:me.id,updated_at:now}).eq('id',id);
    if(error)throw error;
    row?.remove();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }catch(e){
    alert(errorText(e,'Não foi possível excluir o documento.'));
    button.disabled=false;
    button.textContent=old;
  }
}
function enhanceRows(){
  if(!isRoute())return;
  document.querySelectorAll('.dd-row').forEach(row=>{
    if(row.querySelector('[data-dd-delete]'))return;
    const exportButton=row.querySelector('[data-dd-export]');
    const raw=exportButton?.dataset?.ddExport||'';
    const id=raw.split(':')[0];
    if(!id)return;
    const title=String(row.querySelector('h4')?.textContent||'Documento').trim();
    const actions=row.querySelector('.dd-actions');
    if(!actions)return;
    const b=document.createElement('button');
    b.type='button';
    b.className='btn secondary dd-delete-btn';
    b.dataset.ddDelete=id;
    b.textContent='Excluir';
    b.setAttribute('aria-label',`Excluir ${title}`);
    b.onclick=()=>trashDocument(id,title,b,row);
    actions.appendChild(b);
  });
}
function expiryText(value){
  if(!value)return '—';
  const expires=new Date(new Date(value).getTime()+24*60*60*1000);
  return new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(expires);
}
async function restoreDocument(id,title,button,item){
  button.disabled=true;
  const old=button.textContent;
  button.textContent='Restaurando…';
  try{
    const {data,error}=await c().rpc('restore_methodology_document',{p_id:id});
    if(error)throw error;
    if(data!==true)throw new Error('O documento não pôde ser restaurado.');
    item?.remove();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    const list=document.querySelector('#dd-trash-list');
    if(list&&!list.querySelector('.dd-trash-item'))list.innerHTML='<div class="empty">Nenhum documento disponível para restauração.</div>';
  }catch(e){
    alert(errorText(e,'Não foi possível restaurar o documento.'));
    button.disabled=false;
    button.textContent=old;
  }
}
async function openTrash(){
  document.querySelector('#dd-trash-modal')?.remove();
  const bg=document.createElement('div');
  bg.id='dd-trash-modal';
  bg.className='dd-trash-backdrop';
  bg.innerHTML=`<div class="dd-trash-modal"><header><div><h3 style="margin:0">Lixeira de documentos</h3><div class="dd-trash-meta">Documentos excluídos podem ser restaurados por até 24 horas.</div></div><button type="button" class="btn ghost" data-trash-close>✕</button></header><div class="body" id="dd-trash-list"><div class="empty">Carregando…</div></div></div>`;
  document.body.appendChild(bg);
  bg.querySelector('[data-trash-close]').onclick=()=>bg.remove();
  bg.addEventListener('click',e=>{if(e.target===bg)bg.remove()});
  try{
    if(!(await ready()))throw new Error('Sessão inválida ou perfil inativo.');
    const {data,error}=await c().rpc('list_deleted_methodology_documents');
    if(error)throw error;
    const rows=data||[];
    const list=bg.querySelector('#dd-trash-list');
    if(!rows.length){list.innerHTML='<div class="empty">Nenhum documento disponível para restauração.</div>';return;}
    list.innerHTML=rows.map(r=>{
      const title=titleFromSlug(r.form_slug);
      return `<div class="dd-trash-item" data-trash-id="${esc(r.id)}"><h4>${esc(title)}</h4><div class="dd-trash-meta">${r.youth_name?esc(r.youth_name)+' · ':''}restaurável até ${esc(expiryText(r.deleted_at))}</div><div class="dd-trash-actions"><button type="button" class="btn primary" data-trash-restore="${esc(r.id)}">Restaurar</button></div></div>`;
    }).join('');
    list.querySelectorAll('[data-trash-restore]').forEach(b=>{
      const item=b.closest('.dd-trash-item');
      const r=rows.find(x=>x.id===b.dataset.trashRestore);
      b.onclick=()=>restoreDocument(r.id,titleFromSlug(r.form_slug),b,item);
    });
  }catch(e){
    const list=bg.querySelector('#dd-trash-list');
    if(list)list.innerHTML=`<div class="notice danger">${esc(errorText(e,'Falha ao carregar a lixeira.'))}</div>`;
  }
}
function enhanceTrashButton(){
  if(!isRoute())return;
  const filter=document.querySelector('.dd-filter');
  if(!filter||filter.querySelector('[data-dd-trash-open]'))return;
  const b=document.createElement('button');
  b.type='button';
  b.className='dd-trash-btn';
  b.dataset.ddTrashOpen='1';
  b.textContent='Lixeira (24h)';
  b.onclick=openTrash;
  filter.appendChild(b);
}
function enhance(){
  if(!isRoute())return;
  addCss();
  enhanceRows();
  enhanceTrashButton();
}
function schedule(){clearTimeout(timer);timer=setTimeout(enhance,80)}
async function boot(){
  await ready();
  window.addEventListener('hashchange',schedule);
  new MutationObserver(()=>{if(isRoute())schedule()}).observe(document.body,{subtree:true,childList:true});
  schedule();
}
boot();
