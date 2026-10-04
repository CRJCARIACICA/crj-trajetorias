import { CONFIG } from './config.js';
import { apiMode, supabaseClient } from './api.js?v=20261004-2';

const TZ='America/Sao_Paulo';
const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const nl=(v='')=>esc(v).replace(/\n/g,'<br>');
const pad=n=>String(n).padStart(2,'0');

function localDateISO(d=new Date()){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
  const g=t=>p.find(x=>x.type===t)?.value||'';
  return `${g('year')}-${g('month')}-${g('day')}`;
}
function parseDate(s){return new Date(`${s}T12:00:00-03:00`)}
function dateISO(d){return [d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-')}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function addMonths(d,n){const x=new Date(d);x.setDate(1);x.setMonth(x.getMonth()+n);return x}
function startOfWeek(d){const x=new Date(d);const dow=x.getDay();x.setDate(x.getDate()-dow);return x}
function monthBounds(d){return {from:dateISO(new Date(d.getFullYear(),d.getMonth(),1)),to:dateISO(new Date(d.getFullYear(),d.getMonth()+1,0))}}
function viewBounds(view,anchor){
  const d=parseDate(anchor);
  if(view==='day')return {from:anchor,to:anchor};
  if(view==='week'){const s=startOfWeek(d);return {from:dateISO(s),to:dateISO(addDays(s,6))}}
  return monthBounds(d);
}
function fmtTime(v){
  if(!v)return '—';
  return new Intl.DateTimeFormat('pt-BR',{timeZone:TZ,hour:'2-digit',minute:'2-digit'}).format(new Date(v));
}
function fmtDate(v,weekday=false){
  if(!v)return '—';
  return new Intl.DateTimeFormat('pt-BR',{timeZone:TZ,weekday:weekday?'long':undefined,day:'2-digit',month:'2-digit'}).format(new Date(v));
}
function sameDate(item,date){return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(item.start_at))===date}
function routeState(){
  const raw=(location.hash||'#jhonatao').split('?')[1]||'';
  const q=new URLSearchParams(raw);
  const view=['day','week','month'].includes(q.get('view'))?q.get('view'):'day';
  const date=/^\d{4}-\d{2}-\d{2}$/.test(q.get('date')||'')?q.get('date'):localDateISO();
  const mine=q.has('mine')?q.get('mine')!=='0':view==='day';
  return {view,date,mine};
}
function setRoute(patch){
  const s={...routeState(),...patch};
  location.hash=`jhonatao?view=${s.view}&date=${s.date}&mine=${s.mine?'1':'0'}`;
}
function sourceLabel(v){return ({workshop:'Oficina',calendar_event:'Agenda',cfdh:'CFDH'})[v]||v||'Atividade'}
function statusLabel(v){return String(v||'').replaceAll('_',' ')}
function itemCard(x,{compact=false}={}){
  const tasks=Array.isArray(x.responsibilities)?x.responsibilities:[];
  return `<article class="jh-item ${x.is_mine?'mine':''}" data-jh-item="${esc(x.item_key)}">
    <div class="jh-item-top">
      <div><span class="pill ${x.is_mine?'success':'info'}">${x.is_mine?'Minha responsabilidade':sourceLabel(x.source_type)}</span>
      <h4>${esc(x.title)}</h4></div>
      <div class="jh-time">${fmtTime(x.start_at)}${x.end_at?'–'+fmtTime(x.end_at):''}</div>
    </div>
    <div class="jh-meta"><span>${esc(x.location||'Local não informado')}</span><span>·</span><span>${esc(x.team||sourceLabel(x.source_type))}</span>${x.responsibility_basis?`<span>·</span><b>${esc(x.responsibility_basis)}</b>`:''}</div>
    ${!compact&&x.description?`<p class="jh-desc">${esc(x.description)}</p>`:''}
    ${x.is_mine&&tasks.length?`<div class="jh-responsibilities"><b>O que fica com você</b><ul>${tasks.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div>`:''}
  </article>`;
}
function groupByDate(items){
  const map=new Map();
  for(const x of items){
    const d=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x.start_at));
    const arr=map.get(d)||[];arr.push(x);map.set(d,arr);
  }
  return map;
}
function dayView(items,date){
  const rows=items.filter(x=>sameDate(x,date));
  return `<div class="jh-day">
    <div class="jh-day-title"><div><small>${new Intl.DateTimeFormat('pt-BR',{weekday:'long',timeZone:TZ}).format(parseDate(date))}</small><h3>${new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'long',year:'numeric',timeZone:TZ}).format(parseDate(date))}</h3></div><span class="pill info">${rows.length} ação(ões)</span></div>
    <div class="jh-day-list">${rows.map(x=>itemCard(x)).join('')||'<div class="empty">Nenhuma ação encontrada para este dia e filtro.</div>'}</div>
  </div>`;
}
function weekView(items,date){
  const s=startOfWeek(parseDate(date)),g=groupByDate(items);
  const days=Array.from({length:7},(_,i)=>addDays(s,i));
  return `<div class="jh-week">${days.map(d=>{const iso=dateISO(d),rows=g.get(iso)||[];return `<section class="jh-week-day ${iso===localDateISO()?'today':''}">
    <header><b>${new Intl.DateTimeFormat('pt-BR',{weekday:'short'}).format(d)}</b><span>${pad(d.getDate())}/${pad(d.getMonth()+1)}</span></header>
    <div class="jh-week-items">${rows.map(x=>itemCard(x,{compact:true})).join('')||'<span class="muted">Sem ações</span>'}</div>
  </section>`}).join('')}</div>`;
}
function monthView(items,date){
  const d=parseDate(date),first=new Date(d.getFullYear(),d.getMonth(),1),last=new Date(d.getFullYear(),d.getMonth()+1,0),g=groupByDate(items);
  const blanks=first.getDay(),cells=[];
  for(let i=0;i<blanks;i++)cells.push('<div class="jh-month-day empty-cell"></div>');
  for(let day=1;day<=last.getDate();day++){
    const dt=new Date(d.getFullYear(),d.getMonth(),day),iso=dateISO(dt),rows=g.get(iso)||[];
    cells.push(`<button class="jh-month-day ${iso===localDateISO()?'today':''}" data-jh-open-day="${iso}">
      <span class="jh-day-number">${day}</span>
      <span class="jh-month-count">${rows.length?rows.length+' ação(ões)':''}</span>
      <span class="jh-month-chips">${rows.slice(0,3).map(x=>`<span class="${x.is_mine?'mine':''}">${fmtTime(x.start_at)} ${esc(x.title)}</span>`).join('')}${rows.length>3?`<small>+${rows.length-3}</small>`:''}</span>
    </button>`);
  }
  return `<div class="jh-month-head">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(x=>`<b>${x}</b>`).join('')}</div><div class="jh-month">${cells.join('')}</div>`;
}
async function fetchCalendar(view,date,mine){
  if(apiMode()!=='live')return [];
  const c=supabaseClient(),b=viewBounds(view,date);
  const {data,error}=await c.rpc('get_jhonatao_calendar',{p_from:b.from,p_to:b.to,p_only_mine:mine});
  if(error)throw error;
  return data||[];
}
async function fetchAlerts(){
  if(apiMode()!=='live')return [];
  const c=supabaseClient();
  const {data,error}=await c.from('staff_notifications').select('id,title,message,read_at,created_at,source_type,source_id')
    .eq('notification_type','jhonatao_30min').order('created_at',{ascending:false}).limit(20);
  if(error)throw error;
  return data||[];
}
async function fetchChat(){
  if(apiMode()!=='live')return [];
  const c=supabaseClient();
  const {data,error}=await c.from('jhonatao_chat_messages').select('id,role,content,created_at').order('created_at',{ascending:true}).limit(60);
  if(error)throw error;
  return data||[];
}
function chatHtml(rows){
  return rows.map(m=>`<div class="jh-msg ${m.role==='user'?'user':'assistant'}"><b>${m.role==='user'?'Você':'Jhonatão'}</b><div>${nl(m.content)}</div></div>`).join('')||
    '<div class="jh-chat-empty">Pergunte ao Jhonatão sobre sua agenda, responsabilidades, pendências e prioridades.</div>';
}
function periodTitle(view,date){
  const d=parseDate(date);
  if(view==='day')return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'long',year:'numeric'}).format(d);
  if(view==='week'){const s=startOfWeek(d),e=addDays(s,6);return `${pad(s.getDate())}/${pad(s.getMonth()+1)} a ${pad(e.getDate())}/${pad(e.getMonth()+1)}`;}
  return new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(d);
}
function navDate(view,date,dir){
  const d=parseDate(date);
  if(view==='day')return dateISO(addDays(d,dir));
  if(view==='week')return dateISO(addDays(d,dir*7));
  return dateISO(addMonths(d,dir));
}

