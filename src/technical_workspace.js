import { apiMode, supabaseClient } from './api.js?v=20261004-2';
import { CONFIG } from './config.js';

const VIEW_ROLES=new Set(['assistente_social','psicologo','terapeuta_ocupacional','coordenacao_geral','monitoramento']);
const EXECUTE_ROLES=new Set(['assistente_social','psicologo','terapeuta_ocupacional']);
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const fmtTime=v=>String(v||'').slice(0,5);
const month=()=>new URLSearchParams(location.hash.split('?')[1]||'').get('month')||new Date().toISOString().slice(0,7);
const onRoute=()=>location.hash.split('?')[0]==='#equipe-tecnica';

let me=null;
let activeTab='planning';
let scheduled=false;

async function client(){
  for(let i=0;i<100;i++){
    if(apiMode()==='live')return supabaseClient();
    await new Promise(r=>setTimeout(r,60));
  }
  throw new Error('Banco ainda não conectado.');
}

async function resolveProfile(){
  const c=await client();
  const {data:{user}}=await c.auth.getUser();
  if(!user)return null;
  const {data,error}=await c.from('profiles').select('id,role,display_name,active').eq('id',user.id).maybeSingle();
  if(error)throw error;
  return data||null;
}

function canView(){return me?.active!==false&&VIEW_ROLES.has(String(me?.role||''))}
function canExecute(){return me?.active!==false&&EXECUTE_ROLES.has(String(me?.role||''))}
function headerHtml(){
  const src=window.__crjStandardDocumentHeader;
  return src?`<img src="${esc(src)}" alt="Cabeçalho institucional" style="display:block;max-width:330px;width:52%;margin:0 auto 12px">`:'';
}
function toast(text,type='success'){
  let box=document.querySelector('#technical-workspace-toast');
  if(!box){box=document.createElement('div');box.id='technical-workspace-toast';document.body.appendChild(box)}
  box.className=`tw-toast ${type}`;box.textContent=text;box.hidden=false;
  clearTimeout(box._timer);box._timer=setTimeout(()=>box.hidden=true,3600);
}

function installStyles(){
  if(document.querySelector('#technical-workspace-css'))return;
  const s=document.createElement('style');
  s.id='technical-workspace-css';
  s.textContent=`
#technical-workspace-nav{margin:0 0 14px;padding:14px;border:1px solid #dbe6e2;border-radius:16px;background:#fff}
.tw-tabs{display:flex;gap:7px;flex-wrap:wrap}.tw-tab{border:1px solid #cfddd8;background:#f7faf9;border-radius:999px;padding:8px 13px;cursor:pointer;font-weight:700}.tw-tab.active{background:#0b5b4c;color:#fff;border-color:#0b5b4c}
.tw-panel{margin-top:13px}.tw-panel[hidden]{display:none!important}.tw-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}.tw-card{border:1px solid #dbe6e2;border-radius:13px;padding:12px;background:#fff}.tw-card h4{margin:0 0 5px}.tw-meta{font-size:12px;color:#63736d;display:flex;gap:7px;flex-wrap:wrap;margin:6px 0}.tw-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.tw-note{font-size:12px;color:#687771}.tw-loading{padding:16px;text-align:center;color:#687771}
.tw-live-preview{margin-top:12px;border:1px solid #cddbd6;border-radius:12px;background:#fbfdfc;padding:12px}.tw-preview-page{background:#fff;border:1px solid #dfe7e4;border-radius:8px;padding:14px;box-shadow:0 2px 9px rgba(0,0,0,.04)}.tw-preview-page h4{margin:0 0 10px;text-align:center}.tw-preview-row{border:1px solid #dfe5e2;border-bottom:0;padding:7px;font-size:12px}.tw-preview-row:last-child{border-bottom:1px solid #dfe5e2}
.tw-link-box{margin:12px 0;padding:12px;border:1px solid #b8d8ce;border-radius:12px;background:#f1fbf7}.tw-link-line{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.tw-link-line input{flex:1;min-width:260px}.tw-evidence-table{width:100%;border-collapse:collapse;font-size:12px}.tw-evidence-table th,.tw-evidence-table td{border:1px solid #dfe5e2;padding:6px;text-align:left}
.tw-modal-bg{position:fixed;inset:0;background:rgba(15,25,22,.58);z-index:2147483555;display:grid;place-items:center;padding:16px}.tw-modal{width:min(1080px,97vw);max-height:94vh;overflow:auto;background:#fff;border-radius:16px;box-shadow:0 30px 90px rgba(0,0,0,.34)}.tw-modal-head{position:sticky;top:0;z-index:5;display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px;background:#fff;border-bottom:1px solid #e1e8e5}.tw-modal-body{padding:14px}.tw-modal-actions{position:sticky;bottom:0;z-index:5;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:12px 14px;background:#fff;border-top:1px solid #e1e8e5}.tw-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.tw-form-grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}
.tw-toast{position:fixed;right:18px;bottom:18px;z-index:2147483647;background:#153d35;color:#fff;padding:10px 14px;border-radius:10px;box-shadow:0 8px 22px rgba(0,0,0,.2)}.tw-toast.danger{background:#8f2626}
body[data-tw-tab="report"] #technical-program-actions,body[data-tw-tab="evidence"] #technical-program-actions{display:none!important}
@media(max-width:760px){.tw-form-grid,.tw-form-grid.two{grid-template-columns:1fr}.tw-link-line input{min-width:0;width:100%}.tw-modal-bg{padding:4px}.tw-modal{width:100%;max-height:99vh}}
`;
  document.head.appendChild(s);
}

