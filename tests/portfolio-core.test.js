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
const c = {today: '2026-09-29', settings: {rules: {attentionDaysThreshold: 15, attentionProgressThreshold: 70, devStartSlipToleranceDays: 7, replanToleranceDays: 0}}};
const dist = {total: 10, done: 2, pctDone: 20};
const st = (init) => PF.calculateDeadlineStatus(Object.assign({situation: 'Em andamento', deliveryHistory: []}, init), dist, {forecast: null, actual: null}, c).status;
ok(st({deliveryPlanned: '2026-09-01'}) === 'late', 'entrega vencida → Atrasada');
ok(st({deliveryPlanned: '2026-10-05'}) === 'attention', 'entrega em 6 dias com 20% concluído → Atenção');
ok(st({deliveryPlanned: '2027-03-01'}) === 'ok', 'entrega distante → No prazo');
ok(st({}) === 'none', 'sem data → Sem previsão');
ok(st({deliveryPlanned: '2026-09-01', deliveryActual: '2026-08-30'}) === 'done', 'entrega registrada → Entregue');
ok(st({deliveryPlanned: '2026-09-01', situation: 'Suspensa'}) === 'suspended', 'situação Suspensa → Suspensa');


console.log('\n═══ 5. Modelo único: ciclo de vida, Replanejada, universos e Squads ═══');
{
  const mk = (id, o) => Object.assign({id, name:'Iniciativa ' + id, squads:['Alfa'], phase:'Desenvolvimento', situation:'Em andamento', risk:'Baixo', deliveryHistory:[], notesLog:[], owners:[]}, o);
  const st = (id, initiativeId, status, squad) => ({id, initiativeId, title:id, status, squad:squad || null, plannedSprint:null, sprint:null});
  const inits = [
    mk('A', {deliveryPlanned:'2026-11-01', deliveryCurrent:'2026-11-02', deliveryHistory:[{type:'forecast', from:'2026-11-01', to:'2026-11-02', reason:'Dependência'}]}),   // replanejada +1d, vence em 33 dias
    mk('B', {deliveryPlanned:'2026-09-01'}),                                               // vencida → atrasada
    mk('C', {deliveryPlanned:'2026-10-01', deliveryCurrent:'2026-09-15'}),                 // replanejada E a data vigente já venceu → atrasada
    mk('D', {deliveryPlanned:'2026-11-01', situation:'Suspensa', risk:'Crítico'}),         // cancelada
    mk('E', {deliveryPlanned:'2027-03-01'}),                                               // no prazo
    mk('M', {squads:['TopGun','Guardiões','Inception'], deliveryPlanned:'2027-01-15'})     // multi-squad
  ];
  const stories = [
    st('M1','M','Backlog','TopGun'), st('M2','M','Desenvolvimento','TopGun'), st('M3','M','Concluída','Guardiões'), st('M4','M','Homologação','Guardiões'), st('M5','M','Backlog', null),
    st('E1','E','Concluída'), st('D1','D','Desenvolvimento')
  ];
  PF.appState = PF.prepareState({initiatives:inits, stories, sprints:[], settings:{referenceDate:'2026-09-30'}});
  PF.prefs = PF.loadPrefs(); PF.ctx = PF.computeContext();
  const S = id => PF.ctx.initMetrics.get(id).deadline.status;
  ok(S('A') === 'replanned', 'desvio de +1 dia com data alvo em 33 dias → Replanejada (não Atrasada)');
  ok(S('B') === 'late', 'data vigente vencida → Atrasada');
  ok(S('C') === 'late', 'replanejada cuja nova data também venceu → Atrasada (atraso efetivo)');
  ok(S('D') === 'suspended' && PF.ctx.initMetrics.get('D').lifecycle === 'suspended', 'Suspensa → lifecycle suspended');
  ok(S('E') === 'ok', 'sem desvio e longe do prazo → No prazo');
  const all = PF.appState.initiatives, active = PF.filterInitiatives('active'), susp = PF.filterInitiatives('suspended'), every = PF.filterInitiatives('all');
  ok(all.length === 6 && active.length === 5 && susp.length === 1 && every.length === 6, 'universos: 6 cadastradas = 5 ativas + 1 suspensa');
  const pm = PF.getPortfolioMetrics(active, PF.ctx);
  const sum = PF.DEADLINE_KPI_ORDER.reduce((a,k) => a + pm.byStatus[k], 0);
  ok(pm.active === 5 && pm.registered === 6 && pm.suspendedAll === 1 && pm.byStatus.suspended === 0, 'KPIs: ativas=5, cadastradas=6, suspensa fora do recorte operacional');
  ok(sum === pm.active, 'os cards de KPI somam exatamente as ativas (' + sum + ' = ' + pm.active + ')');
  const pmAll = PF.getPortfolioMetrics(every, PF.ctx);
  ok(pmAll.active === 5 && pmAll.suspended === 1, 'mesmo incluindo a suspensa na lista, ela não entra no denominador ativo');
  ok(!PF.getAttentionItems(every, PF.ctx).some(i => i.init.id === 'D'), 'suspensa não é risco ativo nem aparece na atenção executiva (mesmo com risco Crítico)');
  ok(!PF.calculateUpcomingDeliveries(every, 365, PF.ctx).some(u => u.init.id === 'D'), 'suspensa fora de entregas futuras');
  ok(!PF.ctx.opStories.some(x => x.initiativeId === 'D') && PF.ctx.opStories.length === 6, 'histórias da suspensa ficam fora de sprints/capacidade');
  const mM = PF.ctx.initMetrics.get('M');
  ok(mM.multiSquad && mM.bySquad.length === 4, 'Multi-Squad: 3 squads + "Sem Squad definida" (história sem squad não é presumida)');
  ok(mM.bySquad.reduce((a,r) => a + r.dist.total, 0) === mM.distAll.total && mM.distAll.total === 5, 'histórias por squad somam o total da iniciativa');
  ok(mM.bySquad.find(r => r.squad === 'Guardiões').dist.total === 2 && mM.bySquad.find(r => r.squad === 'TopGun').dist.total === 2, 'cada história fica na squad correta');
  ok(PF.storySquadOf(st('x','E','Backlog'), inits[4]) === 'Alfa', 'iniciativa de 1 squad: história sem squad herda a squad');
  ok(PF.getPortfolioMetrics([inits[5]], PF.ctx).active === 1, 'iniciativa Multi-Squad conta 1 vez (3 squads ≠ 3 iniciativas)');
  PF.prefs.filters.squad = 'Guardiões'; PF.ctx = PF.computeContext();
  const gM = PF.ctx.initMetrics.get('M');
  ok(gM.dist.total === 2 && gM.distAll.total === 5 && gM.dist.done === 1, 'filtro por Squad: números só das histórias da Guardiões');
  ok(PF.ctx.initMetrics.get('M').deadline.status === S('M'), 'filtro por Squad não altera o status de prazo da iniciativa');
  ok(PF.filterInitiatives('active').some(i => i.id === 'M') && !PF.filterInitiatives('active').some(i => i.id === 'A'), 'pesquisar uma Squad encontra a iniciativa Multi-Squad e só ela');
  PF.prefs.filters.squad = ''; PF.ctx = PF.computeContext();
  const fmtA = PF.fmtDateTime('2026-09-30T14:05:00'); ok(/^\d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}$/.test(fmtA), 'data/hora fixa dd/mm/aaaa, hh:mm sem toLocale (' + fmtA + ')');
  ok(PF.normalizeDate('01/11/2026').value === '2026-11-01' && PF.normalizeDate('2026-11-01').value === '2026-11-01', 'texto dd/mm/aaaa e ISO normalizam igual');
}

