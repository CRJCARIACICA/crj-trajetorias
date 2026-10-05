import { apiMode, supabaseClient } from './api.js?v=20261004-2';

const TYPE_LABELS={
  evento:'Evento / programação',
  passeio:'Passeio',
  campeonato:'Campeonato',
  vivencia:'Vivência',
  intercambio:'Intercâmbio'
};
const SPECIAL_WITH_YOUTH=new Set(['campeonato','vivencia','intercambio']);
const EXTERNAL_TYPES=new Set(['passeio','campeonato','vivencia','intercambio']);
const SUGGESTIONS={
  evento:['M6.1_EVENTOS','M4.4_ACOES'],
  passeio:['M6.1_PARTICIPACOES_CULTURA','M6.1_PASSAGENS','M4.4_ACOES'],
  campeonato:['M6.1_PARTICIPACOES_CULTURA','M6.1_EVENTOS'],
  vivencia:['M6.1_PARTICIPACOES_CULTURA','M4.2_ATIVIDADES_PERCENTUAL'],
  intercambio:['M4.4_ACOES','M6.1_PARTICIPACOES_CULTURA','M6.1_PASSAGENS']
};

let cachePromise=null;
const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const norm=(v='')=>String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

function currentMonth(){
  const params=new URLSearchParams((location.hash.split('?')[1]||''));
  return params.get('month')||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7);
}
function injectStyle(){
  if(document.querySelector('#edu-comp-style'))return;
  const s=document.createElement('style');s.id='edu-comp-style';s.textContent=`
  .edu-comp-backdrop{position:fixed;inset:0;z-index:2147482000;background:rgba(5,18,22,.68);backdrop-filter:blur(5px);display:grid;place-items:center;padding:24px}
  .edu-comp-modal{width:min(980px,96vw);max-height:92vh;overflow:auto;background:var(--card,#fff);border-radius:18px;box-shadow:0 28px 80px rgba(0,0,0,.3);border:1px solid var(--border,#dce4e2)}
  .edu-comp-head{position:sticky;top:0;z-index:2;background:var(--card,#fff);display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:18px 20px;border-bottom:1px solid var(--border,#e3e7e6)}
  .edu-comp-head h3{margin:0 0 3px}.edu-comp-head p{margin:0;color:var(--muted,#64706d);font-size:12px}.edu-comp-close{border:0;background:transparent;font-size:28px;cursor:pointer;color:#67716e}
  .edu-comp-body{padding:18px 20px;display:grid;gap:15px}.edu-comp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.edu-comp-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
  .edu-comp-section{border:1px solid var(--border,#e3e7e6);border-radius:14px;padding:14px;background:#fbfdfc}.edu-comp-section>h4{margin:0 0 4px}.edu-comp-section>p{margin:0 0 12px;color:#697571;font-size:12px}
  .edu-comp-youth-search{margin-bottom:8px}.edu-comp-youth-list{max-height:230px;overflow:auto;border:1px solid #dce5e2;border-radius:11px;background:#fff;padding:6px}.edu-comp-youth-row{display:flex;gap:9px;align-items:center;padding:8px;border-radius:8px}.edu-comp-youth-row:hover{background:#f0f7f5}.edu-comp-youth-row input{width:16px;height:16px}.edu-comp-youth-row span{display:grid}.edu-comp-youth-row small{color:#76807d}
  .edu-comp-method-list{display:grid;gap:7px}.edu-comp-method-row{display:grid;grid-template-columns:auto 1fr;gap:9px;padding:9px;border:1px solid #dce7e3;border-radius:10px;background:#fff}.edu-comp-method-row.suggested{border-color:#9fd0c4;background:#f4fbf8}.edu-comp-method-row input{margin-top:3px}.edu-comp-method-row b{font-size:12px}.edu-comp-method-row small{display:block;color:#66726e;margin-top:2px;line-height:1.35}.edu-comp-suggest{font-size:9px;padding:2px 5px;border-radius:999px;background:#dff4eb;color:#17634f;margin-left:5px}
  .edu-comp-actions{display:flex;justify-content:flex-end;gap:8px;position:sticky;bottom:0;background:var(--card,#fff);padding:14px 20px;border-top:1px solid var(--border,#e3e7e6)}
  .edu-comp-summary{margin-top:11px;padding:10px 12px;border-radius:10px;background:#f3f8f7;border:1px solid #dbeae6;font-size:12px;line-height:1.5}.edu-comp-summary b{color:#245f53}.edu-comp-summary .edu-comp-method-pills{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}.edu-comp-summary .edu-comp-method-pills span{font-size:10px;padding:3px 6px;border-radius:999px;background:#e4f4ef;color:#145b49}
  @media(max-width:700px){.edu-comp-backdrop{padding:8px}.edu-comp-modal{width:100%;max-height:97vh}.edu-comp-grid,.edu-comp-grid.three{grid-template-columns:1fr}.edu-comp-head,.edu-comp-body{padding-left:14px;padding-right:14px}.edu-comp-actions{padding:12px 14px}}
  `;document.head.appendChild(s);
}

