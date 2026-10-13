import { apiMode, supabaseClient } from './api.js?v=20261004-2';

const PLAN_ROLES=new Set(['coordenacao_geral','assistente_social','psicologo','terapeuta_ocupacional']);
const PROGRAM_LABELS={pvida:'PVida',ptrampo:'PTrampo'};
const LINK_LABELS={
  pvida:'PVida',ptrampo:'PTrampo',cfdh:'CFDH',oficina:'Oficina',passeio:'Passeio',
  atendimento_beneficio:'Atendimento / benefício',evento_programacao:'Evento / programação',
  vivencia_intercambio:'Vivência / intercâmbio',curso_profissionalizante:'Curso profissionalizante',
  mostra_profissoes:'Mostra de profissões',parceria_rede:'Parceria / rede'
};
const INDICATORS_BY_PATH={
  pvida:['M6.2_PVIDA_HORAS','M6.2_PVIDA_JOVENS','M6.2_PVIDA_PARTICIPACOES'],
  ptrampo:['M6.4_PTRAMPO_ATIVIDADES','M6.4_PTRAMPO_JOVENS','M4.1_PTRAMPO_ATIVIDADES','M4.1_PTRAMPO_JOVENS'],
  cfdh:['M6.1_CFDH_HORAS'],
  oficina:['M6.1_OFICINAS_HORAS'],
  atendimento_beneficio:['M2.1_ATENDIMENTOS'],
  evento_programacao:['M6.1_EVENTOS'],
  curso_profissionalizante:['M4.6_CURSO_HORAS','M4.6_CURSO_JOVENS_MES','M4.6_CURSO_JOVENS_ANO','M6.4_CURSO_HORAS','M6.4_CURSO_JOVENS_MES','M6.4_CURSO_JOVENS_ANO'],
  mostra_profissoes:['M6.4_MOSTRAS','M6.4_MOSTRA_PARTICIPANTES'],
  parceria_rede:['M4.4_ACOES'],
  passeio:[],vivencia_intercambio:[]
};
const ALL_CODES=[...new Set(Object.values(INDICATORS_BY_PATH).flat())];

let me=null,cache=null,cacheMonth='',cacheAt=0,timer=null,observer=null,activePlanId=null;
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const fmtDate=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const fmtTime=v=>String(v||'').slice(0,5);
const onRoute=()=>location.hash.split('?')[0]==='#equipe-tecnica';
const month=()=>new URLSearchParams(location.hash.split('?')[1]||'').get('month')||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date());
const client=()=>{if(apiMode()!=='live')throw new Error('Banco ainda não conectado.');return supabaseClient()};
const arr=v=>Array.isArray(v)?v:[];

