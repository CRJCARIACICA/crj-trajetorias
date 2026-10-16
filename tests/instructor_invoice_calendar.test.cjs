const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/instructor_portal.js'),'utf8').replace(/^import .*;\n/,'').replace(/\nboot\(\);\s*$/,'');
function setup(){
 const {window}=parseHTML('<html><head></head><body></body></html>');
 const timers=new Map(),handlers=[],intervals=new Map();let seq=0;
 const channel={on(type,filter,callback){handlers.push({filter,callback});return channel},subscribe(){return channel}};
 const context=vm.createContext({window,document:window.document,location:{hash:'#oficineiro'},URLSearchParams,Intl,Date,console,Map,Set,
  apiMode:()=> 'live',supabaseClient:()=>({channel:()=>channel,removeChannel:async()=>{}}),
  setTimeout:fn=>{timers.set(++seq,fn);return seq},clearTimeout:id=>timers.delete(id),setInterval:fn=>{intervals.set(++seq,fn);return seq},clearInterval:id=>intervals.delete(id)});
 vm.runInContext(source+';me={id:"instructor",role:"oficineiro",active:true};',context);
 return {window,document:window.document,context,timers,handlers,intervals,invoice:d=>{context.fixture=d;return vm.runInContext('currentInvoice(fixture)',context)}};
}
function fixture(){return {current:'2026-10-01',next:'2026-11-01',workshops:[{id:'w',name:'Oficina',start_time:'10:00',end_time:'20:00'}],plans:[{id:'p',plan_month:'2026-10-01'},{id:'next',plan_month:'2026-11-01'}],lessons:[{plan_id:'next',objective:'Objetivo',proposed_activities:'Atividade',resources:'Recurso',updated_at:'2026-10-10T12:00:00Z',start_time:'00:00',end_time:'23:00'}],calendar:Array.from({length:7},(_,i)=>({id:'c'+i,workshop_id:'w',scheduled_date:`2026-10-${String(i+1).padStart(2,'0')}`,start_time:'14:00',end_time:'18:00',status:'planejada'})),loadedAt:'2026-10-16T03:00:00Z'};}
test('invoice uses calendar hours, preserving the separate monthly planning hour',()=>{
 const s=setup(),d=fixture(),x=s.invoice(d);assert.equal(x.serviceHours,28);assert.equal(x.billableHours,29);assert.equal(x.total,2078.43);
 d.lessons[0].end_time='01:00';assert.equal(s.invoice(d).total,2078.43);
});
test('cancellation, addition, duration change, removal and rescheduling recalculate the amount',()=>{
 const s=setup(),d=fixture();d.calendar[0].status='cancelada';assert.equal(s.invoice(d).total,1791.75);assert.equal(s.invoice(d).cancelled,1);
 d.calendar.push({id:'extra',workshop_id:'w',scheduled_date:'2026-10-20',start_time:'14:00',end_time:'16:00',status:'planejada'});assert.equal(s.invoice(d).serviceHours,26);
 d.calendar[1].end_time='17:30';assert.equal(s.invoice(d).serviceHours,25.5);
 d.calendar.pop();assert.equal(s.invoice(d).serviceHours,23.5);
 d.calendar[1].scheduled_date='2026-11-02';assert.equal(s.invoice(d).serviceHours,20);
});
test('performed classes count, foreign workshops and invalid times do not, and no plan is required for extra classes',()=>{
 const s=setup(),d=fixture();d.plans=[];d.calendar[0].status='realizada';d.calendar[1].end_time=null;
 d.calendar.push({id:'foreign',workshop_id:'other',scheduled_date:'2026-10-03',start_time:'10:00',end_time:'18:00'});
 assert.equal(s.invoice(d).serviceHours,24);assert.equal(s.invoice(d).planningHours,0);
 delete d.calendar;assert.throws(()=>s.invoice(d),/Calendário/);
});
test('live calendar events refresh both displayed total and copied invoice description',async()=>{
 const s=setup(),d=fixture();s.context.fixture=d;
 vm.runInContext('loadPortalData=async()=>fixture;copied=[];copyText=text=>copied.push(text);',s.context);
 s.document.body.innerHTML=vm.runInContext('invoiceHtml(fixture)',s.context);
 vm.runInContext('bindInvoiceCopy(document,fixture)',s.context);
 await vm.runInContext('syncInvoiceSubscription()',s.context);
 assert.deepEqual(s.handlers.map(h=>h.filter.table),['workshop_calendar','workshops','workshop_monthly_plans','workshop_plan_lessons']);
 assert.equal(s.intervals.size,1);
 d.calendar[0].status='cancelada';s.handlers[0].callback({eventType:'UPDATE'});
 const callback=[...s.timers.values()].at(-1);await callback();
 assert.match(s.document.querySelector('[data-ip-invoice]').textContent,/1\.791,75/);
 s.context.confirm=()=>true;s.document.querySelector('[data-ip-copy="invoice"]').dispatchEvent(new s.window.Event('click'));await new Promise(resolve=>setImmediate(resolve));
 assert.match(s.context.copied[0],/1\.791,75/);assert.doesNotMatch(s.context.copied[0],/2\.078,43/);
});
test('calendar cancellation preserves the mandatory scheduled date and marks the class cancelled',async()=>{
 const code=fs.readFileSync(path.join(root,'src/general_calendar.js'),'utf8'),start=code.indexOf('async function removeDate('),end=code.indexOf('\nfunction printableRows',start);
 let patch;
 const context=vm.createContext({confirm:()=>true,client:()=>({from:()=>({update:p=>{patch=p;return {eq:async()=>({error:null})}}})}),cached:{},renderCalendar:async()=>{},alert:()=>{}});
 vm.runInContext(code.slice(start,end),context);context.entry={source:'workshop_calendar',id:'lesson',dateField:'scheduled_date',row:{start_time:'14:00',end_time:'18:00'}};
 context.parent={remove(){}};await vm.runInContext('removeDate(entry,parent)',context);
 assert.equal(patch.status,'cancelada');assert.equal('scheduled_date' in patch,false);
});

test('exclusion amount derives from registered minutes without estimating missing times',()=>{const s=setup(),d=fixture();d.calendar[0].status='cancelada';let x=s.invoice(d);assert.equal(x.cancelledHours,4);assert.equal(x.excludedValue,286.68);d.calendar[0].end_time=null;x=s.invoice(d);assert.equal(x.cancelledHours,0);assert.equal(x.invalid.length,1);});
test('next month planning requires every field and proof within October extension',()=>{const s=setup(),d=fixture();assert.equal(s.invoice(d).planningHours,1);d.lessons[0].resources=' ';assert.equal(s.invoice(d).planningHours,0);d.lessons[0].resources='Recurso';d.lessons[0].updated_at='2026-10-21T12:00:00Z';assert.equal(s.invoice(d).planningHours,0);assert.match(s.invoice(d).planning.reason,/conferência/);});
test('29 gross hours minus 15 cancelled yields 14 billable hours and 1003.38',()=>{const s=setup(),d=fixture();d.plans=[];d.calendar=[{id:'valid',workshop_id:'w',scheduled_date:'2026-10-01',start_time:'06:00',end_time:'20:00',status:'planejada'},{id:'cancelled',workshop_id:'w',scheduled_date:'2026-10-02',start_time:'06:00',end_time:'21:00',status:'cancelada'}];const x=s.invoice(d);assert.equal(x.grossHours,29);assert.equal(x.cancelledHours,15);assert.equal(x.billableHours,14);assert.equal(x.total,1003.38);});
