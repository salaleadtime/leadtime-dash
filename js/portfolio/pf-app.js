/* SALA Lead Time — aba Portfólio · pf-app.js
   aplicação: ações, eventos, montagem em Shadow DOM e API pública (window.SalaPortfolio).
   Módulo clássico (IIFE): nada vaza para o escopo global de index.html além de
   window.SalaPortfolio. Nomes compartilhados entre módulos ficam em PF (namespace interno).
   Ordem de carga: pf-core.js → pf-metrics.js → pf-state.js → pf-import.js → pf-export.js → pf-views.js → pf-panels.js → pf-app.js. */
(function(){
'use strict';
const SP = window.SalaPortfolio = window.SalaPortfolio || {};
const PF = SP.internal = SP.internal || {};

/* =====================================================================
   EVENTOS — delegação única no document (sem listeners duplicados)
   ===================================================================== */
function closePopovers(except){
  PF.$$('.popover:not([hidden]),.menu:not([hidden])').forEach(p => { if(p !== except){ p.hidden = true; const b = PF.$(`[data-pop="${p.id}"],[data-menu="${p.id}"]`); if(b) b.setAttribute('aria-expanded','false'); } });
}
/* v: overview (Painel) · initiatives (Iniciativas) · timeline (Cronograma) · sprints.
   Iniciativas e Cronograma são duas leituras da mesma lista (mesmo escopo e filtros). */
function setView(v){
  if(v === 'timeline'){ PF.prefs.view = 'initiatives'; PF.prefs.initView = 'gantt'; }
  else if(v === 'initiatives'){ PF.prefs.view = 'initiatives'; PF.prefs.initView = 'table'; }
  else PF.prefs.view = v; PF.persistPrefs(); PF.renderFilterBar(); PF.renderActiveFilters(); PF.renderView(); const top = PF.DOM.host.getBoundingClientRect().top; if(top < 0) window.scrollBy({top:top - 8}); }
function setViewQuiet(v){ if(v === 'timeline'){ PF.prefs.view = 'initiatives'; PF.prefs.initView = 'gantt'; } else if(v === 'initiatives'){ PF.prefs.view = 'initiatives'; PF.prefs.initView = 'table'; } else PF.prefs.view = v; }
const ACTIONS = {
  'close-overlay': () => PF.closeOverlay(),
  'sync-retry': () => PF.retrySync(),
  'dd-open': (el) => { if(PF.ui.anchored && PF.ui.anchored.anchor === el){ PF.closeToneMenu(true); return; } PF.openDropdown(el, el.dataset.dd); },
  'dd-pick': (el) => PF.pickDropdown(el.dataset.value),
  'tone-menu': (el) => { if(PF.ui.anchored && PF.ui.anchored.anchor === el){ PF.closeToneMenu(true); return; } PF.openToneMenu(el, el.dataset.id); },
  'set-tone': (el) => PF.setTone(el.dataset.id, el.dataset.value),
  'delivery-edit': (el) => { if(PF.ui.anchored && PF.ui.anchored.anchor === el){ PF.closeToneMenu(true); return; } PF.openDeliveryPop(el, el.dataset.id); },
  'delivery-mode': (el) => { if(PF.ui.anchored) PF.openDeliveryPop(PF.ui.anchored.anchor, PF.ui.anchored.id, el.dataset.value); },
  'delivery-cancel': () => PF.closeToneMenu(true),
  'obs-edit': (el) => { if(PF.ui.anchored && PF.ui.anchored.anchor === el){ PF.closeToneMenu(true); return; } PF.openObsPop(el, el.dataset.id); },
  'obs-history': (el) => { const id = el.dataset.id; PF.closeToneMenu(); PF.openInitiative(id); PF.ui.drawerTab = 'notes'; PF.renderDrawer(); },
  'delivery-undo-actual': () => { if(PF.ui.anchored) PF.undoActualDelivery(PF.ui.anchored.id); },
  'owner-add': () => { const c = PF.$('#ownersEditor'); c.insertAdjacentHTML('beforeend', PF.ownerRow({name:'', area:''}, !c.children.length)); c.lastElementChild.querySelector('input').focus(); },
  'owner-remove': (el) => { const c = PF.$('#ownersEditor'); const row = el.closest('.own-edit-row'); if(c.children.length > 1){ row.remove(); const f = c.querySelector('input'); if(f) f.focus(); } else { row.querySelectorAll('input').forEach(i => i.value = ''); row.querySelector('input').focus(); } },
  'edit-capacity': (el) => PF.openCapacityForm(el.dataset.id),
  'cap-add-member': () => { const c = PF.$('#capMembers'); c.insertAdjacentHTML('beforeend', PF.capMemberRow(null, !c.children.length)); c.lastElementChild.querySelector('[name=memberName]').focus(); PF.syncAbsenceMemberOptions(c.closest('form')); },
  'cap-add-absence': () => { const form = PF.$('#capForm'); const ms = PF.capFormMembers(form); if(!ms.length) return; const c = PF.$('#capAbsences'); c.insertAdjacentHTML('beforeend', PF.capAbsenceRow(null, ms, !c.children.length)); c.lastElementChild.querySelector('select').focus(); },
  'cap-remove-row': (el) => { const row = el.closest('.cap-edit-row,.cap-abs-row'); const form = row.closest('form'); const isMember = row.classList.contains('cap-edit-row');
    if(isMember && PF.$$('.cap-edit-row', form).length === 1){ PF.showToast('A sprint precisa de ao menos uma pessoa', null, 4000, true); return; }
    row.remove(); if(isMember) PF.syncAbsenceMemberOptions(form); },
  'toggle-menu': (el) => { const m = PF.$('#' + el.dataset.menu); const open = m.hidden; closePopovers(m); m.hidden = !open; el.setAttribute('aria-expanded', open); if(open){ const f = m.querySelector('.menu__item'); if(f) f.focus(); } },
  'toggle-popover': (el) => { const p = PF.$('#' + el.dataset.pop); const open = p.hidden; closePopovers(p); p.hidden = !open; el.setAttribute('aria-expanded', open); if(open){ const f = p.querySelector('select,input'); if(f) f.focus(); } },
  'open-initiative': (el) => { if(el.dataset.close) PF.closeOverlay(); PF.openInitiative(el.dataset.id); },
  'edit-initiative': (el) => PF.openInitiativeForm(el.dataset.id),
  'new-initiative': () => PF.openInitiativeForm(null),
  'new-story': (el) => { if(!PF.appState.initiatives.length){ PF.showToast('Cadastre uma iniciativa antes', null, 4000, true); return; } PF.openStoryForm(null, el.dataset.id); },
  'edit-story': (el) => PF.openStoryForm(el.dataset.id),
  'delete-story': (el) => { const id = el.dataset.id; PF.closeOverlay(); PF.commit(s => { s.stories = s.stories.filter(x => x.id !== id); }, {toast:`História ${id} excluída`}); },
  'toggle-block': (el) => PF.toggleBlock(el.dataset.id),
  'drawer-tab': (el) => { PF.ui.drawerTab = el.dataset.value; PF.renderDrawer(); if(el.dataset.focusNote){ const t = PF.$('#noteText'); if(t) t.focus(); } else { const t = PF.drawerOverlay && PF.drawerOverlay.el.querySelector(`[data-action="drawer-tab"][data-value="${el.dataset.value}"][role=tab]`); if(t) t.focus(); } },
  'drawer-story-filter': (el) => { PF.ui.drawerStoryFilter = el.dataset.value; PF.renderDrawer(); },
  'drill-deadline': (el) => { const v = el.dataset.value; PF.prefs.filters.deadline = PF.prefs.filters.deadline === v ? '' : v; PF.persistPrefs(); if(PF.prefs.filters.deadline) setView('initiatives'); else { PF.renderFilterBar(); PF.renderActiveFilters(); PF.renderView(); } },
  'drill-phase': (el) => { PF.prefs.filters.phase = el.dataset.value; PF.persistPrefs(); setView('initiatives'); },
  'drill-squad': (el) => { PF.prefs.filters.squad = el.dataset.value; PF.persistPrefs(); PF.ctx = PF.computeContext(); PF.closeToneMenu(); setView('initiatives'); },
  'goto-view': (el) => setView(el.dataset.value),
  'remove-filter': (el) => PF.setFilter(el.dataset.key, ''),
  'clear-filters': () => PF.clearFilters(),
  'toggle-attn': () => { PF.ui.attnExpanded = !PF.ui.attnExpanded; PF.renderView(); },
  'set-window': (el) => { PF.prefs.upcomingWindow = +el.dataset.value; PF.persistPrefs(); PF.renderView(); const b = PF.$(`[data-action="set-window"][data-value="${el.dataset.value}"]`); if(b) b.focus(); },
  'gantt-zoom': (el) => { PF.prefs.ganttZoom = el.dataset.value; PF.persistPrefs(); PF.renderView(); const b = PF.$(`[data-action="gantt-zoom"][data-value="${el.dataset.value}"]`); if(b) b.focus(); },
  'gantt-group': (el) => { PF.prefs.ganttGroup = el.dataset.value; PF.persistPrefs(); PF.renderView(); const b = PF.$(`[data-action="gantt-group"][data-value="${el.dataset.value}"]`); if(b) b.focus(); },
  'set-init-view': (el) => setView(el.dataset.value === 'gantt' ? 'timeline' : 'initiatives'),
  'goto-scope': (el) => { PF.prefs.scope = PF.SCOPES[el.dataset.value] ? el.dataset.value : 'active'; PF.persistPrefs(); setView('initiatives'); },
  'toggle-squads': (el) => { const id = el.dataset.id, set = PF.ui.expandedSquads; set.has(id) ? set.delete(id) : set.add(id); PF.renderView(); const b = PF.$(`[data-action="toggle-squads"][data-id="${CSS.escape(id)}"]`); if(b) b.focus(); },
  'set-preset': (el) => { PF.prefs.columns = [...PF.COLUMN_PRESETS[el.dataset.value].cols]; PF.persistPrefs(); PF.renderView(); },
  'sort': (el) => { const c = el.dataset.col; PF.prefs.sort = PF.prefs.sort.col === c ? {col:c, dir:PF.prefs.sort.dir === 'asc' ? 'desc' : 'asc'} : {col:c, dir:'asc'}; PF.persistPrefs(); PF.renderView(); const b = PF.$(`[data-action="sort"][data-col="${c}"]`); if(b) b.focus(); },
  'sprint-step': (el) => { const i = PF.ctx.sprintIdx.get(PF.selectedSprint().id) + (+el.dataset.value); const sp = PF.ctx.sprints[i]; if(sp){ PF.prefs.sprintId = sp.id; PF.persistPrefs(); PF.renderView(); } },
  'sprint-current': () => { PF.prefs.sprintId = null; PF.persistPrefs(); PF.renderView(); },
  'sprint-filter': (el) => { PF.ui.sprintItemFilter = PF.ui.sprintItemFilter === el.dataset.value && el.classList.contains('sp-kpi--btn') ? 'all' : el.dataset.value; PF.renderView(); },
  'toggle-group': (el) => { const id = el.dataset.id; PF.ui.expandedGroups.has(id) ? PF.ui.expandedGroups.delete(id) : PF.ui.expandedGroups.add(id); PF.renderView(); const b = PF.$(`[data-action="toggle-group"][data-id="${CSS.escape(id)}"]`); if(b) b.focus(); },
  'toggle-sprint': (el) => { const id = el.dataset.id; PF.ui.expandedSprints.has(id) ? PF.ui.expandedSprints.delete(id) : PF.ui.expandedSprints.add(id); PF.renderView(); const b = PF.$(`button[data-action="toggle-sprint"][data-id="${CSS.escape(id)}"]`); if(b) b.focus(); },
  'new-sprint': () => PF.openSprintForm(),
  'open-settings': () => PF.openSettings(),
  'open-quality': () => PF.openQuality(),
  'open-import': () => PF.openImport(),
  'import-back': () => { const ov = PF.ui.overlays.find(o => o.importApi); if(ov) ov.importApi.back(); },
  'import-apply': () => { const ov = PF.ui.overlays.find(o => o.importApi); if(ov) ov.importApi.apply(); },
  'download-xlsx': () => PF.downloadXlsx(),
  'open-ppt': () => PF.openPpt(),
  'ppt-generate': () => PF.generatePpt(),
  'ppt-copy': () => { const ov = PF.ui.overlays.find(o => o.pptOpts); const json = JSON.stringify(PF.buildExportModel(ov.pptOpts), null, 2); (navigator.clipboard ? navigator.clipboard.writeText(json) : Promise.reject()).then(() => PF.showToast('Modelo copiado'), () => PF.showToast('Não foi possível copiar', null, 4000, true)); },
  'set-theme': (el) => { PF.prefs.theme = el.dataset.value; PF.persistPrefs(); PF.applyAppearance(); PF.refresh(); },
  'reset-colors': () => { PF.prefs.colors = {...PF.DEFAULT_COLORS}; PF.persistPrefs(); PF.applyAppearance(); PF.refresh(); PF.showToast('Cores restauradas'); },
  'reset-rules': () => PF.commit(s => { s.settings.rules = {...PF.DEFAULT_SETTINGS.rules}; s.settings.referenceDate = null; }, {toast:'Regras restauradas'}),
  'ref-today': () => PF.commit(s => { s.settings.referenceDate = null; }, {toast:'Referência: hoje'})
};
/* Delegação única: um listener por tipo de evento na raiz da aba (Shadow DOM). */
function bindEvents(root){
root.addEventListener('click', e => {
  const tab = e.target.closest('.subnav__tab[data-view]'); if(tab){ setView(tab.dataset.view); return; }
  const el = e.target.closest('[data-action]');
  if(!e.target.closest('.popover,.menu,.anchored-pop,[data-action="toggle-popover"],[data-action="toggle-menu"]')) closePopovers();
  if(PF.ui.anchored && !e.target.closest('.anchored-pop,[data-action="tone-menu"],[data-action="delivery-edit"],[data-action="obs-edit"],[data-action="dd-open"]')) PF.closeToneMenu();
  if(!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
  const fn = ACTIONS[el.dataset.action]; if(!fn) return;
  if(el.closest('.menu')) closePopovers();
  e.preventDefault(); PF.hideTip(); fn(el);
});
root.addEventListener('change', e => {
  const el = e.target.closest('[data-change]'); if(!el) return;
  const k = el.dataset.change;
  if(k === 'filter') PF.setFilter(el.dataset.key, el.value);
  else if(k === 'story-status') PF.changeStoryStatus(el.dataset.id, el.value);
  else if(k === 'story-sprint') PF.changeStorySprint(el.dataset.id, el.value);
  else if(k === 'sprint-select'){ PF.prefs.sprintId = el.value; PF.persistPrefs(); PF.renderView(); }
  else if(k === 'toggle-col'){ const ids = new Set(PF.prefs.columns || PF.COLUMN_PRESETS.executiva.cols); el.checked ? ids.add(el.value) : ids.delete(el.value); PF.prefs.columns = PF.COLUMNS.filter(c => !c.always && ids.has(c.id)).map(c => c.id); PF.prefs.columns.unshift(...PF.COLUMNS.filter(c => c.always).map(c => c.id)); const sc = PF.$('#colPop .col-chooser') ? PF.$('#colPop .col-chooser').scrollTop : 0; PF.persistPrefs(); PF.renderView(); const p = PF.$('#colPop'); if(p){ p.hidden = false; PF.$('[data-pop="colPop"]').setAttribute('aria-expanded','true'); const ch = p.querySelector('.col-chooser'); if(ch) ch.scrollTop = sc; const cb = p.querySelector(`input[value="${el.value}"]`); if(cb) cb.focus(); } }
  else if(k === 'color' || k === 'color-hex'){ const v = el.value.trim(); if(!/^#[0-9a-f]{6}$/i.test(v)){ el.setAttribute('aria-invalid','true'); return; } PF.prefs.colors[el.dataset.key] = v.toLowerCase(); PF.persistPrefs(); PF.applyAppearance(); const top = PF.ui.overlays[PF.ui.overlays.length-1]; if(top && top.onRefresh) top.onRefresh(); }
  else if(k === 'rule'){ const v = Math.round(+el.value); if(!isFinite(v) || v < +el.min || v > +el.max){ el.setAttribute('aria-invalid','true'); return; } PF.commit(s => { s.settings.rules[el.dataset.key] = v; }, {toast:'Regra atualizada — portfólio recalculado'}); }
  else if(k === 'ref-date'){ const v = el.value; if(v && !PF.isValidISO(v)) return; PF.commit(s => { s.settings.referenceDate = v || null; }, {toast: v ? `Referência fixada em ${PF.fmtDateFull(v)}` : 'Referência: hoje'}); }
  else if(k === 'ppt-slide' || k === 'ppt-scope' || k === 'ppt-detail'){ const ov = PF.ui.overlays.find(o => o.pptOpts); if(!ov) return; const o = ov.pptOpts;
    if(k === 'ppt-slide'){ o.slides = PF.$$('[data-change="ppt-slide"]', ov.el).filter(x => x.checked).map(x => x.value); }
    else if(k === 'ppt-scope') o.scope = el.value; else o.detailIds = PF.$$('[data-change="ppt-detail"]', ov.el).filter(x => x.checked).map(x => x.value);
    ov.onRefresh(); }
});
root.addEventListener('input', e => {
  if(e.target.id === 'searchInput') onSearch(e.target.value);
  if(e.target.dataset.change === 'color' ){ const v = e.target.value; PF.prefs.colors[e.target.dataset.key] = v; PF.applyAppearance(); const hex = e.target.parentElement.querySelector('[data-change="color-hex"]'); if(hex) hex.value = v; }
});
const onSearch = PF.debounce(v => { PF.prefs.filters.q = v; PF.persistPrefs(); PF.renderActiveFilters(); PF.renderView(); }, 160);
root.addEventListener('submit', e => {
  const f = e.target.closest('form[data-form]'); if(!f) return;
  e.preventDefault();
  const t = f.dataset.form;
  if(t === 'initiative') PF.submitInitiative(f);
  else if(t === 'capacity') PF.submitCapacity(f);
  else if(t === 'delivery') PF.submitDelivery(f);
  else if(t === 'obs') PF.submitObs(f);
  else if(t === 'story') PF.submitStory(f);
  else if(t === 'sprint') PF.submitSprint(f);
  else if(t === 'block'){ const reason = PF.toText(new FormData(f).get('reason')); if(!reason){ f.querySelector('textarea').setAttribute('aria-invalid','true'); f.querySelector('textarea').focus(); return; } const id = f.dataset.id; PF.closeOverlay();
    PF.commit(s => { const x = s.stories.find(y => y.id === id); x.blocked = true; x.blockedReason = reason; x.blockedSince = PF.ctx.today; }, {toast:`${id} bloqueada`}); }
  else if(t === 'note'){ const text = PF.toText(new FormData(f).get('text')); if(!text) return; const id = PF.ui.drawer;
    PF.commit(s => { const i = s.initiatives.find(x => x.id === id); i.notesLog.push({ts:new Date().toISOString(), text}); }, {toast:'Observação adicionada'}); const ta = PF.$('#noteText'); if(ta) ta.focus(); }
});
root.addEventListener('keydown', e => {
  if(e.key === 'Escape' && PF.ui.anchored){ PF.closeToneMenu(true); return; }
  if(e.key === 'Tab' && PF.ui.anchored){
    if(PF.ui.anchored.kind === 'menu' || PF.ui.anchored.kind === 'listbox') PF.closeToneMenu();
    else { const f = PF.$$('button:not([disabled]),input:not([disabled]),select,textarea,summary', PF.ui.anchored.el).filter(x => x.offsetParent !== null); const first = f[0], last = f[f.length-1];
      if(e.shiftKey && PF.activeEl() === first){ e.preventDefault(); last.focus(); } else if(!e.shiftKey && PF.activeEl() === last){ e.preventDefault(); first.focus(); } else if(!PF.ui.anchored.el.contains(PF.activeEl())){ e.preventDefault(); first.focus(); }
      return; }
  }
  if(e.key === 'Escape'){
    const open = PF.$$('.popover:not([hidden]),.menu:not([hidden])');
    if(open.length){ const id = open[0].id; closePopovers(); const b = PF.$(`[data-pop="${id}"],[data-menu="${id}"]`); if(b) b.focus(); return; }
    if(PF.ui.overlays.length){ PF.closeOverlay(); return; }
  }
  PF.trapFocus(e);
  if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key) && e.target.matches('[role=tab],[role=radio]')){
    const group = e.target.closest('[role=tablist],[role=radiogroup]'); if(!group) return;
    const items = PF.$$('[role=tab],[role=radio]', group); const i = items.indexOf(e.target);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length-1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length;
    e.preventDefault(); items[n].focus(); items[n].click();
  }
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key) && e.target.closest('.menu,.tone-menu,.dd-menu')){
    const items = PF.$$('.menu__item,.tone-opt,.dd-opt', e.target.closest('.menu,.tone-menu,.dd-menu')); const i = items.indexOf(e.target);
    const n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    e.preventDefault(); items[n].focus();
  }
  if((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.matches('[data-action="dd-open"]')){ e.preventDefault(); e.target.click(); }
});
root.addEventListener('mouseover', e => { const t = e.target.closest('[data-tip]'); if(t && t !== PF.tipTarget) PF.showTip(t); else if(!t && PF.tipTarget) PF.hideTip(); });
root.addEventListener('focusin', e => { const t = e.target.closest('[data-tip]'); if(t) PF.showTip(t); else PF.hideTip(); });
const onAnyScroll = () => { PF.hideTip(); if(PF.ui.anchored) PF.positionToneMenu(); };
document.addEventListener('scroll', onAnyScroll, true);
root.addEventListener('scroll', onAnyScroll, true);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if(PF.prefs.theme === 'system' && PF.DOM.host){ PF.applyAppearance(); PF.refresh(); } });
window.addEventListener('resize', PF.debounce(() => { if(!isVisible()) return; PF.closeToneMenu(); if(PF.prefs.view === 'initiatives'){ if(PF.prefs.initView === 'gantt') PF.renderView(); else PF.alignOwnerLines(PF.$('#view-initiatives')); } }, 200));

}
function isVisible(){ return !!(PF.DOM.host && PF.DOM.host.offsetParent !== null); }


