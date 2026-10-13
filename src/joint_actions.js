import { apiMode, supabaseClient } from './api.js?v=20261004-2';

let me=null,observer=null,timer=null,busy=false,lastKey='';
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const fmtDate=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const time5=v=>String(v||'').slice(0,5);
const c=()=>{if(apiMode()!=='live')throw new Error('Banco ainda não conectado.');return supabaseClient()};

const AREA_LABELS={technical:'Equipe Técnica',pvida:'PVida',ptrampo:'PTrampo',cfdh:'CFDH',workshop:'Oficinas',educator:'Educadores',articulation:'Articulação'};
const SOURCE_LABELS={technical_action_plans:'Equipe Técnica',cfdh_actions:'CFDH',workshop_plan_lessons:'Oficina',educator_plans:'Educador',articulation_actions:'Articulação'};

function areaFromRoute(){
  const path=(location.hash||'#dashboard').split('?')[0].replace(/^#/,'').split('/')[0];
  if(path==='equipe-tecnica')return 'technical';
  if(path==='cfdh')return 'cfdh';
  if(path==='articulacao'||path==='planos-mobilizacao')return 'articulation';
  if(path==='oficineiro'||path==='oficinas'||path==='oficina'||path==='workshops')return 'workshop';
  if(path==='educador'||path==='planejamento-educador')return 'educator';
  if(document.querySelector('#technical-program-actions'))return 'technical';
  if(document.querySelector('[data-plan-lesson],.workshop-plan-table'))return 'workshop';
  return null;
}

function css(){
  if(document.querySelector('#joint-actions-style'))return;
  const s=document.createElement('style');s.id='joint-actions-style';s.textContent=`
  .ja-tabs{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin:12px 0}.ja-tab{border:1px solid var(--line,#dfe7e5);background:#fff;border-radius:999px;padding:8px 12px;font-weight:750;cursor:pointer}.ja-tab.active{background:var(--brand,#0b5b4c);color:#fff;border-color:var(--brand,#0b5b4c)}
  .ja-panel{border:1px solid #cfe2dc;background:#f8fcfa;border-radius:16px;padding:14px;margin:0 0 16px}.ja-panel[hidden]{display:none}.ja-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.ja-head h3,.ja-group h4,.ja-card h5{margin:0}.ja-muted{color:var(--muted,#687671);font-size:12px}.ja-section{margin-top:14px}.ja-section-title{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px}.ja-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.ja-card{background:#fff;border:1px solid #dfe7e5;border-radius:13px;padding:12px}.ja-card.changed{border-color:#e0b85b;background:#fffdf7}.ja-card.synced{border-color:#b9d9ce}.ja-meta,.ja-actions,.ja-evidence-list{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.ja-pill{display:inline-flex;align-items:center;border-radius:999px;padding:4px 7px;background:#edf4f2;font-size:10px}.ja-pill.ok{background:#e7f7ee;color:#17633f}.ja-pill.warn{background:#fff2d1;color:#755100}.ja-pill.info{background:#eaf2ff;color:#2b5687}.ja-evidence{display:flex;gap:6px;align-items:center;border:1px solid #e4ebe8;border-radius:9px;padding:6px 8px;background:#fff;font-size:11px}.ja-group{margin-top:13px;padding-top:12px;border-top:1px dashed #cfdcd7}.ja-group:first-child{border-top:0;padding-top:0}.ja-empty{padding:16px;text-align:center;color:#687671;border:1px dashed #d7e2de;border-radius:11px}.ja-inline{display:inline-flex;gap:5px;align-items:center;margin:7px 0 0 6px;flex-wrap:wrap}.ja-inline button{font-size:11px!important;padding:5px 8px!important}.ja-inline .ja-pill{font-size:9px}
  .ja-print-head{display:none}
  @media(max-width:760px){.ja-grid{grid-template-columns:1fr}}
  `;document.head.appendChild(s);
}

async function profile(){
  if(me)return me;
  for(let i=0;i<70&&apiMode()!=='live';i++)await new Promise(r=>setTimeout(r,100));
  if(apiMode()!=='live')return null;
  const cl=c(),{data:{user}}=await cl.auth.getUser();if(!user)return null;
  const {data,error}=await cl.from('profiles').select('id,display_name,role,team,active').eq('id',user.id).maybeSingle();if(error)throw error;
  me=data||null;return me;
}

async function load(area){
  const cl=c();
  const {data:links,error:lErr}=await cl.from('joint_action_links').select('*').eq('area_code',area).order('created_at',{ascending:false});if(lErr)throw lErr;
  const ids=[...new Set((links||[]).map(x=>x.action_id))];
  if(!ids.length)return {links:[],actions:[],evidences:[]};
  const [aq,eq]=await Promise.all([
    cl.from('joint_actions').select('*').in('id',ids).order('action_date',{ascending:false,nullsFirst:false}).order('start_time',{ascending:true,nullsFirst:false}),
    cl.from('joint_action_evidences').select('*').in('action_id',ids).order('created_at',{ascending:false})
  ]);
  if(aq.error)throw aq.error;if(eq.error)throw eq.error;
  return {links:links||[],actions:aq.data||[],evidences:eq.data||[]};
}

function actionLinks(action,data){return data.links.filter(x=>x.action_id===action.id)}
function actionEvidence(action,data){return data.evidences.filter(x=>x.action_id===action.id)}
function syncState(a){
  if(!a.action_date||!a.start_time||!a.end_time)return {key:'incomplete',label:'Defina data e horário para enviar',button:'Enviar para a agenda',disabled:true};
  if(!a.calendar_event_id||!a.agenda_sent_fingerprint)return {key:'new',label:'Ainda não enviado para a agenda',button:'Enviar para a agenda compartilhada',disabled:false};
  if(a.agenda_sent_fingerprint===a.current_fingerprint)return {key:'synced',label:'Já enviado para a agenda',button:'Já enviado para a agenda',disabled:true};
  return {key:'changed',label:'Alterações feitas ainda não enviadas para a agenda',button:'Enviar alterações para a agenda',disabled:false};
}
function actionSubcategory(action,data,area){const own=actionLinks(action,data).filter(x=>x.area_code===area);return own[0]?.subcategory||AREA_LABELS[area]||area}
function isJoint(action,data){return new Set(actionLinks(action,data).map(x=>x.area_code)).size>1}
function hasAttendance(a,data){return actionEvidence(a,data).some(e=>e.evidence_type==='attendance')}

function evidenceHtml(a,data){
  const rows=actionEvidence(a,data);if(!rows.length)return '<span class="ja-muted">Nenhuma evidência registrada ainda.</span>';
  return rows.map(e=>`<span class="ja-evidence"><b>${esc(e.title)}</b>${e.submission_id?`<button class="btn ghost" type="button" data-crj-evidence-action="pdf" data-evidence-submission-id="${esc(e.submission_id)}">PDF</button><button class="btn ghost" type="button" data-crj-evidence-action="print" data-evidence-submission-id="${esc(e.submission_id)}">Imprimir</button>`:''}</span>`).join('');
}

function card(a,data,{agenda=true}={}){
  const state=syncState(a),links=actionLinks(a,data),areas=[...new Set(links.map(x=>AREA_LABELS[x.area_code]||x.area_code))];
  return `<article class="ja-card ${state.key==='synced'?'synced':state.key==='changed'?'changed':''}" data-ja-card="${esc(a.id)}"><div class="ja-head"><div><h5>${esc(a.title)}</h5><div class="ja-muted">${esc(SOURCE_LABELS[a.source_type]||a.source_type)} · ${esc(fmtDate(a.action_date))}${a.start_time?' · '+esc(time5(a.start_time)):''}${a.end_time?'–'+esc(time5(a.end_time)):''}</div></div><span class="ja-pill ${state.key==='synced'?'ok':state.key==='changed'?'warn':'info'}">${esc(state.label)}</span></div><div class="ja-meta">${areas.map(x=>`<span class="ja-pill">${esc(x)}</span>`).join('')}${a.location?`<span class="ja-pill">${esc(a.location)}</span>`:''}</div><div class="ja-actions">${agenda?`<button class="btn ${state.key==='changed'?'primary':'secondary'}" type="button" data-ja-send="${esc(a.id)}" ${state.disabled?'disabled':''}>${esc(state.button)}</button>`:''}${hasAttendance(a,data)?`<button class="btn secondary" type="button" data-ja-print-attendance="${esc(a.id)}">Imprimir lista de presença</button>`:''}<button class="btn ghost" type="button" data-ja-toggle-evidence="${esc(a.id)}">Evidências (${actionEvidence(a,data).length})</button></div><div class="ja-evidence-list" data-ja-evidence="${esc(a.id)}" hidden>${evidenceHtml(a,data)}</div></article>`;
}

function panelHtml(area,data){
  const dated=data.actions.filter(a=>a.action_date&&a.start_time&&a.end_time);
  const joint=data.actions.filter(a=>isJoint(a,data));
  const groups=new Map();for(const a of joint){const k=actionSubcategory(a,data,area);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(a)}
  return `<div class="ja-tabs" data-ja-tabs><button class="ja-tab" type="button" data-ja-open><span>Ações conjuntas</span> <b>${joint.length}</b></button></div><section class="ja-panel" data-ja-panel hidden><div class="ja-head"><div><h3>Ações conjuntas · ${esc(AREA_LABELS[area]||area)}</h3><div class="ja-muted">Uma mesma execução pode aparecer em várias áreas, mas a evidência e a contagem de origem permanecem únicas. As subcategorias abaixo facilitam o controle das metas.</div></div><button class="btn ghost" type="button" data-ja-close>Fechar</button></div><div class="ja-section"><div class="ja-section-title"><b>Agenda dos planejamentos</b><span class="ja-muted">${dated.length} item(ns) com data e horário</span></div><div class="ja-grid">${dated.map(a=>card(a,data,{agenda:true})).join('')||'<div class="ja-empty">Nenhum planejamento desta área possui data e horário completos.</div>'}</div></div><div class="ja-section"><div class="ja-section-title"><b>Evidências de ações vinculadas</b><span class="ja-muted">agrupadas por subcategoria</span></div>${[...groups.entries()].map(([name,rows])=>`<div class="ja-group"><h4>${esc(name)}</h4><div class="ja-grid" style="margin-top:8px">${rows.map(a=>card(a,data,{agenda:false})).join('')}</div></div>`).join('')||'<div class="ja-empty">Ainda não há ações vinculadas simultaneamente a esta área e a outra categoria.</div>'}</div></section>`;
}

function hostForArea(){return document.querySelector('.content')||document.querySelector('#app')}
function insertPanel(area,data){
  document.querySelectorAll('[data-ja-tabs],[data-ja-panel]').forEach(x=>x.remove());
  const host=hostForArea();if(!host)return;
  const wrap=document.createElement('div');wrap.innerHTML=panelHtml(area,data);
  const head=host.querySelector('.page-head,.tpa-shell .tpa-head,.ip-hero,.art-head');
  const tab=wrap.firstElementChild,panel=wrap.lastElementChild;
  if(head){head.insertAdjacentElement('afterend',tab);tab.insertAdjacentElement('afterend',panel)}else{host.prepend(panel);host.prepend(tab)}
  bind(host,area,data);decorateInline(host,data);
}

function decorateInline(root,data){
  const titles=[...root.querySelectorAll('h3,h4,h5,.ip-task-title')];
  for(const a of data.actions.filter(x=>x.action_date&&x.start_time&&x.end_time)){
    const t=norm(a.title);if(!t)continue;
    const title=titles.find(x=>norm(x.textContent)===t||norm(x.textContent).includes(t));if(!title)continue;
    const cardRoot=title.closest('.tpa-card,.ip-plan,.ip-lesson,.art-item,.card,[data-plan-lesson]')||title.parentElement;if(!cardRoot||cardRoot.querySelector(`[data-ja-inline="${CSS.escape(a.id)}"]`))continue;
    const state=syncState(a),box=document.createElement('div');box.className='ja-inline';box.dataset.jaInline=a.id;
    box.innerHTML=`<span class="ja-pill ${state.key==='synced'?'ok':state.key==='changed'?'warn':'info'}">${esc(state.label)}</span><button class="btn secondary" type="button" data-ja-send="${esc(a.id)}" ${state.disabled?'disabled':''}>${esc(state.button)}</button>`;
    const actions=cardRoot.querySelector('.tpa-actions,.ip-actions,.actions')||cardRoot;actions.appendChild(box);
  }
}

async function send(actionId,button){
  button.disabled=true;const old=button.textContent;button.textContent='Enviando...';
  try{const {error}=await c().rpc('send_joint_action_to_agenda',{p_action_id:actionId});if(error)throw error;toast('Planejamento enviado para a Agenda Compartilhada.');lastKey='';await render(true)}catch(err){toast(err.message||String(err),'danger');button.disabled=false;button.textContent=old}
}

async function printAttendance(actionId){
  const {data,error}=await c().rpc('joint_action_attendance_rows',{p_action_id:actionId});if(error)throw error;
  const rows=data||[];if(!rows.length)throw new Error('Esta ação ainda não possui presenças registradas.');
  const action=document.querySelector(`[data-ja-card="${CSS.escape(actionId)}"] h5`)?.textContent||'Ação';
  const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Lista de presença</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;color:#111}h1{font-size:16px;margin:0 0 4px}p{font-size:11px;margin:0 0 12px}table{width:100%;border-collapse:collapse;font-size:9px}th,td{border:1px solid #222;padding:5px;text-align:left}th{background:#f2f2f2}.sig{min-width:130px;height:24px}</style></head><body><h1>CRJ Cariacica · Lista de Presença e Contato</h1><p><b>Ação:</b> ${esc(action)} · <b>Total:</b> ${rows.length}</p><table><thead><tr><th>#</th><th>Nome completo</th><th>Assinatura</th><th>Data nasc.</th><th>CPF</th><th>Telefone</th><th>E-mail</th></tr></thead><tbody>${rows.map((y,i)=>`<tr><td>${i+1}</td><td>${esc(y.full_name||'')}</td><td class="sig"></td><td>${esc(y.birth_date?fmtDate(y.birth_date):'')}</td><td>${esc(y.cpf||'')}</td><td>${esc(y.phone||'')}</td><td>${esc(y.email||'')}</td></tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`;
  const w=window.open('','_blank','noopener,noreferrer');if(!w)throw new Error('O navegador bloqueou a janela de impressão.');w.document.open();w.document.write(html);w.document.close();
}

function toast(message,type='success'){const e=document.createElement('div');e.className=`pill ${type}`;e.textContent=message;Object.assign(e.style,{position:'fixed',right:'20px',bottom:'20px',zIndex:'2147483647',padding:'12px 16px',boxShadow:'0 10px 35px rgba(0,0,0,.22)',background:type==='danger'?'#8a2f2f':'#174f43',color:'#fff'});document.body.appendChild(e);setTimeout(()=>e.remove(),3600)}

function bind(root,area,data){
  const tab=root.querySelector('[data-ja-open]'),panel=root.querySelector('[data-ja-panel]');
  tab?.addEventListener('click',()=>{panel.hidden=!panel.hidden;tab.classList.toggle('active',!panel.hidden)});
  root.querySelector('[data-ja-close]')?.addEventListener('click',()=>{panel.hidden=true;tab?.classList.remove('active')});
  root.querySelectorAll('[data-ja-send]').forEach(b=>{if(b.dataset.jaBound)return;b.dataset.jaBound='1';b.addEventListener('click',()=>send(b.dataset.jaSend,b))});
  root.querySelectorAll('[data-ja-toggle-evidence]').forEach(b=>b.addEventListener('click',()=>{const x=root.querySelector(`[data-ja-evidence="${CSS.escape(b.dataset.jaToggleEvidence)}"]`);if(x)x.hidden=!x.hidden}));
  root.querySelectorAll('[data-ja-print-attendance]').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{await printAttendance(b.dataset.jaPrintAttendance)}catch(err){toast(err.message||String(err),'danger')}finally{b.disabled=false}}));
}

async function render(force=false){
  const area=areaFromRoute();if(!area||busy)return;
  const p=await profile();if(!p?.active)return;
  const key=`${area}:${location.hash}`;if(!force&&lastKey===key&&document.querySelector('[data-ja-tabs]'))return;
  busy=true;try{css();const data=await load(area);if(area!==areaFromRoute())return;insertPanel(area,data);lastKey=key}catch(err){console.warn('Ações conjuntas indisponíveis:',err)}finally{busy=false}
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>render().catch(()=>{}),120)}
observer=new MutationObserver(()=>{if(areaFromRoute())schedule()});observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>{lastKey='';schedule()});window.addEventListener('focus',schedule);
schedule();
