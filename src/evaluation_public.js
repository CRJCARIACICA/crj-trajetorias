import { CONFIG } from './config.js';
import { EVALUATION_SLUGS, escapeEvaluation as esc, evaluationTitle, evaluationFormHtml, evaluationValues } from './evaluation_shared.js';

const root=document.querySelector('#evaluation-public');
let token='';
try{token=decodeURIComponent(location.hash.slice(1))}catch{}
let clientPromise,context;
const tokenValid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token);
const keyName=`crj-evaluation-pending:${token}`;
function randomId(){
  if(crypto.randomUUID)return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function requestKey(){
  try {const saved=sessionStorage.getItem(keyName);if(saved)return saved;}catch{}
  const value=randomId();try{sessionStorage.setItem(keyName,value)}catch{}return value;
}
function clearKey(){try{sessionStorage.removeItem(keyName)}catch{}}
async function db(){
  if(!clientPromise)clientPromise=(async()=>{
    let mod;try{mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm')}
    catch{mod=await import('https://esm.sh/@supabase/supabase-js@2.117.2')}
    return mod.createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
  })();
  return clientPromise;
}
function month(value){const [y,m]=String(value||'').split('-');return m&&y?`${m}/${y}`:'—'}
function showForm(){
  const subject=context.form_slug===EVALUATION_SLUGS.workshop?`Oficina: ${context.workshop_name}`:'Circuito Formativo em Direitos Humanos';
  root.innerHTML=`<div class="ev-kicker">Sua avaliação</div><h1>${esc(evaluationTitle(context.form_slug))}</h1><p class="ev-intro">Conta para a equipe como foi sua experiência. Sua avaliação contribui para melhorar as atividades do CRJ.</p><div class="ev-context"><b>${esc(subject)}</b><br>Mês de referência: ${esc(month(context.reference_month))}</div><p class="ev-hint">Este formulário não pede seu nome. Evite informar dados pessoais nos comentários.</p>${evaluationFormHtml(context.form_slug,{workshopName:context.workshop_name})}`;
  const form=root.querySelector('[data-evaluation-form]');
  form.addEventListener('submit',async event=>{
    event.preventDefault();const button=form.querySelector('[type=submit]'),error=form.querySelector('[data-evaluation-error]');
    error.hidden=true;button.disabled=true;button.textContent='Enviando…';
    try{
      const api=await db(),result=await api.rpc('evaluation_public_submit',{p_token:token,p_response_key:requestKey(),p_payload:evaluationValues(form,context.form_slug)});
      if(result.error)throw result.error;clearKey();
      root.innerHTML='<div class="ev-done"><div class="ev-check">✓</div><h1>Avaliação enviada!</h1><p>Obrigado por compartilhar sua opinião com o CRJ Cariacica.</p><button class="btn secondary" type="button" data-evaluation-another>Outra pessoa quer responder</button></div>';
      root.querySelector('[data-evaluation-another]')?.addEventListener('click',showForm);
    }catch(err){error.textContent=err.message||'Não foi possível enviar. Confira sua conexão e tente novamente.';error.hidden=false;button.disabled=false;button.textContent='Enviar avaliação';}
  });
}
async function start(){
  if(!tokenValid){root.innerHTML='<div class="ev-error"><b>Link incompleto.</b><br>Peça à equipe do CRJ um novo link de avaliação.</div>';return}
  try{const api=await db(),result=await api.rpc('evaluation_public_context',{p_token:token});if(result.error)throw result.error;context=result.data;if(!context||![EVALUATION_SLUGS.workshop,EVALUATION_SLUGS.youth].includes(context.form_slug))throw new Error('Avaliação não encontrada.');showForm();}
  catch(err){root.innerHTML=`<div class="ev-error"><b>Não foi possível abrir esta avaliação.</b><br>${esc(err.message||'Verifique o link e tente novamente.')}</div>`;}
}
start();
