// Testes do motor de regras do Ops4Ops — Gestão Estratégica.
// Sem framework e sem dependência, no mesmo estilo de tests/apps-script-backlog.test.js:
//   node tests/ops4ops-rules.test.js
const R = require('../ops4ops/rules.js');
const C = require('../ops4ops/config.js');

const cfg = C.padrao();
const HOJE = '2026-08-18';

let passou = 0, falhou = 0;
const falhas = [];

function ok(nome, condicao, detalhe) {
  if (condicao) { passou++; return; }
  falhou++;
  falhas.push(nome + (detalhe ? ' → ' + detalhe : ''));
}
function eq(nome, obtido, esperado) {
  const a = JSON.stringify(obtido), b = JSON.stringify(esperado);
  ok(nome, a === b, 'esperado ' + b + ', obtido ' + a);
}

// Iniciativa mínima: tudo ausente por padrão, para que cada teste declare
// explicitamente só o dado de que precisa (e o resto exercite a ausência).
function ini(over) {
  return Object.assign({
    id: 'i1', initiativeNumber: null, name: 'Iniciativa', squad: 'Alfa', squadId: 'sq-alfa',
    po: null, techLead: null,
    discoverySituation: null, discoveryStart: null, discoveryEnd: null,
    execSituation: null, deliverySituation: null,
    nextMilestoneLabel: null, nextMilestoneDate: null,
    planStartDev: null, planEndDev: null, realStartDev: null, realEndDev: null, currentForecast: null,
    blocked: 'Não informado', blockReason: null, blockArea: null, blockOwner: null,
    blockStart: null, blockForecast: null,
    plannedHours: null, consumedHours: null
  }, over || {});
}
function squad(over) {
  return Object.assign({ id: 'sq-alfa', name: 'Alfa', techLead: null, dev: null, qa: null, capacityValidated: false }, over || {});
}

/* ── 1. Cálculo de desvio ─────────────────────────────────────────────── */

(function () {
  const atraso = R.calcularDesvio(ini({ planEndDev: '2026-08-31', currentForecast: '2026-09-12' }), cfg);
  eq('desvio: +12 dias de atraso', atraso.desvioTotal, 12);
  eq('desvio: classificado como crítico', atraso.nivel, 'CRITICO');
  eq('desvio: formatado com sinal', R.formatarDesvio(atraso.desvioTotal), '+12 dias');

  const adiantado = R.calcularDesvio(ini({ planEndDev: '2026-08-31', currentForecast: '2026-08-28' }), cfg);
  eq('desvio: -3 dias é adiantado', adiantado.desvioTotal, -3);
  eq('desvio: adiantado não é atraso', adiantado.nivel, 'OK');
  eq('desvio: rótulo de adiantado', adiantado.situacaoPlanejamento, 'Adiantado');

  const noPrazo = R.calcularDesvio(ini({ planEndDev: '2026-08-31', currentForecast: '2026-08-31' }), cfg);
  eq('desvio: 0 dias é no prazo', noPrazo.desvioTotal, 0);
  eq('desvio: formatação de zero', R.formatarDesvio(0), '0 dias');

  const atencao = R.calcularDesvio(ini({ planEndDev: '2026-08-31', currentForecast: '2026-09-04' }), cfg);
  eq('desvio: 4 dias é atenção', atencao.nivel, 'ATENCAO');

  // Fim real tem precedência sobre a previsão atual.
  const comReal = R.calcularDesvio(ini({ planEndDev: '2026-08-31', currentForecast: '2026-09-20', realEndDev: '2026-09-02' }), cfg);
  eq('desvio: fim real prevalece sobre previsão', comReal.desvioTotal, 2);
  eq('desvio: referência marcada como real', comReal.referenciaFimTipo, 'real');

  // Sem previsão nem real, cai no desvio de início.
  const soInicio = R.calcularDesvio(ini({ planStartDev: '2026-07-01', realStartDev: '2026-07-08', planEndDev: '2026-08-31' }), cfg);
  eq('desvio: usa início quando não há término', soInicio.desvioTotal, 7);
})();

/* ── 2. Dados incompletos nunca viram zero nem "no prazo" ─────────────── */