async function loadData(){
  const c=await client(),m=month(),start=m+'-01';
  const d=new Date(start+'T00:00:00Z');
  const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)).toISOString().slice(0,10);
  const [plansQ,execQ,subQ]=await Promise.all([
    c.from('technical_action_plans').select('id,title,action_type,action_scope,objective,planned_activities,expected_results,planned_date,start_time,end_time,location_type,location_details,status,methodology_links,created_at,updated_at').gte('plan_month',start).lt('plan_month',end).order('planned_date',{ascending:true,nullsFirst:false}),
    c.from('technical_action_executions').select('*').gte('execution_date',start).lt('execution_date',end).order('execution_date',{ascending:false}),
    c.from('methodology_form_submissions').select('id,source_id,payload,submitted_at,updated_at').eq('form_slug','lista-presenca-contato').eq('source_type','technical_action').is('deleted_at',null).order('updated_at',{ascending:false})
  ]);
  for(const q of [plansQ,execQ,subQ])if(q.error)throw q.error;
  const plans=plansQ.data||[],ids=new Set(plans.map(x=>x.id));
  return {
    plans,
    executions:(execQ.data||[]).filter(x=>ids.has(x.plan_id)),
    submissions:(subQ.data||[]).filter(x=>ids.has(x.source_id))
  };
}

function planMeta(p){return `${fmtDate(p.planned_date)}${p.start_time?' · '+fmtTime(p.start_time):''}${p.end_time?'–'+fmtTime(p.end_time):''}`}
function navHtml(){
  return `<section id="technical-workspace-nav"><div><h2 style="margin:0 0 4px">Equipe Técnica</h2><div class="tw-note">Planejamento → presença por link → relatório → evidências.</div></div><div class="tw-tabs" style="margin-top:11px"><button class="tw-tab active" data-tw-tab="planning">Planejamento</button><button class="tw-tab" data-tw-tab="report">Relatório de execução</button><button class="tw-tab" data-tw-tab="evidence">Evidências</button></div><div class="tw-panel" id="tw-custom-panel" hidden></div><div id="tw-planning-docs"></div></section>`;
}

async function ensureWorkspace(){
  if(!onRoute())return;
  const anchor=document.querySelector('#technical-team-enhancement');
  if(!anchor)return;
  if(!me)me=await resolveProfile();
  if(!canView())return;
  installStyles();
  let nav=document.querySelector('#technical-workspace-nav');
  if(!nav){
    anchor.insertAdjacentHTML('afterbegin',navHtml());
    nav=document.querySelector('#technical-workspace-nav');
    bindNav(nav);
    activeTab='planning';document.body.dataset.twTab='planning';
    await renderTab();
  }
  injectPlanningPreview();
}

