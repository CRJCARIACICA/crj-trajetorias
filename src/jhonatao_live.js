const LANG='pt-BR';
const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition||null;
const liveState={
  active:false, muted:false, speaker:true, recognition:null, overlay:null,
  startedAt:0, timer:null, observer:null, speaking:false, waiting:false,
  lastSpoken:'', ended:false
};

const $=(s,r=document)=>r.querySelector(s);

function cleanSpeech(raw=''){
  let t=String(raw||'');
  t=t.replace(/\[([^\]]+)\]\((?:https?:\/\/)?[^)]+\)/g,'$1');
  t=t.replace(/https?:\/\/\S+/gi,' link ');
  t=t.replace(/www\.\S+/gi,' link ');
  t=t.replace(/R\$\s*/g,' ');
  t=t.replace(/(\d+(?:[.,]\d+)?)\s*%/g,'$1 por cento');
  t=t.replace(/&/g,' e ').replace(/@/g,' arroba ');
  t=t.replace(/[•▪◦●○■□◆◇►▶✓✔✦✧*#_~`|<>\[\]{}\\/]+/g,' ');
  t=t.replace(/[—–]/g,', ');
  t=t.replace(/[:;]+/g,', ');
  t=t.replace(/\(([^)]+)\)/g,', $1,');
  try{t=t.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu,' ')}catch{}
  t=t.replace(/\s*\n+\s*/g,'. ');
  t=t.replace(/\s+/g,' ').replace(/\s+([,.!?])/g,'$1').trim();
  return t;
}
function conversationalize(text=''){
  let t=cleanSpeech(text);
  if(!t)return t;
  if(/^(meu cria|parceiro|chefe|menor\b)/i.test(t))return t;
  let h=7;for(const ch of t.slice(0,96))h=(h*33+ch.charCodeAt(0))>>>0;
  if(h%5!==0)return t;
  const openers=['Meu cria','Parceiro','Chefe','Menor'];
  const opener=openers[h%openers.length];
  return opener+', '+t.charAt(0).toLowerCase()+t.slice(1);
}
function splitSpeech(text=''){
  const out=[];
  const parts=text.match(/[^.!?]+[.!?]?/g)||[text];
  for(const p0 of parts){
    let p=p0.trim();if(!p)continue;
    while(p.length>190){
      let cut=p.lastIndexOf(',',185);if(cut<90)cut=p.lastIndexOf(' ',185);if(cut<70)cut=185;
      out.push(p.slice(0,cut).trim());p=p.slice(cut+1).trim();
    }
    if(p)out.push(p);
  }
  return out;
}
function voiceScore(v){
  const n=(v.name||'').toLowerCase(),l=(v.lang||'').toLowerCase();
  let s=0;
  if(l==='pt-br')s+=120; else if(l.startsWith('pt'))s+=70;
  if(/natural|neural|premium|enhanced|online/.test(n))s+=45;
  if(/google|microsoft|apple/.test(n))s+=18;
  if(/francisca|antonio|luciana|felipe|daniel/.test(n))s+=10;
  if(v.localService===false)s+=4;
  return s;
}
function chooseVoice(){
  const voices=speechSynthesis.getVoices();
  const pt=voices.filter(v=>(v.lang||'').toLowerCase().startsWith('pt'));
  return pt.sort((a,b)=>voiceScore(b)-voiceScore(a))[0]||voices[0]||null;
}
function setCallState(mode,label){
  const shell=$('.jh-call-shell');
  const stateEl=$('#jh-call-state');
  if(!shell||!stateEl)return;
  shell.classList.remove('listening','thinking','speaking','muted','error');
  if(mode)shell.classList.add(mode);
  stateEl.textContent=label||'conectado';
}
function formatDuration(){
  const sec=Math.max(0,Math.floor((Date.now()-liveState.startedAt)/1000));
  return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
}
function startTimer(){
  clearInterval(liveState.timer);
  liveState.startedAt=Date.now();
  const tick=()=>{const el=$('#jh-call-duration');if(el)el.textContent=formatDuration()};
  tick();liveState.timer=setInterval(tick,1000);
}
function stopTimer(){clearInterval(liveState.timer);liveState.timer=null}

