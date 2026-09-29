/* SALA Lead Time — aba Portfólio · pf-import.js
   importação de planilha (SheetJS sob demanda) e exportação da base em .xlsx.
   Módulo clássico (IIFE): nada vaza para o escopo global de index.html além de
   window.SalaPortfolio. Nomes compartilhados entre módulos ficam em PF (namespace interno).
   Ordem de carga: pf-core.js → pf-metrics.js → pf-state.js → pf-import.js → pf-export.js → pf-views.js → pf-panels.js → pf-app.js. */
(function(){
'use strict';
const SP = window.SalaPortfolio = window.SalaPortfolio || {};
const PF = SP.internal = SP.internal || {};

/* =====================================================================
   IMPORTAÇÃO — SheetJS carregado sob demanda
   ===================================================================== */
PF.xlsxPromise = null;
/* Ordem: cópia local do produto (vendor/, já usada pelo SALA Lead Time) → CDNs. Proxies corporativos costumam bloquear CDN. */
const XLSX_SOURCES = ['vendor/xlsx.full.min.js','https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js','https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'];
/* Carrega a primeira fonte disponível (cópia local → CDNs), com timeout por tentativa. */
function loadScriptChain(sources, getGlobal){
  return new Promise((resolve, reject) => {
    const tryLoad = (k) => {
      if(k >= sources.length){ reject(new Error('unavailable')); return; }
      // Fontes relativas (cópia local em vendor/) resolvem a partir da raiz do site (opts.assetBase),
      // para funcionar tanto em index.html quanto na página dedicada portfolio/.
      const src = /^https?:/.test(sources[k]) ? sources[k] : (PF.DOM.assetBase || '') + sources[k];
      const s = document.createElement('script'); s.src = src; s.async = true;
      let settled = false;
      const fail = () => { if(settled) return; settled = true; clearTimeout(timer); s.remove(); tryLoad(k+1); };
      const timer = setTimeout(fail, 15000);
      s.onload = () => { if(settled) return; settled = true; clearTimeout(timer); const g = getGlobal(); g ? resolve(g) : tryLoad(k+1); };
      s.onerror = fail;
      document.head.appendChild(s);
    };
    tryLoad(0);
  });
}
function loadXLSX(){
  if(window.XLSX) return Promise.resolve(window.XLSX);
  if(PF.xlsxPromise) return PF.xlsxPromise;
  PF.xlsxPromise = loadScriptChain(XLSX_SOURCES, () => window.XLSX).catch(() => { PF.xlsxPromise = null; throw new Error('Não foi possível carregar o leitor de planilhas (verifique a conexão ou o bloqueio de CDN pela rede).'); });
  return PF.xlsxPromise;
}
const SHEET_SCHEMAS = {
  initiatives:{names:['iniciativas','iniciativa'], required:['ID_Iniciativa','Iniciativa'], cols:{
    ID_Iniciativa:'id', Iniciativa:'name', Squad:'squads', PO:'po', Tech_Lead:'techLead', Fase:'phase', Situacao:'situation',
    Discovery_Inicio:'discoveryStart', Discovery_Fim:'discoveryEnd', Dev_Previsto:'devPlanned', Dev_Real:'devActual',
    Entrega_Planejada:'deliveryPlanned', Entrega_Atual:'deliveryCurrent', Entrega_Real:'deliveryActual', Risco:'risk', Responsavel:'owner', Area_Responsavel:'ownerAreas', Observacao:'notes', Causa:'cause', Cor_Prazo_Manual:'deadlineColorOverride'}},
  stories:{names:['historias','historia','stories'], required:['ID_Historia','ID_Iniciativa','Historia','Status'], cols:{
    ID_Historia:'id', ID_Iniciativa:'initiativeId', Historia:'title', Epico:'epic', Sprint_Planejada:'plannedSprint', Sprint_Conclusao:'sprint',
    Status:'status', Bloqueada:'blocked', Motivo_Bloqueio:'blockedReason', Data_Criacao:'createdAt', Data_Inicio_Dev:'devStartAt', Data_Homologacao:'homologAt', Data_Conclusao:'doneAt', Responsavel:'owner', Observacao:'notes'}},
  sprints:{names:['sprints','sprint'], required:['Sprint','Data_Inicio','Data_Fim'], cols:{Sprint:'id', Nome:'name', Data_Inicio:'start', Data_Fim:'end', Release:'release'}}
};
const DATE_FIELDS = new Set(['discoveryStart','discoveryEnd','devPlanned','devActual','deliveryPlanned','deliveryCurrent','deliveryActual','createdAt','devStartAt','homologAt','doneAt','start','end']);
function readSheet(XLSX, wb, schema, issues, label){
  const name = wb.SheetNames.find(n => schema.names.includes(PF.normKey(n)));
  if(!name) return {rows:null, missing:true};
  const raw = XLSX.utils.sheet_to_json(wb.Sheets[name], {defval:'', raw:true});
  if(!raw.length){ issues.push({level:label === 'initiatives' ? 'error' : 'warning', entity:'Planilha', id:name, message:'Aba sem linhas de dados'}); return {rows:[]}; }
  const headerMap = {}; const want = Object.keys(schema.cols);
  Object.keys(raw[0]).forEach(h => { const k = want.find(w => PF.normKey(w) === PF.normKey(h)); if(k) headerMap[h] = schema.cols[k]; });
  const present = new Set(Object.values(headerMap));
  const missingReq = schema.required.filter(r => !present.has(schema.cols[r]));
  if(missingReq.length){ issues.push({level:'error', entity:'Planilha', id:name, message:`Colunas obrigatórias ausentes: ${missingReq.join(', ')}`}); return {rows:null}; }
  const unknown = Object.keys(raw[0]).filter(h => !headerMap[h] && !/^__EMPTY/.test(h));
  if(unknown.length) issues.push({level:'info', entity:'Planilha', id:name, message:`Colunas ignoradas: ${unknown.join(', ')}`});
  const rows = raw.map((r, k) => { const o = {_row:k+2}; Object.entries(headerMap).forEach(([h, f]) => { o[f] = r[h]; }); return o; })
    .filter(o => Object.keys(o).some(k => k !== '_row' && o[k] !== '' && o[k] != null));
  return {rows, sheet:name};
}
function buildImportCandidate(XLSX, wb, fileName){
  const issues = [];
  const add = (level, entity, id, message) => issues.push({level, entity, id, message});
  const ini = readSheet(XLSX, wb, SHEET_SCHEMAS.initiatives, issues, 'initiatives');
  if(ini.missing) add('error','Planilha','INICIATIVAS','Aba INICIATIVAS não encontrada');
  const sto = readSheet(XLSX, wb, SHEET_SCHEMAS.stories, issues, 'stories');
  if(sto.missing) add('warning','Planilha','HISTORIAS','Aba HISTORIAS não encontrada — portfólio será importado sem histórias');
  const spr = readSheet(XLSX, wb, SHEET_SCHEMAS.sprints, issues, 'sprints');
  if(spr.missing) add('warning','Planilha','SPRINTS','Aba SPRINTS não encontrada — visão de Sprints ficará vazia');
  const dateFix = (o, entity, id) => { Object.keys(o).forEach(f => { if(!DATE_FIELDS.has(f)) return; const d = PF.normalizeDate(o[f]); if(!d.ok){ add('warning', entity, id, `Data inválida em ${f} (“${PF.toText(o[f])}”, linha ${o._row}) — ignorada`); o[f] = null; } else o[f] = d.value; }); };
  const sprints = [];
  (spr.rows || []).forEach(r => { const id = PF.toText(r.id); if(!id){ add('error','Sprint',`linha ${r._row}`,'Sprint sem identificador'); return; } dateFix(r,'Sprint',id);
    if(!r.start || !r.end){ add('error','Sprint',id,'Sprint sem data de início ou fim válida'); return; }
    sprints.push({id, name:PF.toText(r.name) || (/^s\d+$/i.test(id) ? `Sprint ${id.slice(1)}` : id), start:r.start, end:r.end, release:PF.toText(r.release)}); });
  const initiatives = [];
  (ini.rows || []).forEach(r => { const id = PF.toText(r.id); dateFix(r,'Iniciativa',id || `linha ${r._row}`);
    const ph = PF.canon(r.phase, PF.PHASE_ALIASES, PF.PHASES); if(!ph.known) add('warning','Iniciativa',id,`Fase fora do padrão: “${PF.toText(r.phase)}”`);
    const si = PF.canon(r.situation, PF.SITUATION_ALIASES, PF.SITUATIONS);
    if(PF.normKey(r.situation).startsWith('atrasad')){ add('info','Iniciativa',id,'Situação “Atrasado” convertida para “Em andamento” — atraso é calculado pela regra de prazo'); r.situation = 'Em andamento'; }
    else if(!si.known){ add('warning','Iniciativa',id,`Situação desconhecida “${PF.toText(r.situation)}” — assumida “Em andamento”`); r.situation = 'Em andamento'; }
    const rk = PF.canon(r.risk, PF.RISK_ALIASES, PF.RISKS); if(!rk.known){ add('warning','Iniciativa',id,`Risco desconhecido “${PF.toText(r.risk)}” — deixado como não avaliado`); r.risk = null; }
    if(r.deadlineColorOverride != null && PF.toText(r.deadlineColorOverride) !== ''){ const t = {verde:'green', amarelo:'yellow', vermelho:'red', neutro:'neutral', cinza:'neutral', green:'green', yellow:'yellow', red:'red', neutral:'neutral'}[PF.normKey(r.deadlineColorOverride)];
      if(!t) add('warning','Iniciativa',id,`Cor manual do prazo inválida “${PF.toText(r.deadlineColorOverride)}” — usada a cor automática`); r.deadlineColorOverride = t || null; } else r.deadlineColorOverride = null;
    const n = PF.normalizeInitiative({...r, id, notesLog:[]});
    if(n.deliveryActual && n.deliveryActual > PF.getReferenceDate()) add('warning','Iniciativa',id,`Entrega real futura (${PF.fmtDate(n.deliveryActual)}) — entrega real deve ser fato ocorrido`);
    const prev = PF.appState.initiatives.find(x => x.id === id);
    if(prev){ n.notesLog = PF.clone(prev.notesLog || []); n.deliveryHistory = PF.clone(prev.deliveryHistory || []); PF.logDeliveryDiff(prev, n, 'import'); }
    initiatives.push(n); });
  const initIds = new Set(initiatives.map(i => i.id));
  const stories = [];
  (sto.rows || []).forEach(r => { const id = PF.toText(r.id) || `linha ${r._row}`; dateFix(r,'História',id);
    if(!initIds.has(PF.toText(r.initiativeId))){ add('error','História',id,`História órfã: iniciativa “${PF.toText(r.initiativeId)}” não existe — não será importada`); return; }
    let status = PF.canon(r.status, PF.STATUS_ALIASES, PF.WORKFLOW); let blocked = PF.parseBool(r.blocked);
    if(!status.known){ if(PF.BLOCKED_STATUS_KEYS.includes(PF.normKey(r.status))){ add('warning','História',id,`Status “${PF.toText(r.status)}” não é etapa do fluxo — importada como Desenvolvimento + bloqueada`); status = {value:'Desenvolvimento'}; blocked = true; }
      else { add('warning','História',id,`Status inválido “${PF.toText(r.status)}” — assumido Backlog`); status = {value:'Backlog'}; } }
    if(!status.value){ add('warning','História',id,'Status vazio — assumido Backlog'); status = {value:'Backlog'}; }
    stories.push(PF.normalizeStory({...r, id:PF.toText(r.id), status:status.value, blocked})); });
  /* Capacidade não vem da planilha: preserva a equipe já configurada (mesma sprint) ou herda a da última sprint conhecida. */
  const lastMembers = [...PF.appState.sprints].sort((a,b) => a.start < b.start ? -1 : 1).map(sp => sp.capacity && sp.capacity.members).filter(m => m && m.length).pop() || [];
  sprints.forEach(sp => { const prev = PF.appState.sprints.find(x => x.id === sp.id); sp.capacity = PF.clone(prev && prev.capacity ? prev.capacity : {members:lastMembers}); });
  const cand = {initiatives, stories, sprints, absences:PF.clone(PF.appState.absences || []), settings:PF.clone(PF.appState.settings),
    metadata:{schemaVersion:PF.SCHEMA_VERSION, teamSource:PF.appState.metadata.teamSource || null, source:'Importação de planilha', sourceCut:null, storySource:'import', fileName, loadedAt:new Date().toISOString(), updatedAt:new Date().toISOString()}};
  const tmp = {today:PF.getReferenceDate(), sprints:[...sprints].sort((a,b) => a.start < b.start ? -1 : 1)};
  const live = PF.validateData(cand, tmp).filter(i => !(i.level === 'error' && /órfã/.test(i.message)));
  const seen = new Set(issues.map(i => i.entity + i.id + i.message));
  live.forEach(i => { if(!seen.has(i.entity + i.id + i.message)) issues.push(i); });
  const blocking = issues.filter(i => i.level === 'error' && (i.entity === 'Planilha' || /duplicado|sem ID|sem nome|Sprint sem/.test(i.message)));
  return {cand, issues, blocking, fileName};
}
function openImport(){
  let state = {step:'pick'};
  const render = () => {
    if(state.step === 'pick') return PF.modalFrame('Importar planilha', 'Substitui a base atual depois da sua confirmação',
      `<label class="dropzone" id="dropzone" tabindex="0"><span class="empty__icon">${PF.icon('i-upload')}</span><b>Arraste o arquivo aqui ou clique para selecionar</b><span style="font-size:12px">.xlsx ou .xls com as abas INICIATIVAS, HISTORIAS e SPRINTS</span><input type="file" id="fileInput" accept=".xlsx,.xls" class="sr-only"></label>
      <div class="d-section"><div class="d-section__title">Estrutura esperada</div>
      <div class="table-wrap" style="border:1px solid var(--border-default);border-radius:var(--radius-md)"><table class="tbl"><tbody>
        <tr><td style="width:120px"><b>INICIATIVAS</b></td><td class="muted" style="font-size:11.5px">${Object.keys(SHEET_SCHEMAS.initiatives.cols).join(' · ')}</td></tr>
        <tr><td><b>HISTORIAS</b></td><td class="muted" style="font-size:11.5px">${Object.keys(SHEET_SCHEMAS.stories.cols).join(' · ')}</td></tr>
        <tr><td><b>SPRINTS</b></td><td class="muted" style="font-size:11.5px">${Object.keys(SHEET_SCHEMAS.sprints.cols).join(' · ')}</td></tr></tbody></table></div>
      <p class="muted" style="font-size:11.5px;margin-top:8px">Nada é processado até você escolher um arquivo. Conteúdo é tratado como texto — fórmulas e HTML não são executados.</p></div>`,
      `<button type="button" class="btn btn-tertiary" data-action="download-xlsx">${PF.icon('i-download','ic ic-sm')}Baixar modelo com a base atual</button><div class="modal__foot-right"><button type="button" class="btn btn-tertiary" data-action="close-overlay">Cancelar</button></div>`);
    if(state.step === 'loading') return PF.modalFrame('Importar planilha', PF.esc(state.fileName), `<div class="loading"><span class="spinner"></span>${PF.esc(state.msg)}</div>`, null);
    if(state.step === 'error') return PF.modalFrame('Importar planilha', PF.esc(state.fileName || ''), `<div class="callout callout--late"><div class="callout__title">Não foi possível ler o arquivo</div>${PF.esc(state.msg)}</div>`,
      `<span></span><div class="modal__foot-right"><button type="button" class="btn btn-secondary" data-action="import-back">Escolher outro arquivo</button></div>`);
    const r = state.result; const c = r.cand;
    const errs = r.issues.filter(i => i.level === 'error').length, warns = r.issues.filter(i => i.level === 'warning').length;
    const ok = !r.blocking.length && c.initiatives.length;
    return PF.modalFrame(ok ? 'Validação concluída' : 'Importação bloqueada', PF.esc(r.fileName),
      `<div class="import-summary"><div><b>${c.initiatives.length}</b><span>iniciativas</span></div><div><b>${c.stories.length}</b><span>histórias</span></div><div><b>${c.sprints.length}</b><span>sprints</span></div><div><b>${errs + warns}</b><span>${PF.plural(errs,'erro','erros')} · ${PF.plural(warns,'alerta','alertas')}</span></div></div>
      ${ok ? '' : `<div class="callout callout--late" style="margin-bottom:12px"><div class="callout__title">Corrija a planilha antes de importar</div>${r.blocking.length ? `${PF.plural(r.blocking.length,'problema estrutural','problemas estruturais')} impede${r.blocking.length>1?'m':''} a substituição da base.` : 'Nenhuma iniciativa válida encontrada.'} A base atual não foi alterada.</div>`}
      ${r.issues.length ? PF.issueList([...r.issues].sort((a,b) => ['error','warning','info'].indexOf(a.level) - ['error','warning','info'].indexOf(b.level))) : '<div class="callout callout--ok">Nenhuma inconsistência encontrada.</div>'}`,
      `<button type="button" class="btn btn-tertiary" data-action="import-back">Escolher outro arquivo</button><div class="modal__foot-right"><button type="button" class="btn btn-tertiary" data-action="close-overlay">Cancelar</button><button type="button" class="btn btn-primary" data-action="import-apply"${ok ? '' : ' disabled'}>Substituir base e importar</button></div>`);
  };
  const ov = PF.openOverlay({label:'Importar planilha', html:render()});
  const bind = () => {
    const input = ov.el.querySelector('#fileInput'), dz = ov.el.querySelector('#dropzone');
    if(!input) return;
    input.addEventListener('change', () => input.files[0] && handleFile(input.files[0]));
    dz.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); input.click(); } });
    ['dragenter','dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('is-over'); }));
    ['dragleave','drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('is-over'); }));
    dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if(f) handleFile(f); });
  };
  const rerender = () => { ov.el.innerHTML = render(); bind(); const f = ov.el.querySelector('.modal__foot .btn-primary:not([disabled])') || ov.el.querySelector('[data-action=close-overlay]'); if(f) f.focus(); };
  const handleFile = async (file) => {
    if(!/\.(xlsx|xls)$/i.test(file.name)){ state = {step:'error', fileName:file.name, msg:'Formato não suportado. Use .xlsx ou .xls.'}; rerender(); return; }
    if(file.size > 15 * 1024 * 1024){ state = {step:'error', fileName:file.name, msg:'Arquivo acima de 15 MB.'}; rerender(); return; }
    state = {step:'loading', fileName:file.name, msg:'Carregando leitor de planilhas…'}; rerender();
    try {
      const XLSX = await loadXLSX();
      state.msg = 'Lendo e validando…'; rerender();
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, {type:'array', cellDates:true, cellFormula:false, cellHTML:false});
      state = {step:'report', result:buildImportCandidate(XLSX, wb, file.name)}; rerender();
    } catch(err){ state = {step:'error', fileName:file.name, msg:err.message || String(err)}; rerender(); }
  };
  ov.importApi = {
    back:() => { state = {step:'pick'}; rerender(); },
    apply:() => {
      const r = state.result; if(!r || r.blocking.length) return;
      const alerts = r.issues.filter(i => i.level !== 'info').length;
      PF.closeOverlay(ov);
      PF.commit(s => { Object.assign(s, PF.clone(r.cand)); }, {undo:true});
      PF.prefs.sprintId = null; clearFiltersSilently(); PF.persistPrefs(); PF.refresh();
      PF.showToast(`Importação concluída: ${PF.plural(r.cand.initiatives.length,'iniciativa','iniciativas')}, ${PF.plural(r.cand.stories.length,'história','histórias')}, ${PF.plural(r.cand.sprints.length,'sprint','sprints')}${alerts ? ` · ${PF.plural(alerts,'alerta','alertas')}` : ''}`, alerts ? {label:'Ver alertas', fn:PF.openQuality} : null, 8000);
    }
  };
  bind();
}
function clearFiltersSilently(){ Object.keys(PF.prefs.filters).forEach(k => PF.prefs.filters[k] = ''); }
async function downloadXlsx(){
  try {
    PF.showToast('Gerando planilha…');
    const XLSX = await loadXLSX();
    const d = iso => { if(!iso) return ''; const [y,m,dd] = iso.split('-').map(Number); return new Date(y, m-1, dd); };
    const wb = XLSX.utils.book_new();
    const ini = PF.appState.initiatives.map(i => ({ID_Iniciativa:i.id, Iniciativa:i.name, Squad:i.squads.join(' + '), PO:i.po, Tech_Lead:i.techLead, Fase:i.phase, Situacao:i.situation,
      Discovery_Inicio:d(i.discoveryStart), Discovery_Fim:d(i.discoveryEnd), Dev_Previsto:d(i.devPlanned), Dev_Real:d(i.devActual), Entrega_Planejada:d(i.deliveryPlanned), Entrega_Atual:d(i.deliveryCurrent), Entrega_Real:d(i.deliveryActual),
      Risco:i.risk || '', Responsavel:i.owners.map(o => o.name).join('; '), Area_Responsavel:i.owners.some(o => o.area) ? i.owners.map(o => o.area).join('; ') : '', Observacao:i.notes, Causa:i.cause, Cor_Prazo_Manual:i.deadlineColorOverride ? PF.TONE_LABEL[i.deadlineColorOverride] : ''}));
    const his = PF.appState.stories.map(s => ({ID_Historia:s.id, ID_Iniciativa:s.initiativeId, Historia:s.title, Epico:s.epic, Sprint_Planejada:s.plannedSprint || '', Sprint_Conclusao:s.sprint || '', Status:s.status,
      Bloqueada:s.blocked ? 'Sim' : 'Não', Motivo_Bloqueio:s.blockedReason, Data_Criacao:d(s.createdAt), Data_Inicio_Dev:d(s.devStartAt), Data_Homologacao:d(s.homologAt), Data_Conclusao:d(s.doneAt), Responsavel:s.owner, Observacao:s.notes}));
    const spr = PF.appState.sprints.map(s => ({Sprint:s.id, Nome:s.name, Data_Inicio:d(s.start), Data_Fim:d(s.end), Release:s.release}));
    const headers = k => Object.keys(SHEET_SCHEMAS[k].cols);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ini, {header:headers('initiatives'), dateNF:'dd/mm/yyyy', cellDates:true}), 'INICIATIVAS');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(his, {header:headers('stories'), dateNF:'dd/mm/yyyy', cellDates:true}), 'HISTORIAS');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(spr, {header:headers('sprints'), dateNF:'dd/mm/yyyy', cellDates:true}), 'SPRINTS');
    XLSX.writeFile(wb, `portfolio-iniciativas-${PF.ctx.today}.xlsx`);
  } catch(err){ PF.showToast(err.message || 'Falha ao gerar a planilha', null, 6000, true); }
}

/* exporta para os demais módulos */
Object.assign(PF, {XLSX_SOURCES, loadScriptChain, loadXLSX, SHEET_SCHEMAS, DATE_FIELDS, readSheet, buildImportCandidate, openImport, clearFiltersSilently, downloadXlsx});
})();
