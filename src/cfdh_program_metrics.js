import { apiMode, supabaseClient } from './api.js?v=20261004-2';

const PROGRAMS={
  ptrampo:{group:'Planos e acompanhamento',question:'Essa ação CFDH também é uma atividade PTrampo?',label:'PTrampo',stage:'Metas 4.1 e 6.4',detail:'8 atividades/mês + 15 jovens/mês',rule:'Após execução, conta 1 atividade. Jovens vêm da presença nominal e são deduplicados nos indicadores de jovens únicos.'},
  pvida:{group:'Planos e acompanhamento',question:'Essa ação CFDH também é uma atividade PVida?',label:'PVida',stage:'Meta 6.2',detail:'4h/mês + jovens + participações',rule:'A duração executada soma nas horas do PVida. Jovens e participações vêm da lista nominal.'},
  outras_demandas:{group:'Planos e acompanhamento',question:'Essa ação também realiza acompanhamento de outras demandas?',label:'Outras demandas',stage:'Meta 6.2',detail:'Acompanhamentos realizados',rule:'Cada jovem presente gera um acompanhamento de outras demandas somente após a execução.'},
  ficaadica:{group:'Planos e acompanhamento',question:'Essa ação também realiza orientação #FicaADica?',label:'#FicaADica',stage:'Meta 6.3',detail:'Consultas / orientações',rule:'Cada jovem presente gera uma consulta/orientação quando esta ligação estiver marcada.'},

  oficina:{group:'Formação, cultura e programação',question:'Essa ação CFDH também é uma oficina?',label:'Oficina',stage:'Meta 6.1',detail:'Carga horária mensal de oficinas/cursos',rule:'A duração efetivamente executada soma em M6.1_OFICINAS_HORAS.'},
  curso_profissionalizante:{group:'Formação, cultura e programação',question:'Essa ação também é curso/oficina profissionalizante?',label:'Curso profissionalizante',stage:'Metas 4.6 e 6.4',detail:'Horas + jovens únicos no mês/ano',rule:'Horas vêm da duração executada; jovens vêm da presença e são deduplicados por indicador.'},
  evento_programacao:{group:'Formação, cultura e programação',question:'Essa ação também integra evento ou programação do CRJ?',label:'Evento / programação',stage:'Meta 6.1',detail:'Eventos/programações no mês',rule:'A execução conta 1 evento/programação.'},
  passeio_cultural:{group:'Formação, cultura e programação',question:'Essa ação também é passeio ou atividade cultural externa?',label:'Passeio / atividade cultural',stage:'Meta 6.1',detail:'Participações culturais',rule:'Cada jovem presente gera uma participação cultural. Não cria contagem de passagem automaticamente.'},
  vivencia_intercambio:{group:'Formação, cultura e programação',question:'Essa ação também é vivência, intercâmbio, campeonato ou apresentação?',label:'Vivência / intercâmbio / campeonato',stage:'Meta 6.1',detail:'Participações culturais',rule:'Cada jovem presente gera uma participação cultural. Se passeio e vivência forem marcados juntos, a participação é contada uma única vez.'},
  mostra_profissoes:{group:'Formação, cultura e programação',question:'Essa ação também integra uma Mostra de Profissões?',label:'Mostra de Profissões',stage:'Metas 4.5 e 6.4',detail:'Mostra realizada + participantes',rule:'A execução conta 1 mostra; participantes vêm da presença nominal.'},
  mostra_crj:{group:'Formação, cultura e programação',question:'Essa ação também integra uma mostra institucional do CRJ?',label:'Mostra do CRJ',stage:'Meta 6.1',detail:'Mostras realizadas',rule:'A execução conta 1 mostra institucional.'},

  trampo_coletivo:{group:'Trabalho, renda e espaços',question:'Essa ação também se relaciona ao Trampo Coletivo?',label:'Trampo Coletivo',stage:'Meta 6.5',detail:'85% de satisfação',rule:'O percentual entra somente quando houver respostas de satisfação registradas.'},
  labpoca:{group:'Trabalho, renda e espaços',question:'Essa ação também se relaciona ao LABPoca?',label:'LABPoca',stage:'Meta 6.6',detail:'85% de satisfação',rule:'O percentual entra somente quando houver respostas de satisfação registradas.'},

  acao_parceria:{group:'Parcerias e rede',question:'Essa ação é desenvolvida em parceria?',label:'Ação em parceria',stage:'Meta 4.4',detail:'Ações desenvolvidas em parceria',rule:'A execução conta 1 ação em parceria, independentemente do número de parceiros.'},
  encontro_rede:{group:'Parcerias e rede',question:'Essa ação também é encontro/reunião com equipamento da rede?',label:'Encontro com a rede',stage:'Meta 6.7',detail:'Encontros/reuniões com equipamentos da rede',rule:'A execução conta 1 encontro/reunião de rede.'},
  parceria_formalizada:{group:'Parcerias e rede',question:'Essa ação resultou ou formaliza uma parceria?',label:'Parceria formalizada',stage:'Metas 4.4 e 6.7',detail:'Parcerias firmadas/formalizadas',rule:'A execução conta 1 parceria nos indicadores correspondentes. Marque apenas quando houver formalização/evidência.'}
};

