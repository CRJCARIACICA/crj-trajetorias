
import { CONFIG } from './config.js';

const app=document.querySelector('#checkin-app');
const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtDate=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const onlyDigits=v=>String(v||'').replace(/\D/g,'');
const token=new URLSearchParams(location.search).get('token');
let db=null,ctx=null,lastCpf='',currentCandidate=null,visitorSnapshot=null;

const FIELD_LABELS={
  preferred_name:'nome preferido',reference_person:'pessoa de referência',reference_phone:'telefone da referência',
  street:'endereço',neighborhood:'bairro',municipality:'município',housing:'moradia',phone:'telefone',email:'e-mail',
  race:'cor/raça',gender_identity:'identidade de gênero',sexual_orientation:'orientação sexual',disability:'deficiência',
  studies:'situação escolar',household_income:'renda domiciliar',interests:'interesses no CRJ',
  heard_from:'como conheceu o CRJ',preferred_shifts:'turnos de interesse',filled_by:'responsável pelo preenchimento'
};

function notice(type,title,text=''){
  return '<div class="notice '+type+'"><b>'+esc(title)+'</b>'+(text?'<br>'+esc(text):'')+'</div>';
}
function pendingBox(state){
  if(state?.initial_form_status!=='provisorio'&&!state?.requires_initial_completion)return '';
  const fields=(state.pending_fields||[]).map(x=>FIELD_LABELS[x]||x);
  return '<div class="notice warn"><b>Formulário Inicial provisório — cadastro pendente</b><br>'+
    'Sua participação está registrada, mas complete o Formulário Inicial para não perder oportunidades e para manter sua trajetória completa no CRJ.'+
    (fields.length?'<details><summary>Ver pendências ('+fields.length+')</summary><div class="pending-fields">'+fields.map(x=>'<span>'+esc(x)+'</span>').join('')+'</div></details>':'')+
    '</div>';
}
function mainButtons(){
  app.innerHTML=
    '<div class="checkin-step-head"><span class="step-badge">1</span><div><h2>Identificação</h2><p>Um jovem por vez.</p></div></div>'+
    '<div class="notice success"><b>'+esc(ctx.workshop_name)+'</b><br>'+fmtDate(ctx.session_date)+' · '+String(ctx.start_time||'').slice(0,5)+'–'+String(ctx.end_time||'').slice(0,5)+'</div>'+
    '<div class="question-card"><h3>Já possui Formulário Inicial no CRJ?</h3><div class="choice-grid"><button class="choice-card" data-has-initial="yes"><b>Sim</b><span>Pesquisar meu cadastro por nome ou CPF</span></button><button class="choice-card" data-has-initial="no"><b>Não / não tenho certeza</b><span>Confirmar primeiro pelo CPF</span></button></div></div>';
  app.querySelector('[data-has-initial="yes"]').addEventListener('click',showRegisteredSearch);
  app.querySelector('[data-has-initial="no"]').addEventListener('click',showCpfCheck);
}
function backButton(action=mainButtons){setTimeout(()=>app.querySelector('[data-flow-back]')?.addEventListener('click',action),0)}
function shell(title,body,step='2'){
  app.innerHTML='<button class="btn ghost checkin-back" data-flow-back>← Voltar</button><div class="checkin-step-head"><span class="step-badge">'+step+'</span><div><h2>'+esc(title)+'</h2></div></div>'+body;
}

