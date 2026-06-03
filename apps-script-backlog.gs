/************************************************************************
 * Lead Time SALA — Backlog Store (Google Apps Script / backend)
 * ---------------------------------------------------------------------
 * Centraliza os snapshots de backlog no servidor para que TODAS as
 * janelas/navegadores do time vejam o mesmo número (sem export/import).
 *
 * IMPORTANTE
 * Este arquivo é a FONTE do código do Apps Script. Depois de atualizar aqui,
 * é preciso copiar este conteúdo para o projeto em https://script.google.com
 * que responde pela URL BK_GAS_URL e publicar uma NOVA VERSÃO do Web App.
 *
 * Instalação / atualização:
 * 1. Abra o projeto do Apps Script usado em BK_GAS_URL.
 * 2. Substitua/adicione as funções abaixo sem duplicar doGet/doPost.
 * 3. Execute a função autorizarDriveUmaVez() uma vez e aceite as permissões.
 * 4. Implantar > Gerenciar implantações > Editar lápis.
 * 5. Versão: Nova versão > Implantar.
 * 6. Executar como: Eu | Quem pode acessar: Qualquer pessoa.
 ************************************************************************/

var BACKLOG_FILE = 'leadtime_backlog_store.json';
var STORIES_FILE = 'leadtime_stories_store.json';
var BACKLOG_SCRIPT_VERSION = '2026-06-03-stories-persist-v3';

function autorizarDriveUmaVez() {
  var files = DriveApp.getFilesByName(BACKLOG_FILE);
  var found = files.hasNext();
  var stFiles = DriveApp.getFilesByName(STORIES_FILE);
  var stFound = stFiles.hasNext();
  return 'Drive autorizado. Backlog existente: ' + found + ' · Estórias existentes: ' + stFound;
}

function doGet(e) {
  var action = getParam_(e, 'action');

  if (action === 'health') {
    var data = readStore();
    return jsonOut({
      ok: true,
      version: BACKLOG_SCRIPT_VERSION,
      snapshots: data.length,
      maxStories: maxStoryCount_(data),
      currentStories: currentSnap_(data) ? storyCount_(currentSnap_(data)) : 0,
      stories: readStories_().length
    }, e);
  }

  if (action === 'getBacklog') {
    var backlog = readStore();
    return jsonOut({
      ok: true,
      version: BACKLOG_SCRIPT_VERSION,
      backlog: backlog,
      snapshots: backlog.length,
      maxStories: maxStoryCount_(backlog)
    }, e);
  }

  if (action === 'getStories') {
    var stories = readStories_();
    return jsonOut({
      ok: true,
      version: BACKLOG_SCRIPT_VERSION,
      stories: stories,
      count: stories.length
    }, e);
  }

  return jsonOut({ ok: false, version: BACKLOG_SCRIPT_VERSION, error: 'unknown action: ' + action }, e);
}

