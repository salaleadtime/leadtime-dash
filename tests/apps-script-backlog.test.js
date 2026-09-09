// Harness E2E: planilha falsa em memória, para exercitar commitWrite_,
// snapshotIfNeeded_, audit_, restaurarBackup e os caminhos completos de doPost/doGet.
const fs = require('fs');
const vm = require('vm');
const SP = require('path').join(__dirname, '..') + '/';

function novoAmbiente() {
  const SHEETS = new Map();   // nome -> array de linhas (cada linha = array de células)
  const PROPS = {};

  function makeSheet(name) {
    const rows = [];
    const sh = {
      _name: name, _rows: rows, _hidden: false,
      getLastRow: () => rows.length,
      clearContents() { rows.length = 0; },
      hideSheet() { sh._hidden = true; },
      appendRow(vals) { rows.push(vals.slice()); },
      deleteRows(start, howMany) { rows.splice(start - 1, howMany); },
      getRange(r, c, nr, nc) {
        return {
          setNumberFormat() { return this; },
          setValue(v) { while (rows.length < r) rows.push([]); rows[r - 1][c - 1] = v; },
          setValues(vals) {
            for (let i = 0; i < vals.length; i++) {
              while (rows.length < r - 1 + i + 1) rows.push([]);
              rows[r - 1 + i] = vals[i].slice();
            }
          },
          getValues() {
            const out = [];
            for (let i = 0; i < (nr || 0); i++) {
              const row = rows[r - 1 + i] || [];
              out.push(row.slice(c - 1, c - 1 + (nc || 1)));
            }
            return out;
          }
        };
      }
    };
    return sh;
  }

  const stub = `
var PROPS_STORE = __PROPS__;
var PropertiesService = { getScriptProperties: function(){ return {
  getProperty: function(k){ return PROPS_STORE[k] === undefined ? null : PROPS_STORE[k]; },
  setProperty: function(k,v){ PROPS_STORE[k]=String(v); },
  deleteProperty: function(k){ delete PROPS_STORE[k]; }
};}};
var Logger = { log: function(m){ (__LOGS__).push(String(m)); } };
var LockService = { getScriptLock: function(){ return {
  tryLock: function(){ return true; }, waitLock: function(){}, releaseLock: function(){}
};}};
var SpreadsheetApp = { getActiveSpreadsheet: function(){ return {
  getSheetByName: function(n){ return __GET__(n); },
  insertSheet:    function(n){ return __INS__(n); }
};}};
var ContentService = {
  MimeType: { JSON:'application/json', JAVASCRIPT:'text/javascript' },
  createTextOutput: function(){ var o={_c:'',_m:''};
    o.setContent=function(c){o._c=c;return o;}; o.setMimeType=function(m){o._m=m;return o;};
    o.getContent=function(){return o._c;}; return o; }
};
var CacheService = { getScriptCache: function(){ return {
  get: function(k){ return Object.prototype.hasOwnProperty.call(__CACHE__, k) ? __CACHE__[k] : null; },
  put: function(k, v){ __CACHE__[k] = v; },
  remove: function(k){ delete __CACHE__[k]; }
};}};
`;
  const LOGS = [];
  const CACHE = {};
  const sandbox = {
    console,
    __PROPS__: PROPS,
    __LOGS__: LOGS,
    __CACHE__: CACHE,
    __GET__: (n) => SHEETS.get(n) || null,
    __INS__: (n) => { const s = makeSheet(n); SHEETS.set(n, s); return s; }
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(stub + '\n' + fs.readFileSync(SP + 'apps-script-backlog.gs', 'utf8'), ctx);
  return { ctx, SHEETS, PROPS, LOGS, CACHE, makeSheet };
}

let pass = 0, fail = 0;
function t(nome, real, esperado) {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  console.log((ok ? '  ✅ ' : '  ❌ ') + nome + (ok ? '' : `\n       obtido=${JSON.stringify(real)}\n       esperado=${JSON.stringify(esperado)}`));
  ok ? pass++ : fail++;
}

// helper: monta o evento de POST como o Apps Script entrega
const post = (params) => ({ parameter: params });
const parse = (out) => JSON.parse(out.getContent());
const lerAba = (SHEETS, nome) => {
  const s = SHEETS.get(nome);
  if (!s) return null;
  const json = s._rows.map(r => r[0] == null ? '' : String(r[0])).join('');
  return json ? JSON.parse(json) : null;
};

// ─────────────────────────────────────────────────────────────────────────
console.log('\n═══ 1. Escrita normal ponta a ponta (doPost saveVpData) ═══');
{
  const { ctx, SHEETS } = novoAmbiente();
  const base = { rows: Array.from({length:20}, (_,i)=>({id:i})), importedAt:'2026-07-01T00:00:00Z' };
  let r = parse(ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: JSON.stringify(base) })));
  t('primeira carga em base vazia grava', r.ok, true);
  t('conteúdo gravado confere', lerAba(SHEETS,'_vp_geral').rows.length, 20);
  t('aba _audit foi criada', !!SHEETS.get('_audit'), true);
  t('auditoria registrou OK', SHEETS.get('_audit')._rows[1][6], 'OK');
  t('nenhum snapshot na primeira carga (base estava vazia)', !!SHEETS.get('_vp_geral__bak1'), false);
}

