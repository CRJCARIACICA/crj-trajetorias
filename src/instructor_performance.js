import { apiMode, supabaseClient } from './api.js?v=20261115-oficineiro-desempenho';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const int=n=>Number(n||0).toLocaleString('pt-BR');
const value=n=>Number(n||0);
const pct=n=>n==null?'—':Number(n).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
const currentMonth=()=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).formatToParts(new Date());return p.find(x=>x.type==='year').value+'-'+p.find(x=>x.type==='month').value};
const monthLabel=m=>new Intl.DateTimeFormat('pt-BR',{timeZone:'UTC',month:'short',year:'2-digit'}).format(new Date(m+'-01T12:00:00Z')).replace('.','');
const dateLabel=d=>d?String(d).slice(0,10).split('-').reverse().join('/'):'Nenhuma presença no período';
const contactNumber=phone=>{const d=String(phone||'').replace(/\D/g,'');return d.startsWith('55')&&[12,13].includes(d.length)?d:([10,11].includes(d.length)?'55'+d:null)};

function injectPerformanceStyles(){
 if(document.getElementById('ips-style'))return;
 const style=document.createElement('style');style.id='ips-style';
 style.textContent=[
 '.ips{--ips-primary:#0a7158;--ips-ink:#163b31;color:var(--ips-ink)}',
 '.ips-heading{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-bottom:17px}',
 '.ips-heading h2{margin:0 0 6px}.ips-heading p{color:#5d776d;max-width:690px;margin:0;line-height:1.5}',
 '.ips-filters{display:grid;grid-template-columns:minmax(150px,1.2fr) minmax(160px,.6fr) auto;align-items:end;gap:10px;margin:0 0 18px}',
 '.ips-filters label,.ips-row-controls label{display:grid;gap:6px;color:#587065;font-size:12px;font-weight:700}',
 '.ips-filters .input{min-height:43px}',
 '.ips-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:16px}',
 '.ips-kpi{min-width:0;border:1px solid #dce8e2;border-radius:14px;background:#fff;padding:14px}',
 '.ips-kpi>span{display:block;font-size:12px;color:#60766b;font-weight:650}',
 '.ips-kpi strong{display:block;font-size:27px;color:#0b604a;margin:6px 0;letter-spacing:-.03em}',
 '.ips-kpi small{display:block;font-size:12px;line-height:1.45;color:#647d72}',
 '.ips-rise{color:#17744b!important}.ips-fall{color:#a23e36!important}.ips-flat{color:#72867c!important}',
 '.ips-charts{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:16px}',
 '.ips-panel{border:1px solid #dce8e2;background:#fff;border-radius:16px;padding:17px;min-width:0}',
 '.ips-panel h3{margin:0 0 7px}.ips-panel>p{margin:0 0 12px;color:#6b7e74;font-size:12px;line-height:1.5}',
 '.ips-svg{width:100%;height:auto;display:block;overflow:visible}',
 '.ips-legend{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px;font-size:12px;color:#64766f}',
 '.ips-legend i{display:inline-block;width:9px;height:9px;background:var(--c);border-radius:3px;margin-right:4px}',
 '.ips-insights{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}',
 '.ips-insights span{padding:8px 10px;border-radius:9px;border:1px solid #dce8e2;background:#f6faf8;font-size:12px}',
 '.ips-row-controls{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:10px;margin-bottom:13px}',
 '.ips-row-controls .input{min-height:39px}',
 '.ips-table-scroll{overflow-x:auto;width:100%}.ips-table{border-collapse:collapse;width:100%;min-width:730px;font-size:13px}',
 '.ips-table th,.ips-table td{padding:11px 8px;border-bottom:1px solid #e9efec;text-align:left;vertical-align:middle}',
 '.ips-table th{font-size:11px;text-transform:uppercase;color:#637c70;background:#f7faf9;letter-spacing:.03em}',
 '.ips-table td small{display:block;color:#778a80;font-size:11px;margin-top:3px}',
 '.ips-status{display:inline-block;border-radius:20px;padding:5px 8px;font-weight:700;font-size:11px}',
 '.ips-status.good{background:#e2f5ec;color:#166e48}.ips-status.warn{background:#fff3d8;color:#91600e}',
 '.ips-status.bad{background:#ffe8e7;color:#a53d35}.ips-status.neutral{background:#eef4f0;color:#687b70}',
 '.ips-contact{display:flex;flex-wrap:wrap;align-items:center;gap:6px}',
 '.ips-contact a{font-size:11px;text-decoration:none;border:1px solid #d6e8dd;padding:6px 8px;border-radius:8px;color:#126749;font-weight:700}',
 '.ips-note{font-size:12px;line-height:1.55;color:#697d71;margin:13px 0 0}',
 '.ips-empty{text-align:center;padding:24px;color:#77867c}',
 '@media(max-width:1150px){.ips-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}',
 '@media(max-width:850px){.ips-charts{grid-template-columns:1fr}.ips-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}',
 '@media(max-width:600px){.ips-heading{display:block}.ips-filters{grid-template-columns:1fr}.ips-kpi strong{font-size:23px}}'
 ].join('');
 document.head.appendChild(style);
}
function variation(current,previous,points=false){
 if(previous===undefined||previous===null||(points&&current===null))return '<span class="ips-flat">Sem comparação</span>';
 const diff=value(current)-value(previous),symbol=diff>0?'+':diff<0?'−':'';
 if(points){return '<span class="'+(diff>0?'ips-rise':diff<0?'ips-fall':'ips-flat')+'">'+symbol+Math.abs(diff).toFixed(1).replace('.',',')+' p.p. em relação ao mês anterior</span>'}
 if(!value(previous))return '<span class="ips-flat">Mês anterior sem base</span>';
 return '<span class="'+(diff>0?'ips-rise':diff<0?'ips-fall':'ips-flat')+'">'+symbol+Math.abs(100*diff/value(previous)).toFixed(1).replace('.',',')+'% em relação ao mês anterior</span>';
}
function kpi(title,number,detail){
 return '<div class="ips-kpi"><span>'+esc(title)+'</span><strong>'+esc(number)+'</strong><small>'+detail+'</small></div>';
}
function axes(max,percentage=false){
 let result='';
 for(let i=0;i<5;i++){const y=211-i*42,v=Math.round(max*i/4);
  result+='<line x1="43" y1="'+y+'" x2="735" y2="'+y+'" stroke="#e8efeb"/><text x="36" y="'+(y+4)+'" text-anchor="end" font-size="12" fill="#6e8077">'+int(v)+(percentage?'%':'')+'</text>';
 }return result;
}
function participationChart(rows){
 const mx=Math.max(4,Math.ceil(Math.max(0,...rows.map(x=>value(x.participations)),...rows.map(x=>value(x.unique_registered)))/4)*4);
 let html='<svg class="ips-svg" viewBox="0 0 760 255" role="img" aria-label="Gráfico de barras, participações e jovens distintos por mês">'+axes(mx);
 rows.forEach((r,i)=>{const cx=94+i*111,a=168*value(r.participations)/mx,b=168*value(r.unique_registered)/mx;
  html+='<rect x="'+(cx-19)+'" y="'+(211-a)+'" width="22" height="'+a+'" rx="4" fill="#0a7458"><title>'+esc(monthLabel(r.month))+' '+int(r.participations)+' participações</title></rect>';
  html+='<rect x="'+(cx+8)+'" y="'+(211-b)+'" width="22" height="'+b+'" rx="4" fill="#8ccdb8"><title>'+esc(monthLabel(r.month))+' '+int(r.unique_registered)+' jovens cadastrados presentes</title></rect>';
  html+='<text x="'+(cx+6)+'" y="237" text-anchor="middle" fill="#61756b" font-size="12">'+esc(monthLabel(r.month))+'</text>';
 });
 return html+'</svg><div class="ips-legend"><span><i style="--c:#0a7458"></i>Participações</span><span><i style="--c:#8ccdb8"></i>Jovens distintos</span></div>';
}
function attendanceChart(rows){
 const valid=rows.map((r,i)=>({r,i})).filter(x=>x.r.attendance_rate!==null);
 const xy=valid.map(x=>({x:94+x.i*111,y:211-168*value(x.r.attendance_rate)/100,r:x.r}));
 let html='<svg class="ips-svg" viewBox="0 0 760 255" role="img" aria-label="Gráfico de linha, frequência percentual mensal">'+axes(100,true);
 if(xy.length>1)html+='<polyline points="'+xy.map(p=>p.x+','+p.y).join(' ')+'" fill="none" stroke="#0a7458" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>';
 xy.forEach(p=>{html+='<circle cx="'+p.x+'" cy="'+p.y+'" r="5.5" fill="#0a7458" stroke="#fff" stroke-width="2"><title>'+esc(monthLabel(p.r.month))+' '+pct(p.r.attendance_rate)+'</title></circle>'});
 rows.forEach((r,i)=>{html+='<text x="'+(94+i*111)+'" y="237" text-anchor="middle" fill="#61756b" font-size="12">'+esc(monthLabel(r.month))+'</text>'});
 return html+'</svg><div class="ips-legend"><span><i style="--c:#0a7458"></i>Frequência dos matriculados</span></div>';
}
function statusOf(y){
 if(value(y.possible)===0)return {cl:'neutral',label:'Sem aulas comparáveis'};
 if(value(y.missed_last_3)>=2)return {cl:'bad',label:'Priorizar contato'};
 if(value(y.missed_last_3)>=1)return {cl:'warn',label:'Acompanhar'};
 return {cl:'good',label:'Frequente'};
}
function studentList(state){
 const names=new Map((state.workshops||[]).map(x=>[x.id,x.name]));
 let rows=(state.students||[]).filter(x=>!state.query||String(x.name||'').toLocaleLowerCase('pt-BR').includes(state.query.toLocaleLowerCase('pt-BR')));
 if(state.sort==='ausencias')rows.sort((a,b)=>value(b.missed_last_3)-value(a.missed_last_3)||value(b.missing)-value(a.missing)||String(a.name).localeCompare(String(b.name),'pt-BR'));
 else if(state.sort==='frequencia')rows.sort((a,b)=>value(b.attended)-value(a.attended)||value(b.attendance_rate)-value(a.attendance_rate));
 else if(state.sort==='taxa')rows.sort((a,b)=>value(b.attendance_rate)-value(a.attendance_rate));
 else rows.sort((a,b)=>String(a.name).localeCompare(String(b.name),'pt-BR'));
 return rows.map(y=>{
  const status=statusOf(y),digits=contactNumber(y.phone);
  const phone=y.phone?'<div class="ips-contact"><span>'+esc(y.phone)+'</span><a href="tel:'+esc(String(y.phone).replace(/[^+0-9]/g,''))+'">Ligar</a>'+(digits?'<a href="https://wa.me/'+digits+'" target="_blank" rel="noopener noreferrer">WhatsApp</a>':'')+'</div>':'<span class="ips-flat">Não informado</span>';
  return '<tr><td><b>'+esc(y.name)+'</b><small>'+esc(names.get(y.workshop_id)||'Oficina')+'</small></td>'+
   '<td>'+int(y.attended)+' / '+int(y.possible)+'</td><td>'+pct(y.attendance_rate)+'</td>'+
   '<td>'+int(y.missing)+'<small>'+int(y.missed_last_3)+' nas últimas 3 aulas</small></td>'+
   '<td><span class="ips-status '+status.cl+'">'+status.label+'</span><small>'+esc(dateLabel(y.last_seen))+'</small></td>'+
   '<td>'+phone+'</td></tr>';
 }).join('')||'<tr><td colspan="6" class="ips-empty">Nenhum jovem corresponde à busca.</td></tr>';
}
function renderReport(root,data,state){
 const all=data.months||[],cur=all[all.length-1]||{},prev=all[all.length-2]||{};
 const attention=(data.students||[]).filter(x=>value(x.missed_last_3)>=2).length;
 const options=(data.workshops||[]).map(x=>'<option value="'+esc(x.id)+'" '+(x.id===state.workshop?'selected':'')+'>'+esc(x.name)+'</option>').join('');
 state.students=data.students||[];state.workshops=data.workshops||[];
 root.innerHTML=
  '<div class="ips-heading"><div><h2>Desempenho das minhas oficinas</h2><p>Indicadores de participação, comparativos mensais, frequência dos jovens e contatos para acompanhamento educativo.</p></div><a class="btn secondary" href="#oficineiro">Voltar ao painel</a></div>'+
  '<div class="ips-filters"><label>Oficina<select class="input" data-ips-workshop><option value="">Todas as minhas oficinas</option>'+options+'</select></label>'+
  '<label>Mês de referência<input type="month" class="input" data-ips-month max="'+esc(currentMonth())+'" value="'+esc(state.month)+'"></label>'+
  '<button class="btn secondary" type="button" data-ips-refresh>Atualizar dados</button></div>'+
  ((data.workshops||[]).length===0?'<div class="notice info">Nenhuma oficina está vinculada a seu usuário. Solicite a vinculação de sua oficina à equipe.</div>':'')+
  '<div class="ips-kpis">'+
   kpi('Participações do mês',int(cur.participations),variation(cur.participations,prev.participations))+
   kpi('Jovens cadastrados presentes',int(cur.unique_registered),variation(cur.unique_registered,prev.unique_registered))+
   kpi('Aulas executadas registradas',int(cur.sessions),variation(cur.sessions,prev.sessions))+
   kpi('Frequência dos matriculados',pct(cur.attendance_rate),cur.attendance_rate==null||prev.attendance_rate==null?'<span class="ips-flat">Sem base comparável</span>':variation(cur.attendance_rate,prev.attendance_rate,true))+
   kpi('Vínculos de inscrição no mês',int(data.enrolled_youth),'<span class="ips-flat">Por oficina, sem duplicar na mesma turma</span>')+
  '</div>'+
  '<div class="ips-charts"><section class="ips-panel"><h3>Evolução das participações</h3><p>Presenças de cadastrados e visitantes nas aulas executadas.</p>'+participationChart(all)+'</section>'+
  '<section class="ips-panel"><h3>Evolução da frequência</h3><p>Compare o percentual de frequência dos inscritos nos últimos seis meses.</p>'+attendanceChart(all)+'</section></div>'+
  '<section class="ips-panel"><h3>Acompanhamento individual</h3><p>Quem mais participa, quem está ausente e como contatar os jovens inscritos em suas oficinas.</p>'+
  '<div class="ips-insights"><span><b>'+int(cur.registered_participations)+'</b> presenças de cadastrados</span><span><b>'+int(cur.guest_participations)+'</b> participações de visitantes</span><span><b>'+int(attention)+'</b> jovens para verificar</span></div>'+
  '<div class="ips-row-controls"><label>Buscar jovem<input class="input" data-ips-search type="search" placeholder="Digite um nome" value="'+esc(state.query)+'"></label>'+
  '<label>Ordenar<select class="input" data-ips-sort>'+[['ausencias','Mais ausências recentes'],['frequencia','Mais participações'],['taxa','Maior percentual'],['nome','Nome A–Z']].map(x=>'<option value="'+x[0]+'" '+(x[0]===state.sort?'selected':'')+'>'+x[1]+'</option>').join('')+'</select></label></div>'+
  '<div class="ips-table-scroll"><table class="ips-table"><thead><tr><th>Jovem / Oficina</th><th>Presenças / Aulas</th><th>Frequência</th><th>Sem presença</th><th>Acompanhamento</th><th>Telefone</th></tr></thead><tbody data-ips-students>'+studentList(state)+'</tbody></table></div>'+
  '<p class="ips-note"><b>Leitura dos indicadores:</b> somente aulas com execução registrada entram na base de frequência. Aulas canceladas, futuras ou anteriores à inscrição não contam como faltas. “Sem presença” pode indicar lista incompleta; confira o registro antes de abordar o jovem. Os telefones estão disponíveis somente para o acompanhamento institucional autorizado dos jovens vinculados à sua turma, sem exportação em massa.</p></section>';
}
export async function mountInstructorPerformance(root,profile){
 if(!root||profile?.role!=='oficineiro'||profile?.active===false)return;
 injectPerformanceStyles();root.classList.add('ips');
 const state={month:currentMonth(),workshop:'',sort:'ausencias',query:'',students:[],workshops:[]};
 let request=0;
 async function reload(){
  const id=++request;
  root.innerHTML='<div class="card"><div class="ips-empty">Calculando indicadores das suas oficinas…</div></div>';
  try{
   if(apiMode()!=='live')throw Error('O banco de dados ainda não está conectado.');
   const {data,error}=await supabaseClient().rpc('instructor_performance_summary',{p_month:state.month+'-01',p_workshop_id:state.workshop||null});
   if(error)throw error;
   if(id!==request||!root.isConnected)return;
   if(!data||!Array.isArray(data.months))throw Error('O banco não retornou indicadores válidos.');
   renderReport(root,data,state);bind();
  }catch(err){
   if(id!==request||!root.isConnected)return;
   root.innerHTML='<div class="notice danger"><b>Não foi possível carregar os indicadores.</b><p>'+esc(err.message||String(err))+'</p><button class="btn secondary" data-ips-retry type="button">Tentar novamente</button></div>';
   root.querySelector('[data-ips-retry]')?.addEventListener('click',reload);
  }
 }
 function refreshRows(){const rows=root.querySelector('[data-ips-students]');if(rows)rows.innerHTML=studentList(state)}
 function bind(){
  root.querySelector('[data-ips-workshop]')?.addEventListener('change',e=>{state.workshop=e.target.value;state.query='';reload()});
  root.querySelector('[data-ips-month]')?.addEventListener('change',e=>{if(e.target.value){state.month=e.target.value;state.query='';reload()}});
  root.querySelector('[data-ips-refresh]')?.addEventListener('click',reload);
  root.querySelector('[data-ips-search]')?.addEventListener('input',e=>{state.query=e.target.value;refreshRows()});
  root.querySelector('[data-ips-sort]')?.addEventListener('change',e=>{state.sort=e.target.value;refreshRows()});
 }
 await reload();
}
