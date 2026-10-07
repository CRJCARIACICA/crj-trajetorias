import { apiMode, supabaseClient } from './api.js?v=20261004-2';

const CODES=['M2.1_ATENDIMENTOS','M2.3_ACESSO_PERCENTUAL','M6.1_EMPRESTIMOS'];
let me=null,busy=false,timer=null,lastLoadAt=0,cache=null;

const esc=(v='')=>String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const localDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const onRoute=()=>location.hash.split('?')[0]==='#controlador-acesso';
const c=()=>{if(apiMode()!=='live')throw new Error('Banco ainda não conectado.');return supabaseClient()};

const FALLBACK={
  presence:[
    {goal_stage:'2.1',indicator_code:'M2.1_ATENDIMENTOS',relation_mode:'count',counts_toward_indicator:true,quantity:1,rationale:'A presença diária no uso livre registra atendimento nominal do jovem. A regra do Controlador evita duplicidade por troca de sala ou renovação de permanência no mesmo dia.'},
    {goal_stage:'2.3',indicator_code:'M2.3_ACESSO_PERCENTUAL',relation_mode:'evidence',counts_toward_indicator:false,quantity:null,rationale:'A entrada registrada comprova acesso efetivo ao CRJ. Como a meta é percentual, o registro compõe a base de acesso do período sem somar um ponto percentual isoladamente.'}
  ],
  daily:[
    {goal_stage:'2.1',indicator_code:'M2.1_ATENDIMENTOS',relation_mode:'evidence',counts_toward_indicator:false,quantity:null,rationale:'A Lista de Presença e Contato diária consolida a evidência dos atendimentos nominais. A contagem acontece nos registros individuais.'},
    {goal_stage:'2.3',indicator_code:'M2.3_ACESSO_PERCENTUAL',relation_mode:'evidence',counts_toward_indicator:false,quantity:null,rationale:'A lista diária comprova o acesso efetivo de jovens ao CRJ e sustenta a aferição da Etapa 2.3.'}
  ],
  booking:[
    {goal_stage:'6.1',indicator_code:'M6.1_EMPRESTIMOS',relation_mode:'count',counts_toward_indicator:true,quantity:1,rationale:'Cada agendamento de sala ou empréstimo de equipamento corresponde ao indicador de empréstimos/agendamentos da Etapa 6.1. O Anexo 9 é a evidência documental vinculada.'}
  ],
  appointment:[
    {goal_stage:'2.1',indicator_code:'M2.1_ATENDIMENTOS',relation_mode:'support',counts_toward_indicator:false,quantity:null,rationale:'A solicitação aberta pelo Controlador encaminha o jovem para a Equipe Técnica. Ela apoia o fluxo da Etapa 2.1, mas só vira atendimento contabilizado quando o atendimento é efetivamente realizado.'}
  ]
};

function injectStyle(){
  if(document.querySelector('#access-methodology-style'))return;
  const s=document.createElement('style');
  s.id='access-methodology-style';
  s.textContent=`
  .ac-method-wrap{display:flex;gap:6px;flex-wrap:wrap;margin:7px 0 2px;align-items:center}
  .ac-method-chip{position:relative;display:inline-flex;align-items:center;gap:5px;padding:5px 8px;border-radius:999px;background:#eef7f4;border:1px solid #cfe2db;font-size:10px;line-height:1.2;color:#0b5b4c;cursor:help;outline:none;max-width:100%}
  .ac-method-chip.count{background:#e9f7ef;border-color:#aad8bb;color:#175b3c}.ac-method-chip.evidence{background:#f5f2ff;border-color:#d7cef5;color:#4b3a87}.ac-method-chip.support{background:#fff8e8;border-color:#ead7a9;color:#7b5a12}
  .ac-method-tip{display:none;position:absolute;z-index:2147483500;left:0;top:calc(100% + 7px);width:min(390px,84vw);padding:11px 12px;border-radius:11px;background:#14201d;color:#fff;box-shadow:0 12px 34px rgba(0,0,0,.26);font-size:11px;line-height:1.45;text-align:left;white-space:normal}
  .ac-method-chip:hover .ac-method-tip,.ac-method-chip:focus .ac-method-tip{display:block}
  .ac-method-tip b{color:#fff}.ac-method-tip .meta-line{display:block;margin-top:4px;color:#d7ebe4}.ac-method-tip .meta-ref{display:block;margin-top:6px;color:#b9cdc6;font-size:10px}
  .ac-method-inline{display:inline-flex;margin-left:7px;vertical-align:middle}.ac-method-inline .ac-method-wrap{display:inline-flex;margin:0}
  .ac-method-row{margin-top:5px}.ac-method-row .ac-method-wrap{margin:4px 0 0}
  .ac-table td .ac-method-wrap{margin-top:5px}
  @media(max-width:680px){.ac-method-tip{left:auto;right:0;width:min(360px,88vw)}}
  `;
  document.head.appendChild(s);
}

