/* ============================================================================
   Discovery PMO V2 — Visão Executiva
   ----------------------------------------------------------------------------
   Cockpit executivo de portfólio, construído por cima da MESMA fonte de dados
   do Discovery PMO Tracker (V1, ../discovery-pmo/index.html): mesmo backend
   Apps Script, mesma chave (`discoveryPmo`), mesmo modelo de dados. Nenhum
   dado é inventado aqui — campos que não existem no modelo de dados do V1
   (ex.: severidade/impacto em riscos, "decisão pendente" estruturada) são
   mostrados como "Não informado" em vez de supostos.

   ESCOPO DESTA VERSÃO: somente leitura. Não grava nada de volta na base
   compartilhada — evita qualquer risco de um bug de escrita corromper dado
   real de produção nesta primeira entrega. Edição continua acontecendo no
   Tracker operacional (V1); cada iniciativa tem um link direto para lá.
   ============================================================================ */

(function () {
  'use strict';

  // ── Config / constantes compartilhadas com o V1 ──────────────────────────
  const DISC_GAS_URL = 'https://script.google.com/macros/s/AKfycbxOSQe41hqngh7b0iscE_Bcb_Z2mBfbwfqaaMCU_cKXDfCKnDvsQ6jb2HTPbnLso30C/exec';
  const DISC_GAS_KEY = 'discoveryPmo';
  const V1_URL = '../discovery-pmo/index.html';

  // Cache local: só para acelerar o primeiro paint / resistir a uma falha de
  // rede pontual. Nunca é a fonte de verdade e nunca é gravado de volta no
  // backend — ver "Escopo desta versão" acima.
  const CACHE_KEY = 'discovery_pmo_v2_cache_v1';

  const SCHEDULE_BASE_TEMPLATE = [
    { baseKey: 'kickoff', item: 'Kickoff' },
    { baseKey: 'discovery', item: 'Discovery' },
    { baseKey: 'desenho', item: 'Desenho de solução' },
    { baseKey: 'historias', item: 'Escrita das histórias' },
    { baseKey: 'jira', item: 'Qtd de Histórias no Jira', jira: true },
    { baseKey: 'refino', item: 'Refinamento Técnico' }
  ];
  const SCHEDULE_PHASE_LABELS = {
    kickoff: 'Em kickoff', discovery: 'Em discovery', desenho: 'Em desenho de solução',
    historias: 'Em escrita das histórias', refino: 'Em refinamento técnico'
  };
  const SCHEDULE_PHASE_ORDER = ['kickoff', 'discovery', 'desenho', 'historias', 'refino'];

  const TIMELINE_STAGES = [
    { id: 'entendimento', title: 'Entendimento do Problema' },
    { id: 'analise', title: 'Levantamento e Análise' },
    { id: 'desenho', title: 'Desenho da Solução' },
    { id: 'validacao', title: 'Validação e Prontidão' }
  ];
  const TIMELINE_ITEM_TEMPLATE = [
    { id: 'ti-objetivo', stageId: 'entendimento', label: 'Objetivo do discovery' },
    { id: 'ti-dor', stageId: 'entendimento', label: 'Dor do usuário e do negócio' },
    { id: 'ti-escopo', stageId: 'entendimento', label: 'Escopo inicial' },
    { id: 'ti-stakeholders', stageId: 'entendimento', label: 'Stakeholders envolvidos' },
    { id: 'ti-asis', stageId: 'analise', label: 'Mapeamento AS IS' },
    { id: 'ti-dados', stageId: 'analise', label: 'Dados e evidências' },
    { id: 'ti-riscosdeps', stageId: 'analise', label: 'Riscos e dependências' },
    { id: 'ti-requisitos', stageId: 'analise', label: 'Requisitos iniciais' },
    { id: 'ti-solucao', stageId: 'desenho', label: 'Solução proposta' },
    { id: 'ti-hipoteses', stageId: 'desenho', label: 'Hipóteses e alternativas' },
    { id: 'ti-priorizacao', stageId: 'desenho', label: 'Priorização' },
    { id: 'ti-criterios', stageId: 'desenho', label: 'Critérios de sucesso' },
    { id: 'ti-viabilidade', stageId: 'validacao', label: 'Viabilidade técnica' },
    { id: 'ti-validacaonegocio', stageId: 'validacao', label: 'Validação com negócio' },
    { id: 'ti-proximos', stageId: 'validacao', label: 'Próximos passos' },
    { id: 'ti-ready', stageId: 'validacao', label: 'Ready para épico e histórias' }
  ];
  const TIMELINE_STATUS_LABEL = {
    notstarted: 'Não iniciada', progress: 'Em andamento', blocked: 'Bloqueada',
    'waiting-arch': 'Aguardando desenho de arquitetura', 'waiting-business': 'Aguardando validação de negócio',
    done: 'Concluída'
  };

  const LANES = [
    { id: 'backlog', title: 'A fazer' },
    { id: 'doing', title: 'Em andamento' },
    { id: 'validation', title: 'Aguardando validação' },
    { id: 'done', title: 'Concluída' }
  ];

  const RAID_GROUP_LABEL = { risks: 'Risco', assumptions: 'Premissa', issues: 'Impedimento', dependencies: 'Dependência' };

  const ATTENTION_DUE_SOON_DAYS = 4;
  const ESCALATION_LATE_DAYS = 5; // sugestão automática de escalonamento em impedimentos muito atrasados

  const NAO_INFORMADO = 'Não informado';

  // ── Helpers genéricos ─────────────────────────────────────────────────────
  function fmtDate(date) {
    const d = new Date(date);
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function parseISODate(value) {
    if (!value) return null;
    const d = new Date(String(value).slice(0, 10) + 'T00:00:00');
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const TODAY_ISO = fmtDate(new Date());
  const TODAY = parseISODate(TODAY_ISO);

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escapeAttr(str) { return escapeHtml(str).replace(/'/g, '&#39;'); }

  function formatBR(date) {
    if (!date) return NAO_INFORMADO;
    const value = String(date);
    if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
    const [y, m, d] = value.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  function formatBRDateTime(isoDate) {
    const parsed = isoDate ? new Date(isoDate) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) return NAO_INFORMADO;
    const tz = 'America/Fortaleza';
    return `${parsed.toLocaleDateString('pt-BR', { timeZone: tz })} às ${parsed.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: tz })}`;
  }
  function orNI(value) {
    const v = String(value == null ? '' : value).trim();
    return v ? v : NAO_INFORMADO;
  }
  function daysBetween(a, b) { return Math.round((a - b) / (1000 * 60 * 60 * 24)); }

  function debounce(fn, ms) {
    let t = null;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ============================================================================
  // CAMADA DE DADOS — leitura do mesmo backend Apps Script usado pelo V1.
  // Duas camadas de resiliência (ver CLAUDE.md "Padrão de resiliência"):
  //   1) retry de transporte dentro do próprio cliente JSONP (1 retry, 2s)
  //   2) retry de conteúdo no consumidor da resposta (ok:false / vazio → 1 retry, 2s)
  // Padrão de polling: ping de revisão (getRevisions, só números) antes de
  // buscar a base completa — nunca um relógio fixo buscando tudo de novo.
  // ============================================================================

  function gasJsonp(url, cb, _retriesLeft) {
    const retriesLeft = (_retriesLeft === undefined) ? 1 : _retriesLeft;
    const name = '_discV2GP_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const script = document.createElement('script');
    let done = false;
    const timer = setTimeout(() => {
      if (done) return; done = true;
      delete window[name]; if (script.parentNode) script.parentNode.removeChild(script);
      if (retriesLeft > 0) { setTimeout(() => gasJsonp(url, cb, retriesLeft - 1), 2000); return; }
      cb('timeout');
    }, 28000);
    window[name] = (payload) => {
      if (done) return; done = true; clearTimeout(timer);
      delete window[name]; if (script.parentNode) script.parentNode.removeChild(script);
      cb(null, payload);
    };
    script.onerror = () => {
      if (done) return; done = true; clearTimeout(timer);
      delete window[name]; if (script.parentNode) script.parentNode.removeChild(script);
      if (retriesLeft > 0) { setTimeout(() => gasJsonp(url, cb, retriesLeft - 1), 2000); return; }
      cb('script error');
    };
    script.src = url + '&callback=' + name;
    document.head.appendChild(script);
  }

  function gasLoadDiscoveryData(cb, _contentRetriesLeft) {
    const contentRetriesLeft = (_contentRetriesLeft === undefined) ? 1 : _contentRetriesLeft;
    gasJsonp(DISC_GAS_URL + '?action=getVpData&key=' + DISC_GAS_KEY + '&t=' + Date.now(), (err, json) => {
      if (err) { if (cb) cb(err); return; }
      if (!json || !json.ok || !json.data) {
        if (contentRetriesLeft > 0) { setTimeout(() => gasLoadDiscoveryData(cb, contentRetriesLeft - 1), 2000); return; }
        if (cb) cb('resposta vazia'); return;
      }
      if (typeof json.revision === 'number') state.lastKnownRevision = json.revision;
      if (cb) cb(null, json.data);
    });
  }

  function gasCheckRevision(cb) {
    gasJsonp(DISC_GAS_URL + '?action=getRevisions&t=' + Date.now(), (err, json) => {
      if (err || !json || !json.ok || !json.revisions) { if (cb) cb(err || 'sem dados', false); return; }
      const rev = json.revisions[DISC_GAS_KEY];
      if (state.lastKnownRevision !== null && rev === state.lastKnownRevision) { if (cb) cb(null, false); return; }
      cb(null, true);
    });
  }

  // ============================================================================
  // NORMALIZAÇÃO DEFENSIVA (não migra nada, não muta o payload compartilhado)
  // O V1 roda migrações one-shot (renomeação de squads legadas, dedupe de
  // cronograma duplicado, etc.) e regrava a base normalizada no backend a cada
  // sessão salva — quando a V2 lê, a base já chegou normalizada por quem usou
  // o V1 por último. Aqui só garantimos defaults seguros para renderizar sem
  // quebrar, sem repetir a lógica de migração do V1 (ver notas de entrega).
  // ============================================================================

  function safeProject(p) {
    p = p || {};
    return {
      ...p,
      id: p.id || '',
      name: p.name || 'Projeto sem nome',
      initiativeNumber: String(p.initiativeNumber || p.initiative || p.numeroIniciativa || p.initiativeId || '').trim(),
      squad: p.squad || '',
      squadId: p.squadId || '',
      status: p.status || 'A iniciar',
      criticality: p.criticality || '',
      readinessStage: p.readinessStage || '',
      rteOwner: p.rteOwner || p.rte || p.owner || '',
      owner: p.owner || '',
      summary: p.summary || '',
      confluenceUrl: p.confluenceUrl || '',
      checklist: Array.isArray(p.checklist) ? p.checklist : [],
      cards: Array.isArray(p.cards) ? p.cards : [],
      schedule: Array.isArray(p.schedule) ? p.schedule.map(s => ({
        ...s, done: s.done === true || s.completed === true, observations: s.observations ?? s.notes ?? ''
      })) : [],
      raids: normalizeRaids(p.raids),
      attachments: Array.isArray(p.attachments) ? p.attachments : [],
      jiraStories: Array.isArray(p.jiraStories) ? p.jiraStories : [],
      timelineItems: Array.isArray(p.timelineItems) ? p.timelineItems : [],
      updatedAt: p.updatedAt || ''
    };
  }

  function normalizeRaids(raids) {
    const source = raids || {};
    const groups = ['risks', 'assumptions', 'issues', 'dependencies'];
    return groups.reduce((acc, g) => {
      acc[g] = (source[g] || []).map((item) => normalizeRaidItem(item, g));
      return acc;
    }, { risks: [], assumptions: [], issues: [], dependencies: [] });
  }
  function normalizeRaidItem(item, group) {
    if (typeof item === 'string') return { id: '', text: item, owner: '', areaResponsavel: '', due: '', status: 'Aberto', action: '', done: false, note: '', group };
    const done = item.done === true || item.completed === true || String(item.status || '').toLowerCase().includes('concl');
    return {
      id: item.id || '',
      text: item.text || item.description || item.value || '',
      owner: item.owner || item.responsible || '',
      areaResponsavel: item.areaResponsavel || item.responsibleArea || item.department || item.area || '',
      due: item.due || item.deadline || '',
      status: done ? 'Concluído' : (item.status || 'Aberto'),
      action: item.action || item.nextAction || '',
      done,
      note: item.note || item.notes || '',
      autoGenerated: item.autoGenerated === true,
      updatedAt: item.updatedAt || '',
      group
    };
  }

  // Cronograma "efetivo": itens reais + placeholders visuais para os 6 marcos-
  // base ainda não cadastrados. NÃO muta project.schedule (leitura pura) — ver
  // ensureBaseSchedule() do V1, cujo equivalente mutava o registro compartilhado.
  function effectiveSchedule(project) {
    const real = project.schedule || [];
    const missing = SCHEDULE_BASE_TEMPLATE.filter(tpl => !real.some(s => s.baseKey === tpl.baseKey));
    const placeholders = missing.map(tpl => ({
      id: 'placeholder-' + tpl.baseKey, baseKey: tpl.baseKey, item: tpl.item, jira: !!tpl.jira,
      owner: '', start: '', end: '', done: false, observations: '', synthesized: true
    }));
    return [...real, ...placeholders];
  }

  function scheduleCompleted(item) {
    return item?.done === true || item?.completed === true || String(item?.status || '').toLowerCase().includes('concl');
  }

  function scheduleStatus(item) {
    const start = parseISODate(item.start), end = parseISODate(item.end);
    if (scheduleCompleted(item)) return { label: 'Concluído', cls: 'done' };
    if (!start || !end) return { label: 'Sem data', cls: 'planned' };
    if (end < start) return { label: 'Revisar datas', cls: 'late' };
    if (TODAY < start) return { label: 'Planejado', cls: 'planned' };
    if (TODAY > end) return { label: 'Atrasado', cls: 'late' };
    const diff = daysBetween(end, TODAY);
    if (diff <= 2) return { label: 'Atenção', cls: 'attention' };
    return { label: 'No prazo', cls: 'ontrack' };
  }

  function scheduleNeedsPdca(item) {
    const st = scheduleStatus(item);
    return !scheduleCompleted(item) && (st.cls === 'late' || st.cls === 'attention' || st.label === 'Revisar datas');
  }

  function scheduleDaysLate(item) {
    if (scheduleCompleted(item)) return 0;
    const originalEnd = (item.replanHistory && item.replanHistory[0]) ? item.replanHistory[0].from : item.end;
    const due = parseISODate(originalEnd);
    if (!due || !TODAY || TODAY <= due) return 0;
    return daysBetween(TODAY, due);
  }

  function automaticProjectStatus(project) {
    const items = effectiveSchedule(project).filter(item => !item.jira);
    const real = items.filter(item => !item.synthesized);
    if (!real.length) return 'A iniciar';
    const open = items.filter(item => !scheduleCompleted(item));
    if (!open.length) return 'Concluído';
    const statuses = open.map(scheduleStatus);
    if (statuses.some(s => s.cls === 'late')) return 'Crítico';
    if (statuses.some(s => s.cls === 'attention' || s.label === 'Revisar datas')) return 'Atenção';
    const hasStarted = open.some(item => { const s = parseISODate(item.start); return s && s <= TODAY; });
    return hasStarted ? 'Saudável' : 'A iniciar';
  }

  function schedulePhaseSummary(project) {
    const items = effectiveSchedule(project).filter(item => !item.jira);
    const pending = SCHEDULE_PHASE_ORDER.map(key => items.find(i => i.baseKey === key)).find(i => i && !scheduleCompleted(i));
    if (!pending) {
      const anyReal = items.some(i => !i.synthesized);
      return anyReal ? 'Discovery concluído' : 'Cronograma pendente';
    }
    return SCHEDULE_PHASE_LABELS[pending.baseKey] || (pending.item || 'Em andamento');
  }

  function ensureTimelineItems(project) {
    const existing = project.timelineItems || [];
    return TIMELINE_ITEM_TEMPLATE.map(tpl => {
      const found = existing.find(it => it.id === tpl.id);
      let status = found ? (found.status || (found.done ? 'done' : 'notstarted')) : 'notstarted';
      return { ...tpl, status, updatedAt: found?.updatedAt || '' };
    });
  }

  function currentDiscoveryPhase(project) {
    const items = ensureTimelineItems(project);
    const stage = TIMELINE_STAGES.find(st => items.some(it => it.stageId === st.id && it.status !== 'done')) || TIMELINE_STAGES[TIMELINE_STAGES.length - 1];
    return stage.title;
  }

  function calculateProgress(project) {
    const checklistScore = project.checklist.length ? (project.checklist.filter(c => c.done).length / project.checklist.length) * 45 : 0;
    const timelineItems = ensureTimelineItems(project);
    const w = { done: 1, progress: .55, 'waiting-arch': .55, 'waiting-business': .55, blocked: .15 };
    const phaseScore = timelineItems.length ? (timelineItems.reduce((acc, it) => acc + (w[it.status] || 0), 0) / timelineItems.length) * 35 : 0;
    const cardW = { backlog: .1, doing: .45, validation: .7, done: 1 };
    const cardScore = project.cards.length ? (project.cards.reduce((acc, c) => acc + (cardW[c.status] || 0), 0) / project.cards.length) * 20 : 0;
    return Math.round(checklistScore + phaseScore + cardScore);
  }

  function allRaidRows(project) {
    return ['risks', 'assumptions', 'issues', 'dependencies'].flatMap(group => (project.raids[group] || []));
  }
  function openRisks(project) { return (project.raids.risks || []).filter(r => !r.done); }
  function openImpediments(project) { return (project.raids.issues || []).filter(r => !r.done); }
  function raidIsLate(item) {
    if (!item?.due || item.done) return false;
    const due = parseISODate(item.due);
    return due && TODAY && TODAY > due;
  }
  function riskCount(project) { return allRaidRows(project).filter(r => ['risks', 'issues'].includes(r.group) && !r.done).length; }
  function blockedCount(project) {
    const timelineBlocked = ensureTimelineItems(project).filter(it => it.status === 'blocked').length;
    return timelineBlocked + (project.cards || []).filter(c => c.priority === 'Crítica' && c.status !== 'done').length;
  }

  function isCardOverdue(c) {
    if (!c.due || c.status === 'done') return false;
    const due = parseISODate(c.due);
    return Boolean(due && TODAY && due < TODAY);
  }
  function cardDueDiffDays(c) {
    const due = parseISODate(c.due);
    if (!due || !TODAY) return null;
    return daysBetween(due, TODAY);
  }
  function isCardDueSoon(c) {
    if (!c.due || c.status === 'done') return false;
    const diff = cardDueDiffDays(c);
    return diff !== null && diff >= 0 && diff <= ATTENTION_DUE_SOON_DAYS;
  }

  function nextMilestones(project, limit) {
    const items = effectiveSchedule(project).filter(s => !s.jira && !scheduleCompleted(s) && (s.start || s.end));
    const sorted = items.slice().sort((a, b) => String(a.end || a.start || '9999').localeCompare(String(b.end || b.start || '9999')));
    return limit ? sorted.slice(0, limit) : sorted;
  }
  function nextMilestoneLabel(project) {
    const m = nextMilestones(project, 1)[0];
    return m ? (m.item || 'Marco sem nome') : 'Sem pendência de cronograma';
  }

  function statusTone(status) {
    return { 'Crítico': 'critico', 'Atenção': 'atencao', 'Saudável': 'saudavel', 'Concluído': 'concluido', 'A iniciar': 'iniciar' }[status] || 'semdado';
  }
  function statusEmoji(status) {
    return { 'Crítico': '🔴', 'Atenção': '🟠', 'Saudável': '🟢', 'Concluído': '🟢', 'A iniciar': '⚪' }[status] || '⚪';
  }

  function initiativeLabel(project) {
    return [project.initiativeNumber, project.name].filter(Boolean).join(' · ') || project.name;
  }

  function squadName(project) {
    const bySquads = (state.data.squads || []).find(s => s.id === project.squadId);
    return (bySquads && bySquads.name) || project.squad || 'Squad não informada';
  }

  function squadInitials(name) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '—';
    return (words[0][0] + (words[1] ? words[1][0] : words[0][1] || '')).toUpperCase();
  }

  // ============================================================================
  // AGREGAÇÕES DE PORTFÓLIO (o que alimenta os blocos executivos da Home)
  // ============================================================================

  function computeAttention(project) {
    const status = automaticProjectStatus(project);
    const reasons = [];
    const risks = openRisks(project);
    const impediments = openImpediments(project);
    const lateRisks = risks.filter(raidIsLate);
    const cards = project.cards || [];
    const overdueCards = cards.filter(isCardOverdue);
    const dueSoonCards = cards.filter(isCardDueSoon);
    const pdcaItems = effectiveSchedule(project).filter(scheduleNeedsPdca);
    const blocked = blockedCount(project);

    if (status === 'Crítico') reasons.push({ text: 'Marco de cronograma atrasado', tone: 'red' });
    if (status === 'Atenção') reasons.push({ text: 'Marco de cronograma em atenção', tone: 'amber' });
    if (impediments.length) reasons.push({ text: `${impediments.length} impedimento(s) aberto(s)`, tone: 'red' });
    if (lateRisks.length) reasons.push({ text: `${lateRisks.length} risco(s) vencido(s)`, tone: 'red' });
    else if (risks.length) reasons.push({ text: `${risks.length} risco(s) aberto(s)`, tone: 'amber' });
    if (overdueCards.length) reasons.push({ text: `${overdueCards.length} ação(ões) atrasada(s)`, tone: 'red' });
    else if (dueSoonCards.length) reasons.push({ text: `${dueSoonCards.length} ação(ões) a vencer`, tone: 'amber' });
    if (blocked) reasons.push({ text: `${blocked} item(ns) bloqueado(s)`, tone: 'red' });
    if (pdcaItems.length) reasons.push({ text: `${pdcaItems.length} marco(s) exigindo decisão`, tone: 'amber' });

    const needsAttention = status === 'Crítico' || status === 'Atenção' || impediments.length > 0 ||
      lateRisks.length > 0 || overdueCards.length > 0 || blocked > 0 || pdcaItems.length > 0;

    // Próxima ação: prioriza o item mais urgente entre marco/risco/impedimento/ação.
    let nextAction = null;
    const latePdca = pdcaItems.filter(i => scheduleStatus(i).cls === 'late');
    if (latePdca.length) {
      const i = latePdca[0];
      nextAction = { text: i.observations || `Replanejar "${i.item}"`, status: scheduleStatus(i).label, due: i.end };
    } else if (lateRisks.length) {
      const r = lateRisks[0];
      nextAction = { text: r.action || r.text, status: r.status, due: r.due };
    } else if (impediments.length) {
      const im = impediments[0];
      nextAction = { text: im.action || im.text, status: im.status, due: im.due };
    } else if (overdueCards.length) {
      const c = overdueCards[0];
      nextAction = { text: c.title || 'Ação sem título', status: 'Atrasada', due: c.due };
    } else if (pdcaItems.length) {
      const i = pdcaItems[0];
      nextAction = { text: i.observations || `Revisar "${i.item}"`, status: scheduleStatus(i).label, due: i.end };
    } else if (dueSoonCards.length) {
      const c = dueSoonCards[0];
      nextAction = { text: c.title || 'Ação sem título', status: 'A vencer', due: c.due };
    }

    const m = nextMilestones(project, 1)[0];

    return {
      project, status, reasons, needsAttention,
      impact: NAO_INFORMADO,
      responsible: orNI(project.rteOwner || project.owner),
      dueLabel: m ? formatBR(m.end || m.start) : NAO_INFORMADO,
      nextAction: nextAction ? nextAction.text : NAO_INFORMADO,
      nextActionStatus: nextAction ? nextAction.status : NAO_INFORMADO
    };
  }

  function buildAttentionList() {
    return state.data.projects.map(computeAttention).filter(a => a.needsAttention)
      .sort((a, b) => {
        const rank = { 'Crítico': 0, 'Atenção': 1, 'Saudável': 2, 'A iniciar': 3, 'Concluído': 4 };
        return (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
      });
  }

  function buildRiskRows() {
    const rows = [];
    state.data.projects.forEach(project => {
      openRisks(project).forEach(risk => rows.push({ project, item: risk, late: raidIsLate(risk) }));
    });
    return rows.sort((a, b) => {
      if (a.late !== b.late) return a.late ? -1 : 1;
      const da = a.item.due ? parseISODate(a.item.due) : null, db = b.item.due ? parseISODate(b.item.due) : null;
      if (da && db && da - db) return da - db;
      if (da && !db) return -1;
      if (!da && db) return 1;
      return initiativeLabel(a.project).localeCompare(initiativeLabel(b.project), 'pt-BR');
    });
  }

  function buildImpedimentRows() {
    const rows = [];
    state.data.projects.forEach(project => {
      openImpediments(project).forEach(item => {
        const late = raidIsLate(item);
        const lateDays = late ? daysBetween(TODAY, parseISODate(item.due)) : 0;
        rows.push({ project, item, late, lateDays, escalate: late && lateDays >= ESCALATION_LATE_DAYS });
      });
    });
    return rows.sort((a, b) => {
      if (a.late !== b.late) return a.late ? -1 : 1;
      if (a.lateDays !== b.lateDays) return b.lateDays - a.lateDays;
      return initiativeLabel(a.project).localeCompare(initiativeLabel(b.project), 'pt-BR');
    });
  }

  // "Decisões Pendentes": não existe campo estruturado de decisão no modelo de
  // dados do V1 (confirmado por levantamento no código-fonte). O proxy honesto
  // disponível são os marcos de cronograma que já pedem PDCA (atrasados, em
  // atenção ou com datas inconsistentes) — sinal real, calculado a partir de
  // datas cadastradas, não uma suposição de conteúdo.
  function buildDecisionRows() {
    const rows = [];
    state.data.projects.forEach(project => {
      effectiveSchedule(project).filter(scheduleNeedsPdca).forEach(item => {
        const st = scheduleStatus(item);
        rows.push({
          project, item, status: st,
          decision: item.observations ? item.observations : `Replanejar / destravar "${item.item}"`
        });
      });
    });
    return rows.sort((a, b) => (a.status.cls === 'late' ? 0 : 1) - (b.status.cls === 'late' ? 0 : 1));
  }

  // "Observações Executivas": agrega os campos de texto livre já existentes e
  // editáveis no V1 (nota de risco/impedimento, observação de marco, comentário
  // de ação) — não existe hoje um campo único e centralizado de "observação
  // executiva" com editor funcional em nenhuma das duas versões (ver notas de
  // entrega). Isso torna visível o que já está registrado, com origem e data.
  function buildObservationsFeed(projectFilter) {
    const rows = [];
    const projects = projectFilter ? [projectFilter] : state.data.projects;
    projects.forEach(project => {
      allRaidRows(project).forEach(item => {
        if (item.note && item.note.trim()) {
          rows.push({ project, source: RAID_GROUP_LABEL[item.group] || 'RAID', text: item.note, owner: item.owner, updatedAt: item.updatedAt });
        }
      });
      effectiveSchedule(project).forEach(item => {
        if (item.observations && item.observations.trim()) {
          rows.push({ project, source: 'Cronograma · ' + (item.item || ''), text: item.observations, owner: item.owner, updatedAt: item.updatedAt });
        }
      });
      (project.cards || []).forEach(card => {
        if (card.notes && String(card.notes).trim()) {
          rows.push({ project, source: 'Ação · ' + (card.title || ''), text: card.notes, owner: card.owner, updatedAt: card.updatedAt });
        }
      });
      if (project.summary && project.summary.trim()) {
        rows.push({ project, source: 'Resumo executivo', text: project.summary, owner: '', updatedAt: project.updatedAt });
      }
    });
    return rows.sort((a, b) => (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0));
  }

  function buildPortfolioRows() {
    return state.data.projects.map(project => {
      const status = automaticProjectStatus(project);
      const m = nextMilestones(project, 1)[0];
      return {
        project, status,
        squad: squadName(project),
        phase: currentDiscoveryPhase(project),
        progress: calculateProgress(project),
        risks: openRisks(project).length,
        impediments: openImpediments(project).length,
        nextMilestone: nextMilestoneLabel(project),
        due: m ? (m.end || m.start) : '',
        updatedAt: project.updatedAt || ''
      };
    });
  }

  function buildHealthKpis() {
    const projects = state.data.projects;
    const statuses = projects.map(automaticProjectStatus);
    const count = (s) => statuses.filter(x => x === s).length;
    let openRisksTotal = 0, openImpedTotal = 0;
    projects.forEach(p => { openRisksTotal += openRisks(p).length; openImpedTotal += openImpediments(p).length; });
    const impededProjects = projects.filter(p => openImpediments(p).length > 0 || blockedCount(p) > 0).length;
    return {
      total: projects.length,
      emAndamento: count('Saudável') + count('Atenção') + count('Crítico'),
      atencao: count('Atenção'),
      criticas: count('Crítico'),
      impedidas: impededProjects,
      concluidas: count('Concluído'),
      riscosAbertos: openRisksTotal,
      impedimentosAtivos: openImpedTotal
    };
  }

  // ============================================================================
  // ESTADO
  // ============================================================================

  const state = {
    data: null,
    loadedAt: null,
    usingCache: false,
    syncStatus: 'loading', // loading | ok | stale | error
    lastKnownRevision: null,
    hidden: false,
    filters: { squad: '', status: '', phase: '', responsible: '', search: '', withRisk: false, withImpediment: false, withDelay: false, withDecision: false },
    sort: { key: 'status', dir: 'asc' },
    route: { view: 'home', projectId: null, tab: 'timeline' }
  };

  // ============================================================================
  // ROTEAMENTO (só existe na V2 — o V1 não tem deep link por projeto)
  // ============================================================================

  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    if (h.startsWith('i/')) return { view: 'detail', projectId: decodeURIComponent(h.slice(2)) };
    return { view: 'home', projectId: null };
  }
  function goHome() { location.hash = '#/'; }
  function goDetail(id) { location.hash = '#/i/' + encodeURIComponent(id); }

  window.addEventListener('hashchange', () => {
    state.route = { ...state.route, ...parseHash() };
    render();
  });

  // ============================================================================
  // BOOT / SYNC
  // ============================================================================

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }
  function writeCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, cachedAt: new Date().toISOString() })); } catch (e) {}
  }

  function applyLoadedData(raw, opts) {
    opts = opts || {};
    const projects = Array.isArray(raw.projects) ? raw.projects.map(safeProject) : [];
    state.data = { ...raw, projects };
    state.loadedAt = new Date();
    state.usingCache = !!opts.fromCache;
    state.syncStatus = opts.fromCache ? 'stale' : 'ok';
    if (!opts.fromCache) writeCache(raw);
    render();
  }

  function boot() {
    const cached = readCache();
    if (cached && cached.data) applyLoadedData(cached.data, { fromCache: true });
    gasLoadDiscoveryData((err, data) => {
      if (err || !data) {
        if (!state.data) { state.syncStatus = 'error'; render(); }
        else { state.syncStatus = state.usingCache ? 'stale' : 'error'; render(); }
        return;
      }
      applyLoadedData(data, { fromCache: false });
    });
  }

  // Ping de revisão em vez de buscar tudo de novo — mesmo padrão do V1 (ver
  // CLAUDE.md "Padrão de polling"). Pausa em aba oculta, resincroniza ao
  // voltar o foco, e mantém um resync completo incondicional a cada 12 min.
  let pollTimer = null;
  function schedulePoll() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(() => {
      if (document.hidden) { schedulePoll(); return; }
      gasCheckRevision((err, changed) => {
        if (!err && changed) {
          gasLoadDiscoveryData((err2, data) => { if (!err2 && data) applyLoadedData(data, { fromCache: false }); });
        }
        schedulePoll();
      });
    }, 90 * 1000);
  }
  let fullResyncTimer = null;
  function scheduleFullResync() {
    if (fullResyncTimer) clearInterval(fullResyncTimer);
    fullResyncTimer = setInterval(() => {
      if (document.hidden) return;
      gasLoadDiscoveryData((err, data) => { if (!err && data) applyLoadedData(data, { fromCache: false }); });
    }, 12 * 60 * 1000);
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      gasLoadDiscoveryData((err, data) => { if (!err && data) applyLoadedData(data, { fromCache: false }); });
    }
  });

  window.__v2Refresh = function () {
    state.syncStatus = 'loading'; render();
    gasLoadDiscoveryData((err, data) => {
      if (err || !data) { state.syncStatus = state.usingCache ? 'stale' : 'error'; render(); return; }
      applyLoadedData(data, { fromCache: false });
    });
  };

  // ============================================================================
  // RENDER — Home
  // ============================================================================

  const root = () => document.getElementById('app');

  function render() {
    if (!state.data) { renderLoading(); return; }
    if (state.route.view === 'detail') renderDetailView();
    else renderHomeView();
  }

  function renderLoading() {
    root().innerHTML = `
      <header class="v2-header"><div class="v2-header-inner">${brandBlockHtml()}</div></header>
      <div class="shell">
        <div class="v2-loading-screen">
          <div class="v2-spinner"></div>
          <div>${state.syncStatus === 'error' ? 'Não foi possível conectar à base compartilhada.' : 'Carregando portfólio…'}</div>
        </div>
      </div>`;
  }

  function brandBlockHtml() {
    return `<div class="v2-brand">
        <span class="mark"></span>
        <div class="v2-title-block">
          <div class="v2-title">Discovery PMO <span class="accent">|</span> Visão Executiva</div>
          <div class="v2-subtitle">Portfólio · Riscos · Impedimentos · Decisões · Evolução</div>
        </div>
      </div>`;
  }

  function syncPillHtml() {
    const cls = state.syncStatus === 'ok' ? '' : state.syncStatus === 'loading' ? '' : state.syncStatus === 'stale' ? 'stale' : 'error';
    const label = state.syncStatus === 'ok' ? 'Sincronizado' : state.syncStatus === 'loading' ? 'Sincronizando…' :
      state.syncStatus === 'stale' ? 'Base local (sem confirmação recente)' : 'Falha ao sincronizar';
    const when = state.loadedAt ? formatBRDateTime(state.loadedAt.toISOString()) : '—';
    return `<button type="button" class="v2-sync-pill ${cls}" onclick="window.__v2Refresh()" title="Última atualização: ${escapeAttr(when)}. Clique para sincronizar agora.">
      <span class="dot"></span>${escapeHtml(label)}
    </button>`;
  }

  function renderHomeView() {
    const kpis = buildHealthKpis();
    const attention = applySharedFilters(buildAttentionList().map(a => ({ ...a, _kind: 'attn' })), a => a.project)
      .map(a => a); // attention already project-scoped rows
    const risks = applySharedFilters(buildRiskRows(), r => r.project);
    const impediments = applySharedFilters(buildImpedimentRows(), r => r.project);
    const decisions = applySharedFilters(buildDecisionRows(), r => r.project);
    const observations = applySharedFilters(buildObservationsFeed(), o => o.project).slice(0, 12);
    const portfolio = applySharedFilters(buildPortfolioRows(), r => r.project);

    root().innerHTML = `
      <header class="v2-header"><div class="v2-header-inner">
        ${brandBlockHtml()}
        <div class="v2-searchbar">
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6" stroke="currentColor" stroke-width="1.6"/><path d="M14 14l4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <input type="text" id="searchInput" placeholder="Buscar iniciativa, squad ou responsável…" value="${escapeAttr(state.filters.search)}" />
        </div>
        <div class="v2-header-meta">
          <div class="v2-meta-stat"><span class="num">${kpis.total}</span><span class="lbl">Iniciativas</span></div>
          <div class="v2-meta-stat"><span class="num">${state.loadedAt ? formatBR(fmtDate(state.loadedAt)) : '—'}</span><span class="lbl">Atualizado</span></div>
          ${syncPillHtml()}
        </div>
      </div></header>

      <div class="shell">
        ${state.syncStatus === 'error' ? `<div class="v2-banner err">Não foi possível confirmar a base mais recente com o servidor. Mostrando a última cópia local conhecida${state.loadedAt ? ' (' + escapeHtml(formatBRDateTime(state.loadedAt.toISOString())) + ')' : ''}.</div>` : ''}
        ${state.usingCache && state.syncStatus !== 'error' ? `<div class="v2-banner warn">Confirmando com o servidor em segundo plano…</div>` : ''}

        ${healthBarHtml(kpis)}
        ${filtersBarHtml(portfolio.length, buildPortfolioRows().length)}

        ${sectionHtml('Visão do Portfólio', portfolio.length, 'Clique numa linha para abrir o detalhe da iniciativa', portfolioTableHtml(portfolio))}

        ${sectionHtml('Atenção Executiva', attention.length, 'Iniciativas com risco alto/crítico, impedimento, atraso, dependência crítica ou decisão pendente', attentionListHtml(attention))}

        <div class="v2-two-col">
          ${sectionHtml('Riscos Prioritários', risks.length, 'Todos os riscos abertos do portfólio, vencidos primeiro', riskTableHtml(risks), true)}
          ${sectionHtml('Impedimentos Ativos', impediments.length, 'Bloqueios ativos — nunca misturados com risco', impedimentTableHtml(impediments), true)}
        </div>

        <div class="v2-two-col">
          ${sectionHtml('Decisões Pendentes', decisions.length, 'Marcos de cronograma que hoje exigem decisão de replanejamento ou destrave (atraso/atenção/datas inconsistentes)', decisionTableHtml(decisions), true)}
          ${sectionHtml('Observações Executivas', observations.length, 'Registros de observação já existentes na base (RAID, cronograma, ações, resumo)', observationsFeedHtml(observations), true)}
        </div>

        <div class="v2-footer">Discovery PMO V2 · fonte de dados compartilhada com o Tracker operacional · <a href="${V1_URL}" style="color:var(--brand);font-weight:600">abrir Tracker (V1) para editar →</a></div>
      </div>`;

    wireHomeInteractions();
  }

  function sectionHtml(title, count, note, bodyHtml, compact) {
    return `<section class="v2-section">
      <div class="v2-section-head">
        <div class="v2-section-title">${escapeHtml(title)} <span class="count">${count}</span></div>
        <div class="v2-section-note">${escapeHtml(note)}</div>
      </div>
      ${bodyHtml}
    </section>`;
  }

  function healthBarHtml(k) {
    const kpi = (label, val, tone, key) => `<div class="v2-kpi ${tone ? 'tone-' + tone : ''} clickable" data-kpi="${key}">
      <div class="val">${val}</div><div class="lbl">${escapeHtml(label)}</div>
    </div>`;
    return `<div class="v2-healthbar">
      ${kpi('Total de iniciativas', k.total, '', 'total')}
      ${kpi('Em andamento', k.emAndamento, '', 'andamento')}
      ${kpi('Atenção', k.atencao, 'amber', 'atencao')}
      ${kpi('Críticas', k.criticas, 'red', 'critico')}
      ${kpi('Impedidas', k.impedidas, 'red', 'impedidas')}
      ${kpi('Concluídas', k.concluidas, 'green', 'concluidas')}
      ${kpi('Riscos abertos', k.riscosAbertos, 'brand', 'risco')}
      ${kpi('Impedimentos ativos', k.impedimentosAtivos, 'brand', 'impedimento')}
    </div>`;
  }

  function filtersBarHtml(shown, total) {
    const squads = uniqSorted(state.data.projects.map(squadName));
    const statuses = ['A iniciar', 'Saudável', 'Atenção', 'Crítico', 'Concluído'];
    const phases = uniqSorted(state.data.projects.map(currentDiscoveryPhase));
    const responsibles = uniqSorted(state.data.projects.map(p => orNI(p.rteOwner || p.owner)).filter(v => v !== NAO_INFORMADO));
    const opt = (v, sel) => `<option value="${escapeAttr(v)}" ${v === sel ? 'selected' : ''}>${escapeHtml(v)}</option>`;
    const chip = (key, label) => `<label class="v2-chip-toggle ${state.filters[key] ? 'active' : ''}"><input type="checkbox" data-chip="${key}" ${state.filters[key] ? 'checked' : ''}/> ${escapeHtml(label)}</label>`;
    return `<div class="v2-section" style="margin-top:16px">
      <div class="v2-filters">
        <select id="fSquad"><option value="">Squad (todas)</option>${squads.map(s => opt(s, state.filters.squad)).join('')}</select>
        <select id="fStatus"><option value="">Saúde (todas)</option>${statuses.map(s => opt(s, state.filters.status)).join('')}</select>
        <select id="fPhase"><option value="">Fase (todas)</option>${phases.map(s => opt(s, state.filters.phase)).join('')}</select>
        <select id="fResp"><option value="">Responsável (todos)</option>${responsibles.map(s => opt(s, state.filters.responsible)).join('')}</select>
        ${chip('withRisk', 'Com risco')}
        ${chip('withImpediment', 'Com impedimento')}
        ${chip('withDelay', 'Com atraso')}
        ${chip('withDecision', 'Com decisão pendente')}
        <span class="v2-filter-count">${shown}/${total} iniciativas</span>
        <button type="button" class="clear-btn" id="clearFilters">Limpar filtros</button>
      </div>
    </div>`;
  }

  function uniqSorted(arr) { return [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')); }

  function projectPassesFilters(project) {
    const f = state.filters;
    if (f.squad && squadName(project) !== f.squad) return false;
    if (f.status && automaticProjectStatus(project) !== f.status) return false;
    if (f.phase && currentDiscoveryPhase(project) !== f.phase) return false;
    if (f.responsible && orNI(project.rteOwner || project.owner) !== f.responsible) return false;
    if (f.withRisk && openRisks(project).length === 0) return false;
    if (f.withImpediment && openImpediments(project).length === 0) return false;
    if (f.withDelay && !effectiveSchedule(project).some(i => scheduleStatus(i).cls === 'late')) return false;
    if (f.withDecision && !effectiveSchedule(project).some(scheduleNeedsPdca)) return false;
    if (f.search) {
      const q = f.search.toLowerCase();
      const hay = [project.name, project.initiativeNumber, squadName(project), project.rteOwner, project.owner].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }
  function applySharedFilters(rows, getProject) {
    return rows.filter(r => projectPassesFilters(getProject(r)));
  }

  function emptyState(title, note) {
    return `<div class="v2-empty"><strong>${escapeHtml(title)}</strong>${escapeHtml(note)}</div>`;
  }

  // Componente de linha compacta compartilhado por Atenção/Riscos/Impedimentos/
  // Decisões: título em uma única linha (nunca quebra em várias linhas como uma
  // tabela densa faria com nome longo), faixa de cor à esquerda, metadados
  // agrupados à direita. `tags` aceita no máx. 2 badges visíveis + "+N".
  function xrow({ id, stripe, title, subParts, tags, dueLabel, whoLabel }) {
    const visibleTags = (tags || []).slice(0, 2);
    const extra = (tags || []).length - visibleTags.length;
    return `<div class="v2-xrow" data-goto="${escapeAttr(id)}">
      <span class="stripe ${stripe || ''}"></span>
      <div class="main">
        <div class="title-row"><span class="title" title="${escapeAttr(title)}">${escapeHtml(title)}</span></div>
        <div class="sub">${subParts.filter(Boolean).join(' <span class="dim">·</span> ')}</div>
        ${visibleTags.length ? `<div class="tags">${visibleTags.map(t => `<span class="badge tone-${t.tone}">${escapeHtml(t.text)}</span>`).join('')}${extra > 0 ? `<span class="badge tone-grey">+${extra}</span>` : ''}</div>` : ''}
      </div>
      <div class="meta">
        ${dueLabel ? `<span class="due">${escapeHtml(dueLabel)}</span>` : ''}
        ${whoLabel ? `<span class="who" title="${escapeAttr(whoLabel)}">${escapeHtml(whoLabel)}</span>` : ''}
      </div>
    </div>`;
  }

  function attentionListHtml(rows) {
    if (!rows.length) return emptyState('Nada precisa de atenção agora', 'Nenhuma iniciativa com risco alto, impedimento, atraso ou decisão pendente no recorte atual.');
    const item = (a) => xrow({
      id: a.project.id,
      stripe: a.status === 'Crítico' ? 'red' : 'amber',
      title: `${statusEmoji(a.status)} ${a.project.name}`,
      subParts: [
        `<span class="init-link">${escapeHtml(a.project.initiativeNumber || initiativeLabel(a.project))}</span>`,
        escapeHtml(squadName(a.project)), escapeHtml(a.status),
        `Próxima ação: ${escapeHtml(a.nextAction)}`
      ],
      tags: a.reasons.map(r => ({ text: r.text, tone: r.tone === 'red' ? 'red' : 'amber' })),
      dueLabel: a.dueLabel !== NAO_INFORMADO ? a.dueLabel : '',
      whoLabel: a.responsible !== NAO_INFORMADO ? a.responsible : ''
    });
    return `<div class="v2-card v2-list">${rows.map(item).join('')}</div>`;
  }

  function riskTableHtml(rows) {
    if (!rows.length) return emptyState('Sem registro', 'Nenhum risco aberto registrado no recorte atual.');
    const item = (r) => xrow({
      id: r.project.id, stripe: r.late ? 'red' : '',
      title: r.item.text || 'Risco sem descrição',
      subParts: [`<span class="init-link">${escapeHtml(initiativeLabel(r.project))}</span>`, orNI(r.item.action) !== NAO_INFORMADO ? escapeHtml('Ação: ' + r.item.action) : ''],
      tags: [{ text: r.late ? 'Vencido' : r.item.status, tone: r.late ? 'red' : 'grey' }],
      dueLabel: formatBR(r.item.due) !== NAO_INFORMADO ? formatBR(r.item.due) : '',
      whoLabel: orNI(r.item.owner) !== NAO_INFORMADO ? r.item.owner : ''
    });
    return `<div class="v2-card v2-list">${rows.map(item).join('')}</div>`;
  }

  function impedimentTableHtml(rows) {
    if (!rows.length) return emptyState('Sem registro', 'Nenhum impedimento ativo no recorte atual.');
    const item = (r) => xrow({
      id: r.project.id, stripe: r.escalate ? 'red' : (r.late ? 'amber' : ''),
      title: r.item.text || 'Impedimento sem descrição',
      subParts: [`<span class="init-link">${escapeHtml(initiativeLabel(r.project))}</span>`, escapeHtml(squadName(r.project)), orNI(r.item.action) !== NAO_INFORMADO ? escapeHtml('Próxima ação: ' + r.item.action) : ''],
      tags: [r.escalate ? { text: `Escalonar · ${r.lateDays}d`, tone: 'red' } : (r.late ? { text: 'Vencido', tone: 'amber' } : { text: 'Em ação', tone: 'grey' })],
      dueLabel: formatBR(r.item.due) !== NAO_INFORMADO ? formatBR(r.item.due) : '',
      whoLabel: orNI(r.item.owner) !== NAO_INFORMADO ? r.item.owner : ''
    });
    return `<div class="v2-card v2-list">${rows.map(item).join('')}</div>`;
  }

  function decisionTableHtml(rows) {
    if (!rows.length) return emptyState('Sem registro', 'Nenhum marco exige decisão agora — não existe hoje um campo estruturado de "decisão pendente" na base; este painel deriva de marcos de cronograma atrasados ou com datas inconsistentes.');
    const item = (r) => xrow({
      id: r.project.id, stripe: r.status.cls === 'late' ? 'red' : 'amber',
      title: r.decision,
      subParts: [`<span class="init-link">${escapeHtml(initiativeLabel(r.project))}</span>`],
      tags: [{ text: r.status.label, tone: r.status.cls === 'late' ? 'red' : 'amber' }],
      dueLabel: formatBR(r.item.end) !== NAO_INFORMADO ? formatBR(r.item.end) : '',
      whoLabel: orNI(r.item.owner || r.project.rteOwner) !== NAO_INFORMADO ? (r.item.owner || r.project.rteOwner) : ''
    });
    return `<div class="v2-card v2-list">${rows.map(item).join('')}</div>`;
  }

  function observationsFeedHtml(rows) {
    if (!rows.length) return emptyState('Sem registro', 'Nenhuma observação registrada (RAID, cronograma, ações ou resumo executivo) no recorte atual.');
    const it = (o) => `<div class="v2-feed-item">
        <div class="src">${escapeHtml(o.source)}</div>
        <div class="body">
          <div class="txt">${escapeHtml(o.text)}</div>
          <div class="meta"><a href="#/i/${encodeURIComponent(o.project.id)}">${escapeHtml(initiativeLabel(o.project))}</a>
            ${o.owner ? '· ' + escapeHtml(o.owner) : ''} · ${escapeHtml(formatBRDateTime(o.updatedAt))}</div>
        </div>
      </div>`;
    return `<div class="v2-card v2-feed">${rows.map(it).join('')}</div>`;
  }

  function portfolioTableHtml(rows) {
    if (!rows.length) return emptyState('Nenhuma iniciativa no recorte atual', 'Ajuste os filtros acima.');
    const s = state.sort;
    const sorted = rows.slice().sort((a, b) => {
      let av, bv;
      switch (s.key) {
        case 'name': av = a.project.name; bv = b.project.name; break;
        case 'squad': av = a.squad; bv = b.squad; break;
        case 'phase': av = a.phase; bv = b.phase; break;
        case 'progress': av = a.progress; bv = b.progress; break;
        case 'risks': av = a.risks; bv = b.risks; break;
        case 'impediments': av = a.impediments; bv = b.impediments; break;
        case 'due': av = a.due || '9999'; bv = b.due || '9999'; break;
        case 'updatedAt': av = a.updatedAt || ''; bv = b.updatedAt || ''; break;
        default: { const rank = { 'Crítico': 0, 'Atenção': 1, 'Saudável': 2, 'A iniciar': 3, 'Concluído': 4 }; av = rank[a.status] ?? 9; bv = rank[b.status] ?? 9; }
      }
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), 'pt-BR');
      return s.dir === 'asc' ? cmp : -cmp;
    });
    const th = (key, label) => `<th class="sortable" data-sort="${key}">${escapeHtml(label)}${s.key === key ? `<span class="arrow">${s.dir === 'asc' ? '▲' : '▼'}</span>` : ''}</th>`;
    const tr = (r) => `<tr class="clickable" data-goto="${escapeAttr(r.project.id)}">
        <td><span class="dot-status s-${statusTone(r.status)}"><span class="sw"></span>${statusEmoji(r.status)} ${escapeHtml(r.status)}</span></td>
        <td class="name-cell" title="${escapeAttr(r.project.name)}"><div class="v2-portfolio-name">
          <span class="avatar">${escapeHtml(squadInitials(r.squad))}</span>
          <div class="txt"><span class="n">${escapeHtml(r.project.name)}</span><span class="sub">${escapeHtml(r.project.initiativeNumber || '—')}</span></div>
        </div></td>
        <td class="nowrap">${escapeHtml(r.squad)}</td>
        <td class="nowrap">${escapeHtml(r.phase)}</td>
        <td><div class="v2-progress"><div class="track"><div class="fill" style="width:${r.progress}%"></div></div><span class="pct">${r.progress}%</span></div></td>
        <td class="num">${r.risks}</td>
        <td class="num">${r.impediments}</td>
        <td>${escapeHtml(r.nextMilestone)}</td>
        <td class="nowrap">${escapeHtml(formatBR(r.due))}</td>
        <td class="nowrap">${escapeHtml(formatBRDateTime(r.updatedAt))}</td>
      </tr>`;
    return `<div class="v2-card v2-table-wrap"><table class="v2-table">
      <thead><tr>
        ${th('status', 'Saúde')}${th('name', 'Iniciativa')}${th('squad', 'Squad')}${th('phase', 'Fase')}
        ${th('progress', 'Progresso')}${th('risks', 'Riscos')}${th('impediments', 'Impedimentos')}
        <th>Próximo marco</th>${th('due', 'Prazo')}${th('updatedAt', 'Atualização')}
      </tr></thead>
      <tbody>${sorted.map(tr).join('')}</tbody></table></div>`;
  }

  function wireHomeInteractions() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', debounce((e) => { state.filters.search = e.target.value; render(); refocusSearch(); }, 200));
    }
    const bind = (id, key) => { const el = document.getElementById(id); if (el) el.addEventListener('change', (e) => { state.filters[key] = e.target.value; render(); }); };
    bind('fSquad', 'squad'); bind('fStatus', 'status'); bind('fPhase', 'phase'); bind('fResp', 'responsible');
    document.querySelectorAll('[data-chip]').forEach(el => el.addEventListener('change', (e) => {
      state.filters[e.target.dataset.chip] = e.target.checked; render();
    }));
    const clearBtn = document.getElementById('clearFilters');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      state.filters = { squad: '', status: '', phase: '', responsible: '', search: '', withRisk: false, withImpediment: false, withDelay: false, withDecision: false };
      render();
    });
    document.querySelectorAll('[data-goto]').forEach(el => el.addEventListener('click', () => goDetail(el.dataset.goto)));
    document.querySelectorAll('th[data-sort]').forEach(el => el.addEventListener('click', () => {
      const key = el.dataset.sort;
      if (state.sort.key === key) state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
      else state.sort = { key, dir: 'asc' };
      render();
    }));
    document.querySelectorAll('[data-kpi]').forEach(el => el.addEventListener('click', () => {
      const key = el.dataset.kpi;
      const map = { atencao: 'Atenção', critico: 'Crítico', concluidas: 'Concluído' };
      if (map[key]) { state.filters.status = state.filters.status === map[key] ? '' : map[key]; render(); }
      if (key === 'risco') { state.filters.withRisk = !state.filters.withRisk; render(); }
      if (key === 'impedimento' || key === 'impedidas') { state.filters.withImpediment = !state.filters.withImpediment; render(); }
      document.querySelector('.v2-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }
  function refocusSearch() { const el = document.getElementById('searchInput'); if (el) { el.focus(); const v = el.value; el.value = ''; el.value = v; } }

  // ============================================================================
  // RENDER — Detalhe da iniciativa
  // ============================================================================

  function findProject(id) { return (state.data.projects || []).find(p => p.id === id); }

  function renderDetailView() {
    const project = findProject(state.route.projectId);
    if (!project) {
      root().innerHTML = `<header class="v2-header"><div class="v2-header-inner">${brandBlockHtml()}<a class="v2-back-link" href="#/">← Voltar ao portfólio</a></div></header>
        <div class="shell">${emptyState('Iniciativa não encontrada', 'Pode ter sido removida ou o link está desatualizado.')}</div>`;
      return;
    }
    const status = automaticProjectStatus(project);
    const progress = calculateProgress(project);
    const phase = currentDiscoveryPhase(project);
    const phaseSummary = schedulePhaseSummary(project);
    const risks = openRisks(project), impediments = openImpediments(project);
    const lateRisks = risks.filter(raidIsLate);
    const pdca = effectiveSchedule(project).filter(scheduleNeedsPdca);
    const m = nextMilestones(project, 1)[0];
    const feed = buildObservationsFeed(project);

    root().innerHTML = `
      <header class="v2-header"><div class="v2-header-inner">
        ${brandBlockHtml()}
        <a class="v2-back-link" href="#/">← Voltar ao portfólio</a>
        <div class="v2-header-meta">${syncPillHtml()}</div>
      </div></header>
      <div class="shell">
        <div class="v2-detail-head">
          <div>
            <div class="v2-detail-title">${escapeHtml(project.name)}</div>
            <div class="v2-detail-num">${escapeHtml(project.initiativeNumber || 'Sem número de iniciativa')}</div>
            <div class="v2-detail-meta">
              <div class="m"><span class="lbl">Squad</span><span class="v">${escapeHtml(squadName(project))}</span></div>
              <div class="m"><span class="lbl">Responsável</span><span class="v">${escapeHtml(orNI(project.rteOwner || project.owner))}</span></div>
              <div class="m"><span class="lbl">Fase</span><span class="v">${escapeHtml(phase)}</span></div>
              <div class="m"><span class="lbl">Status</span><span class="v">${escapeHtml(project.status || NAO_INFORMADO)}</span></div>
              <div class="m"><span class="lbl">Saúde</span><span class="v"><span class="dot-status s-${statusTone(status)}"><span class="sw"></span>${statusEmoji(status)} ${escapeHtml(status)}</span></span></div>
              <div class="m"><span class="lbl">Última atualização</span><span class="v">${escapeHtml(formatBRDateTime(project.updatedAt))}</span></div>
            </div>
          </div>
          <div class="v2-detail-actions">
            <a class="v2-btn primary" href="${V1_URL}" target="_blank" rel="noopener">Editar no Tracker (V1) ↗</a>
          </div>
        </div>

        <div class="v2-firstfold">
          <div class="v2-fold-card"><div class="lbl">Progresso</div><div class="v"><div class="v2-progress"><div class="track"><div class="fill" style="width:${progress}%"></div></div><span class="pct">${progress}%</span></div></div><div class="note">${escapeHtml(phaseSummary)}</div></div>
          <div class="v2-fold-card"><div class="lbl">Próximo marco</div><div class="v">${escapeHtml(m ? (m.item || '—') : 'Sem pendência')}</div><div class="note">${m ? escapeHtml(formatBR(m.end || m.start)) : ''}</div></div>
          <div class="v2-fold-card"><div class="lbl">Riscos abertos</div><div class="v">${risks.length}${lateRisks.length ? ` <span style="color:var(--red);font-size:11px">(${lateRisks.length} vencido${lateRisks.length > 1 ? 's' : ''})</span>` : ''}</div></div>
          <div class="v2-fold-card"><div class="lbl">Impedimentos ativos</div><div class="v">${impediments.length}</div></div>
          <div class="v2-fold-card span2"><div class="lbl">Decisão necessária</div><div class="v" style="font-size:13px">${pdca.length ? escapeHtml(pdca[0].observations || `Replanejar/destravar "${pdca[0].item}"`) : 'Nenhuma registrada'}</div></div>
          <div class="v2-fold-card span2"><div class="lbl">Observação executiva</div><div class="v" style="font-size:13px">${feed.length ? escapeHtml(truncate(feed[0].text, 110)) : 'Sem registro'}</div></div>
        </div>

        ${executiveReadingHtml(project, { status, progress, phase, phaseSummary, risks, lateRisks, impediments, pdca, m })}

        <div class="v2-two-col" style="margin-top:16px">
          ${sectionHtml('Cronograma', effectiveSchedule(project).filter(i => !i.jira).length, 'Hoje marcado com linha tracejada', timelineHtml(project))}
          ${sectionHtml('Próximos Marcos', nextMilestones(project, 5).length, 'Até 5 próximos eventos', milestonesHtml(nextMilestones(project, 5)))}
        </div>

        <div class="v2-section">
          <div class="v2-tabs">
            <button type="button" class="v2-tab ${state.route.tab === 'timeline' ? 'active' : ''}" data-tab="timeline">Timeline do Discovery</button>
            <button type="button" class="v2-tab ${state.route.tab === 'risks' ? 'active' : ''}" data-tab="risks">Riscos</button>
            <button type="button" class="v2-tab ${state.route.tab === 'impediments' ? 'active' : ''}" data-tab="impediments">Impedimentos</button>
            <button type="button" class="v2-tab ${state.route.tab === 'actions' ? 'active' : ''}" data-tab="actions">Ações Acordadas</button>
            <button type="button" class="v2-tab ${state.route.tab === 'checklist' ? 'active' : ''}" data-tab="checklist">Checklist</button>
            <button type="button" class="v2-tab ${state.route.tab === 'log' ? 'active' : ''}" data-tab="log">Atualizações / Observações</button>
          </div>
          <div class="v2-tabpanel">${detailTabHtml(project, state.route.tab || 'timeline', feed)}</div>
        </div>

        <div class="v2-footer">Dados lidos em tempo real da mesma base do Tracker operacional · somente leitura nesta versão · <a href="${V1_URL}" style="color:var(--brand);font-weight:600">editar no Tracker (V1) →</a></div>
      </div>`;

    wireDetailInteractions();
  }

  function truncate(str, n) { str = String(str || ''); return str.length > n ? str.slice(0, n - 1) + '…' : str; }

  function executiveReadingHtml(project, ctx) {
    const onde = `${ctx.phase} · ${ctx.phaseSummary}`;
    const avancou = `${ctx.progress}% de maturidade de discovery (checklist, timeline e ações combinadas).`;
    const bloqueando = ctx.impediments.length
      ? `${ctx.impediments.length} impedimento(s) ativo(s): ${ctx.impediments.slice(0, 2).map(i => i.text).filter(Boolean).join('; ') || 'sem descrição registrada'}`
      : 'Nenhum impedimento ativo registrado.';
    const principalRisco = ctx.lateRisks[0] ? `${ctx.lateRisks[0].text} (vencido)` : (ctx.risks[0] ? ctx.risks[0].text : 'Nenhum risco aberto registrado.');
    const proximoPasso = ctx.m ? `${ctx.m.item}${ctx.m.end ? ' até ' + formatBR(ctx.m.end) : ''}` : 'Sem marco de cronograma pendente registrado.';
    const decisao = ctx.pdca.length ? `${ctx.pdca.length} marco(s) exigindo decisão de replanejamento/destrave.` : 'Nenhuma decisão pendente identificada no cronograma.';
    return `<section class="v2-section">
      <div class="v2-section-head"><div class="v2-section-title">Leitura Executiva</div></div>
      <div class="v2-card v2-reading"><dl>
        <div><dt>Onde estamos?</dt><dd>${escapeHtml(onde)}</dd></div>
        <div><dt>O que avançou?</dt><dd>${escapeHtml(avancou)}</dd></div>
        <div><dt>O que está bloqueando?</dt><dd>${escapeHtml(bloqueando)}</dd></div>
        <div><dt>Qual o principal risco?</dt><dd>${escapeHtml(principalRisco)}</dd></div>
        <div><dt>Qual o próximo passo?</dt><dd>${escapeHtml(proximoPasso)}</dd></div>
        <div><dt>Existe decisão necessária?</dt><dd>${escapeHtml(decisao)}</dd></div>
      </dl></div>
    </section>`;
  }

  function timelineHtml(project) {
    const items = effectiveSchedule(project).filter(i => !i.jira);
    const dated = items.filter(i => i.start && i.end).map(i => ({ i, start: parseISODate(i.start), end: parseISODate(i.end) })).filter(x => x.start && x.end);
    if (!dated.length) {
      return `<div class="v2-card">${emptyState('Cronograma pendente', 'Nenhum marco com datas cadastradas ainda.')}</div>`;
    }
    const minDate = new Date(Math.min(...dated.map(x => x.start.getTime()), TODAY.getTime()));
    const maxDate = new Date(Math.max(...dated.map(x => x.end.getTime()), TODAY.getTime()));
    const span = Math.max(1, daysBetween(maxDate, minDate));
    const pct = (d) => Math.min(100, Math.max(0, (daysBetween(d, minDate) / span) * 100));
    const todayPct = Math.min(99, pct(TODAY));
    const todayEdge = todayPct > 85;
    const rows = items.map(item => {
      const st = scheduleStatus(item);
      const has = item.start && item.end;
      const left = has ? pct(parseISODate(item.start)) : 0;
      const width = has ? Math.max(1.2, pct(parseISODate(item.end)) - left) : 0;
      const cls = scheduleCompleted(item) ? 'done' : st.cls === 'late' ? 'late' : st.cls === 'attention' ? 'attention' : st.cls === 'planned' ? 'planned' : '';
      return `<div class="v2-tl-row">
        <div class="name">${escapeHtml(item.item || 'Marco')}${item.synthesized ? ' <span class="badge tone-grey">não cadastrado</span>' : ''}</div>
        <div class="bar-wrap">${has ? `<div class="bar ${cls}" style="left:${left}%;width:${width}%" title="${escapeAttr(formatBR(item.start))} – ${escapeAttr(formatBR(item.end))}"></div>` : ''}</div>
        <div class="meta">${escapeHtml(st.label)}${item.owner ? ' · ' + escapeHtml(item.owner) : ''}</div>
      </div>`;
    }).join('');
    return `<div class="v2-card">
      <div class="v2-timeline-wrap"><div class="v2-timeline-track">
        <div class="v2-timeline-axis"><div class="v2-timeline-today ${todayEdge ? 'edge' : ''}" style="left:${todayPct}%"><span class="lbl">Hoje</span></div></div>
        ${rows}
      </div></div>
      <div class="v2-tl-legend">
        <span><span class="sw" style="background:var(--green)"></span>Concluído</span>
        <span><span class="sw" style="background:var(--blue)"></span>Em andamento / próximo</span>
        <span><span class="sw" style="background:var(--amber)"></span>Atenção</span>
        <span><span class="sw" style="background:var(--red)"></span>Atrasado</span>
        <span><span class="sw" style="background:var(--muted-2)"></span>Planejado</span>
      </div>
    </div>`;
  }

  function milestonesHtml(items) {
    if (!items.length) return emptyState('Sem próximos marcos', 'Nenhum marco futuro com data cadastrada.');
    const row = (item) => {
      const st = scheduleStatus(item);
      return `<div class="v2-milestone-row">
        <div class="date">${escapeHtml(formatBR(item.end || item.start))}</div>
        <div class="body"><div class="t">${escapeHtml(item.item || 'Marco')}</div><div class="s">${escapeHtml(orNI(item.owner))} · <span class="badge tone-${st.cls === 'late' ? 'red' : st.cls === 'attention' ? 'amber' : 'grey'}">${escapeHtml(st.label)}</span></div></div>
      </div>`;
    };
    return `<div class="v2-card v2-milestone-list">${items.map(row).join('')}</div>`;
  }

  function detailTabHtml(project, tab, feed) {
    if (tab === 'risks') return raidTableForProject(project.raids.risks, 'risco');
    if (tab === 'impediments') return raidTableForProject(project.raids.issues, 'impedimento');
    if (tab === 'checklist') return checklistHtml(project);
    if (tab === 'actions') return actionsHtml(project);
    if (tab === 'log') return logHtml(feed);
    return timelineTabHtml(project);
  }

  function timelineTabHtml(project) {
    const items = ensureTimelineItems(project);
    const groups = TIMELINE_STAGES.map(stage => ({ stage, items: items.filter(i => i.stageId === stage.id) }));
    const toneClass = { notstarted: 'grey', progress: 'blue', blocked: 'red', 'waiting-arch': 'amber', 'waiting-business': 'amber', done: 'green' };
    return `<div class="v2-card">${groups.map(g => `
      <div style="padding:12px 18px;border-bottom:1px solid var(--border)">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:8px">${escapeHtml(g.stage.title)}</div>
        <div style="display:flex;flex-direction:column;gap:6px">
        ${g.items.map(it => `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:12.5px">
          <span>${escapeHtml(it.label)}</span>
          <span class="badge tone-${toneClass[it.status] || 'grey'}">${escapeHtml(TIMELINE_STATUS_LABEL[it.status] || it.status)}</span>
        </span></div>`).join('')}
        </div>
      </div>`).join('')}</div>`;
  }

  function raidTableForProject(rows, kind) {
    if (!rows || !rows.length) return emptyState('Sem registro', `Nenhum ${kind} cadastrado para esta iniciativa.`);
    const tr = (r) => `<tr class="${raidIsLate(r) ? 'row-late' : ''}">
        <td class="strong">${escapeHtml(r.text || '—')}</td>
        <td class="nowrap">${escapeHtml(orNI(r.owner))}</td>
        <td class="nowrap">${escapeHtml(r.areaResponsavel || NAO_INFORMADO)}</td>
        <td class="nowrap">${escapeHtml(formatBR(r.due))}</td>
        <td>${escapeHtml(orNI(r.action))}</td>
        <td class="nowrap"><span class="badge tone-${r.done ? 'green' : raidIsLate(r) ? 'red' : 'grey'}">${escapeHtml(r.status)}</span></td>
      </tr>`;
    return `<div class="v2-card v2-table-wrap"><table class="v2-table">
      <thead><tr><th>Descrição</th><th>Responsável</th><th>Área</th><th>Prazo</th><th>Ação</th><th>Situação</th></tr></thead>
      <tbody>${rows.map(tr).join('')}</tbody></table></div>`;
  }

  function checklistHtml(project) {
    if (!project.checklist.length) return emptyState('Sem registro', 'Nenhum item de checklist cadastrado.');
    return `<div class="v2-card v2-checklist">${project.checklist.map(c => `
      <div class="v2-checklist-item ${c.done ? 'done' : ''}"><span class="chk">${c.done ? '✓' : ''}</span><span class="lbl">${escapeHtml(c.title || c.id || 'Item')}</span></div>
    `).join('')}</div>`;
  }

  function actionsHtml(project) {
    const cards = project.cards || [];
    if (!cards.length) return emptyState('Sem registro', 'Nenhuma ação acordada cadastrada.');
    const row = (c) => `<div class="v2-card-mini-row">
        <div class="t">${escapeHtml(c.title || 'Ação sem título')}</div>
        <div>${escapeHtml(orNI(c.owner))}</div>
        <div>${escapeHtml(formatBR(c.due))}</div>
        <div><span class="badge tone-${c.status === 'done' ? 'green' : isCardOverdue(c) ? 'red' : 'grey'}">${escapeHtml((LANES.find(l => l.id === c.status) || {}).title || c.status || '—')}</span></div>
      </div>`;
    return `<div class="v2-card v2-cards-mini">${cards.map(row).join('')}</div>`;
  }

  function logHtml(feed) {
    if (!feed.length) return emptyState('Sem registro', 'Nenhuma observação registrada para esta iniciativa.');
    const row = (o) => `<div class="v2-feed-item">
        <div class="src">${escapeHtml(formatBRDateTime(o.updatedAt))}</div>
        <div class="body"><div class="txt">${escapeHtml(o.text)}</div><div class="meta">${escapeHtml(o.owner || 'Sem responsável registrado')} · ${escapeHtml(o.source)}</div></div>
      </div>`;
    return `<div class="v2-card v2-feed">${feed.map(row).join('')}</div>`;
  }

  function wireDetailInteractions() {
    document.querySelectorAll('.v2-tab').forEach(el => el.addEventListener('click', () => {
      state.route.tab = el.dataset.tab; render();
    }));
  }

  // ============================================================================
  // INIT
  // ============================================================================

  state.route = { ...state.route, ...parseHash() };
  render();
  boot();
  schedulePoll();
  scheduleFullResync();
})();
