import { apiMode, supabaseClient, getSession } from './api.js?v=20261004-2';

const ART_ROLES=new Set(['coordenacao_geral','coordenacao_articulacao','articulador']);
const REQUEST_ROLES=new Set(['coordenacao_geral','coordenacao_articulacao','articulador','educador','assistente_social','psicologo','terapeuta_ocupacional']);
const STRATEGIES=['Mobilização de rua','Escolas','Redes sociais','WhatsApp','Lideranças comunitárias','OSCs / parceiros','CRAS / CREAS','UBS / rede de saúde','Rede de educação','Busca ativa','Jovens multiplicadores','Oficinas já existentes','Mobilização interna do CRJ','Outra estratégia'];
const SUPPORT_TYPES=['Mobilização territorial','Divulgação / redes sociais','Contato com escolas','Contato com parceiros / rede','Busca ativa de jovens','Mobilização interna no CRJ','Apoio de comunicação','Outro apoio'];
const FORM_URL='https://docs.google.com/forms/d/e/1FAIpQLScT3mZtnwEAebu9u0VYqZ8Zdil0U0SJhEQEME2udmcXATkNcQ/viewform';

let currentUser=null;
let scheduled=false;
let rendering=false;
let observer=null;
const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtDate=v=>v?new Date(String(v).length===10?String(v)+'T12:00:00':v).toLocaleDateString('pt-BR'):'—';
const splitCsv=v=>String(v||'').split(',').map(x=>x.trim()).filter(Boolean);
const statusLabel=s=>({solicitado:'Solicitado',em_elaboracao:'Em elaboração',planejado:'Planejado',em_mobilizacao:'Em mobilização',concluido:'Concluído',relatorio_finalizado:'Relatório finalizado',dispensado:'Mobilização dispensada',cancelado:'Cancelado',aberta:'Aberta',em_analise:'Em análise',encaminhada:'Encaminhada',atendida:'Atendida',nao_atendida:'Não atendida',arquivada:'Arquivada'}[s]||s||'—');
const typeLabel=t=>({cfdh:'CFDH',oficina:'Oficina',evento:'Evento / programação',passeio:'Passeio',campeonato:'Campeonato',vivencia:'Vivência',intercambio:'Intercâmbio',pvida:'PVida',ptrampo:'PTrampo',outra:'Outra ação'}[t]||String(t||'Ação'));
function client(){if(apiMode()!=='live')throw new Error('A Área da Articulação requer o banco conectado.');return supabaseClient()}

function injectStyle(){
  if(document.querySelector('#articulation-area-style'))return;
  const s=document.createElement('style');s.id='articulation-area-style';s.textContent=`
  .art-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0}.art-kpi{padding:15px;border:1px solid var(--line,#dfe7e5);border-radius:14px;background:#fff}.art-kpi b{font-size:24px;display:block}.art-kpi span{font-size:12px;color:var(--muted,#667)}
  .art-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 18px}.art-request{border:1px solid var(--line,#dfe7e5);border-radius:14px;padding:14px;background:#fff;margin-bottom:10px}.art-request.warn{border-color:#e9c66d;background:#fffaf0}.art-request-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.art-request h4{margin:0 0 4px}.art-request p{margin:5px 0;color:var(--muted,#667);font-size:13px}.art-request .meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
  .art-modal-bg{position:fixed;inset:0;z-index:2147482500;background:rgba(6,18,22,.68);backdrop-filter:blur(4px);display:grid;place-items:center;padding:18px}.art-modal{width:min(980px,97vw);max-height:94vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 30px 90px rgba(0,0,0,.35)}.art-modal-head{position:sticky;top:0;z-index:3;background:#fff;padding:17px 20px;border-bottom:1px solid #e4e9e7;display:flex;justify-content:space-between;gap:12px}.art-modal-head h3{margin:0}.art-modal-body{padding:18px 20px}.art-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.art-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}.art-section{border:1px solid #e2e9e6;border-radius:13px;padding:14px;margin:14px 0;background:#fbfdfc}.art-section h4{margin:0 0 8px}.art-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.art-check{display:flex;gap:7px;align-items:flex-start;padding:7px;border:1px solid #e5ece9;border-radius:9px;background:#fff}.art-actions{position:sticky;bottom:0;background:#fff;border-top:1px solid #e4e9e7;padding:13px 20px;display:flex;justify-content:flex-end;gap:8px}.art-close{border:0;background:transparent;font-size:27px;cursor:pointer}.art-request-panel{margin:14px 0;border:1px dashed #77aa9e;border-radius:13px;padding:13px;background:#f6fbf9}.art-request-panel h4{margin:0 0 5px}.art-request-panel [data-art-support-fields][hidden]{display:none}.art-demand-row{padding:12px 0;border-bottom:1px solid #e7ecea}.art-demand-row:last-child{border-bottom:0}.art-empty{padding:20px;text-align:center;color:#6b7773}.art-location-other[hidden]{display:none}
  @media(max-width:760px){.art-kpis,.art-grid,.art-grid.three,.art-checks{grid-template-columns:1fr}.art-modal-bg{padding:5px}.art-modal{width:100%;max-height:98vh}}
  `;document.head.appendChild(s);
}

