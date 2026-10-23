// Deterministic suggestions: coordination always reviews before publication.
export const CHANNELS=['WhatsApp','Escola','Redes sociais','Mobilização de rua','Parceiro / rede','Busca ativa','CRJ','Outro'];
export const REVIEW_LABELS={draft:'Rascunho',submitted:'Aguardando aprovação',approved:'Aprovada',changes_requested:'Ajustes solicitados',rejected:'Recusada'};
export const CONTACT_LABELS={pending:'A contatar',contacted:'Contato realizado',interested:'Interesse confirmado',enrolled:'Inscrição efetivada',unreachable:'Sem retorno',declined:'Sem interesse'};
export const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export const unique=values=>[...new Set(values.filter(Boolean))];
export const memberIds=row=>unique([row.reference_user_id,...(row.collaborator_ids||[])]);
const min=(...v)=>v.filter(Boolean).sort()[0];
const max=(...v)=>v.filter(Boolean).sort().at(-1);
const minutes=t=>{const m=String(t||'').match(/^(\d{2}):(\d{2})/);return m?+m[1]*60+(+m[2]):null};
const time=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
export const overlaps=(a,b)=>minutes(a.start_time)<minutes(b.end_time)&&minutes(a.end_time)>minutes(b.start_time);
export const monthEnd=month=>new Date(Date.UTC(+month.slice(0,4),+month.slice(5,7),0)).toISOString().slice(0,10);
export const shiftDate=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
export function calendarProblem(action,specialDays=[],busy=[]){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(action.scheduled_date||''))return 'Informe a data da mobilização.';
  const dow=new Date(action.scheduled_date+'T12:00:00Z').getUTCDay();
  if(dow===0||dow===6)return 'O CRJ funciona de segunda a sexta-feira.';
  const special=specialDays.find(x=>x.calendar_date===action.scheduled_date);
  if(special&&(special.closure_policy==='auto_closed'||special.approval_status==='closed'))return special.name+' — CRJ fechado.';
  if(special?.closure_policy==='approval_required'&&special.approval_status!=='open')return special.name+' — abertura ainda não autorizada.';
  const start=minutes(action.start_time),end=minutes(action.end_time);
  if(start==null||end==null||start<600||end>1260||end<=start)return 'Use um horário válido entre 10h e 21h.';
  if(dow===1&&start<990&&end>780)return 'Reunião geral da equipe: segunda-feira, 13h às 16h30.';
  const members=memberIds(action);
  const conflict=busy.find(x=>x.date===action.scheduled_date&&(!action.id||x.id!==action.id)&&overlaps(action,x)&&(x.all_staff||members.some(id=>(x.user_ids||[]).includes(id))));
  return conflict?'Conflito de colaborador com '+(conflict.title||'outro compromisso')+'.':null;
}
export function requestScope(requests,plans,strategies,month){
  return requests.filter(r=>!['cancelado','relatorio_finalizado','concluido'].includes(r.status)&&(
    r.planned_date?.slice(0,7)===month||plans.some(p=>p.request_id===r.id&&p.mobilization_deadline?.slice(0,7)===month)||strategies.some(s=>s.reference_month?.slice(0,7)===month&&(s.request_ids||[]).includes(r.id))));
}
export function coverageFor(requests,actions){
  const covered=new Set(actions.flatMap(a=>a.request_ids||[]));
  return requests.map(r=>({...r,covered:covered.has(r.id)}));
}
// Remote channels can cover several territories; physical visits need the same venue.
function groupKey(s){
  const ch=normalize(s.channel),remote=['whatsapp','redes sociais'].includes(ch);
  return ch+'|'+(remote?'remoto':normalize(s.location)+'|'+normalize(s.territory));
}
function combine(items,slot){
  const first=items[0],join=key=>unique(items.map(x=>x[key])).join('\n\n');
  return {title:`Mobilização · ${first.channel}${items.length>1?' · '+items.length+' estratégias':''}`,action_type:unique(items.map(x=>x.action_type)).join(' / '),channel:first.channel,territory:unique(items.map(x=>x.territory)).join(', '),location:['whatsapp','redes sociais'].includes(normalize(first.channel))?(join('location')||'CRJ / comunicação remota'):first.location,
    ...slot,reference_user_id:first.reference_user_id,collaborator_ids:unique(items.flatMap(memberIds)).filter(id=>id!==first.reference_user_id),strategy_ids:items.map(x=>x.id),request_ids:unique(items.flatMap(x=>x.request_ids||[])),objective:join('objective'),preparation_steps:join('preparation_steps'),execution_steps:join('execution_steps'),resources:join('resources'),documents_before:join('documents_before'),documents_after:join('documents_after'),preparation_deadline:shiftDate(slot.scheduled_date,-1),notes:'Sugestão agrupada por canal, local e disponibilidade. Conferir preparação e distribuição de tarefas.'};
}
export function suggestMobilizations({strategies,requests,month,today,specialDays=[],busy=[],existing=[],people=[]}){
  const linked=new Set(existing.flatMap(x=>x.strategy_ids||[])),requestMap=new Map(requests.map(x=>[x.id,x]));
  const eligible=strategies.filter(x=>x.review_status==='approved'&&!x.source_changed&&!linked.has(x.id));
  const bounds=s=>({from:max(month+'-01',today,s.proposed_date),to:min(monthEnd(month),s.deadline,...(s.request_ids||[]).map(id=>requestMap.get(id)?.planned_date))});
  const pending=eligible.sort((a,b)=>(bounds(a).to||'').localeCompare(bounds(b).to||'')||a.id.localeCompare(b.id));
  const actions=[],unplaced=[];const taken=[...busy,...existing.map(a=>({...a,date:a.scheduled_date,user_ids:memberIds(a)}))];
  while(pending.length){
    const seed=pending.shift();
    if(!seed.reference_user_id||(!['whatsapp','redes sociais'].includes(normalize(seed.channel))&&!seed.location)){
      unplaced.push({strategy:seed,reason:'Defina articulador de referência e local antes de distribuir.'});continue;
    }
    const candidates=pending.filter(x=>groupKey(x)===groupKey(seed)&&x.start_time===seed.start_time&&x.end_time===seed.end_time&&x.reference_user_id);
    const b=bounds(seed);let best=null;
    if(b.from&&b.to&&b.from<=b.to){for(let day=b.from;day<=b.to;day=shiftDate(day,1)){
      const starts=seed.start_time?[minutes(seed.start_time)]:[840,900,990,1080];
      for(const start of starts){
        const duration=seed.start_time&&seed.end_time?minutes(seed.end_time)-minutes(seed.start_time):60;
        const slot={scheduled_date:day,start_time:time(start),end_time:time(start+duration)};
        if(calendarProblem({...seed,...slot},specialDays,taken))continue;
        const items=[seed,...candidates.filter(s=>{const x=bounds(s);return x.from<=day&&day<=x.to&&!calendarProblem({...s,...slot},specialDays,taken)})];
        const pool=people.filter(p=>p.active!==false&&p.role==='articulador'&&!calendarProblem({...slot,reference_user_id:p.id,collaborator_ids:[]},specialDays,taken)).map(p=>p.id);
        const score=unique(items.flatMap(s=>s.request_ids||[])).length*10000+items.length*100+unique([...items.flatMap(memberIds),...pool]).length;
        if(!best||score>best.score)best={items,slot,score};
      }
    }}
    if(!best){unplaced.push({strategy:seed,reason:'Não há horário disponível antes do prazo com todos os colaboradores indicados. Revise data, equipe ou canal.'});continue;}
    for(const item of best.items.slice(1)){const i=pending.findIndex(x=>x.id===item.id);if(i>=0)pending.splice(i,1);}
    const action=combine(best.items,best.slot);
    // Add available articulators to the shared effort without pulling educators
    // or instructors away from their specifically agreed accompaniment.
    const available=people.filter(p=>p.active!==false&&p.role==='articulador'&&!calendarProblem({...action,reference_user_id:p.id,collaborator_ids:[]},specialDays,taken)).map(p=>p.id);
    action.collaborator_ids=unique([...action.collaborator_ids,...available]).filter(id=>id!==action.reference_user_id);
    const team='Distribuir tarefas entre '+(action.collaborator_ids.length+1)+' colaborador(es), sob a referência do articulador responsável.';
    const remote=['whatsapp','redes sociais'].includes(normalize(action.channel));
    action.preparation_steps=action.preparation_steps||'1. Confirmar as ações, datas e vagas a divulgar.\n2. Preparar a mensagem, os materiais e o formulário de interesse.\n3. '+team;
    action.execution_steps=action.execution_steps||'1. '+(remote?'Divulgar a programação pelo canal definido e responder às dúvidas.':'Visitar o local pactuado, apresentar a programação e conversar com os jovens.')+'\n2. Registrar o interesse de cada jovem e combinar o retorno.\n3. Consolidar os registros com a equipe.';
    action.resources=action.resources||(remote?'Celular ou computador com internet; contatos e material de divulgação (confirmar disponibilidade).':'Material de divulgação; celular com acesso ao formulário; transporte e autorização de visita, quando necessários (confirmar disponibilidade).');
    action.documents_before=action.documents_before||'Programação das ações; texto / card de divulgação; formulário de interesse; roteiro de abordagem.';
    action.documents_after=action.documents_after||'Relatório de mobilização; registros de interesse vinculados ao Formulário Inicial; encaminhamentos para busca ativa.';
    for(let n=0;n<14;n++){
      const dow=new Date(action.preparation_deadline+'T12:00:00Z').getUTCDay(),special=specialDays.find(s=>s.calendar_date===action.preparation_deadline);
      if(dow!==0&&dow!==6&&!(special&&(special.closure_policy==='auto_closed'||special.approval_status==='closed'||special.closure_policy==='approval_required'&&special.approval_status!=='open')))break;
      action.preparation_deadline=shiftDate(action.preparation_deadline,-1);
    }
    actions.push(action);taken.push({...action,date:action.scheduled_date,user_ids:memberIds(action)});
  }
  return {actions,unplaced,coverage:coverageFor(requests,[...existing,...actions])};
}
