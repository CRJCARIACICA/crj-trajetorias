import { apiMode, supabaseClient } from './api.js?v=20261004-2';

const LANG='pt-BR';
const SpeechRecognitionCtor=window.SpeechRecognition||window.webkitSpeechRecognition||null;

const state={
  mounted:false,
  user:null,
  prefs:null,
  recognition:null,
  listening:false,
  live:false,
  voiceOutput:false,
  pendingImage:null,
  imageUrl:null,
  speakTimer:null,
  lastSpoken:'',
  observer:null,
  operationalRows:[],
  recorder:null,
  mediaStream:null,
  audioChunks:[],
  recording:false,
};

function qs(s,r=document){return r.querySelector(s)}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function setStatus(text,type=''){
  const el=qs('#jh-mm-status'); if(!el)return;
  el.className='jh-mm-status'+(type?' '+type:'');
  el.textContent=text||'';
}
function isJhonatao(){return (location.hash||'').replace(/^#/,'').split('?')[0]==='jhonatao'}
function browserCanPhoto(){return 'FileReader' in window}
function browserCanSpeak(){return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window}

async function currentUser(){
  if(apiMode()!=='live')return null;
  try{
    const c=supabaseClient();
    const {data}=await c.auth.getUser();
    return data?.user||null;
  }catch{return null}
}
function shiftISO(iso,days){
  const d=new Date(iso+'T12:00:00Z');
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}
async function loadOperationalRows(){
  if(apiMode()!=='live')return [];
  try{
    const c=supabaseClient();
    const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    const {data,error}=await c.rpc('get_jhonatao_calendar',{p_from:shiftISO(today,-7),p_to:shiftISO(today,60),p_only_mine:false});
    if(error)throw error;
    state.operationalRows=data||[];
    return state.operationalRows;
  }catch(err){
    console.warn('Contexto operacional multimodal indisponivel:',err);
    state.operationalRows=[];
    return [];
  }
}
async function loadPrefs(){
  const user=await currentUser(); state.user=user;
  if(!user)return null;
  const c=supabaseClient();
  const {data,error}=await c.from('jhonatao_ai_preferences').select('*').eq('user_id',user.id).maybeSingle();
  if(error)console.warn('Jhonatao multimodal prefs:',error);
  const p=data||{
    user_id:user.id,voice_output:false,voice_input_mode:'browser',live_mode:false,
    preferred_language:LANG,chatgpt_status:'not_connected',chatgpt_plan:null,
    plan_ai_enabled:false,capabilities:{}
  };
  state.prefs=p; state.voiceOutput=Boolean(p.voice_output); state.live=false;
  return p;
}
async function savePrefs(patch){
  if(!state.user)return;
  state.prefs={...(state.prefs||{}),...patch,user_id:state.user.id,updated_at:new Date().toISOString()};
  try{
    const c=supabaseClient();
    const {error}=await c.from('jhonatao_ai_preferences').upsert(state.prefs,{onConflict:'user_id'});
    if(error)throw error;
  }catch(err){console.warn('Nao foi possivel salvar preferencias multimodais:',err)}
}

function accountLabel(){
  const p=state.prefs||{};
  if(p.chatgpt_status==='connected'){
    const plan=p.chatgpt_plan?String(p.chatgpt_plan).toUpperCase():'CONECTADO';
    return `ChatGPT ${plan}`;
  }
  return 'ChatGPT não conectado';
}
function planDetail(){
  const p=state.prefs||{};
  if(p.chatgpt_status==='connected'&&p.plan_ai_enabled)return 'Uso do plano autorizado';
  if(p.chatgpt_status==='connected')return 'Conta vinculada • uso do plano desativado';
  return 'Jhonatão operacional gratuito ativo';
}
async function checkGroqHealth(){
  if(apiMode()!=='live')return;
  try{
    const c=supabaseClient();
    const {data,error}=await c.functions.invoke('jhonatao-chat',{body:{health:true}});
    if(error)throw error;
    if(data?.ok){
      const count=Number(data?.context_modules||0);
      const cap=qs('.jh-mm-capabilities');
      if(cap){
        const tags=[...cap.querySelectorAll('span')];
        const ai=tags.find(x=>x.textContent.includes('IA provisória'));
        if(ai)ai.textContent='✨ IA provisória: Groq ativa • contexto completo '+(count?count+' módulos':'carregado');
      }
      setStatus('IA Groq conectada. Contexto do CRJ Trajetórias '+(data?.context_ready?'carregado':'indisponível')+(count?' • '+count+' módulos reconhecidos':'')+'.','ok');
    }
  }catch(err){
    setStatus('Groq ainda não respondeu ao teste. O Jhonatão continua no modo operacional gratuito.','warn');
  }
}

function ui(){
  const mic=SpeechRecognitionCtor?'Nativo do navegador':(navigator.mediaDevices&&window.MediaRecorder?'Transcrição Groq':'Indisponível neste navegador');
  const speak=browserCanSpeak()?'Disponível':'Indisponível';
  const photo=browserCanPhoto()?'Captura disponível':'Indisponível';
  return `
    <div class="jh-mm-account" id="jh-mm-account">
      <div>
        <div class="jh-mm-account-title"><span class="jh-mm-dot"></span><b>${esc(accountLabel())}</b></div>
        <small>${esc(planDetail())}</small>
      </div>
      <button type="button" class="btn secondary" data-jh-mm-connect>Integração ChatGPT</button>
    </div>

    <div class="jh-mm-tools" aria-label="Recursos multimodais do Jhonatão">
      <button type="button" class="jh-mm-tool" data-jh-mm-mic title="Falar para preencher a mensagem">🎤 <span>Falar</span></button>
      <button type="button" class="jh-mm-tool" data-jh-mm-photo title="Tirar ou anexar foto">📷 <span>Foto</span></button>
      <button type="button" class="jh-mm-tool ${state.voiceOutput?'active':''}" data-jh-mm-speak title="Ouvir respostas do Jhonatão">🔊 <span>Ouvir</span></button>
      <button type="button" class="jh-mm-tool live" data-jh-mm-live title="Conversa contínua por voz">🎧 <span>Modo voz</span></button>
      <input id="jh-mm-photo-input" type="file" accept="image/png,image/jpeg,image/webp" capture="environment" hidden>
    </div>
    <div class="jh-mm-capabilities">
      <span>🎤 Voz: ${esc(mic)}</span>
      <span>🔊 Resposta falada: ${esc(speak)}</span>
      <span>📷 Foto: ${esc(photo)}</span>
      <span>✨ IA provisória: Groq • OpenAI aguardando aprovação</span>
    </div>
    <div id="jh-mm-photo-preview" class="jh-mm-photo-preview" hidden></div>
    <div id="jh-mm-status" class="jh-mm-status" aria-live="polite"></div>
  `;
}

function mount(){
  if(!isJhonatao())return;
  const card=qs('.jh-chat-card');
  if(!card||qs('#jh-mm-account',card))return;
  const head=qs('.jh-chat-head',card);
  if(!head)return;
  const wrap=document.createElement('div');
  wrap.className='jh-mm-wrap';
  wrap.innerHTML=ui();
  head.insertAdjacentElement('afterend',wrap);
  bind();
  observeChat();
}

function updateAccountUI(){
  const box=qs('#jh-mm-account');
  if(!box)return;
  const b=qs('.jh-mm-account-title b',box),s=qs('small',box);
  if(b)b.textContent=accountLabel();
  if(s)s.textContent=planDetail();
}

function showConnectionInfo(){
  const p=state.prefs||{};
  if(p.chatgpt_status==='connected'){
    setStatus(`Conta ChatGPT vinculada. ${p.plan_ai_enabled?'Uso do plano autorizado para recursos elegíveis.':'O uso do plano ainda não está autorizado.'}`,'ok');
    return;
  }
  setStatus('A interface de vínculo está pronta. O CRJ Trajetórias ainda precisa receber da OpenAI um Client ID do “Sign in with ChatGPT” para concluir o login real. Até lá, o modo operacional e a voz do navegador continuam gratuitos.','info');
}

function ensureRecognition(){
  if(!SpeechRecognitionCtor)throw new Error('Reconhecimento de voz não está disponível neste navegador.');
  if(state.recognition)return state.recognition;
  const r=new SpeechRecognitionCtor();
  r.lang=LANG;
  r.continuous=false;
  r.interimResults=true;
  r.maxAlternatives=1;
  r.onstart=()=>{
    state.listening=true;
    qs('[data-jh-mm-mic]')?.classList.add('active');
    setStatus(state.live?'Modo voz ouvindo…':'Ouvindo… fale normalmente.','listening');
  };
  r.onerror=e=>{
    state.listening=false;
    qs('[data-jh-mm-mic]')?.classList.remove('active');
    if(e.error!=='aborted'&&e.error!=='no-speech')setStatus('Não consegui ouvir. Verifique a permissão do microfone.','warn');
    if(state.live&&e.error!=='not-allowed')setTimeout(startListening,700);
  };
  r.onend=()=>{
    state.listening=false;
    qs('[data-jh-mm-mic]')?.classList.remove('active');
    if(!state.live)setStatus('');
  };
  r.onresult=e=>{
    let interim='',finalText='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      const t=e.results[i][0]?.transcript||'';
      if(e.results[i].isFinal)finalText+=t; else interim+=t;
    }
    const input=qs('#jh-chat-form textarea');
    if(input){
      if(interim)input.value=interim;
      if(finalText)input.value=finalText.trim();
    }
    if(finalText&&state.live&&input){
      setStatus('Entendi. Enviando ao Jhonatão…','working');
      const form=qs('#jh-chat-form');
      setTimeout(()=>form?.requestSubmit(),150);
    }
  };
  state.recognition=r;
  return r;
}

function startListening(){
  if(state.listening)return;
  try{ensureRecognition().start()}catch(err){setStatus(err.message||'Não foi possível iniciar o microfone.','warn')}
}
function stopListening(){
  try{state.recognition?.abort()}catch{}
  state.listening=false;
}

async function transcribeRecordedAudio(blob){
  if(!blob||!blob.size)return;
  setStatus('Transcrevendo áudio com a IA provisória…','working');
  try{
    const c=supabaseClient();
    const ext=blob.type.includes('ogg')?'ogg':blob.type.includes('mp4')?'m4a':'webm';
    const fd=new FormData();
    fd.append('audio',new File([blob],`jhonatao-audio.${ext}`,{type:blob.type||'audio/webm'}));
    const {data,error}=await c.functions.invoke('jhonatao-transcribe',{body:fd});
    if(error)throw error;
    const text=String(data?.text||'').trim();
    if(!text)throw new Error('Não consegui entender o áudio.');
    const input=qs('#jh-chat-form textarea');
    if(input){input.value=text;input.focus()}
    setStatus('Áudio transcrito. Você pode revisar ou enviar.','ok');
  }catch(err){
    setStatus(err?.message||'A transcrição por IA ainda não está disponível.','warn');
  }
}
async function toggleGroqRecording(){
  if(state.recording){
    state.recorder?.stop();
    return;
  }
  if(!navigator.mediaDevices||!window.MediaRecorder){
    setStatus('Este navegador não oferece gravação de áudio compatível.','warn');return;
  }
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    state.mediaStream=stream;state.audioChunks=[];
    const recorder=new MediaRecorder(stream);
    state.recorder=recorder;
    recorder.ondataavailable=e=>{if(e.data?.size)state.audioChunks.push(e.data)};
    recorder.onstart=()=>{
      state.recording=true;
      qs('[data-jh-mm-mic]')?.classList.add('active');
      setStatus('Gravando… toque novamente em Falar para encerrar e transcrever.','listening');
    };
    recorder.onstop=async()=>{
      state.recording=false;
      qs('[data-jh-mm-mic]')?.classList.remove('active');
      const blob=new Blob(state.audioChunks,{type:recorder.mimeType||'audio/webm'});
      state.audioChunks=[];
      state.mediaStream?.getTracks().forEach(t=>t.stop());state.mediaStream=null;
      await transcribeRecordedAudio(blob);
    };
    recorder.start();
  }catch(err){
    setStatus('Não foi possível acessar o microfone. Verifique a permissão do navegador.','warn');
  }
}
function toggleMic(){
  if(SpeechRecognitionCtor){
    if(state.listening){stopListening();setStatus('');return}
    startListening();return;
  }
  toggleGroqRecording();
}