async function showRegisteredSearch(){
  shell('Pesquisar cadastro',
    '<div class="form-grid"><div class="field"><label>Pesquisar por nome</label><input class="input" data-youth-name autocomplete="off" placeholder="Digite pelo menos 3 letras"></div><div class="field"><label>Pesquisar por CPF</label><input class="input" data-youth-cpf inputmode="numeric" autocomplete="off" placeholder="Digite pelo menos 4 dígitos"></div></div>'+
    '<div class="checkin-results" data-search-results><div class="empty">Digite o nome ou CPF para pesquisar.</div></div>');
  backButton();
  const nameInput=app.querySelector('[data-youth-name]'),cpfInput=app.querySelector('[data-youth-cpf]'),box=app.querySelector('[data-search-results]');
  let timer=null,seq=0;
  const search=async(source)=>{
    clearTimeout(timer);
    if(source==='name'&&nameInput.value)cpfInput.value='';
    if(source==='cpf'&&cpfInput.value)nameInput.value='';
    const q=(source==='cpf'?cpfInput.value:nameInput.value).trim(),digits=onlyDigits(q),my=++seq;
    if((source==='name'&&q.length<3)||(source==='cpf'&&digits.length<4)){
      box.innerHTML='<div class="empty">'+(source==='cpf'?'Digite pelo menos 4 dígitos do CPF.':'Digite pelo menos 3 letras do nome.')+'</div>';
      return;
    }
    timer=setTimeout(async()=>{
      box.innerHTML='<div class="empty">Pesquisando...</div>';
      const {data,error}=await db.rpc('workshop_checkin_lookup',{p_token:token,p_query:q});
      if(my!==seq)return;
      if(error){box.innerHTML=notice('danger','Erro na pesquisa',error.message);return}
      const rows=data||[];
      box.innerHTML=rows.map(r=>'<button class="checkin-person" data-candidate="'+r.candidate_id+'"><b>'+esc(r.display_name)+'</b><span>Nascimento: '+fmtDate(r.birth_date)+' · CPF final '+esc(r.cpf_last4||'----')+'</span></button>').join('')||'<div class="empty">Nenhum cadastro compatível.</div><button class="btn secondary" data-go-cpf>Não encontrei meu cadastro</button>';
      box.querySelectorAll('[data-candidate]').forEach(b=>b.addEventListener('click',()=>resolveCandidate(b.dataset.candidate)));
      box.querySelector('[data-go-cpf]')?.addEventListener('click',showCpfCheck);
    },220);
  };
  nameInput.addEventListener('input',()=>search('name'));
  cpfInput.addEventListener('input',()=>search('cpf'));
}
async function showCpfCheck(){
  shell('Confirmar pelo CPF',
    '<div class="notice">Antes de criar qualquer novo registro, vamos confirmar se este CPF já existe no CRJ.</div>'+
    '<form id="cpf-check-form" class="stack"><div class="field"><label>CPF completo</label><input class="input" name="cpf" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00" required></div><button class="btn primary">Verificar CPF</button></form>');
  backButton();
  app.querySelector('#cpf-check-form').addEventListener('submit',async e=>{
    e.preventDefault();const btn=e.target.querySelector('button'),cpf=e.target.cpf.value,last=onlyDigits(cpf);lastCpf=last;
    btn.disabled=true;btn.textContent='Verificando...';
    const {data,error}=await db.rpc('workshop_checkin_cpf_status',{p_token:token,p_cpf:cpf});
    btn.disabled=false;btn.textContent='Verificar CPF';
    if(error){e.target.insertAdjacentHTML('afterbegin',notice('danger','Não foi possível verificar',error.message));return}
    if(data.kind==='youth'){
      currentCandidate=data.candidate_id;
      await resolveCandidate(data.candidate_id,'Encontramos um cadastro com este CPF.');
      return;
    }
    if(data.kind==='visitor'){
      visitorSnapshot={...data,cpf:last};
      showVisitorKnown(data);
      return;
    }
    showNoCpfMatch(last);
  });
}
function showNoCpfMatch(cpf){
  shell('CPF não encontrado',
    '<div class="notice warn"><b>Não encontramos Formulário Inicial com este CPF.</b><br>Você pode criar uma inscrição provisória agora ou entrar como visitante.</div>'+
    '<div class="choice-grid"><button class="choice-card" data-create-provisional><b>Fazer inscrição provisória</b><span>Cria Formulário Inicial provisório + inscrição na oficina + senha</span></button><button class="choice-card" data-visitor><b>Entrar como visitante</b><span>Somente nome, CPF, nascimento, bairro e assinatura. Máximo de 3 visitas.</span></button></div>','3');
  backButton(showCpfCheck);
  app.querySelector('[data-create-provisional]').addEventListener('click',()=>showProvisionalForm({cpf}));
  app.querySelector('[data-visitor]').addEventListener('click',()=>showVisitorForm({cpf}));
}
function showVisitorKnown(data){
  const force=Boolean(data.must_provisional);
  shell(force?'Limite de visitante atingido':'Histórico de visitante',
    '<div class="notice '+(force?'warn':'info')+'"><b>'+esc(data.display_name||'Visitante')+'</b><br>'+
    Number(data.visits||0)+' visita(s) registrada(s).'+(force?' O ciclo de visitante foi encerrado: agora é necessário criar a inscrição provisória.':' Você pode se cadastrar agora ou continuar como visitante enquanto estiver abaixo do limite.')+'</div>'+
    (force?'<button class="btn primary" data-create-provisional>Continuar com inscrição provisória</button>':
      '<div class="choice-grid"><button class="choice-card" data-create-provisional><b>Fazer inscrição provisória</b><span>Recomendado</span></button><button class="choice-card" data-visitor><b>Continuar como visitante</b><span>Visita '+(Number(data.visits||0)+1)+' de 3</span></button></div>'),'3');
  backButton(showCpfCheck);
  app.querySelector('[data-create-provisional]').addEventListener('click',()=>showProvisionalForm({cpf:visitorSnapshot.cpf,full_name:data.display_name,birth_date:data.birth_date}));
  app.querySelector('[data-visitor]')?.addEventListener('click',()=>showVisitorForm({cpf:visitorSnapshot.cpf,full_name:data.display_name,birth_date:data.birth_date}));
}
async function resolveCandidate(id,prefix=''){
  const {data,error}=await db.rpc('workshop_checkin_candidate_state',{p_token:token,p_youth_id:id});
  if(error){shell('Cadastro',notice('danger','Não foi possível consultar o cadastro',error.message));backButton();return}
  currentCandidate=data;
  if(data.attendance_already_confirmed){
    showSuccess('Presença já confirmada','Sua presença já consta nesta aula.',data);
    return;
  }
  if(data.enrolled){showPinForm(data,prefix);return}
  showEnrollmentForm(data,prefix);
}
function candidateCard(s){
  return '<div class="selected-person"><b>'+esc(s.display_name)+'</b><span>Nascimento: '+fmtDate(s.birth_date)+' · CPF final '+esc(s.cpf_last4||'----')+'</span></div>';
}
function showPinForm(state,prefix=''){
  shell('Confirmar participação',
    (prefix?notice('success','Cadastro localizado',prefix):'')+candidateCard(state)+pendingBox(state)+
    '<form id="pin-form" class="stack"><div class="field"><label>Senha da oficina</label><input class="input" name="secret" type="password" minlength="4" autocomplete="current-password" required></div><button class="btn primary">Confirmar presença</button></form>','3');
  backButton(showRegisteredSearch);
  app.querySelector('#pin-form').addEventListener('submit',async e=>{
    e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;btn.textContent='Confirmando...';
    const {data,error}=await db.rpc('workshop_checkin_mark',{p_token:token,p_enrollment_id:state.enrollment_id,p_secret:e.target.secret.value});
    if(error){btn.disabled=false;btn.textContent='Confirmar presença';e.target.querySelector('.notice.danger')?.remove();e.target.insertAdjacentHTML('afterbegin',notice('danger','Senha não confirmada',error.message));return}
    showSuccess('Presença confirmada','Seu registro foi incluído na aula.',data);
  });
}
function signatureBlock(){
  return '<div class="field"><label>Assinatura manuscrita</label><canvas class="signature-pad public-signature" data-signature></canvas><div class="actions"><button type="button" class="btn ghost" data-clear-signature>Limpar assinatura</button></div></div>';
}
function bindSignature(form){
  const canvas=form.querySelector('[data-signature]');if(!canvas)return()=>null;
  const ratio=Math.max(window.devicePixelRatio||1,1),rect=canvas.getBoundingClientRect();
  canvas.width=Math.max(600,Math.round((rect.width||600)*ratio));canvas.height=Math.round(180*ratio);
  const g=canvas.getContext('2d');g.scale(ratio,ratio);g.lineWidth=2;g.lineCap='round';g.strokeStyle='#17201e';
  let drawing=false,moved=false;
  const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left),y:(e.clientY-r.top)}};
  canvas.addEventListener('pointerdown',e=>{drawing=true;moved=true;const p=point(e);g.beginPath();g.moveTo(p.x,p.y);canvas.setPointerCapture?.(e.pointerId)});
  canvas.addEventListener('pointermove',e=>{if(!drawing)return;const p=point(e);g.lineTo(p.x,p.y);g.stroke()});
  canvas.addEventListener('pointerup',()=>drawing=false);canvas.addEventListener('pointercancel',()=>drawing=false);
  form.querySelector('[data-clear-signature]')?.addEventListener('click',()=>{g.clearRect(0,0,canvas.width/ratio,canvas.height/ratio);moved=false});
  return()=>moved?canvas.toDataURL('image/png'):null;
}
function showEnrollmentForm(state,prefix=''){
  const extraCpf=!state.has_cpf?'<div class="field"><label>CPF completo</label><input class="input" name="cpf" inputmode="numeric" required></div>':'';
  const extraEmail=!state.has_email?'<div class="field"><label>E-mail</label><input class="input" name="email" type="email" required></div>':'';
  const extraBairro=!state.has_neighborhood?'<div class="field"><label>Bairro</label><input class="input" name="neighborhood" required></div>':'';
  shell('Inscrição na oficina',
    (prefix?notice('success','Cadastro localizado',prefix):'')+candidateCard(state)+pendingBox(state)+
    '<div class="notice"><b>Próxima etapa:</b> fazer a inscrição nesta oficina. Os dados já existentes no CRJ serão reutilizados sem expor CPF completo, e-mail ou endereço nesta tela.</div>'+
    '<form id="enroll-existing-form" class="stack">'+extraCpf+extraEmail+extraBairro+
    '<div class="field"><label>Criar senha da oficina</label><input class="input" name="secret" type="password" minlength="4" maxlength="32" required><small>Guarde esta senha. Ela será usada nas próximas presenças e não será enviada em texto por e-mail.</small></div>'+
    signatureBlock()+'<button class="btn primary">Assinar, inscrever e confirmar presença</button></form>','3');
  backButton(showRegisteredSearch);
  const form=app.querySelector('#enroll-existing-form'),getSignature=bindSignature(form);
  form.addEventListener('submit',async e=>{
    e.preventDefault();const sig=getSignature();if(!sig){form.insertAdjacentHTML('afterbegin',notice('danger','Assinatura obrigatória','Assine no quadro antes de continuar.'));return}
    const btn=form.querySelector('button[type="submit"]');btn.disabled=true;btn.textContent='Registrando...';
    const fd=new FormData(form);
    const {data,error}=await db.rpc('workshop_checkin_enroll_existing',{
      p_token:token,p_youth_id:state.candidate_id,p_signature_data:sig,p_secret:fd.get('secret'),
      p_cpf_if_missing:fd.get('cpf')||null,p_email_if_missing:fd.get('email')||null,p_neighborhood_if_missing:fd.get('neighborhood')||null
    });
    if(error){btn.disabled=false;btn.textContent='Assinar, inscrever e confirmar presença';form.querySelector('.notice.danger')?.remove();form.insertAdjacentHTML('afterbegin',notice('danger','Não foi possível concluir',error.message));return}
    showSuccess('Inscrição e presença confirmadas','Você já está inscrito nesta oficina.',data);
  });
}
function showProvisionalForm(prefill={}){
  shell('Inscrição provisória',
    '<div class="notice warn"><b>Este cadastro ainda não substitui o Formulário Inicial completo.</b><br>Vamos criar um Formulário Inicial provisório, registrar sua inscrição na oficina e deixar as pendências visíveis até a conclusão do cadastro.</div>'+
    '<form id="provisional-form" class="stack"><div class="field"><label>Nome completo</label><input class="input" name="full_name" value="'+esc(prefill.full_name||'')+'" required></div>'+
    '<div class="form-grid"><div class="field"><label>Data de nascimento</label><input class="input" type="date" name="birth_date" value="'+esc(prefill.birth_date||'')+'" required></div><div class="field"><label>CPF</label><input class="input" name="cpf" inputmode="numeric" value="'+esc(prefill.cpf||lastCpf||'')+'" required></div></div>'+
    '<div class="field"><label>E-mail</label><input class="input" name="email" type="email" required></div><div class="field"><label>Bairro</label><input class="input" name="neighborhood" required></div>'+
    '<div class="field"><label>Criar senha da oficina</label><input class="input" name="secret" type="password" minlength="4" maxlength="32" required></div>'+signatureBlock()+
    '<button class="btn primary">Criar inscrição provisória e confirmar presença</button></form>','4');
  backButton(showCpfCheck);
  const form=app.querySelector('#provisional-form'),getSignature=bindSignature(form);
  form.addEventListener('submit',async e=>{
    e.preventDefault();const sig=getSignature();if(!sig){form.insertAdjacentHTML('afterbegin',notice('danger','Assinatura obrigatória','Assine antes de continuar.'));return}
    const fd=new FormData(form),btn=form.querySelector('button[type="submit"]');btn.disabled=true;btn.textContent='Criando...';
    const {data,error}=await db.rpc('workshop_checkin_create_provisional',{
      p_token:token,p_full_name:fd.get('full_name'),p_birth_date:fd.get('birth_date'),p_cpf:fd.get('cpf'),
      p_email:fd.get('email'),p_neighborhood:fd.get('neighborhood'),p_signature_data:sig,p_secret:fd.get('secret')
    });
    if(error){btn.disabled=false;btn.textContent='Criar inscrição provisória e confirmar presença';form.querySelector('.notice.danger')?.remove();const msg=error.message==='CPF_JA_CADASTRADO'?'Este CPF já possui cadastro. Volte e pesquise o cadastro existente.':error.message;form.insertAdjacentHTML('afterbegin',notice('danger','Não foi possível concluir',msg));return}
    showSuccess('Inscrição provisória criada','Sua presença também foi confirmada nesta aula.',data);
  });
}
function showVisitorForm(prefill={}){
  shell('Entrada como visitante',
    '<div class="notice"><b>Modo visitante</b><br>Registra somente esta visita. Na 3ª visita o sistema exige a criação de uma inscrição provisória para continuar o ciclo.</div>'+
    '<form id="visitor-form" class="stack"><div class="field"><label>Nome completo</label><input class="input" name="full_name" value="'+esc(prefill.full_name||'')+'" required></div>'+
    '<div class="form-grid"><div class="field"><label>Data de nascimento</label><input class="input" type="date" name="birth_date" value="'+esc(prefill.birth_date||'')+'" required></div><div class="field"><label>CPF</label><input class="input" name="cpf" inputmode="numeric" value="'+esc(prefill.cpf||lastCpf||'')+'" required></div></div>'+
    '<div class="field"><label>Bairro</label><input class="input" name="neighborhood" required></div>'+signatureBlock()+
    '<button class="btn primary" type="submit">Registrar visita</button></form>','4');
  backButton(showCpfCheck);
  const form=app.querySelector('#visitor-form'),getSignature=bindSignature(form);
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=form.querySelector('button[type="submit"]');
    form.querySelectorAll('.notice.danger').forEach(x=>x.remove());
    try{
      const sig=getSignature();
      if(!sig){
        form.insertAdjacentHTML('afterbegin',notice('danger','Assinatura obrigatória','Assine antes de registrar a visita.'));
        return;
      }
      const fd=new FormData(form);
      btn.disabled=true;btn.textContent='Registrando visita...';
      const result=await db.rpc('workshop_checkin_guest',{
        p_token:token,
        p_full_name:String(fd.get('full_name')||'').trim(),
        p_birth_date:fd.get('birth_date'),
        p_cpf:fd.get('cpf'),
        p_neighborhood:String(fd.get('neighborhood')||'').trim(),
        p_signature_data:sig
      });
      if(result.error)throw result.error;
      const data=result.data||{};
      if(data.existing_youth){
        await resolveCandidate(data.candidate_id,'Este CPF já possui trajetória no CRJ.');
        return;
      }
      if(data.must_provisional){
        visitorSnapshot={...data,cpf:onlyDigits(fd.get('cpf')),birth_date:fd.get('birth_date'),display_name:fd.get('full_name')};
        shell('3ª visita registrada',
          '<div class="notice warn"><b>Sua visita foi registrada.</b><br>Você atingiu 3 visitas como visitante. Para continuar participando depois deste registro, conclua a inscrição provisória.</div>'+
          '<div class="actions"><button class="btn primary" data-force-provisional>Continuar inscrição provisória</button><button class="btn secondary" data-next-person>Próxima pessoa</button></div>','5');
        app.querySelector('[data-force-provisional]').addEventListener('click',()=>showProvisionalForm({cpf:visitorSnapshot.cpf,full_name:visitorSnapshot.display_name,birth_date:visitorSnapshot.birth_date}));
        app.querySelector('[data-next-person]').addEventListener('click',mainButtons);
        return;
      }
      app.innerHTML='<div class="checkin-success"><div class="success-mark">✓</div><h2>Visita registrada</h2><p>Visita '+esc(data.visits||1)+' de 3 registrada na lista desta aula.</p><div class="notice success"><b>Registro concluído.</b><br>A lista oficial da aula já foi atualizada.</div><button class="btn primary" data-next-person>Registrar próxima pessoa</button></div>';
      app.querySelector('[data-next-person]').addEventListener('click',mainButtons);
      setTimeout(()=>{if(app.querySelector('[data-next-person]'))mainButtons()},4500);
    }catch(err){
      btn.disabled=false;btn.textContent='Registrar visita';
      form.insertAdjacentHTML('afterbegin',notice('danger','Não foi possível registrar a visita',err?.message||String(err)));
    }
  });
}
function showSuccess(title,text,state={}){
  app.innerHTML='<div class="checkin-success"><div class="success-mark">✓</div><h2>'+esc(title)+'</h2><p>'+esc(text)+'</p>'+
    (state.schedule?'<div class="notice success"><b>Oficina</b><br>'+esc(state.schedule)+'</div>':'')+
    pendingBox(state)+
    (state.email_queued?'<div class="notice info"><b>Confirmação por e-mail</b><br>A confirmação foi colocada na fila de envio. A senha criada não é enviada em texto aberto.</div>':'')+
    '<button class="btn secondary" data-another>Registrar outra pessoa</button></div>';
  app.querySelector('[data-another]').addEventListener('click',mainButtons);
}

try{
  if(!token)throw new Error('Link sem identificação da lista.');
  let mod;
  try{mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm')}
  catch{mod=await import('https://esm.sh/@supabase/supabase-js@2.117.2')}
  db=mod.createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await db.rpc('workshop_checkin_context',{p_token:token});
  if(error)throw error;
  ctx=Array.isArray(data)?data[0]:data;
  if(!ctx)throw new Error('A lista não está disponível neste momento.');
  mainButtons();
}catch(err){
  app.innerHTML=notice('danger','Não foi possível abrir a lista.',err.message||String(err));
}
