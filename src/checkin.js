
import { CONFIG } from './config.js';

const app=document.querySelector('#checkin-app');
const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtDate=v=>v?new Date(String(v).slice(0,10)+'T12:00:00').toLocaleDateString('pt-BR'):'—';
const onlyDigits=v=>String(v||'').replace(/\D/g,'');
const qs=new URLSearchParams(location.search);
const cfdhMode=Boolean(qs.get('cfdh'));
const token=qs.get('cfdh')||qs.get('token');
const rpcName=(workshop,cfdh)=>cfdhMode?cfdh:workshop;
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
  const contextTitle=cfdhMode?(ctx.circuit_title||'Circuito Formativo em Direitos Humanos'):(ctx.workshop_name||'Oficina');
  const contextSub=cfdhMode?((ctx.action_title?ctx.action_title+' · ':'')+fmtDate(ctx.scheduled_date)+' · '+String(ctx.start_time||'').slice(0,5)+'–'+String(ctx.end_time||'').slice(0,5)+(ctx.workshop_name?' · '+ctx.workshop_name:'')):(fmtDate(ctx.session_date)+' · '+String(ctx.start_time||'').slice(0,5)+'–'+String(ctx.end_time||'').slice(0,5));
  app.innerHTML=
    '<div class="checkin-step-head"><span class="step-badge">1</span><div><h2>Identificação</h2><p>Um jovem por vez.</p></div></div>'+
    '<div class="notice success"><b>'+esc(contextTitle)+'</b><br>'+esc(contextSub)+'</div>'+
    (cfdhMode?'<div class="notice info"><b>Lista CFDH</b><br>Para participar é necessário possuir ao menos o Formulário Inicial parcial e estar inscrito no circuito. Se faltar uma dessas etapas, o sistema fará o encaminhamento aqui.</div>':'')+
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
      const {data,error}=await db.rpc(rpcName('workshop_checkin_lookup','cfdh_checkin_lookup'),{p_token:token,p_query:q});
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
    const {data,error}=await db.rpc(rpcName('workshop_checkin_cpf_status','cfdh_checkin_cpf_status'),{p_token:token,p_cpf:cpf});
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
    '<div class="notice warn"><b>Não encontramos Formulário Inicial com este CPF.</b><br>'+(cfdhMode?'Para participar do CFDH é necessário iniciar o Formulário Inicial parcial e concluir a inscrição no circuito.':'Você pode iniciar o Formulário Inicial de forma parcial agora ou registrar somente a participação desta aula, sem inscrição na oficina.')+'</div>'+
    (cfdhMode?'<button type="button" class="btn primary" data-create-provisional>Iniciar Formulário Inicial parcial e inscrever no CFDH</button>':'<div class="choice-grid"><button type="button" class="choice-card" data-create-provisional><b>Iniciar Formulário Inicial parcial</b><span>É o mesmo Formulário Inicial do CRJ, salvo incompleto e com pendências para complementar depois.</span></button><button type="button" class="choice-card" data-visitor><b>Registrar participação sem inscrição</b><span>Entra imediatamente na lista desta aula, sem criar inscrição na oficina.</span></button></div>'),'3');
  backButton(showCpfCheck);
  app.querySelector('[data-create-provisional]').addEventListener('click',()=>showProvisionalForm({cpf}));
  app.querySelector('[data-visitor]')?.addEventListener('click',()=>showVisitorForm({cpf}));
}
function showVisitorKnown(data){
  const force=cfdhMode||Boolean(data.must_provisional);
  shell(force?'Limite de visitante atingido':'Histórico de visitante',
    '<div class="notice '+(force?'warn':'info')+'"><b>'+esc(data.display_name||'Visitante')+'</b><br>'+
    Number(data.visits||0)+' visita(s) registrada(s).'+(force?' O ciclo de visitante foi encerrado: agora é necessário iniciar o Formulário Inicial parcial.':' Você pode se cadastrar agora ou continuar como visitante enquanto estiver abaixo do limite.')+'</div>'+
    (force?'<button type="button" class="btn primary" data-create-provisional>Iniciar Formulário Inicial parcial</button>':
      '<div class="choice-grid"><button type="button" class="choice-card" data-create-provisional><b>Iniciar Formulário Inicial parcial</b><span>O mesmo cadastro inicial, preenchido parcialmente.</span></button><button type="button" class="choice-card" data-visitor><b>Registrar participação sem inscrição</b><span>Visita '+(Number(data.visits||0)+1)+' de 3</span></button></div>'),'3');
  backButton(showCpfCheck);
  app.querySelector('[data-create-provisional]').addEventListener('click',()=>showProvisionalForm({cpf:visitorSnapshot.cpf,full_name:data.display_name,birth_date:data.birth_date}));
  app.querySelector('[data-visitor]')?.addEventListener('click',()=>showVisitorForm({cpf:visitorSnapshot.cpf,full_name:data.display_name,birth_date:data.birth_date}));
}
async function resolveCandidate(id,prefix=''){
  const {data,error}=await db.rpc(rpcName('workshop_checkin_candidate_state','cfdh_checkin_candidate_state'),{p_token:token,p_youth_id:id});
  if(error){shell('Cadastro',notice('danger','Não foi possível consultar o cadastro',error.message));backButton();return}
  currentCandidate=data;
  if(data.attendance_already_confirmed){
    showSuccess('Presença já confirmada','Sua presença já consta nesta aula.',data);
    return;
  }
  if(data.enrolled){showPinForm(data,prefix);return}
  if(cfdhMode&&!data.eligible_initial){showExistingInitialStartForm(data,prefix);return}
  showEnrollmentForm(data,prefix);
}
function candidateCard(s){
  return '<div class="selected-person"><b>'+esc(s.display_name)+'</b><span>Nascimento: '+fmtDate(s.birth_date)+' · CPF final '+esc(s.cpf_last4||'----')+'</span></div>';
}
function showPinForm(state,prefix=''){
  shell('Confirmar participação',
    (prefix?notice('success','Cadastro localizado',prefix):'')+candidateCard(state)+pendingBox(state)+
    '<form id="pin-form" class="stack"><div class="field"><label>'+(cfdhMode?'Senha do CFDH':'Senha da oficina')+'</label><input class="input" name="secret" type="password" minlength="4" autocomplete="current-password" required></div><button class="btn primary">Confirmar presença</button></form>','3');
  backButton(showRegisteredSearch);
  app.querySelector('#pin-form').addEventListener('submit',async e=>{
    e.preventDefault();const btn=e.target.querySelector('button');btn.disabled=true;btn.textContent='Confirmando...';
    const {data,error}=await db.rpc(rpcName('workshop_checkin_mark','cfdh_checkin_mark'),{p_token:token,p_enrollment_id:state.enrollment_id,p_secret:e.target.secret.value});
    if(error){btn.disabled=false;btn.textContent='Confirmar presença';e.target.querySelector('.notice.danger')?.remove();e.target.insertAdjacentHTML('afterbegin',notice('danger','Senha não confirmada',error.message));return}
    showSuccess('Presença confirmada','Seu registro foi incluído na aula.',data);
  });
}
function signatureBlock(){
  return '<div class="field"><label>Assinatura manuscrita</label><canvas class="signature-pad public-signature" data-signature></canvas><div class="actions"><button type="button" class="btn ghost" data-clear-signature>Limpar assinatura</button></div></div>';
}
function bindSignature(form){
  const canvas=form?.querySelector('[data-signature]');
  if(!canvas)return()=>null;
  let moved=false,g=null,ratio=1;
  try{
    ratio=Math.max(window.devicePixelRatio||1,1);
    const rect=canvas.getBoundingClientRect();
    canvas.width=Math.max(600,Math.round((rect.width||600)*ratio));
    canvas.height=Math.round(180*ratio);
    g=canvas.getContext('2d');
    if(!g)throw new Error('Canvas indisponível');
    g.scale(ratio,ratio);
    g.lineWidth=2;g.lineCap='round';g.strokeStyle='#17201e';
    let drawing=false;
    const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left),y:(e.clientY-r.top)}};
    canvas.addEventListener('pointerdown',e=>{drawing=true;moved=true;const p=point(e);g.beginPath();g.moveTo(p.x,p.y);try{canvas.setPointerCapture?.(e.pointerId)}catch{}});
    canvas.addEventListener('pointermove',e=>{if(!drawing)return;const p=point(e);g.lineTo(p.x,p.y);g.stroke()});
    canvas.addEventListener('pointerup',()=>drawing=false);
    canvas.addEventListener('pointercancel',()=>drawing=false);
    form.querySelector('[data-clear-signature]')?.addEventListener('click',()=>{g.clearRect(0,0,canvas.width/ratio,canvas.height/ratio);moved=false});
  }catch(err){
    console.error('Falha ao iniciar assinatura:',err);
    form?.insertAdjacentHTML('afterbegin',notice('danger','Assinatura indisponível','Recarregue a página para tentar novamente.'));
  }
  return()=>{
    if(!moved||!g)return null;
    try{return canvas.toDataURL('image/png')}catch{return null}
  };
}
async function rpcWithTimeout(name,args,ms=20000){
  let timer;
  try{
    return await Promise.race([
      db.rpc(name,args),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('A operação demorou mais do que o esperado. Verifique a conexão e tente novamente.')),ms)})
    ]);
  }finally{clearTimeout(timer)}
}