function overlayHTML(){
  return `<div class="jh-call-shell" role="dialog" aria-modal="true" aria-label="Chamada de voz com Jhonatão">
    <div class="jh-call-grid"></div>
    <header class="jh-call-head">
      <div class="jh-call-link"><i></i><span>CRJ TRAJETÓRIAS</span><small>canal seguro</small></div>
      <time id="jh-call-duration">00:00</time>
    </header>
    <main class="jh-call-main">
      <div class="jh-call-orb">
        <span class="orbit o1"></span><span class="orbit o2"></span><span class="orbit o3"></span>
        <span class="scan"></span>
        <div class="core"><b>J</b></div>
      </div>
      <h1>JHONATÃO</h1>
      <p>assistente operacional do CRJ</p>
      <div class="jh-call-status" id="jh-call-state">conectando…</div>
      <div class="jh-call-wave" aria-hidden="true">
        <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
      </div>
    </main>
    <footer class="jh-call-controls">
      <button type="button" data-call-mute><span>🎤</span><small>microfone</small></button>
      <button type="button" data-call-speaker><span>🔊</span><small>áudio</small></button>
      <button type="button" class="hangup" data-call-end><span>☎</span><small>encerrar</small></button>
    </footer>
    <div class="jh-call-privacy">modo chamada • conversa visual oculta</div>
  </div>`;
}
function makeOverlay(){
  const host=document.createElement('div');
  host.className='jh-call-overlay';host.id='jh-call-overlay';host.innerHTML=overlayHTML();
  document.body.appendChild(host);document.body.classList.add('jh-call-active');
  liveState.overlay=host;
  $('[data-call-end]',host)?.addEventListener('click',endCall);
  $('[data-call-mute]',host)?.addEventListener('click',toggleMute);
  $('[data-call-speaker]',host)?.addEventListener('click',toggleSpeaker);
  startTimer();
}
function removeOverlay(){
  liveState.overlay?.remove();liveState.overlay=null;
  document.body.classList.remove('jh-call-active');stopTimer();
}

function ensureRecognition(){
  if(!Recognition)throw new Error('Reconhecimento de voz não disponível neste navegador.');
  if(liveState.recognition)return liveState.recognition;
  const r=new Recognition();
  r.lang=LANG;r.continuous=false;r.interimResults=true;r.maxAlternatives=1;
  r.onstart=()=>{
    if(!liveState.active||liveState.muted){try{r.abort()}catch{};return}
    setCallState('listening','ouvindo você');
  };
  r.onresult=e=>{
    let final='';
    for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal)final+=e.results[i][0]?.transcript||'';
    if(!final.trim())return;
    liveState.waiting=true;
    setCallState('thinking','pensando…');
    const input=$('#jh-chat-form textarea');
    if(input){
      input.value=final.trim();
      setTimeout(()=>$('#jh-chat-form')?.requestSubmit(),80);
    }
  };
  r.onerror=e=>{
    if(!liveState.active)return;
    if(e.error==='not-allowed'){setCallState('error','microfone bloqueado');return}
    if(!liveState.muted&&!liveState.waiting&&!liveState.speaking)setTimeout(startListening,700);
  };
  r.onend=()=>{
    if(liveState.active&&!liveState.muted&&!liveState.waiting&&!liveState.speaking)setTimeout(startListening,500);
  };
  liveState.recognition=r;return r;
}
function startListening(){
  if(!liveState.active||liveState.muted||liveState.waiting||liveState.speaking)return;
  try{ensureRecognition().start()}catch{setTimeout(()=>{if(liveState.active)startListening()},650)}
}
function stopListening(){try{liveState.recognition?.abort()}catch{}}