function installStyles(){
  if(document.querySelector('#tpg-style'))return;
  const s=document.createElement('style');s.id='tpg-style';s.textContent=`
  .tpg-legend{margin:10px 0 14px;padding:11px 12px;border:1px solid #d8e4e0;border-radius:13px;background:#fff}.tpg-legend-line,.tpg-path-line,.tpg-indicators{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.tpg-legend strong{font-size:12px}.tpg-mini{font-size:10px;color:#687771}.tpg-path{margin:9px 0 0;padding:10px;border:1px solid #dce6e2;border-radius:11px;background:#fbfdfc}.tpg-path-title{font-size:11px;font-weight:800;margin-bottom:6px}.tpg-arrow{font-weight:900;color:#7b8984}.tpg-chip{display:inline-flex;align-items:center;gap:4px;border:1px solid #d4dfdb;border-radius:999px;padding:4px 7px;font-size:10px;font-weight:750;background:#f6f8f7}.tpg-chip.root:before{content:'RAIZ';font-size:8px;font-weight:900;opacity:.7}.tpg-chip.link:before{content:'TRANSVERSAL';font-size:8px;font-weight:900;opacity:.7}.tpg-pvida{background:#f3ecff;border-color:#ceb8f5;color:#5a2a9c}.tpg-ptrampo{background:#eaf6ff;border-color:#add8f1;color:#0b5e8d}.tpg-cfdh{background:#fff5df;border-color:#e8c37a;color:#8a5700}.tpg-oficina,.tpg-curso_profissionalizante{background:#eaf9f3;border-color:#a9d9c8;color:#17644f}.tpg-parceria_rede{background:#fff0f3;border-color:#efbac5;color:#8a3045}.tpg-evento_programacao,.tpg-mostra_profissoes{background:#fff1e8;border-color:#efc1a0;color:#8d4a1b}.tpg-generic{background:#f3f5f4;color:#53615c}.tpg-indicator{display:inline-block;border-radius:8px;padding:4px 6px;font-size:9px;border:1px solid #d9e1de;background:#fff}.tpg-indicator b{font-size:9px}.tpg-reason{font-size:10px;color:#5f6e69;margin-top:6px}.tpg-duplicate{margin:8px 0 0;padding:9px;border:1px solid #e6a6a6;background:#fff3f3;border-radius:10px;font-size:10px;color:#7d2727}.tpg-duplicate strong{display:block;margin-bottom:3px}.tpg-same-view{margin-top:7px;font-size:9px;color:#5e6d67;border-left:3px solid #9ab8ad;padding-left:7px}.tpg-delete.btn{border-color:#dca4a4;color:#8f2f2f;background:#fff}.tpg-delete.btn:disabled{opacity:.5;cursor:not-allowed}.tpg-cross{margin:10px 0;padding:10px;border:1px solid #cfded8;border-radius:11px;background:#f8fbfa}.tpg-cross label{display:flex;gap:8px;align-items:flex-start}.tpg-cross input{margin-top:3px}.tpg-cross-preview{margin-top:7px}.tpg-linked-note{margin-top:5px;padding:5px 7px;border-radius:8px;background:#f4f7f6;font-size:9px;color:#5a6964}.tpg-summary-danger{border-color:#e7b1b1;background:#fff7f7}.tpg-exec-lock{font-size:9px;color:#8a5d24;margin-top:4px}
  `;document.head.appendChild(s);
}

async function profile(){
  if(me)return me;
  const c=client(),{data:{user}}=await c.auth.getUser();if(!user)return null;
  const {data,error}=await c.from('profiles').select('id,display_name,role,active').eq('id',user.id).maybeSingle();if(error)throw error;me=data||null;return me;
}
function canDelete(){return !!me?.active&&PLAN_ROLES.has(String(me.role||''))}

