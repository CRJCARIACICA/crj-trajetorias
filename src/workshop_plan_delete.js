import { apiMode, supabaseClient } from './api.js?v=20261004-2';

let profile=null,observer=null,bound=false;
const PREVIEW_KEY='crj_developer_preview';
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const client=()=>{if(apiMode()!=='live')throw new Error('Banco ainda não conectado.');return supabaseClient()};
const fmtMonth=v=>{const s=String(v||'').slice(0,7);if(!/^\d{4}-\d{2}$/.test(s))return s||'—';const [y,m]=s.split('-');return `${m}/${y}`};
const fmtDateTime=v=>{if(!v)return '—';return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(v))};
function inDeveloperPreview(){try{return Boolean(JSON.parse(sessionStorage.getItem(PREVIEW_KEY)||'null')?.enabled)}catch{return false}}
function canManage(){return !inDeveloperPreview()&&profile?.active!==false&&['educador','coordenacao_geral'].includes(profile?.role||'')}

function style(){
  if(document.querySelector('#wpd-style'))return;
  const s=document.createElement('style');s.id='wpd-style';s.textContent=`
    .wpd-danger{background:#9b2f28!important;color:#fff!important;border-color:#9b2f28!important}.wpd-danger:hover{filter:brightness(.94)}
    .wpd-backdrop{position:fixed;inset:0;z-index:2147483600;background:rgba(4,18,15,.62);display:grid;place-items:center;padding:18px}.wpd-modal{width:min(760px,96vw);max-height:90vh;overflow:auto;background:#fff;border-radius:17px;box-shadow:0 24px 70px rgba(0,0,0,.28)}
    .wpd-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid #e3ebe7}.wpd-head h3{margin:0 0 4px}.wpd-body{padding:16px 18px}.wpd-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid #edf1ef}.wpd-row:last-child{border-bottom:0}.wpd-row small{display:block;color:#687670;margin-top:4px}.wpd-close{border:0;background:transparent;font-size:24px;cursor:pointer}.wpd-empty{padding:18px;text-align:center;color:#687670}
    .wpd-editor-delete{display:flex;justify-content:flex-end;margin:0 0 10px}.wpd-toast{position:fixed;right:20px;bottom:20px;z-index:2147483642;background:#174f43;color:#fff;border-radius:10px;padding:11px 15px;box-shadow:0 12px 36px rgba(0,0,0,.2)}.wpd-toast.danger{background:#8a2c25}
    @media(max-width:620px){.wpd-row{grid-template-columns:1fr}.wpd-row .actions{justify-content:flex-start}}
  `;document.head.appendChild(s);
}
function toast(msg,type='success'){document.querySelector('.wpd-toast')?.remove();const d=document.createElement('div');d.className='wpd-toast'+(type==='danger'?' danger':'');d.textContent=msg;document.body.appendChild(d);setTimeout(()=>d.remove(),3600)}
async function resolveProfile(){
  if(apiMode()!=='live')return null;
  const c=client(),{data:{user}}=await c.auth.getUser();if(!user)return null;
  const {data,error}=await c.from('profiles').select('id,display_name,role,active').eq('id',user.id).maybeSingle();if(error)throw error;return data;
}
function currentMonth(){const p=new URLSearchParams((location.hash.split('?')[1]||''));return p.get('month')||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7)}
function listRoute(){return `#educador?view=planejamento&month=${currentMonth()}`}

async function removePlan(planId,context={}){
  if(!canManage())return;
  const name=context.name||'esta oficina',month=context.month||currentMonth(),status=context.status||'';
  const extra=status==='finalizado'?'\n\nATENÇÃO: este planejamento está finalizado. A execução já registrada será preservada.':'';
  const ok=confirm(`Excluir o planejamento de "${name}" (${fmtMonth(month)})?\n\nO planejamento e seus blocos sairão da área ativa. Aulas já executadas, presenças e demais registros de execução serão preservados.\n\nVocê poderá restaurar o planejamento pela Lixeira durante 24 horas.${extra}`);
  if(!ok)return;
  try{
    const {data,error}=await client().rpc('workshop_delete_monthly_plan',{p_plan_id:planId});if(error)throw error;
    toast('Planejamento excluído. Restauração disponível por 24 horas.');
    if(document.querySelector('#workshop-plan-form')?.dataset.planId===planId){location.hash=listRoute();return}
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    setTimeout(enhance,120);
  }catch(err){toast(err.message||String(err),'danger')}
}

