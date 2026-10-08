import { apiMode, supabaseClient } from './api.js?v=20261004-2';

const ROUTES=new Set(['dashboard','jovens','jovem','formularios','formulario','oficinas','oficina','educador','cfdh','equipe-tecnica','agenda','metas','lancamento-geral','equipe','controlador-acesso','articulacao']);
const MONTHLY_OPERATIONAL=new Set(['formularios','oficinas','oficina','educador','cfdh','equipe-tecnica','agenda','metas','lancamento-geral','controlador-acesso','articulacao']);
const FORM_LABELS={
  'formulario-inicial':'Formulário Inicial','lista-presenca-contato':'Lista de Presença e Contato','acompanhamento':'Acompanhamento','pvida':'PVida','outras-demandas':'Outras Demandas','ptrampo':'PTrampo','avaliacao-atividades':'Avaliação das Atividades','relatorio-mobilizacao':'Relatório de Mobilização','emprestimo':'Empréstimo','emprestimo-canhoto':'Canhoto de Empréstimo','cfdh-planejamento':'CFDH — Planejamento','cfdh-avaliacao-jovens':'CFDH — Avaliação Jovens','cfdh-avaliacao-equipe':'CFDH — Avaliação Equipe'
};
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nowMonth=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date());
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let scheduled=false,profile=null;

