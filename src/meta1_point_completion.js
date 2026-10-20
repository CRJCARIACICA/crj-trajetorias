import { apiMode, supabaseClient } from './api.js?v=20261004-2';

const POINT_INDICATORS={
  'M1.1_CONTRATO':1,
  'M1.1_INFRA_DOC':1,
  'M1.2_EQUIPE_PERCENTUAL':100
};
let timer=null,cache=null,cacheAt=0;

const onGoals=()=>String(location.hash||'').split('?')[0]==='#metas';
const selectedMonth=()=>new URLSearchParams((location.hash.split('?')[1]||'')).get('month')||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date());
const monthLabel=value=>{
  const m=String(value||'').slice(0,7);
  if(!/^\d{4}-\d{2}$/.test(m))return m;
  const text=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${m}-01T12:00:00Z`));
  return text.charAt(0).toUpperCase()+text.slice(1);
};
const client=()=>apiMode()==='live'?supabaseClient():null;

async function completionMap(force=false){
  if(!force&&cache&&Date.now()-cacheAt<30000)return cache;
  const c=client();if(!c)return new Map();
  const codes=Object.keys(POINT_INDICATORS);
  const {data,error}=await c.from('indicator_events')
    .select('indicator_code,event_date,quantity')
    .in('indicator_code',codes)
    .order('event_date',{ascending:true});
  if(error)throw error;
  const map=new Map();
  for(const row of data||[]){
    if(map.has(row.indicator_code))continue;
    const target=POINT_INDICATORS[row.indicator_code]??1;
    if(Number(row.quantity||0)>=target)map.set(row.indicator_code,row);
  }
  cache=map;cacheAt=Date.now();return map;
}

function decorateCard(card,row,month){
  if(!card||!row)return;
  const completionMonth=String(row.event_date||'').slice(0,7);
  if(!completionMonth||completionMonth>month)return;
  const label=`Cumprida em ${monthLabel(completionMonth)}`;
  const topStatus=[...card.querySelectorAll('.gw-pill')].find(el=>/Meta concretizada|Risco de não atingir|Planejamento suficiente|Acompanhamento|Dentro do limite|Projeção acima/i.test(el.textContent||''));
  if(topStatus){
    topStatus.textContent=label;
    topStatus.classList.remove('warn','danger');
    topStatus.classList.add('ok');
  }
  const meta=card.querySelector('.gw-meta');
  if(meta&&!meta.querySelector('[data-meta1-completion]')){
    const span=document.createElement('span');
    span.className='gw-pill ok';span.dataset.meta1Completion='1';span.textContent=label;meta.appendChild(span);
  }
  const insight=card.querySelector('.gw-insight');
  if(insight){
    insight.classList.add('ok');
    insight.innerHTML=`<b>Etapa pontual já cumprida:</b> ${label}. Não é necessário repetir o preenchimento no mês selecionado; o histórico permanece vinculado à competência de comprovação.`;
  }
  card.dataset.meta1CompletedMonth=completionMonth;
}

async function apply(force=false){
  if(!onGoals())return;
  const map=await completionMap(force),month=selectedMonth();
  for(const [code,row] of map){
    const card=document.querySelector(`[data-gw-indicator="${CSS.escape(code)}"]`);
    decorateCard(card,row,month);
  }
}
function schedule(force=false){clearTimeout(timer);timer=setTimeout(()=>apply(force).catch(err=>console.warn('Meta 1 pontual:',err)),60)}

window.addEventListener('hashchange',()=>schedule(false));
window.addEventListener('focus',()=>schedule(true));
const root=document.querySelector('#app');
if(root)new MutationObserver(()=>{if(onGoals())schedule(false)}).observe(root,{childList:true,subtree:true});
schedule(true);

window.__crjMeta1PointCompletion={refresh:()=>schedule(true)};
