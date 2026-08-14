/************************************************************************
 * Lead Time SALA — Backlog & Stories Store (Google Apps Script / backend)
 *
 * v21 — action=getRevisions: devolve só os contadores de revisão (backlog,
 * stories, cada chave de VP_SHEET_MAP), sem ler planilha nem disputar lock.
 * Motivação: os 3 painéis (index.html a cada 2min, visao-projetos a cada
 * 2min x9 chaves, discovery-pmo a cada 15s!) buscavam os dados COMPLETOS
 * naquele ritmo fixo, mesmo quando nada tinha mudado desde a última vez —
 * com várias pessoas de aba aberta o dia todo, isso é exatamente o padrão
 * de disputa de lock que já causou o esgotamento de cota do incidente de
 * 04–05/08. Agora o cliente faz esse ping barato no lugar da leitura
 * pesada, e só busca os dados completos quando a revisão realmente mudou.
 * getBacklog também passa a devolver revision, para o cliente saber a que
 * revisão os dados que acabou de buscar correspondem. Resposta do ping é só
 * números — de propósito pequena, para nunca esbarrar na truncagem de proxy
 * corporativo que já derrubou a consolidação em getVpDataAll (ver v17 e o
 * revert em visao-projetos/index.html / report-semanal-operacional.html).
 *
 * v20 — LOCK_TIMEOUT_MS 10s → 20s. O lock é ÚNICO pro script inteiro
 * (LockService.getScriptLock()), compartilhado por TODAS as ações — leitura
 * e escrita, das 13+ chaves diferentes. Com várias pessoas usando o painel
 * ao mesmo tempo, até um health check simples podia esperar mais que 10s e
 * falhar com "Não foi possível obter lock de escrita". Também: retry no
 * cliente (index.html) quando o servidor responde esse erro específico de
 * lock, além do retry por timeout de JSONP que já existia.
 *
 * v19 — cache (CacheService) da projeção do getOps4opsData. O v18 já reduzia
 * o que TRAFEGA pela rede, mas cada chamada continuava lendo e fazendo
 * JSON.parse do discoveryPmo inteiro (alguns MB) antes de enxugar — com
 * várias pessoas na aba Ops4Ops, era chamada repetida, cold-start e disputa
 * de lock em cima do mesmo trabalho pesado. Agora a projeção pronta fica em
 * cache por até 10 min (OPS4OPS_LEAN_CACHE_TTL_SEC) e é invalidada na hora
 * em qualquer saveVpData de discoveryPmo — sem planilha nem script novo.
 *
 * v18 — getOps4opsData: endpoint enxuto para a aba Ops4Ops. Antes ela lia
 * getVpData&key=discoveryPmo, ou seja, a base COMPLETA do Discovery PMO
 * Tracker (attachments, cards, checklist, timeline...) — um payload de
 * alguns MB que estourava o timeout do JSONP no navegador mesmo com dados
 * válidos. O novo endpoint devolve só squad/owner/updatedAt/jiraStories de
 * cada projeto, filtrando no servidor os que não têm nenhuma história.
 *
 * v17 — snapshot oficial de Estórias: uma carga Jira completa pode substituir
 * a fotografia anterior mesmo quando a quantidade reduz, sempre com backup e
 * auditoria. Cargas comuns continuam protegidas contra redução anômala.
 * Cada aba (_stories_chunks e cada aba de VP_SHEET_MAP) tem um contador de
 * revisão em Script Properties, devolvido em getStories/getVpData/getVpDataAll
 * e incrementado a cada escrita OK. O cliente que leu revisão N manda
 * baseRevision=N ao salvar; se a revisão atual mudou nesse meio-tempo (outra
 * pessoa salvou), a gravação é recusada com conflict:true em vez de sobrescrever
 * por cima da edição alheia — o "última gravação vence" citado na v11/v13.
 * baseRevision é OPCIONAL: cliente que não manda (ou nunca leu) não é afetado,
 * então os fluxos automáticos do Bradesco continuam intactos sem mudança lá.
 * Wiring do lado do cliente feito só para Estórias (gasLoadStories/gasSaveStories
 * em index.html) nesta rodada; as chaves de VP_SHEET_MAP já recebem e devolvem
 * revisão, mas nenhum cliente ainda manda baseRevision para elas — extensão
 * futura sem exigir mudança de novo neste arquivo.
 *
 * v13 — camada de proteção de escrita.
 *
 * Construída SOBRE a v12 publicada (2026-07-27-discovery-raid-area-v12).
 * A normalização de área do RAID (RAID_RESPONSIBLE_AREAS,
 * normalizeDiscoveryRaidAreas_, canonicalRaidArea_ e a chamada dentro de
 * saveVpData) foi preservada integralmente — ela NÃO existe no
 * apps-script-backlog.gs do repositório, que ficou parado na v11.
 *
 * O Web App CONTINUA implantado como "qualquer pessoa, mesmo anônima" — o
 * ambiente do Bradesco consome assim e também GRAVA: flushPendingWrites(),
 * as migrações de carga e o saveData() do Discovery disparam POST sozinhos,
 * sem ninguém clicar em nada. Bloquear doPost naquela URL quebraria o outro
 * ambiente logo no primeiro carregamento — e quebraria em silêncio, porque o
 * cliente usa fetch com mode:'no-cors' e não enxerga a recusa.
 *
 * Como não dá para controlar QUEM chama, esta versão controla O QUE uma
 * chamada consegue destruir:
 *
 *   1. guardWrite_()       recusa payload vazio ou que encolha a base além do
 *                          limite — "apaga tudo" vira "não faz nada"
 *   2. snapshotIfNeeded_() guarda as N versões anteriores antes de sobrescrever
 *   3. mergeMap_()         3 chaves que são mapa puro passam a somar, não trocar
 *   4. WRITES_ENABLED      desliga toda escrita pela UI, sem republicar
 *   5. _audit              registra data/hora, chave, tamanho e delta por escrita
 *
 * Nada aqui depende de segredo no código-fonte: a varredura de segredos do
 * pipeline (GitLeaks) não é acionada, ao contrário do que aconteceu na v10.
 * Nenhuma alteração de HTML nem de URL é exigida do lado do Bradesco.
 *
 * Rollout sem adivinhação: publique com ativarModoObservacao() ligado. Nesse
 * estado a guarda AVALIA e REGISTRA em _audit, mas NÃO bloqueia — o
 * comportamento fica idêntico ao de hoje. Depois de 48 h, filtre a _audit por
 * "BLOQUEARIA" e só então rode ativarGuardas().
 *
 * As funções administrativas (restaurarBackup, liberarReducaoPor30Min,
 * desativarEscritas, reativarEscritas, listarBackups, ativarModoObservacao,
 * ativarGuardas) rodam SOMENTE pelo editor do Apps Script. Elas não têm
 * 'action' correspondente em doGet/doPost — de propósito, já que o endpoint
 * é anônimo.
 *
 * v12 — consolida a área do RAID no campo areaResponsavel (mantida abaixo).
 * v11 — doGet aguarda o lock de escrita antes de ler (evita ler planilha a
 * meio de um clearContents()+setValues()) e devolve JSON de erro como o
 * doPost em vez da página de erro padrão do Apps Script. saveBacklog
 * continua mesclando por id/seq (mergeSnaps_); saveStories e saveVpData
 * seguem sendo overwrite puro — quem grava por último decide o conteúdo
 * daquela chave, sem merge.
 ************************************************************************/

