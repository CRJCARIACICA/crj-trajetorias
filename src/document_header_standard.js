import { apiMode } from './api.js?v=20261004-2';
import { CONFIG } from './config.js';

let headerSrc='';
let headerObjectUrl='';
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
    img.dataset.crjHeaderSource='binary-canonical';
  }
}

async function loadStandardHeader(){
  for(let i=0;i<80 && apiMode()!=='live';i++)await new Promise(r=>setTimeout(r,100));
  if(apiMode()!=='live')return;

  const base=String(CONFIG?.supabaseUrl||'').replace(/\/$/,'');
  if(!base)throw new Error('URL do Supabase indisponível para o cabeçalho institucional.');

  const response=await fetch(`${base}/functions/v1/crj-document-header`,{
    method:'GET',
    cache:'no-store'
  });
  if(!response.ok)throw new Error(`Falha ao carregar cabeçalho institucional (${response.status}).`);

  const blob=await response.blob();
  if(blob.type && blob.type!=='image/jpeg')throw new Error('Cabeçalho institucional retornou formato inesperado.');
  if(!blob.size)throw new Error('Cabeçalho institucional retornou vazio.');

  if(headerObjectUrl)URL.revokeObjectURL(headerObjectUrl);
  headerObjectUrl=URL.createObjectURL(blob);
  headerSrc=headerObjectUrl;
  window.__crjStandardDocumentHeader=headerSrc;
  window.__crjStandardDocumentHeaderSource='crj-document-header';
  replaceInstitutionalHeaders();

  if(!observer){
    observer=new MutationObserver(mutations=>{
      for(const mutation of mutations){
        for(const node of mutation.addedNodes){
          if(!(node instanceof Element))continue;
          if(node.matches?.('.methodology-institutional-header img,img[alt*="Cabeçalho institucional"],img[alt*="cabeçalho institucional"]')){
            if(node.src!==headerSrc)node.src=headerSrc;
            node.dataset.crjStandardHeader='1';
            node.dataset.crjHeaderSource='binary-canonical';
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
window.addEventListener('beforeunload',()=>{if(headerObjectUrl)URL.revokeObjectURL(headerObjectUrl)});
loadStandardHeader().catch(err=>console.warn('Não foi possível carregar o cabeçalho institucional padrão:',err));

import('./technical_workspace_tabs.js?v=20261009-1').catch(err=>console.warn('Não foi possível carregar a organização da Equipe Técnica:',err));