async function speakResponse(raw){
  if(!liveState.active)return;
  const text=conversationalize(raw);
  if(!text){liveState.waiting=false;startListening();return}
  if(!liveState.speaker){liveState.waiting=false;setCallState('listening','ouvindo você');startListening();return}
  liveState.speaking=true;liveState.waiting=false;stopListening();
  setCallState('speaking','falando');
  speechSynthesis.cancel();
  const chunks=splitSpeech(text),voice=chooseVoice();
  for(const chunk of chunks){
    if(!liveState.active||!liveState.speaker)break;
    await new Promise(resolve=>{
      const u=new SpeechSynthesisUtterance(chunk);
      u.lang=LANG;if(voice)u.voice=voice;
      u.rate=.96;u.pitch=.96;u.volume=1;
      u.onend=resolve;u.onerror=resolve;
      speechSynthesis.speak(u);
    });
    await new Promise(r=>setTimeout(r,75));
  }
  liveState.speaking=false;
  if(liveState.active&&!liveState.muted){
    setCallState('listening','ouvindo você');setTimeout(startListening,320);
  }
}
function watchResponses(){
  liveState.observer?.disconnect();
  const log=$('#jh-chat-log');if(!log)return;
  let timer=null;
  liveState.observer=new MutationObserver(()=>{
    clearTimeout(timer);
    timer=setTimeout(()=>{
      if(!liveState.active)return;
      const send=$('#jh-chat-form button[type="submit"]');
      if(send?.disabled)return;
      const msgs=[...document.querySelectorAll('#jh-chat-log .jh-msg.assistant div')];
      const text=(msgs.at(-1)?.textContent||'').trim();
      if(!text||text===liveState.lastSpoken)return;
      liveState.lastSpoken=text;speakResponse(text);
    },420);
  });
  liveState.observer.observe(log,{childList:true,subtree:true,characterData:true});
}

function disableLegacyVoice(){
  const old=$('[data-jh-mm-speak].active');
  if(old)old.click();
}
function startCall(){
  if(liveState.active)return;
  if(!Recognition||!('speechSynthesis' in window)){
    const status=$('#jh-mm-status');
    if(status)status.textContent='O modo chamada precisa de voz compatível no navegador.';
    return;
  }
  disableLegacyVoice();
  liveState.active=true;liveState.ended=false;liveState.muted=false;liveState.speaker=true;
  liveState.waiting=false;liveState.speaking=false;liveState.lastSpoken='';
  makeOverlay();watchResponses();
  setCallState('thinking','conectando…');
  setTimeout(()=>{setCallState('listening','ouvindo você');startListening()},550);
}
function endCall(){
  if(!liveState.active)return;
  liveState.active=false;liveState.ended=true;liveState.waiting=false;liveState.speaking=false;
  stopListening();speechSynthesis.cancel();liveState.observer?.disconnect();liveState.observer=null;
  removeOverlay();
}
function toggleMute(){
  liveState.muted=!liveState.muted;
  $('[data-call-mute]')?.classList.toggle('active',liveState.muted);
  if(liveState.muted){stopListening();setCallState('muted','microfone mutado')}
  else{setCallState('listening','ouvindo você');startListening()}
}
function toggleSpeaker(){
  liveState.speaker=!liveState.speaker;
  $('[data-call-speaker]')?.classList.toggle('active',!liveState.speaker);
  if(!liveState.speaker)speechSynthesis.cancel();
  if(liveState.active&&!liveState.muted&&!liveState.waiting){setCallState('listening','ouvindo você');startListening()}
}

function interceptLiveButton(){
  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('[data-jh-mm-live]');
    if(!btn)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(liveState.active)endCall();else startCall();
  },true);
}
function restyleLiveButton(){
  const b=$('[data-jh-mm-live]');
  if(!b||b.dataset.jhLiveReady==='1')return;
  b.dataset.jhLiveReady='1';
  b.innerHTML='◉ <span>Live</span>';
  b.title='Iniciar chamada com Jhonatão';
}
let uiWatchScheduled=false;
const uiWatch=new MutationObserver(()=>{
  if(uiWatchScheduled)return;
  uiWatchScheduled=true;
  requestAnimationFrame(()=>{
    uiWatchScheduled=false;
    restyleLiveButton();
  });
});
uiWatch.observe(document.documentElement,{childList:true,subtree:true});
interceptLiveButton();restyleLiveButton();

window.JhonataoLiveActive=()=>liveState.active;
window.addEventListener('beforeunload',()=>{if(liveState.active)endCall()});
