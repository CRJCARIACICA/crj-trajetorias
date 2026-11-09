import { FORM_MAP, RATING_OPTIONS } from './forms.js';

export const EVALUATION_SLUGS=Object.freeze({workshop:'avaliacao-atividades',youth:'cfdh-avaliacao-jovens',team:'cfdh-avaliacao-equipe'});
export const escapeEvaluation=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const score=Object.fromEntries(RATING_OPTIONS.map((label,index)=>[label,index+1]));
export const evaluationFields=slug=>(FORM_MAP[slug]?.sections||[]).flatMap(section=>section.fields||[]);
export const evaluationTitle=slug=>{
  const form=FORM_MAP[slug];return form?`${form.annex} · ${form.title}`:'Avaliação';
};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

// Usa os próprios campos oficiais dos anexos. Não solicita identificação do jovem.
export function evaluationFormHtml(slug,{values={},workshopName='',staffName=''}={}){
  if(!FORM_MAP[slug])throw new Error('Anexo de avaliação não encontrado.');
  const fields=evaluationFields(slug);
  return `<form data-evaluation-form class="ev-form"><p class="ev-hint">Responda aos itens que se aplicam. Para enviar, avalie pelo menos um item.</p>${fields.map(field=>{
    if(slug===EVALUATION_SLUGS.workshop&&field.key==='other_activity')return '';
    const locked=slug===EVALUATION_SLUGS.workshop&&['activity_type','class_name'].includes(field.key);
    const value=locked?(field.key==='activity_type'?'Oficina':workshopName):(values[field.key]??(field.key==='date'?today():field.key==='reference'?staffName:''));
    const id=`ev-${field.key}`;
    if(locked)return `<div class="ev-field"><label for="${id}">${escapeEvaluation(field.label)}</label><input id="${id}" name="${field.key}" value="${escapeEvaluation(value)}" readonly></div>`;
    if(field.type==='rating'||field.type==='select'){
      const options=field.type==='rating'?RATING_OPTIONS:(field.options||[]);
      return `<div class="ev-field"><label for="${id}">${escapeEvaluation(field.label)}</label><select id="${id}" name="${field.key}"><option value="">Não avaliado / selecione</option>${options.map(option=>`<option value="${escapeEvaluation(option)}" ${value===option?'selected':''}>${escapeEvaluation(option)}</option>`).join('')}</select></div>`;
    }
    if(field.type==='textarea')return `<div class="ev-field"><label for="${id}">${escapeEvaluation(field.label)}</label><textarea id="${id}" name="${field.key}" maxlength="2500" rows="3">${escapeEvaluation(value)}</textarea></div>`;
    const type=field.type==='date'?'date':'text';
    return `<div class="ev-field"><label for="${id}">${escapeEvaluation(field.label)}</label><input id="${id}" name="${field.key}" type="${type}" maxlength="2500" value="${escapeEvaluation(value)}"></div>`;
  }).join('')}<div class="ev-error" role="alert" data-evaluation-error hidden></div><button class="btn primary ev-submit" type="submit">Enviar avaliação</button></form>`;
}

export function evaluationValues(form,slug){
  const result={};
  for(const field of evaluationFields(slug)){
    const input=form.elements.namedItem(field.key);
    if(input)result[field.key]=String(input.value||'').trim();
  }
  return result;
}

// Os percentuais de cada pergunta usam somente as respostas válidas daquela pergunta.
export function evaluationInsights(slug,rows){
  const fields=evaluationFields(slug),records=Array.isArray(rows)?rows:[];
  const questions=fields.filter(f=>f.type==='rating').map(field=>{
    const counts=Object.fromEntries(RATING_OPTIONS.map(option=>[option,0]));
    for(const row of records){const value=row.payload?.[field.key];if(Object.hasOwn(counts,value))counts[value]++;}
    const total=Object.values(counts).reduce((a,b)=>a+b,0);
    const positive=counts['Bom/Boa']+counts['Ótimo(a)'];
    const average=total?RATING_OPTIONS.reduce((n,label)=>n+counts[label]*score[label],0)/total:null;
    return {key:field.key,label:field.label,counts,total,positive,positivePercent:total?Math.round(positive*100/total):null,average};
  });
  const comments=fields.filter(f=>f.type==='textarea').map(field=>({key:field.key,label:field.label,answers:records.map(row=>String(row.payload?.[field.key]||'').trim()).filter(Boolean)})).filter(x=>x.answers.length);
  const ranked=questions.filter(x=>x.total).sort((a,b)=>b.positivePercent-a.positivePercent||b.average-a.average);
  return {total:records.length,questions,comments,highest:ranked[0]||null,lowest:ranked.length>1?ranked[ranked.length-1]:null};
}

export function evaluationInsightsHtml(slug,rows){
  const data=evaluationInsights(slug,rows),pct=x=>`${x.positivePercent}% (${x.positive}/${x.total})`;
  if(!data.total)return '<div class="ev-empty">Ainda não há respostas para esta avaliação.</div>';
  return `<div class="ev-insights"><div class="ev-metrics"><div><b>${data.total}</b><span>resposta(s) recebida(s)</span></div>${data.highest?`<div><b>${pct(data.highest)}</b><span>Maior proporção positiva: ${escapeEvaluation(data.highest.label)}</span></div>`:''}${data.lowest?`<div><b>${pct(data.lowest)}</b><span>Ponto de atenção: ${escapeEvaluation(data.lowest.label)}</span></div>`:''}</div><p class="ev-hint">Positivas = Bom/Boa ou Ótimo(a). O percentual de cada pergunta considera somente as respostas válidas daquele item. O total representa respostas, não necessariamente pessoas únicas.</p><div class="ev-question-list">${data.questions.map(q=>`<div class="ev-question"><b>${escapeEvaluation(q.label)}</b><span>${q.total?`${q.positivePercent}% positivas · ${q.total} resposta(s) · média ${q.average.toLocaleString('pt-BR',{maximumFractionDigits:1})}/5`:'Sem respostas para este item'}</span><small>${q.total?RATING_OPTIONS.map(label=>`${escapeEvaluation(label)}: ${q.counts[label]}`).join(' · '):''}</small></div>`).join('')}</div>${data.comments.length?`<h4>Comentários por pergunta</h4>${data.comments.map(c=>`<section class="ev-comments"><b>${escapeEvaluation(c.label)}</b>${c.answers.map(value=>`<p>${escapeEvaluation(value)}</p>`).join('')}</section>`).join('')}`:''}</div>`;
}
