import { apiMode, supabaseClient } from './api.js?v=20261004-2';
import { captureRoute } from './route_lifecycle.js?v=20261020-navigation1';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const num = value => Number(value || 0).toLocaleString('pt-BR', {maximumFractionDigits:1});
const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const firstDay = date => `${date.slice(0,7)}-01`;
const client = () => { if (apiMode() !== 'live') throw new Error('O banco ainda não está conectado.'); return supabaseClient(); };

function injectStyle() {
  if (document.querySelector('#art-monitor-style')) return;
  const style = document.createElement('style');
  style.id = 'art-monitor-style';
  style.textContent = `
  .am-shell{display:grid;gap:15px}.am-heading{display:flex;justify-content:space-between;align-items:start;gap:12px;flex-wrap:wrap}.am-sub{font-size:13px;color:var(--muted,#65736f);line-height:1.5}.am-card{background:#fff;border:1px solid var(--border,#dfe7e5);border-radius:14px;padding:16px}.am-card h3{margin:0 0 6px}.am-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-items:end}.am-filters .field{min-width:0}.am-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.am-kpi{background:#f8fcfa;border:1px solid #dcebe5;border-radius:13px;padding:14px}.am-kpi b{display:block;font-size:25px;color:#165e4c}.am-kpi span,.am-kpi small{display:block;color:#60736b;font-size:12px}.am-grid{display:grid;grid-template-columns:1.25fr 1fr;gap:12px}.am-chart{display:grid;gap:8px;margin-top:14px}.am-bar{display:grid;grid-template-columns:minmax(90px,135px) 1fr auto;gap:8px;align-items:center;font-size:12px}.am-track{height:11px;background:#e9f1ed;border-radius:10px;overflow:hidden}.am-fill{display:block;height:100%;background:#18836a;border-radius:10px}.am-footnote{font-size:12px;color:#65736f;line-height:1.5;margin:0}.am-empty{color:#65736f;border:1px dashed #d6dfdc;border-radius:10px;padding:18px;text-align:center}.am-error{color:#8b2525}.am-chart-scroll{max-height:350px;overflow:auto}.am-detail[hidden]{display:none}.am-detail select{width:100%}.am-detail [data-am-detail-status]{display:block;margin-top:6px}@media(max-width:850px){.am-filters,.am-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.am-grid{grid-template-columns:1fr}}@media(max-width:520px){.am-filters,.am-kpis{grid-template-columns:1fr}.am-bar{grid-template-columns:95px 1fr auto}}
  `;
  document.head.appendChild(style);
}

function tabs() {
  return `<nav class="art-tabs" aria-label="Abas da Articulação"><a class="btn secondary" href="#articulacao?view=estrategias">Propostas de mobilização</a><a class="btn secondary" href="#articulacao?view=plano-geral">Plano geral / minhas ações</a><a class="btn secondary" href="#articulacao?view=interesses">Banco de interesses</a><a class="btn secondary" href="#articulacao?view=solicitacoes">Solicitações</a><a class="btn secondary" href="#articulacao?view=planos">Planos de mobilização</a><a class="btn secondary" href="#articulacao?view=demandas">Levantamento de demandas</a><a class="btn secondary" href="#articulacao?view=analise">Análise territorial</a><a class="btn primary" aria-current="page" href="#articulacao?view=monitoramento">Monitoramento de jovens</a></nav>`;
}

