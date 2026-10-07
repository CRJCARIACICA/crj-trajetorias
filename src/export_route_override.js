// Roteamento global de exportação documental.
// Mantém compatibilidade com módulos antigos que ainda chamam crj-export-document.
const nativeFetch = window.fetch.bind(window);

function safeExportUrl(input){
  try{
    const raw = input instanceof Request ? input.url : String(input ?? '');
    const url = new URL(raw, window.location.href);
    if(url.pathname.endsWith('/functions/v1/crj-export-document')){
      url.pathname = url.pathname.replace(/\/crj-export-document$/, '/crj-export-document-safe');
      return url.toString();
    }
  }catch{}
  return null;
}

window.fetch = function crjSafeDocumentFetch(input, init){
  const redirected = safeExportUrl(input);
  if(!redirected) return nativeFetch(input, init);

  if(input instanceof Request){
    const request = new Request(redirected, input);
    return nativeFetch(request, init);
  }
  return nativeFetch(redirected, init);
};

window.__crjSafeDocumentExport = true;
