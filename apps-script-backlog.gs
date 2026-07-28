/************************************************************************
 * Lead Time SALA — Backlog & Stories Store (Google Apps Script / backend)
 * v13 — saveStories e saveVpData (discoveryPmo) agora mesclam por id em vez
 * de sobrescrever puro. Antes, dois pontos gravando a mesma chave em
 * sequência (ex.: uma aba salvando enquanto outra, no ambiente interno do
 * Bradesco, também sincroniza) faziam a segunda gravação apagar squads/
 * histórias que só existiam na primeira — mesmo padrão que mergeSnaps_ já
 * resolvia para saveBacklog. Ver mergeStoriesById_/mergeDiscoveryPmo_.
 ************************************************************************/

var BACKLOG_SCRIPT_VERSION = '2026-07-28-merge-stories-vp-v13';

var BACKLOG_SHEET = '_backlog_chunks';
var STORIES_SHEET = '_stories_chunks';
var CHUNK_SIZE = 45000;
var MAX_PAYLOAD_CHARS = 4000000;

var VP_SHEET_MAP = {
  vpGeral:      '_vp_geral',
  vpSprint:     '_vp_sprint',
  vpHomologation: '_vp_homologation',
  vpDeliveries: '_vp_deliveries',
  vpOpUpdates:  '_vp_opupdates',
  vpQuickNotes: '_vp_quicknotes',
  vpEpicMeta:   '_vp_epic_meta',
  emergencyDemand: '_emergency_demand',
  discoveryPmo: '_discovery_pmo'  // base completa do Discovery PMO Tracker (projetos, squads, cards, etc.)
};

// Valor canônico persistido nos itens RAID da base discoveryPmo. A Squad não
// é uma área responsável e, por isso, não entra nesta lista.
var RAID_RESPONSIBLE_AREAS = [
  'Arquitetura',
  'Desenvolvimento',
  'Negócio',
  'Segurança e Compliance',
  'Infraestrutura',
  'Dados e Integrações',
  'Jurídico',
  'Fornecedor / Terceiro',
  'Alocação / RTE'
];

function getVpSheet_(key) {
  return VP_SHEET_MAP[key] || null;
}

