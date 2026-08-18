/* Ops4Ops — Visão Executiva (somente leitura).
   Esta camada só FORMATA o que o motor de regras já decidiu. Se algum cálculo
   parecer necessário aqui, ele pertence a rules.js. */
(function (raiz) {
  'use strict';
  const R = raiz.Ops4OpsRules;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // Ausência tem aparência própria: nunca some, nunca vira zero.
  function marcarAusencia(t) {
    if (t === R.A_VALIDAR || t === R.NAO_INFORMADO || t === R.A_DEFINIR) return '<span class="ausente">' + esc(t) + '</span>';
    return esc(t);
  }
  function ou(valor, rotulo) { return marcarAusencia(R.texto(valor, rotulo || R.A_VALIDAR)); }
  // Nome da squad exibido: resolve pelo cadastro (squadId) antes do texto
  // bruto — ver R.squadDisplay para o porquê ("ASD" é código de squad aqui,
  // mas placeholder em outros campos).
  function squadCel(i, squads) { return marcarAusencia(R.squadDisplay(i, squads)); }

  function dataOu(valor) {
    const t = R.formatarBR(valor);
    if (t === R.NAO_INFORMADO || t === R.A_DEFINIR) return '<span class="ausente">' + esc(t) + '</span>';
    return esc(t);
  }

  const CLASSE = { CRITICO: 'critico', ATENCAO: 'atencao', OK: 'ok', INDEFINIDO: 'neutro' };
  function classeRisco(nivel) {
    if (nivel === 'ALTO' || nivel === 'Alto' || nivel === 'INVIÁVEL') return 'critico';
    if (nivel === 'MÉDIO' || nivel === 'Médio' || nivel === 'APERTADA') return 'atencao';
    if (nivel === 'BAIXO' || nivel === 'Baixo' || nivel === 'Sem bloqueios' || nivel === 'VIÁVEL') return 'ok';
    return 'neutro';
  }

  /* ── KPIs (requisito 14) ────────────────────────────────────────────── */
  function kpis(ctx) {
    const av = ctx.avaliacoes;
    // "Em Discovery" é só o que está de fato em andamento. Discovery não
    // iniciado é outra coisa e não pode ser somado aqui.
    const emDiscovery = av.filter(function (a) { return a.iniciativa.discoverySituation === 'Em andamento'; }).length;
    const discoveryComPendencia = av.filter(function (a) { return a.iniciativa.discoverySituation === 'Concluído com pendência'; }).length;
    const emDev = av.filter(function (a) {
      return typeof a.iniciativa.execSituation === 'string' && a.iniciativa.execSituation.indexOf('Desenvolvimento') === 0;
    }).length;
    const bloqueadas = av.filter(function (a) { return R.estaBloqueada(a.iniciativa); }).length;
    const comDesvio = av.filter(function (a) { return a.desvio.desvioTotal !== null && a.desvio.desvioTotal > 0; }).length;
    const squadsRisco = ctx.squads.filter(function (s) { return ['ALTO', 'MÉDIO'].indexOf(s.riscoConcentracao.nivel) !== -1; }).length;
    const pendentes = av.filter(function (a) { return a.confiabilidade.percentual < 1; }).length;

    const itens = [
      { n: av.length, t: 'Total de iniciativas', c: '' },
      { n: emDiscovery, t: 'Em Discovery', c: 't-neutro' },
      { n: discoveryComPendencia, t: 'Discovery concluído com pendência', c: discoveryComPendencia ? 't-atencao' : 't-ok' },
      { n: emDev, t: 'Em desenvolvimento', c: 't-ok' },
      { n: bloqueadas, t: 'Bloqueadas', c: bloqueadas ? 't-critico' : 't-ok' },
      { n: comDesvio, t: 'Com desvio', c: comDesvio ? 't-atencao' : 't-ok' },
      { n: squadsRisco, t: 'Squads em risco médio/alto', c: squadsRisco ? 't-atencao' : 't-ok' },
      { n: pendentes, t: 'Dados pendentes de validação', c: pendentes ? 't-neutro' : 't-ok' }
    ];
    return '<div class="kpis secao" style="grid-template-columns:repeat(8,1fr)">' + itens.map(function (i) {
      return '<div class="kpi ' + i.c + '"><b>' + i.n + '</b><span>' + esc(i.t) + '</span></div>';
    }).join('') + '</div>';
  }

  /* ── Atenção da Gestão (requisito 15) ───────────────────────────────── */
  /* Cada alerta é uma consequência de dado estruturado, com contagem real.
     Nada de frase genérica: se não há o que dizer, o bloco diz isso. */
  function atencaoGestao(ctx) {
    const av = ctx.avaliacoes;
    const alertas = [];

    const escalam = av.filter(function (a) { return a.necessitaGestao.valor === 'SIM'; });
    if (escalam.length) {
      alertas.push({ n: 'critico', t: escalam.length + ' iniciativa(s) necessitam ação da liderança.',
        d: escalam.slice(0, 4).map(function (a) { return R.texto(a.iniciativa.initiativeNumber) + ' — ' + a.necessitaGestao.motivos[0]; }).join(' · ') });
    }

    const criticas = av.filter(function (a) { return a.desvio.nivel === 'CRITICO'; });
    if (criticas.length) {
      alertas.push({ n: 'critico', t: criticas.length + ' iniciativa(s) com desvio acima do limite crítico (' + ctx.cfg.desvio.atencaoAte + ' dias).',
        d: criticas.slice(0, 4).map(function (a) { return R.texto(a.iniciativa.initiativeNumber) + ': ' + R.formatarDesvio(a.desvio.desvioTotal); }).join(' · ') });
    }

    ctx.squads.forEach(function (s) {
      if (s.simulacao && s.simulacao.aplicavel && ['ALTO', 'MÉDIO'].indexOf(s.simulacao.nivel) !== -1) {
        alertas.push({ n: s.simulacao.nivel === 'ALTO' ? 'critico' : 'atencao',
          t: 'Squad ' + R.texto(s.squad.name) + ' entra em risco ' + s.simulacao.nivel.toLowerCase() + ' de concentração se os bloqueios forem liberados juntos.',
          d: s.simulacao.bloqueadas + ' iniciativa(s) bloqueada(s) retornariam para ' + s.capacidade.devTexto + ' DEV, resultando em ' + s.simulacao.concorrentesDepois + ' iniciativas na mesma janela.' });
      }
    });

    const semCapacidade = ctx.squads.filter(function (s) { return !s.capacidade.completa; });
    if (semCapacidade.length) {
      alertas.push({ n: 'atencao', t: semCapacidade.length + ' squad(s) sem capacidade informada — o risco não pode ser calculado.',
        d: semCapacidade.map(function (s) { return R.texto(s.squad.name); }).join(', ') + '. Enquanto DEV não for informado, estas squads aparecem como DADO INCOMPLETO, não como risco baixo.' });
    }

    const naoValidadas = ctx.squads.filter(function (s) { return s.capacidade.completa && !s.capacidade.validada; });
    if (naoValidadas.length) {
      alertas.push({ n: 'atencao', t: naoValidadas.length + ' squad(s) com capacidade informada, porém não validada.',
        d: naoValidadas.map(function (s) { return R.texto(s.squad.name); }).join(', ') + '.' });
    }

    const semBloqueio = av.filter(function (a) { return R.bloqueioIndefinido(a.iniciativa); });
    if (semBloqueio.length) {
      alertas.push({ n: 'atencao', t: semBloqueio.length + ' iniciativa(s) sem informação de bloqueio.',
        d: 'Sem esse campo não é possível afirmar que estão liberadas — a leitura de risco fica incompleta.' });
    }

    const inconsistentes = av.filter(function (a) { return a.inconsistencias.length; });
    if (inconsistentes.length) {
      alertas.push({ n: 'atencao', t: inconsistentes.length + ' iniciativa(s) com inconsistência na fonte de dados.',
        d: inconsistentes.slice(0, 3).map(function (a) { return R.texto(a.iniciativa.initiativeNumber) + ': ' + a.inconsistencias[0].texto; }).join(' · ') });
    }

    const inviaveis = av.filter(function (a) { return a.viabilidade.nivel === 'INVIÁVEL'; });
    if (inviaveis.length) {
      alertas.push({ n: 'critico', t: inviaveis.length + ' iniciativa(s) com janela de DEV incompatível com as horas planejadas.',
        d: 'Horas planejadas divididas pelos DEV da squad e pelos dias úteis da janela: ' +
           inviaveis.slice(0, 3).map(function (a) { return R.texto(a.iniciativa.initiativeNumber) + ' ' + a.viabilidade.horasDiaPorDev.toFixed(1) + 'h/dia'; }).join(' · ') +
           ' (limite ' + ctx.cfg.horas.horasDiaPorDev + 'h, ajustável em Parâmetros). Ou a janela está curta, ou parte das horas cai fora dela — as duas leituras precisam de confirmação.' });
    }

    if (!alertas.length) {
      alertas.push({ n: 'ok', t: 'Nenhum alerta de gestão no momento.', d: 'Nenhum bloqueio, desvio crítico ou risco alto de concentração registrado com os dados atuais.' });
    }

    // No máximo os mais relevantes (requisito 15): críticos antes dos demais.
    const ordem = { critico: 0, atencao: 1, ok: 2 };
    alertas.sort(function (a, b) { return ordem[a.n] - ordem[b.n]; });
    const mostrados = alertas.slice(0, 6);
    const resto = alertas.length - mostrados.length;

    return '<div class="cartao secao">' +
      '<div class="cartao-topo"><h2>Atenção da Gestão</h2><span class="dica">Gerado automaticamente a partir dos dados cadastrados' + (resto > 0 ? ' · ' + resto + ' alerta(s) de menor prioridade omitido(s)' : '') + '</span></div>' +
      '<div class="alertas">' + mostrados.map(function (a) {
        return '<div class="alerta ' + a.n + '"><strong>' + esc(a.t) + '</strong><span>' + esc(a.d) + '</span></div>';
      }).join('') + '</div></div>';
  }

  /* ── Iniciativas críticas (requisito 16) ────────────────────────────── */
  function tabelaIniciativas(ctx) {
    const ordenadas = ctx.avaliacoes.slice().sort(function (a, b) {
      return b.criticidade - a.criticidade ||
        String(R.texto(a.iniciativa.name)).localeCompare(String(R.texto(b.iniciativa.name)), 'pt-BR');
    });

    if (!ordenadas.length) {
      return '<div class="cartao secao"><div class="cartao-topo"><h2>Iniciativas</h2></div>' +
        '<div class="vazio">Nenhuma iniciativa cadastrada. Use a aba <strong>Gestão 2026</strong> para cadastrar ou recarregar a base de planejamento.</div></div>';
    }

    const linhas = ordenadas.map(function (a) {
      const i = a.iniciativa;
      const cls = a.statusExecutivo.nivel === 'CRITICO' ? 'destaque-critico' : (a.statusExecutivo.nivel === 'ATENCAO' ? 'destaque-atencao' : '');

      const idCel = i.jiraUrl
        ? '<a href="' + esc(i.jiraUrl) + '" target="_blank" rel="noopener" title="Abrir no Jira (nova aba)">' + esc(R.texto(i.initiativeNumber)) + ' ↗</a>'
        : ou(i.initiativeNumber);

      const planejado = '<div class="plano-real">' + dataOu(i.planStartDev) + '<span class="seta">→</span>' + dataOu(i.planEndDev) + '</div>';
      const previsao = a.desvio.referenciaFim
        ? dataOu(a.desvio.referenciaFim) + '<span class="cel-mini">' + (a.desvio.referenciaFimTipo === 'real' ? 'término real' : 'previsão atual') + '</span>'
        : '<span class="ausente">' + esc(R.A_VALIDAR) + '</span>';

      const desvio = a.desvio.desvioTotal === null
        ? '<span class="selo neutro">' + esc(R.DADO_INCOMPLETO) + '</span>'
        : '<span class="selo ' + CLASSE[a.desvio.nivel] + '">' + esc(R.formatarDesvio(a.desvio.desvioTotal)) + '</span>' +
          '<span class="cel-mini">' + esc(a.desvio.situacaoPlanejamento) + '</span>';

      const bloqueio = R.estaBloqueada(i)
        ? '<span class="selo critico">' + esc(R.texto(i.blockArea, 'Área a validar')) + '</span>' +
          '<span class="cel-mini">' + esc(R.texto(i.blockReason, 'Motivo a validar')) + '</span>'
        : (R.bloqueioIndefinido(i)
          ? '<span class="selo neutro">' + esc(R.NAO_INFORMADO) + '</span>'
          : '<span class="selo ok sem-ponto">Não</span>');

      const marco = a.marco.data
        ? esc(a.marco.label) + '<span class="cel-mini">' + esc(R.formatarBR(a.marco.data)) + (a.marco.derivado ? ' · derivado do plano' : '') + '</span>'
        : '<span class="ausente">' + esc(R.A_VALIDAR) + '</span>';

      const gestao = a.necessitaGestao.valor;
      const seloGestao = '<span class="selo ' + (gestao === 'SIM' ? 'critico' : gestao === 'AVALIAR' ? 'atencao' : 'ok') + '">' + esc(gestao) + '</span>';

      return '<tr class="' + cls + '">' +
        '<td class="cel-forte">' + idCel + '<span class="cel-mini">' + ou(i.name) + '</span></td>' +
        '<td>' + squadCel(i, ctx.estado.squads) + '<span class="cel-mini">TL ' + R.texto(i.techLead) + '</span></td>' +
        '<td><span class="selo ' + CLASSE[a.statusExecutivo.nivel] + '">' + esc(a.statusExecutivo.texto) + '</span>' +
          '<span class="cel-mini">Discovery: ' + esc(R.texto(i.discoverySituation)) + ' · Entrega: ' + esc(R.texto(i.deliverySituation)) + '</span></td>' +
        '<td>' + planejado + '</td>' +
        '<td>' + previsao + '</td>' +
        '<td>' + desvio + '</td>' +
        '<td>' + bloqueio + '</td>' +
        '<td>' + marco + '</td>' +
        '<td>' + seloGestao + '<span class="cel-mini">' + esc(a.acaoRecomendada) + '</span></td>' +
        '</tr>' +
        '<tr class="' + cls + '"><td colspan="9" style="padding-top:0;font-size:11.5px;color:var(--tinta-2)">' + esc(a.justificativa) + '</td></tr>';
    }).join('');

    return '<div class="cartao secao">' +
      '<div class="cartao-topo"><h2>Iniciativas por criticidade</h2><span class="dica">Ordenado por bloqueio, desvio e risco · a justificativa abaixo de cada linha é montada a partir dos dados, sem texto gerado</span></div>' +
      '<div class="rolagem"><table class="grade"><thead><tr>' +
      ['ID / Iniciativa', 'Squad / Tech Lead', 'Situação executiva', 'DEV planejado', 'Real / Previsão', 'Desvio', 'Bloqueio', 'Próximo marco', 'Gestão / Ação recomendada']
        .map(function (h) { return '<th>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + linhas + '</tbody></table></div></div>';
  }

  /* ── Capacidade por squad (requisito 17) ────────────────────────────── */
  function tabelaSquads(ctx) {
    if (!ctx.squads.length) return '';
    const ordem = ctx.squads.slice().sort(function (a, b) {
      return b.riscoConcentracao.ordem - a.riscoConcentracao.ordem || b.iniciativas - a.iniciativas;
    });
    const linhas = ordem.map(function (s) {
      // "Risco se desbloquear" é o indicador do requisito 12 (função da
      // quantidade de bloqueadas). A simulação de liberação simultânea é uma
      // leitura adicional e aparece como complemento, nunca no lugar dele.
      const rd = s.riscoSeDesbloquear;
      const sim = s.simulacao;
      const simTexto = '<span class="selo ' + classeRisco(rd.nivel) + '">' + esc(rd.nivel) + '</span>' +
        (sim.aplicavel
          ? '<span class="cel-mini">se liberadas juntas: ' + esc(sim.nivel).toLowerCase() + ' · ' +
            esc(String(sim.concorrentesDepois)) + ' na mesma janela</span>'
          : (rd.semInformacao ? '<span class="cel-mini">' + rd.semInformacao + ' sem bloqueio informado</span>' : ''));

      return '<tr>' +
        '<td class="cel-forte">' + ou(s.squad.name) + '<span class="cel-mini">LT ' + esc(R.techLeadsTexto(s.squad)) + '</span></td>' +
        '<td>' + (s.capacidade.dev === null ? '<span class="ausente">' + esc(R.A_VALIDAR) + '</span>' : esc(s.capacidade.devTexto) + ' DEV') +
          '<span class="cel-mini">QA: ' + (s.capacidade.qa === null ? '<span class="ausente">' + esc(R.A_VALIDAR) + '</span>' : esc(s.capacidade.qaTexto)) + '</span></td>' +
        '<td>' + s.iniciativas + '<span class="cel-mini">' + s.emDesenvolvimento + ' em desenvolvimento</span></td>' +
        '<td>' + (s.bloqueadas ? '<span class="selo critico">' + s.bloqueadas + '</span>' : '<span class="selo ok sem-ponto">0</span>') + '</td>' +
        '<td>' + s.entradasProximas + '<span class="cel-mini">próximos ' + ctx.cfg.marcos.janelaDias + ' dias</span></td>' +
        '<td><span class="selo ' + classeRisco(s.riscoConcentracao.nivel) + '">' + esc(s.riscoConcentracao.nivel) + '</span>' +
          (s.riscoConcentracao.faltando && s.riscoConcentracao.faltando.length ? '<span class="cel-mini">falta: ' + esc(s.riscoConcentracao.faltando.join(', ')) + '</span>' : '') + '</td>' +
        '<td>' + simTexto + '</td>' +
        '<td>' + esc(s.acaoRecomendada) + '</td>' +
        '</tr>';
    }).join('');

    return '<div class="cartao secao">' +
      '<div class="cartao-topo"><h2>Capacidade e risco por Squad</h2><span class="dica">“Risco se desbloquear” simula o retorno simultâneo das iniciativas bloqueadas da squad</span></div>' +
      '<div class="rolagem"><table class="grade"><thead><tr>' +
      ['Squad', 'Capacidade', 'Iniciativas', 'Bloqueadas', 'Entradas próximas', 'Risco de concentração', 'Risco se desbloquear', 'Ação recomendada']
        .map(function (h) { return '<th>' + h + '</th>'; }).join('') +
      '</tr></thead><tbody>' + linhas + '</tbody></table></div></div>';
  }

  /* ── Mapa de colisão por squad ──────────────────────────────────────
     Automação adicional: distribui as janelas de DEV planejadas por mês e por
     squad. O gargalo aparece como densidade, sem exigir clique nem leitura de
     tabela. Meses sem dado ficam neutros — ausência não vira "livre". */
  function mapaColisao(ctx) {
    const comJanela = ctx.estado.iniciativas.filter(function (i) { return R.paraData(i.planStartDev); });
    if (!comJanela.length || !ctx.estado.squads.length) return '';

    let min = null, max = null;
    comJanela.forEach(function (i) {
      const ini = R.paraData(i.planStartDev);
      const fim = R.paraData(i.planEndDev) || ini;
      if (!min || ini < min) min = ini;
      if (!max || fim > max) max = fim;
    });
    // Teto de 18 meses para o mapa continuar legível numa tela de reunião.
    const meses = [];
    const cursor = new Date(Date.UTC(min.getUTCFullYear(), min.getUTCMonth(), 1));
    while (cursor <= max && meses.length < 18) {
      meses.push(cursor.getUTCFullYear() + '-' + String(cursor.getUTCMonth() + 1).padStart(2, '0'));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    const truncado = cursor <= max;

    const linhas = ctx.estado.squads.map(function (s) {
      const daSquad = comJanela.filter(function (i) { return R.mesmaSquad(i, { squadId: s.id, squad: s.name }); });
      if (!daSquad.length) return '';
      const celulas = meses.map(function (m) {
        const n = daSquad.filter(function (i) {
          const ini = R.paraData(i.planStartDev);
          const fim = R.paraData(i.planEndDev) || ini;
          const mes = m + '-01';
          const fimMes = R.somarDias(R.somarDias(m + '-01', 31), -1);
          return ini <= R.paraData(fimMes) && fim >= R.paraData(mes);
        }).length;
        const nivel = n >= 3 ? 'n3' : n === 2 ? 'n2' : n === 1 ? 'n1' : '';
        return '<div class="mapa-cel ' + nivel + '" title="' + esc(s.name) + ' · ' + m + ': ' + n + ' iniciativa(s) em janela de DEV">' + (n || '') + '</div>';
      }).join('');
      const cap = R.capacidadeSquad(s);
      return '<div class="mapa-linha"><div class="mapa-nome" title="' + esc(s.name) + '">' + esc(R.texto(s.name)) +
        ' <span style="color:var(--tinta-3);font-weight:500">· ' + esc(cap.devTexto) + ' DEV</span></div>' + celulas + '</div>';
    }).join('');

    const cabecalho = '<div class="mapa-linha"><div></div>' + meses.map(function (m) {
      const p = m.split('-');
      return '<div class="mapa-cab">' + p[1] + '<br><span style="opacity:.6">' + p[0].slice(2) + '</span></div>';
    }).join('') + '</div>';

    return '<div class="cartao secao">' +
      '<div class="cartao-topo"><h2>Mapa de colisão de janelas de DEV</h2>' +
      '<span class="dica">Quantas iniciativas de cada squad ocupam o mesmo mês de desenvolvimento planejado' + (truncado ? ' · exibindo os primeiros 18 meses' : '') + '</span></div>' +
      '<div class="mapa" style="--meses:' + meses.length + '">' + cabecalho + linhas + '</div>' +
      '<div class="mapa-legenda">' +
        '<span><span class="amostra" style="background:#e3ecf6"></span>1 iniciativa</span>' +
        '<span><span class="amostra" style="background:var(--atencao-bg)"></span>2 iniciativas</span>' +
        '<span><span class="amostra" style="background:var(--critico-bg)"></span>3 ou mais</span>' +
        '<span><span class="amostra" style="background:var(--neutro-bg)"></span>sem janela planejada no mês</span>' +
      '</div></div>';
  }

  /* ── Próximos marcos (requisito 18) ─────────────────────────────────── */
  function proximosMarcos(ctx) {
    const limite = R.somarDias(ctx.hoje, ctx.cfg.marcos.janelaDias);
    const itens = ctx.avaliacoes.filter(function (a) {
      return a.marco.data && a.marco.data >= ctx.hoje && a.marco.data <= limite;
    }).sort(function (a, b) { return a.marco.data < b.marco.data ? -1 : 1; });

    const corpo = itens.length ? itens.map(function (a) {
      const i = a.iniciativa;
      const risco = a.concentracao.nivel;
      return '<tr>' +
        '<td class="cel-forte">' + ou(i.initiativeNumber) + '<span class="cel-mini">' + ou(i.name) + '</span></td>' +
        '<td>' + esc(a.marco.label) + (a.marco.derivado ? '<span class="cel-mini">derivado do planejamento</span>' : '') + '</td>' +
        '<td>' + esc(R.formatarBR(a.marco.data)) + '<span class="cel-mini">em ' + R.diasEntre(ctx.hoje, a.marco.data) + ' dia(s)</span></td>' +
        '<td>' + squadCel(i, ctx.estado.squads) + '</td>' +
        '<td><span class="selo ' + classeRisco(risco) + '">' + esc(risco) + '</span></td>' +
        '</tr>';
    }).join('') : '';

    return '<div class="cartao secao">' +
      '<div class="cartao-topo"><h2>Próximos marcos</h2><span class="dica">Janela de ' + ctx.cfg.marcos.janelaDias + ' dias, configurável em Parâmetros</span></div>' +
      (corpo
        ? '<div class="rolagem"><table class="grade"><thead><tr><th>Iniciativa</th><th>Marco</th><th>Data</th><th>Squad</th><th>Risco</th></tr></thead><tbody>' + corpo + '</tbody></table></div>'
        : '<div class="vazio">Nenhum marco nos próximos ' + ctx.cfg.marcos.janelaDias + ' dias com os dados atuais. Marcos são informados na Gestão 2026 ou derivados das datas de planejamento.</div>') +
      '</div>';
  }

  /* ── Confiabilidade do dado ─────────────────────────────────────────
     Automação adicional: torna explícito quanto da leitura acima está apoiada
     em dado real. Sem isso, "risco baixo" pode significar "não sabemos". */
  function confiabilidade(ctx) {
    const av = ctx.avaliacoes;
    if (!av.length) return '';
    const media = av.reduce(function (t, a) { return t + a.confiabilidade.percentual; }, 0) / av.length;

    const contagem = {};
    av.forEach(function (a) { a.confiabilidade.faltando.forEach(function (c) { contagem[c] = (contagem[c] || 0) + 1; }); });
    const NOMES = {
      squad: 'Squad', techLead: 'Líder Técnico', po: 'PO', discoverySituation: 'Situação Discovery',
      discoveryStart: 'Início Discovery', discoveryEnd: 'Fim Discovery', execSituation: 'Situação Execução',
      deliverySituation: 'Situação Entrega', planStartDev: 'Início DEV Planejado', planEndDev: 'Fim DEV Planejado',
      currentForecast: 'Previsão Atual', blocked: 'Bloqueado?', plannedHours: 'Horas Planejadas', consumedHours: 'Horas Consumidas'
    };
    const ranking = Object.keys(contagem).sort(function (a, b) { return contagem[b] - contagem[a]; }).slice(0, 6);

    const inconsist = [];
    av.forEach(function (a) {
      a.inconsistencias.forEach(function (inc) {
        inconsist.push({ num: R.texto(a.iniciativa.initiativeNumber), nome: R.texto(a.iniciativa.name), texto: inc.texto });
      });
    });

    return '<div class="cartao secao">' +
      '<div class="cartao-topo"><h2>Confiabilidade da leitura</h2><span class="dica">Quanto desta visão está apoiada em dado informado, e o que a fonte trouxe inconsistente</span></div>' +
      '<div class="alertas">' +
        '<div class="alerta ' + (media > .8 ? 'ok' : media > .5 ? 'atencao' : 'critico') + '">' +
          '<strong>' + Math.round(media * 100) + '% dos campos de decisão preenchidos</strong>' +
          '<span>Média entre as ' + av.length + ' iniciativas, sobre ' + av[0].confiabilidade.total + ' campos que sustentam desvio, bloqueio e risco. ' +
          'O restante aparece como “A validar” e não recebe classificação otimista.</span></div>' +
        '<div class="alerta ' + (ranking.length ? 'atencao' : 'ok') + '">' +
          '<strong>' + (ranking.length ? 'Campos que mais faltam' : 'Nenhum campo pendente') + '</strong>' +
          '<span>' + (ranking.length
            ? '<ul class="lista-limpa">' + ranking.map(function (c) { return '<li>' + esc(NOMES[c] || c) + ' — ' + contagem[c] + ' iniciativa(s)</li>'; }).join('') + '</ul>'
            : 'Todas as iniciativas têm os campos de decisão informados.') + '</span></div>' +
        '<div class="alerta ' + (inconsist.length ? 'atencao' : 'ok') + '">' +
          '<strong>' + (inconsist.length ? inconsist.length + ' inconsistência(s) na fonte' : 'Nenhuma inconsistência detectada') + '</strong>' +
          '<span>' + (inconsist.length
            ? 'Apontadas para validação humana; nada é corrigido automaticamente.' +
              '<ul class="lista-limpa">' + inconsist.slice(0, 5).map(function (x) { return '<li><strong>' + esc(x.num) + '</strong> — ' + esc(x.texto) + '</li>'; }).join('') +
              (inconsist.length > 5 ? '<li>+ ' + (inconsist.length - 5) + ' outra(s)</li>' : '') + '</ul>'
            : 'Datas, ordem de fases e horas coerentes nos registros atuais.') + '</span></div>' +
      '</div></div>';
  }

  function render(host, ctx) {
    if (!host) return;
    host.innerHTML =
      kpis(ctx) +
      atencaoGestao(ctx) +
      tabelaIniciativas(ctx) +
      tabelaSquads(ctx) +
      mapaColisao(ctx) +
      proximosMarcos(ctx) +
      confiabilidade(ctx);
  }

  raiz.Ops4OpsVisaoExecutiva = { render: render };
})(typeof self !== 'undefined' ? self : this);
