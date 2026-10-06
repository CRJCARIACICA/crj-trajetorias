import { apiMode, supabaseClient } from './api.js?v=20261004-2';

const MANAGER_ROLES=new Set(['coordenacao_geral','coordenacao_articulacao','educador','administrativo']);
let me=null,observer=null,scheduled=false;
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const onWorkshops=()=>location.hash.split('?')[0]==='#oficinas';
const c=()=>{if(apiMode()!=='live')throw new Error('Banco ainda não conectado.');return supabaseClient()};

function toast(message,type='success'){
  const e=document.createElement('div');e.className=`pill ${type}`;e.textContent=message;
  Object.assign(e.style,{position:'fixed',right:'20px',bottom:'20px',zIndex:'2147483600',padding:'12px 16px',boxShadow:'0 10px 35px rgba(0,0,0,.2)'});
  document.body.appendChild(e);setTimeout(()=>e.remove(),3500);
}
function injectStyle(){
  if(document.querySelector('#instructor-management-style'))return;
  const s=document.createElement('style');s.id='instructor-management-style';s.textContent=`
  .im-card{margin:0 0 16px;padding:14px;border:1px solid var(--line,#dfe7e5);border-radius:15px;background:#fff}.im-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}.im-head h3{margin:0}.im-muted{color:#66756f;font-size:13px}.im-overlay{position:fixed;inset:0;background:rgba(8,20,18,.68);z-index:2147483500;display:grid;place-items:center;padding:14px}.im-modal{width:min(1050px,98vw);max-height:94vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 30px 90px rgba(0,0,0,.3)}.im-modal-head{position:sticky;top:0;background:#fff;border-bottom:1px solid #e6ece9;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;z-index:2}.im-modal-body{padding:18px}.im-close{border:0;background:transparent;font-size:26px;cursor:pointer}.im-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.im-person{border:1px solid #e1e9e6;border-radius:13px;padding:13px}.im-person.inactive{opacity:.72;background:#fafafa}.im-person-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.im-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.im-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.im-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.im-warning{padding:11px;border-radius:10px;background:#fff7e5;border:1px solid #edd89b;margin-bottom:12px}.im-empty{padding:20px;text-align:center;color:#66756f}@media(max-width:700px){.im-grid,.im-form-grid{grid-template-columns:1fr}}
  `;document.head.appendChild(s);
}
async function profile(){
  if(apiMode()!=='live')return null;
  const cl=c(),{data:{user}}=await cl.auth.getUser();if(!user)return null;
  const {data,error}=await cl.from('profiles').select('id,display_name,role,team,active').eq('id',user.id).maybeSingle();
  if(error)throw error;return data;
}
function canManage(){return !!me?.active&&MANAGER_ROLES.has(me.role)}
function modal(title,body){
  document.querySelector('#instructor-management-modal')?.remove();
  const bg=document.createElement('div');bg.id='instructor-management-modal';bg.className='im-overlay';bg.innerHTML=`<section class="im-modal"><div class="im-modal-head"><b>${esc(title)}</b><button class="im-close" type="button" data-im-close>×</button></div><div class="im-modal-body">${body}</div></section>`;
  document.body.appendChild(bg);bg.querySelector('[data-im-close]')?.addEventListener('click',()=>bg.remove());bg.addEventListener('click',e=>{if(e.target===bg)bg.remove()});return bg;
}
async function loadInstructors(){
  const cl=c();
  const [pq,iq,wq]=await Promise.all([
    cl.from('profiles').select('id,display_name,role,team,active,updated_at').eq('role','oficineiro').order('display_name'),
    cl.from('workshop_instructor_profiles').select('*').order('updated_at',{ascending:false}),
    cl.from('workshops').select('id,name,active,oficineiro_user_id').not('oficineiro_user_id','is',null)
  ]);
  if(pq.error)throw pq.error;if(iq.error)throw iq.error;if(wq.error)throw wq.error;
  const im=new Map((iq.data||[]).map(x=>[x.user_id,x]));
  return (pq.data||[]).map(p=>{
    const x=im.get(p.id)||{},linked=(wq.data||[]).filter(w=>w.oficineiro_user_id===p.id);
    return {...p,...x,id:p.id,display_name:p.display_name,active:p.active,linked_workshops:linked,active_workshops:linked.filter(w=>w.active)};
  });
}
function personCard(p){
  const linked=p.linked_workshops||[],active=p.active_workshops||[];
  return `<div class="im-person ${p.active?'':'inactive'}"><div class="im-person-top"><div><b>${esc(p.display_name||'Oficineiro')}</b><div class="im-muted">${esc(p.specialty||'Especialidade não informada')}</div></div><span class="pill ${p.active?'success':'warn'}">${p.active?'Ativo':'Arquivado'}</span></div><div class="im-badges"><span class="pill">${linked.length} oficina(s) no histórico</span>${active.length?`<span class="pill info">${active.length} ativa(s)</span>`:''}${p.contracted_weekly_hours!=null?`<span class="pill">${esc(p.contracted_weekly_hours)}h/sem</span>`:''}</div><div class="im-muted" style="margin-top:8px">${esc(p.email||'Sem e-mail de referência')} · ${esc(p.phone||'Sem telefone')}</div><div class="im-actions"><button class="btn" type="button" data-im-edit="${p.id}">Editar</button>${p.active?`<button class="btn danger" type="button" data-im-archive="${p.id}">Excluir cadastro</button>`:`<button class="btn primary" type="button" data-im-restore="${p.id}">Reativar</button>`}</div></div>`;
}
async function openManager(){
  try{
    const rows=await loadInstructors();
    const bg=modal('Gerenciar oficineiros',`<div class="im-warning"><b>Exclusão segura:</b> excluir um oficineiro arquiva o cadastro e impede novos vínculos, mas preserva oficinas, listas, relatórios e histórico já existentes.</div><div class="im-grid">${rows.map(personCard).join('')||'<div class="im-empty">Nenhum oficineiro cadastrado.</div>'}</div>`);
    bg.querySelectorAll('[data-im-edit]').forEach(b=>b.addEventListener('click',()=>openEdit(rows.find(x=>x.id===b.dataset.imEdit))));
    bg.querySelectorAll('[data-im-archive]').forEach(b=>b.addEventListener('click',()=>archiveInstructor(rows.find(x=>x.id===b.dataset.imArchive))));
    bg.querySelectorAll('[data-im-restore]').forEach(b=>b.addEventListener('click',()=>restoreInstructor(rows.find(x=>x.id===b.dataset.imRestore))));
  }catch(err){toast(err.message||String(err),'danger')}
}
function openEdit(p){
  if(!p)return;
  const bg=modal('Editar cadastro do oficineiro',`<form id="im-edit-form" class="stack"><div class="im-form-grid"><div class="field"><label>Nome completo</label><input class="input" name="display_name" value="${esc(p.display_name||'')}" required></div><div class="field"><label>E-mail de referência</label><input class="input" type="email" name="email" value="${esc(p.email||'')}"><small>Este campo é de referência; não altera o e-mail usado para login.</small></div></div><div class="im-form-grid"><div class="field"><label>CPF</label><input class="input" name="cpf" value="${esc(p.cpf||'')}"></div><div class="field"><label>Telefone</label><input class="input" name="phone" value="${esc(p.phone||'')}"></div></div><div class="im-form-grid"><div class="field"><label>Área / especialidade</label><input class="input" name="specialty" value="${esc(p.specialty||'')}"></div><div class="field"><label>Carga horária semanal de referência</label><input class="input" type="number" min="0" step="0.5" name="contracted_weekly_hours" value="${esc(p.contracted_weekly_hours??'')}"></div></div><div class="field"><label>Informações relevantes</label><textarea name="notes">${esc(p.notes||'')}</textarea></div><div class="im-actions"><button class="btn primary" type="submit">Salvar alterações</button><button class="btn" type="button" data-im-cancel>Cancelar</button></div></form>`);
  bg.querySelector('[data-im-cancel]')?.addEventListener('click',()=>bg.remove());
  bg.querySelector('#im-edit-form')?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget),payload={display_name:fd.get('display_name'),email:fd.get('email'),cpf:fd.get('cpf'),phone:fd.get('phone'),specialty:fd.get('specialty'),contracted_weekly_hours:fd.get('contracted_weekly_hours'),notes:fd.get('notes')};const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;btn.textContent='Salvando...';try{const {error}=await c().rpc('workshop_update_instructor_profile',{p_user_id:p.id,p_payload:payload});if(error)throw error;bg.remove();toast('Cadastro do oficineiro atualizado');await openManager();schedule()}catch(err){toast(err.message||String(err),'danger');btn.disabled=false;btn.textContent='Salvar alterações'}});
}
async function archiveInstructor(p){
  if(!p)return;const active=(p.active_workshops||[]).map(x=>x.name);
  const msg=active.length?`Este oficineiro ainda está ligado a ${active.length} oficina(s) ativa(s): ${active.join(', ')}. O histórico será preservado e ele deixará de aparecer para novos vínculos. Deseja continuar?`:'O cadastro será arquivado. O histórico de oficinas, presenças e documentos será preservado. Deseja continuar?';
  if(!confirm(msg))return;
  try{const {data,error}=await c().rpc('workshop_set_instructor_active',{p_user_id:p.id,p_active:false});if(error)throw error;document.querySelector('#instructor-management-modal')?.remove();toast(`Oficineiro arquivado. ${Number(data?.linked_workshops||0)} oficina(s) histórica(s) preservada(s).`);await openManager();schedule()}catch(err){toast(err.message||String(err),'danger')}
}
async function restoreInstructor(p){
  if(!p)return;try{const {error}=await c().rpc('workshop_set_instructor_active',{p_user_id:p.id,p_active:true});if(error)throw error;document.querySelector('#instructor-management-modal')?.remove();toast('Cadastro do oficineiro reativado');await openManager();schedule()}catch(err){toast(err.message||String(err),'danger')}
}
function inject(){
  if(!onWorkshops()||!canManage())return;
  const host=document.querySelector('.content');if(!host||document.querySelector('[data-instructor-management-card]'))return;
  const page=host.querySelector('.page-head');if(!page)return;
  const card=document.createElement('div');card.className='im-card';card.dataset.instructorManagementCard='1';card.innerHTML=`<div class="im-head"><div><h3>Oficineiros</h3><div class="im-muted">Edite, arquive ou reative cadastros de oficineiros sem apagar o histórico das oficinas e presenças.</div></div><button class="btn" type="button" data-im-open>Gerenciar oficineiros</button></div>`;
  page.insertAdjacentElement('afterend',card);card.querySelector('[data-im-open]')?.addEventListener('click',openManager);
}
function schedule(){
  if(scheduled)return;scheduled=true;setTimeout(async()=>{scheduled=false;try{if(!me)me=await profile();inject()}catch(err){console.warn('Gestão de oficineiros',err)}},100);
}
function boot(){injectStyle();observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});window.addEventListener('hashchange',schedule);window.addEventListener('focus',schedule);schedule()}
boot();
