import { apiMode, supabaseClient } from './api.js?v=20261004-2';

const PENDING_TEXT='Oficineiro ainda não preencheu esse campo.';
const RATE=71.67;
let profile=null,observer=null,realtime=null,lastRefresh=0;

const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const client=()=>{if(apiMode()!=='live')throw new Error('Banco ainda não conectado.');return supabaseClient()};
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

function injectStyle(){
  if(document.querySelector('#workshop-collaboration-style'))return;
  const s=document.createElement('style');s.id='workshop-collaboration-style';s.textContent=`
    .wc-readonly{background:#f6f8f7!important;border-color:#d9e3df!important;color:#31433d!important;cursor:not-allowed}
    .wc-owner-note{display:block;margin-top:6px;color:#5f706a;font-size:12px}.wc-owner-note b{color:#0b5b4c}
    .wc-owner-pill{display:inline-flex;align-items:center;margin-left:7px;padding:2px 7px;border-radius:999px;background:#e8f5f0;color:#0b5b4c;font-size:10px;font-weight:800;vertical-align:middle}
    .wc-pending-cell{font-style:italic;color:#7d5b18;background:#fff9e8!important}
    .wc-plan-notice{margin-bottom:12px}
    .wc-help-wrap{display:inline-flex;position:relative;align-items:center;margin-left:6px;vertical-align:middle}
    .wc-help{width:19px;height:19px;border:0;border-radius:50%;background:#e6f3ee;color:#0b5b4c;font-size:12px;font-weight:900;line-height:19px;text-align:center;cursor:pointer;padding:0}
    .wc-help:hover,.wc-help:focus,.wc-help.active{background:#0b5b4c;color:#fff;outline:none}
    .wc-tooltip{display:none;position:absolute;z-index:2147483200;left:24px;top:-8px;width:min(360px,72vw);padding:11px 12px;border-radius:12px;background:#173f36;color:#fff;box-shadow:0 14px 38px rgba(0,0,0,.22);font-size:12px;line-height:1.45;font-weight:500}
    .wc-tooltip b{display:block;margin-bottom:5px;color:#fff}.wc-tooltip em{display:block;margin-top:7px;color:#d5eee4;font-style:normal}
    .wc-help-wrap:hover .wc-tooltip,.wc-help:focus+.wc-tooltip,.wc-help.active+.wc-tooltip{display:block}
    .wc-invoice-rule{margin-top:12px}.wc-invoice-rule .wc-help-wrap{margin-left:4px}
  `;document.head.appendChild(s);
}

async function resolveProfile(){
  if(apiMode()!=='live')return null;
  const c=client(),{data:{user}}=await c.auth.getUser();if(!user)return null;
  const {data,error}=await c.from('profiles').select('id,display_name,role,team,active').eq('id',user.id).maybeSingle();
  if(error)throw error;return data;
}

function helpMarkup(title,text,example){
  return `<span class="wc-help-wrap"><button class="wc-help" type="button" aria-label="Como preencher ${esc(title)}">?</button><span class="wc-tooltip"><b>${esc(title)}</b>${esc(text)}<em><strong>Exemplo:</strong> ${esc(example)}</em></span></span>`;
}

const HELP={
  objective:{title:'Como preencher o Objetivo',text:'Descreva o que a aula pretende desenvolver ou alcançar com os jovens. Prefira um resultado claro e relacionado ao conteúdo da aula.',example:'Desenvolver noções básicas de esquiva e defesa, estimulando disciplina, atenção e autocontrole.'},
  proposed_activities:{title:'Como preencher as Atividades propostas',text:'Descreva a sequência prática da aula, indicando o que será realizado do início ao encerramento.',example:'Aquecimento; demonstração da técnica; exercícios em dupla; prática orientada; roda final para avaliação da aula.'},
  resources:{title:'Como preencher os Recursos necessários',text:'Liste materiais, equipamentos, espaço ou apoio necessário para realizar a aula como planejada.',example:'Tatames, cones, coletes, caixa de som e garrafas de água.'}
};

