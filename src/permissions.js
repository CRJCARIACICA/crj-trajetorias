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
  coordenacao_geral: [...ALL,'editar_cadastro','jovem_sensivel','atendimentos','acompanhamentos','pvida','ptrampo','encaminhamentos','beneficios','articulacao','equipe','validar','lancamento_geral','relatorios','educador_area','technical_area','document_settings','workshop_education_docs','cfdh_shared'],
  coordenacao_articulacao: [...ALL,'editar_cadastro','atendimentos','articulacao','encaminhamentos','beneficios','lancamento_geral','relatorios'],
  articulador: ['dashboard','jovens','jovem_core','editar_cadastro','forms_operacionais','articulacao','presencas','oficinas','lancamento_geral','agenda'],
  educador: [...ALL,'editar_cadastro','atendimentos','encaminhamentos','beneficios','lancamento_geral','relatorios','educador_area','workshop_education_docs','cfdh_shared'],
  assistente_social: [...ALL,'editar_cadastro','jovem_sensivel','atendimentos','acompanhamentos','pvida','ptrampo','encaminhamentos','beneficios','lancamento_geral','relatorios','technical_area','cfdh_shared'],
  psicologo: [...ALL,'editar_cadastro','jovem_sensivel','atendimentos','acompanhamentos','pvida','ptrampo','encaminhamentos','lancamento_geral','relatorios','technical_area','cfdh_shared'],
  terapeuta_ocupacional: [...ALL,'editar_cadastro','jovem_sensivel','atendimentos','acompanhamentos','pvida','ptrampo','encaminhamentos','beneficios','lancamento_geral','relatorios','technical_area','cfdh_shared'],
  controlador_acesso: ['dashboard','forms_operacionais','agenda'],
  administrativo: ['dashboard','jovens','jovem_core','forms_operacionais','oficinas','presencas','beneficios','metas','equipe','lancamento_geral','relatorios','agenda'],
  oficineiro: ['dashboard','oficinas','presencas','forms_operacionais','agenda'],
  monitoramento: [...ALL,'jovem_sensivel','atendimentos','acompanhamentos','pvida','ptrampo','encaminhamentos','beneficios','articulacao','equipe','validar','lancamento_geral','relatorios','educador_area','technical_area','document_settings'],
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
  'relatorio-mobilizacao': ['coordenacao_articulacao','articulador'],
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