async function loadData(force=false){
  if(cachePromise&&!force)return cachePromise;
  cachePromise=(async()=>{
    if(apiMode()!=='live')return {workshops:[],youth:[],indicators:[],plans:[]};
    const c=supabaseClient(),month=currentMonth();
    const [w,y,i,p]=await Promise.all([
      c.from('workshops').select('id,name,active').eq('active',true).order('name'),
      c.from('young_people').select('id,full_name,preferred_name,status').eq('status','ativo').order('full_name'),
      c.from('indicator_catalog').select('code,label,goal_stage,target,unit,periodicity').eq('active',true).order('code'),
      c.from('educator_plans').select('id,plan_type,complementary_type,workshop_id,activity_title,location,participant_youth_ids,methodology_links,planned_start').order('created_at',{ascending:false})
    ]);
    for(const q of [w,y,i,p])if(q.error)throw q.error;
    return {workshops:w.data||[],youth:y.data||[],indicators:i.data||[],plans:p.data||[],month};
  })();
  try{return await cachePromise}catch(e){cachePromise=null;throw e}
}

function relevantIndicators(rows=[]){
  const re=/(evento|programa|particip|cultur|campeonato|atividade|parceria|passagem|mostra|oficina|curso)/i;
  return rows.filter(x=>/^M(?:4|6)\./.test(x.code||'')&&re.test((x.label||'')+' '+(x.code||''))).slice(0,24);
}
function metaStageText(row){
  const stage=String(row.goal_stage||'').trim();
  if(!stage)return 'Vínculo metodológico';
  return 'Meta '+stage.split('.')[0]+' · Etapa '+stage;
}
function methodologyHtml(indicators,type){
  const suggestions=new Set(SUGGESTIONS[type]||[]),rows=relevantIndicators(indicators).sort((a,b)=>Number(suggestions.has(b.code))-Number(suggestions.has(a.code))||String(a.code).localeCompare(String(b.code)));
  return rows.map(x=>`<label class="edu-comp-method-row ${suggestions.has(x.code)?'suggested':''}"><input type="checkbox" name="methodology_code" value="${esc(x.code)}"><span><b>${esc(metaStageText(x))} · ${esc(x.label)}${suggestions.has(x.code)?'<em class="edu-comp-suggest">sugestão</em>':''}</b><small>${x.target!=null?`Referência: ${esc(x.target)} ${esc(x.unit||'')}`:'Indicador de acompanhamento'}${x.periodicity?' · '+esc(x.periodicity):''}. Marque somente quando este planejamento realmente contribuir para essa meta/etapa.</small></span></label>`).join('');
}
function youthHtml(youth){
  return youth.map(y=>`<label class="edu-comp-youth-row" data-youth-label="${esc(norm((y.preferred_name||'')+' '+(y.full_name||'')))}"><input type="checkbox" name="participant_youth_id" value="${esc(y.id)}"><span><b>${esc(y.preferred_name||y.full_name)}</b><small>${esc(y.full_name||'')}</small></span></label>`).join('');
}
function field(label,html,extra=''){return `<div class="field"><label>${label}</label>${html}${extra}</div>`}

