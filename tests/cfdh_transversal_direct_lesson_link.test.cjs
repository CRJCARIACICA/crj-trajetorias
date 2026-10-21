const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const integration=fs.readFileSync(path.join(__dirname,'..','src','cfdh_transversal_integration.js'),'utf8');
const migration=fs.readFileSync(path.join(__dirname,'..','sql','cfdh_transversal_direct_workshop_lesson_link.sql'),'utf8');

test('CFDH transversal não exige mais marcação prévia na oficina',()=>{
  assert.equal(integration.includes('Esta aula possui CFDH transversal'),false);
  assert.equal(integration.includes("filter(l=>String(l.cfdh_transversal"),false);
  assert.match(integration,/Pendente de elaboração do CFDH Compartilhado Transversal/);
});

test('ação CFDH usa lista dependente de aulas da oficina',()=>{
  assert.match(integration,/data-cfdh-lesson-select/);
  assert.match(integration,/workshop_plan_lesson_id/);
  assert.match(integration,/Aula da oficina para receber o CFDH/);
  assert.match(integration,/não cria outro compromisso nem conflito de horário/);
});

test('campo CFDH da oficina recebe tema, objetivo específico e duração',()=>{
  assert.match(integration,/Tema:/);
  assert.match(integration,/Objetivo específico:/);
  assert.match(integration,/Duração:/);
  assert.match(migration,/a\.planned_duration_hours/);
  assert.match(migration,/Objetivo específico:/);
});

test('sincronização do banco aceita aula ativa sem flag CFDH',()=>{
  const sync=migration.slice(migration.indexOf('create or replace function app_private.sync_cfdh_action_to_workshop'));
  assert.equal(sync.includes("nullif(btrim(coalesce(l.cfdh_transversal"),false);
  assert.match(sync,/l\.included=true/);
  assert.match(sync,/status<>'cancelada'/);
  assert.match(sync,/linked_workshop_plan_lesson/);
});