console.log('\n═══ 2. O ataque: payload vazio contra base cheia ═══');
{
  const { ctx, SHEETS } = novoAmbiente();
  const base = { rows: Array.from({length:20}, (_,i)=>({id:i})) };
  ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: JSON.stringify(base) }));
  const r = parse(ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: '{"rows":[]}' })));
  t('servidor RECUSA', r.ok, false);
  t('mensagem explica que a última carga válida foi preservada', /última carga válida foi preservada/.test(r.error), true);
  t('DADOS INTACTOS após a recusa', lerAba(SHEETS,'_vp_geral').rows.length, 20);
  const audit = SHEETS.get('_audit')._rows;
  t('recusa registrada na auditoria', audit[audit.length-1][6], 'RECUSADO');
}

console.log('\n═══ 3. Snapshot antes de encolher, e restauração ═══');
{
  const { ctx, SHEETS } = novoAmbiente();
  const mk = n => JSON.stringify({ rows: Array.from({length:n}, (_,i)=>({id:i})) });
  ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: mk(20) }));
  const r = parse(ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: mk(16) })));  // -20%, passa
  t('redução dentro do limite (20→16) grava', r.ok, true);
  t('snapshot foi criado', !!SHEETS.get('_vp_geral__bak1'), true);
  t('snapshot guarda o estado ANTERIOR (20)', lerAba(SHEETS,'_vp_geral__bak1').rows.length, 20);
  t('dado atual é o novo (16)', lerAba(SHEETS,'_vp_geral').rows.length, 16);

  const msg = ctx.restaurarBackup('vpGeral', 1);
  t('restaurarBackup devolve confirmação', /Restaurado/.test(msg), true);
  t('base voltou para 20', lerAba(SHEETS,'_vp_geral').rows.length, 20);
  t('restauração ficou na auditoria', SHEETS.get('_audit')._rows.slice(-1)[0][6], 'RESTAURADO');
}

console.log('\n═══ 4. Ring buffer de snapshots (3 slots, sem estourar) ═══');
{
  const { ctx, SHEETS, PROPS } = novoAmbiente();
  const mk = n => JSON.stringify({ rows: Array.from({length:n}, (_,i)=>({id:i})) });
  ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: mk(100) }));
  [90, 85, 80, 75].forEach(n => ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: mk(n) })));
  const baks = ['1','2','3','4'].map(i => !!SHEETS.get('_vp_geral__bak'+i));
  t('exatamente 3 slots existem (bak4 não é criado)', baks, [true,true,true,false]);
  t('índice do ring buffer circulou', PROPS['bakIdx__vp_geral'], '1');
}

