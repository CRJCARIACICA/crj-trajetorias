import { CONFIG } from './config.js';

let supabase=null,ctx=null,person=null,claimToken='',lastPresence=null,workshopQueue=[],confirmedWorkshops=[];
const app=document.querySelector('#access-app');
const token=new URLSearchParams(location.search).get('token')||'';
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const digits=v=>String(v||'').replace(/\D/g,'');
const localTime=()=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date());

async function db(){
  if(supabase)return supabase;
  const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm');
  supabase=mod.createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
  return supabase;
}
async function rpc(name,args={}){const c=await db(),{data,error}=await c.rpc(name,args);if(error)throw error;return data}
function baseCard(body){return `<main class="access-public-shell"><section class="access-public-card">${body}</section><p class="access-footer">CRJ Cariacica · Lista de Presença e Contato</p></main>`}
function top(){return `<div class="access-brand"><div class="access-mark">CRJ</div><div><b>CRJ Cariacica</b><small>Lista diária de Presença e Contato</small></div></div>`}
function stateMessage(title,text,type='info'){return baseCard(`${top()}<div class="access-message ${type}"><h2>${esc(title)}</h2><p>${esc(text)}</p></div>${type!=='danger'?'<button class="btn ghost access-big" data-restart>Voltar ao início</button>':''}`)}
function notice(root,message,type='warn'){root.querySelector('.access-inline-message')?.remove();const el=document.createElement('div');el.className=`access-message ${type} access-inline-message`;el.innerHTML=message;root.prepend(el)}
function personLabel(p){return p?.preferred_name||p?.display_name||p?.full_name||'Jovem'}

function startHtml(){return baseCard(`${top()}<div class="access-hero"><span class="access-kicker">${esc(ctx.shift_label||'Lista aberta')}</span><h1>Registre sua presença no CRJ</h1><p>Encontre seu cadastro, escolha os espaços que pretende usar e informe até que horas pretende ficar.</p></div><form id="identify-form" class="access-stack"><div class="access-choice-row"><label class="access-choice"><input type="radio" name="method" value="cpf" checked><span><b>Tenho meu CPF</b><small>Buscar pelo número do CPF</small></span></label><label class="access-choice"><input type="radio" name="method" value="name"><span><b>Não sei meu CPF</b><small>Buscar pelo meu nome</small></span></label></div><div class="field"><label data-id-label>CPF</label><input class="input" name="identifier" inputmode="numeric" autocomplete="off" required placeholder="Digite seu CPF"></div><button class="btn primary access-big" type="submit">Buscar cadastro</button><button class="btn ghost access-big" type="button" data-first-time>Não encontrei meu cadastro</button><p class="access-help">Ao buscar pelo nome, a <b>data de nascimento</b> confirma sua identidade. Dados já existentes no Formulário Inicial são reaproveitados automaticamente.</p></form>`)}
function searchResultsHtml(rows,method){return `<div class="access-search-results">${rows.map(y=>`<button type="button" class="access-person-result" data-youth="${y.youth_id}"><b>${esc(y.full_name)}</b><span>Nome preferido: ${esc(y.preferred_name||'não informado')} · Bairro: ${esc(y.neighborhood||'não informado')}</span></button>`).join('')}</div>${method==='name'?'<p class="access-help">Selecione seu nome e confirme pela data de nascimento.</p>':'<p class="access-help">Confira o nome antes de continuar.</p>'}`}
function confirmHtml(candidate,method,identifier){return baseCard(`${top()}<div class="access-hero compact"><span class="access-kicker">Confirmar cadastro</span><h1>${esc(candidate.full_name)}</h1><p>Nome preferido: <b>${esc(candidate.preferred_name||'não informado')}</b><br>Bairro: <b>${esc(candidate.neighborhood||'não informado')}</b></p></div><form id="confirm-form" class="access-stack"><input type="hidden" name="method" value="${esc(method)}"><input type="hidden" name="identifier" value="${esc(identifier||'')}">${method==='name'?'<div class="field"><label>Data de nascimento</label><input class="input" type="date" name="birth_date" required><small>Use sua data de nascimento para confirmar o cadastro.</small></div>':'<div class="access-message info"><b>Esse é o seu cadastro?</b><p>Se o nome estiver correto, confirme abaixo.</p></div>'}<button class="btn primary access-big" type="submit">Sim, este cadastro é meu</button><button class="btn ghost access-big" type="button" data-restart>Não sou eu / voltar</button></form>`)}
function profileHtml(p,{firstTime=false}={}){
  const needsSig=firstTime||!p?.has_signature;
  return baseCard(`${top()}<div class="access-hero compact"><span class="access-kicker">${firstTime?'Primeiro cadastro':'Completar cadastro'}</span><h1>${firstTime?'Só faltam alguns dados':'Vamos completar o que estiver faltando'}</h1><p>${firstTime?'Esses dados criam um Formulário Inicial parcial, que poderá ser completado depois.':'Os dados já existentes no Formulário Inicial foram reaproveitados automaticamente. Revise apenas o que ainda estiver faltando.'}</p></div><form id="profile-form" class="access-stack"><div class="field"><label>Nome completo</label><input class="input" name="full_name" value="${esc(p?.full_name||'')}" ${firstTime?'required':'readonly'}></div><div class="access-form-grid"><div class="field"><label>Data de nascimento</label><input class="input" type="date" name="birth_date" value="${esc(p?.birth_date||'')}" required></div><div class="field"><label>CPF <small>(pode ficar pendente)</small></label><input class="input" name="cpf" inputmode="numeric" value="${esc(p?.cpf||'')}"></div><div class="field"><label>Telefone</label><input class="input" name="phone" value="${esc(p?.phone||'')}" required></div><div class="field"><label>E-mail</label><input class="input" type="email" name="email" value="${esc(p?.email||'')}" required></div><div class="field"><label>Bairro</label><input class="input" name="neighborhood" value="${esc(p?.neighborhood||'')}" required></div></div>${needsSig?signatureMarkup():'<div class="access-message info"><b>Assinatura já cadastrada.</b><p>Ela continua vinculada ao seu cadastro. Para uma oficina sugerida ao final, será solicitada uma nova assinatura de confirmação.</p></div>'}<div class="access-message info"><b>Cadastro conectado à trajetória.</b><p>Se o Formulário Inicial ainda não estiver completo, ele continuará sinalizado para complementação posterior.</p></div><button class="btn primary access-big" type="submit">Salvar e continuar</button><button class="btn ghost access-big" type="button" data-restart>Cancelar</button></form>`)}
