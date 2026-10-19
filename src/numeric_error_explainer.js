const INSTALL_FLAG=Symbol.for('crj.numericErrorExplainer');
const ERROR_RE=/invalid input syntax for type (?:smallint|integer|bigint):\s*["']{2}/i;
const STYLE_ID='crj-numeric-error-explainer-style';
const MARK_ATTR='data-crj-numeric-error';

const FIELD_NAMES={
  household_size:'Quantidade de pessoas no domicílio',
  age:'Idade',
  year:'Ano',
  month:'Mês',
  day:'Dia',
  quantity:'Quantidade',
  count:'Quantidade',
  capacity:'Capacidade',
  duration:'Duração',
  hours:'Horas',
  minutes:'Minutos',
  workshop_id:'Oficina',
  lesson_id:'Aula',
  class_id:'Aula',
  enrollment_id:'Inscrição',
  youth_id:'Jovem',
  instructor_id:'Oficineiro',
  educator_id:'Educador',
  participant_id:'Participante',
  attendance_id:'Registro de presença',
  position:'Posição',
  order:'Ordem'
};

function injectStyle(){
  if(document.getElementById(STYLE_ID))return;
  const style=document.createElement('style');
  style.id=STYLE_ID;
  style.textContent=`
    [${MARK_ATTR}="1"]{outline:2px solid #b42318!important;outline-offset:2px!important;border-color:#b42318!important}
    .crj-numeric-error-note{display:block;margin-top:6px;color:#b42318;font-size:12px;font-weight:700;line-height:1.35}
    .crj-numeric-error-toast{position:fixed;z-index:2147483647;top:18px;left:50%;transform:translateX(-50%);width:min(680px,calc(100vw - 32px));background:#fff4f2;color:#7a271a;border:1px solid #f6b8ae;border-radius:12px;padding:14px 16px;box-shadow:0 12px 34px rgba(23,32,30,.18);font:600 14px/1.45 Inter,system-ui,sans-serif}
    .crj-numeric-error-toast b{display:block;margin-bottom:3px}
  `;
  document.head.appendChild(style);
}

function humanize(value=''){
  return String(value||'')
    .replace(/^p_/,'')
    .replace(/\[(\d+)\]/g,' $1')
    .replace(/[._-]+/g,' ')
    .replace(/\b\w/g,char=>char.toUpperCase())
    .trim();
}

function keyVariants(path=''){
  const leaf=String(path).split('.').pop()?.replace(/\[\d+\]/g,'')||'';
  const clean=leaf.replace(/^p_/,'');
  return [...new Set([leaf,clean])].filter(Boolean);
}

function cssEscape(value){
  if(globalThis.CSS?.escape)return CSS.escape(value);
  return String(value).replace(/["\\]/g,'\\$&');
}

function findControl(path){
  for(const key of keyVariants(path)){
    const escaped=cssEscape(key);
    const byName=document.querySelector(`[name="${escaped}"]`);
    if(byName)return byName;
    const byId=document.getElementById(key);
    if(byId)return byId;
    const byData=document.querySelector(`[data-field="${escaped}"],[data-name="${escaped}"]`);
    if(byData)return byData;
  }
  return null;
}

function labelForControl(control){
  if(!control)return '';
  const explicit=control.id?document.querySelector(`label[for="${cssEscape(control.id)}"]`):null;
  const nearby=control.closest?.('.field,.form-group,.input-group,.stack')?.querySelector?.('label');
  const wrapping=control.closest?.('label');
  return String(
    explicit?.textContent||nearby?.textContent||wrapping?.textContent||
    control.getAttribute?.('aria-label')||control.getAttribute?.('data-label')||
    control.getAttribute?.('placeholder')||control.getAttribute?.('title')||''
  ).replace(/\s+/g,' ').trim();
}

function friendlyName(path){
  for(const key of keyVariants(path)){
    if(FIELD_NAMES[key])return FIELD_NAMES[key];
  }
  const control=findControl(path);
  const label=labelForControl(control);
  if(label)return label.replace(/\s*\*\s*$/,'').trim();
  const key=keyVariants(path).pop()||path;
  return humanize(key)||'Campo numérico';
}

function flattenEmptyStrings(value,path='',out=[]){
  if(value===''){
    out.push(path||'campo');
    return out;
  }
  if(Array.isArray(value)){
    value.forEach((item,index)=>flattenEmptyStrings(item,`${path}[${index}]`,out));
    return out;
  }
  if(value&&typeof value==='object'){
    Object.entries(value).forEach(([key,item])=>flattenEmptyStrings(item,path?`${path}.${key}`:key,out));
  }
  return out;
}

function likelyNumeric(path){
  const key=keyVariants(path).pop()||'';
  const control=findControl(path);
  if(control?.matches?.('input[type="number"],input[inputmode="numeric"]'))return true;
  return /(?:^|_)(?:id|age|year|month|day|number|quantity|qty|count|total|hours?|minutes?|duration|capacity|order|position|level|score|size|week|lesson|class|people|participants?|attendees?)$/i.test(key)||/_id$/i.test(key);
}

function candidatesFromPayload(payload){
  const all=[...new Set(flattenEmptyStrings(payload))];
  const likely=all.filter(likelyNumeric);
  return likely.length?likely:all;
}

function candidatesFromDom(){
  const currentForms=[...document.querySelectorAll('form')].filter(form=>{
    const rect=form.getBoundingClientRect?.();
    return !rect||rect.width>0||rect.height>0;
  });
  const root=currentForms.at(-1)||document;
  const controls=[...root.querySelectorAll('input[type="number"],input[inputmode="numeric"],select')];
  return controls
    .filter(control=>String(control.value??'').trim()==='')
    .map(control=>control.name||control.id||control.dataset?.field||'')
    .filter(Boolean);
}

function clearMarks(){
  document.querySelectorAll(`[${MARK_ATTR}="1"]`).forEach(control=>{
    control.removeAttribute(MARK_ATTR);
    control.removeAttribute('aria-invalid');
  });
  document.querySelectorAll('.crj-numeric-error-note').forEach(note=>note.remove());
}

function markField(path,message){
  const control=findControl(path);
  if(!control)return false;
  control.setAttribute(MARK_ATTR,'1');
  control.setAttribute('aria-invalid','true');
  const note=document.createElement('small');
  note.className='crj-numeric-error-note';
  note.textContent=message;
  const wrap=control.closest?.('.field,.form-group,.input-group')||control.parentElement;
  wrap?.appendChild(note);
  return true;
}

function showToast(message){
  injectStyle();
  document.querySelector('.crj-numeric-error-toast')?.remove();
  const toast=document.createElement('div');
  toast.className='crj-numeric-error-toast';
  toast.setAttribute('role','alert');
  toast.setAttribute('aria-live','assertive');
  toast.innerHTML=`<b>Campo numérico sem valor</b><span></span>`;
  toast.querySelector('span').textContent=message;
  document.body.appendChild(toast);
  setTimeout(()=>toast.remove(),9000);
}

function explain(paths=[]){
  const unique=[...new Set(paths.filter(Boolean))];
  const names=[...new Set(unique.map(friendlyName))];
  const message=names.length===1
    ? `Preencha o campo “${names[0]}” antes de continuar.`
    : names.length>1
      ? `Preencha os campos numéricos sem valor: ${names.map(name=>`“${name}”`).join(', ')}.`
      : 'Existe um campo numérico sem valor. Revise os campos numéricos obrigatórios antes de continuar.';

  clearMarks();
  let first=null;
  unique.forEach(path=>{
    const control=findControl(path);
    if(control&&!first)first=control;
    markField(path,`Campo sem valor: ${friendlyName(path)}.`);
  });
  showToast(message);
  if(first){
    setTimeout(()=>{
      try{first.scrollIntoView({behavior:'smooth',block:'center'});first.focus({preventScroll:true})}catch{}
    },0);
  }
  document.dispatchEvent(new CustomEvent('crj:numeric-field-error',{detail:{fields:unique,names,message}}));
  return message;
}

function parseJsonBody(body){
  if(typeof body!=='string'||!body.trim())return null;
  try{return JSON.parse(body)}catch{return null}
}

function requestBody(input,init){
  const body=init?.body;
  if(typeof body==='string')return parseJsonBody(body);
  return null;
}

async function rewriteIntegerError(response,payload){
  if(!response||response.ok)return response;
  const contentType=response.headers?.get?.('content-type')||'';
  if(!contentType.includes('json'))return response;
  let data;
  try{data=await response.clone().json()}catch{return response}
  const original=String(data?.message||data?.error_description||data?.error||'');
  if(!ERROR_RE.test(original))return response;

  const fields=candidatesFromPayload(payload);
  const fallback=fields.length?fields:candidatesFromDom();
  const message=explain(fallback);
  const next={...data,message,details:`${data?.details?`${data.details} · `:''}Erro original: ${original}`};
  const headers=new Headers(response.headers);
  headers.set('content-type','application/json; charset=utf-8');
  return new Response(JSON.stringify(next),{
    status:response.status,
    statusText:response.statusText,
    headers
  });
}

function install(){
  if(globalThis[INSTALL_FLAG]||typeof globalThis.fetch!=='function')return;
  const originalFetch=globalThis.fetch.bind(globalThis);
  globalThis.fetch=async function(input,init){
    const payload=requestBody(input,init);
    const response=await originalFetch(input,init);
    return rewriteIntegerError(response,payload);
  };
  Object.defineProperty(globalThis,INSTALL_FLAG,{value:true,configurable:false});
}

window.addEventListener('unhandledrejection',event=>{
  const message=String(event.reason?.message||event.reason||'');
  if(!ERROR_RE.test(message))return;
  explain(candidatesFromDom());
});

window.addEventListener('error',event=>{
  const message=String(event.error?.message||event.message||'');
  if(!ERROR_RE.test(message))return;
  explain(candidatesFromDom());
});

document.addEventListener('input',event=>{
  const control=event.target?.closest?.(`[${MARK_ATTR}="1"]`);
  if(!control||String(control.value??'').trim()==='')return;
  control.removeAttribute(MARK_ATTR);
  control.removeAttribute('aria-invalid');
  control.closest?.('.field,.form-group,.input-group')?.querySelector?.('.crj-numeric-error-note')?.remove();
},true);

install();
window.__crjNumericErrorExplainer={explain,candidatesFromDom,candidatesFromPayload};
