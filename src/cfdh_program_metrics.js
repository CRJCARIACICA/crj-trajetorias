import { apiMode, supabaseClient } from './api.js?v=20261004-2';

const PROGRAMS={
  ptrampo:{
    label:'PTrampo',
    stage:'Metas 4.1 e 6.4',
    detail:'8 atividades/mês + 15 jovens/mês',
    rule:'Cada ação CFDH executada e vinculada ao PTrampo conta como 1 atividade. Jovens são calculados pelas presenças nominais, sem duplicar o mesmo jovem no mês.'
  },
  pvida:{
    label:'PVida',
    stage:'Meta 6.2',
    detail:'4h/mês + 45 jovens/mês + participações',
    rule:'As horas vêm da duração efetivamente executada. Jovens e participações vêm da lista nominal da ação.'
  },
  trampo_coletivo:{
    label:'Trampo Coletivo',
    stage:'Meta 6.5',
    detail:'85% de satisfação',
    rule:'O vínculo identifica a ação como contribuição ao Trampo Coletivo. O percentual só entra na meta quando houver respostas de satisfação registradas.'
  },
  labpoca:{
    label:'LABPoca',
    stage:'Meta 6.6',
    detail:'85% de satisfação',
    rule:'O vínculo identifica a ação como contribuição ao LABPoca. O percentual só entra na meta quando houver respostas de satisfação registradas.'
  }
};

let cachePlan='',cacheRows=new Map(),scheduled=false;
const saveTimers=new Map();
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const client=()=>apiMode()==='live'?supabaseClient():null;
const params=()=>new URLSearchParams((location.hash.split('?')[1]||''));
const planId=()=>location.hash.startsWith('#cfdh')?(params().get('plan')||''):'';
const pendingKey=id=>`crj_cfdh_program_metrics_${id}`;

function injectStyle(){
  if(document.querySelector('#cfdh-program-metrics-style'))return;
  const s=document.createElement('style');
  s.id='cfdh-program-metrics-style';
  s.textContent=`
  .cfdh-program-metrics{margin-top:14px;border:1px solid #dbe7e3;border-radius:14px;padding:14px;background:#fbfdfc}
  .cfdh-program-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}.cfdh-program-head h5{margin:0 0 4px;font-size:14px}.cfdh-program-head p{margin:0;color:#65736f;font-size:12px;line-height:1.45}
  .cfdh-program-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.cfdh-program-option{display:block;border:1px solid #dce6e3;border-radius:11px;padding:10px;background:#fff}.cfdh-program-option>span{display:flex;gap:8px;align-items:flex-start}.cfdh-program-option input[type=checkbox]{margin-top:2px}.cfdh-program-option b{display:block;font-size:12px}.cfdh-program-option small{display:block;color:#66746f;line-height:1.4;margin-top:2px}.cfdh-program-option em{display:block;font-style:normal;font-size:10px;margin-top:5px;color:#315f54}
  .cfdh-program-option.active{border-color:#83b9aa;background:#f4faf8}.cfdh-program-satisfaction{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px;padding-top:9px;border-top:1px dashed #d8e5e1}.cfdh-program-satisfaction label{font-size:10px;font-weight:700}.cfdh-program-satisfaction input{width:100%;margin-top:4px}
  .cfdh-program-status{margin-top:10px;font-size:11px;padding:8px 10px;border-radius:9px;background:#eef6f3}.cfdh-program-status.warn{background:#fff7e7}.cfdh-program-status.success{background:#eaf8f0}.cfdh-program-goal-extra{margin-top:8px;padding-top:8px;border-top:1px solid #dfe7e4}.cfdh-program-goal-extra b{display:block;margin-bottom:4px}.cfdh-program-goal-extra span{display:block;font-size:11px;margin:2px 0}.cfdh-program-preview{margin-top:10px}.cfdh-program-preview table{width:100%;border-collapse:collapse;font-size:8px}.cfdh-program-preview th,.cfdh-program-preview td{border:1px solid #222;padding:4px;vertical-align:top}.cfdh-program-preview th{background:#f7f7f7;text-align:center}
  @media(max-width:760px){.cfdh-program-grid,.cfdh-program-satisfaction{grid-template-columns:1fr}}
  `;
  document.head.appendChild(s);
}

function readPending(id){try{return JSON.parse(sessionStorage.getItem(pendingKey(id))||'{}')||{}}catch{return {}}}
function writePending(id,obj){try{sessionStorage.setItem(pendingKey(id),JSON.stringify(obj||{}))}catch{}}
function actionNumber(card){return Number(card.dataset.actionNumber||0)}
function normalizeLinks(v){return Array.isArray(v)?v.filter(x=>x&&PROGRAMS[x.program]):[]}
function linkMap(links){return new Map(normalizeLinks(links).map(x=>[x.program,x]))}

async function loadRows(id,force=false){
  if(!id||!client())return new Map();
  if(!force&&cachePlan===id&&cacheRows.size)return cacheRows;
  const {data,error}=await client().from('cfdh_actions').select('id,action_number,execution_status,program_metric_links').eq('plan_id',id).order('action_number');
  if(error)throw error;
  cachePlan=id;cacheRows=new Map((data||[]).map(r=>[Number(r.action_number),r]));
  return cacheRows;
}

