import { apiMode, supabaseClient } from './api.js?v=20261015-1';
import { CONFIG } from './config.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let scheduled=false,observer=null,workshopCache=null;

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

async function client(){
  for(let i=0;i<120;i++){
    if(apiMode()==='live')return supabaseClient();
    await sleep(50);
  }
  throw new Error('Banco ainda não conectado.');
}

function routeName(){return String(location.hash||'#dashboard').split('?')[0].replace(/^#/,'').split('/')[0]||'dashboard'}
function routeParams(){return new URLSearchParams((location.hash.split('?')[1]||''))}
function monthSp(){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).formatToParts(new Date()).map(x=>[x.type,x.value]));
  return `${parts.year}-${parts.month}`;
}
function shiftMonth(month,delta){
  const [y,m]=String(month).split('-').map(Number),d=new Date(Date.UTC(y,m-1+delta,1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
}
function monthLabel(month){
  const [y,m]=String(month).split('-').map(Number);
  if(!y||!m)return month;
  const txt=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,1)));
  return txt.charAt(0).toUpperCase()+txt.slice(1);
}

function ensureStyle(){
  if(document.querySelector('#workshop-plan-export-style'))return;
  const s=document.createElement('style');s.id='workshop-plan-export-style';s.textContent=`
  .wpe-preview-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-left:auto}.wpe-preview-actions .btn{font-size:11px;padding:6px 8px;white-space:nowrap}
  .wpe-month-btn{white-space:normal;text-align:center}.wpe-fallback{margin-top:14px}.wpe-fallback-list{display:grid;gap:9px;margin-top:10px}.wpe-fallback-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid var(--border,#e2e8e5)}
  .wpe-modal-bg{position:fixed;inset:0;z-index:2147483400;background:rgba(5,18,22,.68);backdrop-filter:blur(4px);display:grid;place-items:center;padding:16px}.wpe-modal{width:min(720px,96vw);max-height:94vh;overflow:auto;background:#fff;border-radius:17px;box-shadow:0 28px 90px rgba(0,0,0,.35)}.wpe-modal header,.wpe-modal .wpe-body,.wpe-modal footer{padding:16px 18px}.wpe-modal header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border-bottom:1px solid #e3e9e7}.wpe-modal header h3{margin:0 0 3px}.wpe-modal header p{margin:0;color:#65736f;font-size:12px}.wpe-close{border:0;background:transparent;font-size:27px;cursor:pointer}.wpe-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}.wpe-option{display:grid;gap:5px;padding:12px;border:1px solid #dce6e2;border-radius:12px;background:#fff;cursor:pointer}.wpe-option:has(input:checked){border-color:#4c9f89;background:#f1faf6}.wpe-option small{color:#687570}.wpe-other{margin-top:12px}.wpe-status{margin-top:12px}.wpe-modal footer{position:sticky;bottom:0;background:#fff;border-top:1px solid #e3e9e7;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
  @media(max-width:720px){.wpe-options{grid-template-columns:1fr}.wpe-fallback-row{align-items:flex-start;flex-direction:column}.wpe-fallback-row .btn{width:100%}}
  `;document.head.appendChild(s);
}

