import { apiMode, supabaseClient, saveUiDraft, deleteUiDraft } from './api.js?v=20261016-hours1';
import { CONFIG } from './config.js';

const FIELDS=['objective','proposed_activities','resources'];
const LABELS={objective:'Objetivo',proposed_activities:'Atividades propostas',resources:'Recursos necessários'};
const BUCKET='instructor-planning-evidence';
const DRAFT_PREFIX='crj_instructor_plan_v1:';
const draftTimers=new Map(),draftQueues=new Map(),saving=new Map();
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const client=()=>{if(apiMode()!=='live')throw new Error('Banco ainda não conectado.');return supabaseClient()};
const fields=form=>Object.fromEntries(FIELDS.map(k=>[k,String(form.querySelector('[name="'+k+'"]')?.value||'')]));
const normalized=value=>Object.fromEntries(FIELDS.map(k=>[k,String(value?.[k]||'').trim()]));
const same=(a,b)=>FIELDS.every(k=>normalized(a)[k]===normalized(b)[k]);
const contentStamp=row=>row?.instructor_content_updated_at||row?.updated_at||null;
const draftKey=(user,id)=>'instructor-planning:'+user.id+':'+id;
const localKey=(user,id)=>DRAFT_PREFIX+user.id+':'+id;
const evidenceKey=(user,month,planId)=>DRAFT_PREFIX+'request:'+user.id+':'+month+':'+planId;
function localRead(user,id){
  try{const d=JSON.parse(localStorage.getItem(localKey(user,id))||'null');
    return d?.lesson_id===id&&d?.user_id===user.id&&d?.fields&&Date.now()-Date.parse(d.changed_at)<30*86400000?d:null;
  }catch{return null}
}
function localWrite(user,id,payload){try{localStorage.setItem(localKey(user,id),JSON.stringify(payload));return true}catch{return false}}
function localClear(user,id){try{localStorage.removeItem(localKey(user,id))}catch{}}
function remoteQueue(key,action){
  const task=(draftQueues.get(key)||Promise.resolve()).catch(()=>{}).then(action);
  draftQueues.set(key,task);
  task.finally(()=>{if(draftQueues.get(key)===task)draftQueues.delete(key)}).catch(()=>{});
  return task;
}
function stateText(form,message,type=''){
  const node=form.querySelector('[data-ip-save-state]');if(node){node.textContent=message;node.className='ip-muted '+type}
}
function snapshot(form,user){
  return {version:2,user_id:user.id,lesson_id:form.dataset.ipLessonForm,
    fields:fields(form),base_updated_at:form.dataset.ipUpdatedAt||null,changed_at:new Date().toISOString()};
}
function remember(form,user,{remote=true}={}){
  const id=form.dataset.ipLessonForm,key=draftKey(user,id),value=snapshot(form,user);
  const dirty=!same(value.fields,form._ipSavedFields||{});
  form.dataset.ipDirty=dirty?'1':'0';
  const localOk=localWrite(user,id,value);
  if(dirty)stateText(form,localOk?'Alterações protegidas neste navegador; aguardando salvar o bloco.':'Salve este bloco: não foi possível guardar o rascunho neste navegador.',localOk?'':'danger');
  clearTimeout(draftTimers.get(key));
  if(remote&&dirty)draftTimers.set(key,setTimeout(()=>{
    draftTimers.delete(key);
    remoteQueue(key,()=>saveUiDraft(key,value,{route:location.hash,form_id:'instructor-lesson-'+id})).catch(()=>{
      if(form.isConnected&&form.dataset.ipDirty==='1')stateText(form,'Rascunho mantido neste navegador. A sincronização aguarda conexão.');
    });
  },600));
  return value;
}
function restore(form,user,payload){
  if(!payload?.fields||payload.lesson_id!==form.dataset.ipLessonForm||payload.user_id!==user.id||form.dataset.ipEditSeq!=='0')return;
  if(same(payload.fields,form._ipSavedFields))return;
  for(const key of FIELDS){const node=form.querySelector('[name="'+key+'"]');if(node)node.value=String(payload.fields[key]||'')}
  if(Number(payload.version||1)>=2&&payload.base_updated_at)form.dataset.ipUpdatedAt=payload.base_updated_at;
  form.dataset.ipDirty='1';localWrite(user,form.dataset.ipLessonForm,payload);
  stateText(form,'Rascunho recuperado. Revise e salve este bloco para confirmar no sistema.');
}
async function showSavedVersion(form,user){
  const {data,error}=await client().from('workshop_plan_lessons').select('id,objective,proposed_activities,resources,updated_at,instructor_content_updated_at').eq('id',form.dataset.ipLessonForm).single();
  if(error)throw error;if(!form.isConnected)return;
  form.querySelector('[data-ip-server-version]')?.remove();
  const box=document.createElement('div');box.dataset.ipServerVersion='1';box.className='notice info';
  box.innerHTML='<b>Versão salva no sistema</b>'+FIELDS.map(k=>'<p><strong>'+LABELS[k]+':</strong><br>'+esc(data[k]||'').replace(/\n/g,'<br>')+'</p>').join('')+
    '<p>Seu texto continua nos campos acima. Compare as versões antes de salvar.</p><button class="btn secondary" type="button" data-ip-keep-draft>Atualizar referência e manter meu texto</button>';
  form.appendChild(box);
  box.querySelector('[data-ip-keep-draft]').onclick=()=>{
    form.dataset.ipUpdatedAt=contentStamp(data)||'';form._ipSavedFields=normalized(data);
    remember(form,user);box.remove();stateText(form,'Referência atualizada. Seu texto foi mantido; revise e clique em Salvar este bloco.');
  };
}
export async function saveInstructorBlock(form,user,{requireComplete=false}={}){
  if(saving.has(form)){await saving.get(form);return saveInstructorBlock(form,user,{requireComplete})}
  const submitted=fields(form),id=form.dataset.ipLessonForm,key=draftKey(user,id);
  if(requireComplete&&FIELDS.some(k=>!submitted[k].trim()))throw new Error('Preencha os três campos deste bloco antes de continuar.');
  const saved=form._ipSavedFields||{};
  if(form._ipSavedLesson&&same(submitted,saved))return form._ipSavedLesson;
  remember(form,user,{remote:false});clearTimeout(draftTimers.get(key));draftTimers.delete(key);
  const button=form.querySelector('button[type="submit"]'),label=button?.textContent||'Salvar este bloco',wasDisabled=button?.disabled||false;
  if(button){button.disabled=true;button.textContent='Salvando…'}
  stateText(form,'Conferindo o salvamento no sistema…');
  const task=(async()=>{
    try{
      const {data,error}=await client().rpc('workshop_instructor_save_lesson_v2',{
        p_lesson_id:id,p_objective:submitted.objective,p_proposed_activities:submitted.proposed_activities,
        p_resources:submitted.resources,p_expected_updated_at:form.dataset.ipUpdatedAt||null
      });
      if(error)throw error;
      const lesson=data?.lesson;
      if(data?.ok!==true||lesson?.id!==id||!contentStamp(lesson)||!same(lesson,submitted))throw new Error('O banco não confirmou todas as descrições. Seu texto continua protegido como rascunho.');
      form.dataset.ipUpdatedAt=contentStamp(lesson);form._ipSavedFields=normalized(lesson);form._ipSavedLesson=lesson;
      if(same(fields(form),submitted)){
        form.dataset.ipDirty='0';localClear(user,id);clearTimeout(draftTimers.get(key));draftTimers.delete(key);
        await remoteQueue(key,()=>deleteUiDraft(key)).catch(()=>{});
        if(same(fields(form),submitted))stateText(form,'Salvo e conferido no sistema.','success');
        else{remember(form,user);stateText(form,'Bloco salvo. Há novas alterações no rascunho.')}
      }else{remember(form,user);stateText(form,'Bloco salvo. Há novas alterações no rascunho.')}
      return lesson;
    }catch(error){
      remember(form,user);stateText(form,error.message||'Não foi possível salvar. Seu rascunho foi mantido.','danger');
      if(error.code==='40001'&&form.isConnected&&!form.querySelector('[data-ip-consult-saved]')){
        const b=document.createElement('button');b.type='button';b.className='btn secondary';b.dataset.ipConsultSaved='1';b.textContent='Consultar versão salva';
        b.onclick=()=>showSavedVersion(form,user).catch(e=>stateText(form,e.message,'danger'));
        form.querySelector('.ip-actions')?.appendChild(b);
      }
      throw error;
    }finally{if(button){button.disabled=wasDisabled;button.textContent=label}}
  })();
  saving.set(form,task);
  try{return await task}finally{if(saving.get(form)===task)saving.delete(form)}
}
async function requestEvidence(month,requestId,planId=null){
  const {data:{session}}=await client().auth.getSession();
  if(!session)throw new Error('Sessão expirada. Entre novamente para gerar a evidência.');
  const response=await fetch(CONFIG.supabaseUrl+'/functions/v1/crj-instructor-planning-evidence',{
    method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:CONFIG.supabasePublishableKey,'Content-Type':'application/json'},
    body:JSON.stringify({reference_month:month,request_id:requestId,...(planId?{plan_id:planId}:{})})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||'Não foi possível gerar a evidência. Os blocos salvos foram preservados.');
  return data;
}
export async function downloadPlanningEvidence(evidence,format){
  if(!['pdf','docx'].includes(format)||evidence.status!=='ready')throw new Error('O arquivo ainda não está disponível.');
  const path=format==='pdf'?evidence.pdf_path:evidence.docx_path;
  const {data,error}=await client().storage.from(BUCKET).download(path);
  if(error)throw error;
  const bytes=new Uint8Array(await data.slice(0,5).arrayBuffer());
  if(format==='pdf'&&new TextDecoder().decode(bytes)!=='%PDF-')throw new Error('O arquivo PDF recebido é inválido.');
  if(format==='docx'&&(bytes[0]!==0x50||bytes[1]!==0x4b))throw new Error('O arquivo DOCX recebido é inválido.');
  const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;
  a.download=(evidence.file_name||'Planejamento_v'+evidence.version)+'.'+format;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function evidenceButtons(evidence){
  return '<button class="btn secondary" type="button" data-ip-evidence-download="'+evidence.id+':pdf">Baixar PDF</button>'+
    '<button class="btn secondary" type="button" data-ip-evidence-download="'+evidence.id+':docx">Baixar DOCX</button>';
}
function bindDownloads(host,evidences){
  const byId=new Map(evidences.map(e=>[e.id,e]));
  host.querySelectorAll('[data-ip-evidence-download]').forEach(b=>b.onclick=async()=>{
    const [id,format]=b.dataset.ipEvidenceDownload.split(':'),old=b.textContent;b.disabled=true;b.textContent='Baixando…';
    try{await downloadPlanningEvidence(byId.get(id),format)}catch(error){alert(error.message||String(error))}finally{b.disabled=false;b.textContent=old}
  });
}
function evidenceFooterHtml(month,planId,workshopName){
  return '<div class="ip-lessons" data-ip-evidence-footer><h3>Concluir e gerar evidência · '+esc(workshopName||'Oficina')+'</h3>'+
    '<p>A evidência considera somente os blocos desta oficina. Outras oficinas incompletas na mesma competência não impedem esta geração.</p>'+
    '<p class="ip-muted" data-ip-planning-progress></p><div class="ip-actions">'+
    '<button class="btn primary" type="button" data-ip-generate-evidence data-month="'+esc(month)+'" data-plan-id="'+esc(planId)+'" disabled>Gerar evidência desta oficina</button>'+
    '<a class="btn secondary" href="#oficineiro?view=planejamentos">Ver Planejamentos</a></div><div aria-live="polite" data-ip-evidence-state></div></div>';
}
function progress(host){
  host.querySelectorAll('[data-ip-evidence-footer]').forEach(footer=>{
    const plan=footer.closest('[data-ip-plan-id]'),forms=[...(plan?.querySelectorAll('[data-ip-lesson-form]')||[])];
    const filled=forms.filter(f=>FIELDS.every(k=>fields(f)[k].trim())).length;
    const count=footer.querySelector('[data-ip-planning-progress]');if(count)count.textContent=filled+' de '+forms.length+' blocos completos nesta oficina.';
    const button=footer.querySelector('[data-ip-generate-evidence]');if(button&&button.dataset.busy!=='1')button.disabled=!forms.length||filled!==forms.length;
  });
}
export function planningEvidenceFooter(month,hasPlans){
  if(!hasPlans)return '';
  return '<div data-ip-evidence-root data-month="'+esc(month)+'"></div>';
}
async function generateEvidence(host,user,button){
  if(button.dataset.busy==='1')return;
  const plan=button.closest('[data-ip-plan-id]'),footer=button.closest('[data-ip-evidence-footer]');
  const forms=[...(plan?.querySelectorAll('[data-ip-lesson-form]')||[])],status=footer?.querySelector('[data-ip-evidence-state]');
  const invalid=forms.find(f=>FIELDS.some(k=>!fields(f)[k].trim()));
  if(!forms.length||invalid){invalid?.querySelector('textarea:invalid')?.focus();throw new Error('Complete todos os blocos desta oficina antes de gerar a evidência.')}
  button.dataset.busy='1';button.disabled=true;const label=button.textContent;
  const inputs=forms.flatMap(f=>[...f.querySelectorAll('textarea,button[type="submit"]')]).map(node=>({node,disabled:node.disabled}));
  inputs.forEach(({node})=>node.disabled=true);
  const month=button.dataset.month,planId=button.dataset.planId,nonceKey=evidenceKey(user,month,planId);
  let requestId;try{requestId=localStorage.getItem(nonceKey)}catch{}
  if(!requestId){requestId=crypto.randomUUID();try{localStorage.setItem(nonceKey,requestId)}catch{}}
  try{
    if(status)status.className='notice info';
    for(let i=0;i<forms.length;i++){
      if(status)status.textContent='Salvando e conferindo bloco '+(i+1)+' de '+forms.length+' desta oficina…';
      await saveInstructorBlock(forms[i],user,{requireComplete:true});
    }
    button.textContent='Gerando arquivos…';
    if(status)status.textContent='Blocos desta oficina conferidos. Gerando e armazenando PDF e DOCX…';
    let evidence=await requestEvidence(month,requestId,planId);
    for(let n=0;evidence.status==='generating'&&n<15;n++){await new Promise(r=>setTimeout(r,1000));evidence=await requestEvidence(month,requestId,planId)}
    if(evidence.status!=='ready')throw new Error('A evidência continua em geração. Consulte a área Planejamentos para acompanhar e baixar os arquivos.');
    try{localStorage.removeItem(nonceKey)}catch{}
    if(status&&status.isConnected){
      status.className='';
      status.innerHTML='<div class="notice success"><b>Evidência armazenada · oficina · versão '+evidence.version+'</b><p>Os arquivos estão disponíveis em Planejamentos.</p><div class="ip-actions">'+evidenceButtons(evidence)+'</div></div>';
      bindDownloads(status,[evidence]);
    }
  }catch(error){
    if(status&&status.isConnected){status.className='notice danger';status.textContent=error.message||'Não foi possível concluir. Os blocos e os rascunhos foram preservados.'}
    throw error;
  }finally{
    inputs.forEach(({node,disabled})=>node.disabled=disabled);
    button.dataset.busy='0';button.textContent=label;progress(host);
  }
}
export async function bindInstructorPlanning(host,data,user){
  const lessons=new Map((data.lessons||[]).map(x=>[x.id,x]));
  const forms=[...host.querySelectorAll('[data-ip-lesson-form]')];
  const evidenceRoot=host.querySelector('[data-ip-evidence-root]'),month=evidenceRoot?.dataset.month;
  if(evidenceRoot&&month){
    const sections=[...host.querySelectorAll('.ip-plan')];
    if(sections.length){
      sections.forEach(section=>{
        const first=section.querySelector('[data-ip-lesson-form]');if(!first)return;
        const row=lessons.get(first.dataset.ipLessonForm),planId=row?.plan_id;if(!planId)return;
        const plan=(data.plans||[]).find(p=>p.id===planId),workshop=(data.workshops||[]).find(w=>w.id===plan?.workshop_id);
        section.dataset.ipPlanId=planId;
        if(!section.querySelector('[data-ip-evidence-footer]'))section.insertAdjacentHTML('beforeend',evidenceFooterHtml(month,planId,workshop?.name||section.querySelector('.ip-plan-head h3')?.textContent||'Oficina'));
      });
    }else{
      const planIds=[...new Set(forms.map(f=>lessons.get(f.dataset.ipLessonForm)?.plan_id).filter(Boolean))];
      if(planIds.length===1){
        host.dataset.ipPlanId=planIds[0];
        evidenceRoot.insertAdjacentHTML('beforebegin',evidenceFooterHtml(month,planIds[0],'Oficina'));
      }
    }
    evidenceRoot.remove();
  }
  for(const form of forms){
    const row=lessons.get(form.dataset.ipLessonForm);if(!row)continue;
    form._ipSavedFields=normalized(row);form._ipSavedLesson=row;
    form.dataset.ipUpdatedAt=contentStamp(row)||'';form.dataset.ipEditSeq='0';form.dataset.ipDirty='0';
    const local=localRead(user,row.id);if(local)restore(form,user,local);
    form.addEventListener('input',()=>{
      form.dataset.ipEditSeq=String(Number(form.dataset.ipEditSeq||0)+1);remember(form,user);progress(host);
      const plan=form.closest('[data-ip-plan-id]'),button=plan?.querySelector('[data-ip-generate-evidence]');
      const m=button?.dataset.month,planId=button?.dataset.planId;
      if(m&&planId&&button?.dataset.busy!=='1'){try{localStorage.removeItem(evidenceKey(user,m,planId))}catch{}}
    });
    form.addEventListener('submit',event=>{
      event.preventDefault();saveInstructorBlock(form,user,{requireComplete:true}).then(()=>progress(host)).catch(()=>{});
    });
  }
  host.querySelectorAll('[data-ip-generate-evidence]').forEach(button=>{
    button.addEventListener('click',()=>generateEvidence(host,user,button).catch(()=>{}));
  });
  progress(host);
  if(!forms.length)return;
  try{
    const keys=forms.map(f=>draftKey(user,f.dataset.ipLessonForm));
    const q=await client().from('ui_drafts').select('draft_key,payload,updated_at,expires_at').eq('user_id',user.id).in('draft_key',keys);
    if(q.error)throw q.error;
    for(const item of q.data||[]){
      if(Date.parse(item.expires_at)<Date.now())continue;
      const form=forms.find(f=>draftKey(user,f.dataset.ipLessonForm)===item.draft_key);
      if(!form?.isConnected)continue;
      const local=localRead(user,form.dataset.ipLessonForm);
      if(!local||Date.parse(item.payload?.changed_at)>Date.parse(local.changed_at))restore(form,user,item.payload);
    }
    progress(host);
  }catch(error){console.warn('Rascunhos do planejamento: sincronização indisponível',error?.message||String(error))}
}
export async function planningArchiveHtml(user,month=''){
  let query=client().from('workshop_instructor_evidences').select('id,request_id,plan_id,reference_month,version,status,file_name,pdf_path,docx_path,created_at,pdf_bytes,docx_bytes,snapshot').eq('instructor_user_id',user.id).order('reference_month',{ascending:false}).order('created_at',{ascending:false}).limit(100);
  if(/^\d{4}-\d{2}-01$/.test(month))query=query.eq('reference_month',month);
  const q=await query;if(q.error)throw q.error;
  const rows=q.data||[],statusLabel={pending:'Aguardando geração',generating:'Gerando arquivos',failed:'Geração não concluída',ready:'Arquivos disponíveis'};
  const evidenceName=e=>{const names=(e.snapshot?.plans||[]).map(p=>p.workshop_name).filter(Boolean);return names.length?names.join(', '):'Planejamento mensal'};
  const body='<div class="ip-hero"><div><h2>Planejamentos</h2><p>Evidências de preenchimento guardadas por oficina, competência e versão. Cada arquivo preserva o conteúdo confirmado no momento da geração.</p></div><div class="ip-actions"><a class="btn primary" href="#oficineiro?view=planejamento">Preencher planejamento</a><button class="btn secondary" type="button" data-ip-archive-refresh>Atualizar lista</button></div></div>'+
    '<div class="field"><label>Filtrar por competência</label><input class="input" type="month" data-ip-archive-month value="'+esc(month.slice(0,7))+'"></div>'+
    (rows.map(e=>'<section class="ip-plan"><div class="ip-lessons"><h3>'+esc(evidenceName(e))+' · '+esc(e.reference_month.slice(0,7).split('-').reverse().join('/'))+' · versão '+e.version+'</h3><p class="ip-muted">Gerada em '+esc(new Date(e.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}))+' · '+statusLabel[e.status]+'</p><div class="ip-actions">'+
      (e.status==='ready'?evidenceButtons(e):'<button class="btn secondary" type="button" data-ip-evidence-retry="'+e.id+'">Tentar novamente / conferir geração</button>')+
      '</div><div data-ip-archive-status="'+e.id+'" aria-live="polite"></div></div></section>').join('')||'<div class="ip-empty"><b>Nenhuma evidência nesta consulta.</b><p>Após preencher todos os blocos de uma oficina, clique em Gerar evidência desta oficina para guardar os arquivos aqui.</p></div>');
  return {html:body,rows};
}
export function bindPlanningArchive(host,rows,refresh){
  bindDownloads(host,rows);
  host.querySelector('[data-ip-archive-refresh]')?.addEventListener('click',refresh);
  host.querySelector('[data-ip-archive-month]')?.addEventListener('change',e=>{
    const month=e.target.value;location.hash='#oficineiro?view=planejamentos'+(month?'&month='+month+'-01':'');
  });
  host.querySelectorAll('[data-ip-evidence-retry]').forEach(button=>button.onclick=async()=>{
    const evidence=rows.find(e=>e.id===button.dataset.ipEvidenceRetry),status=host.querySelector('[data-ip-archive-status="'+evidence.id+'"]');
    button.disabled=true;if(status)status.textContent='Conferindo a geração…';
    try{const result=await requestEvidence(evidence.reference_month,evidence.request_id);
      if(result.status==='ready')await refresh();else if(status)status.textContent='Os arquivos estão sendo gerados. Atualize a lista em alguns instantes.';
    }catch(error){if(status)status.textContent=error.message}finally{button.disabled=false}
  });
}