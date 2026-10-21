import { apiMode, supabaseClient } from './api.js?v=20261015-1';

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const time5=v=>String(v||'').slice(0,5);
const client=()=>apiMode()==='live'?supabaseClient():null;
const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const PENDING_TEXT='Pendente de elaboração do CFDH Compartilhado Transversal.';
let workshopsCache=null,profilesCache=null,cacheAt=0,scheduled=false,distributing=false;
let linkedCache=new Map(),linkedCacheKey='',linkedCacheAt=0,linkedLoading=null;
let lessonsCache={key:'',at:0,rows:[]};

function notify(message,type='info'){
  let box=document.querySelector('[data-cfdh-transversal-notify]');
  if(!box){
    box=document.createElement('div');
    box.dataset.cfdhTransversalNotify='1';
    Object.assign(box.style,{position:'fixed',right:'18px',bottom:'18px',zIndex:'2147483600',maxWidth:'430px',padding:'12px 14px',borderRadius:'12px',boxShadow:'0 16px 45px rgba(0,0,0,.22)',fontSize:'12px',fontWeight:'700',lineHeight:'1.45'});
    document.body.appendChild(box);
  }
  box.textContent=message;
  box.style.background=type==='danger'?'#7e2525':type==='warn'?'#fff4d8':'#eaf7f2';
  box.style.color=type==='danger'?'#fff':'#173a31';
  box.style.border=type==='danger'?'1px solid #7e2525':'1px solid #cfe2db';
  box.hidden=false;
  clearTimeout(notify.t);
  notify.t=setTimeout(()=>{box.hidden=true},5200);
}

function monthKey(){
  const p=new URLSearchParams((location.hash.split('?')[1]||''));
  const m=p.get('month');
  if(/^\d{4}-\d{2}$/.test(m||''))return m;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  return `${parts.year}-${parts.month}`;
}
function minutes(t){const [h,m]=time5(t).split(':').map(Number);return Number.isFinite(h)&&Number.isFinite(m)?h*60+m:null}
function durationHours(start,end){const a=minutes(start),b=minutes(end);return a!=null&&b!=null&&b>a?Number(((b-a)/60).toFixed(2)):null}
function emit(el,type='change'){if(el)el.dispatchEvent(new Event(type,{bubbles:true}))}
function brDate(v){const m=String(v||'').slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:String(v||'')}
function hoursLabel(v){const n=Number(v);return Number.isFinite(n)?n.toLocaleString('pt-BR',{maximumFractionDigits:2}):String(v||'')}

async function loadReferenceData(force=false){
  if(!client())return {workshops:[],profiles:[]};
  if(!force&&workshopsCache&&Date.now()-cacheAt<30000)return {workshops:workshopsCache,profiles:profilesCache||[]};
  const [wq,pq]=await Promise.all([
    client().from('workshops').select('id,name,educator_user_id,start_time,end_time,location_type,location_other,active').eq('active',true).order('name'),
    client().from('profiles').select('id,display_name,role,active').eq('active',true).order('display_name')
  ]);
  if(wq.error)throw wq.error;
  if(pq.error)throw pq.error;
  workshopsCache=wq.data||[];
  profilesCache=pq.data||[];
  cacheAt=Date.now();
  return {workshops:workshopsCache,profiles:profilesCache};
}
function workshopMap(rows){return new Map((rows||[]).map(x=>[String(x.id),x]))}
function profileMap(rows){return new Map((rows||[]).map(x=>[String(x.id),x]))}

function hideLegacyCalendarAndConflicts(form=document){
  $$('[data-cfdh-action-card]',form).forEach(card=>{
    const picker=card.querySelector('[data-cfdh-calendar-picker]');
    if(picker){picker.classList.add('hidden');picker.style.display='none'}
    const conflict=card.querySelector('[data-cfdh-calendar-conflict]');
    if(conflict){conflict.classList.add('hidden');conflict.innerHTML=''}
  });
  $$('[data-cfdh-alerts] .notice',form).forEach(el=>{
    if(/conflito de hor[aá]rio/i.test(el.textContent||''))el.remove();
  });
}