async function officialPlanResponse(planId,format='pdf'){
  if(!UUID_RE.test(String(planId||'')))throw new Error('Planejamento não identificado.');
  const cl=await client(),{data:{session}}=await cl.auth.getSession();
  if(!session)throw new Error('Sessão expirada. Entre novamente no sistema.');
  const res=await fetch(`${CONFIG.supabaseUrl}/functions/v1/crj-export-document-safe`,{
    method:'POST',
    headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json',apikey:CONFIG.supabasePublishableKey},
    body:JSON.stringify({plan_id:planId,format})
  });
  if(!res.ok){let msg='Falha ao gerar o planejamento.';try{msg=(await res.json()).error||msg}catch{}throw new Error(msg)}
  if(res.headers.get('x-crj-layout-source')!=='official-canonical'||res.headers.get('x-crj-layout-contract')!=='official-preview-v1')throw new Error('O gerador não confirmou o layout oficial do planejamento.');
  return res;
}
function fileName(res,format){
  const cd=res.headers.get('content-disposition')||'',utf=cd.match(/filename\*=UTF-8''([^;]+)/i)?.[1],plain=cd.match(/filename="([^"]+)"/i)?.[1];
  if(utf){try{return decodeURIComponent(utf)}catch{}}
  return plain||`planejamento-oficina.${format}`;
}
async function downloadPlan(planId,format='pdf'){
  const res=await officialPlanResponse(planId,format),blob=await res.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=fileName(res,format);document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
async function printPlan(planId){
  const res=await officialPlanResponse(planId,'pdf'),blob=await res.blob(),url=URL.createObjectURL(blob),frame=document.createElement('iframe');
  frame.setAttribute('aria-hidden','true');Object.assign(frame.style,{position:'fixed',right:'0',bottom:'0',width:'1px',height:'1px',border:'0',opacity:'0',pointerEvents:'none'});document.body.appendChild(frame);
  const cleanup=()=>{try{frame.remove()}catch{};URL.revokeObjectURL(url)};
  frame.onload=()=>setTimeout(()=>{try{frame.contentWindow?.focus();frame.contentWindow?.print();setTimeout(cleanup,60000)}catch{try{frame.remove()}catch{};const win=window.open(url,'_blank','noopener,noreferrer');if(!win){URL.revokeObjectURL(url);alert('O navegador bloqueou a janela de impressão. Libere pop-ups para este sistema.')}else setTimeout(()=>URL.revokeObjectURL(url),60000)}},400);
  frame.src=url;
}

function planFormFor(el){
  return el?.closest?.('form#workshop-plan-form')||el?.closest?.('[data-workshop-plan-workspace]')?.closest?.('form')||document.querySelector('#workshop-plan-form');
}
function planIdFor(el){
  const form=planFormFor(el),direct=form?.dataset?.planId||form?.getAttribute?.('data-plan-id')||'';
  if(UUID_RE.test(direct))return direct;
  const node=form?.querySelector?.('[data-plan-id]');
  const nested=node?.dataset?.planId||'';
  return UUID_RE.test(nested)?nested:null;
}
function previewButton(label,action,planId){
  const b=document.createElement('button');b.type='button';b.className='btn secondary';b.dataset.wpePlanAction=action;b.dataset.wpePlanId=planId||'';b.textContent=label;return b;
}
function decoratePlanPreview(){
  const form=document.querySelector('#workshop-plan-form');if(!form)return;
  const planId=planIdFor(form);
  form.querySelectorAll('.methodology-preview-toolbar').forEach(toolbar=>{
    toolbar.dataset.crjEvidenceExports='1';
    toolbar.querySelectorAll('.crj-evidence-export-actions').forEach(x=>x.remove());
    let box=toolbar.querySelector('.wpe-preview-actions');
    if(!box){box=document.createElement('div');box.className='wpe-preview-actions';toolbar.appendChild(box)}
    box.innerHTML='';
    const pdf=previewButton('Baixar PDF','pdf',planId),docx=previewButton('Baixar DOCX','docx',planId),print=previewButton('Imprimir','print',planId);
    if(!planId){for(const b of [pdf,docx,print]){b.disabled=true;b.title='Salve o planejamento uma vez para gerar o documento oficial.'}}
    box.append(pdf,docx,print);
  });
}
async function runPlanAction(button){
  const action=button.dataset.wpePlanAction||button.dataset.crjEvidenceAction,planId=button.dataset.wpePlanId||planIdFor(button);
  if(!UUID_RE.test(String(planId||''))){alert('Salve o planejamento uma vez antes de gerar o documento oficial.');return}
  const old=button.textContent;button.disabled=true;button.textContent=action==='print'?'Preparando impressão...':'Gerando...';
  try{if(action==='print')await printPlan(planId);else await downloadPlan(planId,action)}catch(e){alert(e.message||String(e))}finally{button.disabled=false;button.textContent=old}
}

document.addEventListener('click',e=>{
  const own=e.target.closest?.('[data-wpe-plan-action]');
  if(own){e.preventDefault();e.stopImmediatePropagation();runPlanAction(own);return}
  const generic=e.target.closest?.('[data-crj-evidence-action]');
  if(generic&&planFormFor(generic)?.id==='workshop-plan-form'){
    e.preventDefault();e.stopImmediatePropagation();runPlanAction(generic);
  }
},true);

async function listWorkshops(){
  if(workshopCache)return workshopCache;
  const q=await (await client()).from('workshops').select('id,name,active').eq('active',true).order('name');
  if(q.error)throw q.error;workshopCache=q.data||[];return workshopCache;
}
function findCardForWorkshop(host,name){
  const target=norm(name),cards=[...host.querySelectorAll('.card')];
  return cards.find(card=>{
    const heading=card.querySelector('h2,h3,h4');
    return heading&&norm(heading.textContent)===target&&!card.classList.contains('wpe-fallback');
  })||null;
}
function addMonthlyButton(card,w){
  if(card.querySelector(`[data-wpe-month-download="${w.id}"]`))return true;
  let actions=card.querySelector('.page-head .actions')||card.querySelector('.actions');
  if(!actions){actions=document.createElement('div');actions.className='actions';actions.style.marginTop='10px';card.appendChild(actions)}
  const b=document.createElement('button');b.type='button';b.className='btn secondary wpe-month-btn';b.dataset.wpeMonthDownload=w.id;b.dataset.wpeWorkshopName=w.name;b.textContent='Baixar planejamento do mês';actions.appendChild(b);return true;
}
async function decorateWorkshopPlanningList(){
  if(routeName()!=='oficinas'||routeParams().get('view')!=='planejamento')return;
  const host=document.querySelector('.content');if(!host)return;
  const workshops=await listWorkshops(),missing=[];
  for(const w of workshops){const card=findCardForWorkshop(host,w.name);if(card)addMonthlyButton(card,w);else missing.push(w)}
  host.querySelector('.wpe-fallback')?.remove();
  if(missing.length){
    const box=document.createElement('div');box.className='card wpe-fallback';box.innerHTML=`<h3>Baixar planejamento por oficina</h3><p class="muted">Escolha a oficina e depois o mês do planejamento concluído.</p><div class="wpe-fallback-list">${missing.map(w=>`<div class="wpe-fallback-row"><div><b>${esc(w.name)}</b></div><button class="btn secondary wpe-month-btn" type="button" data-wpe-month-download="${esc(w.id)}" data-wpe-workshop-name="${esc(w.name)}">Baixar planejamento do mês</button></div>`).join('')}</div>`;
    host.appendChild(box);
  }
}
async function planAvailability(workshopId){
  const q=await (await client()).from('workshop_monthly_plans').select('id,plan_month,status,updated_at').eq('workshop_id',workshopId).order('plan_month',{ascending:false}).order('updated_at',{ascending:false});
  if(q.error)throw q.error;return q.data||[];
}
async function resolveFinishedPlan(workshopId,month){
  const q=await (await client()).from('workshop_monthly_plans').select('id,status,plan_month,updated_at').eq('workshop_id',workshopId).eq('plan_month',month+'-01').order('updated_at',{ascending:false}).limit(1).maybeSingle();
  if(q.error)throw q.error;
  if(!q.data)throw new Error(`Não existe planejamento para ${monthLabel(month)} nesta oficina.`);
  if(q.data.status!=='finalizado')throw new Error(`O planejamento de ${monthLabel(month)} existe, mas ainda está como ${q.data.status||'rascunho'}. Conclua o planejamento antes do download.`);
  return q.data;
}
function closeModal(){document.querySelector('#wpe-modal')?.remove()}
async function openMonthModal(workshopId,name){
  closeModal();ensureStyle();
  const current=monthSp(),next=shiftMonth(current,1),rows=await planAvailability(workshopId),byMonth=new Map();
  for(const r of rows){const m=String(r.plan_month||'').slice(0,7);if(!byMonth.has(m))byMonth.set(m,r)}
  const badge=m=>{const r=byMonth.get(m);return r?.status==='finalizado'?'Concluído':r?.status?`Status: ${r.status}`:'Sem planejamento'};
  const bg=document.createElement('div');bg.id='wpe-modal';bg.className='wpe-modal-bg';bg.innerHTML=`<div class="wpe-modal" role="dialog" aria-modal="true"><header><div><h3>Baixar planejamento do mês</h3><p>${esc(name||'Oficina')} · escolha a competência que deseja baixar.</p></div><button type="button" class="wpe-close" data-wpe-close>×</button></header><div class="wpe-body"><div class="wpe-options"><label class="wpe-option"><input type="radio" name="wpe_period" value="current" checked><b>Mês atual</b><span>${esc(monthLabel(current))}</span><small>${esc(badge(current))}</small></label><label class="wpe-option"><input type="radio" name="wpe_period" value="next"><b>Mês seguinte</b><span>${esc(monthLabel(next))}</span><small>${esc(badge(next))}</small></label><label class="wpe-option"><input type="radio" name="wpe_period" value="other"><b>Outro mês</b><span>Escolher competência</span><small>Use para meses anteriores ou futuros.</small></label></div><div class="field wpe-other" data-wpe-other hidden><label>Outro mês</label><input class="input" type="month" data-wpe-month value="${esc(current)}"></div><div class="notice info wpe-status" data-wpe-status><b>Regra:</b> somente planejamentos com status concluído/finalizado podem ser baixados por este atalho.</div></div><footer><button type="button" class="btn secondary" data-wpe-close>Cancelar</button><button type="button" class="btn secondary" data-wpe-format="docx">Baixar DOCX</button><button type="button" class="btn primary" data-wpe-format="pdf">Baixar PDF</button></footer></div>`;
  document.body.appendChild(bg);
  const radios=[...bg.querySelectorAll('[name="wpe_period"]')],other=bg.querySelector('[data-wpe-other]'),monthInput=bg.querySelector('[data-wpe-month]'),status=bg.querySelector('[data-wpe-status]');
  const chosen=()=>{const v=radios.find(x=>x.checked)?.value;return v==='next'?next:v==='other'?monthInput.value:current};
  const sync=()=>{const otherOn=radios.find(x=>x.checked)?.value==='other';other.hidden=!otherOn;if(otherOn)setTimeout(()=>monthInput.focus(),0)};
  radios.forEach(r=>r.addEventListener('change',sync));sync();
  bg.querySelectorAll('[data-wpe-close]').forEach(b=>b.onclick=closeModal);bg.onclick=e=>{if(e.target===bg)closeModal()};
  bg.querySelectorAll('[data-wpe-format]').forEach(b=>b.onclick=async()=>{
    const month=chosen();if(!/^\d{4}-\d{2}$/.test(month)){status.className='notice danger wpe-status';status.textContent='Escolha um mês válido.';return}
    const old=b.textContent;b.disabled=true;b.textContent='Gerando...';status.className='notice info wpe-status';status.textContent=`Procurando planejamento concluído de ${monthLabel(month)}...`;
    try{const plan=await resolveFinishedPlan(workshopId,month);await downloadPlan(plan.id,b.dataset.wpeFormat);status.className='notice success wpe-status';status.textContent=`Planejamento de ${monthLabel(month)} gerado com sucesso.`}catch(e){status.className='notice danger wpe-status';status.textContent=e.message||String(e)}finally{b.disabled=false;b.textContent=old}
  });
}

document.addEventListener('click',e=>{
  const b=e.target.closest?.('[data-wpe-month-download]');if(!b)return;e.preventDefault();e.stopPropagation();openMonthModal(b.dataset.wpeMonthDownload,b.dataset.wpeWorkshopName).catch(err=>alert(err.message||err));
});

async function enhance(){
  ensureStyle();decoratePlanPreview();
  try{await decorateWorkshopPlanningList()}catch(e){console.warn('Não foi possível preparar downloads mensais dos planejamentos:',e)}
}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(async()=>{scheduled=false;await enhance()})}
window.addEventListener('hashchange',()=>{workshopCache=null;setTimeout(schedule,0)});window.addEventListener('focus',schedule);
observer=new MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true});
window.CRJWorkshopPlanExports={download:downloadPlan,print:printPlan,openMonth:openMonthModal};
schedule();
