/************************************************************************
 * Lead Time SALA — Backlog & Stories Store (Google Apps Script / backend)
 * v7 — adiciona discoveryPmo para sync do Discovery PMO Tracker entre usuários
 *      (mantém vpEpicMeta e o fix de compareSnaps_ por tempo, da v6)
 ************************************************************************/

var BACKLOG_SCRIPT_VERSION = '2026-07-06-backlog-sheet-chunks-v7';

var BACKLOG_SHEET = '_backlog_chunks';
var STORIES_SHEET = '_stories_chunks';
var CHUNK_SIZE = 45000;

var VP_SHEET_MAP = {
  vpGeral:      '_vp_geral',
  vpSprint:     '_vp_sprint',
  vpDeliveries: '_vp_deliveries',
  vpOpUpdates:  '_vp_opupdates',
  vpQuickNotes: '_vp_quicknotes',
  vpEpicMeta:   '_vp_epic_meta',
  discoveryPmo: '_discovery_pmo'  // base completa do Discovery PMO Tracker (projetos, squads, cards, etc.)
};

function getVpSheet_(key) {
  return VP_SHEET_MAP[key] || null;
}

function autorizarPlanilhaUmaVez() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet_(BACKLOG_SHEET);
  sheet.getRange('A1').setValue('[]');
  return 'Planilha autorizada com sucesso.';
}

function doGet(e) {
  var action = getParam_(e, 'action');
  var callback = getParam_(e, 'callback');

  if (action === 'health') {
    var data = readBacklogStore_();
    return jsonOut_({
      ok: true,
      version: BACKLOG_SCRIPT_VERSION,
      snapshots: data.length,
      maxStories: maxStoryCount_(data),
      currentStories: currentSnap_(data) ? storyCount_(currentSnap_(data)) : 0,
      stories: readJsonFromSheet_(STORIES_SHEET, []).length
    }, callback);
  }

  if (action === 'getBacklog') {
    var backlog = readBacklogStore_();
    return jsonOut_({
      ok: true,
      version: BACKLOG_SCRIPT_VERSION,
      backlog: backlog,
      snapshots: backlog.length,
      maxStories: maxStoryCount_(backlog)
    }, callback);
  }

  if (action === 'getStories') {
    var stories = readJsonFromSheet_(STORIES_SHEET, []);
    return jsonOut_({
      ok: true,
      version: BACKLOG_SCRIPT_VERSION,
      stories: stories
    }, callback);
  }

  if (action === 'getVpData') {
    var key = getParam_(e, 'key');
    var sheetName = getVpSheet_(key);
    if (!sheetName) {
      return jsonOut_({ ok: false, error: 'chave inválida: ' + key }, callback);
    }
    var vpData = readJsonFromSheet_(sheetName, null);
    return jsonOut_({ ok: true, data: vpData }, callback);
  }

  return jsonOut_({ ok: true, version: BACKLOG_SCRIPT_VERSION, data: [] }, callback);
}

// LOCK_TIMEOUT_MS: tempo máximo esperando a vez de escrever. writeJsonToSheet_ faz
// clearContents() + overwrite sem merge (só saveBacklog mescla via mergeSnaps_); sem lock,
// duas gravações concorrentes (dois usuários salvando ao mesmo tempo) podem se sobrepor e
// uma apaga silenciosamente o que a outra acabou de salvar. withLock_ serializa essas
// gravações por planilha, então a segunda espera a primeira terminar em vez de colidir.
var LOCK_TIMEOUT_MS = 10000;

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  var locked = lock.tryLock(LOCK_TIMEOUT_MS);
  if (!locked) throw new Error('Não foi possível obter lock de escrita (outra gravação em andamento). Tente novamente.');
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function doPost(e) {
  try {
    var action = getParam_(e, 'action');

    if (action === 'saveBacklog') {
      var payload = getParam_(e, 'payload');
      var incoming = [];
      try { incoming = JSON.parse(payload || '[]'); } catch (err) { incoming = []; }
      if (!Array.isArray(incoming)) incoming = [];
      var result = withLock_(function() {
        var before = readBacklogStore_();
        var merged = mergeSnaps_(before, incoming);
        writeBacklogStore_(merged);
        return { before: before, merged: merged };
      });
      return jsonOut_({
        ok: true,
        version: BACKLOG_SCRIPT_VERSION,
        beforeSnapshots: result.before.length,
        incomingSnapshots: incoming.length,
        savedSnapshots: result.merged.length,
        savedMaxStories: maxStoryCount_(result.merged),
        currentStories: currentSnap_(result.merged) ? storyCount_(currentSnap_(result.merged)) : 0
      });
    }

    if (action === 'saveStories') {
      var payloadStories = getParam_(e, 'payload') || '[]';
      try {
        var parsedStories = JSON.parse(payloadStories);
        if (!Array.isArray(parsedStories)) parsedStories = [];
        if (parsedStories.length === 0) {
          var existing = withLock_(function() { return readJsonFromSheet_(STORIES_SHEET, []); });
          return jsonOut_({ ok: true, version: BACKLOG_SCRIPT_VERSION, skipped: 'payload vazio', savedStories: existing.length });
        }
        withLock_(function() { writeJsonToSheet_(STORIES_SHEET, parsedStories); });
        return jsonOut_({ ok: true, version: BACKLOG_SCRIPT_VERSION, savedStories: parsedStories.length });
      } catch (err) {
        return jsonOut_({ ok: false, version: BACKLOG_SCRIPT_VERSION, error: 'payload inválido: ' + String(err && err.message || err) });
      }
    }

    if (action === 'saveVpData') {
      var vpKey = getParam_(e, 'key');
      var vpSheetName = getVpSheet_(vpKey);
      if (!vpSheetName) {
        return jsonOut_({ ok: false, error: 'chave inválida: ' + vpKey });
      }
      var vpPayload = getParam_(e, 'payload') || 'null';
      try {
        var vpData = JSON.parse(vpPayload);
        withLock_(function() { writeJsonToSheet_(vpSheetName, vpData); });
        return jsonOut_({ ok: true, key: vpKey });
      } catch (vpErr) {
        return jsonOut_({ ok: false, error: 'payload inválido: ' + String(vpErr && vpErr.message || vpErr) });
      }
    }

    return jsonOut_({ ok: false, version: BACKLOG_SCRIPT_VERSION, error: 'unknown action: ' + action });
  } catch (err) {
    return jsonOut_({ ok: false, version: BACKLOG_SCRIPT_VERSION, error: String(err && err.stack || err) });
  }
}