function showEnrollmentForm(state,prefix=''){
  const extraCpf=!state.has_cpf?'<div class="field"><label>CPF completo</label><input class="input" name="cpf" inputmode="numeric" required></div>':'';
  const extraEmail=!state.has_email?'<div class="field"><label>E-mail</label><input class="input" name="email" type="email" required></div>':'';
  const extraBairro=!state.has_neighborhood?'<div class="field"><label>Bairro</label><input class="input" name="neighborhood" required></div>':'';
  const reuse=Boolean(state.has_reusable_signature);
  const signatureHtml=reuse
    ?notice('success','Assinatura já registrada','A mesma assinatura usada em outra oficina será reutilizada automaticamente nesta inscrição.')
    :signatureBlock();
  shell(cfdhMode?'Inscrição no CFDH':'Inscrição na oficina',
    (prefix?notice('success','Cadastro localizado',prefix):'')+candidateCard(state)+pendingBox(state)+
    '<div class="notice"><b>Próxima etapa:</b> fazer a inscrição nesta oficina. Os dados já existentes no CRJ serão reutilizados sem expor CPF completo, e-mail ou endereço nesta tela.</div>'+
    '<form id="enroll-existing-form" class="stack">'+extraCpf+extraEmail+extraBairro+
    '<div class="field"><label>'+(cfdhMode?'Criar senha do CFDH':'Criar senha da oficina')+'</label><input class="input" name="secret" type="password" minlength="4" maxlength="32" required><small>Guarde esta senha. Ela será usada nas próximas presenças e não será enviada em texto por e-mail.</small></div>'+
    signatureHtml+'<button class="btn primary">'+(reuse?'Inscrever e confirmar presença':'Assinar, inscrever e confirmar presença')+'</button></form>','3');
  backButton(showRegisteredSearch);
  const form=app.querySelector('#enroll-existing-form'),getSignature=reuse?(()=>null):bindSignature(form);
  form.addEventListener('submit',async e=>{
    e.preventDefault();const sig=getSignature();
    if(!reuse&&!sig){form.insertAdjacentHTML('afterbegin',notice('danger','Assinatura obrigatória','Assine no quadro antes de continuar.'));return}
    const btn=form.querySelector('button[type="submit"]');btn.disabled=true;btn.textContent='Registrando...';
    const fd=new FormData(form);
    const rpc=rpcName('workshop_checkin_enroll_existing','cfdh_checkin_enroll_existing');
    const args=cfdhMode
      ?{p_token:token,p_youth_id:state.candidate_id,p_signature_data:sig,p_secret:fd.get('secret')}
      :{p_token:token,p_youth_id:state.candidate_id,p_signature_data:sig,p_secret:fd.get('secret'),p_cpf_if_missing:fd.get('cpf')||null,p_email_if_missing:fd.get('email')||null,p_neighborhood_if_missing:fd.get('neighborhood')||null};
    const {data,error}=await db.rpc(rpc,args);
    if(error){btn.disabled=false;btn.textContent=reuse?'Inscrever e confirmar presença':'Assinar, inscrever e confirmar presença';form.querySelector('.notice.danger')?.remove();form.insertAdjacentHTML('afterbegin',notice('danger','Não foi possível concluir',error.message));return}
    showSuccess('Inscrição e presença confirmadas',reuse?('Sua assinatura já registrada foi reutilizada '+(cfdhMode?'no CFDH.':'nesta oficina.')):('Você já está inscrito '+(cfdhMode?'no CFDH.':'nesta oficina.')),data);
  });
}
function showProvisionalForm(prefill={}){
  shell('Formulário Inicial parcial',
    '<div class="notice warn"><b>Este é o próprio Formulário Inicial do CRJ, salvo parcialmente.</b><br>Os dados coletados agora ficam no Anexo 1 do jovem. O restante será complementado depois e as pendências continuarão visíveis no cadastro.</div>'+
    '<form id="provisional-form" class="stack" novalidate><div class="field"><label>Nome completo</label><input class="input" name="full_name" value="'+esc(prefill.full_name||'')+'" required></div>'+
    '<div class="form-grid"><div class="field"><label>Data de nascimento</label><input class="input" type="date" name="birth_date" value="'+esc(prefill.birth_date||'')+'" required></div><div class="field"><label>CPF</label><input class="input" name="cpf" inputmode="numeric" value="'+esc(prefill.cpf||lastCpf||'')+'" required></div></div>'+
    '<div class="field"><label>E-mail</label><input class="input" name="email" type="email" required></div><div class="field"><label>Bairro</label><input class="input" name="neighborhood" required></div>'+
    '<div class="field"><label>Criar senha da oficina</label><input class="input" name="secret" type="password" minlength="4" maxlength="32" required></div>'+signatureBlock()+
    '<div data-action-status></div><button class="btn primary" type="button" data-provisional-save>Salvar Formulário Inicial parcial e confirmar presença</button></form>','4');
  backButton(showCpfCheck);
  const form=app.querySelector('#provisional-form');
  const btn=form?.querySelector('[data-provisional-save]');
  const status=form?.querySelector('[data-action-status]');
  const getSignature=bindSignature(form);
  const run=async()=>{
    status.innerHTML='';
    if(!form.reportValidity())return;
    const sig=getSignature();
    if(!sig){status.innerHTML=notice('danger','Assinatura obrigatória','Assine no quadro antes de continuar.');return}
    const fd=new FormData(form);
    btn.disabled=true;btn.textContent='Salvando cadastro e presença...';
    status.innerHTML=notice('info','Registrando','Estamos salvando o Formulário Inicial parcial, a inscrição e a presença desta aula.');
    try{
      const result=await rpcWithTimeout(rpcName('workshop_checkin_create_provisional','cfdh_checkin_create_provisional'),{
        p_token:token,
        p_full_name:String(fd.get('full_name')||'').trim(),
        p_birth_date:fd.get('birth_date'),
        p_cpf:fd.get('cpf'),
        p_email:String(fd.get('email')||'').trim(),
        p_neighborhood:String(fd.get('neighborhood')||'').trim(),
        p_signature_data:sig,
        p_secret:fd.get('secret')
      });
      if(result?.error)throw result.error;
      const data=result?.data||{};
      showSuccess('Cadastro parcial e presença registrados','O mesmo Formulário Inicial poderá ser completado depois. Sua presença já entrou na lista desta aula.',data);
    }catch(err){
      btn.disabled=false;btn.textContent='Salvar Formulário Inicial parcial e confirmar presença';
      const msg=String(err?.message||err)==='CPF_JA_CADASTRADO'?'Este CPF já possui trajetória no CRJ. Volte e pesquise o cadastro existente.':(err?.message||String(err));
      status.innerHTML=notice('danger','Não foi possível concluir',msg);
    }
  };
  btn?.addEventListener('click',run);
  form?.addEventListener('submit',e=>{e.preventDefault();run()});
}
function showVisitorForm(prefill={}){
  shell('Participação sem inscrição',
    '<div class="notice"><b>Visitante</b><br>Esta opção registra a participação diretamente na lista desta aula sem criar inscrição na oficina. Na 3ª ocorrência o sistema solicita o início do Formulário Inicial parcial.</div>'+
    '<form id="visitor-form" class="stack" novalidate><div class="field"><label>Nome completo</label><input class="input" name="full_name" value="'+esc(prefill.full_name||'')+'" required></div>'+
    '<div class="form-grid"><div class="field"><label>Data de nascimento</label><input class="input" type="date" name="birth_date" value="'+esc(prefill.birth_date||'')+'" required></div><div class="field"><label>CPF</label><input class="input" name="cpf" inputmode="numeric" value="'+esc(prefill.cpf||lastCpf||'')+'" required></div></div>'+
    '<div class="field"><label>Bairro</label><input class="input" name="neighborhood" required></div>'+signatureBlock()+
    '<div data-action-status></div><button class="btn primary" type="button" data-visitor-save>Registrar participação sem inscrição</button></form>','4');
  backButton(showCpfCheck);
  const form=app.querySelector('#visitor-form');
  const btn=form?.querySelector('[data-visitor-save]');
  const status=form?.querySelector('[data-action-status]');
  const getSignature=bindSignature(form);
  const run=async()=>{
    status.innerHTML='';
    if(!form.reportValidity())return;
    const sig=getSignature();
    if(!sig){status.innerHTML=notice('danger','Assinatura obrigatória','Assine antes de registrar a participação.');return}
    const fd=new FormData(form);
    btn.disabled=true;btn.textContent='Registrando participação...';
    status.innerHTML=notice('info','Registrando','A participação será incluída imediatamente na lista desta aula.');
    try{
      const result=await rpcWithTimeout('workshop_checkin_guest',{
        p_token:token,
        p_full_name:String(fd.get('full_name')||'').trim(),
        p_birth_date:fd.get('birth_date'),
        p_cpf:fd.get('cpf'),
        p_neighborhood:String(fd.get('neighborhood')||'').trim(),
        p_signature_data:sig
      });
      if(result?.error)throw result.error;
      const data=result?.data||{};
      if(data.existing_youth){
        await resolveCandidate(data.candidate_id,'Este CPF já possui trajetória no CRJ.');
        return;
      }
      if(data.must_provisional){
        visitorSnapshot={...data,cpf:onlyDigits(fd.get('cpf')),birth_date:fd.get('birth_date'),display_name:fd.get('full_name')};
        app.innerHTML='<div class="checkin-success"><div class="success-mark">✓</div><h2>Participação registrada</h2><p>Esta foi a '+esc(data.visits||3)+'ª ocorrência como visitante e já entrou na lista desta aula.</p><div class="notice warn"><b>Próxima etapa</b><br>Agora é necessário iniciar o Formulário Inicial parcial para continuar o vínculo.</div><div class="actions"><button type="button" class="btn primary" data-force-provisional>Iniciar Formulário Inicial parcial</button><button type="button" class="btn secondary" data-next-person>Próxima pessoa</button></div></div>';
        app.querySelector('[data-force-provisional]')?.addEventListener('click',()=>showProvisionalForm({cpf:visitorSnapshot.cpf,full_name:visitorSnapshot.display_name,birth_date:visitorSnapshot.birth_date}));
        app.querySelector('[data-next-person]')?.addEventListener('click',mainButtons);
        return;
      }
      app.innerHTML='<div class="checkin-success"><div class="success-mark">✓</div><h2>Participação registrada</h2><p>Registro '+esc(data.visits||1)+' de 3 como visitante. A lista oficial da aula já foi atualizada.</p><button type="button" class="btn primary" data-next-person>Registrar próxima pessoa</button></div>';
      app.querySelector('[data-next-person]')?.addEventListener('click',mainButtons);
      setTimeout(()=>{if(app.querySelector('[data-next-person]'))mainButtons()},2200);
    }catch(err){
      btn.disabled=false;btn.textContent='Registrar participação sem inscrição';
      status.innerHTML=notice('danger','Não foi possível registrar',err?.message||String(err));
    }
  };
  btn?.addEventListener('click',run);
  form?.addEventListener('submit',e=>{e.preventDefault();run()});
}
function showSuccess(title,text,state={}){
  app.innerHTML='<div class="checkin-success"><div class="success-mark">✓</div><h2>'+esc(title)+'</h2><p>'+esc(text)+'</p>'+
    (state.schedule?'<div class="notice success"><b>Oficina</b><br>'+esc(state.schedule)+'</div>':'')+
    pendingBox(state)+
    (state.email_queued?'<div class="notice info"><b>Confirmação por e-mail</b><br>A confirmação foi colocada na fila de envio. A senha criada não é enviada em texto aberto.</div>':'')+
    '<button type="button" class="btn primary" data-another>Registrar próxima pessoa</button></div>';
  app.querySelector('[data-another]').addEventListener('click',mainButtons);
  setTimeout(()=>{if(app.querySelector('[data-another]'))mainButtons()},4500);
}

try{
  if(!token)throw new Error('Link sem identificação da lista.');
  let mod;
  try{mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm')}
  catch{mod=await import('https://esm.sh/@supabase/supabase-js@2.117.2')}
  db=mod.createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await db.rpc(rpcName('workshop_checkin_context','cfdh_checkin_context'),{p_token:token});
  if(error)throw error;
  ctx=Array.isArray(data)?data[0]:data;
  if(!ctx)throw new Error('A lista não está disponível neste momento.');
  mainButtons();
}catch(err){
  app.innerHTML=notice('danger','Não foi possível abrir a lista.',err.message||String(err));
}