(function () {
  const sem = R.calcularDesvio(ini({ planEndDev: '2026-08-31' }), cfg);
  eq('incompleto: sem previsão o desvio é nulo, não zero', sem.desvioTotal, null);
  eq('incompleto: situação é DADO INCOMPLETO', sem.situacaoPlanejamento, R.DADO_INCOMPLETO);
  ok('incompleto: nunca classifica como no prazo', sem.nivel !== 'OK');

  const h = R.horas(ini({ plannedHours: null, consumedHours: null }), squad({ dev: null }));
  eq('incompleto: horas planejadas ausentes → A validar', h.planejadasTexto, R.A_VALIDAR);
  eq('incompleto: horas restantes não viram 0', h.restantes, null);
  eq('incompleto: densidade sem DEV é incalculável', h.densidadeTexto, R.DADO_INCOMPLETO);

  const cap = R.capacidadeSquad(squad({ dev: 8, qa: null }));
  eq('incompleto: QA ausente é A validar, não 0', cap.qaTexto, R.A_VALIDAR);
  eq('incompleto: DEV informado é usado', cap.devTexto, '8');

  const cap0 = R.capacidadeSquad(squad({ dev: 0, qa: 0 }));
  eq('incompleto: zero informado permanece zero', cap0.devTexto, '0');

  eq('incompleto: "a definir" da fonte é preservado literal', R.texto('a definir'), 'a definir');
  eq('incompleto: placeholder "ASD" não vira responsável', R.texto('ASD'), R.A_VALIDAR);
  eq('incompleto: data "a definir" não formata como data', R.formatarBR('a definir'), 'a definir');
  eq('incompleto: campo vazio informa ausência', R.formatarBR(null), R.NAO_INFORMADO);
})();

/* ── 3. Concorrência e concentração ───────────────────────────────────── */

(function () {
  const base = { squad: 'Alfa', squadId: 'sq-alfa' };
  const a = ini(Object.assign({ id: 'a', planStartDev: '2026-07-01', blocked: 'Não' }, base));
  const b = ini(Object.assign({ id: 'b', planStartDev: '2026-07-10', blocked: 'Não' }, base));
  const c = ini(Object.assign({ id: 'c', planStartDev: '2026-07-14', blocked: 'Não' }, base));
  const longe = ini(Object.assign({ id: 'd', planStartDev: '2026-11-01', blocked: 'Não' }, base));
  const outraSquad = ini({ id: 'e', squad: 'Beta', squadId: 'sq-beta', planStartDev: '2026-07-05', blocked: 'Não' });

  const todas = [a, b, c, longe, outraSquad];
  // A contagem inclui a própria iniciativa (requisito 10).
  eq('concorrência: 3 iniciativas da squad na janela → 3 concorrentes', R.concorrentes(a, todas, cfg).total, 3);
  eq('concorrência: sozinha na janela conta 1', R.concorrentes(longe, todas, cfg).total, 1);
  eq('concorrência: outra squad não interfere', R.concorrentes(outraSquad, todas, cfg).total, 1);

  // Janela configurável: com ±10 dias, "c" (13 dias depois) sai e "b" (9) fica.
  const estreito = C.mesclar(cfg, { concorrencia: { janelaDiasAntes: 10, janelaDiasDepois: 10 } });
  eq('concorrência: janela é configurável', R.concorrentes(a, todas, estreito).total, 2);

  const sqGrande = squad({ dev: 8, qa: 1, capacityValidated: true });
  eq('concentração: 3 concorrentes → ALTO', R.riscoConcentracao(a, todas, sqGrande, cfg).nivel, 'ALTO');

  const duas = [a, b, longe];
  eq('concentração: 2 concorrentes → MÉDIO', R.riscoConcentracao(a, duas, sqGrande, cfg).nivel, 'MÉDIO');
  eq('concentração: 1 concorrente em squad grande → BAIXO', R.riscoConcentracao(longe, duas, sqGrande, cfg).nivel, 'BAIXO');

  const sqUmDev = squad({ dev: 1, qa: 1, capacityValidated: true });
  eq('concentração: squad de 1 DEV nunca é BAIXO', R.riscoConcentracao(longe, duas, sqUmDev, cfg).nivel, 'MÉDIO');

  const sqDoisDev = squad({ dev: 2, qa: 1, capacityValidated: true });
  eq('concentração: 2 concorrentes com squad de 2 DEV → ALTO', R.riscoConcentracao(a, duas, sqDoisDev, cfg).nivel, 'ALTO');

  // Faltando dado, nunca BAIXO.
  eq('concentração: sem DEV informado → DADO INCOMPLETO', R.riscoConcentracao(a, duas, squad({ dev: null }), cfg).nivel, R.DADO_INCOMPLETO);
  const semBloqueio = ini(Object.assign({ id: 'a', planStartDev: '2026-07-01', blocked: 'Não informado' }, base));
  eq('concentração: bloqueio não informado → DADO INCOMPLETO', R.riscoConcentracao(semBloqueio, duas, sqGrande, cfg).nivel, R.DADO_INCOMPLETO);
  const semData = ini(Object.assign({ id: 'a', blocked: 'Não' }, base));
  eq('concentração: sem início planejado → DADO INCOMPLETO', R.riscoConcentracao(semData, duas, sqGrande, cfg).nivel, R.DADO_INCOMPLETO);
  const semSquad = ini({ id: 'a', squad: null, squadId: null, planStartDev: '2026-07-01', blocked: 'Não' });
  eq('concentração: sem squad → DADO INCOMPLETO', R.riscoConcentracao(semSquad, duas, null, cfg).nivel, R.DADO_INCOMPLETO);
  const faltas = R.riscoConcentracao(semSquad, duas, null, cfg).faltando;
  ok('concentração: DADO INCOMPLETO diz o que falta', faltas.length > 0 && faltas.indexOf('Squad') !== -1, JSON.stringify(faltas));
})();

