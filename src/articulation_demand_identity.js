import { apiMode, supabaseClient } from './api.js?v=20261004-2';

let currentActionId=null;
let state={mode:null,youthId:null};
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const client=()=>{if(apiMode()!=='live')throw new Error('Banco ainda não conectado.');return supabaseClient()};
const clean=v=>String(v??'').trim();

function setValue(form,key,value){const el=form.querySelector(`[data-f="${key}"]`);if(el&&value!=null&&String(value)!=='')el.value=String(value)}
function originalModalForm(){const f=document.querySelector('#art-modal form');return f&&f.querySelector('[data-f="desired"]')&&f.querySelector('[data-f="full"]')?f:null}
function reset(){state={mode:null,youthId:null};currentActionId=null}
function refreshArea(){const h=document.querySelector('.content');if(h)delete h.dataset.artWsKey;window.dispatchEvent(new HashChangeEvent('hashchange'))}
function showError(form,msg){let d=form.querySelector('[data-demand-link-error]');if(!d){d=document.createElement('div');d.dataset.demandLinkError='1';d.className='notice danger';form.querySelector('.art-modal-body')?.prepend(d)}d.textContent=msg;d.scrollIntoView({behavior:'smooth',block:'center'})}

async function searchYouth(form){
  const term=clean(form.querySelector('[data-youth-search]')?.value);if(term.length<3){showError(form,'Digite ao menos 3 caracteres do nome, CPF ou telefone.');return}
  const btn=form.querySelector('[data-youth-search-btn]');btn.disabled=true;btn.textContent='Consultando…';
  try{
    const c=client(),digits=term.replace(/\D/g,''),queries=[];
    queries.push(c.from('young_people').select('id,full_name,preferred_name,birth_date,cpf,phone,email,street,address_extra,neighborhood,municipality,initial_form_status').ilike('full_name',`%${term}%`).eq('status','ativo').limit(8));
    queries.push(c.from('young_people').select('id,full_name,preferred_name,birth_date,cpf,phone,email,street,address_extra,neighborhood,municipality,initial_form_status').ilike('preferred_name',`%${term}%`).eq('status','ativo').limit(8));
    if(digits.length>=4){queries.push(c.from('young_people').select('id,full_name,preferred_name,birth_date,cpf,phone,email,street,address_extra,neighborhood,municipality,initial_form_status').ilike('cpf',`%${digits}%`).eq('status','ativo').limit(8));queries.push(c.from('young_people').select('id,full_name,preferred_name,birth_date,cpf,phone,email,street,address_extra,neighborhood,municipality,initial_form_status').ilike('phone',`%${digits}%`).eq('status','ativo').limit(8))}
    const settled=await Promise.all(queries);for(const q of settled)if(q.error)throw q.error;
    const map=new Map();for(const q of settled)for(const y of q.data||[])map.set(y.id,y);const rows=[...map.values()].slice(0,12),out=form.querySelector('[data-youth-results]');
    out.innerHTML=rows.length?rows.map(y=>`<button type="button" class="art-item" data-select-youth="${y.id}" style="width:100%;text-align:left;cursor:pointer"><b>${esc(y.preferred_name||y.full_name)}</b><div class="art-muted">${esc(y.full_name)}${y.birth_date?' · '+new Date(y.birth_date+'T12:00:00').toLocaleDateString('pt-BR'):''}${y.neighborhood?' · '+esc(y.neighborhood):''} · Formulário Inicial: ${y.initial_form_status==='completo'?'completo':'provisório'}</div></button>`).join(''):'<div class="notice info">Nenhum cadastro localizado. Se realmente for um jovem novo, escolha “Criar novo cadastro ao salvar”.</div>';
    out.querySelectorAll('[data-select-youth]').forEach(b=>b.onclick=()=>selectYouth(form,rows.find(y=>y.id===b.dataset.selectYouth)));
  }catch(e){showError(form,e.message||String(e))}finally{btn.disabled=false;btn.textContent='Consultar cadastro'}
}

async function selectYouth(form,y){
  if(!y)return;state={mode:'existing',youthId:y.id};
  const d=await client().from('youth_demographics').select('race,gender_identity,sexual_orientation').eq('youth_id',y.id).maybeSingle();
  if(d.error)throw d.error;const demo=d.data||{};
  setValue(form,'full',y.full_name);setValue(form,'social',y.preferred_name);setValue(form,'birth',y.birth_date);
  setValue(form,'residence',[y.street,y.address_extra,y.neighborhood,y.municipality].filter(Boolean).join(' · '));setValue(form,'race',demo.race);setValue(form,'gender',demo.gender_identity);setValue(form,'orientation',demo.sexual_orientation);setValue(form,'contact',[y.phone,y.email].filter(Boolean).join(' · '));
  const set=(sel,val)=>{const el=form.querySelector(sel);if(el)el.value=val||''};set('[data-youth-cpf]',y.cpf);set('[data-youth-phone]',y.phone);set('[data-youth-email]',y.email);set('[data-youth-neighborhood]',y.neighborhood);set('[data-youth-municipality]',y.municipality||'Cariacica');
  form.querySelector('[data-youth-results]').innerHTML=`<div class="notice success"><b>Cadastro vinculado:</b> ${esc(y.preferred_name||y.full_name)}<br>Os campos existentes foram trazidos para o levantamento. Se algum dado ainda estiver vazio, o que for preenchido agora complementará o Formulário Inicial.</div>`;
}

