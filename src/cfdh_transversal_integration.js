import { apiMode, supabaseClient } from './api.js?v=20261015-1';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const time5=v=>String(v||'').slice(0,5);
const client=()=>apiMode()==='live'?supabaseClient():null;
const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let workshopsCache=null,profilesCache=null,cacheAt=0,scheduled=false,distributing=false;
let linkedCache=new Map(),linkedCacheKey='',linkedCacheAt=0,linkedLoading=null;

function notify(message,type='info'){
  let box=document.querySelector('[data-cfdh-transversal-notify]');
  if(!box){box=document.createElement('div');box.dataset.cfdhTransversalNotify='1';Object.assign(box.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:'2147483600',maxWidth:'430px',padding:'12px 14px',borderRadius:'12px',boxShadow:'0 16px 45px rgba(0,0,0,.22)',fontSize:'12px',fontWeight:'700',lineHeight:'1.45'});document.body.appendChild(box)}
  box.textContent=message;box.style.background=type==='danger'?'#7e2525':type==='warn'?'#fff4d8':'#eaf7f2';box.style.color=type==='danger'?'#fff':'#173a31';box.style.border=type==='danger'?'1px solid #7e2525':'1px solid #cfe2db';box.hidden=false;clearTimeout(notify.t);notify.t=setTimeout(()=>{box.hidden=true},5200);
}
function monthKey(){
  const p=new URLSearchParams((location.hash.split('?')[1]||''));const m=p.get('month');
  if(/^\d{4}-\d{2}$/.test(m||''))return m;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  return `${parts.year}-${parts.month}`;
}
function monthRange(month){const [y,m]=month.split('-').map(Number);return {start:`${y}-${String(m).padStart(2,'0')}-01`,end:new Date(Date.UTC(y,m,1)).toISOString().slice(0,10)};}
function minutes(t){const [h,m]=time5(t).split(':').map(Number);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:null;}
function durationHours(start,end){const a=minutes(start),b=minutes(end);return a!=null&&b!=null&&b>a?Number(((b-a)/60).toFixed(2)):null;}
function emit(el,type='change'){if(!el)return;el.dispatchEvent(new Event(type,{bubbles:true}));}
function brDate(v){const m=String(v||'').slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:String(v||'');}

async function loadReferenceData(force=false){
  if(!client())return {workshops:[],profiles:[]};
  if(!force&&workshopsCache&&Date.now()-cacheAt<30000)return {workshops:workshopsCache,profiles:profilesCache||[]};
  const [wq,pq]=await Promise.all([
    client().from('workshops').select('id,name,educator_user_id,start_time,end_time,location_type,location_other,active').eq('active',true).order('name'),
    client().from('profiles').select('id,display_name,role,active').eq('active',true).order('display_name')
  ]);
  if(wq.error)throw wq.error;if(pq.error)throw pq.error;
  workshopsCache=wq.data||[];profilesCache=pq.data||[];cacheAt=Date.now();return {workshops:workshopsCache,profiles:profilesCache};
}
function workshopMap(rows){return new Map((rows||[]).map(x=>[String(x.id),x]));}
function profileMap(rows){return new Map((rows||[]).map(x=>[String(x.id),x]));}

function updateTransversalCopy(){
  const form=$('#cfdh-plan-editor');if(!form)return;
  const type=form.querySelector('[name="plan_type"]')?.value;if(type!=='cfdh_transversal')return;
  const block=form.querySelector('[data-cfdh-workshops-block]');
  const p=block?.querySelector('.page-head p');if(p)p.textContent='Selecione uma ou mais oficinas. A distribuição inteligente consulta o planejamento mensal de cada oficina e usa somente aulas ativas previamente marcadas como CFDH transversal.';
  block?.querySelectorAll('small').forEach(el=>{if(/atíp|distribu|ocorrência|planejad/i.test(el.textContent||''))el.textContent='Marque “Esta aula possui CFDH transversal” no planejamento da oficina para disponibilizá-la à distribuição inteligente.'});
  form.querySelectorAll('[data-cfdh-calendar-conflict]').forEach(el=>{el.classList.add('hidden');el.innerHTML=''});
  $$('[data-cfdh-alerts] .notice').forEach(el=>{if(/conflito de hor[aá]rio/i.test(el.textContent||''))el.remove()});
}

