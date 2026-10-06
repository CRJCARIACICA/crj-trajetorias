const originalFetch=window.fetch.bind(window);

function parseBody(body){
  if(!body)return null;
  if(typeof body==='string'){
    try{return JSON.parse(body)}catch{return null}
  }
  return null;
}

window.fetch=async function(input,init={}){
  const url=typeof input==='string'?input:(input instanceof Request?input.url:String(input||''));
  const isLegacy=url.includes('/functions/v1/crj-export-document');
  const payload=parseBody(init?.body);
  if(isLegacy&&payload?.plan_lesson_id){
    const target=url.replace('/functions/v1/crj-export-document','/functions/v1/crj-export-workshop-attendance');
    return originalFetch(target,init);
  }
  return originalFetch(input,init);
};