async function ready(){
  for(let i=0;i<70;i++){
    if(apiMode()==='live'){
      try{
        const cl=c(),{data:{user}}=await cl.auth.getUser();
        if(user){
          const {data,error}=await cl.from('profiles').select('id,display_name,role,active').eq('id',user.id).maybeSingle();
          if(error)throw error;
          me=data||null;
          return !!me?.active;
        }
      }catch{}
    }
    await new Promise(r=>setTimeout(r,120));
  }
  return false;
}

function statusText(row){
  if(row.counts_toward_indicator)return 'SOMA AO INDICADOR';
  if(row.relation_mode==='evidence')return 'EVIDÊNCIA DIRETA';
  return 'APOIA A META';
}
function modeOf(row){return row.counts_toward_indicator?'count':(row.relation_mode||'evidence')}
function metaLabel(row){const stage=String(row.goal_stage||'').trim();return stage?`Meta ${stage.split('.')[0]} · Etapa ${stage}`:'Vínculo metodológico'}
function linkWithCatalog(row,catalog){const meta=catalog.get(row.indicator_code)||{};return {...row,_indicator:meta}}
function methodologyHtml(rows=[],catalog=new Map()){
  if(!rows.length)return '';
  return `<span class="ac-method-wrap">${rows.map(raw=>{const row=linkWithCatalog(raw,catalog),meta=row._indicator||{},mode=modeOf(row);return `<span class="ac-method-chip ${esc(mode)}" tabindex="0">ⓘ ${esc(metaLabel(row))}<span class="ac-method-tip"><b>${esc(statusText(row))}</b><span class="meta-line">${row.indicator_code?`${esc(row.indicator_code)}${meta.label?' · '+esc(meta.label):''}`:'Vínculo sem indicador numérico'}</span><br>${esc(row.rationale||'Vínculo metodológico registrado.')}${row.quantity!=null?`<span class="meta-ref">Quantidade de referência deste registro: ${esc(row.quantity)}</span>`:''}${meta.target!=null?`<span class="meta-ref">Meta de referência: ${esc(meta.target)} ${esc(meta.unit||'')} · ${esc(meta.periodicity||'')}</span>`:''}</span></span>`}).join('')}</span>`;
}

