import { apiMode, supabaseClient } from './api.js?v=20261004-2';
import { CONFIG } from './config.js';

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let observer=null,scheduled=false;

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function client(){
  for(let i=0;i<120;i++){
    if(apiMode()==='live')return supabaseClient();
    await sleep(50);
  }
  throw new Error('Banco ainda não conectado.');
}

async function getExportResponse(submissionId,format='pdf'){
  if(!submissionId)throw new Error('Documento não identificado.');
  const cl=await client();
  const {data:{session}}=await cl.auth.getSession();
  if(!session)throw new Error('Sessão expirada. Entre novamente no sistema.');
  const response=await fetch(`${CONFIG.supabaseUrl}/functions/v1/crj-export-document`,{
    method:'POST',
    headers:{
      Authorization:`Bearer ${session.access_token}`,
      'Content-Type':'application/json',
      apikey:CONFIG.supabasePublishableKey
    },
    body:JSON.stringify({submission_id:submissionId,format})
  });
  if(!response.ok){
    let message='Falha ao gerar documento.';
    try{message=(await response.json()).error||message}catch{}
    throw new Error(message);
  }
  return response;
}

function filenameFromResponse(response,format){
  const disposition=response.headers.get('content-disposition')||'';
  const utf8=disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if(utf8){try{return decodeURIComponent(utf8)}catch{}}
  const plain=disposition.match(/filename="([^"]+)"/i)?.[1];
  return plain||`evidencia-crj.${format}`;
}

export async function downloadEvidence(submissionId,format='pdf'){
  const response=await getExportResponse(submissionId,format);
  const blob=await response.blob();
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download=filenameFromResponse(response,format);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}

export async function printEvidence(submissionId){
  const response=await getExportResponse(submissionId,'pdf');
  const blob=await response.blob();
  const url=URL.createObjectURL(blob);
  const frame=document.createElement('iframe');
  frame.setAttribute('aria-hidden','true');
  Object.assign(frame.style,{position:'fixed',right:'0',bottom:'0',width:'1px',height:'1px',border:'0',opacity:'0',pointerEvents:'none'});
  document.body.appendChild(frame);
  const cleanup=()=>{try{frame.remove()}catch{};URL.revokeObjectURL(url)};
  frame.onload=()=>{
    setTimeout(()=>{
      try{
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        setTimeout(cleanup,60000);
      }catch{
        try{frame.remove()}catch{}
        const win=window.open(url,'_blank','noopener,noreferrer');
        if(!win){
          URL.revokeObjectURL(url);
          throw new Error('O navegador bloqueou a janela de impressão. Libere pop-ups para este sistema.');
        }
        setTimeout(()=>URL.revokeObjectURL(url),60000);
      }
    },450);
  };
  frame.src=url;
}

async function latestBySource(sourceType,sourceId){
  if(!sourceType||!UUID_RE.test(String(sourceId||'')))return null;
  const cl=await client();
  const q=await cl.from('methodology_form_submissions')
    .select('id')
    .eq('source_type',sourceType)
    .eq('source_id',sourceId)
    .order('updated_at',{ascending:false})
    .limit(1)
    .maybeSingle();
  if(q.error)throw q.error;
  return q.data?.id||null;
}

async function latestBySourceId(sourceId){
  if(!UUID_RE.test(String(sourceId||'')))return null;
  const cl=await client();
  const q=await cl.from('methodology_form_submissions')
    .select('id')
    .eq('source_id',sourceId)
    .order('updated_at',{ascending:false})
    .limit(1)
    .maybeSingle();
  if(q.error)throw q.error;
  return q.data?.id||null;
}

async function latestInitialForYouth(youthId){
  if(!UUID_RE.test(String(youthId||'')))return null;
  const cl=await client();
  const q=await cl.from('methodology_form_submissions')
    .select('id')
    .eq('form_slug','formulario-inicial')
    .eq('youth_id',youthId)
    .order('updated_at',{ascending:false})
    .limit(1)
    .maybeSingle();
  if(q.error)throw q.error;
  return q.data?.id||null;
}

async function latestFormForYouth(slug,youthId){
  if(!slug||!UUID_RE.test(String(youthId||'')))return null;
  const cl=await client();
  const q=await cl.from('methodology_form_submissions')
    .select('id')
    .eq('form_slug',slug)
    .eq('youth_id',youthId)
    .order('updated_at',{ascending:false})
    .limit(1)
    .maybeSingle();
  if(q.error)throw q.error;
  return q.data?.id||null;
}