function chooseVoice(){
  if(!browserCanSpeak())return null;
  const voices=speechSynthesis.getVoices();
  return voices.find(v=>v.lang?.toLowerCase()==='pt-br')
    ||voices.find(v=>v.lang?.toLowerCase().startsWith('pt'))
    ||voices[0]||null;
}
function speak(text){
  if(!browserCanSpeak()||!text||!state.voiceOutput)return Promise.resolve();
  speechSynthesis.cancel();
  stopListening();
  return new Promise(resolve=>{
    const u=new SpeechSynthesisUtterance(text);
    u.lang=LANG;
    const v=chooseVoice(); if(v)u.voice=v;
    u.rate=1;u.pitch=1;
    u.onend=()=>{resolve();if(state.live)setTimeout(startListening,350)};
    u.onerror=()=>{resolve();if(state.live)setTimeout(startListening,500)};
    speechSynthesis.speak(u);
  });
}
function scheduleSpeak(){
  if(!state.voiceOutput)return;
  clearTimeout(state.speakTimer);
  state.speakTimer=setTimeout(()=>{
    const btn=qs('#jh-chat-form button[type="submit"]');
    if(btn?.disabled){scheduleSpeak();return}
    const msgs=[...document.querySelectorAll('#jh-chat-log .jh-msg.assistant div')];
    const text=(msgs.at(-1)?.textContent||'').trim();
    if(!text||text===state.lastSpoken)return;
    state.lastSpoken=text;
    setStatus(state.live?'Jhonatão respondendo por voz…':'','speaking');
    speak(text).finally(()=>{if(!state.live)setStatus('')});
  },900);
}

