// Contrato comum entre o roteador principal e as áreas carregadas sob demanda.
export const MODULE_ROUTES=Object.freeze({
  articulacao:{label:'Área da Articulação',module:'articulation_workspace'},
  'planos-mobilizacao':{label:'Planos de Mobilização',module:'articulation_workspace'},
  'caixa-equipes':{label:'Caixa das Equipes',module:'team_comms'},
  'documentos-evidencias':{label:'Documentos e Evidências',module:'document_drafts'},
  'controlador-acesso':{label:'Controlador de Acessos',module:'access_controller'},
  'calendario-geral':{label:'Calendário Geral',module:'general_calendar'},
  'mostra-profissoes':{label:'Mostra Semestral',module:'meta4_3_ui'},
  oficineiro:{label:'Área do Oficineiro',module:'instructor_portal'},
  administrativo:{label:'Área Administrativa',module:'management_workspace'},
  'coordenacao-geral':{label:'Coordenação Geral',module:'management_workspace'},
  'coordenacao-articulacao':{label:'Coordenação de Articulação',module:'management_workspace'}
});

export function routeName(hash=location.hash){
  return String(hash||'#dashboard').split('?')[0].replace(/^#/,'').split('/').filter(Boolean)[0]||'dashboard';
}

export function routePlaceholder(name){
  const config=MODULE_ROUTES[name];
  if(!config)return null;
  return `<div class="card" data-crj-route-pending="${name}" role="status" aria-live="polite" aria-busy="true"><div class="empty">Carregando ${config.label}…</div></div>`;
}

let navigationSequence=0;
export function beginNavigation(){
  const seq=++navigationSequence,hash=location.hash;
  window.__CRJ_ROUTE_READY__=null;
  return ()=>seq===navigationSequence&&location.hash===hash;
}

export function captureRoute(host=document.querySelector('.content')){
  const hash=location.hash;
  return ()=>location.hash===hash&&!!host?.isConnected&&document.querySelector('.content')===host;
}

export function announceRouteReady(){
  const host=document.querySelector('.content');
  if(!host)return;
  const hash=location.hash;
  window.__CRJ_ROUTE_READY__={hash,host};
  window.dispatchEvent(new CustomEvent('crj:route-rendered',{detail:{hash}}));
}

export function routeShellReady(){
  const ready=window.__CRJ_ROUTE_READY__;
  return !!ready&&ready.hash===location.hash&&ready.host?.isConnected&&ready.host===document.querySelector('.content');
}