async function addReferenceLabels(){
  const form=$('#cfdh-plan-editor');if(!form)return;
  const {workshops,profiles}=await loadReferenceData();const wm=workshopMap(workshops),pm=profileMap(profiles);
  $$('input[name="cfdh_workshop_id"]',form).forEach(input=>{
    const label=input.closest('label');if(!label)return;let info=label.querySelector('[data-cfdh-ref-educator-label]');
    const w=wm.get(input.value),person=w?.educator_user_id?pm.get(String(w.educator_user_id)):null;
    const text=person?`Educador(a) de referência: ${person.display_name}`:'Educador(a) de referência não definido';
    if(!info){info=document.createElement('small');info.dataset.cfdhRefEducatorLabel='1';info.style.display='block';info.style.marginTop='3px';info.style.fontWeight='700';label.querySelector('span')?.appendChild(info)}
    info.textContent=text;
  });
}
function defaultReferenceEducator(card,workshopId,wm){
  const w=wm.get(String(workshopId||''));if(!w?.educator_user_id)return;
  const check=card.querySelector(`input[name="responsible_user_id"][value="${CSS.escape(String(w.educator_user_id))}"]`);
  if(check&&!check.checked){check.checked=true;emit(check,'change')}
}
async function bindActionWorkshopDefaults(){
  const form=$('#cfdh-plan-editor');if(!form||form.querySelector('[name="plan_type"]')?.value!=='cfdh_transversal')return;
  const {workshops}=await loadReferenceData();const wm=workshopMap(workshops);
  $$('[data-cfdh-action-card]',form).forEach(card=>{
    const sel=card.querySelector('[data-cfdh-action-workshop]');if(!sel)return;
    defaultReferenceEducator(card,sel.value,wm);
    if(sel.dataset.refEducatorBound!=='1'){
      sel.dataset.refEducatorBound='1';sel.addEventListener('change',()=>{defaultReferenceEducator(card,sel.value,wm);const status=card.querySelector('[data-cfdh-schedule-link-status]');if(status&&!card.querySelector('[name="workshop_calendar_id"]')?.value)status.textContent='Selecione uma aula ativa do planejamento desta oficina marcada como CFDH transversal.'});
    }
    const status=card.querySelector('[data-cfdh-schedule-link-status]');
    if(status&&/atípico|ainda não identificado|selecione uma aula já planejada/i.test(status.textContent||''))status.textContent='Selecione uma aula ativa do planejamento da oficina marcada como CFDH transversal.';
    const helper=card.querySelector('.cfdh-transversal-schedule>small');if(helper)helper.textContent='Data, horário e local são herdados da aula marcada no planejamento mensal da oficina. O circuito não cria outra aula nem outra lista de presença.';
  });
}