/* ── 4. Risco se desbloquear ──────────────────────────────────────────── */

(function () {
  const ref = { squadId: 'sq-alfa', squad: 'Alfa' };
  const livre = ini({ id: 'x1', blocked: 'Não' });
  const b1 = ini({ id: 'b1', blocked: 'Sim', blockArea: 'Arquitetura' });
  const b2 = ini({ id: 'b2', blocked: 'Sim', blockArea: 'Dados' });
  const b3 = ini({ id: 'b3', blocked: 'Sim', blockArea: 'Fornecedor' });
  const indef = ini({ id: 'b4', blocked: 'Não informado' });

  eq('desbloqueio: nenhuma bloqueada', R.riscoSeDesbloquear(ref, [livre], cfg).nivel, 'Sem bloqueios');
  eq('desbloqueio: 1 bloqueada → Baixo', R.riscoSeDesbloquear(ref, [livre, b1], cfg).nivel, 'Baixo');
  eq('desbloqueio: 2 bloqueadas → Médio', R.riscoSeDesbloquear(ref, [livre, b1, b2], cfg).nivel, 'Médio');
  eq('desbloqueio: 3 bloqueadas → Alto', R.riscoSeDesbloquear(ref, [livre, b1, b2, b3], cfg).nivel, 'Alto');
  eq('desbloqueio: bloqueio não informado → DADO INCOMPLETO', R.riscoSeDesbloquear(ref, [b1, indef], cfg).nivel, R.DADO_INCOMPLETO);
  ok('desbloqueio: DADO INCOMPLETO ainda reporta quantas são conhecidas', R.riscoSeDesbloquear(ref, [b1, indef], cfg).bloqueadas === 1);

  // Simulação de liberação simultânea.
  const sq = squad({ dev: 2, qa: 1, capacityValidated: true });
  const sim = R.simularDesbloqueioGeral(sq, [b1, b2, b3, livre], cfg, HOJE);
  ok('simulação: identifica as 3 bloqueadas', sim.bloqueadas === 3, JSON.stringify(sim));
  eq('simulação: liberadas juntas geram risco ALTO', sim.nivel, 'ALTO');
  eq('simulação: sem bloqueios não se aplica', R.simularDesbloqueioGeral(sq, [livre], cfg, HOJE).aplicavel, false);
})();

/* ── 5. Bloqueio manda no status executivo ────────────────────────────── */