function ensureNav(count=0){
  if(!ART_ROLES.has(currentUser?.role))return;
  const nav=document.querySelector('.sidebar .nav');if(!nav)return;
  let a=nav.querySelector('a[href="#articulacao"]');
  if(!a){a=document.createElement('a');a.href='#articulacao';a.innerHTML='<span>⌖</span><span>Área da Articulação</span>';const sep=nav.querySelector('.sep');nav.insertBefore(a,sep||null)}
  const label=a.querySelector('span:last-child');if(label)label.textContent=count?`Área da Articulação (${count})`:'Área da Articulação';
}

async function refreshNavCount(){
  if(!ART_ROLES.has(currentUser?.role)||apiMode()!=='live'){ensureNav(0);return}
  try{const {count,error}=await client().from('articulation_mobilization_requests').select('id',{count:'exact',head:true}).in('status',['solicitado','em_elaboracao']);if(error)throw error;ensureNav(count||0)}catch{ensureNav(0)}
}

function currentView(){return new URLSearchParams((location.hash.split('?')[1]||'')).get('view')||'mobilizacoes'}
async function renderArea(){
  if(!ART_ROLES.has(currentUser?.role)||!location.hash.startsWith('#articulacao')||rendering)return;
  const host=document.querySelector('.content');if(!host)return;
  const routeKey=location.hash;
  if(host.dataset.articulationRoute===routeKey)return;
  rendering=true;host.dataset.articulationRoute=routeKey;
  host.innerHTML='<div class="card"><div class="art-empty">Carregando Área da Articulação…</div></div>';
  try{
    const c=client();
    const [rq,pl,dm]=await Promise.all([
      c.from('articulation_mobilization_requests').select('*').order('planned_date',{ascending:true,nullsFirst:false}).order('created_at',{ascending:false}),
      c.from('articulation_mobilization_plans').select('*').order('created_at',{ascending:false}),
      c.from('articulation_demand_records').select('*').order('collection_date',{ascending:false}).order('created_at',{ascending:false})
    ]);
    for(const x of [rq,pl,dm])if(x.error)throw x.error;
    const requests=rq.data||[],plans=pl.data||[],demands=dm.data||[],planMap=new Map(plans.map(x=>[x.request_id,x]));
    const pending=requests.filter(x=>['solicitado','em_elaboracao'].includes(x.status)).length;
    const planned=requests.filter(x=>x.status==='planejado').length;
    const week=requests.filter(x=>x.planned_date&&Math.abs((new Date(x.planned_date+'T12:00:00')-Date.now())/86400000)<=7&&!['concluido','relatorio_finalizado','cancelado'].includes(x.status)).length;
    const openDemands=demands.filter(x=>!['atendida','nao_atendida','arquivada'].includes(x.status)).length;
    const view=currentView();
    host.innerHTML=`<div class="page-head"><div><h2>Área da Articulação</h2><p>Mobilização, leitura territorial e acompanhamento das demandas do CRJ Cariacica.</p></div><div class="actions"><button class="btn primary" data-art-new-demand>+ Levantamento de demanda</button></div></div>
      <div class="art-kpis"><div class="art-kpi"><b>${pending}</b><span>mobilizações aguardando plano</span></div><div class="art-kpi"><b>${planned}</b><span>mobilizações planejadas</span></div><div class="art-kpi"><b>${week}</b><span>ações nos próximos 7 dias</span></div><div class="art-kpi"><b>${openDemands}</b><span>demandas abertas / em análise</span></div></div>
      <div class="art-tabs"><button class="btn ${view==='mobilizacoes'?'primary':'secondary'}" data-art-view="mobilizacoes">Solicitações e mobilizações</button><button class="btn ${view==='demandas'?'primary':'secondary'}" data-art-view="demandas">Levantamento de demandas</button></div>
      ${view==='demandas'?demandPage(demands):mobilizationPage(requests,planMap)}`;
    bindArea(host,{requests,plans,demands,planMap});
    refreshNavCount();
  }catch(err){host.innerHTML=`<div class="notice danger">Não foi possível carregar a Área da Articulação: ${esc(err.message||err)}</div>`}
  finally{rendering=false}
}

