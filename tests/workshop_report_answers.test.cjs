const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'bundle/src__app_js.007.part'), 'utf8');
const api = fs.readFileSync(path.join(root, 'bundle/src__api_js.005.part'), 'utf8');
const between = (source, start, end) => {
  const first = source.indexOf(start), last = source.indexOf(end, first);
  assert.ok(first >= 0 && last > first, `Bloco não encontrado: ${start}`);
  return source.slice(first, last).replace(/\bexport /g, '');
};
const state = { currentUser: { id: 'educador' }, workshopMonthlyReports: [] };
const context = vm.createContext({
  Date, Map, Number, String,
  mode: 'mock', mock: () => state, save: () => {}, uid: () => 'relatorio-1',
  now: () => '2026-11-09T12:00:00Z',
  esc: value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  fmtDate: value => String(value || ''), METHODOLOGY_HEADER_DATA: ''
});
vm.runInContext(between(app, 'function educatorExecutionTypeLabel', 'function workshopReportEditorHtml'), context);
vm.runInContext(between(api, 'export async function listWorkshopMonthlyReports', 'function reportMonthRange'), context);

function form(values) {
  return { querySelector(selector) {
    const key = selector.match(/^\[name="([^"]+)"\]$/)?.[1];
    return key in values ? { value: values[key] } : null;
  } };
}
function answer(html, label) {
  const marker = `<b>${label}:</b><div class="methodology-answer">`;
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, `Campo ausente: ${label}`);
  return html.slice(start + marker.length, html.indexOf('</div>', start + marker.length));
}

test('a prévia associa cada resposta ao título correto durante o preenchimento', () => {
  context.bundle = { plan: { id: 'plano-1' }, workshop: { name: 'Capoeira' }, metrics: {} };
  context.form = form({ positive_points: 'Participação & acolhimento', difficulties: 'Faltaram <materiais>\npara a turma' });
  const preview = vm.runInContext('workshopReportPreviewHtml(bundle, workshopReportDraft(bundle, form))', context);
  assert.equal(answer(preview, 'Pontos positivos'), 'Participação &amp; acolhimento');
  assert.equal(answer(preview, 'Dificuldades / pontos negativos'), 'Faltaram &lt;materiais&gt;\npara a turma');
});

test('as respostas persistidas reaparecem ao reabrir e gerar novamente a prévia', async () => {
  context.bundle = { plan: { id: 'plano-2' }, workshop: { name: 'Capoeira' }, metrics: {} };
  context.form = form({ positive_points: 'Boa participação', difficulties: 'Pouco tempo' });
  const draft = vm.runInContext('workshopReportDraft(bundle, form)', context);
  await context.saveWorkshopMonthlyReport(draft);
  const reports = await context.listWorkshopMonthlyReports();
  context.savedBundle = { ...context.bundle, report: reports.find(r => r.plan_id === 'plano-2') };
  const preview = vm.runInContext('workshopReportPreviewHtml(savedBundle)', context);
  assert.equal(answer(preview, 'Pontos positivos'), 'Boa participação');
  assert.equal(answer(preview, 'Dificuldades / pontos negativos'), 'Pouco tempo');
});