const GROUP_ORDER=['Planos e acompanhamento','Formação, cultura e programação','Trabalho, renda e espaços','Parcerias e rede'];
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
  .cfdh-program-group{margin-top:12px}.cfdh-program-group:first-of-type{margin-top:4px}.cfdh-program-group-title{font-size:11px;font-weight:800;color:#315f54;margin:0 0 6px;text-transform:uppercase;letter-spacing:.03em}
  .cfdh-program-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.cfdh-program-option{display:block;border:1px solid #dce6e3;border-radius:11px;padding:10px;background:#fff}.cfdh-program-option>span{display:flex;gap:8px;align-items:flex-start}.cfdh-program-option input[type=checkbox]{margin-top:2px}.cfdh-program-option b{display:block;font-size:12px}.cfdh-program-option small{display:block;color:#66746f;line-height:1.4;margin-top:2px}.cfdh-program-option em{display:block;font-style:normal;font-size:10px;margin-top:5px;color:#315f54}.cfdh-program-question{font-weight:750;color:#243c35}
  .cfdh-program-option.active{border-color:#83b9aa;background:#f4faf8}.cfdh-program-satisfaction{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:9px;padding-top:9px;border-top:1px dashed #d8e5e1}.cfdh-program-satisfaction label{font-size:10px;font-weight:700}.cfdh-program-satisfaction input{width:100%;margin-top:4px}
  .cfdh-program-status{margin-top:10px;font-size:11px;padding:8px 10px;border-radius:9px;background:#eef6f3}.cfdh-program-status.warn{background:#fff7e7}.cfdh-program-status.success{background:#eaf8f0}.cfdh-program-goal-extra{margin-top:8px;padding-top:8px;border-top:1px solid #dfe7e4}.cfdh-program-goal-extra b{display:block;margin-bottom:4px}.cfdh-program-goal-extra span{display:block;font-size:11px;margin:2px 0}.cfdh-program-preview{margin-top:10px}.cfdh-program-preview table{width:100%;border-collapse:collapse;font-size:8px}.cfdh-program-preview th,.cfdh-program-preview td{border:1px solid #222;padding:4px;vertical-align:top}.cfdh-program-preview th{background:#f7f7f7;text-align:center}
  .cfdh-link-rule{margin-top:10px;padding:9px 10px;border:1px solid #dce8e4;border-radius:10px;background:#f3f8f6;font-size:11px;line-height:1.45}
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
  return `<label class="cfdh-program-option ${checked?'active':''}" data-cfdh-program-option="${key}"><span><input type="checkbox" data-cfdh-program="${key}" ${checked?'checked':''}><span><b class="cfdh-program-question">${esc(p.question)}</b><small><strong>${esc(p.label)}</strong> · ${esc(p.stage)} · ${esc(p.detail)}</small><em>${esc(p.rule)}</em></span></span>${sat?`<div class="cfdh-program-satisfaction" ${checked?'':'hidden'}><label>Respostas de satisfação<input class="input" type="number" min="0" step="1" data-cfdh-sat-total="${key}" value="${esc(current?.satisfaction_total??'')}"></label><label>Respostas positivas<input class="input" type="number" min="0" step="1" data-cfdh-sat-positive="${key}" value="${esc(current?.satisfaction_positive??'')}"></label></div>`:''}</label>`;
}
function groupedOptions(map){
  return GROUP_ORDER.map(group=>{const keys=Object.keys(PROGRAMS).filter(k=>PROGRAMS[k].group===group);return `<div class="cfdh-program-group"><div class="cfdh-program-group-title">${esc(group)}</div><div class="cfdh-program-grid">${keys.map(k=>programOption(k,map.get(k))).join('')}</div></div>`}).join('');
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
  if(!links.length){el.className='cfdh-program-status';el.textContent='Nenhuma atividade complementar vinculada a esta ação CFDH.';return}
  const executed=['realizada','parcial'].includes(row?.execution_status);
  const satPending=links.some(x=>(x.program==='trampo_coletivo'||x.program==='labpoca')&&!(Number(x.satisfaction_total||0)>0));
  if(executed&&satPending){el.className='cfdh-program-status warn';el.textContent='Execução registrada. Os indicadores mensuráveis já foram atualizados; vínculos de satisfação aguardam respostas válidas para entrar no percentual.';return}
  if(executed){el.className='cfdh-program-status success';el.textContent='Execução registrada: duração, presença e quantidade da ação já alimentam automaticamente os indicadores das metas e etapas selecionadas.';return}
  el.className='cfdh-program-status';el.textContent='Vínculo salvo no planejamento. Ele aparece como relação metodológica, mas nenhum número entra na meta antes da execução/evidência.';
}

function augmentFlyout(card,links){
  const fly=card.querySelector('.cfdh-action-goal-flyout');if(!fly)return;
  let extra=fly.querySelector('[data-cfdh-program-goal-extra]');
  if(!extra){extra=document.createElement('div');extra.dataset.cfdhProgramGoalExtra='1';extra.className='cfdh-program-goal-extra';fly.appendChild(extra)}
  const html=links.length?`<b>Atividades ligadas a esta ação CFDH</b>${links.map(x=>{const p=PROGRAMS[x.program];return `<span><strong>${esc(p.label)}</strong> · ${esc(p.stage)} · ${esc(p.detail)}</span>`}).join('')}`:'<b>Atividades ligadas</b><span>Nenhuma ligação complementar selecionada.</span>';
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
  box.innerHTML=`<div class="cfdh-program-head"><div><h5>Ligações com outras atividades, Metas e Etapas</h5><p>Uma ação CFDH pode realizar simultaneamente outros dispositivos da metodologia. Marque todas as relações reais. O CFDH continua sendo o registro principal; as ligações aparecem separadas e os indicadores usam a mesma execução e a mesma presença, sem duplicar jovens dentro de indicadores de pessoas únicas.</p></div><span class="pill info">vínculo inteligente</span></div>${groupedOptions(map)}<div class="cfdh-link-rule"><b>Regra:</b> planejamento cria o vínculo; execução libera a contagem. Horas usam a duração efetiva, pessoas usam a presença nominal e ações unitárias contam uma vez. Ligações que convergem no mesmo indicador são deduplicadas.</div><div class="cfdh-program-status" data-cfdh-program-status></div>`;
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
  saveTimers.set(key,setTimeout(async()=>{try{const ok=await saveMetrics(id,number,links);if(ok){const p=readPending(id);delete p[number];writePending(id,p)}}catch(err){console.warn('Falha ao salvar vínculos inteligentes do CFDH:',err)}},550));
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
  const html=`<div class="methodology-section-title">LIGAÇÕES COMPLEMENTARES COM ATIVIDADES, METAS E ETAPAS</div><table><thead><tr><th>Ação</th><th>Atividade ligada</th><th>Meta / etapa</th><th>Indicador relacionado</th><th>Regra de contabilização</th></tr></thead><tbody>${rows.join('')}</tbody></table><div class="methodology-system-note">O CFDH permanece como atividade principal. As ligações complementares compartilham a mesma execução/evidência. Nenhuma previsão é somada como resultado antes da execução.</div>`;
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