function parseDdSubmission(scope){
  const b=scope?.querySelector?.('[data-dd-export]');
  const id=String(b?.dataset?.ddExport||'').split(':')[0];
  return UUID_RE.test(id)?id:null;
}

function parseDirectSubmission(scope){
  const b=scope?.querySelector?.('[data-evidence-download]');
  const id=String(b?.dataset?.evidenceDownload||'');
  return UUID_RE.test(id)?id:null;
}

function collectUuidCandidates(scope){
  const ids=[];
  const add=v=>{const s=String(v||'');if(UUID_RE.test(s)&&!ids.includes(s))ids.push(s)};
  if(!scope)return ids;
  const nodes=[scope,...scope.querySelectorAll?.('[data-plan-id],[data-report-id],[data-submission-id],[data-cfdh-report-pdf],[data-cfdh-plan-pdf],[data-workshop-report-pdf],[data-workshop-plan-pdf]')||[]];
  for(const node of nodes){for(const v of Object.values(node.dataset||{}))add(v)}
  return ids;
}

export async function resolveEvidenceSubmission(trigger){
  const explicit=String(trigger?.dataset?.evidenceSubmissionId||'');
  if(UUID_RE.test(explicit))return explicit;

  if(trigger?.dataset?.evidenceInitialYouth){
    const id=await latestInitialForYouth(trigger.dataset.evidenceInitialYouth);
    if(id)return id;
  }

  if(trigger?.dataset?.evidenceSourceType&&trigger?.dataset?.evidenceSourceId){
    const id=await latestBySource(trigger.dataset.evidenceSourceType,trigger.dataset.evidenceSourceId);
    if(id)return id;
  }

  const row=trigger?.closest?.('.dd-row');
  const ddId=parseDdSubmission(row);
  if(ddId)return ddId;

  const modal=trigger?.closest?.('.modal,.modal-backdrop,#modal');
  const directId=parseDirectSubmission(modal);
  if(directId)return directId;

  const art=trigger?.closest?.('.ae-record');
  const artExport=art?.querySelector?.('[data-ae-export]');
  if(artExport){
    const [type,id]=String(artExport.dataset.aeExport||'').split(':');
    const found=await latestBySource(type,id);
    if(found)return found;
  }

  const form=trigger?.closest?.('form')||trigger?.closest?.('.methodology-preview-pane')?.parentElement?.closest?.('form')||null;
  if(form?.dataset?.slug&&form?.dataset?.youth){
    const found=await latestFormForYouth(form.dataset.slug,form.dataset.youth);
    if(found)return found;
  }

  const scope=form||trigger?.closest?.('.content')||document.querySelector('.content');
  for(const candidate of collectUuidCandidates(scope)){
    const found=await latestBySourceId(candidate);
    if(found)return found;
  }

  throw new Error('Esta pré-visualização ainda não possui uma evidência registrada. Salve o documento primeiro e tente novamente.');
}

function makeButton(label,action){
  const b=document.createElement('button');
  b.type='button';
  b.className='btn secondary crj-evidence-export-btn';
  b.dataset.crjEvidenceAction=action;
  b.textContent=label;
  return b;
}

function ensureStyles(){
  if(document.querySelector('#crj-evidence-export-css'))return;
  const style=document.createElement('style');
  style.id='crj-evidence-export-css';
  style.textContent=`
    .crj-evidence-export-actions{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    .methodology-preview-toolbar{gap:10px;flex-wrap:wrap}
    .methodology-preview-toolbar .crj-evidence-export-actions .btn{font-size:11px;padding:6px 8px;white-space:nowrap}
    .crj-evidence-export-btn[disabled]{opacity:.55;cursor:wait}
  `;
  document.head.appendChild(style);
}

function enhanceDocumentsEvidence(){
  document.querySelectorAll('.dd-row').forEach(row=>{
    const actions=row.querySelector('.dd-actions');
    const id=parseDdSubmission(row);
    if(!actions||!id)return;
    actions.querySelectorAll('[data-dd-export]').forEach(btn=>{
      const format=String(btn.dataset.ddExport||'').split(':')[1];
      if(format==='pdf')btn.textContent='Baixar PDF';
      if(format==='docx')btn.textContent='Baixar DOCX';
    });
    if(!actions.querySelector('[data-crj-evidence-action="print"]')){
      const b=makeButton('Imprimir','print');
      b.dataset.evidenceSubmissionId=id;
      actions.appendChild(b);
    }
  });
}

