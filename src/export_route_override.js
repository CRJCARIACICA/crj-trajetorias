// Contrato global de exportação documental do CRJ Trajetórias.
// Todo PDF/DOCX/impressão deve sair exclusivamente do gerador oficial que
// corresponde à pré-visualização e ao layout institucional dos anexos.
const nativeFetch = window.fetch.bind(window);
const OFFICIAL_LAYOUT_CONTRACT = 'official-preview-v1';

function officialExportUrl(input){
  try{
    const raw = input instanceof Request ? input.url : String(input ?? '');
    const url = new URL(raw, window.location.href);
    const isDocumentExport = url.pathname.endsWith('/functions/v1/crj-export-document');
    const isAttendanceExport = url.pathname.endsWith('/functions/v1/crj-export-workshop-attendance');
    if(isDocumentExport || isAttendanceExport){
      url.pathname = url.pathname.replace(/\/(crj-export-document|crj-export-workshop-attendance)$/, '/crj-export-document-safe');
      return url.toString();
    }
  }catch{}
  return null;
}

function layoutContractError(){
  return new Response(JSON.stringify({
    error: 'A exportação foi interrompida porque o servidor não confirmou o layout oficial do documento. Nenhuma versão alternativa foi baixada.'
  }),{
    status:502,
    headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
  });
}

window.fetch = async function crjOfficialDocumentFetch(input, init){
  const redirected = officialExportUrl(input);
  if(!redirected) return nativeFetch(input, init);

  const target = input instanceof Request
    ? new Request(redirected, input)
    : redirected;

  const response = await nativeFetch(target, init);
  if(!response.ok) return response;

  const source = response.headers.get('x-crj-layout-source');
  const contract = response.headers.get('x-crj-layout-contract');
  if(source !== 'official-canonical' || contract !== OFFICIAL_LAYOUT_CONTRACT){
    console.error('CRJ_DOCUMENT_LAYOUT_CONTRACT_MISMATCH', {source, contract});
    try{ response.body?.cancel?.(); }catch{}
    return layoutContractError();
  }

  return response;
};

window.__crjSafeDocumentExport = true;
window.__crjOfficialDocumentContract = OFFICIAL_LAYOUT_CONTRACT;