/* =====================================================================
   APLICAÇÃO — casca da aba, montagem em Shadow DOM e API pública
   ===================================================================== */
function shellHTML(){
  return `<main class="page" id="main">
  <div class="page-head">
    <div>
      <div class="page-eyebrow">Portfólio</div>
      <h1 class="page-title" id="pageTitle">Iniciativas</h1>
      <p class="page-meta" id="pageMeta"></p>
    </div>
    <div class="page-actions">
      <button type="button" class="quality-chip" id="qualityChip" data-action="open-quality" aria-haspopup="dialog"></button>
      <button type="button" class="btn btn-secondary" data-action="open-import">${PF.icon('i-upload')}<span>Importar planilha</span></button>
      <button type="button" class="btn btn-primary" data-action="new-initiative">${PF.icon('i-plus')}Nova iniciativa</button>
      <div class="pop-wrap">
        <button type="button" class="btn btn-icon" data-action="toggle-menu" data-menu="mainMenu" aria-haspopup="menu" aria-expanded="false" aria-label="Mais ações">${PF.icon('i-more')}</button>
        <div class="menu" id="mainMenu" role="menu" hidden>
          <button type="button" class="menu__item" role="menuitem" data-action="open-settings">${PF.icon('i-settings')}Aparência e regras</button>
          <button type="button" class="menu__item" role="menuitem" data-action="open-ppt">${PF.icon('i-slides')}Exportar PowerPoint</button>
          <button type="button" class="menu__item" role="menuitem" data-action="download-xlsx">${PF.icon('i-download')}Baixar base atual (.xlsx)</button>
          <button type="button" class="menu__item" role="menuitem" data-action="new-sprint">${PF.icon('i-calendar')}Nova sprint</button>
        </div>
      </div>
    </div>
  </div>
  <div class="subnav-row">
    <div class="subnav" role="tablist" aria-label="Seções do portfólio">
      <button type="button" role="tab" class="subnav__tab" id="tab-overview" data-view="overview" aria-controls="view-overview">Painel</button>
      <button type="button" role="tab" class="subnav__tab" id="tab-initiatives" data-view="initiatives" aria-controls="view-initiatives">Iniciativas <span class="subnav__count" id="countInitiatives">0</span></button>
      <button type="button" role="tab" class="subnav__tab" id="tab-timeline" data-view="timeline" aria-controls="view-initiatives">Cronograma</button>
      <button type="button" role="tab" class="subnav__tab" id="tab-sprints" data-view="sprints" aria-controls="view-sprints">Sprints</button>
    </div>
    <div class="filterbar" id="filterBar" role="search" aria-label="Filtros do portfólio"></div>
  </div>
  <div class="active-filters" id="activeFilters" aria-live="polite"></div>
  <section id="view-overview" role="tabpanel" aria-labelledby="tab-overview" hidden></section>
  <section id="view-initiatives" role="tabpanel" aria-labelledby="tab-initiatives" hidden></section>
  <section id="view-sprints" role="tabpanel" aria-labelledby="tab-sprints" hidden></section>
</main>
<div id="overlayRoot"></div>
<div id="pfLayer"></div>
<div class="toasts" id="toastRoot" role="status" aria-live="polite"></div>
<div class="tooltip" id="tooltip" role="tooltip"></div>`;
}
/* Monta a aba dentro de `host` (uma única vez). opts.gasUrl = URL /exec do Apps Script
   (a mesma BK_GAS_URL do dashboard); sem URL a aba funciona só com a cópia local. */