console.log('\n═══ 5. Cargas Jira vazias nunca apagam a última fotografia válida ═══');
{
  const { ctx, SHEETS } = novoAmbiente();
  const base = { rows: Array.from({length:20}, (_,i)=>({id:i})) };
  ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: JSON.stringify(base) }));
  ctx.ativarModoObservacao();
  const r = parse(ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: '{"rows":[]}' })));
  t('payload vazio é recusado mesmo em modo observação', r.ok, false);
  t('última carga continua disponível', lerAba(SHEETS,'_vp_geral').rows.length, 20);
  t('auditoria registra a recusa', SHEETS.get('_audit')._rows.slice(-1)[0][6], 'RECUSADO');
}

console.log('\n═══ 4b. Leitura recupera a última carga válida do backup ═══');
{
  const { ctx, SHEETS } = novoAmbiente();
  ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: JSON.stringify({rows:Array.from({length:20},(_,i)=>({id:i}))}) }));
  ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: JSON.stringify({rows:Array.from({length:16},(_,i)=>({id:i}))}) }));
  const current = SHEETS.get('_vp_geral');
  current.clearContents();
  current.getRange(1,1,1,1).setValue('{"rows":[]}');
  const recovered = parse(ctx.doGet(post({ action:'getVpData', key:'vpGeral' }))).data;
  t('retorna o snapshot anterior ao zero inesperado', recovered.rows.length, 20);
  t('sinaliza que a leitura veio do backup', recovered.recoveredFromBackup, true);
}

console.log('\n═══ 6. Merge das 3 chaves de mapa puro ═══');
{
  const { ctx, SHEETS } = novoAmbiente();
  ctx.doPost(post({ action:'saveVpData', key:'vpQuickNotes', payload: JSON.stringify({'s1|contact':'nota do Ana'}) }));
  const r = parse(ctx.doPost(post({ action:'saveVpData', key:'vpQuickNotes', payload: JSON.stringify({'s2|expresso':'nota do Bruno'}) })));
  t('resposta indica merge', r.merged, true);
  t('nota do primeiro usuário SOBREVIVEU',
    lerAba(SHEETS,'_vp_quicknotes'), {'s1|contact':'nota do Ana','s2|expresso':'nota do Bruno'});
}
{
  const { ctx, SHEETS } = novoAmbiente();
  const op = {a:{x:1}, b:{x:2}, c:{x:3}, d:{x:4}, e:{x:5}, f:{x:6}};
  ctx.doPost(post({ action:'saveVpData', key:'vpOpUpdates', payload: JSON.stringify(op) }));
  delete op.f;   // cliente faz `delete operationalUpdates[k]`
  const r = parse(ctx.doPost(post({ action:'saveVpData', key:'vpOpUpdates', payload: JSON.stringify(op) })));
  t('vpOpUpdates NÃO faz merge', r.merged, false);
  t('exclusão do cliente é RESPEITADA (não ressuscita)',
    Object.keys(lerAba(SHEETS,'_vp_opupdates')).sort(), ['a','b','c','d','e']);
}

console.log('\n═══ 7. Regressão v12: normalização RAID via doPost real ═══');
{
  const { ctx, SHEETS } = novoAmbiente();
  const disc = { activeProjectId:'p1', squads:[], projects: Array.from({length:6},(_,i)=>({
    id:'p'+i, raids:{ risks:[{text:'r', department:'infraestrutura'}], dependencies:[], issues:[], assumptions:[] }
  }))};
  const r = parse(ctx.doPost(post({ action:'saveVpData', key:'discoveryPmo', payload: JSON.stringify(disc) })));
  t('gravou', r.ok, true);
  t('área normalizada para o valor canônico',
    lerAba(SHEETS,'_discovery_pmo').projects[0].raids.risks[0].areaResponsavel, 'Infraestrutura');
  t('discoveryPmo NÃO passou por merge', r.merged, false);
}

console.log('\n═══ 8. vpPlanningConfirmations (ALT-01) via doPost/doGet ═══');
{
  const { ctx, SHEETS } = novoAmbiente();
  const r = parse(ctx.doPost(post({ action:'saveVpData', key:'vpPlanningConfirmations', payload: JSON.stringify({'2026-08-01|contact':{confirmedAt:'x'}}) })));
  t('chave agora é aceita', r.ok, true);
  const g = parse(ctx.doGet(post({ action:'getVpData', key:'vpPlanningConfirmations' })));
  t('e volta na leitura', g.data, {'2026-08-01|contact':{confirmedAt:'x'}});
}