export async function renderJhonataoPage(user){
  const s=routeState();
  const [items,alerts,chat]=await Promise.all([fetchCalendar(s.view,s.date,s.mine),fetchAlerts(),fetchChat()]);
  window.__JHONATAO_DATA__={items,alerts,chat,state:s};
  const mineCount=items.filter(x=>x.is_mine).length;
  const pendingCount=items.flatMap(x=>x.responsibilities||[]).filter(x=>/cadastro|pend[eê]ncia|procure/i.test(x)).length;
  const calendar=s.view==='day'?dayView(items,s.date):s.view==='week'?weekView(items,s.date):monthView(items,s.date);
  return `<div class="jh-shell">
    <section class="jh-hero">
      <div><span class="jh-bot-mark">J</span><div><small>ASSISTENTE OPERACIONAL</small><h2>Jhonatão</h2><p>Olá, ${esc((user?.display_name||'').split(' ')[0])}. Eu cruzo agenda, função, oficinas, CFDH e pendências para mostrar o que realmente fica com você.</p></div></div>
      <div class="jh-hero-actions"><button class="btn secondary" data-jh-notify>🔔 Ativar avisos do navegador</button><a class="btn" href="#agenda">Agenda técnica</a></div>
    </section>

    <div class="grid cards jh-kpis">
      <div class="card kpi"><div class="label">Ações no período</div><div class="value">${items.length}</div></div>
      <div class="card kpi"><div class="label">Com meu nome</div><div class="value">${mineCount}</div></div>
      <div class="card kpi"><div class="label">Pendências detectadas</div><div class="value">${pendingCount}</div></div>
      <div class="card kpi"><div class="label">Alertas 30 min</div><div class="value">${alerts.filter(x=>!x.read_at).length}</div></div>
    </div>

    <section class="card jh-calendar-card">
      <div class="jh-toolbar">
        <div class="jh-segment">
          <button class="${s.view==='day'?'active':''}" data-jh-view="day">Dia</button>
          <button class="${s.view==='week'?'active':''}" data-jh-view="week">Semana</button>
          <button class="${s.view==='month'?'active':''}" data-jh-view="month">Mês</button>
        </div>
        <div class="jh-period-nav"><button class="btn ghost" data-jh-prev>←</button><button class="btn ghost" data-jh-today>Hoje</button><b>${esc(periodTitle(s.view,s.date))}</b><button class="btn ghost" data-jh-next>→</button></div>
        <label class="jh-mine-toggle"><input type="checkbox" data-jh-mine ${s.mine?'checked':''}> <span>Mostrar só o que ficou comigo</span></label>
      </div>
      <div class="jh-filter-note">${s.mine?'Exibindo apenas ações em que você está vinculado como responsável, educador, oficineiro, organização ou equipe.':'Exibindo o calendário geral visível para sua função.'}</div>
      ${calendar}
    </section>

    <div class="jh-bottom-grid">
      <section class="card jh-alerts">
        <div class="page-head"><div><h3>Alertas do Jhonatão</h3><p>O sistema gera o aviso automaticamente 30 minutos antes da atividade.</p></div></div>
        <div class="jh-alert-list">${alerts.slice(0,10).map(a=>`<button class="jh-alert ${a.read_at?'':'unread'}" data-jh-alert-id="${a.id}">
          <b>${esc(a.title)}</b><span>${nl(a.message||'')}</span><small>${new Date(a.created_at).toLocaleString('pt-BR')}</small>
        </button>`).join('')||'<div class="empty">Nenhum alerta do Jhonatão ainda.</div>'}</div>
        <div class="notice" style="margin-top:12px">O aviso interno é gerado no servidor. A notificação do navegador aparece enquanto o site estiver aberto ou em segundo plano no navegador.</div>
      </section>

      <section class="card jh-chat-card">
        <div class="jh-chat-head"><div><span class="jh-bot-mark small">J</span><div><h3>Fale com o Jhonatão</h3><small>Respostas baseadas nos dados atuais do CRJ</small></div></div><button class="btn ghost" data-jh-clear-chat title="Limpar conversa">Limpar</button></div>
        <div class="jh-suggestions">
          <button data-jh-suggest="O que eu tenho que fazer hoje?">O que tenho hoje?</button>
          <button data-jh-suggest="Quais são minhas responsabilidades nesta semana?">Minha semana</button>
          <button data-jh-suggest="Quem eu preciso procurar por cadastro pendente?">Cadastros pendentes</button>
          <button data-jh-suggest="Quais ações deste mês envolvem meu nome e qual é minha responsabilidade em cada uma?">Meu mês</button>
        </div>
        <div class="jh-chat-log" id="jh-chat-log">${chatHtml(chat)}</div>
        <form id="jh-chat-form" class="jh-chat-form" data-no-draft>
          <textarea name="message" rows="2" maxlength="4000" placeholder="Ex.: Jhonatão, o que ficou comigo no jiu-jitsu esta semana?" required></textarea>
          <button class="btn primary" type="submit">Enviar</button>
        </form>
        <div class="jh-chat-status" id="jh-chat-status"></div>
      </section>
    </div>
  </div>`;
}