function mobilizationPage(requests,planMap){
  if(!requests.length)return '<div class="card"><div class="art-empty">Nenhuma solicitação de mobilização registrada.</div></div>';
  return `<div class="card"><div class="page-head" style="margin-bottom:8px"><div><h3 style="margin:0">Solicitações de apoio</h3><p>Quando uma equipe solicita apoio dentro de um planejamento, a demanda aparece aqui até a conclusão do plano e do relatório.</p></div></div>${requests.map(r=>{const p=planMap.get(r.id),missing=!p&&r.status==='solicitado';return `<div class="art-request ${missing?'warn':''}"><div class="art-request-head"><div><h4>${esc(typeLabel(r.source_type))} · ${esc(r.source_title)}</h4><p>${r.objective?esc(r.objective):'Sem objetivo complementar informado.'}</p></div><span class="pill ${missing?'warn':'info'}">${esc(statusLabel(r.status))}</span></div><div class="meta">${r.planned_date?`<span class="pill">${esc(fmtDate(r.planned_date))}</span>`:''}${r.location?`<span class="pill">${esc(r.location)}</span>`:''}${r.expected_participants!=null?`<span class="pill">${Number(r.expected_participants)} jovem(ns)</span>`:''}</div>${missing?'<div class="notice warn" style="margin-top:10px"><b>⚠ Plano de mobilização necessário.</b> A equipe solicitou apoio da Articulação e ainda não existe plano elaborado.</div>':''}<div class="actions" style="margin-top:10px"><button class="btn primary" data-art-plan="${r.id}">${p?'Abrir / atualizar plano':'Elaborar plano de mobilização'}</button>${p&&['concluido','relatorio_finalizado'].includes(p.status)?`<button class="btn secondary" data-art-annex8="${r.id}">Abrir Anexo 8</button>`:''}</div></div>`}).join('')}</div>`;
}

function demandPage(rows){
  return `<div class="grid two"><div class="card"><div class="page-head" style="margin-bottom:8px"><div><h3 style="margin:0">Levantamento de Demandas</h3><p>Versão digital estruturada do Formulário de Demanda do CRJ Cariacica.</p></div><button class="btn primary" data-art-new-demand>+ Registrar</button></div>${rows.map(d=>`<div class="art-demand-row"><div class="art-request-head"><div><b>${esc(d.full_name||d.social_name||'Registro sem nome informado')}</b><div class="muted">${fmtDate(d.collection_date)}${d.mapping_action_name?' · '+esc(d.mapping_action_name):''}</div></div><span class="pill">${esc(statusLabel(d.status))}</span></div><p><b>Oficina/atividade desejada:</b> ${esc(d.desired_workshop||'—')}</p>${d.community_missing?`<p><b>O que falta na comunidade:</b> ${esc(d.community_missing)}</p>`:''}<div class="actions"><button class="btn secondary" data-art-demand-edit="${d.id}">Abrir / atualizar</button></div></div>`).join('')||'<div class="art-empty">Nenhuma demanda registrada.</div>'}</div><div class="card"><h3>Leitura territorial</h3><p class="muted">Os registros ficam estruturados para posterior cruzamento por território, disponibilidade, atividade desejada e demanda comunitária.</p><div class="notice info"><b>Importante:</b> registrar uma demanda não contabiliza execução de meta. O fluxo correto permanece: demanda → planejamento → ação executada → evidência → indicador.</div></div></div>`;
}

