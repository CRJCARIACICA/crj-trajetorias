import { apiMode, supabaseClient } from './api.js?v=20261016-hours1';

const FIELDS=['objective','proposed_activities','resources'];
const BUTTON_LABEL='Buscar planejamento do oficineiro';
const formStates=new WeakMap();
let timer=null;
let pendingForce=false;

function currentForm(){
  return document.querySelector('#workshop-plan-form');
}

function stateFor(form){
  if(!formStates.has(form))formStates.set(form,{busy:false,attempted:false,queuedRefresh:false,queuedManual:false});
  return formStates.get(form);
}

function planId(form){
  return String(form?.dataset?.planId||'').trim();
}

function toast(message,type='success'){
  const el=document.createElement('div');
  el.className='ip-toast '+(type==='danger'?'danger':'');
  el.textContent=message;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),3600);
}

function ensureStyle(){
  if(document.querySelector('#educator-instructor-plan-sync-style'))return;
  const style=document.createElement('style');
  style.id='educator-instructor-plan-sync-style';
  style.textContent=[
    '.eips-actions{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin:0 0 16px;padding:16px;border:1px solid #afd0c4;border-radius:12px;background:#f0f8f4}',
    '.eips-actions .btn{white-space:normal;text-align:center;flex:0 1 auto}',
    '.eips-copy{flex:1 1 280px}.eips-copy strong{display:block;margin-bottom:4px;color:#174e3b}',
    '.eips-copy p{margin:0 0 7px;font-size:13px;line-height:1.5;color:#425c51}',
    '.eips-status{display:block;font-size:12px;color:#61716b;line-height:1.4}',
    '.eips-status.success{color:#17603f}.eips-status.danger{color:#8a2c25}.eips-status.warn{color:#7d5b18}',
    '@media(max-width:600px){.eips-actions .btn{width:100%}}'
  ].join('\n');
  document.head.appendChild(style);
}

function ensureControls(form=currentForm()){
  if(!form)return null;
  ensureStyle();
  let box=form.querySelector('[data-eips-actions]');
  if(box)return box;
  box=document.createElement('section');
  box.className='eips-actions';
  box.dataset.eipsActions='1';
  box.setAttribute('aria-label','Planejamento do oficineiro');
  box.innerHTML='<div class="eips-copy"><strong>Planejamento do oficineiro</strong><p>Busque os blocos salvos pelo oficineiro para atualizar Objetivo, Atividades propostas e Recursos necessários de cada aula deste planejamento.</p><span class="eips-status" data-eips-status role="status" aria-live="polite">Os dados serão buscados no planejamento salvo desta oficina e deste mês.</span></div><button class="btn primary" type="button" data-eips-refresh>'+BUTTON_LABEL+'</button>';
  // Antes das colunas do editor e da prévia: ação principal visível em todos os acessos.
  form.prepend(box);
  const button=box.querySelector('[data-eips-refresh]');
  button.disabled=!planId(form);
  if(button.disabled)box.querySelector('[data-eips-status]').textContent='Abra um planejamento mensal salvo para buscar os blocos do oficineiro.';
  button.addEventListener('click',()=>syncInstructorFields({form,manual:true,force:true}));
  return box;
}

function setStatus(form,message,type=''){
  const el=ensureControls(form)?.querySelector('[data-eips-status]');
  if(!el)return;
  if(el.textContent!==message)el.textContent=message;
  el.className='eips-status'+(type?' '+type:'');
}

function applySavedLessons(form,rows,id){
  // IDs oficiais vinculam cada bloco à sua aula; nunca aproximamos por posição ou texto.
  const saved=new Map((rows||[])
    .filter(row=>row?.id&&row.plan_id===id&&row.included!==false)
    .map(row=>[String(row.id),row]));
  let matched=0,changed=0,filled=0,completed=0,unmatched=0;
  for(const card of form.querySelectorAll('[data-plan-lesson]')){
    const row=saved.get(String(card.dataset.planLesson));
    if(!row){unmatched++;continue}
    let lessonFilled=0;
    for(const name of FIELDS){
      const field=card.querySelector('[name="'+name+'"]');
      if(!field)continue;
      const value=String(row[name]??'');
      if(value.trim()){filled++;lessonFilled++}
      if(field.value!==value){field.value=value;changed++}
      field.readOnly=true;
      field.setAttribute('aria-readonly','true');
      field.classList.add('wc-readonly');
      const note=field.closest('.field')?.querySelector('.wc-owner-note');
      const message=value.trim()?'Conteúdo salvo pelo oficineiro e consultado neste planejamento.':'O oficineiro ainda não salvou conteúdo neste campo.';
      if(note&&note.textContent!==message)note.textContent=message;
    }
    matched++;
    if(lessonFilled===FIELDS.length)completed++;
  }
  // A prévia lê o formulário inteiro. Atualiza uma vez após aplicar todos os blocos,
  // preservando objetivo geral, tema, CFDH e observações digitados pelo educador.
  if(changed){
    form.dispatchEvent(new Event('input',{bubbles:true}));
    form.dispatchEvent(new Event('change',{bubbles:true}));
  }
  return {matched,changed,filled,completed,unmatched,pending:Math.max(0,matched*FIELDS.length-filled)};
}