function signatureMarkup(text='Assine no quadro abaixo para confirmar este registro.'){return `<div class="access-signature-block"><label>Assinatura</label><p class="access-help">${esc(text)}</p><canvas class="access-signature" data-signature width="700" height="190"></canvas><div class="access-signature-actions"><button class="btn ghost" type="button" data-signature-clear>Limpar assinatura</button></div></div>`}
function roomsHtml(){const end=ctx.operation_end||'21:00';return baseCard(`${top()}<div class="access-hero compact"><span class="access-kicker">${esc(ctx.shift_label||'')}</span><h1>Olá, ${esc(personLabel(person))}! 👋</h1><p>Selecione todos os espaços que pretende usar hoje.</p></div><form id="room-form" class="access-stack"><div class="access-room-grid">${(ctx.rooms||[]).map(r=>`<label class="access-room"><input type="checkbox" name="room_ids" value="${r.id}"><span><b>${esc(r.name)}</b><small>${esc(r.description||'Espaço do CRJ')}${r.capacity!=null?' · capacidade '+r.capacity:''}</small></span></label>`).join('')}</div>${!(ctx.rooms||[]).length?'<div class="access-message warn"><p>Nenhum espaço está liberado para uso livre agora. Procure a recepção.</p></div>':''}<div class="field"><label>Até que horas você pretende ficar?</label><input class="input" type="time" name="expected_exit_time" value="${esc(end)}" max="${esc(end)}" required><small>O funcionamento de hoje vai até ${esc(end)}.</small></div><button class="btn primary access-big" type="submit" ${(ctx.rooms||[]).length?'':'disabled'}>Confirmar minha presença</button><button class="btn ghost access-big" type="button" data-restart>Voltar ao início</button></form>`)}

