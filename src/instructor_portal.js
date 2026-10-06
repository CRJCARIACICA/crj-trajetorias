import { apiMode, supabaseClient } from './api.js?v=20261004-2';

const HOURLY_RATE=71.67;
const AVANTE={
  legalName:'Instituto Jurídico para efetivação da cidadania e saúde',
  cnpj:'03.893.350/0001-12',
  address:'R. José Hemetério Andrade, 950, andares 5 e 6, Buritis, Belo Horizonte - MG, CEP 30493-180'
};

let me=null,observer=null,timer=null,rendering=false,styleReady=false;
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const client=()=>{if(apiMode()!=='live')throw new Error('Banco ainda não conectado.');return supabaseClient()};
const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const num=v=>Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:Number(v||0)%1?2:0,maximumFractionDigits:2});

function localParts(){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=t=>parts.find(x=>x.type===t)?.value||'';
  return {year:Number(get('year')),month:Number(get('month')),day:Number(get('day')),ymd:`${get('year')}-${get('month')}-${get('day')}`};
}
function monthStart(year,month){return `${year}-${String(month).padStart(2,'0')}-01`}
function addMonth(monthDate,delta=1){const [y,m]=String(monthDate).slice(0,7).split('-').map(Number);const d=new Date(Date.UTC(y,m-1+delta,1));return d.toISOString().slice(0,10)}
function currentReferenceMonth(){const p=localParts();return monthStart(p.year,p.month)}
function monthLabel(v){if(!v)return '—';const [y,m]=String(v).slice(0,7).split('-').map(Number);return new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',month:'long',year:'numeric'}).format(new Date(Date.UTC(y,m-1,1)))}
function shortMonth(v){if(!v)return '—';const [y,m]=String(v).slice(0,7).split('-').map(Number);return `${String(m).padStart(2,'0')}/${y}`}
function fmtDate(v){if(!v)return '—';const [y,m,d]=String(v).slice(0,10).split('-');return `${d}/${m}/${y}`}
function time5(v){return String(v||'').slice(0,5)}
function routeName(){return (location.hash||'#dashboard').slice(1).split('?')[0].split('/')[0]||'dashboard'}
function params(){return new URLSearchParams((location.hash.split('?')[1]||''))}
function isInstructor(){return me?.role==='oficineiro'&&me?.active!==false}
function routeAllowed(){return ['oficineiro','caixa-equipes'].includes(routeName())}
function deadlineFor(referenceMonth,day,monthOffset=0){const m=addMonth(referenceMonth,monthOffset);return `${m.slice(0,7)}-${String(day).padStart(2,'0')}`}
function daysBetween(a,b){return Math.round((Date.parse(`${b}T12:00:00Z`)-Date.parse(`${a}T12:00:00Z`))/86400000)}
function statusInfo(doneAt,deadline,{futureLabel='Prazo'}={}){
  if(doneAt)return {kind:'success',label:'Concluído',detail:`Registrado em ${fmtDate(String(doneAt).slice(0,10))}`};
  const today=localParts().ymd,diff=daysBetween(today,deadline);
  if(diff<0)return {kind:'danger',label:'Atrasado',detail:`Prazo encerrou em ${fmtDate(deadline)}`};
  if(diff===0)return {kind:'warn',label:'Vence hoje',detail:`${futureLabel}: ${fmtDate(deadline)}`};
  if(diff<=3)return {kind:'warn',label:`Faltam ${diff} dia${diff===1?'':'s'}`,detail:`${futureLabel}: ${fmtDate(deadline)}`};
  return {kind:'info',label:`Até ${fmtDate(deadline)}`,detail:`${diff} dias restantes`};
}
function durationHours(start,end){
  if(!start||!end)return 0;
  const [sh,sm]=time5(start).split(':').map(Number),[eh,em]=time5(end).split(':').map(Number);
  if(!Number.isFinite(sh)||!Number.isFinite(eh))return 0;
  return Math.max(0,((eh*60+em)-(sh*60+sm))/60);
}
function toast(message,type='success'){
  const el=document.createElement('div');el.className=`ip-toast ${type}`;el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),3600);
}
function copyText(text,label='Informação'){
  navigator.clipboard?.writeText(text).then(()=>toast(`${label} copiada`)).catch(()=>{
    const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast(`${label} copiada`);
  });
}
function injectStyle(){
  if(styleReady||document.querySelector('#instructor-portal-style')){styleReady=true;return}
  const s=document.createElement('style');s.id='instructor-portal-style';s.textContent=`
  .ip-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:18px}.ip-hero h2{margin:0 0 5px}.ip-hero p{margin:0;color:#63726d}.ip-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px}.ip-card{grid-column:span 6;background:#fff;border:1px solid var(--border,#dce6e2);border-radius:16px;padding:16px}.ip-card.full{grid-column:1/-1}.ip-card.third{grid-column:span 4}.ip-card h3{margin:0 0 10px}.ip-muted{color:#687670;font-size:13px}.ip-kpi{font-size:29px;font-weight:800;letter-spacing:-.03em;margin:4px 0}.ip-kpi small{font-size:13px;font-weight:600;color:#687670;letter-spacing:0}.ip-task{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid #edf1ef}.ip-task:last-child{border-bottom:0}.ip-task-title{font-weight:750}.ip-task small{display:block;color:#6b7772;margin-top:4px}.ip-badge{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;font-size:11px;font-weight:750;white-space:nowrap}.ip-badge.success{background:#e7f7ef;color:#11633f}.ip-badge.info{background:#eaf2ff;color:#285887}.ip-badge.warn{background:#fff4d8;color:#7b5800}.ip-badge.danger{background:#ffe9e8;color:#8f2922}.ip-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.ip-invoice-box{background:#f7faf9;border:1px solid #e2eae6;border-radius:12px;padding:13px;margin-top:12px}.ip-invoice-lines{display:grid;grid-template-columns:1fr auto;gap:7px 14px;font-size:14px}.ip-invoice-lines .total{font-weight:800;border-top:1px solid #dce6e2;padding-top:8px;margin-top:3px}.ip-workshop{padding:10px 0;border-bottom:1px solid #edf1ef}.ip-workshop:last-child{border:0}.ip-plan-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}.ip-plan-tabs a{border:1px solid #dce5e1;border-radius:999px;padding:8px 11px;text-decoration:none;color:inherit;background:#fff}.ip-plan-tabs a.active{background:#0b5b4c;color:#fff;border-color:#0b5b4c}.ip-plan{background:#fff;border:1px solid #dce6e2;border-radius:16px;margin:0 0 15px;overflow:hidden}.ip-plan-head{padding:15px 16px;border-bottom:1px solid #e7ecea;display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.ip-plan-head h3{margin:0 0 4px}.ip-lessons{padding:14px}.ip-lesson{border:1px solid #e0e8e5;border-radius:14px;padding:14px;margin-bottom:12px}.ip-lesson:last-child{margin-bottom:0}.ip-lesson-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:11px}.ip-lesson-meta{font-size:12px;color:#66746f}.ip-lesson textarea{min-height:88px}.ip-readonly{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;background:#f8faf9;border-radius:10px;padding:10px;margin-bottom:11px}.ip-readonly b{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b7772;margin-bottom:3px}.ip-empty{padding:28px;text-align:center;color:#687670}.ip-toast{position:fixed;right:20px;bottom:20px;z-index:2147483640;background:#174f43;color:#fff;border-radius:10px;padding:11px 15px;box-shadow:0 12px 36px rgba(0,0,0,.2)}.ip-toast.danger{background:#8a2c25}.ip-modal-bg{position:fixed;inset:0;background:rgba(7,18,15,.68);z-index:2147483500;display:grid;place-items:center;padding:16px}.ip-modal{width:min(720px,96vw);background:#fff;border-radius:17px;max-height:92vh;overflow:auto}.ip-modal-head{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:15px 17px;border-bottom:1px solid #e3ebe7}.ip-modal-head h3{margin:0}.ip-modal-body{padding:16px}.ip-modal-actions{padding:14px 16px;border-top:1px solid #e3ebe7;display:flex;justify-content:flex-end;gap:8px}.ip-close{border:0;background:transparent;font-size:24px;cursor:pointer}.ip-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ip-inbox-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.ip-progress{height:8px;background:#edf2f0;border-radius:999px;overflow:hidden;margin-top:8px}.ip-progress span{display:block;height:100%;background:#0b5b4c}.ip-nf-text{white-space:pre-wrap;font-size:13px;line-height:1.45;background:#fff;border:1px solid #e2e9e6;border-radius:10px;padding:11px;margin-top:10px}.ip-nav-note{display:block;color:rgba(255,255,255,.68);font-size:11px;padding:8px 12px 2px}
  @media(max-width:900px){.ip-card,.ip-card.third{grid-column:1/-1}.ip-readonly{grid-template-columns:1fr 1fr}}
  @media(max-width:620px){.ip-hero{display:block}.ip-readonly,.ip-two{grid-template-columns:1fr}.ip-task{grid-template-columns:1fr}.ip-task .ip-actions{margin-top:4px}}
  `;document.head.appendChild(s);styleReady=true;
}

