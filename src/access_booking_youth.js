import { apiMode, supabaseClient } from './api.js?v=20261004-2';

const onRoute=()=>String(location.hash||'').split('?')[0]==='#controlador-acesso';
const client=()=>apiMode()==='live'?supabaseClient():null;
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toIso=(date,time)=>date&&time?new Date(`${date}T${time}:00-03:00`).toISOString():null;
let timer=null;

function toast(text,type='success'){
  const e=document.createElement('div');e.className=`pill ${type}`;e.textContent=text;
  Object.assign(e.style,{position:'fixed',right:'20px',bottom:'20px',zIndex:'2147483647',padding:'12px 16px',boxShadow:'0 10px 35px rgba(0,0,0,.2)'});
  document.body.appendChild(e);setTimeout(()=>e.remove(),3600);
}

async function rpc(name,args={}){const c=client();if(!c)throw new Error('Banco ainda não conectado.');const {data,error}=await c.rpc(name,args);if(error)throw error;return data}

function selectedBox(form){return form.querySelector('[data-meta2-booking-selected]')}
function setSelected(form,y){
  form.dataset.meta2YouthId=y?.id||'';
  const box=selectedBox(form);
  if(!y){box.innerHTML='<span class="ac-muted">Nenhum cadastro selecionado. Se o jovem ainda não existir, o sistema criará o Formulário Inicial provisório ao salvar.</span>';return}
  box.innerHTML=`<b>${esc(y.display_name||y.full_name)}</b><br><small>${esc(y.birth_date||'')} · ${esc(y.neighborhood||'')} · CPF final ${esc(y.cpf_last4||'—')}</small> <button type="button" class="btn ghost" data-meta2-clear-youth>Trocar</button>`;
  const name=form.elements.requester_name,birth=form.elements.requester_birth_date,neighborhood=form.elements.requester_neighborhood;
  if(name)name.value=y.full_name||y.display_name||'';
  if(birth&&y.birth_date)birth.value=String(y.birth_date).slice(0,10);
  if(neighborhood&&y.neighborhood)neighborhood.value=y.neighborhood;
  box.querySelector('[data-meta2-clear-youth]')?.addEventListener('click',()=>setSelected(form,null));
}

async function searchYouth(form,q){
  const results=form.querySelector('[data-meta2-booking-results]');
  if(!results)return;
  if(String(q||'').trim().length<2){results.innerHTML='';return}
  results.innerHTML='<div class="ac-muted" style="padding:8px">Pesquisando...</div>';
  try{
    const rows=await rpc('access_staff_search_youth',{p_query:String(q).trim()})||[];
    results.innerHTML=rows.length?rows.map(y=>`<button type="button" class="ac-search-result" data-meta2-youth-id="${y.id}"><b>${esc(y.display_name||y.full_name)}</b><br><small>${esc(y.birth_date||'')} · ${esc(y.neighborhood||'')} · CPF final ${esc(y.cpf_last4||'—')}</small></button>`).join(''):'<div class="ac-muted" style="padding:8px">Cadastro não localizado. Preencha os dados do solicitante para criar o Formulário Inicial provisório.</div>';
    results.querySelectorAll('[data-meta2-youth-id]').forEach(btn=>btn.addEventListener('click',()=>{const y=rows.find(x=>x.id===btn.dataset.meta2YouthId);setSelected(form,y);results.innerHTML='';const input=form.querySelector('[data-meta2-booking-search]');if(input)input.value=''}));
  }catch(err){results.innerHTML=`<div class="notice danger">${esc(err.message||String(err))}</div>`}
}