function bindArea(host,ctx){
  host.querySelectorAll('[data-art-view]').forEach(b=>b.addEventListener('click',()=>{location.hash='#articulacao?view='+b.dataset.artView}));
  host.querySelectorAll('[data-art-new-demand]').forEach(b=>b.addEventListener('click',()=>openDemandModal(null)));
  host.querySelectorAll('[data-art-demand-edit]').forEach(b=>b.addEventListener('click',()=>openDemandModal(ctx.demands.find(x=>x.id===b.dataset.artDemandEdit)||null)));
  host.querySelectorAll('[data-art-plan]').forEach(b=>b.addEventListener('click',()=>openPlanModal(ctx.requests.find(x=>x.id===b.dataset.artPlan),ctx.planMap.get(b.dataset.artPlan)||null)));
  host.querySelectorAll('[data-art-annex8]').forEach(b=>b.addEventListener('click',()=>{location.hash='#formulario/relatorio-mobilizacao'}));
}

async function articulators(){
  try{const {data,error}=await client().from('profiles').select('id,display_name,role').in('role',['articulador','coordenacao_articulacao']).eq('active',true).order('display_name');if(error)throw error;return data||[]}catch{return []}
}
function checkboxes(name,items,selected=[]){const set=new Set(selected||[]);return `<div class="art-checks">${items.map(x=>`<label class="art-check"><input type="checkbox" name="${name}" value="${esc(x)}" ${set.has(x)?'checked':''}><span>${esc(x)}</span></label>`).join('')}</div>`}
function modalShell(title,subtitle,body,saveLabel='Salvar'){
  document.querySelector('#art-modal-bg')?.remove();const bg=document.createElement('div');bg.id='art-modal-bg';bg.className='art-modal-bg';bg.innerHTML=`<div class="art-modal"><div class="art-modal-head"><div><h3>${esc(title)}</h3><div class="muted">${esc(subtitle||'')}</div></div><button class="art-close" type="button">×</button></div>${body}</div>`;document.body.appendChild(bg);const close=()=>bg.remove();bg.querySelector('.art-close').onclick=close;bg.addEventListener('click',e=>{if(e.target===bg)close()});return {bg,close}}