function updateTransversalCopy(){
  const form=$('#cfdh-plan-editor');
  if(!form||form.querySelector('[name="plan_type"]')?.value!=='cfdh_transversal')return;
  const block=form.querySelector('[data-cfdh-workshops-block]');
  const p=block?.querySelector('.page-head p');
  if(p)p.textContent='Selecione uma ou mais oficinas. A distribuição inteligente sugere uma ação por oficina e permite vincular cada ação diretamente a uma aula disponível do planejamento mensal.';
  block?.querySelectorAll('small').forEach(el=>{
    if(/atíp|distribu|ocorrência|planejad|transversal/i.test(el.textContent||'')){
      el.textContent='As aulas são escolhidas dentro de cada ação a partir da oficina de referência. Não é necessário marcar CFDH previamente no planejamento da oficina.';
    }
  });
  hideLegacyCalendarAndConflicts(form);
}

async function addReferenceLabels(){
  const form=$('#cfdh-plan-editor');
  if(!form)return;
  const {workshops,profiles}=await loadReferenceData();
  const wm=workshopMap(workshops),pm=profileMap(profiles);
  $$('input[name="cfdh_workshop_id"]',form).forEach(input=>{
    const label=input.closest('label');
    if(!label)return;
    let info=label.querySelector('[data-cfdh-ref-educator-label]');
    const w=wm.get(input.value),person=w?.educator_user_id?pm.get(String(w.educator_user_id)):null;
    const text=person?`Educador(a) de referência: ${person.display_name}`:'Educador(a) de referência não definido';
    if(!info){
      info=document.createElement('small');
      info.dataset.cfdhRefEducatorLabel='1';
      info.style.display='block';
      info.style.marginTop='3px';
      info.style.fontWeight='700';
      label.querySelector('span')?.appendChild(info);
    }
    info.textContent=text;
  });
}

function defaultReferenceEducator(card,workshopId,wm){
  const w=wm.get(String(workshopId||''));
  if(!w?.educator_user_id)return;
  const check=card.querySelector(`input[name="responsible_user_id"][value="${CSS.escape(String(w.educator_user_id))}"]`);
  if(check&&!check.checked){check.checked=true;emit(check,'change')}
}

async function availablePlanLessons(ids,force=false){
  const clean=[...new Set((ids||[]).map(String).filter(Boolean))];
  if(!clean.length||!client())return [];
  const month=monthKey(),monthStart=month+'-01',key=month+'|'+clean.sort().join('|');
  if(!force&&lessonsCache.key===key&&Date.now()-lessonsCache.at<10000)return lessonsCache.rows;
  const pq=await client().from('workshop_monthly_plans')
    .select('id,workshop_id,plan_month,status,updated_at')
    .in('workshop_id',clean).eq('plan_month',monthStart)
    .order('updated_at',{ascending:false});
  if(pq.error)throw pq.error;
  const latestByWorkshop=new Map();
  for(const p of pq.data||[]){
    const k=String(p.workshop_id);
    if(!latestByWorkshop.has(k))latestByWorkshop.set(k,p);
  }
  const plans=[...latestByWorkshop.values()];
  if(!plans.length){lessonsCache={key,at:Date.now(),rows:[]};return []}
  const planById=new Map(plans.map(p=>[String(p.id),p])),planIds=plans.map(p=>p.id);
  const lq=await client().from('workshop_plan_lessons')
    .select('id,plan_id,calendar_entry_id,lesson_number,scheduled_date,start_time,end_time,location_type,location_other,included,updated_at')
    .in('plan_id',planIds).eq('included',true).not('calendar_entry_id','is',null)
    .order('scheduled_date').order('start_time').order('lesson_number');
  if(lq.error)throw lq.error;
  const lessons=lq.data||[];
  const calendarIds=[...new Set(lessons.map(l=>l.calendar_entry_id).filter(Boolean))];
  if(!calendarIds.length){lessonsCache={key,at:Date.now(),rows:[]};return []}
  const cq=await client().from('workshop_calendar')
    .select('id,status,workshop_id,scheduled_date,start_time,end_time,location_type,location_other')
    .in('id',calendarIds);
  if(cq.error)throw cq.error;
  const calendarMap=new Map((cq.data||[]).map(c=>[String(c.id),c]));
  const rows=lessons.map(l=>{
    const p=planById.get(String(l.plan_id)),cal=calendarMap.get(String(l.calendar_entry_id));
    return {...l,workshop_id:p?.workshop_id||cal?.workshop_id||null,plan_status:p?.status||'',calendar_status:cal?.status||''};
  }).filter(l=>l.workshop_id&&l.calendar_status!=='cancelada')
    .sort((a,b)=>String(a.scheduled_date).localeCompare(String(b.scheduled_date))||String(a.start_time||'').localeCompare(String(b.start_time||''))||Number(a.lesson_number||0)-Number(b.lesson_number||0));
  lessonsCache={key,at:Date.now(),rows};
  return rows;
}

