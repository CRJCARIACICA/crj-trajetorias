export const ROLES = {
  coordenacao_geral: 'Coordenação Geral',
  coordenacao_articulacao: 'Coordenação de Articulação',
  articulador: 'Articulador(a) Local',
  educador: 'Educador(a) Social',
  assistente_social: 'Assistente Social',
  psicologo: 'Psicólogo(a)',
  terapeuta_ocupacional: 'Terapeuta Ocupacional',
  administrativo: 'Administrativo',
  oficineiro: 'Oficineiro(a)',
  monitoramento: 'Monitoramento / Gestão OSC',
  pendente: 'Acesso pendente',
};

const ALL = ['dashboard','jovens','jovem_core','forms_operacionais','oficinas','presencas','metas','agenda'];
export const PERMISSIONS = {
  coordenacao_geral: [...ALL,'editar_cadastro','jovem_sensivel','atendimentos','acompanhamentos','pvida','ptrampo','encaminhamentos','beneficios','articulacao','equipe','validar','lancamento_geral','relatorios','educador_area','technical_area','document_settings'],
  coordenacao_articulacao: [...ALL,'editar_cadastro','atendimentos','articulacao','encaminhamentos','beneficios','lancamento_geral','relatorios'],
  articulador: ['dashboard','jovens','jovem_core','forms_operacionais','articulacao','presencas','oficinas','lancamento_geral','agenda'],
  educador: [...ALL,'editar_cadastro','atendimentos','encaminhamentos','beneficios','lancamento_geral','relatorios','educador_area','document_settings'],
  assistente_social: [...ALL,'editar_cadastro','jovem_sensivel','atendimentos','acompanhamentos','pvida','ptrampo','encaminhamentos','beneficios','lancamento_geral','relatorios','technical_area'],
  psicologo: [...ALL,'editar_cadastro','jovem_sensivel','atendimentos','acompanhamentos','pvida','ptrampo','encaminhamentos','lancamento_geral','relatorios','technical_area'],
  terapeuta_ocupacional: [...ALL,'editar_cadastro','jovem_sensivel','atendimentos','acompanhamentos','pvida','ptrampo','encaminhamentos','beneficios','lancamento_geral','relatorios','technical_area'],
  administrativo: ['dashboard','jovens','jovem_core','editar_cadastro','forms_operacionais','oficinas','presencas','beneficios','metas','equipe','lancamento_geral','relatorios','agenda'],
  oficineiro: ['dashboard','oficinas','presencas','forms_operacionais','agenda'],
  monitoramento: [...ALL,'jovem_sensivel','atendimentos','acompanhamentos','pvida','ptrampo','encaminhamentos','beneficios','articulacao','equipe','validar','lancamento_geral','relatorios','educador_area','technical_area','document_settings'],
  pendente: [],
};

export function can(role, permission){ return (PERMISSIONS[role] || []).includes(permission); }
export function roleLabel(role){ return ROLES[role] || role || 'Sem perfil'; }
