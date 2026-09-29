/* SALA Lead Time — aba Portfólio · pf-views.js
   visões: cabeçalho, filtros, Visão geral, Iniciativas (tabela/cronograma) e Sprints.
   Módulo clássico (IIFE): nada vaza para o escopo global de index.html além de
   window.SalaPortfolio. Nomes compartilhados entre módulos ficam em PF (namespace interno).
   Ordem de carga: pf-core.js → pf-metrics.js → pf-state.js → pf-import.js → pf-export.js → pf-views.js → pf-panels.js → pf-app.js. */
(function(){
'use strict';
const SP = window.SalaPortfolio = window.SalaPortfolio || {};
const PF = SP.internal = SP.internal || {};

/* =====================================================================
   RENDER — helpers de componentes
   ===================================================================== */
function statusBadge(status, tip, tone){ const d = PF.DEADLINE_META[status]; return `<span class="st st--${status}${tone ? ` tone-${tone}` : ''}"${tip ? ` data-tip="${PF.esc(tip)}"` : ''}>${PF.icon(d.icon)}${d.label}</span>`; }
/* Status real (calculado) nunca muda aqui; só o tom exibido pode vir do ajuste manual. */
function displayTone(init, status){ return (init && init.deadlineColorOverride) || PF.AUTO_TONE[status]; }
const TONE_FILL = {green:'ok', yellow:'attention', red:'late', neutral:'suspended', blue:'done'};
function toneFill(init, status){ return init && init.deadlineColorOverride ? `fill--${TONE_FILL[init.deadlineColorOverride]}` : `fill--${status}`; }
function statusPill(init, m, {interactive = true} = {}){
  const st = m.deadline.status, d = PF.DEADLINE_META[st], ov = init.deadlineColorOverride, tone = displayTone(init, st);
  const tip = m.deadline.reasons.join('\n') + (ov ? `\n\nSituação calculada: ${d.label}\nCor exibida: ${PF.TONE_LABEL[ov]} · ajuste visual manual` : '');
  const inner = `${PF.icon(d.icon)}<span class="pill__label">${d.label}</span>${ov ? '<span class="pill__mark" aria-hidden="true"></span>' : ''}`;
  if(!interactive) return `<span class="pill tone-${tone}" data-tip="${PF.esc(tip)}">${inner}</span>`;
  return `<button type="button" class="pill tone-${tone}" data-action="tone-menu" data-id="${PF.esc(init.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Prazo: ${d.label}${ov ? `; cor exibida ajustada para ${PF.TONE_LABEL[ov]}` : ''}. Alterar cor exibida" data-tip="${PF.esc(tip)}">${inner}</button>`;
}
function ownersCell(i, field){
  if(!i.owners.length) return '<span class="muted">—</span>';
  const vals = i.owners.map(o => o[field]);
  if(field === 'area' && vals.length > 1 && vals[0] && vals.every(v => v === vals[0])) return `<div class="own-list"><span>${PF.esc(vals[0])}</span></div>`;
  return `<div class="own-list" data-own="${field}">${vals.map(v => `<span>${v ? PF.esc(v) : '<span class="muted">—</span>'}</span>`).join('')}</div>`;
}
/* Mantém cada responsável na mesma linha visual da sua área, mesmo quando um nome quebra em duas linhas. */
function alignOwnerLines(root){
  const pairs = [];
  PF.$$('tbody tr', root).forEach(tr => { const a = tr.querySelector('[data-own=name]'), b = tr.querySelector('[data-own=area]'); if(!a || !b) return;
    const x = [...a.children], y = [...b.children]; if(x.length === y.length && x.length > 1) x.forEach((el,k) => pairs.push([el, y[k]])); });
  pairs.forEach(([a,b]) => { a.style.minHeight = b.style.minHeight = ''; });
  const hs = pairs.map(([a,b]) => Math.max(a.offsetHeight, b.offsetHeight));
  pairs.forEach(([a,b],k) => { a.style.minHeight = b.style.minHeight = hs[k] + 'px'; });
}
function riskBadge(risk){ const lvl = risk ? PF.RISKS.indexOf(risk)+1 : 0; return `<span class="risk risk--${lvl}"><span class="risk__bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>${risk ? PF.esc(risk) : 'Não avaliado'}</span>`; }
function varianceTag(v, label = 'Desvio previsto'){ if(v == null) return ''; const cls = v > 0 ? 'late' : v < 0 ? 'early' : 'zero'; return `<span class="var var--${cls}" data-tip="${label}: ${PF.fmtDeltaDays(v)}">${PF.fmtSigned(v)} d</span>`; }
function actualVarianceCell(init, v){
  if(!init.deliveryActual) return '<span class="muted">—</span>';
  if(v == null) return '<span class="muted" data-tip="Sem entrega planejada para comparar">Sem baseline</span>';
  const k = PF.deltaKind(v); const lbl = v > 0 ? 'Atraso' : v < 0 ? 'Antecipado' : '';
  return `<span class="pr pr--${k}" data-tip="Prazo real = Entrega real − Entrega planejada\nEntrega planejada: ${PF.fmtDateFull(init.deliveryPlanned)}\nEntrega real: ${PF.fmtDateFull(init.deliveryActual)}"><b>${PF.fmtDeltaDays(v)}</b>${lbl ? `<small>${lbl}</small>` : ''}</span>`;
}
function progressBar(p, done, total){ if(p == null) return '<span class="muted" style="font-size:12px">Sem histórias</span>'; return `<div class="progress" data-tip="${done} de ${total} histórias concluídas"><div class="progress__track"><div class="progress__fill" style="width:${p}%"></div></div><span class="progress__val">${p}%</span></div>`; }
function wfBar(dist, width=90){
  if(!dist.total) return '<span class="muted">—</span>';
  const tip = PF.WORKFLOW.map(s => `${s}: ${dist.byStatus[s]}`).join('\n') + (dist.blocked ? `\nBloqueadas: ${dist.blocked}` : '');
  return `<div style="display:flex;align-items:center;gap:8px"><div class="wfbar" style="width:${width}px" data-tip="${PF.esc(tip)}">${PF.WORKFLOW.filter(s => dist.byStatus[s]).map(s => `<span class="wf-${s}" style="flex:${dist.byStatus[s]}"></span>`).join('')}</div><span class="num">${dist.total}</span></div>`;
}
function emptyBase(){
  return `<div class="panel"><div class="empty">
    <div class="empty__icon">${PF.icon('i-file')}</div>
    <div class="empty__title">Nenhuma base carregada</div>
    <p class="empty__text">Importe uma planilha ou cadastre sua primeira iniciativa.</p>
    <div class="empty__actions"><button type="button" class="btn btn-secondary" data-action="open-import">${PF.icon('i-upload')}Importar planilha</button><button type="button" class="btn btn-primary" data-action="new-initiative">${PF.icon('i-plus')}Nova iniciativa</button></div>
  </div></div>`;
}
function emptyFiltered(){
  return `<div class="empty empty--inline"><div class="empty__title" style="font-size:13px">Nenhuma iniciativa corresponde aos filtros</div><button type="button" class="btn btn-secondary btn-sm" data-action="clear-filters">Limpar filtros</button></div>`;
}

/* =====================================================================
   RENDER — cabeçalho, navegação, filtros
   ===================================================================== */
function renderSyncStatus(){
  const el = PF.$('#pfSync'); if(!el) return;
  const st = PF.sync.status;
  const t = st === 'synced' ? `Sincronizado${PF.sync.at ? ' às ' + PF.sync.at.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : ''}` : PF.sync.message;
  el.className = 'sync-state sync-state--' + st;
  el.innerHTML = `${PF.icon(st === 'error' ? 'i-attention' : st === 'synced' ? 'i-ok' : st === 'local' ? 'i-info' : 'i-reset','ic ic-xs')}<span>${PF.esc(t)}</span>${st === 'error' ? ' <button type="button" class="btn-link" data-action="sync-retry">Tentar novamente</button>' : ''}`;
}
function renderPageMeta(){
  const md = PF.appState.metadata;
  const src = md.source ? `<span>Fonte <b>${PF.esc(md.source)}</b>${md.sourceCut ? ` · corte ${PF.fmtDateFull(md.sourceCut)}` : ''}${md.fileName ? ` · ${PF.esc(md.fileName)}` : ''}</span>` : '';
  const demo = '<span id="pfSync" class="sync-state" aria-live="polite"></span>';
  const ref = `<span>Referência <b>${PF.fmtDateFull(PF.ctx.today)}</b>${PF.appState.settings.referenceDate ? ' (fixa)' : ''}</span>`;
  PF.$('#pageMeta').innerHTML = [src, ref, demo].filter(Boolean).join('');
  renderSyncStatus();
  const q = PF.ctx.quality;
  const ringColor = q.score == null ? 'var(--border-strong)' : q.errors ? 'var(--status-danger)' : q.warnings ? 'var(--status-warning)' : 'var(--status-success)';
  const alerts = q.errors + q.warnings;
  PF.$('#qualityChip').innerHTML = `<span class="quality-ring" style="background:conic-gradient(${ringColor} ${(q.score||0)*3.6}deg, var(--border-default) 0)" aria-hidden="true"></span>Qualidade dos dados <b>${q.score == null ? '—' : q.score + '%'}</b>${alerts ? `<span class="muted">· ${PF.plural(alerts,'alerta','alertas')}</span>` : ''}`;
  PF.$('#qualityChip').setAttribute('aria-label', `Qualidade dos dados: ${q.score == null ? 'sem base' : q.score + '% válido'}, ${alerts} alertas. Abrir detalhes`);
}
function renderSubnav(){
  PF.$$('.subnav__tab').forEach(t => { const on = t.dataset.view === PF.prefs.view; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
  ['overview','initiatives','sprints'].forEach(v => { PF.$(`#view-${v}`).hidden = v !== PF.prefs.view; });
  PF.$('#countInitiatives').textContent = PF.filterInitiatives().length;
}
/* Dropdown próprio (listbox) — substitui o <select> nativo nos filtros e na navegação de Sprint */
function filterSelect(key, {small=true} = {}){
  const def = PF.FILTER_DEFS[key], val = PF.prefs.filters[key];
  const vl = val ? (def.fmt ? def.fmt(val) : val) : 'todos';
  return `<button type="button" class="dd-trigger ${small ? '' : 'dd-trigger--block'} ${val ? 'is-set' : ''}" data-action="dd-open" data-dd="filter:${key}" aria-haspopup="listbox" aria-expanded="false" aria-label="Filtrar por ${PF.esc(def.label)}: ${PF.esc(vl)}">${small ? `<span class="dd-trigger__k">${PF.esc(def.label)}:</span>` : ''}<span class="dd-trigger__v">${PF.esc(vl)}</span>${PF.icon('i-chevron','ic ic-xs')}</button>`;
}
function ddSource(ref){
  const [kind, key] = ref.split(':');
  if(kind === 'filter'){
    const def = PF.FILTER_DEFS[key], cur = PF.prefs.filters[key];
    const saved = PF.prefs.filters[key]; PF.prefs.filters[key] = '';
    const base = PF.filterInitiatives(); PF.prefs.filters[key] = saved;
    const count = v => base.filter(i => { const m = PF.ctx.initMetrics.get(i.id);
      if(key === 'squad') return i.squads.includes(v); if(key === 'phase') return i.phase === v; if(key === 'situation') return i.situation === v;
      if(key === 'deadline') return m.deadline.status === v; if(key === 'risk') return v === '__none' ? !i.risk : i.risk === v;
      if(key === 'area') return i.owners.some(o => o.area === v); if(key === 'year') return (i.deliveryCurrent || i.deliveryPlanned || '').slice(0,4) === v;
      if(key === 'sprint') return m.stories.some(st => st.sprint === v || st.plannedSprint === v); return true; }).length;
    return {label:def.label, value:cur, options:[{value:'', label:'Todos', count:base.length, sep:true}, ...def.options().map(o => ({value:o, label:def.fmt ? def.fmt(o) : o, count:count(o)}))],
      pick:v => PF.setFilter(key, v)};
  }
  if(kind === 'sprintnav'){
    const sp = selectedSprint();
    return {label:'Sprint', value:sp.id, options:PF.ctx.sprints.map(x => ({value:x.id, label:`${x.name} · ${PF.fmtDayMonth(x.start)} – ${PF.fmtDayMonth(x.end)}`, hint: PF.ctx.currentSprint && x.id === PF.ctx.currentSprint.id ? 'atual' : ''})),
      pick:v => { PF.prefs.sprintId = v; PF.persistPrefs(); renderView(); }};
  }
}
function openDropdown(anchor, ref){
  PF.closeToneMenu();
  const src = ddSource(ref); if(!src) return;
  const el = document.createElement('div');
  el.className = 'dd-menu anchored-pop'; el.setAttribute('role','listbox'); el.setAttribute('aria-label', src.label);
  el.innerHTML = src.options.map(o => `<button type="button" class="dd-opt" role="option" aria-selected="${o.value === (src.value || '')}" data-action="dd-pick" data-value="${PF.esc(o.value)}">${PF.icon('i-ok','ic ic-sm')}<span>${PF.esc(o.label)}</span>${o.count != null ? `<span class="dd-opt__count">${o.count}</span>` : o.hint ? `<span class="dd-opt__count">${PF.esc(o.hint)}</span>` : ''}</button>${o.sep ? '<div class="dd-sep" role="separator"></div>' : ''}`).join('');
  PF.DOM.layer.appendChild(el);
  el.style.minWidth = Math.max(200, anchor.getBoundingClientRect().width) + 'px';
  anchor.setAttribute('aria-expanded','true');
  PF.ui.anchored = {el, anchor, id:null, kind:'listbox', ref, src, inDrawer:false};
  PF.positionToneMenu();
  (el.querySelector('[aria-selected="true"]') || el.querySelector('.dd-opt')).focus();
}
function pickDropdown(value){
  const a = PF.ui.anchored; if(!a || a.kind !== 'listbox') return;
  const ref = a.ref, pop = a.anchor.closest('.popover'); const popId = pop && pop.id;
  PF.closeToneMenu();
  a.src.pick(value);
  if(popId){ const p = PF.DOM.root.getElementById(popId); if(p){ p.hidden = false; const b = PF.$(`[data-pop="${popId}"]`); if(b) b.setAttribute('aria-expanded','true'); } }
  const t = PF.$(`[data-action="dd-open"][data-dd="${CSS.escape(ref)}"]`); if(t) t.focus();
}
function renderFilterBar(){
  const moreWasOpen = !!(PF.$('#morePop') && !PF.$('#morePop').hidden);
  const moreKeys = PF.MORE_FILTERS.filter(k => !(k === 'sprint' && PF.prefs.view === 'sprints'));
  const moreCount = PF.activeFilterCount(moreKeys);
  PF.$('#filterBar').innerHTML = `
    <label class="search"><span class="sr-only">Buscar por ID ou nome</span>${PF.icon('i-search','ic ic-sm')}<input class="input input-sm" type="search" id="searchInput" placeholder="Buscar ID ou nome" value="${PF.esc(PF.prefs.filters.q)}" autocomplete="off"></label>
    ${PF.PRIMARY_FILTERS.map(k => filterSelect(k)).join('')}
    <div class="pop-wrap">
      <button type="button" class="btn btn-secondary btn-sm" data-action="toggle-popover" data-pop="morePop" aria-expanded="false" aria-haspopup="dialog">${PF.icon('i-filter','ic ic-sm')}Mais filtros${moreCount ? ` <span class="count-pill">${moreCount}</span>` : ''}</button>
      <div class="popover" id="morePop" role="dialog" aria-label="Mais filtros" hidden>
        <div class="pop-title" style="margin-bottom:10px">Mais filtros</div><div class="stack" style="gap:10px">${moreKeys.map(k => `<div class="field"><span class="field-label">${PF.FILTER_DEFS[k].label}</span>${filterSelect(k,{small:false})}</div>`).join('')}</div>
      </div>
    </div>`;
  if(moreWasOpen){ PF.$('#morePop').hidden = false; PF.$('[data-pop="morePop"]').setAttribute('aria-expanded','true'); }
}
function renderActiveFilters(){
  const keys = Object.keys(PF.prefs.filters).filter(k => PF.prefs.filters[k] && !(k === 'sprint' && PF.prefs.view === 'sprints'));
  if(!keys.length){ PF.$('#activeFilters').innerHTML = ''; return; }
  const n = PF.filterInitiatives().length;
  PF.$('#activeFilters').innerHTML = `<span class="filter-count">${PF.plural(n,'iniciativa','iniciativas')} de ${PF.appState.initiatives.length}</span>` +
    keys.map(k => { const v = PF.prefs.filters[k]; const label = k === 'q' ? 'Busca' : PF.FILTER_DEFS[k].label; const txt = k === 'q' ? `“${v}”` : (PF.FILTER_DEFS[k].fmt ? PF.FILTER_DEFS[k].fmt(v) : v);
      return `<span class="chip"><b>${PF.esc(label)}:</b> ${PF.esc(txt)}<button type="button" data-action="remove-filter" data-key="${k}" aria-label="Remover filtro ${PF.esc(label)}">${PF.icon('i-close','ic ic-xs')}</button></span>`; }).join('') +
    `<button type="button" class="btn btn-tertiary btn-sm" data-action="clear-filters">Limpar filtros</button>`;
}
function loadingBase(){
  return `<div class="panel"><div class="empty" role="status"><div class="spinner" aria-hidden="true"></div><div class="empty__title">Carregando a base compartilhada do portfólio…</div><p class="empty__text">A base é a mesma para todo o time. Se o servidor demorar, a última cópia salva neste navegador é exibida com aviso.</p></div></div>`;
}
function renderView(){
  renderSubnav();
  if(!PF.sync.loaded){ ['overview','initiatives','sprints'].forEach(v => PF.$(`#view-${v}`).innerHTML = loadingBase()); return; }
  if(!PF.appState.initiatives.length){ ['overview','initiatives','sprints'].forEach(v => PF.$(`#view-${v}`).innerHTML = emptyBase()); return; }
  if(PF.prefs.view === 'overview') renderOverview();
  else if(PF.prefs.view === 'initiatives') renderInitiatives();
  else renderSprints();
}
function refresh(){
  if(!PF.DOM.host) return;
  PF.ctx = PF.computeContext();
  const pt = PF.$('#pageTitle'); if(pt) pt.textContent = PF.portfolioTitle();
  renderPageMeta(); renderFilterBar(); renderActiveFilters(); renderView();
  if(PF.ui.drawer) PF.renderDrawer();
  const top = PF.ui.overlays[PF.ui.overlays.length-1]; if(top && top.onRefresh) top.onRefresh();
}

/* =====================================================================
   RENDER — VISÃO GERAL
   ===================================================================== */
function renderOverview(){
  const inits = PF.filterInitiatives();
  const el = PF.$('#view-overview');
  if(!inits.length){ el.innerHTML = `<div class="panel">${emptyFiltered()}</div>`; return; }
  const pm = PF.getPortfolioMetrics(inits, PF.ctx);
  el.innerHTML = `<div class="ov-grid">
    ${kpiBand(pm, inits)}
    <section class="panel col-7" aria-labelledby="attnTitle">${attentionPanel(inits)}</section>
    <section class="panel col-5" aria-labelledby="upTitle">${upcomingPanel(inits)}</section>
    <section class="panel col-6" aria-labelledby="phTitle">${phasePanel(inits)}</section>
    <section class="panel col-6" aria-labelledby="dvTitle">${variancePanel(inits)}</section>
    <section class="panel col-7" aria-labelledby="sqTitle">${squadPanel(inits)}</section>
    <section class="panel col-5" aria-labelledby="flTitle">${flowPanel(inits, pm)}</section>
  </div>`;
}
function kpiBand(pm, inits){
  const hints = {ok:'dentro dos limites', attention:'exigem acompanhamento', late:'vencidas ou replanejadas', none:'sem data de entrega', suspended:'pausadas'};
  const base = pm.total - pm.byStatus.done;
  return `<section class="panel col-12 kpis" aria-label="Situação do portfólio">
    <div class="kpis__hero">
      <span class="kpi-label">Iniciativas no portfólio</span>
      <span class="kpi-hero-value">${pm.active}${pm.byStatus.done ? `<small>+${pm.byStatus.done} entregue${pm.byStatus.done>1?'s':''}</small>` : ''}</span>
      <p class="kpis__headline">${PF.buildHeadline(pm, inits, PF.ctx)}</p>
    </div>
    <div class="kpis__right">
      <div class="kpis__cells">
        ${PF.DEADLINE_KPI_ORDER.map(k => { const n = pm.byStatus[k]; const p = base ? Math.round(n/base*100) : 0; const on = PF.prefs.filters.deadline === k;
          return `<button type="button" class="kpi-cell" data-action="drill-deadline" data-value="${k}" aria-pressed="${on}" data-tip="${PF.esc(PF.DEADLINE_META[k].label)}: ${hints[k]}.\nClique para ver as iniciativas.">
            ${statusBadge(k)}<span class="kpi-cell__value">${n}<span class="kpi-cell__pct">${p}%</span></span><span class="kpi-cell__hint">${hints[k]}</span></button>`; }).join('')}
      </div>
      <div class="kpis__bar" role="img" aria-label="${PF.esc(PF.DEADLINE_KPI_ORDER.map(k => `${PF.DEADLINE_META[k].label}: ${pm.byStatus[k]}`).join(', '))}">
        ${PF.DEADLINE_KPI_ORDER.filter(k => pm.byStatus[k]).map(k => `<span class="fill--${k}" style="flex:${pm.byStatus[k]}" data-tip="${PF.DEADLINE_META[k].label}: ${pm.byStatus[k]}"></span>`).join('')}
      </div>
    </div>
  </section>`;
}
function attentionPanel(inits){
  const items = PF.getAttentionItems(inits, PF.ctx);
  const LIMIT = 6; const shown = PF.ui.attnExpanded ? items : items.slice(0, LIMIT);
  const head = `<div class="panel-head"><div><h2 class="panel-title" id="attnTitle">Atenção executiva <span class="count-pill ${items.some(i=>i.sev===1)?'count-pill--danger':''}">${items.length}</span></h2><p class="panel-sub">Exceções que pedem decisão ou acompanhamento, da mais crítica para a menos crítica</p></div></div>`;
  if(!items.length) return head + `<div class="empty empty--inline"><div class="empty__icon">${PF.icon('i-ok')}</div><div class="empty__title" style="font-size:13px">Nenhuma exceção no recorte atual</div></div>`;
  return head + `<ul class="attn-list">${shown.map(a => {
    const top = a.signals[0]; const others = a.signals.slice(1);
    return `<li><button type="button" class="attn-row" data-action="open-initiative" data-id="${PF.esc(a.init.id)}">
      <span class="attn-sev attn-sev--${a.sev}" aria-hidden="true"></span>
      <span class="attn-main"><span class="attn-title"><span class="mono-id">${PF.esc(a.init.id)}</span>${PF.esc(a.init.name)}</span>
        <span class="attn-reason"><span class="attn-cat">${PF.esc(top.cat)}</span>${PF.esc(top.text)}</span></span>
      <span class="attn-meta">${statusBadge(a.m.deadline.status, null, displayTone(a.init, a.m.deadline.status))}${others.length ? `<span data-tip="${PF.esc(others.map(s => `${s.cat}: ${s.text}`).join('\n'))}">+${PF.plural(others.length,'sinal','sinais')}</span>` : ''}</span>
    </button></li>`; }).join('')}</ul>
    ${items.length > LIMIT ? `<div class="panel-foot"><span>${PF.ui.attnExpanded ? `Exibindo todas as ${items.length}` : `Exibindo ${LIMIT} de ${items.length}`}</span><button type="button" class="btn-link" data-action="toggle-attn">${PF.ui.attnExpanded ? 'Mostrar menos' : 'Ver todas'}</button></div>` : ''}`;
}
function upcomingPanel(inits){
  const w = PF.prefs.upcomingWindow;
  const list = PF.calculateUpcomingDeliveries(inits, w, PF.ctx);
  const seg = `<div class="seg" role="radiogroup" aria-label="Janela de entregas">${PF.appState.settings.upcomingWindows.map(d => `<button type="button" role="radio" aria-checked="${d===w}" data-action="set-window" data-value="${d}">${d} dias</button>`).join('')}</div>`;
  const head = `<div class="panel-head"><div><h2 class="panel-title" id="upTitle">Próximas entregas</h2><p class="panel-sub">${PF.plural(list.length,'entrega','entregas')} até ${PF.fmtDateFull(PF.addDays(PF.ctx.today,w))}</p></div>${seg}</div>`;
  const byDate = {}; list.forEach(u => { (byDate[u.m.deadline.target] = byDate[u.m.deadline.target] || []).push(u); });
  const marks = Object.entries(byDate).map(([d, arr]) => { const x = PF.daysBetween(PF.ctx.today, d) / w * 100;
    return arr.map((u,k) => `<button type="button" class="horizon__mark ${toneFill(u.init, u.m.deadline.status)}" style="left:${x}%;bottom:${24 + k*13}px" data-action="open-initiative" data-id="${PF.esc(u.init.id)}" aria-label="${PF.esc(u.init.id)} ${PF.esc(u.init.name)} em ${PF.fmtDate(d)}" data-tip="${PF.fmtDateFull(d)} · ${PF.esc(u.init.id)}\n${PF.esc(u.init.name)}\n${PF.DEADLINE_META[u.m.deadline.status].label}"></button>`).join(''); }).join('');
  const ticks = [0, .5, 1].map((f,k) => { const d = PF.addDays(PF.ctx.today, Math.round(w*f)); return `<span class="horizon__tick ${k===0?'horizon__tick--start':k===2?'horizon__tick--end':''}" style="left:${f*100}%">${PF.fmtDayMonth(d)}</span>`; }).join('');
  const horizon = `<div class="panel-body" style="padding-bottom:4px"><div class="horizon" aria-hidden="false"><div class="horizon__today"><span>Hoje</span></div><div class="horizon__axis"></div>${ticks}${marks}</div></div>`;
  let body;
  if(!list.length){
    const next = PF.calculateUpcomingDeliveries(inits, 3650, PF.ctx)[0];
    body = `<div class="empty empty--inline"><div class="empty__title" style="font-size:13px">Nenhuma entrega prevista nos próximos ${w} dias</div>${next ? `<p class="empty__text" style="font-size:12px">Próxima: ${PF.esc(next.init.id)} em ${PF.fmtDateFull(next.m.deadline.target)} (em ${PF.plural(next.m.deadline.daysTo,'dia','dias')})</p>` : ''}</div>`;
  } else {
    body = `<div class="up-list">${list.map(u => `<button type="button" class="up-row" data-action="open-initiative" data-id="${PF.esc(u.init.id)}">
      <span class="up-date"><b>${PF.fmtDayMonth(u.m.deadline.target)}</b><span>${PF.weekday(u.m.deadline.target)} · ${u.m.deadline.daysTo === 0 ? 'hoje' : `em ${u.m.deadline.daysTo} d`}</span></span>
      <span class="up-name"><span class="mono-id">${PF.esc(u.init.id)}</span> ${PF.esc(u.init.name)}<small>${PF.esc(u.init.squads.join(' + '))}${u.init.deliveryCurrent && u.init.deliveryCurrent !== u.init.deliveryPlanned ? ` · planejada ${PF.fmtDate(u.init.deliveryPlanned)}` : ''}</small></span>
      <span class="up-side">${statusBadge(u.m.deadline.status, null, displayTone(u.init, u.m.deadline.status))}${riskBadge(u.init.risk)}</span></button>`).join('')}</div>`;
  }
  return head + horizon + body;
}
function phasePanel(inits){
  const phases = PF.FILTER_DEFS.phase.options().filter(p => inits.some(i => i.phase === p));
  const rows = phases.map(p => { const arr = inits.filter(i => i.phase === p); const by = {}; arr.forEach(i => { const s = PF.ctx.initMetrics.get(i.id).deadline.status; (by[s] = by[s] || []).push(i); }); return {p, arr, by}; });
  const max = Math.max(1, ...rows.map(r => r.arr.length));
  const used = PF.DEADLINE_KPI_ORDER.concat('done').filter(k => rows.some(r => r.by[k]));
  return `<div class="panel-head"><div><h2 class="panel-title" id="phTitle">Onde as iniciativas estão no ciclo</h2><p class="panel-sub">Iniciativas por fase, segmentadas pelo status de prazo · clique para filtrar</p></div></div>
    <div class="panel-body"><div class="legend" style="margin-bottom:10px">${used.map(k => `<span><span class="swatch fill--${k}"></span>${PF.DEADLINE_META[k].label}</span>`).join('')}</div>
    <div class="hbars">${rows.map(r => `<button type="button" class="hbar" data-action="drill-phase" data-value="${PF.esc(r.p)}" aria-label="${PF.esc(r.p)}: ${r.arr.length} iniciativas">
      <span class="hbar__label">${PF.esc(r.p)}</span>
      <span class="hbar__track" style="width:${r.arr.length/max*100}%">${used.filter(k => r.by[k]).map(k => `<span class="fill--${k}" style="flex:${r.by[k].length}" data-tip="${PF.esc(r.p)} · ${PF.DEADLINE_META[k].label}: ${r.by[k].length}\n${PF.esc(r.by[k].map(i => `${i.id} ${PF.shortName(i.name,40)}`).join('\n'))}"></span>`).join('')}</span>
      <span class="hbar__val">${r.arr.length}</span></button>`).join('')}</div></div>`;
}
function variancePanel(inits){
  const devRows = [], delRows = [], actRows = []; let devZero = 0, delZero = 0, devNa = 0, delNa = 0, actZero = 0;
  inits.forEach(i => { const v = PF.ctx.initMetrics.get(i.id).variance;
    if(v.dev == null) devNa++; else if(v.dev === 0) devZero++; else devRows.push({i, v:v.dev});
    if(v.actual != null){ if(v.actual === 0) actZero++; else actRows.push({i, v:v.actual}); }
    if(i.deliveryActual) return;
    if(v.forecast == null) delNa++; else if(v.forecast === 0) delZero++; else delRows.push({i, v:v.forecast}); });
  const max = Math.max(10, ...devRows.map(r => Math.abs(r.v)), ...delRows.map(r => Math.abs(r.v)), ...actRows.map(r => Math.abs(r.v)));
  const row = (r, what) => { const w = Math.abs(r.v)/max*38; const late = r.v > 0;
    return `<button type="button" class="div-row" data-action="open-initiative" data-id="${PF.esc(r.i.id)}" data-tip="${PF.esc(r.i.id)} · ${PF.esc(r.i.name)}\n${what}: ${PF.fmtSigned(r.v)} dias (${late ? 'postergação' : 'antecipação'})">
      <span class="div-row__label"><span class="mono-id">${PF.esc(r.i.id)}</span> ${PF.esc(PF.shortName(r.i.name, 26))}</span>
      <span class="div-track"><span class="div-bar div-bar--${late ? 'late' : 'early'}" style="${late ? `left:50%` : `right:50%`};width:${w}%"></span>
      <span class="div-val" style="${late ? `left:calc(50% + ${w}% + 6px)` : `right:calc(50% + ${w}% + 6px)`}">${PF.fmtSigned(r.v)} d</span></span></button>`; };
  const group = (title, rows, zero, na, what) => `<div class="div-group"><div class="div-group__title">${title}</div>
    ${rows.length ? rows.sort((a,b) => b.v - a.v).map(r => row(r, what)).join('') : '<div class="muted" style="font-size:12px;padding:4px 0">Nenhum desvio registrado</div>'}
    <div class="div-note">${zero ? `${PF.plural(zero,'iniciativa','iniciativas')} sem desvio` : ''}${zero && na ? ' · ' : ''}${na ? `${na} sem data realizada/atual para comparar` : ''}</div></div>`;
  return `<div class="panel-head"><div><h2 class="panel-title" id="dvTitle">Quanto as datas estão se movendo</h2><p class="panel-sub">Desvio em dias corridos · direita = postergação, esquerda = antecipação</p></div></div>
    <div class="panel-body"><div class="legend" style="margin-bottom:10px"><span><span class="swatch" style="background:var(--div-late)"></span>Postergação</span><span><span class="swatch" style="background:var(--div-early)"></span>Antecipação</span></div>
    ${group('Início do DEV (realizado − previsto)', devRows, devZero, devNa, 'Início do DEV')}
    ${group('Desvio previsto (atual − planejada)', delRows, delZero, delNa, 'Desvio previsto')}
    ${actRows.length || actZero ? group('Prazo real (real − planejada) · entregues', actRows, actZero, 0, 'Prazo real') : ''}</div>`;
}
function squadPanel(inits){
  const map = new Map();
  inits.forEach(i => i.squads.forEach(s => { if(!map.has(s)) map.set(s, []); map.get(s).push(i); }));
  const rows = [...map.entries()].map(([sq, arr]) => {
    const ms = arr.map(i => PF.ctx.initMetrics.get(i.id));
    const inFlow = ms.reduce((a,m) => a + m.dist.inFlow, 0), blocked = ms.reduce((a,m) => a + m.dist.blocked, 0);
    const nextUp = arr.map(i => ({i, m:PF.ctx.initMetrics.get(i.id)})).filter(x => x.m.deadline.target && x.m.deadline.target >= PF.ctx.today && !['done','suspended'].includes(x.m.deadline.status)).sort((a,b) => a.m.deadline.target < b.m.deadline.target ? -1 : 1)[0];
    const worst = Math.min(...ms.map(m => PF.DEADLINE_META[m.deadline.status].order));
    return {sq, arr, ms, inFlow, blocked, nextUp, worst};
  }).sort((a,b) => a.worst - b.worst || b.arr.length - a.arr.length || a.sq.localeCompare(b.sq));
  return `<div class="panel-head"><div><h2 class="panel-title" id="sqTitle">Squads</h2><p class="panel-sub">Iniciativas multi-squad aparecem em cada squad envolvida · ordenado pela pior situação</p></div></div>
  <div class="table-wrap" style="border-top:0"><table class="tbl tbl--compact"><thead><tr><th scope="col">Squad</th><th scope="col">Iniciativas</th><th scope="col" class="num">Em fluxo</th><th scope="col" class="num">Bloqueadas</th><th scope="col">Próxima entrega</th></tr></thead><tbody>
  ${rows.map(r => `<tr><td><button type="button" class="cell-name__title" data-action="drill-squad" data-value="${PF.esc(r.sq)}">${PF.esc(r.sq)}</button></td>
    <td><div style="display:flex;align-items:center;gap:10px"><span class="num" style="min-width:14px">${r.arr.length}</span><span class="sq-dots">${r.arr.map((i,k) => { const s = r.ms[k].deadline.status; return `<span class="st st--${s} tone-${displayTone(i, s)}" style="display:inline-flex" data-tip="${PF.esc(i.id)} · ${PF.esc(i.name)}\n${PF.DEADLINE_META[s].label}">${PF.icon(PF.DEADLINE_META[s].icon)}</span>`; }).join('')}</span></div></td>
    <td class="num">${r.inFlow || '<span class="muted">—</span>'}</td>
    <td class="num">${r.blocked ? `<span style="color:var(--status-danger);font-weight:600">${r.blocked}</span>` : '<span class="muted">—</span>'}</td>
    <td>${r.nextUp ? `<span class="cell-date">${PF.fmtDate(r.nextUp.m.deadline.target)}</span> <span class="muted" style="font-size:11.5px">· ${PF.esc(r.nextUp.i.id)}</span>` : '<span class="muted">—</span>'}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function blockedList(stories){
  const list = stories.filter(s => s.blocked && s.status !== 'Concluída').sort((a,b) => (a.blockedSince || '9') < (b.blockedSince || '9') ? -1 : 1);
  if(!list.length) return '';
  return `<div class="d-section" style="margin-top:16px"><div class="d-section__title">Bloqueios ativos <span class="muted" style="font-weight:400">mais antigos primeiro</span></div>
    <ul class="blk-list">${list.slice(0,6).map(s => { const days = s.blockedSince ? PF.daysBetween(s.blockedSince, PF.ctx.today) : null;
      return `<li><button type="button" class="blk-row" data-action="open-initiative" data-id="${PF.esc(s.initiativeId)}">${PF.icon('i-lock','ic ic-xs')}<span class="blk-main"><span class="blk-reason">${PF.esc(s.blockedReason || 'Sem motivo informado')}</span><span class="blk-meta"><span class="mono-id">${PF.esc(s.initiativeId)}</span> · ${PF.esc(s.id)} · ${PF.esc(s.status)}</span></span><span class="blk-age">${days != null ? `${days} d` : '—'}</span></button></li>`; }).join('')}</ul>
    ${list.length > 6 ? `<div class="muted" style="font-size:11.5px;margin-top:6px">+${list.length - 6} bloqueios</div>` : ''}</div>`;
}
function flowPanel(inits, pm){
  const d = pm.dist; const cs = PF.ctx.currentSprint;
  const lastClosed = PF.ctx.sprints.filter(s => s.end < PF.ctx.today).slice(-1)[0];
  const ids = new Set(inits.map(i => i.id)); const stories = PF.appState.stories.filter(s => ids.has(s.initiativeId));
  const tp = lastClosed ? PF.calculateThroughput(lastClosed, stories, PF.ctx) : null;
  return `<div class="panel-head"><div><h2 class="panel-title" id="flTitle">Onde está o trabalho</h2><p class="panel-sub">${PF.plural(d.total,'história','histórias')} das iniciativas no recorte, por etapa do fluxo</p></div>
    ${cs ? `<button type="button" class="btn btn-tertiary btn-sm" data-action="goto-view" data-value="sprints">${PF.esc(cs.name)} ${PF.icon('i-right','ic ic-sm')}</button>` : ''}</div>
  <div class="panel-body">${d.total ? `
    <div class="flow-bar" role="img" aria-label="${PF.esc(PF.WORKFLOW.map(s => `${s} ${d.byStatus[s]}`).join(', '))}">${PF.WORKFLOW.filter(s => d.byStatus[s]).map(s => `<span class="wf-${s}" style="flex:${d.byStatus[s]}" data-tip="${s}: ${d.byStatus[s]} (${Math.round(d.byStatus[s]/d.total*100)}%)"></span>`).join('')}</div>
    <div class="flow-legend">${PF.WORKFLOW.map(s => `<span class="flow-legend__item"><span class="swatch wf-${s}"></span>${s}<b>${d.byStatus[s]}</b></span>`).join('')}</div>` : '<div class="muted" style="font-size:12px">Nenhuma história cadastrada.</div>'}
    <div class="metric-strip">
      <div class="metric"><span class="metric__label">Bloqueadas</span><span class="metric__value" ${d.blocked ? 'style="color:var(--status-danger)"' : ''}>${d.blocked}</span></div>
      <div class="metric" data-tip="Média de (conclusão − início do DEV) das histórias concluídas${pm.leadTimeSample ? ` · base: ${pm.leadTimeSample} histórias` : ''}"><span class="metric__label">Lead time médio</span>${pm.leadTimeAvg != null ? `<span class="metric__value">${pm.leadTimeAvg}<small>dias</small></span>` : '<span class="metric__value metric__value--na">Sem dados suficientes</span>'}</div>
      <div class="metric" data-tip="Histórias concluídas na última sprint encerrada${lastClosed ? ` (${lastClosed.name})` : ''}"><span class="metric__label">Throughput ${lastClosed ? PF.esc(lastClosed.id) : ''}</span>${tp != null ? `<span class="metric__value">${tp}<small>hist.</small></span>` : '<span class="metric__value metric__value--na">Sem sprint encerrada</span>'}</div>
      <div class="metric" data-tip="Histórias em aberto que já passaram da sprint planejada"><span class="metric__label">Transbordo aberto</span><span class="metric__value">${pm.carryOverOpen}</span></div>
    </div>
    ${blockedList(stories)}</div>`;
}

/* =====================================================================
   RENDER — INICIATIVAS
   ===================================================================== */
const COLUMNS = [
  {id:'id', label:'ID', always:true, sort:i => i.id.padStart(8,'0'), render:i => `<span class="mono-id">${PF.esc(i.id)}</span>`},
  {id:'name', label:'Iniciativa', always:true, sort:i => PF.normKey(i.name), render:i => `<div class="cell-name"><button type="button" class="cell-name__title" data-action="open-initiative" data-id="${PF.esc(i.id)}">${PF.esc(i.name)}</button><span class="cell-name__sub">${PF.esc(i.squads.join(' + ') || 'Sem squad')}${i.po ? ` · PO ${PF.esc(i.po)}` : ''}</span></div>`},
  {id:'phase', label:'Fase', cls:'col-phase', sort:i => PF.PHASES.indexOf(i.phase), render:i => PF.esc(i.phase)},
  {id:'situation', label:'Situação', sort:i => PF.SITUATIONS.indexOf(i.situation), render:i => PF.esc(i.situation)},
  {id:'deadline', label:'Prazo', sort:(i,m) => PF.DEADLINE_META[m.deadline.status].order * 1e6 + (m.deadline.daysTo ?? 9e5), render:(i,m) => statusPill(i, m)},
  {id:'target', label:'Entrega', cls:'col-date', sort:(i,m) => i.deliveryActual || m.deadline.target || '9999', render:(i,m) => i.deliveryActual ? `<span class="cell-date" data-tip="${PF.esc(PF.deliveryTooltip(i))}">${PF.fmtDate(i.deliveryActual)}</span> <span class="st tone-blue" style="vertical-align:-2px" aria-label="entregue">${PF.icon('i-done','ic ic-xs')}</span>` : m.deadline.target ? `<span class="cell-date" data-tip="${PF.esc(PF.deliveryTooltip(i))}">${PF.fmtDate(m.deadline.target)}</span>${varianceTag(m.variance.forecast)}` : '<span class="muted">—</span>'},
  {id:'progress', label:'Progresso', sort:(i,m) => m.progress ?? -1, render:(i,m) => `<div style="width:88px">${progressBar(m.progress, m.dist.done, m.dist.total)}</div>`},
  {id:'stories', label:'Histórias', sort:(i,m) => m.dist.total, render:(i,m) => wfBar(m.dist, 64)},
  {id:'blocked', label:'Bloq.', num:true, sort:(i,m) => m.dist.blocked, render:(i,m) => m.dist.blocked ? `<span style="color:var(--status-danger);font-weight:600;display:inline-flex;align-items:center;gap:4px">${PF.icon('i-lock','ic ic-xs')}${m.dist.blocked}</span>` : '<span class="muted">—</span>'},
  {id:'risk', label:'Risco', sort:i => i.risk ? PF.RISKS.indexOf(i.risk) : -1, render:i => riskBadge(i.risk)},
  {id:'owner', label:'Responsável', cls:'col-owner', sort:i => PF.normKey(PF.ownerNames(i)[0] || 'zzzz'), render:i => ownersCell(i,'name')},
  {id:'area', label:'Área responsável', cls:'col-area', sort:i => PF.normKey(PF.ownerAreas(i)[0] || 'zzzz'), render:i => ownersCell(i,'area')},
  {id:'po', label:'PO', sort:i => PF.normKey(i.po), render:i => PF.esc(i.po) || '<span class="muted">—</span>'},
  {id:'techLead', label:'Tech Lead', sort:i => PF.normKey(i.techLead), render:i => i.techLead ? `<span class="cell-trunc" style="max-width:170px">${PF.esc(i.techLead)}</span>` : '<span class="muted">—</span>'},
  {id:'discoveryEnd', label:'Discovery fim', sort:i => i.discoveryEnd || '9999', render:i => `<span class="cell-date">${PF.fmtDate(i.discoveryEnd)}</span>`},
  {id:'devPlanned', label:'DEV previsto', sort:i => i.devPlanned || '9999', render:i => `<span class="cell-date">${PF.fmtDate(i.devPlanned)}</span>`},
  {id:'devActual', label:'DEV realizado', sort:i => i.devActual || '9999', render:(i,m) => i.devActual ? `<span class="cell-date">${PF.fmtDate(i.devActual)}</span>${varianceTag(m.variance.dev, 'Início do DEV (realizado − previsto)')}` : '<span class="muted">—</span>'},
  {id:'deliveryPlanned', label:'Ent. planejada', full:'Entrega planejada', cls:'col-date', sort:i => i.deliveryPlanned || '9999', render:i => i.deliveryPlanned ? `<span class="cell-date">${PF.fmtDate(i.deliveryPlanned)}</span>` : '<span class="muted">—</span>'},
  {id:'deliveryCurrent', label:'Ent. atual', full:'Entrega atual', cls:'col-date', sort:i => i.deliveryCurrent || i.deliveryPlanned || '9999', render:(i,m) => PF.isReprogrammed(i) ? `<span class="cell-date" data-tip="${PF.esc(PF.deliveryTooltip(i))}">${PF.fmtDate(i.deliveryCurrent)}</span>${varianceTag(m.variance.forecast)}` : i.deliveryPlanned ? '<span class="muted" data-tip="Sem reprogramação: a previsão vigente é a entrega planejada">= planejada</span>' : '<span class="muted">—</span>'},
  {id:'deliveryActual', label:'Ent. real', full:'Entrega real', cls:'col-date', sort:i => i.deliveryActual || '9999', render:i => i.deliveryActual ? `<span class="cell-date">${PF.fmtDate(i.deliveryActual)}</span>` : '<span class="muted" data-tip="Ainda não entregue">—</span>'},
  {id:'actualVariance', label:'Prazo real', full:'Prazo real (Entrega real − Entrega planejada)', cls:'col-date', sort:(i,m) => m.variance.actual ?? 1e6, render:(i,m) => actualVarianceCell(i, m.variance.actual)},
  {id:'sprint', label:'Sprint', sort:(i,m) => m.sprints[0] || 'zz', render:(i,m) => m.sprints.length ? m.sprints.map(PF.esc).join(', ') : '<span class="muted">—</span>'},
  {id:'backlog', label:'Backlog', num:true, sort:(i,m) => m.dist.byStatus.Backlog, render:(i,m) => m.dist.byStatus.Backlog},
  {id:'refined', label:'Refinadas', num:true, sort:(i,m) => m.dist.byStatus.Refinada, render:(i,m) => m.dist.byStatus.Refinada},
  {id:'inDev', label:'Em dev.', num:true, sort:(i,m) => m.dist.byStatus.Desenvolvimento, render:(i,m) => m.dist.byStatus.Desenvolvimento},
  {id:'inHomolog', label:'Em homol.', num:true, sort:(i,m) => m.dist.byStatus['Homologação'], render:(i,m) => m.dist.byStatus['Homologação']},
  {id:'done', label:'Concluídas', num:true, sort:(i,m) => m.dist.done, render:(i,m) => m.dist.done},
  {id:'notes', label:'Observação', sort:i => PF.normKey(i.notes), render:i => i.notes ? `<span class="cell-trunc" data-tip="${PF.esc(i.notes)}">${PF.esc(i.notes)}</span>` : '<span class="muted">—</span>'}
];
const COLUMN_GROUPS = [
  {label:'Status e prazo', cols:['phase','situation','deadline','risk','blocked']},
  {label:'Datas e entregas', cols:['target','discoveryEnd','devPlanned','devActual','deliveryPlanned','deliveryCurrent','deliveryActual','actualVariance']},
  {label:'Histórias e sprint', cols:['progress','stories','sprint','backlog','refined','inDev','inHomolog','done']},
  {label:'Pessoas e contexto', cols:['owner','area','po','techLead','notes']}
];
const COLUMN_PRESETS = {
  executiva:{label:'Executiva', cols:['id','name','phase','deadline','target','progress','stories','blocked','risk','owner','area']},
  cronograma:{label:'Cronograma', cols:['id','name','deadline','discoveryEnd','devPlanned','devActual','deliveryPlanned','deliveryCurrent','deliveryActual','actualVariance','risk']},
  historias:{label:'Histórias', cols:['id','name','deadline','sprint','backlog','refined','inDev','inHomolog','done','blocked','progress']}
};
function currentColumns(){ const ids = PF.prefs.columns || COLUMN_PRESETS.executiva.cols; return COLUMNS.filter(c => c.always || ids.includes(c.id)); }
function activePreset(){ const ids = (PF.prefs.columns || COLUMN_PRESETS.executiva.cols).join(','); return Object.keys(COLUMN_PRESETS).find(k => COLUMN_PRESETS[k].cols.join(',') === ids) || null; }
function sortInitiatives(list, sort){
  const col = COLUMNS.find(c => c.id === sort.col) || COLUMNS.find(c => c.id === 'deadline');
  const dir = sort.dir === 'desc' ? -1 : 1;
  return [...list].sort((a,b) => { const va = col.sort(a, PF.ctx.initMetrics.get(a.id)), vb = col.sort(b, PF.ctx.initMetrics.get(b.id)); return (va < vb ? -1 : va > vb ? 1 : a.id.localeCompare(b.id)) * dir; });
}
function renderInitiatives(){
  const el = PF.$('#view-initiatives');
  const prevG = PF.$('.gantt', el); const keepScroll = prevG && PF.prefs.initView === 'gantt' ? {l:prevG.scrollLeft, t:prevG.scrollTop} : null;
  const inits = sortInitiatives(PF.filterInitiatives(), PF.prefs.sort);
  const total = PF.appState.initiatives.length;
  const preset = activePreset();
  const isGantt = PF.prefs.initView === 'gantt';
  const cols = currentColumns();
  const colIds = new Set(cols.map(c => c.id));
  el.innerHTML = `<div class="panel">
    <div class="toolbar">
      <div class="toolbar__left"><span class="toolbar__count">${PF.plural(inits.length,'iniciativa','iniciativas')}${inits.length !== total ? `<small>de ${total}</small>` : ''}</span>
        <div class="seg" role="radiogroup" aria-label="Modo de visualização"><button type="button" role="radio" aria-checked="${!isGantt}" data-action="set-init-view" data-value="table">Tabela</button><button type="button" role="radio" aria-checked="${isGantt}" data-action="set-init-view" data-value="gantt">Cronograma</button></div></div>
      <div class="toolbar__right">
        ${isGantt ? '' : `<div class="seg" role="radiogroup" aria-label="Conjunto de colunas">${Object.entries(COLUMN_PRESETS).map(([k,p]) => `<button type="button" role="radio" aria-checked="${preset===k}" data-action="set-preset" data-value="${k}">${p.label}</button>`).join('')}</div>
        <div class="pop-wrap"><button type="button" class="btn btn-secondary btn-sm" data-action="toggle-popover" data-pop="colPop" aria-expanded="false" aria-haspopup="dialog">${PF.icon('i-columns','ic ic-sm')}Colunas${preset ? '' : ' <span class="count-pill">' + (cols.length) + '</span>'}</button>
          <div class="popover col-pop" id="colPop" role="dialog" aria-label="Colunas visíveis" hidden><div class="pop-title">Colunas visíveis</div><div class="pop-sub">ID e Iniciativa ficam sempre visíveis</div>
            <div class="col-chooser">${COLUMN_GROUPS.map(g => `<div class="col-group" role="group" aria-label="${PF.esc(g.label)}"><div class="col-group__title">${PF.esc(g.label)}</div><div class="col-group__items">${g.cols.map(id => COLUMNS.find(c => c.id === id)).filter(Boolean).map(c => `<label class="checkbox col-opt"${c.full ? ` data-tip="${PF.esc(c.full)}"` : ''}><input type="checkbox" data-change="toggle-col" value="${c.id}"${colIds.has(c.id) ? ' checked' : ''}>${c.label}</label>`).join('')}</div></div>`).join('')}</div>
            <div class="pop-foot"><span>${cols.length - 2} de ${COLUMNS.length - 2} colunas</span><button type="button" class="btn-link" data-action="set-preset" data-value="executiva" style="font-size:11.5px">Restaurar padrão</button></div></div></div>`}
        <button type="button" class="btn btn-secondary btn-sm" data-action="new-story">${PF.icon('i-plus','ic ic-sm')}Nova história</button>
      </div>
    </div>
    ${!inits.length ? emptyFiltered() : isGantt ? ganttView(inits) : `<div class="table-wrap inits-table"><table class="tbl" aria-label="Iniciativas"><thead><tr>${cols.map(c => { const on = PF.prefs.sort.col === c.id;
      return `<th scope="col" class="th--sortable ${c.num ? 'num' : ''} ${c.cls || ''}" aria-sort="${on ? (PF.prefs.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}"><button type="button" class="th-sort" data-action="sort" data-col="${c.id}"${on ? ` data-dir="${PF.prefs.sort.dir}"` : ''}${c.full ? ` aria-label="Ordenar por ${PF.esc(c.full)}" data-tip="${PF.esc(c.full)}"` : ''}>${c.label}${PF.icon(on ? (PF.prefs.sort.dir === 'asc' ? 'i-asc' : 'i-desc') : 'i-sort','ic ic-xs')}</button></th>`; }).join('')}</tr></thead>
      <tbody>${inits.map(i => { const m = PF.ctx.initMetrics.get(i.id); return `<tr class="${PF.ui.drawer === i.id ? 'is-selected' : ''}" data-row="${PF.esc(i.id)}">${cols.map(c => `<td class="${c.num ? 'num' : ''} ${c.cls || ''}">${c.render(i, m)}</td>`).join('')}</tr>`; }).join('')}</tbody></table></div>`}
  </div>`;
  if(!isGantt) alignOwnerLines(el);
  if(isGantt){ const g = PF.$('.gantt', el); const t = PF.$('.gantt__today', el); if(g && keepScroll){ g.scrollLeft = keepScroll.l; g.scrollTop = keepScroll.t; } else if(g && t) g.scrollLeft = Math.max(0, parseFloat(t.style.left) - 240); }
}
function ganttView(inits){
  const PX_MONTH = 84, LABEL_W = PF.DOM.host.getBoundingClientRect().width <= 900 ? 200 : 300;
  const dates = inits.flatMap(i => [i.discoveryStart, i.discoveryEnd, i.devPlanned, i.devActual, i.deliveryPlanned, i.deliveryCurrent, i.deliveryActual]).filter(Boolean).concat(PF.ctx.today);
  const min = dates.reduce((a,b) => a < b ? a : b), max = dates.reduce((a,b) => a > b ? a : b);
  const start = `${min.slice(0,7)}-01`;
  const endM = new Date(PF.isoToUTC(max)); endM.setUTCMonth(endM.getUTCMonth()+2, 1);
  const end = PF.utcToISO(endM.getTime());
  const months = []; let cur = new Date(PF.isoToUTC(start));
  while(PF.utcToISO(cur.getTime()) < end){ months.push(PF.utcToISO(cur.getTime())); cur.setUTCMonth(cur.getUTCMonth()+1); }
  const width = months.length * PX_MONTH;
  const x = iso => { const d = new Date(PF.isoToUTC(iso)); const mi = (d.getUTCFullYear() - +start.slice(0,4))*12 + d.getUTCMonth() - (+start.slice(5,7)-1); const dim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0)).getUTCDate(); return (mi + (d.getUTCDate()-1)/dim) * PX_MONTH; };
  const years = []; months.forEach((m,k) => { if(k===0 || m.slice(5,7)==='01') years.push({y:m.slice(0,4), k}); });
  const todayX = x(PF.ctx.today);
  const lines = months.map((m,k) => `<span class="gantt__monthline" style="left:${k*PX_MONTH}px"></span>`).join('');
  return `<div class="gantt"><div class="gantt__grid" style="width:${LABEL_W + width}px">
    <div class="gantt__head"><div class="gantt__corner" style="width:${LABEL_W}px">Iniciativa</div><div class="gantt__months" style="width:${width}px">
      ${years.map(y => `<span class="gantt__year" style="left:${y.k*PX_MONTH}px">${y.y}</span>`).join('')}
      ${months.map((m,k) => `<span class="gantt__month" style="left:${k*PX_MONTH}px;width:${PX_MONTH}px">${PF.MONTHS[+m.slice(5,7)-1]}</span>`).join('')}
      <span class="gantt__today-label" style="left:${todayX}px;top:4px">Hoje ${PF.fmtDayMonth(PF.ctx.today)}</span></div></div>
    ${inits.map(i => { const m = PF.ctx.initMetrics.get(i.id); const st = m.deadline.status;
      const disc = i.discoveryStart && i.discoveryEnd ? `<span class="g-disc" style="left:${x(i.discoveryStart)}px;width:${Math.max(3, x(i.discoveryEnd) - x(i.discoveryStart))}px" data-tip="Discovery: ${PF.fmtDate(i.discoveryStart)} → ${PF.fmtDate(i.discoveryEnd)}"></span>` : '';
      const devStart = i.devActual || i.devPlanned; const tgt = i.deliveryActual || m.deadline.target;
      const devEnd = tgt || (devStart ? PF.addDays(devStart, 30) : null);
      const gst = i.deadlineColorOverride ? TONE_FILL[i.deadlineColorOverride] : st; const devCls = gst === 'late' ? 'g-dev--late' : gst === 'attention' ? 'g-dev--attention' : gst === 'none' ? 'g-dev--none' : gst === 'suspended' ? 'g-dev--suspended' : '';
      const dev = devStart && devEnd && devEnd > devStart ? `<span class="g-dev ${devCls}" style="left:${x(devStart)}px;width:${Math.max(3, x(devEnd) - x(devStart))}px" data-tip="DEV ${i.devActual ? 'realizado' : 'previsto'}: ${PF.fmtDate(devStart)}${i.devActual && i.devPlanned ? ` (previsto ${PF.fmtDate(i.devPlanned)})` : ''}\nEntrega: ${tgt ? PF.fmtDate(tgt) : 'sem data'}\n${PF.DEADLINE_META[st].label}"></span>` : '';
      const main = i.deliveryActual || i.deliveryCurrent || i.deliveryPlanned;
      const tip = PF.deliveryTooltip(i);
      const aria = `Entrega de ${i.id}. ${tip.replace(/\n/g, '. ')}. Editar entrega`;
      const P = i.deliveryPlanned, secondary = [];
      if(P && main && P !== main) secondary.push(`<span class="g-link" style="left:${Math.min(x(P), x(main))}px;width:${Math.abs(x(main) - x(P))}px;border-top-color:${main > P ? 'var(--div-late)' : 'var(--div-early)'}"></span><span class="g-ms g-ms--planned" style="left:${x(P)}px" data-tip="Entrega planejada (original): ${PF.fmtDateFull(P)}"></span>`);
      if(i.deliveryActual && PF.isReprogrammed(i) && i.deliveryCurrent !== i.deliveryActual) secondary.push(`<span class="g-ms g-ms--forecast" style="left:${x(i.deliveryCurrent)}px" data-tip="Última previsão: ${PF.fmtDateFull(i.deliveryCurrent)}"></span>`);
      const ms = main
        ? `<button type="button" class="g-ms${i.deliveryActual ? ' g-ms--done' : ''}" style="left:${x(main)}px" data-action="delivery-edit" data-id="${PF.esc(i.id)}" aria-haspopup="dialog" aria-expanded="false" aria-label="${PF.esc(aria)}" data-tip="${PF.esc(tip)}"></button>`
        : devEnd ? `<button type="button" class="g-ms g-ms--ghost" style="left:${x(devEnd)}px" data-action="delivery-edit" data-id="${PF.esc(i.id)}" aria-haspopup="dialog" aria-expanded="false" aria-label="Definir entrega planejada de ${PF.esc(i.id)}" data-tip="Sem data de entrega · clique para definir"></button>` : '';
      const planned = secondary.join('');
      return `<div class="gantt__row"><div class="gantt__label" style="width:${LABEL_W}px"><div class="cell-name"><button type="button" class="cell-name__title" data-action="open-initiative" data-id="${PF.esc(i.id)}"><span class="mono-id">${PF.esc(i.id)}</span> ${PF.esc(PF.shortName(i.name, 38))}</button><span class="cell-name__sub">${PF.esc(i.squads.join(' + '))} · ${PF.esc(i.phase)}</span></div><span class="st st--${st} tone-${displayTone(i, st)}" data-tip="${PF.DEADLINE_META[st].label}" style="display:inline-flex">${PF.icon(PF.DEADLINE_META[st].icon)}</span></div>
        <div class="gantt__lane" style="width:${width}px">${lines}<span class="gantt__today" style="left:${todayX}px"></span>${disc}${dev}${planned}${ms}</div></div>`; }).join('')}
  </div></div>
  <div class="gantt-legend"><span><i class="lg-disc"></i>Discovery</span><span><i class="lg-dev"></i>DEV → entrega (cor = status de prazo)</span><span><i class="lg-ms"></i>Entrega vigente · clique para reprogramar</span><span><i class="lg-ms lg-ms--planned"></i>Planejada original</span><span><i class="lg-ms lg-ms--done"></i>Entregue</span><span><i style="width:2px;height:12px;background:var(--brand-primary)"></i>Hoje</span></div>`;
}

/* =====================================================================
   RENDER — SPRINTS
   ===================================================================== */
function scopedStories(){ const ids = new Set(PF.filterInitiatives().map(i => i.id)); return PF.appState.stories.filter(s => ids.has(s.initiativeId)); }
function selectedSprint(){ return PF.ctx.sprintById.get(PF.prefs.sprintId) || PF.ctx.currentSprint; }
function renderSprints(){
  const el = PF.$('#view-sprints');
  if(!PF.ctx.sprints.length){ el.innerHTML = `<div class="panel"><div class="empty"><div class="empty__icon">${PF.icon('i-calendar')}</div><div class="empty__title">Nenhuma sprint cadastrada</div><p class="empty__text">Cadastre as sprints ou importe a aba SPRINTS da planilha.</p><div class="empty__actions"><button type="button" class="btn btn-primary" data-action="new-sprint">${PF.icon('i-plus')}Nova sprint</button></div></div></div>`; return; }
  const sp = selectedSprint(); const stories = scopedStories();
  const sm = PF.getSprintMetrics(sp, PF.ctx, stories);
  const cap = PF.calculateSprintCapacity(sp, PF.appState.absences, PF.ctx.today);
  const idx = PF.ctx.sprintIdx.get(sp.id);
  const stateTag = {current:'<span class="tag tag--info">Atual</span>', past:'<span class="tag">Encerrada</span>', future:'<span class="tag">Futura</span>'}[sm.state];
  el.innerHTML = `
  <div class="toolbar" style="padding:0 0 12px">
    <div class="sprint-nav">
      <button type="button" class="btn btn-icon btn-sm" data-action="sprint-step" data-value="-1" aria-label="Sprint anterior"${idx === 0 ? ' disabled' : ''}>${PF.icon('i-left')}</button>
      <button type="button" class="dd-trigger" style="height:28px;min-width:260px" data-action="dd-open" data-dd="sprintnav:" aria-haspopup="listbox" aria-expanded="false" aria-label="Selecionar sprint: ${PF.esc(sp.name)}"><span class="dd-trigger__v" style="flex:1;text-align:left">${PF.esc(sp.name)} · ${PF.fmtDayMonth(sp.start)} – ${PF.fmtDayMonth(sp.end)}${PF.ctx.currentSprint && sp.id === PF.ctx.currentSprint.id ? ' <span class="muted" style="font-weight:400">(atual)</span>' : ''}</span>${PF.icon('i-chevron','ic ic-xs')}</button>
      <button type="button" class="btn btn-icon btn-sm" data-action="sprint-step" data-value="1" aria-label="Próxima sprint"${idx === PF.ctx.sprints.length-1 ? ' disabled' : ''}>${PF.icon('i-right')}</button>
      ${PF.ctx.currentSprint && sp.id !== PF.ctx.currentSprint.id ? `<button type="button" class="btn btn-tertiary btn-sm" data-action="sprint-current">Ir para a atual</button>` : ''}
    </div>
    <div class="toolbar__right"><button type="button" class="btn btn-secondary btn-sm" data-action="new-sprint">${PF.icon('i-plus','ic ic-sm')}Nova sprint</button></div>
  </div>
  <div class="ov-grid">
    <section class="panel col-12 sp-head" aria-label="Resumo da sprint">
      <div class="sp-head__time">
        <div><div class="sp-title">${PF.esc(sp.name)} ${stateTag}</div><div class="sp-dates">${PF.fmtDateFull(sp.start)} – ${PF.fmtDateFull(sp.end)}${sp.release ? ` · ${PF.esc(sp.release)}` : ''}</div><div class="sp-dates">${PF.plural(cap.workingDays,'dia útil','dias úteis')}${cap.calendar.holidays.length ? ` · ${PF.plural(cap.calendar.holidays.length,'feriado','feriados')}` : ''}</div></div>
        <div class="rail"><div class="rail__top"><span>Tempo decorrido</span><b>${sm.elapsedDays} de ${sm.totalDays} dias</b></div><div class="rail__track"><div class="rail__fill rail__fill--time" style="width:${sm.timePct}%"></div></div>
          <span class="rail__note">${sm.state === 'current' ? `${PF.plural(sm.remainingDays,'dia restante','dias restantes')} · ${PF.plural(cap.remainingWorkingDays,'dia útil','dias úteis')}` : sm.state === 'past' ? 'Sprint encerrada' : `Começa em ${PF.plural(PF.daysBetween(PF.ctx.today, sp.start),'dia','dias')}`}</span></div>
        <div class="rail"><div class="rail__top"><span>Trabalho concluído</span><b>${sm.progress == null ? 'Sem escopo' : `${sm.progress}% · ${sm.completed.length} de ${sm.scope.length}`}</b></div><div class="rail__track"><div class="rail__fill rail__fill--work" style="width:${sm.progress || 0}%"></div></div>
          <span class="rail__note">${sm.state === 'current' && sm.progress != null ? (sm.progress + 15 < sm.timePct ? `Ritmo abaixo do tempo decorrido (${sm.timePct}% do prazo consumido)` : 'Ritmo compatível com o tempo decorrido') : '&nbsp;'}</span></div>
      </div>
      <div class="sp-kpis">
        ${spKpi('Planejadas', sm.planned.length, 'Histórias com esta sprint como sprint planejada (compromisso)')}
        ${spKpi('Concluídas', sm.completed.length, 'Throughput: histórias concluídas durante a sprint', {filter:'done'})}
        ${spKpi('Em desenvolvimento', sm.inDev.length, '', {filter:'dev'})}
        ${spKpi('Em homologação', sm.inHomolog.length, '', {filter:'homolog'})}
        ${spKpi('Bloqueadas', sm.blocked.length, 'Itens abertos da sprint marcados como bloqueados', {filter:'blocked', danger:sm.blocked.length > 0})}
        ${spKpi('Transbordos', sm.carryIn.length + sm.carryOut.length, `Entrada: ${sm.carryIn.length} vindas de sprints anteriores\nSaída: ${sm.carryOut.length} planejadas aqui e não concluídas nesta sprint`, {filter:'carry', hint:`${sm.carryIn.length} entrada · ${sm.carryOut.length} saída`})}
        ${spKpi('Lead time médio', sm.leadTimeAvg, `Conclusão − início do DEV, histórias concluídas na sprint${sm.leadTimeSample ? ` (base ${sm.leadTimeSample})` : ''}`, {unit:'dias', na:'Sem dados suficientes'})}
        ${spKpi('Throughput', sm.throughput, 'Histórias concluídas durante a sprint', {unit:'hist.'})}
      </div>
    </section>
    <section class="panel col-12" aria-labelledby="capTitle">${capacityPanel(sp, cap)}</section>
    <section class="panel col-12" aria-labelledby="spItemsTitle">${sprintItems(sp, sm)}</section>
    <section class="panel col-12" aria-labelledby="spHistTitle">${sprintHistory(stories)}</section>
  </div>`;
}
function capacityPanel(sp, cap){
  const cal = cap.calendar;
  const head = `<div class="panel-head"><div><h2 class="panel-title" id="capTitle">Capacidade</h2><p class="panel-sub">Pessoas × dias úteis disponíveis × horas/dia · feriados e ausências reduzem a capacidade, não o período</p></div>
    <button type="button" class="btn btn-secondary btn-sm" data-action="edit-capacity" data-id="${PF.esc(sp.id)}">${PF.icon('i-edit','ic ic-sm')}Equipe e ausências</button></div>`;
  const holidayLines = cal.holidays.map(h => `<div class="cap__holiday">${PF.icon('i-calendar','ic ic-sm')}<b>${PF.fmtDayMonth(h.date)}</b><span>${PF.weekday(h.date)} · ${PF.esc(h.name)}</span><span class="muted">feriado nacional</span></div>`)
    .concat(cal.weekendHolidays.map(h => `<div class="cap__holiday muted">${PF.icon('i-calendar','ic ic-sm')}<b style="color:inherit">${PF.fmtDayMonth(h.date)}</b><span>${PF.weekday(h.date)} · ${PF.esc(h.name)}</span><span>fim de semana, sem impacto</span></div>`)).join('');
  if(!cap.members) return head + `<div class="cap"><div class="cap__summary"><div class="cap__kpis">${spKpi('Dias úteis', cap.workingDays, '', {hint:`de ${cap.workingDaysTheoretical} teóricos`})}${spKpi('Pessoas', 0, '')}</div>${holidayLines ? `<div class="cap__holidays">${holidayLines}</div>` : ''}</div>
    <div class="empty empty--inline"><div class="empty__title" style="font-size:13px">Equipe não definida para esta sprint</div><button type="button" class="btn btn-primary btn-sm" data-action="edit-capacity" data-id="${PF.esc(sp.id)}">Definir equipe</button></div></div>`;
  const hpds = [...new Set(cap.rows.map(r => r.hoursPerDay))];
  const loss = cap.holidayLossHours + cap.absenceLossHours;
  return head + `<div class="cap"><div class="cap__summary"><div class="cap__kpis">
      ${spKpi('Dias úteis', cap.workingDays, 'Segunda a sexta no período, menos feriados nacionais em dia útil', {hint:`de ${cap.workingDaysTheoretical} teóricos`})}
      ${spKpi('Pessoas', cap.members, '', {hint: hpds.length === 1 ? `${fmtHours(hpds[0])} h/dia cada` : 'horas/dia individuais'})}
      ${spKpi('Capacidade disponível', fmtHours(cap.totalHours), 'Soma, por pessoa, de dias úteis disponíveis × horas/dia', {unit:'h', hint:`teórica ${fmtHours(cap.theoreticalHours)} h`})}
      ${spKpi('Redução', fmtHours(loss), '', {unit:'h', hint:`feriados ${fmtHours(cap.holidayLossHours)} h · ausências ${fmtHours(cap.absenceLossHours)} h`})}
    </div>${holidayLines ? `<div class="cap__holidays">${holidayLines}</div>` : ''}</div>
    <div class="cap__table table-wrap" style="border-top:0"><table class="tbl tbl--compact" aria-label="Capacidade por pessoa"><thead><tr><th scope="col">Pessoa</th><th scope="col" class="num">h/dia</th><th scope="col" class="num">Ausências</th><th scope="col" class="num">Dias disponíveis</th><th scope="col" class="num">Horas</th></tr></thead><tbody>
      ${cap.rows.map(r => `<tr><td>${PF.esc(r.member.name)}</td><td class="num">${fmtHours(r.hoursPerDay)}</td>
        <td class="num">${r.absentDays ? `<span data-tip="${PF.esc(Object.entries(r.absenceKinds).map(([k,n]) => `${k}: ${PF.plural(n,'dia útil','dias úteis')}`).join('\n'))}">${PF.plural(r.absentDays,'dia','dias')}</span>` : '<span class="muted">—</span>'}</td>
        <td class="num">${r.availableDays}</td><td class="num"><b style="font-weight:600">${fmtHours(r.hours)}</b></td></tr>`).join('')}
    </tbody></table></div></div>`;
}
function fmtHours(n){ return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','); }
function spKpi(label, value, tip, {unit, na, filter, danger, hint} = {}){
  const val = value == null ? `<span class="sp-kpi__value sp-kpi__value--na">${na || '—'}</span>` : `<span class="sp-kpi__value"${danger ? ' style="color:var(--status-danger)"' : ''}>${value}${unit ? `<small>${unit}</small>` : ''}</span>`;
  const inner = `<span class="sp-kpi__label">${label}</span>${val}${hint ? `<span class="sp-kpi__hint">${hint}</span>` : ''}`;
  if(filter) return `<button type="button" class="sp-kpi sp-kpi--btn" data-action="sprint-filter" data-value="${filter}" aria-pressed="${PF.ui.sprintItemFilter === filter}"${tip ? ` data-tip="${PF.esc(tip)}\nClique para filtrar os itens"` : ' data-tip="Clique para filtrar os itens"'}>${inner}</button>`;
  return `<div class="sp-kpi"${tip ? ` data-tip="${PF.esc(tip)}"` : ''}>${inner}</div>`;
}
function sprintItems(sp, sm){
  const F = {all:'Todos', dev:'Em desenvolvimento', homolog:'Em homologação', blocked:'Bloqueadas', carry:'Transbordos', done:'Concluídas'};
  let items = [...new Set([...sm.scope, ...sm.carryOut])];
  const f = PF.ui.sprintItemFilter;
  if(f === 'dev') items = sm.inDev; else if(f === 'homolog') items = sm.inHomolog; else if(f === 'blocked') items = sm.blocked;
  else if(f === 'carry') items = [...new Set([...sm.carryIn, ...sm.carryOut])]; else if(f === 'done') items = sm.completed;
  const groups = new Map(); items.forEach(s => { if(!groups.has(s.initiativeId)) groups.set(s.initiativeId, []); groups.get(s.initiativeId).push(s); });
  const ord = s => PF.WORKFLOW.indexOf(s.status);
  return `<div class="panel-head"><div><h2 class="panel-title" id="spItemsTitle">Itens da sprint <span class="count-pill">${items.length}</span></h2><p class="panel-sub">Agrupado por iniciativa · expanda um grupo para editar status, sprint e bloqueio na linha</p></div>
    <div class="seg" role="radiogroup" aria-label="Filtrar itens">${Object.entries(F).map(([k,l]) => `<button type="button" role="radio" aria-checked="${f===k}" data-action="sprint-filter" data-value="${k}">${l}</button>`).join('')}</div></div>
  ${!items.length ? `<div class="empty empty--inline"><div class="empty__title" style="font-size:13px">Nenhum item ${f === 'all' ? 'nesta sprint' : 'neste filtro'}</div>${sm.state === 'future' ? '<p class="empty__text" style="font-size:12px">Aloque histórias refinadas nesta sprint pelo detalhe da iniciativa.</p>' : ''}</div>` :
  `<div class="table-wrap"><table class="tbl" aria-label="Itens da sprint"><thead><tr><th scope="col">História</th><th scope="col">Épico</th><th scope="col" style="width:150px">Status</th><th scope="col" style="width:120px">Sprint</th><th scope="col" class="num">Lead time</th><th scope="col">Bloqueio</th><th scope="col">Responsável</th><th scope="col">Planejada</th></tr></thead><tbody>
  ${[...groups.entries()].map(([iid, arr]) => { const init = PF.ctx.initById.get(iid); const open = PF.ui.expandedGroups.has(iid) || groups.size === 1; const st = PF.ctx.initMetrics.get(iid).deadline.status;
    return `<tr class="group-row"><td colspan="8"><button type="button" class="group-toggle" data-action="toggle-group" data-id="${PF.esc(iid)}" aria-expanded="${open}">${PF.icon('i-chevron','ic ic-sm')}<span class="mono-id">${PF.esc(iid)}</span> ${PF.esc(init ? init.name : iid)}</button> <span class="muted" style="font-weight:400;margin-left:8px">${PF.plural(arr.length,'item','itens')} · ${arr.filter(s=>s.status==='Desenvolvimento').length} dev · ${arr.filter(s=>s.status==='Homologação').length} homol. · ${arr.filter(s=>s.status==='Concluída').length} concl.${arr.some(s=>s.blocked&&s.status!=='Concluída') ? ` · <span style="color:var(--status-danger)">${arr.filter(s=>s.blocked&&s.status!=='Concluída').length} bloq.</span>` : ''}</span> <span style="margin-left:10px">${statusBadge(st, null, displayTone(init, st))}</span></td></tr>` +
    (open ? arr.sort((a,b) => ord(a) - ord(b)).map(s => storyTableRow(s, sp)).join('') : ''); }).join('')}
  </tbody></table></div>`}`;
}
function storyTableRow(s, sp){
  const lt = PF.leadTimeOf(s, PF.ctx.today); const carry = PF.isCarryOver(s, PF.ctx);
  return `<tr data-story="${PF.esc(s.id)}"><td><div class="cell-name" style="min-width:200px"><span class="mono-id">${PF.esc(s.id)}</span><span style="font-size:12.5px">${PF.esc(s.title)}</span></div></td>
    <td class="muted">${PF.esc(s.epic) || '—'}</td>
    <td>${statusSelect(s)}</td><td>${sprintSelect(s)}</td>
    <td class="num">${lt.days != null ? `<span data-tip="${lt.kind === 'done' ? 'Lead time (conclusão − início do DEV)' : 'Lead time atual (hoje − início do DEV)'}">${lt.days} d${lt.kind === 'open' ? '<span class="muted"> ↗</span>' : ''}</span>` : `<span class="muted" style="font-size:11.5px">${lt.note}</span>`}</td>
    <td>${blockToggle(s)}${s.blocked && s.blockedReason ? `<span class="story-block-reason" style="display:block;max-width:220px" data-tip="${PF.esc(s.blockedReason)}">${PF.esc(s.blockedReason)}</span>` : ''}</td>
    <td>${PF.esc(s.owner) || '<span class="muted">—</span>'}</td>
    <td>${s.plannedSprint ? `${PF.esc(s.plannedSprint)}${carry ? ` <span class="tag tag--warn" data-tip="Transbordo: sprint planejada ${PF.esc(s.plannedSprint)} ≠ sprint de ${s.status === 'Concluída' ? 'conclusão ' + PF.esc(PF.completionSprintId(s, PF.ctx) || '') : 'execução atual'}">transbordo</span>` : ''}` : '<span class="muted">—</span>'}</td></tr>`;
}
function statusSelect(s){ return `<select class="select status-select" data-change="story-status" data-id="${PF.esc(s.id)}" aria-label="Status de ${PF.esc(s.id)}">${PF.WORKFLOW.map(w => `<option${w === s.status ? ' selected' : ''}>${w}</option>`).join('')}</select>`; }
function sprintSelect(s){ return `<select class="select status-select sprint-select" data-change="story-sprint" data-id="${PF.esc(s.id)}" aria-label="Sprint de ${PF.esc(s.id)}"><option value="">Sem sprint</option>${PF.ctx.sprints.map(sp => `<option value="${PF.esc(sp.id)}"${sp.id === s.sprint ? ' selected' : ''}>${PF.esc(sp.id)}${PF.ctx.currentSprint && sp.id === PF.ctx.currentSprint.id ? ' · atual' : ''}</option>`).join('')}${s.sprint && !PF.ctx.sprintById.has(s.sprint) ? `<option value="${PF.esc(s.sprint)}" selected>${PF.esc(s.sprint)} (inexistente)</option>` : ''}</select>`; }
function blockToggle(s){ const done = s.status === 'Concluída'; return `<button type="button" class="btn btn-icon btn-sm" data-action="toggle-block" data-id="${PF.esc(s.id)}" aria-pressed="${s.blocked}" aria-label="${s.blocked ? 'Desbloquear' : 'Bloquear'} ${PF.esc(s.id)}" data-tip="${done ? 'História concluída' : s.blocked ? `Bloqueada${s.blockedSince ? ' desde ' + PF.fmtDate(s.blockedSince) : ''} — clique para desbloquear` : 'Bloquear história'}"${done ? ' disabled' : ''}>${PF.icon(s.blocked ? 'i-lock' : 'i-unlock','ic ic-sm')}</button>`; }
function sprintHistory(stories){
  const list = PF.ctx.sprints.map(sp => PF.getSprintMetrics(sp, PF.ctx, stories));
  const maxN = Math.max(1, ...list.map(x => Math.max(x.planned.length, x.throughput + x.carryOut.length)));
  return `<div class="panel-head"><div><h2 class="panel-title" id="spHistTitle">Histórico e planejamento de sprints</h2><p class="panel-sub">Throughput e transbordo por sprint · clique na linha para ver as histórias</p></div>
    <div class="legend"><span><span class="swatch wf-Concluída"></span>Concluídas</span><span><span class="swatch" style="background:var(--div-late)"></span>Transbordo (saída)</span></div></div>
  <div class="table-wrap"><table class="tbl" aria-label="Sprints"><thead><tr><th scope="col" style="width:28px"></th><th scope="col">Sprint</th><th scope="col">Período</th><th scope="col">Release</th><th scope="col" class="num">Dias úteis</th><th scope="col" class="num">Capacidade</th><th scope="col" class="num">Planejadas</th><th scope="col">Concluídas / transbordo</th><th scope="col" class="num">% concl.</th><th scope="col" class="num">LT médio</th></tr></thead><tbody>
  ${list.map(x => { const sp = x.sprint; const open = PF.ui.expandedSprints.has(sp.id);
    const row = `<tr class="hist-row ${PF.prefs.sprintId === sp.id || (!PF.prefs.sprintId && PF.ctx.currentSprint && PF.ctx.currentSprint.id === sp.id) ? 'is-selected' : ''}" data-action="toggle-sprint" data-id="${PF.esc(sp.id)}">
      <td><button type="button" class="group-toggle" aria-expanded="${open}" aria-label="Expandir ${PF.esc(sp.name)}" data-action="toggle-sprint" data-id="${PF.esc(sp.id)}">${PF.icon('i-chevron','ic ic-sm')}</button></td>
      <td><b style="font-weight:600">${PF.esc(sp.name)}</b> ${x.state === 'current' ? '<span class="tag tag--info">Atual</span>' : x.state === 'future' ? '<span class="tag">Futura</span>' : ''}</td>
      <td class="cell-date muted">${PF.fmtDayMonth(sp.start)} – ${PF.fmtDayMonth(sp.end)}</td><td class="muted">${PF.esc(sp.release) || '—'}</td>
      ${(c => `<td class="num">${c.workingDays}${c.calendar.holidays.length ? ` <span class="muted" style="font-size:11px" data-tip="${PF.esc(c.calendar.holidays.map(h => `${PF.fmtDate(h.date)} · ${h.name}`).join('\n'))}">· ${PF.plural(c.calendar.holidays.length,'feriado','feriados')}</span>` : ''}</td><td class="num">${c.members ? fmtHours(c.totalHours) + ' h' : '<span class="muted">—</span>'}</td>`)(PF.calculateSprintCapacity(sp, PF.appState.absences, null))}
      <td class="num">${x.planned.length}</td>
      <td><div class="hist-bar"><div class="hist-bar__track" style="width:${Math.max(4, (x.throughput + x.carryOut.length)/maxN*140)}px">${x.throughput ? `<span class="wf-Concluída" style="flex:${x.throughput}"></span>` : ''}${x.carryOut.length ? `<span style="flex:${x.carryOut.length};background:var(--div-late)"></span>` : ''}</div><span class="num" style="font-size:12px">${x.state === 'future' ? '<span class="muted">—</span>' : `${x.throughput} <span class="muted">/ ${x.carryOut.length}</span>`}</span></div></td>
      <td class="num">${x.state === 'future' || x.progress == null ? '<span class="muted">—</span>' : x.progress + '%'}</td>
      <td class="num">${x.leadTimeAvg != null ? x.leadTimeAvg + ' d' : '<span class="muted" style="font-size:11.5px">' + (x.state === 'future' ? '—' : 'Sem dados') + '</span>'}</td></tr>`;
    if(!open) return row;
    const its = [...new Set([...x.scope, ...x.carryOut, ...x.planned])];
    return row + `<tr class="sp-expand"><td colspan="10"><div class="sp-expand__inner">${its.length ? `<table class="tbl"><thead><tr><th>Iniciativa</th><th>Épico</th><th>História</th><th>Status</th><th class="num">Lead time</th><th>Bloqueio</th><th>Responsável</th><th>Planejada → conclusão</th></tr></thead><tbody>
      ${its.sort((a,b) => a.initiativeId.localeCompare(b.initiativeId) || a.id.localeCompare(b.id)).map(s => { const lt = PF.leadTimeOf(s, PF.ctx.today); const cs = PF.completionSprintId(s, PF.ctx);
        return `<tr><td><span class="mono-id">${PF.esc(s.initiativeId)}</span></td><td class="muted">${PF.esc(s.epic)}</td><td>${PF.esc(s.title)}</td><td>${PF.esc(s.status)}</td><td class="num">${lt.days != null ? lt.days + ' d' : '<span class="muted">—</span>'}</td><td>${s.blocked ? '<span style="color:var(--status-danger)">Bloqueada</span>' : '<span class="muted">—</span>'}</td><td>${PF.esc(s.owner) || '—'}</td><td>${PF.esc(s.plannedSprint || '—')} → ${PF.esc(cs || (s.status === 'Concluída' ? '?' : 'em aberto'))}${PF.isCarryOver(s, PF.ctx) ? ' <span class="tag tag--warn">transbordo</span>' : ''}</td></tr>`; }).join('')}</tbody></table>` : '<span class="muted" style="font-size:12px">Nenhuma história planejada ou executada nesta sprint.</span>'}</div></td></tr>`; }).join('')}
  </tbody></table></div>`;
}

/* exporta para os demais módulos */
Object.assign(PF, {statusBadge, displayTone, TONE_FILL, toneFill, statusPill, ownersCell, alignOwnerLines, riskBadge, varianceTag, actualVarianceCell, progressBar, wfBar, emptyBase, emptyFiltered, renderSyncStatus, renderPageMeta, renderSubnav, filterSelect, ddSource, openDropdown, pickDropdown, renderFilterBar, renderActiveFilters, loadingBase, renderView, refresh, renderOverview, kpiBand, attentionPanel, upcomingPanel, phasePanel, variancePanel, squadPanel, blockedList, flowPanel, COLUMNS, COLUMN_GROUPS, COLUMN_PRESETS, currentColumns, activePreset, sortInitiatives, renderInitiatives, ganttView, scopedStories, selectedSprint, renderSprints, capacityPanel, fmtHours, spKpi, sprintItems, storyTableRow, statusSelect, sprintSelect, blockToggle, sprintHistory});
})();