function setValue(card,name,value,{event=true}={}){
  const el=card.querySelector(`[name="${name}"]`);
  if(!el)return;
  if(el.tagName==='SELECT'&&value&&!Array.from(el.options).some(o=>o.value===String(value)))return;
  el.value=value??'';
  if(event){emit(el,'input');emit(el,'change')}
}
function ensureLessonIdInput(card){
  let input=card.querySelector('[name="workshop_plan_lesson_id"]');
  if(!input){
    input=document.createElement('input');
    input.type='hidden';
    input.name='workshop_plan_lesson_id';
    card.appendChild(input);
  }
  return input;
}
function clearSlot(card,{keepWorkshop=true}={}){
  card.dataset.cfdhPlanLessonId='';
  ensureLessonIdInput(card).value='';
  setValue(card,'workshop_calendar_id','',{event:false});
  setValue(card,'scheduled_date','',{event:false});
  setValue(card,'start_time','',{event:false});
  setValue(card,'end_time','',{event:false});
  if(!keepWorkshop)setValue(card,'workshop_id','',{event:false});
  const status=card.querySelector('[data-cfdh-schedule-link-status]');
  if(status)status.textContent='Selecione uma aula disponível desta oficina.';
}
function applySlot(card,w,slot,wm){
  const workshopSel=card.querySelector('[data-cfdh-action-workshop]');
  if(workshopSel&&!Array.from(workshopSel.options).some(o=>o.value===String(w.id))){
    const op=document.createElement('option');op.value=w.id;op.textContent=w.name||'Oficina';workshopSel.appendChild(op);
  }
  card.dataset.cfdhPlanLessonId=slot.id;
  ensureLessonIdInput(card).value=slot.id;
  setValue(card,'workshop_id',w.id);
  setValue(card,'schedule_mode','workshop_planned');
  setValue(card,'workshop_calendar_id',slot.calendar_entry_id);
  setValue(card,'scheduled_date',slot.scheduled_date);
  setValue(card,'start_time',time5(slot.start_time));
  setValue(card,'end_time',time5(slot.end_time));
  const h=durationHours(slot.start_time,slot.end_time);
  if(h)setValue(card,'planned_duration_hours',h);
  if(slot.location_type!=null)setValue(card,'location_type',slot.location_type);
  if(slot.location_other!=null)setValue(card,'location_other',slot.location_other);
  defaultReferenceEducator(card,w.id,wm);
  const status=card.querySelector('[data-cfdh-schedule-link-status]');
  if(status)status.textContent=`Aula ${slot.lesson_number} vinculada · ${brDate(slot.scheduled_date)} · ${time5(slot.start_time)}–${time5(slot.end_time)}`;
  const picker=card.querySelector('[data-cfdh-lesson-select]');
  if(picker)picker.value=String(slot.id);
  hideLegacyCalendarAndConflicts(card);
}

async function populateLessonPicker(card,workshopId,{force=false}={}){
  const select=card.querySelector('[data-cfdh-lesson-select]');
  if(!select)return;
  const wid=String(workshopId||'');
  select.disabled=true;
  select.innerHTML='<option value="">Carregando aulas…</option>';
  if(!wid){select.innerHTML='<option value="">Selecione primeiro a oficina de referência</option>';return}
  try{
    const rows=(await availablePlanLessons([wid],force)).filter(r=>String(r.workshop_id)===wid);
    const currentLesson=String(card.dataset.cfdhPlanLessonId||ensureLessonIdInput(card).value||'');
    const currentCalendar=String(card.querySelector('[name="workshop_calendar_id"]')?.value||'');
    const selected=rows.find(r=>String(r.id)===currentLesson)||rows.find(r=>String(r.calendar_entry_id)===currentCalendar);
    select.innerHTML='<option value="">Selecione uma aula disponível</option>'+rows.map(r=>`<option value="${esc(r.id)}">${esc(`Aula ${r.lesson_number} · ${brDate(r.scheduled_date)} · ${time5(r.start_time)}–${time5(r.end_time)}`)}</option>`).join('');
    select.disabled=false;
    if(selected){
      card.dataset.cfdhPlanLessonId=selected.id;
      ensureLessonIdInput(card).value=selected.id;
      select.value=String(selected.id);
      const status=card.querySelector('[data-cfdh-schedule-link-status]');
      if(status)status.textContent=`Aula ${selected.lesson_number} vinculada · ${brDate(selected.scheduled_date)} · ${time5(selected.start_time)}–${time5(selected.end_time)}`;
    }else if(!rows.length){
      select.innerHTML='<option value="">Nenhuma aula ativa disponível neste mês</option>';
      const status=card.querySelector('[data-cfdh-schedule-link-status]');
      if(status)status.textContent='Esta oficina não possui aula ativa disponível no mês selecionado.';
    }
  }catch(err){
    console.warn('[CFDH transversal aulas]',err);
    select.innerHTML='<option value="">Não foi possível carregar as aulas</option>';
  }
}

