// Contrato global de exportação documental do CRJ Trajetórias.
// Todo PDF/DOCX/impressão deve sair exclusivamente do gerador canônico.
const nativeFetch = window.fetch.bind(window);
const OFFICIAL_LAYOUT_CONTRACT = 'official-preview-v1';

function officialExportUrl(input){
  try{
    const raw = input instanceof Request ? input.url : String(input ?? '');
    const url = new URL(raw, window.location.href);
    const legacy = url.pathname.endsWith('/functions/v1/crj-export-document') || url.pathname.endsWith('/functions/v1/crj-export-workshop-attendance');
    const safe = url.pathname.endsWith('/functions/v1/crj-export-document-safe');
    if(legacy){
      url.pathname = url.pathname.replace(/\/(crj-export-document|crj-export-workshop-attendance)$/, '/crj-export-document-safe');
      return url.toString();
    }
    if(safe)return url.toString();
  }catch{}
  return null;
}

function exportError(message,details={}){
  console.error('CRJ_DOCUMENT_EXPORT_REJECTED', {message,...details});
  return new Response(JSON.stringify({error:message}),{
    status:502,
    headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
  });
}

async function validateBinaryResponse(response){
  const type=String(response.headers.get('content-type')||'').toLowerCase();
  let head;
  try{
    const bytes=new Uint8Array(await response.clone().arrayBuffer());
    head=bytes.slice(0,8);
  }catch(error){
    return exportError('Não foi possível validar o arquivo gerado.',{cause:error?.message||String(error)});
  }

  const isPdf=head.length>=4&&head[0]===0x25&&head[1]===0x50&&head[2]===0x44&&head[3]===0x46; // %PDF
  const isZip=head.length>=2&&head[0]===0x50&&head[1]===0x4b; // PK / DOCX

  if(type.includes('application/pdf')&&!isPdf){
    return exportError('O servidor informou PDF, mas o conteúdo recebido não é um PDF válido.',{contentType:type,magic:[...head]});
  }
  if(type.includes('wordprocessingml')&&!isZip){
    return exportError('O servidor informou DOCX, mas o conteúdo recebido não é um arquivo Word válido.',{contentType:type,magic:[...head]});
  }
  if(!type.includes('application/pdf')&&!type.includes('wordprocessingml')){
    return exportError('O gerador retornou um formato inesperado em vez do documento solicitado.',{contentType:type,magic:[...head]});
  }
  return response;
}

window.fetch = async function crjOfficialDocumentFetch(input, init){
  const redirected = officialExportUrl(input);
  if(!redirected)return nativeFetch(input,init);

  const target=input instanceof Request?new Request(redirected,input):redirected;
  const response=await nativeFetch(target,init);
  if(!response.ok)return response;

  const source=response.headers.get('x-crj-layout-source');
  const contract=response.headers.get('x-crj-layout-contract');
  if(source!=='official-canonical'||contract!==OFFICIAL_LAYOUT_CONTRACT){
    try{response.body?.cancel?.()}catch{}
    return exportError('A exportação foi interrompida porque o servidor não confirmou o layout oficial do documento.',{source,contract});
  }

  return validateBinaryResponse(response);
};

window.__crjSafeDocumentExport=true;
window.__crjOfficialDocumentContract=OFFICIAL_LAYOUT_CONTRACT;
