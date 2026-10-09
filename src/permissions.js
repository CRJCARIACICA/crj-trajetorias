export const ROLES = {
  coordenacao_geral: 'Coordenação Geral',
  coordenacao_articulacao: 'Coordenação de Articulação',
  articulador: 'Articulador(a) Local',
  educador: 'Educador(a) Social',
  assistente_social: 'Assistente Social',
  psicologo: 'Psicólogo(a)',
  terapeuta_ocupacional: 'Terapeuta Ocupacional',
  controlador_acesso: 'Controlador(a) de Acessos',
  administrativo: 'Administrativo',
  oficineiro: 'Oficineiro(a)',
  monitoramento: 'Monitoramento / Gestão OSC',
  pendente: 'Acesso pendente',
};

const ALL = ['dashboard','jovens','jovem_core','forms_operacionais','oficinas','presencas','metas','agenda'];
export const PERMISSIONS = {
  coordenacao_geral: [...ALL,'editar_cadastro','jovem_sensivel','atendimentos','acompanhamentos','pvida','ptrampo','encaminhamentos','beneficios','articulacao','equipe','validar','lancamento_geral','relatorios','educador_area','technical_area','document_settings','workshop_education_docs','cfdh_shared','access_control'],
  coordenacao_articulacao: [...ALL,'editar_cadastro','atendimentos','articulacao','encaminhamentos','beneficios','lancamento_geral','relatorios'],
  articulador: ['dashboard','jovens','jovem_core','editar_cadastro','forms_operacionais','articulacao','presencas','oficinas','metas','lancamento_geral','agenda'],
  educador: [...ALL,'editar_cadastro','atendimentos','encaminhamentos','beneficios','lancamento_geral','relatorios','educador_area','workshop_education_docs','cfdh_shared'],
  assistente_social: [...ALL,'editar_cadastro','jovem_sensivel','atendimentos','acompanhamentos','pvida','ptrampo','encaminhamentos','beneficios','lancamento_geral','relatorios','technical_area','cfdh_shared'],
  psicologo: [...ALL,'editar_cadastro','jovem_sensivel','atendimentos','acompanhamentos','pvida','ptrampo','encaminhamentos','lancamento_geral','relatorios','technical_area','cfdh_shared'],
  terapeuta_ocupacional: [...ALL,'editar_cadastro','jovem_sensivel','atendimentos','acompanhamentos','pvida','ptrampo','encaminhamentos','beneficios','lancamento_geral','relatorios','technical_area','cfdh_shared'],
  controlador_acesso: ['dashboard','forms_operacionais','metas','agenda','access_control'],
  administrativo: ['dashboard','jovens','jovem_core','forms_operacionais','oficinas','presencas','beneficios','metas','equipe','lancamento_geral','relatorios','agenda'],
  oficineiro: [],
  monitoramento: [...ALL,'jovem_sensivel','atendimentos','acompanhamentos','pvida','ptrampo','encaminhamentos','beneficios','articulacao','equipe','validar','lancamento_geral','relatorios','educador_area','technical_area','document_settings','access_control'],
  pendente: [],
};

export const FORM_FILL_ROLES = {
  'formulario-inicial': ['coordenacao_geral','coordenacao_articulacao','articulador','educador','assistente_social','psicologo','terapeuta_ocupacional'],
  'lista-presenca-contato': ['coordenacao_geral','controlador_acesso'],
  'acompanhamento': ['assistente_social','psicologo','terapeuta_ocupacional'],
  'pvida': ['assistente_social','psicologo','terapeuta_ocupacional'],
  'outras-demandas': ['assistente_social','psicologo','terapeuta_ocupacional'],
  'ptrampo': ['assistente_social','psicologo','terapeuta_ocupacional'],
  'avaliacao-atividades': ['coordenacao_geral','educador'],
  'relatorio-mobilizacao': ['coordenacao_articulacao','articulador','controlador_acesso'],
  'emprestimo': ['coordenacao_geral','controlador_acesso'],
  'emprestimo-canhoto': [],
  'cfdh-planejamento': ['coordenacao_geral','educador','assistente_social','psicologo','terapeuta_ocupacional'],
  'cfdh-avaliacao-jovens': ['coordenacao_geral','educador','assistente_social','psicologo','terapeuta_ocupacional'],
  'cfdh-avaliacao-equipe': ['coordenacao_geral','educador'],
};