async function bindActionWorkshopDefaults(){
  const form=$('#cfdh-plan-editor');
  if(!form||form.querySelector('[name="plan_type"]')?.value!=='cfdh_transversal')return;
  const {workshops}=await loadReferenceData();
  const wm=workshopMap(workshops);
  for(const card of $$('[data-cfdh-action-card]',form)){
    const workshopSel=card.querySelector('[data-cfdh-action-workshop]');
    if(!workshopSel)continue;
    defaultReferenceEducator(card,workshopSel.value,wm);
    hideLegacyCalendarAndConflicts(card);

    const host=card.querySelector('.cfdh-transversal-schedule')||card;
    let field=host.querySelector('[data-cfdh-lesson-picker-field]');
    if(!field){
      field=document.createElement('div');
      field.className='field';
      field.dataset.cfdhLessonPickerField='1';
      field.innerHTML='<label>Aula da oficina para receber o CFDH</label><select data-cfdh-lesson-select><option value="">Selecione primeiro a oficina de referência</option></select><small>Lista dependente da oficina. O vínculo usa a aula existente e não cria outro compromisso nem conflito de horário.</small>';
      const grid=host.querySelector('.form-grid');
      if(grid)grid.insertAdjacentElement('afterend',field);else host.appendChild(field);
    }
    ensureLessonIdInput(card);

    const helper=host.querySelector(':scope > small');
    if(helper)helper.textContent='Selecione uma aula da oficina. Data, horário e local vêm da própria aula; o CFDH fica incorporado a ela e não cria outra reserva de agenda.';

    if(workshopSel.dataset.directLessonBound!=='1'){
      workshopSel.dataset.directLessonBound='1';
      workshopSel.addEventListener('change',async()=>{
        clearSlot(card);
        defaultReferenceEducator(card,workshopSel.value,wm);
        await populateLessonPicker(card,workshopSel.value,{force:true});
      });
    }

    const lessonSel=field.querySelector('[data-cfdh-lesson-select]');
    if(lessonSel.dataset.bound!=='1'){
      lessonSel.dataset.bound='1';
      lessonSel.addEventListener('change',async()=>{
        const wid=String(workshopSel.value||'');
        if(!wid||!lessonSel.value){clearSlot(card);return}
        const rows=await availablePlanLessons([wid]);
        const slot=rows.find(r=>String(r.id)===String(lessonSel.value));
        const w=wm.get(wid);
        if(slot&&w)applySlot(card,w,slot,wm);
      });
    }
    await populateLessonPicker(card,workshopSel.value);
  }
}

