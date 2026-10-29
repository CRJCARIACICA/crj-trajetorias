const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const assert=require('node:assert/strict');
const test=require('node:test');
const source=fs.readFileSync(path.join(__dirname,'../src/technical_service_evidence.js'),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace(/\bexport /g,'');
const context=vm.createContext({Intl,Date,Map,Set,console});
vm.runInContext(source,context);
const rows=[
  {youth_id:'1',program_type:'pvida',gender_identity:'Mulher cisgênero',sexual_orientation:'Lésbica',race:'Parda(o)'},
  {youth_id:'2',program_type:'pvida',gender_identity:'Homem cisgênero',sexual_orientation:'Heterossexual',race:'Preta(o)'},
  {youth_id:'3',program_type:'outras-demandas',gender_identity:'Mulher cisgênero',sexual_orientation:'Lésbica',race:'Preta(o)'}
];
test('filtros sociodemográficos e de tipo podem ser combinados sem alterar os dados',()=>{
  const found=context.filterEvidenceRows(rows,{type:'outras-demandas',gender:'Mulher cisgênero',orientation:'Lésbica',race:'Preta(o)'});
  assert.equal(found.length,1);assert.equal(found[0].youth_id,'3');assert.equal(rows.length,3);
  assert.equal(context.filterEvidenceRows(rows,{}).length,3);
});
test('mês e período são limitados sem excluir o último dia',()=>{
  assert.deepEqual(JSON.parse(JSON.stringify(context.bounds('month','2026-02','',''))),{start:'2026-02-01',end:'2026-02-28'});
  assert.deepEqual(JSON.parse(JSON.stringify(context.bounds('range','','2026-10-01','2026-10-31'))),{start:'2026-10-01',end:'2026-10-31'});
  assert.deepEqual(JSON.parse(JSON.stringify(context.bounds('all','','',''))),{start:null,end:null});
});
test('meta de 45 soma PVida e Outras Demandas, mas não PTrampo nem cancelados',()=>{
  const src=fs.readFileSync(path.join(__dirname,'../src/technical_program_actions.js'),'utf8');
  const begin=src.indexOf('function metrics(data){'),end=src.indexOf('\nfunction teamMap',begin);
  const getMetrics=vm.runInNewContext(src.slice(begin,end)+'\nmetrics;');
  const services=[
    {id:'a',program_type:'pvida',status:'realizado'},
    {id:'b',program_type:'outras-demandas',status:'realizado'},
    {id:'c',program_type:'ptrampo',status:'realizado'},
    {id:'d',program_type:'pvida',status:'cancelado'}
  ];
  const links=[{service_id:'a',youth_id:'1'},{service_id:'b',youth_id:'1'},{service_id:'b',youth_id:'2'},{service_id:'c',youth_id:'3'},{service_id:'d',youth_id:'4'}];
  const result=getMetrics({services,serviceYouth:links,executions:[],plans:[],fortaleceEvents:[{youth_id:'1'},{youth_id:'5'}]});
  assert.equal(result.unique45,3);assert.equal(result.ptrampo,1);
});