function programOption(key,current){
  const p=PROGRAMS[key],checked=Boolean(current),sat=key==='trampo_coletivo'||key==='labpoca';
  return `<label class="cfdh-program-option ${checked?'active':''}" data-cfdh-program-option="${key}"><span><input type="checkbox" data-cfdh-program="${key}" ${checked?'checked':''}><span><b>${esc(p.label)} · ${esc(p.stage)}</b><small>${esc(p.detail)}</small><em>${esc(p.rule)}</em></span></span>${sat?`<div class="cfdh-program-satisfaction" ${checked?'':'hidden'}><label>Respostas de satisfação<input class="input" type="number" min="0" step="1" data-cfdh-sat-total="${key}" value="${esc(current?.satisfaction_total??'')}"></label><label>Respostas positivas<input class="input" type="number" min="0" step="1" data-cfdh-sat-positive="${key}" value="${esc(current?.satisfaction_positive??'')}"></label></div>`:''}</label>`;
}

function cardLinks(card){
  const out=[];
  for(const key of Object.keys(PROGRAMS)){
    const check=card.querySelector(`[data-cfdh-program="${key}"]`);if(!check?.checked)continue;
    const row={program:key};
    if(key==='trampo_coletivo'||key==='labpoca'){
      const t=card.querySelector(`[data-cfdh-sat-total="${key}"]`)?.value;
      const p=card.querySelector(`[data-cfdh-sat-positive="${key}"]`)?.value;
      row.satisfaction_total=t===''?null:Number(t||0);
      row.satisfaction_positive=p===''?null:Number(p||0);
    }
    out.push(row);
  }
  return out;
}

function setStatus(card,links,row){
  const el=card.querySelector('[data-cfdh-program-status]');if(!el)return;
  if(!links.length){el.className='cfdh-program-status';el.textContent='Nenhuma meta operacional adicional vinculada a esta ação.';return}
  const executed=['realizada','parcial'].includes(row?.execution_status);
  const satPending=links.some(x=>(x.program==='trampo_coletivo'||x.program==='labpoca')&&!(Number(x.satisfaction_total||0)>0));
  if(executed&&satPending){el.className='cfdh-program-status warn';el.textContent='Execução registrada. PTrampo/PVida já podem alimentar as metas; satisfação pendente não entra no percentual até registrar respostas.';return}
  if(executed){el.className='cfdh-program-status success';el.textContent='Execução registrada: os vínculos válidos desta ação alimentam automaticamente o quadro de Metas e Etapas.';return}
  el.className='cfdh-program-status';el.textContent='Vínculo planejado. Nada é somado à meta antes do registro de execução/evidência.';
}

function augmentFlyout(card,links){
  const fly=card.querySelector('.cfdh-action-goal-flyout');if(!fly)return;
  let extra=fly.querySelector('[data-cfdh-program-goal-extra]');
  if(!extra){extra=document.createElement('div');extra.dataset.cfdhProgramGoalExtra='1';extra.className='cfdh-program-goal-extra';fly.appendChild(extra)}
  const html=links.length?`<b>Vínculos quantitativos desta ação</b>${links.map(x=>{const p=PROGRAMS[x.program];return `<span><strong>${esc(p.label)}</strong> · ${esc(p.stage)} · ${esc(p.detail)}</span>`}).join('')}`:'<b>Vínculos quantitativos</b><span>Nenhum PTrampo, PVida, Trampo Coletivo ou LABPoca selecionado.</span>';
  if(extra.innerHTML!==html)extra.innerHTML=html;
}

function updateCard(card,row){
  const links=cardLinks(card);
  card.querySelectorAll('[data-cfdh-program-option]').forEach(opt=>{
    const key=opt.dataset.cfdhProgramOption,checked=Boolean(card.querySelector(`[data-cfdh-program="${key}"]`)?.checked);
    opt.classList.toggle('active',checked);const sat=opt.querySelector('.cfdh-program-satisfaction');if(sat)sat.hidden=!checked;
  });
  setStatus(card,links,row);augmentFlyout(card,links);renderPreview();
}

function injectCard(card,row,pendingLinks){
  if(card.dataset.cfdhProgramMetricsBound==='1'){updateCard(card,row);return}
  card.dataset.cfdhProgramMetricsBound='1';
  const links=normalizeLinks(pendingLinks??row?.program_metric_links),map=linkMap(links);
  const box=document.createElement('div');box.className='cfdh-program-metrics';box.dataset.cfdhProgramMetrics='1';
  box.innerHTML=`<div class="cfdh-program-head"><div><h5>Contribuição para Metas e Etapas</h5><p>Selecione uma ou mais entregas que esta ação CFDH também realiza. O planejamento cria o vínculo; a contabilização ocorre somente após execução e evidência.</p></div><span class="pill info">vínculo quantitativo</span></div><div class="cfdh-program-grid">${Object.keys(PROGRAMS).map(k=>programOption(k,map.get(k))).join('')}</div><div class="cfdh-program-status" data-cfdh-program-status></div>`;
  card.appendChild(box);
  const number=actionNumber(card),id=planId();
  const changed=()=>{
    const current=cardLinks(card),pending=readPending(id);pending[number]=current;writePending(id,pending);updateCard(card,row);scheduleSave(id,number,current);
  };
  box.addEventListener('change',changed);box.addEventListener('input',e=>{if(e.target.matches('input[type=number]'))changed()});
  updateCard(card,row);
}

