const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseHTML}=require('linkedom');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/instructor_portal.js'),'utf8').replace(/^import .*;\n/gm,'').replace(/^boot\(\);[ \t]*$/gm,'');
function setup(){
 const {window}=parseHTML('<html><head></head><body></body></html>');
 const timers=new Map(),handlers=[],intervals=new Map();let seq=0;
 const channel={on(type,filter,callback){handlers.push({filter,callback});return channel},subscribe(){return channel}};
 const context=vm.createContext({window,document:window.document,location:{hash:'#oficineiro'},URLSearchParams,Intl,Date,console,Map,Set,
  apiMode:()=> 'live',supabaseClient:()=>({channel:()=>channel,removeChannel:async()=>{}}),
  setTimeout:fn=>{timers.set(++seq,fn);return seq},clearTimeout:id=>timers.delete(id),setInterval:fn=>{intervals.set(++seq,fn);return seq},clearInterval:id=>intervals.delete(id)});
 vm.runInContext(source+';me={id:"instructor",role:"oficineiro",active:true};',context);
 return {window,document:window.document,context,timers,handlers,intervals,invoice:d=>{context.fixture=d;return vm.runInContext('calendarHours(fixture)',context)}};
}
function fixture(){return {current:'2026-10-01',next:'2026-11-01',workshops:[{id:'w',name:'Oficina'}],plans:[],lessons:[],calendar:[{id:'one',workshop_id:'w',scheduled_date:'2026-10-05',start_time:'17:00',end_time:'21:00',status:'planejada'},{id:'two',workshop_id:'w',scheduled_date:'2026-10-07',start_time:'18:00',end_time:'21:00',status:'cancelada'}]};}
test('forecast uses only workshop calendar hours without a monthly plan',()=>{const s=setup(),d=fixture(),x=s.invoice(d);assert.equal(x.hours,4);assert.equal(x.excludedHours,3);assert.equal(x.included.length,1);});
test('calendar cancellation, duration edits and new entries update the forecast',()=>{const s=setup(),d=fixture();d.calendar[0].end_time='20:00';assert.equal(s.invoice(d).hours,3);d.calendar[1].status='planejada';assert.equal(s.invoice(d).hours,6);d.calendar.push({...d.calendar[0],id:'extra'});assert.equal(s.invoice(d).hours,9);d.calendar[0].status='cancelada';assert.equal(s.invoice(d).hours,6);});
test('planning content and planning hours have no effect on the calendar forecast',()=>{const s=setup(),d=fixture();d.plans=[{id:'p',plan_month:d.current}];d.lessons=[{plan_id:'p',start_time:'01:00',end_time:'23:00'}];assert.equal(s.invoice(d).hours,4);});
test('duplicate IDs, other months, foreign workshops and invalid durations cannot add hours',()=>{const s=setup(),d=fixture();d.calendar.push({...d.calendar[0]},{...d.calendar[0],id:'other-month',scheduled_date:'2026-11-01'},{...d.calendar[0],id:'foreign',workshop_id:'other'},{...d.calendar[0],id:'invalid',end_time:null});const x=s.invoice(d);assert.equal(x.hours,4);assert.equal(x.invalid.length,1);});
test('hours panel displays the calendar forecast without monetary amounts or invoice calculation',()=>{const s=setup(),d=fixture();s.context.fixture=d;const html=vm.runInContext('invoiceHtml(fixture)',s.context);assert.match(html,/Previsão de horas válidas/);assert.match(html,/4h/);assert.doesNotMatch(html,/R\$|faturáveis|71,67|Total previsto|descrição da nota/);});