function startEnd(m){const [y,mo]=m.split('-').map(Number);return {start:`${m}-01`,end:new Date(Date.UTC(y,mo,1)).toISOString().slice(0,10)}}
async function load(force=false){
  const m=month();if(!force&&cache&&cacheMonth===m&&Date.now()-cacheAt<2000)return cache;
  const c=client(),r=startEnd(m);
  const [plansQ,execQ,indQ]=await Promise.all([
    c.from('technical_action_plans').select('id,plan_month,action_type,action_scope,title,planned_date,start_time,end_time,status,linked_action_types,methodology_links,created_at,updated_at').gte('plan_month',r.start).lt('plan_month',r.end).order('planned_date',{ascending:true,nullsFirst:false}).order('start_time',{ascending:true,nullsFirst:false}),
    c.from('technical_action_executions').select('id,plan_id,execution_status,execution_date,duration_hours').gte('execution_date',r.start).lt('execution_date',r.end),
    c.from('indicator_catalog').select('code,label,goal_stage,target,unit,periodicity').in('code',ALL_CODES)
  ]);
  for(const q of [plansQ,execQ,indQ])if(q.error)throw q.error;
  const plans=plansQ.data||[],executions=execQ.data||[],indicatorMap=new Map((indQ.data||[]).map(x=>[x.code,x]));
  const byPlanExec=new Map(executions.map(x=>[x.plan_id,x]));
  const groups=new Map();
  for(const p of plans){const k=fingerprint(p);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(p)}
  cache={plans,executions,indicatorMap,byPlanExec,groups};cacheMonth=m;cacheAt=Date.now();return cache;
}
function fingerprint(p){return [norm(p.action_type),norm(p.title),String(p.planned_date||''),fmtTime(p.start_time),fmtTime(p.end_time)].join('|')}
function links(p){return arr(p.linked_action_types).filter(x=>norm(x?.type)&&norm(x.type)!==norm(p.action_type))}
function chipClass(type){const t=norm(type);return `tpg-${['pvida','ptrampo','cfdh','oficina','curso_profissionalizante','parceria_rede','evento_programacao','mostra_profissoes'].includes(t)?t:'generic'}`}
function indicatorCodes(p){const codes=[...(INDICATORS_BY_PATH[norm(p.action_type)]||[])];for(const l of links(p))codes.push(...(INDICATORS_BY_PATH[norm(l.type)]||[]));return [...new Set(codes)]}
function indicatorHtml(code,data){const i=data.indicatorMap.get(code);const cls=code.includes('PVIDA')?'tpg-pvida':code.includes('PTRAMPO')?'tpg-ptrampo':code.includes('CFDH')?'tpg-cfdh':code.includes('CURSO')?'tpg-curso_profissionalizante':code.includes('MOSTRA')||code.includes('EVENT')?'tpg-evento_programacao':'tpg-generic';return `<span class="tpg-indicator ${cls}" title="${esc(i?.label||code)}"><b>${esc(code)}</b>${i?.unit?` · ${esc(i.unit)}`:''}</span>`}
function pathHtml(p,data,{compact=false}={}){
  const ls=links(p),root=norm(p.action_type),rootLabel=PROGRAM_LABELS[root]||p.action_type||'Equipe Técnica',codes=indicatorCodes(p);
  const reason=ls.length?`O planejamento existe uma única vez com <b>${esc(rootLabel)}</b> como ação raiz. Os vínculos transversais reutilizam a mesma execução e a mesma lista de presença; apenas distribuem a contribuição para os indicadores compatíveis.`:`O planejamento existe uma única vez com <b>${esc(rootLabel)}</b> como ação raiz.`;
  return `<div class="tpg-path ${compact?'tpg-path-compact':''}" data-tpg-path="${esc(p.id)}"><div class="tpg-path-title">Caminho metodológico e indicadores</div><div class="tpg-path-line"><span class="tpg-chip root ${chipClass(root)}">${esc(rootLabel)}</span>${ls.map(l=>`<span class="tpg-arrow">→</span><span class="tpg-chip link ${chipClass(l.type)}">${esc(LINK_LABELS[norm(l.type)]||l.label||l.type)}</span>`).join('')}${codes.length?'<span class="tpg-arrow">→</span>':''}</div>${codes.length?`<div class="tpg-indicators" style="margin-top:6px">${codes.map(c=>indicatorHtml(c,data)).join('')}</div>`:'<div class="tpg-mini" style="margin-top:6px">Este vínculo não possui indicador quantitativo automático; permanece como classificação e evidência metodológica.</div>'}<div class="tpg-reason">${reason}</div></div>`;
}
function canonical(rows,data){return [...rows].sort((a,b)=>{const ae=data.byPlanExec.has(a.id)?0:1,be=data.byPlanExec.has(b.id)?0:1;if(ae!==be)return ae-be;const as=a.status==='planejado'?0:a.status==='rascunho'?2:1,bs=b.status==='planejado'?0:b.status==='rascunho'?2:1;if(as!==bs)return as-bs;return new Date(a.created_at)-new Date(b.created_at)})[0]}
function duplicateHtml(p,data){const rows=data.groups.get(fingerprint(p))||[];if(rows.length<2)return '';const keep=canonical(rows,data),isKeep=keep.id===p.id;return `<div class="tpg-duplicate"><strong>DUPLICIDADE FÍSICA · ${rows.length} registros</strong>Mesmo título, programa, data e horário existem em mais de uma linha do banco. Isso <b>não é transversalidade</b>. ${isKeep?'Este é o registro recomendado para preservar'+(data.byPlanExec.has(p.id)?' porque possui execução registrada.':'.'):'Esta é uma cópia provável; compare e exclua se não houver informação exclusiva.'}</div>`}

