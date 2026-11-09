import { getSession, supabaseClient } from './api.js';
import { captureRoute } from './route_lifecycle.js';
import { EVALUATION_SLUGS, escapeEvaluation as esc, evaluationTitle, evaluationFormHtml, evaluationValues, evaluationInsightsHtml } from './evaluation_shared.js';

const allowed=new Set(['coordenacao_geral','educador','assistente_social','psicologo','terapeuta_ocupacional']);
let timer,sequence=0;
const route=()=>location.hash.split('?')[0]==='#avaliacoes';
const params=()=>new URLSearchParams(location.hash.split('?')[1]||'');
const currentMonth=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date());
const monthValue=()=>/^\d{4}-\d{2}$/.test(params().get('month')||'')?params().get('month'):currentMonth();
const monthLabel=m=>`${m.slice(5,7)}/${m.slice(0,4)}`;
const client=()=>supabaseClient();

function style(){
 if(document.querySelector('#evaluation-workspace-style'))return;
 const s=document.createElement('style');s.id='evaluation-workspace-style';s.textContent=`
 .ev-page{display:grid;gap:16px}.ev-heading{display:flex;justify-content:space-between;align-items:start;gap:14px;flex-wrap:wrap}.ev-heading p,.ev-hint{font-size:13px;color:#587166;line-height:1.5}.ev-filter{display:flex;gap:9px;align-items:end;flex-wrap:wrap}.ev-filter label{display:grid;gap:5px;font-weight:700;font-size:13px}.ev-box,.ev-tile{background:white;border:1px solid #dfe9e3;border-radius:14px;padding:16px}.ev-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}.ev-tile h4{font-size:16px;margin:9px 0 6px}.ev-tile p{font-size:13px;color:#667b72;line-height:1.45}.ev-pill{display:inline-flex;background:#e7f5ed;border-radius:99px;padding:4px 9px;color:#16664e;font-size:11px;font-weight:800}.ev-pill.closed{background:#fff3db;color:#815b14}.ev-buttons{display:flex;gap:6px;flex-wrap:wrap;margin-top:11px}.ev-link{display:flex;gap:6px;margin-top:9px}.ev-link input{min-width:0;flex:1;border:1px solid #d9e5df;border-radius:8px;padding:8px;font-size:12px;color:#445f52}.ev-notice{padding:11px 13px;border-radius:9px;background:#edf7f1;color:#315e49;font-size:13px}.ev-empty{border:1px dashed #c9dcd1;border-radius:10px;padding:17px;color:#647a70}.ev-modal-bg{position:fixed;inset:0;z-index:10000;background:#051b13aa;display:grid;place-items:center;padding:12px}.ev-modal{background:#fff;border-radius:16px;width:min(880px,100%);max-height:94vh;overflow:auto;box-shadow:0 15px 50px #0003}.ev-modal-head{display:flex;align-items:start;justify-content:space-between;gap:10px;position:sticky;top:0;background:#fff;padding:17px 20px;border-bottom:1px solid #e5ede8;z-index:1}.ev-modal-head h3{margin:0}.ev-modal-body{padding:17px 20px}.ev-field{display:grid;gap:6px;margin:14px 0}.ev-field label{font-size:13px;font-weight:700}.ev-field input,.ev-field textarea,.ev-field select{width:100%;padding:10px;border:1px solid #c9d9d0;border-radius:9px;background:white;color:#17382c;font:inherit}.ev-field input[readonly]{background:#f3f7f4}.ev-error{border-radius:9px;padding:10px;background:#fff0ef;color:#8b1e1e;margin:10px 0}.ev-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}.ev-metrics>div{background:#f1f8f4;border-radius:10px;padding:12px}.ev-metrics b,.ev-metrics span{display:block}.ev-metrics b{font-size:18px;color:#0b674b}.ev-metrics span{font-size:12px;color:#587166;margin-top:4px}.ev-question{border-bottom:1px solid #e6eee9;padding:11px 0}.ev-question b,.ev-question span,.ev-question small{display:block}.ev-question span{font-size:13px;margin:4px 0}.ev-question small{color:#6c7e73}.ev-comments p{background:#f6faf7;padding:10px;border-radius:8px;white-space:pre-wrap;overflow-wrap:anywhere}.ev-comments{margin:12px 0}@media(max-width:600px){.ev-modal-body,.ev-modal-head{padding:13px}.ev-link{flex-direction:column}.ev-heading{display:block}}
 `;document.head.appendChild(s);
}
function cycleFor(cycles,slug,workshopId=null){return cycles.find(c=>c.form_slug===slug&&(c.workshop_id||null)===(workshopId||null))||null}
function card({slug,title,description,cycle,workshopId=null,team=false}){
 const fields=`data-slug="${esc(slug)}" data-workshop="${esc(workshopId||'')}"`;
 const state=cycle?`<span class="ev-pill ${cycle.is_open?'':'closed'}">${cycle.is_open?'Aberta':'Encerrada'}</span>`:'<span class="ev-pill closed">Ainda não iniciada</span>';
 const actions=cycle?`${team&&cycle.is_open?`<button class="btn primary" type="button" data-ev-answer="${esc(cycle.id)}">Responder / editar</button>`:''}<button class="btn secondary" type="button" data-ev-insights="${esc(cycle.id)}">Ver resultados</button><button class="btn ghost" type="button" data-ev-toggle="${esc(cycle.id)}" data-open="${cycle.is_open?'false':'true'}">${cycle.is_open?'Encerrar':'Reabrir'}</button>`:`<button class="btn primary" type="button" data-ev-create ${fields}>${team?'Iniciar avaliação da equipe':'Gerar link da avaliação'}</button>`;
 const link=cycle&&!team?`<div class="ev-link"><input readonly aria-label="Link da avaliação de ${esc(title)}" value="${esc(publicUrl(cycle.public_token))}"><button class="btn secondary" type="button" data-ev-copy="${esc(cycle.id)}">Copiar link</button></div>`:'';
 return `<article class="ev-tile"><div>${state}</div><h4>${esc(title)}</h4><p>${esc(description)}</p><div class="ev-buttons">${actions}</div>${link}</article>`;
}
function publicUrl(token){return new URL(`avaliacao.html#${encodeURIComponent(token)}`,location.href).href}
function showModal(title,body){
 const bg=document.createElement('div');bg.className='ev-modal-bg';bg.innerHTML=`<section class="ev-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="ev-modal-head"><h3>${esc(title)}</h3><button class="btn ghost" type="button" data-ev-close aria-label="Fechar">✕</button></header><div class="ev-modal-body">${body}</div></section>`;
 document.body.appendChild(bg);bg.addEventListener('click',event=>{if(event.target===bg||event.target.closest('[data-ev-close]'))bg.remove()});bg.querySelector('[data-ev-close]')?.focus();return bg;
}
async function allResponses(cycleId){
 const result=[];let from=0;const pageSize=500;
 while(true){
  const {data,error}=await client().from('evaluation_monthly_responses').select('id,payload,staff_user_id,created_at').eq('cycle_id',cycleId).order('created_at',{ascending:true}).order('id',{ascending:true}).range(from,from+pageSize-1);
  if(error)throw error;result.push(...(data||[]));if((data||[]).length<pageSize)return result;from+=pageSize;
 }
}
async function createCycle(slug,month,workshopId){
 const {data,error}=await client().rpc('evaluation_ensure_month',{p_slug:slug,p_month:`${month}-01`,p_workshop_id:workshopId||null});
 if(error)throw error;return data;
}
async function openResults(cycle,workshop){
 const modal=showModal(`Resultados · ${evaluationTitle(cycle.form_slug)}`,'<div class="ev-empty">Carregando respostas…</div>');
 const body=modal.querySelector('.ev-modal-body');
 try{const responses=await allResponses(cycle.id);if(!modal.isConnected)return;body.innerHTML=`<p class="ev-hint">${esc(workshop?.name||'Circuito Formativo')} · ${esc(monthLabel(String(cycle.reference_month).slice(0,7)))}</p>${evaluationInsightsHtml(cycle.form_slug,responses)}`}
 catch(err){if(modal.isConnected)body.innerHTML=`<div class="ev-error">${esc(err.message||'Não foi possível carregar os resultados.')}</div>`}
}
async function openTeam(cycle,profile){
 const modal=showModal('Anexo 13 · Avaliação da equipe','<div class="ev-empty">Carregando formulário…</div>'),body=modal.querySelector('.ev-modal-body');
 try{
  const responses=await allResponses(cycle.id);if(!modal.isConnected)return;
  const mine=responses.find(item=>item.staff_user_id===profile.id);
  body.innerHTML=`<p class="ev-hint">CFDH · ${esc(monthLabel(String(cycle.reference_month).slice(0,7)))}. Cada profissional pode responder e atualizar a própria avaliação.</p>${evaluationFormHtml(EVALUATION_SLUGS.team,{values:mine?.payload||{},staffName:profile.display_name||''})}`;
  const form=body.querySelector('[data-evaluation-form]');form.querySelector('[type=submit]').textContent=mine?'Atualizar minha avaliação':'Salvar minha avaliação';
  form.addEventListener('submit',async event=>{
   event.preventDefault();const b=form.querySelector('[type=submit]'),error=form.querySelector('[data-evaluation-error]');b.disabled=true;error.hidden=true;
   try{const {error:problem}=await client().rpc('evaluation_staff_submit',{p_cycle_id:cycle.id,p_payload:evaluationValues(form,EVALUATION_SLUGS.team)});if(problem)throw problem;body.innerHTML='<div class="ev-notice"><b>Avaliação salva.</b> Você pode reabrir e atualizar sua resposta.</div>';}
   catch(err){error.textContent=err.message||'Não foi possível salvar a avaliação.';error.hidden=false;b.disabled=false;}
  });
 }catch(err){if(modal.isConnected)body.innerHTML=`<div class="ev-error">${esc(err.message||'Não foi possível abrir a avaliação.')}</div>`}
}
async function render(){
 if(!route())return;
 const host=document.querySelector('.content');if(!host)return;
 const mySequence=++sequence,current=captureRoute(host),month=monthValue();
 style();host.innerHTML='<div class="card" data-evaluations-page><div class="empty">Carregando avaliações…</div></div>';
 try{
  const session=await getSession(),profile=session?.user;if(!current()||mySequence!==sequence)return;
  if(!profile?.active||!allowed.has(profile.role)){host.innerHTML='<div class="notice danger" data-evaluations-page>Acesso disponível para educadores, equipe técnica e coordenação geral.</div>';return}
  const [workshopResult,cycleResult]=await Promise.all([
   client().from('workshops').select('id,name,active').order('name'),
   client().from('evaluation_monthly_cycles').select('id,reference_month,form_slug,workshop_id,public_token,is_open').eq('reference_month',`${month}-01`)
  ]);
  if(workshopResult.error)throw workshopResult.error;if(cycleResult.error)throw cycleResult.error;if(!current()||mySequence!==sequence)return;
  const workshops=workshopResult.data||[],cycles=cycleResult.data||[];
  host.innerHTML=`<div class="ev-page" data-evaluations-page><div class="ev-heading"><div><h2>Avaliações</h2><p>Um espaço para aplicar os anexos, compartilhar os links e acompanhar os resultados por mês.</p></div><div class="ev-filter"><label>Mês de referência<input class="input" type="month" value="${esc(month)}" data-ev-month></label><button class="btn secondary" type="button" data-ev-refresh>Atualizar</button></div></div><div class="ev-notice"><b>Como funciona:</b> cada oficina tem sua avaliação mensal própria. No CFDH, os jovens e a equipe respondem anexos separados. Os links dos jovens funcionam sem login.</div><section class="ev-box"><div class="page-head compact"><div><h3>Oficinas · Anexo 7</h3><p>Um link independente para cada oficina em ${esc(monthLabel(month))}.</p></div></div><div class="ev-tiles">${workshops.map(w=>card({slug:EVALUATION_SLUGS.workshop,title:w.name+(w.active?'':' · encerrada'),description:'Avaliação das atividades respondida pelos jovens.',workshopId:w.id,cycle:cycleFor(cycles,EVALUATION_SLUGS.workshop,w.id)})).join('')||'<div class="ev-empty">Nenhuma oficina cadastrada.</div>'}</div></section><section class="ev-box"><div class="page-head compact"><div><h3>Circuito Formativo · ${esc(monthLabel(month))}</h3><p>Cada anexo reúne somente as respostas e os resultados de seu próprio formulário mensal.</p></div></div><div class="ev-tiles">${card({slug:EVALUATION_SLUGS.youth,title:'Anexo 12 · Avaliação dos jovens',description:'Copie e envie o link para qualquer jovem avaliar o CFDH deste mês.',cycle:cycleFor(cycles,EVALUATION_SLUGS.youth)})}${card({slug:EVALUATION_SLUGS.team,title:'Anexo 13 · Avaliação da equipe',description:'Preenchido por educadores e equipe técnica dentro do sistema.',cycle:cycleFor(cycles,EVALUATION_SLUGS.team),team:true})}</div></section></div>`;
  host.querySelector('[data-ev-month]').addEventListener('change',event=>{location.hash=`#avaliacoes?month=${encodeURIComponent(event.target.value)}`});
  host.querySelector('[data-ev-refresh]').addEventListener('click',()=>render());
  host.querySelectorAll('[data-ev-create]').forEach(button=>button.addEventListener('click',async()=>{
   button.disabled=true;const label=button.textContent;button.textContent='Preparando…';
   try{const cycle=await createCycle(button.dataset.slug,month,button.dataset.workshop);if(!current())return;if(cycle.form_slug===EVALUATION_SLUGS.team){await render();if(route())await openTeam(cycle,profile)}else await render();}
   catch(err){button.disabled=false;button.textContent=label;alert(err.message||'Não foi possível criar a avaliação.');}
  }));
  host.querySelectorAll('[data-ev-copy]').forEach(button=>button.addEventListener('click',async()=>{
   const cycle=cycles.find(c=>c.id===button.dataset.evCopy);if(!cycle)return;
   try{await navigator.clipboard.writeText(publicUrl(cycle.public_token));const label=button.textContent;button.textContent='Copiado!';setTimeout(()=>{if(button.isConnected)button.textContent=label},2000)}catch{button.parentElement.querySelector('input')?.select();alert('Selecione e copie o link exibido.');}
  }));
  host.querySelectorAll('[data-ev-insights]').forEach(button=>button.addEventListener('click',()=>{const cycle=cycles.find(c=>c.id===button.dataset.evInsights);if(cycle)openResults(cycle,workshops.find(w=>w.id===cycle.workshop_id))}));
  host.querySelectorAll('[data-ev-answer]').forEach(button=>button.addEventListener('click',()=>{const cycle=cycles.find(c=>c.id===button.dataset.evAnswer);if(cycle)openTeam(cycle,profile)}));
  host.querySelectorAll('[data-ev-toggle]').forEach(button=>button.addEventListener('click',async()=>{
   button.disabled=true;try{const {error}=await client().from('evaluation_monthly_cycles').update({is_open:button.dataset.open==='true'}).eq('id',button.dataset.evToggle);if(error)throw error;await render()}catch(err){button.disabled=false;alert(err.message||'Não foi possível alterar a avaliação.');}
  }));
 }catch(err){if(current()&&mySequence===sequence)host.innerHTML=`<div class="notice danger" data-evaluations-page><b>Não foi possível carregar as avaliações.</b><br>${esc(err.message||String(err))}<div class="actions" style="margin-top:9px"><button class="btn primary" type="button" data-ev-retry>Tentar novamente</button></div></div>`;host.querySelector('[data-ev-retry]')?.addEventListener('click',render)}
}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>render(),0)}
window.addEventListener('crj:features-ready',event=>{if(event.detail?.route==='avaliacoes')schedule()});
window.addEventListener('crj:route-rendered',()=>{if(route())schedule()});
window.addEventListener('hashchange',()=>{sequence++;if(route())schedule()});
schedule();