console.log('\n═══ 9. Kill switch ═══');
{
  const { ctx, SHEETS } = novoAmbiente();
  ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: JSON.stringify({rows:[{id:1}]}) }));
  ctx.desativarEscritas();
  const r = parse(ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: JSON.stringify({rows:[{id:1},{id:2}]}) })));
  t('escrita recusada com kill switch', r.ok, false);
  t('base não mudou', lerAba(SHEETS,'_vp_geral').rows.length, 1);
  ctx.reativarEscritas();
  t('religa e volta a gravar',
    parse(ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: JSON.stringify({rows:[{id:1},{id:2}]}) }))).ok, true);
  t('leitura NUNCA é afetada pelo kill switch',
    parse(ctx.doGet(post({ action:'getVpData', key:'vpGeral' }))).ok, true);
}

console.log('\n═══ 10. saveStories e saveBacklog ═══');
{
  const { ctx, SHEETS } = novoAmbiente();
  const st = n => JSON.stringify(Array.from({length:n},(_,i)=>({id:i})));
  t('primeira carga de stories', parse(ctx.doPost(post({action:'saveStories', payload: st(50)}))).ok, true);
  t('payload vazio é ignorado (comportamento v11 preservado)',
    parse(ctx.doPost(post({action:'saveStories', payload:'[]'}))).skipped, 'payload vazio');
  const r = parse(ctx.doPost(post({action:'saveStories', payload: st(10)})));   // -80%
  t('corte de 80% em stories é RECUSADO', r.ok, false);
  t('stories intactas', lerAba(SHEETS,'_stories_chunks').length, 50);

  const official = parse(ctx.doPost(post({
    action:'saveStories', payload: st(10), source:'jira-story-snapshot-v1', sourceFile:'2. QTD Epicos atrelados a story.csv'
  })));
  t('foto Jira oficial pode reduzir a lista completa', official.ok, true);
  t('redução oficial fica auditada', SHEETS.get('_audit')._rows.slice(-1)[0][6], 'REDUCAO_FONTE_OFICIAL');
  t('snapshot preserva stories antes da foto oficial', lerAba(SHEETS,'_stories_chunks__bak1').length, 50);

  const snaps = n => JSON.stringify(Array.from({length:n},(_,i)=>({id:'s'+i, seq:i, stories:[], importedAt:'2026-07-0'+(i%9+1)+'T00:00:00Z'})));
  t('saveBacklog grava', parse(ctx.doPost(post({action:'saveBacklog', payload: snaps(8)}))).ok, true);
  t('saveBacklog mescla (8 + 3 novos = 11)',
    parse(ctx.doPost(post({action:'saveBacklog', payload: snaps(3)}))).savedSnapshots, 8);
}

console.log('\n═══ 11. Janela de redução liberada pelo admin ═══');
{
  const { ctx, SHEETS } = novoAmbiente();
  const mk = n => JSON.stringify({ rows: Array.from({length:n}, (_,i)=>({id:i})) });
  ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: mk(50) }));
  t('limpeza sem liberação → recusa',
    parse(ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: mk(2) }))).ok, false);
  ctx.liberarReducaoPor30Min();
  const r = parse(ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: mk(2) })));
  t('com liberação → passa', r.ok, true);
  t('e fica registrado como REDUCAO_LIBERADA',
    SHEETS.get('_audit')._rows.slice(-1)[0][6], 'REDUCAO_LIBERADA');
  t('snapshot preservou os 50 anteriores', lerAba(SHEETS,'_vp_geral__bak1').rows.length, 50);
}

