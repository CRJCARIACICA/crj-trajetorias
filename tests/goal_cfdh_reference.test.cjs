const fs=require('node:fs');
const test=require('node:test');
const assert=require('node:assert/strict');
const source=fs.readFileSync('src/goals_workspace.js','utf8');
function workspace(){
 const helpers=`const num=v=>Number(v||0);const state={cfdhReference:'monthly'};const nextMonth=m=>shiftMonth(m,1);const shiftMonth=(m,n)=>{const [y,k]=m.split('-').map(Number);return new Date(Date.UTC(y,k-1+n,1)).toISOString().slice(0,7)};const monthLabel=m=>m;const titleCase=s=>s;`;
 const period=source.slice(source.indexOf('function displayIndicator('),source.indexOf('function isYouth('));
 const amounts=source.slice(source.indexOf('function isYouth('),source.indexOf('function statusFor('));
 const data=source.match(/^function dataForIndicator.*$/m)[0];
 return new Function(helpers+period+amounts+data+';return {state,displayIndicator,periodFor,cfdhReferenceButton,dataForIndicator}')();
}
const indicator={code:'M6.1_CFDH_HORAS',target:120,unit:'horas/semestre',periodicity:'semestral'};
test('CFDH opens monthly with 20 hours and only the selected month contributes',()=>{
 const w=workspace(),ind=w.displayIndicator(indicator);
 assert.equal(ind.target,20);assert.equal(ind.periodicity,'mensal');
 const data={actual:[{indicator_code:ind.code,event_date:'2026-09-30',quantity:40},{indicator_code:ind.code,event_date:'2026-10-01',quantity:5},{indicator_code:ind.code,event_date:'2026-11-01',quantity:30}],forecast:[{indicator_code:ind.code,forecast_date:'2026-10-20',quantity:15}]};
 const x=w.dataForIndicator(ind,'2026-10',data);assert.equal(x.actual.value,5);assert.equal(x.forecast,15);assert.equal(x.projected,20);
 assert.match(w.cfdhReferenceButton(ind),/Ver referência semestral/);
});
test('semester toggle uses 120 hours and the contractual October–March window',()=>{
 const w=workspace();w.state.cfdhReference='semester';const ind=w.displayIndicator(indicator);
 assert.equal(ind.target,120);assert.equal(ind.periodicity,'semestral');
 for(const month of ['2026-10','2026-11','2027-03']){
  const p=w.periodFor(ind,month);assert.equal(p.start,'2026-10-01');assert.equal(p.end,'2027-04-01');
 }
 assert.equal(w.periodFor(ind,'2026-09').start,'2026-04-01');
 assert.match(w.cfdhReferenceButton(ind),/Voltar à referência mensal/);
 w.state.cfdhReference='monthly';assert.equal(w.displayIndicator(indicator).target,20);
});
test('reference switch leaves unrelated indicators and the catalog unchanged',()=>{
 const w=workspace(),other={code:'M6.1_OFICINAS_HORAS',target:160,periodicity:'mensal'};
 w.state.cfdhReference='semester';assert.equal(w.displayIndicator(other),other);assert.equal(indicator.target,120);
 assert.equal(w.periodFor(other,'2026-10').start,'2026-10-01');assert.equal(w.cfdhReferenceButton(other),'');
});
