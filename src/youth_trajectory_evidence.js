import { apiMode, supabaseClient } from './api.js?v=20261004-2';

let timer=null,loading=false,lastYouth='';
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=v=>String(v||'').replace(/\s+/g,' ').trim();
const c=()=>{if(apiMode()!=='live')throw new Error('Banco ainda não conectado.');return supabaseClient()};
const parts=()=>String(location.hash||'#dashboard').split('?')[0].replace(/^#/,'').split('/');
const youthId=()=>parts()[0]==='jovem'?(parts()[1]||null):null;
const fmtDate=v=>v?new Date(String(v).length===10?`${v}T12:00:00`:v).toLocaleDateString('pt-BR'):'—';
const fmtDateTime=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
const fmtHours=v=>`${Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})} h`;
const pct=v=>`${Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`;

function style(){
  if(document.querySelector('#yte-style'))return;
  const s=document.createElement('style');s.id='yte-style';s.textContent=`
  .yte-card{border:1px solid #cfe2dc;background:#f8fcfa;border-radius:16px;padding:14px;margin:12px 0 16px}.yte-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.yte-head h3,.yte-head h4{margin:0}.yte-muted{font-size:12px;color:var(--muted,#687671)}.yte-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-top:12px}.yte-kpi{background:#fff;border:1px solid #e0e8e5;border-radius:12px;padding:10px}.yte-kpi span{font-size:10px;color:#687671;display:block}.yte-kpi b{font-size:20px;display:block;margin-top:2px}.yte-actions{display:flex;gap:7px;flex-wrap:wrap}.yte-modal-bg{position:fixed;inset:0;z-index:2147483550;background:rgba(7,20,24,.72);display:grid;place-items:center;padding:10px}.yte-modal{width:min(1240px,99vw);max-height:97vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 30px 90px rgba(0,0,0,.35)}.yte-modal-head{position:sticky;top:0;z-index:4;background:#fff;border-bottom:1px solid #e1e9e6;padding:14px 18px;display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.yte-modal-body{padding:18px}.yte-modal-actions{position:sticky;bottom:0;background:#fff;border-top:1px solid #e1e9e6;padding:12px 18px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}.yte-close{border:0;background:transparent;font-size:26px;cursor:pointer}.yte-section{margin-top:18px}.yte-section h4{margin:0 0 8px}.yte-table-wrap{overflow:auto;border:1px solid #e1e8e5;border-radius:12px}.yte-table{width:100%;border-collapse:collapse;font-size:11px}.yte-table th,.yte-table td{padding:7px 8px;border-bottom:1px solid #e6ece9;text-align:left;vertical-align:top}.yte-table th{background:#f4f8f6;position:sticky;top:0}.yte-table tr:last-child td{border-bottom:0}.yte-ok{color:#17633f;font-weight:750}.yte-miss{color:#8a4f13;font-weight:750}.yte-tag{display:inline-block;margin:2px 4px 2px 0;padding:3px 6px;border-radius:999px;background:#edf4f2;font-size:9px}.yte-note{border:1px solid #ecd69e;background:#fffaf0;border-radius:11px;padding:10px;font-size:11px;margin-top:10px}.yte-history{display:flex;flex-direction:column;gap:7px}.yte-history-row{border:1px solid #e2e9e6;border-radius:10px;padding:9px;display:flex;justify-content:space-between;gap:10px;align-items:center}.yte-empty{padding:14px;color:#687671;text-align:center}.yte-doc-header{display:none}
  @media(max-width:900px){.yte-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:640px){.yte-kpis{grid-template-columns:1fr 1fr}.yte-modal-bg{padding:2px}.yte-modal{width:100%;max-height:99vh}.yte-modal-body{padding:12px}}
  `;document.head.appendChild(s);
}

function kpis(t={}){
  return `<div class="yte-kpis"><div class="yte-kpi"><span>Participações confirmadas</span><b>${Number(t.participations||0)}</b></div><div class="yte-kpi"><span>Carga horária realizada</span><b>${fmtHours(t.participated_hours)}</b></div><div class="yte-kpi"><span>Não participou</span><b>${Number(t.missed_actions||0)}</b></div><div class="yte-kpi"><span>Carga horária não realizada</span><b>${fmtHours(t.missed_hours)}</b></div><div class="yte-kpi"><span>Taxa de participação</span><b>${pct(t.participation_rate)}</b></div></div>`;
}

function areaTable(rows=[]){
  return `<div class="yte-table-wrap"><table class="yte-table"><thead><tr><th>Área</th><th>Participações</th><th>Horas realizadas</th><th>Não participou</th><th>Horas não realizadas</th><th>Oportunidades documentadas</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.area_label||r.area_code)}</b></td><td>${Number(r.participations||0)}</td><td>${esc(fmtHours(r.participated_hours))}</td><td>${Number(r.missed_actions||0)}</td><td>${esc(fmtHours(r.missed_hours))}</td><td>${Number(r.documented_opportunities||0)}</td></tr>`).join('')||'<tr><td colspan="6" class="yte-empty">Ainda não há ocorrências documentadas.</td></tr>'}</tbody></table></div>`;
}

function linkTags(links=[]){
  const seen=new Set();return (links||[]).filter(x=>{const k=`${x.area_code||''}|${x.subcategory||''}|${x.label||''}`;if(seen.has(k))return false;seen.add(k);return true}).map(x=>`<span class="yte-tag">${esc(x.label||x.subcategory||x.area_code)}</span>`).join('');
}

function actionsTable(rows=[],missed=false){
  return `<div class="yte-table-wrap"><table class="yte-table"><thead><tr><th>Data</th><th>Ação</th><th>Área</th><th>Carga horária</th><th>Participação</th><th>Base da evidência</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(fmtDate(r.action_date))}</td><td><b>${esc(clean(r.title)||'Ação')}</b><div>${linkTags(r.links)}</div></td><td>${esc(r.area_label||r.area_code)}<br><span class="yte-muted">${esc(r.subcategory||'')}</span></td><td>${esc(fmtHours(r.hours))}</td><td class="${missed?'yte-miss':'yte-ok'}">${missed?'Não participou':'Participou'}</td><td>${esc(r.evidence_basis||'')}</td></tr>`).join('')||`<tr><td colspan="6" class="yte-empty">${missed?'Nenhuma não participação documentada.':'Nenhuma participação documentada.'}</td></tr>`}</tbody></table></div>`;
}