(function () {
  const bloqueada = ini({ execSituation: 'Desenvolvimento', blocked: 'Sim', blockArea: 'Arquitetura' });
  const st = R.statusExecutivo(bloqueada, R.calcularDesvio(bloqueada, cfg));
  eq('status: bloqueio prevalece sobre a fase', st.texto, 'Bloqueado — Arquitetura');

  const semArea = ini({ execSituation: 'Desenvolvimento', blocked: 'Sim' });
  eq('status: bloqueio sem área é explícito', R.statusExecutivo(semArea, R.calcularDesvio(semArea, cfg)).texto, 'Bloqueado — área a validar');

  const critica = ini({ execSituation: 'Desenvolvimento', blocked: 'Não', planEndDev: '2026-08-01', currentForecast: '2026-08-20' });
  ok('status: desvio crítico explica o problema', /Desvio crítico/.test(R.statusExecutivo(critica, R.calcularDesvio(critica, cfg)).texto));

  const indefinida = ini({ execSituation: 'Desenvolvimento', blocked: 'Não informado' });
  ok('status: bloqueio não informado aparece na leitura', /bloqueio não informado/.test(R.statusExecutivo(indefinida, R.calcularDesvio(indefinida, cfg)).texto));

  const saudavel = ini({ execSituation: 'Desenvolvimento', blocked: 'Não', planEndDev: '2026-08-31', currentForecast: '2026-08-31' });
  eq('status: sem problema mostra a fase', R.statusExecutivo(saudavel, R.calcularDesvio(saudavel, cfg)).texto, 'Desenvolvimento');
})();

/* ── 6. Desenvolvimento + refinamento contínuo e entrega parcial ──────── */

(function () {
  const misto = ini({
    id: 'mix', execSituation: 'Desenvolvimento + refinamento contínuo',
    deliverySituation: 'Entrega parcial em produção', blocked: 'Não',
    planStartDev: '2026-07-01', planEndDev: '2026-08-31', currentForecast: '2026-08-31',
    plannedHours: 800, consumedHours: 200
  });
  const sq = squad({ dev: 4, qa: 1, capacityValidated: true });
  const av = R.avaliar(misto, [misto], [sq], cfg, HOJE);

  eq('fase mista: preservada sem simplificação', av.statusExecutivo.texto, 'Desenvolvimento + refinamento contínuo');
  ok('fase mista: reconhecida como em desenvolvimento na squad',
    R.avaliarSquad(sq, [misto], cfg, HOJE).emDesenvolvimento === 1);
  eq('entrega parcial: preservada', misto.deliverySituation, 'Entrega parcial em produção');
  eq('fase mista: saudável e sem bloqueio não escala', av.necessitaGestao.valor, 'NÃO');
  ok('fase mista: horas continuam calculadas', av.horas.percentualTexto === '25%', av.horas.percentualTexto);
})();

/* ── 7. Alteração de capacidade recalcula indicadores ─────────────────── */

(function () {
  const base = { squad: 'Alfa', squadId: 'sq-alfa', blocked: 'Não' };
  const a = ini(Object.assign({ id: 'a', planStartDev: '2026-07-01', plannedHours: 900 }, base));
  const b = ini(Object.assign({ id: 'b', planStartDev: '2026-07-08' }, base));
  const todas = [a, b];

  const antes = R.riscoConcentracao(a, todas, squad({ dev: 8, capacityValidated: true }), cfg);
  eq('capacidade: 2 concorrentes em squad de 8 DEV → MÉDIO', antes.nivel, 'MÉDIO');

  const depois = R.riscoConcentracao(a, todas, squad({ dev: 2, capacityValidated: true }), cfg);
  eq('capacidade: reduzir DEV para 2 eleva o risco para ALTO', depois.nivel, 'ALTO');

  const h8 = R.horas(a, squad({ dev: 8 }));
  const h2 = R.horas(a, squad({ dev: 2 }));
  eq('capacidade: densidade de carga com 8 DEV', Math.round(h8.densidadeCarga), 113);
  eq('capacidade: densidade de carga com 2 DEV', Math.round(h2.densidadeCarga), 450);
  ok('capacidade: densidade sobe quando a squad encolhe', h2.densidadeCarga > h8.densidadeCarga);

  const semDev = R.riscoConcentracao(a, todas, squad({ dev: null }), cfg);
  eq('capacidade: remover DEV volta a DADO INCOMPLETO', semDev.nivel, R.DADO_INCOMPLETO);
})();

/* ── 8. Escalonamento para gestão ─────────────────────────────────────── */