function enhanceSaveModals(){
  document.querySelectorAll('[data-evidence-download]').forEach(download=>{
    const actions=download.closest('.actions');
    const id=String(download.dataset.evidenceDownload||'');
    if(!actions||!UUID_RE.test(id)||actions.querySelector('[data-crj-evidence-action="print"]'))return;
    const b=makeButton('Imprimir','print');
    b.dataset.evidenceSubmissionId=id;
    actions.insertBefore(b,actions.querySelector('[data-evidence-return]')||null);
  });
}

function enhanceArticulation(){
  document.querySelectorAll('.ae-record').forEach(row=>{
    const actions=row.querySelector('.ae-actions');
    if(!actions)return;
    const source=actions.querySelector('[data-ae-export]');
    if(source&&!actions.querySelector('[data-crj-primary-print]')){
      const [type,id]=String(source.dataset.aeExport||'').split(':');
      if(type&&UUID_RE.test(id)){
        const b=makeButton('Imprimir','print');
        b.dataset.crjPrimaryPrint='1';
        b.dataset.evidenceSourceType=type;
        b.dataset.evidenceSourceId=id;
        actions.appendChild(b);
      }
    }
    const initial=actions.querySelector('[data-ae-initial$=":pdf"]');
    if(initial&&!actions.querySelector('[data-crj-initial-print]')){
      const [youthId]=String(initial.dataset.aeInitial||'').split(':');
      if(UUID_RE.test(youthId)){
        const b=makeButton('Imprimir Anexo 1','print');
        b.dataset.crjInitialPrint='1';
        b.dataset.evidenceInitialYouth=youthId;
        actions.appendChild(b);
      }
    }
  });
}

function enhancePreviewToolbars(){
  document.querySelectorAll('.methodology-preview-toolbar').forEach(toolbar=>{
    if(toolbar.dataset.crjEvidenceExports==='1')return;
    toolbar.dataset.crjEvidenceExports='1';
    let box=toolbar.querySelector('.actions');
    if(!box){
      box=document.createElement('div');
      box.className='actions crj-evidence-export-actions';
      const directButtons=[...toolbar.children].filter(el=>el.tagName==='BUTTON');
      directButtons.forEach(el=>box.appendChild(el));
      toolbar.appendChild(box);
    }else box.classList.add('crj-evidence-export-actions');
    if(!box.querySelector('[data-crj-evidence-action="pdf"]'))box.prepend(makeButton('Baixar PDF','pdf'));
    if(!box.querySelector('[data-crj-evidence-action="docx"]')){
      const b=makeButton('Baixar DOCX','docx');
      const pdf=box.querySelector('[data-crj-evidence-action="pdf"]');
      pdf?.insertAdjacentElement('afterend',b);
    }
    if(!box.querySelector('[data-crj-evidence-action="print"]'))box.appendChild(makeButton('Imprimir','print'));
  });
}

function enhance(){
  ensureStyles();
  enhanceDocumentsEvidence();
  enhanceSaveModals();
  enhanceArticulation();
  enhancePreviewToolbars();
}

function schedule(){
  if(scheduled)return;
  scheduled=true;
  requestAnimationFrame(()=>{scheduled=false;enhance()});
}

async function handleAction(button){
  const action=button.dataset.crjEvidenceAction;
  if(!action)return;
  const original=button.textContent;
  button.disabled=true;
  button.textContent=action==='print'?'Preparando impressão...':'Gerando...';
  try{
    const submissionId=await resolveEvidenceSubmission(button);
    if(action==='print')await printEvidence(submissionId);
    else await downloadEvidence(submissionId,action);
  }catch(error){
    alert(error?.message||String(error));
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
}

document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-crj-evidence-action]');
  if(!button)return;
  event.preventDefault();
  event.stopPropagation();
  handleAction(button);
},true);

window.addEventListener('hashchange',()=>setTimeout(schedule,0));

observer=new MutationObserver(schedule);
observer.observe(document.documentElement,{childList:true,subtree:true});

window.CRJEvidenceExports={download:downloadEvidence,print:printEvidence,resolve:resolveEvidenceSubmission};
enhance();
