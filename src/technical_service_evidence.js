import { apiMode, supabaseClient } from './api.js?v=20261004-2';
import { canRegisterTechnicalService } from './permissions.js?v=20261026-technical-service1';
import { openTechnicalService } from './technical_service_flow.js?v=20261029-methodology1';
import { downloadEvidence } from './evidence_exports.js?v=20261023-checkin1';

const labels={pvida:'PVida',ptrampo:'PTrampo','outras-demandas':'Outras Demandas',atendimento:'Atendimento técnico (anterior)',acompanhamento:'Acompanhamento técnico (anterior)'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v?String(v).slice(0,10).split('-').reverse().join('/'):'—';
const month=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date());
const client=()=>{if(apiMode()!=='live')throw new Error('Banco ainda não conectado.');return supabaseClient()};

async function rowsAll(factory){
  const rows=[];const size=500;
  for(let offset=0;;offset+=size){
    const {data,error}=await factory().range(offset,offset+size-1);
    if(error)throw error;rows.push(...(data||[]));if((data||[]).length<size)return rows;
  }
}
async function byIds(table,columns,key,ids,extra=q=>q){
  if(!ids.length)return [];
  const out=[];
  for(let i=0;i<ids.length;i+=100){
    const batch=ids.slice(i,i+100);
    out.push(...await rowsAll(()=>extra(client().from(table).select(columns).in(key,batch).order(key))));
  }
  return out;
}
function bounds(mode,m,start,end){
  if(mode==='all')return {start:null,end:null};
  if(mode==='range')return {start:start||null,end:end||null};
  const [y,n]=m.split('-').map(Number);
  return {start:m+'-01',end:new Date(Date.UTC(y,n,0)).toISOString().slice(0,10)};
}
export function filterEvidenceRows(rows,filters){
  return rows.filter(r=>(!filters.type||r.program_type===filters.type)&&
    (!filters.gender||r.gender_identity===filters.gender)&&
    (!filters.orientation||r.sexual_orientation===filters.orientation)&&
    (!filters.race||r.race===filters.race));
}
async function loadEvidence(filters){
  const {start,end}=bounds(filters.mode,filters.month,filters.start,filters.end);
  if(filters.mode==='range'&&(!start||!end||start>end))throw new Error('Informe um período válido, com data inicial e final.');
  const services=await rowsAll(()=>{
    let q=client().from('technical_service_records').select('id,service_date,service_type,program_type,status,source_form_submission_id').order('service_date',{ascending:false}).order('id');
    if(start)q=q.gte('service_date',start);if(end)q=q.lte('service_date',end);return q;
  });
  const ids=services.map(s=>s.id);
  const [links,docs]=await Promise.all([
    byIds('technical_service_youth','service_id,youth_id','service_id',ids),
    byIds('methodology_form_submissions','id,source_id,form_slug,youth_id,record_state','source_id',ids,q=>q.eq('source_type','technical_service_records').is('deleted_at',null))
  ]);
  const youthIds=[...new Set(links.map(x=>x.youth_id))];
  const [people,demographics]=await Promise.all([
    byIds('young_people','id,full_name,preferred_name','id',youthIds),
    byIds('youth_demographics','youth_id,gender_identity,sexual_orientation,race','youth_id',youthIds)
  ]);
  const peopleMap=new Map(people.map(x=>[x.id,x])),demoMap=new Map(demographics.map(x=>[x.youth_id,x])),serviceMap=new Map(services.map(x=>[x.id,x]));
  return links.map(link=>{
    const s=serviceMap.get(link.service_id),p=peopleMap.get(link.youth_id)||{},d=demoMap.get(link.youth_id)||{};
    return s?{...s,...d,youth_id:link.youth_id,youth_name:p.full_name||p.preferred_name||'Jovem',documents:docs.filter(x=>x.source_id===s.id&&x.youth_id===link.youth_id)}:null;
  }).filter(Boolean);
}
function options(rows,key,current){
  return [...new Set(rows.map(x=>x[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')).map(v=>`<option value="${esc(v)}" ${v===current?'selected':''}>${esc(v)}</option>`).join('');
}
function printRows(rows,filters){
  const popup=window.open('','_blank','width=1000,height=700');
  if(!popup)throw new Error('Permita janelas de impressão no navegador.');
  const title=filters.mode==='all'?'Todos os atendimentos':filters.mode==='month'?'Mês '+filters.month:fmt(filters.start)+' a '+fmt(filters.end);
  popup.document.write(`<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><title>Evidência de atendimentos</title><style>@page{size:A4;margin:12mm}body{font:11px Arial}h1{font-size:16px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #333;padding:5px;text-align:left}</style></head><body><h1>CRJ Cariacica · Evidência de atendimentos técnicos</h1><p>${esc(title)} · ${rows.length} registros nominais</p><table><thead><tr><th>Data</th><th>Jovem</th><th>Tipo</th><th>Modalidade</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(fmt(r.service_date))}</td><td>${esc(r.youth_name)}</td><td>${esc(labels[r.program_type]||r.program_type)}</td><td>${r.service_type==='coletivo'?'Coletivo':'Individual'}</td></tr>`).join('')}</tbody></table><script>window.onload=()=>window.print()<\/script></body></html>`);
  popup.document.close();
}
export async function renderTechnicalServiceEvidence(root,profile=null){
  const filters={mode:'month',month:month(),start:'',end:'',type:'',gender:'',orientation:'',race:''};
  let all=[],visible=[];
  root.innerHTML=`<div class="tw-card" style="margin:12px 0"><h3>Evidências de atendimentos</h3><p class="tw-note">Filtre os atendimentos e baixe os anexos de cada jovem. Registros anteriores permanecem disponíveis.</p><div class="tsf-evidence-filters" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end"><label>Período<br><select data-ev-mode><option value="month">Mês</option><option value="all">Atendimentos gerais</option><option value="range">Definir período</option></select></label><label data-ev-month-wrap>Mês<br><input type="month" data-ev-month value="${filters.month}"></label><label data-ev-start-wrap hidden>De<br><input type="date" data-ev-start></label><label data-ev-end-wrap hidden>Até<br><input type="date" data-ev-end></label><label>Tipo<br><select data-ev-type><option value="">Todos</option>${Object.entries(labels).map(([k,v])=>`<option value="${k}">${esc(v)}</option>`).join('')}</select></label><label>Gênero<br><select data-ev-gender><option value="">Todos</option></select></label><label>Orientação sexual<br><select data-ev-orientation><option value="">Todas</option></select></label><label>Raça/cor<br><select data-ev-race><option value="">Todas</option></select></label><button class="btn secondary" type="button" data-ev-print>Imprimir / salvar PDF</button></div><div data-ev-results style="margin-top:12px">Carregando…</div></div>`;
  const el=name=>root.querySelector('[data-ev-'+name+']');
  const draw=()=>{
    visible=filterEvidenceRows(all,filters);
    el('results').innerHTML=`<p class="tw-note">${visible.length} registro(s) nominal(is) · ${new Set(visible.map(x=>x.youth_id)).size} jovem(ns) único(s)</p><div style="overflow:auto"><table class="tw-evidence-table"><thead><tr><th>Data</th><th>Jovem</th><th>Tipo</th><th>Evidências e acompanhamento</th></tr></thead><tbody>${visible.map((r,i)=>`<tr><td>${esc(fmt(r.service_date))}</td><td>${esc(r.youth_name)}</td><td>${esc(labels[r.program_type]||r.program_type)}${r.status==='cancelado'?' · Cancelado':''}</td><td><div class="actions">${r.documents.map(d=>`<button type="button" class="btn secondary" data-ev-download="${esc(d.id)}" data-format="pdf">${d.form_slug==='acompanhamento'?'Anexo 3':d.form_slug==='pvida'?'Anexo 4':d.form_slug==='outras-demandas'?'Anexo 5':'Anexo 6'} PDF${d.record_state==='draft'?' · parcial':''}</button><button type="button" class="btn" data-ev-download="${esc(d.id)}" data-format="docx">DOCX</button>`).join('')||'<span class="tw-note">Sem anexo vinculado</span>'}${canRegisterTechnicalService(profile)&&['pvida','ptrampo','outras-demandas'].includes(r.program_type)?`<button type="button" class="btn" data-ev-follow="${i}">Acompanhamento</button>`:''}</div></td></tr>`).join('')||'<tr><td colspan="4">Nenhum atendimento para estes filtros.</td></tr>'}</tbody></table></div>`;
    el('results').querySelectorAll('[data-ev-download]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await downloadEvidence(b.dataset.evDownload,b.dataset.format)}catch(e){alert(e.message||e)}finally{b.disabled=false}});
    el('results').querySelectorAll('[data-ev-follow]').forEach(b=>b.onclick=()=>{const r=visible[Number(b.dataset.evFollow)];openTechnicalService({initialYouthId:r.youth_id,initialProgram:r.program_type,followupServiceId:r.id})});
  };
  const load=async()=>{
    el('results').textContent='Carregando atendimentos…';
    try{
      all=await loadEvidence(filters);
      for(const [field,key] of [['gender','gender_identity'],['orientation','sexual_orientation'],['race','race']]){
        const select=el(field),current=filters[field];select.innerHTML='<option value="">Todos</option>'+options(all,key,current);
      }
      draw();
    }catch(e){el('results').textContent='Não foi possível carregar as evidências: '+(e.message||e)}
  };
  el('mode').onchange=()=>{filters.mode=el('mode').value;el('month-wrap').hidden=filters.mode!=='month';el('start-wrap').hidden=el('end-wrap').hidden=filters.mode!=='range';if(filters.mode!=='range'||filters.start&&filters.end)load()};
  for(const key of ['month','start','end'])el(key).onchange=()=>{filters[key]=el(key).value;if(filters.mode!=='range'||filters.start&&filters.end)load()};
  for(const key of ['type','gender','orientation','race'])el(key).onchange=()=>{filters[key]=el(key).value;draw()};
  el('print').onclick=()=>{try{printRows(visible,filters)}catch(e){alert(e.message||e)}};
  await load();
}

export async function openYouthFollowups(youthId){
  const previous=await rowsAll(()=>client().from('technical_service_youth').select('service_id').eq('youth_id',youthId).order('service_id'));
  const services=(await byIds('technical_service_records','id,service_date,program_type,status','id',previous.map(x=>x.service_id)))
    .filter(r=>['pvida','ptrampo','outras-demandas'].includes(r.program_type)).sort((a,b)=>String(b.service_date).localeCompare(String(a.service_date)));
  const modal=document.createElement('div');modal.className='tsf-bg';modal.innerHTML=`<div class="tsf-modal"><div class="tsf-head"><h3>Acompanhamentos do jovem</h3><button type="button" class="tsf-close" data-close>×</button></div><div class="tsf-body">${services.map((s,i)=>`<div class="tsf-selected"><div><b>${esc(labels[s.program_type])}</b><small>${esc(fmt(s.service_date))}</small></div><button type="button" data-follow="${i}">Registrar evolução</button></div>`).join('')||'<p>Nenhum atendimento anterior. Use + Atendimento para iniciar.</p>'}</div></div>`;
  document.body.appendChild(modal);modal.querySelector('[data-close]').onclick=()=>modal.remove();
  modal.querySelectorAll('[data-follow]').forEach(b=>b.onclick=()=>{const s=services[Number(b.dataset.follow)];modal.remove();openTechnicalService({initialYouthId:youthId,returnYouthId:youthId,initialProgram:s.program_type,followupServiceId:s.id})});
}