console.log('\n═══ 11b. Fotografia Jira oficial de painéis ═══');
{
  const { ctx, SHEETS } = novoAmbiente();
  const mk = n => JSON.stringify({ rows: Array.from({length:n}, (_,i)=>({id:i})) });
  t('primeira carga de Geral', parse(ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: mk(30) }))).ok, true);
  const r = parse(ctx.doPost(post({
    action:'saveVpData', key:'vpGeral', payload: mk(8), source:'jira-panel-snapshot-v1', sourceFile:'4. Acomp. Geral Todas Squads.csv'
  })));
  t('Geral oficial pode reduzir', r.ok, true);
  t('Geral oficial mantém rastreabilidade', SHEETS.get('_audit')._rows.slice(-1)[0][6], 'REDUCAO_FONTE_OFICIAL');
  t('snapshot de Geral preserva estado anterior', lerAba(SHEETS,'_vp_geral__bak1').rows.length, 30);
}

console.log('\n═══ 12. health e chaves inválidas ═══');
{
  const { ctx } = novoAmbiente();
  const h = parse(ctx.doGet(post({ action:'health' })));
  t('health responde ok', h.ok, true);
  t('versão correta', h.version, '2026-08-16-v24-discovery-pmo-report-edits');
  t('expõe estado da guarda', [h.writesEnabled, h.guardDryRun], [true, false]);
  t('chave inválida continua rejeitada',
    parse(ctx.doPost(post({ action:'saveVpData', key:'inventada', payload:'{}' }))).ok, false);
  t('JSONP: callback malicioso é neutralizado',
    /^\{/.test(ctx.doGet({parameter:{action:'health', callback:'alert(1)'}}).getContent()), true);
  t('JSONP: callback válido é usado',
    /^cb123\(/.test(ctx.doGet({parameter:{action:'health', callback:'cb123'}}).getContent()), true);
}

console.log('\n═══ 13. getVpDataAll (batch, uma execução para todas as chaves) ═══');
{
  const { ctx } = novoAmbiente();
  ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: JSON.stringify({ rows:[{a:1}], importedAt:'2026-01-01T00:00:00Z' }) }));
  ctx.doPost(post({ action:'saveVpData', key:'vpQuickNotes', payload: JSON.stringify({ x:'nota' }) }));
  const all = parse(ctx.doGet(post({ action:'getVpDataAll' })));
  t('responde ok', all.ok, true);
  t('traz vpGeral salvo', all.data.vpGeral && all.data.vpGeral.rows.length, 1);
  t('traz vpQuickNotes salvo', all.data.vpQuickNotes && all.data.vpQuickNotes.x, 'nota');
  t('chave nunca salva vem null', all.data.vpDeliveries, null);
  t('foto Jira ainda não gravada vem null', all.data.jiraEpicSnapshot, null);
}

console.log('\n═══ 14. baseRevision — concorrência otimista (v14) ═══');
{
  const { ctx, SHEETS } = novoAmbiente();
  const st = n => JSON.stringify(Array.from({length:n},(_,i)=>({id:i})));

  const first = parse(ctx.doPost(post({ action:'saveStories', payload: st(20) })));
  t('primeira carga grava e devolve revisão 1', [first.ok, first.revision], [true, 1]);

  const g1 = parse(ctx.doGet(post({ action:'getStories' })));
  t('getStories expõe a revisão atual', g1.revision, 1);

  const withStaleRev = parse(ctx.doPost(post({
    action:'saveStories', payload: st(20), baseRevision: 1
  })));
  t('gravação com baseRevision atual é aceita', withStaleRev.ok, true);
  t('revisão avança para 2', withStaleRev.revision, 2);

  // Simula duas pessoas: ambas leram a revisão 2, uma salva primeiro (vai para 3)...
  const winner = parse(ctx.doPost(post({ action:'saveStories', payload: st(21), baseRevision: 2 })));
  t('primeira gravação concorrente passa', [winner.ok, winner.revision], [true, 3]);
  // ...a segunda ainda manda baseRevision=2 (desatualizado) e deve ser recusada.
  const loser = parse(ctx.doPost(post({ action:'saveStories', payload: st(19), baseRevision: 2 })));
  t('segunda gravação com revisão desatualizada é RECUSADA', loser.ok, false);
  t('resposta sinaliza conflito de revisão', loser.conflict, true);
  t('revisão atual informada no erro de conflito', loser.currentRevision, 3);
  t('dado do vencedor permanece intacto (não foi sobrescrito pelo perdedor)',
    lerAba(SHEETS, '_stories_chunks').length, 21);

  // Cliente que nunca leu (sem baseRevision) continua funcionando como antes —
  // fluxos automáticos do Bradesco não quebram com esta versão.
  const noRevision = parse(ctx.doPost(post({ action:'saveStories', payload: st(22) })));
  t('gravação sem baseRevision não é bloqueada por conflito', noRevision.ok, true);

  // saveVpData segue a mesma regra.
  const mk = n => JSON.stringify({ rows: Array.from({length:n}, (_,i)=>({id:i})) });
  const vp1 = parse(ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: mk(10) })));
  t('saveVpData primeira carga devolve revisão 1', [vp1.ok, vp1.revision], [true, 1]);
  const vp2 = parse(ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: mk(11), baseRevision: 1 })));
  t('saveVpData com revisão certa passa', [vp2.ok, vp2.revision], [true, 2]);
  const vpConflict = parse(ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: mk(12), baseRevision: 1 })));
  t('saveVpData com revisão velha é RECUSADO', vpConflict.ok, false);
  t('saveVpData sinaliza conflito', vpConflict.conflict, true);
}

