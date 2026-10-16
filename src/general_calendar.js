import { apiMode, supabaseClient, listWorkshops } from './api.js?v=20261016-workshop-month1';

const ROUTE='calendario-geral';
const TZ='America/Sao_Paulo';
const PRIVILEGED=new Set(['coordenacao_geral']);
const TECH_ROLES=new Set(['assistente_social','psicologo','terapeuta_ocupacional']);
const ACCESS_ROLES=new Set(['controlador_acesso','coordenacao_geral']);
const CATEGORY_META={
  reuniao:{label:'Reunião',icon:'👥'},
  oficina:{label:'Oficina',icon:'◇'},
  cfdh:{label:'CFDH',icon:'◆'},
  pvida:{label:'PVida',icon:'♥'},
  ptrampo:{label:'PTrampo',icon:'↗'},
  tecnico:{label:'Equipe Técnica',icon:'✚'},
  evento:{label:'Evento',icon:'★'},
  passeio:{label:'Passeio / visita',icon:'↗'},
  articulacao:{label:'Articulação',icon:'◎'},
  espaco:{label:'Empréstimo de espaço',icon:'▣'},
  equipamento:{label:'Empréstimo de equipamento',icon:'▤'},
  outro:{label:'Outros',icon:'•'}
};
const CATEGORY_ORDER=['reuniao','oficina','cfdh','pvida','ptrampo','tecnico','evento','passeio','articulacao','espaco','equipamento','outro'];
const PT_MONTHS=['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const WEEKDAYS=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=(v='')=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const pad=n=>String(n).padStart(2,'0');
const localDate=d=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(d instanceof Date?d:new Date(d));
const localTime=v=>{if(!v)return '';try{return new Intl.DateTimeFormat('pt-BR',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(v))}catch{return String(v).slice(0,5)}};
const monthKey=d=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit'}).format(d instanceof Date?d:new Date(d));
const first=(row,keys)=>{for(const k of keys){const v=row?.[k];if(v!==undefined&&v!==null&&v!=='')return v}return null};
const time5=v=>String(v||'').slice(0,5);
const isIsoDate=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
const isRoute=()=>((location.hash||'').split('?')[0].replace(/^#/,'')===ROUTE);
let me=null,busy=false,lastRenderKey='',observer=null;
let cached={month:'',events:[],profile:null,loadedAt:0};

function params(){return new URLSearchParams((location.hash.split('?')[1]||''));}
function activeMonth(){const m=params().get('month');return /^\d{4}-\d{2}$/.test(m||'')?m:monthKey(new Date());}
function rangeForMonth(month){const [y,m]=month.split('-').map(Number);const start=`${y}-${pad(m)}-01`;const end=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);return {start,end,y,m};}
function shiftMonth(month,delta){const [y,m]=month.split('-').map(Number),d=new Date(Date.UTC(y,m-1+delta,1));return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}`;}
function setMonth(month){const p=params();p.set('month',month);location.hash=`${ROUTE}?${p.toString()}`;}
function selectedCategories(){const raw=params().get('types');return raw?new Set(raw.split(',').filter(Boolean)):new Set(CATEGORY_ORDER);}
function setCategories(set){const p=params();const arr=[...set];if(arr.length===CATEGORY_ORDER.length)p.delete('types');else p.set('types',arr.join(','));p.set('month',activeMonth());location.hash=`${ROUTE}?${p.toString()}`;}
function client(){if(apiMode()!=='live')throw new Error('Banco ainda não conectado.');return supabaseClient();}

async function resolveProfile(){
  if(me)return me;
  if(apiMode()!=='live')return null;
  const c=client(),{data:{user}}=await c.auth.getUser();if(!user)return null;
  const q=await c.from('profiles').select('id,display_name,role,team,active').eq('id',user.id).maybeSingle();
  if(q.error)throw q.error;me=q.data||null;return me;
}

async function safeRows(table){
  try{const q=await client().from(table).select('*').limit(1500);if(q.error)throw q.error;return q.data||[]}
  catch(err){console.warn(`[Calendário Geral] ${table}:`,err?.message||err);return []}
}
async function safeRowsWith(table,select='*'){
  try{const q=await client().from(table).select(select).limit(2000);if(q.error)throw q.error;return q.data||[]}
  catch(err){console.warn(`[Calendário Geral] ${table}:`,err?.message||err);return []}
}

function inferCategory(source,row){
  const joined=norm([row?.event_type,row?.plan_type,row?.action_type,row?.record_type,row?.resource_type,row?.booking_type,row?.category,row?.title,row?.activity_title,row?.name].filter(Boolean).join(' '));
  if(source==='access_resource_bookings'){
    if(joined.includes('equip')||joined.includes('material'))return 'equipamento';
    return 'espaco';
  }
  if(source==='workshop_calendar'||source==='workshop_sessions'||source==='workshop_plan_lessons')return 'oficina';
  if(source==='technical_action_plans')return joined.includes('ptrampo')?'ptrampo':'pvida';
  if(source==='cfdh_actions'||joined.includes('cfdh'))return 'cfdh';
  if(joined.includes('ptrampo'))return 'ptrampo';
  if(joined.includes('pvida'))return 'pvida';
  if(joined.includes('reuniao')||joined.includes('reunião')||joined.includes('estudo de caso'))return 'reuniao';
  if(joined.includes('passeio')||joined.includes('visita')||joined.includes('intercambio')||joined.includes('intercâmbio'))return 'passeio';
  if(joined.includes('evento')||joined.includes('programacao')||joined.includes('programação')||joined.includes('mostra'))return 'evento';
  if(source==='calendar_events')return 'tecnico';
  if(source==='articulation_actions'||joined.includes('mobilizacao')||joined.includes('mobilização')||joined.includes('articulacao')||joined.includes('articulação'))return 'articulacao';
  if(source==='educator_plans'&&joined.includes('oficina'))return 'oficina';
  return 'outro';
}
function titleFor(source,row){
  if(source==='calendar_events'&&row?.youth_id)return 'Atendimento da Equipe Técnica';
  if(source==='workshop_calendar')return row?.workshops?.name||row?.workshop_name||row?.title||'Oficina';
  const t=first(row,['title','activity_title','action_title','event_title','name','reason','description']);
  if(t)return String(t);
  const c=inferCategory(source,row);return CATEGORY_META[c]?.label||'Atividade';
}
function dateDescriptor(source,row){
  const candidates=[
    ['starts_at','ends_at'],['scheduled_start','scheduled_end'],['planned_start','planned_end'],
    ['action_date',null],['planned_date',null],['scheduled_date',null],['session_date',null],
    ['event_date',null],['record_date',null],['activity_date',null],['date',null]
  ];
  for(const [field,endField] of candidates){const v=row?.[field];if(v===undefined||v===null||v==='')continue;let date='';if(isIsoDate(v))date=String(v);else{try{date=localDate(v)}catch{date=String(v).slice(0,10)}};if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
    let start='',end='';
    if(!isIsoDate(v)&&String(v).includes('T'))start=localTime(v);else start=time5(first(row,['start_time','planned_start_time','scheduled_start_time']));
    const ev=endField?row?.[endField]:null;if(ev){if(!isIsoDate(ev)&&String(ev).includes('T'))end=localTime(ev);else end=time5(ev)}
    if(!end)end=time5(first(row,['end_time','planned_end_time','scheduled_end_time']));
    return {date,start,end,dateField:field,endField,raw:v};
  }
  return null;
}
function locationFor(row){
  const type=first(row,['location_type','resource_type','booking_type']);
  const detail=first(row,['location','location_name','location_other','location_details','room_name','resource_name','space_name','place']);
  if(detail)return String(detail);
  if(type==='crj')return 'CRJ Cariacica';
  return type?String(type).replaceAll('_',' '):'';
}
function statusFor(row){return String(first(row,['status','execution_status','state'])||'planejado');}
function routeFor(source,row){
  const explicit=first(row,['route','planning_route','source_route','hash']);if(explicit)return String(explicit).startsWith('#')?String(explicit):`#${explicit}`;
  if(source==='workshop_calendar'||source==='workshop_sessions'||source==='workshop_plan_lessons')return '#oficinas';
  if(source==='technical_action_plans')return '#equipe-tecnica';
  if(source==='calendar_events')return '#agenda';
  if(source==='access_resource_bookings')return '#controlador-acesso';
  if(source==='cfdh_actions')return '#cfdh';
  if(source==='articulation_actions')return '#articulacao';
  if(source==='educator_plans')return '#educador';
  if(source==='joint_actions')return '#lancamento-geral';
  return '#dashboard';
}
function ownerIds(row){return ['created_by','user_id','educator_user_id','responsible_user_id','owner_id','requested_by','professional_id','oficineiro_user_id'].map(k=>row?.[k]).filter(Boolean).map(String);}
function canEditSource(source,row,techMap){
  if(!me?.active)return false;
  if(PRIVILEGED.has(me.role))return true;
  if(ownerIds(row).includes(String(me.id)))return true;
  if(source==='calendar_events'&&TECH_ROLES.has(me.role)&&(techMap.get(row.id)||[]).includes(me.id))return true;
  if(source==='technical_action_plans'&&TECH_ROLES.has(me.role))return true;
  if(source==='access_resource_bookings'&&ACCESS_ROLES.has(me.role))return true;
  return false;
}
function normalizeEvent(source,row,techMap){
  const d=dateDescriptor(source,row);if(!d)return null;
  const category=inferCategory(source,row);
  return {
    id:String(row.id||`${source}-${Math.random()}`),source,row,category,title:titleFor(source,row),date:d.date,start:d.start,end:d.end,
    dateField:d.dateField,endField:d.endField,location:locationFor(row),status:statusFor(row),route:routeFor(source,row),
    canEdit:canEditSource(source,row,techMap),methodology:[],methodologyAreas:[],
    sourceType:String(first(row,['source_type'])||source),sourceId:String(first(row,['source_id'])||row.id||''),
    planningId:first(row,['plan_id','planning_id','source_id','workshop_id']),
    description:(source==='calendar_events'&&row?.youth_id)?'':String(first(row,['description','details','notes','planning_notes','summary'])||'')
  };
}
function inMonth(ev,month){return ev.date?.slice(0,7)===month;}
function signature(ev){return `${ev.date}|${ev.start}|${norm(ev.title).slice(0,80)}`;}
function dedupe(events){
  const bySource=new Set(),bySig=new Map(),out=[];
  for(const e of events){
    const sk=`${e.sourceType}:${e.sourceId}`;
    if(e.sourceId&&bySource.has(sk))continue;
    if(e.sourceId)bySource.add(sk);
    const sig=signature(e),prev=bySig.get(sig);
    if(prev){
      prev.methodology.push(...e.methodology);prev.methodologyAreas.push(...e.methodologyAreas);
      if(prev.source==='calendar_events'&&e.source!=='calendar_events'){Object.assign(prev,{source:e.source,row:e.row,route:e.route,dateField:e.dateField,endField:e.endField,canEdit:e.canEdit,sourceType:e.sourceType,sourceId:e.sourceId,planningId:e.planningId,category:e.category});}
      continue;
    }
    bySig.set(sig,e);out.push(e);
  }
  return out.sort((a,b)=>`${a.date} ${a.start||'99:99'} ${a.title}`.localeCompare(`${b.date} ${b.start||'99:99'} ${b.title}`));
}

function defaultMethodology(ev){
  if(ev.category==='pvida')return [{label:'Meta 6 · Etapa 6.2',detail:'PVida — Plano de Possibilidades para a Vida.'}];
  if(ev.category==='ptrampo')return [{label:'Meta 6 · Etapa 6.4',detail:'PTrampo — Plano de Possibilidades de Trabalhos Individuais ou Coletivos.'}];
  if(ev.category==='espaco'||ev.category==='equipamento')return [{label:'Meta 6 · Etapa 6.1',detail:'Empréstimos e agendamentos de espaços/equipamentos do CRJ.'}];
  if(ev.category==='cfdh')return [{label:'CFDH',detail:'Ação vinculada ao Circuito Formativo em Direitos Humanos.'}];
  return [];
}
async function attachMethodology(events){
  const c=client(),types=[...new Set(events.map(e=>e.sourceType).filter(Boolean))];
  let links=[],catalog=[],jointLinks=[];
  try{if(types.length){const q=await c.from('record_methodology_links').select('source_type,source_id,goal_stage,indicator_code,relation_mode,counts_toward_indicator,quantity,rationale').in('source_type',types).limit(3000);if(!q.error)links=q.data||[]}}
  catch{}
  try{const q=await c.from('indicator_catalog').select('code,label,goal_stage,target,unit,periodicity').limit(500);if(!q.error)catalog=q.data||[]}
  catch{}
  const cat=new Map(catalog.map(x=>[String(x.code),x]));
  try{const jointIds=events.filter(e=>e.source==='joint_actions').map(e=>e.id);if(jointIds.length){const q=await c.from('joint_action_links').select('action_id,area_code,subcategory').in('action_id',jointIds);if(!q.error)jointLinks=q.data||[]}}
  catch{}
  for(const e of events){
    const rows=links.filter(x=>String(x.source_type)===String(e.sourceType)&&String(x.source_id)===String(e.sourceId));
    e.methodology=rows.map(r=>{const i=cat.get(String(r.indicator_code||''));return {label:r.goal_stage?`Meta ${String(r.goal_stage).split('.')[0]} · Etapa ${r.goal_stage}`:(r.indicator_code||'Vínculo metodológico'),detail:[r.indicator_code,i?.label,r.rationale].filter(Boolean).join(' · ')};});
    if(!e.methodology.length)e.methodology=defaultMethodology(e);
    if(e.source==='joint_actions')e.methodologyAreas=jointLinks.filter(x=>String(x.action_id)===e.id).map(x=>x.subcategory||x.area_code).filter(Boolean);
  }
}

async function loadMonth(month,force=false){
  if(!force&&cached.month===month&&Date.now()-cached.loadedAt<30000)return cached;
  if(apiMode()!=='live')return {month,events:[],profile:null,loadedAt:Date.now()};
  await resolveProfile();
  const [calendarEvents,techLinks,workshopCalendar,technicalPlans,educatorPlans,cfdhActions,articulationActions,resourceBookings,jointActions]=await Promise.all([
    safeRows('calendar_events'),safeRowsWith('calendar_event_technicians','event_id,technician_user_id'),safeRowsWith('workshop_calendar','*,workshops(id,name,workshop_type,schedule_mode,location_type,location_other,oficineiro_user_id,educator_user_id)'),
    safeRows('technical_action_plans'),safeRows('educator_plans'),safeRows('cfdh_actions'),safeRows('articulation_actions'),safeRows('access_resource_bookings'),safeRows('joint_actions')
  ]);
  const monthlyWorkshops=new Map((await listWorkshops(month)).map(w=>[w.id,w]));
  for(const entry of workshopCalendar){const config=monthlyWorkshops.get(entry.workshop_id);if(config)entry.workshops=config;}
  const techMap=new Map();for(const x of techLinks){const a=techMap.get(x.event_id)||[];a.push(x.technician_user_id);techMap.set(x.event_id,a)}
  const sourceRows=[
    ['calendar_events',calendarEvents],['workshop_calendar',workshopCalendar],['technical_action_plans',technicalPlans],['educator_plans',educatorPlans],
    ['cfdh_actions',cfdhActions],['articulation_actions',articulationActions],['access_resource_bookings',resourceBookings],['joint_actions',jointActions]
  ];
  let events=[];for(const [source,rows] of sourceRows)for(const row of rows){const ev=normalizeEvent(source,row,techMap);if(ev&&inMonth(ev,month))events.push(ev)}
  events=dedupe(events);await attachMethodology(events);
  cached={month,events,profile:me,loadedAt:Date.now()};return cached;
}

function injectStyle(){
  if(document.querySelector('#crj-general-calendar-style'))return;
  const s=document.createElement('style');s.id='crj-general-calendar-style';s.textContent=`
  .gc-page{max-width:1600px;margin:0 auto}.gc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:14px}.gc-head h2{margin:0;font-size:24px}.gc-head p{margin:4px 0 0;color:var(--muted,#687671)}.gc-head-actions,.gc-nav,.gc-filters{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.gc-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;background:#fff;border:1px solid var(--line,#dfe7e5);border-radius:14px;padding:10px 12px;margin-bottom:10px}.gc-month-title{font-size:18px;font-weight:850;min-width:190px;text-align:center}.gc-btn{border:1px solid var(--line,#dfe7e5);background:#fff;border-radius:10px;padding:8px 10px;cursor:pointer;font-weight:700;color:inherit}.gc-btn:hover{border-color:#9cbdb4}.gc-btn.primary{background:var(--brand,#0b5b4c);border-color:var(--brand,#0b5b4c);color:#fff}.gc-filter{display:inline-flex;align-items:center;gap:5px;border:1px solid #dce6e3;background:#fff;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:700;cursor:pointer}.gc-filter.active{background:#0b5b4c;color:#fff;border-color:#0b5b4c}.gc-legend{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px}.gc-calendar-wrap{overflow:auto;background:#fff;border:1px solid var(--line,#dfe7e5);border-radius:16px;box-shadow:0 8px 28px rgba(17,49,41,.06)}.gc-weekdays,.gc-grid{min-width:980px;display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}.gc-weekdays>div{padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#63726d;border-right:1px solid #edf1ef;background:#f7faf9;font-weight:800}.gc-weekdays>div:last-child{border-right:0}.gc-day{min-height:142px;padding:7px;border-top:1px solid #e8efed;border-right:1px solid #e8efed;position:relative;background:#fff}.gc-day:nth-child(7n){border-right:0}.gc-day.outside{background:#f8faf9;color:#9ca8a4}.gc-day.today{box-shadow:inset 0 0 0 2px #0b5b4c}.gc-day-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:5px}.gc-day-number{font-weight:850;font-size:12px}.gc-day-count{font-size:9px;color:#71807b}.gc-event{display:block;width:100%;border:1px solid #dbe6e2;border-left:4px solid #4b776b;background:#f9fcfb;border-radius:7px;padding:5px 6px;margin:4px 0;text-align:left;cursor:pointer;color:#15231f;position:relative}.gc-event:hover{background:#f1f7f5}.gc-event-time{font-size:9px;font-weight:850;opacity:.72}.gc-event-title{font-size:10px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gc-event-kind{font-size:8px;opacity:.68;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.gc-event[data-cat="reuniao"]{border-left-color:#526d9f}.gc-event[data-cat="oficina"]{border-left-color:#167c63}.gc-event[data-cat="cfdh"]{border-left-color:#7455a5}.gc-event[data-cat="pvida"]{border-left-color:#a64f72}.gc-event[data-cat="ptrampo"]{border-left-color:#a06c28}.gc-event[data-cat="tecnico"]{border-left-color:#3c6f94}.gc-event[data-cat="evento"]{border-left-color:#b65d35}.gc-event[data-cat="passeio"]{border-left-color:#577c3c}.gc-event[data-cat="articulacao"]{border-left-color:#397e81}.gc-event[data-cat="espaco"]{border-left-color:#6b6f77}.gc-event[data-cat="equipamento"]{border-left-color:#8a673c}.gc-more{width:100%;border:0;background:transparent;color:#0b5b4c;font-weight:800;font-size:10px;text-align:left;padding:3px;cursor:pointer}.gc-tooltip{position:fixed;z-index:2147483600;width:min(390px,90vw);background:#14201d;color:#fff;border-radius:12px;padding:12px;box-shadow:0 20px 50px rgba(0,0,0,.32);font-size:11px;line-height:1.45;pointer-events:none}.gc-tooltip b{display:block;font-size:12px;margin-bottom:4px}.gc-tooltip .gc-tip-method{margin-top:7px;padding-top:7px;border-top:1px solid rgba(255,255,255,.16)}.gc-tooltip .gc-tip-method span{display:block;color:#cce1da;margin-top:3px}.gc-modal-bg{position:fixed;inset:0;z-index:2147483590;background:rgba(4,18,14,.68);display:grid;place-items:center;padding:12px}.gc-modal{width:min(720px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:16px;box-shadow:0 30px 90px rgba(0,0,0,.38)}.gc-modal-head{display:flex;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid #e5ece9;position:sticky;top:0;background:#fff;z-index:2}.gc-modal-head h3{margin:0}.gc-close{border:0;background:transparent;font-size:24px;cursor:pointer}.gc-modal-body{padding:16px}.gc-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.gc-detail{border:1px solid #e1e9e6;border-radius:10px;padding:9px}.gc-detail small{display:block;color:#687671}.gc-method-box{margin-top:12px;border:1px solid #d5e5df;background:#f5faf8;border-radius:11px;padding:10px}.gc-method-box b{display:block;margin-bottom:5px}.gc-method-item{padding:6px 0;border-top:1px dashed #d9e6e2;font-size:11px}.gc-method-item:first-of-type{border-top:0}.gc-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}.gc-empty{padding:28px;text-align:center;color:#687671}.gc-loading{padding:42px;text-align:center;color:#687671}.gc-edit-form{display:grid;gap:10px;margin-top:12px}.gc-edit-form label{font-size:11px;font-weight:800}.gc-edit-form input{width:100%;padding:9px;border:1px solid #dce6e3;border-radius:9px}.gc-day-list{display:grid;gap:8px}.gc-list-item{border:1px solid #dfe8e5;border-radius:11px;padding:10px;cursor:pointer}.gc-list-item:hover{background:#f7faf9}.gc-list-item b{display:block}.gc-list-item small{color:#687671}.gc-source-note{font-size:10px;color:#687671;margin-top:8px}.gc-print-doc{display:none}
  @media(max-width:760px){.gc-head h2{font-size:20px}.gc-toolbar{align-items:flex-start}.gc-calendar-wrap{border-radius:10px}.gc-detail-grid{grid-template-columns:1fr}.gc-head-actions{width:100%}.gc-head-actions .gc-btn{flex:1}.gc-filter{font-size:10px;padding:5px 7px}}
  `;document.head.appendChild(s);
}

function ensureMenu(){
  const nav=document.querySelector('.sidebar .nav,aside.sidebar nav,aside nav.nav');if(!nav||nav.querySelector('[data-general-calendar-link]'))return;
  const a=document.createElement('a');a.href='#'+ROUTE;a.dataset.generalCalendarLink='1';a.innerHTML='<span>▦</span><span>Calendário Geral</span>';
  const agenda=[...nav.querySelectorAll('a')].find(x=>norm(x.textContent).startsWith('agenda'));
  if(agenda)agenda.insertAdjacentElement('beforebegin',a);else nav.appendChild(a);
  if(isRoute())a.classList.add('active');
}
function markMenu(){document.querySelectorAll('[data-general-calendar-link]').forEach(a=>a.classList.toggle('active',isRoute()));}

function monthGrid(month,events,selected){
  const {y,m}=rangeForMonth(month),firstDay=new Date(y,m-1,1,12),offset=(firstDay.getDay()+6)%7,start=new Date(y,m-1,1-offset,12),today=localDate(new Date());
  let html='';for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const ds=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;const inside=d.getMonth()===m-1;const dayEvents=events.filter(e=>e.date===ds&&selected.has(e.category));const visible=dayEvents.slice(0,4);
    html+=`<div class="gc-day${inside?'':' outside'}${ds===today?' today':''}" data-day="${ds}"><div class="gc-day-head"><span class="gc-day-number">${d.getDate()}</span>${dayEvents.length?`<span class="gc-day-count">${dayEvents.length}</span>`:''}</div>${visible.map(eventCard).join('')}${dayEvents.length>4?`<button class="gc-more" data-day-more="${ds}">+ ${dayEvents.length-4} atividade(s)</button>`:''}</div>`;
  }return html;
}
function eventCard(e){const meta=CATEGORY_META[e.category]||CATEGORY_META.outro;return `<button class="gc-event" data-event-id="${esc(e.id)}" data-source="${esc(e.source)}" data-cat="${esc(e.category)}"><div class="gc-event-time">${e.start?esc(e.start)+(e.end?'–'+esc(e.end):''):'Dia inteiro'}</div><div class="gc-event-title">${esc(e.title)}</div><div class="gc-event-kind">${esc(meta.icon+' '+meta.label)}${e.location?' · '+esc(e.location):''}</div></button>`;}
function filtersHtml(selected){return CATEGORY_ORDER.map(k=>{const x=CATEGORY_META[k];return `<button class="gc-filter ${selected.has(k)?'active':''}" data-filter="${k}">${x.icon} ${esc(x.label)}</button>`}).join('');}
function monthTitle(month){const [y,m]=month.split('-').map(Number);return `${PT_MONTHS[m-1][0].toUpperCase()+PT_MONTHS[m-1].slice(1)} ${y}`;}