(function () {
  const sq = squad({ dev: 5, qa: 2, capacityValidated: true });
  const externo = ini({ id: 'g1', blocked: 'Sim', blockArea: 'Arquitetura', blockOwner: 'Fulano',
    blockForecast: '2026-09-01', execSituation: 'Desenvolvimento', planStartDev: '2026-07-01' });
  const av1 = R.avaliar(externo, [externo], [sq], cfg, HOJE);
  eq('gestão: bloqueio externo escala', av1.necessitaGestao.valor, 'SIM');
  ok('gestão: motivo cita a área', /Arquitetura/.test(av1.necessitaGestao.motivos.join(' ')));

  const semDono = ini({ id: 'g2', blocked: 'Sim', blockArea: 'Fornecedor', execSituation: 'Desenvolvimento' });
  const av2 = R.avaliar(semDono, [semDono], [sq], cfg, HOJE);
  ok('gestão: dependência sem responsável escala', /sem responsável/.test(av2.necessitaGestao.motivos.join(' ')));

  const limpa = ini({ id: 'g3', blocked: 'Não', execSituation: 'Desenvolvimento',
    discoverySituation: 'Concluído', discoveryStart: '2026-05-01', discoveryEnd: '2026-06-01',
    deliverySituation: 'Sem entrega', po: 'PO', techLead: 'TL',
    planStartDev: '2026-07-01', planEndDev: '2026-08-31', currentForecast: '2026-08-31',
    plannedHours: 400, consumedHours: 100 });
  const av3 = R.avaliar(limpa, [limpa], [sq], cfg, HOJE);
  eq('gestão: iniciativa completa e saudável não escala', av3.necessitaGestao.valor, 'NÃO');
  eq('gestão: confiabilidade do dado é total', av3.confiabilidade.percentual, 1);
})();

/* ── 9. Justificativa executiva e ação recomendada ────────────────────── */

(function () {
  const sq = squad({ dev: 3, qa: 1, capacityValidated: true });
  const i = ini({ id: 'j1', blocked: 'Sim', blockArea: 'Arquitetura', blockReason: 'Definição de padrão pendente',
    blockOwner: 'Fulano', blockStart: '2026-08-10', blockForecast: '2026-08-25',
    execSituation: 'Refinamento técnico', planEndDev: '2026-08-31', currentForecast: '2026-09-08' });
  const av = R.avaliar(i, [i], [sq], cfg, HOJE);

  ok('justificativa: cita a área do bloqueio', /Arquitetura/.test(av.justificativa), av.justificativa);
  ok('justificativa: cita há quantos dias bloqueia', /8 dia\(s\)/.test(av.justificativa), av.justificativa);
  ok('justificativa: cita o desvio em dias', /8 dia\(s\) sobre o fim planejado/.test(av.justificativa), av.justificativa);
  ok('justificativa: cita o próximo marco', /Próximo marco/.test(av.justificativa), av.justificativa);
  ok('justificativa: não inventa nada fora dos dados', av.justificativa.indexOf('undefined') === -1 && av.justificativa.indexOf('null') === -1);
  ok('ação: orienta o destrave com o responsável', /Fulano/.test(av.acaoRecomendada), av.acaoRecomendada);

  const semNada = ini({ id: 'j2' });
  const av2 = R.avaliar(semNada, [semNada], [null], cfg, HOJE);
  ok('justificativa: sem dados, admite leitura parcial', /leitura parcial/.test(av2.justificativa), av2.justificativa);
  ok('justificativa: nunca afirma que está tudo bem sem dado', av2.justificativa.indexOf('Sem desvio, bloqueio') === -1);
})();

/* ── 10. Auditoria de qualidade da fonte ──────────────────────────────── */

(function () {
  // Caso real da base: Discovery registrado em 2006 em vez de 2026.
  const anoErrado = R.inconsistenciasDeDados(ini({ discoveryStart: '2006-08-03' }), cfg);
  ok('auditoria: ano implausível é sinalizado', anoErrado.some(function (a) { return a.tipo === 'ano'; }), JSON.stringify(anoErrado));

  const invertido = R.inconsistenciasDeDados(ini({ planStartDev: '2026-09-01', planEndDev: '2026-08-01' }), cfg);
  ok('auditoria: fim antes do início é sinalizado', invertido.some(function (a) { return a.tipo === 'ordem'; }));

  const sobreposto = R.inconsistenciasDeDados(ini({ discoveryEnd: '2026-09-30', planStartDev: '2026-09-01' }), cfg);
  ok('auditoria: DEV antes do fim do Discovery pede confirmação', sobreposto.some(function (a) { return a.tipo === 'sobreposicao'; }));

  const bloqCego = R.inconsistenciasDeDados(ini({ blocked: 'Sim' }), cfg);
  ok('auditoria: bloqueio sem área/dono/previsão gera 3 apontamentos', bloqCego.filter(function (a) { return a.tipo === 'bloqueio'; }).length === 3);

  // Caso real da base: 113319 tem início e fim de DEV no mesmo sábado.
  const sabado = R.inconsistenciasDeDados(ini({ planStartDev: '2026-08-01', planEndDev: '2026-08-01' }), cfg);
  ok('auditoria: janela de DEV sem dia útil é sinalizada', sabado.some(function (a) { return a.tipo === 'janela'; }), JSON.stringify(sabado));

  const umDiaUtil = R.inconsistenciasDeDados(ini({ planStartDev: '2026-08-03', planEndDev: '2026-08-03' }), cfg);
  ok('auditoria: janela de um dia útil não é sinalizada', !umDiaUtil.some(function (a) { return a.tipo === 'janela'; }));

  const limpa = R.inconsistenciasDeDados(ini({ discoveryStart: '2026-05-01', discoveryEnd: '2026-06-01',
    planStartDev: '2026-07-01', planEndDev: '2026-08-01', blocked: 'Não' }), cfg);
  eq('auditoria: dados coerentes não geram ruído', limpa.length, 0);

  // A auditoria aponta, mas não altera a fonte.
  const fonte = ini({ discoveryStart: '2006-08-03' });
  R.inconsistenciasDeDados(fonte, cfg);
  eq('auditoria: a fonte permanece intacta', fonte.discoveryStart, '2006-08-03');
})();

