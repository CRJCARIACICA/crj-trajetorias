import { getSession } from './api.js?v=20261004-2';
import { MODULE_ROUTES, routeName, routeShellReady, captureRoute } from './route_lifecycle.js?v=20261020-navigation1';

// Carregador incremental do CRJ Trajetórias.
// O núcleo (app.js) renderiza a rota; complementos pesados só são importados
// quando a área correspondente é realmente aberta. Isso evita dezenas de
// MutationObservers e consultas Supabase fora do menu em uso.

const VERSION='20261023-checkin1';
const MODULE_VERSIONS={meta4_3_ui:'20261024-showcase1',technical_service_flow:'20261026-technical-service1',youth_profile_enhancements:'20261026-technical-service1',articulation_workspace:'20261028-monitor1',articulation_evidence:'20261028-monitor1',management_workspace:'20261028-monitor1'};
const modulePreloads=new Set();
const moduleAttempts=new Map();
const moduleCache=new Map();
let routeSeq=0;
let routeTimer=null;
let sessionPromise=null;
let profileCache=null;
let utilityNavTimer=null;

const ACCESS_ROLES=new Set(['coordenacao_geral','controlador_acesso','monitoramento']);
const MANAGEMENT_ROUTES={
  administrativo:{route:'administrativo',label:'Área Administrativa',icon:'▤'},
  coordenacao_geral:{route:'coordenacao-geral',label:'Coordenação Geral',icon:'◆'},
  coordenacao_articulacao:{route:'coordenacao-articulacao',label:'Coordenação de Articulação',icon:'◇'}
};

const ROUTE_FEATURES={
  jovens:{critical:['youth_list_fields'],deferred:[]},
  jovem:{
    critical:['youth_profile_enhancements','youth_trajectory_evidence','youth_trajectory_exports','technical_service_flow'],
    deferred:['document_header_standard','evidence_exports']
  },
  formulario:{
    critical:['form_access','universal_drafts','youth_profile_enhancements'],
    deferred:['document_header_standard','evidence_exports','articulation_workspace','articulation_request_context']
  },
  formularios:{critical:['form_access'],deferred:[]},
  oficinas:{
    critical:['workshop_devices','instructor_management','workshop_collaboration','workshop_live_sync','educator_instructor_plan_sync','workshop_plan_delete','workshop_plan_exports','cfdh_transversal_integration'],
    deferred:['articulation_workspace','articulation_request_context','joint_actions','document_header_standard','evidence_exports','attendance_export_fix']
  },
  oficina:{
    critical:['workshop_devices','instructor_management','workshop_collaboration','workshop_live_sync','educator_instructor_plan_sync','workshop_plan_delete','workshop_plan_exports','cfdh_transversal_integration'],
    deferred:['articulation_workspace','articulation_request_context','joint_actions','document_header_standard','evidence_exports','attendance_export_fix']
  },
  workshops:{
    critical:['workshop_devices','instructor_management','workshop_collaboration','workshop_live_sync','educator_instructor_plan_sync','workshop_plan_delete','workshop_plan_exports','cfdh_transversal_integration'],
    deferred:['articulation_workspace','articulation_request_context','joint_actions','document_header_standard','evidence_exports','attendance_export_fix']
  },
  educador:{
    critical:['educator_complementary','workshop_collaboration','workshop_live_sync','educator_instructor_plan_sync','workshop_plan_delete','workshop_plan_exports','cfdh_transversal_integration'],
    deferred:['articulation_workspace','articulation_request_context','joint_actions','document_header_standard','evidence_exports']
  },
  'planejamento-educador':{
    critical:['educator_complementary','workshop_collaboration','workshop_live_sync','educator_instructor_plan_sync','workshop_plan_delete','workshop_plan_exports','cfdh_transversal_integration'],
    deferred:['articulation_workspace','articulation_request_context','joint_actions','document_header_standard','evidence_exports']
  },
  cfdh:{
    critical:['cfdh_program_metrics','cfdh_transversal_integration'],
    deferred:['articulation_workspace','articulation_request_context','joint_actions','document_header_standard','evidence_exports']
  },
  'equipe-tecnica':{
    critical:['technical_service_flow','technical_team_enhancements','technical_program_actions','technical_workspace','technical_planning_governance'],
    deferred:['articulation_workspace','articulation_request_context','joint_actions','document_header_standard','evidence_exports']
  },
  'controlador-acesso':{
    critical:['access_controller'],
    deferred:['document_header_standard','evidence_exports']
  },
  articulacao:{
    critical:['articulation_workspace','articulation_evidence','articulation_request_context'],
    deferred:['articulation_demand_identity','joint_actions','document_header_standard','evidence_exports']
  },
  'planos-mobilizacao':{
    critical:['articulation_workspace','articulation_request_context'],
    deferred:['joint_actions','document_header_standard','evidence_exports']
  },
  'documentos-evidencias':{
    critical:['document_drafts','evidence_exports'],
    deferred:['document_header_standard']
  },
  'caixa-equipes':{
    critical:['team_comms'],
    deferred:['instructor_portal']
  },
  oficineiro:{
    critical:['instructor_portal','workshop_collaboration'],
    deferred:['joint_actions','document_header_standard']
  },
  administrativo:{critical:['management_workspace'],deferred:['document_header_standard','evidence_exports']},
  'coordenacao-geral':{critical:['management_workspace'],deferred:['document_header_standard','evidence_exports']},
  'coordenacao-articulacao':{critical:['management_workspace'],deferred:['document_header_standard','evidence_exports']},
  metas:{critical:['goals_workspace','meta1_point_completion'],deferred:[]},
  equipe:{critical:['instructor_management'],deferred:[]},
  'equipe-permissoes':{critical:['instructor_management'],deferred:[]},
  jhonatao:{critical:['jhonatao_multimodal','jhonatao_live'],deferred:[]},
  'calendario-geral':{critical:['general_calendar'],deferred:[]},
  'mostra-profissoes':{critical:['meta4_3_ui'],deferred:[]}
};

