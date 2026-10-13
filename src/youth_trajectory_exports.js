import { apiMode, supabaseClient } from './api.js?v=20261004-2';

let observer=null,timer=null;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
const fmtDate=v=>v?new Date(String(v).length===10?`${v}T12:00:00`:v).toLocaleDateString('pt-BR'):'—';
const fmtDateTime=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
const fmtHours=v=>`${Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} h`;
const pct=v=>`${Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`;
const c=()=>{if(apiMode()!=='live')throw new Error('Banco ainda não conectado.');return supabaseClient()};
const parts=()=>String(location.hash||'#dashboard').split('?')[0].replace(/^#/,'').split('/');
const youthId=()=>parts()[0]==='jovem'?(parts()[1]||null):null;

async function exporter(){
  if(!window.CRJEvidenceExports?.download||!window.CRJEvidenceExports?.print){
    try{await import('./evidence_exports.js?v=20261009-1')}catch{}
  }
  for(let i=0;i<40;i++){
    if(window.CRJEvidenceExports?.download&&window.CRJEvidenceExports?.print)return window.CRJEvidenceExports;
    await sleep(100);
  }
  throw new Error('Exportador institucional indisponível.');
}

async function freezeCurrent(id){
  const {data,error}=await c().rpc('save_youth_trajectory_evidence',{p_youth_id:id});
  if(error)throw error;
  const submissionId=data?.submission_id||data?.id;
  if(!submissionId)throw new Error('Não foi possível gerar o protocolo da evidência da trajetória.');
  document.dispatchEvent(new CustomEvent('crj:trajectory-snapshot-created',{detail:{submissionId}}));
  return submissionId;
}

async function runOutput(button,mode,submissionId=null){
  if(button.dataset.yteExportBusy==='1')return;
  const original=button.textContent;
  button.dataset.yteExportBusy='1';button.disabled=true;
  button.textContent=mode==='print'?'Preparando impressão…':mode==='pdf'?'Gerando PDF…':'Gerando DOCX…';
  try{
    const id=youthId();
    if(!submissionId&&!id)throw new Error('Jovem não identificado.');
    const sid=submissionId||await freezeCurrent(id);
    const ex=await exporter();
    if(mode==='print')await ex.print(sid);
    else await ex.download(sid,mode);
    schedule();
  }catch(error){
    alert(error?.message||String(error));
  }finally{
    button.disabled=false;button.dataset.yteExportBusy='0';button.textContent=original;
  }
}

function button(label,mode,extra={}){
  const b=document.createElement('button');b.type='button';b.className='btn secondary';b.textContent=label;b.dataset.yteDirectOutput=mode;
  Object.entries(extra).forEach(([k,v])=>b.dataset[k]=v);
  return b;
}

function decorateCard(){
  const card=document.querySelector('[data-yte-card]');if(!card)return;
  const actions=card.querySelector('.yte-actions');if(!actions||actions.querySelector('[data-yte-profile-exports]'))return;
  const marker=document.createElement('span');marker.dataset.yteProfileExports='1';marker.style.display='contents';
  marker.append(button('Imprimir','print'),button('Baixar PDF','pdf'),button('Baixar DOCX','docx'));
  const open=actions.querySelector('[data-yte-open]');
  if(open)actions.insertBefore(marker,open);else actions.appendChild(marker);
}

function decorateModal(){
  const modal=document.querySelector('#yte-modal');if(!modal)return;
  const actions=modal.querySelector('.yte-modal-actions');if(actions&&!actions.querySelector('[data-yte-modal-exports]')){
    const wrap=document.createElement('span');wrap.dataset.yteModalExports='1';wrap.style.display='contents';
    wrap.append(button('Baixar PDF','pdf'),button('Baixar DOCX','docx'));
    const legacyPrint=actions.querySelector('[data-yte-print]');
    if(legacyPrint){legacyPrint.textContent='Imprimir';legacyPrint.insertAdjacentElement('afterend',wrap)}else actions.prepend(wrap);
  }
  modal.querySelectorAll('.yte-history-row').forEach(row=>{
    const open=row.querySelector('[data-yte-history]');if(!open||row.querySelector('[data-yte-history-exports]'))return;
    const id=open.dataset.yteHistory;if(!id)return;
    const box=document.createElement('span');box.dataset.yteHistoryExports='1';box.style.display='flex';box.style.gap='5px';box.style.flexWrap='wrap';
    const p=button('Imprimir','print',{yteSubmissionId:id});p.dataset.yteHistoryOutput='1';
    const pdf=button('PDF','pdf',{yteSubmissionId:id});pdf.dataset.yteHistoryOutput='1';
    const doc=button('DOCX','docx',{yteSubmissionId:id});doc.dataset.yteHistoryOutput='1';
    box.append(p,pdf,doc);open.insertAdjacentElement('beforebegin',box);
  });
}

function tags(links=[]){
  const seen=new Set();return (links||[]).filter(x=>{const k=`${x.area_code||''}|${x.subcategory||''}|${x.label||''}`;if(seen.has(k))return false;seen.add(k);return true}).map(x=>`<span class="yte-tag">${esc(x.label||x.subcategory||x.area_code)}</span>`).join('');
}
function actionRows(rows=[],missed=false){
  return `<div class="yte-table-wrap"><table class="yte-table"><thead><tr><th>Data</th><th>Ação</th><th>Área</th><th>Carga horária</th><th>Situação</th><th>Base da evidência</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(fmtDate(r.action_date))}</td><td><b>${esc(clean(r.title)||'Ação')}</b><div>${tags(r.links)}</div></td><td>${esc(r.area_label||r.area_code||'')}</td><td>${esc(fmtHours(r.hours))}</td><td class="${missed?'yte-miss':'yte-ok'}">${missed?'Não participou':'Participou'}</td><td>${esc(r.evidence_basis||'')}</td></tr>`).join('')||`<tr><td colspan="6" class="yte-empty">${missed?'Nenhuma não participação documentada.':'Nenhuma participação documentada.'}</td></tr>`}</tbody></table></div>`;
}
function summaryRows(rows=[]){
  return `<div class="yte-table-wrap"><table class="yte-table"><thead><tr><th>Área</th><th>Participações</th><th>Horas realizadas</th><th>Não participou</th><th>Horas não realizadas</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.area_label||r.area_code||'')}</td><td>${Number(r.participations||0)}</td><td>${esc(fmtHours(r.participated_hours))}</td><td>${Number(r.missed_actions||0)}</td><td>${esc(fmtHours(r.missed_hours))}</td></tr>`).join('')||'<tr><td colspan="5" class="yte-empty">Sem ocorrências documentadas.</td></tr>'}</tbody></table></div>`;
}