async function loadRows(){
  const now=Date.now();
  if(cache&&now-lastLoadAt<5000)return cache;
  const cl=c(),today=localDate();
  const [{data:catalog,error:ce},{data:lists,error:le},{data:bookings,error:be},{data:requests,error:re}]=await Promise.all([
    cl.from('indicator_catalog').select('code,label,goal_stage,target,unit,periodicity').in('code',CODES),
    cl.from('access_daily_lists').select('id,list_date').order('list_date',{ascending:false}).limit(31),
    cl.from('access_resource_bookings').select('id,request_number,status,scheduled_start').order('scheduled_start',{ascending:false}).limit(120),
    cl.from('appointment_requests').select('id,title,updated_at,current_start,status').eq('requested_by',me.id).order('updated_at',{ascending:false}).limit(40)
  ]);
  for(const e of [ce,le,be,re])if(e)throw e;
  const todayList=(lists||[]).find(x=>x.list_date===today)||null;
  let presence=[];
  if(todayList){const pq=await cl.from('access_presence_records').select('id,entry_at').eq('list_id',todayList.id).order('entry_at');if(pq.error)throw pq.error;presence=pq.data||[];}
  const groups={presence,daily:lists||[],booking:bookings||[],appointment:requests||[]};
  const linkMaps={};
  for(const [kind,records] of Object.entries(groups)){
    const ids=records.map(x=>x.id);
    if(!ids.length){linkMaps[kind]=new Map();continue;}
    const sourceType={presence:'access_presence_records',daily:'access_daily_lists',booking:'access_resource_bookings',appointment:'appointment_requests'}[kind];
    const q=await cl.from('record_methodology_links').select('source_id,goal_stage,indicator_code,relation_mode,counts_toward_indicator,quantity,rationale').eq('source_type',sourceType).in('source_id',ids).order('created_at');
    if(q.error)throw q.error;
    const map=new Map();
    for(const l of q.data||[]){const arr=map.get(l.source_id)||[];arr.push(l);map.set(l.source_id,arr)}
    linkMaps[kind]=map;
  }
  cache={catalog:new Map((catalog||[]).map(x=>[x.code,x])),groups,links:linkMaps};
  lastLoadAt=now;
  return cache;
}

function cardByHeading(root,text){return [...root.querySelectorAll('.ac-card')].find(card=>[...card.querySelectorAll('h3')].some(h=>String(h.textContent||'').includes(text)))}
function addAfter(el,html,key){if(!el||!html)return;const host=el.parentElement||el;if(host.querySelector(`[data-ac-method="${key}"]`))return;const wrap=document.createElement('span');wrap.className='ac-method-inline';wrap.dataset.acMethod=key;wrap.innerHTML=html;el.insertAdjacentElement('afterend',wrap)}
function addBlock(host,html,key){if(!host||!html||host.querySelector(`:scope > [data-ac-method="${key}"]`))return;const wrap=document.createElement('div');wrap.className='ac-method-row';wrap.dataset.acMethod=key;wrap.innerHTML=html;host.appendChild(wrap)}
function linksFor(kind,id,data,fallbackKey=kind){return data.links[kind]?.get(id)||FALLBACK[fallbackKey]||[]}

function decorateActions(root,data){
  const cat=data.catalog;
  root.querySelectorAll('[data-ac-manual-presence]').forEach((b,i)=>addAfter(b,methodologyHtml(FALLBACK.presence,cat),`action-presence-${i}`));
  root.querySelectorAll('[data-ac-new-appointment]').forEach((b,i)=>addAfter(b,methodologyHtml(FALLBACK.appointment,cat),`action-appointment-${i}`));
  root.querySelectorAll('[data-ac-new-booking]').forEach((b,i)=>addAfter(b,methodologyHtml(FALLBACK.booking,cat),`action-booking-${i}`));
}

function decorateReception(root,data){
  const cat=data.catalog;
  const listCard=cardByHeading(root,'Lista de Presença');
  if(listCard)addBlock(listCard,methodologyHtml(FALLBACK.daily,cat),'daily-summary');
  const presenceCard=cardByHeading(root,'Presenças de hoje');
  if(!presenceCard)return;
  addBlock(presenceCard.querySelector('.ac-head')||presenceCard,methodologyHtml(FALLBACK.presence,cat),'presence-summary');
  const rows=[...presenceCard.querySelectorAll('tbody tr')].filter(r=>!r.querySelector('.ac-empty'));
  rows.forEach((tr,i)=>{const rec=data.groups.presence[i];if(!rec)return;const td=tr.querySelector('td');if(td)addBlock(td,methodologyHtml(linksFor('presence',rec.id,data),cat),`presence-${rec.id}`)});
}

