/*
 * Boletim Diário DS — regras de seleção e classificação.
 *
 * Este módulo NÃO recalcula nem redefine nenhuma regra de negócio: ele apenas
 * reaplica, em leitura, os critérios que já existem no dashboard principal
 * (index.html) e no Discovery PMO (discovery-pmo/index.html e
 * discovery-pmo/report-semanal.html). Qualquer alteração de meta, SLA ou
 * classificação deve ser feita nesses arquivos — nunca aqui.
 *
 * Compatível com browser (window.BoletimDSRules) e Node (module.exports).
 */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  else root.BoletimDSRules = mod;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ── Meta de Lead Time — idêntica ao dashboard (index.html: META=62) ──
  var META_LEAD_TIME = 62;

  // ── SLA de Homologação — idêntico ao dashboard (index.html: SLA_HOMOLOG_DAYS=3) ──
  var SLA_HOMOLOG_DAYS = 3;

  var CONCLUDED_STATUSES = ['concluído', 'concluido', 'produção', 'producao', 'cancelado', 'cancelada'];

  function normText(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().trim();
  }

  function isConcludedStatus(status) {
    var n = normText(status);
    return CONCLUDED_STATUSES.some(function (c) { return n.indexOf(c) >= 0; });
  }

  function parseLocalDate(value) {
    if (!value) return null;
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    var s = String(value).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  // ── Dias úteis (feriados nacionais fixos + Sexta-feira Santa), mesma fórmula
  //    usada em index.html (homologEasterSunday/homologNationalHolidayKeys). ──
  function easterSunday(year) {
    var a = year % 19, b = Math.floor(year / 100), c = year % 100;
    var d = Math.floor(b / 4), e = b % 4;
    var f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    var h = (19 * a + b - d - g + 15) % 30;
    var i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7;
    var m = Math.floor((a + 11 * h + 22 * l) / 451);
    var month = Math.floor((h + l - 7 * m + 114) / 31);
    var day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function nationalHolidayKeys(year) {
    var fixed = [[0, 1], [3, 21], [4, 1], [8, 7], [9, 12], [10, 2], [10, 15], [10, 20], [11, 25]]
      .map(function (item) { return year + '-' + String(item[0] + 1).padStart(2, '0') + '-' + String(item[1]).padStart(2, '0'); });
    var goodFriday = easterSunday(year);
    goodFriday.setDate(goodFriday.getDate() - 2);
    fixed.push(goodFriday.getFullYear() + '-' + String(goodFriday.getMonth() + 1).padStart(2, '0') + '-' + String(goodFriday.getDate()).padStart(2, '0'));
    return fixed;
  }

  function isBusinessDay(date) {
    var weekDay = date.getDay();
    if (weekDay === 0 || weekDay === 6) return false;
    var key = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    return nationalHolidayKeys(date.getFullYear()).indexOf(key) < 0;
  }

  function businessDaysBetween(entry, today) {
    var cursor = new Date(entry.getFullYear(), entry.getMonth(), entry.getDate());
    var end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var days = 0;
    while (cursor < end) {
      cursor.setDate(cursor.getDate() + 1);
      if (isBusinessDay(cursor)) days++;
    }
    return days;
  }

  function dueDate(entry) {
    var due = new Date(entry.getFullYear(), entry.getMonth(), entry.getDate());
    var counted = 0;
    while (counted < SLA_HOMOLOG_DAYS) {
      due.setDate(due.getDate() + 1);
      if (isBusinessDay(due)) counted++;
    }
    return due;
  }

  function isSlaHomologationStatus(status) {
    return normText(status).indexOf('em homolog') >= 0;
  }

  /**
   * Item com ponto focal já cadastrado ou sinalizado como ausente.
   * Nunca inventa nome; nunca substitui responsável existente.
   */
  function resolveFocalPoint(rawName) {
    var name = String(rawName == null ? '' : rawName).trim();
    if (!name) {
      return { name: 'Ponto focal não cadastrado', missing: true };
    }
    return { name: name, missing: false };
  }

  /**
   * Blocos 1 — Pontos críticos do dia.
   * Regra existente (index.html renderPremiumRisks): lt>=META || impedimento
   * preenchido. Itens concluídos/cancelados não são "críticos do dia".
   * epicos: lista de épicos do backlog (mesma base do snapshot atual).
   * storiesById: mapa opcional epic->responsavel para preencher ponto focal
   * quando o épico em si não tem campo de responsável.
   */
  function selectCriticos(epicos, focalByEpic) {
    focalByEpic = focalByEpic || {};
    var seen = {};
    var out = [];
    var inconsistencias = [];
    (epicos || []).forEach(function (r) {
      if (!r) return;
      if (isConcludedStatus(r.status)) return;
      var lt = Number(r.lt) || 0;
      var impedimento = String(r.impedimento || '').trim();
      if (!(lt >= META_LEAD_TIME || impedimento)) return;

      var slopc = String(r.id || '').trim();
      var nome = String(r.resumo || '').trim();
      if (!slopc || !nome) {
        inconsistencias.push({ tipo: !slopc ? 'slopc_vazio' : 'nome_vazio', item: r });
        if (!slopc) return; // sem SLOPC não há como exibir nem deduplicar com segurança
      }
      if (seen[slopc]) { inconsistencias.push({ tipo: 'slopc_duplicado', item: r }); return; }
      seen[slopc] = true;

      var focal = resolveFocalPoint(r.responsavel || focalByEpic[slopc]);
      if (focal.missing) inconsistencias.push({ tipo: 'ponto_focal_ausente', item: r });

      out.push({
        slopc: slopc,
        nome: nome || 'Nome completo não informado na carga',
        pontoFocal: focal.name,
        pontoFocalAusente: focal.missing,
        lt: lt,
        impedimento: impedimento,
        squad: r.squad || ''
      });
    });
    out.sort(function (a, b) { return b.lt - a.lt; });
    return { itens: out, inconsistencias: inconsistencias };
  }

  /**
   * Bloco 2 — Discoveries em refinamento.
   * Regra existente (report-semanal.html: schedBy + situação "em curso"):
   * projeto tem item de cronograma cujo nome casa com /refinamento/, não
   * concluído, com início<=hoje<=fim.
   */
  function selectRefinamento(projects, today) {
    today = today || new Date();
    var hoje = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var RE_REFINO = /refinamento/;
    var seen = {};
    var out = [];
    var inconsistencias = [];

    (projects || []).forEach(function (p) {
      if (!p) return;
      var schedule = Array.isArray(p.schedule) ? p.schedule : [];
      var rf = schedule.find(function (i) { return RE_REFINO.test(normText(i.item || '')); });
      if (!rf) return;

      var done = !!(rf.done || rf.status === 'done');
      var ini = parseLocalDate(rf.start);
      var fim = parseLocalDate(rf.end);
      var emCurso = !done && ini && fim && ini <= hoje && fim >= hoje;
      if (!emCurso) return; // fora da fase de refinamento — não exibir

      var numero = String(p.initiativeNumber || p.id || '').trim();
      var nome = String(p.name || '').trim();
      var key = numero || nome;
      if (!key) { inconsistencias.push({ tipo: 'iniciativa_sem_identificador', item: p }); return; }
      if (seen[key]) { inconsistencias.push({ tipo: 'discovery_duplicado', item: p }); return; }
      seen[key] = true;

      var focal = resolveFocalPoint(p.focalPoint);
      if (focal.missing) inconsistencias.push({ tipo: 'ponto_focal_ausente', item: p });

      out.push({
        numero: numero || '—',
        nome: nome || 'Nome completo não informado na carga',
        squad: p.squad || '—',
        etapa: 'Refinamento técnico',
        pontoFocal: focal.name,
        pontoFocalAusente: focal.missing
      });
    });
    out.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
    return { itens: out, inconsistencias: inconsistencias };
  }

  /**
   * Bloco 3 — Homologação fora do prazo.
   * Regra existente (index.html: storyHomologSLA/homologSLA + SLA_HOMOLOG_DAYS):
   * status atual "Em Homologação" e dias úteis desde a entrada > SLA. Itens
   * concluídos não permanecem na lista (status muda, sla deixa de se aplicar).
   */
  function selectHomologacaoAtrasada(stories, today) {
    today = today || new Date();
    var hojeZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var seen = {};
    var out = [];
    var inconsistencias = [];

    (stories || []).forEach(function (s) {
      if (!s) return;
      if (isConcludedStatus(s.status)) return; // concluído não é "atrasado"
      if (!isSlaHomologationStatus(s.status)) return; // fora da homologação

      var slopc = String(s.id || '').trim();
      var nome = String(s.resumo || '').trim();
      if (!slopc) { inconsistencias.push({ tipo: 'slopc_vazio', item: s }); return; }
      if (!nome) inconsistencias.push({ tipo: 'nome_vazio', item: s });

      var entrada = parseLocalDate(s.homologacaoData);
      if (!entrada) { inconsistencias.push({ tipo: 'prazo_ausente', item: s }); return; }

      var diasUteis = businessDaysBetween(entrada, hojeZero);
      var atrasado = diasUteis > SLA_HOMOLOG_DAYS;
      if (!atrasado) return;

      if (seen[slopc]) { inconsistencias.push({ tipo: 'slopc_duplicado', item: s }); return; }
      seen[slopc] = true;

      var focal = resolveFocalPoint(s.responsavel);
      if (focal.missing) inconsistencias.push({ tipo: 'ponto_focal_ausente', item: s });

      out.push({
        slopc: slopc,
        nome: nome || 'Nome completo não informado na carga',
        diasAtraso: Math.max(0, diasUteis - SLA_HOMOLOG_DAYS),
        pontoFocal: focal.name,
        pontoFocalAusente: focal.missing,
        prazo: dueDate(entrada)
      });
    });
    out.sort(function (a, b) { return b.diasAtraso - a.diasAtraso; });
    return { itens: out, inconsistencias: inconsistencias };
  }

  return {
    META_LEAD_TIME: META_LEAD_TIME,
    SLA_HOMOLOG_DAYS: SLA_HOMOLOG_DAYS,
    normText: normText,
    parseLocalDate: parseLocalDate,
    isConcludedStatus: isConcludedStatus,
    isSlaHomologationStatus: isSlaHomologationStatus,
    businessDaysBetween: businessDaysBetween,
    dueDate: dueDate,
    resolveFocalPoint: resolveFocalPoint,
    selectCriticos: selectCriticos,
    selectRefinamento: selectRefinamento,
    selectHomologacaoAtrasada: selectHomologacaoAtrasada
  };
});