function observeChat(){
  const log=qs('#jh-chat-log');if(!log)return;
  state.observer?.disconnect();
  state.observer=new MutationObserver(()=>scheduleSpeak());
  state.observer.observe(log,{childList:true,subtree:true,characterData:true});
}

async function toggleSpeak(){
  if(!browserCanSpeak()){setStatus('Este navegador não possui síntese de voz disponível.','warn');return}
  state.voiceOutput=!state.voiceOutput;
  qs('[data-jh-mm-speak]')?.classList.toggle('active',state.voiceOutput);
  await savePrefs({voice_output:state.voiceOutput});
  if(!state.voiceOutput)speechSynthesis.cancel();
  setStatus(state.voiceOutput?'Respostas faladas ativadas.':'Respostas faladas desativadas.','ok');
}

async function toggleLive(){
  if(!SpeechRecognitionCtor||!browserCanSpeak()){
    setStatus('O modo voz gratuito precisa de reconhecimento e síntese de voz compatíveis no navegador.','warn');
    return;
  }
  state.live=!state.live;
  state.voiceOutput=state.live||state.voiceOutput;
  qs('[data-jh-mm-live]')?.classList.toggle('active',state.live);
  qs('[data-jh-mm-speak]')?.classList.toggle('active',state.voiceOutput);
  await savePrefs({live_mode:state.live,voice_output:state.voiceOutput});
  if(state.live){
    setStatus('Modo voz ativado. Fale com o Jhonatão; após a resposta ele volta a ouvir automaticamente.','ok');
    startListening();
  }else{
    stopListening();speechSynthesis.cancel();
    setStatus('Modo voz encerrado.','');
  }
}

