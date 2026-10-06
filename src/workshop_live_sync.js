import { apiMode, supabaseClient } from './api.js?v=20261004-2';

let channel=null;
let activePlanId='';
let timer=null;

const client=()=>{
  if(apiMode()!=='live')throw new Error('Banco ainda não conectado.');
  return supabaseClient();
};

function currentForm(){
  return document.querySelector('#workshop-plan-form');
}

function toast(message){
  const el=document.createElement('div');
  el.className='ip-toast';
  el.textContent=message;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),3200);
}

function applyInstructorUpdate(row){
  const form=currentForm();
  if(!form||!row||String(form.dataset.planId||'')!==String(row.plan_id||''))return;
  const card=form.querySelector(`[data-plan-lesson="${CSS.escape(String(row.id||''))}"]`);
  if(!card)return;

  const fields={
    objective:row.objective??'',
    proposed_activities:row.proposed_activities??'',
    resources:row.resources??''
  };

  let changed=false;
  for(const [name,value] of Object.entries(fields)){
    const el=card.querySelector(`[name="${name}"]`);
    if(!el)continue;
    if(el.value!==String(value)){
      el.value=String(value);
      changed=true;
    }
    el.readOnly=true;
    el.setAttribute('aria-readonly','true');
    el.classList.add('wc-readonly');
    const note=el.closest('.field')?.querySelector('.wc-owner-note');
    if(note)note.innerHTML='<b>Atualizado pelo oficineiro.</b> Conteúdo sincronizado automaticamente com o planejamento oficial.';
  }

  if(changed){
    const first=card.querySelector('[name="objective"]');
    first?.dispatchEvent(new Event('input',{bubbles:true}));
    toast('Planejamento atualizado automaticamente pelo oficineiro.');
  }
}

async function unsubscribe(){
  if(!channel)return;
  try{await client().removeChannel(channel)}catch{}
  channel=null;
  activePlanId='';
}

async function ensureSubscription(){
  if(apiMode()!=='live')return;
  const form=currentForm();
  const planId=String(form?.dataset.planId||'');

  if(!planId){
    if(channel)await unsubscribe();
    return;
  }
  if(channel&&activePlanId===planId)return;

  await unsubscribe();
  activePlanId=planId;
  channel=client()
    .channel(`workshop-plan-live-${planId}`)
    .on('postgres_changes',{
      event:'UPDATE',
      schema:'public',
      table:'workshop_plan_lessons',
      filter:`plan_id=eq.${planId}`
    },payload=>applyInstructorUpdate(payload.new))
    .subscribe(status=>{
      if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){
        console.warn('Sincronização ao vivo do planejamento indisponível:',status);
      }
    });
}

function schedule(){
  clearTimeout(timer);
  timer=setTimeout(()=>ensureSubscription().catch(err=>console.warn('Falha ao sincronizar planejamento:',err)),80);
}

const observer=new MutationObserver(schedule);
observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('hashchange',schedule);
window.addEventListener('focus',schedule);
window.addEventListener('beforeunload',()=>{if(channel)client().removeChannel(channel).catch(()=>{})});
schedule();