function enhance(form){
  if(form.dataset.youthLinkEnhanced==='1')return;form.dataset.youthLinkEnhanced='1';
  const body=form.querySelector('.art-modal-body');if(!body)return;
  const sec=document.createElement('div');sec.className='art-section';sec.dataset.youthLink='1';sec.innerHTML=`<h4>Vincular ao Formulário Inicial</h4><div class="notice info"><b>Consulta obrigatória.</b><br>Antes de registrar a demanda, procure o jovem no cadastro. Se ele já existir, a demanda ficará ligada ao Formulário Inicial e os dados cadastrados serão reutilizados. Se não existir, o sistema cria um cadastro provisório ao salvar.</div><div class="art-link-box"><input class="input" data-youth-search placeholder="Nome, CPF ou telefone"><button class="btn secondary" type="button" data-youth-search-btn>Consultar cadastro</button></div><div data-youth-results style="margin-top:9px"></div><div class="actions" style="margin-top:10px"><button class="btn secondary" type="button" data-youth-new>Criar novo cadastro ao salvar</button></div><div class="art-grid" style="margin-top:12px"><div class="field"><label>CPF</label><input class="input" data-youth-cpf inputmode="numeric"></div><div class="field"><label>Telefone</label><input class="input" data-youth-phone inputmode="tel"></div><div class="field"><label>E-mail</label><input class="input" data-youth-email type="email"></div><div class="field"><label>Bairro</label><input class="input" data-youth-neighborhood></div><div class="field"><label>Município</label><input class="input" data-youth-municipality value="Cariacica"></div></div>`;
  body.prepend(sec);sec.querySelector('[data-youth-search-btn]').onclick=()=>searchYouth(form);sec.querySelector('[data-youth-new]').onclick=()=>{state={mode:'new',youthId:null};sec.querySelector('[data-youth-results]').innerHTML='<div class="notice success"><b>Novo cadastro selecionado.</b><br>Ao salvar a demanda, será criado um Formulário Inicial provisório ligado a este registro.</div>'};
}

async function save(form){
  if(!state.mode)throw new Error('Consulte o cadastro do jovem ou confirme a criação de um novo cadastro antes de salvar.');
  if(!currentActionId)throw new Error('Não foi possível identificar a ação de levantamento. Feche e abra o formulário novamente.');
  const v=k=>clean(form.querySelector(`[data-f="${k}"]`)?.value)||null;
  const full=v('full');if(state.mode==='new'&&!full)throw new Error('Informe o nome completo para criar o cadastro do jovem.');
  const categories=[...form.querySelectorAll('[data-categories] input:checked')].map(x=>x.value),art=form.querySelector('[data-f="art"]'),artId=art?.value||null,artName=art?.selectedOptions?.[0]?.textContent?.trim()||null;
  const payload={demand_action_id:currentActionId,articulator_user_id:artId,articulator_name:artName,full_name:full,social_name:v('social'),birth_date:v('birth'),cpf:clean(form.querySelector('[data-youth-cpf]')?.value)||null,phone:clean(form.querySelector('[data-youth-phone]')?.value)||null,email:clean(form.querySelector('[data-youth-email]')?.value)||null,neighborhood:clean(form.querySelector('[data-youth-neighborhood]')?.value)||null,municipality:clean(form.querySelector('[data-youth-municipality]')?.value)||'Cariacica',residence:v('residence'),race:v('race'),gender_identity:v('gender'),sexual_orientation:v('orientation'),religion:v('religion'),religion_other:v('religionOther'),friend_places:v('friends'),desired_workshop:v('desired'),preferred_days:[...form.querySelectorAll('[data-days] input:checked')].map(x=>x.value),availability_shifts:[...form.querySelectorAll('[data-shifts] input:checked')].map(x=>x.value),community_missing:v('missing'),places_to_visit:v('places'),skills:v('skills'),mapping_action_name:v('mapping'),mapping_location_type:v('locType'),mapping_location_other:v('locOther'),demand_categories:categories};
  const {data,error}=await client().rpc('save_articulation_demand_with_youth',{p_payload:payload,p_youth_id:state.youthId,p_create_new:state.mode==='new'});if(error)throw error;return data;
}

document.addEventListener('click',e=>{const b=e.target.closest?.('[data-add-demand-response]');if(b){currentActionId=b.dataset.addDemandResponse;state={mode:null,youthId:null}}},true);
document.addEventListener('submit',async e=>{
  const form=e.target;if(!(form instanceof HTMLFormElement)||form!==originalModalForm()||form.dataset.youthLinkEnhanced!=='1')return;
  e.preventDefault();e.stopImmediatePropagation();const btn=e.submitter||form.querySelector('button[type="submit"]');if(btn){btn.disabled=true;btn.textContent='Salvando…'}
  try{await save(form);document.querySelector('#art-modal')?.remove();reset();refreshArea()}catch(err){showError(form,err.message||String(err));if(btn){btn.disabled=false;btn.textContent='Salvar'}}
},true);

const obs=new MutationObserver(()=>{const f=originalModalForm();if(f)enhance(f)});obs.observe(document.documentElement,{childList:true,subtree:true});