async function markAlertRead(id){
  const c=supabaseClient();
  const {error}=await c.from('staff_notifications').update({read_at:new Date().toISOString()}).eq('id',id);
  if(error)throw error;
}
async function requestBrowserNotifications(toast){
  if(!('Notification' in window)){toast('Este navegador não oferece notificações do sistema.','warn');return;}
  const result=await Notification.requestPermission();
  if(result==='granted'){
    try{
      const c=supabaseClient();
      await c.from('jhonatao_preferences').upsert({user_id:(await c.auth.getUser()).data.user.id,browser_notifications:true,alert_minutes:30,updated_at:new Date().toISOString()});
    }catch{}
    toast('Avisos do Jhonatão ativados neste navegador.','success');
  }else toast('Permissão de notificação não foi concedida.','warn');
}
function scrollChat(){const el=document.querySelector('#jh-chat-log');if(el)el.scrollTop=el.scrollHeight}
function appendLiveAssistant(){
  const log=document.querySelector('#jh-chat-log');if(!log)return null;
  log.querySelector('.jh-chat-empty')?.remove();
  const el=document.createElement('div');el.className='jh-msg assistant streaming';
  el.innerHTML='<b>Jhonatão</b><div></div>';log.appendChild(el);scrollChat();return el.querySelector('div');
}
function appendUserMessage(text){
  const log=document.querySelector('#jh-chat-log');if(!log)return;
  log.querySelector('.jh-chat-empty')?.remove();
  const el=document.createElement('div');el.className='jh-msg user';el.innerHTML='<b>Você</b><div></div>';el.querySelector('div').textContent=text;log.appendChild(el);scrollChat();
}
async function streamChat(message){
  const c=supabaseClient();
  const {data:sessionData,error:sessionError}=await c.auth.getSession();
  if(sessionError||!sessionData.session)throw new Error('Sua sessão expirou. Entre novamente.');
  const {error:insertError}=await c.from('jhonatao_chat_messages').insert({role:'user',content:message});
  if(insertError)throw insertError;

  let media={};
  try{media=await window.JhonataoGetPendingMedia?.()||{}}catch(err){console.warn('Falha ao preparar mídia:',err)}
  const response=await fetch(`${CONFIG.supabaseUrl}/functions/v1/jhonatao-chat`,{
    method:'POST',
    headers:{'Authorization':`Bearer ${sessionData.session.access_token}`,'Content-Type':'application/json','apikey':CONFIG.supabasePublishableKey},
    body:JSON.stringify({message,...media})
  });
  if(!response.ok){
    let detail='';try{const j=await response.json();detail=j.error||j.detail||''}catch{detail=await response.text()}
    throw new Error(detail||'O Jhonatão não conseguiu responder.');
  }
  if(!response.body)throw new Error('Resposta sem conteúdo.');

  const target=appendLiveAssistant();
  let answer='',buffer='';
  const reader=response.body.getReader(),decoder=new TextDecoder();
  while(true){
    const {done,value}=await reader.read();if(done)break;
    buffer+=decoder.decode(value,{stream:true});
    const events=buffer.split('\n\n');buffer=events.pop()||'';
    for(const block of events){
      for(const line of block.split('\n')){
        if(!line.startsWith('data:'))continue;
        const raw=line.slice(5).trim();if(!raw||raw==='[DONE]')continue;
        try{
          const evt=JSON.parse(raw);
          if(evt.type==='response.output_text.delta'&&evt.delta){
            answer+=evt.delta;if(target){target.textContent=answer;scrollChat();}
          }
          if(evt.type==='error')throw new Error(evt.message||'Falha na resposta da OpenAI.');
        }catch(err){if(err instanceof SyntaxError)continue;throw err}
      }
    }
  }
  if(!answer.trim())answer='Não consegui gerar uma resposta agora.';
  if(target)target.textContent=answer;
  const {error:saveError}=await c.from('jhonatao_chat_messages').insert({role:'assistant',content:answer});
  if(saveError)console.warn('Não foi possível salvar a resposta do Jhonatão:',saveError);
  try{window.JhonataoClearPendingMedia?.()}catch{}
  return answer;
}