export const DEVELOPER_PREVIEW_KEY = 'crj_developer_preview';
export const DEVELOPER_PREVIEW_SCOPES = {
  geral: { label:'Acesso total', roles:['coordenacao_geral','coordenacao_articulacao','articulador','educador','assistente_social','psicologo','terapeuta_ocupacional','controlador_acesso','administrativo','oficineiro','monitoramento'] },
  coordenacao: { label:'Coordenação', roles:['coordenacao_geral'] },
  articulacao: { label:'Articulação', roles:['coordenacao_articulacao','articulador'] },
  educadores: { label:'Educadores', roles:['educador'] },
  equipe_tecnica: { label:'Equipe Técnica', roles:['assistente_social','psicologo','terapeuta_ocupacional'] },
  administrativo: { label:'Administrativo', roles:['administrativo'] },
  controlador_acesso: { label:'Controlador de Acessos', roles:['controlador_acesso'] },
  monitoramento: { label:'Monitoramento / Gestão OSC', roles:['monitoramento'] },
  oficineiros: { label:'Oficineiros', roles:['oficineiro'] },
};

function activeDeveloperPreview(){
  try{
    const raw=sessionStorage.getItem(DEVELOPER_PREVIEW_KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    if(!parsed?.enabled || !DEVELOPER_PREVIEW_SCOPES[parsed.scope])return null;
    return parsed;
  }catch{return null;}
}
function activeDeveloperScope(){return activeDeveloperPreview()?.scope||null;}
function activeDeveloperRole(){
  const preview=activeDeveloperPreview();
  if(!preview?.role)return null;
  const cfg=DEVELOPER_PREVIEW_SCOPES[preview.scope];
  return cfg?.roles?.includes(preview.role)?preview.role:null;
}
function previewRoles(scope){
  const cfg=DEVELOPER_PREVIEW_SCOPES[scope];
  if(!cfg)return [];
  if(scope==='geral')return cfg.roles;
  const role=activeDeveloperRole();
  return role?[role]:cfg.roles;
}
function previewPermissions(scope){return [...new Set(previewRoles(scope).flatMap(role=>PERMISSIONS[role]||[]))];}
export function developerPreviewScope(){return activeDeveloperScope();}
export function developerPreviewRole(){return activeDeveloperRole();}
export function developerPreviewLabel(){
  const scope=activeDeveloperScope(),role=activeDeveloperRole();
  if(!scope)return null;
  if(scope!=='geral'&&role)return ROLES[role]||role;
  return DEVELOPER_PREVIEW_SCOPES[scope]?.label||scope;
}

export function can(role, permission){
  const scope=activeDeveloperScope();
  if(scope)return previewPermissions(scope).includes(permission);
  return (PERMISSIONS[role] || []).includes(permission);
}
export function canFillForm(role, formSlug){
  const allowed=FORM_FILL_ROLES[formSlug]||[];
  const scope=activeDeveloperScope();
  if(scope)return previewRoles(scope).some(r=>allowed.includes(r));
  return allowed.includes(role);
}
export function roleLabel(role){ return ROLES[role] || role || 'Sem perfil'; }

// Ajuste visual/operacional da área do Controlador. A versão anterior observava qualquer
// mutação do DOM e, ao atualizar o próprio KPI, disparava novas consultas em cascata.
// Agora a decoração é local e a leitura de "presentes agora" usa intervalo controlado.
if(typeof document!=='undefined'){
  const accessOnRoute=()=>location.hash.split('?')[0]==='#controlador-acesso';
  const accessShiftLabel=()=>{const h=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',hour:'2-digit',hour12:false}).format(new Date()));return h>=10&&h<14?'10h–14h':h>=14&&h<18?'14h–18h':h>=18&&h<21?'18h–21h':'Fora do horário de registro'};
  let accessRefreshBusy=false,accessRefreshInterval=null,accessRetryTimers=[];
  const setText=(node,value)=>{if(node&&node.textContent!==String(value))node.textContent=String(value)};
  const decorateAccess=()=>{
    if(!accessOnRoute())return false;
    const root=document.querySelector('[data-access-controller-page]');if(!root)return false;
    const tab=root.querySelector('[data-ac-view="recepcao"]');setText(tab,'Lista diária');
    const manual=root.querySelector('[data-ac-manual-presence]');if(manual){setText(manual,'+ Registrar no fluxo diário');manual.title='Usa o mesmo fluxo do dispositivo da recepção';}
    root.querySelectorAll('h3').forEach(h=>{if(h.textContent.includes('Lista de Presença e Contato · Uso Livre'))setText(h,'Lista de Presença e Contato diária');if(h.textContent.includes('Prioridade das salas neste turno'))setText(h,'Ocupação dos espaços agora')});
    root.querySelectorAll('.ac-kpi span,.ac-card .pill').forEach(el=>{if(/07h.?12h|12h.?18h|Fora dos turnos de registro/.test(el.textContent||''))setText(el,accessShiftLabel())});
    return true;
  };
  const refreshAccessNow=async()=>{
    if(accessRefreshBusy||!accessOnRoute()||!document.querySelector('[data-access-controller-page]'))return;
    accessRefreshBusy=true;
    try{
      const {apiMode,supabaseClient}=await import('./api.js?v=20261004-2');if(apiMode()!=='live')return;
      const c=supabaseClient(),date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      const {data:list}=await c.from('access_daily_lists').select('id').eq('list_date',date).maybeSingle();if(!list)return;
      const {data:presence}=await c.from('access_presence_records').select('id,exit_at,expected_exit_at').eq('list_id',list.id);
      const now=Date.now(),active=(presence||[]).filter(p=>!p.exit_at&&(!p.expected_exit_at||new Date(p.expected_exit_at).getTime()>now));
      const root=document.querySelector('[data-access-controller-page]'),kpis=root?.querySelectorAll('.ac-kpis .ac-kpi');
      if(kpis?.[1]){const labels=kpis[1].querySelectorAll('span'),value=kpis[1].querySelector('b');setText(labels[0],'Presentes agora');setText(labels[1],accessShiftLabel());setText(value,String(active.length))}
    }catch(err){console.warn('Não foi possível atualizar os presentes agora:',err)}finally{accessRefreshBusy=false}
  };
  const clearAccessTimers=()=>{accessRetryTimers.forEach(clearTimeout);accessRetryTimers=[];if(accessRefreshInterval){clearInterval(accessRefreshInterval);accessRefreshInterval=null}};
  const startAccessLifecycle=()=>{
    clearAccessTimers();
    if(!accessOnRoute())return;
    [120,350,900,1800].forEach(delay=>accessRetryTimers.push(setTimeout(()=>decorateAccess(),delay)));
    accessRetryTimers.push(setTimeout(()=>{decorateAccess();refreshAccessNow()},2200));
    accessRefreshInterval=setInterval(()=>{if(!accessOnRoute()){clearAccessTimers();return}decorateAccess();refreshAccessNow()},30000);
  };
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-ac-manual-presence]');if(!button||!accessOnRoute())return;
    event.preventDefault();event.stopImmediatePropagation();const link=document.querySelector('[data-ac-public-link]')?.value;
    if(!link){alert('Abra a lista diária antes de iniciar um registro.');return}window.open(link,'_blank','noopener');
  },true);
  window.addEventListener('hashchange',startAccessLifecycle);
  window.addEventListener('focus',()=>{if(accessOnRoute()){decorateAccess();refreshAccessNow()}});
  startAccessLifecycle();
}
