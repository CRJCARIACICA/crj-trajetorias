const fs=require('node:fs');
const assert=require('node:assert/strict');
const test=require('node:test');
const source=fs.readFileSync('src/goals_workspace.js','utf8');
const functions=source.slice(source.indexOf('function isYouth('),source.indexOf('function statusFor('));
const {actualValue,forecastValue}=new Function('const num=v=>Number(v||0);'+functions+';return {actualValue,forecastValue}')();
const indicator={code:'M4.2_ATIVIDADES_PERCENTUAL',unit:'%'};
test('4.2 adds proportional contributions and reaches 100 only with actual plus forecast',()=>{
 const actual=actualValue([{quantity:3.13},{quantity:3.12},{quantity:3.13}],indicator).value;
 const forecast=forecastValue([{quantity:40},{quantity:50.62}],indicator);
 assert.equal(actual,9.38);assert.equal(forecast,90.62);assert.equal(actual+forecast,100);
});
test('other percentage indicators retain their existing maximum rule',()=>{
 const other={code:'M6.6_SATISFACAO',unit:'%'};
 assert.equal(actualValue([{quantity:80},{quantity:90}],other).value,90);
 assert.equal(forecastValue([{quantity:80},{quantity:90}],other),90);
});
test('empty plans stay at zero and contributions cannot exceed 100',()=>{
 assert.equal(actualValue([],indicator).value,0);
 assert.equal(forecastValue([],indicator),0);
 assert.equal(actualValue([{quantity:80},{quantity:90}],indicator).value,100);
});
