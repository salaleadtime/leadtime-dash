/* Ops4Ops — Gestão Estratégica · Motor de regras.
   Funções puras, sem DOM e sem estado global: recebem dados + configuração e
   devolvem resultado. É o único lugar onde mora regra de negócio (requisito 28)
   e é o que os testes exercitam (tests/ops4ops-rules.test.js).

   Princípio inegociável do produto (requisito 1 e 10): ausência de dado NUNCA
   vira zero e nunca vira uma classificação otimista. Falta de dado tem valor
   próprio — A_VALIDAR / NAO_INFORMADO / DADO_INCOMPLETO — e se propaga. */
(function (raiz, fabrica) {
  const api = fabrica();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else raiz.Ops4OpsRules = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const A_VALIDAR = 'A validar';
  const NAO_INFORMADO = 'Não informado';
  const DADO_INCOMPLETO = 'DADO INCOMPLETO';

  // Marcador literal vindo da fonte de planejamento. Requisito: quando a fonte
  // trouxer "a definir", preservar exatamente dessa forma — não é uma data e
  // também não é ausência silenciosa, é uma decisão que ainda não foi tomada.
  const A_DEFINIR = 'a definir';

  const SITUACAO_DISCOVERY = ['Não iniciado', 'Em andamento', 'Concluído', 'Concluído com pendência', 'A validar'];
  const SITUACAO_EXECUCAO = ['Não iniciado', 'Refinamento técnico', 'Pronto para desenvolvimento', 'Desenvolvimento',
    'Desenvolvimento + refinamento contínuo', 'Homologação', 'Implantação', 'Melhoria contínua', 'Concluído', 'A validar'];
  const SITUACAO_ENTREGA = ['Sem entrega', 'Entrega parcial em produção', 'Entrega total em produção', 'A atualizar'];
  const AREAS_DESTRAVE = ['Arquitetura', 'Infraestrutura', 'Segurança', 'Dados', 'Fornecedor', 'Negócio', 'Squad', 'Outra'];
  const BLOQUEIO = ['Sim', 'Não', 'Não informado'];

  /* ── Primitivos de ausência ─────────────────────────────────────────── */

  function vazio(v) {
    return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  }

  // "a definir" na fonte não é data e não é ausência: é um marcador a preservar.
  function ehADefinir(v) {
    return typeof v === 'string' && v.trim().toLowerCase() === A_DEFINIR;
  }

  // Placeholders que a base herdou de planilha e que NÃO são pessoa/valor real.
  // Tratados como ausência para não fingir que existe um responsável.
  const PLACEHOLDERS = ['a definir', 'a validar', 'nao informado', 'não informado', 'asd', '-', '--', 'n/a', 'na', 'tbd'];
  function ehPlaceholder(v) {
    if (vazio(v)) return true;
    return PLACEHOLDERS.indexOf(String(v).trim().toLowerCase()) !== -1;
  }

  // Texto para exibição. Nunca inventa: devolve o rótulo de ausência.
  function texto(v, rotuloAusencia) {
    if (ehADefinir(v)) return A_DEFINIR;
    if (ehPlaceholder(v)) return rotuloAusencia || A_VALIDAR;
    return String(v).trim();
  }

  // Número para exibição/cálculo. 0 informado é 0; ausência é ausência.
  function numero(v) {
    if (vazio(v)) return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  /* ── Datas ──────────────────────────────────────────────────────────── */

  const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

  function paraData(v) {
    if (vazio(v) || ehADefinir(v)) return null;
    const m = ISO.exec(String(v).trim());
    if (!m) return null;
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (Number.isNaN(d.getTime())) return null;
    if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
    return d;
  }

  function formatarBR(v) {
    const d = paraData(v);
    if (d) return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + d.getUTCFullYear();
    if (ehADefinir(v)) return A_DEFINIR;
    return vazio(v) ? NAO_INFORMADO : String(v);
  }

  function diasEntre(de, ate) {
    const a = paraData(de);
    const b = paraData(ate);
    if (!a || !b) return null;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
  }

  function hojeISO(agora) {
    const d = agora ? new Date(agora) : new Date();
    return d.toISOString().slice(0, 10);
  }

  function somarDias(iso, dias) {
    const d = paraData(iso);
    if (!d) return null;
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  }

  // Dias úteis aproximados (seg-sex), sem calendário de feriados — usado só no
  // indicador de viabilidade da janela, que é sinalizador e não compromisso.
  function diasUteis(de, ate) {
    const a = paraData(de);
    const b = paraData(ate);
    if (!a || !b || b < a) return null;
    let total = 0;
    const cursor = new Date(a.getTime());
    while (cursor <= b) {
      const dow = cursor.getUTCDay();
      if (dow !== 0 && dow !== 6) total++;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return total;
  }

  /* ── Regra 4 · Desvio de planejamento ───────────────────────────────── */

  function classificarDesvio(dias, cfg) {
    if (dias === null || dias === undefined) return { nivel: 'INDEFINIDO', rotulo: DADO_INCOMPLETO, ordem: 1 };
    if (dias <= cfg.desvio.noPrazoAte) return { nivel: 'OK', rotulo: dias < 0 ? 'Adiantado' : 'No prazo', ordem: 0 };
    if (dias <= cfg.desvio.atencaoAte) return { nivel: 'ATENCAO', rotulo: 'Atenção', ordem: 2 };
    return { nivel: 'CRITICO', rotulo: 'Crítico', ordem: 3 };
  }

  /* Desvio de início  = Início DEV Real   - Início DEV Planejado
     Desvio de término = (Fim DEV Real ou Previsão Atual) - Fim DEV Planejado
     Desvio total      = o de término quando existir; senão o de início.

     Só calcula com os dois lados presentes. Sem planejado, ou sem real/previsão,
     o desvio é null e a situação vira DADO INCOMPLETO — jamais "no prazo". */
  function calcularDesvio(ini, cfg) {
    const desvioInicio = diasEntre(ini.planStartDev, ini.realStartDev);

    // Fim real tem precedência sobre previsão; previsão vale enquanto não terminou.
    const referenciaFim = !vazio(ini.realEndDev) ? ini.realEndDev : ini.currentForecast;
    const desvioFim = diasEntre(ini.planEndDev, referenciaFim);

    const total = desvioFim !== null ? desvioFim : desvioInicio;
    const classificacao = classificarDesvio(total, cfg);

    return {
      desvioInicio: desvioInicio,
      desvioFim: desvioFim,
      desvioTotal: total,
      referenciaFim: referenciaFim && !vazio(referenciaFim) ? referenciaFim : null,
      referenciaFimTipo: !vazio(ini.realEndDev) ? 'real' : (!vazio(ini.currentForecast) ? 'previsao' : null),
      nivel: classificacao.nivel,
      situacaoPlanejamento: classificacao.rotulo,
      ordem: classificacao.ordem
    };
  }

  function formatarDesvio(dias) {
    if (dias === null || dias === undefined) return DADO_INCOMPLETO;
    if (dias === 0) return '0 dias';
    return (dias > 0 ? '+' : '') + dias + ' dias';
  }

  /* ── Regra 5/6 · Bloqueio e status executivo ────────────────────────── */

  function estaBloqueada(ini) { return ini.blocked === 'Sim'; }
  function bloqueioIndefinido(ini) { return ini.blocked !== 'Sim' && ini.blocked !== 'Não'; }

  /* O status executivo não pode ser um rótulo genérico de fase quando existe
     um problema: o bloqueio tem prioridade e precisa explicar a causa. */
  function statusExecutivo(ini, desvio) {
    if (estaBloqueada(ini)) {
      const area = ehPlaceholder(ini.blockArea) ? null : String(ini.blockArea).trim();
      return { texto: area ? 'Bloqueado — ' + area : 'Bloqueado — área a validar', nivel: 'CRITICO' };
    }
    if (desvio && desvio.nivel === 'CRITICO') {
      return { texto: 'Desvio crítico — ' + formatarDesvio(desvio.desvioTotal), nivel: 'CRITICO' };
    }
    if (bloqueioIndefinido(ini)) {
      const base = ehPlaceholder(ini.execSituation) ? A_VALIDAR : ini.execSituation;
      return { texto: base + ' — bloqueio não informado', nivel: 'INDEFINIDO' };
    }
    if (desvio && desvio.nivel === 'ATENCAO') {
      const base = ehPlaceholder(ini.execSituation) ? A_VALIDAR : ini.execSituation;
      return { texto: base + ' — desvio de ' + formatarDesvio(desvio.desvioTotal), nivel: 'ATENCAO' };
    }
    if (ehPlaceholder(ini.execSituation)) return { texto: A_VALIDAR, nivel: 'INDEFINIDO' };
    return { texto: String(ini.execSituation), nivel: 'OK' };
  }

  /* ── Regra 9 · Capacidade da squad ──────────────────────────────────── */

  /* Campo vazio nunca é zero: QA não informado é "A validar", não "0 QA". */
  function capacidadeSquad(squad) {
    const dev = squad ? numero(squad.dev) : null;
    const qa = squad ? numero(squad.qa) : null;
    return {
      dev: dev, qa: qa,
      devTexto: dev === null ? A_VALIDAR : String(dev),
      qaTexto: qa === null ? A_VALIDAR : String(qa),
      completa: dev !== null,
      validada: !!(squad && squad.capacityValidated === true)
    };
  }

  /* ── Regra 10 · Concorrência de iniciativas ─────────────────────────── */

  /* Concorrentes = outras iniciativas da MESMA squad cujo início de DEV
     planejado cai na janela configurada em torno do início desta.
     Sem squad ou sem data planejada não há como calcular — devolve null
     (indeterminado), e não 0, para não simular tranquilidade. */
  function concorrentes(ini, todas, cfg) {
    if (ehPlaceholder(ini.squadId) && ehPlaceholder(ini.squad)) return { total: null, lista: [], motivo: 'Squad não informada' };
    const base = paraData(ini.planStartDev);
    if (!base) return { total: null, lista: [], motivo: 'Início DEV planejado não informado' };

    const de = somarDias(ini.planStartDev, -cfg.concorrencia.janelaDiasAntes);
    const ate = somarDias(ini.planStartDev, cfg.concorrencia.janelaDiasDepois);

    const lista = todas.filter(function (outra) {
      if (outra.id === ini.id) return false;
      if (!mesmaSquad(outra, ini)) return false;
      const d = paraData(outra.planStartDev);
      if (!d) return false;
      return d >= paraData(de) && d <= paraData(ate);
    });

    // Iniciativas da mesma squad sem data planejada não entram na contagem, mas
    // tornam o resultado incompleto — quem lê precisa saber que falta dado.
    const semData = todas.filter(function (o) {
      return o.id !== ini.id && mesmaSquad(o, ini) && !paraData(o.planStartDev);
    }).length;

    // A contagem INCLUI a própria iniciativa: o requisito descreve "três
    // iniciativas da mesma Squad na mesma janela" como "3 concorrentes".
    return { total: lista.length + 1, lista: lista, janelaDe: de, janelaAte: ate, semDataNaSquad: semData, motivo: null };
  }

  function mesmaSquad(a, b) {
    if (!ehPlaceholder(a.squadId) && !ehPlaceholder(b.squadId)) return a.squadId === b.squadId;
    if (ehPlaceholder(a.squad) || ehPlaceholder(b.squad)) return false;
    return String(a.squad).trim().toLowerCase() === String(b.squad).trim().toLowerCase();
  }

  /* ── Regra 11 · Risco de concentração ───────────────────────────────── */

  /* DADO INCOMPLETO tem precedência sobre BAIXO: sem squad, sem DEV, sem
     bloqueio ou sem data planejada, não existe risco baixo — existe cegueira. */
  function riscoConcentracao(ini, todas, squad, cfg) {
    const faltas = [];
    if (ehPlaceholder(ini.squadId) && ehPlaceholder(ini.squad)) faltas.push('Squad');
    if (bloqueioIndefinido(ini)) faltas.push('Bloqueio');
    if (!paraData(ini.planStartDev)) faltas.push('Início DEV planejado');

    const cap = capacidadeSquad(squad);
    if (cap.dev === null) faltas.push('DEV da squad');

    if (faltas.length) return { nivel: DADO_INCOMPLETO, ordem: 1, concorrentes: null, faltando: faltas };

    const conc = concorrentes(ini, todas, cfg);
    const n = conc.total;
    const c = cfg.concentracao;

    let nivel = 'BAIXO';
    let ordem = 0;
    if (n >= c.altoConcorrentes || (n >= c.altoConcorrentesSquadPequena && cap.dev <= c.devPequena)) {
      nivel = 'ALTO'; ordem = 3;
    } else if (n >= c.medioConcorrentes || (n >= 1 && cap.dev <= c.medioDevMinimo)) {
      // n >= 1 sempre é verdade aqui (a própria conta), então uma squad de 1 DEV
      // nunca é BAIXO — que é exatamente o que o requisito 11 descreve.
      nivel = 'MÉDIO'; ordem = 2;
    }
    return { nivel: nivel, ordem: ordem, concorrentes: n, faltando: [] };
  }

  /* ── Regra 12 · Risco se desbloquear ────────────────────────────────── */

  /* Antecipa o efeito de várias iniciativas bloqueadas da MESMA squad serem
     liberadas ao mesmo tempo. É risco de retorno simultâneo, não de bloqueio. */
  function riscoSeDesbloquear(squadRef, todas, cfg) {
    const daSquad = todas.filter(function (i) { return mesmaSquad(i, squadRef); });
    const indefinidas = daSquad.filter(bloqueioIndefinido).length;
    const bloqueadas = daSquad.filter(estaBloqueada).length;

    if (indefinidas > 0) {
      return { nivel: DADO_INCOMPLETO, ordem: 1, bloqueadas: bloqueadas, semInformacao: indefinidas };
    }
    if (bloqueadas === 0) return { nivel: 'Sem bloqueios', ordem: 0, bloqueadas: 0, semInformacao: 0 };
    if (bloqueadas <= cfg.desbloqueio.baixoAte) return { nivel: 'Baixo', ordem: 1, bloqueadas: bloqueadas, semInformacao: 0 };
    if (bloqueadas <= cfg.desbloqueio.medioAte) return { nivel: 'Médio', ordem: 2, bloqueadas: bloqueadas, semInformacao: 0 };
    return { nivel: 'Alto', ordem: 3, bloqueadas: bloqueadas, semInformacao: 0 };
  }

  /* ── Regra 13 · Horas ───────────────────────────────────────────────── */

  /* "Densidade de carga" = horas planejadas / DEV. NÃO é utilização nem
     capacidade disponível: é quanto de escopo pesa sobre cada pessoa. */
  function horas(ini, squad) {
    const planejadas = numero(ini.plannedHours);
    const consumidas = numero(ini.consumedHours);
    const cap = capacidadeSquad(squad);

    const restantes = (planejadas === null || consumidas === null) ? null : planejadas - consumidas;
    const consumo = (planejadas === null || consumidas === null || planejadas === 0) ? null : consumidas / planejadas;
    const densidade = (planejadas === null || cap.dev === null || cap.dev === 0) ? null : planejadas / cap.dev;

    return {
      planejadas: planejadas, consumidas: consumidas, restantes: restantes,
      percentualConsumo: consumo, densidadeCarga: densidade,
      planejadasTexto: planejadas === null ? A_VALIDAR : formatarHoras(planejadas),
      consumidasTexto: consumidas === null ? A_VALIDAR : formatarHoras(consumidas),
      restantesTexto: restantes === null ? DADO_INCOMPLETO : formatarHoras(restantes),
      percentualTexto: consumo === null ? DADO_INCOMPLETO : Math.round(consumo * 100) + '%',
      densidadeTexto: densidade === null ? DADO_INCOMPLETO : formatarHoras(Math.round(densidade)) + '/DEV'
    };
  }

  function formatarHoras(n) {
    if (n === null || n === undefined) return A_VALIDAR;
    return new Intl.NumberFormat('pt-BR').format(n) + 'h';
  }

  /* ── Automação adicional · Viabilidade física da janela ─────────────── */

  /* Cruza horas planejadas com a janela de DEV e o tamanho da squad. Detecta
     janela improvável ANTES de existir qualquer atraso registrado — hoje isso
     só aparece depois que o prazo estoura. Sinalizador, não compromisso. */
  function viabilidadeJanela(ini, squad, cfg) {
    const planejadas = numero(ini.plannedHours);
    const cap = capacidadeSquad(squad);
    const uteis = diasUteis(ini.planStartDev, ini.planEndDev);
    if (planejadas === null || cap.dev === null || cap.dev === 0 || !uteis) {
      return { nivel: DADO_INCOMPLETO, horasDiaPorDev: null, diasUteis: uteis || null };
    }
    const hDia = planejadas / cap.dev / uteis;
    const limite = cfg.horas.horasDiaPorDev;
    let nivel = 'VIÁVEL';
    if (hDia > limite) nivel = 'INVIÁVEL';
    else if (hDia > limite * 0.85) nivel = 'APERTADA';
    return { nivel: nivel, horasDiaPorDev: hDia, diasUteis: uteis, limite: limite };
  }

  /* ── Automação adicional · Auditoria de qualidade da fonte ──────────── */

  /* Não corrige a fonte (requisito 27: nunca alterar a fonte para o cenário
     funcionar). Aponta o que está implausível para validação humana. */
  function inconsistenciasDeDados(ini, cfg) {
    const achados = [];
    const campos = [
      ['discoveryStart', 'Início Discovery'], ['discoveryEnd', 'Fim Discovery'],
      ['planStartDev', 'Início DEV Planejado'], ['planEndDev', 'Fim DEV Planejado'],
      ['realStartDev', 'Início DEV Real'], ['realEndDev', 'Fim DEV Real'],
      ['currentForecast', 'Previsão Atual']
    ];

    campos.forEach(function (par) {
      const valor = ini[par[0]];
      if (vazio(valor) || ehADefinir(valor)) return;
      const d = paraData(valor);
      if (!d) { achados.push({ campo: par[1], tipo: 'formato', texto: par[1] + ' com valor não reconhecido como data: "' + valor + '".' }); return; }
      const ano = d.getUTCFullYear();
      if (ano < cfg.dataQualidade.anoMinimoPlausivel || ano > cfg.dataQualidade.anoMaximoPlausivel) {
        achados.push({ campo: par[1], tipo: 'ano', texto: par[1] + ' com ano fora da faixa plausível (' + ano + '). Provável erro de digitação na fonte.' });
      }
    });

    const pares = [
      ['discoveryStart', 'discoveryEnd', 'Fim Discovery anterior ao Início Discovery'],
      ['planStartDev', 'planEndDev', 'Fim DEV Planejado anterior ao Início DEV Planejado'],
      ['realStartDev', 'realEndDev', 'Fim DEV Real anterior ao Início DEV Real']
    ];
    pares.forEach(function (p) {
      const d = diasEntre(ini[p[0]], ini[p[1]]);
      if (d !== null && d < 0) achados.push({ campo: p[1], tipo: 'ordem', texto: p[2] + '.' });
    });

    // DEV planejado começando antes do Discovery terminar: pode ser proposital
    // (paralelismo), mas precisa de confirmação — não é conclusão automática.
    const antes = diasEntre(ini.planStartDev, ini.discoveryEnd);
    if (antes !== null && antes > 0) {
      achados.push({ campo: 'Início DEV Planejado', tipo: 'sobreposicao', texto: 'DEV planejado inicia ' + antes + ' dia(s) antes do fim do Discovery. Confirmar se é paralelismo intencional.' });
    }

    // Bloqueio marcado sem nada que permita agir sobre ele.
    if (estaBloqueada(ini)) {
      if (ehPlaceholder(ini.blockArea)) achados.push({ campo: 'Área responsável', tipo: 'bloqueio', texto: 'Iniciativa bloqueada sem área responsável pelo destrave.' });
      if (ehPlaceholder(ini.blockOwner)) achados.push({ campo: 'Responsável', tipo: 'bloqueio', texto: 'Iniciativa bloqueada sem responsável nomeado.' });
      if (vazio(ini.blockForecast)) achados.push({ campo: 'Previsão de resolução', tipo: 'bloqueio', texto: 'Bloqueio sem previsão de resolução.' });
    }

    const consumidas = numero(ini.consumedHours);
    const planejadas = numero(ini.plannedHours);
    if (consumidas !== null && planejadas !== null && planejadas > 0 && consumidas > planejadas) {
      achados.push({ campo: 'Horas Consumidas', tipo: 'horas', texto: 'Horas consumidas acima do planejado (' + formatarHoras(consumidas) + ' de ' + formatarHoras(planejadas) + ').' });
    }
    return achados;
  }

  /* ── Automação adicional · Confiabilidade do dado ───────────────────── */

  /* Quanto da leitura executiva está apoiada em dado real. Sem isso, "3 squads
     em risco baixo" pode significar "não sabemos nada sobre 3 squads". */
  const CAMPOS_DECISAO = [
    'squad', 'techLead', 'po', 'discoverySituation', 'discoveryStart', 'discoveryEnd',
    'execSituation', 'deliverySituation', 'planStartDev', 'planEndDev', 'currentForecast',
    'blocked', 'plannedHours', 'consumedHours'
  ];

  function confiabilidade(ini) {
    let preenchidos = 0;
    const faltando = [];
    CAMPOS_DECISAO.forEach(function (campo) {
      const v = ini[campo];
      const ok = campo === 'blocked' ? !bloqueioIndefinido(ini) : (!ehPlaceholder(v) || ehADefinir(v));
      if (ok) preenchidos++; else faltando.push(campo);
    });
    const total = CAMPOS_DECISAO.length;
    return { preenchidos: preenchidos, total: total, percentual: preenchidos / total, faltando: faltando };
  }

  /* ── Regra 7 · Escalonamento para gestão ────────────────────────────── */

  function necessitaGestao(ctx) {
    const motivos = [];
    const ini = ctx.iniciativa;

    if (estaBloqueada(ini)) {
      const area = ehPlaceholder(ini.blockArea) ? null : String(ini.blockArea).trim();
      const externa = area && ['Arquitetura', 'Infraestrutura', 'Segurança', 'Dados', 'Fornecedor', 'Negócio'].indexOf(area) !== -1;
      if (externa) motivos.push('Bloqueio externo à Squad (' + area + ')');
      else if (!area) motivos.push('Bloqueio sem área de destrave definida');
      else motivos.push('Bloqueio em ' + area);
      if (ehPlaceholder(ini.blockOwner)) motivos.push('Dependência sem responsável nomeado');
    }
    if (ctx.desvio && ctx.desvio.nivel === 'CRITICO') motivos.push('Desvio crítico de ' + formatarDesvio(ctx.desvio.desvioTotal));
    if (ctx.concentracao && ctx.concentracao.nivel === 'ALTO') motivos.push('Risco alto de concentração na Squad');
    if (ctx.desbloqueio && ctx.desbloqueio.nivel === 'Alto') motivos.push('Múltiplas iniciativas bloqueadas podendo retornar juntas');
    if (ctx.viabilidade && ctx.viabilidade.nivel === 'INVIÁVEL') motivos.push('Janela de DEV incompatível com as horas planejadas e a capacidade da Squad');
    if (motivos.length) return { valor: 'SIM', motivos: motivos };

    const avaliar = [];
    if (ctx.desvio && ctx.desvio.nivel === 'ATENCAO') avaliar.push('Desvio em faixa de atenção');
    if (ctx.concentracao && (ctx.concentracao.nivel === 'MÉDIO' || ctx.concentracao.nivel === DADO_INCOMPLETO)) {
      avaliar.push(ctx.concentracao.nivel === DADO_INCOMPLETO ? 'Risco de concentração não calculável (dado incompleto)' : 'Risco médio de concentração');
    }
    if (ctx.desbloqueio && (ctx.desbloqueio.nivel === 'Médio' || ctx.desbloqueio.nivel === DADO_INCOMPLETO)) avaliar.push('Retorno simultâneo de bloqueios a confirmar');
    if (bloqueioIndefinido(ini)) avaliar.push('Situação de bloqueio não informada');
    if (ctx.capacidade && !ctx.capacidade.validada) avaliar.push('Capacidade da Squad não validada');
    if (ctx.viabilidade && ctx.viabilidade.nivel === 'APERTADA') avaliar.push('Janela de DEV apertada para as horas planejadas');
    if (avaliar.length) return { valor: 'AVALIAR', motivos: avaliar };

    return { valor: 'NÃO', motivos: [] };
  }

  /* ── Regra 8 · Justificativa executiva ──────────────────────────────── */

  /* Montada a partir de dados estruturados, sem IA generativa. Cada frase só
     entra se o dado que a sustenta existir — nada é preenchido por suposição. */
  function justificativaExecutiva(ctx) {
    const ini = ctx.iniciativa;
    const partes = [];

    if (estaBloqueada(ini)) {
      const area = ehPlaceholder(ini.blockArea) ? 'área ainda não definida' : String(ini.blockArea).trim();
      let frase = 'Iniciativa bloqueada por ' + area;
      if (!ehPlaceholder(ini.blockReason)) frase += ' (' + String(ini.blockReason).trim() + ')';
      if (!vazio(ini.blockStart)) {
        const dias = diasEntre(ini.blockStart, ctx.hoje);
        if (dias !== null && dias >= 0) frase += ', há ' + dias + ' dia(s)';
      }
      partes.push(frase + '.');
      if (!vazio(ini.blockForecast)) partes.push('Previsão de destrave: ' + formatarBR(ini.blockForecast) + '.');
      else partes.push('Sem previsão de destrave informada.');
    }

    if (ctx.desvio && ctx.desvio.desvioTotal !== null && ctx.desvio.desvioTotal > 0) {
      let frase = 'Desvio de ' + ctx.desvio.desvioTotal + ' dia(s) sobre o fim planejado (' + formatarBR(ini.planEndDev) + ')';
      if (ctx.desvio.referenciaFim) {
        frase += ', com ' + (ctx.desvio.referenciaFimTipo === 'real' ? 'término real' : 'previsão atual') + ' em ' + formatarBR(ctx.desvio.referenciaFim);
      }
      partes.push(frase + '.');
    } else if (ctx.desvio && ctx.desvio.desvioTotal === null &&
               (!vazio(ini.planEndDev) || !vazio(ini.planStartDev) || !vazio(ini.currentForecast))) {
      // Só vale apontar o desvio ausente quando existe planejamento parcial.
      // Sem nenhuma data, o que falta não é o desvio — é o plano inteiro, e
      // isso é dito pela frase de leitura parcial no fecho da função.
      partes.push('Desvio não calculável: falta ' + (vazio(ini.planEndDev) ? 'fim planejado' : 'previsão atual ou término real') + '.');
    }

    if (ctx.concentracao && ctx.concentracao.nivel !== DADO_INCOMPLETO && ctx.concentracao.concorrentes > 1) {
      const cap = ctx.capacidade;
      let frase = 'Squad ' + texto(ini.squad) + ' com ' + ctx.concentracao.concorrentes + ' iniciativas concorrentes na mesma janela';
      if (cap && cap.dev !== null) frase += ', ' + cap.dev + ' DEV e ' + (cap.qa === null ? 'QA a validar' : cap.qa + ' QA');
      partes.push(frase + '. Risco de concentração ' + ctx.concentracao.nivel.toLowerCase() + '.');
    }

    if (ctx.desbloqueio && ['Médio', 'Alto'].indexOf(ctx.desbloqueio.nivel) !== -1) {
      partes.push('A Squad tem ' + ctx.desbloqueio.bloqueadas + ' iniciativa(s) bloqueada(s); liberação simultânea representa risco ' + ctx.desbloqueio.nivel.toLowerCase() + '.');
    }

    if (ctx.viabilidade && ctx.viabilidade.nivel === 'INVIÁVEL') {
      partes.push('A janela planejada exige ' + ctx.viabilidade.horasDiaPorDev.toFixed(1) + 'h/dia por DEV, acima do parâmetro de ' + ctx.viabilidade.limite + 'h.');
    }

    if (ctx.marco && ctx.marco.data) {
      partes.push('Próximo marco: ' + ctx.marco.label + ' em ' + formatarBR(ctx.marco.data) + '.');
    }

    if (!partes.length) {
      const conf = ctx.confiabilidade;
      if (conf && conf.percentual < 1) {
        partes.push('Sem alerta calculado, porém ' + conf.faltando.length + ' campo(s) de decisão ainda não informado(s) — leitura parcial.');
      } else {
        partes.push('Sem desvio, bloqueio ou risco de concentração registrado no momento.');
      }
    }
    return partes.join(' ');
  }

  /* ── Regra 16 · Ação recomendada ────────────────────────────────────── */

  function acaoRecomendada(ctx) {
    const ini = ctx.iniciativa;
    if (estaBloqueada(ini)) {
      if (ehPlaceholder(ini.blockOwner)) return 'Nomear responsável pelo destrave e definir prazo com ' + (ehPlaceholder(ini.blockArea) ? 'a área envolvida' : String(ini.blockArea).trim()) + '.';
      if (vazio(ini.blockForecast)) return 'Obter previsão de resolução com ' + texto(ini.blockOwner) + ' (' + texto(ini.blockArea) + ').';
      return 'Acompanhar destrave com ' + texto(ini.blockOwner) + ' até ' + formatarBR(ini.blockForecast) + '.';
    }
    if (ctx.desvio && ctx.desvio.nivel === 'CRITICO') return 'Repactuar data e validar plano de recuperação com a Squad e o PO.';
    if (ctx.viabilidade && ctx.viabilidade.nivel === 'INVIÁVEL') return 'Rever escopo, janela ou capacidade: o plano atual não cabe na janela.';
    if (ctx.concentracao && ctx.concentracao.nivel === 'ALTO') return 'Escalonar entradas da Squad antes de iniciar nova iniciativa na janela.';
    if (ctx.desbloqueio && ctx.desbloqueio.nivel === 'Alto') return 'Sequenciar o retorno das iniciativas bloqueadas em vez de liberar todas juntas.';
    if (ctx.concentracao && ctx.concentracao.nivel === DADO_INCOMPLETO) return 'Completar ' + ctx.concentracao.faltando.join(', ') + ' para permitir a leitura de risco.';
    if (ctx.desvio && ctx.desvio.nivel === 'ATENCAO') return 'Confirmar previsão atual com a Squad antes que o desvio entre em faixa crítica.';
    if (ctx.capacidade && !ctx.capacidade.validada) return 'Validar capacidade (DEV/QA) da Squad para liberar o cálculo de risco.';
    if (ctx.confiabilidade && ctx.confiabilidade.percentual < 1) return 'Atualizar os campos pendentes na Gestão 2026.';
    return 'Manter acompanhamento no ritmo atual.';
  }

  /* ── Regra 18 · Próximo marco ───────────────────────────────────────── */

  /* Deriva o próximo marco quando não há um informado manualmente: usa a
     primeira data futura relevante já existente no planejamento. */
  function proximoMarco(ini, hoje) {
    if (!ehPlaceholder(ini.nextMilestoneLabel) && !vazio(ini.nextMilestoneDate)) {
      return { label: String(ini.nextMilestoneLabel).trim(), data: ini.nextMilestoneDate, derivado: false };
    }
    const candidatos = [
      { label: 'Fim do Discovery', data: ini.discoveryEnd },
      { label: 'Destrave previsto', data: ini.blockForecast },
      { label: 'Início DEV planejado', data: ini.planStartDev },
      { label: 'Fim DEV planejado', data: ini.planEndDev },
      { label: 'Previsão atual', data: ini.currentForecast }
    ].filter(function (c) {
      const d = paraData(c.data);
      return d && c.data >= hoje;
    }).sort(function (a, b) { return a.data < b.data ? -1 : 1; });

    if (!candidatos.length) {
      if (!ehPlaceholder(ini.nextMilestoneLabel)) return { label: String(ini.nextMilestoneLabel).trim(), data: null, derivado: false };
      return { label: A_VALIDAR, data: null, derivado: false };
    }
    return { label: candidatos[0].label, data: candidatos[0].data, derivado: true };
  }

  /* ── Avaliação completa ─────────────────────────────────────────────── */

  /* Ponto único de entrada usado pelas telas: um objeto por iniciativa com tudo
     já calculado. As views só formatam — nenhuma regra vive em componente. */
  function avaliar(ini, todas, squads, cfg, hoje) {
    const dia = hoje || hojeISO();
    const squad = acharSquad(ini, squads);
    const desvio = calcularDesvio(ini, cfg);
    const capacidade = capacidadeSquad(squad);
    const conc = concorrentes(ini, todas, cfg);
    const concentracao = riscoConcentracao(ini, todas, squad, cfg);
    const desbloqueio = riscoSeDesbloquear(ini, todas, cfg);
    const hrs = horas(ini, squad);
    const viabilidade = viabilidadeJanela(ini, squad, cfg);
    const marco = proximoMarco(ini, dia);
    const conf = confiabilidade(ini);
    const inconsistencias = inconsistenciasDeDados(ini, cfg);

    const ctx = {
      iniciativa: ini, squad: squad, hoje: dia, desvio: desvio, capacidade: capacidade,
      concorrencia: conc, concentracao: concentracao, desbloqueio: desbloqueio,
      horas: hrs, viabilidade: viabilidade, marco: marco, confiabilidade: conf
    };

    const status = statusExecutivo(ini, desvio);
    const gestao = necessitaGestao(ctx);

    return Object.assign(ctx, {
      statusExecutivo: status,
      necessitaGestao: gestao,
      justificativa: justificativaExecutiva(ctx),
      acaoRecomendada: acaoRecomendada(ctx),
      inconsistencias: inconsistencias,
      criticidade: pontuarCriticidade(status, desvio, gestao, concentracao, desbloqueio)
    });
  }

  function acharSquad(ini, squads) {
    if (!Array.isArray(squads)) return null;
    return squads.find(function (s) {
      if (!s) return false;
      if (!ehPlaceholder(ini.squadId) && s.id === ini.squadId) return true;
      return !ehPlaceholder(ini.squad) && !ehPlaceholder(s.name) &&
        String(s.name).trim().toLowerCase() === String(ini.squad).trim().toLowerCase();
    }) || null;
  }

  /* Nome de exibição da squad de uma iniciativa. Resolve pelo cadastro de
     squads (via squadId) antes de recorrer ao texto bruto: a fonte usa "ASD"
     tanto como código real da squad "Ainda Sem Definição" quanto, em outros
     campos, como marcador de ausência — texto() sozinho trataria os dois
     casos como iguais e faria a iniciativa sumir de filtros e listagens por
     squad mesmo com o vínculo (squadId) correto. */
  function squadDisplay(ini, squads) {
    const s = acharSquad(ini, squads);
    if (s && !ehPlaceholder(s.name)) return String(s.name).trim();
    return texto(ini.squad);
  }

  /* Ordenação executiva: bloqueio e desvio crítico primeiro; dado incompleto
     acima de "tudo certo", porque não saber também é pauta de gestão. */
  function pontuarCriticidade(status, desvio, gestao, concentracao, desbloqueio) {
    let p = 0;
    if (status.nivel === 'CRITICO') p += 100;
    if (gestao.valor === 'SIM') p += 60;
    if (desvio.nivel === 'CRITICO') p += 40;
    else if (desvio.nivel === 'ATENCAO') p += 15;
    if (concentracao.nivel === 'ALTO') p += 25;
    else if (concentracao.nivel === 'MÉDIO') p += 10;
    if (desbloqueio.nivel === 'Alto') p += 20;
    if (gestao.valor === 'AVALIAR') p += 8;
    if (status.nivel === 'INDEFINIDO' || concentracao.nivel === DADO_INCOMPLETO) p += 5;
    return p;
  }

  /* ── Visão por squad (requisito 17) ─────────────────────────────────── */

  function avaliarSquad(squad, todas, cfg, hoje) {
    const daSquad = todas.filter(function (i) { return mesmaSquad(i, { squadId: squad.id, squad: squad.name }); });
    const cap = capacidadeSquad(squad);
    const emDev = daSquad.filter(function (i) {
      return typeof i.execSituation === 'string' && i.execSituation.indexOf('Desenvolvimento') === 0;
    }).length;
    const bloqueadas = daSquad.filter(estaBloqueada).length;
    const dia = hoje || hojeISO();
    const limite = somarDias(dia, cfg.marcos.janelaDias);
    const entradas = daSquad.filter(function (i) {
      const d = paraData(i.planStartDev);
      return d && i.planStartDev >= dia && i.planStartDev <= limite;
    }).length;

    // Pior risco de concentração entre as iniciativas da squad.
    let pior = { nivel: 'BAIXO', ordem: 0 };
    daSquad.forEach(function (i) {
      const r = riscoConcentracao(i, todas, squad, cfg);
      if (r.ordem > pior.ordem) pior = r;
      if (r.nivel === DADO_INCOMPLETO && pior.ordem <= 1) pior = r;
    });
    if (!daSquad.length) pior = { nivel: DADO_INCOMPLETO, ordem: 1, faltando: ['Iniciativas'] };

    const desbloqueio = riscoSeDesbloquear({ squadId: squad.id, squad: squad.name }, todas, cfg);

    let acao;
    if (!cap.completa) acao = 'Informar DEV e QA da Squad para liberar o cálculo de risco.';
    else if (!cap.validada) acao = 'Validar a capacidade cadastrada antes de usar o risco em decisão.';
    else if (pior.nivel === 'ALTO') acao = 'Escalonar entradas: revisar a janela antes de admitir nova iniciativa.';
    else if (desbloqueio.nivel === 'Alto') acao = 'Sequenciar o retorno das bloqueadas para evitar pico simultâneo.';
    else if (pior.nivel === 'MÉDIO') acao = 'Acompanhar concentração antes da entrada de nova iniciativa.';
    else if (pior.nivel === DADO_INCOMPLETO) acao = 'Completar dados de planejamento e bloqueio das iniciativas.';
    else acao = 'Manter acompanhamento no ritmo atual.';

    return {
      squad: squad, capacidade: cap, iniciativas: daSquad.length, emDesenvolvimento: emDev,
      bloqueadas: bloqueadas, entradasProximas: entradas,
      riscoConcentracao: pior, riscoSeDesbloquear: desbloqueio, acaoRecomendada: acao
    };
  }

  /* ── Simulação "e se destravar tudo hoje" ───────────────────────────── */

  /* Antecipa o cenário do requisito 12 de forma concreta: assume que TODAS as
     bloqueadas da squad iniciam DEV hoje e recalcula a concorrência resultante. */
  function simularDesbloqueioGeral(squad, todas, cfg, hoje) {
    const dia = hoje || hojeISO();
    const ref = { squadId: squad.id, squad: squad.name };
    const daSquad = todas.filter(function (i) { return mesmaSquad(i, ref); });
    const bloqueadas = daSquad.filter(estaBloqueada);
    if (!bloqueadas.length) {
      return { aplicavel: false, bloqueadas: 0, concorrentesDepois: null, nivel: 'Sem bloqueios' };
    }
    const projetadas = todas.map(function (i) {
      if (estaBloqueada(i) && mesmaSquad(i, ref)) return Object.assign({}, i, { planStartDev: dia });
      return i;
    });
    const amostra = Object.assign({}, bloqueadas[0], { planStartDev: dia });
    const conc = concorrentes(amostra, projetadas, cfg);
    const risco = riscoConcentracao(amostra, projetadas, squad, cfg);
    return {
      aplicavel: true, bloqueadas: bloqueadas.length,
      concorrentesDepois: conc.total, nivel: risco.nivel,
      capacidade: capacidadeSquad(squad)
    };
  }

  return {
    A_VALIDAR: A_VALIDAR, NAO_INFORMADO: NAO_INFORMADO, DADO_INCOMPLETO: DADO_INCOMPLETO, A_DEFINIR: A_DEFINIR,
    SITUACAO_DISCOVERY: SITUACAO_DISCOVERY, SITUACAO_EXECUCAO: SITUACAO_EXECUCAO,
    SITUACAO_ENTREGA: SITUACAO_ENTREGA, AREAS_DESTRAVE: AREAS_DESTRAVE, BLOQUEIO: BLOQUEIO,
    vazio: vazio, ehADefinir: ehADefinir, ehPlaceholder: ehPlaceholder, texto: texto, numero: numero,
    paraData: paraData, formatarBR: formatarBR, diasEntre: diasEntre, somarDias: somarDias,
    diasUteis: diasUteis, hojeISO: hojeISO, formatarHoras: formatarHoras, formatarDesvio: formatarDesvio,
    classificarDesvio: classificarDesvio, calcularDesvio: calcularDesvio,
    estaBloqueada: estaBloqueada, bloqueioIndefinido: bloqueioIndefinido, statusExecutivo: statusExecutivo,
    capacidadeSquad: capacidadeSquad, mesmaSquad: mesmaSquad, concorrentes: concorrentes,
    riscoConcentracao: riscoConcentracao, riscoSeDesbloquear: riscoSeDesbloquear,
    horas: horas, viabilidadeJanela: viabilidadeJanela, inconsistenciasDeDados: inconsistenciasDeDados,
    confiabilidade: confiabilidade, necessitaGestao: necessitaGestao,
    justificativaExecutiva: justificativaExecutiva, acaoRecomendada: acaoRecomendada,
    proximoMarco: proximoMarco, avaliar: avaliar, acharSquad: acharSquad, squadDisplay: squadDisplay,
    avaliarSquad: avaliarSquad, simularDesbloqueioGeral: simularDesbloqueioGeral
  };
});