function clearPhoto(){
  if(state.imageUrl)URL.revokeObjectURL(state.imageUrl);
  state.pendingImage=null;state.imageUrl=null;
  const box=qs('#jh-mm-photo-preview');if(box){box.hidden=true;box.innerHTML=''}
  const input=qs('#jh-mm-photo-input');if(input)input.value='';
}
function showPhoto(file){
  if(!file)return;
  if(!/^image\/(png|jpeg|webp)$/i.test(file.type)){
    setStatus('Use uma imagem PNG, JPEG, WEBP ou GIF.','warn');return;
  }
  if(file.size>4*1024*1024){
    setStatus('A foto está muito grande. Use uma imagem de até 4 MB.','warn');return;
  }
  clearPhoto();
  state.pendingImage=file;state.imageUrl=URL.createObjectURL(file);
  const box=qs('#jh-mm-photo-preview');if(!box)return;
  box.hidden=false;
  box.innerHTML=`<img src="${state.imageUrl}" alt="Foto pronta para anexar"><div><b>${esc(file.name||'Foto')}</b><small>${Math.max(1,Math.round(file.size/1024))} KB</small><p>A foto será enviada somente quando você enviar a mensagem. A análise usa a IA provisória Groq; não há identificação facial automática.</p></div><button type="button" data-jh-mm-remove-photo aria-label="Remover foto">×</button>`;
  qs('[data-jh-mm-remove-photo]',box)?.addEventListener('click',clearPhoto);
  setStatus('Foto preparada. Ela só será enviada à IA provisória quando você enviar a mensagem.','info');
}