function mount(host, opts = {}){
  if(PF.DOM.host) return PF.DOM.host;
  const root = host.shadowRoot || host.attachShadow({mode:'open'});
  const css = opts.cssHref ? `<link rel="stylesheet" href="${PF.esc(opts.cssHref)}">` : '';
  root.innerHTML = css + shellHTML();
  // Evita o "flash" sem estilo: a aba só aparece quando a folha de estilo do Shadow DOM carregou.
  const link = root.querySelector('link[rel="stylesheet"]');
  if(link && !link.sheet){
    host.style.visibility = 'hidden';
    const reveal = () => { host.style.visibility = ''; if(PF.prefs && PF.prefs.view === 'initiatives') PF.renderView(); };
    link.addEventListener('load', reveal, {once:true}); link.addEventListener('error', reveal, {once:true}); setTimeout(reveal, 8000);
  }
  PF.DOM.host = host; PF.DOM.root = root; PF.DOM.layer = root.getElementById('pfLayer');
  PF.DOM.assetBase = opts.assetBase || '';
  PF.sync.url = opts.gasUrl || null;
  PF.appState = PF.loadState();
  PF.prefs = PF.loadPrefs();
  if(['overview','initiatives','timeline','sprints'].includes(opts.view)) setViewQuiet(opts.view);
  PF.applyAppearance();
  bindEvents(root);
  // Atalho "/" para a busca: escuta no documento, só age com a aba visível e sem foco em campo.
  document.addEventListener('keydown', e => {
    if(e.key !== '/' || !isVisible() || PF.ui.overlays.length) return;
    const t = e.composedPath()[0];
    if(t && t.matches && t.matches('input,textarea,select,[contenteditable="true"]')) return;
    const si = PF.$('#searchInput'); if(si){ e.preventDefault(); si.focus(); }
  });
  PF.refresh();
  PF.cloudInitialLoad();
  return host;
}
/* Chamado a cada abertura da aba: redesenha (larguras do Gantt dependem do layout visível). */
function show(){ if(!PF.DOM.host) return; PF.applyAppearance(); PF.refresh(); }
/* API pública: window.SalaPortfolio.{mount, show, onRemoteRevision, …}. Getters preservados. */
const api = Object.defineProperties(window.SalaPortfolio = window.SalaPortfolio || {}, Object.getOwnPropertyDescriptors({
  version:PF.PORTFOLIO_VERSION, mount, show, onRemoteRevision: PF.onRemoteRevision, retrySync: PF.retrySync,
  get state(){ return PF.appState; }, get ctx(){ return PF.ctx; }, get sync(){ return {status:PF.sync.status, revision:PF.sync.revision, pending:PF.sync.pending.length, loaded:PF.sync.loaded}; },
  buildExportModel: PF.buildExportModel, getSprintMetrics: PF.getSprintMetrics, validateData: PF.validateData, calculateDeadlineStatus: PF.calculateDeadlineStatus, getNationalHolidays: PF.getNationalHolidays, calculateSprintCalendar: PF.calculateSprintCalendar,
  calculateSprintCapacity: PF.calculateSprintCapacity, parseOwnerText: PF.parseOwnerText, normalizeOwners: PF.normalizeOwners, deliveryTrail: PF.deliveryTrail, calculateForecastVariance: PF.calculateForecastVariance, calculateActualVariance: PF.calculateActualVariance, exportPptx: PF.exportPptx
}));

/* exporta para os demais módulos */
Object.assign(PF, {closePopovers, setView, ACTIONS, bindEvents, isVisible, shellHTML, mount, show, api});
})();
