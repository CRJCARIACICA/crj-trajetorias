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

function ui(){
  const mic=SpeechRecognitionCtor?'Disponível':'Indisponível neste navegador';
  const speak=browserCanSpeak()?'Disponível':'Indisponível';
  const photo=browserCanPhoto()?'Captura disponível':'Indisponível';
  return `
    <div class="jh-mm-account" id="jh-mm-account">
      <div>
        <div class="jh-mm-account-title"><span class="jh-mm-dot"></span><b>${esc(accountLabel())}</b></div>
        <small>${esc(planDetail())}</small>
      </div>
      <button type="button" class="btn secondary" data-jh-mm-connect>Continuar com ChatGPT</button>
    </div>

    <div class="jh-mm-tools" aria-label="Recursos multimodais do Jhonatão">
      <button type="button" class="jh-mm-tool" data-jh-mm-mic title="Falar para preencher a mensagem">🎤 <span>Falar</span></button>
      <button type="button" class="jh-mm-tool" data-jh-mm-photo title="Tirar ou anexar foto">📷 <span>Foto</span></button>
      <button type="button" class="jh-mm-tool ${state.voiceOutput?'active':''}" data-jh-mm-speak title="Ouvir respostas do Jhonatão">🔊 <span>Ouvir</span></button>
      <button type="button" class="jh-mm-tool live" data-jh-mm-live title="Conversa contínua por voz">🎧 <span>Modo voz</span></button>
      <input id="jh-mm-photo-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" capture="environment" hidden>
    </div>
    <div class="jh-mm-capabilities">
      <span>🎤 Voz: ${esc(mic)}</span>
      <span>🔊 Resposta falada: ${esc(speak)}</span>
      <span>📷 Foto: ${esc(photo)}</span>
      <span>✨ Visão/OpenAI Live: aguardando conexão autorizada</span>
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

function toggleMic(){
  if(state.listening){stopListening();setStatus('');return}
  startListening();
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
  if(!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)){
    setStatus('Use uma imagem PNG, JPEG, WEBP ou GIF.','warn');return;
  }
  if(file.size>12*1024*1024){
    setStatus('A foto está muito grande. Use uma imagem de até 12 MB.','warn');return;
  }
  clearPhoto();
  state.pendingImage=file;state.imageUrl=URL.createObjectURL(file);
  const box=qs('#jh-mm-photo-preview');if(!box)return;
  box.hidden=false;
  box.innerHTML=`<img src="${state.imageUrl}" alt="Foto pronta para anexar"><div><b>${esc(file.name||'Foto')}</b><small>${Math.max(1,Math.round(file.size/1024))} KB</small><p>A foto permanece somente neste navegador por enquanto. A análise visual será liberada quando a conexão OpenAI autorizada estiver ativa.</p></div><button type="button" data-jh-mm-remove-photo aria-label="Remover foto">×</button>`;
  qs('[data-jh-mm-remove-photo]',box)?.addEventListener('click',clearPhoto);
  setStatus('Foto preparada. Ela ainda não foi enviada para nenhum serviço externo.','info');
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
    if(state.pendingImage){
      setTimeout(()=>setStatus('Sua mensagem textual foi enviada. A foto não foi transmitida porque a conexão de visão/OpenAI ainda não está autorizada.','info'),50);
    }
  },true);
}

async function boot(){
  await loadPrefs();
  const watcher=new MutationObserver(()=>{if(isJhonatao())mount()});
  watcher.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>setTimeout(mount,50));
  mount();
  updateAccountUI();
}

boot();