export async function checkJhonataoAlerts({toast,nav}={}){
  if(apiMode()!=='live')return 0;
  const c=supabaseClient();
  const since=new Date(Date.now()-2*60*60*1000).toISOString();
  const {data,error}=await c.from('staff_notifications').select('id,title,message,created_at,read_at')
    .eq('notification_type','jhonatao_30min').gte('created_at',since).order('created_at',{ascending:false}).limit(10);
  if(error)return 0;
  const key='jhonatao_seen_browser_notifications_v1';
  let seen=[];try{seen=JSON.parse(localStorage.getItem(key)||'[]')}catch{}
  const seenSet=new Set(seen);
  const fresh=(data||[]).filter(x=>!seenSet.has(x.id));
  for(const x of fresh.reverse()){
    toast?.(x.title,'info');
    if('Notification' in window&&Notification.permission==='granted'){
      const n=new Notification(x.title,{body:x.message||'',tag:`jhonatao-${x.id}`});
      n.onclick=()=>{window.focus();nav?.('jhonatao?view=day&date='+localDateISO()+'&mine=1');n.close();};
    }
    seenSet.add(x.id);
  }
  localStorage.setItem(key,JSON.stringify([...seenSet].slice(-100)));
  return fresh.length;
}

export async function bindJhonataoPage(user,{toast,rerender,nav}={}){
  document.querySelectorAll('[data-jh-view]').forEach(b=>b.addEventListener('click',()=>setRoute({view:b.dataset.jhView,mine:b.dataset.jhView==='day'?true:routeState().mine})));
  document.querySelector('[data-jh-prev]')?.addEventListener('click',()=>{const s=routeState();setRoute({date:navDate(s.view,s.date,-1)})});
  document.querySelector('[data-jh-next]')?.addEventListener('click',()=>{const s=routeState();setRoute({date:navDate(s.view,s.date,1)})});
  document.querySelector('[data-jh-today]')?.addEventListener('click',()=>setRoute({date:localDateISO()}));
  document.querySelector('[data-jh-mine]')?.addEventListener('change',e=>setRoute({mine:e.target.checked}));
  document.querySelectorAll('[data-jh-open-day]').forEach(b=>b.addEventListener('click',()=>setRoute({view:'day',date:b.dataset.jhOpenDay,mine:true})));
  document.querySelector('[data-jh-notify]')?.addEventListener('click',()=>requestBrowserNotifications(toast||(()=>{})));
  document.querySelectorAll('[data-jh-alert-id]').forEach(b=>b.addEventListener('click',async()=>{try{await markAlertRead(b.dataset.jhAlertId);b.classList.remove('unread');toast?.('Alerta marcado como lido.','success')}catch(err){toast?.(err.message,'danger')}}));

  const input=document.querySelector('#jh-chat-form textarea');
  document.querySelectorAll('[data-jh-suggest]').forEach(b=>b.addEventListener('click',()=>{if(input){input.value=b.dataset.jhSuggest;input.focus()}}));
  document.querySelector('[data-jh-clear-chat]')?.addEventListener('click',async()=>{
    if(apiMode()!=='live')return;
    try{const c=supabaseClient();const {error}=await c.from('jhonatao_chat_messages').delete().eq('user_id',user.id);if(error)throw error;await rerender?.();toast?.('Conversa limpa.','success')}catch(err){toast?.(err.message,'danger')}
  });
  document.querySelector('#jh-chat-form')?.addEventListener('submit',async e=>{
    e.preventDefault();const form=e.currentTarget,fd=new FormData(form),message=String(fd.get('message')||'').trim();if(!message)return;
    const btn=form.querySelector('button[type="submit"]'),status=document.querySelector('#jh-chat-status');
    appendUserMessage(message);input.value='';btn.disabled=true;if(status)status.textContent='Jhonatão está consultando sua agenda e responsabilidades…';
    try{await streamChat(message);if(status)status.textContent='';}
    catch(err){
      const fallback=window.JhonataoFreeFallback?.(message);
      if(fallback){
        const target=appendLiveAssistant();if(target)target.textContent=fallback;
        try{const c=supabaseClient();await c.from('jhonatao_chat_messages').insert({role:'assistant',content:fallback})}catch{}
        if(status)status.innerHTML='<span class="notice">Modo operacional gratuito ativo — nenhuma API externa foi usada.</span>';
      }else{
        if(status)status.innerHTML=`<span class="notice danger">${esc(err.message)}</span>`;
        toast?.(err.message,'danger');
      }
    }
    finally{btn.disabled=false;input.focus();}
  });
  scrollChat();
  await checkJhonataoAlerts({toast,nav});
}
