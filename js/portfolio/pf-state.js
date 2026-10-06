/* SALA Lead Time — aba Portfólio · pf-state.js
   estado central, persistência local e sincronização compartilhada (Apps Script).
   Módulo clássico (IIFE): nada vaza para o escopo global de index.html além de
   window.SalaPortfolio. Nomes compartilhados entre módulos ficam em PF (namespace interno).
   Ordem de carga: pf-core.js → pf-metrics.js → pf-state.js → pf-import.js → pf-export.js → pf-views.js → pf-panels.js → pf-app.js. */
(function(){
'use strict';
const SP = window.SalaPortfolio = window.SalaPortfolio || {};
const PF = SP.internal = SP.internal || {};

/* =====================================================================
   ESTADO CENTRAL + PERSISTÊNCIA
   ===================================================================== */
PF.appState = null;
PF.prefs = null;
PF.ctx = null;
const ui = { drawer:null, drawerTab:'summary', drawerStoryFilter:'all', attnExpanded:false, expandedSprints:new Set(), expandedGroups:new Set(), sprintItemFilter:'all', overlays:[], popover:null, obsDraft:{}, expandedSquads:new Set(), dlvStatus:'', dlvQ:'', dlvAll:false };

function loadState(){
  const raw = PF.safeStorageGet(PF.STORE_DATA_SLOT);
  if(raw){ try { const s = JSON.parse(raw); if(s && Array.isArray(s.initiatives)) return prepareState(s); } catch(e){} }
  return emptyState();
}
function emptyState(){
  return {initiatives:[], stories:[], sprints:[], absences:[], settings:PF.clone(PF.DEFAULT_SETTINGS),
    metadata:{schemaVersion:PF.SCHEMA_VERSION, source:null, sourceCut:null, storySource:null, fileName:null, loadedAt:null, updatedAt:null, writeId:null}};
}
/* Completa campos ausentes e migra versões antigas — usado para cache local e para o que vem do servidor. */
function prepareState(s){
  s.initiatives = Array.isArray(s.initiatives) ? s.initiatives : [];
  s.stories = Array.isArray(s.stories) ? s.stories : [];
  s.sprints = Array.isArray(s.sprints) ? s.sprints : [];
  s.settings = {...PF.clone(PF.DEFAULT_SETTINGS), ...(s.settings || {}), rules:{...PF.DEFAULT_SETTINGS.rules, ...((s.settings || {}).rules || {})}};
  return migrateState(s);
}
/* v1 → v2: responsável/área estruturados, override visual do prazo, capacidade por sprint e ausências. */
function migrateState(s){
  s.metadata = s.metadata || {};
  if((s.metadata.schemaVersion || 1) >= PF.SCHEMA_VERSION) return s;
  s.initiatives = s.initiatives.map(i => { const n = PF.normalizeInitiative(i); n.notesLog = Array.isArray(i.notesLog) ? i.notesLog : []; return n; });
  s.sprints = (s.sprints || []).map(sp => ({...sp, capacity: sp.capacity || {members:[]}}));
  s.absences = Array.isArray(s.absences) ? s.absences : [];
  s.metadata.schemaVersion = PF.SCHEMA_VERSION;
  return s;
}
function loadPrefs(){
  const raw = PF.safeStorageGet(PF.STORE_PREFS_SLOT); let p = {};
  if(raw){ try { p = JSON.parse(raw) || {}; } catch(e){} }
  if(Array.isArray(p.columns) && p.columns.includes('owner') && !p.columns.includes('area')) p.columns.splice(p.columns.indexOf('owner')+1, 0, 'area');
  if(p.filters && p.filters.deadline === 'suspended') p.filters.deadline = '';   // Suspensa deixou de ser "prazo": é a Situação da iniciativa
  if(p.filters && p.filters.situation === 'Suspensa') p.filters.situation = '';
  if(!PF.SCOPES[p.scope]) p.scope = 'active';
  return {...PF.clone(PF.DEFAULT_PREFS), ...p, colors:{...PF.DEFAULT_COLORS, ...(p.colors||{})}, filters:{...PF.DEFAULT_PREFS.filters, ...(p.filters||{})}, sort:{...PF.DEFAULT_PREFS.sort, ...(p.sort||{})}};
}
function persistState(){ PF.safeStorageSet(PF.STORE_DATA_SLOT, JSON.stringify(PF.appState)); }
function persistPrefs(){ PF.safeStorageSet(PF.STORE_PREFS_SLOT, JSON.stringify(PF.prefs)); }

/* Toda mutação passa por aqui: muta → persiste → recalcula → re-renderiza a área ativa. */
/* A mesma função (mutator) é guardada na fila de sincronização: se outra pessoa gravar antes,
   ela é reaplicada sobre a versão mais nova do servidor (ver rebase em cloudVerify). */
function commit(mutator, {toast, undo=true} = {}){
  const snapshot = undo ? JSON.stringify(PF.appState) : null;
  mutator(PF.appState);
  PF.appState.metadata.updatedAt = new Date().toISOString();
  persistState();
  queueCloudWrite(mutator);
  PF.refresh();
  if(toast) PF.showToast(toast, snapshot ? {label:'Desfazer', fn:() => {
    const snap = JSON.parse(snapshot);
    commit(s => { Object.keys(s).forEach(k => delete s[k]); Object.assign(s, PF.clone(snap)); }, {undo:false});
    PF.showToast('Alteração desfeita'); }} : null);
}

/* =====================================================================
   SINCRONIZAÇÃO COMPARTILHADA (Apps Script · saveVpData/getVpData)
   Padrão do repositório (CLAUDE.md): leitura JSONP com timeout + retry de
   transporte (_gasJsonp) e retry de conteúdo (1x, 2s); gravação POST no-cors
   seguida de leitura de conferência; nenhum polling próprio — a revisão chega
   pelo ping getRevisions que index.html já faz (onRemoteRevision).
   ===================================================================== */
const sync = {url:null, revision:null, serverSeen:false, loaded:false, loading:false, pending:[], pushing:false, again:false, timer:null, status:'local', message:'', at:null};
function gasJsonp(url, cb){
  if(typeof window._gasJsonp === 'function') return window._gasJsonp(url, cb, 28000);
  // Fallback autônomo (mesmo contrato): timeout de 28s + 1 retry de transporte.
  const run = (left) => {
    const name = '_pfJP_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
    const sc = document.createElement('script'); let done = false;
    const finish = (err, json) => { if(done) return; done = true; clearTimeout(timer); window[name] = () => { delete window[name]; }; sc.remove();
      if(err && left > 0) return setTimeout(() => run(left - 1), 2000); cb(err, json); };
    const timer = setTimeout(() => finish('timeout'), 28000);
    window[name] = json => finish(null, json);
    sc.onerror = () => finish('network');
    sc.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + name;
    document.head.appendChild(sc);
  };
  run(1);
}
function setSyncStatus(status, message){ sync.status = status; sync.message = message || ''; if(status === 'synced') sync.at = new Date(); if(PF.DOM.host) PF.renderSyncStatus(); }
function cloudLoad(cb, attempt = 0){
  if(!sync.url){ cb('sem servidor'); return; }
  gasJsonp(sync.url + '?action=getVpData&key=' + PF.CLOUD_SLOT + '&t=' + Date.now(), (err, json) => {
    // Falha de transporte já teve o retry do cliente JSONP — não empilhar outra camada.
    if(err) return cb(err);
    // Retry de conteúdo: transporte OK, mas resposta vazia/ok:false (disputa de lock no servidor).
    if(!json || !json.ok){
      if(attempt < 1) return setTimeout(() => cloudLoad(cb, attempt + 1), 2000);
      return cb((json && json.error) || 'sem resposta');
    }
    cb(null, json.data, typeof json.revision === 'number' ? json.revision : null);
  });
}
/* Adota a versão do servidor e reaplica as alterações locais ainda não confirmadas. */
function adoptServer(data, revision){
  const hasBase = !!(data && typeof data === 'object' && Array.isArray(data.initiatives));
  sync.revision = revision; sync.serverSeen = true;
  if(hasBase){
    PF.appState = prepareState(PF.clone(data));
    sync.pending.forEach(m => { try { m(PF.appState); } catch(e){} });
    persistState();
  }
  return hasBase;
}
function applyServerState(data, revision){
  const hasBase = adoptServer(data, revision);
  sync.loaded = true;
  if(!sync.pending.length) setSyncStatus('synced');
  if(PF.DOM.host) PF.refresh();
  // Servidor sem base mas este navegador tem uma cópia (ex.: base criada antes da chave existir): publica.
  if(!hasBase && PF.appState.initiatives.length && !sync.pending.length){ sync.pending.push(() => {}); scheduleCloudWrite(); }
}
function cloudInitialLoad(){
  if(!sync.url){ sync.loaded = true; setSyncStatus('local', 'Sem servidor configurado — base salva só neste navegador'); if(PF.DOM.host) PF.refresh(); return; }
  if(sync.loading) return; sync.loading = true;
  setSyncStatus('loading', 'Sincronizando base compartilhada…');
  cloudLoad((err, data, rev) => {
    sync.loading = false;
    if(err){ sync.loaded = true; setSyncStatus('error', 'Servidor indisponível — exibindo a última cópia salva neste navegador'); if(PF.DOM.host) PF.refresh(); return; }
    applyServerState(data, rev);
  });
}
function queueCloudWrite(mutator){ if(!sync.url) return; sync.pending.push(mutator); scheduleCloudWrite(); }
function scheduleCloudWrite(){ clearTimeout(sync.timer); setSyncStatus('saving', 'Salvando…'); sync.timer = setTimeout(() => cloudPush(0), 700); }
function cloudPush(attempt){
  if(!sync.url) return;
  if(sync.pushing){ sync.again = true; return; }
  sync.pushing = true;
  // Nunca grava "às cegas": sem ter visto a versão do servidor (carga inicial falhou),
  // busca primeiro e reaplica as alterações locais sobre ela.
  if(!sync.serverSeen){
    cloudLoad((err, data, rev) => {
      if(err){ sync.pushing = false; setSyncStatus('error', 'Servidor indisponível — alterações mantidas neste navegador'); return; }
      adoptServer(data, rev); sync.loaded = true; PF.refresh();
      sync.pushing = false; cloudPush(attempt);
    });
    return;
  }
  const writeId = 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  const md = PF.appState.metadata;
  md.writeId = writeId;
  md.appliedWrites = (Array.isArray(md.appliedWrites) ? md.appliedWrites : []).slice(-19).concat(writeId);
  persistState();
  const inflight = sync.pending.length;
  const body = 'action=saveVpData&key=' + PF.CLOUD_SLOT + (sync.revision != null ? '&baseRevision=' + sync.revision : '') + '&payload=' + encodeURIComponent(JSON.stringify(PF.appState));
  fetch(sync.url, {method:'POST', mode:'no-cors', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body})
    .catch(() => null)
    .then(() => setTimeout(() => cloudVerify(writeId, inflight, attempt), 1500));
}
/* POST no-cors é opaco: a confirmação vem de uma leitura. writeId identifica a gravação
   desta aba; appliedWrites (últimas 20) permite reconhecê-la mesmo se outra pessoa gravou
   logo depois — evita reaplicar (duplicar) alterações já aceitas pelo servidor. */
function cloudVerify(writeId, inflight, attempt){
  cloudLoad((err, data, rev) => {
    const finish = () => { sync.pushing = false; if(sync.again){ sync.again = false; cloudPush(0); } };
    if(err){ setSyncStatus('error', 'Não foi possível confirmar a gravação — alterações mantidas neste navegador'); finish(); return; }
    const md = data && data.metadata;
    const mine = !!md && (md.writeId === writeId || (Array.isArray(md.appliedWrites) && md.appliedWrites.includes(writeId)));
    if(mine){
      sync.pending = sync.pending.slice(inflight);
      if(md.writeId === writeId) sync.revision = rev;
      else { adoptServer(data, rev); PF.refresh(); } // outra pessoa gravou depois: adota e reaplica só o que ainda não foi enviado
      if(!sync.pending.length) setSyncStatus('synced');
      else sync.again = true;
      finish(); return;
    }
    const someoneElse = rev !== sync.revision && !!data && Array.isArray(data.initiatives);
    if(someoneElse && attempt < 2){
      // Conflito: outra pessoa gravou antes (baseRevision desatualizada). Parte da versão dela e reaplica as alterações desta aba.
      adoptServer(data, rev); PF.refresh();
      sync.pushing = false; cloudPush(attempt + 1); return;
    }
    if(!someoneElse && attempt < 1){ sync.pushing = false; cloudPush(attempt + 1); return; }
    setSyncStatus('error', someoneElse ? 'Conflito de edição não resolvido — recarregue a aba' : 'O servidor não aceitou a gravação (redução grande de registros ou falha de rede) — alterações mantidas neste navegador');
    finish();
  });
}
function onRemoteRevision(rev){
  if(typeof rev !== 'number' || !sync.loaded || sync.loading || sync.pushing || sync.pending.length) return;
  // Edição em andamento (popover aberto): adia para o próximo ping em vez de redesenhar sob o usuário.
  if(ui.anchored) return;
  if(sync.revision !== null && rev === sync.revision) return;
  sync.loading = true;
  cloudLoad((err, data, r) => { sync.loading = false; if(!err && !sync.pending.length && !sync.pushing) applyServerState(data, r); });
}
function retrySync(){ if(sync.pending.length) scheduleCloudWrite(); else cloudInitialLoad(); }

/* exporta para os demais módulos */
Object.assign(PF, {ui, loadState, emptyState, prepareState, migrateState, loadPrefs, persistState, persistPrefs, commit, sync, gasJsonp, setSyncStatus, cloudLoad, adoptServer, applyServerState, cloudInitialLoad, queueCloudWrite, scheduleCloudWrite, cloudPush, cloudVerify, onRemoteRevision, retrySync});
})();
