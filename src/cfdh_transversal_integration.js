import { apiMode, supabaseClient } from './api.js?v=20261004-2';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const time5=v=>String(v||'').slice(0,5);
const client=()=>apiMode()==='live'?supabaseClient():null;
let workshopsCache=null,profilesCache=null,cacheAt=0,scheduled=false,distributing=false;

function notify(message,type='info'){
  let box=document.querySelector('[data-cfdh-transversal-notify]');
  if(!box){box=document.createElement('div');box.dataset.cfdhTransversalNotify='1';Object.assign(box.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:'2147483600',maxWidth:'430px',padding:'12px 14px',borderRadius:'12px',boxShadow:'0 16px 45px rgba(0,0,0,.22)',fontSize:'12px',fontWeight:'700',lineHeight:'1.45'});document.body.appendChild(box)}
  box.textContent=message;box.style.background=type==='danger'?'#7e2525':type==='warn'?'#fff4d8':'#eaf7f2';box.style.color=type==='danger'?'#fff':'#173a31';box.style.border=type==='danger'?'1px solid #7e2525':'1px solid #cfe2db';box.hidden=false;clearTimeout(notify.t);notify.t=setTimeout(()=>{box.hidden=true},4200);
}
function monthKey(){
  const p=new URLSearchParams((location.hash.split('?')[1]||''));const m=p.get('month');
  if(/^\d{4}-\d{2}$/.test(m||''))return m;
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date());
}
function monthRange(month){const [y,m]=month.split('-').map(Number);return {start:`${y}-${String(m).padStart(2,'0')}-01`,end:new Date(Date.UTC(y,m,1)).toISOString().slice(0,10)};}
function minutes(t){const [h,m]=time5(t).split(':').map(Number);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:null;}
function durationHours(start,end){const a=minutes(start),b=minutes(end);return a!=null&&b!=null&&b>a?Number(((b-a)/60).toFixed(2)):null;}
function emit(el,type='change'){if(!el)return;el.dispatchEvent(new Event(type,{bubbles:true}));}

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
  const p=block?.querySelector('.page-head p');if(p)p.textContent='Selecione uma ou mais oficinas. O CFDH transversal será distribuído somente em aulas já existentes no calendário da oficina; ele não cria nova oficina nem nova aula.';
  block?.querySelectorAll('small').forEach(el=>{if(/atíp|distribu/i.test(el.textContent||''))el.textContent='Cada ação transversal reutiliza uma ocorrência já planejada da oficina.'});
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
      sel.dataset.refEducatorBound='1';sel.addEventListener('change',()=>{defaultReferenceEducator(card,sel.value,wm);const status=card.querySelector('[data-cfdh-schedule-link-status]');if(status&&!card.querySelector('[name="workshop_calendar_id"]')?.value)status.textContent='Selecione uma aula já planejada desta oficina. O CFDH não cria nova ocorrência.'});
    }
    const status=card.querySelector('[data-cfdh-schedule-link-status]');
    if(status&&/atípico|ainda não identificado/i.test(status.textContent||''))status.textContent='Selecione uma aula já planejada da oficina. O CFDH não cria nova ocorrência.';
    const helper=card.querySelector('.cfdh-transversal-schedule>small');if(helper)helper.textContent='A ação transversal complementa uma aula existente. Data, horário e local devem vir da ocorrência da oficina.';
  });
}

