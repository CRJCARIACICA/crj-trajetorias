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
  articulador: ['dashboard','jovens','jovem_core','editar_cadastro','forms_operacionais','articulacao','presencas','oficinas','lancamento_geral','agenda'],
  educador: [...ALL,'editar_cadastro','atendimentos','encaminhamentos','beneficios','lancamento_geral','relatorios','educador_area','workshop_education_docs','cfdh_shared'],
  assistente_social: [...ALL,'editar_cadastro','jovem_sensivel','atendimentos','acompanhamentos','pvida','ptrampo','encaminhamentos','beneficios','lancamento_geral','relatorios','technical_area','cfdh_shared'],
  psicologo: [...ALL,'editar_cadastro','jovem_sensivel','atendimentos','acompanhamentos','pvida','ptrampo','encaminhamentos','lancamento_geral','relatorios','technical_area','cfdh_shared'],
  terapeuta_ocupacional: [...ALL,'editar_cadastro','jovem_sensivel','atendimentos','acompanhamentos','pvida','ptrampo','encaminhamentos','beneficios','lancamento_geral','relatorios','technical_area','cfdh_shared'],
  controlador_acesso: ['dashboard','forms_operacionais','agenda','access_control'],
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
  'avaliacao-atividades': ['coordenacao_geral','educador','controlador_acesso'],
  'relatorio-mobilizacao': ['coordenacao_articulacao','articulador','controlador_acesso'],
  'emprestimo': ['coordenacao_geral','controlador_acesso'],
  'emprestimo-canhoto': [],
  'cfdh-planejamento': ['coordenacao_geral','educador','assistente_social','psicologo','terapeuta_ocupacional'],
  'cfdh-avaliacao-jovens': ['coordenacao_geral','educador','assistente_social','psicologo','terapeuta_ocupacional'],
  'cfdh-avaliacao-equipe': ['coordenacao_geral','educador'],
};

export const DEVELOPER_PREVIEW_KEY = 'crj_developer_preview';
export const DEVELOPER_PREVIEW_SCOPES = {
  geral: { label:'Visão geral', roles:['coordenacao_geral','coordenacao_articulacao','articulador','educador','assistente_social','psicologo','terapeuta_ocupacional','controlador_acesso','administrativo','oficineiro','monitoramento'] },
  coordenacao: { label:'Coordenação', roles:['coordenacao_geral'] },
  articulacao: { label:'Articulação', roles:['coordenacao_articulacao','articulador'] },
  educadores: { label:'Educadores', roles:['educador'] },
  equipe_tecnica: { label:'Equipe Técnica', roles:['assistente_social','psicologo','terapeuta_ocupacional'] },
  administrativo: { label:'Administrativo', roles:['administrativo'] },
  controlador_acesso: { label:'Controlador de Acessos', roles:['controlador_acesso'] },
  monitoramento: { label:'Monitoramento / Gestão OSC', roles:['monitoramento'] },
  oficineiros: { label:'Oficineiros', roles:['oficineiro'] },
};

function activeDeveloperScope(){
  try{
    const raw=sessionStorage.getItem(DEVELOPER_PREVIEW_KEY);
    if(!raw)return null;
    const parsed=JSON.parse(raw);
    if(!parsed?.enabled || !DEVELOPER_PREVIEW_SCOPES[parsed.scope])return null;
    return parsed.scope;
  }catch{return null;}
}
function previewPermissions(scope){
  const cfg=DEVELOPER_PREVIEW_SCOPES[scope];
  if(!cfg)return [];
  return [...new Set(cfg.roles.flatMap(role=>PERMISSIONS[role]||[]))];
}
export function developerPreviewScope(){return activeDeveloperScope();}
export function developerPreviewLabel(){const scope=activeDeveloperScope();return scope?DEVELOPER_PREVIEW_SCOPES[scope]?.label||scope:null;}

export function can(role, permission){
  const scope=activeDeveloperScope();
  if(scope)return previewPermissions(scope).includes(permission);
  return (PERMISSIONS[role] || []).includes(permission);
}
// O modo desenvolvedor é deliberadamente somente leitura: não amplia preenchimento de formulários.
export function canFillForm(role, formSlug){ return (FORM_FILL_ROLES[formSlug] || []).includes(role); }
export function roleLabel(role){ return ROLES[role] || role || 'Sem perfil'; }

// Ajuste visual/operacional da área do Controlador: o registro assistido usa o mesmo
// fluxo público da lista diária para não existir um caminho paralelo sem assinatura.
if(typeof document!=='undefined'){
  const accessOnRoute=()=>location.hash.split('?')[0]==='#controlador-acesso';
  const accessShiftLabel=()=>{const h=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',hour:'2-digit',hour12:false}).format(new Date()));return h>=10&&h<14?'10h–14h':h>=14&&h<18?'14h–18h':h>=18&&h<21?'18h–21h':'Fora do horário de registro'};
  let accessTimer=null,accessRefreshBusy=false;
  const decorateAccess=()=>{
    if(!accessOnRoute())return;
    const root=document.querySelector('[data-access-controller-page]');if(!root)return;
    const tab=root.querySelector('[data-ac-view="recepcao"]');if(tab)tab.textContent='Lista diária';
    const manual=root.querySelector('[data-ac-manual-presence]');if(manual){manual.textContent='+ Registrar no fluxo diário';manual.title='Usa o mesmo fluxo do dispositivo da recepção';}
    root.querySelectorAll('h3').forEach(h=>{if(h.textContent.includes('Lista de Presença e Contato · Uso Livre'))h.textContent='Lista de Presença e Contato diária';if(h.textContent.includes('Prioridade das salas neste turno'))h.textContent='Ocupação dos espaços agora'});
    root.querySelectorAll('.ac-kpi span,.ac-card .pill').forEach(el=>{if(/07h.?12h|12h.?18h|Fora dos turnos de registro/.test(el.textContent||''))el.textContent=accessShiftLabel()});
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
      if(kpis?.[1]){const labels=kpis[1].querySelectorAll('span');const value=kpis[1].querySelector('b');if(labels[0])labels[0].textContent='Presentes agora';if(labels[1])labels[1].textContent=accessShiftLabel();if(value)value.textContent=String(active.length)}
    }catch(err){console.warn('Não foi possível atualizar os presentes agora:',err)}finally{accessRefreshBusy=false}
  };
  const scheduleAccess=()=>{clearTimeout(accessTimer);accessTimer=setTimeout(()=>{decorateAccess();refreshAccessNow()},120)};
  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-ac-manual-presence]');if(!button||!accessOnRoute())return;
    event.preventDefault();event.stopImmediatePropagation();const link=document.querySelector('[data-ac-public-link]')?.value;
    if(!link){alert('Abra a lista diária antes de iniciar um registro.');return}window.open(link,'_blank','noopener');
  },true);
  new MutationObserver(scheduleAccess).observe(document.body,{childList:true,subtree:true});
  window.addEventListener('hashchange',scheduleAccess);window.addEventListener('focus',scheduleAccess);scheduleAccess();
}