function enhanceInstructorHelp(){
  if(!location.hash.startsWith('#oficineiro'))return;
  document.querySelectorAll('[data-ip-lesson-form]').forEach(form=>{
    for(const [name,cfg] of Object.entries(HELP)){
      const field=form.querySelector(`[name="${name}"]`);if(!field)continue;
      const label=field.closest('.field')?.querySelector('label');if(!label||label.querySelector('.wc-help-wrap'))continue;
      label.insertAdjacentHTML('beforeend',helpMarkup(cfg.title,cfg.text,cfg.example));
    }
  });
  document.querySelectorAll('.wc-help').forEach(btn=>{if(btn.dataset.wcBound)return;btn.dataset.wcBound='1';btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();const on=btn.classList.toggle('active');document.querySelectorAll('.wc-help.active').forEach(x=>{if(x!==btn)x.classList.remove('active')});if(!on)btn.blur()})});
  document.addEventListener('click',e=>{if(!e.target.closest('.wc-help-wrap'))document.querySelectorAll('.wc-help.active').forEach(x=>x.classList.remove('active'))},{once:true});
  const invoiceCard=[...document.querySelectorAll('.ip-card')].find(card=>norm(card.querySelector('h3')?.textContent).includes('dados para nota fiscal'));
  if(invoiceCard&&!invoiceCard.querySelector('.wc-invoice-rule')){
    const title=invoiceCard.querySelector('h3');if(title)title.insertAdjacentHTML('beforeend',helpMarkup('Como o valor é calculado','O valor previsto acompanha automaticamente o planejamento mensal: R$ 71,67 por hora prevista, acrescido de 1 hora de planejamento na competência.','20h de aulas previstas + 1h de planejamento = 21h × R$ 71,67 = R$ 1.505,07.'));
    invoiceCard.insertAdjacentHTML('beforeend',`<div class="notice info wc-invoice-rule"><b>Remuneração prevista vinculada ao planejamento.</b><br>O valor é recalculado quando o planejamento mensal é criado ou alterado. Caso uma oficina prevista não aconteça, a carga correspondente poderá ser descontada no mês seguinte e/ou compensada em ações externas de mobilização articuladas pela Articulação, conforme validação da gestão.</div>`);
  }
}

function protectEducatorFields(){
  const form=document.querySelector('#workshop-plan-form');if(!form)return;
  if(!form.querySelector('.wc-plan-notice')){
    const editor=form.querySelector('.methodology-form-editor');
    editor?.insertAdjacentHTML('afterbegin',`<div class="notice info wc-plan-notice"><b>Planejamento construído em conjunto.</b><br><b>Objetivo, Atividades propostas e Recursos necessários</b> são preenchidos prioritariamente pelo oficineiro e entram automaticamente neste planejamento. O Educador acompanha esses campos sem precisar redigitá-los.</div>`);
  }
  form.querySelectorAll('[data-plan-lesson]').forEach(card=>{
    for(const name of ['objective','proposed_activities','resources']){
      const el=card.querySelector(`[name="${name}"]`);if(!el)continue;
      el.readOnly=true;el.classList.add('wc-readonly');el.setAttribute('aria-readonly','true');
      const label=el.closest('.field')?.querySelector('label');
      if(label&&!label.querySelector('.wc-owner-pill'))label.insertAdjacentHTML('beforeend','<span class="wc-owner-pill">Preenchimento do oficineiro</span>');
      const field=el.closest('.field');if(field&&!field.querySelector('.wc-owner-note'))field.insertAdjacentHTML('beforeend','<small class="wc-owner-note">Este conteúdo é sincronizado automaticamente com o acesso do oficineiro.</small>');
    }
  });
}

function patchPreviewPending(){
  document.querySelectorAll('.workshop-plan-table').forEach(table=>{
    const headers=[...table.querySelectorAll('thead th')].map(th=>norm(th.textContent));
    const indexes=['objetivo','atividades propostas','recursos necessarios'].map(name=>headers.findIndex(h=>h===norm(name))).filter(i=>i>=0);
    if(!indexes.length)return;
    table.querySelectorAll('tbody tr').forEach(row=>{
      const cells=[...row.children];
      for(const i of indexes){const cell=cells[i];if(!cell)continue;const txt=String(cell.textContent||'').replace(/\u00a0/g,' ').trim();if(!txt||txt==='—'){cell.textContent=PENDING_TEXT;cell.classList.add('wc-pending-cell')}else if(txt!==PENDING_TEXT){cell.classList.remove('wc-pending-cell')}}
    });
  });
}

