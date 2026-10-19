import { apiMode, supabaseClient } from './api.js?v=20261004-2';

const FIELDS=['objective','proposed_activities','resources'];
let observer=null;
let busy=false;
let timer=null;
let lastPlanId='';
let lastSyncAt=0;

const client=()=>{
  if(apiMode()!=='live')throw new Error('Banco ainda não conectado.');
  return supabaseClient();
};

function currentForm(){
  return document.querySelector('#workshop-plan-form');
}

function planId(){
  return String(currentForm()?.dataset?.planId||'').trim();
}

function cssEscape(value){
  if(window.CSS?.escape)return CSS.escape(String(value));
  return String(value).replace(/(["\\])/g,'\\$1');
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
  const s=document.createElement('style');
  s.id='educator-instructor-plan-sync-style';
  s.textContent=`
    .eips-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin:0 0 12px;padding:11px 12px;border:1px solid #d9e6e1;border-radius:12px;background:#f8fbfa}
    .eips-actions .btn{white-space:normal;text-align:center}
    .eips-status{font-size:12px;color:#61716b;line-height:1.35;flex:1 1 260px}
    .eips-status.success{color:#17603f}.eips-status.danger{color:#8a2c25}
  `;
  document.head.appendChild(s);
}

function ensureControls(){
  const form=currentForm();
  if(!form)return null;
  ensureStyle();
  let box=form.querySelector('[data-eips-actions]');
  if(box)return box;
  box=document.createElement('div');
  box.className='eips-actions';
  box.dataset.eipsActions='1';
  box.innerHTML='<button class="btn secondary" type="button" data-eips-refresh>Consultar planejamento do oficineiro</button><span class="eips-status" data-eips-status>Os campos Objetivo, Atividade proposta e Recursos necessários são sincronizados com o bloco salvo pelo oficineiro.</span>';
  const editor=form.querySelector('.methodology-form-editor')||form;
  const notice=editor.querySelector('.wc-plan-notice');
  if(notice)notice.insertAdjacentElement('afterend',box);else editor.insertAdjacentElement('afterbegin',box);
  box.querySelector('[data-eips-refresh]')?.addEventListener('click',()=>syncInstructorFields({manual:true,force:true}));
  return box;
}

function setStatus(message,type=''){
  const box=ensureControls();
  const el=box?.querySelector('[data-eips-status]');
  if(!el)return;
  el.textContent=message;
  el.className='eips-status'+(type?' '+type:'');
}

function applyRow(row){
  const form=currentForm();
  if(!form||!row?.id)return {matched:false,changed:0,filled:0};
  const card=form.querySelector(`[data-plan-lesson="${cssEscape(row.id)}"]`);
  if(!card)return {matched:false,changed:0,filled:0};
  let changed=0,filled=0;
  for(const name of FIELDS){
    const field=card.querySelector(`[name="${name}"]`);
    if(!field)continue;
    const value=String(row[name]??'');
    if(value.trim())filled++;
    if(field.value!==value){
      field.value=value;
      changed++;
      field.dispatchEvent(new Event('input',{bubbles:true}));
      field.dispatchEvent(new Event('change',{bubbles:true}));
    }
    field.readOnly=true;
    field.setAttribute('aria-readonly','true');
    field.classList.add('wc-readonly');
    const note=field.closest('.field')?.querySelector('.wc-owner-note');
    if(note)note.innerHTML='<b>Conteúdo consultado no planejamento do oficineiro.</b> Este campo usa o bloco oficial salvo pelo oficineiro.';
  }
  return {matched:true,changed,filled};
}

async function syncInstructorFields({manual=false,force=false}={}){
  const form=currentForm();
  const id=planId();
  if(!form||!id)return;
  const now=Date.now();
  if(busy)return;
  if(!force&&id===lastPlanId&&now-lastSyncAt<30000)return;
  if(apiMode()!=='live'){
    if(manual){setStatus('Banco ainda não conectado. Tente novamente em instantes.','danger');toast('Banco ainda não conectado.','danger')}
    return;
  }

  busy=true;
  const button=ensureControls()?.querySelector('[data-eips-refresh]');
  const oldLabel=button?.textContent||'';
  if(button){button.disabled=true;button.textContent='Consultando...'}
  setStatus('Consultando os blocos salvos pelo oficineiro...');

  try{
    const {data,error}=await client()
      .from('workshop_plan_lessons')
      .select('id,plan_id,lesson_number,scheduled_date,objective,proposed_activities,resources,updated_at')
      .eq('plan_id',id)
      .order('scheduled_date')
      .order('lesson_number');
    if(error)throw error;

    let matched=0,changed=0,filled=0;
    for(const row of data||[]){
      const result=applyRow(row);
      if(result.matched)matched++;
      changed+=result.changed;
      filled+=result.filled;
    }

    lastPlanId=id;
    lastSyncAt=Date.now();
    const when=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date());
    if(!matched){
      setStatus('O planejamento do oficineiro foi consultado, mas nenhum bloco correspondeu às aulas exibidas neste formulário. Reabra o planejamento e consulte novamente.','danger');
      if(manual)toast('Consulta concluída, mas os blocos não corresponderam ao formulário.','danger');
      return;
    }

    const pending=Math.max(0,matched*FIELDS.length-filled);
    const message=`Consultado às ${when}: ${matched} aula(s), ${filled} campo(s) preenchido(s) pelo oficineiro${pending?` e ${pending} ainda pendente(s)`:''}.${changed?` ${changed} campo(s) do formulário foram atualizado(s).`:''}`;
    setStatus(message,'success');
    window.dispatchEvent(new CustomEvent('crj:instructor-plan-synced',{detail:{planId:id,matched,changed,filled,pending}}));
    if(manual)toast(changed?'Planejamento atualizado com os dados do oficineiro.':'Planejamento conferido. O formulário já estava atualizado.');
  }catch(err){
    console.warn('Falha ao consultar planejamento do oficineiro:',err);
    setStatus('Não foi possível consultar o planejamento do oficineiro. O formulário atual foi preservado; use este botão novamente para tentar sincronizar.','danger');
    if(manual)toast(err.message||String(err),'danger');
  }finally{
    busy=false;
    if(button){button.disabled=false;button.textContent=oldLabel||'Consultar planejamento do oficineiro'}
  }
}

function schedule({force=false}={}){
  clearTimeout(timer);
  timer=setTimeout(()=>{
    const form=currentForm();
    if(!form)return;
    ensureControls();
    const id=planId();
    if(id&&id!==lastPlanId)syncInstructorFields({force:true}).catch(()=>{});
    else if(force&&id)syncInstructorFields({force:true}).catch(()=>{});
  },80);
}

observer=new MutationObserver(()=>schedule());
observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('hashchange',()=>{lastPlanId='';lastSyncAt=0;schedule({force:true})});
window.addEventListener('focus',()=>schedule({force:true}));
window.addEventListener('crj:workshop-instructor-updated',()=>schedule({force:true}));
schedule({force:true});