function cardContext(card){
  const title=card.querySelector('h3')?.textContent?.trim()||'Oficina';
  const text=card.querySelector('p')?.textContent||'';
  const month=(text.match(/\b(0[1-9]|1[0-2])\/(\d{4})\b/)||[]);
  const status=[...card.querySelectorAll('.pill')].map(x=>x.textContent.trim().toLowerCase()).find(x=>['rascunho','finalizado','arquivado'].includes(x))||'';
  return {name:title,month:month.length?`${month[2]}-${month[1]}`:currentMonth(),status};
}
function enhanceCards(){
  if(!canManage())return;
  document.querySelectorAll('.educator-workshop-plan-card').forEach(card=>{
    const open=card.querySelector('[data-edu-workshop-plan-open]');if(!open)return;
    const planId=open.dataset.eduWorkshopPlanOpen;if(!planId)return;
    const actions=open.closest('.actions');if(!actions||actions.querySelector(`[data-workshop-plan-delete="${CSS.escape(planId)}"]`))return;
    const b=document.createElement('button');b.type='button';b.className='btn wpd-danger';b.dataset.workshopPlanDelete=planId;b.textContent='Excluir planejamento';b.addEventListener('click',()=>removePlan(planId,cardContext(card)));actions.appendChild(b);
  });
}
function enhanceOpenEditor(){
  if(!canManage())return;
  const form=document.querySelector('#workshop-plan-form');if(!form||!form.dataset.planId||form.querySelector('[data-workshop-plan-delete-editor]'))return;
  const wrap=document.createElement('div');wrap.className='wpd-editor-delete';wrap.innerHTML='<button class="btn wpd-danger" type="button" data-workshop-plan-delete-editor>Excluir planejamento</button>';
  form.prepend(wrap);wrap.querySelector('button').addEventListener('click',()=>removePlan(form.dataset.planId,{name:document.querySelector('.page-head h2,.page-head h3')?.textContent?.replace(/^Planejamento\s*[·:-]?\s*/i,'')||'Oficina',month:currentMonth()}));
}

async function trashRows(){const {data,error}=await client().rpc('workshop_list_deleted_monthly_plans');if(error)throw error;return Array.isArray(data)?data:[]}
async function openTrash(){
  if(!canManage())return;
  document.querySelector('#wpd-backdrop')?.remove();
  let rows=[];try{rows=await trashRows()}catch(err){toast(err.message||String(err),'danger');return}
  const bg=document.createElement('div');bg.id='wpd-backdrop';bg.className='wpd-backdrop';
  bg.innerHTML=`<div class="wpd-modal" role="dialog" aria-modal="true" aria-label="Lixeira de planejamentos"><div class="wpd-head"><div><h3>Lixeira de planejamentos</h3><div class="muted">Planejamentos excluídos podem ser restaurados por até 24 horas.</div></div><button class="wpd-close" type="button" data-wpd-close>×</button></div><div class="wpd-body">${rows.length?rows.map(r=>`<div class="wpd-row"><div><b>${esc(r.workshop_name||'Oficina')} · ${esc(fmtMonth(r.plan_month))}</b><small>Status anterior: ${esc(r.plan_status||'—')} · Excluído em ${esc(fmtDateTime(r.deleted_at))}<br>Disponível até ${esc(fmtDateTime(r.expires_at))}</small></div><div class="actions"><button class="btn primary" type="button" data-wpd-restore="${esc(r.id)}">Restaurar</button></div></div>`).join(''):'<div class="wpd-empty">Nenhum planejamento disponível para restauração.</div>'}</div></div>`;
  document.body.appendChild(bg);
  const close=()=>bg.remove();bg.querySelector('[data-wpd-close]')?.addEventListener('click',close);bg.addEventListener('click',e=>{if(e.target===bg)close()});
  bg.querySelectorAll('[data-wpd-restore]').forEach(btn=>btn.addEventListener('click',async()=>{
    const label=btn.textContent;btn.disabled=true;btn.textContent='Restaurando...';
    try{const {data,error}=await client().rpc('workshop_restore_monthly_plan',{p_trash_id:btn.dataset.wpdRestore});if(error)throw error;toast(`Planejamento de ${data?.workshop_name||'oficina'} restaurado.`);close();window.dispatchEvent(new HashChangeEvent('hashchange'));setTimeout(enhance,120)}catch(err){toast(err.message||String(err),'danger');btn.disabled=false;btn.textContent=label}
  }));
}
function enhanceTrashButton(){
  if(!canManage()||!location.hash.startsWith('#educador'))return;
  const params=new URLSearchParams((location.hash.split('?')[1]||''));if((params.get('view')||'responsabilidades')!=='planejamento')return;
  const heads=[...document.querySelectorAll('.educator-subhead')];const head=heads.find(h=>String(h.querySelector('h3')?.textContent||'').trim().toLowerCase()==='planejamento');if(!head)return;
  const actions=head.querySelector('.actions');if(!actions||actions.querySelector('[data-workshop-plan-trash]'))return;
  const b=document.createElement('button');b.type='button';b.className='btn';b.dataset.workshopPlanTrash='1';b.textContent='Lixeira de planejamentos';b.addEventListener('click',openTrash);actions.appendChild(b);
}
function enhance(){style();enhanceCards();enhanceOpenEditor();enhanceTrashButton()}
async function boot(){
  style();
  try{profile=await resolveProfile()}catch(err){console.warn('Não foi possível habilitar exclusão de planejamentos:',err);return}
  if(!profile)return;
  observer=new MutationObserver(()=>enhance());observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>setTimeout(enhance,60));
  enhance();bound=true;
}
boot();
