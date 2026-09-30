/* SALA Lead Time — aba Portfólio · pf-panels.js
   painéis: overlays, drawer, formulários, aparência, qualidade, popovers, toast e tooltip.
   Módulo clássico (IIFE): nada vaza para o escopo global de index.html além de
   window.SalaPortfolio. Nomes compartilhados entre módulos ficam em PF (namespace interno).
   Ordem de carga: pf-core.js → pf-metrics.js → pf-state.js → pf-import.js → pf-export.js → pf-views.js → pf-panels.js → pf-app.js. */
(function(){
'use strict';
const SP = window.SalaPortfolio = window.SalaPortfolio || {};
const PF = SP.internal = SP.internal || {};

/* =====================================================================
   OVERLAYS — drawer e modal com foco preso, Esc e retorno de foco
   ===================================================================== */
function openOverlay({kind='modal', size='', html, onClose, onRefresh, label, init}){
  const root = PF.$('#overlayRoot');
  const scrim = document.createElement('div'); scrim.className = 'scrim';
  const el = document.createElement('div');
  el.className = kind === 'drawer' ? `drawer ${size}` : `modal ${size}`;
  el.setAttribute('role','dialog'); el.setAttribute('aria-modal','true'); if(label) el.setAttribute('aria-label', label);
  el.innerHTML = html;
  root.append(scrim, el);
  const ov = {el, scrim, kind, onClose, onRefresh, returnFocus:PF.activeEl()};
  PF.ui.overlays.push(ov);
  scrim.addEventListener('click', () => closeOverlay(ov));
  requestAnimationFrame(() => { scrim.classList.add('is-on'); el.classList.add('is-on'); });
  if(init) init(el);
  const f = el.querySelector('[autofocus]') || el.querySelector('input:not([type=hidden]),select,textarea,button:not([data-action=close-overlay])') || el.querySelector('button');
  if(f) setTimeout(() => f.focus(), 30);
  document.body.style.overflow = 'hidden';
  return ov;
}
function closeOverlay(ov = PF.ui.overlays[PF.ui.overlays.length-1]){
  if(!ov) return;
  PF.ui.overlays = PF.ui.overlays.filter(o => o !== ov);
  ov.el.remove(); ov.scrim.remove();
  if(ov.onClose) ov.onClose();
  if(!PF.ui.overlays.length) document.body.style.overflow = '';
  if(ov.returnFocus && ov.returnFocus.isConnected) ov.returnFocus.focus();
}
function trapFocus(e){
  const top = PF.ui.overlays[PF.ui.overlays.length-1]; if(!top || e.key !== 'Tab') return;
  const f = PF.$$('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea,[tabindex]:not([tabindex="-1"])', top.el).filter(x => x.offsetParent !== null);
  if(!f.length) return;
  const first = f[0], last = f[f.length-1];
  const act = PF.activeEl();
  if(e.shiftKey && act === first){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey && act === last){ e.preventDefault(); first.focus(); }
  else if(!top.el.contains(act)){ e.preventDefault(); first.focus(); }
}
function modalFrame(title, sub, body, foot){
  return `<div class="modal__head"><div><h2 class="modal__title">${title}</h2>${sub ? `<p class="modal__sub">${sub}</p>` : ''}</div><button type="button" class="btn btn-icon btn-sm" data-action="close-overlay" aria-label="Fechar">${PF.icon('i-close')}</button></div>
    <div class="modal__body">${body}</div>${foot ? `<div class="modal__foot">${foot}</div>` : ''}`;
}

/* =====================================================================
   DRAWER — detalhe da iniciativa
   ===================================================================== */
PF.drawerOverlay = null;
function openInitiative(id){
  if(!PF.ctx.initById.has(id)) return;
  PF.ui.drawer = id; PF.ui.drawerTab = 'summary'; PF.ui.drawerStoryFilter = 'all';
  if(PF.drawerOverlay && PF.ui.overlays.includes(PF.drawerOverlay)){ renderDrawer(); markSelectedRow(); return; }
  PF.drawerOverlay = openOverlay({kind:'drawer', html:'', label:'Detalhe da iniciativa', onClose:() => { PF.ui.drawer = null; PF.drawerOverlay = null; markSelectedRow(); }});
  renderDrawer(); markSelectedRow();
}
function markSelectedRow(){ PF.$$('tr[data-row]').forEach(tr => tr.classList.toggle('is-selected', tr.dataset.row === PF.ui.drawer)); }
function renderDrawer(){
  if(!PF.drawerOverlay) return;
  const init = PF.ctx.initById.get(PF.ui.drawer);
  if(!init){ closeOverlay(PF.drawerOverlay); return; }
  const m = PF.ctx.initMetrics.get(init.id);
  const el = PF.drawerOverlay.el;
  const body = el.querySelector('.drawer__body'); const scroll = body ? body.scrollTop : 0;
  const focusSel = PF.activeEl() && el.contains(PF.activeEl()) ? focusSelector(PF.activeEl()) : null;
  const tabs = [['summary','Resumo'],['stories',`Histórias <span class="subnav__count">${m.dist.total}</span>`],['notes',`Observações <span class="subnav__count">${init.notesLog.length}</span>`]];
  el.innerHTML = `<div class="drawer__head">
      <div class="drawer__top"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span class="mono-id">${PF.esc(init.id)}</span>${PF.statusPill(init, m)}${PF.riskBadge(init.risk)}</div>
        <button type="button" class="btn btn-icon btn-sm" data-action="close-overlay" aria-label="Fechar detalhe">${PF.icon('i-close')}</button></div>
      <h2 class="drawer__title">${PF.esc(init.name)}</h2>
      <div class="drawer__meta"><span>${PF.esc(init.squads.join(' + ') || 'Sem squad')}</span>${m.multiSquad ? `<span class="tag-ms tag-ms--static">Multi-Squad · ${init.squads.length}</span>` : ''}${init.po ? `<span>PO ${PF.esc(init.po)}</span>` : ''}${init.techLead ? `<span>TL ${PF.esc(init.techLead)}</span>` : ''}</div>
      <div class="drawer__actions">
        <button type="button" class="btn btn-secondary btn-sm" data-action="edit-initiative" data-id="${PF.esc(init.id)}">${PF.icon('i-edit','ic ic-sm')}Editar iniciativa</button>
        <button type="button" class="btn btn-tertiary btn-sm" data-action="new-story" data-id="${PF.esc(init.id)}">${PF.icon('i-plus','ic ic-sm')}Nova história</button>
        <button type="button" class="btn btn-tertiary btn-sm" data-action="drawer-tab" data-value="notes" data-focus-note="1">${PF.icon('i-note','ic ic-sm')}Adicionar observação</button>
      </div>
      <div class="drawer__tabs" role="tablist" aria-label="Seções da iniciativa">${tabs.map(([k,l]) => `<button type="button" role="tab" class="subnav__tab" aria-selected="${PF.ui.drawerTab===k}" data-action="drawer-tab" data-value="${k}">${l}</button>`).join('')}</div>
    </div>
    <div class="drawer__body${m.lifecycle === 'suspended' ? ' is-off' : ''}" role="tabpanel">${PF.ui.drawerTab !== 'notes' ? squadScopeNote(init, m) : ''}${PF.ui.drawerTab === 'summary' ? drawerSummary(init, m) : PF.ui.drawerTab === 'stories' ? drawerStories(init, m) : drawerNotes(init)}</div>`;
  const nb = el.querySelector('.drawer__body'); if(nb) nb.scrollTop = scroll;
  if(focusSel){ const f = el.querySelector(focusSel); if(f) f.focus(); }
}
function focusSelector(node){
  const a = node.getAttribute('data-action'), c = node.getAttribute('data-change'), id = node.getAttribute('data-id'), v = node.getAttribute('data-value');
  if(c) return `[data-change="${c}"]${id ? `[data-id="${CSS.escape(id)}"]` : ''}`;
  if(a) return `[data-action="${a}"]${id ? `[data-id="${CSS.escape(id)}"]` : ''}${v ? `[data-value="${CSS.escape(v)}"]` : ''}`;
  return node.id ? `#${CSS.escape(node.id)}` : null;
}
/* Data anterior riscada, vigente em destaque */
/* Célula/popover mostram SOMENTE o estado vigente (data atual + quantas vezes foi replanejada).
   A sequência de datas anteriores vive exclusivamente no Histórico de entrega. */
function replanCount(init){ return init.deliveryHistory.filter(h => h.type === 'forecast').length; }
function trailHtml(init, fmt = PF.fmtDateFull){
  const n = replanCount(init);
  return `<span class="dl-cur">${fmt(init.deliveryCurrent || init.deliveryPlanned)}</span>${n ? ` <span class="muted dl-count" data-tip="Ver o histórico de entrega">· replanejada ${n}×</span>` : ''}`;
}
function deliveryHistoryList(init){
  const when = iso => PF.fmtDateTime(iso);
  const src = h => h.source === 'import' ? ' <span class="muted">· via importação</span>' : h.source === 'form' ? ' <span class="muted">· via edição</span>' : '';
  const what = h => {
    if(h.type === 'forecast'){ const d = h.from && h.to ? PF.daysBetween(h.from, h.to) : null;
      const why = h.reason ? `<span class="dhist__reason"><b>Motivo:</b> ${PF.esc(h.reason)}</span>` : (h.source === 'import' ? '' : '<span class="dhist__reason muted">Motivo não registrado</span>');
      return `Previsão ${h.from ? `<s class="dl-old">${PF.fmtDateFull(h.from)}</s> → ` : ''}<b style="font-weight:600">${PF.fmtDateFull(h.to)}</b>${d ? ` <span class="muted">(${PF.fmtSigned(d)} d)</span>` : ''}${why}`; }
    if(h.type === 'baseline') return h.from ? `Entrega planejada alterada: <s class="dl-old">${PF.fmtDateFull(h.from)}</s> → <b style="font-weight:600">${PF.fmtDateFull(h.to)}</b>` : `Entrega planejada definida: <b style="font-weight:600">${PF.fmtDateFull(h.to)}</b>`;
    if(h.type === 'actual') return h.from ? `Entrega real corrigida: <s class="dl-old">${PF.fmtDateFull(h.from)}</s> → <b style="font-weight:600">${PF.fmtDateFull(h.to)}</b>` : `Entrega registrada em <b style="font-weight:600">${PF.fmtDateFull(h.to)}</b>`;
    if(h.type === 'actual-removed') return `Registro de entrega desfeito <span class="muted">(era ${PF.fmtDateFull(h.from)})</span>`;
    return PF.esc(h.type);
  };
  return `<ul class="dhist">${[...init.deliveryHistory].reverse().map(h => `<li><span class="dhist__when">${when(h.changedAt)}${h.changedBy ? ` · ${PF.esc(h.changedBy)}` : ''}</span><span class="dhist__what">${what(h)}${src(h)}</span></li>`).join('')}</ul>`;
}
/* Com filtro de Squad ativo, os números do drawer são os da squad — dito explicitamente, com saída em 1 clique. */
function squadScopeNote(init, m){
  const sq = PF.ctx.squadScope; if(!sq) return '';
  return `<div class="scope-note" role="status">${PF.icon('i-filter','ic ic-xs')}<span>Números da Squad <b>${PF.esc(sq)}</b>: ${PF.plural(m.dist.total,'história','histórias')} de ${m.distAll.total} da iniciativa.</span><button type="button" class="btn-link" data-action="remove-filter" data-key="squad">Ver iniciativa inteira</button></div>`;
}
function drawerSummary(init, m){
  const d = m.deadline, v = m.variance;
  const fact = (k, val) => `<div class="fact"><dt>${k}</dt><dd>${val || '<span class="muted">—</span>'}</dd></div>`;
  const cells = [['Total de histórias', m.dist.total],['Backlog', m.dist.byStatus.Backlog],['Em refinamento', m.dist.byStatus.Refinamento],['Refinadas', m.dist.byStatus.Refinada],
    ['Em desenvolvimento', m.dist.byStatus.Desenvolvimento],['Em homologação', m.dist.byStatus['Homologação']],['Concluídas', m.dist.done],['Bloqueadas', m.dist.blocked]];
  const sw = {'Backlog':'Backlog','Em refinamento':'Refinamento','Refinadas':'Refinada','Em desenvolvimento':'Desenvolvimento','Em homologação':'Homologação','Concluídas':'Concluída'};
  return `<div class="callout callout--${d.status}"><div class="callout__title">Por que “${PF.DEADLINE_META[d.status].label}”</div><ul>${d.reasons.map(r => `<li>${PF.esc(r)}</li>`).join('')}</ul>${init.deadlineColorOverride ? `<p class="muted" style="font-size:11.5px;margin-top:6px">Cor exibida ajustada para ${PF.TONE_LABEL[init.deadlineColorOverride]} · a situação calculada não muda</p>` : ''}</div>
    <div class="d-section"><dl class="facts">${fact('Fase', PF.esc(init.phase))}${fact('Situação', PF.esc(init.situation))}${fact('Responsável · área', init.owners.map(o => `${o.name ? PF.esc(o.name) : '<span class="muted">—</span>'}${o.area ? ` <span class="muted">· ${PF.esc(o.area)}</span>` : ''}`).join('<br>'))}${fact('Risco', PF.riskBadge(init.risk))}${fact('Causa / dependência', PF.esc(init.cause))}${fact('Sprints com itens em aberto', m.sprints.map(PF.esc).join(', '))}</dl></div>
    <div class="d-section"><div class="d-section__title">Cronograma ${m.lifecycle === 'suspended' ? '<span class="muted" style="font-weight:400">Iniciativa suspensa · datas apenas para rastreabilidade</span>' : init.deliveryActual ? `<span class="muted" style="font-weight:400">Entregue em ${PF.fmtDateFull(init.deliveryActual)}${v.actual != null ? ` · prazo real ${PF.fmtDeltaDays(v.actual)}` : ''}</span>` : d.target ? `<span class="muted" style="font-weight:400">Data alvo ${PF.fmtDateFull(d.target)}${d.daysTo != null ? ` · ${d.daysTo >= 0 ? `em ${PF.plural(d.daysTo,'dia','dias')}` : `vencida há ${PF.plural(-d.daysTo,'dia','dias')}`}` : ''}</span>` : ''}</div>
      <div class="milestones">
        <div class="milestone milestone--head"><span>Marco</span><span>Previsto / planejado</span><span>Realizado / atual</span><span class="num">Desvio</span></div>
        <div class="milestone"><b>Discovery</b><span class="cell-date">${PF.fmtDate(init.discoveryStart)} → ${PF.fmtDate(init.discoveryEnd)}</span><span class="muted">—</span><span class="num muted">—</span></div>
        <div class="milestone"><b>Início DEV</b><span class="cell-date">${PF.fmtDate(init.devPlanned)}</span><span class="cell-date">${PF.fmtDate(init.devActual)}</span><span class="num">${v.dev != null ? PF.varianceTag(v.dev, 'Início do DEV (realizado − previsto)') : '<span class="muted">—</span>'}</span></div>
        <div class="milestone"><b>Entrega</b><span class="cell-date">${PF.fmtDate(init.deliveryPlanned)}</span><span class="cell-date">${PF.isReprogrammed(init) ? trailHtml(init, PF.fmtDate) : '<span class="muted">sem reprogramação</span>'}</span><span class="num">${v.forecast != null && PF.isReprogrammed(init) ? PF.varianceTag(v.forecast) : '<span class="muted">—</span>'}</span></div>
        <div class="milestone"><b>Entrega real</b><span class="cell-date">${PF.fmtDate(init.deliveryPlanned)}</span><span class="cell-date">${init.deliveryActual ? PF.fmtDate(init.deliveryActual) : '<span class="muted">não entregue</span>'}</span><span class="num">${init.deliveryActual ? PF.actualVarianceCell(init, v.actual) : '<span class="muted">—</span>'}</span></div>
      </div></div>
    ${init.deliveryHistory.length ? `<div class="d-section"><div class="d-section__title">Histórico de entrega</div>${deliveryHistoryList(init)}</div>` : ''}
    ${m.multiSquad ? `<div class="d-section"><div class="d-section__title">Squads envolvidas <span class="muted" style="font-weight:400">${init.squads.length} squads · a iniciativa conta 1 vez no portfólio</span></div>${PF.squadDetail(init, m)}</div>` : ''}
    <div class="d-section"><div class="d-section__title">Histórias ${PF.progressBar(m.progress, m.dist.done, m.dist.total).replace('class="progress"','class="progress" style="width:200px"')}</div>
      <div class="mgrid">${cells.map(([k,n]) => `<div class="mgrid__cell"><span class="mgrid__label">${sw[k] ? `<span class="swatch wf-${sw[k]}"></span>` : k === 'Bloqueadas' ? PF.icon('i-lock','ic ic-xs') : ''}${k}</span><span class="mgrid__value"${k === 'Bloqueadas' && n ? ' style="color:var(--status-danger)"' : ''}>${n}</span></div>`).join('')}</div>
      <div class="facts" style="margin-top:12px">${fact('Lead time médio (concluídas)', m.leadTimeAvg != null ? `${m.leadTimeAvg} dias` : '<span class="muted">Sem dados suficientes</span>')}${fact('Lead time atual médio (em fluxo)', m.openLeadTimeAvg != null ? `${m.openLeadTimeAvg} dias` : '<span class="muted">Sem dados suficientes</span>')}</div></div>
    <div class="d-section"><div class="d-section__title">Observação</div><p style="white-space:pre-wrap;color:var(--text-secondary)">${PF.esc(init.notes) || '<span class="muted">Sem observação.</span>'}</p></div>`;
}
function drawerStories(init, m){
  const f = PF.ui.drawerStoryFilter;
  let list = m.stories;
  if(f === 'open') list = list.filter(s => s.status !== 'Concluída'); else if(f === 'blocked') list = list.filter(s => s.blocked); else if(f === 'flow') list = list.filter(s => PF.OPEN_FLOW.includes(s.status));
  list = [...list].sort((a,b) => PF.WORKFLOW.indexOf(b.status) - PF.WORKFLOW.indexOf(a.status) || a.id.localeCompare(b.id));
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <div class="seg" role="radiogroup" aria-label="Filtrar histórias">${[['all','Todas'],['open','Abertas'],['flow','Em fluxo'],['blocked','Bloqueadas']].map(([k,l]) => `<button type="button" role="radio" aria-checked="${f===k}" data-action="drawer-story-filter" data-value="${k}">${l}</button>`).join('')}</div>
      <button type="button" class="btn btn-secondary btn-sm" data-action="new-story" data-id="${PF.esc(init.id)}">${PF.icon('i-plus','ic ic-sm')}Nova história</button></div>
    ${m.stories.some(s => s.demo) ? `<p class="muted" style="font-size:11.5px;margin-bottom:10px;display:flex;gap:6px;align-items:center">${PF.icon('i-info','ic ic-xs')}Histórias demonstrativas — contagem por etapa conforme o relatório; títulos e datas são ilustrativos.</p>` : ''}
    ${!list.length ? `<div class="empty empty--inline"><div class="empty__title" style="font-size:13px">${m.stories.length ? 'Nenhuma história neste filtro' : 'Nenhuma história cadastrada'}</div>${m.stories.length ? '' : `<button type="button" class="btn btn-primary btn-sm" data-action="new-story" data-id="${PF.esc(init.id)}">${PF.icon('i-plus','ic ic-sm')}Cadastrar história</button>`}</div>` :
    `<div class="story-list">${list.map(s => { const lt = PF.leadTimeOf(s, PF.ctx.today); const carry = PF.isCarryOver(s, PF.ctx);
      return `<div class="story-row ${s.blocked ? 'is-blocked' : ''}"><div class="story-main"><span class="story-title" data-tip="${PF.esc(s.title)}">${PF.esc(s.title)}</span>
        <span class="story-meta"><span class="mono-id">${PF.esc(s.id)}</span>${(() => { const q = PF.storySquadOf(s, init); return q ? `<span>${PF.esc(q)}</span>` : (init.squads.length > 1 ? '<span class="tag">Sem Squad definida</span>' : ''); })()}${s.epic ? `<span>${PF.esc(s.epic)}</span>` : ''}<span>${lt.days != null ? `LT ${lt.days} d${lt.kind === 'open' ? ' (em curso)' : ''}` : PF.esc(lt.note)}</span>${carry ? `<span class="tag tag--warn">transbordo de ${PF.esc(s.plannedSprint)}</span>` : ''}</span>
        ${s.blocked ? `<span class="story-block-reason">${PF.icon('i-lock','ic ic-xs')} ${PF.esc(s.blockedReason || 'Sem motivo informado')}</span>` : ''}</div>
        ${PF.statusSelect(s)}${PF.sprintSelect(s)}${PF.blockToggle(s)}
        <button type="button" class="btn btn-icon btn-sm" data-action="edit-story" data-id="${PF.esc(s.id)}" aria-label="Editar ${PF.esc(s.id)}" data-tip="Editar história">${PF.icon('i-edit','ic ic-sm')}</button></div>`; }).join('')}</div>`}`;
}
function drawerNotes(init){
  const log = [...init.notesLog].sort((a,b) => a.ts < b.ts ? 1 : -1);
  return `<form data-form="note" class="stack" style="margin-bottom:20px"><div class="field"><label for="noteText">Nova observação</label><textarea class="textarea" id="noteText" name="text" rows="3" maxlength="1200" placeholder="Registre decisão, pendência ou ponto de atenção" required></textarea></div>
    <div style="display:flex;justify-content:flex-end"><button type="submit" class="btn btn-primary btn-sm">Adicionar observação</button></div></form>
    ${log.length ? `<div class="notes-log">${log.map(n => `<div class="note"><div class="note__meta">${PF.fmtDateTime(n.ts)}</div><div class="note__text">${PF.esc(n.text)}</div></div>`).join('')}</div>` : '<p class="muted" style="font-size:12px">Nenhuma observação registrada ainda.</p>'}
    ${init.notes ? `<div class="d-section"><div class="d-section__title">Observação do relatório</div><p class="note__text" style="color:var(--text-secondary)">${PF.esc(init.notes)}</p></div>` : ''}`;
}

/* =====================================================================
   FORMULÁRIOS — iniciativa, história, sprint
   ===================================================================== */
function opt(list, val, {empty} = {}){ return (empty != null ? `<option value="">${empty}</option>` : '') + list.map(o => { const [v,l] = Array.isArray(o) ? o : [o,o]; return `<option value="${PF.esc(v)}"${v === val ? ' selected' : ''}>${PF.esc(l)}</option>`; }).join(''); }
function fld(name, label, input, {span, hint} = {}){ return `<div class="field ${span || ''}"><label for="f-${name}">${label}</label>${input}${hint ? `<span class="hint">${hint}</span>` : ''}<span class="error-msg" data-err="${name}" hidden></span></div>`; }
function inp(name, val, {type='text', req, max, list, ph} = {}){ return `<input class="input" id="f-${name}" name="${name}" type="${type}" value="${PF.esc(val ?? '')}"${req ? ' required aria-required="true"' : ''}${max ? ` maxlength="${max}"` : ''}${list ? ` list="${list}"` : ''}${ph ? ` placeholder="${PF.esc(ph)}"` : ''}>`; }
function sel(name, options){ return `<select class="select" id="f-${name}" name="${name}">${options}</select>`; }
function openInitiativeForm(id){
  const init = id ? PF.ctx.initById.get(id) : null;
  const i = init || {id:'', name:'', squads:[], po:'', techLead:'', phase:'Discovery', situation:'Em andamento', risk:'', owners:[], cause:'', notes:''};
  const areas = [...new Set(PF.appState.initiatives.flatMap(PF.ownerAreas))].sort((a,b)=>a.localeCompare(b,'pt'));
  const people = [...new Set(PF.appState.initiatives.flatMap(PF.ownerNames))].sort((a,b)=>a.localeCompare(b,'pt'));
  const squads = PF.FILTER_DEFS.squad.options();
  const body = `<form data-form="initiative" id="initForm" data-edit="${PF.esc(id || '')}" novalidate>
    <datalist id="areaList">${areas.map(a => `<option value="${PF.esc(a)}">`).join('')}</datalist><datalist id="peopleList">${people.map(a => `<option value="${PF.esc(a)}">`).join('')}</datalist>
    <datalist id="squadList">${squads.map(s => `<option value="${PF.esc(s)}">`).join('')}</datalist>
    <div class="form-section"><div class="form-section__title">Identificação</div><div class="form-grid">
      ${fld('id','ID da iniciativa *', inp('id', i.id, {req:true, max:20, ph:'Ex.: 113400'}), {hint: id ? 'O ID não pode ser alterado depois de criado' : ''})}
      ${fld('squads','Squad(s) *', inp('squads', i.squads.join(' + '), {req:true, list:'squadList', ph:'Ex.: Inception + Guardiões'}), {hint:'Separe múltiplas squads com +'})}
      ${fld('name','Nome *', inp('name', i.name, {req:true, max:140}), {span:'span-2'})}
    </div></div>
    <div class="form-section"><div class="form-section__title">PO e Tech Lead</div><div class="form-grid form-grid--3">
      ${fld('po','PO', inp('po', i.po, {max:80}))}${fld('techLead','Tech Lead', inp('techLead', i.techLead, {max:80}))}<div></div>
    </div></div>
    <div class="form-section"><div class="form-section__title">Responsável e área responsável</div>
      <div class="stack" id="ownersEditor" style="gap:8px">${(i.owners.length ? i.owners : [{name:'', area:''}]).map((o,k) => ownerRow(o, k === 0)).join('')}</div>
      <span class="error-msg" data-err="owners" hidden></span>
      <button type="button" class="btn btn-tertiary btn-sm" data-action="owner-add" style="margin-top:8px">${PF.icon('i-plus','ic ic-sm')}Adicionar responsável</button>
    </div>
    <div class="form-section"><div class="form-section__title">Status</div><div class="form-grid form-grid--3">
      ${fld('phase','Fase', sel('phase', opt(PF.PHASES.includes(i.phase) ? PF.PHASES : [...PF.PHASES, i.phase], i.phase)))}
      ${fld('situation','Situação', sel('situation', opt(PF.SITUATIONS, i.situation)), {hint:'Prazo (no prazo, atrasada…) é calculado, não informado'})}
      ${fld('risk','Risco', sel('risk', opt(PF.RISKS, i.risk, {empty:'Não avaliado'})))}
    </div></div>
    <div class="form-section"><div class="form-section__title">Cronograma</div><div class="form-grid form-grid--3">
      ${fld('discoveryStart','Discovery início', inp('discoveryStart', i.discoveryStart, {type:'date'}))}${fld('discoveryEnd','Discovery fim', inp('discoveryEnd', i.discoveryEnd, {type:'date'}))}<div></div>
      ${fld('devPlanned','DEV previsto', inp('devPlanned', i.devPlanned, {type:'date'}))}${fld('devActual','DEV realizado', inp('devActual', i.devActual, {type:'date'}))}<div></div>
      ${fld('deliveryPlanned','Entrega planejada', inp('deliveryPlanned', i.deliveryPlanned, {type:'date'}), {hint: id && i.deliveryPlanned ? 'Baseline: alterar aqui fica registrado no histórico' : ''})}${fld('deliveryCurrent','Entrega atual (reprevisão)', inp('deliveryCurrent', i.deliveryCurrent, {type:'date'}), {hint:'Preencha só se houver nova previsão'})}${fld('deliveryActual','Entrega real', `<input class="input" id="f-deliveryActual" name="deliveryActual" type="date" value="${PF.esc(i.deliveryActual || '')}" max="${PF.ctx.today}">`, {hint:'Data em que a entrega ocorreu'})}
      <div class="field span-3" id="replanWrap" hidden><label for="f-replanReason">Motivo do replanejamento <span class="req" aria-hidden="true">*</span></label><textarea class="textarea" id="f-replanReason" name="replanReason" rows="2" maxlength="300" placeholder="Obrigatório ao alterar a Entrega atual: dependência, escopo, capacidade…"></textarea><span class="error-msg" data-err="replanReason" hidden></span></div>
    </div></div>
    <div class="form-section" style="margin-bottom:0"><div class="form-section__title">Contexto</div><div class="form-grid">
      ${fld('cause','Causa / dependência', inp('cause', i.cause, {max:200}), {span:'span-2'})}
      ${fld('notes','Observação', `<textarea class="textarea" id="f-notes" name="notes" rows="3" maxlength="1200">${PF.esc(i.notes)}</textarea>`, {span:'span-2'})}
    </div></div></form>`;
  openOverlay({size:'', label: id ? 'Editar iniciativa' : 'Nova iniciativa', html: modalFrame(id ? 'Editar iniciativa' : 'Nova iniciativa', id ? `${PF.esc(id)} · ${PF.esc(i.name)}` : 'Campos com * são obrigatórios', body,
    `<span class="muted" style="font-size:12px">Status de prazo e métricas são recalculados ao salvar.</span><div class="modal__foot-right"><button type="button" class="btn btn-tertiary" data-action="close-overlay">Cancelar</button><button type="submit" form="initForm" class="btn btn-primary">${id ? 'Salvar alterações' : 'Criar iniciativa'}</button></div>`),
    init: el => { if(id) el.querySelector('#f-id').readOnly = true;
      const cur = el.querySelector('#f-deliveryCurrent'), wrap = el.querySelector('#replanWrap'), orig = (init && init.deliveryCurrent) || '';
      const sync = () => { wrap.hidden = !(cur.value && cur.value !== orig && cur.value !== (el.querySelector('#f-deliveryPlanned').value || '')); };
      cur.addEventListener('input', sync); el.querySelector('#f-deliveryPlanned').addEventListener('input', sync); sync(); }});
}
/* Toda mudança de data de entrega vira registro no histórico — nenhuma baseline é substituída em silêncio. */
function logDeliveryDiff(old, next, source, reason){
  if((old.deliveryPlanned || null) !== (next.deliveryPlanned || null) && next.deliveryPlanned) PF.recordDeliveryChange(next, 'baseline', old.deliveryPlanned, next.deliveryPlanned, {source});
  if((old.deliveryCurrent || null) !== (next.deliveryCurrent || null) && next.deliveryCurrent) PF.recordDeliveryChange(next, 'forecast', old.deliveryCurrent || old.deliveryPlanned, next.deliveryCurrent, {source, reason: reason || ''});
  if((old.deliveryActual || null) !== (next.deliveryActual || null)) PF.recordDeliveryChange(next, next.deliveryActual ? 'actual' : 'actual-removed', old.deliveryActual, next.deliveryActual, {source, prevSituation:old.situation});
}
function ownerRow(o = {name:'', area:''}, labels = false){
  const lab = (t, f) => `<label class="${labels ? '' : 'sr-only'}" for="${f}">${t}</label>`;
  const k = Math.random().toString(36).slice(2,8);
  return `<div class="own-edit-row"><div class="field">${lab('Responsável','on-'+k)}<input class="input" id="on-${k}" name="ownerName" value="${PF.esc(o.name)}" maxlength="80" list="peopleList" autocomplete="off"></div>
    <div class="field">${lab('Área responsável','oa-'+k)}<input class="input" id="oa-${k}" name="ownerArea" value="${PF.esc(o.area)}" maxlength="60" list="areaList" autocomplete="off"></div>
    <button type="button" class="btn btn-icon" data-action="owner-remove" aria-label="Remover responsável">${PF.icon('i-close','ic ic-sm')}</button></div>`;
}
function submitInitiative(form){
  const fd = Object.fromEntries(new FormData(form).entries());
  const editId = form.dataset.edit;
  const errs = {};
  const id = PF.toText(fd.id);
  if(!id) errs.id = 'Informe o ID'; else if(!editId && PF.ctx.initById.has(id)) errs.id = 'Já existe uma iniciativa com este ID';
  if(!PF.toText(fd.name)) errs.name = 'Informe o nome';
  if(!PF.parseSquads(fd.squads).length) errs.squads = 'Informe ao menos uma squad';
  if(fd.discoveryStart && fd.discoveryEnd && fd.discoveryEnd < fd.discoveryStart) errs.discoveryEnd = 'Fim anterior ao início';
  if(fd.deliveryActual && fd.deliveryActual > PF.ctx.today) errs.deliveryActual = `A entrega real não pode ser futura (referência ${PF.fmtDateFull(PF.ctx.today)})`;
  const fdAll = new FormData(form); const oa = fdAll.getAll('ownerArea');
  const owners = fdAll.getAll('ownerName').map((n,k) => ({name:PF.toText(n), area:PF.toText(oa[k])})).filter(o => o.name || o.area);
  if(owners.some(o => !o.name)) errs.owners = 'Informe o nome do responsável para cada área';
  const oldI = editId ? PF.ctx.initById.get(editId) : null;
  const replanReason = PF.toText(fd.replanReason);
  const curChanged = !!fd.deliveryCurrent && fd.deliveryCurrent !== ((oldI && oldI.deliveryCurrent) || '') && fd.deliveryCurrent !== (fd.deliveryPlanned || '');
  if(curChanged && !replanReason) errs.replanReason = 'Informe o motivo do replanejamento';
  if(!showFormErrors(form, errs)) return;
  const data = PF.normalizeInitiative({...fd, id, squads:fd.squads, risk:fd.risk || null, owners,
    discoveryStart:fd.discoveryStart || null, discoveryEnd:fd.discoveryEnd || null, devPlanned:fd.devPlanned || null, devActual:fd.devActual || null,
    deliveryPlanned:fd.deliveryPlanned || null, deliveryCurrent:fd.deliveryCurrent || null, deliveryActual:fd.deliveryActual || null});
  closeOverlay();
  if(editId){
    PF.commit(s => { const k = s.initiatives.findIndex(x => x.id === editId); const old = s.initiatives[k]; data.notesLog = old.notesLog; data.deadlineColorOverride = old.deadlineColorOverride; data.deliveryHistory = old.deliveryHistory || []; logDeliveryDiff(old, data, 'form', replanReason); s.initiatives[k] = data; }, {toast:`Iniciativa ${editId} atualizada`});
  } else {
    PF.commit(s => { s.initiatives.push(data); }, {toast:`Iniciativa ${id} criada`});
    openInitiative(id);
  }
}
function showFormErrors(form, errs){
  PF.$$('[data-err]', form).forEach(e => { e.hidden = true; e.textContent = ''; });
  PF.$$('[aria-invalid]', form).forEach(e => e.removeAttribute('aria-invalid'));
  const keys = Object.keys(errs);
  keys.forEach(k => { const e = PF.$(`[data-err="${k}"]`, form); const i = PF.$(`[name="${k}"]`, form); if(e){ e.hidden = false; e.textContent = errs[k]; } if(i){ i.setAttribute('aria-invalid','true'); i.setAttribute('aria-describedby', `err-${k}`); } });
  if(keys.length){ const f = PF.$(`[name="${keys[0]}"]`, form); if(f) f.focus(); return false; }
  return true;
}
function nextStoryId(initId){
  let n = 1; const ids = new Set(PF.appState.stories.map(s => s.id));
  while(ids.has(`${initId}-H${PF.pad(n)}`)) n++;
  return `${initId}-H${PF.pad(n)}`;
}
function storySquadOptions(initId, cur){
  const init = PF.ctx.initById.get(initId); const own = init ? init.squads : [];
  const all = PF.FILTER_DEFS.squad.options();
  return [...new Set([...own, ...(cur ? [cur] : []), ...all])];
}
function openStoryForm(id, initId){
  const st = id ? PF.findStory(id) : null;
  const iid = st ? st.initiativeId : (initId || (PF.ui.drawer || PF.appState.initiatives[0]?.id));
  const s = st || {id:nextStoryId(iid), initiativeId:iid, title:'', epic:'', plannedSprint:null, sprint:null, status:'Backlog', blocked:false, blockedReason:'', createdAt:PF.ctx.today, devStartAt:null, homologAt:null, doneAt:null, owner:'', notes:''};
  const spOpts = PF.ctx.sprints.map(sp => [sp.id, `${sp.name} · ${PF.fmtDayMonth(sp.start)}–${PF.fmtDayMonth(sp.end)}`]);
  const body = `<form data-form="story" id="storyForm" data-edit="${PF.esc(id || '')}" novalidate>
    <div class="form-section"><div class="form-section__title">Identificação</div><div class="form-grid">
      ${fld('initiativeId','Iniciativa *', sel('initiativeId', opt(PF.appState.initiatives.map(i => [i.id, `${i.id} · ${PF.shortName(i.name, 50)}`]), s.initiativeId)))}
      ${fld('id','ID da história *', inp('id', s.id, {req:true, max:40}))}
      ${fld('title','Título *', inp('title', s.title, {req:true, max:160}), {span:'span-2'})}
      ${fld('epic','Épico', inp('epic', s.epic, {max:60}))}${fld('owner','Responsável', inp('owner', s.owner, {max:80}))}
      ${fld('squad','Squad', sel('squad', opt(storySquadOptions(iid, s.squad), s.squad || '', {empty:'Sem Squad definida'})), {hint:'Em iniciativa Multi-Squad, a squad não é presumida: informe qual squad executa a história'})}
    </div></div>
    <div class="form-section"><div class="form-section__title">Fluxo</div><div class="form-grid form-grid--3">
      ${fld('status','Status', sel('status', opt(PF.WORKFLOW, s.status)), {hint:'Datas do fluxo são preenchidas automaticamente se vazias'})}
      ${fld('plannedSprint','Sprint planejada', sel('plannedSprint', opt(spOpts, s.plannedSprint, {empty:'Sem sprint'})))}
      ${fld('sprint','Sprint atual / conclusão', sel('sprint', opt(spOpts, s.sprint, {empty:'Sem sprint'})))}
      <div class="field span-3"><label class="toggle"><input type="checkbox" name="blocked" id="f-blocked"${s.blocked ? ' checked' : ''}><span class="toggle__track"></span>História bloqueada</label></div>
      ${fld('blockedReason','Motivo do bloqueio', inp('blockedReason', s.blockedReason, {max:400}), {span:'span-3'})}
    </div></div>
    <div class="form-section"><div class="form-section__title">Datas</div><div class="form-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
      ${fld('createdAt','Criação', inp('createdAt', s.createdAt, {type:'date'}))}${fld('devStartAt','Início DEV', inp('devStartAt', s.devStartAt, {type:'date'}))}
      ${fld('homologAt','Homologação', inp('homologAt', s.homologAt, {type:'date'}))}${fld('doneAt','Conclusão', inp('doneAt', s.doneAt, {type:'date'}))}
    </div></div>
    <div class="form-section" style="margin-bottom:0">${fld('notes','Observação', `<textarea class="textarea" id="f-notes" name="notes" rows="2" maxlength="800">${PF.esc(s.notes)}</textarea>`)}</div></form>`;
  openOverlay({label: id ? 'Editar história' : 'Nova história', html: modalFrame(id ? 'Editar história' : 'Nova história', id ? PF.esc(id) : 'Lead time = conclusão − início do DEV', body,
    `${id ? `<button type="button" class="btn btn-danger" data-action="delete-story" data-id="${PF.esc(id)}">${PF.icon('i-trash','ic ic-sm')}Excluir</button>` : '<span></span>'}<div class="modal__foot-right"><button type="button" class="btn btn-tertiary" data-action="close-overlay">Cancelar</button><button type="submit" form="storyForm" class="btn btn-primary">${id ? 'Salvar alterações' : 'Criar história'}</button></div>`),
    init: el => {
      if(id) el.querySelector('#f-id').readOnly = true;
      const bl = el.querySelector('#f-blocked'), br = el.querySelector('#f-blockedReason');
      const sync = () => { br.disabled = !bl.checked; }; bl.addEventListener('change', sync); sync();
      if(!id){ el.querySelector('#f-initiativeId').addEventListener('change', e => { const f = el.querySelector('#f-id'); if(/-H\d+$/.test(f.value) || !f.value) f.value = nextStoryId(e.target.value); }); }
    }});
}
function submitStory(form){
  const fd = Object.fromEntries(new FormData(form).entries());
  const editId = form.dataset.edit, errs = {};
  const id = PF.toText(fd.id);
  if(!id) errs.id = 'Informe o ID'; else if(!editId && PF.findStory(id)) errs.id = 'Já existe uma história com este ID';
  if(!PF.toText(fd.title)) errs.title = 'Informe o título';
  if(fd.doneAt && fd.devStartAt && fd.doneAt < fd.devStartAt) errs.doneAt = 'Conclusão anterior ao início do DEV';
  if(fd.blocked && !PF.toText(fd.blockedReason)) errs.blockedReason = 'Informe o motivo do bloqueio';
  const ini = PF.ctx.initById.get(fd.initiativeId);
  if(ini && ini.squads.length > 1 && !PF.toText(fd.squad)) errs.squad = 'Informe a Squad: a iniciativa é Multi-Squad e a squad não é presumida';
  if(!showFormErrors(form, errs)) return;
  const prev = editId ? PF.findStory(editId) : null;
  const st = PF.normalizeStory({...fd, id, blocked:!!fd.blocked, plannedSprint:fd.plannedSprint || null, sprint:fd.sprint || null,
    createdAt:fd.createdAt || null, devStartAt:fd.devStartAt || null, homologAt:fd.homologAt || null, doneAt:fd.doneAt || null, demo: prev ? prev.demo : false,
    status: prev ? prev.status : 'Backlog', blockedSince: prev && prev.blocked ? prev.blockedSince : (fd.blocked ? PF.ctx.today : null)});
  PF.applyStatusTransition(st, fd.status, PF.ctx.today);
  if(fd.status !== 'Concluída' && fd.doneAt) st.doneAt = null;
  if(st.status !== 'Concluída' && !st.blocked){ st.blockedReason = ''; st.blockedSince = null; }
  closeOverlay();
  PF.commit(s => { if(editId){ const k = s.stories.findIndex(x => x.id === editId); s.stories[k] = st; } else s.stories.push(st); }, {toast: editId ? `História ${id} atualizada` : `História ${id} criada`});
}
function openSprintForm(){
  const last = PF.ctx.sprints[PF.ctx.sprints.length-1];
  const n = PF.ctx.sprints.length + 1;
  const start = last ? PF.addDays(last.end, 1) : PF.ctx.today;
  const lenDays = last ? PF.daysBetween(last.start, last.end) : 13;
  const body = `<form data-form="sprint" id="sprintForm" novalidate><div class="form-grid">
    ${fld('id','ID *', inp('id', `S${PF.pad(n)}`, {req:true, max:12}))}${fld('name','Nome *', inp('name', `Sprint ${PF.pad(n)}`, {req:true, max:40}))}
    ${fld('start','Início *', inp('start', start, {type:'date', req:true}))}${fld('end','Fim *', inp('end', PF.addDays(start, lenDays), {type:'date', req:true}), {hint:`Sugestão: mesma duração da última sprint (${lenDays+1} dias)`})}
    ${fld('release','Release', inp('release', last ? last.release : '', {max:40}), {span:'span-2'})}</div></form>`;
  openOverlay({size:'modal--sm', label:'Nova sprint', html: modalFrame('Nova sprint', 'Sprints não têm limite de quantidade', body,
    `<div class="modal__foot-right"><button type="button" class="btn btn-tertiary" data-action="close-overlay">Cancelar</button><button type="submit" form="sprintForm" class="btn btn-primary">Criar sprint</button></div>`)});
}
function submitSprint(form){
  const fd = Object.fromEntries(new FormData(form).entries()); const errs = {};
  const id = PF.toText(fd.id);
  if(!id) errs.id = 'Informe o ID'; else if(PF.ctx.sprintById.has(id)) errs.id = 'ID já existe';
  if(!PF.toText(fd.name)) errs.name = 'Informe o nome';
  if(!PF.isValidISO(fd.start)) errs.start = 'Data inválida';
  if(!PF.isValidISO(fd.end)) errs.end = 'Data inválida'; else if(fd.start && fd.end < fd.start) errs.end = 'Fim anterior ao início';
  if(!errs.start && !errs.end){ const ov = PF.ctx.sprints.find(s => !(fd.end < s.start || fd.start > s.end)); if(ov) errs.start = `Período sobrepõe ${ov.name}`; }
  if(!showFormErrors(form, errs)) return;
  closeOverlay();
  const last = PF.ctx.sprints[PF.ctx.sprints.length-1];
  PF.commit(s => { s.sprints.push({id, name:PF.toText(fd.name), start:fd.start, end:fd.end, release:PF.toText(fd.release), capacity:{members:PF.clone(last && last.capacity ? last.capacity.members : [])}}); }, {toast:`${PF.toText(fd.name)} criada`});
}

function openCapacityForm(sprintId){
  const sp = PF.ctx.sprintById.get(sprintId); if(!sp) return;
  const members = (sp.capacity && sp.capacity.members) || [];
  const ids = new Set(members.map(m => m.id));
  const abs = (PF.appState.absences || []).filter(a => ids.has(a.memberId) && !(a.to < sp.start || a.from > sp.end));
  const body = `<form data-form="capacity" id="capForm" data-sprint="${PF.esc(sp.id)}" novalidate>
    <div class="form-section"><div class="form-section__title">Equipe da sprint</div>
      <div class="stack" id="capMembers" style="gap:8px">${members.map((m,k) => capMemberRow(m, k === 0)).join('') || capMemberRow(null, true)}</div>
      <span class="error-msg" data-err="members" hidden></span>
      <button type="button" class="btn btn-tertiary btn-sm" data-action="cap-add-member" style="margin-top:8px">${PF.icon('i-plus','ic ic-sm')}Adicionar pessoa</button>
      <label class="checkbox" style="margin-top:12px;font-size:12px"><input type="checkbox" name="applyFuture">Aplicar esta equipe também às sprints futuras</label></div>
    <div class="form-section" style="margin-bottom:0"><div class="form-section__title">Férias, ausências e afastamentos</div>
      <div class="stack" id="capAbsences" style="gap:8px">${abs.map((a,k) => capAbsenceRow(a, members, k === 0)).join('')}</div>
      <span class="error-msg" data-err="absences" hidden></span>
      <button type="button" class="btn btn-tertiary btn-sm" data-action="cap-add-absence" style="margin-top:8px">${PF.icon('i-plus','ic ic-sm')}Adicionar ausência</button>
      <p class="hint muted" style="font-size:11.5px;margin-top:8px">Dias de ausência que caem em feriado ou fim de semana não são descontados de novo.</p></div></form>`;
  openOverlay({label:'Equipe e ausências', html: modalFrame(`Equipe e ausências · ${PF.esc(sp.name)}`, `${PF.fmtDateFull(sp.start)} – ${PF.fmtDateFull(sp.end)} · ${PF.plural(PF.calculateSprintCalendar(sp).available.length,'dia útil','dias úteis')}`, body,
    `<span></span><div class="modal__foot-right"><button type="button" class="btn btn-tertiary" data-action="close-overlay">Cancelar</button><button type="submit" form="capForm" class="btn btn-primary">Salvar capacidade</button></div>`),
    init: el => { el.addEventListener('input', e => { if(e.target.name === 'memberName') syncAbsenceMemberOptions(el); }); }});
}
function capMemberRow(m, labels){
  m = m || {id:'m' + Date.now().toString(36) + Math.random().toString(36).slice(2,5), name:'', hoursPerDay:PF.DEFAULT_TEAM.hoursPerDay};
  const k = Math.random().toString(36).slice(2,8), lab = (t, f) => `<label class="${labels ? '' : 'sr-only'}" for="${f}">${t}</label>`;
  return `<div class="cap-edit-row" data-member="${PF.esc(m.id)}"><input type="hidden" name="memberId" value="${PF.esc(m.id)}">
    <div class="field">${lab('Pessoa','cm-'+k)}<input class="input" id="cm-${k}" name="memberName" value="${PF.esc(m.name)}" maxlength="60" autocomplete="off"></div>
    <div class="field">${lab('Horas/dia','ch-'+k)}<input class="input" id="ch-${k}" name="memberHours" type="number" min="0.5" max="12" step="0.5" value="${PF.esc(m.hoursPerDay)}"></div>
    <button type="button" class="btn btn-icon" data-action="cap-remove-row" aria-label="Remover pessoa">${PF.icon('i-close','ic ic-sm')}</button></div>`;
}
function capAbsenceRow(a, members, labels){
  a = a || {id:'', memberId:(members[0] || {}).id, from:'', to:'', kind:'Férias'};
  const k = Math.random().toString(36).slice(2,8), lab = (t, f) => `<label class="${labels ? '' : 'sr-only'}" for="${f}">${t}</label>`;
  return `<div class="cap-abs-row"><input type="hidden" name="absId" value="${PF.esc(a.id)}">
    <div class="field">${lab('Pessoa','am-'+k)}<select class="select" id="am-${k}" name="absMember">${members.map(m => `<option value="${PF.esc(m.id)}"${m.id === a.memberId ? ' selected' : ''}>${PF.esc(m.name || 'Sem nome')}</option>`).join('')}</select></div>
    <div class="field">${lab('Tipo','ak-'+k)}<select class="select" id="ak-${k}" name="absKind">${PF.ABSENCE_KINDS.map(t => `<option${t === a.kind ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
    <div class="field">${lab('De','af-'+k)}<input class="input" id="af-${k}" type="date" name="absFrom" value="${PF.esc(a.from)}"></div>
    <div class="field">${lab('Até','at-'+k)}<input class="input" id="at-${k}" type="date" name="absTo" value="${PF.esc(a.to)}"></div>
    <button type="button" class="btn btn-icon" data-action="cap-remove-row" aria-label="Remover ausência">${PF.icon('i-close','ic ic-sm')}</button></div>`;
}
function capFormMembers(root){ return PF.$$('.cap-edit-row', root).map(r => ({id:r.querySelector('[name=memberId]').value, name:r.querySelector('[name=memberName]').value})); }
function syncAbsenceMemberOptions(root){
  const ms = capFormMembers(root);
  PF.$$('select[name=absMember]', root).forEach(sel => { const v = sel.value; sel.innerHTML = ms.map(m => `<option value="${PF.esc(m.id)}"${m.id === v ? ' selected' : ''}>${PF.esc(m.name || 'Sem nome')}</option>`).join(''); });
}
function submitCapacity(form){
  const sp = PF.ctx.sprintById.get(form.dataset.sprint); const errs = {};
  const members = PF.$$('.cap-edit-row', form).map(r => ({id:r.querySelector('[name=memberId]').value, name:PF.toText(r.querySelector('[name=memberName]').value), hoursPerDay:+r.querySelector('[name=memberHours]').value}));
  if(members.some(m => !m.name)) errs.members = 'Informe o nome de cada pessoa';
  else if(members.some(m => !(m.hoursPerDay >= 0.5 && m.hoursPerDay <= 12))) errs.members = 'Horas/dia deve estar entre 0,5 e 12';
  else if(new Set(members.map(m => PF.normKey(m.name))).size !== members.length) errs.members = 'Há pessoas com o mesmo nome';
  const absRows = PF.$$('.cap-abs-row', form).map(r => ({id:r.querySelector('[name=absId]').value || 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2,6),
    memberId:r.querySelector('[name=absMember]').value, kind:r.querySelector('[name=absKind]').value, from:r.querySelector('[name=absFrom]').value, to:r.querySelector('[name=absTo]').value}));
  if(absRows.some(a => !PF.isValidISO(a.from) || !PF.isValidISO(a.to))) errs.absences = 'Informe datas válidas de início e fim';
  else if(absRows.some(a => a.to < a.from)) errs.absences = 'Fim da ausência anterior ao início';
  else if(absRows.some(a => !members.some(m => m.id === a.memberId))) errs.absences = 'Ausência vinculada a pessoa removida';
  if(!showFormErrors(form, errs)) return;
  const applyFuture = form.querySelector('[name=applyFuture]').checked;
  const shownIds = new Set((PF.appState.absences || []).filter(a => (sp.capacity.members || []).some(m => m.id === a.memberId) && !(a.to < sp.start || a.from > sp.end)).map(a => a.id));
  closeOverlay();
  PF.commit(s => {
    const target = s.sprints.find(x => x.id === sp.id); target.capacity = {members};
    if(applyFuture) s.sprints.filter(x => x.start > sp.start).forEach(x => { x.capacity = {members:PF.clone(members)}; });
    s.absences = (s.absences || []).filter(a => !shownIds.has(a.id)).concat(absRows);
    if(s.metadata.teamSource === 'demo') s.metadata.teamSource = 'manual';
  }, {toast:`Capacidade de ${sp.name} atualizada`});
}

/* =====================================================================
   APARÊNCIA E REGRAS
   ===================================================================== */
function hexToRgb(h){ const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if(!m) return null; const n = parseInt(m[1],16); return [n>>16 & 255, n>>8 & 255, n & 255]; }
function rgbToHex([r,g,b]){ return '#' + [r,g,b].map(v => Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join(''); }
function mix(a, b, t){ const x = hexToRgb(a), y = hexToRgb(b); return rgbToHex(x.map((v,k) => v + (y[k]-v)*t)); }
function luminance(h){ const c = hexToRgb(h).map(v => { v /= 255; return v <= .03928 ? v/12.92 : ((v+.055)/1.055) ** 2.4; }); return .2126*c[0] + .7152*c[1] + .0722*c[2]; }
function contrastOn(h){ const L = luminance(h); return (1.05)/(L+.05) >= (L+.05)/(.05) ? '#ffffff' : '#111827'; }
function resolvedTheme(){ return PF.prefs.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : PF.prefs.theme; }
function applyAppearance(){
  const dark = resolvedTheme() === 'dark';
  if(!PF.DOM.host) return;
  PF.DOM.host.dataset.theme = dark ? 'dark' : 'light';
  const r = PF.DOM.host.style, c = PF.prefs.colors;
  const surface = dark ? '#161c25' : '#ffffff';
  r.setProperty('--brand-primary', c.primary);
  r.setProperty('--brand-primary-hover', mix(c.primary, '#000000', .16));
  r.setProperty('--brand-primary-soft', mix(c.primary, surface, dark ? .78 : .9));
  r.setProperty('--brand-primary-contrast', contrastOn(c.primary));
  r.setProperty('--brand-secondary', dark ? mix(c.secondary, '#000000', .35) : c.secondary);
  r.setProperty('--brand-secondary-contrast', contrastOn(dark ? mix(c.secondary, '#000000', .35) : c.secondary));
  const acc = dark ? mix(c.accent, '#ffffff', .35) : c.accent;
  r.setProperty('--brand-accent', acc);
  r.setProperty('--brand-accent-soft', mix(c.accent, surface, dark ? .8 : .9));
}
function openSettings(){
  const html = () => {
    const r = PF.appState.settings.rules;
    const colorRow = (k, label, hint) => `<div class="color-row"><div><div style="font-size:13px;font-weight:500">${label}</div><div class="muted" style="font-size:11.5px">${hint}</div></div>
      <input type="color" value="${PF.esc(PF.prefs.colors[k])}" data-change="color" data-key="${k}" aria-label="${label}"><input class="input input-sm" value="${PF.esc(PF.prefs.colors[k])}" data-change="color-hex" data-key="${k}" aria-label="${label} (hex)" maxlength="7"></div>`;
    const num = (k, label, hint, min, max) => `<div class="field"><label for="r-${k}">${label}</label><input class="input" id="r-${k}" type="number" min="${min}" max="${max}" value="${r[k]}" data-change="rule" data-key="${k}"><span class="hint">${hint}</span></div>`;
    return `<div class="drawer__head" style="padding-bottom:14px"><div class="drawer__top"><h2 class="drawer__title" style="margin:0">Aparência e regras</h2><button type="button" class="btn btn-icon btn-sm" data-action="close-overlay" aria-label="Fechar">${PF.icon('i-close')}</button></div><p class="muted" style="font-size:12px;margin-top:4px">Aparência é pessoal (salva neste navegador). Regras afetam o cálculo de prazo de todo o portfólio.</p></div>
    <div class="drawer__body">
      <div class="settings-group"><div class="settings-group__title">Tema</div><div class="settings-group__sub">Preferência individual, salva neste navegador.</div>
        <div class="seg" role="radiogroup" aria-label="Tema">${[['light','Claro'],['dark','Escuro'],['system','Usar configuração do sistema']].map(([k,l]) => `<button type="button" role="radio" aria-checked="${PF.prefs.theme===k}" data-action="set-theme" data-value="${k}">${l}</button>`).join('')}</div></div>
      <div class="settings-group"><div class="settings-group__title">Cores da marca</div><div class="settings-group__sub">Aplicadas em tempo real. Status de prazo têm cores fixas para não perder significado.</div>
        <div class="stack">${colorRow('primary','Cor principal','Ação primária, aba ativa, destaque de seleção')}${colorRow('secondary','Cor secundária','Barra do produto')}${colorRow('accent','Cor de destaque','Foco, links, filtros ativos')}</div>
        <button type="button" class="btn btn-secondary btn-sm" data-action="reset-colors" style="margin-top:14px">${PF.icon('i-reset','ic ic-sm')}Restaurar padrão</button></div>
      <div class="settings-group"><div class="settings-group__title">Regras de prazo</div><div class="settings-group__sub">Parâmetros do cálculo central de status. Alterar aqui recalcula todo o portfólio.</div>
        <div class="form-grid">${num('attentionDaysThreshold','Janela de atenção (dias)','Entrega a até N dias → avalia progresso',1,120)}${num('attentionProgressThreshold','Progresso mínimo (%)','Abaixo disso, na janela, vira Atenção',0,100)}
        ${num('devStartSlipToleranceDays','Tolerância de início do DEV (dias)','Atraso de início acima disso → Atenção',0,60)}${num('replanToleranceDays','Tolerância de replanejamento (dias)','Entrega atual ≠ planejada acima disso → Replanejada (Atrasada só quando a data vigente vence)',0,60)}</div>
        <div class="field" style="margin-top:12px"><label for="r-ref">Data de referência</label><div style="display:flex;gap:8px"><input class="input" id="r-ref" type="date" value="${PF.esc(PF.appState.settings.referenceDate || '')}" data-change="ref-date" style="max-width:180px"><button type="button" class="btn btn-tertiary btn-sm" data-action="ref-today" style="height:32px">Usar hoje</button></div><span class="hint">Vazio = hoje. Útil para reproduzir um corte (ex.: reunião semanal) ou congelar o snapshot do PowerPoint.</span></div>
        <button type="button" class="btn btn-secondary btn-sm" data-action="reset-rules" style="margin-top:14px">${PF.icon('i-reset','ic ic-sm')}Restaurar regras padrão</button></div>
    </div>`;
  };
  const ov = openOverlay({kind:'drawer', size:'drawer--narrow', label:'Aparência e regras', html:html()});
  ov.onRefresh = () => { const b = ov.el.querySelector('.drawer__body'); const st = b ? b.scrollTop : 0; const fs = PF.activeEl() && ov.el.contains(PF.activeEl()) ? focusSelector(PF.activeEl()) : null; ov.el.innerHTML = html(); const nb = ov.el.querySelector('.drawer__body'); if(nb) nb.scrollTop = st; if(fs){ const f = ov.el.querySelector(fs); if(f) f.focus(); } };
}

/* =====================================================================
   QUALIDADE DE DADOS — modal
   ===================================================================== */
function issueList(issues){
  const ic = {error:'i-error', warning:'i-attention', info:'i-info'};
  const lbl = {error:'Erro', warning:'Alerta', info:'Informativo'};
  return `<div class="issues">${issues.map(i => `<div class="issue issue--${i.level}">${PF.icon(ic[i.level],'ic ic-sm')}<span class="issue__ent">${PF.esc(i.entity)} ${PF.esc(i.id)}</span><span>${PF.esc(i.message)}</span>${i.entity === 'Iniciativa' && PF.ctx && PF.ctx.initById.has(i.id) ? `<button type="button" class="btn-link" data-action="open-initiative" data-id="${PF.esc(i.id)}" data-close="1">Abrir</button>` : i.entity === 'História' && PF.findStory(i.id) ? `<button type="button" class="btn-link" data-action="edit-story" data-id="${PF.esc(i.id)}">Editar</button>` : `<span class="muted" style="font-size:11px">${lbl[i.level]}</span>`}</div>`).join('')}</div>`;
}
function openQuality(){
  const html = () => {
    const q = PF.ctx.quality; const issues = [...PF.ctx.issues].sort((a,b) => ['error','warning','info'].indexOf(a.level) - ['error','warning','info'].indexOf(b.level));
    return modalFrame('Qualidade dos dados', `${q.total} registros avaliados · ${q.invalid} com erro ou alerta`,
      `<div class="import-summary"><div><b>${q.score == null ? '—' : q.score + '%'}</b><span>registros válidos</span></div><div><b>${q.errors}</b><span>erros</span></div><div><b>${q.warnings}</b><span>alertas</span></div><div><b>${q.infos}</b><span>informativos</span></div></div>
      ${issues.length ? issueList(issues) : '<div class="empty empty--inline"><div class="empty__icon">' + PF.icon('i-ok') + '</div><div class="empty__title" style="font-size:13px">Nenhuma inconsistência encontrada</div></div>'}
      <p class="muted" style="font-size:11.5px;margin-top:10px">Informativos não reduzem o percentual. As mesmas regras são aplicadas na importação de planilha.</p>`, null);
  };
  const ov = openOverlay({label:'Qualidade dos dados', html:html()});
  ov.onRefresh = () => { ov.el.innerHTML = html(); };
}
/* =====================================================================
   SELETOR DE COR DO PRAZO (somente visual)
   ===================================================================== */
function openToneMenu(anchor, id){
  closeToneMenu();
  const init = PF.ctx.initById.get(id); if(!init) return;
  const st = PF.ctx.initMetrics.get(id).deadline.status, auto = PF.AUTO_TONE[st], ov = init.deadlineColorOverride;
  const check = `<svg class="ic ic-sm tone-opt__check" aria-hidden="true"><use href="#i-ok"/></svg>`;
  const el = document.createElement('div');
  el.className = 'tone-menu anchored-pop'; el.setAttribute('role','menu'); el.setAttribute('aria-label',`Cor exibida do prazo de ${id}`);
  el.innerHTML = `<div class="tone-menu__head"><div class="tone-menu__k">Situação calculada</div><div class="tone-menu__v st--${st} tone-icon tone-${auto}">${PF.icon(PF.DEADLINE_META[st].icon,'ic ic-sm')}${PF.DEADLINE_META[st].label}</div></div>
    ${Object.entries(PF.TONES).map(([k,t]) => `<button type="button" class="tone-opt tone-${k}" role="menuitemradio" aria-checked="${ov === k}" data-action="set-tone" data-id="${PF.esc(id)}" data-value="${k}"><span class="tone-opt__sw"></span>${t.label}${k === auto ? '<small>automática</small>' : ''}${check}</button>`).join('')}
    <div class="menu__sep" role="separator"></div>
    <button type="button" class="tone-opt" role="menuitemradio" aria-checked="${!ov}" data-action="set-tone" data-id="${PF.esc(id)}" data-value="auto"><span class="tone-opt__sw tone-opt__sw--auto">${PF.icon('i-reset','ic ic-xs')}</span>Usar cor automática${check}</button>`;
  PF.DOM.layer.appendChild(el);
  anchor.setAttribute('aria-expanded','true');
  PF.ui.anchored = {el, anchor, id, kind:'menu', inDrawer: !!anchor.closest('.drawer')};
  positionToneMenu();
  const f = el.querySelector('[aria-checked="true"]') || el.querySelector('.tone-opt'); f.focus();
}
function positionToneMenu(){
  const t = PF.ui.anchored; if(!t) return;
  // Tabela redesenhada (filtro, sincronização) com o editor aberto: reancora na célula nova da mesma iniciativa.
  if(!t.anchor.isConnected && t.kind === 'obs'){ const a = PF.$(`[data-action="obs-edit"][data-id="${CSS.escape(t.id)}"]`); if(a){ t.anchor = a; a.setAttribute('aria-expanded','true'); } }
  const r = t.anchor.getBoundingClientRect();
  const clip = t.anchor.closest('.gantt,.table-wrap'); const cr = clip ? clip.getBoundingClientRect() : null;
  if(!t.anchor.isConnected || r.bottom < 0 || r.top > innerHeight || (cr && (r.right < cr.left || r.left > cr.right || r.bottom < cr.top || r.top > cr.bottom))){ closeToneMenu(); return; }
  const h = t.el.offsetHeight, w = t.el.offsetWidth;
  t.el.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
  t.el.style.top = (r.bottom + 4 + h > innerHeight - 8 ? Math.max(8, r.top - h - 4) : r.bottom + 4) + 'px';
}
function closeToneMenu(returnFocus){
  const t = PF.ui.anchored; if(!t) return;
  t.el.remove(); PF.ui.anchored = null;
  // Observação: redesenha só a célula (sinaliza rascunho não salvo) sem refazer a tabela.
  if(t.kind === 'obs' && t.anchor.isConnected){ const init = PF.ctx.initById.get(t.id); if(init){ t.anchor.outerHTML = PF.obsCell(init); if(returnFocus) refocusObs(t.id); return; } }
  if(t.anchor.isConnected){ t.anchor.setAttribute('aria-expanded','false'); if(returnFocus) t.anchor.focus(); }
}
function setTone(id, value){
  const t = PF.ui.anchored; const inDrawer = t && t.inDrawer; closeToneMenu();
  const init = PF.ctx.initById.get(id); if(!init) return;
  const st = PF.ctx.initMetrics.get(id).deadline.status;
  const next = value === 'auto' || value === PF.AUTO_TONE[st] ? null : value;
  if((init.deadlineColorOverride || null) === next){ refocusPill(id, inDrawer); return; }
  PF.commit(s => { s.initiatives.find(x => x.id === id).deadlineColorOverride = next; },
    {toast: next ? `${id}: cor do prazo exibida como ${PF.TONE_LABEL[next]} · situação calculada segue ${PF.DEADLINE_META[st].label}` : `${id}: cor automática do prazo restaurada`});
  refocusPill(id, inDrawer);
}
function refocusPill(id, inDrawer){ const root = inDrawer && PF.drawerOverlay ? PF.drawerOverlay.el : PF.DOM.root; const b = root.querySelector(`[data-action="tone-menu"][data-id="${CSS.escape(id)}"]`); if(b) b.focus(); }

/* =====================================================================
   EDIÇÃO DE ENTREGA PELO CRONOGRAMA (popover ancorado ao marco)
   ===================================================================== */
function openDeliveryPop(anchor, id, mode){
  const init = PF.ctx.initById.get(id); if(!init) return;
  if(!mode) mode = !init.deliveryPlanned && !init.deliveryCurrent ? 'baseline' : 'forecast';
  const keepAnchor = PF.ui.anchored && PF.ui.anchored.anchor === anchor;
  if(!keepAnchor) closeToneMenu();
  const el = keepAnchor ? PF.ui.anchored.el : document.createElement('div');
  el.className = 'dl-pop anchored-pop'; el.setAttribute('role','dialog'); el.setAttribute('aria-label', `Entrega de ${id}`);
  const f = PF.calculateForecastVariance(init), a = PF.calculateActualVariance(init);
  const facts = `<dl class="dl-facts">
      <div><dt>Entrega planejada</dt><dd>${init.deliveryPlanned ? `<span>${PF.fmtDateFull(init.deliveryPlanned)}</span><span class="muted" style="font-size:11px">baseline</span>` : '<span class="muted">não definida</span>'}</dd></div>
      <div><dt>Entrega atual</dt><dd>${PF.isReprogrammed(init) ? `${trailHtml(init)}${f != null ? `<span class="var var--${PF.deltaKind(f)}" style="margin:0">${PF.fmtDeltaDays(f)}</span>` : ''}` : '<span class="muted">sem reprogramação</span>'}</dd></div>
      <div><dt>Entrega real</dt><dd>${init.deliveryActual ? `<span class="dl-cur">${PF.fmtDateFull(init.deliveryActual)}</span>${a != null ? `<span class="pr pr--${PF.deltaKind(a)}" style="font-size:11.5px"><b>${PF.fmtDeltaDays(a)}</b></span>` : ''}` : '<span class="muted">—</span>'}</dd></div>
    </dl>`;
  const modes = init.deliveryPlanned || init.deliveryCurrent ? [['forecast','Alterar previsão'],['actual', init.deliveryActual ? 'Entrega real' : 'Registrar entrega']] : [['baseline','Definir planejada'],['actual','Registrar entrega']];
  const seg = `<div class="seg" role="radiogroup" aria-label="Ação">${modes.map(([k,l]) => `<button type="button" role="radio" aria-checked="${mode === k}" data-action="delivery-mode" data-value="${k}">${l}</button>`).join('')}</div>`;
  const cfg = {
    forecast:{label:'Nova previsão', value:init.deliveryCurrent || init.deliveryPlanned || '', submit:'Salvar previsão'},
    baseline:{label:'Entrega planejada', value:'', submit:'Definir'},
    actual:{label:'Data da entrega realizada', value:init.deliveryActual || '', submit: init.deliveryActual ? 'Corrigir data' : 'Registrar entrega'}
  }[mode];
  el.innerHTML = `<div class="dl-pop__head"><span class="mono-id">${PF.esc(init.id)}</span><span class="dl-pop__name">${PF.esc(init.name)}</span></div>${facts}${seg}
    <form data-form="delivery" data-id="${PF.esc(id)}" data-mode="${mode}" novalidate>
      <div class="field"><label for="dlDate">${cfg.label}</label><input class="input" id="dlDate" name="date" type="date" value="${PF.esc(cfg.value)}"${mode === 'actual' ? ` max="${PF.ctx.today}"` : ''} required></div>
      <div class="dl-calc" id="dlCalc" aria-live="polite"></div>
      <span class="error-msg" data-err="date" id="dlErr" hidden></span>
      ${mode === 'forecast' ? `<div class="field" style="margin-top:8px"><label for="dlReason">Motivo do replanejamento <span class="req" aria-hidden="true">*</span></label><textarea class="textarea" id="dlReason" name="reason" rows="2" maxlength="300" required aria-required="true" aria-describedby="dlReasonErr" placeholder="Ex.: dependência de outra área, mudança de escopo, capacidade da squad"></textarea><span class="error-msg" id="dlReasonErr" hidden></span></div>` : ''}
      <div class="dl-foot">${mode === 'actual' && init.deliveryActual ? '<button type="button" class="btn btn-tertiary btn-sm" data-action="delivery-undo-actual">Desfazer registro</button>' : ''}<span class="spacer"></span>
        <button type="button" class="btn btn-tertiary btn-sm" data-action="delivery-cancel">Cancelar</button><button type="submit" class="btn btn-primary btn-sm">${cfg.submit}</button></div>
    </form>`;
  if(!keepAnchor){ PF.DOM.layer.appendChild(el); anchor.setAttribute('aria-expanded','true'); }
  PF.ui.anchored = {el, anchor, id, kind:'dialog', mode, inDrawer:false};
  positionToneMenu();
  const input = el.querySelector('#dlDate');
  const calc = () => { el.querySelector('#dlCalc').innerHTML = deliveryPreview(init, mode, input.value); };
  input.addEventListener('input', calc); calc();
  input.focus();
}
function deliveryPreview(init, mode, v){
  if(!PF.isValidISO(v)) return '';
  if(mode === 'forecast'){ if(!init.deliveryPlanned) return ''; const d = PF.daysBetween(init.deliveryPlanned, v); return `Desvio previsto: <b class="var var--${PF.deltaKind(d)}" style="margin:0;font-size:12px">${PF.fmtDeltaDays(d)}</b> <span class="muted">vs. planejada</span>`; }
  if(mode === 'actual'){
    if(v > PF.ctx.today) return '<span style="color:var(--status-warning-ink)">Data futura: entrega real precisa ser fato ocorrido</span>';
    if(!init.deliveryPlanned) return '<span class="muted">Sem entrega planejada para calcular o prazo real</span>';
    const d = PF.daysBetween(init.deliveryPlanned, v); return `Prazo real: <b class="pr pr--${PF.deltaKind(d)}"><b>${PF.fmtDeltaDays(d)}</b></b> <span class="muted">vs. planejada</span>`; }
  return '';
}
function submitDelivery(form){
  const id = form.dataset.id, mode = form.dataset.mode, v = form.querySelector('[name=date]').value;
  const err = msg => { const e = form.querySelector('#dlErr'); e.hidden = false; e.textContent = msg; const i = form.querySelector('#dlDate'); i.setAttribute('aria-invalid','true'); i.focus(); };
  if(!PF.isValidISO(v)) return err('Informe uma data válida');
  const init = PF.ctx.initById.get(id);
  if(mode === 'actual' && v > PF.ctx.today) return err(`A entrega real não pode ser futura (referência ${PF.fmtDateFull(PF.ctx.today)}). Para uma data futura, use Alterar previsão.`);
  const same = mode === 'forecast' ? v === (init.deliveryCurrent || init.deliveryPlanned) : mode === 'actual' ? v === init.deliveryActual : false;
  /* Replanejar exige justificativa: fica no histórico junto da data. */
  const reason = mode === 'forecast' ? PF.toText((form.querySelector('[name=reason]') || {}).value) : '';
  if(mode === 'forecast' && !same && !reason){
    const e = form.querySelector('#dlReasonErr'), t = form.querySelector('#dlReason');
    if(e){ e.hidden = false; e.textContent = 'Informe o motivo do replanejamento'; } if(t){ t.setAttribute('aria-invalid','true'); t.focus(); } return;
  }
  const anchorId = id; closeToneMenu();
  if(same){ refocusMilestone(anchorId); return; }
  let toast;
  PF.commit(s => { const i = s.initiatives.find(x => x.id === id);
    if(mode === 'forecast'){ PF.recordDeliveryChange(i, 'forecast', i.deliveryCurrent || i.deliveryPlanned, v, {reason}); i.deliveryCurrent = v; }
    else if(mode === 'baseline'){ PF.recordDeliveryChange(i, 'baseline', i.deliveryPlanned, v); i.deliveryPlanned = v; }
    else { PF.recordDeliveryChange(i, 'actual', i.deliveryActual, v, {prevSituation:i.situation}); i.deliveryActual = v; i.situation = 'Concluída'; }
  }, {toast: mode === 'forecast' ? `${id}: previsão de entrega ${PF.fmtDateFull(v)} · planejada preservada` : mode === 'baseline' ? `${id}: entrega planejada definida em ${PF.fmtDateFull(v)}` : `${id}: entrega registrada em ${PF.fmtDateFull(v)}`});
  refocusMilestone(anchorId);
}
function undoActualDelivery(id){
  closeToneMenu();
  PF.commit(s => { const i = s.initiatives.find(x => x.id === id); if(!i.deliveryActual) return;
    const last = [...i.deliveryHistory].reverse().find(h => h.type === 'actual' && !h.from);
    PF.recordDeliveryChange(i, 'actual-removed', i.deliveryActual, null); i.deliveryActual = null;
    if(i.situation === 'Concluída') i.situation = (last && last.prevSituation && last.prevSituation !== 'Concluída') ? last.prevSituation : 'Em andamento';
  }, {toast:`${id}: registro de entrega desfeito`});
  refocusMilestone(id);
}
/* =====================================================================
   OBSERVAÇÃO — edição rápida pela tabela (popover ancorado à célula)
   Cada registro é datado e entra em notesLog: a observação anterior vai para o
   histórico, nunca é sobrescrita. Rascunho preservado se o editor fechar.
   ===================================================================== */
const OBS_MAX = 800;
function openObsPop(anchor, id){
  const init = PF.ctx.initById.get(id); if(!init) return;
  closeToneMenu();
  const cur = PF.lastObservation(init);
  const log = [...(init.notesLog || [])].sort((a,b) => a.ts < b.ts ? 1 : -1);
  const prev = log.slice(1);
  const draft = (PF.ui.obsDraft || {})[id] || '';
  const el = document.createElement('div');
  el.className = 'obs-pop anchored-pop'; el.setAttribute('role','dialog'); el.setAttribute('aria-label', `Observação de ${id}`);
  el.innerHTML = `<div class="dl-pop__head"><span class="mono-id">${PF.esc(init.id)}</span><span class="dl-pop__name">${PF.esc(init.name)}</span></div>
    ${cur ? `<div class="obs-pop__current"><div class="obs-pop__label">Observação atual<span class="obs-pop__when"> · ${cur.date ? PF.fmtDateFull(cur.date) : 'sem data'}${log.length ? '' : ' · do relatório'}</span></div><p class="obs-pop__text">${PF.esc(cur.text)}</p></div>` : ''}
    <form data-form="obs" data-id="${PF.esc(id)}" novalidate>
      <label class="obs-pop__label" for="obsText">${cur ? 'Nova atualização' : 'Observação'}</label>
      <textarea class="textarea" id="obsText" name="text" rows="4" maxlength="${OBS_MAX}" placeholder="Status, impedimento, decisão pendente ou próximo passo" aria-describedby="obsHint obsCount">${PF.esc(draft)}</textarea>
      <div class="obs-pop__aux"><span id="obsHint">${cur ? 'A atual vai para o histórico · ' : ''}<kbd>Ctrl</kbd>+<kbd>Enter</kbd> registra</span><span class="obs-pop__count" id="obsCount" aria-live="polite"></span></div>
      <span class="error-msg" id="obsErr" hidden></span>
      ${prev.length ? `<details class="obs-pop__hist"><summary>Histórico · ${prev.length} ${prev.length === 1 ? 'registro anterior' : 'registros anteriores'}</summary><ol>${prev.slice(0,3).map(h => `<li><time>${PF.fmtDate(h.ts.slice(0,10))}</time><span>${PF.esc(h.text)}</span></li>`).join('')}</ol>${prev.length > 3 ? `<button type="button" class="btn-link" data-action="obs-history" data-id="${PF.esc(id)}">Ver histórico completo</button>` : ''}</details>` : ''}
      <div class="dl-foot"><span class="spacer"></span><button type="button" class="btn btn-tertiary btn-sm" data-action="delivery-cancel">Cancelar</button><button type="submit" class="btn btn-primary btn-sm">Registrar observação</button></div>
    </form>`;
  PF.DOM.layer.appendChild(el); anchor.setAttribute('aria-expanded','true');
  PF.ui.anchored = {el, anchor, id, kind:'obs', inDrawer:false};
  const ta = el.querySelector('#obsText'), count = el.querySelector('#obsCount');
  const onInput = () => {
    const n = ta.value.length; count.textContent = `${n}/${OBS_MAX}`; count.classList.toggle('is-near', n > OBS_MAX * 0.9);
    ta.style.height = 'auto'; ta.style.height = Math.min(240, Math.max(88, ta.scrollHeight + 2)) + 'px';
    PF.ui.obsDraft = PF.ui.obsDraft || {};
    if(ta.value.trim()) PF.ui.obsDraft[id] = ta.value; else delete PF.ui.obsDraft[id];
    const e = el.querySelector('#obsErr'); if(!e.hidden && ta.value.trim()){ e.hidden = true; ta.removeAttribute('aria-invalid'); }
    positionToneMenu();
  };
  ta.addEventListener('input', onInput);
  ta.addEventListener('keydown', e => { if(e.key === 'Enter' && (e.ctrlKey || e.metaKey)){ e.preventDefault(); el.querySelector('form').requestSubmit(); } });
  onInput();
  ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
}
function submitObs(form){
  const id = form.dataset.id, ta = form.querySelector('[name=text]'), text = PF.toText(ta.value);
  if(!text){ const e = form.querySelector('#obsErr'); e.hidden = false; e.textContent = 'Escreva a observação antes de registrar.'; ta.setAttribute('aria-invalid','true'); ta.focus(); return; }
  const init = PF.ctx.initById.get(id); const cur = init && PF.lastObservation(init);
  closeToneMenu();
  if(PF.ui.obsDraft) delete PF.ui.obsDraft[id];
  if(cur && cur.text === text){ PF.renderView(); refocusObs(id); return; }
  PF.commit(s => { const i = s.initiatives.find(x => x.id === id); if(!i) return; if(!Array.isArray(i.notesLog)) i.notesLog = []; i.notesLog.push({ts:new Date().toISOString(), text}); }, {toast:`${id}: observação registrada`});
  refocusObs(id);
}
function refocusObs(id){ const b = PF.$(`[data-action="obs-edit"][data-id="${CSS.escape(id)}"]`); if(b) b.focus(); }

function refocusMilestone(id){ const b = PF.$(`#view-initiatives [data-action="delivery-edit"][data-id="${CSS.escape(id)}"]`); if(b) b.focus(); }

/* =====================================================================
   TOAST + TOOLTIP
   ===================================================================== */
function showToast(msg, action, ms = 5000, error = false){
  const root = PF.$('#toastRoot');
  const t = document.createElement('div'); t.className = 'toast' + (error ? ' toast--error' : '');
  t.innerHTML = `${PF.icon(error ? 'i-error' : 'i-ok','ic ic-sm')}<span>${PF.esc(msg)}</span>`;
  if(action){ const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label; b.addEventListener('click', () => { t.remove(); action.fn(); }); t.appendChild(b); }
  root.appendChild(t);
  while(root.children.length > 3) root.firstElementChild.remove();
  setTimeout(() => t.remove(), ms);
}
PF.tipTarget = null;
function showTip(target){
  const tip = PF.$('#tooltip'); const text = target.getAttribute('data-tip'); if(!text) return;
  PF.tipTarget = target; tip.textContent = text; tip.classList.add('is-on');
  const r = target.getBoundingClientRect(); const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = r.left + r.width/2 - tw/2; x = Math.max(8, Math.min(x, innerWidth - tw - 8));
  let y = r.top - th - 8; if(y < 8) y = r.bottom + 8;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
function hideTip(){ PF.tipTarget = null; PF.$('#tooltip').classList.remove('is-on'); }

/* exporta para os demais módulos */
Object.assign(PF, {openObsPop, submitObs, refocusObs, OBS_MAX, openOverlay, closeOverlay, trapFocus, modalFrame, openInitiative, markSelectedRow, renderDrawer, focusSelector, trailHtml, deliveryHistoryList, drawerSummary, drawerStories, drawerNotes, opt, fld, inp, sel, openInitiativeForm, logDeliveryDiff, ownerRow, submitInitiative, showFormErrors, nextStoryId, openStoryForm, submitStory, openSprintForm, submitSprint, openCapacityForm, capMemberRow, capAbsenceRow, capFormMembers, syncAbsenceMemberOptions, submitCapacity, hexToRgb, rgbToHex, mix, luminance, contrastOn, resolvedTheme, applyAppearance, openSettings, issueList, openQuality, openToneMenu, positionToneMenu, closeToneMenu, setTone, refocusPill, openDeliveryPop, deliveryPreview, submitDelivery, undoActualDelivery, refocusMilestone, showToast, showTip, hideTip});
})();