async function distributeAvailablePlanLessons(){
  if(distributing)return;
  const form=$('#cfdh-plan-editor');
  if(!form||form.querySelector('[name="plan_type"]')?.value!=='cfdh_transversal')return;
  distributing=true;
  try{
    const ids=$$('input[name="cfdh_workshop_id"]:checked',form).map(x=>x.value);
    if(!ids.length){notify('Selecione ao menos uma oficina antes de distribuir.','warn');return}
    let cards=$$('[data-cfdh-action-card]',form);
    if(cards.length<ids.length){
      const count=form.querySelector('[name="cfdh_action_count"]');
      if(count){
        count.value=String(ids.length);
        emit(count,'input');emit(count,'change');
        await new Promise(resolve=>setTimeout(resolve,100));
        cards=$$('[data-cfdh-action-card]',form);
      }
    }
    const [{workshops},rows]=await Promise.all([loadReferenceData(),availablePlanLessons(ids,true)]);
    const wm=workshopMap(workshops),groups=new Map(ids.map(id=>[String(id),rows.filter(r=>String(r.workshop_id)===String(id))]));
    const without=ids.filter(id=>!(groups.get(String(id))||[]).length).map(id=>wm.get(String(id))?.name||'Oficina');
    if(!rows.length){
      notify(`Nenhuma aula ativa das oficinas selecionadas foi encontrada em ${monthKey().split('-').reverse().join('/')}. Gere ou confira o planejamento mensal das oficinas e tente novamente.`,'warn');
      return;
    }
    const pointers=new Map(ids.map(id=>[String(id),0]));
    let assigned=0,missing=0;
    for(let i=0;i<cards.length;i++){
      const card=cards[i];
      let wid=String(ids[i%ids.length]),list=groups.get(wid)||[],pos=pointers.get(wid)||0,slot=list[pos];
      if(!slot){
        const fallback=ids.map(String).find(id=>(pointers.get(id)||0)<(groups.get(id)||[]).length);
        if(fallback){wid=fallback;list=groups.get(wid)||[];pos=pointers.get(wid)||0;slot=list[pos]}
      }
      if(!slot){missing++;continue}
      pointers.set(wid,pos+1);
      const w=wm.get(wid);
      if(w){applySlot(card,w,slot,wm);await populateLessonPicker(card,wid);assigned++}
    }
    updateTransversalCopy();
    const noText=without.length?` Sem aulas disponíveis: ${without.join(', ')}.`:'';
    if(cards.length<ids.length){
      notify(`Foram encontradas ${ids.length} oficinas, mas somente ${cards.length} ações estão abertas. Ajuste a quantidade de ações para manter uma ação por oficina.${noText}`,'warn');
    }else if(missing){
      notify(`${assigned} ação(ões) vinculada(s) às aulas das oficinas. ${missing} ficou(aram) sem outra aula disponível.${noText}`,'warn');
    }else{
      notify(`${assigned} ação(ões) distribuída(s) diretamente nas aulas das oficinas. Nenhum bloqueio adicional de horário será criado.${noText}`,'info');
    }
  }catch(err){
    console.error('[CFDH transversal]',err);
    notify(err?.message||'Não foi possível distribuir o CFDH transversal.','danger');
  }finally{distributing=false}
}

function prepareWorkshopPlanField(card){
  card.querySelectorAll('[data-cfdh-lesson-toggle-box],[data-cfdh-lesson-toggle]').forEach(el=>{
    const box=el.closest?.('[data-cfdh-lesson-toggle-box]');
    (box||el).remove();
  });
  const ta=card.querySelector('textarea[name="cfdh_transversal"]');
  if(!ta)return;
  const field=ta.closest('.field');
  if(field)field.style.display='';
  ta.readOnly=true;
  ta.setAttribute('aria-readonly','true');
  ta.placeholder=PENDING_TEXT;
  ta.style.background='#f3f7f5';
  const label=field?.querySelector('label');
  if(label)label.textContent='CFDH TRANSVERSAL DO PLANEJAMENTO';
  let helper=field?.querySelector('[data-cfdh-workshop-field-help]');
  if(!helper&&field){
    helper=document.createElement('small');
    helper.dataset.cfdhWorkshopFieldHelp='1';
    field.appendChild(helper);
  }
  if(helper)helper.textContent='Preenchimento automático pelo CFDH Compartilhado Transversal. Este campo não é marcado nem preenchido manualmente na oficina.';
}

function enhanceWorkshopPlan(){
  const form=$('#workshop-plan-form');
  if(!form)return;
  $$('[data-plan-lesson]',form).forEach(prepareWorkshopPlanField);
}

async function loadLinkedActions(lessonIds){
  if(!client()||!lessonIds.length)return new Map();
  const key=[...lessonIds].sort().join('|');
  if(key===linkedCacheKey&&Date.now()-linkedCacheAt<2500)return linkedCache;
  if(linkedLoading&&key===linkedCacheKey)return linkedLoading;
  linkedCacheKey=key;
  linkedLoading=(async()=>{
    const q=await client().from('cfdh_actions')
      .select('id,plan_id,action_number,title,action_theme,objective,planned_duration_hours,workshop_plan_lesson_id,updated_at')
      .in('workshop_plan_lesson_id',lessonIds)
      .order('action_number');
    if(q.error)throw q.error;
    const map=new Map();
    for(const a of q.data||[]){
      const k=String(a.workshop_plan_lesson_id);
      if(!map.has(k))map.set(k,[]);
      map.get(k).push(a);
    }
    linkedCache=map;linkedCacheAt=Date.now();
    return map;
  })();
  try{return await linkedLoading}finally{linkedLoading=null}
}

