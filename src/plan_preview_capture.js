// Export the same screen composition; never maintain a second planning layout.
let renderer;
async function loadRenderer(){
  if(window.html2canvas)return window.html2canvas;
  if(!renderer)renderer=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src=new URL('../assets/html2canvas.min.js',import.meta.url).href;
    script.onload=()=>resolve(window.html2canvas);
    script.onerror=()=>{script.remove();renderer=null;reject(new Error('Não foi possível carregar a exportação da prévia. Tente novamente.'))};
    document.head.appendChild(script);
  });
  return renderer;
}

export function pageCuts(height,pageHeight,rows){
  const cuts=[0];
  while(cuts.at(-1)<height){
    const start=cuts.at(-1);let end=Math.min(height,start+pageHeight);
    const crossing=rows.find(r=>r.top<end&&r.bottom>end&&r.top>start&&r.bottom-r.top<=pageHeight);
    if(crossing)end=Math.floor(crossing.top);
    if(end<=start)throw new Error('Não foi possível paginar o planejamento.');
    cuts.push(end);
  }
  return cuts;
}

export async function capturePlanPreview(body){
  const kind=body.plan_id?'workshop':body.cfdh_plan_id?'cfdh':null;
  if(!kind)return null;
  const id=body.plan_id||body.cfdh_plan_id;
  if(!window.__crjPlanningPreview)throw new Error('Atualize a página para carregar o gerador da prévia.');
  const render=await loadRenderer();
  const selector=kind==='workshop'?'#workshop-plan-form':'#cfdh-plan-editor';
  const form=document.querySelector(selector);
  const live=form?.dataset.planId===id?form.querySelector(kind==='workshop'?'[data-workshop-plan-preview] .methodology-paper':'[data-cfdh-plan-preview] .methodology-paper'):null;
  const html=live?.outerHTML||await window.__crjPlanningPreview(kind,id);
  const host=document.createElement('div');
  Object.assign(host.style,{position:'absolute',left:'-20000px',top:'0',width:'1120px',pointerEvents:'none'});
  host.innerHTML=html;document.body.appendChild(host);
  try{
    const paper=host.querySelector('.methodology-paper');
    if(!paper)throw new Error('Pré-visualização do planejamento não encontrada.');
    // Freeze actual screen styles, including at mobile widths, before the
    // renderer creates its wide virtual viewport. Ancestor UI is excluded.
    const original=live||paper;
    const from=[original,...original.querySelectorAll('*')],to=[paper,...paper.querySelectorAll('*')];
    from.forEach((node,i)=>{const css=getComputedStyle(node);for(const key of css)to[i].style.setProperty(key,css.getPropertyValue(key));});
    Object.assign(paper.style,{margin:'0',transform:'none',boxShadow:'none'});
    await document.fonts.ready;
    await Promise.all([...paper.querySelectorAll('img')].map(async img=>{
      if(!img.complete)await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Não foi possível carregar o cabeçalho da prévia.'))});
      if(!img.naturalWidth)throw new Error('Cabeçalho da prévia indisponível.');
      await img.decode();
    }));
    const rect=paper.getBoundingClientRect();
    if(rect.height>24000)throw new Error('Planejamento muito extenso. Divida o conteúdo antes de exportar.');
    const rows=[...paper.querySelectorAll('tr,.methodology-row')].map(n=>{const r=n.getBoundingClientRect();return {top:Math.floor((r.top-rect.top)*2),bottom:Math.ceil((r.bottom-rect.top)*2)}});
    const canvas=await render(paper,{scale:2,backgroundColor:'#fff',logging:false,useCORS:true,windowWidth:Math.max(1280,innerWidth),scrollX:0,scrollY:0});
    const pageHeight=Math.floor(canvas.width*210/297),pages=[];
    // A row taller than a sheet must continue. Place that break in the white
    // gap between text lines instead of cutting through a glyph.
    const cuts=[0],source=canvas.getContext('2d');
    while(cuts.at(-1)<canvas.height){
      const start=cuts.at(-1);let end=pageCuts(canvas.height-start,pageHeight,rows.map(r=>({top:r.top-start,bottom:r.bottom-start})))[1]+start;
      if(end<canvas.height&&rows.some(r=>r.top<end&&r.bottom>end)){
        const top=Math.max(start+1,end-40),pixels=source.getImageData(0,top,canvas.width,end-top).data;
        let best=Infinity;
        for(let y=end-top-1;y>=0;y--){let ink=0;for(let x=0;x<canvas.width;x++){const p=(y*canvas.width+x)*4;if(pixels[p]<220||pixels[p+1]<220||pixels[p+2]<220)ink++}if(ink<best){best=ink;end=top+y;}}
      }
      cuts.push(end);
    }
    for(let i=0;i<cuts.length-1;i++){
      const page=document.createElement('canvas');page.width=canvas.width;page.height=cuts[i+1]-cuts[i];
      const ctx=page.getContext('2d');ctx.drawImage(canvas,0,cuts[i],canvas.width,page.height,0,0,page.width,page.height);
      pages.push({png:page.toDataURL('image/png'),width:page.width,height:page.height});
      page.width=page.height=0;
    }
    canvas.width=canvas.height=0;
    return {contract:'screen-preview-pages-v1',pages};
  }finally{host.remove()}
}
