'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const projects = fs.readFileSync(path.join(root, 'visao-projetos', 'index.html'), 'utf8');
const weekly = fs.readFileSync(path.join(root, 'visao-projetos', 'report-semanal-operacional.html'), 'utf8');
const backend = fs.readFileSync(path.join(root, 'apps-script-backlog.gs'), 'utf8');

function test(name, fn){
  try{
    fn();
    console.log('✓', name);
  }catch(error){
    console.error('✗', name);
    throw error;
  }
}

function compileInlineScripts(html, label){
  const regex = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  let count = 0;
  while((match = regex.exec(html))){
    const attrs = match[1] || '';
    if(/\bsrc\s*=/.test(attrs)) continue;
    if(/\btype\s*=\s*["']application\/json["']/.test(attrs)) continue;
    const code = match[2].trim();
    if(!code) continue;
    new Function(code);
    count++;
  }
  assert(count > 0, `${label}: nenhum script inline compilado`);
}

test('scripts inline continuam sintaticamente válidos', () => {
  compileInlineScripts(main, 'index.html');
  compileInlineScripts(projects, 'visao-projetos/index.html');
  compileInlineScripts(weekly, 'relatório semanal');
});

test('datas de Épicos e Backlog usam Web Apps separados', () => {
  const sheets = main.match(/var SHEETS_WEBAPP\s*=\s*'([^']+)'/);
  const backlog = main.match(/var BK_GAS_URL\s*=\s*'([^']+)'/);
  assert(sheets && backlog, 'URLs dos Web Apps não encontradas');
  assert.notStrictEqual(sheets[1], backlog[1], 'SHEETS_WEBAPP não pode apontar para o backend de Backlog');
  assert(sheets[1].includes('AKfycbxOSQe41'), 'fonte oficial de datas foi alterada');
  assert(backlog[1].includes('AKfycbx270pqFDXeKvx'), 'backend v26 não está configurado');
  assert(main.includes('function quarantinePendingWritesAfterEndpointCorrection()'));
  assert(main.includes("storageSet(PENDING_KEY+'_quarantine_20260918',raw)"));
});

test('timeout JSONP mantém callback no-op para respostas tardias', () => {
  assert(main.includes('function retireCallback()'));
  assert(projects.includes('temporário absorve essa resposta tardia'));
  assert(!main.includes('if(done) return; done=true;\n    delete window[name];'));
});

test('persistência exige lista explícita de bases alteradas', () => {
  assert(projects.includes('function persistImportedBases(changedTypes, importedAtByType)'));
  assert(!/persistImportedBases\(\s*\)/.test(projects));
  assert(projects.includes("persistImportedBases(['sprint'])"));
});

test('fotografias oficiais substituem a base anterior', () => {
  assert(projects.includes('sprintRows = parsed.map(r => ({...r, sprintAtual: true}));'));
  assert(projects.includes('homologationRows = parsed.filter(isHomologation);'));
  assert(projects.includes('rows = parsed;'));
  assert(!projects.includes('rows = mergeRowsByChave(rows, parsed, true);'));
});

test('carga parcial e fontes sem vínculo ficam explícitas', () => {
  assert(main.includes('⚠️ Importação parcial'));
  assert(main.includes('item(ns) sem Epic Link'));
  assert(projects.includes('Essas bases mantiveram a carga anterior e não foram marcadas como atualizadas'));
});

test('cache local nunca é apresentado como carteira oficial', () => {
  assert(main.includes('<body class="remote-unconfirmed">'));
  assert(main.includes('function setSourceTrust(name, ok, error)'));
  assert(main.includes('Fontes oficiais · status e horário da última tentativa'));
  assert(main.includes("setSourceTrust('epics',applied"));
  assert(!main.includes("setSourceTrust('epics',true,'');"), 'Épicos não podem ser confirmados antes de aplicar a resposta');
  assert(main.includes("setSourceTrust('backlog',true,'');"));
  assert(main.includes("setSourceTrust('stories',true,'');"));
  assert(main.includes('backlogSnaps=json.backlog.slice();'));
  assert(!main.includes('if(localMax>serverMax && !_gasBacklogSaving)'));
  assert(!main.includes('if(r&&r.id&&!inIds[r.id]&&(!jiraEpicSnapshot||isHistoricEpic(r))) incoming.push(r);'));
});

test('sincronização explica o cache temporário em linguagem simples', () => {
  assert(main.includes('Atualizando dados oficiais…'));
  assert(main.includes('Aguarde alguns segundos. Épicos, Backlog e histórias estão sendo conferidos com o servidor.'));
  assert(main.includes("officialName.textContent='Fonte oficial confirmada'"));
  assert(main.includes("épicos temporários · aguardando confirmação oficial"));
  assert(main.includes("alerta'+(totalIssues>1?'s':'')+' de dados"));
  assert(main.includes('body.remote-unconfirmed .tab-ct{visibility:hidden}'));
});