async function openDemandModal(row){
  const arts=await articulators(),r=row||{};
  const body=`<form id="art-demand-form"><div class="art-modal-body"><div class="notice info"><b>Formulário de Demanda · CRJ Cariacica</b><br>Deixe sua sugestão de oficina ou uma ideia que você gostaria que acontecesse no CRJ.<br><small>Rua Che Guevara, 191, Castelo Branco, Cariacica - ES · Contato: 27 98171-0035 · Equipe de Articulação</small></div>
  <div class="art-grid"><div class="field"><label>Articulador (opcional)</label><select name="articulator_user_id"><option value="">Não informar</option>${arts.map(a=>`<option value="${a.id}" ${r.articulator_user_id===a.id?'selected':''}>${esc(a.display_name)}</option>`).join('')}</select></div><div class="field"><label>Data do levantamento</label><input class="input" type="date" name="collection_date" value="${esc(r.collection_date||new Date().toISOString().slice(0,10))}"></div></div>
  <div class="art-grid"><div class="field"><label>Nome completo</label><input class="input" name="full_name" value="${esc(r.full_name||'')}"></div><div class="field"><label>Como prefere ser chamado (Nome Social)</label><input class="input" name="social_name" value="${esc(r.social_name||'')}"></div></div>
  <div class="art-grid"><div class="field"><label>Data de nascimento</label><input class="input" type="date" name="birth_date" value="${esc(r.birth_date||'')}"></div><div class="field"><label>Onde você mora? (Rua, Nº, Bairro, Município)</label><input class="input" name="residence" value="${esc(r.residence||'')}"></div></div>
  <div class="art-grid three"><div class="field"><label>Qual sua cor/raça?</label><select name="race"><option value="">Selecione</option>${['Preto','Branco','Indígena','Pardo','Amarelo'].map(x=>`<option ${r.race===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Gênero *</label><select name="gender" required><option value="">Selecione</option>${['Feminino','Masculino','Prefiro não informar'].map(x=>`<option ${r.gender===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Religião</label><input class="input" name="religion" value="${esc(r.religion||'')}"></div></div>
  <div class="field"><label>Contato (telefone, e-mail)</label><input class="input" name="contact" value="${esc(r.contact||'')}"></div>
  <div class="field"><label>Dentro do território, onde costuma encontrar os amigos?</label><textarea name="friend_places">${esc(r.friend_places||'')}</textarea></div>
  <div class="field"><label>Nos conte qual oficina ou atividade você gostaria que tivesse no CRJ? *</label><textarea name="desired_workshop" required>${esc(r.desired_workshop||'')}</textarea></div>
  <div class="art-section"><h4>Qual melhor dia?</h4>${checkboxes('preferred_days',['Segunda','Terça','Quarta','Quinta','Sexta'],r.preferred_days||[])}</div>
  <div class="art-section"><h4>Turno da disponibilidade</h4>${checkboxes('availability_shifts',['Manhã','Tarde','Noite'],r.availability_shifts||[])}</div>
  <div class="field"><label>O que você acha que falta na sua comunidade?</label><textarea name="community_missing">${esc(r.community_missing||'')}</textarea></div>
  <div class="field"><label>Quais locais/lugares você gostaria de conhecer?</label><textarea name="places_to_visit">${esc(r.places_to_visit||'')}</textarea></div>
  <div class="field"><label>Você possui alguma habilidade/dom? Se sim, nos conte qual</label><textarea name="skills">${esc(r.skills||'')}</textarea></div>
  <div class="field"><label>Nome da ação / Local de Mapeamento (onde a atividade está acontecendo)</label><input class="input" name="mapping_action_name" value="${esc(r.mapping_action_name||'')}"></div>
  <div class="art-grid"><div class="field"><label>Local do mapeamento</label><select name="mapping_location_type"><option value="">Selecione</option>${['CRJ','Território','Outro'].map(x=>`<option ${r.mapping_location_type===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field art-location-other" data-art-location-other ${r.mapping_location_type==='Outro'?'':'hidden'}><label>Outro local</label><input class="input" name="mapping_location_other" value="${esc(r.mapping_location_other||'')}"></div></div>
  <div class="art-grid"><div class="field"><label>Status interno</label><select name="status">${['aberta','em_analise','encaminhada','atendida','nao_atendida','arquivada'].map(x=>`<option value="${x}" ${r.status===x?'selected':''}>${statusLabel(x)}</option>`).join('')}</select></div><div class="field"><label>Observações internas</label><input class="input" name="notes" value="${esc(r.notes||'')}"></div></div>
  </div><div class="art-actions"><button class="btn secondary" type="button" data-art-cancel>Cancelar</button><button class="btn primary">${row?'Salvar alterações':'Registrar demanda'}</button></div></form>`;
  const {bg,close}=modalShell('Levantamento de Demanda','Formulário oficial da Articulação do CRJ Cariacica',body);
  bg.querySelector('[data-art-cancel]').onclick=close;
  const form=bg.querySelector('#art-demand-form');form.querySelector('[name="mapping_location_type"]').addEventListener('change',e=>{bg.querySelector('[data-art-location-other]').hidden=e.target.value!=='Outro'});
  form.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(form),arr=n=>fd.getAll(n).map(String);const payload={articulator_user_id:fd.get('articulator_user_id')||null,collection_date:fd.get('collection_date')||new Date().toISOString().slice(0,10),full_name:fd.get('full_name')||null,social_name:fd.get('social_name')||null,birth_date:fd.get('birth_date')||null,residence:fd.get('residence')||null,race:fd.get('race')||null,gender:fd.get('gender')||null,religion:fd.get('religion')||null,contact:fd.get('contact')||null,friend_places:fd.get('friend_places')||null,desired_workshop:fd.get('desired_workshop')||null,preferred_days:arr('preferred_days'),availability_shifts:arr('availability_shifts'),community_missing:fd.get('community_missing')||null,places_to_visit:fd.get('places_to_visit')||null,skills:fd.get('skills')||null,mapping_action_name:fd.get('mapping_action_name')||null,mapping_location_type:fd.get('mapping_location_type')||null,mapping_location_other:fd.get('mapping_location_other')||null,status:fd.get('status')||'aberta',notes:fd.get('notes')||null,demand_category:'oficina_atividade',demand_description:fd.get('desired_workshop')||null,external_form_url:FORM_URL,updated_at:new Date().toISOString()};try{let q;if(row)q=client().from('articulation_demand_records').update(payload).eq('id',row.id);else q=client().from('articulation_demand_records').insert(payload);const {error}=await q;if(error)throw error;close();document.querySelector('.content')?.removeAttribute('data-articulation-route');await renderArea()}catch(err){alert('Não foi possível salvar a demanda: '+(err.message||err))}});
}

async function openPlanModal(request,plan){
  if(!request)return;const p=plan||{};
  const body=`<form id="art-plan-form"><div class="art-modal-body"><div class="notice info"><b>${esc(typeLabel(request.source_type))} · ${esc(request.source_title)}</b><br>${request.planned_date?fmtDate(request.planned_date):'Data ainda não definida'}${request.location?' · '+esc(request.location):''}${request.expected_participants!=null?' · '+Number(request.expected_participants)+' jovem(ns) previstos':''}</div>
  <div class="field"><label>Objetivo da mobilização</label><textarea name="mobilization_goal">${esc(p.mobilization_goal||request.objective||'')}</textarea></div>
  <div class="art-grid"><div class="field"><label>Público prioritário</label><input class="input" name="target_audience" value="${esc(p.target_audience||request.target_audience||'')}"></div><div class="field"><label>Territórios / bairros prioritários</label><input class="input" name="territories" value="${esc((p.territories||request.territories||[]).join(', '))}" placeholder="Separe por vírgulas"></div></div>
  <div class="art-grid"><div class="field"><label>Meta de alcance</label><input class="input" type="number" min="0" name="reach_target" value="${esc(p.reach_target??'')}"></div><div class="field"><label>Meta de participação</label><input class="input" type="number" min="0" name="attendance_target" value="${esc(p.attendance_target??request.expected_participants??'')}"></div></div>
  <div class="art-section"><h4>Estratégias de mobilização</h4>${checkboxes('strategy',STRATEGIES,p.strategies||[])}</div>
  <div class="field"><label>Mensagem / abordagem principal</label><textarea name="main_message">${esc(p.main_message||'')}</textarea></div>
  <div class="art-grid"><div class="field"><label>Locais que serão visitados</label><textarea name="places">${esc(p.places||'')}</textarea></div><div class="field"><label>Parceiros envolvidos</label><textarea name="partners">${esc(p.partners||'')}</textarea></div></div>
  <div class="art-grid"><div class="field"><label>Materiais necessários</label><textarea name="materials">${esc(p.materials||'')}</textarea></div><div class="field"><label>Responsáveis pela mobilização</label><textarea name="responsible_text">${esc(p.responsible_text||'')}</textarea></div></div>
  <div class="field"><label>Cronograma da mobilização</label><textarea name="schedule_text">${esc(p.schedule_text||'')}</textarea></div>
  <div class="art-grid"><div class="field"><label>Data limite da mobilização</label><input class="input" type="date" name="mobilization_deadline" value="${esc(p.mobilization_deadline||request.planned_date||'')}"></div><div class="field"><label>Status</label><select name="status">${['em_elaboracao','planejado','em_mobilizacao','concluido','relatorio_finalizado','cancelado'].map(x=>`<option value="${x}" ${p.status===x?'selected':''}>${statusLabel(x)}</option>`).join('')}</select></div></div>
  <div class="field"><label>Observações</label><textarea name="notes">${esc(p.notes||'')}</textarea></div>
  <div class="art-section"><h4>Execução e fechamento</h4><div class="art-grid"><div class="field"><label>Alcance real</label><input class="input" type="number" min="0" name="actual_reach" value="${esc(p.actual_reach??'')}"></div><div class="field"><label>Participantes reais</label><input class="input" type="number" min="0" name="actual_participants" value="${esc(p.actual_participants??'')}"></div></div><div class="field"><label>Pontos positivos</label><textarea name="positives">${esc(p.positives||'')}</textarea></div><div class="field"><label>Dificuldades</label><textarea name="difficulties">${esc(p.difficulties||'')}</textarea></div><div class="field"><label>Expectativas relatadas pelos jovens</label><textarea name="youth_expectations">${esc(p.youth_expectations||'')}</textarea></div><div class="field"><label>Observações da execução</label><textarea name="execution_notes">${esc(p.execution_notes||'')}</textarea></div></div>
  </div><div class="art-actions"><button class="btn secondary" type="button" data-art-cancel>Cancelar</button><button class="btn primary">Salvar plano</button></div></form>`;
  const {bg,close}=modalShell('Plano de Mobilização','Plano vinculado à solicitação da equipe',body);bg.querySelector('[data-art-cancel]').onclick=close;
  bg.querySelector('#art-plan-form').addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.target),num=n=>fd.get(n)===''?null:Number(fd.get(n)),status=String(fd.get('status')||'em_elaboracao');const payload={request_id:request.id,articulator_user_id:p.articulator_user_id||currentUser.id,mobilization_goal:fd.get('mobilization_goal')||null,target_audience:fd.get('target_audience')||null,territories:splitCsv(fd.get('territories')),reach_target:num('reach_target'),attendance_target:num('attendance_target'),strategies:fd.getAll('strategy').map(String),main_message:fd.get('main_message')||null,places:fd.get('places')||null,partners:fd.get('partners')||null,materials:fd.get('materials')||null,responsible_text:fd.get('responsible_text')||null,schedule_text:fd.get('schedule_text')||null,mobilization_deadline:fd.get('mobilization_deadline')||null,notes:fd.get('notes')||null,status,actual_reach:num('actual_reach'),actual_participants:num('actual_participants'),positives:fd.get('positives')||null,difficulties:fd.get('difficulties')||null,youth_expectations:fd.get('youth_expectations')||null,execution_notes:fd.get('execution_notes')||null,completed_at:['concluido','relatorio_finalizado'].includes(status)?new Date().toISOString():null,updated_at:new Date().toISOString()};try{const {error}=await client().from('articulation_mobilization_plans').upsert(payload,{onConflict:'request_id'});if(error)throw error;const {error:re}=await client().from('articulation_mobilization_requests').update({status,assigned_to:currentUser.id,updated_at:new Date().toISOString()}).eq('id',request.id);if(re)throw re;close();document.querySelector('.content')?.removeAttribute('data-articulation-route');await renderArea()}catch(err){alert('Não foi possível salvar o plano: '+(err.message||err))}});
}

function planningSource(form){
  const hash=location.hash.toLowerCase(),slug=form.dataset.slug||'';
  if(form.id==='edu-comp-form'){const t=form.querySelector('[name="complementary_type"]')?.value||'evento';return {type:t}}
  if(slug==='pvida')return {type:'pvida'};if(slug==='ptrampo')return {type:'ptrampo'};
  if(hash.includes('cfdh'))return {type:'cfdh'};
  if(form.querySelector('[name="general_objective"],[name="plan_month"]'))return {type:'oficina'};
  if(hash.includes('agenda')||form.querySelector('[name="event_type"],[name="starts_at"]'))return {type:'evento'};
  if(form.querySelector('[name="activity_title"],[name="planned_actions"]'))return {type:'evento'};
  return null;
}
function isPlanningForm(form){if(!(form instanceof HTMLFormElement)||form.dataset.artMobilizationEnhanced==='1')return false;if(form.closest('#art-modal-bg'))return false;return Boolean(planningSource(form))}
function firstValue(form,names){for(const n of names){const el=form.querySelector(`[name="${n}"]`);if(el?.value)return el.value}return ''}
function enhancePlanningForm(form){
  if(!REQUEST_ROLES.has(currentUser?.role)||!isPlanningForm(form))return;form.dataset.artMobilizationEnhanced='1';const src=planningSource(form);const box=document.createElement('div');box.className='art-request-panel';box.innerHTML=`<h4>Apoio da Articulação</h4><p class="muted">Solicite um plano de mobilização para esta ação. A Articulação receberá um alerta na área compartilhada.</p><label class="check"><input type="checkbox" data-art-need-support><span>Esta ação necessita de apoio da Articulação</span></label><div data-art-support-fields hidden><div class="art-section"><h4>Que apoio será necessário?</h4>${checkboxes('art_support_type',SUPPORT_TYPES,[])}</div><div class="art-grid"><div class="field"><label>Objetivo da mobilização</label><textarea name="art_support_objective"></textarea></div><div class="field"><label>Público que pretende alcançar</label><textarea name="art_target_audience"></textarea></div></div><div class="art-grid"><div class="field"><label>Quantidade estimada</label><input class="input" type="number" min="0" name="art_expected_participants"></div><div class="field"><label>Território / bairro prioritário</label><input class="input" name="art_territories" placeholder="Separe por vírgulas"></div></div><div class="field"><label>Observação para a Articulação</label><textarea name="art_support_notes"></textarea></div><button class="btn primary" type="button" data-art-send-request>Enviar solicitação à Articulação</button><span class="muted" data-art-request-status style="margin-left:8px"></span></div>`;
  const actions=form.querySelector('.actions:last-child,.edu-comp-actions');if(actions?.parentElement)actions.parentElement.insertBefore(box,actions);else form.appendChild(box);
  box.querySelector('[data-art-need-support]').addEventListener('change',e=>{box.querySelector('[data-art-support-fields]').hidden=!e.target.checked});
  box.querySelector('[data-art-send-request]').addEventListener('click',async()=>{const status=box.querySelector('[data-art-request-status]'),btn=box.querySelector('[data-art-send-request]');btn.disabled=true;status.textContent='Enviando…';const sourceNow=planningSource(form)||src;const title=firstValue(form,['activity_title','title','class_name','theme','general_objective'])||typeLabel(sourceNow.type)+' planejado';const plannedDate=firstValue(form,['planned_start','scheduled_date','start_date','date']);const plannedTime=firstValue(form,['start_time','starts_at']);const location=firstValue(form,['location','location_other','location_details']);const expected=firstValue(form,['expected_participants','participant_count']);const payload={source_type:sourceNow.type||'outra',source_id:null,source_route:location.hash,source_title:title,requester_role:currentUser.role,planned_date:plannedDate||null,planned_time:(plannedTime&&/^\d{2}:\d{2}/.test(plannedTime))?plannedTime.slice(0,5):null,location:location||null,objective:box.querySelector('[name="art_support_objective"]')?.value||null,target_audience:box.querySelector('[name="art_target_audience"]')?.value||null,expected_participants:expected?Number(expected):(box.querySelector('[name="art_expected_participants"]')?.value?Number(box.querySelector('[name="art_expected_participants"]').value):null),territories:splitCsv(box.querySelector('[name="art_territories"]')?.value),support_types:[...box.querySelectorAll('[name="art_support_type"]:checked')].map(x=>x.value),notes:box.querySelector('[name="art_support_notes"]')?.value||null,status:'solicitado'};try{const {error}=await client().from('articulation_mobilization_requests').insert(payload);if(error)throw error;status.textContent='✓ Solicitação enviada';btn.textContent='Solicitação enviada';refreshNavCount()}catch(err){status.textContent='Erro: '+(err.message||err);btn.disabled=false}});
}
function enhancePlanningForms(){document.querySelectorAll('form').forEach(enhancePlanningForm)}

function apply(){injectStyle();ensureNav();enhancePlanningForms();if(location.hash.startsWith('#articulacao'))renderArea()}
function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;apply()})}

window.addEventListener('hashchange',()=>{document.querySelector('.content')?.removeAttribute('data-articulation-route');setTimeout(schedule,30)});
(async()=>{try{currentUser=(await getSession())?.user||null}catch{}if(!currentUser)return;injectStyle();observer=new MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true});apply();refreshNavCount()})();