function chart(rows, valueKey, label, empty) {
  if (!rows.length) return `<div class="am-empty">${esc(empty)}</div>`;
  const max = Math.max(1, ...rows.map(row => Number(row[valueKey]) || 0));
  return `<div class="am-chart">${rows.map(row => `<div class="am-bar"><span>${esc(label(row))}</span><span class="am-track"><span class="am-fill" style="width:${Math.max(0,100*Number(row[valueKey]||0)/max)}%"></span></span><strong>${num(row[valueKey])}</strong></div>`).join('')}</div>`;
}
function resultHtml(data, scope) {
  const timeline=Array.isArray(data.timeline)?data.timeline:[], ages=Array.isArray(data.ages)?data.ages:[];
  const label = scope==='all' ? 'todos os atendimentos e atividades disponíveis' : 'o recorte selecionado';
  return `<div class="am-kpis"><div class="am-kpi"><span>Jovens / pessoas únicas</span><b>${num(data.people)}</b><small>Identificados nos registros</small></div><div class="am-kpi"><span>Participações registradas</span><b>${num(data.participations)}</b><small>Atendimentos, presenças e usos</small></div><div class="am-kpi"><span>Frequência média</span><b>${num(data.average)}</b><small>Pessoas por dia com registro</small></div><div class="am-kpi"><span>Dias com registros</span><b>${num(data.days)}</b><small>No período escolhido</small></div></div>
  <div class="am-grid"><section class="am-card"><h3>Participações por dia</h3><p class="am-sub">Quantidade de registros realizados em cada dia.</p><div class="am-chart-scroll">${chart(timeline,'participations',x=>fmt(x.date),'Ainda não há participações para este filtro e período.')}</div></section><section class="am-card"><h3>Faixa etária</h3><p class="am-sub">Pessoas únicas em ${esc(label)}; idade na data final do período.</p>${chart(ages,'total',x=>x.label,'Ainda não há idades para este filtro e período.')}</section></div>
  <p class="am-footnote">A frequência média considera apenas dias com registros. Uma pessoa conta uma vez por dia na frequência e uma vez no total de pessoas; pode ter várias participações. Os dados vêm dos registros existentes e incluem visitantes provisórios quando identificados. Registros sem vínculo de cadastro são contados individualmente. Dados técnicos são apresentados apenas em totais.</p>`;
}