function collectEducatorSafePayload(form){
  const header={};
  for(const k of ['general_objective','general_methodology','expected_results','general_resources','observations','status'])header[k]=form.querySelector(`[name="${k}"]`)?.value||'';
  const lessons=[...form.querySelectorAll('[data-plan-lesson]')].map(card=>({
    id:card.dataset.planLesson,
    theme:card.querySelector('[name="theme"]')?.value||'',
    cfdh_transversal:card.querySelector('[name="cfdh_transversal"]')?.value||'',
    observations:card.querySelector('[name="observations"]')?.value||''
  }));
  return {header,lessons};
}

function miniToast(message,type='success'){
  const el=document.createElement('div');el.className='ip-toast '+(type==='danger'?'danger':'');el.textContent=message;document.body.appendChild(el);setTimeout(()=>el.remove(),3600);
}

async function saveEducatorCollaborative(form){
  const planId=form.dataset.planId;if(!planId)throw new Error('Planejamento sem identificador.');
  const {header,lessons}=collectEducatorSafePayload(form);
  const {data,error}=await client().rpc('workshop_educator_save_plan_collaborative',{p_plan_id:planId,p_header:header,p_lessons:lessons});
  if(error)throw error;return data;
}

function bindSafeEducatorSubmit(){
  const form=document.querySelector('#workshop-plan-form');if(!form||form.dataset.wcSafeSubmit==='1')return;
  form.dataset.wcSafeSubmit='1';
  form.addEventListener('submit',async e=>{
    if(!['educador','coordenacao_geral'].includes(profile?.role||''))return;
    e.preventDefault();e.stopImmediatePropagation();
    const btn=form.querySelector('button[type="submit"],button.btn.primary:not([type])'),label=btn?.textContent||'Salvar planejamento';
    if(btn){btn.disabled=true;btn.textContent='Salvando...'}
    try{await saveEducatorCollaborative(form);miniToast('Planejamento salvo. Campos do oficineiro foram preservados.');window.dispatchEvent(new HashChangeEvent('hashchange'))}
    catch(err){miniToast(err.message||String(err),'danger');if(btn){btn.disabled=false;btn.textContent=label}}
  },true);
}

function refreshInstructorDashboard(){
  if(!location.hash.startsWith('#oficineiro')||new URLSearchParams(location.hash.split('?')[1]||'').get('view')==='planejamento')return;
  const now=Date.now();if(now-lastRefresh<1200)return;lastRefresh=now;
  const host=document.querySelector('.content');if(host)delete host.dataset.instructorPortalKey;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

function setupRealtime(){
  if(profile?.role!=='oficineiro'||realtime||apiMode()!=='live')return;
  try{
    realtime=client().channel('workshop-collaboration-'+profile.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'workshop_monthly_plans',filter:`instructor_user_id=eq.${profile.id}`},()=>refreshInstructorDashboard())
      .subscribe();
  }catch(err){console.warn('Atualização automática da remuneração indisponível:',err)}
}

function enhance(){
  injectStyle();protectEducatorFields();patchPreviewPending();enhanceInstructorHelp();bindSafeEducatorSubmit();setupRealtime();
}

async function boot(){
  injectStyle();
  try{profile=await resolveProfile()}catch(err){console.warn('Não foi possível identificar o perfil para colaboração de oficinas:',err)}
  observer=new MutationObserver(()=>enhance());observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>setTimeout(enhance,60));window.addEventListener('focus',()=>setTimeout(enhance,60));
  setInterval(()=>{enhance();if(profile?.role==='oficineiro'&&location.hash.startsWith('#oficineiro')&&!new URLSearchParams(location.hash.split('?')[1]||'').get('view'))refreshInstructorDashboard()},60000);
  enhance();
}

boot();