function linkedText(actions){
  return (actions||[]).map(a=>[
    `Tema: ${String(a.action_theme||a.title||'CFDH Transversal').trim()}`,
    a.objective?`Objetivo específico: ${String(a.objective).trim()}`:'',
    a.planned_duration_hours!=null?`Duração: ${hoursLabel(a.planned_duration_hours)} horas`:''
  ].filter(Boolean).join('\n')).join('\n\n');
}

async function decorateLinkedWorkshopLessons(){
  const form=$('#workshop-plan-form');
  if(!form)return;
  const cards=$$('[data-plan-lesson]',form);
  cards.forEach(prepareWorkshopPlanField);
  const ids=cards.map(c=>c.dataset.planLesson).filter(Boolean);
  if(!ids.length||!client()){
    for(const card of cards){
      const ta=card.querySelector('textarea[name="cfdh_transversal"]');
      if(ta&&!String(ta.value||'').trim())ta.placeholder=PENDING_TEXT;
    }
    return;
  }
  const links=await loadLinkedActions(ids);
  for(const card of cards){
    const id=String(card.dataset.planLesson||''),actions=links.get(id)||[];
    const ta=card.querySelector('textarea[name="cfdh_transversal"]'),field=ta?.closest('.field');
    card.querySelector('[data-cfdh-linked-action-info]')?.remove();
    card.querySelector('[data-cfdh-pending-info]')?.remove();
    if(!actions.length){
      if(ta){ta.value='';ta.placeholder=PENDING_TEXT}
      const pending=document.createElement('div');
      pending.dataset.cfdhPendingInfo='1';
      pending.className='notice compact';
      pending.style.marginTop='8px';
      pending.innerHTML=`<b>CFDH Transversal</b><br>${esc(PENDING_TEXT)}`;
      (field||card).insertAdjacentElement('afterend',pending);
      continue;
    }
    const text=linkedText(actions);
    if(ta){ta.value=text;ta.placeholder=''}
    const info=document.createElement('div');
    info.dataset.cfdhLinkedActionInfo='1';
    info.className='notice info compact';
    info.style.marginTop='8px';
    const first=actions[0];
    info.innerHTML=`<b>CFDH sincronizado · ${actions.length} ação(ões) vinculada(s)</b><br>${esc(text).replace(/\n/g,'<br>')}<div class="actions" style="margin-top:7px"><button class="btn ghost" type="button" data-nav="cfdh?month=${esc(monthKey())}&plan=${esc(first.plan_id)}">Abrir na área CFDH</button></div>`;
    (field||card).insertAdjacentElement('afterend',info);
  }
}

async function enhance(){
  try{
    updateTransversalCopy();
    enhanceWorkshopPlan();
    await Promise.all([addReferenceLabels(),bindActionWorkshopDefaults(),decorateLinkedWorkshopLessons()]);
  }catch(err){console.warn('[CFDH transversal UI]',err?.message||err)}
}
function schedule(){
  if(scheduled)return;
  scheduled=true;
  setTimeout(()=>{scheduled=false;enhance()},60);
}

document.addEventListener('click',e=>{
  const btn=e.target.closest?.('[data-cfdh-auto-distribute]');
  if(!btn)return;
  const form=btn.closest('#cfdh-plan-editor');
  if(!form||form.querySelector('[name="plan_type"]')?.value!=='cfdh_transversal')return;
  e.preventDefault();
  e.stopImmediatePropagation();
  distributeAvailablePlanLessons();
},true);

document.addEventListener('change',e=>{
  if(e.target.matches?.('[name="cfdh_workshop_id"],[data-cfdh-action-workshop],[data-cfdh-type],[data-cfdh-lesson-select]')){
    linkedCacheAt=0;
    lessonsCache.at=0;
    schedule();
  }
},true);

const observer=new MutationObserver(schedule);
observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>{linkedCacheAt=0;lessonsCache.at=0;schedule()});
window.addEventListener('focus',()=>{linkedCacheAt=0;schedule()});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule();