function doPost(e) {
  try {
    var action = getParam_(e, 'action');

    if (action === 'saveBacklog') {
      var payload = getParam_(e, 'payload');
      if (!payload && e && e.postData && e.postData.contents) {
        payload = parseBody_(e.postData.contents).payload || e.postData.contents;
      }

      var incoming = JSON.parse(payload || '[]');
      if (!Array.isArray(incoming)) incoming = [];

      var before = readStore();
      var merged = mergeSnaps(before, incoming);
      writeStore(merged);

      return jsonOut({
        ok: true,
        version: BACKLOG_SCRIPT_VERSION,
        beforeSnapshots: before.length,
        incomingSnapshots: incoming.length,
        savedSnapshots: merged.length,
        savedMaxStories: maxStoryCount_(merged),
        currentStories: currentSnap_(merged) ? storyCount_(currentSnap_(merged)) : 0
      }, e);
    }

    if (action === 'saveStories') {
      var stPayload = getParam_(e, 'payload');
      if (!stPayload && e && e.postData && e.postData.contents) {
        stPayload = parseBody_(e.postData.contents).payload || e.postData.contents;
      }

      var incomingStories = JSON.parse(stPayload || '[]');
      if (!Array.isArray(incomingStories)) incomingStories = [];

      var beforeStories = readStories_();
      var mergedStories = mergeStories_(beforeStories, incomingStories);
      writeStories_(mergedStories);

      return jsonOut({
        ok: true,
        version: BACKLOG_SCRIPT_VERSION,
        beforeStories: beforeStories.length,
        incomingStories: incomingStories.length,
        savedStories: mergedStories.length
      }, e);
    }

    return jsonOut({ ok: false, version: BACKLOG_SCRIPT_VERSION, error: 'unknown action: ' + action }, e);
  } catch (err) {
    return jsonOut({ ok: false, version: BACKLOG_SCRIPT_VERSION, error: String(err && err.stack || err) }, e);
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
  String(body || '').split('&').forEach(function (part) {
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

/* ---- Merge não-destrutivo por identidade ---- */
function snapKey(s) {
  return (s && s.id) ? ('id:' + s.id) : ('seq:' + (s ? s.seq : ''));
}
function storyCount_(s) {
  return s && Array.isArray(s.stories) ? s.stories.length : 0;
}
function snapTime_(s) {
  var t = Date.parse((s && s.importedAt) || '');
  return isNaN(t) ? 0 : t;
}
function compareSnaps_(a, b) {
  var ca = storyCount_(a), cb = storyCount_(b);
  if (ca !== cb) return ca - cb;
  var ta = snapTime_(a), tb = snapTime_(b);
  if (ta !== tb) return ta - tb;
  return (Number(a && a.seq) || 0) - (Number(b && b.seq) || 0);
}
function currentSnap_(arr) {
  var copy = (arr || []).slice().sort(compareSnaps_);
  return copy.length ? copy[copy.length - 1] : null;
}
function maxStoryCount_(arr) {
  return (arr || []).reduce(function (m, s) { return Math.max(m, storyCount_(s)); }, 0);
}

function mergeSnaps(base, incoming) {
  var byKey = {};
  (base || []).forEach(function (s) {
    if (s) byKey[snapKey(s)] = s;
  });

  (incoming || []).forEach(function (s) {
    if (!s) return;
    var k = snapKey(s);
    var ex = byKey[k];
    if (!ex) {
      byKey[k] = s;
      return;
    }

    // Mesma identidade: mantém o snapshot com mais histórias; empate fica com o mais recente.
    var nNew = storyCount_(s), nOld = storyCount_(ex);
    if (nNew > nOld || (nNew === nOld && snapTime_(s) > snapTime_(ex))) {
      byKey[k] = s;
    }
  });

  var out = Object.keys(byKey).map(function (k) { return byKey[k]; });
  out.sort(compareSnaps_);
  return out;
}

/* ---- Estórias (Qtd Story/Épicos): merge não-destrutivo por id ---- */
// Cada estória é {id, epic, resumo, status, squad}. Une por id; em colisão,
// a versão recebida (importação mais recente) vence, preservando estórias de
// outras squads que não estavam no payload atual.
function mergeStories_(base, incoming) {
  var byId = {};
  var order = [];
  function add(s, overwrite) {
    if (!s || !s.id) return;
    var k = String(s.id);
    if (!(k in byId)) order.push(k);
    if (overwrite || !(k in byId)) byId[k] = s;
  }
  (base || []).forEach(function (s) { add(s, false); });
  (incoming || []).forEach(function (s) { add(s, true); });
  return order.map(function (k) { return byId[k]; });
}

function getStoriesFile_() {
  var it = DriveApp.getFilesByName(STORIES_FILE);
  return it.hasNext() ? it.next() : null;
}
function readStories_() {
  var f = getStoriesFile_();
  if (!f) return [];
  try {
    var data = JSON.parse(f.getBlob().getDataAsString() || '[]');
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}
function writeStories_(arr) {
  var json = JSON.stringify(arr || []);
  var f = getStoriesFile_();
  if (f) f.setContent(json);
  else DriveApp.createFile(STORIES_FILE, json, MimeType.PLAIN_TEXT);
}

/* ---- Armazenamento: arquivo JSON no Drive ---- */
function getStoreFile() {
  var it = DriveApp.getFilesByName(BACKLOG_FILE);
  return it.hasNext() ? it.next() : null;
}
function readStore() {
  var f = getStoreFile();
  if (!f) return [];
  try {
    var data = JSON.parse(f.getBlob().getDataAsString() || '[]');
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}
function writeStore(arr) {
  var json = JSON.stringify(arr || []);
  var f = getStoreFile();
  if (f) f.setContent(json);
  else DriveApp.createFile(BACKLOG_FILE, json, MimeType.PLAIN_TEXT);
}

/* ---- Resposta JSON / JSONP ---- */
function jsonOut(obj, e) {
  var out = ContentService.createTextOutput();
  var cb = e && e.parameter && e.parameter.callback;
  if (cb) {
    out.setContent(cb + '(' + JSON.stringify(obj) + ')');
    out.setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    out.setContent(JSON.stringify(obj));
    out.setMimeType(ContentService.MimeType.JSON);
  }
  return out;
}