function bindNav(nav){
  nav.querySelectorAll('[data-tw-tab]').forEach(btn=>btn.addEventListener('click',async()=>{
    activeTab=btn.dataset.twTab;
    nav.querySelectorAll('[data-tw-tab]').forEach(x=>x.classList.toggle('active',x===btn));
    document.body.dataset.twTab=activeTab;
    nav.querySelector('#tw-custom-panel').hidden=activeTab==='planning';
    nav.querySelector('#tw-planning-docs').hidden=activeTab!=='planning';
    await renderTab();
  }));
}

async function renderTab(){
  const nav=document.querySelector('#technical-workspace-nav');if(!nav)return;
  const target=activeTab==='planning'?nav.querySelector('#tw-planning-docs'):nav.querySelector('#tw-custom-panel');
  target.innerHTML='<div class="tw-loading">Carregando...</div>';
  try{
    const data=await loadData();
    if(activeTab==='planning')renderPlanning(target,data);
    else if(activeTab==='report')renderReports(target,data);
    else renderEvidence(target,data);
  }catch(err){target.innerHTML=`<div class="notice danger"><b>Não foi possível carregar a área.</b><br>${esc(err.message||String(err))}</div>`}
}

function renderPlanning(root,data){
  root.innerHTML=`<div class="tw-card" style="margin-top:12px"><h3 style="margin-top:0">Documentos de planejamento</h3><div class="tw-note">O formulário principal de planejamento permanece abaixo. A pré-visualização é gerada durante a elaboração e os documentos salvos podem ser exportados aqui.</div><div class="tw-grid" style="margin-top:10px">${data.plans.map(p=>`<div class="tw-card"><h4>${esc(p.title)}</h4><div class="tw-meta"><span>${esc(String(p.action_type||'ação').toUpperCase())}</span><span>${esc(planMeta(p))}</span><span>${esc(p.status||'')}</span></div><div class="tw-actions"><button class="btn secondary" data-tw-tech-pdf="plan:${p.id}">Baixar PDF</button><button class="btn" data-tw-tech-print="plan:${p.id}">Imprimir</button></div></div>`).join('')||'<div class="empty">Nenhum planejamento técnico neste mês.</div>'}</div></div>`;
  bindTechnicalDocs(root);
}

function renderReports(root,data){
  root.innerHTML=`<div class="tw-card"><h3 style="margin-top:0">Relatórios de execução</h3><div class="tw-note">A presença é coletada exclusivamente pelo link da atividade. O relatório consolida a execução e fecha a evidência institucional.</div><div class="tw-grid" style="margin-top:10px">${data.plans.map(p=>{const ex=data.executions.find(x=>x.plan_id===p.id);return `<div class="tw-card"><h4>${esc(p.title)}</h4><div class="tw-meta"><span>${esc(planMeta(p))}</span><span>${ex?esc(ex.execution_status||'registrada'):'Sem execução registrada'}</span></div>${ex?.execution_description?`<div class="tw-note">${esc(String(ex.execution_description).slice(0,180))}${String(ex.execution_description).length>180?'…':''}</div>`:''}<div class="tw-actions">${canExecute()?`<button class="btn primary" data-tw-open-execution="${p.id}">${ex?'Editar relatório':'Elaborar relatório'}</button>`:''}${ex?`<button class="btn secondary" data-tw-tech-pdf="report:${ex.id}">Baixar PDF</button><button class="btn" data-tw-tech-print="report:${ex.id}">Imprimir</button>`:''}</div></div>`}).join('')||'<div class="empty">Nenhum planejamento disponível para relatório.</div>'}</div></div>`;
  root.querySelectorAll('[data-tw-open-execution]').forEach(b=>b.addEventListener('click',()=>openExecution(b.dataset.twOpenExecution)));
  bindTechnicalDocs(root);
}

