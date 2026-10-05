import { apiMode, supabaseClient, getSession } from './api.js?v=20261004-2';
import { canFillForm } from './permissions.js?v=20261005-3';

const TECH_ROLES=new Set(['assistente_social','psicologo','terapeuta_ocupacional']);
const FORM_OPTIONS=[
  ['acompanhamento','Anexo 3','Acompanhamento'],
  ['pvida','Anexo 4','PVida'],
  ['outras-demandas','Anexo 5','Outras Demandas'],
  ['ptrampo','Anexo 6','PTrampo'],
  ['avaliacao-atividades','Anexo 7','Avaliação das Atividades'],
  ['relatorio-mobilizacao','Anexo 8','Relatório de Mobilização dos Jovens'],
  ['emprestimo','Anexo 9','Empréstimo de Equipamento / Espaço'],
  ['cfdh-planejamento','Anexo 11','CFDH — Planejamento'],
  ['cfdh-avaliacao-jovens','Anexo 12','CFDH — Avaliação dos Jovens'],
  ['cfdh-avaliacao-equipe','Anexo 13','CFDH — Avaliação Educadores e Oficineiros'],
];
const TECH_INFO={
  acompanhamento:{title:'Acompanhamento técnico',items:['Meta 2 · Etapa 2.1 — atendimento técnico','Registro qualitativo de acompanhamento — sem duplicar contagem']},
  pvida:{title:'PVida',items:['Meta 2 · Etapa 2.1 — atendimento realizado','Meta 6 · Etapa 6.2 — jovens, participações e horas de PVida']},
  ptrampo:{title:'PTrampo',items:['Meta 2 · Etapa 2.1 — atendimento realizado','Meta 4 · Etapa 4.1 e Meta 6 · Etapa 6.4 — jovens e atividades de PTrampo']},
  'outras-demandas':{title:'Outras Demandas',items:['Meta 2 · Etapa 2.1 — atendimento realizado','Meta 6 · Etapa 6.2 — acompanhamentos de outras demandas']},
};
let me=null,timer=null;
const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function c(){if(apiMode()!=='live')throw new Error('Banco ainda não conectado.');return supabaseClient()}
function routeParts(){return (location.hash||'#dashboard').split('?')[0].replace(/^#/,'').split('/')}
function youthId(){const p=routeParts();return p[0]==='jovem'?p[1]||null:null}
function formRoute(){const p=routeParts();return p[0]==='formulario'?{slug:p[1]||'',youthId:p[2]||null}:null}
function isTech(){return TECH_ROLES.has(String(me?.role||''))}

async function ready(){for(let i=0;i<100;i++){if(apiMode()==='live'){try{const s=await getSession();if(s?.user){me=s.user;return true}}catch{}}await sleep(120)}return false}
function style(){if(document.querySelector('#youth-enh-style'))return;const s=document.createElement('style');s.id='youth-enh-style';s.textContent=`
.workshop-enrolled{border-color:#36a878!important;background:#e9f8f0!important;color:#17633f!important;box-shadow:0 0 0 3px rgba(54,168,120,.12),0 0 18px rgba(54,168,120,.18)!important;cursor:default!important;opacity:1!important}.workshop-enrolled::before{content:'●';color:#25a66f;margin-right:7px}.youth-method-card{border:1px solid #cee5dc;background:#f4fbf8;border-radius:13px;padding:13px;margin:12px 0}.youth-method-card .method-chip{display:inline-block;padding:5px 8px;border-radius:999px;background:#e2f3ec;margin:4px 5px 0 0;font-size:12px}.delete-youth-btn{border-color:#e9bcbc!important;color:#963939!important}.doc-state{display:inline-flex;margin-top:5px}
`;document.head.appendChild(s)}

function ensureBackButton(){
  const route=routeParts()[0];if(!route||['dashboard'].includes(route))return;
  const head=document.querySelector('.content .page-head');if(!head||head.querySelector('[data-back],[data-global-back]'))return;
  let actions=head.querySelector(':scope > .actions');if(!actions){actions=document.createElement('div');actions.className='actions';head.appendChild(actions)}
  const b=document.createElement('button');b.type='button';b.className='btn';b.dataset.globalBack='1';b.textContent='← Voltar';b.onclick=()=>{if(history.length>1)history.back();else location.hash='#dashboard'};actions.prepend(b);
}

async function decorateYouth(){
  const id=youthId();if(!id)return;
  const head=document.querySelector('.content .page-head');if(!head)return;
  const actions=head.querySelector(':scope > .actions');
  const service=document.querySelector('[data-action="new-service"]');
  if(service){if(!isTech())service.remove();else service.textContent='+ Atendimento técnico'}
  if(actions&&canFillForm(me.role,'formulario-inicial')&&!actions.querySelector('[data-delete-youth]')){
    const b=document.createElement('button');b.type='button';b.className='btn delete-youth-btn';b.dataset.deleteYouth=id;b.textContent='Excluir cadastro';b.onclick=async()=>{
      if(!confirm('Excluir este cadastro? Ele ficará disponível para restauração por 24 horas.'))return;
      b.disabled=true;try{const r=await c().rpc('soft_delete_youth',{p_youth_id:id});if(r.error)throw r.error;alert('Cadastro enviado para a lixeira de segurança. Pode ser restaurado por até 24 horas.');location.hash='#jovens'}catch(e){alert(e.message||e);b.disabled=false}
    };actions.appendChild(b)
  }
  const [enroll,forms]=await Promise.all([
    c().from('workshop_enrollments').select('workshop_id,status').eq('youth_id',id).eq('status','ativo'),
    c().from('methodology_form_submissions').select('id,form_slug,record_state,incomplete_fields').eq('youth_id',id)
  ]);
  if(!enroll.error){const active=new Set((enroll.data||[]).map(x=>x.workshop_id));document.querySelectorAll('[data-enroll]').forEach(btn=>{if(active.has(btn.dataset.enroll)){btn.disabled=true;btn.classList.add('workshop-enrolled');const raw=btn.textContent.replace(/^Inscrever em\s*/i,'').replace(/\s*\?.*$/,'').trim();btn.textContent=`Jovem cadastrado · ${raw}`;btn.title='Jovem já cadastrado nesta oficina';btn.setAttribute('aria-pressed','true')}})}
  if(!forms.error){const map=new Map((forms.data||[]).map(x=>[x.id,x]));document.querySelectorAll('[data-download-form]').forEach(btn=>{const row=map.get(btn.dataset.downloadForm),item=btn.closest('div[style*="padding:10px"]');if(!row||!item||item.querySelector('[data-doc-state]'))return;const label=row.record_state==='complete'?'Concluído':`Rascunho${row.incomplete_fields?.length?' · '+row.incomplete_fields.length+' pendência(s)':''}`;const pill=document.createElement('span');pill.dataset.docState='1';pill.className=`pill doc-state ${row.record_state==='complete'?'success':'warn'}`;pill.textContent=label;item.querySelector('strong')?.parentElement?.appendChild(document.createElement('br'));item.querySelector('strong')?.parentElement?.appendChild(pill)})}
}

function hideDeletedRows(){if(routeParts()[0]!=='jovens')return;document.querySelectorAll('.content table tbody tr').forEach(tr=>{if(/\bexcluido\b/i.test(tr.textContent||''))tr.remove()})}

function openFormsModal(id){
  document.querySelector('#youth-forms-modal')?.remove();const allowed=FORM_OPTIONS.filter(([slug])=>canFillForm(me.role,slug));
  const bg=document.createElement('div');bg.id='youth-forms-modal';bg.className='modal-backdrop';bg.innerHTML=`<div class="modal"><div class="modal-head"><div><h3>+ Formulários metodológicos</h3><p class="muted" style="margin:4px 0 0">Os dados correspondentes do Formulário Inicial serão pré-preenchidos. Lista de Presença e Anexo 10 seguem fluxos próprios.</p></div><button class="btn ghost" type="button" data-close>✕</button></div><div class="grid two">${allowed.map(([slug,annex,title])=>`<button class="btn" type="button" data-open-method-form="${slug}"><b>${annex}</b> — ${esc(title)}</button>`).join('')||'<div class="notice warn">Seu perfil não possui outro formulário metodológico liberado para preenchimento.</div>'}</div></div>`;document.body.appendChild(bg);bg.querySelector('[data-close]').onclick=()=>bg.remove();bg.addEventListener('click',e=>{if(e.target===bg)bg.remove()});bg.querySelectorAll('[data-open-method-form]').forEach(b=>b.onclick=()=>{bg.remove();location.hash=`#formulario/${b.dataset.openMethodForm}/${id}`})
}

function decorateTechnicalForm(){
  const info=formRoute();if(!info||!TECH_INFO[info.slug]||!isTech())return;const form=document.querySelector('#dynamic-form');if(!form||form.querySelector('[data-technical-quality]'))return;
  const card=form.querySelector('.methodology-form-editor');if(!card)return;const meta=TECH_INFO[info.slug];const box=document.createElement('div');box.dataset.technicalQuality='1';box.className='youth-method-card';box.innerHTML=`<b>${esc(meta.title)} · vínculo com Plano de Trabalho</b><div>${meta.items.map(x=>`<span class="method-chip" title="Este vínculo só soma o indicador quando o atendimento/acompanhamento correspondente é efetivamente registrado no fluxo técnico.">${esc(x)}</span>`).join('')}</div><p class="muted" style="margin:8px 0 12px">O anexo é a evidência qualitativa. A pontuação não é duplicada pelo documento: o número entra pelo atendimento/acompanhamento executado.</p><div class="form-grid"><div class="field"><label>Modalidade do atendimento</label><select name="_service_modality"><option value="">Selecione</option><option value="presencial">Presencial</option><option value="remoto">Remoto</option><option value="visita_domiciliar">Visita domiciliar</option><option value="acao_externa">Ação externa</option><option value="outro">Outro</option></select></div><div class="field"><label>Resultado / situação ao final</label><textarea name="_outcome"></textarea></div><div class="field"><label>Encaminhamentos realizados</label><textarea name="_referrals"></textarea></div><div class="field"><label>Referência de evidência</label><input class="input" name="_evidence_ref" placeholder="Documento, ata, protocolo, registro..."></div></div>`;const firstSection=card.querySelector('.section');if(firstSection)firstSection.before(box);else card.prepend(box)
}

function protectTechnicalButton(e){const b=e.target.closest?.('[data-action="new-service"]');if(!b||isTech())return;e.preventDefault();e.stopImmediatePropagation();alert('O registro de Atendimento é exclusivo da Equipe Técnica.')}
function interceptFormsButton(e){const b=e.target.closest?.('[data-action="new-youth-form"]');if(!b)return;const id=youthId();if(!id)return;e.preventDefault();e.stopImmediatePropagation();openFormsModal(id)}
document.addEventListener('click',protectTechnicalButton,true);
document.addEventListener('click',interceptFormsButton,true);

async function apply(){if(!me?.active)return;style();ensureBackButton();hideDeletedRows();decorateTechnicalForm();await decorateYouth()}
function schedule(){clearTimeout(timer);timer=setTimeout(()=>apply().catch(console.warn),80)}
async function boot(){if(!(await ready()))return;new MutationObserver(schedule).observe(document.body,{subtree:true,childList:true});window.addEventListener('hashchange',schedule);schedule()}
boot();
