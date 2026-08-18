/* Ops4Ops — Gestão 2026, Squads e Parâmetros (áreas de atualização).
   Regra visual do requisito 19: campo manual em amarelo-claro, campo calculado
   em cinza-claro e readonly. Nenhum campo calculado é editável — o valor vem
   sempre do motor de regras, nunca de digitação. */
(function (raiz) {
  'use strict';
  const R = raiz.Ops4OpsRules;

  function escJs(v) {
    return String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  const CLASSE = { CRITICO: 'critico', ATENCAO: 'atencao', OK: 'ok', INDEFINIDO: 'neutro' };
  function classeRisco(n) {
    if (['ALTO', 'Alto', 'INVIÁVEL'].indexOf(n) !== -1) return 'critico';
    if (['MÉDIO', 'Médio', 'APERTADA'].indexOf(n) !== -1) return 'atencao';
    if (['BAIXO', 'Baixo', 'Sem bloqueios', 'VIÁVEL'].indexOf(n) !== -1) return 'ok';
    return 'neutro';
  }

  let abertas = {};        // id → editor expandido
  let listasAbertas = {};  // chave do filtro → lista de múltipla escolha aberta
  let filtros = {};
  let novaAberta = false;

  /* ── Campos ─────────────────────────────────────────────────────────── */

  function campoTexto(id, campo, rotulo, valor, tipo) {
    return '<div class="campo"><label>' + esc(rotulo) + '</label>' +
      '<input class="manual" type="' + (tipo || 'text') + '" value="' + esc(valor == null ? '' : valor) + '"' +
      ' data-ref="ini:' + esc(id) + ':' + campo + '"' +
      ' placeholder="' + (tipo === 'date' ? '' : 'Não informado') + '"' +
      ' oninput="Ops4OpsVisaoGestao.editarDebounce(\'' + esc(id) + '\',\'' + campo + '\',this.value)"></div>';
  }

  /* Igual a campoTexto, mas oferecendo os valores já conhecidos como
     sugestão (<datalist>). Não restringe: um nome novo continua sendo aceito
     — a lista é atalho, não validação. */
  function campoTextoComSugestoes(id, campo, rotulo, valor, listaId) {
    return '<div class="campo"><label>' + esc(rotulo) + '</label>' +
      '<input class="manual" list="' + esc(listaId) + '" value="' + esc(valor == null ? '' : valor) + '"' +
      ' data-ref="ini:' + esc(id) + ':' + campo + '" placeholder="Não informado"' +
      ' oninput="Ops4OpsVisaoGestao.editarDebounce(\'' + esc(id) + '\',\'' + campo + '\',this.value)"></div>';
  }

  function campoNumero(id, campo, rotulo, valor) {
    return '<div class="campo"><label>' + esc(rotulo) + '</label>' +
      '<input class="manual" type="number" min="0" step="1" value="' + (valor == null ? '' : esc(valor)) + '" placeholder="A validar"' +
      ' data-ref="ini:' + esc(id) + ':' + campo + '"' +
      ' oninput="Ops4OpsVisaoGestao.editarDebounce(\'' + esc(id) + '\',\'' + campo + '\',this.value)"></div>';
  }

  function campoSelecao(id, campo, rotulo, valor, opcoes) {
    return '<div class="campo"><label>' + esc(rotulo) + '</label><select class="manual"' +
      ' data-ref="ini:' + esc(id) + ':' + campo + '"' +
      ' onchange="Ops4OpsApp.atualizarIniciativa(\'' + esc(id) + '\',\'' + campo + '\',this.value)">' +
      opcoes.map(function (o) {
        return '<option value="' + esc(o) + '"' + (String(valor) === String(o) ? ' selected' : '') + '>' + esc(o) + '</option>';
      }).join('') + '</select></div>';
  }

  /* Calculado: fundo cinza e sem qualquer forma de escrita. É um <div> e não
     um <input readonly> de propósito — além de não ser editável de jeito
     nenhum, o texto quebra linha em vez de truncar ("DADO INCOMPLET…"), o que
     numa tela de reunião muda a leitura do indicador. */
  function campoAuto(rotulo, valor, dica) {
    return '<div class="campo"><label>' + esc(rotulo) + '</label>' +
      '<div class="valor-auto"' + (dica ? ' title="' + esc(dica) + '"' : '') + '>' + esc(valor) + '</div></div>';
  }

  /* ── Filtros (requisito 20) ─────────────────────────────────────────── */

  function unicos(lista, campo) {
    const set = [];
    lista.forEach(function (i) {
      const v = i[campo];
      if (!R.ehPlaceholder(v) && set.indexOf(v) === -1) set.push(v);
    });
    return set.sort(function (a, b) { return String(a).localeCompare(String(b), 'pt-BR'); });
  }

  // Squad usa o nome resolvido pelo cadastro (ver R.squadDisplay): a fonte
  // grava "ASD" tanto como código real de "Ainda Sem Definição" quanto como
  // marcador de ausência em outros campos — texto bruto duplicaria a squad
  // na lista de opções ou faria essas iniciativas sumirem do filtro.
  function unicosSquads(lista, squads) {
    const set = [];
    lista.forEach(function (i) {
      const nome = R.squadDisplay(i, squads);
      if (nome !== R.A_VALIDAR && nome !== R.NAO_INFORMADO && set.indexOf(nome) === -1) set.push(nome);
    });
    return set.sort(function (a, b) { return String(a).localeCompare(String(b), 'pt-BR'); });
  }

  /* Filtro de múltipla escolha compacto: ocupa uma linha só, como os demais
     filtros, e abre a lista sobreposta ao clicar. A versão anterior mostrava
     a lista sempre aberta, o que desalinhava a grade de filtros e empurrava
     os campos seguintes para outra linha. */
  function campoListaMultipla(chave, rotulo, opcoes) {
    const selecionados = filtros[chave] || [];
    const aberta = !!listasAbertas[chave];

    const resumo = !selecionados.length ? 'Todas'
      : selecionados.length === 1 ? selecionados[0]
      : selecionados.length + ' selecionadas';

    const itens = opcoes.length
      ? opcoes.map(function (o) {
          const marcado = selecionados.indexOf(o) !== -1;
          return '<label class="item-lista"><input type="checkbox"' + (marcado ? ' checked' : '') +
            ' onchange="Ops4OpsVisaoGestao.alternarFiltroLista(\'' + chave + '\',\'' + escJs(o) + '\',this.checked)">' +
            '<span>' + esc(o) + '</span></label>';
        }).join('')
      : '<span class="campo-lista-vazio">Nenhuma opção disponível</span>';

    const painel = aberta
      ? '<div class="campo-lista">' + itens +
        (selecionados.length ? '<button type="button" class="lista-limpar" onclick="Ops4OpsVisaoGestao.limparFiltroLista(\'' + chave + '\')">Limpar seleção</button>' : '') +
        '</div>'
      : '';

    return '<div class="campo campo-lista-wrap"><label>' + esc(rotulo) + '</label>' +
      '<button type="button" class="lista-abrir' + (selecionados.length ? ' tem-selecao' : '') + '"' +
      ' aria-expanded="' + aberta + '"' +
      ' onclick="Ops4OpsVisaoGestao.alternarLista(\'' + chave + '\')">' +
      '<span>' + esc(resumo) + '</span><span class="lista-seta">' + (aberta ? '▴' : '▾') + '</span></button>' +
      painel + '</div>';
  }

  function seletorFiltro(chave, rotulo, opcoes) {
    return '<div class="campo"><label>' + esc(rotulo) + '</label><select onchange="Ops4OpsVisaoGestao.filtrar(\'' + chave + '\',this.value)">' +
      '<option value="">Todos</option>' +
      opcoes.map(function (o) {
        return '<option value="' + esc(o) + '"' + (filtros[chave] === o ? ' selected' : '') + '>' + esc(o) + '</option>';
      }).join('') + '</select></div>';
  }

  function aplicarFiltros(avaliacoes, ctx) {
    return avaliacoes.filter(function (a) {
      const i = a.iniciativa;
      if (filtros.squad && filtros.squad.length && filtros.squad.indexOf(R.squadDisplay(i, ctx.estado.squads)) === -1) return false;
      if (filtros.techLead && R.texto(i.techLead) !== filtros.techLead) return false;
      if (filtros.po && R.texto(i.po) !== filtros.po) return false;
      if (filtros.discovery && i.discoverySituation !== filtros.discovery) return false;
      if (filtros.execucao && i.execSituation !== filtros.execucao) return false;
      if (filtros.bloqueio && i.blocked !== filtros.bloqueio) return false;
      if (filtros.area && R.texto(i.blockArea) !== filtros.area) return false;
      if (filtros.risco && a.concentracao.nivel !== filtros.risco) return false;
      if (filtros.desvio) {
        const n = a.desvio.nivel;
        if (filtros.desvio === 'Com desvio' && !(a.desvio.desvioTotal > 0)) return false;
        if (filtros.desvio === 'Crítico' && n !== 'CRITICO') return false;
        if (filtros.desvio === 'Atenção' && n !== 'ATENCAO') return false;
        if (filtros.desvio === 'No prazo' && n !== 'OK') return false;
        if (filtros.desvio === 'Dado incompleto' && n !== 'INDEFINIDO') return false;
      }
      if (filtros.gestao && a.necessitaGestao.valor !== filtros.gestao) return false;
      return true;
    });
  }

  /* ── Editor de uma iniciativa ───────────────────────────────────────── */

  function editor(a, ctx) {
    const i = a.iniciativa;
    const nomesSquads = ctx.estado.squads.map(function (s) { return s.name; }).filter(Boolean);

    const blocoA =
      '<div class="bloco"><h4>Bloco A — Identificação</h4>' +
      campoTexto(i.id, 'initiativeNumber', 'ID da iniciativa', i.initiativeNumber) +
      campoTexto(i.id, 'name', 'Nome da iniciativa', i.name) +
      '<div class="campo"><label>Squad</label><select class="manual" data-ref="ini:' + esc(i.id) + ':squadId" onchange="Ops4OpsVisaoGestao.trocarSquad(\'' + esc(i.id) + '\',this.value)">' +
        '<option value="">Não informado</option>' +
        ctx.estado.squads.map(function (s) {
          return '<option value="' + esc(s.id) + '"' + (i.squadId === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>';
        }).join('') +
        (i.squadId || R.ehPlaceholder(i.squad) ? '' : '<option value="" selected>' + esc(i.squad) + ' (fora do cadastro)</option>') +
      '</select></div>' +
      campoTexto(i.id, 'po', 'PO', i.po) +
      campoTextoComSugestoes(i.id, 'techLead', 'Líder Técnico', i.techLead, 'lts-conhecidos') +
      '</div>';

    const blocoB =
      '<div class="bloco"><h4>Bloco B — Discovery</h4>' +
      campoSelecao(i.id, 'discoverySituation', 'Situação Discovery', i.discoverySituation, R.SITUACAO_DISCOVERY) +
      '<div class="dupla">' +
        campoTexto(i.id, 'discoveryStart', 'Início Discovery', i.discoveryStart, 'date') +
        campoTexto(i.id, 'discoveryEnd', 'Fim Discovery', i.discoveryEnd, 'date') +
      '</div>' +
      (R.ehADefinir(i.discoveryStart) || R.ehADefinir(i.discoveryEnd)
        ? '<p style="margin:9px 0 0;font-size:11px;color:var(--tinta-3)">A fonte trouxe “a definir” — preservado como está.</p>' : '') +
      '</div>';

    const blocoC =
      '<div class="bloco"><h4>Bloco C — Situação atual da execução</h4>' +
      campoSelecao(i.id, 'execSituation', 'Situação Execução', i.execSituation, R.SITUACAO_EXECUCAO) +
      campoSelecao(i.id, 'deliverySituation', 'Situação Entrega', i.deliverySituation, R.SITUACAO_ENTREGA) +
      '<div class="dupla">' +
        campoTexto(i.id, 'nextMilestoneLabel', 'Próximo Marco', i.nextMilestoneLabel) +
        campoTexto(i.id, 'nextMilestoneDate', 'Data do marco', i.nextMilestoneDate, 'date') +
      '</div>' +
      (a.marco.derivado ? '<p style="margin:9px 0 0;font-size:11px;color:var(--tinta-3)">Sem marco informado, a visão executiva usa <strong>' + esc(a.marco.label) + ' · ' + esc(R.formatarBR(a.marco.data)) + '</strong>, derivado do planejamento.</p>' : '') +
      '</div>';

    const blocoPlano =
      '<div class="bloco"><h4>Planejamento versus execução</h4>' +
      '<div class="dupla">' +
        campoTexto(i.id, 'planStartDev', 'Início DEV Planejado', i.planStartDev, 'date') +
        campoTexto(i.id, 'planEndDev', 'Fim DEV Planejado', i.planEndDev, 'date') +
      '</div>' +
      '<div class="dupla">' +
        campoTexto(i.id, 'realStartDev', 'Início DEV Real', i.realStartDev, 'date') +
        campoTexto(i.id, 'realEndDev', 'Fim DEV Real', i.realEndDev, 'date') +
      '</div>' +
      campoTexto(i.id, 'currentForecast', 'Previsão Atual', i.currentForecast, 'date') +
      '<div class="dupla" style="margin-top:9px">' +
        campoAuto('Desvio de início', a.desvio.desvioInicio === null ? R.DADO_INCOMPLETO : R.formatarDesvio(a.desvio.desvioInicio), 'Início real menos início planejado') +
        campoAuto('Desvio de término', a.desvio.desvioFim === null ? R.DADO_INCOMPLETO : R.formatarDesvio(a.desvio.desvioFim), 'Término real ou previsão atual menos fim planejado') +
      '</div>' +
      '<div class="dupla">' +
        campoAuto('Desvio total em dias', a.desvio.desvioTotal === null ? R.DADO_INCOMPLETO : R.formatarDesvio(a.desvio.desvioTotal)) +
        campoAuto('Situação do planejamento', a.desvio.situacaoPlanejamento) +
      '</div>' +
      '<p style="margin:10px 0 0;font-size:11.5px;color:var(--tinta-2);background:var(--auto);padding:8px 10px;border-radius:6px">' +
        'Planejado <strong>' + esc(R.formatarBR(i.planEndDev)) + '</strong> → ' +
        (a.desvio.referenciaFim ? (a.desvio.referenciaFimTipo === 'real' ? 'Real ' : 'Previsão ') + '<strong>' + esc(R.formatarBR(a.desvio.referenciaFim)) + '</strong>' : '<span class="ausente">sem previsão informada</span>') +
        ' → Desvio <strong>' + esc(a.desvio.desvioTotal === null ? R.DADO_INCOMPLETO : R.formatarDesvio(a.desvio.desvioTotal)) + '</strong></p>' +
      '</div>';

    const blocoBloqueio =
      '<div class="bloco"><h4>Bloqueios</h4>' +
      campoSelecao(i.id, 'blocked', 'Bloqueado?', i.blocked, R.BLOQUEIO) +
      campoTexto(i.id, 'blockReason', 'Motivo do bloqueio', i.blockReason) +
      '<div class="campo"><label>Área responsável pelo destrave</label><select class="manual" data-ref="ini:' + esc(i.id) + ':blockArea" onchange="Ops4OpsApp.atualizarIniciativa(\'' + esc(i.id) + '\',\'blockArea\',this.value)">' +
        '<option value="">Não informado</option>' +
        R.AREAS_DESTRAVE.map(function (o) { return '<option value="' + esc(o) + '"' + (i.blockArea === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') +
      '</select></div>' +
      campoTexto(i.id, 'blockOwner', 'Responsável', i.blockOwner) +
      '<div class="dupla">' +
        campoTexto(i.id, 'blockStart', 'Início do bloqueio', i.blockStart, 'date') +
        campoTexto(i.id, 'blockForecast', 'Previsão de resolução', i.blockForecast, 'date') +
      '</div>' +
      campoAuto('Status executivo', a.statusExecutivo.texto, 'Bloqueio tem prioridade sobre a fase') +
      '</div>';

    const blocoHoras =
      '<div class="bloco"><h4>Horas</h4>' +
      '<div class="dupla">' +
        campoNumero(i.id, 'plannedHours', 'Horas Planejadas', i.plannedHours) +
        campoNumero(i.id, 'consumedHours', 'Horas Consumidas', i.consumedHours) +
      '</div>' +
      '<div class="dupla" style="margin-top:9px">' +
        campoAuto('Horas Restantes', a.horas.restantesTexto) +
        campoAuto('% Consumo', a.horas.percentualTexto) +
      '</div>' +
      campoAuto('Densidade de carga', a.horas.densidadeTexto, 'Horas planejadas por DEV da squad. Não é utilização nem capacidade disponível.') +
      campoAuto('Viabilidade da janela', a.viabilidade.nivel + (a.viabilidade.horasDiaPorDev !== null ? ' · ' + a.viabilidade.horasDiaPorDev.toFixed(1) + 'h/dia por DEV' : ''),
        'Cruza horas planejadas, capacidade da squad e dias úteis da janela de DEV.') +
      '</div>';

    const blocoRisco =
      '<div class="bloco"><h4>Risco e escalonamento (automático)</h4>' +
      '<div class="dupla">' +
        campoAuto('Iniciativas concorrentes', a.concorrencia.total === null ? R.DADO_INCOMPLETO : a.concorrencia.total + ' na janela',
          a.concorrencia.motivo || ('Janela de -' + ctx.cfg.concorrencia.janelaDiasAntes + ' a +' + ctx.cfg.concorrencia.janelaDiasDepois + ' dias')) +
        campoAuto('Risco de concentração', a.concentracao.nivel) +
      '</div>' +
      '<div class="dupla">' +
        campoAuto('Risco se desbloquear', a.desbloqueio.nivel) +
        campoAuto('Necessita atuação da gestão?', a.necessitaGestao.valor) +
      '</div>' +
      campoAuto('Capacidade da Squad', a.capacidade.devTexto + ' DEV · ' + a.capacidade.qaTexto + ' QA' + (a.capacidade.validada ? ' · validada' : ' · não validada')) +
      '<p style="margin:10px 0 0;font-size:11.5px;color:var(--tinta-2);background:var(--auto);padding:9px 11px;border-radius:6px;line-height:1.5">' +
        '<strong>Justificativa executiva:</strong> ' + esc(a.justificativa) + '<br>' +
        '<strong>Ação recomendada:</strong> ' + esc(a.acaoRecomendada) +
        (a.necessitaGestao.motivos.length ? '<br><strong>Motivos:</strong> ' + esc(a.necessitaGestao.motivos.join('; ')) : '') +
      '</p>' +
      '</div>';

    // Jira NÃO é campo manual: no Discovery PMO Tracker esses valores chegam
    // por importação (CSV do Jira, vínculo pelo rótulo "#Nº da iniciativa"),
    // nunca por digitação aqui. Por isso o bloco usa a mesma aparência dos
    // campos calculados (cinza, sem edição) em vez de amarelo — mesmo que,
    // nesta primeira versão do protótipo, sem uma fonte de importação
    // conectada, os valores apareçam como "A validar".
    const blocoJira =
      '<div class="bloco"><h4>Jira (via importação — não editável aqui)</h4>' +
      campoAuto('Jira Epic ID', R.texto(i.jiraEpicId)) +
      campoAuto('URL Jira', R.texto(i.jiraUrl)) +
      '<div class="dupla">' +
        campoAuto('Qtd. histórias', i.jiraStoriesTotal === null ? R.A_VALIDAR : String(i.jiraStoriesTotal)) +
        campoAuto('Refinadas', i.jiraStoriesRefined === null ? R.A_VALIDAR : String(i.jiraStoriesRefined)) +
      '</div>' +
      '<div class="dupla">' +
        campoAuto('Em desenvolvimento', i.jiraStoriesInDev === null ? R.A_VALIDAR : String(i.jiraStoriesInDev)) +
        campoAuto('Concluídas', i.jiraStoriesDone === null ? R.A_VALIDAR : String(i.jiraStoriesDone)) +
      '</div>' +
      (i.jiraUrl ? '<p style="margin:9px 0 0"><a href="' + esc(i.jiraUrl) + '" target="_blank" rel="noopener">Abrir no Jira ↗</a></p>' : '') +
      '<p style="margin:9px 0 0;font-size:11px;color:var(--tinta-3);line-height:1.4">Preenchido pela importação do Jira já usada no Discovery PMO Tracker. Este protótipo ainda não está conectado a essa importação, então aparece como “A validar” até a integração ser ligada.</p>' +
      '</div>';

    const auditoria = a.inconsistencias.length
      ? '<div class="bloco" style="grid-column:1/-1"><h4>Inconsistências apontadas na fonte</h4>' +
        '<div class="aviso">Estes pontos <strong>não são corrigidos automaticamente</strong> — a fonte permanece como está até alguém validar.' +
        '<ul class="lista-limpa">' + a.inconsistencias.map(function (x) { return '<li>' + esc(x.texto) + '</li>'; }).join('') + '</ul></div></div>'
      : '';

    return '<div class="blocos">' + blocoA + blocoB + blocoC + blocoPlano + blocoBloqueio + blocoHoras + blocoRisco + blocoJira + auditoria +
      '<div style="grid-column:1/-1"><button class="botao perigo" onclick="Ops4OpsVisaoGestao.excluir(\'' + esc(i.id) + '\')">Excluir iniciativa</button></div>' +
      '</div>';
  }

  function cabecalhoIniciativa(a, ctx) {
    const i = a.iniciativa;
    const gestao = a.necessitaGestao.valor;
    return '<div class="iniciativa-cab" onclick="Ops4OpsVisaoGestao.alternar(\'' + esc(i.id) + '\')">' +
      '<div><div class="num">' + esc(R.texto(i.initiativeNumber)) + '</div><div class="nome">' + esc(R.texto(i.name, 'Iniciativa sem nome')) + '</div></div>' +
      '<div class="pilha"><span style="font-size:12px;font-weight:600">' + esc(R.squadDisplay(i, ctx.estado.squads)) + '</span><span style="font-size:10.5px;color:var(--tinta-3)">TL ' + esc(R.texto(i.techLead)) + '</span></div>' +
      '<div><span class="selo ' + CLASSE[a.statusExecutivo.nivel] + '">' + esc(a.statusExecutivo.texto) + '</span></div>' +
      '<div class="pilha"><span style="font-size:11.5px">' + esc(R.formatarBR(i.planEndDev)) + ' → ' + esc(a.desvio.referenciaFim ? R.formatarBR(a.desvio.referenciaFim) : R.A_VALIDAR) + '</span>' +
        '<span style="font-size:10.5px;color:var(--tinta-3)">planejado → previsto</span></div>' +
      '<div><span class="selo ' + (a.desvio.desvioTotal === null ? 'neutro' : CLASSE[a.desvio.nivel]) + '">' +
        esc(a.desvio.desvioTotal === null ? R.DADO_INCOMPLETO : R.formatarDesvio(a.desvio.desvioTotal)) + '</span></div>' +
      '<div style="display:flex;gap:8px;align-items:center">' +
        '<span class="selo ' + (gestao === 'SIM' ? 'critico' : gestao === 'AVALIAR' ? 'atencao' : 'ok') + '">Gestão: ' + esc(gestao) + '</span>' +
        '<span class="botao">' + (abertas[i.id] ? 'Fechar' : 'Editar') + '</span>' +
      '</div></div>';
  }

  /* ── Cadastro de nova iniciativa (requisito 23) ─────────────────────── */

  function formularioNova(ctx) {
    if (!novaAberta) {
      return '<div class="barra-acoes"><button class="botao primario" onclick="Ops4OpsVisaoGestao.abrirNova()">+ Nova iniciativa</button>' +
        '<button class="botao" onclick="Ops4OpsApp.exportar()">Exportar dados (JSON)</button>' +
        '<button class="botao" onclick="Ops4OpsApp.recarregarDaFonte()">Recarregar base de planejamento</button></div>';
    }
    const opcoesSquad = ctx.estado.squads.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.name) + '</option>'; }).join('');
    return '<div class="blocos" id="formNova">' +
      '<div class="bloco"><h4>Identificação</h4>' +
        '<div class="campo"><label>ID da iniciativa</label><input class="manual" id="nvNum" placeholder="Não informado"></div>' +
        '<div class="campo"><label>Nome da iniciativa</label><input class="manual" id="nvNome" placeholder="Obrigatório"></div>' +
        '<div class="campo"><label>Squad</label><select class="manual" id="nvSquad"><option value="">Não informado</option>' + opcoesSquad + '</select></div>' +
        '<div class="campo"><label>PO</label><input class="manual" id="nvPo" placeholder="Não informado"></div>' +
        '<div class="campo"><label>Líder Técnico</label><input class="manual" id="nvTl" placeholder="Não informado"></div>' +
      '</div>' +
      '<div class="bloco"><h4>Discovery e execução</h4>' +
        '<div class="campo"><label>Situação Discovery</label><select class="manual" id="nvDisc">' + R.SITUACAO_DISCOVERY.map(function (o) { return '<option' + (o === 'A validar' ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></div>' +
        '<div class="dupla"><div class="campo"><label>Início Discovery</label><input class="manual" type="date" id="nvDiscIni"></div>' +
        '<div class="campo"><label>Fim Discovery</label><input class="manual" type="date" id="nvDiscFim"></div></div>' +
        '<div class="campo"><label>Situação Execução</label><select class="manual" id="nvExec">' + R.SITUACAO_EXECUCAO.map(function (o) { return '<option' + (o === 'A validar' ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></div>' +
        '<div class="campo"><label>Situação Entrega</label><select class="manual" id="nvEntrega">' + R.SITUACAO_ENTREGA.map(function (o) { return '<option' + (o === 'A atualizar' ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></div>' +
      '</div>' +
      '<div class="bloco"><h4>Planejamento</h4>' +
        '<div class="dupla"><div class="campo"><label>Início DEV Planejado</label><input class="manual" type="date" id="nvPlanIni"></div>' +
        '<div class="campo"><label>Fim DEV Planejado</label><input class="manual" type="date" id="nvPlanFim"></div></div>' +
        '<div class="campo"><label>Previsão Atual</label><input class="manual" type="date" id="nvPrev"></div>' +
      '</div>' +
      '<div class="bloco"><h4>Bloqueio e horas</h4>' +
        '<div class="campo"><label>Bloqueado?</label><select class="manual" id="nvBloq">' + R.BLOQUEIO.map(function (o) { return '<option' + (o === 'Não informado' ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></div>' +
        '<div class="campo"><label>Área responsável</label><select class="manual" id="nvArea"><option value="">Não informado</option>' + R.AREAS_DESTRAVE.map(function (o) { return '<option>' + esc(o) + '</option>'; }).join('') + '</select></div>' +
        '<div class="campo"><label>Motivo do bloqueio</label><input class="manual" id="nvMotivo" placeholder="Não informado"></div>' +
        '<div class="dupla"><div class="campo"><label>Horas Planejadas</label><input class="manual" type="number" min="0" id="nvHp" placeholder="A validar"></div>' +
        '<div class="campo"><label>Horas Consumidas</label><input class="manual" type="number" min="0" id="nvHc" placeholder="A validar"></div></div>' +
      '</div>' +
      '<div style="grid-column:1/-1;display:flex;gap:9px;align-items:center">' +
        '<button class="botao primario" onclick="Ops4OpsVisaoGestao.salvarNova()">Salvar iniciativa</button>' +
        '<button class="botao" onclick="Ops4OpsVisaoGestao.fecharNova()">Cancelar</button>' +
        '<span style="font-size:11.5px;color:var(--tinta-3)">Campos deixados em branco permanecem como “A validar” — não são preenchidos com zero nem com suposição.</span>' +
      '</div></div>';
  }

  /* ── Render principal da Gestão 2026 ────────────────────────────────── */

  function render(host, ctx, api) {
    if (!host) return;
    const todas = ctx.avaliacoes;
    const visiveis = aplicarFiltros(todas, ctx);
    const inis = ctx.estado.iniciativas;

    const barraFiltros = '<div class="filtros">' +
      campoListaMultipla('squad', 'Squad', unicosSquads(inis, ctx.estado.squads)) +
      seletorFiltro('techLead', 'Tech Lead', unicos(inis, 'techLead')) +
      seletorFiltro('po', 'PO', unicos(inis, 'po')) +
      seletorFiltro('discovery', 'Situação Discovery', R.SITUACAO_DISCOVERY) +
      seletorFiltro('execucao', 'Situação Execução', R.SITUACAO_EXECUCAO) +
      seletorFiltro('bloqueio', 'Bloqueio', R.BLOQUEIO) +
      seletorFiltro('area', 'Área de destrave', R.AREAS_DESTRAVE) +
      seletorFiltro('risco', 'Risco de concentração', ['BAIXO', 'MÉDIO', 'ALTO', R.DADO_INCOMPLETO]) +
      seletorFiltro('desvio', 'Desvio', ['Com desvio', 'Crítico', 'Atenção', 'No prazo', 'Dado incompleto']) +
      seletorFiltro('gestao', 'Necessita gestão', ['SIM', 'AVALIAR', 'NÃO']) +
      '</div>';

    const lista = visiveis.length
      ? visiveis.map(function (a) {
          return '<div class="iniciativa' + (abertas[a.iniciativa.id] ? ' aberta' : '') + '">' +
            cabecalhoIniciativa(a, ctx) + (abertas[a.iniciativa.id] ? editor(a, ctx) : '') + '</div>';
        }).join('')
      : '<div class="cartao"><div class="vazio">Nenhuma iniciativa corresponde aos filtros selecionados.</div></div>';

    const ltsConhecidos = [];
    ctx.estado.squads.forEach(function (sq) {
      R.techLeads(sq).forEach(function (n) { if (ltsConhecidos.indexOf(n) === -1) ltsConhecidos.push(n); });
    });
    inis.forEach(function (i) {
      const n = R.texto(i.techLead);
      if (n !== R.A_VALIDAR && n !== R.NAO_INFORMADO && ltsConhecidos.indexOf(n) === -1) ltsConhecidos.push(n);
    });
    ltsConhecidos.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
    const datalistLts = '<datalist id="lts-conhecidos">' +
      ltsConhecidos.map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join('') + '</datalist>';

    host.innerHTML = datalistLts +
      '<div class="cartao secao">' +
        '<div class="cartao-topo"><h2>Gestão 2026</h2>' +
          '<div class="legenda-campos"><span><span class="amostra man"></span>Amarelo = atualizar</span>' +
          '<span><span class="amostra aut"></span>Cinza = automático</span>' +
          '<span>' + visiveis.length + ' de ' + todas.length + ' iniciativa(s)</span></div></div>' +
        barraFiltros + formularioNova(ctx) +
      '</div>' + lista;
  }

  /* Editor de Líderes Técnicos da squad: uma squad pode ter mais de um.
     Cada nome vira uma etiqueta removível; o campo abaixo adiciona um novo
     com Enter ou ao sair do campo. Lista vazia mostra "A validar" — nunca
     "sem líder", que seria afirmar algo que não sabemos. */
  function editorTechLeads(q) {
    const lista = R.techLeads(q);
    const etiquetas = lista.length
      ? lista.map(function (nome) {
          return '<span class="lt-chip">' + esc(nome) +
            '<button type="button" title="Remover ' + esc(nome) + '" aria-label="Remover ' + esc(nome) + '"' +
            ' onclick="Ops4OpsVisaoGestao.removerTechLead(\'' + esc(q.id) + '\',\'' + escJs(nome) + '\')">×</button></span>';
        }).join('')
      : '<span class="lt-vazio">' + esc(R.A_VALIDAR) + '</span>';

    return '<div class="lt-lista">' + etiquetas + '</div>' +
      '<input class="manual lt-novo" placeholder="+ adicionar LT" data-ref="sq:' + esc(q.id) + ':novoLt"' +
      ' onkeydown="if(event.key===\'Enter\'){event.preventDefault();Ops4OpsVisaoGestao.adicionarTechLead(\'' + esc(q.id) + '\',this.value)}"' +
      ' onblur="Ops4OpsVisaoGestao.adicionarTechLead(\'' + esc(q.id) + '\',this.value)">';
  }

  /* ── Squads e capacidade (requisito 24) ─────────────────────────────── */

  function renderSquads(host, ctx, api) {
    if (!host) return;
    const linhas = ctx.squads.map(function (s) {
      const q = s.squad;
      return '<tr>' +
        '<td><input class="manual" value="' + esc(q.name == null ? '' : q.name) + '" data-ref="sq:' + esc(q.id) + ':name" onchange="Ops4OpsVisaoGestao.editarSquad(\'' + esc(q.id) + '\',\'name\',this.value)"></td>' +
        '<td style="min-width:210px">' + editorTechLeads(q) + '</td>' +
        '<td style="width:96px"><input class="manual" type="number" min="0" value="' + (q.dev == null ? '' : esc(q.dev)) + '" placeholder="A validar" data-ref="sq:' + esc(q.id) + ':dev" onchange="Ops4OpsVisaoGestao.editarSquad(\'' + esc(q.id) + '\',\'dev\',this.value)"></td>' +
        '<td style="width:96px"><input class="manual" type="number" min="0" value="' + (q.qa == null ? '' : esc(q.qa)) + '" placeholder="A validar" data-ref="sq:' + esc(q.id) + ':qa" onchange="Ops4OpsVisaoGestao.editarSquad(\'' + esc(q.id) + '\',\'qa\',this.value)"></td>' +
        '<td><input class="manual" value="' + esc(q.note == null ? '' : q.note) + '" placeholder="Não informado" data-ref="sq:' + esc(q.id) + ':note" onchange="Ops4OpsVisaoGestao.editarSquad(\'' + esc(q.id) + '\',\'note\',this.value)"></td>' +
        '<td style="text-align:center"><input type="checkbox" style="width:auto" ' + (q.capacityValidated ? 'checked' : '') + ' data-ref="sq:' + esc(q.id) + ':capacityValidated" onchange="Ops4OpsVisaoGestao.editarSquad(\'' + esc(q.id) + '\',\'capacityValidated\',this.checked)"></td>' +
        '<td>' + s.iniciativas + '<span class="cel-mini">' + s.emDesenvolvimento + ' em dev · ' + s.bloqueadas + ' bloqueada(s)</span></td>' +
        '<td><span class="selo ' + classeRisco(s.riscoConcentracao.nivel) + '">' + esc(s.riscoConcentracao.nivel) + '</span></td>' +
        '<td><span class="selo ' + classeRisco(s.riscoSeDesbloquear.nivel) + '">' + esc(s.riscoSeDesbloquear.nivel) + '</span></td>' +
        '<td style="font-size:11.5px">' + esc(s.acaoRecomendada) + '</td>' +
        '<td><button class="botao perigo" onclick="Ops4OpsApp.removerSquad(\'' + esc(q.id) + '\')">Excluir</button></td>' +
        '</tr>';
    }).join('');

    host.innerHTML =
      '<div class="cartao secao">' +
        '<div class="cartao-topo"><h2>Squads e Capacidade</h2>' +
        '<div class="legenda-campos"><span><span class="amostra man"></span>Amarelo = atualizar</span><span><span class="amostra aut"></span>Cinza = automático</span></div></div>' +
        '<div style="padding:14px 18px 0"><div class="aviso info">Campo em branco significa <strong>A validar</strong>, nunca zero. Enquanto DEV não for informado, as iniciativas da squad ficam como <strong>DADO INCOMPLETO</strong> — o sistema não classifica como risco baixo aquilo que ele não sabe. Alterar DEV, QA ou a squad de uma iniciativa recalcula concorrência, concentração, densidade de carga e escalonamento na hora.</div></div>' +
        '<div class="rolagem" style="padding:14px 18px">' +
        (ctx.squads.length
          ? '<table class="grade"><thead><tr>' +
            ['Squad', 'Tech Lead', 'DEV', 'QA', 'Observação', 'Validada?', 'Iniciativas', 'Risco concentração', 'Risco se desbloquear', 'Ação recomendada', '']
              .map(function (h) { return '<th>' + h + '</th>'; }).join('') +
            '</tr></thead><tbody>' + linhas + '</tbody></table>'
          : '<div class="vazio">Nenhuma squad cadastrada.</div>') +
        '</div>' +
        '<div class="barra-acoes"><button class="botao primario" onclick="Ops4OpsVisaoGestao.novaSquad()">+ Nova squad</button></div>' +
      '</div>';
  }

  /* ── Parâmetros (requisito 4, 10, 11, 12 — nada hardcoded) ──────────── */

  function renderConfig(host, ctx, api) {
    if (!host) return;
    const g = function (grupo, chave, rotulo, dica) {
      return '<div class="campo"><label>' + esc(rotulo) + '</label>' +
        '<input class="manual" type="number" value="' + esc(ctx.cfg[grupo][chave]) + '" data-ref="cfg:' + grupo + ':' + chave + '" onchange="Ops4OpsApp.atualizarConfig(\'' + grupo + '\',\'' + chave + '\',this.value)">' +
        (dica ? '<span style="font-size:10.5px;color:var(--tinta-3);line-height:1.4">' + esc(dica) + '</span>' : '') + '</div>';
    };

    host.innerHTML =
      '<div class="cartao secao"><div class="cartao-topo"><h2>Parâmetros de classificação</h2>' +
      '<span class="dica">Nenhum limiar é fixo no código — alterar aqui recalcula toda a leitura executiva</span></div>' +
      '<div class="blocos">' +
        '<div class="bloco"><h4>Desvio</h4>' +
          g('desvio', 'noPrazoAte', 'No prazo até (dias)', 'Desvio menor ou igual a este valor é considerado no prazo. Negativo é adiantado.') +
          g('desvio', 'atencaoAte', 'Atenção até (dias)', 'Acima deste valor, o desvio é crítico.') +
        '</div>' +
        '<div class="bloco"><h4>Concorrência</h4>' +
          g('concorrencia', 'janelaDiasAntes', 'Janela — dias antes') +
          g('concorrencia', 'janelaDiasDepois', 'Janela — dias depois', 'Iniciativas da mesma squad com início de DEV planejado dentro desta janela são concorrentes.') +
        '</div>' +
        '<div class="bloco"><h4>Risco de concentração</h4>' +
          g('concentracao', 'altoConcorrentes', 'ALTO a partir de (concorrentes)') +
          g('concentracao', 'altoConcorrentesSquadPequena', 'ALTO em squad pequena a partir de') +
          g('concentracao', 'devPequena', 'Squad é pequena com até (DEV)') +
          g('concentracao', 'medioConcorrentes', 'MÉDIO a partir de (concorrentes)') +
          g('concentracao', 'medioDevMinimo', 'MÉDIO se squad tem até (DEV)') +
        '</div>' +
        '<div class="bloco"><h4>Risco se desbloquear</h4>' +
          g('desbloqueio', 'baixoAte', 'Baixo até (bloqueadas)') +
          g('desbloqueio', 'medioAte', 'Médio até (bloqueadas)', 'Acima disso, Alto. Qualquer bloqueio “Não informado” força DADO INCOMPLETO.') +
        '</div>' +
        '<div class="bloco"><h4>Marcos e horas</h4>' +
          g('marcos', 'janelaDias', 'Próximos marcos — janela (dias)') +
          g('horas', 'horasDiaPorDev', 'Limite de horas/dia por DEV', 'Usado no indicador de viabilidade da janela de DEV.') +
        '</div>' +
        '<div class="bloco"><h4>Auditoria de datas</h4>' +
          g('dataQualidade', 'anoMinimoPlausivel', 'Ano mínimo plausível') +
          g('dataQualidade', 'anoMaximoPlausivel', 'Ano máximo plausível', 'Datas fora desta faixa são apontadas como provável erro de digitação — jamais corrigidas sozinhas.') +
        '</div>' +
      '</div>' +
      '<div class="barra-acoes"><button class="botao" onclick="Ops4OpsApp.restaurarConfig()">Restaurar padrões</button></div></div>';
  }

  /* ── Interações ─────────────────────────────────────────────────────── */

  let timer = null;
  const API = {
    render: render, renderSquads: renderSquads, renderConfig: renderConfig,

    alternar: function (id) { abertas[id] = !abertas[id]; raiz.Ops4OpsApp.render(); },

    // Digitação em campo de texto grava com folga, para não redesenhar a cada tecla.
    editarDebounce: function (id, campo, valor) {
      clearTimeout(timer);
      timer = setTimeout(function () { raiz.Ops4OpsApp.atualizarIniciativa(id, campo, valor); }, 450);
    },

    trocarSquad: function (id, squadId) {
      const squad = raiz.Ops4OpsApp.squads().find(function (s) { return s.id === squadId; });
      raiz.Ops4OpsApp.atualizarIniciativaCampos(id, {
        squadId: squadId || null,
        squad: squad ? squad.name : null
      });
    },

    filtrar: function (chave, valor) { filtros[chave] = valor || null; raiz.Ops4OpsApp.render(); },

    alternarLista: function (chave) {
      const estava = !!listasAbertas[chave];
      listasAbertas = {};              // só uma lista aberta por vez
      if (!estava) listasAbertas[chave] = true;
      raiz.Ops4OpsApp.render();
    },

    limparFiltroLista: function (chave) {
      filtros[chave] = [];
      raiz.Ops4OpsApp.render();
    },

    alternarFiltroLista: function (chave, valor, marcado) {
      const atual = (filtros[chave] || []).slice();
      const idx = atual.indexOf(valor);
      if (marcado && idx === -1) atual.push(valor);
      if (!marcado && idx !== -1) atual.splice(idx, 1);
      filtros[chave] = atual;
      raiz.Ops4OpsApp.render();
    },

    excluir: function (id) {
      if (!confirm('Excluir esta iniciativa? Os indicadores de risco da squad serão recalculados.')) return;
      delete abertas[id];
      raiz.Ops4OpsApp.removerIniciativa(id);
    },

    abrirNova: function () { novaAberta = true; raiz.Ops4OpsApp.render(); },
    fecharNova: function () { novaAberta = false; raiz.Ops4OpsApp.render(); },

    salvarNova: function () {
      const v = function (id) { const el = document.getElementById(id); return el && el.value !== '' ? el.value : null; };
      const nome = v('nvNome');
      if (!nome) { alert('Informe ao menos o nome da iniciativa.'); return; }
      const squadId = v('nvSquad');
      const squad = raiz.Ops4OpsApp.squads().find(function (s) { return s.id === squadId; });
      const id = raiz.Ops4OpsApp.adicionarIniciativa({
        initiativeNumber: v('nvNum'), name: nome,
        squadId: squadId, squad: squad ? squad.name : null,
        po: v('nvPo'), techLead: v('nvTl'),
        discoverySituation: v('nvDisc'), discoveryStart: v('nvDiscIni'), discoveryEnd: v('nvDiscFim'),
        execSituation: v('nvExec'), deliverySituation: v('nvEntrega'),
        planStartDev: v('nvPlanIni'), planEndDev: v('nvPlanFim'), currentForecast: v('nvPrev'),
        blocked: v('nvBloq'), blockArea: v('nvArea'), blockReason: v('nvMotivo'),
        plannedHours: v('nvHp'), consumedHours: v('nvHc')
      });
      novaAberta = false;
      abertas[id] = true;
      raiz.Ops4OpsApp.render();
    },

    editarSquad: function (id, campo, valor) {
      const atual = raiz.Ops4OpsApp.squads().find(function (s) { return s.id === id; });
      if (!atual) return;
      const dados = Object.assign({}, atual);
      dados[campo] = valor;
      raiz.Ops4OpsApp.salvarSquad(dados);
    },

    adicionarTechLead: function (id, valor) {
      if (!valor || !valor.trim()) return;
      const atual = raiz.Ops4OpsApp.squads().find(function (s) { return s.id === id; });
      if (!atual) return;
      const lista = (Array.isArray(atual.techLeads) ? atual.techLeads : []).slice();
      // Aceita vários de uma vez ("Fulano, Ciclano") — a normalização separa.
      const novos = raiz.Ops4OpsStore.normalizarTechLeads([valor]);
      novos.forEach(function (n) { if (lista.indexOf(n) === -1) lista.push(n); });
      raiz.Ops4OpsApp.salvarSquad(Object.assign({}, atual, { techLeads: lista }));
    },

    removerTechLead: function (id, nome) {
      const atual = raiz.Ops4OpsApp.squads().find(function (s) { return s.id === id; });
      if (!atual) return;
      const lista = (Array.isArray(atual.techLeads) ? atual.techLeads : []).filter(function (n) { return n !== nome; });
      raiz.Ops4OpsApp.salvarSquad(Object.assign({}, atual, { techLeads: lista }));
    },

    novaSquad: function () {
      const nome = prompt('Nome da nova squad:');
      if (!nome || !nome.trim()) return;
      raiz.Ops4OpsApp.salvarSquad({ name: nome.trim(), techLeads: [], dev: null, qa: null, capacityValidated: false });
    }
  };

  /* Fecha a lista aberta ao clicar fora ou apertar Esc.

     Escuta na FASE DE CAPTURA de propósito: marcar um item dispara um
     redesenho que substitui o DOM inteiro, desanexando o elemento clicado
     antes de o evento subir até o document. Na fase de bolha, portanto, o
     clique "de dentro" pode nunca chegar aqui — e a checagem de "clicou
     dentro?" ficaria indeterminada. Na captura o evento passa por aqui
     primeiro, com o DOM ainda intacto. */
  if (typeof document !== 'undefined') {
    document.addEventListener('click', function (ev) {
      if (!Object.keys(listasAbertas).length) return;
      if (ev.target && ev.target.closest && ev.target.closest('.campo-lista-wrap')) return;
      listasAbertas = {};
      raiz.Ops4OpsApp.render();
    }, true);
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape' || !Object.keys(listasAbertas).length) return;
      listasAbertas = {};
      raiz.Ops4OpsApp.render();
    });
  }

  raiz.Ops4OpsVisaoGestao = API;
})(typeof self !== 'undefined' ? self : this);