function renderEvidence(root,data){
  root.innerHTML=`<div class="tw-card"><h3 style="margin-top:0">Evidências · listas geradas</h3><div class="tw-note">A relação de atendimento usa exclusivamente o nome completo cadastrado. Nome preferido/apelido não integra o documento.</div><div class="tw-grid" style="margin-top:10px">${data.submissions.map(s=>{const p=s.payload||{},rows=Array.isArray(p.participants)?p.participants:[];return `<div class="tw-card"><h4>${esc(p.activity||'Lista de presença e contato')}</h4><div class="tw-meta"><span>${esc(fmtDate(p.date))}</span><span>${rows.length} participante(s)</span></div><div class="tw-actions"><button class="btn secondary" data-tw-evidence-preview="${s.id}">Pré-visualizar</button><button class="btn primary" data-crj-evidence-action="pdf" data-evidence-submission-id="${s.id}">Baixar PDF</button><button class="btn" data-crj-evidence-action="print" data-evidence-submission-id="${s.id}">Imprimir</button></div></div>`}).join('')||'<div class="empty">Nenhuma lista gerada neste mês.</div>'}</div></div>`;
  root.querySelectorAll('[data-tw-evidence-preview]').forEach(b=>b.addEventListener('click',async()=>{
    const s=data.submissions.find(x=>x.id===b.dataset.twEvidencePreview);if(s)showEvidence(s);
  }));
}

function showModal(title,body){
  document.querySelector('#technical-workspace-modal')?.remove();
  document.body.insertAdjacentHTML('beforeend',`<div class="tw-modal-bg" id="technical-workspace-modal"><div class="tw-modal"><div class="tw-modal-head"><h3 style="margin:0">${esc(title)}</h3><button class="btn ghost" type="button" data-tw-close>Fechar</button></div><div class="tw-modal-body">${body}</div></div></div>`);
  const modal=document.querySelector('#technical-workspace-modal');
  modal.querySelector('[data-tw-close]')?.addEventListener('click',()=>modal.remove());
  return modal;
}