async function openComplementaryPlanner(){
  injectStyle();
  let data;try{data=await loadData(true)}catch(err){alert('Não foi possível carregar os dados do planejamento: '+(err.message||err));return}
  const month=data.month||currentMonth(),defaultDate=month+'-01';
  document.querySelector('#edu-comp-backdrop')?.remove();
  const host=document.createElement('div');host.id='edu-comp-backdrop';host.className='edu-comp-backdrop';
  host.innerHTML=`<div class="edu-comp-modal" role="dialog" aria-modal="true" aria-label="Planejamento complementar do Educador">
    <div class="edu-comp-head"><div><h3>Novo planejamento complementar</h3><p>Passeios, campeonatos, vivências, intercâmbios e demais programações vinculadas ao trabalho educativo.</p></div><button class="edu-comp-close" type="button" aria-label="Fechar">×</button></div>
    <form id="edu-comp-form">
      <div class="edu-comp-body">
        <div class="edu-comp-grid">
          ${field('Tipo','<select name="complementary_type" required>'+Object.entries(TYPE_LABELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')+'</select>')}
          ${field('Oficina ligada','<select name="workshop_id"><option value="">Não se aplica</option>'+data.workshops.map(w=>`<option value="${w.id}">${esc(w.name)}</option>`).join('')+'</select>','<small data-workshop-rule>A vinculação é opcional para eventos gerais.</small>')}
        </div>
        <div data-location-wrap class="hidden">${field('Localização / destino','<input class="input" name="location" placeholder="Ex.: Parque Estadual, escola, ginásio, outro município...">','<small data-location-rule>Obrigatório para passeio.</small>')}</div>
        ${field('Atividade / título','<input class="input" name="activity_title" required>')}
        ${field('Descrição / objetivo','<textarea name="description_objective" required></textarea>')}
        <div class="edu-comp-grid">
          ${field('Núcleo metodológico','<input class="input" name="nucleus" placeholder="Quando aplicável">')}
          ${field('Eixo metodológico','<input class="input" name="axis" placeholder="Quando aplicável">')}
        </div>
        <div class="edu-comp-section" data-youth-section hidden><h4>Quais jovens vão participar?</h4><p>Selecione nominalmente os jovens previstos. Para Campeonato, Vivência e Intercâmbio esta definição é obrigatória.</p><input class="input edu-comp-youth-search" type="search" data-youth-search placeholder="Buscar jovem pelo nome"><div class="edu-comp-youth-list" data-youth-list>${youthHtml(data.youth)}</div><small data-youth-count>0 jovem(ns) selecionado(s)</small></div>
        <div class="edu-comp-grid three">
          ${field('Nº de jovens previsto','<input class="input" type="number" name="expected_participants" min="0">','<small>É atualizado pela seleção nominal quando houver jovens definidos.</small>')}
          ${field('Duração prevista (h)','<input class="input" type="number" step="0.25" name="planned_duration_hours" min="0">')}
          ${field('Mês de referência','<input class="input" value="'+esc(month.split('-').reverse().join('/'))+'" disabled>')}
        </div>
        <div class="edu-comp-grid">
          ${field('Data inicial','<input class="input" type="date" name="planned_start" value="'+esc(defaultDate)+'">')}
          ${field('Data final','<input class="input" type="date" name="planned_end" value="'+esc(defaultDate)+'">')}
        </div>
        <div class="edu-comp-section"><h4>Vínculo metodológico · Meta e Etapa</h4><p>Marque somente os indicadores que este planejamento realmente pretende complementar. As sugestões mudam conforme o tipo escolhido; nenhum vínculo é contabilizado como execução antes do registro/relatório.</p><div class="edu-comp-method-list" data-method-list>${methodologyHtml(data.indicators,'evento')}</div></div>
        <div class="edu-comp-grid">
          ${field('Equipe prevista','<input class="input" name="team_text">')}
          ${field('Parceiros','<input class="input" name="partners">')}
        </div>
        ${field('Mobilização / divulgação planejada','<textarea name="mobilization_plan"></textarea>')}
        ${field('Ações planejadas','<textarea name="planned_actions"></textarea>')}
        ${field('Resultados esperados','<textarea name="expected_results"></textarea>')}
        ${field('Recursos necessários','<textarea name="resources"></textarea>')}
        <div class="notice info"><b>Regra de contabilização:</b> este planejamento registra a previsão. Meta, etapa, participações e carga só devem ser contabilizadas após evidência de execução.</div>
      </div>
      <div class="edu-comp-actions"><button type="button" class="btn secondary" data-comp-cancel>Cancelar</button><button class="btn primary" type="submit">Salvar planejamento</button></div>
    </form>
  </div>`;
  document.body.appendChild(host);
  const form=host.querySelector('#edu-comp-form'),typeEl=form.querySelector('[name="complementary_type"]'),workshopEl=form.querySelector('[name="workshop_id"]'),locationWrap=form.querySelector('[data-location-wrap]'),locationEl=form.querySelector('[name="location"]'),youthSection=form.querySelector('[data-youth-section]'),expectedEl=form.querySelector('[name="expected_participants"]'),methodList=form.querySelector('[data-method-list]');
  const close=()=>host.remove();host.querySelector('.edu-comp-close')?.addEventListener('click',close);host.querySelector('[data-comp-cancel]')?.addEventListener('click',close);host.addEventListener('click',e=>{if(e.target===host)close()});
  const selectedYouth=()=>[...form.querySelectorAll('[name="participant_youth_id"]:checked')].map(x=>x.value);
  const updateYouthCount=()=>{const n=selectedYouth().length;form.querySelector('[data-youth-count]').textContent=n+' jovem(ns) selecionado(s)';if(n)expectedEl.value=n};
  form.querySelector('[data-youth-search]')?.addEventListener('input',e=>{const q=norm(e.target.value);form.querySelectorAll('[data-youth-label]').forEach(row=>row.hidden=q&&!row.dataset.youthLabel.includes(q))});
  form.querySelector('[data-youth-list]')?.addEventListener('change',updateYouthCount);
  const refreshType=()=>{
    const type=typeEl.value,isExternal=EXTERNAL_TYPES.has(type),requiresYouth=SPECIAL_WITH_YOUTH.has(type);
    locationWrap.classList.toggle('hidden',!isExternal);youthSection.hidden=!isExternal;
    locationEl.required=type==='passeio';workshopEl.required=requiresYouth;
    form.querySelector('[data-workshop-rule]').textContent=requiresYouth?'Obrigatório para '+TYPE_LABELS[type]+'.':'A vinculação é opcional para este tipo.';
    form.querySelector('[data-location-rule]').textContent=type==='passeio'?'Obrigatório para passeio.':'Informe quando houver local específico.';
    methodList.innerHTML=methodologyHtml(data.indicators,type);
  };
  typeEl.addEventListener('change',refreshType);refreshType();
  form.addEventListener('submit',async e=>{
    e.preventDefault();const type=typeEl.value,ids=selectedYouth();
    if(type==='passeio'&&!String(locationEl.value||'').trim()){alert('Informe a localização/destino do passeio.');locationEl.focus();return}
    if(SPECIAL_WITH_YOUTH.has(type)&&!workshopEl.value){alert('Selecione a oficina ligada a este '+TYPE_LABELS[type].toLowerCase()+'.');workshopEl.focus();return}
    if(SPECIAL_WITH_YOUTH.has(type)&&!ids.length){alert('Selecione quais jovens participarão deste '+TYPE_LABELS[type].toLowerCase()+'.');form.querySelector('[data-youth-search]')?.focus();return}
    const indicatorsByCode=new Map(data.indicators.map(x=>[x.code,x]));
    const methodologyLinks=[...form.querySelectorAll('[name="methodology_code"]:checked')].map(el=>{const x=indicatorsByCode.get(el.value);return x?{code:x.code,label:x.label,goal_stage:x.goal_stage,target:x.target,unit:x.unit,periodicity:x.periodicity}:null}).filter(Boolean);
    const fd=new FormData(form),payload={
      plan_type:'evento',complementary_type:type,workshop_id:fd.get('workshop_id')||null,
      activity_title:String(fd.get('activity_title')||'').trim(),description_objective:String(fd.get('description_objective')||'').trim(),
      nucleus:fd.get('nucleus')||null,axis:fd.get('axis')||null,location:String(fd.get('location')||'').trim()||null,
      participant_youth_ids:ids,methodology_links:methodologyLinks,
      expected_participants:fd.get('expected_participants')===''?(ids.length||null):Number(fd.get('expected_participants')),
      planned_duration_hours:fd.get('planned_duration_hours')===''?null:Number(fd.get('planned_duration_hours')),
      planned_start:fd.get('planned_start')||null,planned_end:fd.get('planned_end')||null,
      team_text:fd.get('team_text')||null,partners:fd.get('partners')||null,mobilization_plan:fd.get('mobilization_plan')||null,
      planned_actions:fd.get('planned_actions')||null,expected_results:fd.get('expected_results')||null,resources:fd.get('resources')||null,status:'planejado'
    };
    const submit=form.querySelector('[type="submit"]'),old=submit.textContent;submit.disabled=true;submit.textContent='Salvando...';
    try{
      const c=supabaseClient(),{error}=await c.from('educator_plans').insert(payload);if(error)throw error;
      cachePromise=null;close();location.reload();
    }catch(err){alert('Não foi possível salvar o planejamento: '+(err.message||err));submit.disabled=false;submit.textContent=old}
  });
}