function timelineTable(rows=[]){
  return `<div class="yte-table-wrap"><table class="yte-table"><thead><tr><th>Data</th><th>Tipo</th><th>Registro da trajetória</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(fmtDateTime(r.event_date))}</td><td>${esc(r.event_type||'')}</td><td>${esc(clean(r.title)||'Registro')}</td></tr>`).join('')||'<tr><td colspan="3" class="yte-empty">Sem outros registros na trajetória.</td></tr>'}</tbody></table></div>`;
}

async function loadEvidence(id){
  const {data,error}=await c().rpc('get_youth_trajectory_evidence',{p_youth_id:id});if(error)throw error;return data;
}
async function loadHistory(id){
  const {data,error}=await c().from('methodology_form_submissions').select('id,payload,submitted_at,created_by').eq('youth_id',id).eq('form_slug','trajetoria-jovem').is('deleted_at',null).order('submitted_at',{ascending:false}).limit(8);if(error)throw error;return data||[];
}

async function headerDataUrl(){
  const src=window.__crjStandardDocumentHeader;if(!src)return '';
  try{const response=await fetch(src);const blob=await response.blob();return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob)})}catch{return ''}
}

function printHtml(data,header=''){
  const y=data.youth||{},t=data.totals||{};
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Evidência da trajetória · ${esc(y.full_name||'Jovem')}</title><style>@page{size:A4 landscape;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;font-size:10px;margin:0}.header{width:100%;max-height:78px;object-fit:contain;margin-bottom:8px}.title{font-size:17px;font-weight:700;margin:4px 0}.meta{font-size:10px;margin-bottom:10px}.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin:10px 0}.kpi{border:1px solid #aaa;padding:6px}.kpi b{display:block;font-size:14px;margin-top:2px}h2{font-size:13px;margin:14px 0 5px}table{width:100%;border-collapse:collapse;font-size:8px;page-break-inside:auto}tr{page-break-inside:avoid}th,td{border:1px solid #999;padding:4px;vertical-align:top}th{background:#eee}.note{border:1px solid #bbb;padding:6px;margin-top:8px}.small{font-size:8px}.page-break{page-break-before:always}</style></head><body>${header?`<img class="header" src="${header}" alt="Cabeçalho institucional">`:''}<div class="title">EVIDÊNCIA INDIVIDUAL DA TRAJETÓRIA DO JOVEM</div><div class="meta"><b>Nome completo:</b> ${esc(y.full_name||'')} · <b>Nascimento:</b> ${esc(fmtDate(y.birth_date))} · <b>CPF:</b> ${esc(y.cpf||'')} · <b>Território:</b> ${esc([y.neighborhood,y.municipality].filter(Boolean).join(' · '))}<br><b>Gerada em:</b> ${esc(fmtDateTime(data.generated_at))}</div><div class="kpis"><div class="kpi">Participações<b>${Number(t.participations||0)}</b></div><div class="kpi">Horas realizadas<b>${esc(fmtHours(t.participated_hours))}</b></div><div class="kpi">Não participou<b>${Number(t.missed_actions||0)}</b></div><div class="kpi">Horas não realizadas<b>${esc(fmtHours(t.missed_hours))}</b></div><div class="kpi">Taxa de participação<b>${esc(pct(t.participation_rate))}</b></div></div><h2>Resumo por área</h2>${areaTable(data.by_area||[]).replaceAll('class="yte-table-wrap"','').replaceAll('class="yte-table"','')}<h2>Ações em que participou</h2>${actionsTable(data.participated_actions||[],false).replaceAll('class="yte-table-wrap"','').replaceAll('class="yte-table"','').replaceAll('class="yte-ok"','').replaceAll('class="yte-muted"','class="small"').replaceAll('class="yte-tag"','class="small"')}<h2 class="page-break">Ações em que não participou</h2>${actionsTable(data.not_participated_actions||[],true).replaceAll('class="yte-table-wrap"','').replaceAll('class="yte-table"','').replaceAll('class="yte-miss"','').replaceAll('class="yte-muted"','class="small"').replaceAll('class="yte-tag"','class="small"')}<h2>Demais registros da trajetória</h2>${timelineTable(data.timeline||[]).replaceAll('class="yte-table-wrap"','').replaceAll('class="yte-table"','')}<div class="note"><b>Critério de não participação:</b> ${esc(data.criteria?.not_participated||'')}<br><b>Critério de carga horária:</b> ${esc(data.criteria?.hours||'')}</div><script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`;
}

