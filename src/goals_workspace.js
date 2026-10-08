import { apiMode, supabaseClient } from './api.js?v=20261004-2';

const CONTRACT_START='2025-10-01';
const CONTRACT_END='2027-04-01';
const ROLE_LABELS={
  coordenacao_geral:'Coordenação Geral',coordenacao_articulacao:'Coordenação de Articulação',articulador:'Articulação',educador:'Educador(a)',
  assistente_social:'Assistente Social',psicologo:'Psicólogo(a)',terapeuta_ocupacional:'Terapeuta Ocupacional',administrativo:'Administrativo',
  controlador_acesso:'Controlador(a) de Acessos',monitoramento:'Monitoramento',oficineiro:'Oficineiro(a)'
};
const SOURCE_LABELS={
  technical_action_plans:'Planejamento técnico',cfdh_actions:'CFDH',workshop_plan_lessons:'Planejamento de oficina',access_resource_bookings:'Agendamento / empréstimo',
  educator_plans:'Planejamento do educador',workshop_sessions:'Aula executada',attendance:'Presença em oficina',followups:'Acompanhamento',service_records:'Atendimento',
  aggregate_records:'Lançamento geral',methodology_form_submissions:'Formulário metodológico',benefits:'Benefício'
};
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>Number(v||0);
const fmt=v=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:2});
const nowMonth=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date());
const monthDate=m=>`${m}-01`;
const nextMonth=m=>{const [y,mo]=m.split('-').map(Number);return new Date(Date.UTC(y,mo,1)).toISOString().slice(0,7)};
const shiftMonth=(m,delta)=>{const [y,mo]=m.split('-').map(Number);return new Date(Date.UTC(y,mo-1+delta,1)).toISOString().slice(0,7)};
const monthLabel=m=>new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${m}-01T12:00:00Z`));
const titleCase=s=>String(s||'').replace(/^./,x=>x.toUpperCase());
const routeMonth=()=>new URLSearchParams((location.hash.split('?')[1]||'')).get('month')||nowMonth();
const onRoute=()=>location.hash.split('?')[0]==='#metas';
const client=()=>apiMode()==='live'?supabaseClient():null;
let me=null,busy=false,timer=null,lastKey='',state={scope:'mine',tab:'forecast',responsible:'all'};

function style(){if(document.querySelector('#goals-workspace-style'))return;const s=document.createElement('style');s.id='goals-workspace-style';s.textContent=`
.gw{display:grid;gap:14px}.gw-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.gw-head h2{margin:0}.gw-sub{color:var(--muted,#687671);font-size:12px;margin-top:4px;max-width:900px}.gw-toolbar,.gw-tabs,.gw-filter{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.gw-tab{border:1px solid var(--line,#dfe7e5);background:#fff;border-radius:999px;padding:8px 12px;cursor:pointer;font-weight:700}.gw-tab.active{background:var(--brand,#0b5b4c);color:white;border-color:var(--brand,#0b5b4c)}.gw-month{display:flex;align-items:center;gap:7px;border:1px solid var(--line,#dfe7e5);background:#fff;border-radius:12px;padding:7px 9px}.gw-month input,.gw-filter select{border:0;background:transparent;font:inherit;outline:none}.gw-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px}.gw-kpi{background:#fff;border:1px solid var(--line,#dfe7e5);border-radius:13px;padding:12px}.gw-kpi small{color:var(--muted,#687671)}.gw-kpi b{display:block;font-size:24px;margin-top:2px}.gw-notice{border:1px solid #d7e5e0;background:#f5faf8;border-radius:12px;padding:10px 12px;font-size:12px}.gw-list{display:grid;gap:10px}.gw-card{background:#fff;border:1px solid var(--line,#dfe7e5);border-radius:14px;padding:13px}.gw-card.risk{border-color:#e4bc63;background:#fffdf8}.gw-card.success{border-color:#afd5c7}.gw-card.over{border-color:#e4a6a6;background:#fff9f9}.gw-row{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}.gw-card h3{margin:0;font-size:15px}.gw-meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.gw-pill{display:inline-flex;align-items:center;border-radius:999px;padding:4px 7px;background:#eef5f2;font-size:10px}.gw-pill.ok{background:#e7f7ee;color:#17633f}.gw-pill.warn{background:#fff3d4;color:#755100}.gw-pill.danger{background:#fdeaea;color:#8a2f2f}.gw-values{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}.gw-value{border:1px solid #e6ecea;border-radius:10px;padding:9px}.gw-value small{color:var(--muted,#687671);display:block}.gw-value b{font-size:18px}.gw-progress{height:8px;background:#edf2f0;border-radius:99px;overflow:hidden;margin-top:8px}.gw-progress i{display:block;height:100%;background:var(--brand,#0b5b4c)}.gw-insight{margin-top:10px;padding:10px;border-radius:10px;background:#fff4d9;border:1px solid #ecd28c;font-size:12px}.gw-insight.ok{background:#edf8f2;border-color:#bddfce}.gw-details{margin-top:10px;border-top:1px dashed #d6e1dd;padding-top:10px}.gw-details[hidden]{display:none}.gw-path{display:grid;gap:7px;margin-top:8px}.gw-path-row{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(90px,.5fr) minmax(140px,.8fr);gap:8px;padding:8px;border:1px solid #e7ecea;border-radius:9px;background:#fbfdfc;font-size:11px}.gw-path-row small{color:var(--muted,#687671)}.gw-empty{padding:22px;text-align:center;color:var(--muted,#687671);border:1px dashed #d5dfdc;border-radius:12px}.gw-formula{font-size:11px;padding:8px 9px;background:#f2f6f5;border-radius:9px;margin-top:7px}.gw-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:9px}.gw-section-title{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap}.gw-section-title h3{margin:0}.gw-coverage{font-size:10px;color:var(--muted,#687671)}
@media(max-width:980px){.gw-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.gw-values{grid-template-columns:1fr 1fr}.gw-path-row{grid-template-columns:1fr}}
@media(max-width:620px){.gw-summary,.gw-values{grid-template-columns:1fr}}
`;document.head.appendChild(s)}

function periodFor(ind,m){
  const p=String(ind.periodicity||'mensal').toLowerCase();
  let start=m,end=nextMonth(m),label=titleCase(p);
  if(p==='bimestral'){start=shiftMonth(m,-1);label='Janela bimestral';}
  else if(p==='trimestral'){start=shiftMonth(m,-2);label='Janela trimestral';}
  else if(p==='semestral'){start=shiftMonth(m,-5);label='Janela semestral';}
  else if(p==='anual'){
    start=m>='2026-10'?'2026-10':'2025-10';end=m>='2026-10'?'2027-04':'2026-10';label='Janela anual contratual';
  }else if(p==='pontual'||p==='final'){start='2025-10';label=p==='final'?'Acumulado até a entrega final':'Acumulado até a competência';}
  if(start<'2025-10')start='2025-10';if(end>'2027-04')end='2027-04';
  return {start:`${start}-01`,end:`${end}-01`,label};
}
function isYouth(ind){return /jovens/i.test(ind.unit||'')||/_JOVENS/.test(ind.code||'')}
function isPercent(ind){return String(ind.unit||'').includes('%')}
function actualValue(rows,ind){
  const agg=rows.filter(x=>x.source_mode==='aggregate');
  const identified=rows.filter(x=>x.source_mode!=='aggregate');
  if(isYouth(ind)){
    const ids=new Set(identified.map(x=>x.youth_id).filter(Boolean));
    return {value:ids.size+agg.reduce((s,x)=>s+num(x.quantity),0),identified:ids.size,aggregate:agg.reduce((s,x)=>s+num(x.quantity),0)};
  }
  if(isPercent(ind)){
    const vals=rows.map(x=>num(x.quantity)).filter(Number.isFinite);const value=vals.length?Math.max(...vals):0;return {value,identified:value,aggregate:0};
  }
  return {value:rows.reduce((s,x)=>s+num(x.quantity),0),identified:identified.reduce((s,x)=>s+num(x.quantity),0),aggregate:agg.reduce((s,x)=>s+num(x.quantity),0)};
}
function forecastValue(rows,ind){
  if(isPercent(ind))return rows.length?Math.max(...rows.map(x=>num(x.quantity))):0;
  return rows.reduce((s,x)=>s+num(x.quantity),0);
}
function statusFor(ind,actual,projected){
  const target=ind.target==null?null:num(ind.target),mode=ind.target_mode||'minimum';
  if(target==null||mode==='tracking')return {kind:'tracking',label:'Acompanhamento',progress:null};
  if(mode==='ceiling'){
    const over=projected>target;return {kind:over?'over':'success',label:over?'Projeção acima do limite':'Dentro do limite',progress:Math.min(100,target?projected/target*100:0)};
  }
  const hit=projected>=target,done=actual>=target;return {kind:done?'success':hit?'success':'risk',label:done?'Meta concretizada':hit?'Planejamento suficiente':'Risco de não atingir',progress:Math.min(100,target?projected/target*100:0)};
}
function unitText(ind,v){return `${fmt(v)} ${ind.unit||''}`.trim()}
function howGenerated(ind){
  if(isYouth(ind))return 'Jovens identificados são deduplicados por ID dentro da janela do indicador. Lançamentos agregados aparecem separados porque não podem ser deduplicados com segurança.';
  if(isPercent(ind))return 'O percentual considera o valor percentual registrado/evidenciado no período; o sistema não soma percentuais entre si.';
  if(/HORAS/.test(ind.code))return 'Soma das durações efetivamente executadas. Na previsão, soma a duração das ações/aulas ainda planejadas e não executadas.';
  if(/ATIVIDADES|EVENTOS|MOSTRAS|REUNIOES|ENCONTROS|PARCERIAS|EMPRESTIMOS|RELATORIO|FORMACOES|VISITAS/.test(ind.code))return 'Cada execução válida vinculada ao indicador conta uma ocorrência. A previsão usa os registros planejados ainda não concretizados.';
  if(/PARTICIPACOES/.test(ind.code))return 'Soma das participações registradas; quando a fonte é nominal, cada presença gera a contribuição correspondente.';
  return 'O valor é formado pelos eventos de indicador gerados pelas ações executadas e pelos vínculos metodológicos registrados no sistema.';
}
function insight(ind,gap,projected,forecastRows){
  const g=Math.max(0,gap),code=ind.code||'';
  if(ind.target==null||ind.target_mode==='tracking')return 'Indicador de acompanhamento: mantenha os registros e evidências atualizados; não há mínimo contratual numérico cadastrado.';
  if(ind.target_mode==='ceiling')return projected>num(ind.target)?`A projeção ultrapassa o limite/referência em ${unitText(ind,projected-num(ind.target))}. Revise o planejamento antes de executar novas ações que alimentem este indicador.`:'A projeção está dentro do limite/referência contratual. Não é necessário aumentar o valor apenas para alcançar o teto.';
  if(g<=0)return 'O realizado somado ao que já está planejado é suficiente para alcançar a referência desta competência.';
  if(/PVIDA_HORAS/.test(code))return `Faltam aproximadamente ${unitText(ind,g)}. Planeje novas ações PVida ou vincule uma ação CFDH pertinente ao PVida, com duração registrada e lista de presença.`;
  if(/PVIDA_JOVENS/.test(code))return `Faltam aproximadamente ${fmt(g)} jovem(ns). Priorize uma ação PVida coletiva com capacidade nominal para pelo menos ${Math.ceil(g)} jovens e registre a presença sem duplicar IDs.`;
  if(/PTRAMPO_ATIVIDADES/.test(code))return `Faltam ${Math.ceil(g)} atividade(s). Crie ${Math.ceil(g)} ação(ões) PTrampo no planejamento técnico ou vincule ações CFDH que efetivamente realizem PTrampo.`;
  if(/PTRAMPO_JOVENS/.test(code))return `Faltam aproximadamente ${fmt(g)} jovem(ns). Planeje PTrampo coletivo direcionado a pelo menos ${Math.ceil(g)} jovens ainda não contabilizados no período.`;
  if(/OFICINAS_HORAS/.test(code))return `Faltam ${unitText(ind,g)}. Distribua essa carga entre oficinas existentes ou planeje encontros adicionais no calendário mensal.`;
  if(/CURSO_HORAS/.test(code))return `Faltam ${unitText(ind,g)} de formação profissionalizante. Planeje encontros adicionais em cursos/oficinas classificados corretamente como profissionalizantes.`;
  if(/CFDH_HORAS/.test(code))return `Faltam ${unitText(ind,g)} de CFDH. Acrescente ações estruturais/transversais com duração definida e responsáveis vinculados.`;
  if(/EVENTOS/.test(code))return `Falta ${Math.ceil(g)} evento/programação. Planeje ao menos uma ação do Cola Aê marcada como evento/programação e garanta a evidência de execução.`;
  if(/REUNIOES_REDE|ENCONTROS_REDE/.test(code))return `Falta ${Math.ceil(g)} encontro/reunião. Abra uma ação de articulação com a rede, responsável, data e evidência prevista.`;
  if(/VISITAS_ESCOLA/.test(code))return `Falta ${Math.ceil(g)} visita. Planeje a mobilização/visita à escola ainda nesta competência e vincule responsável e relatório.`;
  if(/SATISFACAO/.test(code))return 'A meta depende de pesquisa/avaliação. Programe a aplicação, garanta número suficiente de respostas e registre o percentual consolidado.';
  if(/MOSTRAS/.test(code))return `Falta ${Math.ceil(g)} mostra. Planeje a Mostra de Profissões/mostra institucional na competência prevista pelo cronograma.`;
  if(/PARCERIAS|ACOES/.test(code))return `Há lacuna de ${fmt(g)} ${ind.unit||'registro(s)'}. Planeje uma ação de articulação/parceria diretamente vinculada à meta e defina a evidência de formalização.`;
  return `A projeção ainda está ${unitText(ind,g)} abaixo da referência. Planeje uma ação diretamente vinculada à Etapa ${ind.goal_stage}, com responsável, data, quantidade prevista e evidência.`;
}
function planRoute(ind,m){const c=ind.code||'';if(/PVIDA|PTRAMPO/.test(c))return `equipe-tecnica?month=${m}`;if(/CFDH/.test(c))return `cfdh?month=${m}`;if(/OFICINAS|CURSO/.test(c))return `oficinas?month=${m}`;if(/EMPRESTIMOS/.test(c))return `controlador-acesso?month=${m}`;if(/PARCERIAS|REDE|ESCOLA/.test(c))return `dashboard?month=${m}`;return null}

async function profile(){if(me)return me;const c=client();if(!c)return null;const {data:{user}}=await c.auth.getUser();if(!user)return null;const q=await c.from('profiles').select('id,display_name,role,team,active').eq('id',user.id).maybeSingle();if(q.error)throw q.error;me=q.data||null;return me}
async function load(m){
  const c=client(),monthStart=monthDate(m),contractEnd=CONTRACT_END;
  const [catQ,schedQ,respQ,teamQ,actualQ,forecastQ]=await Promise.all([
    c.from('indicator_catalog').select('code,label,goal_stage,target,unit,target_mode,periodicity,active').eq('active',true).not('goal_stage','is',null).order('goal_stage').order('code'),
    c.from('goal_stage_schedule').select('*').eq('reference_month',monthStart).order('stage_code'),
    c.from('goal_indicator_responsibilities').select('*').eq('active',true),
    c.from('profiles').select('id,display_name,role,team,active').eq('active',true).order('display_name'),
    c.from('goal_indicator_actual_path').select('*').gte('event_date',CONTRACT_START).lt('event_date',contractEnd).order('event_date',{ascending:false}),
    c.from('goal_indicator_forecast').select('*').gte('forecast_date',CONTRACT_START).lt('forecast_date',contractEnd).order('forecast_date')
  ]);
  for(const q of [catQ,schedQ,respQ,teamQ,actualQ,forecastQ])if(q.error)throw q.error;
  return {catalog:catQ.data||[],schedule:schedQ.data||[],responsibilities:respQ.data||[],team:teamQ.data||[],actual:actualQ.data||[],forecast:forecastQ.data||[]};
}
function dataForIndicator(ind,m,data){const p=periodFor(ind,m);const actual=data.actual.filter(x=>x.indicator_code===ind.code&&x.event_date>=p.start&&x.event_date<p.end);const forecast=data.forecast.filter(x=>x.indicator_code===ind.code&&x.forecast_date>=p.start&&x.forecast_date<p.end);const a=actualValue(actual,ind),f=forecastValue(forecast,ind);return {period:p,actualRows:actual,forecastRows:forecast,actual:a,forecast:f,projected:a.value+f}}
function responsibilityRows(ind,data){return data.responsibilities.filter(x=>x.indicator_code===ind.code)}
function personMap(data){return new Map(data.team.map(x=>[x.id,x]))}
function matchesResponsible(ind,computed,data,filter){if(filter==='all')return true;const rr=responsibilityRows(ind,data);if(filter.startsWith('role:')){const role=filter.slice(5);return rr.some(x=>x.staff_role===role)||computed.actualRows.some(x=>x.responsible_role===role)||computed.forecastRows.some(x=>personMap(data).get(x.responsible_user_id)?.role===role)}if(filter.startsWith('user:')){const id=filter.slice(5);return computed.actualRows.some(x=>x.responsible_user_id===id)||computed.forecastRows.some(x=>x.responsible_user_id===id)}return true}
function scheduledIndicators(data){const stages=new Set(data.schedule.map(x=>x.stage_code));return data.catalog.filter(x=>stages.has(x.goal_stage))}
function scopeIndicators(data,m){let inds=scheduledIndicators(data);if(state.scope==='mine'&&me){inds=inds.filter(ind=>responsibilityRows(ind,data).some(r=>r.staff_role===String(me.role))||dataForIndicator(ind,m,data).actualRows.some(x=>x.responsible_user_id===me.id)||dataForIndicator(ind,m,data).forecastRows.some(x=>x.responsible_user_id===me.id))}return inds}
function responsibleOptions(data){const roles=[...new Set(data.responsibilities.map(x=>x.staff_role))].sort((a,b)=>(ROLE_LABELS[a]||a).localeCompare(ROLE_LABELS[b]||b,'pt-BR'));return `<option value="all">Todos os responsáveis</option><optgroup label="Por função">${roles.map(r=>`<option value="role:${esc(r)}" ${state.responsible===`role:${r}`?'selected':''}>${esc(ROLE_LABELS[r]||r)}</option>`).join('')}</optgroup><optgroup label="Por pessoa">${data.team.map(p=>`<option value="user:${p.id}" ${state.responsible===`user:${p.id}`?'selected':''}>${esc(p.display_name)} · ${esc(ROLE_LABELS[p.role]||p.role)}</option>`).join('')}</optgroup>`}
function pathRows(rows,type,data){const pm=personMap(data);if(!rows.length)return '<div class="gw-empty">Nenhuma contribuição registrada nesta camada.</div>';return `<div class="gw-path">${rows.slice(0,30).map(x=>{const p=x.responsible_name?{display_name:x.responsible_name,role:x.responsible_role}:pm.get(x.responsible_user_id);return `<div class="gw-path-row"><div><b>${esc(x.activity_title||x.title||SOURCE_LABELS[x.source_type]||x.source_type)}</b><small>${esc(type==='forecast'?(x.basis||'Planejamento vinculado'):(x.rationale||`Gerado automaticamente por ${SOURCE_LABELS[x.source_type]||x.source_type}`))}</small></div><div><b>${fmt(x.quantity)}</b><small>${esc(type==='forecast'?'previsto':'concretizado')}</small></div><div><b>${esc(p?.display_name||'Sistema / sem responsável nominal')}</b><small>${esc(p?ROLE_LABELS[p.role]||p.role:SOURCE_LABELS[x.source_type]||x.source_type)}</small></div></div>`}).join('')}</div>`}
function card(ind,m,data){const x=dataForIndicator(ind,m,data),status=statusFor(ind,x.actual.value,x.projected),target=ind.target==null?null:num(ind.target),gap=target==null?0:Math.max(0,target-x.projected),rr=responsibilityRows(ind,data),route=planRoute(ind,m);const show=state.tab==='forecast';const mainValue=show?x.projected:x.actual.value;const cls=status.kind==='risk'?'risk':status.kind==='over'?'over':status.kind==='success'?'success':'';const rlabels=[...new Set(rr.map(r=>ROLE_LABELS[r.staff_role]||r.staff_role))];return `<article class="gw-card ${cls}" data-gw-indicator="${esc(ind.code)}"><div class="gw-row"><div><h3>Meta ${esc(String(ind.goal_stage).split('.')[0])} · Etapa ${esc(ind.goal_stage)} — ${esc(ind.label)}</h3><div class="gw-meta"><span class="gw-pill">${esc(ind.code)}</span><span class="gw-pill">${esc(x.period.label)}</span><span class="gw-pill">${esc(ind.periodicity||'')}</span>${rlabels.slice(0,4).map(r=>`<span class="gw-pill">${esc(r)}</span>`).join('')}${rlabels.length>4?`<span class="gw-pill">+${rlabels.length-4}</span>`:''}</div></div><span class="gw-pill ${status.kind==='risk'?'warn':status.kind==='over'?'danger':status.kind==='success'?'ok':''}">${esc(status.label)}</span></div><div class="gw-values"><div class="gw-value"><small>Concretizado</small><b>${esc(unitText(ind,x.actual.value))}</b>${x.actual.aggregate?`<small>${fmt(x.actual.identified)} identificado + ${fmt(x.actual.aggregate)} agregado</small>`:''}</div><div class="gw-value"><small>Previsto ainda não executado</small><b>${esc(unitText(ind,x.forecast))}</b><small>${x.forecastRows.length} ação(ões)/registro(s) planejado(s)</small></div><div class="gw-value"><small>${show?'Projeção':'Meta / referência'}</small><b>${show?esc(unitText(ind,x.projected)):(target==null?'Acompanhar':esc(unitText(ind,target)))}</b><small>${target==null?'Sem mínimo numérico':`Referência: ${unitText(ind,target)}`}</small></div></div>${status.progress!=null?`<div class="gw-progress"><i style="width:${Math.max(0,Math.min(100,status.progress))}%"></i></div>`:''}${show?`<div class="gw-insight ${status.kind==='success'?'ok':''}"><b>Insight de planejamento:</b> ${esc(insight(ind,gap,x.projected,x.forecastRows))}</div>`:''}<div class="gw-formula"><b>Como este indicador é gerado:</b> ${esc(howGenerated(ind))}</div><div class="gw-actions"><button class="btn secondary" type="button" data-gw-path="${esc(ind.code)}">Ver caminho atividade → indicador</button>${show&&route&&status.kind==='risk'?`<button class="btn primary" type="button" data-gw-plan="${esc(route)}">Planejar ação</button>`:''}</div><div class="gw-details" data-gw-details="${esc(ind.code)}" hidden><div class="gw-section-title"><h3>Planejado que colabora</h3><span class="gw-coverage">previsão — não contabiliza como executado</span></div>${pathRows(x.forecastRows,'forecast',data)}<div class="gw-section-title" style="margin-top:12px"><h3>Concretizado que gerou o indicador</h3><span class="gw-coverage">eventos em tempo real</span></div>${pathRows(x.actualRows,'actual',data)}</div></article>`}
function renderHtml(m,data){let inds=scopeIndicators(data,m).map(ind=>({ind,x:dataForIndicator(ind,m,data)})).filter(({ind,x})=>matchesResponsible(ind,x,data,state.responsible));const targetRows=inds.filter(({ind})=>ind.target!=null&&ind.target_mode!=='tracking');const hit=targetRows.filter(({ind,x})=>{const st=statusFor(ind,x.actual.value,x.projected);return st.kind==='success'}).length;const risk=targetRows.filter(({ind,x})=>statusFor(ind,x.actual.value,x.projected).kind==='risk').length;const actualHit=targetRows.filter(({ind,x})=>ind.target_mode==='ceiling'?x.actual.value<=num(ind.target):x.actual.value>=num(ind.target)).length;const contractMonth=data.schedule[0]?.contract_month||null;return `<div class="gw" data-goals-workspace="1"><div class="gw-head"><div><h2>Metas e Etapas</h2><div class="gw-sub">Acompanhamento contratual por função, responsável e competência. O cronograma oficial define quais etapas aparecem no mês; planejamentos alimentam a projeção e somente execuções/evidências válidas alimentam o concretizado.</div></div><div class="gw-toolbar"><div class="gw-month"><button class="btn ghost" data-gw-prev type="button">‹</button><input type="month" data-gw-month value="${esc(m)}" min="2025-10" max="2027-03"><button class="btn ghost" data-gw-next type="button">›</button></div></div></div><div class="gw-notice"><b>${contractMonth?`M${contractMonth} · `:''}${esc(titleCase(monthLabel(m)))}</b> — competência carregada a partir do Cronograma de Metas e Etapas (Item 4). As metas com periodicidade ampliada usam a janela correspondente para calcular progresso.</div><div class="gw-tabs"><button class="gw-tab ${state.scope==='mine'?'active':''}" data-gw-scope="mine" type="button">Minhas metas · ${esc(ROLE_LABELS[me?.role]||me?.role||'função')}</button><button class="gw-tab ${state.scope==='month'?'active':''}" data-gw-scope="month" type="button">Metas do mês</button></div><div class="gw-toolbar"><div class="gw-tabs"><button class="gw-tab ${state.tab==='forecast'?'active':''}" data-gw-tab="forecast" type="button">Prevista · planejamento</button><button class="gw-tab ${state.tab==='actual'?'active':''}" data-gw-tab="actual" type="button">Concretizada · tempo real</button></div><label class="gw-filter">Responsável <select data-gw-responsible>${responsibleOptions(data)}</select></label></div><div class="gw-summary"><div class="gw-kpi"><small>Indicadores nesta visão</small><b>${inds.length}</b></div><div class="gw-kpi"><small>Metas numéricas</small><b>${targetRows.length}</b></div><div class="gw-kpi"><small>Projeção suficiente</small><b>${hit}</b></div><div class="gw-kpi"><small>Em risco no planejamento</small><b>${risk}</b></div><div class="gw-kpi"><small>Já concretizadas</small><b>${actualHit}</b></div></div><div class="gw-list">${inds.map(({ind})=>card(ind,m,data)).join('')||'<div class="gw-empty">Nenhuma meta prevista no cronograma para esta combinação de mês, função e responsável.</div>'}</div></div>`}
function updateMonth(m){const raw=location.hash.slice(1),[path,q='']=raw.split('?'),p=new URLSearchParams(q);p.set('month',m);location.hash=`#${path}?${p.toString()}`}
async function bind(root,m,data){root.querySelector('[data-gw-prev]')?.addEventListener('click',()=>updateMonth(shiftMonth(m,-1)));root.querySelector('[data-gw-next]')?.addEventListener('click',()=>updateMonth(shiftMonth(m,1)));root.querySelector('[data-gw-month]')?.addEventListener('change',e=>updateMonth(e.target.value));root.querySelectorAll('[data-gw-scope]').forEach(b=>b.addEventListener('click',()=>{state.scope=b.dataset.gwScope;render(true)}));root.querySelectorAll('[data-gw-tab]').forEach(b=>b.addEventListener('click',()=>{state.tab=b.dataset.gwTab;render(true)}));root.querySelector('[data-gw-responsible]')?.addEventListener('change',e=>{state.responsible=e.target.value;render(true)});root.querySelectorAll('[data-gw-path]').forEach(b=>b.addEventListener('click',()=>{const d=root.querySelector(`[data-gw-details="${CSS.escape(b.dataset.gwPath)}"]`);if(d){d.hidden=!d.hidden;b.textContent=d.hidden?'Ver caminho atividade → indicador':'Ocultar caminho'}}));root.querySelectorAll('[data-gw-plan]').forEach(b=>b.addEventListener('click',()=>{location.hash='#'+b.dataset.gwPlan}))}
async function render(force=false){if(!onRoute()||busy)return;const c=client();if(!c)return;const m=routeMonth(),key=`${m}:${state.scope}:${state.tab}:${state.responsible}`;const content=document.querySelector('.content');if(!content)return;if(!force&&content.querySelector('[data-goals-workspace]')&&lastKey===key)return;busy=true;try{style();await profile();const data=await load(m);if(!onRoute())return;content.innerHTML=renderHtml(m,data);lastKey=key;await bind(content,m,data)}catch(err){console.warn('Falha ao montar Metas e Etapas:',err);content.insertAdjacentHTML('afterbegin',`<div class="notice danger"><b>Não foi possível carregar o painel inteligente de metas.</b><br>${esc(err.message||err)}</div>`)}finally{busy=false}}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>render().catch(()=>{}),80)}
new MutationObserver(()=>{if(onRoute())schedule()}).observe(document.body,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>{lastKey='';schedule()});
schedule();
