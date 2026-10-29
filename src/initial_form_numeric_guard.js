import { apiMode, supabaseClient } from './api.js?v=20261014-2';

const INSTALL_FLAG=Symbol.for('crj.initialFormNumericGuard');
const FETCH_FLAG=Symbol.for('crj.initialFormNumericFetchGuard');
const HOUSEHOLD_FIELD='household_size';

function normalizeHouseholdSize(value){
  if(value===undefined)return undefined;
  if(value===null)return null;
  if(typeof value==='string'&&value.trim()==='')return null;
  const number=Number(value);
  if(!Number.isFinite(number)||!Number.isInteger(number)||number<0){
    throw new Error('Quantidade de pessoas no domicílio deve ser informada com um número inteiro igual ou maior que zero.');
  }
  return number;
}

function normalizeInitialFormObject(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return value;
  if(!Object.prototype.hasOwnProperty.call(value,HOUSEHOLD_FIELD))return value;
  return {...value,[HOUSEHOLD_FIELD]:normalizeHouseholdSize(value[HOUSEHOLD_FIELD])};
}

function normalizeRows(value){
  return Array.isArray(value)?value.map(normalizeInitialFormObject):normalizeInitialFormObject(value);
}

function normalizeRestBody(url,body){
  if(typeof body!=='string'||!body.trim())return body;
  const target=String(url||'');
  const isYouth=/\/rest\/v1\/young_people(?:\?|$)/.test(target);
  const isInitialRpc=/\/rest\/v1\/rpc\/save_initial_form_document(?:\?|$)/.test(target);
  if(!isYouth&&!isInitialRpc)return body;
  try{
    const parsed=JSON.parse(body);
    const normalized=isYouth
      ? normalizeRows(parsed)
      : {...parsed,p_payload:normalizeInitialFormObject(parsed?.p_payload)};
    return JSON.stringify(normalized);
  }catch(error){
    if(error instanceof SyntaxError)return body;
    throw error;
  }
}

function installFetchGuard(){
  if(globalThis[FETCH_FLAG]||typeof globalThis.fetch!=='function')return;
  const originalFetch=globalThis.fetch.bind(globalThis);
  globalThis.fetch=function(input,init){
    const url=typeof input==='string'?input:input?.url||'';
    const method=String(init?.method||input?.method||'GET').toUpperCase();
    if(['POST','PATCH','PUT'].includes(method)&&init&&typeof init.body==='string'){
      const body=normalizeRestBody(url,init.body);
      if(body!==init.body)init={...init,body};
    }
    return originalFetch(input,init);
  };
  Object.defineProperty(globalThis,FETCH_FLAG,{value:true,configurable:false});
}

function installGuard(client){
  if(!client||client[INSTALL_FLAG])return;
  const originalFrom=client.from.bind(client);
  client.from=function(table){
    const builder=originalFrom(table);
    if(table!=='young_people')return builder;
    for(const method of ['insert','update','upsert']){
      if(typeof builder[method]!=='function')continue;
      const original=builder[method].bind(builder);
      builder[method]=function(values,options){return original(normalizeRows(values),options);};
    }
    return builder;
  };
  const originalRpc=client.rpc.bind(client);
  client.rpc=function(fn,args={},options){
    if(fn==='save_initial_form_document'&&args?.p_payload&&typeof args.p_payload==='object')args={...args,p_payload:normalizeInitialFormObject(args.p_payload)};
    return originalRpc(fn,args,options);
  };
  Object.defineProperty(client,INSTALL_FLAG,{value:true,configurable:false});
}

function validateInitialFormInput(){
  const input=document.querySelector('form [name="household_size"]');
  if(!input)return;input.min='0';input.step='1';
  const raw=String(input.value??'').trim();
  if(raw===''){input.setCustomValidity('');return}
  const number=Number(raw);
  input.setCustomValidity(Number.isInteger(number)&&number>=0?'':'Informe a quantidade de pessoas com um número inteiro igual ou maior que zero.');
}

document.addEventListener('input',event=>{if(event.target?.matches?.('[name="household_size"]'))validateInitialFormInput();},true);
document.addEventListener('submit',event=>{
  const input=event.target?.querySelector?.('[name="household_size"]');if(!input)return;
  validateInitialFormInput();
  if(!input.checkValidity()){event.preventDefault();event.stopImmediatePropagation();input.reportValidity();}
},true);

async function boot(){
  installFetchGuard();
  for(let i=0;i<200&&apiMode()!=='live';i++)await new Promise(resolve=>setTimeout(resolve,25));
  if(apiMode()!=='live')return;
  installGuard(supabaseClient());
}

installFetchGuard();
boot().catch(error=>console.error('Falha ao ativar normalização do Formulário Inicial:',error));

// Classificações e fluxos da Meta 4.3 precisam acompanhar formulários abertos em qualquer área.
// O carregamento é assíncrono para não bloquear o bootstrap principal.
import('./meta4_3_ui.js?v=20261029-cfdhclass1').catch(error=>console.warn('Meta 4.3 UI indisponível:',error));