async function syncInstructorFields({form=currentForm(),manual=false,force=false}={}){
  if(!form||currentForm()!==form)return;
  const id=planId(form),state=stateFor(form);
  ensureControls(form);
  if(!id){setStatus(form,'Abra um planejamento mensal salvo para buscar os blocos do oficineiro.','warn');return}
  if(state.busy){
    state.queuedRefresh=state.queuedRefresh||force;
    state.queuedManual=state.queuedManual||manual;
    return;
  }
  if(state.attempted&&!force)return;
  state.attempted=true;
  if(apiMode()!=='live'){
    setStatus(form,'Banco ainda não conectado. Tente novamente em instantes.','danger');
    if(manual)toast('Banco ainda não conectado.','danger');
    return;
  }

  const hash=location.hash;
  const isCurrent=()=>form.isConnected&&currentForm()===form&&planId(form)===id&&location.hash===hash;
  const button=ensureControls(form).querySelector('[data-eips-refresh]');
  state.busy=true;
  button.disabled=true;
  button.textContent='Buscando planejamento...';
  button.setAttribute('aria-busy','true');
  setStatus(form,'Buscando os blocos salvos pelo oficineiro para este planejamento...');

  try{
    const {data,error}=await supabaseClient()
      .from('workshop_plan_lessons')
      .select('id,plan_id,lesson_number,scheduled_date,objective,proposed_activities,resources,updated_at,included')
      .eq('plan_id',id)
      .order('scheduled_date')
      .order('lesson_number');
    if(!isCurrent())return;
    if(error)throw error;
    if(!Array.isArray(data))throw new Error('Resposta de planejamento inválida.');

    const result=applySavedLessons(form,data,id);
    const {matched,changed,filled,completed,unmatched,pending}=result;
    if(!matched){
      const message=form.querySelector('[data-plan-lesson]')?
        'Nenhum bloco salvo corresponde às aulas exibidas. Confira o mês e sincronize o calendário do planejamento. Os campos atuais foram preservados.':
        'Este planejamento ainda não tem aulas. Sincronize com o calendário para criar os blocos.';
      setStatus(form,message,'warn');
      if(manual)toast(message,'danger');
      return;
    }

    const when=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date());
    const message='Consulta às '+when+': '+matched+' aula(s), '+completed+' bloco(s) completo(s), '+filled+' campo(s) preenchido(s). '+
      (pending?pending+' campo(s) ainda aguardam preenchimento do oficineiro. ':'')+
      (unmatched?unmatched+' aula(s) sem bloco correspondente; confira o calendário. ':'')+
      (changed?changed+' campo(s) atualizado(s).':'Os campos já estavam atualizados.');
    setStatus(form,message,unmatched||pending?'warn':'success');
    window.dispatchEvent(new CustomEvent('crj:instructor-plan-synced',{detail:{planId:id,...result}}));
    if(manual)toast(changed?'Planejamento atualizado com os blocos salvos pelo oficineiro.':'Consulta concluída. Os campos já estavam atualizados.');
  }catch(err){
    if(!isCurrent())return;
    console.warn('Falha ao buscar planejamento do oficineiro:',err);
    setStatus(form,'Não foi possível buscar os blocos salvos. Os campos atuais foram preservados. Clique em Buscar planejamento do oficineiro para tentar novamente.','danger');
    if(manual)toast('Não foi possível buscar o planejamento. Tente novamente.','danger');
  }finally{
    state.busy=false;
    button.disabled=!planId(form);
    button.textContent=BUTTON_LABEL;
    button.removeAttribute('aria-busy');
    const repeat=state.queuedRefresh||state.queuedManual,repeatManual=state.queuedManual;
    state.queuedRefresh=false;
    state.queuedManual=false;
    if(repeat&&isCurrent())void syncInstructorFields({form,manual:repeatManual,force:true});
  }
}

function schedule({force=false}={}){
  pendingForce=pendingForce||force;
  clearTimeout(timer);
  timer=setTimeout(()=>{
    const force=pendingForce;
    pendingForce=false;
    const form=currentForm();
    if(!form)return;
    ensureControls(form);
    if(planId(form)&&(!stateFor(form).attempted||force))void syncInstructorFields({form,force});
  },80);
}

new MutationObserver(()=>schedule()).observe(document.body,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>schedule({force:true}));
window.addEventListener('crj:route-rendered',()=>schedule());
window.addEventListener('crj:features-ready',()=>schedule());
window.addEventListener('focus',()=>schedule({force:true}));
window.addEventListener('crj:workshop-instructor-updated',()=>schedule({force:true}));
schedule();