async function enhanceCards(){
  if(!location.hash.startsWith('#educador'))return;
  const targets=[...document.querySelectorAll('[data-report-plan]')].filter(b=>!b.closest('.card')?.dataset.eduCompEnhanced);
  if(!targets.length)return;
  let data;try{data=await loadData()}catch{return}
  const byId=new Map(data.plans.map(x=>[x.id,x])),ym=new Map(data.youth.map(x=>[x.id,x])),wm=new Map(data.workshops.map(x=>[x.id,x]));
  for(const btn of targets){
    const p=byId.get(btn.dataset.reportPlan),card=btn.closest('.card');if(!p||!card||!p.complementary_type)continue;
    card.dataset.eduCompEnhanced='1';
    const pill=card.querySelector('.pill');if(pill)pill.textContent=TYPE_LABELS[p.complementary_type]||p.complementary_type;
    const names=(p.participant_youth_ids||[]).map(id=>ym.get(id)?.preferred_name||ym.get(id)?.full_name).filter(Boolean);
    const links=Array.isArray(p.methodology_links)?p.methodology_links:[];
    const detail=document.createElement('div');detail.className='edu-comp-summary';
    detail.innerHTML=`${p.location?'<div><b>Localização:</b> '+esc(p.location)+'</div>':''}${p.workshop_id?'<div><b>Oficina ligada:</b> '+esc(wm.get(p.workshop_id)?.name||'Oficina vinculada')+'</div>':''}${names.length?'<div><b>Jovens previstos:</b> '+esc(names.join(', '))+'</div>':''}${links.length?'<div><b>Vínculos metodológicos:</b><div class="edu-comp-method-pills">'+links.map(x=>'<span>'+esc(metaStageText(x))+' · '+esc(x.label||x.code)+'</span>').join('')+'</div></div>':''}`;
    card.appendChild(detail);
  }
}

function install(){
  injectStyle();
  document.addEventListener('click',e=>{
    const btn=e.target.closest?.('[data-new-educator-plan]');if(!btn)return;
    e.preventDefault();e.stopImmediatePropagation();openComplementaryPlanner();
  },true);
  let scheduled=false;const run=()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhanceCards()})};
  new MutationObserver(run).observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>{cachePromise=null;setTimeout(enhanceCards,80)});setTimeout(enhanceCards,250);
}
install();
