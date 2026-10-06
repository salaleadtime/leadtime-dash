/* SALA Lead Time — aba Portfólio · pf-metrics.js
   motor de métricas, validação, filtros e regras de transição (fonte única dos números da tela e do PPT).
   Módulo clássico (IIFE): nada vaza para o escopo global de index.html além de
   window.SalaPortfolio. Nomes compartilhados entre módulos ficam em PF (namespace interno).
   Ordem de carga: pf-core.js → pf-metrics.js → pf-state.js → pf-import.js → pf-export.js → pf-views.js → pf-panels.js → pf-app.js. */
(function(){
'use strict';
const SP = window.SalaPortfolio = window.SalaPortfolio || {};
const PF = SP.internal = SP.internal || {};

/* =====================================================================
   MOTOR DE MÉTRICAS — única fonte dos números exibidos (tela e PPT)
   ===================================================================== */
function getReferenceDate(){ const r = PF.appState.settings.referenceDate; return r && PF.isValidISO(r) ? r : PF.localTodayISO(); }
function getSprintForDate(c, iso){ if(!iso) return null; return c.sprints.find(s => s.start <= iso && iso <= s.end) || null; }
function getCurrentSprint(sprints, today){
  if(!sprints.length) return null;
  return sprints.find(s => s.start <= today && today <= s.end) || [...sprints].reverse().find(s => s.start <= today) || sprints[0];
}
function completionSprintId(story, c){
  if(story.status !== 'Concluída') return null;
  const byDate = getSprintForDate(c, story.doneAt);
  return byDate ? byDate.id : story.sprint;
}
function calculateLeadTime(story){
  if(story.status !== 'Concluída') return null;
  if(!story.devStartAt || !story.doneAt) return null;
  const d = PF.daysBetween(story.devStartAt, story.doneAt);
  return d < 0 ? null : d;
}
function calculateCurrentLeadTime(story, today){
  if(!PF.OPEN_FLOW.includes(story.status) || !story.devStartAt) return null;
  const d = PF.daysBetween(story.devStartAt, today);
  return d < 0 ? null : d;
}
function leadTimeOf(story, today){
  if(story.status === 'Concluída'){ const d = calculateLeadTime(story); return d == null ? {days:null, kind:'done', note:'Sem dados suficientes'} : {days:d, kind:'done'}; }
  if(PF.OPEN_FLOW.includes(story.status)){ const d = calculateCurrentLeadTime(story, today); return d == null ? {days:null, kind:'open', note:'Sem dados suficientes'} : {days:d, kind:'open'}; }
  return {days:null, kind:null, note:'Não iniciada'};
}
function calculateProgress(done, total){ return total > 0 ? Math.round(done / total * 100) : null; }
function calculateStoryDistribution(stories){
  const by = Object.fromEntries(PF.WORKFLOW.map(s => [s,0]));
  let blocked = 0;
  stories.forEach(s => { by[s.status] = (by[s.status]||0) + 1; if(s.blocked && s.status !== 'Concluída') blocked++; });
  return {total:stories.length, byStatus:by, blocked, done:by['Concluída'], inFlow:by['Desenvolvimento'] + by['Homologação']};
}
/* Datas de entrega — três conceitos distintos, sempre em dias corridos:
   planejada (baseline) · atual (previsão vigente) · real (fato ocorrido).
   Desvio previsto = atual − planejada.  Prazo real = real − planejada. */
function calculateForecastVariance(init){ return (init.deliveryPlanned && init.deliveryCurrent) ? PF.daysBetween(init.deliveryPlanned, init.deliveryCurrent) : null; }
function calculateActualVariance(init){ return (init.deliveryPlanned && init.deliveryActual) ? PF.daysBetween(init.deliveryPlanned, init.deliveryActual) : null; }
function isReprogrammed(init){ return !!(init.deliveryCurrent && init.deliveryCurrent !== init.deliveryPlanned); }
function fmtDeltaDays(n){ if(n == null) return '—'; if(n === 0) return 'No prazo'; return `${PF.fmtSigned(n)} ${Math.abs(n) === 1 ? 'dia' : 'dias'}`; }
function deltaKind(n){ return n == null ? null : n > 0 ? 'late' : n < 0 ? 'early' : 'zero'; }
/* Sequência de previsões: baseline → cada reprogramação registrada → previsão vigente (sem repetir datas consecutivas). */
function deliveryTrail(init){
  const out = [];
  const push = d => { if(d && out[out.length-1] !== d) out.push(d); };
  push(init.deliveryPlanned);
  init.deliveryHistory.filter(h => h.type === 'forecast').forEach(h => { push(h.from); push(h.to); });
  push(init.deliveryCurrent);
  return out;
}
function deliveryTooltip(init){
  const L = [];
  if(init.deliveryPlanned) L.push(`Entrega planejada: ${PF.fmtDateFull(init.deliveryPlanned)}`);
  if(init.deliveryActual){
    L.push(`Entrega real: ${PF.fmtDateFull(init.deliveryActual)}`);
    const a = calculateActualVariance(init); if(a != null) L.push(`Prazo real: ${fmtDeltaDays(a)}`);
    if(isReprogrammed(init) && init.deliveryCurrent !== init.deliveryActual) L.push(`Última previsão: ${PF.fmtDateFull(init.deliveryCurrent)}`);
  } else if(isReprogrammed(init)){
    L.push(`Entrega atual: ${PF.fmtDateFull(init.deliveryCurrent)}`);
    const f = calculateForecastVariance(init); if(f != null) L.push(`Desvio previsto: ${fmtDeltaDays(f)}`);
  } else if(!init.deliveryPlanned && init.deliveryCurrent) L.push(`Entrega atual: ${PF.fmtDateFull(init.deliveryCurrent)}`);
  return L.join('\n') || 'Sem data de entrega';
}
function recordDeliveryChange(init, type, from, to, extra = {}){
  init.deliveryHistory.push({id:'h' + Date.now().toString(36) + Math.random().toString(36).slice(2,5), type, from: from || null, to: to || null, changedAt:new Date().toISOString(), changedBy:null, ...extra});
}
function calculateScheduleVariance(init){
  return {
    forecast: calculateForecastVariance(init),
    actual: calculateActualVariance(init),
    dev: (init.devPlanned && init.devActual) ? PF.daysBetween(init.devPlanned, init.devActual) : null
  };
}
/* CICLO DE VIDA — fonte única de "a iniciativa está na operação?".
   suspended = cancelada (fora da operação) · done = entregue/concluída · active = demais.
   "Ativas" = tudo que não está suspenso (cadastradas − suspensas). */
function lifecycleOf(init){
  if(init.situation === 'Suspensa') return 'suspended';
  if(init.deliveryActual || init.situation === 'Concluída') return 'done';
  return 'active';
}
const isSuspended = init => init.situation === 'Suspensa';
/* SQUAD DA HISTÓRIA — a própria história manda. Só quando a iniciativa tem UMA squad e a história não
   informa, herda a dela. Em Multi-Squad sem informação fica sem squad (null): nunca se chuta. */
function storySquadOf(story, init){
  if(story.squad) return story.squad;
  return init && init.squads.length === 1 ? init.squads[0] : null;
}
function squadBreakdown(init, allStories){
  const map = new Map(init.squads.map(sq => [sq, []])); const none = [];
  allStories.forEach(st => { const sq = storySquadOf(st, init); if(sq == null) none.push(st); else { if(!map.has(sq)) map.set(sq, []); map.get(sq).push(st); } });
  const row = (squad, stories) => { const dist = calculateStoryDistribution(stories); return {squad, label:squad || PF.SQUAD_NONE_LABEL, declared: squad == null || init.squads.includes(squad), stories, dist, progress:calculateProgress(dist.done, dist.total)}; };
  const rows = [...map].map(([sq, st]) => row(sq, st));
  if(none.length && init.squads.length > 1) rows.push(row(null, none));
  return rows;
}
function calculateDeadlineStatus(init, dist, variance, c){
  const r = c.settings.rules, today = c.today;
  const lifecycle = lifecycleOf(init);
  const target = init.deliveryCurrent || init.deliveryPlanned || null;
  const daysTo = target ? PF.daysBetween(today, target) : null;
  const base = {target, daysTo, lifecycle};
  /* Suspensa = cancelada: nunca atrasada, replanejada nem em risco; sem prazo ativo. */
  if(lifecycle === 'suspended') return {...base, daysTo:null, status:'suspended', reasons:['Iniciativa suspensa (cancelada): fora da operação, sem prazo, previsão ou risco ativos']};
  if(init.deliveryActual) return {...base, status:'done', reasons:[`Entregue em ${PF.fmtDateFull(init.deliveryActual)}${variance.actual != null ? ` · prazo real: ${fmtDeltaDays(variance.actual)}` : ''}`]};
  if(init.situation === 'Concluída') return {...base, status:'done', reasons:['Iniciativa concluída']};
  if(!target) return {...base, status:'none', reasons:['Sem data de entrega planejada ou atual']};
  /* REPLANEJAMENTO ≠ ATRASO. Replanejada = a previsão vigente foi movida em relação ao baseline (fato de gestão).
     Atrasada = a data vigente JÁ VENCEU sem entrega (fato do calendário). */
  const fv = variance.forecast;
  const replanned = fv != null && Math.abs(fv) > r.replanToleranceDays;
  const replanNote = replanned ? `Replanejada: previsão atual ${PF.fmtDate(init.deliveryCurrent)} (planejada ${PF.fmtDate(init.deliveryPlanned)}) · ${PF.fmtSigned(fv)} ${Math.abs(fv) === 1 ? 'dia' : 'dias'}` : null;
  if(daysTo < 0) return {...base, status:'late', reasons:[`Entrega de ${PF.fmtDate(target)} vencida há ${PF.plural(-daysTo,'dia','dias')}`, ...(replanNote ? [replanNote] : [])]};
  const attn = [];
  const progress = calculateProgress(dist.done, dist.total);
  if(daysTo <= r.attentionDaysThreshold && (progress == null || progress < r.attentionProgressThreshold))
    attn.push(`Entrega em ${PF.plural(daysTo,'dia','dias')} com ${progress == null ? 'nenhuma história cadastrada' : progress + '% das histórias concluídas'} (mínimo ${r.attentionProgressThreshold}%)`);
  if(init.devPlanned && !init.devActual){ const late = PF.daysBetween(init.devPlanned, today); if(late > r.devStartSlipToleranceDays) attn.push(`DEV previsto para ${PF.fmtDate(init.devPlanned)} ainda não iniciado (${PF.plural(late,'dia','dias')})`); }
  if(variance.dev != null && variance.dev > r.devStartSlipToleranceDays) attn.push(`DEV iniciado ${PF.plural(variance.dev,'dia','dias')} após o previsto`);
  if(attn.length) return {...base, status:'attention', reasons:[...attn, ...(replanNote ? [replanNote] : [])]};
  if(replanned) return {...base, status:'replanned', reasons:[replanNote, `Entrega em ${PF.plural(daysTo,'dia','dias')}, sem sinais de atenção`]};
  return {...base, status:'ok', reasons:[`Entrega em ${PF.plural(daysTo,'dia','dias')}, sem desvios acima dos limites configurados`]};
}
function getInitiativeMetrics(init, c){
  const lifecycle = lifecycleOf(init);
  const allStories = c.storiesByInit.get(init.id) || [];
  /* Filtro por Squad: os NÚMEROS exibidos (histórias, avanço, lead time) são só das histórias da squad;
     o status de PRAZO continua sendo da iniciativa (a data de entrega é da iniciativa, não da squad). */
  const stories = c.squadScope ? allStories.filter(st => storySquadOf(st, init) === c.squadScope) : allStories;
  const distAll = calculateStoryDistribution(allStories);
  const dist = stories === allStories ? distAll : calculateStoryDistribution(stories);
  const variance = calculateScheduleVariance(init);
  const deadline = calculateDeadlineStatus(init, distAll, variance, c);
  const lts = stories.map(calculateLeadTime).filter(v => v != null);
  const openLts = stories.map(s => calculateCurrentLeadTime(s, c.today)).filter(v => v != null);
  const openSprints = [...new Set(stories.filter(s => s.status !== 'Concluída' && s.sprint).map(s => s.sprint))]
    .sort((a,b) => (c.sprintIdx.get(a) ?? 999) - (c.sprintIdx.get(b) ?? 999));
  return {
    lifecycle, multiSquad: init.squads.length > 1, bySquad: squadBreakdown(init, allStories),
    allStories, distAll, stories, dist, variance, deadline, progress: calculateProgress(dist.done, dist.total),
    leadTimeAvg: lts.length ? Math.round(PF.avg(lts)) : null, openLeadTimeAvg: openLts.length ? Math.round(PF.avg(openLts)) : null,
    sprints: openSprints, carryOver: stories.filter(s => isCarryOver(s, c)).length
  };
}
function isCarryOver(story, c){
  if(!story.plannedSprint) return false;
  if(story.status === 'Concluída') return completionSprintId(story, c) !== story.plannedSprint;
  const sp = c.sprintById.get(story.plannedSprint);
  return story.sprint !== story.plannedSprint || (sp && sp.end < c.today);
}
function calculateCarryOver(sprint, stories, c){
  const idx = c.sprintIdx.get(sprint.id);
  const ended = sprint.end < c.today;
  const out = stories.filter(s => s.plannedSprint === sprint.id && (
    s.status === 'Concluída' ? completionSprintId(s, c) !== sprint.id : (s.sprint !== sprint.id || ended)));
  const inn = stories.filter(s => {
    const inScope = s.status === 'Concluída' ? completionSprintId(s, c) === sprint.id : s.sprint === sprint.id;
    const pIdx = c.sprintIdx.get(s.plannedSprint);
    return inScope && pIdx != null && pIdx < idx;
  });
  return {out, in:inn};
}
function calculateThroughput(sprint, stories, c){ return stories.filter(s => completionSprintId(s, c) === sprint.id).length; }
function getSprintMetrics(sprint, c, stories){
  stories = stories || c.opStories || PF.appState.stories;
  const planned = stories.filter(s => s.plannedSprint === sprint.id);
  const completed = stories.filter(s => completionSprintId(s, c) === sprint.id);
  const open = stories.filter(s => s.status !== 'Concluída' && s.sprint === sprint.id);
  const carry = calculateCarryOver(sprint, stories, c);
  /* Escopo = abertas alocadas + concluídas na sprint + compromissos que transbordaram (evita 100% com transbordo) */
  const scope = [...new Set([...open, ...completed, ...carry.out])];
  const lts = completed.map(calculateLeadTime).filter(v => v != null);
  const total = PF.daysBetween(sprint.start, sprint.end) + 1;
  let elapsed = PF.daysBetween(sprint.start, c.today) + 1; elapsed = Math.max(0, Math.min(total, elapsed));
  const state = c.today < sprint.start ? 'future' : c.today > sprint.end ? 'past' : 'current';
  return {
    sprint, state, totalDays:total, elapsedDays:elapsed, remainingDays: total - elapsed,
    timePct: Math.round(elapsed/total*100),
    planned, scope, completed, open,
    inDev: open.filter(s => s.status === 'Desenvolvimento'), inHomolog: open.filter(s => s.status === 'Homologação'),
    blocked: open.filter(s => s.blocked), notStarted: open.filter(s => !PF.OPEN_FLOW.includes(s.status)),
    carryOut: carry.out, carryIn: carry.in,
    throughput: calculateThroughput(sprint, stories, c),
    progress: calculateProgress(completed.length, scope.length),
    leadTimeAvg: lts.length ? Math.round(PF.avg(lts)) : null, leadTimeSample: lts.length
  };
}
function calculateUpcomingDeliveries(initiatives, windowDays, c){
  const end = PF.addDays(c.today, windowDays);
  return initiatives.map(i => ({init:i, m:c.initMetrics.get(i.id)}))
    .filter(({m}) => m.deadline.target && !['done','suspended'].includes(m.deadline.status) && m.deadline.target >= c.today && m.deadline.target <= end)
    .sort((a,b) => a.m.deadline.target < b.m.deadline.target ? -1 : a.m.deadline.target > b.m.deadline.target ? 1 : a.init.id.localeCompare(b.init.id));
}
function getAttentionItems(initiatives, c){
  const items = [];
  initiatives.forEach(init => {
    const m = c.initMetrics.get(init.id), sig = [];
    if(['done','suspended'].includes(m.deadline.status)) return;   /* suspensa = cancelada: não é risco ativo */
    const d = m.deadline;
    if(d.status === 'late') d.reasons.forEach(t => sig.push({sev:1, cat:'Prazo', text:t}));
    if(init.risk === 'Crítico') sig.push({sev:1, cat:'Risco', text:`Risco crítico${init.cause ? ': ' + init.cause : ''}`});
    if(init.situation === 'Aguardando negócio') sig.push({sev:2, cat:'Decisão', text:`Aguardando área de negócio${init.cause ? ' — ' + init.cause : ''}`});
    if(d.status === 'attention') d.reasons.forEach(t => sig.push({sev:2, cat:'Prazo', text:t}));
    if(init.risk === 'Alto') sig.push({sev:2, cat:'Risco', text:`Risco alto${init.cause ? ': ' + init.cause : ''}`});
    if(m.dist.blocked > 0) sig.push({sev:2, cat:'Bloqueio', text:`${PF.plural(m.dist.blocked,'história bloqueada','histórias bloqueadas')}`});
    if(d.status === 'none') sig.push({sev:3, cat:'Previsão', text:'Sem data de entrega definida'});
    if(init.phase === 'Discovery' && init.discoveryEnd && init.discoveryEnd < c.today && !['done','suspended'].includes(d.status))
      sig.push({sev:3, cat:'Fase', text:`Discovery encerrado em ${PF.fmtDate(init.discoveryEnd)} e iniciativa ainda em Discovery`});
    if(d.status === 'replanned') sig.push({sev:3, cat:'Prazo', text:d.reasons[0]});
    if(!sig.length) return;
    sig.sort((a,b) => a.sev - b.sev);
    items.push({init, m, signals:sig, sev:sig[0].sev, score: sig.reduce((acc,s) => acc + (4 - s.sev) ** 2, 0)});
  });
  return items.sort((a,b) => a.sev - b.sev || b.score - a.score || (a.m.deadline.daysTo ?? 9e9) - (b.m.deadline.daysTo ?? 9e9));
}
/* Dois universos, nunca misturados:
   • cadastradas = tudo (c.registered) · • ativas = cadastradas − suspensas (base de TODOS os percentuais).
   byStatus soma exatamente `active`; suspensas são contadas à parte. */
function getPortfolioMetrics(initiatives, c){
  const byStatus = Object.fromEntries(Object.keys(PF.DEADLINE_META).map(k => [k,0]));
  const stories = [];
  const squads = new Set();
  initiatives.forEach(i => {
    const m = c.initMetrics.get(i.id); byStatus[m.deadline.status]++;
    if(m.lifecycle === 'suspended') return;
    stories.push(...m.stories); i.squads.forEach(s => squads.add(s));
  });
  const suspended = byStatus.suspended;
  const active = initiatives.length - suspended;
  const dist = calculateStoryDistribution(stories);
  const lts = stories.map(calculateLeadTime).filter(v => v != null);
  return {
    total: initiatives.length, active, suspended, delivered: byStatus.done,
    registered: c.registered, suspendedAll: c.suspendedCount, activeAll: c.activeCount,
    byStatus, dist, squads: squads.size,
    leadTimeAvg: lts.length ? Math.round(PF.avg(lts)) : null, leadTimeSample: lts.length,
    carryOverOpen: stories.filter(s => s.status !== 'Concluída' && isCarryOver(s, c)).length
  };
}
function buildHeadline(pm, initiatives, c){
  if(!pm.active) return '';
  const parts = [];
  const late = pm.byStatus.late, attn = pm.byStatus.attention, rep = pm.byStatus.replanned;
  if(late && attn) parts.push(`<strong>${PF.plural(late,'atrasada','atrasadas')}</strong> e <strong>${attn} em atenção</strong> pedem ação.`);
  else if(late) parts.push(`<strong>${PF.plural(late,'iniciativa atrasada','iniciativas atrasadas')}</strong> pede${late>1?'m':''} ação.`);
  else if(attn) parts.push(`<strong>${attn} em atenção</strong> pede${attn>1?'m':''} acompanhamento.`);
  else parts.push('Nenhuma iniciativa atrasada ou em atenção.');
  if(rep) parts.push(`${PF.plural(rep,'replanejada','replanejadas')} em relação ao baseline.`);
  const up = calculateUpcomingDeliveries(initiatives, 60, c);
  parts.push(up.length ? `${PF.plural(up.length,'entrega prevista','entregas previstas')} nos próximos 60 dias${up[0] ? ` — a próxima em ${PF.fmtDayMonth(up[0].m.deadline.target)}` : ''}.` : 'Nenhuma entrega prevista nos próximos 60 dias.');
  if(pm.byStatus.none) parts.push(`${PF.plural(pm.byStatus.none,'iniciativa','iniciativas')} sem data de entrega.`);
  return parts.join(' ');
}
function computeContext(){
  const s = PF.appState, today = getReferenceDate();
  const sprints = [...s.sprints].sort((a,b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0);
  const c = {
    today, settings:s.settings, sprints,
    sprintIdx: new Map(sprints.map((sp,i) => [sp.id,i])),
    sprintById: new Map(sprints.map(sp => [sp.id, sp])),
    initById: new Map(s.initiatives.map(i => [i.id, i])),
    storiesByInit: new Map(s.initiatives.map(i => [i.id, []])),
    squadScope: (PF.prefs && PF.prefs.filters && PF.prefs.filters.squad) || '',
    registered: s.initiatives.length,
    suspendedCount: s.initiatives.filter(isSuspended).length
  };
  c.activeCount = c.registered - c.suspendedCount;
  const suspIds = new Set(s.initiatives.filter(isSuspended).map(i => i.id));
  /* Histórias de iniciativas suspensas ficam fora de sprints, capacidade e previsão. */
  c.opStories = s.stories.filter(st => !suspIds.has(st.initiativeId));
  s.stories.forEach(st => { const arr = c.storiesByInit.get(st.initiativeId); if(arr) arr.push(st); });
  c.currentSprint = getCurrentSprint(sprints, today);
  c.initMetrics = new Map(s.initiatives.map(i => [i.id, getInitiativeMetrics(i, c)]));
  c.issues = validateData(s, c);
  c.quality = qualityScore(s, c.issues);
  return c;
}

/* =====================================================================
   VALIDAÇÃO / QUALIDADE DE DADOS
   ===================================================================== */
/* Coerência das datas do cronograma de UMA iniciativa — usada pela Qualidade dos dados e pelo Cronograma. */
function scheduleInconsistencies(i){
  const out = [];
  if(i.discoveryStart && i.discoveryEnd && i.discoveryEnd < i.discoveryStart) out.push('Fim do Discovery anterior ao início');
  if(i.deliveryPlanned && i.discoveryEnd && i.deliveryPlanned < i.discoveryEnd) out.push(`Entrega planejada (${PF.fmtDate(i.deliveryPlanned)}) anterior ao fim do Discovery (${PF.fmtDate(i.discoveryEnd)})`);
  const devRef = i.devActual || i.devPlanned; const tgt = i.deliveryCurrent || i.deliveryPlanned;
  if(tgt && devRef && tgt < devRef) out.push(`Entrega (${PF.fmtDate(tgt)}) anterior ao início do DEV (${PF.fmtDate(devRef)})`);
  return out;
}
function validateData(s, c){
  const issues = [];
  const add = (level, entity, id, message) => issues.push({level, entity, id, message});
  const initIds = new Set(), dupInit = new Set();
  s.initiatives.forEach(i => { if(initIds.has(i.id)) dupInit.add(i.id); initIds.add(i.id); });
  dupInit.forEach(id => add('error','Iniciativa',id,'ID de iniciativa duplicado'));
  const spIds = new Set(s.sprints.map(sp => sp.id));
  s.initiatives.forEach(i => {
    if(!i.id) add('error','Iniciativa','(sem ID)','Iniciativa sem ID');
    if(!i.name) add('error','Iniciativa',i.id,'Iniciativa sem nome');
    if(!i.squads.length) add('warning','Iniciativa',i.id,'Sem squad associada');
    scheduleInconsistencies(i).forEach(msg => add('warning','Iniciativa',i.id,msg));
    if(!i.deliveryPlanned && !i.deliveryCurrent && !i.deliveryActual && i.situation !== 'Suspensa') add('info','Iniciativa',i.id,'Sem data de entrega (status "Sem previsão")');
    if(!i.risk) add('info','Iniciativa',i.id,'Risco não avaliado');
    if(i.deliveryActual && c && c.today && i.deliveryActual > c.today) add('warning','Iniciativa',i.id,`Entrega real (${PF.fmtDate(i.deliveryActual)}) posterior à data de referência — entrega real deve ser fato ocorrido`);
    if(i.deliveryActual && !i.deliveryPlanned) add('info','Iniciativa',i.id,'Entrega real sem entrega planejada para calcular o prazo real');
    if(i.owners.some(o => o.area && !o.name)) add('warning','Iniciativa',i.id,'Área responsável informada sem nome de responsável');
    if(i.squads.length > 1){ const n = s.stories.filter(st => st.initiativeId === i.id && !st.squad).length; if(n) add('warning','Iniciativa',i.id,`${PF.plural(n,'história sem Squad definida','histórias sem Squad definida')} (iniciativa Multi-Squad: a squad não é presumida)`); }
    const noReason = i.deliveryHistory.filter(h => h.type === 'forecast' && !h.reason && h.source !== 'import').length;
    if(noReason) add('info','Iniciativa',i.id,`${PF.plural(noReason,'replanejamento sem motivo registrado','replanejamentos sem motivo registrado')}`);
    if(i.phase && !PF.PHASES.includes(i.phase)) add('warning','Iniciativa',i.id,`Fase fora do padrão: "${i.phase}"`);
  });
  const stIds = new Set(), dupSt = new Set();
  s.stories.forEach(st => { if(stIds.has(st.id)) dupSt.add(st.id); stIds.add(st.id); });
  dupSt.forEach(id => add('error','História',id,'ID de história duplicado'));
  s.stories.forEach(st => {
    if(!initIds.has(st.initiativeId)) add('error','História',st.id,`História órfã: iniciativa ${st.initiativeId || '(vazia)'} não existe`);
    if(st.plannedSprint && !spIds.has(st.plannedSprint)) add('warning','História',st.id,`Sprint planejada inexistente: ${st.plannedSprint}`);
    if(st.sprint && !spIds.has(st.sprint)) add('warning','História',st.id,`Sprint inexistente: ${st.sprint}`);
    if(st.status === 'Concluída' && !st.doneAt) add('warning','História',st.id,'Concluída sem data de conclusão (Lead Time indisponível)');
    if(st.status === 'Concluída' && st.doneAt && st.devStartAt && st.doneAt < st.devStartAt) add('warning','História',st.id,'Conclusão anterior ao início do desenvolvimento');
    if(PF.OPEN_FLOW.includes(st.status) && !st.devStartAt) add('warning','História',st.id,'Em fluxo sem data de início do DEV (Lead Time indisponível)');
    if(st.blocked && !st.blockedReason) add('info','História',st.id,'Bloqueada sem motivo informado');
    const ini = s.initiatives.find(x => x.id === st.initiativeId);
    if(ini && st.squad && ini.squads.length && !ini.squads.includes(st.squad)) add('warning','História',st.id,`Squad "${st.squad}" não consta nas squads da iniciativa ${ini.id}`);
  });
  const sps = [...s.sprints].sort((a,b) => a.start < b.start ? -1 : 1);
  const spSeen = new Set();
  sps.forEach((sp, k) => {
    if(spSeen.has(sp.id)) add('error','Sprint',sp.id,'ID de sprint duplicado'); spSeen.add(sp.id);
    if(!sp.start || !sp.end) add('error','Sprint',sp.id,'Sprint sem data de início ou fim');
    else if(sp.end < sp.start) add('error','Sprint',sp.id,'Fim anterior ao início');
    const nx = sps[k+1]; if(nx && sp.end && nx.start && nx.start <= sp.end) add('warning','Sprint',sp.id,`Período sobreposto a ${nx.id}`);
  });
  return issues;
}
function qualityScore(s, issues){
  const total = s.initiatives.length + s.stories.length + s.sprints.length;
  const bad = new Set(issues.filter(i => i.level !== 'info').map(i => i.entity + '|' + i.id));
  return {
    total, invalid: bad.size, score: total ? Math.round((total - bad.size) / total * 100) : null,
    errors: issues.filter(i => i.level === 'error').length, warnings: issues.filter(i => i.level === 'warning').length, infos: issues.filter(i => i.level === 'info').length
  };
}

/* =====================================================================
   FILTROS — um único modelo aplicado a todas as visões
   ===================================================================== */
const FILTER_DEFS = {
  squad:{label:'Squad', options:() => [...new Set([...PF.appState.initiatives.flatMap(i => i.squads), ...PF.appState.stories.map(st => st.squad).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,'pt'))},
  deadline:{label:'Prazo', options:() => ['late','attention','replanned','none','ok','done'], fmt:v => PF.DEADLINE_META[v]?.label || v},
  risk:{label:'Risco', options:() => [...PF.RISKS, '__none'], fmt:v => v === '__none' ? 'Não avaliado' : v},
  phase:{label:'Fase', options:() => { const used = new Set(PF.appState.initiatives.map(i => i.phase)); return [...PF.PHASES.filter(p => used.has(p)), ...[...used].filter(p => !PF.PHASES.includes(p))]; }},
  situation:{label:'Andamento', options:() => PF.SITUATIONS.filter(x => x !== 'Suspensa')},
  area:{label:'Área responsável', options:() => [...new Set(PF.appState.initiatives.flatMap(PF.ownerAreas))].sort((a,b)=>a.localeCompare(b,'pt'))},
  sprint:{label:'Sprint', options:() => PF.ctx.sprints.map(s => s.id), fmt:v => PF.ctx.sprintById.get(v)?.name || v},
  year:{label:'Ano de entrega', options:() => [...new Set(PF.appState.initiatives.map(i => (i.deliveryCurrent || i.deliveryPlanned || '').slice(0,4)).filter(Boolean))].sort(), fmt:v => v}
};
const PRIMARY_FILTERS = ['squad','deadline','risk'];
const MORE_FILTERS = ['phase','situation','area','sprint','year'];
/* ESCOPO (Situação da iniciativa): ativas (padrão) · suspensas · todas. Um único ponto de decisão para todas as visões. */
/* Painel e Sprints são SEMPRE operacionais (ativas); Iniciativas e Cronograma seguem a escolha do usuário. */
const viewScope = () => PF.prefs.view === 'initiatives' ? (PF.prefs.scope || 'active') : 'active';
function filterInitiatives(scopeOverride){
  const f = PF.prefs.filters, q = PF.normKey(f.q), scope = scopeOverride || viewScope();
  return PF.appState.initiatives.filter(i => {
    const m = PF.ctx.initMetrics.get(i.id);
    if(scope === 'active' && m.lifecycle === 'suspended') return false;
    if(scope === 'suspended' && m.lifecycle !== 'suspended') return false;
    if(q && !PF.normKey(i.id + ' ' + i.name).includes(q)) return false;
    if(f.squad && !(i.squads.includes(f.squad) || m.allStories.some(st => storySquadOf(st, i) === f.squad))) return false;
    if(f.phase && i.phase !== f.phase) return false;
    if(f.situation && i.situation !== f.situation) return false;
    if(f.area && !i.owners.some(o => o.area === f.area)) return false;
    if(f.deadline && m.deadline.status !== f.deadline) return false;
    if(f.risk && (f.risk === '__none' ? !!i.risk : i.risk !== f.risk)) return false;
    if(f.year && (i.deliveryCurrent || i.deliveryPlanned || '').slice(0,4) !== f.year) return false;
    if(f.sprint && !m.stories.some(s => s.sprint === f.sprint || s.plannedSprint === f.sprint)) return false;
    return true;
  });
}
function activeFilterCount(keys){ return (keys || Object.keys(PF.prefs.filters)).filter(k => PF.prefs.filters[k]).length; }
function setFilter(key, value){ PF.prefs.filters[key] = value; PF.persistPrefs(); if(key === 'squad') PF.ctx = computeContext(); PF.renderFilterBar(); PF.renderActiveFilters(); PF.renderView(); }
function setScope(value){ PF.prefs.scope = PF.SCOPES[value] ? value : 'active'; PF.persistPrefs(); PF.renderFilterBar(); PF.renderActiveFilters(); PF.renderView(); }
function clearFilters(){ Object.keys(PF.prefs.filters).forEach(k => PF.prefs.filters[k] = ''); PF.persistPrefs(); PF.ctx = computeContext(); PF.renderFilterBar(); PF.renderActiveFilters(); PF.renderView(); }
/* =====================================================================
   REGRAS DE TRANSIÇÃO DE HISTÓRIA
   ===================================================================== */
function applyStatusTransition(story, next, today){
  const prev = story.status; if(prev === next) return;
  const ord = PF.WORKFLOW.indexOf(next);
  story.status = next;
  if(ord >= PF.WORKFLOW.indexOf('Desenvolvimento') && !story.devStartAt) story.devStartAt = today;
  if(ord >= PF.WORKFLOW.indexOf('Homologação') && !story.homologAt) story.homologAt = today;
  if(next === 'Concluída'){
    story.doneAt = story.doneAt || today; story.blocked = false; story.blockedReason = ''; story.blockedSince = null;
    const sp = getSprintForDate(PF.ctx, story.doneAt); if(sp) story.sprint = sp.id;
    if(!story.plannedSprint) story.plannedSprint = story.sprint;
  } else story.doneAt = null;
  if(ord < PF.WORKFLOW.indexOf('Homologação')) story.homologAt = null;
  if(ord < PF.WORKFLOW.indexOf('Desenvolvimento')) story.devStartAt = null;
}
function findStory(id){ return PF.appState.stories.find(s => s.id === id); }
function changeStoryStatus(id, next){
  const s0 = findStory(id); if(!s0 || s0.status === next) return;
  const prev = s0.status;
  PF.commit(s => { const st = s.stories.find(x => x.id === id); applyStatusTransition(st, next, PF.ctx.today); }, {toast:`${id}: ${prev} → ${next}`});
}
function changeStorySprint(id, sprintId){
  PF.commit(s => { const st = s.stories.find(x => x.id === id); st.sprint = sprintId || null; if(!st.plannedSprint && sprintId) st.plannedSprint = sprintId; },
    {toast:`${id} movida para ${sprintId ? PF.ctx.sprintById.get(sprintId)?.name || sprintId : 'sem sprint'}`});
}
function toggleBlock(id){
  const st = findStory(id); if(!st) return;
  if(st.blocked){ PF.commit(s => { const x = s.stories.find(y => y.id === id); x.blocked = false; x.blockedReason = ''; x.blockedSince = null; }, {toast:`${id} desbloqueada`}); return; }
  PF.openOverlay({size:'modal--sm', label:'Bloquear história', html: PF.modalFrame('Bloquear história', `${PF.esc(st.id)} · ${PF.esc(st.title)}`,
    `<form data-form="block" data-id="${PF.esc(id)}" id="blockForm" class="stack"><div class="field"><label for="blockReason">Motivo do bloqueio</label><textarea class="textarea" id="blockReason" name="reason" rows="3" maxlength="400" required placeholder="Ex.: aguardando liberação de acesso, dependência de outra área…"></textarea><span class="hint">O status do fluxo (${PF.esc(st.status)}) é mantido. Bloqueio é um atributo, não uma etapa.</span></div></form>`,
    `<div class="modal__foot-right"><button type="button" class="btn btn-tertiary" data-action="close-overlay">Cancelar</button><button type="submit" form="blockForm" class="btn btn-primary">Bloquear</button></div>`)});
}

/* exporta para os demais módulos */
Object.assign(PF, {scheduleInconsistencies, lifecycleOf, isSuspended, storySquadOf, squadBreakdown, setScope, getReferenceDate, getSprintForDate, getCurrentSprint, completionSprintId, calculateLeadTime, calculateCurrentLeadTime, leadTimeOf, calculateProgress, calculateStoryDistribution, calculateForecastVariance, calculateActualVariance, isReprogrammed, fmtDeltaDays, deltaKind, deliveryTrail, deliveryTooltip, recordDeliveryChange, calculateScheduleVariance, calculateDeadlineStatus, getInitiativeMetrics, isCarryOver, calculateCarryOver, calculateThroughput, getSprintMetrics, calculateUpcomingDeliveries, getAttentionItems, getPortfolioMetrics, buildHeadline, computeContext, validateData, qualityScore, FILTER_DEFS, PRIMARY_FILTERS, MORE_FILTERS, filterInitiatives, activeFilterCount, setFilter, clearFilters, applyStatusTransition, findStory, changeStoryStatus, changeStorySprint, toggleBlock});
})();