function getParam_(e, name) {
  if (e && e.parameter && e.parameter[name] != null) return e.parameter[name];
  if (e && e.postData && e.postData.contents) {
    var parsed = parseBody_(e.postData.contents);
    if (parsed[name] != null) return parsed[name];
  }
  return '';
}

function parseBody_(body) {
  var out = {};
  String(body || '').split('&').forEach(function(part) {
    if (!part) return;
    var eq = part.indexOf('=');
    var k = eq >= 0 ? part.slice(0, eq) : part;
    var v = eq >= 0 ? part.slice(eq + 1) : '';
    try { k = decodeURIComponent(k.replace(/\+/g, ' ')); } catch (e) {}
    try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) {}
    out[k] = v;
  });
  return out;
}

function readBacklogStore_() {
  var data = readJsonFromSheet_(BACKLOG_SHEET, []);
  return Array.isArray(data) ? data : [];
}

function writeBacklogStore_(arr) {
  writeJsonToSheet_(BACKLOG_SHEET, arr || []);
}

function readJsonFromSheet_(sheetName, fallback) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return fallback;
    var lastRow = sheet.getLastRow();
    if (!lastRow) return fallback;
    var values = sheet.getRange(1, 1, lastRow, 1).getValues();
    var json = values.map(function(row) { return row[0] == null ? '' : String(row[0]); }).join('');
    if (!json) return fallback;
    return JSON.parse(json);
  } catch (err) {
    // Payload corrompido cai no fallback silenciosamente do ponto de vista do usuário
    // (não quebra a resposta), mas fica registrado no Executions do Apps Script em vez
    // de sumir sem rastro — antes não havia log nenhum aqui.
    Logger.log('readJsonFromSheet_ falhou para ' + sheetName + ': ' + (err && err.stack || err));
    return fallback;
  }
}

function writeJsonToSheet_(sheetName, data) {
  var json = JSON.stringify(data || []);
  var sheet = getOrCreateSheet_(sheetName);
  sheet.clearContents();
  var chunks = [];
  for (var i = 0; i < json.length; i += CHUNK_SIZE) {
    chunks.push([json.slice(i, i + CHUNK_SIZE)]);
  }
  if (!chunks.length) chunks = [['[]']];
  var range = sheet.getRange(1, 1, chunks.length, 1);
  range.setNumberFormat('@');
  range.setValues(chunks);
  try { sheet.hideSheet(); } catch (e) {}
}

function getOrCreateSheet_(sheetName) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = ss.insertSheet(sheetName);
  return sheet;
}

function snapKey_(s) { return s && s.id ? 'id:' + s.id : 'seq:' + (s ? s.seq : ''); }
function storyCount_(s) { return s && Array.isArray(s.stories) ? s.stories.length : 0; }
function snapTime_(s) { var t = Date.parse((s && s.importedAt) || ''); return isNaN(t) ? 0 : t; }

function compareSnaps_(a, b) {
  // Ordena por TEMPO primeiro — importação mais recente = snapshot atual.
  // Consistente com o frontend (compareBacklogSnaps). Antes ordenava por
  // contagem de histórias, causando divergência entre frontend e backend.
  var ta = snapTime_(a), tb = snapTime_(b);
  if (ta !== tb) return ta - tb;
  var ca = storyCount_(a), cb = storyCount_(b);
  if (ca !== cb) return ca - cb;
  return (Number(a && a.seq) || 0) - (Number(b && b.seq) || 0);
}

function currentSnap_(arr) {
  var copy = (arr || []).slice().sort(compareSnaps_);
  return copy.length ? copy[copy.length - 1] : null;
}

function maxStoryCount_(arr) {
  return (arr || []).reduce(function(m, s) { return Math.max(m, storyCount_(s)); }, 0);
}

function mergeSnaps_(base, incoming) {
  var byKey = {};
  (base || []).forEach(function(s) { if (s) byKey[snapKey_(s)] = s; });
  (incoming || []).forEach(function(s) {
    if (!s) return;
    var k = snapKey_(s), ex = byKey[k];
    if (!ex) { byKey[k] = s; return; }
    var nNew = storyCount_(s), nOld = storyCount_(ex);
    if (nNew > nOld || (nNew === nOld && snapTime_(s) > snapTime_(ex))) byKey[k] = s;
  });
  var out = Object.keys(byKey).map(function(k) { return byKey[k]; });
  out.sort(compareSnaps_);
  return out;
}

function jsonOut_(obj, callback) {
  var out = ContentService.createTextOutput();
  if (callback) {
    out.setContent(callback + '(' + JSON.stringify(obj) + ')');
    out.setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    out.setContent(JSON.stringify(obj));
    out.setMimeType(ContentService.MimeType.JSON);
  }
  return out;
}