async function eligiblePlanLessons(ids){
  if(!ids.length||!client())return [];
  const month=monthKey(),monthStart=month+'-01';
  const pq=await client().from('workshop_monthly_plans')
    .select('id,workshop_id,plan_month,status,updated_at')
    .in('workshop_id',ids).eq('plan_month',monthStart)
    .order('updated_at',{ascending:false});
  if(pq.error)throw pq.error;
  const plans=pq.data||[];if(!plans.length)return [];
  const planById=new Map(plans.map(p=>[String(p.id),p])),planIds=plans.map(p=>p.id);
  const lq=await client().from('workshop_plan_lessons')
    .select('id,plan_id,calendar_entry_id,lesson_number,scheduled_date,start_time,end_time,location_type,location_other,cfdh_transversal,included,updated_at')
    .in('plan_id',planIds).eq('included',true).not('calendar_entry_id','is',null)
    .order('scheduled_date').order('start_time').order('lesson_number');
  if(lq.error)throw lq.error;
  const marked=(lq.data||[]).filter(l=>String(l.cfdh_transversal||'').trim());
  if(!marked.length)return [];
  const calendarIds=[...new Set(marked.map(l=>l.calendar_entry_id).filter(Boolean))];
  const cq=await client().from('workshop_calendar').select('id,status,workshop_id').in('id',calendarIds);
  if(cq.error)throw cq.error;
  const calendarMap=new Map((cq.data||[]).map(c=>[String(c.id),c]));
  return marked.map(l=>{
    const p=planById.get(String(l.plan_id)),cal=calendarMap.get(String(l.calendar_entry_id));
    return {...l,workshop_id:p?.workshop_id||cal?.workshop_id||null,plan_status:p?.status||'',calendar_status:cal?.status||''};
  }).filter(l=>l.workshop_id&&l.calendar_status!=='cancelada')
    .sort((a,b)=>String(a.scheduled_date).localeCompare(String(b.scheduled_date))||String(a.start_time||'').localeCompare(String(b.start_time||''))||Number(a.lesson_number||0)-Number(b.lesson_number||0));
}
function setValue(card,name,value,{event=true}={}){const el=card.querySelector(`[name="${name}"]`);if(!el)return;if(el.tagName==='SELECT'&&value&&!Array.from(el.options).some(o=>o.value===String(value)))return;el.value=value??'';if(event){emit(el,'input');emit(el,'change')}}
function applySlot(card,w,slot,wm){
  const sel=card.querySelector('[data-cfdh-action-workshop]');
  if(sel&&!Array.from(sel.options).some(o=>o.value===String(w.id))){const op=document.createElement('option');op.value=w.id;op.textContent=w.name||'Oficina';sel.appendChild(op)}
  card.dataset.cfdhPlanLessonId=slot.id;
  setValue(card,'workshop_id',w.id);setValue(card,'schedule_mode','workshop_planned');setValue(card,'workshop_calendar_id',slot.calendar_entry_id);setValue(card,'scheduled_date',slot.scheduled_date);setValue(card,'start_time',time5(slot.start_time));setValue(card,'end_time',time5(slot.end_time));
  const h=durationHours(slot.start_time,slot.end_time);if(h)setValue(card,'planned_duration_hours',h);
  if(slot.location_type!=null)setValue(card,'location_type',slot.location_type);if(slot.location_other!=null)setValue(card,'location_other',slot.location_other);
  defaultReferenceEducator(card,w.id,wm);
  const status=card.querySelector('[data-cfdh-schedule-link-status]');if(status)status.textContent=`Vinculado ao planejamento da oficina · Aula ${slot.lesson_number} · ${brDate(slot.scheduled_date)} · ${time5(slot.start_time)}–${time5(slot.end_time)}`;
  const selected=card.querySelector('[data-cfdh-calendar-selected]');if(selected){selected.classList.remove('hidden');const span=selected.querySelector('span');if(span)span.textContent=brDate(slot.scheduled_date)}
}
async function distributeOnlyMarkedPlanLessons(){
  if(distributing)return;const form=$('#cfdh-plan-editor');if(!form||form.querySelector('[name="plan_type"]')?.value!=='cfdh_transversal')return;
  distributing=true;
  try{
    const ids=$$('input[name="cfdh_workshop_id"]:checked',form).map(x=>x.value);if(!ids.length){notify('Selecione ao menos uma oficina antes de distribuir.','warn');return}
    const [{workshops},rows]=await Promise.all([loadReferenceData(),eligiblePlanLessons(ids)]),wm=workshopMap(workshops),cards=$$('[data-cfdh-action-card]',form);
    const groups=new Map(ids.map(id=>[id,rows.filter(r=>String(r.workshop_id)===String(id))]));
    const withoutMarked=ids.filter(id=>!(groups.get(id)||[]).length).map(id=>wm.get(String(id))?.name||'Oficina');
    if(!rows.length){notify(`Nenhuma aula ativa marcada como CFDH transversal foi encontrada em ${monthKey().split('-').reverse().join('/')}. Abra o Planejamento da Oficina, marque “Esta aula possui CFDH transversal”, salve e tente novamente.`,'warn');return}
    const pointers=new Map(ids.map(id=>[id,0]));let assigned=0,missing=0;
    cards.forEach((card,i)=>{
      let wid=ids[i%ids.length],list=groups.get(wid)||[],pos=pointers.get(wid)||0,slot=list[pos];
      if(!slot){const fallback=ids.find(id=>(pointers.get(id)||0)<(groups.get(id)||[]).length);if(fallback){wid=fallback;list=groups.get(wid)||[];pos=pointers.get(wid)||0;slot=list[pos]}}
      if(!slot){missing++;return}
      pointers.set(wid,pos+1);const w=wm.get(String(wid));if(w){applySlot(card,w,slot,wm);assigned++}
    });
    updateTransversalCopy();
    const noMarkedText=withoutMarked.length?` Sem aula marcada: ${withoutMarked.join(', ')}.`:'';
    if(missing)notify(`${assigned} ação(ões) vinculada(s) às aulas marcadas nos planejamentos. ${missing} ficou(aram) sem aula CFDH transversal disponível.${noMarkedText}`,'warn');
    else notify(`${assigned} ação(ões) distribuída(s) nas aulas marcadas como CFDH transversal. Os vínculos serão gravados nos planejamentos das oficinas ao salvar o circuito.${noMarkedText}`,'info');
  }catch(err){console.error('[CFDH transversal]',err);notify(err?.message||'Não foi possível distribuir o CFDH transversal.','danger')}
  finally{distributing=false}
}