function bind(){
  qs('[data-jh-mm-connect]')?.addEventListener('click',showConnectionInfo);
  qs('[data-jh-mm-mic]')?.addEventListener('click',toggleMic);
  qs('[data-jh-mm-speak]')?.addEventListener('click',toggleSpeak);
  qs('[data-jh-mm-live]')?.addEventListener('click',toggleLive);
  const photo=qs('#jh-mm-photo-input');
  qs('[data-jh-mm-photo]')?.addEventListener('click',()=>photo?.click());
  photo?.addEventListener('change',()=>showPhoto(photo.files?.[0]));

  const form=qs('#jh-chat-form');
  form?.addEventListener('submit',()=>{
    if(state.pendingImage)setStatus('Enviando texto e foto para análise provisória…','working');
  },true);
}

async function boot(){
  await loadPrefs();
  await loadOperationalRows();
  const watcher=new MutationObserver(()=>{if(isJhonatao())mount()});
  watcher.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>setTimeout(mount,50));
  mount();
  updateAccountUI();
  checkGroqHealth();
}

boot();


function localDay(v){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
}
function localWhen(v){
  const d=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',day:'2-digit',month:'2-digit'}).format(new Date(v));
  const t=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date(v));
  return d+' '+t;
}
function norm(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
function freeOperationalAnswer(message){
  const q=norm(message);
  const rows=state.operationalRows.length?state.operationalRows:(Array.isArray(window.__JHONATAO_DATA__?.items)?window.__JHONATAO_DATA__.items:[]);
  const mine=rows.filter(x=>x.is_mine);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const fmt=x=>'• '+localWhen(x.start_at)+' — '+x.title+(x.location?' • '+x.location:'');
  const detailed=x=>{
    const tasks=Array.isArray(x.responsibilities)?x.responsibilities:[];
    return fmt(x)+(x.responsibility_basis?' • '+x.responsibility_basis:'')+(tasks.length?'\n  '+tasks.map(t=>'- '+t).join('\n  '):'');
  };
  const pending=[...new Set(mine.flatMap(x=>x.responsibilities||[]).filter(t=>/cadastro|pend[eê]ncia|procure/i.test(t)))];

  if(/cadastro|pendencia|pendencias|quem.*procurar/.test(q)){
    return pending.length?'Encontrei estas pendências operacionais:\n\n'+pending.map(x=>'• '+x).join('\n'):'Não encontrei pendências de cadastro ligadas às suas responsabilidades no período carregado.';
  }
  if(/hoje|agora|meu dia|o que.*fazer/.test(q)){
    const r=mine.filter(x=>localDay(x.start_at)===today);
    return r.length?'Hoje você tem '+r.length+' ação(ões) sob sua responsabilidade:\n\n'+r.map(detailed).join('\n\n'):'Não encontrei ações atribuídas a você para hoje.';
  }
  if(/responsabilidade|responsabilidades|ficou comigo|meu nome|minhas atividades/.test(q)){
    const r=mine.filter(x=>new Date(x.start_at)>=new Date()).slice(0,10);
    return r.length?'Estas são suas próximas responsabilidades:\n\n'+r.map(detailed).join('\n\n'):'Não encontrei próximas atividades atribuídas a você no período carregado.';
  }
  const names=[...new Set(rows.map(x=>x.title).filter(Boolean))].sort((a,b)=>b.length-a.length);
  const title=names.find(n=>q.includes(norm(n)));
  if(title){
    const r=mine.filter(x=>x.title===title).slice(0,8);
    return r.length?'Sobre '+title+', encontrei:\n\n'+r.map(detailed).join('\n\n'):'Não encontrei '+title+' entre as ações vinculadas a você neste período.';
  }
  const next=mine.filter(x=>new Date(x.start_at)>=new Date()).slice(0,5);
  return 'Estou usando o modo operacional gratuito do Jhonatão, sem API externa. Posso responder sobre hoje, suas responsabilidades, oficinas específicas e cadastros pendentes.'+(next.length?'\n\nPróximas ações:\n'+next.map(fmt).join('\n'):'');
}
window.JhonataoFreeFallback=freeOperationalAnswer;

function fileToDataUrl(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||''));
    reader.onerror=()=>reject(reader.error||new Error('Não foi possível ler a imagem.'));
    reader.readAsDataURL(file);
  });
}
window.JhonataoGetPendingMedia=async()=>{
  if(!state.pendingImage)return {};
  return {image_data_url:await fileToDataUrl(state.pendingImage)};
};
window.JhonataoClearPendingMedia=()=>clearPhoto();