var BACKLOG_SCRIPT_VERSION = '2026-08-14-v22-leadtime-epics-migration';

var BACKLOG_SHEET = '_backlog_chunks';
var STORIES_SHEET = '_stories_chunks';
// Base oficial dos Épicos exibidos no painel principal. Ela é separada do
// Backlog para que a migração não misture snapshots de histórias com as datas
// manuais de início/fim dos épicos.
var LEADTIME_EPICS_SHEET = '_leadtime_epics';
// Fonte legada, usada uma única vez quando a nova aba ainda estiver vazia.
// Depois da primeira leitura bem-sucedida, todas as leituras e escritas passam
// a usar exclusivamente LEADTIME_EPICS_SHEET neste Apps Script.
var LEGACY_LEADTIME_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwnwBCa8QE74VueovjfSKLPyMcqkNax0JSyzrWQMSzFfPuYU6F2GtUaJlEUPoKNpeJ2/exec';
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
  // Foto oficial da última carga Jira de épicos. É separada dos metadados para
  // que qualquer navegador aplique a mesma carteira antes de ler o Sheets legado.
  jiraEpicSnapshot: '_jira_epic_snapshot',
  // v13: vpPlanningConfirmations estava FALTANDO no mapa. visao-projetos/index.html
  // chama gasLoadVpData/gasSaveVpData com esta chave (L6391 e L8143), o servidor
  // respondia {ok:false,'chave inválida'} e o cliente tratava como "sem dados".
  // Resultado: as confirmações de planejamento de sprint nunca saíam do
  // navegador de quem clicou. Uma linha resolve.
  vpPlanningConfirmations: '_vp_planning_confirmations',
  vpPlanningSnapshots: '_vp_planning_snapshots',
  vpSprintObjectives: '_vp_sprint_objectives',
  vpSprintCalendar: '_vp_sprint_calendar',
  emergencyDemand: '_emergency_demand',
  discoveryPmo: '_discovery_pmo',  // base completa do Discovery PMO Tracker (projetos, squads, cards, etc.)
  // Mapa de riscos/impedimentos excluídos ou concluídos manualmente no Report
  // Semanal (discovery-pmo/report-semanal.html). Antes só existia no
  // localStorage de quem clicou em "×" — em outro navegador o item "voltava
  // do nada", mesmo o código já pretendendo que a exclusão fosse definitiva.
  discoveryPmoReportResolved: '_discovery_pmo_report_resolved'
};

// v19 — cache da projeção enxuta do getOps4opsData (CacheService, nativo do
// Apps Script; some sozinho ao expirar, sem planilha/aba extra). Invalidado
// ativamente em saveVpData/discoveryPmo (ver commitWrite_ da chave abaixo),
// então o TTL alto aqui é só uma rede de segurança.
var OPS4OPS_LEAN_CACHE_KEY = 'ops4opsLeanV1';
var OPS4OPS_LEAN_CACHE_TTL_SEC = 600;

// Cargas Jira compartilhadas. Para essas bases, uma lista vazia não é uma
// "nova fotografia": ela normalmente indica arquivo errado, filtro vazio ou
// parsing incompleto. A última carga válida precisa continuar disponível para
// todos os usuários, inclusive em um navegador novo sem cache local.
var VP_SNAPSHOT_KEYS = {
  vpGeral: true,
  vpSprint: true,
  vpHomologation: true
};

// Só estas bases são fotografias integrais vindas do Jira. Discovery, backlog
// e campos operacionais possuem semântica própria (merge, histórico ou edição
// manual) e, portanto, nunca podem usar a exceção de redução oficial.
var OFFICIAL_SNAPSHOT_VP_KEYS = {
  vpGeral: true,
  vpSprint: true,
  vpHomologation: true,
  jiraEpicSnapshot: true
};

// ════════════════════════════════════════════════════════════════════════
// v13 — configuração da camada de proteção
// ════════════════════════════════════════════════════════════════════════

var AUDIT_SHEET = '_audit';
var AUDIT_MAX_ROWS = 5000;      // acima disso, as linhas mais antigas são descartadas
var AUDIT_TRIM_BLOCK = 1000;

var BACKUP_SUFFIX = '__bak';
var BACKUP_COPIES = 3;          // ring buffer: __bak1, __bak2, __bak3
var BACKUP_MIN_INTERVAL_MS = 30 * 60 * 1000;  // fora de encolhimento, 1 snapshot a cada 30 min

// Guarda de exclusão em massa. Só age quando já existe base relevante — uma
// planilha nova (0 registros) precisa poder receber a primeira carga.
var GUARD_MIN_RECORDS = 5;
var GUARD_MAX_SHRINK = 0.30;    // recusa se o payload cortar mais de 30% dos registros

// Chaves cujo payload é um MAPA PURO {chave: valor} E que NUNCA removem chave no
// cliente: somar é sempre correto e resolve "duas pessoas editando, uma perde a
// nota". As demais ficam fora DE PROPÓSITO:
//   • vpOpUpdates → o cliente faz `delete operationalUpdates[k]` (visao-projetos
//     L8593 e L8601). Mesclar RESSUSCITARIA atualização operacional excluída.
//   • vpGeral/vpSprint/vpHomologation → {rows:[…]}: a substituição pela
//     importação é intencional; mesclar traria de volta linhas retiradas do Jira.
//   • vpDeliveries / emergencyDemand → têm exclusão intencional pelo usuário.
//   • discoveryPmo → o CLIENTE já mescla por registro com tumbas de exclusão
//     (mergeById/deletedIds). Um segundo merge aqui desfaria essas tumbas.
// vpQuickNotes entra porque a "limpeza" grava string vazia (L7568), não delete.
var MERGE_MAP_KEYS = {
  vpQuickNotes: true,
  vpPlanningConfirmations: true,
  vpPlanningSnapshots: true,
  vpSprintObjectives: true,
  vpEpicMeta: true,
  // Mapa plano assinatura→estado (excluído/concluído); nunca uma fotografia
  // completa, então merge por chave está certo aqui também.
  discoveryPmoReportResolved: true
};