async function renderCalendar(force=false){
  if(!isRoute())return;
  const content=document.querySelector('.content');if(!content)return;
  const month=activeMonth(),key=`${month}|${params().get('types')||'all'}`;
  if(busy)return;if(!force&&lastRenderKey===key&&content.querySelector('[data-general-calendar-page]'))return;
  busy=true;injectStyle();ensureMenu();markMenu();
  content.innerHTML='<div class="gc-loading">Carregando calendário geral do CRJ…</div>';
  try{
    const data=await loadMonth(month,force),selected=selectedCategories();
    content.innerHTML=`<div class="gc-page" data-general-calendar-page><div class="gc-head"><div><h2>Calendário Geral do CRJ</h2><p>Visão mensal integrada de planejamentos, agenda técnica, oficinas, ações, eventos e empréstimos.</p></div><div class="gc-head-actions"><button class="gc-btn" data-gc-refresh>Atualizar</button><button class="gc-btn" data-gc-docx>DOCX</button><button class="gc-btn primary" data-gc-pdf>PDF / imprimir</button></div></div><div class="gc-toolbar"><div class="gc-nav"><button class="gc-btn" data-month-prev>‹</button><button class="gc-btn" data-month-today>Hoje</button><div class="gc-month-title">${esc(monthTitle(month))}</div><button class="gc-btn" data-month-next>›</button></div><div><b style="font-size:12px">${data.events.length}</b> <span style="font-size:11px;color:#687671">registro(s) no mês</span></div></div><div class="gc-legend gc-filters">${filtersHtml(selected)}</div><div class="gc-calendar-wrap"><div class="gc-weekdays">${WEEKDAYS.map(x=>`<div>${x}</div>`).join('')}</div><div class="gc-grid">${monthGrid(month,data.events,selected)}</div></div>${!data.events.length?'<div class="gc-empty">Nenhuma atividade com data foi encontrada para este mês.</div>':''}</div>`;
    bindCalendar(data,selected);lastRenderKey=key;
  }catch(err){content.innerHTML=`<div class="notice danger"><b>Não foi possível carregar o Calendário Geral.</b><br>${esc(err?.message||String(err))}</div>`;}
  finally{busy=false}
}