async function openHistorical(submissionId){
  const {data,error}=await c().from('methodology_form_submissions').select('id,payload,submitted_at').eq('id',submissionId).eq('form_slug','trajetoria-jovem').maybeSingle();
  if(error)throw error;if(!data)throw new Error('Versão oficial não encontrada.');
  const snapshot=data.payload?._trajectory_data||data.payload||{},y=snapshot.youth||{},t=snapshot.totals||{};
  document.querySelector('#yte-history-viewer')?.remove();
  const bg=document.createElement('div');bg.id='yte-history-viewer';bg.className='yte-modal-bg';bg.style.zIndex='2147483560';
  bg.innerHTML=`<div class="yte-modal"><div class="yte-modal-head"><div><h3>Versão oficial da trajetória</h3><div class="yte-muted">${esc(y.full_name||data.payload?.full_name||'Jovem')} · congelada em ${esc(fmtDateTime(data.submitted_at))}</div></div><button class="yte-close" type="button" data-close>✕</button></div><div class="yte-modal-body"><div class="yte-kpis"><div class="yte-kpi"><span>Participações</span><b>${Number(t.participations||0)}</b></div><div class="yte-kpi"><span>Horas realizadas</span><b>${esc(fmtHours(t.participated_hours))}</b></div><div class="yte-kpi"><span>Não participou</span><b>${Number(t.missed_actions||0)}</b></div><div class="yte-kpi"><span>Horas não realizadas</span><b>${esc(fmtHours(t.missed_hours))}</b></div><div class="yte-kpi"><span>Taxa de participação</span><b>${esc(pct(t.participation_rate))}</b></div></div><section class="yte-section"><h4>Resumo por área</h4>${summaryRows(snapshot.by_area||[])}</section><section class="yte-section"><h4>Ações em que participou</h4>${actionRows(snapshot.participated_actions||[],false)}</section><section class="yte-section"><h4>Ações em que não participou</h4>${actionRows(snapshot.not_participated_actions||[],true)}</section></div><div class="yte-modal-actions"><button class="btn secondary" type="button" data-yte-history-direct="print">Imprimir</button><button class="btn secondary" type="button" data-yte-history-direct="pdf">Baixar PDF</button><button class="btn secondary" type="button" data-yte-history-direct="docx">Baixar DOCX</button></div></div>`;
  document.body.appendChild(bg);
  const close=()=>bg.remove();bg.querySelector('[data-close]').onclick=close;bg.addEventListener('click',e=>{if(e.target===bg)close()});
  bg.querySelectorAll('[data-yte-history-direct]').forEach(b=>b.onclick=()=>runOutput(b,b.dataset.yteHistoryDirect,submissionId));
}

function enhance(){if(!youthId())return;decorateCard();decorateModal()}
function schedule(){clearTimeout(timer);timer=setTimeout(enhance,70)}

document.addEventListener('click',event=>{
  const direct=event.target.closest?.('[data-yte-direct-output]');
  if(direct){
    event.preventDefault();event.stopImmediatePropagation();
    runOutput(direct,direct.dataset.yteDirectOutput,direct.dataset.yteSubmissionId||null);return;
  }
  const legacyPrint=event.target.closest?.('[data-yte-print]');
  if(legacyPrint){
    event.preventDefault();event.stopImmediatePropagation();runOutput(legacyPrint,'print');return;
  }
  const historyOpen=event.target.closest?.('[data-yte-history]');
  if(historyOpen){
    const submissionId=historyOpen.dataset.yteHistory;if(!submissionId)return;
    event.preventDefault();event.stopImmediatePropagation();
    c().from('methodology_form_submissions').select('payload').eq('id',submissionId).maybeSingle().then(({data})=>{
      if(data?.payload?._trajectory_data)openHistorical(submissionId).catch(err=>alert(err.message||err));
      else historyOpen.click();
    }).catch(err=>alert(err.message||err));
  }
},true);

document.addEventListener('crj:trajectory-snapshot-created',()=>setTimeout(schedule,120));
window.addEventListener('hashchange',schedule);window.addEventListener('focus',schedule);
observer=new MutationObserver(()=>{if(youthId())schedule()});observer.observe(document.body,{childList:true,subtree:true});
schedule();