async function printEvidence(data){
  const header=await headerDataUrl();const w=window.open('','_blank','noopener,noreferrer');if(!w)throw new Error('O navegador bloqueou a janela de impressão.');w.document.open();w.document.write(printHtml(data,header));w.document.close();
}

function historyHtml(rows=[]){
  return `<div class="yte-history">${rows.map((r,i)=>`<div class="yte-history-row"><div><b>Evidência #${rows.length-i}</b><div class="yte-muted">Gerada em ${esc(fmtDateTime(r.submitted_at))}</div></div><button class="btn ghost" type="button" data-yte-history="${esc(r.id)}">Abrir versão</button></div>`).join('')||'<div class="yte-empty">Nenhuma versão oficial congelada ainda.</div>'}</div>`;
}

async function openModal(current){
  document.querySelector('#yte-modal')?.remove();
  const id=current.youth?.id||youthId();const bg=document.createElement('div');bg.className='yte-modal-bg';bg.id='yte-modal';
  bg.innerHTML=`<div class="yte-modal"><div class="yte-modal-head"><div><h3>Evidência individual da trajetória</h3><div class="yte-muted">${esc(current.youth?.full_name||'')} · leitura atual do cadastro, presenças e execuções</div></div><button class="yte-close" type="button" data-yte-close>✕</button></div><div class="yte-modal-body"><section>${kpis(current.totals)}</section><section class="yte-section"><h4>Resumo por área</h4>${areaTable(current.by_area||[])}</section><section class="yte-section"><h4>Ações em que participou</h4>${actionsTable(current.participated_actions||[],false)}</section><section class="yte-section"><h4>Ações em que não participou</h4>${actionsTable(current.not_participated_actions||[],true)}<div class="yte-note"><b>Regra de ausência:</b> ${esc(current.criteria?.not_participated||'')}</div></section><section class="yte-section"><h4>Demais registros da trajetória</h4>${timelineTable(current.timeline||[])}</section><section class="yte-section"><div class="yte-head"><div><h4>Versões oficiais já geradas</h4><div class="yte-muted">Cada geração congela a leitura daquele momento para auditoria.</div></div><button class="btn ghost" type="button" data-yte-refresh-history>Atualizar histórico</button></div><div data-yte-history-list><div class="yte-empty">Carregando…</div></div></section></div><div class="yte-modal-actions"><button class="btn ghost" type="button" data-yte-print>Imprimir / salvar PDF</button><button class="btn primary" type="button" data-yte-save>Gerar evidência oficial</button></div></div>`;
  document.body.appendChild(bg);
  const close=()=>bg.remove();bg.querySelector('[data-yte-close]').onclick=close;bg.addEventListener('click',e=>{if(e.target===bg)close()});
  let history=[];
  const renderHistory=async()=>{const box=bg.querySelector('[data-yte-history-list]');try{history=await loadHistory(id);box.innerHTML=historyHtml(history);box.querySelectorAll('[data-yte-history]').forEach(b=>b.onclick=()=>{const row=history.find(x=>x.id===b.dataset.yteHistory);if(row?.payload)openModal(row.payload)})}catch(err){box.innerHTML=`<div class="yte-empty">${esc(err.message||String(err))}</div>`}};
  bg.querySelector('[data-yte-refresh-history]').onclick=renderHistory;
  bg.querySelector('[data-yte-print]').onclick=async e=>{e.currentTarget.disabled=true;try{await printEvidence(current)}catch(err){alert(err.message||err)}finally{e.currentTarget.disabled=false}};
  bg.querySelector('[data-yte-save]').onclick=async e=>{const b=e.currentTarget;b.disabled=true;b.textContent='Gerando…';try{const {data,error}=await c().rpc('save_youth_trajectory_evidence',{p_youth_id:id});if(error)throw error;current=data?.payload||current;alert('Evidência oficial da trajetória gerada e armazenada no histórico documental.');await renderHistory();await render(true)}catch(err){alert(err.message||err)}finally{b.disabled=false;b.textContent='Gerar evidência oficial'}};
  await renderHistory();
}