function tooltipHtml(e){const meta=CATEGORY_META[e.category]||CATEGORY_META.outro;const meth=e.methodology||[];return `<b>${esc(e.title)}</b><span>${esc(meta.icon+' '+meta.label)} · ${esc(e.date)}${e.start?' · '+esc(e.start)+(e.end?'–'+esc(e.end):''):''}</span>${e.location?`<span>Local: ${esc(e.location)}</span>`:''}<span>Status: ${esc(e.status)}</span>${meth.length?`<div class="gc-tip-method"><strong>Contribuições metodológicas</strong>${meth.slice(0,5).map(x=>`<span>• ${esc(x.label)}${x.detail?' — '+esc(x.detail):''}</span>`).join('')}</div>`:''}`;}
function openTooltip(e,button){closeTooltip();const t=document.createElement('div');t.className='gc-tooltip';t.id='gc-tooltip';t.innerHTML=tooltipHtml(e);document.body.appendChild(t);const r=button.getBoundingClientRect(),w=t.offsetWidth,h=t.offsetHeight;let left=Math.min(innerWidth-w-10,Math.max(10,r.left));let top=r.bottom+7;if(top+h>innerHeight-8)top=Math.max(8,r.top-h-7);t.style.left=left+'px';t.style.top=top+'px';}
function closeTooltip(){document.querySelector('#gc-tooltip')?.remove();}
function modal(title,body){document.querySelector('[data-gc-modal]')?.remove();const bg=document.createElement('div');bg.className='gc-modal-bg';bg.dataset.gcModal='1';bg.innerHTML=`<div class="gc-modal"><div class="gc-modal-head"><h3>${esc(title)}</h3><button class="gc-close" data-gc-close>×</button></div><div class="gc-modal-body">${body}</div></div>`;document.body.appendChild(bg);bg.querySelector('[data-gc-close]').onclick=()=>bg.remove();bg.addEventListener('click',x=>{if(x.target===bg)bg.remove()});return bg;}
function eventDetails(e){const meta=CATEGORY_META[e.category]||CATEGORY_META.outro;const methods=e.methodology?.length?e.methodology:defaultMethodology(e);return `<div class="gc-detail-grid"><div class="gc-detail"><small>Categoria</small><b>${esc(meta.icon+' '+meta.label)}</b></div><div class="gc-detail"><small>Data</small><b>${esc(e.date)}${e.start?' · '+esc(e.start)+(e.end?'–'+esc(e.end):''):''}</b></div><div class="gc-detail"><small>Local</small><b>${esc(e.location||'Não informado')}</b></div><div class="gc-detail"><small>Status</small><b>${esc(e.status)}</b></div></div>${e.description?`<div class="gc-method-box"><b>Descrição</b>${esc(e.description)}</div>`:''}<div class="gc-method-box"><b>Contribuições metodológicas</b>${methods.length?methods.map(x=>`<div class="gc-method-item"><strong>${esc(x.label)}</strong>${x.detail?`<br><span>${esc(x.detail)}</span>`:''}</div>`).join(''):'<span>Nenhum vínculo metodológico explícito localizado neste registro.</span>'}${e.methodologyAreas?.length?`<div class="gc-method-item"><strong>Ação conjunta:</strong> ${esc([...new Set(e.methodologyAreas)].join(' · '))}</div>`:''}</div><div class="gc-source-note">Origem: ${esc(e.source)}${e.planningId?' · planejamento '+esc(e.planningId):''}</div><div class="gc-actions"><button class="gc-btn primary" data-open-origin>Abrir planejamento / origem</button>${e.canEdit?'<button class="gc-btn" data-edit-date>Editar data</button><button class="gc-btn" data-remove-date>Remover/cancelar data</button>':''}</div>`;}
function openEvent(e){const m=modal(e.title,eventDetails(e));m.querySelector('[data-open-origin]').onclick=()=>{m.remove();location.hash=e.route.replace(/^#/,'')};if(e.canEdit){m.querySelector('[data-edit-date]').onclick=()=>editDate(e,m);m.querySelector('[data-remove-date]').onclick=()=>removeDate(e,m)}}
function dayList(date,events,selected){const rows=events.filter(e=>e.date===date&&selected.has(e.category));const m=modal(`Agenda de ${date}`,`<div class="gc-day-list">${rows.map(e=>`<div class="gc-list-item" data-day-event="${esc(e.source)}|${esc(e.id)}"><b>${esc((e.start?e.start+' · ':'')+e.title)}</b><small>${esc((CATEGORY_META[e.category]?.label||'Atividade')+(e.location?' · '+e.location:''))}</small></div>`).join('')}</div>`);m.querySelectorAll('[data-day-event]').forEach(x=>x.onclick=()=>{const [s,id]=x.dataset.dayEvent.split('|'),e=events.find(z=>z.source===s&&z.id===id);if(e){m.remove();openEvent(e)}})}

function replaceDateValue(value,newDate){if(!value)return newDate;if(isIsoDate(value))return newDate;const s=String(value);if(s.includes('T'))return newDate+s.slice(10);return newDate;}
async function editDate(e,parentModal){
  const body=`<form class="gc-edit-form" data-gc-edit-form><label>Nova data<input type="date" name="date" value="${esc(e.date)}" required></label>${e.start?`<label>Horário inicial<input type="time" name="start" value="${esc(e.start)}"></label>`:''}${e.end?`<label>Horário final<input type="time" name="end" value="${esc(e.end)}"></label>`:''}<button class="gc-btn primary">Salvar alteração</button></form>`;
  parentModal.querySelector('.gc-modal-body').innerHTML=body;const form=parentModal.querySelector('[data-gc-edit-form]');
  form.onsubmit=async ev=>{ev.preventDefault();const fd=new FormData(form),newDate=fd.get('date'),patch={};
    const row=e.row;
    if(['starts_at','scheduled_start'].includes(e.dateField)){
      const start=fd.get('start')||e.start||'00:00';const end=fd.get('end')||e.end||start;const startKey=e.dateField,endKey=e.endField||({starts_at:'ends_at',scheduled_start:'scheduled_end'}[startKey]);
      const offset='-03:00';patch[startKey]=`${newDate}T${start}:00${offset}`;if(endKey)patch[endKey]=`${newDate}T${end}:00${offset}`;
    }else{
      patch[e.dateField]=replaceDateValue(row[e.dateField],newDate);
      if(row.start_time!==undefined&&fd.get('start'))patch.start_time=fd.get('start');
      if(row.end_time!==undefined&&fd.get('end'))patch.end_time=fd.get('end');
    }
    const q=await client().from(e.source).update(patch).eq('id',e.id);if(q.error){alert(q.error.message);return}parentModal.remove();cached.loadedAt=0;lastRenderKey='';await renderCalendar(true);
  };
}
async function removeDate(e,parentModal){
  const message=e.source==='workshop_calendar'?`Confirmar cancelamento da aula ${e.id}? Horário registrado: ${e.row.start_time||'não informado'}–${e.row.end_time||'não informado'}. A duração registrada será excluída do valor da nota, preservando a aula para conferência. Nenhuma duração será estimada.`:'Remover/cancelar esta data no registro de origem?';
  if(!confirm(message))return;
  const patch={};
  if(e.source==='workshop_calendar')patch.status='cancelada';
  else if(e.source==='calendar_events')patch.status='cancelled';
  else if(e.source==='access_resource_bookings')patch.status='cancelado';
  else{patch[e.dateField]=null;if(e.row.start_time!==undefined)patch.start_time=null;if(e.row.end_time!==undefined)patch.end_time=null;}
  const q=await client().from(e.source).update(patch).eq('id',e.id);if(q.error){alert(q.error.message);return}parentModal.remove();cached.loadedAt=0;lastRenderKey='';await renderCalendar(true);
}

function printableRows(events,selected){return events.filter(e=>selected.has(e.category)).map(e=>{const m=CATEGORY_META[e.category]||CATEGORY_META.outro;return {date:e.date,time:e.start?(e.start+(e.end?'–'+e.end:'')):'—',title:e.title,category:m.label,location:e.location||'—',status:e.status||'—'}});}
function printHtml(month,events,selected){const rows=printableRows(events,selected);return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Agenda Geral CRJ ${esc(month)}</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#111}h1{font-size:18px;margin:0}p{margin:4px 0 14px;font-size:11px}table{width:100%;border-collapse:collapse;font-size:9.5px}th,td{border:1px solid #aaa;padding:5px;text-align:left;vertical-align:top}th{background:#f0f3f2}</style></head><body><h1>CRJ Cariacica · Agenda Geral</h1><p>${esc(monthTitle(month))} · ${rows.length} registro(s)</p><table><thead><tr><th>Data</th><th>Horário</th><th>Atividade</th><th>Categoria</th><th>Local</th><th>Status</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.date)}</td><td>${esc(r.time)}</td><td>${esc(r.title)}</td><td>${esc(r.category)}</td><td>${esc(r.location)}</td><td>${esc(r.status)}</td></tr>`).join('')}</tbody></table></body></html>`;}
function printAgenda(month,events,selected){const w=open('','_blank');if(!w)return;w.document.write(printHtml(month,events,selected));w.document.close();w.focus();setTimeout(()=>w.print(),250);}
async function docxAgenda(month,events,selected){
  const rows=printableRows(events,selected);const mod=await import('https://cdn.jsdelivr.net/npm/docx@9.5.1/+esm');const {Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,WidthType}=mod;
  const head=['Data','Horário','Atividade','Categoria','Local','Status'];const tableRows=[new TableRow({children:head.map(x=>new TableCell({children:[new Paragraph({children:[new TextRun({text:x,bold:true})]})]}))}),...rows.map(r=>new TableRow({children:[r.date,r.time,r.title,r.category,r.location,r.status].map(x=>new TableCell({children:[new Paragraph(String(x||''))]}))}))];
  const doc=new Document({sections:[{children:[new Paragraph({children:[new TextRun({text:'CRJ Cariacica · Agenda Geral',bold:true,size:30})]}),new Paragraph(monthTitle(month)),new Paragraph(''),new Table({rows:tableRows,width:{size:100,type:WidthType.PERCENTAGE}})]}]});
  const blob=await Packer.toBlob(doc),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`Agenda_Geral_CRJ_${month}.docx`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

function bindCalendar(data,selected){
  document.querySelector('[data-month-prev]')?.addEventListener('click',()=>setMonth(shiftMonth(data.month,-1)));
  document.querySelector('[data-month-next]')?.addEventListener('click',()=>setMonth(shiftMonth(data.month,1)));
  document.querySelector('[data-month-today]')?.addEventListener('click',()=>setMonth(monthKey(new Date())));
  document.querySelector('[data-gc-refresh]')?.addEventListener('click',()=>{cached.loadedAt=0;lastRenderKey='';renderCalendar(true)});
  document.querySelector('[data-gc-pdf]')?.addEventListener('click',()=>printAgenda(data.month,data.events,selected));
  document.querySelector('[data-gc-docx]')?.addEventListener('click',async b=>{const old=b.target.textContent;b.target.disabled=true;b.target.textContent='Gerando…';try{await docxAgenda(data.month,data.events,selected)}catch(err){alert(err.message||String(err))}finally{b.target.disabled=false;b.target.textContent=old}});
  document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{const s=new Set(selected);if(s.has(b.dataset.filter))s.delete(b.dataset.filter);else s.add(b.dataset.filter);setCategories(s)}));
  document.querySelectorAll('.gc-event').forEach(b=>{const e=data.events.find(x=>x.id===b.dataset.eventId&&x.source===b.dataset.source);if(!e)return;b.addEventListener('mouseenter',()=>openTooltip(e,b));b.addEventListener('mouseleave',closeTooltip);b.addEventListener('focus',()=>openTooltip(e,b));b.addEventListener('blur',closeTooltip);b.addEventListener('click',()=>{closeTooltip();openEvent(e)})});
  document.querySelectorAll('[data-day-more]').forEach(b=>b.addEventListener('click',()=>dayList(b.dataset.dayMore,data.events,selected)));
}

function schedule(){
  clearTimeout(schedule.t);schedule.t=setTimeout(async()=>{ensureMenu();markMenu();if(isRoute())await renderCalendar(false)},35);
}
function boot(){injectStyle();ensureMenu();observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});window.addEventListener('hashchange',()=>{lastRenderKey='';schedule()});schedule();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