function workshopPromptHtml(w){const timing=w.in_progress?'A oficina está acontecendo agora.':`A oficina começa às ${esc(w.start_time||'')}.`;return baseCard(`${top()}<div class="access-hero compact"><span class="access-kicker">Presença inteligente</span><h1>E aí, ${esc(personLabel(person))}! 👋</h1><p>Seu uso livre já foi registrado.</p></div><div class="access-stack"><div class="access-message info"><h2>Podemos marcar sua presença na oficina “${esc(w.name)}”?</h2><p>${timing}${w.end_time?` Término previsto: ${esc(w.end_time)}.`:''}</p><p><b>Educador de Referência:</b> ${esc(w.educator_name||'Equipe do CRJ')}</p><p class="access-help">Esta sugestão aparece porque você está inscrito(a) nesta oficina ou já participou dela anteriormente.</p></div><button class="btn primary access-big" type="button" data-workshop-yes>Sim, vou participar</button><button class="btn ghost access-big" type="button" data-workshop-no>Não agora</button></div>`)}
function workshopSignHtml(w){
  const fields=[];
  if(!person?.cpf)fields.push(`<div class="field"><label>CPF <small>(pode ficar pendente)</small></label><input class="input" name="cpf" inputmode="numeric" placeholder="Digite se souber"></div>`);
  if(!person?.phone)fields.push(`<div class="field"><label>Telefone</label><input class="input" name="phone" required></div>`);
  if(!person?.email)fields.push(`<div class="field"><label>E-mail</label><input class="input" type="email" name="email" required></div>`);
  if(!person?.neighborhood)fields.push(`<div class="field"><label>Bairro</label><input class="input" name="neighborhood" required></div>`);
  return baseCard(`${top()}<div class="access-hero compact"><span class="access-kicker">Oficina · ${esc(w.name)}</span><h1>Confirme sua participação</h1><p>${fields.length?'Complete somente os dados que ainda estão faltando e assine.':'Seus dados já estão completos. Agora assine para confirmar sua presença na oficina.'}</p></div><form id="workshop-sign-form" class="access-stack">${fields.length?`<div class="access-form-grid">${fields.join('')}</div>`:'<div class="access-message info"><b>Dados reaproveitados do seu cadastro.</b><p>CPF, telefone, e-mail e bairro não precisam ser digitados novamente.</p></div>'}${signatureMarkup(`Assine novamente para confirmar especificamente sua presença na oficina ${w.name}.`)}<button class="btn primary access-big" type="submit">Assinar e marcar presença</button><button class="btn ghost access-big" type="button" data-workshop-back>Voltar</button></form>`)}
function workshopDeclinedHtml(w){const more=workshopQueue.length>1;return baseCard(`${top()}<div class="access-success"><div class="access-check">✓</div><h1>Obrigado, ${esc(personLabel(person))}!</h1><p>Sua presença no uso livre já está registrada.</p><div class="access-message warn" style="text-align:left"><b>Sobre a oficina “${esc(w.name)}”</b><p>Se decidir participar, procure o(a) Educador(a) de Referência <b>${esc(w.educator_name||'Equipe do CRJ')}</b> para registrar sua participação.</p></div><button class="btn primary access-big" data-decline-continue>${more?'Ver outra oficina próxima':'Concluir'}</button></div>`)}
function successHtml(){const extra=confirmedWorkshops.length?`<p><b>Também confirmamos sua presença em:</b> ${confirmedWorkshops.map(x=>esc(x.name)).join(', ')}.</p>`:'';return baseCard(`${top()}<div class="access-success"><div class="access-check">✓</div><h1>${confirmedWorkshops.length?'Presenças registradas!':'Presença registrada!'}</h1><p>${esc(personLabel(person))}, seu registro entrou na Lista de Presença e Contato de hoje.</p>${extra}${lastPresence?.expected_exit_at?'<p class="access-help">Sua previsão de permanência também foi registrada.</p>':''}<button class="btn primary access-big" data-next>Próximo jovem</button></div>`)}

