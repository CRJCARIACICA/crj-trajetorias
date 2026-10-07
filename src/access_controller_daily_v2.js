import { apiMode, supabaseClient } from './api.js?v=20261004-2';

let timer=null;
const localDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const localHour=()=>Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',hour:'2-digit',hour12:false}).format(new Date()));
const onRoute=()=>location.hash.split('?')[0]==='#controlador-acesso';
function shiftLabel(){const h=localHour();if(h>=10&&h<14)return '10h–14h';if(h>=14&&h<18)return '14h–18h';if(h>=18&&h<21)return '18h–21h';return 'Fora do horário de registro'}
function client(){return apiMode()==='live'?supabaseClient():null}

function decorate(){
  if(!onRoute())return;
  const root=document.querySelector('[data-access-controller-page]');if(!root)return;
  const dailyTab=root.querySelector('[data-ac-view="recepcao"]');if(dailyTab)dailyTab.textContent='Lista diária';
  const manual=root.querySelector('[data-ac-manual-presence]');if(manual){manual.textContent='+ Registrar no fluxo diário';manual.title='Abre o mesmo fluxo usado no dispositivo da recepção';}
  [...root.querySelectorAll('h3')].forEach(h=>{if(h.textContent.includes('Lista de Presença e Contato · Uso Livre'))h.textContent='Lista de Presença e Contato diária';if(h.textContent.includes('Prioridade das salas neste turno'))h.textContent='Ocupação dos espaços agora'});
  [...root.querySelectorAll('.ac-kpi span,.pill')].forEach(el=>{if(/07h.?12h|12h.?18h|Fora dos turnos de registro/.test(el.textContent||''))el.textContent=shiftLabel()});
}

async function refreshCurrentPresence(){
  if(!onRoute()||apiMode()!=='live')return;
  const root=document.querySelector('[data-access-controller-page]');if(!root)return;
  try{
    const c=client(),{data:list,error:le}=await c.from('access_daily_lists').select('id').eq('list_date',localDate()).maybeSingle();if(le||!list)return;
    const {data:rows,error}=await c.from('access_presence_records').select('id,exit_at,expected_exit_at').eq('list_id',list.id);if(error)return;
    const now=Date.now(),active=(rows||[]).filter(x=>!x.exit_at&&(!x.expected_exit_at||new Date(x.expected_exit_at).getTime()>now));
    const kpis=root.querySelectorAll('.ac-kpis .ac-kpi');
    if(kpis[1]){const b=kpis[1].querySelector('b'),s=kpis[1].querySelectorAll('span');if(b)b.textContent=String(active.length);if(s[0])s[0].textContent='Presentes agora';if(s[1])s[1].textContent=shiftLabel()}
  }catch(err){console.warn('Atualização da lista diária',err)}
}

function schedule(){clearTimeout(timer);timer=setTimeout(()=>{decorate();refreshCurrentPresence()},100)}
document.addEventListener('click',e=>{
  const btn=e.target.closest?.('[data-ac-manual-presence]');if(!btn||!onRoute())return;
  e.preventDefault();e.stopImmediatePropagation();
  const link=document.querySelector('[data-ac-public-link]')?.value;
  if(!link){alert('Abra a lista diária antes de iniciar um registro.');return}
  window.open(link,'_blank','noopener');
},true);
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
window.addEventListener('hashchange',schedule);window.addEventListener('focus',schedule);schedule();