async function saveMetrics(id,number,links){
  if(!id||!number||!client())return false;
  const {data,error}=await client().rpc('cfdh_set_action_program_metrics',{p_plan_id:id,p_action_number:number,p_links:links});
  if(error){if(/não encontrada|not found/i.test(error.message||''))return false;throw error}
  cacheRows.set(number,data);return true;
}
function scheduleSave(id,number,links){
  const key=`${id}:${number}`;clearTimeout(saveTimers.get(key));
  saveTimers.set(key,setTimeout(async()=>{try{const ok=await saveMetrics(id,number,links);if(ok){const p=readPending(id);delete p[number];writePending(id,p)}}catch(err){console.warn('Falha ao salvar vínculo quantitativo do CFDH:',err)}},550));
}
async function flushPending(id){
  if(!id||!client())return;
  const pending=readPending(id),entries=Object.entries(pending);if(!entries.length)return;
  await loadRows(id,true).catch(()=>{});
  let changed=false;
  for(const [n,links] of entries){try{if(await saveMetrics(id,Number(n),normalizeLinks(links))){delete pending[n];changed=true}}catch(err){console.warn('Vínculo CFDH ainda pendente:',err)}}
  if(changed)writePending(id,pending);
}

function captureAll(){
  const id=planId();if(!id)return;
  const pending=readPending(id);
  document.querySelectorAll('#cfdh-plan-editor [data-cfdh-action-card]').forEach(card=>{pending[actionNumber(card)]=cardLinks(card)});
  writePending(id,pending);
}

function bindForm(){
  const form=document.querySelector('#cfdh-plan-editor');if(!form||form.dataset.cfdhProgramFormBound==='1')return;
  form.dataset.cfdhProgramFormBound='1';
  form.addEventListener('submit',()=>{captureAll();const id=planId();setTimeout(()=>flushPending(id),700);setTimeout(()=>flushPending(id),1700)});
  form.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;const t=String(b.textContent||'').toLowerCase();if(t.includes('voltar')||t.includes('salvar'))captureAll()});
}

function renderPreview(){
  const preview=document.querySelector('[data-cfdh-plan-preview]');if(!preview)return;
  const rows=[];
  document.querySelectorAll('#cfdh-plan-editor [data-cfdh-action-card]').forEach(card=>{
    const n=actionNumber(card),links=cardLinks(card);for(const l of links){const p=PROGRAMS[l.program];rows.push(`<tr><td>Ação ${n}</td><td>${esc(p.label)}</td><td>${esc(p.stage)}</td><td>${esc(p.detail)}</td><td>${esc(p.rule)}</td></tr>`)}
  });
  let box=preview.querySelector('[data-cfdh-program-preview]');
  if(!rows.length){box?.remove();return}
  if(!box){box=document.createElement('div');box.dataset.cfdhProgramPreview='1';box.className='cfdh-program-preview';preview.querySelector('.methodology-paper')?.appendChild(box)}
  if(!box)return;
  const html=`<div class="methodology-section-title">VÍNCULOS COMPLEMENTARES COM METAS E ETAPAS</div><table><thead><tr><th>Ação</th><th>Programa</th><th>Meta / etapa</th><th>Referência exigida</th><th>Regra de contabilização</th></tr></thead><tbody>${rows.join('')}</tbody></table><div class="methodology-system-note">O vínculo no planejamento não contabiliza execução. Os valores entram no quadro de Metas e Etapas somente após execução/evidência válida.</div>`;
  if(box.innerHTML!==html)box.innerHTML=html;
}

async function enhance(){
  injectStyle();const id=planId();if(!id)return;
  let rows=cacheRows;if(cachePlan!==id||!cacheRows.size){try{rows=await loadRows(id)}catch(err){console.warn('Não foi possível carregar vínculos de metas do CFDH:',err);rows=new Map()}}
  const pending=readPending(id);
  document.querySelectorAll('#cfdh-plan-editor [data-cfdh-action-card]').forEach(card=>{const n=actionNumber(card);injectCard(card,rows.get(n),Object.prototype.hasOwnProperty.call(pending,n)?pending[n]:undefined)});
  bindForm();renderPreview();
}
function scheduleEnhance(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhance().catch(()=>{})})}

const observer=new MutationObserver(scheduleEnhance);observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>{const old=cachePlan;captureAll();cachePlan='';cacheRows=new Map();if(old)setTimeout(()=>flushPending(old),250);setTimeout(scheduleEnhance,60)});
setInterval(()=>{const id=planId();if(id)flushPending(id).catch(()=>{})},5000);
scheduleEnhance();
