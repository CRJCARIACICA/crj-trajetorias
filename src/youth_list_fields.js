import { listYouth } from './api.js?v=20261015-1';

const STORAGE_KEY='crj.youthList.visibleFields.v1';
const DEFAULT_FIELDS={full_name:true,phone:false,email:false};
const OPTIONS=[
  {key:'full_name',label:'Nome completo'},
  {key:'phone',label:'Contato'},
  {key:'email',label:'E-mail'}
];

let timer=null;
let loading=false;
let lastQueryKey='';
let rowsCache=[];

function isYouthList(){
  return location.hash.split('?')[0]==='#jovens';
}

function esc(value=''){
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

function readFields(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');
    return Object.fromEntries(OPTIONS.map(({key})=>[key,typeof saved[key]==='boolean'?saved[key]:DEFAULT_FIELDS[key]]));
  }catch{return {...DEFAULT_FIELDS}}
}

function writeFields(fields){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(fields))}catch{}
}

function ensureStyle(){
  if(document.querySelector('#youth-list-fields-style'))return;
  const style=document.createElement('style');
  style.id='youth-list-fields-style';
  style.textContent=`
    .yl-filter-card{margin:0 0 12px;padding:12px;border:1px solid var(--line,#dfe7e5);background:#fff;border-radius:12px}
    .yl-filter-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:9px}
    .yl-filter-head b{font-size:13px}.yl-filter-head span{font-size:11px;color:var(--muted,#687671)}
    .yl-filter-options{display:flex;gap:8px;flex-wrap:wrap}
    .yl-filter-option{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line,#dfe7e5);border-radius:999px;padding:7px 10px;background:#fbfdfc;cursor:pointer;font-size:12px}
    .yl-filter-option input{margin:0}.yl-personal-data{display:grid;gap:2px;margin-top:4px}
    .yl-personal-data [data-youth-field]{font-size:11px;color:var(--muted,#687671);overflow-wrap:anywhere}
    .yl-personal-data b{color:var(--ink,#24332f)}
    @media(max-width:680px){.yl-filter-option{width:100%}}
  `;
  document.head.appendChild(style);
}

function currentSearch(){
  return new URLSearchParams((location.hash.split('?')[1]||'')).get('q')||'';
}

function rowEntries(){
  return [...document.querySelectorAll('.content .table-wrap table.table tbody tr')].map(row=>{
    const button=row.querySelector('[data-nav^="jovem/"]');
    const id=button?.getAttribute('data-nav')?.match(/^jovem\/([^/?#]+)/)?.[1];
    return id?{id,row,cell:row.querySelector('td')}:null;
  }).filter(Boolean);
}

function ensurePanel(fields){
  const search=document.querySelector('#search-youth');
  if(!search)return;
  let panel=document.querySelector('#youth-list-field-filter');
  if(!panel){
    panel=document.createElement('div');
    panel.id='youth-list-field-filter';
    panel.className='yl-filter-card';
    panel.innerHTML=`<div class="yl-filter-head"><b>Dados pessoais na pré-visualização</b><span data-yl-count></span></div><div class="yl-filter-options">${OPTIONS.map(option=>`<label class="yl-filter-option"><input type="checkbox" data-youth-field-toggle="${esc(option.key)}"><span>${esc(option.label)}</span></label>`).join('')}</div>`;
    search.insertAdjacentElement('afterend',panel);
  }
  panel.querySelectorAll('[data-youth-field-toggle]').forEach(input=>{input.checked=Boolean(fields[input.dataset.youthFieldToggle])});
  const count=panel.querySelector('[data-yl-count]');
  if(count)count.textContent=`${OPTIONS.filter(({key})=>fields[key]).length} de ${OPTIONS.length} selecionado(s)`;
}

function ensureRowData(entry,data){
  if(!entry.cell)return;
  let box=entry.cell.querySelector('.yl-personal-data');
  if(!box){box=document.createElement('div');box.className='yl-personal-data';entry.cell.appendChild(box)}

  let full=box.querySelector('[data-youth-field="full_name"]');
  if(!full){
    const legacy=[...entry.cell.children].find(node=>node.classList?.contains('muted')&&!node.closest('.yl-personal-data'));
    if(legacy){legacy.dataset.youthField='full_name';box.appendChild(legacy);full=legacy}
    else{full=document.createElement('div');full.dataset.youthField='full_name';box.appendChild(full)}
  }
  if(data?.full_name)full.innerHTML=`<b>Nome completo:</b> ${esc(data.full_name)}`;

  let phone=box.querySelector('[data-youth-field="phone"]');
  if(!phone){phone=document.createElement('div');phone.dataset.youthField='phone';box.appendChild(phone)}
  phone.innerHTML=`<b>Contato:</b> ${esc(data?.phone||data?.reference_phone||'—')}`;

  let email=box.querySelector('[data-youth-field="email"]');
  if(!email){email=document.createElement('div');email.dataset.youthField='email';box.appendChild(email)}
  email.innerHTML=`<b>E-mail:</b> ${esc(data?.email||'—')}`;
}

function apply(fields,dataRows=[]){
  const byId=new Map(dataRows.map(item=>[item.id,item]));
  rowEntries().forEach(entry=>{
    ensureRowData(entry,byId.get(entry.id));
    OPTIONS.forEach(({key})=>{
      const node=entry.cell?.querySelector(`[data-youth-field="${key}"]`);
      if(node)node.hidden=!fields[key];
    });
  });
  ensurePanel(fields);
}

async function refresh(force=false){
  if(loading||!isYouthList())return;
  const search=document.querySelector('#search-youth');
  const table=document.querySelector('.content .table-wrap table.table');
  if(!search||!table)return;
  loading=true;
  try{
    ensureStyle();
    const fields=readFields();
    apply(fields,rowsCache);
    if(fields.phone||fields.email){
      const q=currentSearch();
      const ids=rowEntries().map(x=>x.id).join(',');
      const key=`${q}|${ids}`;
      if(force||key!==lastQueryKey){
        rowsCache=await listYouth(q);
        lastQueryKey=key;
      }
      if(isYouthList())apply(fields,rowsCache);
    }
  }catch(error){console.warn('CRJ Jovens: falha ao atualizar campos da pré-visualização.',error)}
  finally{loading=false}
}

function schedule(){clearTimeout(timer);timer=setTimeout(()=>refresh().catch(()=>{}),40)}

document.addEventListener('change',event=>{
  const input=event.target.closest?.('[data-youth-field-toggle]');
  if(!input||!isYouthList())return;
  const fields=readFields();
  fields[input.dataset.youthFieldToggle]=input.checked;
  writeFields(fields);
  if(input.checked&&(input.dataset.youthFieldToggle==='phone'||input.dataset.youthFieldToggle==='email'))refresh(true).catch(()=>{});
  else apply(fields,rowsCache);
});

const root=document.querySelector('.content')||document.querySelector('#app');
if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
window.addEventListener('hashchange',schedule);
window.addEventListener('focus',schedule);
schedule();

window.__crjYouthListFields={refresh,read:readFields};