function client(){if(apiMode()!=='live')return null;return supabaseClient()}
function route(){const raw=(location.hash||'#dashboard').slice(1),[path,q='']=raw.split('?');return {parts:path.split('/').filter(Boolean),params:new URLSearchParams(q)}}
function topRoute(){return route().parts[0]||'dashboard'}
function month(){return route().params.get('month')||nowMonth()}
function monthRange(m=month()){const [y,mo]=m.split('-').map(Number);return {start:`${y}-${String(mo).padStart(2,'0')}-01`,end:new Date(Date.UTC(y,mo,1)).toISOString().slice(0,10)}}
function shiftMonth(m,delta){const [y,mo]=m.split('-').map(Number),d=new Date(Date.UTC(y,mo-1+delta,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`}
function setMonth(next){const r=route();r.params.set('month',next);location.hash=`#${r.parts.join('/')}${r.params.toString()?'?'+r.params.toString():''}`}
function preserveMonthTarget(raw){if(!raw||/^https?:/i.test(raw))return raw;const clean=String(raw).replace(/^#/,'');const [path,q='']=clean.split('?'),parts=path.split('/').filter(Boolean);if(!ROUTES.has(parts[0]||''))return raw;const p=new URLSearchParams(q);if(!p.has('month'))p.set('month',month());return `${path}?${p.toString()}`}
function toast(msg,type='success'){const e=document.createElement('div');e.className=`pill ${type}`;e.textContent=msg;Object.assign(e.style,{position:'fixed',right:'20px',bottom:'20px',zIndex:2147483646,padding:'12px 16px',boxShadow:'0 10px 35px rgba(0,0,0,.22)'});document.body.appendChild(e);setTimeout(()=>e.remove(),3400)}

async function resolveProfile(){
  for(let i=0;i<60&&apiMode()!=='live';i++)await sleep(100);
  if(!client())return null;
  const {data:{user}}=await client().auth.getUser();if(!user)return null;
  const q=await client().from('profiles').select('id,display_name,role,active').eq('id',user.id).maybeSingle();
  if(q.error)throw q.error;profile=q.data||null;return profile;
}

function style(){if(document.querySelector('#global-month-crud-style'))return;const s=document.createElement('style');s.id='global-month-crud-style';s.textContent=`
.gmc-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border:1px solid #d6e4df;background:#f8fbfa;border-radius:14px;padding:10px 12px;margin-bottom:14px}.gmc-month{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.gmc-toolbar input[type=month]{width:auto;min-width:155px}.gmc-toolbar small{color:var(--muted,#687671)}.gmc-panel{border:1px solid #dce6e3;background:#fff;border-radius:14px;padding:13px;margin:14px 0}.gmc-panel h3{margin:0}.gmc-list{display:grid;gap:8px;margin-top:10px}.gmc-row{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;border:1px solid #e4ebe8;border-radius:11px;padding:10px;background:#fbfdfc}.gmc-row>div:first-child{min-width:0}.gmc-row b,.gmc-row span,.gmc-row small{display:block}.gmc-row small{color:var(--muted,#687671);margin-top:2px}.gmc-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.gmc-danger{border-color:#e3b8b8!important;color:#913737!important}.gmc-trash{border-style:dashed;background:#fffdf8}.gmc-edit-banner{margin-bottom:12px}.gmc-modal-bg{position:fixed;inset:0;z-index:2147483500;background:rgba(5,18,22,.68);display:grid;place-items:center;padding:12px}.gmc-modal{width:min(720px,96vw);max-height:94vh;overflow:auto;background:#fff;border-radius:17px;box-shadow:0 28px 85px rgba(0,0,0,.32)}.gmc-modal-head{display:flex;justify-content:space-between;gap:12px;padding:15px 17px;border-bottom:1px solid #e3eae7}.gmc-modal-body{padding:16px 17px}.gmc-modal-actions{padding:12px 17px;border-top:1px solid #e3eae7;display:flex;gap:8px;justify-content:flex-end}.gmc-master-note{font-size:11px;color:#687671}.gmc-tech-trash{margin-top:10px;padding-top:10px;border-top:1px dashed #d5dfdc}
@media(max-width:700px){.gmc-row{display:grid}.gmc-actions{justify-content:flex-start}.gmc-toolbar{align-items:flex-start}.gmc-month{width:100%}}
`;document.head.appendChild(s)}

function toolbar(){
  const r=topRoute();if(!ROUTES.has(r)||['formulario','jovem','oficina'].includes(r))return;
  const content=document.querySelector('.content');if(!content||content.querySelector('[data-gmc-toolbar]'))return;
  const m=month(),master=['jovens','equipe'].includes(r);
  const div=document.createElement('div');div.className='gmc-toolbar';div.dataset.gmcToolbar='1';
  div.innerHTML=`<div><b>Mês de referência</b><small>${master?'Cadastro-base permanente; atividades e contribuições usam o mês selecionado.':'Criar, editar, excluir e consultar registros dentro do período selecionado.'}</small></div><div class="gmc-month"><button class="btn" type="button" data-gmc-prev>‹</button><input class="input" type="month" data-gmc-month value="${esc(m)}"><button class="btn" type="button" data-gmc-next>›</button><button class="btn secondary" type="button" data-gmc-now>Mês atual</button></div>`;
  content.prepend(div);
  div.querySelector('[data-gmc-prev]').onclick=()=>setMonth(shiftMonth(month(),-1));
  div.querySelector('[data-gmc-next]').onclick=()=>setMonth(shiftMonth(month(),1));
  div.querySelector('[data-gmc-now]').onclick=()=>setMonth(nowMonth());
  div.querySelector('[data-gmc-month]').onchange=e=>{if(/^\d{4}-\d{2}$/.test(e.target.value))setMonth(e.target.value)};
}

function preserveNavigation(){
  document.querySelectorAll('.sidebar a[href^="#"]').forEach(a=>{const raw=a.getAttribute('href');if(!raw)return;const target=preserveMonthTarget(raw);if(target!==raw)a.setAttribute('href','#'+target)});
  document.querySelectorAll('[data-nav]').forEach(el=>{const raw=el.dataset.nav;if(raw)el.dataset.nav=preserveMonthTarget(raw)});
}

function formObject(form){const fd=new FormData(form),out={};for(const [k,v] of fd.entries()){if(out[k]!==undefined)out[k]=Array.isArray(out[k])?[...out[k],v]:[out[k],v];else out[k]=v}form.querySelectorAll('input[type=checkbox]').forEach(i=>{if(!(i.name in out))out[i.name]=[]});return out}
function applyValues(form,values){
  for(const [name,value] of Object.entries(values||{})){
    const nodes=[...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)];if(!nodes.length)continue;
    for(const node of nodes){
      if(node.type==='checkbox'){const vals=Array.isArray(value)?value.map(String):[String(value??'')];node.checked=vals.includes(String(node.value));continue}
      if(node.type==='radio'){node.checked=String(node.value)===String(value??'');continue}
      if(node.tagName==='SELECT'&&node.multiple){const vals=new Set(Array.isArray(value)?value.map(String):[]);[...node.options].forEach(o=>o.selected=vals.has(o.value));continue}
      node.value=value??'';
    }
  }
  form.dispatchEvent(new Event('input',{bubbles:true}));
  form.dispatchEvent(new Event('change',{bubbles:true}));
}

async function enhanceSubmissionEdit(){
  const r=route();if(r.parts[0]!=='formulario'||!r.params.get('submission')||!client())return;
  const form=document.querySelector('#dynamic-form');if(!form||form.dataset.gmcSubmissionEdit==='1')return;
  const id=r.params.get('submission');
  const q=await client().from('methodology_form_submissions').select('id,form_slug,youth_id,payload,record_state,source_type,source_id').eq('id',id).maybeSingle();
  if(q.error)throw q.error;if(!q.data)return;
  form.dataset.gmcSubmissionEdit='1';applyValues(form,q.data.payload||{});
  const card=form.querySelector('.methodology-form-editor');if(card&&!card.querySelector('[data-gmc-edit-banner]')){const b=document.createElement('div');b.dataset.gmcEditBanner='1';b.className='notice warn gmc-edit-banner';b.innerHTML='<b>Editando registro já existente.</b><br>Salvar altera este mesmo documento; não cria uma segunda versão no mês.';card.prepend(b)}
  form.addEventListener('submit',async e=>{
    e.preventDefault();e.stopImmediatePropagation();
    const payload=formObject(form),button=form.querySelector('button[type=submit],button:not([type])');if(button){button.disabled=true;button.textContent='Salvando...'}
    try{
      const u=await client().from('methodology_form_submissions').update({payload,updated_at:new Date().toISOString()}).eq('id',id).select('id').maybeSingle();
      if(u.error)throw u.error;toast('Documento atualizado');location.hash=`#formularios?month=${month()}`;
    }catch(err){toast(err.message||String(err),'danger');if(button){button.disabled=false;button.textContent='Salvar alterações'}}
  },true);
}

async function formsPanel(){
  if(topRoute()!=='formularios'||!client())return;
  const content=document.querySelector('.content');if(!content||content.querySelector('[data-gmc-forms]'))return;
  const {start,end}=monthRange(),q=await client().from('methodology_form_submissions').select('id,form_slug,youth_id,submitted_at,updated_at,record_state,source_type,source_id').gte('submitted_at',start).lt('submitted_at',end).order('submitted_at',{ascending:false}).limit(200);if(q.error)throw q.error;
  const youthIds=[...new Set((q.data||[]).map(x=>x.youth_id).filter(Boolean))];let youth=[];if(youthIds.length){const y=await client().from('young_people').select('id,full_name,preferred_name').in('id',youthIds);if(!y.error)youth=y.data||[]}
  const ym=new Map(youth.map(x=>[x.id,x]));
  const trashQ=await client().rpc('list_deleted_methodology_documents');
  const trash=(trashQ.error?[]:trashQ.data||[]).filter(x=>String(x.deleted_at||'').slice(0,7)===month());
  const panel=document.createElement('div');panel.className='gmc-panel';panel.dataset.gmcForms='1';
  const rows=(q.data||[]).map(x=>{const y=ym.get(x.youth_id),generated=!!x.source_type&&x.source_type!=='manual';const target=`formulario/${x.form_slug}${x.youth_id?'/'+x.youth_id:''}?submission=${x.id}&month=${month()}`;return `<div class="gmc-row"><div><b>${esc(FORM_LABELS[x.form_slug]||x.form_slug)}</b><span>${esc(y?.preferred_name||y?.full_name||'Documento coletivo / sem jovem individual')}</span><small>${new Date(x.submitted_at).toLocaleString('pt-BR')} · ${esc(x.record_state||'')} ${generated?'· gerado por '+esc(x.source_type):''}</small></div><div class="gmc-actions">${generated?'<span class="pill info">editar na origem</span>':`<button class="btn" data-gmc-edit-form="${esc(target)}">Editar</button><button class="btn gmc-danger" data-gmc-delete-form="${x.id}">Excluir</button>`}</div></div>`}).join('')||'<div class="empty">Nenhum documento registrado neste mês.</div>';
  const trashRows=trash.map(x=>`<div class="gmc-row gmc-trash"><div><b>${esc(FORM_LABELS[x.form_slug]||x.form_slug)}</b><span>${esc(x.youth_name||'Documento coletivo')}</span><small>Excluído em ${new Date(x.deleted_at).toLocaleString('pt-BR')} · restauração disponível por 24h</small></div><div class="gmc-actions"><button class="btn secondary" data-gmc-restore-form="${x.id}">Restaurar</button></div></div>`).join('');
  panel.innerHTML=`<div class="page-head" style="margin-bottom:0"><div><h3>Registros de ${month().split('-').reverse().join('/')}</h3><p>Documentos do mês podem ser editados ou enviados à lixeira. Evidências geradas por oficina/CFDH/equipe técnica são alteradas no registro de origem.</p></div><span class="pill">${(q.data||[]).length} documento(s)</span></div><div class="gmc-list">${rows}${trashRows?`<div style="margin-top:7px"><b>Lixeira do mês</b></div>${trashRows}`:''}</div>`;
  const head=content.querySelector('.page-head');if(head)head.insertAdjacentElement('afterend',panel);else content.appendChild(panel);
  panel.querySelectorAll('[data-gmc-edit-form]').forEach(b=>b.onclick=()=>{location.hash='#'+b.dataset.gmcEditForm});
  panel.querySelectorAll('[data-gmc-delete-form]').forEach(b=>b.onclick=async()=>{if(!confirm('Excluir este documento? Ele poderá ser restaurado por até 24 horas.'))return;const r=await client().rpc('soft_delete_methodology_document',{p_id:b.dataset.gmcDeleteForm});if(r.error)return toast(r.error.message,'danger');toast('Documento enviado para a lixeira');schedule()});
  panel.querySelectorAll('[data-gmc-restore-form]').forEach(b=>b.onclick=async()=>{const r=await client().rpc('restore_methodology_document',{p_id:b.dataset.gmcRestoreForm});if(r.error)return toast(r.error.message,'danger');toast('Documento restaurado');schedule()});
}

function aggregateModal(row,catalog){document.querySelector('#gmc-modal')?.remove();const bg=document.createElement('div');bg.id='gmc-modal';bg.className='gmc-modal-bg';bg.innerHTML=`<div class="gmc-modal"><div class="gmc-modal-head"><div><h3 style="margin:0">Editar lançamento agregado</h3><small>O mesmo registro será atualizado.</small></div><button class="btn" type="button" data-close>✕</button></div><form data-gmc-aggregate-edit><div class="gmc-modal-body"><div class="form-grid"><div class="field"><label>Indicador</label><select name="indicator_code" required>${catalog.map(i=>`<option value="${esc(i.code)}" ${i.code===row.indicator_code?'selected':''}>${esc(i.code)} — ${esc(i.label)}</option>`).join('')}</select></div><div class="field"><label>Data</label><input class="input" name="record_date" type="date" value="${esc(row.record_date)}" required></div><div class="field"><label>Quantidade</label><input class="input" name="quantity" type="number" step="0.01" value="${esc(row.quantity)}" required></div><div class="field"><label>Evidência</label><input class="input" name="evidence_ref" value="${esc(row.evidence_ref||'')}"></div><div class="field full"><label>Descrição / justificativa</label><textarea name="description">${esc(row.description||'')}</textarea></div></div></div><div class="gmc-modal-actions"><button class="btn" type="button" data-close>Cancelar</button><button class="btn primary">Salvar alterações</button></div></form></div>`;document.body.appendChild(bg);bg.querySelectorAll('[data-close]').forEach(x=>x.onclick=()=>bg.remove());bg.querySelector('form').onsubmit=async e=>{e.preventDefault();const v=formObject(e.target);const q=await client().from('aggregate_records').update({record_date:v.record_date,indicator_code:v.indicator_code,quantity:Number(v.quantity),description:v.description||null,evidence_ref:v.evidence_ref||null}).eq('id',row.id).select('id').maybeSingle();if(q.error)return toast(q.error.message,'danger');bg.remove();toast('Lançamento atualizado');schedule()}}

async function aggregatePanel(){
  if(topRoute()!=='lancamento-geral'||!client())return;
  const content=document.querySelector('.content');if(!content||content.querySelector('[data-gmc-aggregate]'))return;
  const {start,end}=monthRange();const [r,c,t]=await Promise.all([client().from('aggregate_records').select('*').gte('record_date',start).lt('record_date',end).order('record_date',{ascending:false}),client().from('indicator_catalog').select('code,label').eq('active',true).order('code'),client().from('aggregate_record_trash').select('id,original_id,payload,deleted_at,expires_at,restored_at').is('restored_at',null).gte('expires_at',new Date().toISOString()).order('deleted_at',{ascending:false})]);if(r.error)throw r.error;if(c.error)throw c.error;
  const catalog=c.data||[],cm=new Map(catalog.map(x=>[x.code,x]));
  const panel=document.createElement('div');panel.className='gmc-panel';panel.dataset.gmcAggregate='1';
  const rows=(r.data||[]).map(x=>`<div class="gmc-row"><div><b>${esc(x.indicator_code)} · ${esc(cm.get(x.indicator_code)?.label||'Indicador')}</b><span>${Number(x.quantity||0).toLocaleString('pt-BR')} · ${new Date(x.record_date+'T12:00:00').toLocaleDateString('pt-BR')}</span><small>${esc(x.description||'Sem descrição')}${x.evidence_ref?' · Evidência: '+esc(x.evidence_ref):''}</small></div><div class="gmc-actions"><button class="btn" data-gmc-edit-aggregate="${x.id}">Editar</button><button class="btn gmc-danger" data-gmc-delete-aggregate="${x.id}">Excluir</button></div></div>`).join('')||'<div class="empty">Nenhum lançamento agregado neste mês.</div>';
  const trash=(t.error?[]:t.data||[]).filter(x=>String(x.payload?.record_date||'').slice(0,7)===month()).map(x=>`<div class="gmc-row gmc-trash"><div><b>${esc(x.payload?.indicator_code||'Lançamento')}</b><span>${Number(x.payload?.quantity||0).toLocaleString('pt-BR')}</span><small>Excluído em ${new Date(x.deleted_at).toLocaleString('pt-BR')} · disponível por 24h</small></div><div class="gmc-actions"><button class="btn secondary" data-gmc-restore-aggregate="${x.id}">Restaurar</button></div></div>`).join('');
  panel.innerHTML=`<div class="page-head" style="margin-bottom:0"><div><h3>Lançamentos de ${month().split('-').reverse().join('/')}</h3><p>O formulário acima cria novos itens. A lista abaixo permite editar, excluir e restaurar.</p></div><span class="pill">${(r.data||[]).length} registro(s)</span></div><div class="gmc-list">${rows}${trash?`<div style="margin-top:7px"><b>Lixeira do mês</b></div>${trash}`:''}</div>`;content.appendChild(panel);
  const byId=new Map((r.data||[]).map(x=>[x.id,x]));panel.querySelectorAll('[data-gmc-edit-aggregate]').forEach(b=>b.onclick=()=>aggregateModal(byId.get(b.dataset.gmcEditAggregate),catalog));panel.querySelectorAll('[data-gmc-delete-aggregate]').forEach(b=>b.onclick=async()=>{if(!confirm('Excluir este lançamento? Ele poderá ser restaurado por 24 horas.'))return;const q=await client().rpc('soft_delete_aggregate_record',{p_id:b.dataset.gmcDeleteAggregate});if(q.error)return toast(q.error.message,'danger');toast('Lançamento enviado para a lixeira');schedule()});panel.querySelectorAll('[data-gmc-restore-aggregate]').forEach(b=>b.onclick=async()=>{const q=await client().rpc('restore_aggregate_record',{p_trash_id:b.dataset.gmcRestoreAggregate});if(q.error)return toast(q.error.message,'danger');toast('Lançamento restaurado');schedule()});
  const form=document.querySelector('#aggregate-form');if(form){const date=form.querySelector('[name=date]');if(date&&month()!==nowMonth())date.value=month()+'-01'}
}

async function technicalCrud(){
  if(topRoute()!=='equipe-tecnica'||!client())return;const root=document.querySelector('#technical-program-actions');if(!root)return;
  root.querySelectorAll('[data-tpa-edit]').forEach(edit=>{const card=edit.closest('.tpa-card');if(!card||card.querySelector('[data-gmc-delete-tech]'))return;const b=document.createElement('button');b.type='button';b.className='btn gmc-danger';b.dataset.gmcDeleteTech=edit.dataset.tpaEdit;b.textContent='Excluir';b.onclick=async()=>{if(!confirm('Excluir este planejamento? Somente planejamentos sem execução podem ser enviados para a lixeira de 24 horas.'))return;const q=await client().rpc('soft_delete_technical_action_plan',{p_id:b.dataset.gmcDeleteTech});if(q.error)return toast(q.error.message,'danger');toast('Planejamento enviado para a lixeira');location.reload()};edit.parentElement?.appendChild(b)});
  if(root.querySelector('[data-gmc-tech-trash]'))return;const q=await client().from('technical_action_plan_trash').select('id,plan_payload,deleted_at,expires_at,restored_at').is('restored_at',null).gte('expires_at',new Date().toISOString()).order('deleted_at',{ascending:false});if(q.error)return;
  const rows=(q.data||[]).filter(x=>String(x.plan_payload?.plan_month||'').slice(0,7)===month());if(!rows.length)return;const box=document.createElement('div');box.dataset.gmcTechTrash='1';box.className='gmc-tech-trash';box.innerHTML=`<b>Lixeira de planejamentos · ${rows.length}</b><div class="gmc-list">${rows.map(x=>`<div class="gmc-row gmc-trash"><div><b>${esc(x.plan_payload?.title||'Planejamento técnico')}</b><small>Excluído em ${new Date(x.deleted_at).toLocaleString('pt-BR')}</small></div><div class="gmc-actions"><button class="btn secondary" data-gmc-restore-tech="${x.id}">Restaurar</button></div></div>`).join('')}</div>`;root.appendChild(box);box.querySelectorAll('[data-gmc-restore-tech]').forEach(b=>b.onclick=async()=>{const r=await client().rpc('restore_technical_action_plan',{p_trash_id:b.dataset.gmcRestoreTech});if(r.error)return toast(r.error.message,'danger');toast('Planejamento restaurado');location.reload()})
}

async function teamMonth(){
  if(topRoute()!=='equipe'||!client())return;const table=document.querySelector('.content table.table');if(!table||table.dataset.gmcTeamMonth===month())return;const {start,end}=monthRange();const q=await client().from('staff_contribution_events').select('user_id,event_type,quantity').gte('event_date',start).lt('event_date',end);if(q.error)return;const sums=new Map();for(const x of q.data||[]){const m=sums.get(x.user_id)||new Map();m.set(x.event_type,(m.get(x.event_type)||0)+Number(x.quantity||0));sums.set(x.user_id,m)}
  const labels={atendimento:'atend.',acompanhamento:'acomp.',formulario:'form.',aula:'h aula',presenca:'pres.',inscricao_oficina:'inscr.',beneficio:'benef.',encaminhamento:'encam.',parceria:'parc.',lancamento_agregado:'agreg.'};
  table.querySelectorAll('tbody tr').forEach(tr=>{const id=tr.querySelector('[data-team-name],[data-team-role],[data-team-active]')?.dataset.teamName||tr.querySelector('[data-team-role]')?.dataset.teamRole||tr.querySelector('[data-team-active]')?.dataset.teamActive;if(!id)return;const m=sums.get(id)||new Map(),bits=[];for(const [k,l] of Object.entries(labels)){const v=m.get(k)||0;if(v)bits.push(`${v} ${l}`)}const td=tr.children[3];if(td)td.innerHTML=`<small>${esc(bits.length?bits.join(' · '):'Sem registros no mês')}</small>`});table.dataset.gmcTeamMonth=month();const p=document.querySelector('.content .page-head p');if(p)p.textContent=`Gestão de acessos e rastreabilidade do que cada equipe alimentou no mês ${month().split('-').reverse().join('/')}.`;
}

async function apply(){
  if(!profile||profile.active===false)return;style();toolbar();preserveNavigation();
  await Promise.allSettled([enhanceSubmissionEdit(),formsPanel(),aggregatePanel(),technicalCrud(),teamMonth()]);
}
function schedule(){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;document.querySelectorAll('[data-gmc-forms],[data-gmc-aggregate]').forEach(x=>x.remove());apply().catch(err=>console.warn('Padronização mensal/CRUD:',err))},80)}

function clickPreserver(e){const el=e.target.closest?.('[data-nav]');if(el?.dataset.nav)el.dataset.nav=preserveMonthTarget(el.dataset.nav)}
document.addEventListener('click',clickPreserver,true);
window.addEventListener('hashchange',schedule);
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});

resolveProfile().then(schedule).catch(err=>console.warn('Não foi possível iniciar o CRUD mensal global:',err));
