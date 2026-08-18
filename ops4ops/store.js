/* Ops4Ops — Gestão Estratégica · Persistência.
   Toda leitura/gravação passa por um adaptador. Hoje só existe o de
   localStorage; trocar por API/backend é implementar o mesmo contrato
   (carregar/salvar) e registrar em Ops4OpsStore.usarAdaptador — nenhuma view
   nem regra conhece localStorage (requisito 22). */
(function (raiz) {
  'use strict';
  const R = raiz.Ops4OpsRules;
  const CFG = raiz.Ops4OpsConfig;

  const CHAVE = 'ops4ops_gestao_estrategica_v1';
  const VERSAO_MODELO = 1;

  /* ── Contrato do adaptador ───────────────────────────────────────────
     carregar() → Promise<estado|null>
     salvar(estado) → Promise<void>
     nome → string exibida no rodapé, para nunca haver dúvida sobre a origem  */

  const adaptadorLocal = {
    nome: 'Navegador (localStorage)',
    carregar: function () {
      try {
        const bruto = raiz.localStorage.getItem(CHAVE);
        return Promise.resolve(bruto ? JSON.parse(bruto) : null);
      } catch (e) { return Promise.resolve(null); }
    },
    salvar: function (estado) {
      try { raiz.localStorage.setItem(CHAVE, JSON.stringify(estado)); return Promise.resolve(); }
      catch (e) { return Promise.reject(e); }
    }
  };

  let adaptador = adaptadorLocal;

  /* ── Modelo ──────────────────────────────────────────────────────────
     null = ausente. Nunca 0, nunca string vazia disfarçada de valor. */

  function iniciativaVazia() {
    return {
      id: null, initiativeNumber: null, name: null,
      squadId: null, squad: null, po: null, techLead: null,
      discoverySituation: 'A validar', discoveryStart: null, discoveryEnd: null,
      execSituation: 'A validar', deliverySituation: 'A atualizar',
      nextMilestoneLabel: null, nextMilestoneDate: null,
      planStartDev: null, planEndDev: null, realStartDev: null, realEndDev: null, currentForecast: null,
      blocked: 'Não informado', blockReason: null, blockArea: null, blockOwner: null,
      blockStart: null, blockForecast: null,
      plannedHours: null, consumedHours: null,
      jiraEpicId: null, jiraStoriesTotal: null, jiraStoriesRefined: null,
      jiraStoriesInDev: null, jiraStoriesDone: null, jiraUrl: null,
      notes: null, origem: 'manual', atualizadoEm: null
    };
  }

  function squadVazia() {
    return { id: null, name: null, techLead: null, dev: null, qa: null, note: null, capacityValidated: false, atualizadoEm: null };
  }

  function limpar(v) {
    if (v === null || v === undefined) return null;
    const t = String(v).trim();
    return t === '' ? null : t;
  }

  function limparNumero(v) {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function normalizarIniciativa(bruta) {
    const base = iniciativaVazia();
    const saida = Object.assign({}, base);
    Object.keys(base).forEach(function (k) {
      if (!(k in bruta)) return;
      const v = bruta[k];
      if (['plannedHours', 'consumedHours', 'jiraStoriesTotal', 'jiraStoriesRefined', 'jiraStoriesInDev', 'jiraStoriesDone'].indexOf(k) !== -1) {
        saida[k] = limparNumero(v);
      } else if (k === 'capacityValidated') {
        saida[k] = v === true;
      } else {
        saida[k] = limpar(v);
      }
    });
    if (!saida.id) saida.id = 'ini-' + Math.random().toString(36).slice(2, 10);
    // Enums fora da lista viram "A validar" em vez de valor inventado.
    if (R.SITUACAO_DISCOVERY.indexOf(saida.discoverySituation) === -1) saida.discoverySituation = 'A validar';
    if (R.SITUACAO_EXECUCAO.indexOf(saida.execSituation) === -1) saida.execSituation = 'A validar';
    if (R.SITUACAO_ENTREGA.indexOf(saida.deliverySituation) === -1) saida.deliverySituation = 'A atualizar';
    if (R.BLOQUEIO.indexOf(saida.blocked) === -1) saida.blocked = 'Não informado';
    if (saida.blockArea && R.AREAS_DESTRAVE.indexOf(saida.blockArea) === -1) saida.blockArea = 'Outra';
    return saida;
  }

  function normalizarSquad(bruta) {
    const saida = Object.assign(squadVazia(), {
      id: limpar(bruta.id) || ('sq-' + Math.random().toString(36).slice(2, 8)),
      name: limpar(bruta.name),
      techLead: limpar(bruta.techLead),
      dev: limparNumero(bruta.dev),
      qa: limparNumero(bruta.qa),
      note: limpar(bruta.note),
      capacityValidated: bruta.capacityValidated === true,
      atualizadoEm: limpar(bruta.atualizadoEm)
    });
    return saida;
  }

  /* ── Semeadura a partir da base real do Discovery ────────────────────
     A base de planejamento 2026 do Discovery PMO traz identificação, squad,
     tech lead, datas de Discovery e a janela de DEV planejada. Tudo o que ela
     NÃO traz (real, previsão, bloqueio, DEV/QA, horas consumidas) entra como
     ausente — de propósito. Preencher isso é o trabalho da aba Gestão 2026. */
  function semearDoDiscovery(bruto) {
    const squads = (bruto.squads || []).map(function (s) {
      return normalizarSquad({
        id: s.id, name: s.name,
        techLead: s.defaultLeader,   // liderança conhecida da base
        dev: null, qa: null,         // capacidade NÃO existe na fonte → A validar
        note: s.business || null,
        capacityValidated: false
      });
    });

    const iniciativas = (bruto.projects || []).map(function (p) {
      // A fonte tem uma única "discoveryDate". Ela é o início; o fim não existe
      // na base e por isso permanece ausente — não é inferido a partir do DEV.
      const situacaoDiscovery = p.status === 'Em Discovery' ? 'Em andamento'
        : p.status === 'A iniciar' ? 'Não iniciado' : 'A validar';

      return normalizarIniciativa({
        id: p.id,
        initiativeNumber: p.initiativeNumber,
        name: p.name,
        squadId: p.squadId, squad: p.squad,
        po: p.po, techLead: p.techLead,
        discoverySituation: situacaoDiscovery,
        discoveryStart: p.discoveryDate,
        discoveryEnd: null,
        execSituation: 'A validar',
        deliverySituation: 'A atualizar',
        planStartDev: p.startDev, planEndDev: p.endDev,
        realStartDev: null, realEndDev: null, currentForecast: null,
        blocked: 'Não informado',
        plannedHours: p.hours2026,
        consumedHours: null,
        notes: p.theme || null,
        origem: 'discovery-2026'
      });
    });

    return { squads: squads, iniciativas: iniciativas };
  }

  /* ── Estado ──────────────────────────────────────────────────────────── */

  function estadoVazio() {
    return { versao: VERSAO_MODELO, iniciativas: [], squads: [], config: CFG.padrao(), fonte: null, atualizadoEm: null };
  }

  function normalizarEstado(bruto) {
    const e = estadoVazio();
    if (!bruto || typeof bruto !== 'object') return e;
    e.iniciativas = Array.isArray(bruto.iniciativas) ? bruto.iniciativas.map(normalizarIniciativa) : [];
    e.squads = Array.isArray(bruto.squads) ? bruto.squads.map(normalizarSquad) : [];
    e.config = CFG.mesclar(CFG.PADRAO, bruto.config);
    e.fonte = limpar(bruto.fonte);
    e.atualizadoEm = limpar(bruto.atualizadoEm);
    return e;
  }

  /* Carrega o que o usuário salvou; na primeira abertura, semeia a partir do
     arquivo de base extraído do Discovery. Se o arquivo não estiver acessível
     (ex.: aberto via file:// com fetch bloqueado), a aplicação inicia vazia e
     diz isso — nunca inventa iniciativas para "ter o que mostrar". */
  function carregar() {
    return adaptador.carregar().then(function (salvo) {
      if (salvo && Array.isArray(salvo.iniciativas) && salvo.iniciativas.length) {
        return normalizarEstado(salvo);
      }
      // Versão em arquivo único: a base vem embutida na própria página, então
      // não há fetch (e o protótipo abre por file:// com duplo clique).
      if (raiz.OPS4OPS_SEED) {
        const semeado = semearDoDiscovery(raiz.OPS4OPS_SEED);
        const e = estadoVazio();
        e.iniciativas = semeado.iniciativas;
        e.squads = semeado.squads;
        e.fonte = raiz.OPS4OPS_SEED.fonte || 'Base de planejamento 2026 do Discovery PMO';
        e.atualizadoEm = new Date().toISOString();
        return Promise.resolve(e);
      }
      return fetch('seed-discovery.json', { cache: 'no-store' })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (bruto) {
          const semeado = semearDoDiscovery(bruto);
          const e = estadoVazio();
          e.iniciativas = semeado.iniciativas;
          e.squads = semeado.squads;
          e.fonte = bruto.fonte || 'Base de planejamento 2026 do Discovery PMO';
          e.atualizadoEm = new Date().toISOString();
          return e;
        })
        .catch(function () {
          const e = estadoVazio();
          e.fonte = null;
          return e;
        });
    });
  }

  function salvar(estado) {
    estado.atualizadoEm = new Date().toISOString();
    return adaptador.salvar(estado);
  }

  raiz.Ops4OpsStore = {
    CHAVE: CHAVE,
    iniciativaVazia: iniciativaVazia,
    squadVazia: squadVazia,
    normalizarIniciativa: normalizarIniciativa,
    normalizarSquad: normalizarSquad,
    normalizarEstado: normalizarEstado,
    semearDoDiscovery: semearDoDiscovery,
    estadoVazio: estadoVazio,
    carregar: carregar,
    salvar: salvar,
    adaptadorAtual: function () { return adaptador; },
    usarAdaptador: function (novo) { adaptador = novo || adaptadorLocal; },
    limparTudo: function () { try { raiz.localStorage.removeItem(CHAVE); } catch (e) {} }
  };
})(typeof self !== 'undefined' ? self : this);