function bindSignature(root){
  const canvas=root.querySelector('[data-signature]');if(!canvas)return {value:()=>'',drawn:()=>false};
  const ctx2=canvas.getContext('2d');ctx2.lineWidth=3;ctx2.lineCap='round';ctx2.lineJoin='round';ctx2.strokeStyle='#17352f';let down=false,hasInk=false;
  const point=e=>{const r=canvas.getBoundingClientRect(),src=e.touches?.[0]||e;return {x:(src.clientX-r.left)*(canvas.width/r.width),y:(src.clientY-r.top)*(canvas.height/r.height)}};
  const start=e=>{e.preventDefault();down=true;const p=point(e);ctx2.beginPath();ctx2.moveTo(p.x,p.y)};
  const move=e=>{if(!down)return;e.preventDefault();const p=point(e);ctx2.lineTo(p.x,p.y);ctx2.stroke();hasInk=true};
  const stop=e=>{if(down)e?.preventDefault?.();down=false};
  canvas.addEventListener('pointerdown',start);canvas.addEventListener('pointermove',move);window.addEventListener('pointerup',stop,{once:false});canvas.addEventListener('touchstart',start,{passive:false});canvas.addEventListener('touchmove',move,{passive:false});canvas.addEventListener('touchend',stop,{passive:false});
  root.querySelector('[data-signature-clear]')?.addEventListener('click',()=>{ctx2.clearRect(0,0,canvas.width,canvas.height);hasInk=false});
  return {drawn:()=>hasInk,value:()=>hasInk?canvas.toDataURL('image/png'):''};
}
async function loadContext(){
  if(!token){app.innerHTML=stateMessage('Link inválido','Peça ao Controlador de Acessos o link da lista de hoje.','danger');return false}
  try{
    ctx=await rpc('access_public_context',{p_token:token});
    if(!ctx?.ok){app.innerHTML=stateMessage('Link inválido',ctx?.message||'Esta lista não está disponível.','danger');return false}
    if(!ctx.open){app.innerHTML=stateMessage('Lista encerrada','A lista de hoje não está aberta. Fale com a recepção.','warn');return false}
    if(!ctx.shift){app.innerHTML=stateMessage('Fora do horário de registro','A lista diária funciona durante o horário de atendimento configurado do CRJ. Procure a recepção se precisar de ajuda.','warn');return false}
    return true;
  }catch(err){app.innerHTML=stateMessage('Não foi possível abrir a lista',err.message||'Tente novamente na recepção.','danger');return false}
}
function bindRestart(root=document){root.querySelectorAll('[data-restart]').forEach(b=>b.addEventListener('click',reset))}
function bindStart(){
  const form=document.querySelector('#identify-form'),label=form.querySelector('[data-id-label]'),input=form.querySelector('[name="identifier"]');
  bindRestart(form);form.querySelector('[data-first-time]')?.addEventListener('click',()=>openFirstTime());
  form.querySelectorAll('[name="method"]').forEach(r=>r.addEventListener('change',()=>{const method=form.querySelector('[name="method"]:checked').value;label.textContent=method==='name'?'Nome':'CPF';input.placeholder=method==='name'?'Digite seu nome ou apelido':'Digite seu CPF';input.inputMode=method==='name'?'text':'numeric';input.value='';input.focus()}));
  form.addEventListener('submit',async e=>{
    e.preventDefault();const method=form.querySelector('[name="method"]:checked').value,identifier=input.value.trim(),btn=form.querySelector('button[type="submit"]'),old=btn.textContent;
    if(method==='cpf'&&digits(identifier).length<11){notice(form,'<b>Confira o CPF.</b><p>Digite os 11 números para consultar seu cadastro.</p>');return}
    if(method==='name'&&identifier.length<3){notice(form,'<b>Digite pelo menos 3 letras do seu nome.</b>');return}
    btn.disabled=true;btn.textContent='Buscando...';
    try{
      const out=await rpc('access_public_search',{p_token:token,p_query:identifier,p_method:method}),rows=out?.results||[];
      form.querySelector('[data-search-holder]')?.remove();const holder=document.createElement('div');holder.dataset.searchHolder='1';holder.innerHTML=rows.length?searchResultsHtml(rows,method):'<div class="access-message warn"><b>Nenhum cadastro encontrado.</b><p>Se este é seu primeiro acesso ou seu cadastro ainda não existe, escolha “Criar cadastro parcial”.</p><button class="btn primary" type="button" data-create-from-empty>Criar cadastro parcial</button></div>';form.appendChild(holder);
      holder.querySelector('[data-create-from-empty]')?.addEventListener('click',()=>openFirstTime({identifier,method}));
      holder.querySelectorAll('[data-youth]').forEach(b=>b.addEventListener('click',()=>{const candidate=rows.find(x=>x.youth_id===b.dataset.youth);if(candidate){person=candidate;app.innerHTML=confirmHtml(candidate,method,identifier);bindConfirm(candidate)}}));
    }catch(err){notice(form,`<b>Não foi possível consultar.</b><p>${esc(err.message||'Tente novamente.')}</p>`,'danger')}
    finally{btn.disabled=false;btn.textContent=old}
  });
}
function bindConfirm(candidate){
  const form=document.querySelector('#confirm-form');bindRestart(form);
  form.addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(form),btn=form.querySelector('button[type="submit"]'),old=btn.textContent;btn.disabled=true;btn.textContent='Confirmando...';
    try{
      const method=fd.get('method'),out=await rpc('access_public_confirm_identity',{p_token:token,p_youth_id:candidate.youth_id,p_method:method,p_identifier:fd.get('identifier')||null,p_birth_date:method==='name'?(fd.get('birth_date')||null):null});
      if(!out?.ok){notice(form,'<b>Não foi possível confirmar sua identidade.</b><p>Confira os dados ou procure a recepção.</p>','danger');return}
      person={...candidate,...out,display_name:out.preferred_name||out.full_name};claimToken=out.claim_token;
      const missing=out.missing_fields||[];
      if(missing.length||!out.has_signature){app.innerHTML=profileHtml(person);bindProfile(false);return}
      app.innerHTML=roomsHtml();bindRooms();
    }catch(err){notice(form,`<b>Confirmação não realizada.</b><p>${esc(err.message||'Confira os dados informados.')}</p>`,'danger')}
    finally{btn.disabled=false;btn.textContent=old}
  });
}
function openFirstTime(seed={}){person={full_name:seed.method==='name'?seed.identifier||'':'',cpf:seed.method==='cpf'?seed.identifier||'':'',has_signature:false,missing_fields:['signature']};claimToken='';app.innerHTML=profileHtml(person,{firstTime:true});bindProfile(true)}
function bindProfile(firstTime){
  const form=document.querySelector('#profile-form'),signature=bindSignature(form);bindRestart(form);
  form.addEventListener('submit',async e=>{
    e.preventDefault();const fd=new FormData(form),payload={full_name:String(fd.get('full_name')||'').trim(),birth_date:fd.get('birth_date')||'',cpf:String(fd.get('cpf')||'').trim(),phone:String(fd.get('phone')||'').trim(),email:String(fd.get('email')||'').trim(),neighborhood:String(fd.get('neighborhood')||'').trim()};
    if(!payload.full_name||!payload.birth_date||!payload.phone||!payload.email||!payload.neighborhood){notice(form,'<b>Complete nome, data de nascimento, telefone, e-mail e bairro.</b>');return}
    const needsSig=firstTime||!person?.has_signature;if(needsSig&&!signature.drawn()){notice(form,'<b>Faça sua assinatura no quadro antes de continuar.</b>');return}
    const btn=form.querySelector('button[type="submit"]'),old=btn.textContent;btn.disabled=true;btn.textContent='Salvando...';
    try{
      const sig=needsSig?signature.value():null;
      if(firstTime){const out=await rpc('access_public_register_first_time_v3',{p_token:token,p_payload:payload,p_signature_data:sig});claimToken=out.claim_token;person={...person,...payload,...out,display_name:payload.full_name,preferred_name:''}}
      else{const out=await rpc('access_public_complete_profile',{p_token:token,p_claim_token:claimToken,p_payload:payload,p_signature_data:sig});person={...person,...payload,...out,has_signature:true}}
      app.innerHTML=roomsHtml();bindRooms();
    }catch(err){notice(form,`<b>Não foi possível salvar o cadastro.</b><p>${esc(err.message||'Tente novamente ou procure a recepção.')}</p>`,'danger')}
    finally{btn.disabled=false;btn.textContent=old}
  });
}
function bindRooms(){
  const form=document.querySelector('#room-form');bindRestart(form);
  form.addEventListener('submit',async e=>{
    e.preventDefault();const rooms=[...form.querySelectorAll('[name="room_ids"]:checked')].map(x=>x.value),exit=form.querySelector('[name="expected_exit_time"]').value;
    if(!rooms.length){notice(form,'<b>Selecione pelo menos um espaço que pretende usar.</b>');return}
    if(!exit){notice(form,'<b>Informe até que horas pretende ficar.</b>');return}
    if(exit<=localTime()){notice(form,'<b>O horário de saída precisa ser posterior ao horário atual.</b>');return}
    if(ctx.operation_end&&exit>ctx.operation_end){notice(form,`<b>O funcionamento de hoje vai até ${esc(ctx.operation_end)}.</b>`);return}
    const btn=form.querySelector('button[type="submit"]'),old=btn.textContent;btn.disabled=true;btn.textContent='Registrando...';
    try{
      lastPresence=await rpc('access_public_mark_presence_v2',{p_token:token,p_claim_token:claimToken,p_room_ids:rooms,p_expected_exit_time:exit,p_signature_data:null});
      const upcoming=await rpc('access_public_upcoming_workshops',{p_token:token,p_claim_token:claimToken});
      workshopQueue=upcoming?.workshops||[];confirmedWorkshops=[];
      if(workshopQueue.length){showWorkshopPrompt();return}
      showSuccess();
    }catch(err){notice(form,`<b>Não foi possível registrar a presença.</b><p>${esc(err.message||'Tente novamente.')}</p>`,'danger');btn.disabled=false;btn.textContent=old}
  });
}
function showWorkshopPrompt(){if(!workshopQueue.length){showSuccess();return}const w=workshopQueue[0];app.innerHTML=workshopPromptHtml(w);document.querySelector('[data-workshop-yes]')?.addEventListener('click',()=>{app.innerHTML=workshopSignHtml(w);bindWorkshopSignature(w)});document.querySelector('[data-workshop-no]')?.addEventListener('click',()=>showWorkshopDeclined(w))}
function showWorkshopDeclined(w){app.innerHTML=workshopDeclinedHtml(w);document.querySelector('[data-decline-continue]')?.addEventListener('click',()=>{workshopQueue.shift();if(workshopQueue.length)showWorkshopPrompt();else showSuccess()})}
function bindWorkshopSignature(w){
  const form=document.querySelector('#workshop-sign-form'),signature=bindSignature(form);form.querySelector('[data-workshop-back]')?.addEventListener('click',showWorkshopPrompt);
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(!signature.drawn()){notice(form,'<b>Assine no quadro para confirmar sua presença na oficina.</b>');return}
    const fd=new FormData(form),payload={full_name:person.full_name||'',birth_date:person.birth_date||'',cpf:String(fd.get('cpf')??person.cpf??'').trim(),phone:String(fd.get('phone')??person.phone??'').trim(),email:String(fd.get('email')??person.email??'').trim(),neighborhood:String(fd.get('neighborhood')??person.neighborhood??'').trim()};
    if(!payload.phone||!payload.email||!payload.neighborhood){notice(form,'<b>Complete telefone, e-mail e bairro antes de assinar a lista da oficina.</b>');return}
    const btn=form.querySelector('button[type="submit"]'),old=btn.textContent;btn.disabled=true;btn.textContent='Registrando nas duas listas...';
    try{
      await rpc('access_public_join_workshop_v2',{p_token:token,p_claim_token:claimToken,p_calendar_id:w.calendar_id,p_payload:payload,p_signature_data:signature.value()});
      person={...person,...payload,has_signature:true};confirmedWorkshops.push(w);workshopQueue.shift();
      if(workshopQueue.length)showWorkshopPrompt();else showSuccess();
    }catch(err){notice(form,`<b>O uso livre já foi registrado, mas não foi possível marcar a oficina.</b><p>${esc(err.message||`Procure ${w.educator_name||'o Educador de Referência'}.`)}</p>`,'warn');btn.disabled=false;btn.textContent=old}
  });
}
function showSuccess(){app.innerHTML=successHtml();bindSuccess()}
function bindSuccess(){document.querySelector('[data-next]')?.addEventListener('click',reset)}
async function reset(){person=null;claimToken='';lastPresence=null;workshopQueue=[];confirmedWorkshops=[];if(await loadContext()){app.innerHTML=startHtml();bindStart()}else bindRestart()}
async function boot(){if(await loadContext()){app.innerHTML=startHtml();bindStart()}else bindRestart()}
boot();