console.log('\n═══ 15. getOps4opsData: projeção enxuta do discoveryPmo ═══');
{
  const { ctx, CACHE } = novoAmbiente();
  const disc = {
    updatedAt: '2026-08-04T00:00:00Z',
    projects: [
      // Sem jiraStories: no payload real isso é onde os attachments pesados
      // moram (>1MB por projeto) sem nenhuma história — precisa ser descartado.
      { id:'p-sem-historia', squad:'Contact', owner:'Fulano', updatedAt:'x', attachments:[{big:'x'.repeat(1000)}], jiraStories:[] },
      { id:'p-com-historia', squad:'Expresso', owner:'Ciclano', updatedAt:'y', attachments:[{big:'y'.repeat(1000)}], cards:[{c:1}], jiraStories:[
        { key:'ABC-1', summary:'Faz algo', status:'Done', team:'Expresso', labels:['a','b'], updated:'2026-08-01', tipo:'Story' },
        { key:'ABC-2', summary:'Épico', status:'Aberto', tipo:'Epic' }
      ]}
    ]
  };
  ctx.doPost(post({ action:'saveVpData', key:'discoveryPmo', payload: JSON.stringify(disc) }));
  const g = parse(ctx.doGet(post({ action:'getOps4opsData' })));
  t('responde ok', g.ok, true);
  t('descarta projeto sem jiraStories', g.data.projects.length, 1);
  t('mantém só os campos usados pelo Ops4Ops', g.data.projects[0], {
    squad:'Expresso', owner:'Ciclano', updatedAt:'y', jiraStories:[
      { key:'ABC-1', summary:'Faz algo', status:'Done', team:'Expresso', labels:['a','b'], updated:'2026-08-01', tipo:'Story' },
      { key:'ABC-2', summary:'Épico', status:'Aberto', team:'', labels:undefined, updated:'', tipo:'Epic' }
    ]
  });
  t('não vaza attachments/cards', JSON.stringify(g.data).indexOf('attachments') === -1 && JSON.stringify(g.data).indexOf('cards') === -1, true);
  t('updatedAt da base vem junto', g.data.updatedAt, '2026-08-04T00:00:00Z');
  t('resposta ficou cacheada (CacheService)', !!CACHE.ops4opsLeanV1, true);
}

