/************************************************************************
 * Lead Time SALA — Backlog Store (Google Apps Script / backend)
 * ---------------------------------------------------------------------
 * Centraliza os snapshots de backlog no servidor para que TODAS as
 * janelas/navegadores do time vejam o mesmo número (sem export/import).
 *
 * O frontend:
 *   - PUBLICA  via POST  action=saveBacklog&payload=<JSON dos snapshots>
 *     (em mode:'no-cors' — a gravação chega, a resposta é ignorada)
 *   - LÊ       via GET   ?action=getBacklog   ->  { ok:true, backlog:[...] }
 *
 * Este script faz MERGE por id (mantém o snapshot mais completo) e guarda
 * a união num arquivo JSON no seu Google Drive — sem limite de tamanho de
 * célula. Nada é sobrescrito de forma destrutiva.
 *
 * ─── COMO INSTALAR (uma vez) ─────────────────────────────────────────
 * 1. Abra https://script.google.com e crie/abra o projeto do Web App
 *    que hoje responde pela URL BK_GAS_URL do dashboard.
 * 2. Cole TODO este conteúdo (substituindo as funções getBacklog/saveBacklog
 *    existentes, ou adicionando se não houver). Mantenha as suas funções
 *    de Stories/Sheets, se existirem — só não duplique doGet/doPost.
 * 3. Implantar > Gerenciar implantações > (sua implantação) > Editar (lápis)
 *    > Versão: "Nova versão" > Implantar.
 *      • Executar como: Eu
 *      • Quem pode acessar: Qualquer pessoa
 *    Usar "Nova versão" na MESMA implantação mantém a URL /exec igual,
 *    então não é preciso mudar nada no dashboard.
 * 4. Autorize o acesso ao Drive quando solicitado.
 *
 * Se você criar uma implantação NOVA (URL diferente), me avise a nova URL
 * que eu atualizo a constante BK_GAS_URL no index.html.
 ************************************************************************/

var BACKLOG_FILE = 'leadtime_backlog_store.json';

function doGet(e) {
  var action = e && e.parameter && e.parameter.action;
  if (action === 'getBacklog') {
    return jsonOut({ ok: true, backlog: readStore() }, e);
  }
  // ... mantenha aqui outros GETs que você já tenha (ex.: getStories) ...
  return jsonOut({ ok: false, error: 'unknown action' }, e);
}

function doPost(e) {
  try {
    var action = e.parameter.action;
    if (action === 'saveBacklog') {
      var incoming = JSON.parse(e.parameter.payload || '[]');
      var merged = mergeSnaps(readStore(), incoming);
      writeStore(merged);
      return jsonOut({ ok: true, count: merged.length });
    }
    // ... mantenha aqui outros POSTs que você já tenha (ex.: saveStories) ...
    return jsonOut({ ok: false, error: 'unknown action' });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

/* ---- Merge não-destrutivo por identidade (id global; fallback seq) ---- */
function snapKey(s) { return (s && s.id) ? ('id:' + s.id) : ('seq:' + (s ? s.seq : '')); }

function mergeSnaps(base, incoming) {
  var byKey = {};
  (base || []).forEach(function (s) { if (s) byKey[snapKey(s)] = s; });
  (incoming || []).forEach(function (s) {
    if (!s) return;
    var k = snapKey(s), ex = byKey[k];
    if (!ex) { byKey[k] = s; return; }
    var nNew = (s.stories ? s.stories.length : 0);
    var nOld = (ex.stories ? ex.stories.length : 0);
    if (nNew > nOld) byKey[k] = s; // mantém o mais completo
  });
  var out = Object.keys(byKey).map(function (k) { return byKey[k]; });
  out.sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); });
  return out;
}

/* ---- Armazenamento: arquivo JSON no Drive (sem limite de célula) ---- */
function getStoreFile() {
  var it = DriveApp.getFilesByName(BACKLOG_FILE);
  return it.hasNext() ? it.next() : null;
}
function readStore() {
  var f = getStoreFile();
  if (!f) return [];
  try { return JSON.parse(f.getBlob().getDataAsString() || '[]'); }
  catch (e) { return []; }
}
function writeStore(arr) {
  var json = JSON.stringify(arr);
  var f = getStoreFile();
  if (f) f.setContent(json);
  else DriveApp.createFile(BACKLOG_FILE, json, MimeType.PLAIN_TEXT);
}

/* ---- Resposta JSON (com suporte opcional a JSONP via &callback=) ---- */
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
