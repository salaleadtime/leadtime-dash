/* SALA Lead Time — aba Portfólio · pf-export.js
   modelo de exportação e geração do PowerPoint executivo (PptxGenJS sob demanda).
   Módulo clássico (IIFE): nada vaza para o escopo global de index.html além de
   window.SalaPortfolio. Nomes compartilhados entre módulos ficam em PF (namespace interno).
   Ordem de carga: pf-core.js → pf-metrics.js → pf-state.js → pf-import.js → pf-export.js → pf-views.js → pf-panels.js → pf-app.js. */
(function(){
'use strict';
const SP = window.SalaPortfolio = window.SalaPortfolio || {};
const PF = SP.internal = SP.internal || {};

/* =====================================================================
   MODELO DE EXPORTAÇÃO (PowerPoint) — consome o motor, nunca o DOM.
   Não altera estado, filtros, tema nem preferências.
   ===================================================================== */
const portfolioTitle = () => `Iniciativas ${String(PF.ctx && PF.ctx.today || PF.localTodayISO()).slice(0,4)}`;
const PPT_SLIDE_TYPES = [
  {id:'executive', label:'Onde estamos', hint:'Situação de prazo, próximas entregas e fases'},
  {id:'attention', label:'Atenção executiva', hint:'Iniciativas que exigem decisão ou acompanhamento'},
  {id:'timeline', label:'Cronograma de entregas', hint:'Planejado, reprogramado e realizado em escala de tempo'},
  {id:'portfolio', label:'Portfólio de iniciativas', hint:'Tabela executiva, paginada quando necessário'},
  {id:'risks', label:'Riscos, reprogramações e decisões', hint:'Incluído somente quando houver itens'},
  {id:'sprint', label:'Sprint atual', hint:'Execução, capacidade e throughput'}
];
const PPT_DEFAULT_SLIDES = ['executive','attention','timeline','portfolio','risks'];
const PPT_ROWS = {portfolio:6, timeline:12, attention:7};
function describeFilters(){
  const parts = Object.keys(PF.prefs.filters).filter(k => PF.prefs.filters[k]).map(k => {
    const v = PF.prefs.filters[k]; if(k === 'q') return `Busca: “${v}”`;
    const d = PF.FILTER_DEFS[k]; return `${d.label}: ${d.fmt ? d.fmt(v) : v}`; });
  return parts.length ? parts.join(' · ') : 'Sem filtros';
}
function lastObservation(i){
  const log = [...(i.notesLog || [])].sort((a,b) => a.ts < b.ts ? 1 : -1)[0];
  if(log) return {text:log.text, date:log.ts.slice(0,10)};
  if(i.notes) return {text:i.notes, date:PF.appState.metadata.sourceCut || null};
  return null;
}
function buildExportModel({slides = PPT_DEFAULT_SLIDES, scope = 'all', detailIds = []} = {}){
  PF.ctx = PF.computeContext();
  /* PowerPoint é operacional: só iniciativas ATIVAS (suspensa = cancelada fica fora, mencionada à parte). */
  const inits = scope === 'filtered' ? PF.filterInitiatives('active') : PF.appState.initiatives.filter(i => !PF.isSuspended(i));
  const ordered = PF.sortInitiatives(inits, {col:'deadline', dir:'asc'});
  const pm = PF.getPortfolioMetrics(inits, PF.ctx);
  const md = PF.appState.metadata;
  const model = {
    generatedAt:new Date().toISOString(), referenceDate:PF.ctx.today, scope,
    filters: scope === 'filtered' ? {...PF.prefs.filters} : null,
    scopeText: scope === 'filtered' ? describeFilters() : 'Portfólio completo',
    source: md.source || null, sourceCut: md.sourceCut || null, title:portfolioTitle(), count:inits.length, slides:[]
  };
  model.slides.push({type:'cover', title:portfolioTitle()});
  if(slides.includes('executive')){
    const phases = PF.FILTER_DEFS.phase.options().map(ph => { const arr = inits.filter(i => i.phase === ph); const by = {}; arr.forEach(i => { const m = PF.ctx.initMetrics.get(i.id); by[m.deadline.status] = (by[m.deadline.status] || 0) + 1; }); return {phase:ph, total:arr.length, byStatus:by}; }).filter(p => p.total);
    model.slides.push({
      type:'executive', title:'Onde estamos',
      kpis:{registered:pm.registered, active:pm.active, suspended:pm.suspendedAll, ok:pm.byStatus.ok, attention:pm.byStatus.attention, replanned:pm.byStatus.replanned, late:pm.byStatus.late, none:pm.byStatus.none, done:pm.byStatus.done},
      headline: PF.buildHeadline(pm, inits, PF.ctx).replace(/<[^>]+>/g,''),
      attention: PF.getAttentionItems(inits, PF.ctx).slice(0,5).map(a => ({id:a.init.id, name:a.init.name, category:a.signals[0].cat, reason:a.signals[0].text, owners:a.init.owners})),
      upcoming: PF.calculateUpcomingDeliveries(inits, 60, PF.ctx).map(u => ({date:u.m.deadline.target, id:u.init.id, name:u.init.name, status:u.m.deadline.status, tone:PF.displayTone(u.init, u.m.deadline.status), risk:u.init.risk})),
      phases
    });
  }
  if(slides.includes('attention')){
    const items = PF.getAttentionItems(inits, PF.ctx);
    model.slides.push({type:'attention', title:'Quais iniciativas exigem atenção', total:items.length,
      items: items.map(a => ({id:a.init.id, name:a.init.name, squads:a.init.squads.join(' + '), status:a.m.deadline.status, tone:PF.displayTone(a.init, a.m.deadline.status), severity:a.sev,
        category:a.signals[0].cat, reason:a.signals[0].text, others:a.signals.slice(1).map(x => `${x.cat}: ${x.text}`), owners:a.init.owners}))});
  }
  if(slides.includes('timeline')){
    model.slides.push({type:'timeline', title:'Como está o cronograma de entregas',
      rows: ordered.map(i => { const m = PF.ctx.initMetrics.get(i.id); return {id:i.id, name:i.name, squads:i.squads.join(' + '), phase:i.phase, status:m.deadline.status, tone:PF.displayTone(i, m.deadline.status),
        discoveryStart:i.discoveryStart, discoveryEnd:i.discoveryEnd, devStart:i.devActual || i.devPlanned, devIsActual:!!i.devActual,
        planned:i.deliveryPlanned, current:PF.isReprogrammed(i) ? i.deliveryCurrent : null, actual:i.deliveryActual, forecastVariance:m.variance.forecast, actualVariance:m.variance.actual}; })});
  }
  if(slides.includes('portfolio')) model.slides.push({
    type:'portfolio', title:'Portfólio de iniciativas',
    rows: ordered.map(i => { const m = PF.ctx.initMetrics.get(i.id); return {
      id:i.id, name:i.name, squads:i.squads.join(' + '), phase:i.phase, status:m.deadline.status, displayTone:PF.displayTone(i, m.deadline.status), toneOverride:!!i.deadlineColorOverride, target:m.deadline.target, owners:i.owners,
      forecastVariance:m.variance.forecast, actualVariance:m.variance.actual, plannedDelivery:i.deliveryPlanned, currentDelivery:i.deliveryCurrent, actualDelivery:i.deliveryActual,
      progress:m.progress, done:m.dist.done, stories:m.dist.total, blocked:m.dist.blocked, risk:i.risk, observation:lastObservation(i)}; })
  });
  if(slides.includes('risks')){
    const risks = ordered.filter(i => ['Alto','Crítico'].includes(i.risk) && PF.ctx.initMetrics.get(i.id).deadline.status !== 'done').sort((a,b) => PF.RISKS.indexOf(b.risk) - PF.RISKS.indexOf(a.risk)).map(i => ({id:i.id, name:i.name, risk:i.risk, cause:i.cause}));
    const reprog = ordered.filter(i => PF.isReprogrammed(i)).map(i => ({id:i.id, name:i.name, trail:PF.deliveryTrail(i), variance:PF.calculateForecastVariance(i), actual:i.deliveryActual}));
    const decisions = ordered.filter(i => i.situation === 'Aguardando negócio').map(i => ({id:i.id, name:i.name, cause:i.cause, owners:i.owners}));
    if(risks.length || reprog.length || decisions.length) model.slides.push({type:'risks', title:'Riscos, reprogramações e decisões', risks, reprog, decisions});
  }
  if(slides.includes('sprint') && PF.ctx.currentSprint){
    const stories = inits.flatMap(i => PF.ctx.initMetrics.get(i.id).stories);
    const sm = PF.getSprintMetrics(PF.ctx.currentSprint, PF.ctx, stories);
    const cap = PF.calculateSprintCapacity(PF.ctx.currentSprint, PF.appState.absences, PF.ctx.today);
    model.slides.push({
      type:'sprint', title:`${PF.ctx.currentSprint.name} · ${PF.fmtDayMonth(sm.sprint.start)} – ${PF.fmtDayMonth(sm.sprint.end)}`,
      sprint:{id:sm.sprint.id, name:sm.sprint.name, start:sm.sprint.start, end:sm.sprint.end, elapsedDays:sm.elapsedDays, totalDays:sm.totalDays,
        planned:sm.planned.length, scope:sm.scope.length, done:sm.completed.length, inDev:sm.inDev.length, inHomolog:sm.inHomolog.length,
        blocked:sm.blocked.length, carryIn:sm.carryIn.length, carryOut:sm.carryOut.length, progress:sm.progress, leadTimeAvg:sm.leadTimeAvg, throughput:sm.throughput,
        capacity:{workingDays:cap.workingDays, workingDaysTheoretical:cap.workingDaysTheoretical, holidays:cap.calendar.holidays, members:cap.members, totalHours:cap.totalHours, theoreticalHours:cap.theoreticalHours}},
      history: PF.ctx.sprints.filter(sp => sp.start <= PF.ctx.today).slice(-8).map(sp => { const x = PF.getSprintMetrics(sp, PF.ctx, stories); return {id:sp.id, planned:x.planned.length, done:x.throughput, carryOut:x.carryOut.length, leadTimeAvg:x.leadTimeAvg}; })
    });
  }
  detailIds.forEach(id => { const i = PF.ctx.initById.get(id); if(!i) return; const m = PF.ctx.initMetrics.get(id);
    model.slides.push({type:'initiative', title:`${i.id} · ${i.name}`, initiative:{...i, notesLog:undefined, deliveryHistory:undefined}, observation:lastObservation(i),
      metrics:{status:m.deadline.status, tone:PF.displayTone(i, m.deadline.status), reasons:m.deadline.reasons, dist:m.dist.byStatus, total:m.dist.total, blocked:m.dist.blocked, progress:m.progress, variance:m.variance, trail:PF.deliveryTrail(i)}}); });
  return model;
}

/* =====================================================================
   PRÉVIA DE EXPORTAÇÃO POWERPOINT
   ===================================================================== */
/* =====================================================================
   GERAÇÃO DO POWERPOINT (PptxGenJS, carregado sob demanda)
   Tema executivo fixo e claro — independe do tema escolhido na tela.
   ===================================================================== */
const PPTX_SOURCES = ['vendor/pptxgen.bundle.js','https://cdnjs.cloudflare.com/ajax/libs/pptxgenjs/3.12.0/pptxgen.bundle.js','https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js'];
PF.pptxPromise = null;
function loadPptxGen(){
  if(window.PptxGenJS) return Promise.resolve(window.PptxGenJS);
  if(PF.pptxPromise) return PF.pptxPromise;
  PF.pptxPromise = PF.loadScriptChain(PPTX_SOURCES, () => window.PptxGenJS).catch(e => { PF.pptxPromise = null; throw new Error('Não foi possível carregar o gerador de PowerPoint (verifique a conexão ou o bloqueio de CDN pela rede).'); });
  return PF.pptxPromise;
}
const PX = {W:13.333, H:7.5, M:0.5, F:'Calibri'};
function pptPalette(){
  const hx = h => String(h).replace('#','').toUpperCase();
  const brand = hx(PF.prefs.colors.primary), graphite = hx(PF.prefs.colors.secondary);
  return {
    brand, graphite, onBrand: hx(PF.contrastOn(PF.prefs.colors.primary)),
    ink:'111827', ink2:'475467', muted:'667085', faint:'98A2B3', line:'E3E7EE', grid:'EEF1F5', band:'F5F7FA', headFill:'EEF2F7', headInk:'2B3A4F',
    tone:{green:{fill:'127A55', soft:'E6F4EE', ink:'0C5C40'}, yellow:{fill:'B25E00', soft:'FDF2E1', ink:'7A4100'}, red:{fill:'C8281C', soft:'FCEBE9', ink:'9B1F16'},
      neutral:{fill:'7A8394', soft:'EEF0F3', ink:'3F4A5C'}, blue:{fill:'2F5FB3', soft:'EAF0FA', ink:'23488A'}},
    bar:{green:'35588A', yellow:'B25E00', red:'C8281C', neutral:'7A8394', blue:'2F5FB3'}, barNone:'B8C0CC', disc:'D5DCE7', late:'B8561B', early:'2F6DB3', done:'183A66'
  };
}
const TONE_OF_STATUS = s => PF.AUTO_TONE[s];
function pT(slide, text, o){ slide.addText(text, {fontFace:PX.F, margin:0, isTextBox:true, valign:'top', color:'111827', ...o}); }
function pR(pres, slide, o){ slide.addShape(pres.ShapeType.rect, o); }
function pL(pres, slide, x, y, w, h, color, width = 0.75, dash){ slide.addShape(pres.ShapeType.line, {x, y, w, h, line:{color, width, ...(dash ? {dashType:dash} : {})}}); }
function ownersText(owners){ return (owners || []).map(o => o.name + (o.area ? ` (${o.area})` : '')).join(', '); }
function clip(t, n){ t = String(t || ''); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; }

function pptChrome(pres, slide, P, meta, {kicker, title, subtitle, page, total}){
  slide.background = {color:'FFFFFF'};
  pR(pres, slide, {x:PX.W - PX.M - 0.26, y:0.42, w:0.26, h:0.26, fill:{color:P.brand}, line:{color:P.brand, width:0}});
  pT(slide, 'LT', {x:PX.W - PX.M - 0.26, y:0.42, w:0.26, h:0.26, fontSize:8, bold:true, color:P.onBrand, align:'center', valign:'middle'});
  pT(slide, 'SALA · Lead Time', {x:PX.W - PX.M - 2.45, y:0.45, w:2.05, h:0.2, fontSize:9.5, color:P.muted, align:'right'});
  pT(slide, kicker, {x:PX.M, y:0.44, w:8, h:0.22, fontSize:10.5, bold:true, color:P.brand});
  pT(slide, title, {x:PX.M, y:0.72, w:PX.W - 2*PX.M, h:0.52, fontSize:26, bold:true, color:P.ink});
  if(subtitle) pT(slide, subtitle, {x:PX.M, y:1.26, w:PX.W - 2*PX.M - 0.6, h:0.44, fontSize:12.5, color:P.ink2});
  pT(slide, meta.footer, {x:PX.M, y:PX.H - 0.42, w:10.6, h:0.22, fontSize:8.5, color:P.muted});
  pT(slide, `${page} / ${total}`, {x:PX.W - PX.M - 1, y:PX.H - 0.42, w:1, h:0.22, fontSize:8.5, color:P.muted, align:'right'});
}
function toneSquare(pres, slide, P, tone, x, y, s = 0.12){ const c = (P.tone[tone] || P.tone.neutral).fill; pR(pres, slide, {x, y, w:s, h:s, fill:{color:c}, line:{color:c, width:0}}); }

/* ---------- slides ---------- */
function pptCover(pres, slide, P, model){
  slide.background = {color:P.graphite};
  pR(pres, slide, {x:PX.M + 0.1, y:0.62, w:0.34, h:0.34, fill:{color:P.brand}, line:{color:P.brand, width:0}});
  pT(slide, 'LT', {x:PX.M + 0.1, y:0.62, w:0.34, h:0.34, fontSize:10, bold:true, color:P.onBrand, align:'center', valign:'middle'});
  pT(slide, 'SALA · Lead Time', {x:PX.M + 0.58, y:0.66, w:4, h:0.28, fontSize:13, bold:true, color:'FFFFFF', valign:'middle'});
  pT(slide, 'Portfólio · visão executiva', {x:PX.M + 0.1, y:2.35, w:10, h:0.36, fontSize:16, color:'C3CCD8'});
  pT(slide, model.title, {x:PX.M + 0.1, y:2.75, w:11, h:0.95, fontSize:46, bold:true, color:'FFFFFF'});
  pT(slide, 'Situação de prazos, entregas, riscos e decisões', {x:PX.M + 0.1, y:3.72, w:11, h:0.4, fontSize:17, color:'DDE3EB'});
  const cols = [
    ['Data de referência', PF.fmtDateFull(model.referenceDate)],
    ['Escopo', `${PF.plural(model.count,'iniciativa','iniciativas')} · ${model.scope === 'filtered' ? 'visão filtrada' : 'portfólio completo'}`],
    ['Fonte', model.source ? `${model.source}${model.sourceCut ? ` · corte ${PF.fmtDateFull(model.sourceCut)}` : ''}` : 'Base do painel']
  ];
  cols.forEach(([k,v], n) => { const x = PX.M + 0.1 + n * 4.1;
    pT(slide, k, {x, y:5.55, w:3.8, h:0.24, fontSize:10.5, color:'A7B2C1'});
    pT(slide, v, {x, y:5.82, w:3.8, h:0.5, fontSize:13.5, color:'FFFFFF', bold:true}); });
  if(model.scope === 'filtered') pT(slide, `Filtros aplicados: ${model.scopeText}`, {x:PX.M + 0.1, y:6.45, w:12, h:0.26, fontSize:10.5, color:'C3CCD8'});
}
function pptExecutive(pres, slide, P, s){
  const k = s.kpis;
  const cells = [
    {label:'Iniciativas ativas', value:k.active, hint: `${k.registered} cadastradas${k.suspended ? ` · ${k.suspended} suspensa${k.suspended > 1 ? 's' : ''}` : ''}`, tone:null},
    {label:'No prazo', value:k.ok, tone:'green'}, {label:'Atenção', value:k.attention, tone:'yellow'}, {label:'Replanejadas', value:k.replanned, tone:'blue'},
    {label:'Atrasadas', value:k.late, tone:'red'}, {label:'Sem previsão', value:k.none, tone:'neutral'}, {label:'Entregues', value:k.done, tone:'green'}
  ];
  const y = 1.95, h = 1.3, W = PX.W - 2*PX.M, first = 2.35, cw = (W - first) / (cells.length - 1);
  pR(pres, slide, {x:PX.M, y, w:W, h, fill:{color:P.band}, line:{color:P.band, width:0}});
  const base = Math.max(1, k.active);
  cells.forEach((c, n) => {
    const x = n === 0 ? PX.M : PX.M + first + (n - 1) * cw, w = n === 0 ? first : cw;
    if(n > 0) pL(pres, slide, x, y + 0.2, 0, h - 0.4, 'DCE2EA');
    const ix = x + 0.25;
    if(c.tone){ toneSquare(pres, slide, P, c.tone, ix, y + 0.3); pT(slide, c.label, {x:ix + 0.2, y:y + 0.24, w:w - 0.5, h:0.24, fontSize:11.5, color:P.ink2}); }
    else pT(slide, c.label, {x:ix, y:y + 0.24, w:w - 0.4, h:0.24, fontSize:11.5, color:P.ink2, bold:true});
    pT(slide, String(c.value), {x:ix, y:y + 0.5, w:w - 0.4, h:0.5, fontSize:n === 0 ? 32 : 28, bold:true, color:P.ink});
    pT(slide, c.tone ? `${Math.round(c.value / base * 100)}% das ativas` : c.hint, {x:ix, y:y + 0.98, w:w - 0.4, h:0.22, fontSize:10.5, color:P.muted});
  });
  // barra de composição
  const order = [['ok','green'],['attention','yellow'],['replanned','blue'],['late','red'],['none','neutral'],['done','green']];
  let bx = PX.M; const tot = order.reduce((a,[st]) => a + (k[st] || 0), 0) || 1;
  order.forEach(([st, t]) => { const n = k[st] || 0; if(!n) return; const w = n / tot * W - 0.03;
    const c = st === 'none' ? P.barNone : P.tone[t].fill; pR(pres, slide, {x:bx, y:y + h + 0.16, w, h:0.12, fill:{color:c}, line:{color:c, width:0}}); bx += w + 0.03; });
  // próximas entregas
  const ly = 3.85, lw = 6.1;
  pT(slide, 'Próximas entregas · 60 dias', {x:PX.M, y:ly, w:lw, h:0.3, fontSize:14, bold:true, color:P.ink});
  const up = s.upcoming.slice(0, 6);
  if(!up.length) pT(slide, 'Nenhuma entrega prevista nos próximos 60 dias.', {x:PX.M, y:ly + 0.45, w:lw, h:0.3, fontSize:12, color:P.muted});
  up.forEach((u, n) => { const ry = ly + 0.45 + n * 0.42;
    pL(pres, slide, PX.M, ry - 0.06, lw, 0, P.grid);
    pT(slide, PF.fmtDayMonth(u.date), {x:PX.M, y:ry, w:0.7, h:0.3, fontSize:12.5, bold:true, color:P.ink});
    pT(slide, [{text:u.id + '  ', options:{color:P.muted, fontSize:10.5}}, {text:clip(u.name, 44), options:{color:P.ink, fontSize:11.5}}], {x:PX.M + 0.75, y:ry + 0.02, w:4.0, h:0.3});
    toneSquare(pres, slide, P, u.tone, PX.M + 4.85, ry + 0.09, 0.11);
    pT(slide, PF.DEADLINE_META[u.status].label, {x:PX.M + 5.02, y:ry + 0.03, w:1.1, h:0.26, fontSize:10.5, color:P.tone[u.tone].ink, bold:true}); });
  if(s.upcoming.length > 6) pT(slide, `+${s.upcoming.length - 6} entregas no período`, {x:PX.M, y:ly + 0.45 + 6 * 0.42, w:lw, h:0.24, fontSize:10.5, color:P.muted});
  // fases
  const rx = PX.M + 6.6, rw = PX.W - PX.M - rx;
  pT(slide, 'Onde estão no ciclo', {x:rx, y:ly, w:rw, h:0.3, fontSize:14, bold:true, color:P.ink});
  const max = Math.max(1, ...s.phases.map(p => p.total)), bw = rw - 2.3;
  s.phases.slice(0, 7).forEach((p, n) => { const ry = ly + 0.5 + n * 0.37;
    pT(slide, p.phase, {x:rx, y:ry, w:1.9, h:0.26, fontSize:11, color:P.ink2});
    let x = rx + 1.95;
    [['ok','green'],['attention','yellow'],['late','red'],['none','neutral'],['suspended','neutral'],['done','blue']].forEach(([st, t]) => { const v = p.byStatus[st] || 0; if(!v) return;
      const w = v / max * bw; const c = st === 'none' ? P.barNone : P.tone[t].fill; pR(pres, slide, {x, y:ry + 0.05, w:Math.max(0.04, w - 0.02), h:0.17, fill:{color:c}, line:{color:c, width:0}}); x += w; });
    pT(slide, String(p.total), {x:x + 0.08, y:ry, w:0.35, h:0.26, fontSize:11, bold:true, color:P.ink}); });
}
function pptTableHeader(P, labels, aligns = []){
  return labels.map((l, n) => ({text:l, options:{bold:true, color:P.headInk, fill:{color:P.headFill}, fontSize:9.5, align:aligns[n] || 'left', valign:'middle',
    border:[{type:'none'},{type:'none'},{pt:1, color:'D3DBE6'},{type:'none'}]}}));
}
const PPT_ROW_BORDER = [{type:'none'},{type:'none'},{pt:0.75, color:'E3E7EE'},{type:'none'}];
function statusCell(P, status, tone){ const t = P.tone[tone] || P.tone.neutral; return {text:PF.DEADLINE_META[status].label, options:{bold:true, color:t.ink, fill:{color:t.soft}, fontSize:10, valign:'middle', border:PPT_ROW_BORDER}}; }
function pptAttention(pres, slide, P, s, items){
  if(!items.length){ pT(slide, 'Nenhuma exceção no recorte exportado.', {x:PX.M, y:2.1, w:8, h:0.4, fontSize:14, color:P.muted}); return; }
  const cell = (text, o = {}) => ({text, options:{fontSize:10.5, color:P.ink, valign:'middle', border:PPT_ROW_BORDER, ...o}});
  const rows = [pptTableHeader(P, ['Prazo','Iniciativa','Sinal principal','Responsável'])];
  items.forEach(a => rows.push([
    statusCell(P, a.status, a.tone),
    {text:[{text:a.id, options:{color:P.muted, fontSize:9.5, breakLine:true}}, {text:clip(a.name, 60), options:{bold:true, color:P.ink, fontSize:11}}], options:{valign:'middle', border:PPT_ROW_BORDER}},
    {text:[{text:a.category, options:{bold:true, color:P.ink2, fontSize:9.5, breakLine:true}}, {text:clip(a.reason, 96), options:{color:P.ink, fontSize:10.5, breakLine: !!a.others.length}}, ...(a.others.length ? [{text:`+${PF.plural(a.others.length,'sinal','sinais')}: ${clip(a.others.join(' · '), 72)}`, options:{color:P.muted, fontSize:9}}] : [])], options:{valign:'middle', border:PPT_ROW_BORDER}},
    cell(clip(ownersText(a.owners), 70) || '—', {color:P.ink2, fontSize:10})
  ]));
  slide.addTable(rows, {x:PX.M, y:1.95, w:PX.W - 2*PX.M, colW:[1.25, 3.55, 5.23, 2.3], rowH:[0.36, ...items.map(() => 0.56)], fontFace:PX.F, margin:[0.05, 0.1, 0.05, 0.1], autoPage:false});
}
function pptTimeline(pres, slide, P, rows, axis){
  const labelW = 3.1, x0 = PX.M + labelW + 0.1, x1 = PX.W - PX.M, laneW = x1 - x0;
  const yAxis = 1.9, yRows = 2.35, rowH = 0.345, yEnd = yRows + rows.length * rowH;
  const span = PF.daysBetween(axis.start, axis.end);
  const X = d => x0 + Math.max(0, Math.min(span, PF.daysBetween(axis.start, d))) / span * laneW;
  const beyond = d => d && d > axis.end;
  // meses
  let m = axis.start;
  while(m < axis.end){ const x = X(m); const mm = +m.slice(5,7);
    pL(pres, slide, x, yRows - 0.05, 0, yEnd - yRows + 0.05, P.grid, 0.5);
    pT(slide, PF.MONTHS[mm - 1], {x:x + 0.04, y:yAxis + 0.2, w:0.6, h:0.2, fontSize:9, color:P.muted});
    if(mm === 1 || m === axis.start) pT(slide, m.slice(0,4), {x:x + 0.04, y:yAxis, w:0.6, h:0.2, fontSize:9, bold:true, color:P.ink2});
    const d = new Date(PF.isoToUTC(m)); d.setUTCMonth(d.getUTCMonth() + 1); m = PF.utcToISO(d.getTime()); }
  pL(pres, slide, PX.M, yRows - 0.05, PX.W - 2*PX.M, 0, 'D3DBE6', 0.75);
  // linhas
  rows.forEach((r, n) => { const y = yRows + n * rowH, cy = y + rowH / 2;
    if(n) pL(pres, slide, PX.M, y, PX.W - 2*PX.M, 0, P.grid, 0.5);
    pT(slide, [{text:r.id + '  ', options:{color:P.muted, fontSize:9}}, {text:clip(r.name, 36), options:{bold:true, color:P.ink, fontSize:10}}], {x:PX.M, y:y + 0.03, w:labelW - 0.25, h:0.18});
    pT(slide, `${clip(r.squads, 22)} · ${r.phase}`, {x:PX.M, y:y + 0.19, w:labelW - 0.25, h:0.15, fontSize:8, color:P.muted});
    toneSquare(pres, slide, P, r.tone, PX.M + labelW - 0.13, cy - 0.05, 0.1);
    if(r.discoveryStart && r.discoveryEnd && r.discoveryEnd >= axis.start && r.discoveryStart <= axis.end){ const a = X(r.discoveryStart), b = X(r.discoveryEnd);
      pR(pres, slide, {x:a, y:cy - 0.045, w:Math.max(0.03, b - a), h:0.09, fill:{color:P.disc}, line:{color:'AEBCD2', width:0.5}}); }
    const main = r.actual || r.current || r.planned;
    const barEnd = main || (r.devStart ? PF.addDays(r.devStart, 30) : null);
    if(r.devStart && barEnd && barEnd > r.devStart){ const a = X(r.devStart), b = X(barEnd);
      const c = r.status === 'none' && r.tone === 'neutral' ? P.barNone : r.actual ? P.done : (P.bar[r.tone] || P.bar.green);
      pR(pres, slide, {x:a, y:cy - 0.07, w:Math.max(0.03, b - a), h:0.14, fill:{color:c}, line:{color:c, width:0}}); }
    const dia = (d, o) => { const s = o.size || 0.17; slide.addShape(pres.ShapeType.diamond, {x:X(d) - s/2, y:cy - s/2, w:s, h:s, ...o.shape}); };
    if(r.planned && main && r.planned !== main){ const a = X(r.planned), b = X(main);
      pL(pres, slide, Math.min(a,b), cy, Math.abs(b - a), 0, main > r.planned ? P.late : P.early, 1, 'sysDot');
      dia(r.planned, {size:0.14, shape:{fill:{color:'FFFFFF'}, line:{color:'7A8394', width:1, dashType:'sysDash'}}}); }
    if(r.actual && r.current && r.current !== r.actual) dia(r.current, {size:0.12, shape:{fill:{color:'FFFFFF'}, line:{color:'98A2B3', width:1}}});
    if(main) dia(main, {size:0.18, shape:r.actual ? {fill:{color:'1F2733'}, line:{color:'1F2733', width:1}} : {fill:{color:'FFFFFF'}, line:{color:'1F2733', width:1.5}}});
    if(beyond(main)) pT(slide, `→ ${PF.fmtDate(main)}`, {x:x1 - 0.85, y:cy - 0.2, w:0.8, h:0.16, fontSize:8, color:P.ink2, align:'right'});
  });
  // hoje
  if(axis.today >= axis.start && axis.today <= axis.end){ const tx = X(axis.today);
    pL(pres, slide, tx, yRows - 0.05, 0, yEnd - yRows + 0.05, P.brand, 1.25);
    pT(slide, `Hoje ${PF.fmtDayMonth(axis.today)}`, {x:tx + 0.05, y:yAxis - 0.02, w:1, h:0.17, fontSize:8.5, bold:true, color:P.brand}); }
  // legenda
  const ly = PX.H - 0.82; let lx = PX.M;
  const item = (draw, label, w) => { draw(lx, ly); pT(slide, label, {x:lx + 0.24, y:ly - 0.02, w:w, h:0.2, fontSize:9, color:P.ink2}); lx += w + 0.42; };
  item((x,y) => pR(pres, slide, {x, y:y + 0.04, w:0.18, h:0.08, fill:{color:P.disc}, line:{color:'AEBCD2', width:0.5}}), 'Discovery', 0.65);
  item((x,y) => pR(pres, slide, {x, y:y + 0.03, w:0.18, h:0.11, fill:{color:P.bar.green}, line:{color:P.bar.green, width:0}}), 'Em andamento', 0.9);
  item((x,y) => pR(pres, slide, {x, y:y + 0.03, w:0.18, h:0.11, fill:{color:P.bar.yellow}, line:{color:P.bar.yellow, width:0}}), 'Atenção', 0.55);
  item((x,y) => pR(pres, slide, {x, y:y + 0.03, w:0.18, h:0.11, fill:{color:P.bar.red}, line:{color:P.bar.red, width:0}}), 'Atrasada', 0.6);
  item((x,y) => pR(pres, slide, {x, y:y + 0.03, w:0.18, h:0.11, fill:{color:P.done}, line:{color:P.done, width:0}}), 'Entregue', 0.6);
  item((x,y) => slide.addShape(pres.ShapeType.diamond, {x:x + 0.02, y:y, w:0.15, h:0.15, fill:{color:'FFFFFF'}, line:{color:'1F2733', width:1.25}}), 'Entrega vigente', 1.0);
  item((x,y) => slide.addShape(pres.ShapeType.diamond, {x:x + 0.02, y:y, w:0.15, h:0.15, fill:{color:'FFFFFF'}, line:{color:'7A8394', width:1, dashType:'sysDash'}}), 'Planejada original', 1.15);
  item((x,y) => slide.addShape(pres.ShapeType.diamond, {x:x + 0.02, y:y, w:0.15, h:0.15, fill:{color:'1F2733'}, line:{color:'1F2733', width:1}}), 'Entrega realizada', 1.1);
  item((x,y) => pL(pres, slide, x + 0.09, y - 0.02, 0, 0.2, P.brand, 1.25), 'Hoje', 0.4);
}
function pptPortfolio(pres, slide, P, rows){
  const b = PPT_ROW_BORDER;
  const cell = (text, o = {}) => ({text, options:{fontSize:10, color:P.ink, valign:'middle', border:b, ...o}});
  const head = pptTableHeader(P, ['Iniciativa','Fase','Prazo','Ent. planejada','Ent. atual','Ent. real','Progresso','Responsável','Observação'], ['left','left','left','left','left','left','right','left','left']);
  const body = rows.map(r => {
    const reprog = r.currentDelivery && r.currentDelivery !== r.plannedDelivery;
    const fv = r.forecastVariance;
    return [
      {text:[{text:`${r.id} · ${clip(r.squads, 24)}`, options:{color:P.muted, fontSize:8.5, breakLine:true}}, {text:clip(r.name, 54), options:{bold:true, color:P.ink, fontSize:10}}], options:{valign:'middle', border:b}},
      cell(r.phase, {color:P.ink2, fontSize:9.5}),
      statusCell(P, r.status, r.displayTone),
      cell(r.plannedDelivery ? PF.fmtDate(r.plannedDelivery) : '—'),
      reprog ? {text:[{text:PF.fmtDate(r.currentDelivery), options:{color:P.ink, fontSize:10, breakLine:true}}, {text:PF.fmtDeltaDays(fv), options:{color:fv > 0 ? P.late : fv < 0 ? P.early : P.muted, fontSize:8.5, bold:true}}], options:{valign:'middle', border:b}}
             : cell(r.plannedDelivery ? '= planejada' : '—', {color:P.muted, fontSize:9}),
      r.actualDelivery ? {text:[{text:PF.fmtDate(r.actualDelivery), options:{color:P.ink, fontSize:10, breakLine:true}}, {text:PF.fmtDeltaDays(r.actualVariance), options:{color:r.actualVariance > 0 ? P.late : r.actualVariance < 0 ? P.early : P.tone.green.ink, fontSize:8.5, bold:true}}], options:{valign:'middle', border:b}} : cell('—', {color:P.muted}),
      cell(r.progress == null ? '—' : `${r.progress}%`, {align:'right', bold: r.progress != null, color:r.progress == null ? P.muted : P.ink}),
      cell(clip(ownersText(r.owners), 48) || '—', {color:P.ink2, fontSize:9.5}),
      r.observation ? {text:[{text:clip(r.observation.text, 92), options:{color:P.ink2, fontSize:9, breakLine: !!r.observation.date}}, ...(r.observation.date ? [{text:`atualizado em ${PF.fmtDate(r.observation.date)}`, options:{color:P.faint, fontSize:8}}] : [])], options:{valign:'middle', border:b}} : cell('—', {color:P.muted})
    ];
  });
  slide.addTable([head, ...body], {x:PX.M, y:1.95, w:PX.W - 2*PX.M, colW:[2.6, 1.1, 1.0, 1.08, 0.92, 0.82, 0.8, 1.45, 2.56], rowH:[0.4, ...body.map(() => 0.62)], fontFace:PX.F, margin:[0.04, 0.08, 0.04, 0.08], autoPage:false});
}
function pptRisks(pres, slide, P, s){
  const cols = [
    {title:'Riscos altos e críticos', items:s.risks.map(r => ({head:`${r.id} · ${clip(r.name, 30)}`, tag:r.risk, tagColor:r.risk === 'Crítico' ? P.tone.red.ink : P.late, body:r.cause || 'Sem causa registrada'}))},
    {title:'Reprogramações de entrega', items:s.reprog.map(r => ({head:`${r.id} · ${clip(r.name, 40)}`, trail:r.trail, variance:r.variance, actual:r.actual}))},
    {title:'Decisões pendentes da gestão', items:s.decisions.map(r => ({head:`${r.id} · ${clip(r.name, 40)}`, body:`${r.cause || 'Aguardando área de negócio'}${r.owners.length ? ` · ${ownersText(r.owners)}` : ''}`}))}
  ];
  const gap = 0.3, cw = (PX.W - 2*PX.M - 2*gap) / 3;
  cols.forEach((c, n) => { const x = PX.M + n * (cw + gap), y = 1.95;
    pR(pres, slide, {x, y, w:cw, h:0.4, fill:{color:P.headFill}, line:{color:P.headFill, width:0}});
    pT(slide, [{text:c.title, options:{bold:true, color:P.headInk, fontSize:12}}, {text:`   ${c.items.length}`, options:{color:P.muted, fontSize:11}}], {x:x + 0.14, y:y + 0.1, w:cw - 0.28, h:0.22});
    if(!c.items.length) pT(slide, 'Nenhum item no recorte.', {x:x + 0.14, y:y + 0.6, w:cw - 0.28, h:0.3, fontSize:11, color:P.muted});
    c.items.slice(0, 6).forEach((it, k) => { const iy = y + 0.55 + k * 0.72;
      if(k) pL(pres, slide, x, iy - 0.08, cw, 0, P.grid);
      pT(slide, it.head, {x:x + 0.14, y:iy, w:cw - 0.28 - (it.tag ? 0.8 : 0), h:0.22, fontSize:11, bold:true, color:P.ink, fit:'shrink'});
      if(it.tag) pT(slide, it.tag, {x:x + cw - 0.9, y:iy, w:0.76, h:0.22, fontSize:10.5, bold:true, color:it.tagColor, align:'right'});
      if(it.trail){ const runs = it.trail.flatMap((d, j) => j < it.trail.length - 1 ? [{text:PF.fmtDateFull(d), options:{color:P.muted, strike:'sngStrike', fontSize:10}}, {text:'  →  ', options:{color:P.muted, fontSize:10}}] : [{text:PF.fmtDateFull(d), options:{color:P.ink, bold:true, fontSize:10}}]);
        runs.push({text:`   ${PF.fmtDeltaDays(it.variance)}`, options:{color:it.variance > 0 ? P.late : P.early, bold:true, fontSize:10}});
        pT(slide, runs, {x:x + 0.14, y:iy + 0.26, w:cw - 0.28, h:0.36}); }
      else pT(slide, clip(it.body, 120), {x:x + 0.14, y:iy + 0.26, w:cw - 0.28, h:0.38, fontSize:10, color:P.ink2}); });
    if(c.items.length > 6) pT(slide, `+${c.items.length - 6} no painel`, {x:x + 0.14, y:y + 0.55 + 6 * 0.72, w:cw - 0.28, h:0.22, fontSize:10, color:P.muted}); });
}
function pptSprint(pres, slide, P, s){
  const sp = s.sprint;
  const cells = [['Planejadas', sp.planned], ['Concluídas', sp.done], ['Em desenvolvimento', sp.inDev], ['Em homologação', sp.inHomolog], ['Bloqueadas', sp.blocked], ['Transbordos', sp.carryIn + sp.carryOut], ['Lead time médio', sp.leadTimeAvg == null ? '—' : `${sp.leadTimeAvg} d`]];
  const y = 1.95, h = 1.1, W = PX.W - 2*PX.M, cw = W / cells.length;
  pR(pres, slide, {x:PX.M, y, w:W, h, fill:{color:P.band}, line:{color:P.band, width:0}});
  cells.forEach(([l, v], n) => { const x = PX.M + n * cw; if(n) pL(pres, slide, x, y + 0.18, 0, h - 0.36, 'DCE2EA');
    pT(slide, l, {x:x + 0.2, y:y + 0.2, w:cw - 0.3, h:0.22, fontSize:10.5, color:P.ink2});
    pT(slide, String(v), {x:x + 0.2, y:y + 0.46, w:cw - 0.3, h:0.5, fontSize:24, bold:true, color:l === 'Bloqueadas' && v ? P.tone.red.ink : P.ink}); });
  const cy = 3.35;
  pT(slide, 'Throughput e transbordo por sprint', {x:PX.M, y:cy, w:7.4, h:0.3, fontSize:14, bold:true, color:P.ink});
  const labels = s.history.map(h => h.id);
  slide.addChart(pres.ChartType.bar, [{name:'Concluídas', labels, values:s.history.map(h => h.done)}, {name:'Transbordo', labels, values:s.history.map(h => h.carryOut)}], {
    x:PX.M, y:cy + 0.35, w:7.6, h:3.0, barDir:'col', barGrouping:'clustered', chartColors:[P.done, P.late], barGapWidthPct:60,
    showValue:true, dataLabelPosition:'outEnd', dataLabelFontSize:9, dataLabelColor:P.ink2, dataLabelFontFace:PX.F,
    catAxisLabelColor:P.muted, catAxisLabelFontSize:9, catAxisLabelFontFace:PX.F, valAxisHidden:true, valGridLine:{style:'none'}, catGridLine:{style:'none'},
    catAxisLineShow:false, showLegend:true, legendPos:'t', legendFontSize:9, legendFontFace:PX.F, legendColor:P.ink2 });
  const cx = PX.M + 8.1, cw2 = PX.W - PX.M - cx, c = sp.capacity;
  pT(slide, 'Capacidade da sprint', {x:cx, y:cy, w:cw2, h:0.3, fontSize:14, bold:true, color:P.ink});
  const rows = [['Dias úteis', `${c.workingDays} de ${c.workingDaysTheoretical}`], ['Pessoas', String(c.members)], ['Capacidade disponível', `${PF.fmtHours(c.totalHours)} h`], ['Capacidade teórica', `${PF.fmtHours(c.theoreticalHours)} h`]];
  rows.forEach(([k, v], n) => { const ry = cy + 0.5 + n * 0.42; pL(pres, slide, cx, ry - 0.07, cw2, 0, P.grid);
    pT(slide, k, {x:cx, y:ry, w:2.5, h:0.26, fontSize:11.5, color:P.ink2}); pT(slide, v, {x:cx + 2.5, y:ry, w:cw2 - 2.5, h:0.26, fontSize:12, bold:true, color:P.ink, align:'right'}); });
  const hy = cy + 0.5 + rows.length * 0.42 + 0.1;
  pT(slide, c.holidays.length ? c.holidays.map(h => `${PF.fmtDayMonth(h.date)} · ${h.name} (feriado nacional)`).join('\n') : 'Sem feriados nacionais no período', {x:cx, y:hy, w:cw2, h:0.6, fontSize:10.5, color:P.tone.blue.ink});
}
function pptInitiative(pres, slide, P, s){
  const i = s.initiative, m = s.metrics, t = P.tone[m.tone] || P.tone.neutral;
  pR(pres, slide, {x:PX.M, y:1.95, w:1.4, h:0.34, fill:{color:t.soft}, line:{color:t.soft, width:0}});
  pT(slide, PF.DEADLINE_META[m.status].label, {x:PX.M, y:1.95, w:1.4, h:0.34, fontSize:11, bold:true, color:t.ink, align:'center', valign:'middle'});
  pT(slide, m.reasons.join('\n'), {x:PX.M + 1.6, y:1.97, w:6.2, h:0.6, fontSize:11.5, color:P.ink2});
  const b = PPT_ROW_BORDER, cell = (text, o = {}) => ({text, options:{fontSize:10.5, color:P.ink, valign:'middle', border:b, ...o}});
  const trail = m.trail.length > 1 ? m.trail.flatMap((d, j) => j < m.trail.length - 1 ? [{text:PF.fmtDate(d), options:{strike:'sngStrike', color:P.muted, fontSize:10.5}}, {text:' → ', options:{color:P.muted, fontSize:10.5}}] : [{text:PF.fmtDate(d), options:{bold:true, color:P.ink, fontSize:10.5}}]) : null;
  const rows = [pptTableHeader(P, ['Marco','Planejado','Atual / realizado','Desvio']),
    [cell('Discovery'), cell(`${PF.fmtDate(i.discoveryStart)} → ${PF.fmtDate(i.discoveryEnd)}`), cell('—', {color:P.muted}), cell('—', {color:P.muted})],
    [cell('Início do DEV'), cell(PF.fmtDate(i.devPlanned)), cell(PF.fmtDate(i.devActual)), cell(m.variance.dev == null ? '—' : PF.fmtDeltaDays(m.variance.dev))],
    [cell('Entrega'), cell(PF.fmtDate(i.deliveryPlanned)), trail ? {text:trail, options:{valign:'middle', border:b}} : cell('sem reprogramação', {color:P.muted}), cell(m.variance.forecast == null || !trail ? '—' : PF.fmtDeltaDays(m.variance.forecast))],
    [cell('Entrega real'), cell(PF.fmtDate(i.deliveryPlanned)), cell(i.deliveryActual ? PF.fmtDate(i.deliveryActual) : 'não entregue', {color:i.deliveryActual ? P.ink : P.muted}), cell(m.variance.actual == null ? '—' : PF.fmtDeltaDays(m.variance.actual))]];
  slide.addTable(rows, {x:PX.M, y:2.85, w:7.3, colW:[1.6, 1.9, 2.5, 1.3], rowH:0.4, fontFace:PX.F, margin:[0.04, 0.1, 0.04, 0.1], autoPage:false});
  const rx = PX.M + 7.8, rw = PX.W - PX.M - rx;
  const facts = [['Squad', i.squads.join(' + ')], ['PO', i.po || '—'], ['Tech Lead', i.techLead || '—'], ['Responsável', ownersText(i.owners) || '—'], ['Fase', i.phase], ['Risco', i.risk || 'Não avaliado'], ['Histórias', m.total ? `${m.total} · ${m.progress}% concluídas · ${m.blocked} bloqueadas` : 'Sem histórias']];
  facts.forEach(([k, v], n) => { const y = 1.95 + n * 0.44; pL(pres, slide, rx, y - 0.06, rw, 0, P.grid);
    pT(slide, k, {x:rx, y, w:1.35, h:0.3, fontSize:10.5, color:P.muted}); pT(slide, clip(v, 70), {x:rx + 1.4, y, w:rw - 1.4, h:0.34, fontSize:11, color:P.ink}); });
  if(s.observation) pT(slide, [{text:'Última observação' + (s.observation.date ? ` · ${PF.fmtDate(s.observation.date)}` : ''), options:{bold:true, color:P.ink2, fontSize:10.5, breakLine:true}}, {text:clip(s.observation.text, 320), options:{color:P.ink, fontSize:11}}], {x:PX.M, y:5.1, w:PX.W - 2*PX.M, h:1.2});
}

/* Monta a apresentação a partir do modelo; retorna o nome do arquivo gerado. */
async function exportPptx(opts){
  const model = buildExportModel(opts);
  const PptxGen = await loadPptxGen();
  const pres = new PptxGen();
  pres.layout = 'LAYOUT_WIDE';
  pres.author = 'SALA Lead Time'; pres.company = 'SALA Lead Time'; pres.title = `${model.title} — ${PF.fmtDateFull(model.referenceDate)}`;
  pres.theme = {headFontFace:PX.F, bodyFontFace:PX.F};
  const P = pptPalette();
  const meta = {footer:`Referência ${PF.fmtDateFull(model.referenceDate)}${model.source ? ` · Fonte: ${model.source}${model.sourceCut ? ` (corte ${PF.fmtDateFull(model.sourceCut)})` : ''}` : ''} · ${model.scope === 'filtered' ? `Filtros: ${model.scopeText}` : 'Portfólio completo'}`};
  const specs = [];
  const chunk = (arr, n) => { if(!arr.length) return [[]]; const pages = Math.ceil(arr.length / n), size = Math.ceil(arr.length / pages); const out = []; for(let k = 0; k < arr.length; k += size) out.push(arr.slice(k, k + size)); return out; };
  const kick = 'Portfólio · ' + model.title;
  model.slides.forEach(s => {
    if(s.type === 'cover') specs.push({cover:true, draw:sl => pptCover(pres, sl, P, model)});
    else if(s.type === 'executive') specs.push({kicker:kick, title:s.title, subtitle:s.headline, draw:sl => pptExecutive(pres, sl, P, s)});
    else if(s.type === 'attention'){ const shown = s.items.slice(0, PPT_ROWS.attention);
      specs.push({kicker:kick, title:s.title, subtitle:s.total ? `${PF.plural(s.total,'exceção','exceções')}, da mais crítica para a menos crítica${s.total > shown.length ? ` · exibindo as ${shown.length} primeiras` : ''}` : 'Nenhuma exceção no recorte', draw:sl => pptAttention(pres, sl, P, s, shown)}); }
    else if(s.type === 'timeline'){
      const dates = s.rows.flatMap(r => [r.discoveryStart, r.devStart, r.planned, r.current, r.actual]).filter(Boolean).concat(model.referenceDate);
      const min = dates.reduce((a,b) => a < b ? a : b), max = dates.reduce((a,b) => a > b ? a : b);
      const start = `${min.slice(0,7)}-01`; const cap = new Date(PF.isoToUTC(start)); cap.setUTCMonth(cap.getUTCMonth() + 19);
      const endD = new Date(PF.isoToUTC(max)); endD.setUTCMonth(endD.getUTCMonth() + 1, 1);
      const end = PF.utcToISO(Math.min(cap.getTime(), endD.getTime()));
      const axis = {start, end, today:model.referenceDate};
      const pages = chunk(s.rows, PPT_ROWS.timeline);
      const beyond = s.rows.filter(r => (r.actual || r.current || r.planned || '') > end).length;
      pages.forEach((rows, k) => specs.push({kicker:kick, title:s.title + (pages.length > 1 ? ` — ${k + 1}/${pages.length}` : ''),
        subtitle:`Planejado, reprogramado e realizado · ${PF.fmtDate(start)} a ${PF.fmtDate(PF.addDays(end, -1))}${beyond ? ` · ${PF.plural(beyond,'entrega além da escala indicada','entregas além da escala indicadas')} com →` : ''}`, draw:sl => pptTimeline(pres, sl, P, rows, axis)})); }
    else if(s.type === 'portfolio'){ const pages = chunk(s.rows, PPT_ROWS.portfolio);
      pages.forEach((rows, k) => specs.push({kicker:kick, title:s.title + (pages.length > 1 ? ` — ${k + 1}/${pages.length}` : ''), subtitle:`${PF.plural(s.rows.length,'iniciativa','iniciativas')}, ordenadas por criticidade de prazo`, draw:sl => pptPortfolio(pres, sl, P, rows)})); }
    else if(s.type === 'risks') specs.push({kicker:kick, title:s.title, subtitle:'O que pode comprometer as entregas e o que depende de decisão', draw:sl => pptRisks(pres, sl, P, s)});
    else if(s.type === 'sprint'){ const sp = s.sprint; specs.push({kicker:kick, title:s.title, subtitle:`Dia ${sp.elapsedDays} de ${sp.totalDays} · ${sp.progress == null ? 'sem escopo' : sp.progress + '% concluído'} · ${PF.fmtHours(sp.capacity.totalHours)} h de capacidade disponível`, draw:sl => pptSprint(pres, sl, P, s)}); }
    else if(s.type === 'initiative') specs.push({kicker:kick + ' · Detalhamento', title:clip(s.initiative.name, 70), subtitle:`${s.initiative.id} · ${s.initiative.squads.join(' + ')}`, draw:sl => pptInitiative(pres, sl, P, s)});
  });
  specs.forEach((sp, n) => { const sl = pres.addSlide();
    if(!sp.cover) pptChrome(pres, sl, P, meta, {kicker:sp.kicker, title:sp.title, subtitle:sp.subtitle, page:n + 1, total:specs.length});
    sp.draw(sl); });
  const fileName = `portfolio-iniciativas-${model.referenceDate}${model.scope === 'filtered' ? '-filtrado' : ''}.pptx`;
  await pres.writeFile({fileName});
  return {fileName, slides:specs.length};
}

function pptOutline(model){
  const out = [];
  model.slides.forEach(sl => {
    const pages = sl.type === 'timeline' ? Math.max(1, Math.ceil(sl.rows.length / PPT_ROWS.timeline)) : sl.type === 'portfolio' ? Math.max(1, Math.ceil(sl.rows.length / PPT_ROWS.portfolio)) : 1;
    const label = sl.type === 'cover' ? 'Capa' : sl.type === 'initiative' ? `Detalhamento · ${sl.initiative.id}` : sl.title;
    out.push({label, pages});
  });
  let n = 1; return out.map(o => { const r = {...o, from:n, to:n + o.pages - 1}; n += o.pages; return r; });
}
function openPpt(){
  const filtered = PF.activeFilterCount() > 0;
  const opts = {slides:[...PPT_DEFAULT_SLIDES], scope: filtered ? 'filtered' : 'all', detailIds:[]};
  const html = () => {
    const model = buildExportModel(opts);
    const outline = pptOutline(model);
    const total = outline.length ? outline[outline.length - 1].to : 0;
    const chk = t => `<label class="checkbox col-opt" style="align-items:flex-start;padding:6px 8px"><input type="checkbox" data-change="ppt-slide" value="${t.id}"${opts.slides.includes(t.id) ? ' checked' : ''} style="margin-top:1px"><span><span style="display:block;font-weight:500">${t.label}</span><span class="muted" style="font-size:11.5px">${t.hint}</span></span></label>`;
    return PF.modalFrame('Exportar PowerPoint', 'Apresentação executiva em 16:9, gerada a partir dos mesmos dados e cálculos do painel',
      `<div class="form-grid" style="grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:20px 28px">
        <div><div class="form-section__title">Conteúdo</div><div class="stack" style="gap:2px">${PPT_SLIDE_TYPES.map(chk).join('')}</div>
          <div class="form-section__title" style="margin-top:14px">Detalhamento de iniciativas <span style="font-weight:400">· opcional</span></div>
          <div style="max-height:150px;overflow:auto;border:1px solid var(--border-default);border-radius:var(--radius-md);padding:4px">${PF.appState.initiatives.map(i => `<label class="checkbox col-opt"><input type="checkbox" data-change="ppt-detail" value="${PF.esc(i.id)}"${opts.detailIds.includes(i.id) ? ' checked' : ''}><span class="mono-id">${PF.esc(i.id)}</span> ${PF.esc(PF.shortName(i.name, 44))}</label>`).join('')}</div></div>
        <div><div class="form-section__title">Escopo</div><div class="stack" style="gap:2px">
            <label class="checkbox col-opt"><input type="radio" name="pptScope" data-change="ppt-scope" value="filtered"${opts.scope === 'filtered' ? ' checked' : ''}${filtered ? '' : ' disabled'}><span>Visão filtrada atual${filtered ? ` <span class="muted">· ${PF.filterInitiatives().length} iniciativas</span>` : ' <span class="muted">· sem filtros ativos</span>'}</span></label>
            <label class="checkbox col-opt"><input type="radio" name="pptScope" data-change="ppt-scope" value="all"${opts.scope === 'all' ? ' checked' : ''}><span>Portfólio completo <span class="muted">· ${PF.appState.initiatives.length} iniciativas</span></span></label></div>
          ${filtered && opts.scope === 'filtered' ? `<p class="muted" style="font-size:11.5px;margin:6px 8px 0">${PF.esc(describeFilters())}</p>` : ''}
          <div class="form-section__title" style="margin-top:16px">Estrutura da apresentação <span style="font-weight:400">· ${PF.plural(total,'slide','slides')}</span></div>
          <ol class="stack" style="gap:6px;font-size:12.5px">${outline.map(o => `<li style="display:grid;grid-template-columns:44px 1fr;gap:6px"><span class="muted" style="font-variant-numeric:tabular-nums">${o.from === o.to ? o.from : `${o.from}–${o.to}`}</span><span>${PF.esc(o.label)}${o.pages > 1 ? ` <span class="muted">· ${o.pages} páginas</span>` : ''}</span></li>`).join('')}</ol>
          <p class="muted" style="font-size:11.5px;margin-top:14px">Tema executivo claro, independente do tema da tela. Textos, tabelas, cronograma e gráfico são elementos nativos e editáveis.</p></div></div>`,
      `<button type="button" class="btn btn-tertiary" data-action="ppt-copy">${PF.icon('i-copy','ic ic-sm')}Copiar modelo (JSON)</button><div class="modal__foot-right"><button type="button" class="btn btn-tertiary" data-action="close-overlay">Cancelar</button><button type="button" class="btn btn-primary" data-action="ppt-generate"${opts.slides.length || opts.detailIds.length ? '' : ' disabled'}>${PF.icon('i-download','ic ic-sm')}Gerar PowerPoint</button></div>`);
  };
  const ov = PF.openOverlay({size:'modal--lg', label:'Exportar PowerPoint', html:html()});
  ov.pptOpts = opts;
  ov.onRefresh = () => { if(ov.busy) return; const b = ov.el.querySelector('.modal__body'); const st = b ? b.scrollTop : 0; ov.el.innerHTML = html(); const nb = ov.el.querySelector('.modal__body'); if(nb) nb.scrollTop = st; };
}
async function generatePpt(){
  const ov = PF.ui.overlays.find(o => o.pptOpts); if(!ov || ov.busy) return;
  const btn = ov.el.querySelector('[data-action="ppt-generate"]');
  ov.busy = true; btn.disabled = true; btn.innerHTML = '<span class="spinner spinner--btn" aria-hidden="true"></span>Gerando apresentação…';
  try {
    const r = await exportPptx(ov.pptOpts);
    ov.busy = false; PF.closeOverlay(ov);
    PF.showToast(`Apresentação pronta · ${r.fileName} (${r.slides} slides)`, null, 6000);
  } catch(err){
    ov.busy = false; btn.disabled = false; btn.innerHTML = `${PF.icon('i-download','ic ic-sm')}Gerar PowerPoint`;
    PF.showToast(err.message || 'Falha ao gerar a apresentação', null, 7000, true);
  }
}

/* exporta para os demais módulos */
Object.assign(PF, {portfolioTitle, PPT_SLIDE_TYPES, PPT_DEFAULT_SLIDES, PPT_ROWS, describeFilters, lastObservation, buildExportModel, PPTX_SOURCES, loadPptxGen, PX, pptPalette, TONE_OF_STATUS, pT, pR, pL, ownersText, clip, pptChrome, toneSquare, pptCover, pptExecutive, pptTableHeader, PPT_ROW_BORDER, statusCell, pptAttention, pptTimeline, pptPortfolio, pptRisks, pptSprint, pptInitiative, exportPptx, pptOutline, openPpt, generatePpt});
})();
