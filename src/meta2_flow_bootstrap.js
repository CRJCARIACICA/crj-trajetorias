// Complementos da Meta 2. Carrega somente nas rotas em que são necessários.
const loaded=new Set();
const route=()=>String(location.hash||'').split('?')[0].replace(/^#/,'');
async function load(name){
  if(loaded.has(name))return;
  loaded.add(name);
  try{await import(`./${name}.js?v=20261019-meta2-flow1`)}catch(err){loaded.delete(name);console.warn(`CRJ Meta 2: falha ao carregar ${name}`,err)}
}
function sync(){
  const r=route();
  if(r==='controlador-acesso')load('access_booking_youth');
  if(r==='equipe-tecnica')load('technical_support_requests');
  else if(document.body.dataset.twTab==='support')delete document.body.dataset.twTab;
}
document.addEventListener('click',event=>{
  const tab=event.target?.closest?.('.tw-tab');
  if(tab&&!tab.matches('[data-tsr-tab]')&&document.body.dataset.twTab==='support')delete document.body.dataset.twTab;
},true);
window.addEventListener('hashchange',sync);
window.addEventListener('focus',sync);
queueMicrotask(sync);