// Propriedades do Script (Configurações do projeto → Propriedades do script).
// Nenhuma delas é segredo — são interruptores operacionais.
var PROP_WRITES_ENABLED = 'WRITES_ENABLED';         // 'false' desliga toda escrita
var PROP_ALLOW_SHRINK_UNTIL = 'ALLOW_SHRINK_UNTIL'; // timestamp ms: janela para redução legítima
// GUARD_DRY_RUN='true' → a guarda AVALIA e REGISTRA em _audit, mas NÃO bloqueia.
// Serve para rodar 48 h em produção e medir, no ambiente real (inclusive o do
// Bradesco), o que seria recusado — antes de a recusa passar a valer. Como o
// cliente grava com mode:'no-cors' e não enxerga a resposta, uma recusa hoje é
// silenciosa: subir direto em modo bloqueante sem medir seria adivinhação.
var PROP_GUARD_DRY_RUN = 'GUARD_DRY_RUN';

// v14 — cada aba tem um contador de revisão (REV_<sheet> em Script Properties),
// incrementado a cada escrita bem-sucedida. O cliente que leu a revisão N pode
// mandar baseRevision=N ao salvar; se a revisão atual já mudou (alguém salvou
// no meio), a escrita é recusada em vez de sobrescrever por cima da mudança
// alheia ("última gravação vence" virava perda silenciosa de campo editado por
// outra pessoa). Cliente que NUNCA leu (ou não manda baseRevision) não é
// afetado — mantém o comportamento anterior, o que preserva os fluxos
// automáticos do Bradesco (flushPendingWrites etc.) sem exigir mudança lá.
function revisionProp_(sheetName) { return 'REV_' + sheetName; }
function getRevision_(sheetName) {
  return Number(props_().getProperty(revisionProp_(sheetName)) || 0);
}
function bumpRevision_(sheetName) {
  var next = getRevision_(sheetName) + 1;
  props_().setProperty(revisionProp_(sheetName), String(next));
  return next;
}

var _propsCache = null;
function props_() {
  if (!_propsCache) _propsCache = PropertiesService.getScriptProperties();
  return _propsCache;
}

function writesEnabled_() {
  return String(props_().getProperty(PROP_WRITES_ENABLED) || '') !== 'false';
}

// Janela em que uma redução grande é aceita de propósito (ex.: limpeza planejada
// da base). Aberta pelo editor com liberarReducaoPor30Min() — nunca pelo endpoint.
function shrinkAllowed_() {
  var until = Number(props_().getProperty(PROP_ALLOW_SHRINK_UNTIL) || 0);
  return until > 0 && Date.now() < until;
}

function guardDryRun_() {
  return String(props_().getProperty(PROP_GUARD_DRY_RUN) || '') === 'true';
}

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

function hasVpSnapshotRows_(data) {
  return !!data && Array.isArray(data.rows) && data.rows.length > 0;
}

// Retorna a cópia válida mais recente do ring buffer. bakIdx aponta para o
// último slot gravado por snapshotIfNeeded_; percorremos a partir dele para
// recuperar a última fotografia não vazia quando a aba principal foi zerada.
function readLatestValidVpBackup_(sheetName) {
  var lastIdx = Number(props_().getProperty('bakIdx_' + sheetName) || 0);
  for (var offset = 0; offset < BACKUP_COPIES; offset++) {
    var idx = ((lastIdx - offset - 1 + BACKUP_COPIES) % BACKUP_COPIES) + 1;
    var candidate = readJsonFromSheet_(sheetName + BACKUP_SUFFIX + idx, null);
    if (hasVpSnapshotRows_(candidate)) return candidate;
  }
  return null;
}