function enhance(form){
  if(form.dataset.meta2Enhanced==='1')return;
  form.dataset.meta2Enhanced='1';
  const requester=[...form.querySelectorAll('.ac-section')].find(x=>/Solicitante/i.test(x.textContent||''));
  if(!requester)return;
  requester.insertAdjacentHTML('afterbegin',`<div class="notice info" style="margin-bottom:10px"><b>Jovem usuário obrigatório.</b> Pesquise o cadastro. Se não existir, informe nome completo e data de nascimento: o agendamento/empréstimo criará automaticamente o Formulário Inicial provisório, como nos demais fluxos.</div><div class="field"><label>Pesquisar jovem cadastrado</label><input class="input" data-meta2-booking-search placeholder="Nome ou CPF"><div class="ac-search-results" data-meta2-booking-results></div></div><div class="ac-selected" data-meta2-booking-selected style="margin:8px 0"><span class="ac-muted">Nenhum cadastro selecionado.</span></div>`);
  const grid=requester.querySelector('.ac-form-grid');
  grid?.insertAdjacentHTML('beforeend','<div class="field"><label>E-mail</label><input class="input" type="email" name="requester_email"></div><div class="field"><label>Bairro</label><input class="input" name="requester_neighborhood"></div>');
  const birth=form.elements.requester_birth_date;if(birth)birth.required=true;
  const search=form.querySelector('[data-meta2-booking-search]');
  search?.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>searchYouth(form,search.value),260)});
  setSelected(form,null);

  form.addEventListener('submit',async event=>{
    event.preventDefault();event.stopImmediatePropagation();
    const fd=new FormData(form),start=toIso(fd.get('start_date'),fd.get('start_time')),end=toIso(fd.get('end_date'),fd.get('end_time'));
    if(!start||!end||new Date(end)<=new Date(start)){toast('Confira o período informado.','danger');return}
    if(!fd.get('requester_name')||!fd.get('requester_birth_date')){toast('Informe nome completo e data de nascimento ou selecione um cadastro existente.','danger');return}
    const payload={
      resource_id:fd.get('resource_id'),quantity:fd.get('quantity'),youth_id:form.dataset.meta2YouthId||null,
      requester_name:fd.get('requester_name'),requester_birth_date:fd.get('requester_birth_date'),requester_cpf:fd.get('requester_cpf')||'',requester_rg:fd.get('requester_rg')||'',
      requester_contact:fd.get('requester_contact')||'',requester_phone:fd.get('requester_contact')||'',requester_email:fd.get('requester_email')||'',requester_neighborhood:fd.get('requester_neighborhood')||'',requester_address:fd.get('requester_address')||'',
      scheduled_start:start,scheduled_end:end,activity:fd.get('activity')||'',participants_count:fd.get('participants_count')||null,item_description:fd.get('item_description')||''
    };
    const submit=form.querySelector('[type="submit"]');if(submit){submit.disabled=true;submit.textContent='Salvando...'}
    try{
      const out=await rpc('access_create_booking_v2',{p_payload:payload});
      form.innerHTML=`<div class="notice success"><b>Solicitação ${esc(out.request_number)} criada e vinculada ao jovem.</b><br>${out.provisional_created?'O Formulário Inicial provisório foi criado automaticamente.':'Cadastro existente utilizado.'}<br>Este registro já conta como atendimento da M2.1 e alimenta a cobertura da demanda.</div><div class="ac-actions" style="margin-top:12px"><button class="btn primary" type="button" data-meta2-booking-finish>Concluir</button><button class="btn secondary" type="button" data-meta2-booking-docs>Ir para Documentos</button></div>`;
      form.querySelector('[data-meta2-booking-finish]')?.addEventListener('click',()=>document.querySelector('.ac-modal-bg')?.remove());
      form.querySelector('[data-meta2-booking-docs]')?.addEventListener('click',()=>{document.querySelector('.ac-modal-bg')?.remove();location.hash='controlador-acesso?view=documentos'});
      toast('Agendamento/empréstimo registrado como atendimento');
    }catch(err){toast(err.message||String(err),'danger');if(submit){submit.disabled=false;submit.textContent='Salvar e gerar documentos'}}
  },true);
}

function scan(){if(!onRoute())return;document.querySelectorAll('#ac-booking-form').forEach(enhance)}
const observer=new MutationObserver(scan);observer.observe(document.documentElement,{childList:true,subtree:true});
window.addEventListener('hashchange',scan);scan();
