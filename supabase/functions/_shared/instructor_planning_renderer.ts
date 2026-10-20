import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle, VerticalAlign, ImageRun, PageOrientation
} from "npm:docx@9.5.1";

const s = (v) => v == null ? "" : String(v).trim();
const brDate = (v) => {
  const x = s(v);
  const m = x.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : x;
};
const time5 = (v) => s(v).slice(0, 5);
const safeName = (v) => s(v || "documento")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "documento";
const pdfSafe = (v) => s(v)
  .replace(/[–—]/g, "-")
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, "?");
const array = (v) => Array.isArray(v) ? v : [];

function decodeImage(value, mime) {
  let raw = s(value);
  if (!raw) return null;
  let type = s(mime).toLowerCase();
  const dataUrl = raw.match(/^data:image\/(png|jpe?g);base64,(.*)$/is);
  if (dataUrl) {
    type = dataUrl[1].toLowerCase();
    raw = dataUrl[2];
  }
  raw = raw
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/[^A-Za-z0-9+/=]/g, "")
    .replace(/=+$/g, "");
  const mod = raw.length % 4;
  if (mod === 1) return null;
  if (mod) raw += "=".repeat(4 - mod);
  try {
    const bin = atob(raw);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const jpg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    if (!jpg && !png) return null;
    return { bytes, type: jpg ? "jpg" : "png" };
  } catch {
    return null;
  }
}

async function loadHeader(settingsClient) {
  const q = await settingsClient.from("crj_document_settings")
    .select("header_image_data,header_mime")
    .eq("id", 1)
    .maybeSingle();
  if (q.error) throw q.error;
  const image = decodeImage(q.data?.header_image_data, q.data?.header_mime);
  if (!image) throw new Error("Cabeçalho institucional inválido ou não configurado.");
  return image;
}

function wrapText(text,max){
  const out=[];
  for(const raw of pdfSafe(text).split("\n")){
    if(!raw){out.push("");continue}
    let line="";
    for(const word of raw.split(/\s+/)){
      const chunks=word.length>max?word.match(new RegExp(".{1,"+max+"}","g")):[word];
      for(const chunk of chunks){
        const next=line?line+" "+chunk:chunk;
        if(next.length>max&&line){out.push(line);line=chunk}else line=next;
      }
    }
    if(line)out.push(line);
  }
  return out;
}

async function makePdf(spec, header) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const headerImg = header.type === "png" ? await pdf.embedPng(header.bytes) : await pdf.embedJpg(header.bytes);
  const pageSize = [841.89, 595.28];
  const margin = 38;
  const tableWidth = pageSize[0] - margin * 2;
  let page;
  let y = 0;

  const addPage = (continuation = false) => {
    page = pdf.addPage(pageSize);
    const H = page.getHeight();
    const dims = headerImg.scale(1);
    const maxW = 330, maxH = 58, scale = Math.min(maxW / dims.width, maxH / dims.height, 1);
    page.drawImage(headerImg, { x: (pageSize[0] - dims.width * scale) / 2, y: H - 74, width: dims.width * scale, height: dims.height * scale });
    const title = continuation ? `${spec.title} - CONTINUAÇÃO` : spec.title;
    page.drawText(pdfSafe(title), { x: margin, y: H - 98, size: 10, font: bold, maxWidth: tableWidth });
    if (spec.subtitle && !continuation) page.drawText(pdfSafe(spec.subtitle), { x: margin, y: H - 112, size: 7, font, maxWidth: tableWidth, color: rgb(.25, .25, .25) });
    y = H - (spec.subtitle && !continuation ? 126 : 112);
  };
  const ensure = (height) => { if (y - height < 34) addPage(true); };
  const drawRow=(label,value)=>{
    const lines=wrapText(value,115);let offset=0;
    do{
      if(y-34<34)addPage(true);
      const capacity=Math.max(1,Math.floor((y-34-18)/8));
      const chunk=lines.slice(offset,offset+capacity),h=Math.max(26,18+chunk.length*8);
      ensure(h);
      page.drawRectangle({x:margin,y:y-h,width:tableWidth,height:h,borderWidth:.45,borderColor:rgb(0,0,0)});
      page.drawText(pdfSafe(label)+(offset?" (continuação)":""),{x:margin+5,y:y-11,size:6.5,font:bold,maxWidth:tableWidth-10});
      chunk.forEach((line,i)=>page.drawText(line,{x:margin+5,y:y-21-i*8,size:6.2,font,maxWidth:tableWidth-10}));
      y-=h;offset+=chunk.length;
    }while(offset<lines.length);
  };
  const drawTable=table=>{
    const cols=Math.max(1,table.heads.length),cw=tableWidth/cols,lineHeight=8;
    const drawHead=()=>{
      ensure(30);
      table.heads.forEach((head,i)=>{
        const x=margin+i*cw;
        page.drawRectangle({x,y:y-30,width:cw,height:30,borderWidth:.45,borderColor:rgb(0,0,0)});
        wrapText(head,Math.max(6,Math.floor(cw/4.7))).forEach((line,j)=>page.drawText(line,{x:x+3,y:y-10-j*7,size:5.5,font:bold,maxWidth:cw-6}));
      });
      y-=30;
    };
    drawHead();
    for(const row of table.rows){
      const cells=table.heads.map((_,i)=>wrapText(row[i]??"",Math.max(5,Math.floor(cw/4.6))));
      const lineCount=Math.max(1,...cells.map(x=>x.length));let offset=0;
      while(offset<lineCount){
        if(y-34<34){addPage(true);drawHead()}
        const capacity=Math.max(1,Math.floor((y-34-10)/lineHeight));
        const count=Math.min(lineCount-offset,capacity),h=Math.max(30,10+count*lineHeight);
        if(y-h<34){addPage(true);drawHead();continue}
        for(let i=0;i<cols;i++){
          const x=margin+i*cw;
          page.drawRectangle({x,y:y-h,width:cw,height:h,borderWidth:.4,borderColor:rgb(0,0,0)});
          const chunk=cells[i].slice(offset,offset+count);
          chunk.forEach((line,j)=>page.drawText(line,{x:x+3,y:y-10-j*lineHeight,size:5.4,font,maxWidth:cw-6}));
        }
        y-=h;offset+=count;
      }
    }
  };

  addPage(false);
  for (const section of spec.sections) {
    if (section.title) {
      ensure(22);
      page.drawRectangle({ x: margin, y: y - 20, width: tableWidth, height: 20, borderWidth: .45, borderColor: rgb(0, 0, 0) });
      page.drawText(pdfSafe(section.title), { x: margin + 5, y: y - 13, size: 7, font: bold, maxWidth: tableWidth - 10 });
      y -= 20;
    }
    for (const row of section.rows || []) drawRow(row[0], row[1]);
    if (section.table) drawTable(section.table);
  }
  const last = pdf.getPages()[pdf.getPageCount() - 1];
  last.drawText("Documento gerado pelo CRJ Trajetórias · cabeçalho institucional canônico.", { x: margin, y: 14, size: 5, font, color: rgb(.35, .35, .35), maxWidth: tableWidth });
  return new Uint8Array(await pdf.save());
}

