import { apiMode, supabaseClient, createTechnicalService } from './api.js?v=20261004-2';

const WRITE_ROLES=new Set(['coordenacao_geral','assistente_social','psicologo','terapeuta_ocupacional']);
const TECH_ROLES=new Set(['assistente_social','psicologo','terapeuta_ocupacional']);
const PROGRAMS={
  atendimento:'Atendimento técnico',
  acompanhamento:'Acompanhamento técnico',
  pvida:'PVida',
  ptrampo:'PTrampo',
  'outras-demandas':'Outras Demandas'
};
const ROLE_LABELS={
  coordenacao_geral:'Coordenação Geral',
  assistente_social:'Assistente Social',
  psicologo:'Psicólogo(a)',
  terapeuta_ocupacional:'Terapeuta Ocupacional'
};
let me=null;
let opening=false;
let autoKey='';
let observer=null;

const esc=(v='')=>String(v??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
const digits=v=>String(v||'').replace(/\D/g,'');
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function c(){if(apiMode()!=='live')throw new Error('Banco ainda não conectado.');return supabaseClient()}
function canWrite(){return !!me?.active&&WRITE_ROLES.has(String(me.role||''))}
function route(){const raw=(location.hash||'#dashboard').slice(1),[path,q='']=raw.split('?');return {parts:path.split('/').filter(Boolean),params:new URLSearchParams(q)}}
function currentYouthId(){const r=route();return r.parts[0]==='jovem'?r.parts[1]||'':''}
function technicalRoute(){return route().parts[0]==='equipe-tecnica'}
function monthParam(){return route().params.get('month')||today().slice(0,7)}
function toast(message,type='success'){const e=document.createElement('div');e.className=`pill ${type}`;e.textContent=message;Object.assign(e.style,{position:'fixed',right:'20px',bottom:'20px',zIndex:'2147483646',padding:'12px 16px',boxShadow:'0 10px 35px rgba(0,0,0,.2)'});document.body.appendChild(e);setTimeout(()=>e.remove(),3400)}

async function resolveProfile(){
  if(apiMode()!=='live')return null;
  const client=c(),{data:{user}}=await client.auth.getUser();
  if(!user)return null;
  const {data,error}=await client.from('profiles').select('id,display_name,role,team,active').eq('id',user.id).maybeSingle();
  if(error)throw error;
  me=data||null;
  return me;
}

function injectStyle(){
  if(document.querySelector('#technical-service-flow-style'))return;
  const s=document.createElement('style');s.id='technical-service-flow-style';s.textContent=`
  .tsf-bg{position:fixed;inset:0;z-index:2147483500;background:rgba(6,22,25,.64);display:grid;place-items:center;padding:14px}
  .tsf-modal{width:min(980px,98vw);max-height:96vh;overflow:auto;background:#fff;border-radius:18px;box-shadow:0 30px 90px rgba(0,0,0,.35)}
  .tsf-head{position:sticky;top:0;z-index:4;background:#fff;border-bottom:1px solid var(--line,#e1e8e5);display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:16px 18px}
  .tsf-head h3{margin:0}.tsf-head p{margin:4px 0 0}.tsf-close{border:0;background:transparent;font-size:26px;cursor:pointer}
  .tsf-body{padding:18px}.tsf-actions{position:sticky;bottom:0;background:#fff;border-top:1px solid var(--line,#e1e8e5);padding:13px 18px;display:flex;justify-content:flex-end;gap:8px;z-index:4}
  .tsf-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.tsf-section{border:1px solid var(--line,#dfe7e5);border-radius:13px;padding:13px;background:#fbfdfc;margin:12px 0}
  .tsf-search{position:relative}.tsf-results{margin-top:5px;max-height:280px;overflow:auto;border:1px solid var(--line,#dfe7e5);border-radius:12px;background:#fff}.tsf-results.hidden{display:none}
  .tsf-result{width:100%;border:0;border-bottom:1px solid var(--line,#edf1ef);background:#fff;padding:11px 12px;text-align:left;cursor:pointer;display:grid;gap:3px}.tsf-result:last-child{border-bottom:0}.tsf-result:hover{background:#f0f7f5}.tsf-result b{font-size:12px}.tsf-result span{font-size:10px;color:var(--muted,#687671)}
  .tsf-selected-list{display:grid;gap:7px;margin-top:8px}.tsf-selected{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;border:1px solid #b7d8d0;background:#f2fbf8;border-radius:11px;padding:10px}.tsf-selected b{font-size:12px}.tsf-selected small{display:block;color:var(--muted,#687671);margin-top:2px}.tsf-selected button{border:0;background:transparent;color:var(--brand,#176b5a);cursor:pointer;text-decoration:underline}
  .tsf-identification{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}.tsf-identification>div{border:1px solid var(--line,#e1e8e5);border-radius:9px;padding:8px;background:#fff}.tsf-identification small{display:block;color:var(--muted,#687671);font-size:10px}.tsf-identification b{font-size:12px}
  .tsf-techs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.tsf-tech{display:flex;gap:8px;align-items:flex-start;border:1px solid var(--line,#e1e8e5);border-radius:10px;padding:9px;background:#fff}.tsf-tech small{display:block;color:var(--muted,#687671)}
  .tsf-empty{padding:15px;text-align:center;color:var(--muted,#687671);font-size:11px}
  @media(max-width:760px){.tsf-grid,.tsf-identification,.tsf-techs{grid-template-columns:1fr}.tsf-bg{padding:4px}.tsf-modal{width:100%;max-height:99vh}}
  `;document.head.appendChild(s);
}

async function loadPeopleAndTeam(){
  const client=c();
  const [yq,tq]=await Promise.all([
    client.from('young_people').select('id,full_name,preferred_name,neighborhood,cpf,birth_date,phone,email,status').eq('status','ativo').order('full_name'),
    client.from('profiles').select('id,display_name,role,team,active').eq('active',true).order('display_name')
  ]);
  if(yq.error)throw yq.error;if(tq.error)throw tq.error;
  return {youth:yq.data||[],techs:(tq.data||[]).filter(x=>TECH_ROLES.has(x.role)||x.role==='coordenacao_geral')};
}

function personSearchText(y){return norm([y.full_name,y.preferred_name,y.neighborhood,digits(y.cpf)].filter(Boolean).join(' '))}
function resultHtml(y){
  const cpfLast=digits(y.cpf).slice(-4)||'----';
  return `<button type="button" class="tsf-result" data-tsf-person="${esc(y.id)}"><b>${esc(y.full_name||'Nome não informado')}</b><span>Apelido / nome preferido: ${esc(y.preferred_name||'não informado')} · Bairro: ${esc(y.neighborhood||'não informado')} · CPF final ${esc(cpfLast)}</span></button>`;
}
function selectedHtml(y){
  const cpfLast=digits(y.cpf).slice(-4)||'----';
  return `<div class="tsf-selected" data-tsf-selected="${esc(y.id)}"><div><b>${esc(y.full_name||'Nome não informado')}</b><small>Apelido / nome preferido: ${esc(y.preferred_name||'não informado')} · Bairro: ${esc(y.neighborhood||'não informado')} · CPF final ${esc(cpfLast)}</small></div><button type="button" data-tsf-remove="${esc(y.id)}">trocar/remover</button></div>`;
}
function identificationHtml(y){
  if(!y)return '<div class="tsf-empty">Selecione um jovem para vincular este atendimento à trajetória.</div>';
  return `<div class="tsf-identification"><div><small>Nome completo</small><b>${esc(y.full_name||'—')}</b></div><div><small>Apelido / nome preferido</small><b>${esc(y.preferred_name||'—')}</b></div><div><small>Bairro</small><b>${esc(y.neighborhood||'—')}</b></div><div><small>Data de nascimento</small><b>${esc(y.birth_date||'—')}</b></div></div>`;
}

function clearNewServiceParams(){
  const r=route();if(r.parts[0]!=='equipe-tecnica')return;
  r.params.delete('new');r.params.delete('youth');r.params.delete('return_youth');r.params.delete('program');
  const q=r.params.toString();
  history.replaceState(null,'','#equipe-tecnica'+(q?'?'+q:''));
}

async function openService({initialYouthId='',returnYouthId='',initialProgram='' }={}){
  if(opening||document.querySelector('#technical-service-flow-modal'))return;
  opening=true;
  try{
    if(!me)await resolveProfile();
    if(!canWrite())throw new Error('Seu perfil não possui permissão para abrir atendimento da Equipe Técnica.');
    const {youth,techs}=await loadPeopleAndTeam();
    const byId=new Map(youth.map(y=>[y.id,y]));
    const selected=new Set();
    if(initialYouthId&&byId.has(initialYouthId))selected.add(initialYouthId);
    const program=PROGRAMS[initialProgram]?initialProgram:'';
    document.querySelector('#technical-service-flow-modal')?.remove();
    const bg=document.createElement('div');bg.id='technical-service-flow-modal';bg.className='tsf-bg';
    bg.innerHTML=`<div class="tsf-modal"><div class="tsf-head"><div><h3>Novo atendimento da Equipe Técnica</h3><p class="muted">O registro será associado automaticamente à trajetória do jovem selecionado.</p></div><button type="button" class="tsf-close" data-tsf-close>×</button></div><form id="technical-service-unified-form"><div class="tsf-body"><div class="notice info"><b>Fluxo único de atendimento.</b><br>Selecione o tipo de atendimento e o jovem. Não é necessário abrir a aba de Formulários nem escolher a trajetória novamente.</div><div class="tsf-grid" style="margin-top:12px"><div class="field"><label>Data do atendimento</label><input class="input" type="date" name="service_date" value="${today()}" required></div><div class="field"><label>Modalidade</label><select name="service_type" required><option value="individual">Individual</option><option value="coletivo">Coletivo</option></select></div></div><div class="field"><label>Tipo de atendimento</label><select name="program_type" required><option value="">Selecione o tipo de atendimento</option>${Object.entries(PROGRAMS).map(([k,v])=>`<option value="${k}" ${program===k?'selected':''}>${esc(v)}</option>`).join('')}</select><small>Mesmos tipos utilizados na Área da Equipe Técnica.</small></div><div class="tsf-section"><h4 style="margin:0 0 8px">Jovem(ns) atendido(s)</h4><div class="field tsf-search"><label>Buscar por CPF ou nome</label><input class="input" type="search" data-tsf-search autocomplete="off" placeholder="Digite nome, apelido ou CPF"><div class="tsf-results hidden" data-tsf-results></div></div><div class="tsf-selected-list" data-tsf-selected-list></div><div data-tsf-identification></div></div><div class="tsf-section"><h4 style="margin:0 0 8px">Técnico(s) responsável(is)</h4><div class="tsf-techs">${techs.map(p=>`<label class="tsf-tech"><input type="checkbox" name="professional_ids" value="${esc(p.id)}" ${p.id===me.id?'checked':''}><span><b>${esc(p.display_name)}</b><small>${esc(ROLE_LABELS[p.role]||p.role)}</small></span></label>`).join('')||'<div class="tsf-empty">Nenhum técnico ativo disponível.</div>'}</div></div><div class="field"><label>Motivo do atendimento / síntese para evidência</label><input class="input" name="reason" required placeholder="Ex.: orientação familiar, demanda escolar, PTrampo..."></div><div class="field"><label>Resumo técnico interno</label><textarea name="summary"></textarea><small>Conteúdo interno; não aparece na evidência nominal.</small></div><div class="field"><label>Situação</label><select name="status"><option value="realizado">Realizado</option><option value="em_acompanhamento">Em acompanhamento</option><option value="encaminhado">Encaminhado</option><option value="cancelado">Cancelado</option></select></div></div><div class="tsf-actions"><button class="btn secondary" type="button" data-tsf-close>Cancelar</button><button class="btn primary" type="submit">Salvar atendimento</button></div></form></div>`;
    document.body.appendChild(bg);
    clearNewServiceParams();
    const form=bg.querySelector('#technical-service-unified-form'),search=bg.querySelector('[data-tsf-search]'),results=bg.querySelector('[data-tsf-results]'),selectedList=bg.querySelector('[data-tsf-selected-list]'),identity=bg.querySelector('[data-tsf-identification]'),serviceType=form.querySelector('[name="service_type"]');

    const drawSelected=()=>{
      selectedList.innerHTML=[...selected].map(id=>byId.get(id)).filter(Boolean).map(selectedHtml).join('');
      const first=byId.get([...selected][0]);identity.innerHTML=identificationHtml(first);
      selectedList.querySelectorAll('[data-tsf-remove]').forEach(b=>b.addEventListener('click',()=>{selected.delete(b.dataset.tsfRemove);drawSelected();search.focus()}));
    };
    const searchNow=()=>{
      const raw=String(search.value||'').trim(),q=norm(raw),qd=digits(raw);
      if(!q){results.classList.add('hidden');results.innerHTML='';return;}
      const matches=youth.filter(y=>{
        const text=personSearchText(y),cpf=digits(y.cpf);
        return text.includes(q)||(qd.length>=3&&cpf.includes(qd));
      }).slice(0,12);
      results.innerHTML=matches.map(resultHtml).join('')||'<div class="tsf-empty">Nenhum jovem encontrado por nome ou CPF.</div>';
      results.classList.remove('hidden');
      results.querySelectorAll('[data-tsf-person]').forEach(b=>b.addEventListener('click',()=>{
        const id=b.dataset.tsfPerson;
        if(serviceType.value==='individual')selected.clear();
        selected.add(id);search.value='';results.classList.add('hidden');drawSelected();
      }));
    };
    search.addEventListener('input',searchNow);search.addEventListener('focus',searchNow);
    serviceType.addEventListener('change',()=>{if(serviceType.value==='individual'&&selected.size>1){const first=[...selected][0];selected.clear();selected.add(first);drawSelected()}});
    drawSelected();
    bg.querySelectorAll('[data-tsf-close]').forEach(b=>b.addEventListener('click',()=>bg.remove()));
    bg.addEventListener('click',e=>{if(e.target===bg)bg.remove()});
    form.addEventListener('submit',async e=>{
      e.preventDefault();const submit=form.querySelector('[type="submit"]'),fd=new FormData(form),ys=[...selected],ps=[...form.querySelectorAll('[name="professional_ids"]:checked')].map(x=>x.value);
      if(!fd.get('program_type')){toast('Selecione o tipo de atendimento.','danger');return}
      if(!ys.length){toast('Selecione ao menos um jovem por nome ou CPF.','danger');search.focus();return}
      if(fd.get('service_type')==='individual'&&ys.length!==1){toast('Atendimento individual deve ter apenas um jovem.','danger');return}
      if(!ps.length){toast('Selecione ao menos um técnico responsável.','danger');return}
      submit.disabled=true;const label=submit.textContent;submit.textContent='Salvando...';
      try{
        await createTechnicalService({service_date:fd.get('service_date'),service_type:fd.get('service_type'),program_type:fd.get('program_type'),youth_ids:ys,professional_ids:ps,reason:String(fd.get('reason')||'').trim(),summary:String(fd.get('summary')||'').trim(),status:fd.get('status')||'realizado'});
        bg.remove();toast('Atendimento técnico registrado e vinculado à trajetória.');
        if(returnYouthId&&ys.includes(returnYouthId)){location.hash='jovem/'+returnYouthId;return}
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }catch(err){toast(err.message||String(err),'danger');submit.disabled=false;submit.textContent=label}
    });
  }catch(err){toast(err.message||String(err),'danger')}
  finally{opening=false}
}

async function interceptClick(event){
  const youthButton=event.target.closest?.('[data-action="new-service"]');
  if(youthButton){
    const id=currentYouthId();if(!id)return;
    event.preventDefault();event.stopImmediatePropagation();
    try{if(!me)await resolveProfile();if(!canWrite())throw new Error('Seu perfil não possui permissão para abrir atendimento da Equipe Técnica.');
      const p=new URLSearchParams();p.set('view','painel');p.set('month',today().slice(0,7));p.set('new','service');p.set('youth',id);p.set('return_youth',id);location.hash='equipe-tecnica?'+p.toString();
    }catch(err){toast(err.message||String(err),'danger')}
    return;
  }
  const areaButton=event.target.closest?.('[data-new-technical-service]');
  if(areaButton){
    event.preventDefault();event.stopImmediatePropagation();
    try{if(!me)await resolveProfile();if(!canWrite())return;await openService()}catch(err){toast(err.message||String(err),'danger')}
  }
}

async function autoOpen(){
  if(!technicalRoute())return;
  const r=route();if(r.params.get('new')!=='service')return;
  const key=location.hash;if(autoKey===key)return;autoKey=key;
  await openService({initialYouthId:r.params.get('youth')||'',returnYouthId:r.params.get('return_youth')||'',initialProgram:r.params.get('program')||''});
}
function scheduleAuto(){setTimeout(()=>autoOpen().catch(err=>toast(err.message||String(err),'danger')),100)}

async function boot(){
  injectStyle();
  try{await resolveProfile()}catch(err){console.warn('Não foi possível carregar o perfil para o fluxo técnico:',err)}
  document.addEventListener('click',interceptClick,true);
  window.addEventListener('hashchange',()=>{autoKey='';scheduleAuto()});
  observer=new MutationObserver(()=>{if(technicalRoute())scheduleAuto()});observer.observe(document.body,{childList:true,subtree:true});
  scheduleAuto();
}
boot();