async function calendarRows(ids){
  if(!ids.length||!client())return [];
  const {start,end}=monthRange(monthKey());
  const q=await client().from('workshop_calendar').select('id,workshop_id,scheduled_date,start_time,end_time,location_type,location_other,status,source').in('workshop_id',ids).gte('scheduled_date',start).lt('scheduled_date',end).neq('status','cancelada').order('scheduled_date').order('start_time');
  if(q.error)throw q.error;return q.data||[];
}
function setValue(card,name,value,{event=true}={}){const el=card.querySelector(`[name="${name}"]`);if(!el)return;if(el.tagName==='SELECT'&&value&&!Array.from(el.options).some(o=>o.value===String(value)))return;el.value=value??'';if(event){emit(el,'input');emit(el,'change')}}
function applySlot(card,w,slot,wm){
  const sel=card.querySelector('[data-cfdh-action-workshop]');
  if(sel&&!Array.from(sel.options).some(o=>o.value===String(w.id))){const op=document.createElement('option');op.value=w.id;op.textContent=w.name||'Oficina';sel.appendChild(op)}
  setValue(card,'workshop_id',w.id);setValue(card,'schedule_mode','workshop_planned');setValue(card,'workshop_calendar_id',slot.id);setValue(card,'scheduled_date',slot.scheduled_date);setValue(card,'start_time',time5(slot.start_time));setValue(card,'end_time',time5(slot.end_time));
  const h=durationHours(slot.start_time,slot.end_time);if(h)setValue(card,'planned_duration_hours',h);
  if(slot.location_type!=null)setValue(card,'location_type',slot.location_type);if(slot.location_other!=null)setValue(card,'location_other',slot.location_other);
  defaultReferenceEducator(card,w.id,wm);
  const status=card.querySelector('[data-cfdh-schedule-link-status]');if(status)status.textContent=`Vinculado à aula existente · ${slot.scheduled_date.split('-').reverse().join('/')} · ${time5(slot.start_time)}–${time5(slot.end_time)}`;
  const selected=card.querySelector('[data-cfdh-calendar-selected]');if(selected){selected.classList.remove('hidden');const span=selected.querySelector('span');if(span)span.textContent=slot.scheduled_date.split('-').reverse().join('/')}
}
async function distributeOnlyExistingClasses(){
  if(distributing)return;const form=$('#cfdh-plan-editor');if(!form||form.querySelector('[name="plan_type"]')?.value!=='cfdh_transversal')return;
  distributing=true;
  try{
    const ids=$$('input[name="cfdh_workshop_id"]:checked',form).map(x=>x.value);if(!ids.length){notify('Selecione ao menos uma oficina antes de distribuir.','warn');return}
    const [{workshops},rows]=await Promise.all([loadReferenceData(),calendarRows(ids)]),wm=workshopMap(workshops),cards=$$('[data-cfdh-action-card]',form);
    const groups=new Map(ids.map(id=>[id,rows.filter(r=>String(r.workshop_id)===String(id))]));
    const pointers=new Map(ids.map(id=>[id,0]));let assigned=0,missing=0;
    cards.forEach((card,i)=>{
      let wid=ids[i%ids.length],list=groups.get(wid)||[],pos=pointers.get(wid)||0,slot=list[pos];
      if(!slot){const fallback=ids.find(id=>(pointers.get(id)||0)<(groups.get(id)||[]).length);if(fallback){wid=fallback;list=groups.get(wid)||[];pos=pointers.get(wid)||0;slot=list[pos]}}
      if(!slot){missing++;return}
      pointers.set(wid,pos+1);const w=wm.get(wid);if(w){applySlot(card,w,slot,wm);assigned++}
    });
    updateTransversalCopy();
    if(missing)notify(`${assigned} ação(ões) vinculada(s) a aulas existentes. ${missing} ficou(aram) sem aula disponível neste mês; adicione/planeje a aula da oficina antes de vincular o CFDH.`, 'warn');
    else notify(`${assigned} ação(ões) distribuída(s) em aulas já existentes. Nenhuma nova oficina/aula foi criada.`,'info');
  }catch(err){console.error('[CFDH transversal]',err);notify(err?.message||'Não foi possível distribuir o CFDH transversal.','danger')}
  finally{distributing=false}
}

function enhanceWorkshopPlan(){
  const form=$('#workshop-plan-form');if(!form)return;
  $$('[data-plan-lesson]',form).forEach(card=>{
    if(card.dataset.cfdhToggleBound==='1')return;
    const ta=card.querySelector('textarea[name="cfdh_transversal"]');if(!ta)return;card.dataset.cfdhToggleBound='1';
    const field=ta.closest('.field');const box=document.createElement('div');box.className='field';box.dataset.cfdhLessonToggleBox='1';
    box.innerHTML='<label class="check" style="align-items:flex-start"><input type="checkbox" data-cfdh-lesson-toggle><span><b>Esta aula possui CFDH transversal</b><small style="display:block;margin-top:3px">Marque quando Direitos Humanos estiver integrado à própria realização da oficina. A aula continua única: não cria outra oficina, agenda ou lista de presença.</small></span></label>';
    field?.parentElement?.insertBefore(box,field);
    const toggle=box.querySelector('[data-cfdh-lesson-toggle]');toggle.checked=Boolean(ta.value.trim());
    const label=field?.querySelector('label');if(label)label.textContent='Tema / descrição do CFDH transversal nesta aula';
    const sync=()=>{if(toggle.checked){if(!ta.value.trim())ta.value='CFDH transversal previsto nesta aula.';if(field)field.style.display='';}else{ta.value='';if(field)field.style.display='none';}emit(ta,'input');emit(ta,'change')};
    if(field)field.style.display=toggle.checked?'':'none';toggle.addEventListener('change',sync);
  });
}

async function enhance(){
  try{updateTransversalCopy();enhanceWorkshopPlan();await Promise.all([addReferenceLabels(),bindActionWorkshopDefaults()])}catch(err){console.warn('[CFDH transversal UI]',err?.message||err)}
}
function schedule(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;enhance()},60)}

document.addEventListener('click',e=>{
  const btn=e.target.closest?.('[data-cfdh-auto-distribute]');if(!btn)return;
  const form=btn.closest('#cfdh-plan-editor');if(!form||form.querySelector('[name="plan_type"]')?.value!=='cfdh_transversal')return;
  e.preventDefault();e.stopImmediatePropagation();distributeOnlyExistingClasses();
},true);

document.addEventListener('change',e=>{
  if(e.target.matches?.('[name="cfdh_workshop_id"],[data-cfdh-action-workshop],[data-cfdh-type]'))schedule();
},true);

const observer=new MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true});window.addEventListener('hashchange',schedule);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
