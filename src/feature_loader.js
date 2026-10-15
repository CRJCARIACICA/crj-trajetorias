import { getSession } from './api.js?v=20261004-2';

// Carregador incremental do CRJ Trajetórias.
// O núcleo (app.js) renderiza a rota; complementos pesados só são importados
// quando a área correspondente é realmente aberta. Isso evita dezenas de
// MutationObservers e consultas Supabase fora do menu em uso.

const VERSION='20261015-lazy4';
const moduleCache=new Map();
let routeSeq=0;
let routeTimer=null;
let sessionPromise=null;
let profileCache=null;
let utilityNavTimer=null;

const ACCESS_ROLES=new Set(['coordenacao_geral','controlador_acesso','monitoramento']);

const ROUTE_FEATURES={
  jovens:{critical:['youth_list_fields'],deferred:[]},
  jovem:{
    critical:['youth_profile_enhancements','youth_trajectory_evidence','youth_trajectory_exports','technical_service_flow'],
    deferred:['document_header_standard','evidence_exports']
  },
  formulario:{
    critical:['form_access','universal_drafts','youth_profile_enhancements'],
    deferred:['document_header_standard','evidence_exports','articulation_workspace']
  },
  formularios:{critical:['form_access'],deferred:[]},
  oficinas:{
    critical:['workshop_devices','instructor_management','workshop_collaboration','workshop_live_sync','workshop_plan_delete','cfdh_transversal_integration'],
    deferred:['articulation_workspace','joint_actions','document_header_standard','evidence_exports','attendance_export_fix']
  },
  oficina:{
    critical:['workshop_devices','instructor_management','workshop_collaboration','workshop_live_sync','workshop_plan_delete','cfdh_transversal_integration'],
    deferred:['articulation_workspace','joint_actions','document_header_standard','evidence_exports','attendance_export_fix']
  },
  workshops:{
    critical:['workshop_devices','instructor_management','workshop_collaboration','workshop_live_sync','workshop_plan_delete','cfdh_transversal_integration'],
    deferred:['articulation_workspace','joint_actions','document_header_standard','evidence_exports','attendance_export_fix']
  },
  educador:{
    critical:['educator_complementary','workshop_plan_delete'],
    deferred:['articulation_workspace','joint_actions','document_header_standard','evidence_exports']
  },
  'planejamento-educador':{
    critical:['educator_complementary','workshop_plan_delete'],
    deferred:['articulation_workspace','joint_actions','document_header_standard','evidence_exports']
  },
  cfdh:{
    critical:['cfdh_program_metrics','cfdh_transversal_integration'],
    deferred:['articulation_workspace','joint_actions','document_header_standard','evidence_exports']
  },
  'equipe-tecnica':{
    critical:['technical_service_flow','technical_team_enhancements','technical_program_actions','technical_workspace','technical_planning_governance'],
    deferred:['articulation_workspace','joint_actions','document_header_standard','evidence_exports']
  },
  'controlador-acesso':{
    critical:['access_controller'],
    deferred:['document_header_standard','evidence_exports']
  },
  articulacao:{
    critical:['articulation_workspace','articulation_evidence'],
    deferred:['articulation_demand_identity','joint_actions','document_header_standard','evidence_exports']
  },
  'planos-mobilizacao':{
    critical:['articulation_workspace'],
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
  metas:{critical:['goals_workspace'],deferred:[]},
  equipe:{critical:['instructor_management'],deferred:[]},
  'equipe-permissoes':{critical:['instructor_management'],deferred:[]},
  jhonatao:{critical:['jhonatao_multimodal','jhonatao_live'],deferred:[]},
  'calendario-geral':{critical:['general_calendar'],deferred:[]}
};

function routeName(hash=location.hash){
  return String(hash||'#dashboard').split('?')[0].replace(/^#/,'').split('/')[0]||'dashboard';
}

function featureSet(route){
  return ROUTE_FEATURES[route]||{critical:[],deferred:[]};
}

function moduleUrl(name){
  return `./${name}.js?v=${VERSION}`;
}

function loadModule(name){
  if(moduleCache.has(name))return moduleCache.get(name);
  const promise=import(moduleUrl(name)).catch(error=>{
    moduleCache.delete(name);
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

async function loadForRoute(route,{prefetch=false}={}){
  const group=featureSet(route);
  const critical=[...new Set(group.critical||[])];
  if(!critical.length&&!(group.deferred||[]).length)return;

  // No hover/focus apenas aquece o cache; os módulos se auto-limitam pela rota.
  if(prefetch){
    await Promise.allSettled(critical.map(loadModule));
    return;
  }

  const seq=++routeSeq;
  const current=routeName();
  const results=await Promise.allSettled(critical.map(loadModule));
  if(seq!==routeSeq||routeName()!==current)return;
  if(results.some(r=>r.status==='fulfilled'))pulseContent();

  const deferred=[...new Set(group.deferred||[])].filter(x=>!critical.includes(x));
  if(deferred.length){
    idle(async()=>{
      const expected=routeName();
      await Promise.allSettled(deferred.map(loadModule));
      if(routeName()===expected)pulseContent();
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
  // Se o carregador iniciou ainda na tela de login, permita nova tentativa após autenticação.
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

async function ensureUtilityNav(){
  const nav=document.querySelector('.sidebar .nav');
  if(!nav)return;
  const profile=await currentProfile();
  if(!profile)return;
  insertCalendarNav(nav,profile);
  insertAccessNav(nav,profile);
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

// Pré-carrega somente o bloco crítico quando o usuário demonstra intenção de abrir um menu.
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
  scheduleRouteLoad();
  scheduleUtilityNav();
});
window.addEventListener('focus',()=>{
  scheduleUtilityNav();
  // Não refaz consultas pesadas: apenas garante que o módulo da rota já esteja disponível.
  scheduleRouteLoad();
});

const appRoot=document.querySelector('#app');
if(appRoot){
  // O app recria a sidebar em cada render. Observamos apenas filhos diretos do #app,
  // sem vigiar toda a árvore, para recolocar os dois atalhos leves quando necessário.
  new MutationObserver(scheduleUtilityNav).observe(appRoot,{childList:true});
}

// Ferramentas de desenvolvedor são globais, mas não bloqueiam a primeira pintura.
idle(()=>loadModule('developer_view').catch(()=>{}),1400);

scheduleUtilityNav();
scheduleRouteLoad();

window.__crjFeatureLoader={
  route:routeName,
  loaded:()=>[...moduleCache.keys()],
  preload:route=>loadForRoute(route,{prefetch:true})
};
