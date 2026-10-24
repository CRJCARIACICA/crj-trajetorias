import { apiMode, supabaseClient } from './api.js?v=20261004-2';
import { captureRoute } from './route_lifecycle.js?v=20261020-navigation1';

const TZ='America/Sao_Paulo';
const SHOWCASE_ROUTE='mostra-profissoes';
const INSTALL_FLAG=Symbol.for('crj.meta43Ui');
const SHOWCASE_NAV_SELECTOR='[data-meta43-showcase-nav],a[href="#mostra-profissoes"]';
const showcaseNavStates=new WeakMap();
const SUPPORTED_ART_SOURCES=new Set(['calendar_events','educator_plans','articulation_actions','joint_actions','cfdh_actions']);
let me=null,observer=null,scheduled=false,workshopEditId=null,lastCalendarRef=null;
let showcaseView=null;
const bound=new WeakSet();

const c=()=>apiMode()==='live'?supabaseClient():null;
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const monthKey=()=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit'}).format(new Date());
const route=()=>String(location.hash||'').split('?')[0].replace(/^#/,'').split('/')[0]||'dashboard';
const planId=()=>location.hash.startsWith('#cfdh')?(new URLSearchParams((location.hash.split('?')[1]||'')).get('plan')||''):'';

function toast(message,type='success'){
  const el=document.createElement('div');el.className=`pill ${type}`;el.textContent=message;
  Object.assign(el.style,{position:'fixed',right:'20px',bottom:'20px',zIndex:'2147483640',padding:'12px 16px',boxShadow:'0 10px 35px rgba(0,0,0,.2)'});
  document.body.appendChild(el);setTimeout(()=>el.remove(),3200);
}
async function profile(){
  if(me)return me;if(!c())return null;
  const {data:{user}}=await c().auth.getUser();if(!user)return null;
  const q=await c().from('profiles').select('id,display_name,role,active').eq('id',user.id).maybeSingle();
  if(q.error)throw q.error;me=q.data||null;return me;
}
async function setMethodologyLink(sourceType,sourceId,indicatorCode,enabled,rationale){
  if(!c()||!sourceType||!sourceId)return;
  const row={source_type:sourceType,source_id:sourceId,goal_stage:'4.3',indicator_code:indicatorCode,relation_mode:'count',counts_toward_indicator:Boolean(enabled),quantity:1,rationale,updated_at:new Date().toISOString()};
  const q=await c().from('record_methodology_links').upsert(row,{onConflict:'source_type,source_id,goal_stage,indicator_code,relation_mode'}).select('id').maybeSingle();
  if(q.error)throw q.error;
}
async function linkState(sourceType,sourceId,indicatorCodes){
  if(!c()||!sourceId)return new Map();
  const q=await c().from('record_methodology_links').select('indicator_code,counts_toward_indicator').eq('source_type',sourceType).eq('source_id',sourceId).in('indicator_code',indicatorCodes);
  if(q.error)throw q.error;return new Map((q.data||[]).map(x=>[x.indicator_code,Boolean(x.counts_toward_indicator)]));
}

function injectStyle(){
  if(document.querySelector('#meta43-ui-style'))return;
  const s=document.createElement('style');s.id='meta43-ui-style';s.textContent=`
  .m43-box{border:1px solid #cfe2dc;background:#f6fbf9;border-radius:12px;padding:12px;margin:12px 0}.m43-box h4,.m43-box h5{margin:0 0 5px}.m43-box p{margin:4px 0;color:#60716b;font-size:12px;line-height:1.45}.m43-check{display:flex;gap:8px;align-items:flex-start;padding:7px 0}.m43-check input{margin-top:3px}.m43-check b{display:block}.m43-check small{display:block;color:#687771;margin-top:2px}.m43-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.m43-field label{font-size:11px;font-weight:800;display:block;margin-bottom:4px}.m43-field input,.m43-field select,.m43-field textarea{width:100%}.m43-status{font-size:11px;margin-top:6px;color:#315f54}.m43-showcase{display:grid;gap:14px}.m43-hero{border:1px solid #cfe2dc;background:linear-gradient(135deg,#f3faf7,#fff);border-radius:16px;padding:17px}.m43-card{background:#fff;border:1px solid #dfe8e5;border-radius:15px;padding:15px}.m43-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.m43-kpi{border:1px solid #e1e9e6;border-radius:12px;padding:12px}.m43-kpi b{display:block;font-size:20px}.m43-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}@media(max-width:720px){.m43-grid,.m43-kpis{grid-template-columns:1fr}}
  `;document.head.appendChild(s);
}

function currentWorkshopForm(){return document.querySelector('#workshop-form')}
async function loadWorkshopFlags(id,form){
  if(!id||!c()||!form?.isConnected)return;
  const q=await c().from('workshops').select('id,is_professionalizing,is_art_cultural,is_labpoca,labpoca_area,category,location_type').eq('id',id).maybeSingle();
  if(q.error||!q.data||!form.isConnected)return;
  const art=form.querySelector('[name="meta43_art_cultural"]'),lab=form.querySelector('[name="meta43_labpoca"]'),area=form.querySelector('[name="meta43_labpoca_area"]');
  if(art)art.checked=Boolean(q.data.is_art_cultural)||['arte','cultura'].includes(String(q.data.category||'').toLowerCase());
  if(lab)lab.checked=Boolean(q.data.is_labpoca)||String(q.data.location_type||'').toLowerCase()==='labpoca';
  if(area&&q.data.labpoca_area)area.value=q.data.labpoca_area;
  syncWorkshopMeta(form);
}
function syncWorkshopMeta(form){
  const category=form.querySelector('[name="category"]'),location=form.querySelector('[name="location_type"]'),art=form.querySelector('[name="meta43_art_cultural"]'),lab=form.querySelector('[name="meta43_labpoca"]'),areaWrap=form.querySelector('[data-meta43-lab-area]'),area=form.querySelector('[name="meta43_labpoca_area"]'),note=form.querySelector('[data-meta43-auto-note]');
  const cat=String(category?.value||''),loc=String(location?.value||'');
  if(['Arte','Cultura'].includes(cat)&&art)art.checked=true;
  if(loc==='LABPoca'&&lab)lab.checked=true;
  if(areaWrap)areaWrap.hidden=!lab?.checked;
  if(area)area.required=Boolean(lab?.checked);
  if(note){
    const tags=[];if(cat==='Profissionalizante')tags.push('Profissionalizante → Tô no Topo');if(lab?.checked)tags.push('LABPoca → Tô no Topo + LABPoca');if(art?.checked)tags.push('Artístico-cultural → indicador próprio da 4.3');
    note.textContent=tags.length?tags.join(' · '):'A oficina continua no Cola Aê. Marque/classifique apenas os vínculos adicionais aplicáveis.';
  }
}
function bindWorkshopForm(form){
  if(!form||bound.has(form))return;bound.add(form);
  const submit=form.querySelector('button[type="submit"]');if(!submit)return;
  const box=document.createElement('div');box.className='m43-box';box.innerHTML=`<h4>Classificações adicionais · Meta 4.3</h4><p>Uma única oficina pode continuar no Cola Aê e, ao mesmo tempo, alimentar o Núcleo de Economia Criativa. Categoria <b>Profissionalizante</b> ou vínculo ao <b>LABPoca</b> classifica automaticamente a oficina também como <b>Tô no Topo</b>.</p><label class="m43-check"><input type="checkbox" name="meta43_art_cultural"><span><b>Oficina de arte ou cultura / finalidade artístico-cultural</b><small>Cria vínculo com o indicador “Atividades e eventos artístico-culturais”.</small></span></label><label class="m43-check"><input type="checkbox" name="meta43_labpoca"><span><b>Oficina vinculada ao LABPoca</b><small>Além de Tô no Topo, a execução de ao menos uma oficina vinculada comprova o funcionamento mensal do LABPoca.</small></span></label><div class="m43-field" data-meta43-lab-area hidden><label>Área do LABPoca</label><select name="meta43_labpoca_area"><option value="">Selecione</option><option value="estetica">Estética (LABPOCA)</option><option value="audiovisual">Audiovisual (LABSTUDIO)</option></select></div><div class="m43-status" data-meta43-auto-note></div>`;
  submit.insertAdjacentElement('beforebegin',box);
  for(const el of [form.querySelector('[name="category"]'),form.querySelector('[name="location_type"]'),box.querySelector('[name="meta43_art_cultural"]'),box.querySelector('[name="meta43_labpoca"]')])el?.addEventListener('change',()=>syncWorkshopMeta(form));
  syncWorkshopMeta(form);loadWorkshopFlags(workshopEditId,form).catch(()=>{});
}
async function finalizeWorkshopMeta(pending){
  if(!c()||!pending)return;
  let row=null;
  if(pending.id){
    const q=await c().from('workshops').select('id,name,created_at,updated_at').eq('id',pending.id).maybeSingle();if(q.error)throw q.error;row=q.data;
    if(row&&row.updated_at&&new Date(row.updated_at).getTime()<pending.submittedAt-2500)return;
  }else{
    const q=await c().from('workshops').select('id,name,created_at,updated_at').eq('name',pending.name).order('created_at',{ascending:false}).limit(1);if(q.error)throw q.error;row=q.data?.[0]||null;
    if(!row||new Date(row.created_at||0).getTime()<pending.submittedAt-5000)return;
  }
  if(!row)return;
  const patch={is_professionalizing:pending.category==='Profissionalizante',is_art_cultural:pending.art,is_labpoca:pending.lab,labpoca_area:pending.lab?pending.area:null,updated_at:new Date().toISOString()};
  const q=await c().from('workshops').update(patch).eq('id',row.id);if(q.error)throw q.error;
}
function captureWorkshopSubmit(event){
  const form=event.target;if(!(form instanceof HTMLFormElement)||form.id!=='workshop-form')return;
  const lab=form.querySelector('[name="meta43_labpoca"]')?.checked||form.querySelector('[name="location_type"]')?.value==='LABPoca';
  const area=form.querySelector('[name="meta43_labpoca_area"]')?.value||'';
  if(lab&&!area){event.preventDefault();event.stopImmediatePropagation();toast('Selecione a área do LABPoca antes de salvar.','danger');form.querySelector('[name="meta43_labpoca_area"]')?.focus();return}
  const pending={id:workshopEditId,name:form.querySelector('[name="name"]')?.value?.trim()||'',category:form.querySelector('[name="category"]')?.value||'',art:Boolean(form.querySelector('[name="meta43_art_cultural"]')?.checked),lab,area,submittedAt:Date.now()};
  const mo=new MutationObserver(()=>{if(!form.isConnected){mo.disconnect();finalizeWorkshopMeta(pending).catch(err=>console.warn('Meta 4.3 · oficina:',err))}});mo.observe(document.body,{subtree:true,childList:true});setTimeout(()=>mo.disconnect(),18000);
}

function bindBookingForm(form){
  if(!form||bound.has(form))return;bound.add(form);
  const actions=form.querySelector('.ac-modal-actions');if(!actions)return;
  const box=document.createElement('div');box.className='m43-box';box.innerHTML=`<label class="m43-check"><input type="checkbox" name="meta43_booking_art"><span><b>Finalidade artístico-cultural</b><small>O empréstimo/agendamento já alimenta a 4.3 pela própria origem. Esta marcação também o inclui no indicador específico de atividades artístico-culturais.</small></span></label>`;actions.insertAdjacentElement('beforebegin',box);
}
function captureBookingSubmit(event){
  const form=event.target;if(!(form instanceof HTMLFormElement)||form.id!=='ac-booking-form')return;
  const art=Boolean(form.querySelector('[name="meta43_booking_art"]')?.checked);if(!art)return;
  const mo=new MutationObserver(async()=>{
    const text=form.textContent||'',match=text.match(/Solicita(?:ção|cao)\s+([A-Z0-9-]+)/i);if(!match)return;
    mo.disconnect();try{const q=await c().from('access_resource_bookings').update({is_art_cultural:true,updated_at:new Date().toISOString()}).eq('request_number',match[1]);if(q.error)throw q.error;toast('Finalidade artístico-cultural vinculada à Meta 4.3.')}catch(err){console.warn('Meta 4.3 · reserva:',err)}
  });mo.observe(form,{subtree:true,childList:true,characterData:true});setTimeout(()=>mo.disconnect(),18000);
}

async function bindCfdhLinks(){
  const pid=planId();if(!pid||!c())return;
  const q=await c().from('cfdh_actions').select('id,action_number').eq('plan_id',pid).order('action_number');if(q.error)return;
  const rows=q.data||[];if(!rows.length)return;
  const ids=rows.map(x=>x.id);const lq=await c().from('record_methodology_links').select('source_id,indicator_code,counts_toward_indicator').eq('source_type','cfdh_actions').in('source_id',ids).in('indicator_code',['M4.3_CIRCUITOS','M4.3_ARTISTICO_CULTURAL']);
  const states=new Map();for(const x of lq.data||[])states.set(`${x.source_id}:${x.indicator_code}`,Boolean(x.counts_toward_indicator));
  for(const row of rows){
    const card=[...document.querySelectorAll('[data-action-number]')].find(x=>Number(x.dataset.actionNumber||0)===Number(row.action_number));if(!card||card.querySelector('[data-meta43-cfdh]'))continue;
    const box=document.createElement('div');box.className='m43-box';box.dataset.meta43Cfdh='1';box.innerHTML=`<h5>Vínculos adicionais · Etapa 4.3</h5><label class="m43-check"><input type="checkbox" data-m43-circuit ${states.get(`${row.id}:M4.3_CIRCUITOS`)?'checked':''}><span><b>Este circuito formativo também contabiliza na Meta 4 · Etapa 4.3</b><small>Conta como atividade somente após a execução/evidência.</small></span></label><label class="m43-check"><input type="checkbox" data-m43-art ${states.get(`${row.id}:M4.3_ARTISTICO_CULTURAL`)?'checked':''}><span><b>Finalidade artístico-cultural</b><small>Alimenta o mesmo indicador de atividades/eventos artístico-culturais usado por oficinas, reservas e eventos.</small></span></label><div class="m43-status" data-m43-status></div>`;
    (card.querySelector('.cfdh-program-metrics')||card).appendChild(box);
    const status=box.querySelector('[data-m43-status]');
    box.querySelector('[data-m43-circuit]').addEventListener('change',async e=>{try{status.textContent='Salvando…';await setMethodologyLink('cfdh_actions',row.id,'M4.3_CIRCUITOS',e.target.checked,'Circuito formativo marcado no planejamento/edição para contabilizar na Etapa 4.3.');status.textContent='Vínculo da Etapa 4.3 salvo.'}catch(err){e.target.checked=!e.target.checked;status.textContent='Não foi possível salvar.'}});
    box.querySelector('[data-m43-art]').addEventListener('change',async e=>{try{status.textContent='Salvando…';await setMethodologyLink('cfdh_actions',row.id,'M4.3_ARTISTICO_CULTURAL',e.target.checked,'CFDH classificado com finalidade artístico-cultural.');status.textContent='Classificação artístico-cultural salva.'}catch(err){e.target.checked=!e.target.checked;status.textContent='Não foi possível salvar.'}});
  }
}

function captureCalendarReference(event){
  const card=event.target.closest?.('.gc-event');if(card){lastCalendarRef={source:card.dataset.source,id:card.dataset.eventId};return}
  const item=event.target.closest?.('[data-day-event]');if(item){const [source,id]=String(item.dataset.dayEvent||'').split('|');lastCalendarRef={source,id};}
}
async function injectCalendarArtToggle(){
  const modal=document.querySelector('.gc-modal-body');if(!modal||modal.querySelector('[data-meta43-calendar-art]')||!lastCalendarRef?.id||!SUPPORTED_ART_SOURCES.has(lastCalendarRef.source))return;
  const states=await linkState(lastCalendarRef.source,lastCalendarRef.id,['M4.3_ARTISTICO_CULTURAL']);if(!modal.isConnected)return;
  const box=document.createElement('div');box.className='m43-box';box.dataset.meta43CalendarArt='1';box.innerHTML=`<label class="m43-check"><input type="checkbox" ${states.get('M4.3_ARTISTICO_CULTURAL')?'checked':''}><span><b>Finalidade artístico-cultural</b><small>Usa o mesmo indicador da Etapa 4.3 para atividades e eventos artístico-culturais.</small></span></label><div class="m43-status"></div>`;
  const actions=modal.querySelector('.gc-actions');(actions||modal).insertAdjacentElement(actions?'beforebegin':'beforeend',box);
  const input=box.querySelector('input'),status=box.querySelector('.m43-status');input.addEventListener('change',async()=>{try{status.textContent='Salvando…';await setMethodologyLink(lastCalendarRef.source,lastCalendarRef.id,'M4.3_ARTISTICO_CULTURAL',input.checked,'Evento/atividade classificado no Calendário Geral com finalidade artístico-cultural.');status.textContent='Classificação salva.'}catch(err){input.checked=!input.checked;status.textContent='Não foi possível salvar.'}});
}

async function showcaseRequired(month=monthKey()){
  if(!c())return null;const q=await c().from('goal_stage_schedule').select('reference_month,contract_month,source_label').eq('stage_code','4.5').eq('reference_month',`${month}-01`).maybeSingle();if(q.error)throw q.error;return q.data||null;
}
function reconcileShowcaseNav(nav,visible){
  // A existência do item deve ser conferida depois das consultas assíncronas.
  const [existing,...duplicates]=nav.querySelectorAll(SHOWCASE_NAV_SELECTOR);
  duplicates.forEach(node=>node.remove());
  if(!visible){existing?.remove();return}
  let a=existing;
  if(!a){
    a=document.createElement('a');a.dataset.meta43ShowcaseNav='1';a.href='#mostra-profissoes';a.innerHTML='<span>★</span><span>Mostra Semestral</span>';
    const cal=nav.querySelector('[data-general-calendar-link]');if(cal)cal.insertAdjacentElement('afterend',a);else{const sep=nav.querySelector('.sep');nav.insertBefore(a,sep||null)}
  }
  a.classList.toggle('active',route()===SHOWCASE_ROUTE);
}
function ensureShowcaseNav(){
  const nav=document.querySelector('.sidebar .nav');if(!nav)return;
  const month=monthKey();let state=showcaseNavStates.get(nav);
  if(!state||state.month!==month){state={month,checkedAt:0,visible:false,pending:null};showcaseNavStates.set(nav,state)}
  if(state.pending)return state.pending;
  // Alterações de HTML não precisam consultar o cronograma novamente.
  if(state.checkedAt&&Date.now()-state.checkedAt<60000){reconcileShowcaseNav(nav,state.visible);return}
  state.pending=(async()=>{
    const user=await profile(),required=user?.active?await showcaseRequired(month):null;
    if(!nav.isConnected||document.querySelector('.sidebar .nav')!==nav||showcaseNavStates.get(nav)!==state||monthKey()!==month)return;
    state.visible=Boolean(required);state.checkedAt=Date.now();
    reconcileShowcaseNav(nav,state.visible);
  })().finally(()=>{state.pending=null});
  return state.pending;
}
async function renderShowcase({force=false}={}){
  if(route()!==SHOWCASE_ROUTE)return;const host=document.querySelector('.content');if(!host)return;
  const hash=location.hash;
  if(!force&&showcaseView?.host===host&&showcaseView.hash===hash&&showcaseView.view.isConnected&&host.contains(showcaseView.view))return;
  const view=document.createElement('div');view.dataset.meta43ShowcaseView='1';
  const current={host,hash,view};showcaseView=current;
  const currentRoute=captureRoute(host),still=()=>showcaseView===current&&currentRoute()&&view.isConnected&&host.contains(view);
  injectStyle();host.replaceChildren(view);
  view.innerHTML='<div class="card"><div class="empty">Carregando Mostra Semestral…</div></div>';
  try{
    const user=await profile(),required=await showcaseRequired();if(!still())return;
    if(!user?.active){view.innerHTML='<div class="notice danger">Acesso indisponível.</div>';return}
    if(!required){view.innerHTML=`<div class="m43-showcase"><div class="m43-hero"><h2>Mostra Semestral</h2><p>Este menu só fica disponível nos meses em que a Mostra de Profissões é requisito do cronograma físico.</p></div><div class="notice info">Não há Mostra Semestral exigível em ${esc(monthKey())}.</div></div>`;return}
    const month=required.reference_month.slice(0,7);const q=await c().from('professional_showcases').select('*').eq('reference_month',required.reference_month).maybeSingle();if(!still())return;if(q.error)throw q.error;const row=q.data||{};
    view.innerHTML=`<div class="m43-showcase"><div class="m43-hero"><h2>Mostra Semestral · ${esc(month)}</h2><p>Requisito ativo apenas nesta competência. Quando marcada como realizada dentro do mês, a mesma ocorrência alimenta a Etapa 4.5 e contribui uma única vez para a síntese da Etapa 4.3.</p></div><div class="m43-kpis"><div class="m43-kpi"><small>Competência</small><b>${esc(month)}</b></div><div class="m43-kpi"><small>Status</small><b>${esc(row.status||'planejada')}</b></div><div class="m43-kpi"><small>Participantes</small><b>${Number(row.participants_count||0)}</b></div></div><form class="m43-card" data-showcase-form><div class="m43-grid"><div class="m43-field"><label>Título</label><input class="input" name="title" value="${esc(row.title||'Mostra de Profissões e Mercado de Trabalho')}" required></div><div class="m43-field"><label>Status</label><select name="status"><option value="planejada">Planejada</option><option value="realizada">Realizada</option><option value="cancelada">Cancelada</option></select></div><div class="m43-field"><label>Data de execução</label><input class="input" type="date" name="scheduled_date" min="${month}-01" max="${month}-${new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate()}" value="${esc(row.scheduled_date||'')}"></div><div class="m43-field"><label>Nº de participantes</label><input class="input" type="number" min="0" max="60" name="participants_count" value="${Number(row.participants_count||0)}"></div></div><div class="m43-field" style="margin-top:10px"><label>Referência/evidência</label><input class="input" name="evidence_ref" value="${esc(row.evidence_ref||'')}" placeholder="Relatório, documento, pasta ou referência da evidência"></div><div class="m43-field" style="margin-top:10px"><label>Observações</label><textarea name="notes">${esc(row.notes||'')}</textarea></div><div class="m43-actions"><button class="btn primary" type="submit">Salvar Mostra Semestral</button></div></form></div>`;
    const form=view.querySelector('[data-showcase-form]');form.querySelector('[name="status"]').value=row.status||'planejada';form.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(form),status=fd.get('status'),date=fd.get('scheduled_date')||null;if(status==='realizada'&&!date){toast('Informe a data de execução para marcar a mostra como realizada.','danger');return}if(date&&String(date).slice(0,7)!==month){toast('A Mostra só pode contabilizar dentro do mês de execução previsto.','danger');return}const payload={reference_month:required.reference_month,title:String(fd.get('title')||'').trim(),scheduled_date:date,status,participants_count:Number(fd.get('participants_count')||0),evidence_ref:String(fd.get('evidence_ref')||'').trim()||null,notes:String(fd.get('notes')||'').trim()||null,updated_by:user.id,updated_at:new Date().toISOString()};if(!row.id){payload.created_by=user.id}const save=await c().from('professional_showcases').upsert(payload,{onConflict:'reference_month'});if(save.error){toast(save.error.message,'danger');return}toast('Mostra Semestral salva.');await renderShowcase({force:true})});
  }catch(err){if(still())view.innerHTML=`<div class="notice danger"><b>Não foi possível abrir a Mostra Semestral.</b><br>${esc(err.message||err)}</div>`}
}