const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
const para = (text, boldText = false, size = 10, align = AlignmentType.LEFT) => new Paragraph({
  alignment: align, spacing: { after: 10 }, children: [new TextRun({ text: s(text), bold: boldText, size })]
});
function docCell(text, boldText = false) {
  return new TableCell({
    borders: { top: border, bottom: border, left: border, right: border },
    verticalAlign: VerticalAlign.TOP,
    children: String(text ?? "").split("\n").map(line => para(line, boldText, 9))
  });
}
async function makeDocx(spec, header) {
  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [new ImageRun({ data: header.bytes, type: header.type, transformation: { width: 320, height: 56 } })] }),
    para(spec.title, true, 18, AlignmentType.CENTER)
  ];
  if (spec.subtitle) children.push(para(spec.subtitle, false, 11, AlignmentType.CENTER));
  for (const section of spec.sections) {
    if (section.title) children.push(para(section.title, true, 13, AlignmentType.CENTER));
    for (const row of section.rows || []) {
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ children: [new TableCell({
          borders: { top: border, bottom: border, left: border, right: border },
          children: [new Paragraph({ children: [new TextRun({ text: s(row[0]) + ": ", bold: true, size: 10 }), new TextRun({ text: s(row[1]), size: 10 })] })]
        })] })]
      }));
    }
    if (section.table) {
      const rows = [new TableRow({ tableHeader: true, children: section.table.heads.map(h => docCell(h, true)) })];
      for (const row of section.table.rows) rows.push(new TableRow({ children: section.table.heads.map((_, i) => docCell(row[i] ?? "")) }));
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, alignment: AlignmentType.CENTER, rows }));
    }
  }
  children.push(new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: "Documento gerado pelo CRJ Trajetórias · cabeçalho institucional canônico.", size: 9, color: "666666" })] }));
  const doc = new Document({ sections: [{ properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 420, right: 420, bottom: 420, left: 420 } } }, children }] });
  return new Uint8Array(await Packer.toBuffer(doc));
}


export function planningEvidenceSpec(evidence){
  const snapshot=evidence.snapshot,sections=[];
  sections.push({rows:[
    ['Oficineiro(a)',snapshot.instructor_name||''],
    ['Competência',String(evidence.reference_month).slice(0,7)],
    ['Evidência',String(evidence.id)],
    ['Versão',String(evidence.version)],
    ['Gerada em',new Date(evidence.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})],
    ['Total de blocos',String(snapshot.total_lessons)]
  ]});
  for(const plan of array(snapshot.plans)){
    sections.push({title:plan.workshop_name,rows:[
      ['Oficina',plan.workshop_name],['Objetivo geral',plan.general_objective||''],
      ['Metodologia geral',plan.general_methodology||''],['Resultados esperados',plan.expected_results||''],
      ['Recursos gerais',plan.general_resources||''],['Observações',plan.observations||'']
    ]});
    sections.push({title:'Blocos do planejamento — '+plan.workshop_name,table:{
      heads:['Aula','Data','Horário','Local / Tema','Objetivo','Atividades propostas','Recursos necessários'],
      rows:array(plan.lessons).map(l=>[
        l.lesson_number,brDate(l.scheduled_date),time5(l.start_time)+'–'+time5(l.end_time),
        [l.location_other||l.location_type||'',l.theme||''].filter(Boolean).join('\n'),
        l.objective||'',l.proposed_activities||'',l.resources||''
      ])
    }});
  }
  return {title:'EVIDÊNCIA DE PREENCHIMENTO DO PLANEJAMENTO MENSAL',subtitle:snapshot.instructor_name+' · '+String(evidence.reference_month).slice(0,7),sections};
}
export { makePdf,makeDocx,loadHeader };