// A leitura compartilhada nunca devolve uma fotografia vazia quando existe um
// backup válido. Isso dá o mesmo resultado para qualquer usuário, sem depender
// de localStorage nem de alguém deixar uma aba antiga aberta.
function readVpDataWithRecovery_(key) {
  var sheetName = getVpSheet_(key);
  var current = readJsonFromSheet_(sheetName, null);
  if (!VP_SNAPSHOT_KEYS[key] || hasVpSnapshotRows_(current)) return current;

  var recovered = readLatestValidVpBackup_(sheetName);
  if (!recovered) return current;

  var visible = {};
  Object.keys(recovered).forEach(function(name) { visible[name] = recovered[name]; });
  visible.recoveredFromBackup = true;
  visible.recoveredAt = new Date().toISOString();
  return visible;
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
        stories: healthData.stories.length,
        // v13: estado da camada de proteção, visível no mesmo ?action=health que
        // o DEPLOY_CHECKLIST.md já manda conferir depois de publicar.
        writesEnabled: writesEnabled_(),
        guardDryRun: guardDryRun_(),
        shrinkWindowOpen: shrinkAllowed_(),
        guard: { minRecords: GUARD_MIN_RECORDS, maxShrink: GUARD_MAX_SHRINK },
        backupCopies: BACKUP_COPIES
      }, callback);
    }

    if (action === 'getBacklog') {
      var backlog = withLock_(function() { return readBacklogStore_(); });
      return jsonOut_({
        ok: true,
        version: BACKLOG_SCRIPT_VERSION,
        backlog: backlog,
        snapshots: backlog.length,
        maxStories: maxStoryCount_(backlog),
        revision: getRevision_(BACKLOG_SHEET)
      }, callback);
    }

    // getRevisions: ping bem barato para o cliente decidir se vale a pena
    // buscar os dados completos de novo. Só lê contadores em Script
    // Properties (getRevision_) — sem tocar planilha, sem lock — então pode
    // rodar com muito mais frequência que as leituras "pesadas" que ele
    // substitui no polling automático de index.html/discovery-pmo/
    // visao-projetos. A resposta é só números (poucas dezenas de bytes por
    // chave), então nunca esbarra na truncagem de proxy corporativo que já
    // derrubou a tentativa de consolidar em getVpDataAll (ver v17 acima e o
    // revert em visao-projetos/index.html e report-semanal-operacional.html).
    if (action === 'getRevisions') {
      var revisions = { backlog: getRevision_(BACKLOG_SHEET), stories: getRevision_(STORIES_SHEET) };
      Object.keys(VP_SHEET_MAP).forEach(function(k) {
        revisions[k] = getRevision_(VP_SHEET_MAP[k]);
      });
      return jsonOut_({ ok: true, version: BACKLOG_SCRIPT_VERSION, revisions: revisions }, callback);
    }

    if (action === 'getStories') {
      var stories = withLock_(function() { return readJsonFromSheet_(STORIES_SHEET, []); });
      return jsonOut_({
        ok: true,
        version: BACKLOG_SCRIPT_VERSION,
        stories: stories,
        revision: getRevision_(STORIES_SHEET)
      }, callback);
    }

    if (action === 'getVpData') {
      var key = getParam_(e, 'key');
      var sheetName = getVpSheet_(key);
      if (!sheetName) {
        return jsonOut_({ ok: false, error: 'chave inválida: ' + key }, callback);
      }
      var vpData = withLock_(function() { return readVpDataWithRecovery_(key); });
      return jsonOut_({ ok: true, data: vpData, revision: getRevision_(sheetName) }, callback);
    }

    // getOps4opsData: projeção enxuta do discoveryPmo para a aba Ops4Ops.
    // discoveryPmo carrega a base COMPLETA do Discovery PMO Tracker — inclusive
    // attachments, cards, checklist e timeline de cada projeto — e um único
    // projeto sem nenhuma história (jiraStories vazio) já respondia por mais de
    // 1 MB só de anexos. Ops4Ops só usa squad/owner/updatedAt e jiraStories de
    // cada projeto; filtrar aqui no servidor evita mandar o resto pela rede e
    // reduz um payload de alguns MB (que estourava o timeout do JSONP) para
    // poucos KB.
    //
    // v19 — o corte acima só reduz o que TRAFEGA; a leitura+parse do JSON de
    // alguns MB (chunksToData_/JSON.parse) continuava rodando por completo a
    // cada chamada, e isso repetido por todo mundo que abre a aba Ops4Ops era
    // o gargalo real (cold start + Sheets API + parse, tudo dentro do lock).
    // Cacheia a projeção já pronta no CacheService (nativo do próprio Apps
    // Script — sem planilha nova, sem outro script) por alguns minutos;
    // chamadas repetidas nessa janela nem tocam a planilha.
    if (action === 'getOps4opsData') {
      var ops4opsCache = CacheService.getScriptCache();
      var cachedLean = ops4opsCache.get(OPS4OPS_LEAN_CACHE_KEY);
      if (cachedLean) return jsonOut_(JSON.parse(cachedLean), callback);
      var discoveryData = withLock_(function() { return readVpDataWithRecovery_('discoveryPmo'); });
      var leanProjects = (Array.isArray(discoveryData && discoveryData.projects) ? discoveryData.projects : [])
        .map(function(project) {
          var jiraStories = Array.isArray(project.jiraStories) ? project.jiraStories : [];
          if (!jiraStories.length) return null;
          return {
            squad: project.squad || '',
            owner: project.owner || '',
            updatedAt: project.updatedAt || '',
            jiraStories: jiraStories.map(function(story) {
              return {
                key: story.key || story.id || '',
                summary: story.summary || story.resumo || '',
                status: story.status || '',
                team: story.team || '',
                labels: story.labels,
                updated: story.updated || '',
                tipo: story.tipo || story.type || ''
              };
            })
          };
        })
        .filter(function(p) { return p; });
      var leanResult = {
        ok: true,
        data: { updatedAt: (discoveryData && discoveryData.updatedAt) || '', projects: leanProjects },
        revision: getRevision_(getVpSheet_('discoveryPmo'))
      };
      try { ops4opsCache.put(OPS4OPS_LEAN_CACHE_KEY, JSON.stringify(leanResult), OPS4OPS_LEAN_CACHE_TTL_SEC); } catch (cacheErr) {}
      return jsonOut_(leanResult, callback);
    }

    // getVpDataAll: lê todas as chaves do VP_SHEET_MAP numa única execução/lock,
    // em vez de o cliente disparar um doGet por chave (9 chamadas ao Apps
    // Script, cada uma com cold-start + abertura de planilha + espera de lock —
    // era a causa da lentidão em "Atualizar"/carregar o painel).
    if (action === 'getVpDataAll') {
      var allData = withLock_(function() {
        var out = {};
        var revisions = {};
        Object.keys(VP_SHEET_MAP).forEach(function(k) {
          out[k] = readVpDataWithRecovery_(k);
          revisions[k] = getRevision_(VP_SHEET_MAP[k]);
        });
        return { out: out, revisions: revisions };
      });
      return jsonOut_({ ok: true, data: allData.out, revisions: allData.revisions }, callback);
    }

    // Compatibilidade com o painel principal: ele lê os épicos sem action e
    // grava alterações pontuais com action=update.
    if (action === 'update') {
      var updatePayload = getParam_(e, 'payload');
      var parsedUpdate = parsePayload_(updatePayload, true);
      if (!parsedUpdate.ok) return jsonOut_({ ok: false, version: BACKLOG_SCRIPT_VERSION, error: parsedUpdate.error }, callback);
      var updateResult = updateLeadtimeEpics_(parsedUpdate.data, String(updatePayload || '').length);
      return jsonOut_(updateResult, callback);
    }

    if (!action) {
      var leadtimeRows = getLeadtimeEpics_();
      return jsonOut_({ ok: true, version: BACKLOG_SCRIPT_VERSION, data: leadtimeRows, count: leadtimeRows.length, updatedAt: new Date().toISOString() }, callback);
    }

    return jsonOut_({ ok: false, version: BACKLOG_SCRIPT_VERSION, error: 'unknown action: ' + action }, callback);
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
//
// v19 — este é um ÚNICO lock global (LockService.getScriptLock()), compartilhado por
// TODAS as ações (leitura e escrita, das 13+ chaves diferentes: backlog, stories,
// discoveryPmo, cada chave de VP_SHEET_MAP...). Com várias pessoas usando o painel ao
// mesmo tempo, até uma leitura simples como health podia esperar mais que os 10s
// antigos e falhar com "Não foi possível obter lock de escrita". 20s dá mais fôlego
// pra absorver contenção sem esbarrar no limite de execução do Apps Script (minutos).
var LOCK_TIMEOUT_MS = 20000;

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
          var chunks = readChunks_(BACKLOG_SHEET);
          var before = chunksToData_(chunks, []);
          if (!Array.isArray(before)) before = [];
          var merged = mergeSnaps_(before, incoming);
          // saveBacklog já mesclava — a guarda aqui é rede contra um mergeSnaps_
          // que devolvesse menos do que entrou (payload corrompido, por exemplo).
          var w = commitWrite_(BACKLOG_SHEET, 'saveBacklog', chunks, before, merged, String(payload || '').length);
          if (!w.ok) throw new Error(w.error);
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
      var baseRevisionStories = getParam_(e, 'baseRevision');
      var storiesSource = getParam_(e, 'source');
      var storiesSourceFile = getParam_(e, 'sourceFile');
      try {
        var parsedStoriesResult = parsePayload_(payloadStories, true);
        if (!parsedStoriesResult.ok) return jsonOut_({ ok: false, version: BACKLOG_SCRIPT_VERSION, error: parsedStoriesResult.error });
        var parsedStories = parsedStoriesResult.data;
        if (parsedStories.length === 0) {
          var existing = withLock_(function() { return readJsonFromSheet_(STORIES_SHEET, []); });
          return jsonOut_({ ok: true, version: BACKLOG_SCRIPT_VERSION, skipped: 'payload vazio', savedStories: existing.length, revision: getRevision_(STORIES_SHEET) });
        }
        var storiesWrite = withLock_(function() {
          var chunks = readChunks_(STORIES_SHEET);
          var before = chunksToData_(chunks, null);
          return commitWrite_(STORIES_SHEET, 'saveStories', chunks, before, parsedStories, payloadStories.length, baseRevisionStories, {
            officialSnapshot: storiesSource === 'jira-story-snapshot-v1',
            sourceFile: storiesSourceFile
          });
        });
        if (!storiesWrite.ok) {
          return jsonOut_({ ok: false, version: BACKLOG_SCRIPT_VERSION, error: storiesWrite.error, conflict: !!storiesWrite.conflict, currentRevision: storiesWrite.currentRevision });
        }
        return jsonOut_({ ok: true, version: BACKLOG_SCRIPT_VERSION, savedStories: parsedStories.length, revision: storiesWrite.revision });
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
      var baseRevisionVp = getParam_(e, 'baseRevision');
      var vpSource = getParam_(e, 'source');
      var vpSourceFile = getParam_(e, 'sourceFile');
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
        if (VP_SNAPSHOT_KEYS[vpKey] && !hasVpSnapshotRows_(vpData)) {
          var existingSnapshot = withLock_(function() {
            var currentSnapshot = readVpDataWithRecovery_(vpKey);
            audit_('saveVpData/' + vpKey, vpPayload.length, countRecords_(currentSnapshot), 0, 'RECUSADO',
              'carga compartilhada sem itens; última carga válida preservada');
            return currentSnapshot;
          });
          return jsonOut_({
            ok: false,
            key: vpKey,
            error: 'gravação recusada: a carga compartilhada não possui itens. A última carga válida foi preservada.',
            saved: countRecords_(existingSnapshot),
            revision: getRevision_(vpSheetName)
          });
        }
        var vpWrite = withLock_(function() {
          var chunks = readChunks_(vpSheetName);
          var before = chunksToData_(chunks, null);
          var toWrite = vpData;
          var didMerge = false;
          // Merge apenas para as chaves de MERGE_MAP_KEYS (ver comentário lá).
          if (MERGE_MAP_KEYS[vpKey] && isPlainObject_(before) && isPlainObject_(toWrite)) {
            toWrite = mergeMap_(before, toWrite);
            didMerge = true;
          }
          var w = commitWrite_(vpSheetName, 'saveVpData/' + vpKey, chunks, before, toWrite, vpPayload.length, baseRevisionVp, {
            officialSnapshot: !!OFFICIAL_SNAPSHOT_VP_KEYS[vpKey] && vpSource === 'jira-panel-snapshot-v1',
            sourceFile: vpSourceFile
          });
          w.merged = didMerge;
          return w;
        });
        if (!vpWrite.ok) {
          return jsonOut_({ ok: false, key: vpKey, error: vpWrite.error, conflict: !!vpWrite.conflict, currentRevision: vpWrite.currentRevision });
        }
        if (vpKey === 'discoveryPmo') {
          // Dado mudou: a projeção cacheada do getOps4opsData ficou desatualizada.
          try { CacheService.getScriptCache().remove(OPS4OPS_LEAN_CACHE_KEY); } catch (cacheErr) {}
        }
        return jsonOut_({ ok: true, key: vpKey, before: vpWrite.beforeN, after: vpWrite.afterN, merged: !!vpWrite.merged, revision: vpWrite.revision });
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

// ════════════════════════════════════════════════════════════════════════
// v13 — núcleo da proteção de escrita
// ════════════════════════════════════════════════════════════════════════

// Ponto único por onde TODA escrita passa. Roda sempre dentro de withLock_ e
// recebe os chunks já lidos, para não pagar uma segunda leitura da planilha.
function commitWrite_(sheetName, label, chunks, before, incoming, payloadChars, baseRevision, options) {
  if (!writesEnabled_()) {
    var offMsg = 'gravação recusada: escritas desativadas no servidor (' + PROP_WRITES_ENABLED + '=false).';
    audit_(label, payloadChars, countRecords_(before), countRecords_(incoming), 'DESATIVADO', offMsg);
    return { ok: false, error: offMsg };
  }

  // Checagem de concorrência otimista: só se aplica quando o cliente MANDA
  // baseRevision (leu antes de salvar) e já existe uma revisão publicada.
  // Ausência de baseRevision = cliente antigo ou primeira gravação = sem checagem,
  // igual ao comportamento anterior a esta versão.
  var currentRevision = getRevision_(sheetName);
  if (baseRevision !== undefined && baseRevision !== null && String(baseRevision) !== '' && currentRevision > 0) {
    var baseRevisionNum = Number(baseRevision);
    if (!isNaN(baseRevisionNum) && baseRevisionNum !== currentRevision) {
      var conflictMsg = 'gravação recusada: alguém salvou "' + label + '" depois da última leitura deste cliente ' +
                         '(revisão lida ' + baseRevisionNum + ', revisão atual ' + currentRevision + '). ' +
                         'Recarregue os dados e tente novamente.';
      audit_(label, payloadChars, countRecords_(before), countRecords_(incoming), 'CONFLITO_REVISAO', conflictMsg);
      return { ok: false, error: conflictMsg, conflict: true, currentRevision: currentRevision };
    }
  }

  var verdict = guardWrite_(label, before, incoming);
  var dryRun = guardDryRun_();

  // UMA linha de auditoria por gravação. O 'resultado' precisa refletir o que de
  // fato aconteceu: se registrássemos 'BLOQUEARIA' e depois 'OK' para o mesmo
  // evento, quem filtrasse pelo resultado final veria 'OK' e perderia o alerta —
  // exatamente a informação que o modo observação existe para produzir.
  var resultado = 'OK';
  var nota = '';

  if (!verdict.ok) {
    if (dryRun) {
      // Modo observação: registra o que TERIA sido bloqueado e deixa passar.
      resultado = 'BLOQUEARIA (dry-run)';
      nota = verdict.error;
    } else if (options && options.officialSnapshot && verdict.afterN > 0) {
      // A fonte oficial de Estórias é uma fotografia completa do Jira. Ela pode
      // encolher de forma legítima quando cards saem do recorte; nesse caso a
      // escrita é permitida SOMENTE porque o estado anterior foi preservado no
      // ring buffer abaixo e a auditoria registra a origem do evento.
      resultado = 'REDUCAO_FONTE_OFICIAL';
      nota = 'foto Jira oficial' + (options.sourceFile ? ': ' + String(options.sourceFile).slice(0, 180) : '');
    } else if (shrinkAllowed_()) {
      // Janela de redução aberta de propósito pelo editor: segue, mas fica registrado.
      resultado = 'REDUCAO_LIBERADA';
      nota = verdict.error;
    } else {
      audit_(label, payloadChars, verdict.beforeN, verdict.afterN, 'RECUSADO', verdict.error);
      return { ok: false, error: verdict.error, beforeN: verdict.beforeN, afterN: verdict.afterN };
    }
  }

  var shrinking = verdict.afterN < verdict.beforeN;
  var snap = snapshotIfNeeded_(sheetName, chunks, shrinking);

  // Se a base vai encolher e o snapshot falhou, não há rede de segurança: é
  // melhor recusar a escrita do que perder o estado anterior sem cópia.
  // Exceção: em dry-run nada pode ser bloqueado — é a definição do modo, e
  // bloquear aqui faria a janela de observação alterar o comportamento que ela
  // deveria apenas medir.
  if (shrinking && snap.attempted && !snap.ok && !dryRun) {
    var snapMsg = 'gravação recusada: não foi possível gerar o snapshot de segurança antes de reduzir "' +
                  label + '". Detalhe: ' + snap.error;
    audit_(label, payloadChars, verdict.beforeN, verdict.afterN, 'RECUSADO_SEM_SNAPSHOT', snapMsg);
    return { ok: false, error: snapMsg, beforeN: verdict.beforeN, afterN: verdict.afterN };
  }

  writeJsonToSheet_(sheetName, incoming);
  var newRevision = bumpRevision_(sheetName);

  var detalhes = [];
  if (nota) detalhes.push(nota);
  if (snap.ok) detalhes.push('snapshot ' + BACKUP_SUFFIX + snap.slot);
  if (shrinking && snap.attempted && !snap.ok) detalhes.push('ATENÇÃO: snapshot falhou (' + snap.error + ')');
  audit_(label, payloadChars, verdict.beforeN, verdict.afterN, resultado, detalhes.join(' · '));

  return { ok: true, beforeN: verdict.beforeN, afterN: verdict.afterN, revision: newRevision };
}

// Conta "registros" sem depender do formato — cada chave tem uma forma diferente.
function countRecords_(data) {
  if (data === null || data === undefined) return 0;
  if (Array.isArray(data)) return data.length;
  if (typeof data === 'object') {
    if (Array.isArray(data.rows)) return data.rows.length;         // vpGeral/vpSprint/vpHomologation
    if (Array.isArray(data.projects)) return data.projects.length; // discoveryPmo
    if (Array.isArray(data.rules)) return data.rules.length;       // emergencyDemand
    return Object.keys(data).length;                               // mapas puros
  }
  return 0;
}

// A guarda propriamente dita: é o que transforma "apaga tudo" em "não faz nada".
function guardWrite_(label, before, incoming) {
  var beforeN = countRecords_(before);
  var afterN = countRecords_(incoming);

  // Base vazia precisa poder receber a primeira carga.
  if (beforeN === 0) return { ok: true, beforeN: beforeN, afterN: afterN };

  if (afterN === 0) {
    return {
      ok: false, beforeN: beforeN, afterN: afterN,
      error: 'gravação recusada: o payload zeraria ' + beforeN + ' registro(s) em "' + label +
             '". Se a limpeza for intencional, rode liberarReducaoPor30Min() no editor do Apps Script e repita.'
    };
  }

  if (beforeN >= GUARD_MIN_RECORDS && afterN < Math.ceil(beforeN * (1 - GUARD_MAX_SHRINK))) {
    return {
      ok: false, beforeN: beforeN, afterN: afterN,
      error: 'gravação recusada: redução anômala em "' + label + '" (' + beforeN + ' → ' + afterN +
             ' registros, acima do limite de ' + Math.round(GUARD_MAX_SHRINK * 100) + '%). ' +
             'Se for intencional, rode liberarReducaoPor30Min() no editor do Apps Script e repita.'
    };
  }

  return { ok: true, beforeN: beforeN, afterN: afterN };
}

// Ring buffer de snapshots: __bak1 → __bak2 → __bak3 → __bak1 … Uma escrita por
// snapshot, sem cópia em cascata entre as abas.
// Dispara quando (a) a base vai encolher — o caso perigoso — ou (b) faz mais de
// BACKUP_MIN_INTERVAL_MS desde o último. Sem (b), o Discovery geraria snapshot a
// cada tecla salva (saveData → scheduleDiscGasSave tem debounce de 400 ms).
function snapshotIfNeeded_(sheetName, chunks, shrinking) {
  if (!chunks || !chunks.length) return { ok: false, attempted: false, error: 'sem conteúdo anterior' };

  var atKey = 'bakAt_' + sheetName;
  var last = Number(props_().getProperty(atKey) || 0);
  if (!shrinking && (Date.now() - last) < BACKUP_MIN_INTERVAL_MS) {
    return { ok: false, attempted: false, error: 'intervalo mínimo não atingido' };
  }

  try {
    var idxKey = 'bakIdx_' + sheetName;
    var slot = (Number(props_().getProperty(idxKey) || 0) % BACKUP_COPIES) + 1;
    var bak = getOrCreateSheet_(sheetName + BACKUP_SUFFIX + slot);
    bak.clearContents();
    var range = bak.getRange(1, 1, chunks.length, 1);
    range.setNumberFormat('@');
    range.setValues(chunks);
    try { bak.hideSheet(); } catch (e) {}
    props_().setProperty(idxKey, String(slot));
    props_().setProperty(atKey, String(Date.now()));
    return { ok: true, attempted: true, slot: slot };
  } catch (err) {
    Logger.log('snapshotIfNeeded_ falhou para ' + sheetName + ': ' + (err && err.stack || err));
    return { ok: false, attempted: true, error: String(err && err.message || err) };
  }
}

function isPlainObject_(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Merge raso de mapa {chave: valor}. O que chega vence por chave; o que só existe
// na base é preservado. Só é aplicado às chaves de MERGE_MAP_KEYS — que são,
// justamente, as que nunca removem chave no cliente.
function mergeMap_(base, incoming) {
  var out = {};
  Object.keys(base || {}).forEach(function(k) { out[k] = base[k]; });
  Object.keys(incoming || {}).forEach(function(k) { out[k] = incoming[k]; });
  return out;
}

// Trilha de auditoria. Nunca derruba a escrita: falha aqui vira log, não erro.
// Sem isto, uma base zerada não deixava rastro nenhum — não dava para saber nem
// QUE aconteceu, quanto mais quando ou a partir de qual chave.
function audit_(label, payloadChars, beforeN, afterN, result, note) {
  try {
    var sheet = getOrCreateSheet_(AUDIT_SHEET);
    if (!sheet.getLastRow()) {
      sheet.appendRow(['quando', 'operação', 'chars_payload', 'antes', 'depois', 'delta', 'resultado', 'observação']);
      try { sheet.hideSheet(); } catch (e) {}
    }
    sheet.appendRow([
      new Date(),
      label,
      Number(payloadChars) || 0,
      Number(beforeN) || 0,
      Number(afterN) || 0,
      (Number(afterN) || 0) - (Number(beforeN) || 0),
      result,
      String(note || '').slice(0, 500)
    ]);
    if (sheet.getLastRow() > AUDIT_MAX_ROWS) sheet.deleteRows(2, AUDIT_TRIM_BLOCK);
  } catch (err) {
    Logger.log('audit_ falhou: ' + (err && err.stack || err));
  }
}

// ════════════════════════════════════════════════════════════════════════
// v13 — funções administrativas (SOMENTE pelo editor do Apps Script)
// Nenhuma delas tem 'action' em doGet/doPost, de propósito: o endpoint é anônimo.
// ════════════════════════════════════════════════════════════════════════

// Modo observação: sobe a v13 sem bloquear nada. Durante a janela, a aba _audit
// registra como "BLOQUEARIA (dry-run)" tudo que a guarda recusaria — inclusive o
// que vier do ambiente do Bradesco. Rode ativarModoObservacao(), espere 48 h,
// abra a _audit e filtre por "BLOQUEARIA": se não houver nenhuma linha de uso
// legítimo, rode ativarGuardas() com segurança.
function ativarModoObservacao() {
  props_().setProperty(PROP_GUARD_DRY_RUN, 'true');
  return 'MODO OBSERVAÇÃO ativo: a guarda avalia e registra em _audit, mas não bloqueia. ' +
         'Confira a aba _audit em 48 h e depois rode ativarGuardas().';
}

function ativarGuardas() {
  props_().setProperty(PROP_GUARD_DRY_RUN, 'false');
  return 'Guardas ATIVAS: escrita que zere ou reduza demais a base passa a ser recusada.';
}

// Abre uma janela de 30 min em que a guarda aceita redução grande. Use antes de
// uma limpeza planejada da base.
function liberarReducaoPor30Min() {
  var until = Date.now() + 30 * 60 * 1000;
  props_().setProperty(PROP_ALLOW_SHRINK_UNTIL, String(until));
  return 'Redução liberada até ' + new Date(until).toLocaleString('pt-BR') + '. Depois disso a guarda volta sozinha.';
}

function cancelarLiberacaoDeReducao() {
  props_().deleteProperty(PROP_ALLOW_SHRINK_UNTIL);
  return 'Janela de redução fechada. Guarda ativa.';
}

// Kill switch: desliga/religa toda escrita sem republicar a implantação.
function desativarEscritas() {
  props_().setProperty(PROP_WRITES_ENABLED, 'false');
  return 'ESCRITAS DESATIVADAS. Leituras continuam normais. Rode reativarEscritas() para voltar.';
}

function reativarEscritas() {
  props_().setProperty(PROP_WRITES_ENABLED, 'true');
  return 'Escritas reativadas.';
}

function listarBackups() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var alvos = [];
  Object.keys(VP_SHEET_MAP).forEach(function(key) { alvos.push(VP_SHEET_MAP[key]); });
  alvos.push(BACKLOG_SHEET, STORIES_SHEET);

  var linhas = [];
  alvos.forEach(function(sheetName) {
    for (var i = 1; i <= BACKUP_COPIES; i++) {
      var nome = sheetName + BACKUP_SUFFIX + i;
      var s = ss.getSheetByName(nome);
      if (!s || !s.getLastRow()) continue;
      var chars = 0;
      s.getRange(1, 1, s.getLastRow(), 1).getValues().forEach(function(r) { chars += String(r[0] || '').length; });
      linhas.push(nome + '  ·  ' + chars + ' chars  ·  ~' + countRecords_(readJsonFromSheet_(nome, null)) + ' registros');
    }
  });

  var texto = linhas.length ? linhas.join('\n') : 'Nenhum snapshot gerado ainda.';
  Logger.log(texto);
  return texto;
}

// Restaura um snapshot por cima da aba de dados.
// Ex.: restaurarBackup('discoveryPmo', 1)  ou  restaurarBackup('_stories_chunks', 2)
// Antes de restaurar, guarda o estado atual num slot do ring buffer, para que um
// restore errado também seja reversível.
function restaurarBackup(chaveOuAba, copia) {
  var sheetName = VP_SHEET_MAP[chaveOuAba] || chaveOuAba;
  var slot = Number(copia) || 1;
  var bakName = sheetName + BACKUP_SUFFIX + slot;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var bak = ss.getSheetByName(bakName);
  if (!bak || !bak.getLastRow()) throw new Error('snapshot inexistente ou vazio: ' + bakName);

  return withLock_(function() {
    var atual = readChunks_(sheetName);
    if (atual.length) snapshotIfNeeded_(sheetName, atual, true);  // força cópia do estado atual

    var chunks = bak.getRange(1, 1, bak.getLastRow(), 1).getValues();
    var destino = getOrCreateSheet_(sheetName);
    destino.clearContents();
    var range = destino.getRange(1, 1, chunks.length, 1);
    range.setNumberFormat('@');
    range.setValues(chunks);
    try { destino.hideSheet(); } catch (e) {}

    var n = countRecords_(chunksToData_(chunks, null));
    audit_('restaurarBackup/' + sheetName, 0, 0, n, 'RESTAURADO', 'a partir de ' + bakName);
    return 'Restaurado ' + bakName + ' → ' + sheetName + ' (' + n + ' registros).';
  });
}

// ════════════════════════════════════════════════════════════════════════

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

// ── Épicos do painel principal: migração única e atualizações manuais ────
function leadtimeDate_(value) {
  var text = String(value == null ? '' : value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function normalizeLeadtimeEpic_(row) {
  row = row || {};
  return {
    id: String(row.id || '').trim(),
    squad: String(row.squad || ''),
    resumo: String(row.resumo || ''),
    status: String(row.status || ''),
    statusAntes: String(row.statusAntes || ''),
    ini: leadtimeDate_(row.ini),
    fim: leadtimeDate_(row.fim),
    fimAntes: leadtimeDate_(row.fimAntes),
    dataPrevista: leadtimeDate_(row.dataPrevista),
    chg: String(row.chg || ''),
    impedimento: String(row.impedimento || '')
  };
}

function readLeadtimeEpicsInsideLock_() {
  var saved = readJsonFromSheet_(LEADTIME_EPICS_SHEET, []);
  if (Array.isArray(saved) && saved.length) return saved.map(normalizeLeadtimeEpic_).filter(function(row) { return row.id; });

  // A base nova ainda não existe: copia a fotografia atual da fonte legada
  // antes de o painel começar a salvar nesta implantação.
  var response = UrlFetchApp.fetch(LEGACY_LEADTIME_ENDPOINT + '?migration=' + Date.now(), { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) throw new Error('não foi possível importar a base atual de Épicos (HTTP ' + response.getResponseCode() + ')');
  var json = JSON.parse(response.getContentText());
  var imported = Array.isArray(json && json.data) ? json.data.map(normalizeLeadtimeEpic_).filter(function(row) { return row.id; }) : [];
  if (!imported.length) throw new Error('a fonte legada não devolveu Épicos válidos para a migração');

  var chunks = readChunks_(LEADTIME_EPICS_SHEET);
  var write = commitWrite_(LEADTIME_EPICS_SHEET, 'migrarEpicosLegados', chunks, [], imported, response.getContentText().length);
  if (!write.ok) throw new Error(write.error);
  return imported;
}

function getLeadtimeEpics_() {
  return withLock_(function() { return readLeadtimeEpicsInsideLock_(); });
}

function updateLeadtimeEpics_(changes, payloadChars) {
  try {
    if (!Array.isArray(changes) || !changes.length) return { ok: false, version: BACKLOG_SCRIPT_VERSION, error: 'payload deve conter ao menos um Épico' };
    return withLock_(function() {
      var before = readLeadtimeEpicsInsideLock_();
      var byId = {};
      before.forEach(function(row, index) { byId[row.id] = index; });
      var next = before.map(function(row) { return normalizeLeadtimeEpic_(row); });

      changes.forEach(function(change) {
        var normalized = normalizeLeadtimeEpic_(change);
        if (!normalized.id) throw new Error('Épico sem id');
        var index = byId[normalized.id];
        if (index === undefined) {
          byId[normalized.id] = next.length;
          next.push(normalized);
          return;
        }
        // O payload do painel traz todos os campos editáveis. Atualizamos só
        // esses campos, preservando resumo/squad quando uma edição pontual não
        // os envia e impedindo perda de dados por uma atualização concorrente.
        var current = next[index];
        ['squad','resumo','status','statusAntes','ini','fim','fimAntes','dataPrevista','chg','impedimento'].forEach(function(field) {
          if (Object.prototype.hasOwnProperty.call(change, field)) current[field] = normalized[field];
        });
      });

      var chunks = readChunks_(LEADTIME_EPICS_SHEET);
      var write = commitWrite_(LEADTIME_EPICS_SHEET, 'updateLeadtimeEpics', chunks, before, next, payloadChars || 0);
      if (!write.ok) return { ok: false, version: BACKLOG_SCRIPT_VERSION, error: write.error, conflict: !!write.conflict, currentRevision: write.currentRevision };
      return { ok: true, version: BACKLOG_SCRIPT_VERSION, updated: changes.length, count: next.length, revision: write.revision };
    });
  } catch (err) {
    return { ok: false, version: BACKLOG_SCRIPT_VERSION, error: String(err && err.message || err) };
  }
}

// v13: saveBacklog passou a gravar via commitWrite_ (guarda + snapshot + auditoria),
// então esta função deixou de ter call site no caminho de requisição. Mantida por ser
// um atalho útil ao rodar algo manualmente pelo editor — mas note que ela grava DIRETO,
// sem passar por nenhuma das proteções.
function writeBacklogStore_(arr) {
  writeJsonToSheet_(BACKLOG_SHEET, arr || []);
}

// v13: leitura em duas etapas. Os chunks crus servem para DUAS coisas — parsear
// o estado anterior (guarda) e alimentar o snapshot — sem reler a planilha.
function readChunks_(sheetName) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    var lastRow = sheet.getLastRow();
    if (!lastRow) return [];
    return sheet.getRange(1, 1, lastRow, 1).getValues();
  } catch (err) {
    Logger.log('readChunks_ falhou para ' + sheetName + ': ' + (err && err.stack || err));
    return [];
  }
}

function chunksToData_(chunks, fallback) {
  try {
    if (!chunks || !chunks.length) return fallback;
    var json = chunks.map(function(row) { return row[0] == null ? '' : String(row[0]); }).join('');
    if (!json) return fallback;
    return JSON.parse(json);
  } catch (err) {
    // Payload corrompido cai no fallback silenciosamente do ponto de vista do usuário
    // (não quebra a resposta), mas fica registrado no Executions do Apps Script em vez
    // de sumir sem rastro — antes não havia log nenhum aqui.
    Logger.log('chunksToData_ falhou: ' + (err && err.stack || err));
    return fallback;
  }
}

function readJsonFromSheet_(sheetName, fallback) {
  return chunksToData_(readChunks_(sheetName), fallback);
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

// ── Planning automático da sprint ────────────────────────────────────────
// Execute instalarGatilhoPlanningSprint() uma única vez após publicar esta
// versão no Apps Script. A rotina roda diariamente à meia-noite e, no dia seguinte ao
// planning, congela a fotografia do compromisso sem depender do GitHub Pages.
function instalarGatilhoPlanningSprint() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'confirmarPlanningSprintAutomaticamente') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('confirmarPlanningSprintAutomaticamente').timeBased().atHour(0).everyDays(1).create();
  return 'Gatilho de confirmação automática instalado (execução diária à meia-noite).';
}

function confirmarPlanningSprintAutomaticamente() {
  return withLock_(function() {
    var calendar = readJsonFromSheet_(getVpSheet_('vpSprintCalendar'), {});
    var sprints = calendar && Array.isArray(calendar.sprints) ? calendar.sprints : [];
    var timezone = Session.getScriptTimeZone() || 'America/Fortaleza';
    var today = Utilities.formatDate(new Date(), timezone, 'yyyy-MM-dd');
    var target = sprints.find(function(sprint) {
      if (!sprint || !sprint.start) return false;
      var nextDay = new Date(String(sprint.start) + 'T12:00:00');
      nextDay.setDate(nextDay.getDate() + 1);
      return Utilities.formatDate(nextDay, timezone, 'yyyy-MM-dd') === today;
    });
    if (!target) return { ok:true, skipped:'Nenhuma sprint com planning no dia anterior.' };

    var sprintData = readJsonFromSheet_(getVpSheet_('vpSprint'), {});
    var rows = sprintData && Array.isArray(sprintData.rows) ? sprintData.rows : [];
    if (!rows.length) return { ok:false, skipped:'Base da sprint indisponível.' };

    var snapshotsSheet = getVpSheet_('vpPlanningSnapshots');
    var confirmationsSheet = getVpSheet_('vpPlanningConfirmations');
    var objectives = readJsonFromSheet_(getVpSheet_('vpSprintObjectives'), {});
    var snapshots = readJsonFromSheet_(snapshotsSheet, {});
    var confirmations = readJsonFromSheet_(confirmationsSheet, {});
    var squads = {};
    rows.forEach(function(row) {
      var squad = String(row && row.squad || '').trim();
      if (squad) squads[squad] = true;
    });

    var created = 0;
    Object.keys(squads).forEach(function(squad) {
      var key = String(target.start) + '|' + sprintSquadKey_(squad);
      if (snapshots[key]) return;
      var storyKeys = rows.filter(function(row) {
        return String(row && row.squad || '').trim().toLowerCase() === squad.toLowerCase();
      }).map(function(row) {
        return String((row && (row.chave || row.key || row.id)) || '').trim();
      }).filter(Boolean);
      snapshots[key] = {
        createdAt:new Date().toISOString(), mode:'automatic', squad:squad,
        sprintName:String(target.name || 'Sprint'), sprintStart:target.start,
        sprintEnd:target.end || '', objective:String(objectives[key] || ''), storyKeys:storyKeys
      };
      confirmations[key] = {
        confirmedAt:new Date().toISOString(), mode:'automatic', squad:squad,
        sprintStart:target.start, sprintEnd:target.end || ''
      };
      created++;
    });
    if (created) {
      writeJsonToSheet_(snapshotsSheet, snapshots);
      writeJsonToSheet_(confirmationsSheet, confirmations);
    }
    return { ok:true, sprint:target.start, snapshotsCreated:created };
  });
}

function sprintSquadKey_(value) {
  return String(value || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[‐‑‒–—−]/g, '-').replace(/\s+/g, '');
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