test('leitura de Épicos tolera 404 transitório e o aviso depende do usuário', () => {
  assert(main.includes('var SHEETS_READ_ATTEMPTS = 2;'));
  assert(main.includes('var SHEETS_RETRY_DELAY_MS = 2000;'));
  assert(main.includes('setTimeout(function(){ attempt(number+1); }, SHEETS_RETRY_DELAY_MS*number);'));
  assert(main.includes('function handleRemoteTrustGateAction()'));
  assert(main.includes("button.textContent='Dispensar aviso';"));
  assert(main.includes('Este aviso permanecerá visível até você dispensá-lo.'));
  assert(main.includes("function sourceTrustCanRender(){return !!_sourceTrust.epics.ok;}"));
  assert(main.includes('var blocking=!sourceTrustCanRender();'));
  assert(main.includes('if(document.hidden || !SHEETS_WEBAPP || _sheetsSyncing || _sheetsWriteSyncing) return;'));
});

test('backend limita o Backlog entregue sem apagar histórico', () => {
  assert(backend.includes("v28-dashboard-banner-avisos"));
  assert(backend.includes('var BACKLOG_CLIENT_MAX_SNAPS = 20;'));
  assert(backend.includes('var clientBacklog = backlogForClient_(backlog);'));
  assert(backend.includes('totalSnapshots: backlog.length'));
});

test('robô audita toda carga e Iniciativas/Ops4Ops usa o CSV de refinamento', () => {
  assert(main.includes('function runUnifiedImportAudit()'));
  assert(main.includes("storageSet('sala_last_import_audit_v1'"));
  assert(main.includes('loadOps4opsXlsx(detected.ops4ops[0].file)'));
  assert(main.includes('Iniciativas / Refinamento → visão própria atualizada e salva'));
  assert(main.includes("fn.indexOf('iniciativa')>=0"));
  assert(!main.includes('gasLoadOps4opsFromDiscovery'));
});

test('comprovante do robô é compartilhado e usa Saúde dos Dados', () => {
  assert(backend.includes("vpImportAudit: '_vp_import_audit'"));
  assert(main.includes('function gasSaveImportAudit(report)'));
  assert(main.includes("key=vpImportAudit"));
  assert(main.includes('function gasLoadImportAudit()'));
  assert(main.includes('openHealthPanel(report)'));
  assert(main.includes('esperado no CSV × inserido no painel'));
});

test('robô registra a prova de Data Início ausente desde a importação', () => {
  assert(main.includes("field:'Data Início'"));
  assert(main.includes('sourceHasStartDateColumn'));
  assert(main.includes('importedWithoutValue'));
  assert(main.includes('currentlyMissing'));
  assert(main.includes('function fmtAuditDateTime(value)'));
  assert(main.includes('Data Início · trilha da última importação'));
  assert(main.includes('A data Criado do Jira não é usada como substituta do início do lead time.'));
  assert(main.includes('continua sem data na confirmação de'));
  assert(main.includes('Antes da importação, o painel registrava'));
  assert(main.includes('Sem comprovante de importação registrado'));
  assert(main.includes('Não é possível afirmar se a data nunca foi informada ou se foi removida antes desta auditoria existir.'));
});

test('qualquer carga por seletor passa pelo comprovante compartilhado', () => {
  assert(main.includes('loadMultipleFiles([file],true);'));
  assert(main.includes('Todo arraste passa pelo ponto único'));
  assert(!main.includes("$id('fi').onchange=function(e){\n  // Copia e limpa antes de processar: permite selecionar novamente o mesmo\n  // CSV/XLSX, situação comum em correções de carga no Jira.\n  var file=e.target.files&&e.target.files[0];\n  this.value='';\n  if(!file) return;\n  if(!guardImportStart()) return;\n  loadXlsx(file);"));
});

test('datas são exibidas por fonte e sprint histórica é bloqueada', () => {
  assert(projects.includes('Fontes · Geral ${compact(lastImportAt.general)}'));
  assert(projects.includes('Indicadores históricos — não representam a sprint atual.'));
  assert(projects.includes('id="sprintEyebrow"'));
});

test('relatório semanal está pausado sem consultar fontes', () => {
  assert(weekly.includes('Relatório semanal em atualização'));
  assert(weekly.includes('Página pausada: preserva a implementação'));
  assert(/'use strict';[\s\S]{0,240}\breturn;/.test(weekly));
  assert(projects.includes('Relatório · em atualização'));
});

console.log('Frontend data-trust regression tests passed.');