function scan(){
  injectStyle();bindWorkshopForm(currentWorkshopForm());bindBookingForm(document.querySelector('#ac-booking-form'));
  if(route()==='cfdh')bindCfdhLinks().catch(()=>{});
  if(route()==='calendario-geral')injectCalendarArtToggle().catch(()=>{});
  Promise.resolve(ensureShowcaseNav()).catch(()=>{});
  if(route()===SHOWCASE_ROUTE)renderShowcase().catch(()=>{});else showcaseView=null;
}
function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;scan()})}

function boot(){
if(window[INSTALL_FLAG])return;window[INSTALL_FLAG]=true;
document.addEventListener('click',e=>{
  const edit=e.target.closest?.('[data-edit-workshop]');if(edit)workshopEditId=edit.dataset.editWorkshop||null;
  if(e.target.closest?.('[data-action="new-workshop"]'))workshopEditId=null;
  captureCalendarReference(e);schedule();
},true);
document.addEventListener('submit',captureWorkshopSubmit,true);
document.addEventListener('submit',captureBookingSubmit,true);
window.addEventListener('hashchange',()=>{lastCalendarRef=null;schedule()});
window.addEventListener('crj:route-rendered',schedule);
window.addEventListener('crj:features-ready',schedule);
window.addEventListener('focus',()=>{const state=showcaseNavStates.get(document.querySelector('.sidebar .nav'));if(state)state.checkedAt=0;schedule()});
observer=new MutationObserver(schedule);observer.observe(document.body,{subtree:true,childList:true});
schedule();
}
boot();