function decorateAgenda(root,data){
  const cat=data.catalog;
  const openCard=cardByHeading(root,'Abertura de agendamento');
  if(openCard)addBlock(openCard,methodologyHtml(FALLBACK.appointment,cat),'appointment-summary');
  const card=cardByHeading(root,'Solicitações abertas por você');
  if(!card)return;
  const rows=[...card.querySelectorAll('.ac-row')];
  rows.forEach((row,i)=>{const rec=data.groups.appointment[i];if(!rec)return;addBlock(row.querySelector('div')||row,methodologyHtml(linksFor('appointment',rec.id,data),cat),`appointment-${rec.id}`)});
}

function decorateLoans(root,data){
  const cat=data.catalog;
  for(const title of ['Agendar sala','Empréstimo de equipamentos']){const card=cardByHeading(root,title);if(card)addBlock(card,methodologyHtml(FALLBACK.booking,cat),`booking-summary-${title}`)}
  const card=cardByHeading(root,'Agendamentos e empréstimos');
  if(!card)return;
  const rows=[...card.querySelectorAll('.ac-row')];
  rows.forEach((row,i)=>{const rec=data.groups.booking[i];if(!rec)return;let links=linksFor('booking',rec.id,data);if(rec.status==='cancelled'&&!data.links.booking?.get(rec.id))links=[{...FALLBACK.booking[0],relation_mode:'support',counts_toward_indicator:false,quantity:null,rationale:'O registro está cancelado. Ele permanece como histórico operacional, mas não deve ser tratado como empréstimo/agendamento válido para a Etapa 6.1.'}];addBlock(row.querySelector('div')||row,methodologyHtml(links,cat),`booking-${rec.id}`)});
}

function decorateDocuments(root,data){
  const cat=data.catalog;
  const listCard=cardByHeading(root,'Listas diárias');
  if(listCard){const docs=[...listCard.querySelectorAll('.ac-doc')];docs.forEach((doc,i)=>{const rec=data.groups.daily[i];if(rec)addBlock(doc,methodologyHtml(linksFor('daily',rec.id,data),cat),`doc-daily-${rec.id}`)})}
  const loanCard=cardByHeading(root,'Anexos de empréstimos');
  if(loanCard){const docs=[...loanCard.querySelectorAll('.ac-doc')];docs.forEach((doc,i)=>{const rec=data.groups.booking[i];if(!rec)return;const base=linksFor('booking',rec.id,data).map(x=>({...x,relation_mode:'evidence',counts_toward_indicator:false,quantity:null,rationale:'O Anexo 9 e o canhoto são a evidência documental do agendamento/empréstimo vinculado à Etapa 6.1. A contagem pertence ao registro operacional correspondente, evitando duplicidade pelo documento.'}));addBlock(doc,methodologyHtml(base,cat),`doc-booking-${rec.id}`)})}
}

async function decorate(){
  if(busy||!onRoute()||!me?.active)return;
  const root=document.querySelector('[data-access-controller-page]')||document.querySelector('.content');
  if(!root)return;
  busy=true;
  try{
    injectStyle();
    const data=await loadRows();
    decorateActions(root,data);
    decorateReception(root,data);
    decorateAgenda(root,data);
    decorateLoans(root,data);
    decorateDocuments(root,data);
  }catch(err){console.warn('Não foi possível carregar os vínculos metodológicos do Controlador:',err)}finally{busy=false}
}
function schedule(){clearTimeout(timer);timer=setTimeout(decorate,180)}

async function boot(){
  if(!(await ready()))return;
  injectStyle();
  window.addEventListener('hashchange',()=>{cache=null;lastLoadAt=0;schedule()});
  window.addEventListener('focus',()=>{cache=null;lastLoadAt=0;schedule()});
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
  schedule();
}
boot();
