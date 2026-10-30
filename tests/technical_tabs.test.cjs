const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}};

test('Painel e Planejamento têm rotas próprias, mantendo Evidências e Configurações',async()=>{
 const file=read('bundle/src__app_js.005.part');
 const code=file.slice(file.indexOf('async function pageTechnicalTeam(){'),file.indexOf('\nasync function bindTechnicalPage(){'));
 const location={hash:'#equipe-tecnica?view=painel&month=2026-11'};
 const ctx=vm.createContext({location,URLSearchParams,route:()=>({params:new URLSearchParams(location.hash.split('?')[1]||'')}),currentMonth:()=> '2026-10',
  permitted:()=>true,esc:x=>String(x),listTechnicalTeamDashboard:async()=>({metrics:{},settings:{},records:[],professionals:[]}),applyDocumentSettings:()=>{},
  technicalProgressCard:name=>`<p data-progress>${name}</p>`,technicalEvidenceHtml:()=>'<p>Documento de evidência</p>',technicalTargetSettingsCard:()=>'<p>Referências de metas</p>'});
 vm.runInContext(code,ctx);
 let html=await ctx.pageTechnicalTeam(),{document}=parseHTML(`<main>${html}</main>`);
 assert.equal(document.querySelector('[data-nav*="view=painel"]').classList.contains('active'),true);
 assert(document.querySelector('[data-nav*="view=planejamento"]'));assert.match(html,/Últimos atendimentos/);
 location.hash='#equipe-tecnica?view=planejamento&month=2026-11';html=await ctx.pageTechnicalTeam();document=parseHTML(`<main>${html}</main>`).document;
 assert.equal(document.querySelector('[data-nav*="view=planejamento"]').classList.contains('active'),true);
 assert(document.querySelector('[data-technical-enhancement-host]'));assert.doesNotMatch(html,/Últimos atendimentos|technical-progress-grid/);
 location.hash='#equipe-tecnica?view=evidencias&month=2026-11';html=await ctx.pageTechnicalTeam();assert.match(html,/Documento de evidência/);
 location.hash='#equipe-tecnica?view=configuracoes&month=2026-11';html=await ctx.pageTechnicalTeam();assert.match(html,/Referências de metas/);
});

test('uma resposta antiga do painel não substitui a aba de planejamento aberta depois',async()=>{
 const {window}=parseHTML('<html><head></head><body><main class="content"><div data-technical-enhancement-host></div></main></body></html>');
 const location={hash:'#equipe-tecnica?view=painel&month=2026-11'},old=deferred(),fresh=deferred();let requests=0;
 const ctx=vm.createContext({window,document:window.document,location,URLSearchParams,Intl,Date,Map,Set,console,Promise,
   apiMode:()=> 'live',supabaseClient:()=>({}),setTimeout:()=>0,clearTimeout:()=>{}});
 let code=read('src/technical_team_enhancements.js').replace(/^import .*;\n/gm,'').replace(/\nboot\(\);\s*$/,'');
 code+=`\nme={id:'tech',role:'psicologo',active:true};loadData=()=>globalThis.fetchData();dashboardHtml=(m,d,v)=>'<section id="technical-team-enhancement" data-month="'+m+'" data-view="'+v+'">'+d.label+'</section>';bindEnhancement=async()=>{};globalThis.api={renderEnhancement};`;
 ctx.fetchData=()=>++requests===1?old.promise:fresh.promise;vm.runInContext(code,ctx);
 const first=ctx.api.renderEnhancement();
 location.hash='#equipe-tecnica?view=planejamento&month=2026-11';
 window.document.querySelector('.content').innerHTML='<div data-technical-enhancement-host></div>';
 const second=ctx.api.renderEnhancement();fresh.resolve({label:'Projeto de planejamento'});await second;
 old.resolve({label:'Painel antigo'});await first;
 const result=window.document.querySelector('#technical-team-enhancement');assert.equal(result.dataset.view,'planejamento');assert.equal(result.textContent,'Projeto de planejamento');
 location.hash='#equipe-tecnica?view=evidencias&month=2026-11';window.document.querySelector('.content').innerHTML='<div data-technical-enhancement-host></div><p>Documento de evidência</p>';
 await ctx.api.renderEnhancement();assert.equal(window.document.querySelector('#technical-team-enhancement'),null);assert.match(window.document.querySelector('.content').textContent,/Documento de evidência/);
});

test('atalhos de metas e da agenda abrem o planejamento técnico',()=>{
 const goals=read('src/goals_workspace.js');
 const planRoute=vm.runInNewContext(`(${goals.slice(goals.indexOf('function planRoute('),goals.indexOf('\n\nasync function profile('))})`);
 assert.equal(planRoute({code:'PVIDA'},'2026-11'),'equipe-tecnica?view=planejamento&month=2026-11');
 assert.equal(planRoute({code:'PTRAMPO'},'2026-11'),'equipe-tecnica?view=planejamento&month=2026-11');
 const calendar=read('src/general_calendar.js');
 const routeFor=vm.runInNewContext(`(${calendar.slice(calendar.indexOf('function routeFor('),calendar.indexOf('\nfunction ownerIds('))})`,{URLSearchParams,first:(row,fields)=>fields.map(k=>row[k]).find(Boolean)});
 assert.equal(routeFor('technical_action_plans',{}),'#equipe-tecnica?view=planejamento');
 assert.equal(routeFor('technical_action_plans',{source_route:'#equipe-tecnica?month=2026-11'}),'#equipe-tecnica?month=2026-11&view=planejamento');
 assert.equal(routeFor('technical_action_plans',{source_route:'#equipe-tecnica?view=evidencias'}),'#equipe-tecnica?view=evidencias');
 assert.equal(routeFor('workshop_sessions',{}),'#oficinas');
});