function ensureDelete(card,p,data){
  if(!canDelete())return;const actions=card.querySelector('.tpa-actions,.tw-actions');if(!actions||actions.querySelector(`[data-tpg-delete="${CSS.escape(p.id)}"]`))return;
  const b=document.createElement('button');b.type='button';b.className='btn tpg-delete';b.dataset.tpgDelete=p.id;b.textContent=(data.groups.get(fingerprint(p))||[]).length>1&&canonical(data.groups.get(fingerprint(p)),data).id!==p.id?'Excluir cópia':'Excluir planejamento';
  if(data.byPlanExec.has(p.id)){b.disabled=true;b.title='Este planejamento possui execução registrada e não pode ser excluído para preservar a evidência.';const note=document.createElement('div');note.className='tpg-exec-lock';note.textContent='Exclusão bloqueada: já existe execução/evidência registrada.';actions.insertAdjacentElement('afterend',note)}
  actions.appendChild(b);
}
function planIdFromCard(card){
  const e=card.querySelector('[data-tpa-edit],[data-tpa-execute]');if(e)return e.dataset.tpaEdit||e.dataset.tpaExecute||null;
  const d=card.querySelector('[data-tw-tech-pdf^="plan:"]');if(d)return String(d.dataset.twTechPdf||'').split(':')[1]||null;
  return null;
}
function decorateCards(data){
  document.querySelectorAll('.tpa-card').forEach(card=>{const id=planIdFromCard(card),p=data.plans.find(x=>x.id===id);if(!p)return;card.querySelector('[data-tpg-path]')?.remove();card.querySelector('.tpg-duplicate')?.remove();const actions=card.querySelector('.tpa-actions');if(actions)actions.insertAdjacentHTML('beforebegin',pathHtml(p,data)+duplicateHtml(p,data));else card.insertAdjacentHTML('beforeend',pathHtml(p,data)+duplicateHtml(p,data));ensureDelete(card,p,data)});
  document.querySelectorAll('#tw-planning-docs .tw-card .tw-card').forEach(card=>{const id=planIdFromCard(card),p=data.plans.find(x=>x.id===id);if(!p)return;card.querySelector('[data-tpg-path]')?.remove();card.querySelector('.tpg-duplicate')?.remove();const actions=card.querySelector('.tw-actions');if(actions)actions.insertAdjacentHTML('beforebegin',`<div class="tpg-same-view">MESMO PLANEJAMENTO · esta caixa é a visão documental do registro principal, não uma nova ação.</div>${pathHtml(p,data,{compact:true})}${duplicateHtml(p,data)}`);ensureDelete(card,p,data)});
}
function decorateLinkedViews(data){
  document.querySelectorAll('.tpa-linked-item').forEach(item=>{if(item.querySelector('.tpg-linked-note'))return;const title=norm(item.querySelector('b')?.textContent),matches=data.plans.filter(p=>norm(p.title)===title);const roots=[...new Set(matches.map(p=>PROGRAM_LABELS[norm(p.action_type)]||p.action_type))];item.insertAdjacentHTML('beforeend',`<div class="tpg-linked-note"><b>VISÃO TRANSVERSAL</b> · esta linha não é outro planejamento. Ação raiz: ${esc(roots.join(' / ')||'registro técnico')}.</div>`)});
}
function renderLegend(data){
  const shell=document.querySelector('#technical-program-actions');if(!shell)return;let box=shell.querySelector('#tpg-legend');const dupGroups=[...data.groups.values()].filter(r=>r.length>1);
  const html=`<div class="tpg-legend-line"><strong>Legenda:</strong><span class="tpg-chip root tpg-pvida">PVida</span><span class="tpg-chip root tpg-ptrampo">PTrampo</span><span class="tpg-chip link tpg-cfdh">CFDH</span><span class="tpg-chip link tpg-oficina">Oficina/curso</span></div><div class="tpg-mini" style="margin-top:6px"><b>RAIZ</b> = onde o planejamento nasceu. <b>TRANSVERSAL</b> = outra finalidade da mesma ação. A transversalidade não cria outra lista nem outro planejamento.</div>${dupGroups.length?`<div class="tpg-duplicate" style="margin-top:8px"><strong>${dupGroups.length} grupo(s) de duplicidade física encontrados</strong>${dupGroups.map(r=>`${esc(r[0].title)} · ${r.length} registros · ${esc(fmtDate(r[0].planned_date))} ${esc(fmtTime(r[0].start_time))}`).join('<br>')}</div>`:''}`;
  if(!box){box=document.createElement('div');box.id='tpg-legend';box.className=`tpg-legend ${dupGroups.length?'tpg-summary-danger':''}`;shell.querySelector('.tpa-head')?.insertAdjacentElement('afterend',box)}box.innerHTML=html;
}

