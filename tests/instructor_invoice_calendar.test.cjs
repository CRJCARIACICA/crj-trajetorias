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
function fixture(){
 const calendar=Array.from({length:8},(_,i)=>({id:'c'+i,workshop_id:'w',scheduled_date:`2026-10-${String(i+1).padStart(2,'0')}`,start_time:'14:00',end_time:i===7?'15:00':'18:00',status:'planejada'}));
 return {current:'2026-10-01',next:'2026-11-01',workshops:[{id:'w',name:'Unha de Gel'}],plans:[{id:'p',workshop_id:'w',plan_month:'2026-10-01'}],lessons:calendar.map((r,i)=>({...r,id:'l'+i,plan_id:'p',calendar_entry_id:r.id,included:true})),calendar};
}
test('planning provides 29h base; linked calendar cancellations remove 15h and yield 1003.38',()=>{
 const s=setup(),d=fixture();d.calendar[0].status='cancelada';d.calendar[1].status='cancelada';d.calendar[2].status='cancelada';d.lessons[3].end_time='17:00';d.calendar[3].status='cancelada';d.lessons[7].end_time='16:00';
 const x=s.invoice(d);assert.equal(x.grossHours,29);assert.equal(x.cancelledHours,15);assert.equal(x.serviceHours,14);assert.equal(x.billableHours,14);assert.equal(x.excludedValue,1075.05);assert.equal(x.total,1003.38);
});
test('unplanned calendar additions cannot increase the invoice',()=>{const s=setup(),d=fixture();d.calendar.push({...d.calendar[0],id:'extra'});assert.equal(s.invoice(d).grossHours,29);});
test('calendar duration edits cannot replace planned duration and cancellation subtracts planned minutes',()=>{const s=setup(),d=fixture();d.calendar[0].end_time='23:00';assert.equal(s.invoice(d).serviceHours,29);d.calendar[0].status='cancelada';const x=s.invoice(d);assert.equal(x.cancelledHours,4);assert.equal(x.serviceHours,25);});
test('calendar rows alone cannot produce a payable class',()=>{const s=setup(),d=fixture();d.lessons=[];assert.equal(s.invoice(d).serviceHours,0);d.plans=[];assert.equal(s.invoice(d).total,0);});
test('excluded blocks are not charged again; cancelled linked blocks retain the exclusion evidence',()=>{const s=setup(),d=fixture();d.lessons[0].included=false;assert.equal(s.invoice(d).grossHours,25);d.calendar[0].status='cancelada';const x=s.invoice(d);assert.equal(x.grossHours,29);assert.equal(x.cancelledHours,4);assert.equal(x.serviceHours,25);});
test('missing or ambiguous links and invalid durations flag the invoice for review',()=>{const s=setup(),d=fixture();d.lessons[0].calendar_entry_id=null;assert.equal(s.invoice(d).invalid.length,0);d.calendar.push({...d.calendar[0],id:'duplicate'});assert.equal(s.invoice(d).invalid.length,1);d.lessons[1].start_time=null;assert.equal(s.invoice(d).invalid.length,2);});
test('one planning hour requires every next-month field and a timestamp within the extension',()=>{const s=setup(),d=fixture();d.plans.push({id:'n',workshop_id:'w',plan_month:d.next});d.lessons.push({id:'nl',plan_id:'n',objective:'O',proposed_activities:'A',resources:'R',updated_at:'2026-10-20T23:00:00-03:00'});assert.equal(s.invoice(d).planningHours,1);d.lessons.at(-1).resources='';assert.equal(s.invoice(d).planningHours,0);});
test('invoice display explicitly subtracts planned hours and shows the net amount',()=>{const s=setup(),d=fixture();d.calendar[0].status='cancelada';s.context.fixture=d;const html=vm.runInContext('invoiceHtml(fixture)',s.context);assert.match(html,/29h − 4h = 25h/);assert.match(html,/1.791,75/);});