/* ── 11. Viabilidade da janela e horas ────────────────────────────────── */

(function () {
  const i = ini({ plannedHours: 1600, planStartDev: '2026-07-01', planEndDev: '2026-08-01', consumedHours: 400 });
  const apertada = R.viabilidadeJanela(i, squad({ dev: 2 }), cfg);
  eq('viabilidade: 1600h/2 DEV em ~23 dias úteis é inviável', apertada.nivel, 'INVIÁVEL');
  const folgada = R.viabilidadeJanela(i, squad({ dev: 20 }), cfg);
  eq('viabilidade: mesma janela com 20 DEV é viável', folgada.nivel, 'VIÁVEL');
  eq('viabilidade: sem DEV informado é incalculável', R.viabilidadeJanela(i, squad({ dev: null }), cfg).nivel, R.DADO_INCOMPLETO);

  const h = R.horas(i, squad({ dev: 4 }));
  eq('horas: restantes', h.restantes, 1200);
  eq('horas: percentual de consumo', h.percentualTexto, '25%');
  eq('horas: densidade de carga por DEV', Math.round(h.densidadeCarga), 400);
})();

/* ── 12. Configuração não é hardcoded ─────────────────────────────────── */

(function () {
  const rigido = C.mesclar(cfg, { desvio: { noPrazoAte: 0, atencaoAte: 1 } });
  eq('config: 3 dias é crítico com limiar apertado', R.classificarDesvio(3, rigido).nivel, 'CRITICO');
  eq('config: 3 dias é atenção com limiar padrão', R.classificarDesvio(3, cfg).nivel, 'ATENCAO');

  const frouxo = C.mesclar(cfg, { desbloqueio: { baixoAte: 2, medioAte: 4 } });
  const ref = { squadId: 'sq-alfa', squad: 'Alfa' };
  const bloq = [ini({ id: 'b1', blocked: 'Sim' }), ini({ id: 'b2', blocked: 'Sim' })];
  eq('config: limiar de desbloqueio é configurável', R.riscoSeDesbloquear(ref, bloq, frouxo).nivel, 'Baixo');

  const mesclado = C.mesclar(cfg, { concorrencia: { janelaDiasAntes: 7 } });
  eq('config: mesclagem preserva parâmetros não informados', mesclado.concorrencia.janelaDiasDepois, cfg.concorrencia.janelaDiasDepois);
  eq('config: mesclagem aplica o que foi informado', mesclado.concorrencia.janelaDiasAntes, 7);
  eq('config: valor inválido não corrompe a configuração', C.mesclar(cfg, { desvio: { atencaoAte: 'x' } }).desvio.atencaoAte, cfg.desvio.atencaoAte);
})();

/* ── 13. Próximo marco e visão por squad ──────────────────────────────── */