function featureSet(route){
  return ROUTE_FEATURES[route]||{critical:[],deferred:[]};
}

function moduleUrl(name){
  const retry=moduleAttempts.get(name)||0;
  return `./${name}.js?v=${MODULE_VERSIONS[name]||VERSION}${retry?'&retry='+retry:''}`;
}

function loadModule(name){
  if(moduleCache.has(name))return moduleCache.get(name);
  const promise=import(moduleUrl(name)).catch(error=>{
    moduleCache.delete(name);
    moduleAttempts.set(name,(moduleAttempts.get(name)||0)+1);
    console.warn(`CRJ lazy-load: falha ao carregar ${name}`,error);
    throw error;
  });
  moduleCache.set(name,promise);
  return promise;
}

function pulseContent(){
  const content=document.querySelector('.content');
  if(!content)return;
  const marker=document.createComment('crj-features-ready');
  content.appendChild(marker);
  queueMicrotask(()=>{try{marker.remove()}catch{}});
}

function idle(callback,timeout=900){
  if('requestIdleCallback' in window){
    window.requestIdleCallback(callback,{timeout});
    return;
  }
  setTimeout(callback,Math.min(timeout,300));
}

function prefetchModule(name){
  if(modulePreloads.has(name)||moduleCache.has(name))return;
  modulePreloads.add(name);
  const link=document.createElement('link');
  link.rel='modulepreload';
  link.href=new URL(moduleUrl(name),import.meta.url).href;
  link.addEventListener('error',()=>{modulePreloads.delete(name);link.remove()},{once:true});
  document.head.appendChild(link);
}

function showModuleFailure(route,isCurrent){
  if(!isCurrent())return;
  const content=document.querySelector('.content');
  if(!content)return;
  content.innerHTML='<div class="notice danger" role="alert"><strong>Não foi possível abrir esta página.</strong><p>Verifique sua conexão e tente novamente.</p><button class="btn primary" type="button" data-crj-route-retry>Tentar novamente</button></div>';
  content.querySelector('[data-crj-route-retry]')?.addEventListener('click',()=>{
    content.innerHTML='<div class="card" role="status"><div class="empty">Carregando…</div></div>';
    loadForRoute(route).catch(err=>console.warn('CRJ lazy-load:',err));
  },{once:true});
}

async function loadForRoute(route,{prefetch=false}={}){
  const group=featureSet(route);
  const critical=[...new Set(group.critical||[])];
  if(prefetch){
    critical.forEach(prefetchModule);
    return;
  }
  if(!routeShellReady()||routeName()!==route)return;
  const seq=++routeSeq,isCurrent=captureRoute();
  const currentHash=location.hash;
  const results=await Promise.allSettled(critical.map(loadModule));
  if(seq!==routeSeq||!isCurrent())return;
  const owner=MODULE_ROUTES[route]?.module;
  const ownerIndex=critical.indexOf(owner);
  if(ownerIndex>=0&&results[ownerIndex].status==='rejected'){
    showModuleFailure(route,isCurrent);
    return;
  }
  pulseContent();
  window.dispatchEvent(new CustomEvent('crj:features-ready',{detail:{route,hash:currentHash}}));

  const deferred=[...new Set(group.deferred||[])].filter(x=>!critical.includes(x));
  if(deferred.length){
    idle(async()=>{
      if(seq!==routeSeq||!isCurrent())return;
      await Promise.allSettled(deferred.map(loadModule));
      if(seq===routeSeq&&isCurrent())pulseContent();
    },700);
  }
}

function scheduleRouteLoad(){
  clearTimeout(routeTimer);
  routeTimer=setTimeout(()=>loadForRoute(routeName()).catch(err=>console.warn('CRJ lazy-load:',err)),0);
}

