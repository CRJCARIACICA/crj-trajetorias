import { CONFIG } from './config.js';

const app=document.querySelector('#checkin-app');
const esc=(v='')=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

function showError(msg){app.innerHTML=`<div class="notice danger"><b>Não foi possível abrir a lista.</b><br>${esc(msg)}</div>`}

try{
  const token=new URLSearchParams(location.search).get('token');
  if(!token)throw new Error('Link sem identificação da lista.');
  const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm');
  const db=mod.createClient(CONFIG.supabaseUrl,CONFIG.supabasePublishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await db.rpc('workshop_checkin_roster',{p_token:token});
  if(error)throw error;
  const rows=data||[];
  if(!rows.length)throw new Error('A lista não está disponível neste momento ou não há jovens inscritos.');

  const meta=rows[0];
  app.innerHTML=`<div class="notice success"><b>${esc(meta.workshop_name)}</b><br>${new Date(meta.session_date+'T12:00:00').toLocaleDateString('pt-BR')} · ${String(meta.start_time||'').slice(0,5)}–${String(meta.end_time||'').slice(0,5)}</div>
    <div class="field" style="margin-top:14px"><label>Pesquisar meu nome</label><input class="input" data-checkin-search autocomplete="off" placeholder="Digite seu nome..."></div>
    <div class="checkin-results" data-checkin-results></div>
    <div class="hidden" data-checkin-confirm></div>`;

  const search=app.querySelector('[data-checkin-search]'),results=app.querySelector('[data-checkin-results]'),confirmBox=app.querySelector('[data-checkin-confirm]');
  const render=()=>{
    const q=norm(search.value).trim();
    const filtered=(q?rows.filter(r=>norm(r.display_name).includes(q)):rows).slice(0,20);
    results.innerHTML=filtered.map(r=>`<button class="checkin-person" data-enrollment="${r.enrollment_id}"><b>${esc(r.display_name)}</b><span>CPF final ${esc(r.cpf_last4||'----')}</span></button>`).join('')||'<div class="empty">Nenhum nome compatível.</div>';
    results.querySelectorAll('[data-enrollment]').forEach(b=>b.addEventListener('click',()=>{
      const r=rows.find(x=>x.enrollment_id===b.dataset.enrollment);
      confirmBox.classList.remove('hidden');
      confirmBox.innerHTML=`<form id="checkin-confirm-form" class="stack"><div class="notice"><b>${esc(r.display_name)}</b><br>CPF final ${esc(r.cpf_last4||'----')}</div><div class="field"><label>Senha da oficina</label><input class="input" name="secret" type="password" minlength="4" autocomplete="current-password" required></div><input type="hidden" name="enrollment_id" value="${r.enrollment_id}"><button class="btn primary">Confirmar presença</button></form>`;
      confirmBox.querySelector('form').addEventListener('submit',async e=>{
        e.preventDefault();const fd=new FormData(e.target),btn=e.target.querySelector('button');btn.disabled=true;btn.textContent='Confirmando...';
        const {data:ok,error:markError}=await db.rpc('workshop_checkin_mark',{p_token:token,p_enrollment_id:fd.get('enrollment_id'),p_secret:fd.get('secret')});
        if(markError){btn.disabled=false;btn.textContent='Confirmar presença';const old=confirmBox.querySelector('.notice.danger');old?.remove();e.target.insertAdjacentHTML('afterbegin',`<div class="notice danger">${esc(markError.message)}</div>`);return}
        app.innerHTML='<div class="notice success"><b>Presença confirmada.</b><br>Seu registro foi incluído na lista desta aula.</div>';
      });
      confirmBox.scrollIntoView({behavior:'smooth',block:'nearest'});
    }));
  };
  search.addEventListener('input',render);render();
}catch(err){showError(err.message||String(err))}