function evidenceBody(submission){
  const p=submission.payload||{},rows=Array.isArray(p.participants)?p.participants:[];
  return `<div class="tw-preview-page">${headerHtml()}<h4>LISTA DE PRESENÇA E CONTATO</h4><div class="tw-preview-row"><b>Atividade:</b> ${esc(p.activity||'')}</div><div class="tw-preview-row"><b>Local:</b> ${esc(p.location||'')}</div><div class="tw-preview-row"><b>Data:</b> ${esc(fmtDate(p.date))}</div><div style="overflow:auto;margin-top:10px"><table class="tw-evidence-table"><thead><tr><th>#</th><th>Nome completo</th><th>Nascimento</th><th>CPF</th><th>Telefone</th><th>E-mail</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.full_name||'Nome completo não disponível')}</td><td>${esc(fmtDate(r.birth_date))}</td><td>${esc(r.cpf||'')}</td><td>${esc(r.phone||'')}</td><td>${esc(r.email||'')}</td></tr>`).join('')||'<tr><td colspan="6">Nenhum participante.</td></tr>'}</tbody></table></div></div><div class="tw-actions"><button class="btn primary" data-crj-evidence-action="pdf" data-evidence-submission-id="${submission.id}">Baixar PDF</button><button class="btn" data-crj-evidence-action="print" data-evidence-submission-id="${submission.id}">Imprimir</button></div>`;
}
function showEvidence(s){showModal('Evidência · relação de atendimento',evidenceBody(s))}

async function showEvidenceForExecution(executionId){
  try{
    const c=await client();
    const {data:ex,error}=await c.from('technical_action_executions').select('attendance_submission_id').eq('id',executionId).maybeSingle();
    if(error)throw error;
    if(!ex?.attendance_submission_id)throw new Error('Esta execução ainda não possui uma lista de presença gerada.');
    const {data:s,error:e}=await c.from('methodology_form_submissions').select('id,payload,submitted_at,updated_at').eq('id',ex.attendance_submission_id).maybeSingle();
    if(e)throw e;if(!s)throw new Error('Evidência não localizada.');showEvidence(s);
  }catch(err){toast(err.message||String(err),'danger')}
}

async function openCheckin(planId,box){
  box.innerHTML='<div class="tw-loading">Gerando link de execução...</div>';
  try{
    const c=await client();
    const {data,error}=await c.rpc('open_technical_action_checkin',{p_plan_id:planId});
    if(error)throw error;
    if(!data?.token)throw new Error('O banco não retornou o token da lista.');
    const url=new URL('technical-checkin.html',location.href);url.search='?token='+encodeURIComponent(data.token);
    const link=url.href;
    box.innerHTML=`<b>Lista de presença da execução</b><div class="tw-note">Compartilhe este link durante a atividade. Identificação, cadastro provisório e assinatura seguem o fluxo institucional.</div><div class="tw-link-line" style="margin-top:8px"><input class="input" readonly value="${esc(link)}" data-tw-link><button type="button" class="btn secondary" data-tw-copy>Copiar link</button><a class="btn" href="${esc(link)}" target="_blank" rel="noopener">Abrir lista</a><button type="button" class="btn ghost" data-tw-count>Atualizar presenças</button></div><div class="tw-note" data-tw-count-label style="margin-top:7px">Consultando presenças...</div>`;
    box.querySelector('[data-tw-copy]')?.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(link);toast('Link da lista copiado.')}catch{toast('Não foi possível copiar automaticamente.','danger')}});
    const refresh=async()=>{const {data:s,error:e}=await c.rpc('technical_action_checkin_status',{p_plan_id:planId});box.querySelector('[data-tw-count-label]').textContent=e?'Não foi possível consultar a lista.':`${s?.count||0} presença(s) registrada(s) pelo link.`};
    box.querySelector('[data-tw-count]')?.addEventListener('click',refresh);await refresh();
  }catch(err){box.innerHTML=`<div class="notice danger"><b>Não foi possível gerar o link.</b><br>${esc(err.message||String(err))}</div>`}
}

function reportPreview(form,plan){
  const fd=new FormData(form);
  return `${headerHtml()}<h4>RELATÓRIO DE EXECUÇÃO · EQUIPE TÉCNICA</h4><div class="tw-preview-row"><b>Ação:</b> ${esc(plan.title||'')}</div><div class="tw-preview-row"><b>Data:</b> ${esc(fmtDate(fd.get('execution_date')))}</div><div class="tw-preview-row"><b>Horário:</b> ${esc(fd.get('actual_start')||'')}${fd.get('actual_end')?'–'+esc(fd.get('actual_end')):''}</div><div class="tw-preview-row"><b>Situação:</b> ${esc(fd.get('execution_status')||'')}</div><div class="tw-preview-row"><b>Descrição da execução:</b> ${esc(fd.get('execution_description')||'')}</div><div class="tw-preview-row"><b>Resultados alcançados:</b> ${esc(fd.get('results')||'')}</div><div class="tw-preview-row"><b>Encaminhamentos:</b> ${esc(fd.get('referrals')||'')}</div><div class="tw-preview-row"><b>Observações:</b> ${esc(fd.get('observations')||'')}</div>`;
}

async function openExecution(planId){
  if(!canExecute()){toast('Somente profissionais da Equipe Técnica podem registrar execução.','danger');return}
  try{
    const c=await client();
    const [planQ,execQ]=await Promise.all([
      c.from('technical_action_plans').select('*').eq('id',planId).maybeSingle(),
      c.from('technical_action_executions').select('*').eq('plan_id',planId).maybeSingle()
    ]);
    if(planQ.error)throw planQ.error;if(execQ.error&&execQ.error.code!=='PGRST116')throw execQ.error;
    const plan=planQ.data;if(!plan)throw new Error('Planejamento não localizado.');
    const ex=execQ.data||null;
    const body=`<form id="technical-execution-form"><div class="notice info"><b>Fluxo atual de execução.</b><br>A presença não é selecionada manualmente. Ela entra exclusivamente pelo link abaixo e é consolidada ao salvar o relatório.</div><div class="tw-link-box" data-tw-checkin></div><div class="tw-form-grid"><div class="field"><label>Data executada</label><input class="input" type="date" name="execution_date" value="${esc(ex?.execution_date||plan.planned_date||new Date().toISOString().slice(0,10))}"></div><div class="field"><label>Início real</label><input class="input" type="time" name="actual_start" value="${esc(fmtTime(ex?.actual_start||plan.start_time))}"></div><div class="field"><label>Fim real</label><input class="input" type="time" name="actual_end" value="${esc(fmtTime(ex?.actual_end||plan.end_time))}"></div></div><div class="tw-form-grid two"><div class="field"><label>Situação</label><select name="execution_status"><option value="realizada" ${!ex||ex.execution_status==='realizada'?'selected':''}>Realizada</option><option value="parcial" ${ex?.execution_status==='parcial'?'selected':''}>Parcial</option><option value="cancelada" ${ex?.execution_status==='cancelada'?'selected':''}>Cancelada</option></select></div><div class="field"><label>Duração executada (h)</label><input class="input" type="number" step="0.25" min="0" name="duration_hours" value="${esc(ex?.duration_hours??plan.planned_duration_hours??'')}"></div></div><div class="field"><label>Descrição da execução</label><textarea name="execution_description">${esc(ex?.execution_description||'')}</textarea></div><div class="field"><label>Resultados alcançados</label><textarea name="results">${esc(ex?.results||'')}</textarea></div><div class="tw-form-grid two"><div class="field"><label>Encaminhamentos</label><textarea name="referrals">${esc(ex?.referrals||'')}</textarea></div><div class="field"><label>Observações</label><textarea name="observations">${esc(ex?.observations||'')}</textarea></div></div><div class="tw-live-preview"><b>Pré-visualização do relatório de execução</b><div class="tw-preview-page" data-tw-report-preview style="margin-top:8px"></div></div><div class="tw-modal-actions"><button class="btn secondary" type="button" data-tw-cancel>Cancelar</button><button class="btn primary" type="submit">Salvar relatório</button></div></form>`;
    const modal=showModal(`Execução · ${plan.title||'Ação técnica'}`,body),form=modal.querySelector('#technical-execution-form');
    modal.querySelector('[data-tw-cancel]')?.addEventListener('click',()=>modal.remove());
    openCheckin(planId,form.querySelector('[data-tw-checkin]'));
    const update=()=>{form.querySelector('[data-tw-report-preview]').innerHTML=reportPreview(form,plan)};form.addEventListener('input',update);form.addEventListener('change',update);update();
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      const btn=form.querySelector('[type="submit"]'),label=btn.textContent,fd=new FormData(form);
      btn.disabled=true;btn.textContent='Salvando relatório...';
      try{
        const payload={
          plan_id:plan.id,
          execution_date:fd.get('execution_date')||'',
          actual_start:fd.get('actual_start')||'',
          actual_end:fd.get('actual_end')||'',
          duration_hours:fd.get('duration_hours')||'',
          execution_status:fd.get('execution_status')||'realizada',
          execution_description:String(fd.get('execution_description')||'').trim(),
          results:String(fd.get('results')||'').trim(),
          referrals:String(fd.get('referrals')||'').trim(),
          observations:String(fd.get('observations')||'').trim(),
          methodology_links:Array.isArray(plan.methodology_links)?plan.methodology_links:[]
        };
        const {data,error}=await c.rpc('save_technical_action_execution_v2',{p_execution:payload,p_youth_ids:[]});
        if(error)throw error;
        modal.remove();toast(`Relatório salvo · ${data?.participants||0} presença(s) integrada(s).`);
        document.querySelector('#technical-program-actions')?.remove();
        await renderTab();
      }catch(err){btn.disabled=false;btn.textContent=label;toast(err.message||String(err),'danger')}
    });
  }catch(err){toast(err.message||String(err),'danger')}
}

function injectPlanningPreview(){
  const form=document.querySelector('#tpa-plan-form');
  if(!form||form.dataset.twCanonicalPreview==='1')return;
  form.dataset.twCanonicalPreview='1';
  const box=document.createElement('div');box.className='tw-live-preview';box.innerHTML='<b>Pré-visualização do planejamento</b><div class="tw-preview-page" data-tw-plan-preview style="margin-top:8px"></div>';
  form.querySelector('.tpa-modal-actions')?.before(box);
  const update=()=>{
    const fd=new FormData(form),date=fd.get('planned_date'),start=fd.get('start_time'),end=fd.get('end_time');
    box.querySelector('[data-tw-plan-preview]').innerHTML=`${headerHtml()}<h4>PLANEJAMENTO · EQUIPE TÉCNICA</h4><div class="tw-preview-row"><b>Título:</b> ${esc(fd.get('title')||'Planejamento técnico')}</div><div class="tw-preview-row"><b>Ação:</b> ${esc(String(fd.get('action_type')||'').toUpperCase())}</div><div class="tw-preview-row"><b>Data/horário:</b> ${esc(date?fmtDate(date):'A definir')} ${esc(start||'')}${end?'–'+esc(end):''}</div><div class="tw-preview-row"><b>Objetivo:</b> ${esc(fd.get('objective')||'')}</div><div class="tw-preview-row"><b>Atividades/metodologia:</b> ${esc(fd.get('planned_activities')||'')}</div><div class="tw-preview-row"><b>Resultados esperados:</b> ${esc(fd.get('expected_results')||'')}</div>`;
  };
  form.addEventListener('input',update);form.addEventListener('change',update);update();
}

async function technicalPdf(kind,id,print=false){
  const c=await client(),{data:{session}}=await c.auth.getSession();if(!session)throw new Error('Sessão expirada.');
  const response=await fetch(`${CONFIG.supabaseUrl}/functions/v1/crj-export-technical`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json',apikey:CONFIG.supabasePublishableKey},body:JSON.stringify({kind,id})});
  if(!response.ok){let m='Falha ao gerar PDF.';try{m=(await response.json()).error||m}catch{}throw new Error(m)}
  const blob=await response.blob(),url=URL.createObjectURL(blob);
  if(print){
    const frame=document.createElement('iframe');Object.assign(frame.style,{position:'fixed',width:'1px',height:'1px',right:'0',bottom:'0',opacity:'0',border:'0'});document.body.appendChild(frame);
    frame.onload=()=>setTimeout(()=>{try{frame.contentWindow.focus();frame.contentWindow.print()}finally{setTimeout(()=>{frame.remove();URL.revokeObjectURL(url)},60000)}},350);frame.src=url;
  }else{
    const a=document.createElement('a');a.href=url;a.download=`${kind==='plan'?'planejamento':'relatorio'}-equipe-tecnica.pdf`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
  }
}

function bindTechnicalDocs(root){
  root.querySelectorAll('[data-tw-tech-pdf],[data-tw-tech-print]').forEach(b=>b.addEventListener('click',async()=>{
    const raw=b.dataset.twTechPdf||b.dataset.twTechPrint,[kind,id]=raw.split(':'),old=b.textContent;b.disabled=true;b.textContent='Gerando...';
    try{await technicalPdf(kind,id,Boolean(b.dataset.twTechPrint))}catch(err){toast(err.message||String(err),'danger')}finally{b.disabled=false;b.textContent=old}
  }));
}

// A execução/lista antiga continua no módulo de planejamento apenas como fallback técnico.
// Enquanto este workspace estiver carregado, estes cliques são direcionados ao fluxo canônico
// antes que os listeners antigos sejam executados.
document.addEventListener('click',e=>{
  const exec=e.target.closest?.('[data-tpa-execute]');
  if(exec&&onRoute()){
    e.preventDefault();e.stopImmediatePropagation();openExecution(exec.dataset.tpaExecute);return;
  }
  const attendance=e.target.closest?.('[data-tpa-attendance]');
  if(attendance&&onRoute()){
    e.preventDefault();e.stopImmediatePropagation();showEvidenceForExecution(attendance.dataset.tpaAttendance);
  }
},true);

function schedule(){
  if(scheduled)return;scheduled=true;
  setTimeout(()=>{scheduled=false;ensureWorkspace().catch(err=>console.warn('Technical workspace',err))},100);
}

const observer=new MutationObserver(()=>{
  injectPlanningPreview();
  if(onRoute()&&!document.querySelector('#technical-workspace-nav')&&document.querySelector('#technical-team-enhancement'))schedule();
});
observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>{
  document.querySelector('#technical-workspace-nav')?.remove();
  document.querySelector('#technical-workspace-modal')?.remove();
  activeTab='planning';delete document.body.dataset.twTab;schedule();
});
schedule();