function ensureWorkshopLessonToggle(card){
  if(card.dataset.cfdhToggleBound==='1')return;
  const ta=card.querySelector('textarea[name="cfdh_transversal"]');if(!ta)return;card.dataset.cfdhToggleBound='1';
  const field=ta.closest('.field');const box=document.createElement('div');box.className='field';box.dataset.cfdhLessonToggleBox='1';
  box.innerHTML='<label class="check" style="align-items:flex-start"><input type="checkbox" data-cfdh-lesson-toggle><span><b>Esta aula possui CFDH transversal</b><small style="display:block;margin-top:3px">Ao salvar, esta aula ficará disponível para a distribuição inteligente do Circuito Formativo em Direitos Humanos. A aula continua única: não cria outra agenda nem outra lista de presença.</small></span></label>';
  field?.parentElement?.insertBefore(box,field);
  const toggle=box.querySelector('[data-cfdh-lesson-toggle]');toggle.checked=Boolean(ta.value.trim());
  const label=field?.querySelector('label');if(label)label.textContent='Tema / descrição do CFDH transversal nesta aula';
  const sync=()=>{if(toggle.disabled)return;if(toggle.checked){if(!ta.value.trim())ta.value='CFDH transversal previsto nesta aula.';if(field)field.style.display='';}else{ta.value='';if(field)field.style.display='none';}emit(ta,'input');emit(ta,'change')};
  if(field)field.style.display=toggle.checked?'':'none';toggle.addEventListener('change',sync);
}
function enhanceWorkshopPlan(){
  const form=$('#workshop-plan-form');if(!form)return;
  $$('[data-plan-lesson]',form).forEach(ensureWorkshopLessonToggle);
}
async function loadLinkedActions(lessonIds){
  if(!client()||!lessonIds.length)return new Map();
  const key=[...lessonIds].sort().join('|');
  if(key===linkedCacheKey&&Date.now()-linkedCacheAt<2500)return linkedCache;
  if(linkedLoading&&key===linkedCacheKey)return linkedLoading;
  linkedCacheKey=key;
  linkedLoading=(async()=>{
    const q=await client().from('cfdh_actions')
      .select('id,plan_id,action_number,title,action_theme,objective,workshop_plan_lesson_id,updated_at')
      .in('workshop_plan_lesson_id',lessonIds)
      .order('action_number');
    if(q.error)throw q.error;
    const map=new Map();for(const a of q.data||[]){const k=String(a.workshop_plan_lesson_id);if(!map.has(k))map.set(k,[]);map.get(k).push(a)}
    linkedCache=map;linkedCacheAt=Date.now();return map;
  })();
  try{return await linkedLoading}finally{linkedLoading=null}
}
async function decorateLinkedWorkshopLessons(){
  const form=$('#workshop-plan-form');if(!form||!client())return;
  const cards=$$('[data-plan-lesson]',form),ids=cards.map(c=>c.dataset.planLesson).filter(Boolean);if(!ids.length)return;
  const links=await loadLinkedActions(ids);
  for(const card of cards){
    const id=String(card.dataset.planLesson||''),actions=links.get(id)||[],ta=card.querySelector('textarea[name="cfdh_transversal"]'),field=ta?.closest('.field'),toggle=card.querySelector('[data-cfdh-lesson-toggle]'),box=card.querySelector('[data-cfdh-lesson-toggle-box]');
    card.querySelector('[data-cfdh-linked-action-info]')?.remove();
    if(!actions.length){
      if(toggle)toggle.disabled=false;if(ta){ta.readOnly=false;ta.style.background='';ta.removeAttribute('aria-readonly')}
      if(box){const small=box.querySelector('small');if(small)small.textContent='Ao salvar, esta aula ficará disponível para a distribuição inteligente do Circuito Formativo em Direitos Humanos. A aula continua única: não cria outra agenda nem outra lista de presença.'}
      if(field)field.style.display=toggle?.checked?'':'none';continue;
    }
    if(toggle){toggle.checked=true;toggle.disabled=true}
    if(ta){ta.readOnly=true;ta.setAttribute('aria-readonly','true');ta.style.background='#f3f7f5'}
    if(field)field.style.display='';
    if(box){const small=box.querySelector('small');if(small)small.textContent='Esta aula já está vinculada a uma ação do CFDH. O conteúdo abaixo é sincronizado automaticamente pela área CFDH.'}
    const a=actions[0],info=document.createElement('div');info.dataset.cfdhLinkedActionInfo='1';info.className='notice info compact';info.style.marginTop='8px';
    info.innerHTML=`<b>CFDH sincronizado · Ação ${esc(a.action_number)}</b><br>${esc(a.action_theme||a.title||'Circuito Formativo em Direitos Humanos')}${a.objective?`<br><span class="muted">${esc(a.objective)}</span>`:''}<div class="actions" style="margin-top:7px"><button class="btn ghost" type="button" data-nav="cfdh?month=${esc(monthKey())}&plan=${esc(a.plan_id)}">Abrir na área CFDH</button></div>`;
    (field||box||card).insertAdjacentElement('afterend',info);
  }
}

async function enhance(){
  try{updateTransversalCopy();enhanceWorkshopPlan();await Promise.all([addReferenceLabels(),bindActionWorkshopDefaults(),decorateLinkedWorkshopLessons()])}catch(err){console.warn('[CFDH transversal UI]',err?.message||err)}
}
function schedule(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;enhance()},60)}

document.addEventListener('click',e=>{
  const btn=e.target.closest?.('[data-cfdh-auto-distribute]');if(!btn)return;
  const form=btn.closest('#cfdh-plan-editor');if(!form||form.querySelector('[name="plan_type"]')?.value!=='cfdh_transversal')return;
  e.preventDefault();e.stopImmediatePropagation();distributeOnlyMarkedPlanLessons();
},true);

document.addEventListener('change',e=>{
  if(e.target.matches?.('[name="cfdh_workshop_id"],[data-cfdh-action-workshop],[data-cfdh-type],[data-cfdh-lesson-toggle]')){linkedCacheAt=0;schedule()}
},true);

const observer=new MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('hashchange',()=>{linkedCacheAt=0;schedule()});window.addEventListener('focus',()=>{linkedCacheAt=0;schedule()});if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();