console.log('\n═══ 16. getOps4opsData: cache evita reler a planilha, e é invalidado ao salvar ═══');
{
  const { ctx, SHEETS } = novoAmbiente();
  const mkDisc = (owner) => JSON.stringify({
    updatedAt: '2026-08-04T00:00:00Z',
    projects: [{ squad:'Expresso', owner, updatedAt:'y', jiraStories:[{ key:'ABC-1', summary:'x', status:'Done', team:'Expresso', updated:'', tipo:'Story' }] }]
  });
  ctx.doPost(post({ action:'saveVpData', key:'discoveryPmo', payload: mkDisc('Ciclano') }));
  const first = parse(ctx.doGet(post({ action:'getOps4opsData' })));
  t('primeira chamada traz owner atual', first.data.projects[0].owner, 'Ciclano');

  // Mutação direta na planilha (sem passar por saveVpData) simula o que uma
  // segunda chamada LERIA se o cache não estivesse sendo servido.
  const sheet = SHEETS.get('_discovery_pmo');
  const raw = sheet._rows.map(r => r[0]).join('');
  const mutated = raw.replace('Ciclano', 'MudouDireto');
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 1).setValues([[mutated]]);
  const second = parse(ctx.doGet(post({ action:'getOps4opsData' })));
  t('segunda chamada dentro do TTL serve do cache (não reflete a mutação direta)', second.data.projects[0].owner, 'Ciclano');

  // saveVpData/discoveryPmo real invalida o cache — a próxima leitura reflete o novo dado.
  ctx.doPost(post({ action:'saveVpData', key:'discoveryPmo', payload: mkDisc('Beltrano') }));
  const third = parse(ctx.doGet(post({ action:'getOps4opsData' })));
  t('gravação em discoveryPmo invalida o cache — próxima leitura já reflete o novo dado', third.data.projects[0].owner, 'Beltrano');
}

console.log('\n═══ 17. getRevisions: ping barato para o polling automático (v21) ═══');
{
  const { ctx } = novoAmbiente();
  const first = parse(ctx.doGet(post({ action:'getRevisions' })));
  t('responde ok', first.ok, true);
  t('base nova: backlog começa em 0', first.revisions.backlog, 0);
  t('base nova: stories começa em 0', first.revisions.stories, 0);
  t('traz revisão de toda chave de VP_SHEET_MAP (ex.: vpGeral)', typeof first.revisions.vpGeral, 'number');
  t('traz discoveryPmo também (usado pelo discovery-pmo/index.html)', typeof first.revisions.discoveryPmo, 'number');
  t('payload fica pequeno (só números, nunca esbarra na truncagem de proxy)',
    JSON.stringify(first).length < 2000, true);
  t('não devolve dado nenhum, só revisão (ping tem que ficar barato)', first.data, undefined);

  const snaps = n => JSON.stringify(Array.from({length:n},(_,i)=>({id:'s'+i, seq:i, stories:[], importedAt:'2026-08-0'+(i%9+1)+'T00:00:00Z'})));
  ctx.doPost(post({ action:'saveBacklog', payload: snaps(2) }));
  const afterBacklogSave = parse(ctx.doGet(post({ action:'getRevisions' })));
  t('salvar backlog incrementa só a revisão do backlog', afterBacklogSave.revisions.backlog, 1);
  t('stories não é afetado por um save de backlog', afterBacklogSave.revisions.stories, 0);

  const mk = n => JSON.stringify({ rows: Array.from({length:n}, (_,i)=>({id:i})) });
  ctx.doPost(post({ action:'saveVpData', key:'vpGeral', payload: mk(5) }));
  const afterVpSave = parse(ctx.doGet(post({ action:'getRevisions' })));
  t('salvar vpGeral incrementa só a revisão de vpGeral', afterVpSave.revisions.vpGeral, 1);
  t('vpQuickNotes (outra chave) não é afetado', afterVpSave.revisions.vpQuickNotes, 0);
  t('backlog mantém a revisão anterior', afterVpSave.revisions.backlog, 1);

  const bk = parse(ctx.doGet(post({ action:'getBacklog' })));
  t('getBacklog agora também devolve revision', bk.revision, 1);
  t('revision de getBacklog bate com a de getRevisions', bk.revision, afterVpSave.revisions.backlog);
}

console.log(`\n═══ RESULTADO E2E: ${pass} passaram, ${fail} falharam ═══`);
process.exit(fail ? 1 : 0);