export async function mountArticulationMonitor(host) {
  injectStyle();
  const current=captureRoute(host), end=today(), start=firstDay(end);
  host.innerHTML=`<div class="am-shell"><div class="page-head"><div><h2>Área da Articulação</h2><p>Monitoramento para planejar e apoiar a mobilização dos jovens.</p></div></div>${tabs()}<section class="am-card"><div class="am-heading"><div><h3>Monitoramento de jovens</h3><p class="am-sub" data-am-reference>Carregando referências da equipe…</p></div></div><form data-am-form><div class="am-filters"><div class="field"><label for="am-start">De</label><input class="input" id="am-start" name="start" type="date" value="${start}" required></div><div class="field"><label for="am-end">Até</label><input class="input" id="am-end" name="end" type="date" value="${end}" required></div><div class="field"><label for="am-scope">O que acompanhar</label><select class="input" id="am-scope" name="scope"><option value="all" selected>Jovens em geral · todos os atendimentos</option><option value="pvida">PVida</option><option value="ptrampo">PTrampo</option><option value="outras">Outras demandas</option><option value="workshops">Todas as oficinas</option><option value="reference">Oficinas dos meus educadores de referência</option><option value="workshop">Selecionar oficina</option><option value="free">Uso livre · geral</option><option value="room">Uso livre · selecionar sala</option></select></div><div class="field am-detail" data-am-detail hidden><label for="am-item" data-am-detail-label>Selecione</label><select class="input" id="am-item" name="item"></select><small class="am-sub" data-am-detail-status aria-live="polite"></small></div><button class="btn primary" type="submit">Atualizar monitoramento</button></div></form></section><div data-am-output aria-live="polite"><div class="am-empty">Carregando dados…</div></div></div>`;
  const output=host.querySelector('[data-am-output]'), form=host.querySelector('[data-am-form]'), scope=form.elements.scope, detail=host.querySelector('[data-am-detail]'), item=form.elements.item;
  let options, sequence=0, workshopLoad=0;
  const normalizedWorkshops = rows => (Array.isArray(rows)?rows:[])
    .filter(row=>row?.id&&row?.name)
    .map(row=>({...row,active:row.active===true}))
    .sort((a,b)=>Number(b.active)-Number(a.active)||String(a.name).localeCompare(String(b.name),'pt-BR'));
  function setDetails() {
    const needs=scope.value==='workshop'||scope.value==='room';
    detail.hidden=!needs; item.required=needs;
    const feedback=host.querySelector('[data-am-detail-status]');
    if (!needs) {item.disabled=false;item.innerHTML='';feedback.textContent='';return;}
    const workshop=scope.value==='workshop';
    const rows=workshop?normalizedWorkshops(options?.workshops):(Array.isArray(options?.rooms)?options.rooms:[]);
    const previous=item.value;
    host.querySelector('[data-am-detail-label]').textContent=workshop?'Oficina':'Sala';
    item.innerHTML=`<option value="">${workshop&&!rows.length?'Nenhuma oficina disponível':'Selecione'}</option>${rows.map(row=>`<option value="${esc(row.id)}">${esc(row.name)}${workshop?(row.active?' (ativa)':' (inativa)'):''}</option>`).join('')}`;
    item.disabled=workshop&&!rows.length;
    if(rows.some(row=>String(row.id)===previous))item.value=previous;
    if(workshop){
      const active=rows.filter(row=>row.active).length;
      feedback.textContent=rows.length?`${rows.length} oficina(s) cadastrada(s): ${active} ativa(s) e ${rows.length-active} inativa(s).`:'Nenhuma oficina foi retornada. Verifique o carregamento das oficinas cadastradas.';
    }else feedback.textContent='';
  }
  async function reloadWorkshops() {
    const request=++workshopLoad;
    const initial=normalizedWorkshops(options?.workshops);
    const feedback=host.querySelector('[data-am-detail-status]');
    if(!initial.length){
      item.disabled=true;
      item.innerHTML='<option value="">Carregando oficinas...</option>';
      feedback.textContent='Consultando todas as oficinas cadastradas, ativas e inativas...';
    }
    try {
      // Consulta o cadastro diretamente, sem filtrar por status ou presença.
      // A lista da RPC é preservada como alternativa caso a leitura sob RLS seja parcial.
      const {data,error}=await client().from('workshops').select('id,name,active').order('name');
      if(error)throw error;
      if(!current()||scope.value!=='workshop'||request!==workshopLoad)return;
      const merged=new Map(initial.map(row=>[String(row.id),row]));
      for(const row of data||[]){
        if(row?.id&&row?.name)merged.set(String(row.id),{...merged.get(String(row.id)),...row});
      }
      options.workshops=normalizedWorkshops([...merged.values()]);
      setDetails();
    } catch(error) {
      if(!current()||scope.value!=='workshop'||request!==workshopLoad)return;
      if(initial.length){
        options.workshops=initial;
        setDetails();
        feedback.textContent+=' Não foi possível atualizar o cadastro agora.';
      }else{
        item.disabled=true;
        item.innerHTML='<option value="">Não foi possível carregar as oficinas</option>';
        feedback.textContent=`Erro ao carregar oficinas: ${error.message||error}`;
      }
    }
  }
  async function refresh() {
    if (!form.reportValidity()) return;
    const from=form.elements.start.value, to=form.elements.end.value;
    if (from>to) {output.innerHTML='<div class="notice danger">A data inicial deve ser anterior à data final.</div>';return;}
    const selectedScope=scope.value, selectedItem=item.value||null;
    if((selectedScope==='workshop'||selectedScope==='room')&&!selectedItem){
      output.innerHTML='<div class="notice danger" role="alert">Selecione uma oficina ou sala para atualizar o monitoramento.</div>';
      return;
    }
    const seq=++sequence; output.innerHTML='<div class="am-empty" role="status">Atualizando monitoramento…</div>';
    try {
      const {data,error}=await client().rpc('articulation_youth_monitor',{p_start:from,p_end:to,p_scope:selectedScope,p_selected_id:selectedItem});
      if(error)throw error;if(!current()||seq!==sequence)return;
      output.innerHTML=resultHtml(data||{},selectedScope);
    } catch(error) {if(current()&&seq===sequence)output.innerHTML=`<div class="notice danger" role="alert">Não foi possível carregar os indicadores: ${esc(error.message||error)}</div>`;}
  }
  try {
    const {data,error}=await client().rpc('articulation_monitor_options');if(error)throw error;if(!current())return;
    options={educators:data?.educators||[],workshops:data?.workshops||[],rooms:data?.rooms||[]};
    const names=options.educators.map(e=>e.name).filter(Boolean);
    host.querySelector('[data-am-reference]').textContent=names.length?`Educador(es) de referência: ${names.join(', ')}.`:'Nenhum educador está vinculado ao seu perfil. A Coordenação Geral pode configurar em Equipes.';
    scope.addEventListener('change',()=>{setDetails();if(scope.value==='workshop')void reloadWorkshops();});
    form.addEventListener('submit',event=>{event.preventDefault();refresh()});
    setDetails();await refresh();
  } catch(error) {if(current()){host.querySelector('[data-am-reference]').textContent='Não foi possível carregar as referências.';output.innerHTML=`<div class="notice danger" role="alert">Não foi possível preparar o monitoramento: ${esc(error.message||error)}</div>`;}}
}
