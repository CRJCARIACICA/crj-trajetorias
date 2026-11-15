import { supabaseClient, apiMode } from './api.js?v=20261109-avaliacoes';

// Extensão independente da Área do Educador: não altera a identidade da sessão.
// A permissão real é validada pelo banco e toda ação permanece auditável.
const KEY='crj_substituicao_educador_ativa';
let profile=null, team=[], grants=[], active=null, data=null, month=new Date().toISOString().slice(0,7);
let loading=false, stamp='', panel=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pt=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
const today=()=>new Date().toISOString().slice(0,10);
const localDateTime=v=>{const d=new Date(v);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
const nextMonth=m=>{let [y,n]=m.split('-').map(Number);return n===12?(y+1)+'-01':y+'-'+String(n+1).padStart(2,'0')};
const notify=(msg,isError=false)=>{const p=panel?.querySelector('[data-es-message]');if(p){p.textContent=msg;p.style.color=isError?'#a12828':'#17633a'}};
const label=id=>team.find(x=>x.id===id)?.display_name||'Educador não identificado';
const card=(title,body)=>'<section class="card" style="margin-top:12px"><h3>'+esc(title)+'</h3>'+body+'</section>';
const badge=status=>({solicitada:'Aguardando autorização',autorizada:'Autorizada',recusada:'Recusada',revogada:'Revogada'})[status]||status;
function valid(g){return g.status==='autorizada'&&g.authorized_by&&Date.now()>=Date.parse(g.starts_at)&&Date.now()<Date.parse(g.ends_at)}
function editorDefs(type){
 const defs={
  educator_plans:[['activity_title','Atividade'],['description_objective','Descrição e objetivo','textarea'],['planned_actions','Ações planejadas','textarea'],['expected_results','Resultados esperados','textarea'],['resources','Recursos necessários','textarea'],['status','Situação','plan_status']],
  educator_records:[['record_date','Data','date'],['title','Título'],['description','Descrição do realizado','textarea'],['duration_hours','Horas','number'],['participants_count','Participantes','number'],['evidence_ref','Evidência'],['notes','Observações','textarea']],
  educator_reports:[['report_date','Data','date'],['execution_status','Execução','execution'],['actual_description','Descrição da execução','textarea'],['methodology_applied','Metodologia aplicada','textarea'],['actual_participants','Participantes','number'],['actual_duration_hours','Horas','number'],['positive_points','Pontos positivos','textarea'],['negative_points','Pontos negativos','textarea'],['results_achieved','Resultados','textarea'],['justification','Justificativa','textarea'],['next_steps','Próximos passos','textarea'],['evidence_ref','Evidência']],
  workshop_monthly_plans:[['general_objective','Objetivo geral','textarea'],['general_methodology','Metodologia','textarea'],['expected_results','Resultados esperados','textarea'],['general_resources','Recursos','textarea'],['observations','Observações','textarea'],['status','Situação','workshop_status']],
  workshop_monthly_reports:[['report_date','Data','date'],['execution_status','Execução','execution'],['actual_description','Descrição da execução','textarea'],['actual_participants','Participantes','number'],['actual_duration_hours','Horas','number'],['positive_points','Pontos positivos','textarea'],['difficulties','Dificuldades','textarea'],['methodology_applied','Metodologia aplicada','textarea'],['results_achieved','Resultados','textarea'],['next_steps','Próximos passos','textarea'],['evidence_ref','Evidência']],
  workshop_plan_lessons:[['theme','Tema'],['observations','Observações','textarea'],['cfdh_transversal','Vínculo CFDH transversal','textarea']]
 };
 return defs[type]||[];
}
const selectOptions={
 plan_status:[['planejado','Planejado'],['em_execucao','Em execução'],['concluido','Concluído'],['cancelado','Cancelado']],
 workshop_status:[['rascunho','Rascunho'],['finalizado','Finalizado'],['arquivado','Arquivado']],
 execution:[['realizado','Realizado'],['parcial','Parcial'],['nao_realizado','Não realizado']]
};
function editorField(f,value){
 const [name,title,kind]=f, val=value??'',safe=esc(val);
 if(selectOptions[kind])return '<label class="field"><span>'+esc(title)+'</span><select class="input" name="'+name+'">'+selectOptions[kind].map(o=>'<option value="'+o[0]+'" '+(o[0]===val?'selected':'')+'>'+o[1]+'</option>').join('')+'</select></label>';
 if(kind==='textarea')return '<label class="field"><span>'+esc(title)+'</span><textarea class="input" name="'+name+'" rows="3">'+safe+'</textarea></label>';
 return '<label class="field"><span>'+esc(title)+'</span><input class="input" name="'+name+'" type="'+(kind||'text')+'" '+(kind==='number'?'min="0" step="0.25"':'')+' value="'+safe+'"></label>';
}
function createDialog(){let d=document.querySelector('#crj-educator-sub-dialog');if(!d){d=document.createElement('dialog');d.id='crj-educator-sub-dialog';d.style.cssText='border:0;border-radius:14px;max-width:680px;width:min(92vw,680px);max-height:86vh;overflow:auto;padding:22px;box-shadow:0 15px 60px #0004';document.body.appendChild(d)}return d}
function openEditor(type,row={},mode='edit',plan=null){
 if(!valid(active)){notify('Autorização expirada ou indisponível. Reabra o painel.',true);return}
 const d=createDialog(),newRow=mode==='new',fields=editorDefs(type);
 d.innerHTML='<h3>'+(newRow?'Registrar execução em substituição':'Editar como substituto')+'</h3><p>Responsável: <b>'+esc(label(active.educator_id))+'</b> · Atualizador real: <b>'+esc(profile.display_name)+'</b>. Todas as alterações ficam auditadas.</p><form id="crj-educator-sub-edit" class="stack">'+fields.map(f=>editorField(f,newRow?({report_date:today(),execution_status:'realizado'})[f[0]]:row[f[0]])).join('')+'<div class="actions"><button class="btn primary" type="submit">'+(newRow?'Salvar execução':'Salvar alterações')+'</button><button class="btn secondary" type="button" data-es-close>Cancelar</button></div></form>';
 d.showModal();d.querySelector('[data-es-close]').onclick=()=>d.close();
 d.querySelector('form').onsubmit=async e=>{
  e.preventDefault();const payload={};new FormData(e.target).forEach((v,k)=>{if(['duration_hours','participants_count','actual_participants','actual_duration_hours'].includes(k))payload[k]=v===''?null:Number(v);else payload[k]=v===''?null:v});
  if(newRow){payload.plan_id=plan.id;payload.educator_user_id=active.educator_id;if(!String(payload.actual_description||'').trim()){alert('Descreva a execução real antes de salvar.');return}}
  try{
   if(!valid(active))throw Error('O período autorizado expirou.');
   const c=supabaseClient();const q=newRow?c.from(type).insert(payload):c.from(type).update(payload).eq('id',row.id);
   const {data:written,error}=await q.select('id').single();if(error)throw error;
   if(!written)throw Error('Nenhuma alteração autorizada pelo banco.');
   d.close();await refresh();notify('Registro salvo, com autoria do substituto preservada.');
  }catch(err){alert('Não foi possível salvar: '+(err.message||err))}
 };
}
async function loadWork(){
 const c=supabaseClient(),target=active.educator_id,after=month+'-01',before=nextMonth(month)+'-01';
 const queries=await Promise.all([
   c.from('educator_plans').select('*').eq('educator_user_id',target).order('created_at',{ascending:false}).limit(100),
   c.from('educator_records').select('*').eq('educator_user_id',target).gte('record_date',after).lt('record_date',before).order('record_date',{ascending:false}).limit(100),
   c.from('workshop_monthly_plans').select('*').eq('educator_user_id',target).gte('plan_month',after).lt('plan_month',before).limit(100),
   c.from('educator_substitution_audit').select('table_name,action,changed_fields,occurred_at').eq('substitution_id',active.id).order('occurred_at',{ascending:false}).limit(15)
 ]);
 for(const q of queries)if(q.error)throw q.error;
 const plans=(queries[0].data||[]).filter(p=>String(p.planned_start||p.created_at||'').slice(0,7)===month||String(p.planned_end||'').slice(0,7)===month);
 const records=queries[1].data||[],monthly=queries[2].data||[],audit=queries[3].data||[];
 const [reports,monthlyReports,lessons]=await Promise.all([
  plans.length?c.from('educator_reports').select('*').in('plan_id',plans.map(p=>p.id)):Promise.resolve({data:[]}),
  monthly.length?c.from('workshop_monthly_reports').select('*').in('plan_id',monthly.map(p=>p.id)):Promise.resolve({data:[]}),
  monthly.length?c.from('workshop_plan_lessons').select('id,plan_id,scheduled_date,theme,observations,cfdh_transversal').in('plan_id',monthly.map(p=>p.id)).limit(200):Promise.resolve({data:[]})
 ]);
 for(const q of [reports,monthlyReports,lessons])if(q.error)throw q.error;
 data={plans,records,monthly,reports:reports.data||[],monthlyReports:monthlyReports.data||[],lessons:lessons.data||[],audit};
}
function workRows(type,rows,fn){
 return rows.map(row=>'<div class="agenda-row"><div><b>'+esc(fn(row))+'</b><span>'+esc(row.status||row.execution_status||row.record_date||row.scheduled_date||'')+'</span></div><button type="button" class="btn secondary" data-es-edit="'+esc(type)+'" data-es-id="'+esc(row.id)+'">Editar</button></div>').join('')||'<p class="muted">Nenhum registro encontrado neste mês.</p>';
}
function workHtml(){
 const d=data;
 const plans=d.plans.map(p=>{
  const report=d.reports.find(r=>r.plan_id===p.id);
  return '<div class="agenda-row"><div><b>'+esc(p.activity_title||p.plan_type)+'</b><span>'+esc(p.status||'planejado')+' · '+esc(p.planned_start||'')+'</span></div><div class="actions"><button class="btn secondary" data-es-edit="educator_plans" data-es-id="'+p.id+'">Editar</button>'+(report?'<button class="btn secondary" data-es-edit="educator_reports" data-es-id="'+report.id+'">Relatório</button>':'<button class="btn secondary" data-es-new="educator_reports" data-es-plan="'+p.id+'">Registrar execução</button>')+(p.status!=='concluido'?'<button class="btn primary" data-es-finish="educator_plans" data-es-id="'+p.id+'" '+(!report?.actual_description?'disabled title="Registre a execução primeiro"':'')+'>Concluir</button>':'')+'</div></div>';
 }).join('');
 const monthly=d.monthly.map(p=>{
  const report=d.monthlyReports.find(r=>r.plan_id===p.id);
  return '<div class="agenda-row"><div><b>'+esc('Oficina · '+p.plan_month)+'</b><span>'+esc(p.status||'rascunho')+'</span></div><div class="actions"><button class="btn secondary" data-es-edit="workshop_monthly_plans" data-es-id="'+p.id+'">Planejamento</button>'+(report?'<button class="btn secondary" data-es-edit="workshop_monthly_reports" data-es-id="'+report.id+'">Relatório</button>':'<button class="btn secondary" data-es-new="workshop_monthly_reports" data-es-plan="'+p.id+'">Registrar execução</button>')+(p.status!=='finalizado'?'<button class="btn primary" data-es-finish="workshop_monthly_plans" data-es-id="'+p.id+'">Finalizar plano</button>':'')+'</div></div>';
 }).join('');
 return '<div class="notice info"><b>Substituição em andamento:</b> você está trabalhando nos documentos de '+esc(label(active.educator_id))+'. A conta e a assinatura digital continuam sendo suas; a titularidade permanece do educador substituído.</div>'+
 '<div class="field" style="max-width:240px"><label>Mês de trabalho</label><input class="input" type="month" data-es-month value="'+esc(month)+'"></div>'+
 card('Planejamentos do educador',plans||'<p class="muted">Sem planejamentos no mês.</p>')+
 card('Registros de contribuição',workRows('educator_records',d.records,r=>r.title||r.description||r.record_type))+
 card('Planejamentos mensais de oficinas',monthly||'<p class="muted">Sem planejamentos mensais de oficinas.</p>')+
 card('Aulas vinculadas aos planejamentos',workRows('workshop_plan_lessons',d.lessons,r=>(r.scheduled_date||'')+' · '+(r.theme||'Aula')))+
 card('Auditoria da substituição',d.audit.map(r=>'<p style="margin:5px 0"><small>'+esc(pt(r.occurred_at))+' · '+esc(r.table_name)+' · '+esc(r.action)+' · '+esc((r.changed_fields||[]).join(', '))+'</small></p>').join('')||'<p class="muted">Nenhuma alteração nesta substituição.</p>');
}
function grantHtml(g){
 const approved=valid(g);
 return '<div class="agenda-row"><div><b>'+esc(label(g.educator_id))+' → '+esc(label(g.substitute_id))+'</b><span>'+esc(badge(g.status))+' · '+esc(pt(g.starts_at))+' até '+esc(pt(g.ends_at))+'</span><small>'+esc(g.reason||'')+'</small></div><div class="actions">'+
 (profile.role==='coordenacao_geral'&&g.status==='solicitada'?'<button class="btn primary" data-es-decide="autorizada" data-es-id="'+g.id+'">Autorizar</button><button class="btn secondary" data-es-decide="recusada" data-es-id="'+g.id+'">Recusar</button>':'')+
 (profile.role==='coordenacao_geral'&&g.status==='autorizada'?'<button class="btn secondary" data-es-decide="revogada" data-es-id="'+g.id+'">Revogar</button>':'')+
 (profile.role==='educador'&&approved?'<button class="btn '+(active?.id===g.id?'secondary':'primary')+'" data-es-enter="'+g.id+'">'+(active?.id===g.id?'Sair da substituição':'Assumir temporariamente')+'</button>':'')+
 '</div></div>';
}
function renderPanel(){
 if(!panel?.isConnected)return;
 const available=team.filter(p=>p.id!==profile.id);
 const defaults=localDateTime(Date.now()),end=localDateTime(Date.now()+3*86400000);
 panel.innerHTML='<div class="card"><h3>Substituição temporária de educador</h3><p>Continuar o trabalho de um educador ausente sem trocar de login, perder a autoria das alterações ou alterar os dados de acesso dele.</p><div data-es-message role="status" aria-live="polite"></div>'+
 (profile.role==='educador'?'<details><summary><b>Solicitar autorização para substituir outro educador</b></summary><form data-es-request class="stack" style="margin-top:12px"><label class="field"><span>Educador indisponível</span><select class="input" name="educator_id" required><option value="">Selecione</option>'+available.map(p=>'<option value="'+p.id+'">'+esc(p.display_name)+'</option>').join('')+'</select></label><label class="field"><span>Motivo da substituição</span><textarea class="input" name="reason" minlength="5" required placeholder="Ex.: ausência, afastamento ou pendência de prazo"></textarea></label><div class="form-grid"><label class="field"><span>Início</span><input class="input" type="datetime-local" name="starts_at" value="'+defaults+'" required></label><label class="field"><span>Fim (máximo de 31 dias)</span><input class="input" type="datetime-local" name="ends_at" value="'+end+'" required></label></div><button class="btn primary" type="submit">Solicitar substituição</button></form></details>':'<p class="muted">Autorize, recuse ou revogue solicitações da equipe de educadores.</p>')+
 '<h4 style="margin:16px 0 7px">Solicitações e autorizações</h4>'+grants.filter(g=>profile.role==='coordenacao_geral'||g.substitute_id===profile.id).map(grantHtml).join('')+
 (!grants.length?'<p class="muted">Nenhuma solicitação registrada.</p>':'')+'</div>'+
 (active&&valid(active)?workHtml():'');
 const input=panel.querySelector('[data-es-month]');if(input)input.onchange=e=>{month=e.target.value;refresh()};
 const form=panel.querySelector('[data-es-request]');if(form)form.onsubmit=submitRequest;
 panel.querySelectorAll('[data-es-decide]').forEach(b=>b.onclick=()=>decide(b.dataset.esId,b.dataset.esDecide));
 panel.querySelectorAll('[data-es-enter]').forEach(b=>{b.onclick=()=>{sessionStorage.setItem(KEY,active?.id===b.dataset.esEnter?'':b.dataset.esEnter);refresh()}});
 panel.querySelectorAll('[data-es-edit]').forEach(b=>{b.onclick=()=>{const row=(data?.[({educator_plans:'plans',educator_records:'records',educator_reports:'reports',workshop_monthly_plans:'monthly',workshop_monthly_reports:'monthlyReports',workshop_plan_lessons:'lessons'})[b.dataset.esEdit]]||[]).find(x=>x.id===b.dataset.esId);if(row)openEditor(b.dataset.esEdit,row)}});
 panel.querySelectorAll('[data-es-new]').forEach(b=>{b.onclick=()=>{const type=b.dataset.esNew,plan=(type==='educator_reports'?data.plans:data.monthly).find(x=>x.id===b.dataset.esPlan);if(plan)openEditor(type,{},'new',plan)}});
 panel.querySelectorAll('[data-es-finish]').forEach(b=>{b.onclick=()=>finish(b.dataset.esFinish,b.dataset.esId)});
}
async function submitRequest(e){
 e.preventDefault();const f=new FormData(e.target),start=new Date(f.get('starts_at')),end=new Date(f.get('ends_at'));
 if(!(end>start)||end-start>31*86400000){notify('O fim deve ser posterior ao início e o período não pode exceder 31 dias.',true);return}
 try{
  const {error}=await supabaseClient().from('educator_substitutions').insert({
   educator_id:f.get('educator_id'),substitute_id:profile.id,requested_by:profile.id,
   reason:String(f.get('reason')).trim(),starts_at:start.toISOString(),ends_at:end.toISOString()
  });
  if(error)throw error;await refresh();notify('Solicitação enviada. Aguarde autorização da Coordenação Geral.');
 }catch(err){notify(err.message||String(err),true)}
}
async function decide(id,status){
 if(!confirm('Confirma '+({autorizada:'a autorização',recusada:'a recusa',revogada:'a revogação'})[status]+' desta substituição?'))return;
 try{
  const {error}=await supabaseClient().from('educator_substitutions').update({status}).eq('id',id);
  if(error)throw error;await refresh();notify('Situação da substituição atualizada.');
 }catch(err){notify(err.message||String(err),true)}
}
async function finish(type,id){
 if(!active||!valid(active))return;
 if(type==='educator_plans'){
  const p=data.plans.find(x=>x.id===id),report=data.reports.find(x=>x.plan_id===id);
  if(!report?.actual_description){notify('Registre a execução efetiva antes de concluir o planejamento.',true);return}
 }
 if(!confirm('Confirmar conclusão/finalização deste planejamento do educador substituído?'))return;
 try{
  const {data:row,error}=await supabaseClient().from(type).update({status:type==='educator_plans'?'concluido':'finalizado'}).eq('id',id).select('id').single();
  if(error)throw error;if(!row)throw Error('Atualização não autorizada.');
  await refresh();notify('Planejamento finalizado em nome do responsável, com substituto registrado na auditoria.');
 }catch(err){notify(err.message||String(err),true)}
}
async function refresh(){
 if(loading||!panel?.isConnected)return;
 loading=true;
 try{
  if(apiMode()!=='live')throw Error('O banco ainda não está conectado.');
  const c=supabaseClient(),{data:{user}}=await c.auth.getUser();
  if(!user)throw Error('Entre em sua conta para usar substituições.');
  const me=await c.from('profiles').select('id,display_name,role,active').eq('id',user.id).single();
  if(me.error)throw me.error;
  profile=me.data;
  if(!profile.active||!['educador','coordenacao_geral'].includes(profile.role)){panel.remove();panel=null;return}
  const [members,requests]=await Promise.all([
   c.from('profiles').select('id,display_name,role,active').eq('role','educador').eq('active',true),
   c.from('educator_substitutions').select('*').order('created_at',{ascending:false}).limit(100)
  ]);
  if(members.error)throw members.error;if(requests.error)throw requests.error;
  team=members.data||[];grants=requests.data||[];
  const id=sessionStorage.getItem(KEY);
  active=grants.find(g=>g.id===id&&g.substitute_id===profile.id&&valid(g))||null;
  if(!active)sessionStorage.removeItem(KEY);
  data=null;
  if(active)await loadWork();
  renderPanel();
 }catch(err){if(panel)panel.innerHTML='<div class="card"><h3>Substituição temporária</h3><p role="alert">Não foi possível carregar: '+esc(err.message||err)+'</p><button class="btn secondary" data-es-retry>Tentar novamente</button></div>';panel?.querySelector('[data-es-retry]')?.addEventListener('click',refresh)}
 finally{loading=false}
}
function mount(){
 const route=(location.hash||'#dashboard').slice(1).split(/[/?]/)[0];
 if(!['educador','coordenacao-geral'].includes(route))return;
 const host=document.querySelector('#app .content')||document.querySelector('#app main');
 if(!host||!host.querySelector('.page-head'))return;
 if(host.querySelector('#crj-educator-substitution'))return;
 panel=document.createElement('div');panel.id='crj-educator-substitution';panel.style.cssText='margin:14px 0 18px';
 const heading=host.querySelector('.page-head');heading.insertAdjacentElement('afterend',panel);
 refresh();
}
let timer=null;
function schedule(){clearTimeout(timer);timer=setTimeout(mount,140)}
window.addEventListener('hashchange',()=>{schedule();setTimeout(mount,650)});
document.addEventListener('DOMContentLoaded',schedule);
const app=document.querySelector('#app');if(app){new MutationObserver(()=>{if(!document.querySelector('#crj-educator-substitution'))schedule()}).observe(app,{childList:true,subtree:true})}
schedule();