function existingCrossFor(plan,root){return links(plan||{}).some(l=>['pvida','ptrampo'].includes(norm(l.type))&&norm(l.type)!==norm(root))}
function crossIndicatorsHtml(root,other,checked,data){const pseudo={action_type:root,linked_action_types:checked?[{type:other}]:[]};return pathHtml(pseudo,data,{compact:true}).replace(`data-tpg-path="undefined"`,'data-tpg-cross-preview="1"')}
function enhancePlanForm(data){
  const form=document.querySelector('#tpa-plan-form');if(!form)return;const rootSelect=form.querySelector('[name="action_type"]');if(!rootSelect)return;
  let box=form.querySelector('[data-tpg-cross]');const plan=data.plans.find(p=>p.id===activePlanId)||null;
  if(!box){
    const sections=[...form.querySelectorAll('.tpa-section')],section=sections.find(s=>norm(s.querySelector('h4')?.textContent).includes('acoes ligadas'))||sections.at(-1);if(!section)return;
    box=document.createElement('div');box.className='tpg-cross';box.dataset.tpgCross='1';box.innerHTML=`<label><input type="checkbox" name="linked_type" data-tpg-cross-check><span><b data-tpg-cross-title></b><span class="tpg-mini" data-tpg-cross-text></span></span></label><div class="tpg-cross-preview" data-tpg-cross-preview-host></div>`;section.insertBefore(box,section.children[2]||null);
    const initialRoot=norm(rootSelect.value),initialOther=initialRoot==='pvida'?'ptrampo':'pvida';box.querySelector('[data-tpg-cross-check]').checked=existingCrossFor(plan,initialRoot);box.querySelector('[data-tpg-cross-check]').value=initialOther;
    box.querySelector('[data-tpg-cross-check]').addEventListener('change',()=>renderCross());
    rootSelect.addEventListener('change',()=>renderCross());
  }
  const renderCross=()=>{
    const root=norm(rootSelect.value)==='ptrampo'?'ptrampo':'pvida',other=root==='pvida'?'ptrampo':'pvida',cb=box.querySelector('[data-tpg-cross-check]');cb.value=other;
    box.querySelector('[data-tpg-cross-title]').textContent=`Também alimentar ${PROGRAM_LABELS[other]} como ação transversal?`;
    box.querySelector('[data-tpg-cross-text]').textContent=` Ação raiz: ${PROGRAM_LABELS[root]}. Marcar ${PROGRAM_LABELS[other]} não cria outro planejamento; a mesma execução/lista passa a contribuir para os indicadores compatíveis.`;
    box.querySelector('[data-tpg-cross-preview-host]').innerHTML=crossIndicatorsHtml(root,other,cb.checked,data);
  };
  renderCross();
}

async function deletePlan(id){
  const data=await load(),p=data.plans.find(x=>x.id===id);if(!p)return;
  if(data.byPlanExec.has(id)){alert('Este planejamento possui execução registrada. A exclusão é bloqueada para preservar a evidência; edite ou cancele a execução conforme a regra do sistema.');return}
  if(!confirm(`Excluir o planejamento “${p.title}”?\n\nEle irá para a lixeira de segurança por 24 horas.`))return;
  const {error}=await client().rpc('soft_delete_technical_action_plan',{p_id:id});if(error){alert(error.message||String(error));return}
  cache=null;alert('Planejamento enviado para a lixeira de segurança por 24 horas.');location.reload();
}

async function enhance(force=false){
  if(!onRoute())return;installStyles();await profile();const data=await load(force);renderLegend(data);decorateCards(data);decorateLinkedViews(data);enhancePlanForm(data);
}
function schedule(force=false){clearTimeout(timer);timer=setTimeout(()=>enhance(force).catch(err=>console.warn('Governança do planejamento técnico:',err)),100)}

document.addEventListener('click',e=>{
  const edit=e.target.closest?.('[data-tpa-edit]');if(edit){activePlanId=edit.dataset.tpaEdit;schedule()}
  const fresh=e.target.closest?.('[data-tpa-new]');if(fresh){activePlanId=null;schedule()}
  const del=e.target.closest?.('[data-tpg-delete]');if(del){e.preventDefault();e.stopImmediatePropagation();deletePlan(del.dataset.tpgDelete).catch(err=>alert(err.message||err))}
},true);
window.addEventListener('hashchange',()=>{activePlanId=null;cache=null;schedule(true)});window.addEventListener('focus',()=>schedule(true));
observer=new MutationObserver(()=>{if(onRoute())schedule()});observer.observe(document.body,{childList:true,subtree:true});
schedule(true);