console.log('\n═══ 6. Entrega por iniciativa (Painel): histórias entregues ÷ total, por iniciativa ═══');
{
  const mk = (id, o) => Object.assign({id, name:'Iniciativa ' + id, squads:['Alfa'], phase:'Desenvolvimento', situation:'Em andamento', risk:'Baixo', deliveryHistory:[], notesLog:[], owners:[], deliveryPlanned:'2027-03-01'}, o);
  const many = (initId, spec) => { const out = []; let n = 0; Object.entries(spec).forEach(([status, q]) => { for(let k = 0; k < q; k++) out.push({id:`${initId}-${++n}`, initiativeId:initId, title:'h', status, plannedSprint:null, sprint:null}); }); return out; };
  const inits = [mk('P1'), mk('P2'), mk('P3'), mk('P4'), mk('P5'), mk('P6'), mk('P7', {situation:'Suspensa'})];
  const stories = [
    ...many('P1', {'Concluída':10, 'Backlog':30}),                                                    // 10/40 = 25%
    ...many('P2', {'Concluída':30, 'Desenvolvimento':10}),                                            // 30/40 = 75%
    ...many('P3', {'Concluída':7, 'Refinada':17}),                                                    // 7/24 = 29,2%
    ...many('P4', {'Concluída':3, 'Homologação':2, 'Desenvolvimento':2, 'Refinamento':2, 'Backlog':1}),// 3/10 = 30%
    ...many('P6', {'Concluída':40}),                                                                  // 40/40 = 100%
    ...many('P7', {'Concluída':2})
  ];
  stories.push({...stories[0]});                                                                      // duplicata do mesmo id em P1
  PF.appState = PF.prepareState({initiatives:inits, stories, sprints:[], settings:{referenceDate:'2026-09-30'}});
  PF.prefs = PF.loadPrefs(); PF.ctx = PF.computeContext();
  const D = PF.selectInitiativeDeliveryMetrics(PF.ctx);
  ok(D.get('P1').totalStories === 40 && D.get('P1').deliveredStories === 10 && D.get('P1').percentLabel === '25%', 'T1: 10 de 40 → 25%');
  ok(D.get('P2').deliveredStories === 30 && D.get('P2').percentLabel === '75%', 'T2: 30 de 40 → 75%');
  ok(D.get('P3').percentLabel === '29,2%', 'T3: 7 de 24 → 29,2% (uma casa, vírgula)');
  ok(D.get('P4').totalStories === 10 && D.get('P4').deliveredStories === 3 && D.get('P4').percentLabel === '30%', 'T4: só Concluída entra no numerador (homologação/DEV/refinamento/backlog não)');
  ok(D.get('P5').hasStories === false && D.get('P5').percentLabel === null && D.get('P5').deliveryPercent === null, 'T5: sem histórias → sem percentual (nem 0%, sem divisão por zero)');
  ok(D.get('P6').percentLabel === '100%' && D.get('P6').deliveryPercent === 100, 'T6: 40 de 40 → 100%');
  ok(D.get('P1').totalStories === 40, 'história duplicada (mesmo id) não é contada duas vezes');
  ok(!D.has('P7'), 'suspensa não entra na visão (Todas as ativas)');
  ok([...D.values()].every(d => d.deliveredStories <= d.totalStories && (d.deliveryPercent == null || d.deliveryPercent <= 100)), 'entregues ≤ total e % ≤ 100 em todas');
  ok(PF.formatDeliveryPercent(1, 3) === '33,3%' && PF.formatDeliveryPercent(2, 3) === '66,7%', 'arredondamento a 1 casa (1/3 → 33,3% · 2/3 → 66,7%)');
  ok(PF.formatDeliveryPercent(1999, 2000) === '99,9%' && PF.formatDeliveryPercent(1, 2000) === '0,1%', 'nunca mostra 100% com pendência nem 0% com entrega');
  ok(!('portfolioPercent' in PF.getPortfolioMetrics(PF.filterInitiatives('active'), PF.ctx)) , 'não existe percentual consolidado do portfólio no motor');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