(function () {
  const manual = R.proximoMarco(ini({ nextMilestoneLabel: 'Validação técnica', nextMilestoneDate: '2026-08-25' }), HOJE);
  eq('marco: informado manualmente prevalece', manual.label, 'Validação técnica');
  eq('marco: informado não é marcado como derivado', manual.derivado, false);

  const derivado = R.proximoMarco(ini({ discoveryEnd: '2026-09-30', planStartDev: '2026-08-20' }), HOJE);
  eq('marco: deriva a próxima data futura', derivado.label, 'Início DEV planejado');
  eq('marco: sinaliza que foi derivado', derivado.derivado, true);

  const passado = R.proximoMarco(ini({ planStartDev: '2026-01-01' }), HOJE);
  eq('marco: data passada não vira próximo marco', passado.label, R.A_VALIDAR);

  const sq = squad({ id: 'sq-alfa', name: 'Alfa', dev: 8, qa: 1, capacityValidated: true });
  const todas = [
    ini({ id: 's1', execSituation: 'Desenvolvimento', blocked: 'Não', planStartDev: '2026-07-01' }),
    ini({ id: 's2', execSituation: 'Desenvolvimento + refinamento contínuo', blocked: 'Sim', blockArea: 'Dados', planStartDev: '2026-07-05' }),
    ini({ id: 's3', execSituation: 'Não iniciado', blocked: 'Não', planStartDev: '2026-09-01' })
  ];
  const vs = R.avaliarSquad(sq, todas, cfg, HOJE);
  eq('squad: total de iniciativas', vs.iniciativas, 3);
  eq('squad: conta ambas as fases de desenvolvimento', vs.emDesenvolvimento, 2);
  eq('squad: conta bloqueadas', vs.bloqueadas, 1);
  eq('squad: conta entradas nos próximos 30 dias', vs.entradasProximas, 1);
  ok('squad: recomenda ação coerente', typeof vs.acaoRecomendada === 'string' && vs.acaoRecomendada.length > 10);

  const semCap = R.avaliarSquad(squad({ id: 'sq-alfa', name: 'Alfa', dev: null }), todas, cfg, HOJE);
  eq('squad: sem capacidade o risco não é baixo', semCap.riscoConcentracao.nivel, R.DADO_INCOMPLETO);
  ok('squad: sem capacidade a ação é completar o dado', /Informar DEV/.test(semCap.acaoRecomendada), semCap.acaoRecomendada);
})();

/* ── 14. Múltiplas iniciativas da mesma squad, ponta a ponta ──────────── */

(function () {
  const sq = squad({ id: 'sq-exp', name: 'Expresso', dev: 2, qa: null, capacityValidated: true });
  const mk = function (id, inicio, bloq) {
    return ini({ id: id, squad: 'Expresso', squadId: 'sq-exp', planStartDev: inicio,
      planEndDev: '2026-12-01', currentForecast: '2026-12-01', blocked: bloq || 'Não',
      blockArea: bloq === 'Sim' ? 'Dados' : null, execSituation: 'Desenvolvimento' });
  };
  const todas = [mk('e1', '2026-09-01'), mk('e2', '2026-09-05'), mk('e3', '2026-09-10', 'Sim')];
  const avs = todas.map(function (i) { return R.avaliar(i, todas, [sq], cfg, HOJE); });

  eq('ponta a ponta: 3 na janela geram risco ALTO', avs[0].concentracao.nivel, 'ALTO');
  eq('ponta a ponta: a bloqueada tem status de bloqueio', avs[2].statusExecutivo.texto, 'Bloqueado — Dados');
  eq('ponta a ponta: 1 bloqueada → risco de desbloqueio Baixo', avs[0].desbloqueio.nivel, 'Baixo');
  ok('ponta a ponta: concentração alta escala à gestão', avs[0].necessitaGestao.valor === 'SIM');
  eq('ponta a ponta: QA ausente aparece como A validar', avs[0].capacidade.qaTexto, R.A_VALIDAR);
  ok('ponta a ponta: criticidade ordena a bloqueada acima da saudável', avs[2].criticidade >= avs[0].criticidade);

  // Adicionar uma quarta iniciativa recalcula o cenário.
  const comNova = todas.concat([mk('e4', '2026-09-12')]);
  eq('ponta a ponta: nova iniciativa aumenta os concorrentes', R.concorrentes(comNova[0], comNova, cfg).total, 4);
})();

/* ── Resultado ────────────────────────────────────────────────────────── */

console.log('\nOps4Ops — regras: ' + passou + '/' + (passou + falhou) + ' testes passaram.');
if (falhou) {
  console.log('\nFalhas:');
  falhas.forEach(function (f) { console.log('  ✗ ' + f); });
  process.exit(1);
}
process.exit(0);
