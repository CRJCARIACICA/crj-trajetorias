import { apiMode, supabaseClient } from './api.js?v=20261004-2';

let headerSrc='';
let observer=null;

function replaceInstitutionalHeaders(root=document){
  if(!headerSrc)return;
  const selectors=[
    '.methodology-institutional-header img',
    'img[alt*="Cabeçalho institucional"]',
    'img[alt*="cabeçalho institucional"]'
  ];
  for(const img of root.querySelectorAll(selectors.join(','))){
    if(img.src!==headerSrc)img.src=headerSrc;
    img.dataset.crjStandardHeader='1';
  }
}

async function loadStandardHeader(){
  for(let i=0;i<80 && apiMode()!=='live';i++)await new Promise(r=>setTimeout(r,100));
  if(apiMode()!=='live')return;
  const client=supabaseClient();
  const {data,error}=await client
    .from('crj_document_settings')
    .select('header_image_data,header_mime')
    .eq('id',1)
    .maybeSingle();
  if(error)throw error;
  if(!data?.header_image_data)return;
  const mime=data.header_mime||'image/jpeg';
  const raw=String(data.header_image_data).trim();
  headerSrc=raw.startsWith('data:image/')?raw:`data:${mime};base64,${raw}`;
  window.__crjStandardDocumentHeader=headerSrc;
  replaceInstitutionalHeaders();

  if(!observer){
    observer=new MutationObserver(mutations=>{
      for(const mutation of mutations){
        for(const node of mutation.addedNodes){
          if(!(node instanceof Element))continue;
          if(node.matches?.('.methodology-institutional-header img,img[alt*="Cabeçalho institucional"],img[alt*="cabeçalho institucional"]')){
            if(node.src!==headerSrc)node.src=headerSrc;
            node.dataset.crjStandardHeader='1';
          }
          replaceInstitutionalHeaders(node);
        }
      }
    });
    observer.observe(document.body,{childList:true,subtree:true});
  }
}

window.addEventListener('hashchange',()=>setTimeout(()=>replaceInstitutionalHeaders(),40));
window.addEventListener('focus',()=>replaceInstitutionalHeaders());
loadStandardHeader().catch(err=>console.warn('Não foi possível carregar o cabeçalho institucional padrão:',err));