function autorizarPlanilhaUmaVez() {
  var lock = LockService.getScriptLock();
  lock.waitLock(LOCK_TIMEOUT_MS);
  try {
    var sheet = getOrCreateSheet_(BACKLOG_SHEET);
    if (!sheet.getLastRow()) sheet.getRange('A1').setValue('[]');
    return 'Planilha autorizada com sucesso. Base existente preservada.';
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  // Calculado fora do try para o catch também conseguir responder no formato
  // JSONP esperado pelo cliente (_gasJsonp), em vez de um erro sem callback.
  var callback = getSafeCallback_(getParam_(e, 'callback'));
  try {
    var action = getParam_(e, 'action');

    if (action === 'health') {
      // withLock_ faz a leitura esperar uma gravação em andamento em vez de
      // pegar a planilha a meio de clearContents()+setValues() (writeJsonToSheet_
      // não usa transação — sem isso, doGet podia ler vazio nessa janela).
      var healthData = withLock_(function() {
        return {
          backlog: readBacklogStore_(),
          stories: readJsonFromSheet_(STORIES_SHEET, [])
        };
      });
      return jsonOut_({
        ok: true,
        version: BACKLOG_SCRIPT_VERSION,
        snapshots: healthData.backlog.length,
        maxStories: maxStoryCount_(healthData.backlog),
        currentStories: currentSnap_(healthData.backlog) ? storyCount_(currentSnap_(healthData.backlog)) : 0,
        stories: healthData.stories.length
      }, callback);
    }

    if (action === 'getBacklog') {
      var backlog = withLock_(function() { return readBacklogStore_(); });
      return jsonOut_({
        ok: true,
        version: BACKLOG_SCRIPT_VERSION,
        backlog: backlog,
        snapshots: backlog.length,
        maxStories: maxStoryCount_(backlog)
      }, callback);
    }

    if (action === 'getStories') {
      var stories = withLock_(function() { return readJsonFromSheet_(STORIES_SHEET, []); });
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
      var vpData = withLock_(function() { return readJsonFromSheet_(sheetName, null); });
      return jsonOut_({ ok: true, data: vpData }, callback);
    }

    return jsonOut_({ ok: true, version: BACKLOG_SCRIPT_VERSION, data: [] }, callback);
  } catch (err) {
    Logger.log('doGet falhou: ' + (err && err.stack || err));
    return jsonOut_({ ok: false, version: BACKLOG_SCRIPT_VERSION, error: 'falha ao ler dados: ' + String(err && err.message || err) }, callback);
  }
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
      var parsedBacklog = parsePayload_(payload, true);
      if (!parsedBacklog.ok) return jsonOut_({ ok: false, version: BACKLOG_SCRIPT_VERSION, error: parsedBacklog.error });
      var incoming = parsedBacklog.data;
      try {
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
      } catch (lockErr) {
        // Sem este catch próprio, um erro de "lock não obtido" (mensagem específica
        // e acionável, ver withLock_) caía no catch genérico do doPost e virava
        // "falha interna ao processar a solicitação" — perdendo a informação de que
        // era só tentar de novo, diferente de saveStories/saveVpData.
        return jsonOut_({ ok: false, version: BACKLOG_SCRIPT_VERSION, error: String(lockErr && lockErr.message || lockErr) });
      }
    }

    if (action === 'saveStories') {
      var payloadStories = getParam_(e, 'payload') || '[]';
      try {
        var parsedStoriesResult = parsePayload_(payloadStories, true);
        if (!parsedStoriesResult.ok) return jsonOut_({ ok: false, version: BACKLOG_SCRIPT_VERSION, error: parsedStoriesResult.error });
        var parsedStories = parsedStoriesResult.data;
        if (parsedStories.length === 0) {
          var existing = withLock_(function() { return readJsonFromSheet_(STORIES_SHEET, []); });
          return jsonOut_({ ok: true, version: BACKLOG_SCRIPT_VERSION, skipped: 'payload vazio', savedStories: existing.length });
        }
        var savedStoriesCount = withLock_(function() {
          var beforeStories = readJsonFromSheet_(STORIES_SHEET, []);
          var mergedStories = mergeStoriesById_(beforeStories, parsedStories);
          writeJsonToSheet_(STORIES_SHEET, mergedStories);
          return mergedStories.length;
        });
        return jsonOut_({ ok: true, version: BACKLOG_SCRIPT_VERSION, savedStories: savedStoriesCount });
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
        var parsedVp = parsePayload_(vpPayload, false);
        if (!parsedVp.ok || parsedVp.data === null || typeof parsedVp.data !== 'object') {
          return jsonOut_({ ok: false, error: parsedVp.ok ? 'payload deve ser objeto ou lista' : parsedVp.error });
        }
        var vpData = parsedVp.data;
        // Mantém a base completa como está, mas consolida a área do RAID no
        // campo único areaResponsavel quando vier em um alias já conhecido.
        // Itens legados sem área continuam válidos e não são descartados.
        if (vpKey === 'discoveryPmo') vpData = normalizeDiscoveryRaidAreas_(vpData);
        withLock_(function() {
          if (vpKey === 'discoveryPmo') {
            var beforeVp = readJsonFromSheet_(vpSheetName, null);
            vpData = mergeDiscoveryPmo_(beforeVp, vpData);
          }
          writeJsonToSheet_(vpSheetName, vpData);
        });
        return jsonOut_({ ok: true, key: vpKey });
      } catch (vpErr) {
        return jsonOut_({ ok: false, error: 'payload inválido: ' + String(vpErr && vpErr.message || vpErr) });
      }
    }

    return jsonOut_({ ok: false, version: BACKLOG_SCRIPT_VERSION, error: 'unknown action: ' + action });
  } catch (err) {
    Logger.log('doPost falhou: ' + (err && err.stack || err));
    return jsonOut_({ ok: false, version: BACKLOG_SCRIPT_VERSION, error: 'falha interna ao processar a solicitação' });
  }
}

function parsePayload_(payload, requiresArray) {
  var raw = String(payload == null ? '' : payload);
  if (!raw) return { ok: false, error: 'payload ausente' };
  if (raw.length > MAX_PAYLOAD_CHARS) return { ok: false, error: 'payload excede o limite permitido' };
  try {
    var data = JSON.parse(raw);
    if (requiresArray && !Array.isArray(data)) return { ok: false, error: 'payload deve ser uma lista' };
    return { ok: true, data: data };
  } catch (err) {
    return { ok: false, error: 'payload inválido' };
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
  var json = JSON.stringify(data);
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

function normalizeDiscoveryRaidAreas_(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.projects)) return data;
  var groups = ['risks', 'assumptions', 'issues', 'dependencies'];
  data.projects.forEach(function(project) {
    var raids = project && project.raids;
    if (!raids || typeof raids !== 'object') return;
    groups.forEach(function(group) {
      if (!Array.isArray(raids[group])) return;
      raids[group].forEach(function(item) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return;
        var area = canonicalRaidArea_(item.areaResponsavel || item.responsibleArea || item.department || item.area);
        if (area) item.areaResponsavel = area;
      });
    });
  });
  return data;
}