async function render(force=false){
  const id=youthId();if(!id||loading)return;
  const host=document.querySelector('.content');const head=host?.querySelector('.page-head');if(!host||!head)return;
  if(!force&&id===lastYouth&&host.querySelector('[data-yte-card]'))return;
  loading=true;
  try{
    style();const data=await loadEvidence(id);if(id!==youthId())return;
    host.querySelector('[data-yte-card]')?.remove();
    const card=document.createElement('section');card.className='yte-card';card.dataset.yteCard=id;card.innerHTML=`<div class="yte-head"><div><h3>Evidência da trajetória do jovem</h3><div class="yte-muted">Participações e não participações documentadas, com carga horária e rastreabilidade por ação.</div></div><div class="yte-actions"><button class="btn ghost" type="button" data-yte-update>Atualizar</button><button class="btn primary" type="button" data-yte-open>Abrir evidência completa</button></div></div>${kpis(data.totals)}<div class="yte-note"><b>Não participou</b> não significa que o jovem faltou a toda atividade do CRJ. Só entra quando havia vínculo objetivo com aquela ação e não existe presença confirmada.</div>`;
    head.insertAdjacentElement('afterend',card);
    card.querySelector('[data-yte-open]').onclick=()=>openModal(data);
    card.querySelector('[data-yte-update]').onclick=()=>render(true);
    lastYouth=id;
  }catch(err){console.warn('Evidência da trajetória indisponível:',err)}finally{loading=false}
}

function schedule(){clearTimeout(timer);timer=setTimeout(()=>render().catch(()=>{}),120)}
new MutationObserver(()=>{if(youthId())schedule()}).observe(document.body,{subtree:true,childList:true});
window.addEventListener('hashchange',()=>{lastYouth='';schedule()});
window.addEventListener('focus',()=>{if(youthId())schedule()});
schedule();