async function currentProfile(){
  if(profileCache)return profileCache;
  if(!sessionPromise)sessionPromise=getSession().catch(()=>null);
  const session=await sessionPromise;
  if(session?.user){profileCache=session.user;return profileCache}
  sessionPromise=null;
  return null;
}

function insertCalendarNav(nav,profile){
  const existing=nav.querySelector('[data-general-calendar-link]');
  const allowed=profile?.active!==false&&profile?.role&&profile.role!=='pendente';
  if(!allowed){existing?.remove();return}
  if(existing){existing.classList.toggle('active',routeName()==='calendario-geral');return}
  const link=document.createElement('a');
  link.dataset.generalCalendarLink='1';
  link.href='#calendario-geral';
  link.className=routeName()==='calendario-geral'?'active':'';
  link.innerHTML='<span>▦</span><span>Calendário Geral</span>';
  const agenda=[...nav.querySelectorAll('a')].find(x=>String(x.textContent||'').trim().toLowerCase().startsWith('agenda'));
  if(agenda)agenda.insertAdjacentElement('beforebegin',link);else nav.appendChild(link);
}

function insertAccessNav(nav,profile){
  const existing=nav.querySelector('#access-controller-nav,[data-lazy-access-nav]');
  const allowed=profile?.active!==false&&ACCESS_ROLES.has(String(profile?.role||''));
  if(!allowed){existing?.remove();return}
  if(existing){existing.classList.toggle('active',routeName()==='controlador-acesso');return}
  const link=document.createElement('a');
  link.id='access-controller-nav';
  link.dataset.lazyAccessNav='1';
  link.href='#controlador-acesso';
  link.className=routeName()==='controlador-acesso'?'active':'';
  link.innerHTML='<span>▣</span><span>Controlador de Acessos</span>';
  const sep=nav.querySelector('.sep');
  nav.insertBefore(link,sep||null);
}

function insertManagementNav(nav,profile){
  const existing=nav.querySelector('[data-management-area-link]');
  const config=profile?.active!==false?MANAGEMENT_ROUTES[String(profile?.role||'')]:null;
  if(!config){existing?.remove();return}
  if(existing){
    existing.href=`#${config.route}`;
    existing.innerHTML=`<span>${config.icon}</span><span>${config.label}</span>`;
    existing.classList.toggle('active',routeName()===config.route);
    return;
  }
  const link=document.createElement('a');
  link.dataset.managementAreaLink='1';
  link.href=`#${config.route}`;
  link.className=routeName()===config.route?'active':'';
  link.innerHTML=`<span>${config.icon}</span><span>${config.label}</span>`;
  const sep=nav.querySelector('.sep');
  nav.insertBefore(link,sep||null);
}

async function ensureUtilityNav(){
  const nav=document.querySelector('.sidebar .nav');
  if(!nav)return;
  const profile=await currentProfile();
  if(!profile)return;
  insertCalendarNav(nav,profile);
  if(profile.active!==false&&profile.role&&profile.role!=='pendente'&&!nav.querySelector('a[href="#planos-mobilizacao"]')){const link=document.createElement('a');link.href='#planos-mobilizacao';link.innerHTML='<span>◫</span><span>Planos de Mobilização</span>';nav.insertBefore(link,nav.querySelector('.sep')||null);}
  insertAccessNav(nav,profile);
  insertManagementNav(nav,profile);
}

function scheduleUtilityNav(){
  clearTimeout(utilityNavTimer);
  utilityNavTimer=setTimeout(()=>ensureUtilityNav().catch(()=>{}),30);
}

function targetRouteFromLink(target){
  const link=target?.closest?.('a[href^="#"]');
  if(!link)return '';
  return routeName(link.getAttribute('href'));
}

document.addEventListener('pointerover',event=>{
  const route=targetRouteFromLink(event.target);
  if(route&&route!==routeName())loadForRoute(route,{prefetch:true}).catch(()=>{});
},{passive:true});
document.addEventListener('focusin',event=>{
  const route=targetRouteFromLink(event.target);
  if(route&&route!==routeName())loadForRoute(route,{prefetch:true}).catch(()=>{});
});
document.addEventListener('click',event=>{
  const route=targetRouteFromLink(event.target);
  if(route&&route!==routeName())loadForRoute(route,{prefetch:true}).catch(()=>{});
},true);

window.addEventListener('hashchange',()=>{
  routeSeq++;
  scheduleUtilityNav();
});
window.addEventListener('crj:route-rendered',()=>{
  scheduleRouteLoad();
  scheduleUtilityNav();
});
window.addEventListener('focus',scheduleUtilityNav);

const appRoot=document.querySelector('#app');
if(appRoot){
  new MutationObserver(scheduleUtilityNav).observe(appRoot,{childList:true});
}

idle(()=>loadModule('developer_view').catch(()=>{}),1400);

scheduleUtilityNav();
scheduleRouteLoad();

window.__crjFeatureLoader={
  route:routeName,
  loaded:()=>[...moduleCache.keys()],
  preload:route=>loadForRoute(route,{prefetch:true})
};