async function resolveProfile(){
  if(apiMode()!=='live')return null;
  const c=client(),{data:{user}}=await c.auth.getUser();if(!user)return null;
  const {data,error}=await c.from('profiles').select('id,display_name,role,team,active').eq('id',user.id).maybeSingle();
  if(error)throw error;return data;
}
async function loadPortalData(){
  const c=client(),current=currentReferenceMonth(),next=addMonth(current,1);
  const [wq,pq,aq]=await Promise.all([
    c.from('workshops').select('id,name,category,days,start_time,end_time,active,location_type,location_other,oficineiro_user_id').eq('oficineiro_user_id',me.id).order('name'),
    c.from('workshop_monthly_plans').select('*').eq('instructor_user_id',me.id).in('plan_month',[current,next]).order('plan_month').order('created_at'),
    c.from('workshop_instructor_monthly_admin').select('*').eq('instructor_user_id',me.id).eq('reference_month',current).maybeSingle()
  ]);
  for(const q of [wq,pq,aq])if(q.error)throw q.error;
  const plans=pq.data||[],ids=plans.map(x=>x.id);let lessons=[];
  if(ids.length){const lq=await c.from('workshop_plan_lessons').select('*').in('plan_id',ids).order('scheduled_date').order('lesson_number');if(lq.error)throw lq.error;lessons=lq.data||[]}
  return {current,next,workshops:wq.data||[],plans,lessons,admin:aq.data||null};
}
function workshopMap(d){return new Map(d.workshops.map(w=>[w.id,w]))}
function lessonsForPlan(d,id){return d.lessons.filter(x=>x.plan_id===id&&x.included!==false)}
function currentInvoice(d){
  const wmap=workshopMap(d),currentPlans=d.plans.filter(p=>String(p.plan_month).slice(0,10)===d.current),groups=[];let serviceHours=0;
  for(const p of currentPlans){
    const w=wmap.get(p.workshop_id),rows=lessonsForPlan(d,p.id);let hours=0;
    for(const l of rows){hours+=durationHours(l.start_time||w?.start_time,l.end_time||w?.end_time)}
    serviceHours+=hours;groups.push({name:w?.name||'Oficina',hours,lessons:rows.length});
  }
  const planningHours=currentPlans.length?1:0,billableHours=serviceHours+planningHours,total=billableHours*HOURLY_RATE;
  const description=currentPlans.length
    ?`Prestação de serviços como oficineiro(a) do Centro de Referência das Juventudes – CRJ Cariacica, competência ${shortMonth(d.current)}, referente a ${num(serviceHours)}h de atividades previstas no planejamento mensal + 1h de planejamento, totalizando ${num(billableHours)}h, ao valor de ${brl(HOURLY_RATE)}/h. Valor total previsto: ${brl(total)}.`
    :'Ainda não há planejamento da competência atual disponível para calcular a nota fiscal.';
  return {currentPlans,groups,serviceHours,planningHours,billableHours,total,description};
}
function nextPlanningProgress(d){
  const plans=d.plans.filter(p=>String(p.plan_month).slice(0,10)===d.next),rows=plans.flatMap(p=>lessonsForPlan(d,p.id));
  const total=rows.length*3,filled=rows.reduce((n,l)=>n+['objective','proposed_activities','resources'].filter(k=>String(l[k]||'').trim()).length,0);
  return {plans,rows,total,filled,complete:rows.length>0&&filled===total,percent:total?Math.round(filled/total*100):0};
}
function taskHtml({title,description,status,buttonField,buttonText,done}){
  return `<div class="ip-task"><div><div class="ip-task-title">${esc(title)}</div><small>${esc(description)}</small><small>${esc(status.detail)}</small></div><div style="text-align:right"><span class="ip-badge ${status.kind}">${esc(status.label)}</span>${buttonField?`<div class="ip-actions" style="justify-content:flex-end"><button class="btn ${done?'ghost':'secondary'}" type="button" data-ip-admin="${buttonField}" data-ip-done="${done?'1':'0'}">${esc(buttonText)}</button></div>`:''}</div></div>`
}
function invoiceInstitutionText(){return `${AVANTE.legalName}\nCNPJ: ${AVANTE.cnpj}\n${AVANTE.address}`}
function dashboardHtml(d){
  const inv=currentInvoice(d),prog=nextPlanningProgress(d),admin=d.admin||{};
  const issueDeadline=deadlineFor(d.current,15),sendDeadline=deadlineFor(d.current,20),paymentDeadline=deadlineFor(d.current,10,1),planningDeadline=deadlineFor(d.current,15);
  const issueStatus=statusInfo(admin.invoice_issued_at,issueDeadline,{futureLabel:'Emitir até'}),sendStatus=statusInfo(admin.invoice_sent_at,sendDeadline,{futureLabel:'Enviar à Marcela até'}),payStatus=statusInfo(admin.payment_received_at,paymentDeadline,{futureLabel:'Recebimento previsto'}),planningStatus=prog.complete?{kind:'success',label:'Concluído',detail:`${prog.filled}/${prog.total} campos obrigatórios preenchidos`}:statusInfo(null,planningDeadline,{futureLabel:`Planejamento de ${monthLabel(d.next)} até`});
  return `<div class="ip-hero"><div><h2>Olá, ${esc((me.display_name||'Oficineiro').split(' ')[0])}</h2><p>Seu espaço reúne somente o que você precisa para executar a oficina, planejar o próximo mês e acompanhar os prazos administrativos.</p></div><div class="ip-actions"><a class="btn" href="#caixa-equipes">Abrir caixa de entrada</a><a class="btn primary" href="#oficineiro?view=planejamento">Preencher planejamento</a></div></div>
  <div class="ip-grid">
    <section class="ip-card full"><h3>Lembretes inteligentes · ${esc(monthLabel(d.current))}</h3>
      ${taskHtml({title:'Emitir nota fiscal',description:`Competência ${shortMonth(d.current)} · cálculo disponível abaixo`,status:issueStatus,buttonField:'invoice_issued_at',buttonText:admin.invoice_issued_at?'Desmarcar emissão':'Marcar como emitida',done:!!admin.invoice_issued_at})}
      ${taskHtml({title:'Enviar a nota para Marcela',description:'Após a emissão, encaminhar a nota fiscal até o dia 20.',status:sendStatus,buttonField:'invoice_sent_at',buttonText:admin.invoice_sent_at?'Desmarcar envio':'Marcar como enviada',done:!!admin.invoice_sent_at})}
      ${taskHtml({title:`Planejamento de ${monthLabel(d.next)}`,description:'Preencher Objetivo, Atividades propostas e Recursos necessários em todos os blocos do próximo mês.',status:planningStatus})}
      ${taskHtml({title:'Recebimento',description:`Pagamento referente à competência ${shortMonth(d.current)} previsto até o dia 10 do mês seguinte.`,status:payStatus,buttonField:'payment_received_at',buttonText:admin.payment_received_at?'Desmarcar recebimento':'Marcar como recebido',done:!!admin.payment_received_at})}
    </section>
    <section class="ip-card"><h3>Dados para nota fiscal</h3><div class="ip-muted">Cálculo automático a partir das horas previstas no planejamento da competência atual.</div>
      <div class="ip-kpi">${brl(inv.total)} <small>valor previsto</small></div>
      <div class="ip-invoice-box"><div class="ip-invoice-lines">
        ${inv.groups.map(x=>`<span>${esc(x.name)} · ${x.lessons} aula(s)</span><b>${num(x.hours)}h</b>`).join('')||'<span>Horas de aulas previstas</span><b>0h</b>'}
        <span>Planejamento mensal</span><b>${num(inv.planningHours)}h</b>
        <span>Valor por hora</span><b>${brl(HOURLY_RATE)}</b>
        <span class="total">Total de horas faturáveis</span><b class="total">${num(inv.billableHours)}h</b>
        <span class="total">Total previsto</span><b class="total">${brl(inv.total)}</b>
      </div></div>
      ${inv.currentPlans.length?'':'<div class="notice warn" style="margin-top:10px">O cálculo ficará completo quando existir planejamento da competência atual vinculado ao seu cadastro.</div>'}
      <div class="ip-nf-text">${esc(inv.description)}</div>
      <div class="ip-actions"><button class="btn" type="button" data-ip-copy="invoice">Copiar descrição da nota</button><button class="btn" type="button" data-ip-copy="institution">Copiar dados da Avante</button></div>
    </section>
    <section class="ip-card"><h3>Tomador / dados para emissão</h3><div class="ip-workshop"><b>${esc(AVANTE.legalName)}</b><div class="ip-muted">CNPJ ${esc(AVANTE.cnpj)}</div></div><div class="ip-workshop"><b>Endereço</b><div class="ip-muted">${esc(AVANTE.address)}</div></div><div class="notice info" style="margin-top:12px">O valor acima é uma referência automática baseada no planejamento atual. Se o planejamento for alterado, o cálculo também será atualizado.</div></section>
    <section class="ip-card full"><h3>Minhas oficinas</h3>${d.workshops.map(w=>`<div class="ip-workshop"><b>${esc(w.name)}</b> ${w.active?'<span class="ip-badge success">Ativa</span>':'<span class="ip-badge warn">Inativa</span>'}<div class="ip-muted">${esc(w.days||'Agenda conforme planejamento')} · ${esc(time5(w.start_time)||'—')}–${esc(time5(w.end_time)||'—')} · ${esc(w.location_other||w.location_type||'Local não informado')}</div></div>`).join('')||'<div class="ip-empty">Nenhuma oficina está vinculada ao seu cadastro.</div>'}</section>
  </div>`;
}
function lessonHtml(l,w){
  return `<form class="ip-lesson" data-ip-lesson-form="${l.id}"><div class="ip-lesson-head"><div><b>Aula ${esc(l.lesson_number||'')}</b><div class="ip-lesson-meta">${esc(fmtDate(l.scheduled_date))} · ${esc(time5(l.start_time||w?.start_time))}–${esc(time5(l.end_time||w?.end_time))}</div></div><span class="ip-badge info">Seu bloco</span></div>
    <div class="ip-readonly"><div><b>Tema</b>${esc(l.theme||'Não definido')}</div><div><b>Data</b>${esc(fmtDate(l.scheduled_date))}</div><div><b>Horário</b>${esc(time5(l.start_time||w?.start_time))}–${esc(time5(l.end_time||w?.end_time))}</div><div><b>Local</b>${esc(l.location_other||l.location_type||w?.location_other||w?.location_type||'Não definido')}</div></div>
    <div class="field"><label>Objetivo</label><textarea class="input" name="objective" required>${esc(l.objective||'')}</textarea></div>
    <div class="field"><label>Atividades propostas</label><textarea class="input" name="proposed_activities" required>${esc(l.proposed_activities||'')}</textarea></div>
    <div class="field"><label>Recursos necessários</label><textarea class="input" name="resources" required>${esc(l.resources||'')}</textarea></div>
    <div class="ip-actions"><button class="btn primary" type="submit">Salvar este bloco</button><span class="ip-muted" data-ip-save-state></span></div></form>`;
}
function planningHtml(d){
  const p=params(),requested=p.get('month'),selected=[d.current,d.next].includes(requested)?requested:d.next,wmap=workshopMap(d),plans=d.plans.filter(x=>String(x.plan_month).slice(0,10)===selected),progress=selected===d.next?nextPlanningProgress(d):null;
  return `<div class="ip-hero"><div><h2>Planejamento das minhas oficinas</h2><p>Você pode alterar somente <b>Objetivo</b>, <b>Atividades propostas</b> e <b>Recursos necessários</b>. Datas, horários, locais, temas e demais definições permanecem protegidos.</p></div><div class="ip-actions"><a class="btn" href="#oficineiro">Voltar ao painel</a></div></div>
  <div class="ip-plan-tabs"><a class="${selected===d.current?'active':''}" href="#oficineiro?view=planejamento&month=${d.current}">Competência atual · ${esc(shortMonth(d.current))}</a><a class="${selected===d.next?'active':''}" href="#oficineiro?view=planejamento&month=${d.next}">Próximo mês · ${esc(shortMonth(d.next))}</a></div>
  ${progress?`<div class="ip-card full" style="margin-bottom:14px"><b>Prazo do próximo mês: até dia 15 da competência atual</b><div class="ip-muted">${progress.total?`${progress.filled} de ${progress.total} campos preenchidos`:'A estrutura do planejamento ainda não foi disponibilizada pela equipe.'}</div><div class="ip-progress"><span style="width:${progress.percent}%"></span></div></div>`:''}
  ${plans.map(plan=>{const w=wmap.get(plan.workshop_id),rows=lessonsForPlan(d,plan.id);return `<section class="ip-plan"><div class="ip-plan-head"><div><h3>${esc(w?.name||'Oficina')}</h3><div class="ip-muted">Competência ${esc(shortMonth(plan.plan_month))} · ${rows.length} bloco(s) de aula</div></div><span class="ip-badge ${plan.status==='concluido'?'success':'info'}">${esc(String(plan.status||'planejamento').replaceAll('_',' '))}</span></div><div class="ip-lessons">${rows.map(l=>lessonHtml(l,w)).join('')||'<div class="ip-empty">Ainda não há blocos de aula nesta competência.</div>'}</div></section>`}).join('')||'<div class="ip-card full"><div class="ip-empty"><b>Planejamento ainda não criado para esta competência.</b><br>A equipe responsável precisa disponibilizar os blocos antes do seu preenchimento.</div></div>'}`;
}
function pageShell(body,view){return `<div data-instructor-portal-page="${esc(view)}">${body}</div>`}
async function setAdminField(field,done){
  const c=client(),reference=currentReferenceMonth(),value=done?null:new Date().toISOString();
  const existing=await c.from('workshop_instructor_monthly_admin').select('instructor_user_id').eq('instructor_user_id',me.id).eq('reference_month',reference).maybeSingle();
  if(existing.error)throw existing.error;
  let q;
  if(existing.data)q=await c.from('workshop_instructor_monthly_admin').update({[field]:value,updated_at:new Date().toISOString()}).eq('instructor_user_id',me.id).eq('reference_month',reference);
  else q=await c.from('workshop_instructor_monthly_admin').insert({instructor_user_id:me.id,reference_month:reference,[field]:value});
  if(q.error)throw q.error;
}
async function bindPortal(host,d){
  host.querySelectorAll('[data-ip-admin]').forEach(btn=>btn.addEventListener('click',async()=>{btn.disabled=true;try{await setAdminField(btn.dataset.ipAdmin,btn.dataset.ipDone==='1');toast('Lembrete atualizado');await renderPortal(true)}catch(err){toast(err.message||String(err),'danger');btn.disabled=false}}));
  const inv=currentInvoice(d);
  host.querySelector('[data-ip-copy="invoice"]')?.addEventListener('click',()=>copyText(inv.description,'Descrição da nota'));
  host.querySelector('[data-ip-copy="institution"]')?.addEventListener('click',()=>copyText(invoiceInstitutionText(),'Dados da Avante'));
  host.querySelectorAll('[data-ip-lesson-form]').forEach(form=>form.addEventListener('submit',async e=>{
    e.preventDefault();const btn=form.querySelector('button[type="submit"]'),state=form.querySelector('[data-ip-save-state]'),fd=new FormData(form);btn.disabled=true;btn.textContent='Salvando...';if(state)state.textContent='';
    try{
      const {error}=await client().rpc('workshop_instructor_update_lesson',{p_lesson_id:form.dataset.ipLessonForm,p_objective:String(fd.get('objective')||''),p_proposed_activities:String(fd.get('proposed_activities')||''),p_resources:String(fd.get('resources')||'')});
      if(error)throw error;if(state)state.textContent='Salvo agora';toast('Bloco do planejamento atualizado');setTimeout(()=>renderPortal(true),350);
    }catch(err){toast(err.message||String(err),'danger');btn.disabled=false;btn.textContent='Salvar este bloco'}
  }));
}
async function renderPortal(force=false){
  if(!isInstructor()||routeName()!=='oficineiro'||rendering)return;
  const host=document.querySelector('.content');if(!host)return;
  const view=params().get('view')==='planejamento'?'planejamento':'painel',key=`${view}|${params().get('month')||''}`;
  if(!force&&host.dataset.instructorPortalKey===key&&host.querySelector('[data-instructor-portal-page]'))return;
  rendering=true;host.dataset.instructorPortalKey=key;host.innerHTML='<div class="card"><div class="empty">Carregando seu espaço…</div></div>';
  try{const d=await loadPortalData();host.innerHTML=pageShell(view==='planejamento'?planningHtml(d):dashboardHtml(d),view);host.dataset.instructorPortalKey=key;await bindPortal(host,d)}
  catch(err){host.innerHTML=`<div class="notice danger"><b>Não foi possível carregar a área do oficineiro.</b><br>${esc(err.message||String(err))}<div class="ip-actions"><button class="btn primary" type="button" data-ip-retry>Tentar novamente</button></div></div>`;host.querySelector('[data-ip-retry]')?.addEventListener('click',()=>renderPortal(true))}
  finally{rendering=false}
}
function patchNav(){
  if(!isInstructor())return;
  const nav=document.querySelector('.sidebar .nav');if(!nav)return;
  const r=routeName(),view=params().get('view')||'painel';
  if(nav.dataset.instructorPortal!=='1'){
    nav.dataset.instructorPortal='1';
    nav.innerHTML=`<span class="ip-nav-note">ACESSO DO OFICINEIRO</span><a href="#oficineiro" data-ip-nav="painel"><span>◫</span><span>Meu painel</span></a><a href="#oficineiro?view=planejamento" data-ip-nav="planejamento"><span>◇</span><span>Planejamento</span></a><a href="#caixa-equipes" data-ip-nav="inbox"><span>✉</span><span>Caixa de entrada</span></a><div class="sep"></div><a href="#" data-ip-logout><span>↪</span><span>Sair</span></a>`;
    nav.querySelector('[data-ip-logout]')?.addEventListener('click',async e=>{e.preventDefault();try{await client().auth.signOut()}finally{location.hash='';location.reload()}});
  }
  nav.querySelectorAll('a[data-ip-nav]').forEach(a=>a.classList.remove('active'));
  if(r==='caixa-equipes')nav.querySelector('[data-ip-nav="inbox"]')?.classList.add('active');
  else nav.querySelector(`[data-ip-nav="${view==='planejamento'?'planejamento':'painel'}"]`)?.classList.add('active');
}
async function createThread(kind,form,bg){
  const fd=new FormData(form),team=String(fd.get('team')||''),user=String(fd.get('user')||'');
  if(!team&&!user)throw new Error('Escolha uma equipe ou uma pessoa para receber a solicitação.');
  const subject=String(fd.get('subject')||'').trim(),message=String(fd.get('body')||'').trim();if(!subject||!message)throw new Error('Preencha o assunto e a descrição.');
  let dueAt=null,body=message,threadType=kind==='meeting'?'agendamento':'solicitacao';
  if(kind==='meeting'){
    const date=String(fd.get('meeting_date')||''),time=String(fd.get('meeting_time')||'');if(!date||!time)throw new Error('Informe uma data e um horário sugeridos para a reunião.');
    dueAt=new Date(`${date}T${time}:00-03:00`).toISOString();body=`Solicitação de reunião\nData sugerida: ${fmtDate(date)}\nHorário sugerido: ${time}\n\n${message}`;
  }
  const c=client(),insert={thread_type:threadType,subject,created_by:me.id,target_user_id:user||null,target_team:user?null:team,status:'aberto',priority:String(fd.get('priority')||'normal'),due_at:dueAt};
  const {data:t,error}=await c.from('team_threads').insert(insert).select('id').single();if(error)throw error;
  const {error:e2}=await c.from('team_thread_messages').insert({thread_id:t.id,sender_user_id:me.id,message_type:'solicitacao',body});if(e2)throw e2;
  bg.remove();location.hash=`#caixa-equipes?thread=${encodeURIComponent(t.id)}&filter=todos`;
}
async function openThreadModal(kind){
  try{
    const c=client(),q=await c.from('profiles').select('id,display_name,role,team,active').eq('active',true).order('display_name');if(q.error)throw q.error;
    const profiles=(q.data||[]).filter(x=>x.id!==me.id),teams=[...new Set(profiles.map(x=>x.team).filter(Boolean))].sort(),meeting=kind==='meeting';
    document.querySelector('#ip-thread-modal')?.remove();const bg=document.createElement('div');bg.id='ip-thread-modal';bg.className='ip-modal-bg';bg.innerHTML=`<div class="ip-modal"><div class="ip-modal-head"><h3>${meeting?'Solicitar reunião':'Abrir solicitação'}</h3><button class="ip-close" type="button" data-ip-close>×</button></div><form><div class="ip-modal-body"><div class="field"><label>Assunto</label><input class="input" name="subject" maxlength="180" required placeholder="${meeting?'Ex.: Reunião sobre planejamento da oficina':'Ex.: Solicitação de material para a oficina'}"></div><div class="ip-two"><div class="field"><label>Enviar para uma equipe</label><select name="team"><option value="">Selecione</option>${teams.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></div><div class="field"><label>Ou pessoa específica</label><select name="user"><option value="">Selecione</option>${profiles.map(x=>`<option value="${x.id}">${esc(x.display_name)} · ${esc(x.team||x.role)}</option>`).join('')}</select></div></div>${meeting?`<div class="ip-two"><div class="field"><label>Data sugerida</label><input class="input" type="date" name="meeting_date" required></div><div class="field"><label>Horário sugerido</label><input class="input" type="time" name="meeting_time" required></div></div>`:''}<div class="field"><label>Prioridade</label><select name="priority"><option value="normal">Normal</option><option value="alta">Alta</option><option value="baixa">Baixa</option></select></div><div class="field"><label>${meeting?'Pauta / motivo':'Descrição da solicitação'}</label><textarea class="input" name="body" required maxlength="4000"></textarea></div></div><div class="ip-modal-actions"><button class="btn" type="button" data-ip-close>Cancelar</button><button class="btn primary" type="submit">${meeting?'Solicitar reunião':'Enviar solicitação'}</button></div></form></div>`;
    document.body.appendChild(bg);bg.querySelectorAll('[data-ip-close]').forEach(x=>x.addEventListener('click',()=>bg.remove()));bg.addEventListener('click',e=>{if(e.target===bg)bg.remove()});
    bg.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button[type="submit"]');btn.disabled=true;btn.textContent='Enviando...';try{await createThread(kind,e.currentTarget,bg);toast(meeting?'Reunião solicitada':'Solicitação enviada')}catch(err){toast(err.message||String(err),'danger');btn.disabled=false;btn.textContent=meeting?'Solicitar reunião':'Enviar solicitação'}});
  }catch(err){toast(err.message||String(err),'danger')}
}
function enhanceInbox(){
  if(!isInstructor()||routeName()!=='caixa-equipes')return;
  const head=document.querySelector('.tc-head');if(!head)return;
  const h2=head.querySelector('h2');if(h2)h2.textContent='Caixa de entrada';const p=head.querySelector('p');if(p)p.textContent='Converse diretamente com a equipe, abra solicitações e peça reuniões sem sair do seu espaço.';
  const original=head.querySelector('[data-tc-new]');if(original)original.textContent='+ Mensagem';
  if(head.querySelector('[data-ip-inbox-actions]'))return;
  const actions=document.createElement('div');actions.className='ip-inbox-actions';actions.dataset.ipInboxActions='1';actions.innerHTML='<button class="btn" type="button" data-ip-request>+ Solicitação</button><button class="btn primary" type="button" data-ip-meeting>+ Reunião</button>';
  head.appendChild(actions);actions.querySelector('[data-ip-request]').addEventListener('click',()=>openThreadModal('request'));actions.querySelector('[data-ip-meeting]').addEventListener('click',()=>openThreadModal('meeting'));
}
async function enforce(){
  if(!me){try{me=await resolveProfile()}catch{return}}
  if(!isInstructor())return;
  injectStyle();
  if(!routeAllowed()&&document.querySelector('.app-shell')){location.hash='#oficineiro';return}
  patchNav();
  if(routeName()==='oficineiro')await renderPortal();
  if(routeName()==='caixa-equipes')enhanceInbox();
}
function schedule(force=false){clearTimeout(timer);timer=setTimeout(()=>{if(force){const h=document.querySelector('.content');if(h)delete h.dataset.instructorPortalKey}enforce()},force?30:110)}
function boot(){
  injectStyle();observer=new MutationObserver(()=>schedule(false));observer.observe(document.body,{childList:true,subtree:true});window.addEventListener('hashchange',()=>schedule(true));window.addEventListener('focus',()=>schedule(false));
  setInterval(()=>{if(!me)schedule(false)},1400);schedule(true);
}
boot();
