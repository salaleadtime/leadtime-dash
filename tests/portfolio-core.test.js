/* Testes do motor da aba Portfólio (js/portfolio/*.js) em Node, sem navegador.
   Uso: node tests/portfolio-core.test.js
   Carrega os módulos na mesma ordem de index.html num sandbox com DOM mínimo e
   confere: equivalência do calendário de feriados com o SLA de Homologação de
   index.html, capacidade de sprint (feriado reduz capacidade, não duração),
   status de prazo e isolamento de escopo (nada vaza além de window.SalaPortfolio). */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ORDER = ['pf-core', 'pf-metrics', 'pf-state', 'pf-import', 'pf-export', 'pf-views', 'pf-panels', 'pf-app'];
let passed = 0, failed = 0;
function ok(cond, msg){ if(cond){ passed++; console.log('  ✓ ' + msg); } else { failed++; console.log('  ✗ ' + msg); } }

function loadPortfolio(){
  const store = {};
  const win = {
    localStorage: {getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }},
    matchMedia: () => ({matches: false, addEventListener(){}}),
    addEventListener(){},
    document: {addEventListener(){}, createElement: () => ({}), head: {appendChild(){}}},
    console, Date, Math, JSON, Intl, Promise, setTimeout, clearTimeout
  };
  win.window = win;
  const ctx = vm.createContext(win);
  const before = new Set(Object.keys(win));
  for(const f of ORDER) vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/portfolio', f + '.js'), 'utf8'), ctx, {filename: f + '.js'});
  const added = Object.keys(win).filter(k => !before.has(k));
  return {SP: win.SalaPortfolio, PF: win.SalaPortfolio.internal, added};
}

// Funções de feriado do SLA de Homologação, extraídas do próprio index.html
function loadHomologHolidays(){
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const grab = name => { const i = html.indexOf('function ' + name + '('); if(i < 0) throw new Error(name + ' não encontrada'); let d = 0, j = html.indexOf('{', i); for(let k = j; k < html.length; k++){ if(html[k] === '{') d++; else if(html[k] === '}'){ d--; if(d === 0) return html.slice(i, k + 1); } } };
  const ctx = vm.createContext({});
  vm.runInContext(grab('homologEasterSunday') + '\n' + grab('homologNationalHolidayKeys'), ctx);
  return ctx.homologNationalHolidayKeys;
}

console.log('\n═══ 1. Carga e isolamento ═══');
const {SP, PF, added} = loadPortfolio();
ok(added.length === 1 && added[0] === 'SalaPortfolio', 'único global criado: SalaPortfolio (' + added.join(',') + ')');
ok(typeof SP.mount === 'function' && typeof SP.onRemoteRevision === 'function' && typeof SP.show === 'function', 'API pública: mount/show/onRemoteRevision');
ok(PF.emptyState().initiatives.length === 0, 'base inicial vazia (nenhum dado de demonstração embutido)');

console.log('\n═══ 2. Feriados: mesma fonte de verdade que o SLA de Homologação ═══');
const homolog = loadHomologHolidays();
for(let y = 2024; y <= 2035; y++){
  const a = [...PF.getNationalHolidays(y).keys()].sort().join(',');
  const b = homolog(y).slice().sort().join(',');
  ok(a === b, `${y}: ${PF.getNationalHolidays(y).size} feriados idênticos`);
}
ok(PF.getNationalHolidays(2026).get('2026-04-03').name === 'Sexta-feira Santa', 'Sexta-feira Santa 2026 = 03/04 (Páscoa móvel)');
ok(!PF.getNationalHolidays(2023).has('2023-11-20'), 'Consciência Negra só a partir de 2024 (Lei 14.759/2023)');

console.log('\n═══ 3. Sprint: feriado reduz capacidade, não a duração ═══');
const sprint = {start: '2026-11-09', end: '2026-11-20', capacity: {members: [1, 2, 3, 4, 5].map(i => ({id: 'm' + i, name: 'Dev ' + i, hoursPerDay: 6}))}};
const cap = PF.calculateSprintCapacity(sprint, [], null);
ok(cap.calendar.days.length === 12 && cap.workingDaysTheoretical === 10, 'sprint de 2 semanas mantém 10 dias úteis teóricos');
ok(cap.workingDays === 9, '20/11 (sexta) reduz para 9 dias disponíveis');
ok(cap.totalHours === 270, '5 pessoas × 9 dias × 6h = 270h');
const capAbs = PF.calculateSprintCapacity(sprint, [{memberId: 'm1', from: '2026-11-19', to: '2026-11-23', kind: 'Férias'}], null);
ok(capAbs.totalHours === 270 - 6, 'férias sobre feriado não contam em dobro (só 19/11 desconta)');

console.log('\n═══ 4. Status de prazo ═══');
const c = {today: '2026-09-29', settings: {rules: {attentionDaysThreshold: 15, attentionProgressThreshold: 70, devStartSlipToleranceDays: 7, lateVarianceToleranceDays: 0}}};
const dist = {total: 10, done: 2, pctDone: 20};
const st = (init) => PF.calculateDeadlineStatus(Object.assign({situation: 'Em andamento', deliveryHistory: []}, init), dist, {forecast: null, actual: null}, c).status;
ok(st({deliveryPlanned: '2026-09-01'}) === 'late', 'entrega vencida → Atrasada');
ok(st({deliveryPlanned: '2026-10-05'}) === 'attention', 'entrega em 6 dias com 20% concluído → Atenção');
ok(st({deliveryPlanned: '2027-03-01'}) === 'ok', 'entrega distante → No prazo');
ok(st({}) === 'none', 'sem data → Sem previsão');
ok(st({deliveryPlanned: '2026-09-01', deliveryActual: '2026-08-30'}) === 'done', 'entrega registrada → Entregue');
ok(st({deliveryPlanned: '2026-09-01', situation: 'Suspensa'}) === 'suspended', 'situação Suspensa → Suspensa');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
