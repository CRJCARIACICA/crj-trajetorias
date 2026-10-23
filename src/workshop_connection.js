export function isWorkshopConnectionError(error){
  const message=[error?.message,error?.details,typeof error==='string'?error:''].filter(Boolean).join(' ');
  return /failed to fetch|fetch failed|networkerror|network request failed|load failed|failed to load resource/i.test(message);
}

// Only use for reads and idempotent operations such as reopening a check-in window.
export async function withWorkshopConnectionRetry(operation,{attempts=3,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
  for(let attempt=0;attempt<attempts;attempt++){
    try{
      const result=await operation();
      if(result?.error)throw result.error;
      return result;
    }catch(error){
      if(!isWorkshopConnectionError(error)||attempt===attempts-1)throw error;
      await wait(350*(attempt+1));
    }
  }
}

export function workshopConnectionMessage(error){
  return isWorkshopConnectionError(error)
    ?'A conexão com o banco falhou. Verifique sua internet e tente novamente.'
    :(error?.message||String(error));
}