function canonicalRaidArea_(value) {
  var raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  var normalized = raw.toLocaleLowerCase();
  for (var i = 0; i < RAID_RESPONSIBLE_AREAS.length; i++) {
    var candidate = RAID_RESPONSIBLE_AREAS[i];
    if (candidate.toLocaleLowerCase() === normalized) return candidate;
  }
  return '';
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

// Une histórias existentes com as recém-enviadas por id (chave do Jira). Sem
// isso, salvar de um ponto que ainda não tinha carregado as histórias mais
// recentes de outro (ex.: aba antiga em cache, ou o ambiente interno do
// Bradesco sincronizando em paralelo) apagava histórias inteiras que só
// existiam do outro lado — o payload é sempre a lista completa conhecida
// por quem salva, nunca um diff.
function mergeStoriesById_(existing, incoming) {
  var byId = {};
  var order = [];
  (existing || []).forEach(function(s) {
    if (!s || !s.id) return;
    if (!(s.id in byId)) order.push(s.id);
    byId[s.id] = s;
  });
  (incoming || []).forEach(function(s) {
    if (!s || !s.id) return;
    if (!(s.id in byId)) order.push(s.id);
    byId[s.id] = s;
  });
  return order.map(function(id) { return byId[id]; });
}

// Une listas por id (ex.: projects/squads do Discovery PMO), preferindo o
// item com updatedAt mais recente quando o id existe dos dois lados, e
// removendo ids marcados como excluídos em `deletedIds`. Mesma regra usada
// no merge client-side (mergeById em discovery-pmo/index.html) — replicada
// aqui como segunda linha de defesa contra overwrite do servidor.
function mergeListById_(existingList, incomingList, deletedIds) {
  var map = {};
  var order = [];
  (existingList || []).forEach(function(item) {
    if (!item || !item.id) return;
    if (deletedIds && deletedIds[item.id]) return;
    if (!(item.id in map)) order.push(item.id);
    map[item.id] = item;
  });
  (incomingList || []).forEach(function(item) {
    if (!item || !item.id) return;
    if (deletedIds && deletedIds[item.id]) return;
    var ex = map[item.id];
    if (!ex) { order.push(item.id); map[item.id] = item; return; }
    var tNew = Date.parse(item.updatedAt || '') || 0;
    var tOld = Date.parse(ex.updatedAt || '') || 0;
    if (tNew >= tOld) map[item.id] = item;
  });
  return order.map(function(id) { return map[id]; });
}

// Mescla a base do Discovery PMO (squads/sprints/projetos) em vez de
// sobrescrever puro. Réplica, no servidor, do merge por id + tumbas de
// exclusão que o cliente já faz antes de salvar (mergeRemoteIntoData em
// discovery-pmo/index.html) — segunda camada de proteção para o caso de
// duas gravações concorrentes (duas abas, ou dois ambientes/links
// diferentes apontando para a mesma planilha) se sobreporem no servidor.
function mergeDiscoveryPmo_(before, incoming) {
  if (!incoming || typeof incoming !== 'object') return incoming;
  if (!before || typeof before !== 'object') return incoming;
  if (!Array.isArray(before.projects) || !before.projects.length) return incoming;
  if (!Array.isArray(incoming.projects)) return before;

  var tombstonesById = {};
  (before.tombstones || []).forEach(function(t) { if (t && t.id) tombstonesById[t.id] = t; });
  (incoming.tombstones || []).forEach(function(t) {
    if (!t || !t.id) return;
    var ex = tombstonesById[t.id];
    if (!ex || (Date.parse(t.deletedAt || '') || 0) > (Date.parse(ex.deletedAt || '') || 0)) tombstonesById[t.id] = t;
  });
  var mergedTombstones = Object.keys(tombstonesById).map(function(id) { return tombstonesById[id]; });
  var deletedIds = {};
  mergedTombstones.forEach(function(t) { deletedIds[t.id] = true; });

  var mergedProjects = mergeListById_(before.projects, incoming.projects, deletedIds);
  if (!mergedProjects.length) return incoming; // nunca fica sem nenhuma iniciativa por causa do merge

  var mergedSquads = mergeListById_(before.squads, incoming.squads, deletedIds);
  var mergedHistory = mergeListById_(before.importHistory, incoming.importHistory, null)
    .sort(function(a, b) { return (Date.parse((b && b.at) || '') || 0) - (Date.parse((a && a.at) || '') || 0); })
    .slice(0, 30);

  var merged = incoming; // preserva demais campos (metadados, flags) do payload mais recente
  merged.tombstones = mergedTombstones;
  merged.projects = mergedProjects;
  merged.squads = mergedSquads.length ? mergedSquads : before.squads;
  merged.importHistory = mergedHistory;
  merged.cardsResetV1 = before.cardsResetV1 || incoming.cardsResetV1;
  merged.squadNamesSyncedV1 = before.squadNamesSyncedV1 || incoming.squadNamesSyncedV1;
  merged.updatedAt = new Date(Math.max(Date.parse(before.updatedAt || '') || 0, Date.parse(incoming.updatedAt || '') || 0)).toISOString();
  return merged;
}

function getSafeCallback_(callback) {
  var value = String(callback || '');
  return /^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(value) ? value : '';
}

function jsonOut_(obj, callback) {
  callback = getSafeCallback_(callback);
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
