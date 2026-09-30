/* SALA Lead Time — aba Portfólio · pf-core.js
   núcleo: configuração, utilitários, normalização e calendário de feriados.
   Módulo clássico (IIFE): nada vaza para o escopo global de index.html além de
   window.SalaPortfolio. Nomes compartilhados entre módulos ficam em PF (namespace interno).
   Ordem de carga: pf-core.js → pf-metrics.js → pf-state.js → pf-import.js → pf-export.js → pf-views.js → pf-panels.js → pf-app.js. */
(function(){
'use strict';
const SP = window.SalaPortfolio = window.SalaPortfolio || {};
const PF = SP.internal = SP.internal || {};

/* =====================================================================
   CONFIGURAÇÃO
   ===================================================================== */
const PORTFOLIO_VERSION = '1.0.0';
const STORE_DATA_SLOT = 'sala_portfolio_cache_v1';
const STORE_PREFS_SLOT = 'sala_portfolio_prefs_v1';
/* Chave compartilhada no Apps Script (VP_SHEET_MAP.portfolioData). */
const CLOUD_SLOT = 'portfolioData';

const WORKFLOW = ['Backlog','Refinamento','Refinada','Desenvolvimento','Homologação','Concluída'];
const OPEN_FLOW = ['Desenvolvimento','Homologação'];
const PHASES = ['Discovery','Desenho da Solução','Definição Técnica','Escrita de Histórias','Refinamento Técnico','Desenvolvimento','Homologação','Implantação','Concluída'];
const SITUATIONS = ['Em andamento','Aguardando negócio','Suspensa','Concluída'];
const RISKS = ['Baixo','Médio','Alto','Crítico'];
/* Situação do prazo — UM vocabulário para todas as visões (painel, tabela, cronograma, Gantt, drawer, PPT).
   Cor sempre acompanhada de texto e ícone: verde = no prazo · amarelo = atenção · azul = replanejada ·
   vermelho = atrasada · cinza = sem previsão / suspensa (off). */
const DEADLINE_META = {
  late:      {label:'Atrasada',     icon:'i-late',      order:1},
  attention: {label:'Atenção',      icon:'i-attention', order:2},
  replanned: {label:'Replanejada',  icon:'i-replan',    order:3},
  none:      {label:'Sem previsão', icon:'i-none',      order:4},
  ok:        {label:'No prazo',     icon:'i-ok',        order:5},
  done:      {label:'Entregue',     icon:'i-done',      order:6},
  suspended: {label:'Suspensa',     icon:'i-suspended', order:7}
};
/* Suspensa = cancelada: fica FORA dos indicadores operacionais (não entra no denominador). */
const DEADLINE_KPI_ORDER = ['ok','attention','replanned','late','none','done'];
const SCOPES = {active:'Todas as Ativas', suspended:'Suspensas', all:'Todas as iniciativas'};
const SQUAD_NONE_LABEL = 'Sem Squad definida';
const DEFAULT_SETTINGS = {
  rules:{
    attentionDaysThreshold:15,
    attentionProgressThreshold:70,
    devStartSlipToleranceDays:7,
    replanToleranceDays:0
  },
  upcomingWindows:[15,30,60,90],
  referenceDate:null
};
const SCHEMA_VERSION = 3;
/* Tom visual do Prazo: o status real define ícone e rótulo; o tom pode ter ajuste manual (somente visual) */
const TONES = {green:{label:'Verde'}, yellow:{label:'Amarelo'}, blue:{label:'Azul'}, red:{label:'Vermelho'}, neutral:{label:'Neutro'}};
const AUTO_TONE = {ok:'green', attention:'yellow', replanned:'blue', late:'red', suspended:'neutral', none:'neutral', done:'green'};
const TONE_LABEL = Object.fromEntries(Object.entries(TONES).map(([k,v]) => [k, v.label]));
const DEFAULT_TEAM = {hoursPerDay:6};
const ABSENCE_KINDS = ['Férias','Ausência','Afastamento'];
const DEFAULT_COLORS = {primary:'#cc092f', secondary:'#1f2733', accent:'#2f5fb3'};
const DEFAULT_PREFS = {
  theme:'light', colors:{...DEFAULT_COLORS}, view:'overview',
  filters:{q:'',squad:'',phase:'',situation:'',deadline:'',sprint:'',year:'',risk:'',area:''},
  columns:null, sort:{col:'deadline',dir:'asc'}, initView:'table', scope:'active', upcomingWindow:60, sprintId:null
};

/* =====================================================================
   UTILITÁRIOS
   ===================================================================== */
/* Referências da montagem (Shadow DOM da aba). Tudo que a aba consulta no DOM parte daqui. */
const DOM = { host:null, root:document, layer:null };
const $ = (s, r) => (r || DOM.root).querySelector(s);
const $$ = (s, r) => Array.from((r || DOM.root).querySelectorAll(s));
const activeEl = () => (DOM.root && DOM.root.activeElement) || document.activeElement;
const ESC = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const esc = v => v == null ? '' : String(v).replace(/[&<>"']/g, c => ESC[c]);
const clone = o => JSON.parse(JSON.stringify(o));
const pad = n => String(n).padStart(2,'0');
const DAY = 864e5;
const MONTHS = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const WEEKDAYS = ['dom','seg','ter','qua','qui','sex','sáb'];
function isoToUTC(iso){ if(!iso) return null; const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? Date.UTC(+m[1], +m[2]-1, +m[3]) : null; }
function utcToISO(t){ return new Date(t).toISOString().slice(0,10); }
function isValidISO(iso){ const t=isoToUTC(iso); return t != null && utcToISO(t) === iso; }
function localTodayISO(){ const d=new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function addDays(iso,n){ return utcToISO(isoToUTC(iso) + n*DAY); }
function daysBetween(a,b){ const x=isoToUTC(a), y=isoToUTC(b); return (x==null||y==null) ? null : Math.round((y-x)/DAY); }
/* Data/hora SEMPRE no formato dd/mm/aaaa, hh:mm — montada à mão, sem toLocale*: o texto não depende do idioma
   do navegador (pt-BR, en-US…). As datas guardadas são ISO (AAAA-MM-DD) e nunca passam por interpretação regional. */
function fmtDateTime(iso){ const d = new Date(iso); return isNaN(d) ? '' : `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtTime(d){ d = d instanceof Date ? d : new Date(d); return isNaN(d) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fmtDate(iso){ if(!iso) return '—'; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y.slice(2)}`; }
function fmtDateFull(iso){ if(!iso) return '—'; const [y,m,d]=iso.split('-'); return `${d}/${m}/${y}`; }
function fmtDayMonth(iso){ if(!iso) return '—'; const [,m,d]=iso.split('-'); return `${d}/${m}`; }
function weekday(iso){ return WEEKDAYS[new Date(isoToUTC(iso)).getUTCDay()]; }
function fmtSigned(n){ return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0'; }
function plural(n, one, many){ return `${n} ${n === 1 ? one : many}`; }
function pct(n){ return n == null ? '—' : `${n}%`; }
function avg(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null; }
function normKey(s){ return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]/g,''); }
/* Ícones inline (sem <use href>, que não resolve de forma consistente dentro de Shadow DOM em todos os navegadores). */
const ICONS = {"i-replan": ["0 0 24 24", "<path d=\"M4 12a8 8 0 0113.7-5.6L20 9\"/><path d=\"M20 4v5h-5\"/><path d=\"M20 12a8 8 0 01-13.7 5.6L4 15\"/><path d=\"M4 20v-5h5\"/>"], "i-ok": ["0 0 24 24", "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M8 12.5l2.6 2.6L16 9.7\"/>"], "i-attention": ["0 0 24 24", "<path d=\"M12 3.5l9.5 16.5h-19z\"/><path d=\"M12 10v4.2\"/><path d=\"M12 17.2v.1\"/>"], "i-late": ["0 0 24 24", "<path d=\"M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2z\"/><path d=\"M12 7.8v5\"/><path d=\"M12 16.2v.1\"/>"], "i-suspended": ["0 0 24 24", "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M10 9v6M14 9v6\"/>"], "i-none": ["0 0 24 24", "<circle cx=\"12\" cy=\"12\" r=\"9\" stroke-dasharray=\"3 3\"/><path d=\"M8.5 12h7\"/>"], "i-done": ["0 0 24 24", "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M7.5 12.3l2.6 2.6L16.5 8.5\"/><path d=\"M12 3v0\"/>"], "i-search": ["0 0 24 24", "<circle cx=\"11\" cy=\"11\" r=\"6.5\"/><path d=\"M20 20l-4.2-4.2\"/>"], "i-filter": ["0 0 24 24", "<path d=\"M4 6h16M7 12h10M10 18h4\"/>"], "i-plus": ["0 0 24 24", "<path d=\"M12 5v14M5 12h14\"/>"], "i-upload": ["0 0 24 24", "<path d=\"M12 15V4M7.5 8.5L12 4l4.5 4.5\"/><path d=\"M4 15v3.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V15\"/>"], "i-download": ["0 0 24 24", "<path d=\"M12 4v11M7.5 10.5L12 15l4.5-4.5\"/><path d=\"M4 15v3.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V15\"/>"], "i-more": ["0 0 24 24", "<circle cx=\"5.5\" cy=\"12\" r=\"1.2\"/><circle cx=\"12\" cy=\"12\" r=\"1.2\"/><circle cx=\"18.5\" cy=\"12\" r=\"1.2\"/>"], "i-close": ["0 0 24 24", "<path d=\"M6 6l12 12M18 6L6 18\"/>"], "i-edit": ["0 0 24 24", "<path d=\"M4 20h4L19 9l-4-4L4 16z\"/><path d=\"M13.5 6.5l4 4\"/>"], "i-lock": ["0 0 24 24", "<rect x=\"5\" y=\"10.5\" width=\"14\" height=\"9.5\" rx=\"1.5\"/><path d=\"M8 10.5V7.5a4 4 0 018 0v3\"/>"], "i-unlock": ["0 0 24 24", "<rect x=\"5\" y=\"10.5\" width=\"14\" height=\"9.5\" rx=\"1.5\"/><path d=\"M8 10.5V7.5a4 4 0 017.6-1.7\"/>"], "i-chevron": ["0 0 24 24", "<path d=\"M6 9l6 6 6-6\"/>"], "i-left": ["0 0 24 24", "<path d=\"M15 6l-6 6 6 6\"/>"], "i-right": ["0 0 24 24", "<path d=\"M9 6l6 6-6 6\"/>"], "i-sort": ["0 0 24 24", "<path d=\"M8 10l4-4 4 4M8 14l4 4 4-4\"/>"], "i-asc": ["0 0 24 24", "<path d=\"M8 14l4-4 4 4\"/>"], "i-desc": ["0 0 24 24", "<path d=\"M8 10l4 4 4-4\"/>"], "i-settings": ["0 0 24 24", "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2.8v2.4M12 18.8v2.4M4.2 7.4l2.1 1.2M17.7 15.4l2.1 1.2M4.2 16.6l2.1-1.2M17.7 8.6l2.1-1.2\"/>"], "i-columns": ["0 0 24 24", "<rect x=\"3.5\" y=\"4.5\" width=\"17\" height=\"15\" rx=\"1.5\"/><path d=\"M9.5 4.5v15M14.5 4.5v15\"/>"], "i-note": ["0 0 24 24", "<path d=\"M5 4h14v11l-5 5H5z\"/><path d=\"M14 20v-5h5M8.5 9h7M8.5 12.5h4\"/>"], "i-calendar": ["0 0 24 24", "<rect x=\"3.5\" y=\"5\" width=\"17\" height=\"15\" rx=\"1.5\"/><path d=\"M3.5 10h17M8 3v4M16 3v4\"/>"], "i-slides": ["0 0 24 24", "<rect x=\"3\" y=\"4.5\" width=\"18\" height=\"12\" rx=\"1.5\"/><path d=\"M12 16.5V20M8.5 20h7\"/>"], "i-reset": ["0 0 24 24", "<path d=\"M4 12a8 8 0 102.6-5.9\"/><path d=\"M4 4.5V9h4.5\"/>"], "i-trash": ["0 0 24 24", "<path d=\"M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13\"/>"], "i-shield": ["0 0 24 24", "<path d=\"M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z\"/>"], "i-info": ["0 0 24 24", "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v5.5M12 7.8v.1\"/>"], "i-error": ["0 0 24 24", "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M9 9l6 6M15 9l-6 6\"/>"], "i-file": ["0 0 24 24", "<path d=\"M6 3h8l4 4v14H6z\"/><path d=\"M14 3v4h4M9 12h6M9 15.5h6\"/>"], "i-flow": ["0 0 24 24", "<path d=\"M4 12h11M11 7l5 5-5 5\"/><path d=\"M20 5v14\"/>"], "i-copy": ["0 0 24 24", "<rect x=\"8\" y=\"8\" width=\"12\" height=\"12\" rx=\"1.5\"/><path d=\"M16 8V5.5A1.5 1.5 0 0014.5 4h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8\"/>"]};
function icon(id, cls='ic'){ const d = ICONS[id] || ICONS['i-info']; return `<svg class="${cls}" viewBox="${d[0]}" aria-hidden="true">${d[1]}</svg>`; }
function shortName(name, max=46){ const s=String(name||''); return s.length > max ? s.slice(0, max-1).trimEnd() + '…' : s; }
function debounce(fn, ms){ let t; return (...a) => { clearTimeout(t); t=setTimeout(()=>fn(...a), ms); }; }
function mulberry32(seed){ return function(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s){ let h=2166136261; for(const c of String(s)){ h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function safeStorageGet(slot){ try { return localStorage.getItem(slot); } catch(e){ return null; } }
function safeStorageSet(slot, v){ try { localStorage.setItem(slot, v); return true; } catch(e){ return false; } }

/* =====================================================================
   NORMALIZAÇÃO
   ===================================================================== */
const PHASE_ALIASES = {
  discovery:'Discovery', descoberta:'Discovery',
  solucao:'Desenho da Solução', desenhodasolucao:'Desenho da Solução', desenhosolucao:'Desenho da Solução',
  deftecnica:'Definição Técnica', definicaotecnica:'Definição Técnica',
  escritadehist:'Escrita de Histórias', escritadehistorias:'Escrita de Histórias', escritahist:'Escrita de Histórias',
  reftecnico:'Refinamento Técnico', refinamentotecnico:'Refinamento Técnico',
  dev:'Desenvolvimento', desenvolvimento:'Desenvolvimento', emdesenvolvimento:'Desenvolvimento',
  homologacao:'Homologação', emhomologacao:'Homologação', implantacao:'Implantação', concluida:'Concluída', concluido:'Concluída'
};
const SITUATION_ALIASES = {
  emandamento:'Em andamento', andamento:'Em andamento', emandamentoentreareas:'Em andamento', acompanhar:'Em andamento', noprazo:'Em andamento',
  aguardandonegocio:'Aguardando negócio', aguardandoareadenegocio:'Aguardando negócio', aguardando:'Aguardando negócio',
  suspensa:'Suspensa', suspenso:'Suspensa', pausada:'Suspensa', pausado:'Suspensa', cancelada:'Suspensa', cancelado:'Suspensa',
  concluida:'Concluída', concluido:'Concluída', entregue:'Concluída'
};
const RISK_ALIASES = {baixo:'Baixo', low:'Baixo', medio:'Médio', medium:'Médio', atencao:'Médio', alto:'Alto', high:'Alto', critico:'Crítico', critical:'Crítico'};
const STATUS_ALIASES = {
  backlog:'Backlog', productbacklog:'Backlog', todo:'Backlog', afazer:'Backlog', novo:'Backlog',
  refinamento:'Refinamento', emrefinamento:'Refinamento', emanalise:'Refinamento', analise:'Refinamento',
  refinada:'Refinada', refinado:'Refinada', prontoparadev:'Refinada', readyfordev:'Refinada', pronto:'Refinada',
  desenvolvimento:'Desenvolvimento', emdesenvolvimento:'Desenvolvimento', dev:'Desenvolvimento', emdev:'Desenvolvimento', inprogress:'Desenvolvimento', emandamento:'Desenvolvimento',
  homologacao:'Homologação', emhomologacao:'Homologação', uat:'Homologação', qa:'Homologação', emteste:'Homologação', teste:'Homologação',
  concluida:'Concluída', concluido:'Concluída', done:'Concluída', finalizada:'Concluída', finalizado:'Concluída', entregue:'Concluída', fechado:'Concluída', fechada:'Concluída'
};
const BLOCKED_STATUS_KEYS = ['bloqueada','bloqueado','impedido','impedida','blocked'];
function canon(value, aliases, list){
  if(value == null || value === '') return {value:null, known:true};
  if(list && list.includes(value)) return {value, known:true};
  const k = normKey(value); if(aliases[k]) return {value:aliases[k], known:true};
  return {value:String(value).trim(), known:false};
}
function toText(v){ return v == null ? '' : String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').trim(); }
function parseBool(v){ if(typeof v === 'boolean') return v; const k=normKey(v); return ['sim','s','true','1','x','yes','y','bloqueada','bloqueado'].includes(k); }
function parseSquads(v){ if(Array.isArray(v)) return v.map(toText).filter(Boolean); return toText(v).split(/\s*[+,;/]\s*/).map(s=>s.trim()).filter(Boolean); }
function normalizeDate(v){
  if(v == null || v === '') return {ok:true, value:null};
  if(v instanceof Date){ if(isNaN(v)) return {ok:false, value:null}; const d=new Date(v.getTime()+3600e3); return {ok:true, value:`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}; }
  if(typeof v === 'number' && isFinite(v)){ if(v < 20000 || v > 80000) return {ok:false, value:null}; return {ok:true, value:utcToISO(Date.UTC(1899,11,30) + Math.round(v)*DAY)}; }
  const s = String(v).trim(); if(!s || s === '—' || s === '-') return {ok:true, value:null};
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if(m){ const iso=`${m[1]}-${pad(m[2])}-${pad(m[3])}`; return isValidISO(iso) ? {ok:true, value:iso} : {ok:false, value:null}; }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if(m){ const y = m[3].length === 2 ? `20${m[3]}` : m[3]; const iso=`${y}-${pad(m[2])}-${pad(m[1])}`; return isValidISO(iso) ? {ok:true, value:iso} : {ok:false, value:null}; }
  return {ok:false, value:null};
}
function normalizeInitiative(r){
  return {
    id: toText(r.id), name: toText(r.name), squads: parseSquads(r.squads), po: toText(r.po), techLead: toText(r.techLead),
    phase: canon(r.phase, PHASE_ALIASES, PHASES).value || 'Discovery',
    situation: canon(r.situation, SITUATION_ALIASES, SITUATIONS).value || 'Em andamento',
    discoveryStart: r.discoveryStart || null, discoveryEnd: r.discoveryEnd || null,
    devPlanned: r.devPlanned || null, devActual: r.devActual || null,
    deliveryPlanned: r.deliveryPlanned || null, deliveryCurrent: r.deliveryCurrent || null, deliveryActual: r.deliveryActual || null,
    deliveryHistory: Array.isArray(r.deliveryHistory) ? r.deliveryHistory.filter(h => h && h.type) : [],
    risk: canon(r.risk, RISK_ALIASES, RISKS).value, owners: normalizeOwners(r), cause: toText(r.cause), notes: toText(r.notes),
    deadlineColorOverride: TONES[r.deadlineColorOverride] ? r.deadlineColorOverride : null,
    notesLog: Array.isArray(r.notesLog) ? r.notesLog : []
  };
}
/* Responsável e Área são campos independentes; pares {name, area} preservam a associação pessoa ↔ área. */
function parseOwnerText(text){
  const out = [];
  toText(text).split(/\s*[;·]\s*|\n/).map(t => t.trim()).filter(Boolean).forEach(chunk => {
    let names = chunk, area = '';
    let m = /^(.*?)\s+[—–-]\s+(.+)$/.exec(chunk);
    if(m){ names = m[1]; area = m[2]; }
    else if((m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(chunk))){ names = m[1]; area = m[2]; }
    names.split(/\s*(?:\/|,|\s+e\s+)\s*/).map(n => n.trim()).filter(Boolean).forEach(n => out.push({name:n, area:area.trim()}));
  });
  return out;
}
function normalizeOwners(r){
  if(Array.isArray(r.owners)) return r.owners.map(o => ({name:toText(o && o.name), area:toText(o && o.area)})).filter(o => o.name || o.area);
  if(r.ownerAreas != null && toText(r.ownerAreas) !== ''){
    const names = toText(r.owner).split(/\s*;\s*|\n/).filter(Boolean), areas = toText(r.ownerAreas).split(/\s*;\s*|\n/);
    if(names.length === 1 && areas.filter(Boolean).length > 1) return areas.filter(Boolean).map(a => ({name:names[0].trim(), area:a.trim()}));
    return names.map((n,k) => ({name:n.trim(), area:toText(areas[k] ?? (areas.length === 1 ? areas[0] : ''))}));
  }
  return parseOwnerText(r.owner);
}
function ownerNames(i){ return i.owners.map(o => o.name).filter(Boolean); }
function ownerAreas(i){ return [...new Set(i.owners.map(o => o.area).filter(Boolean))]; }
function normalizeStory(r){
  return {
    id: toText(r.id), initiativeId: toText(r.initiativeId), title: toText(r.title), epic: toText(r.epic),
    plannedSprint: toText(r.plannedSprint) || null, sprint: toText(r.sprint) || toText(r.plannedSprint) || null,
    status: WORKFLOW.includes(r.status) ? r.status : 'Backlog', blocked: !!r.blocked, blockedReason: toText(r.blockedReason), blockedSince: r.blockedSince || null,
    createdAt: r.createdAt || null, devStartAt: r.devStartAt || null, homologAt: r.homologAt || null, doneAt: r.doneAt || null,
    squad: toText(r.squad) || null,
    owner: toText(r.owner), notes: toText(r.notes), demo: !!r.demo
  };
}

/* =====================================================================
   CALENDÁRIO DE FERIADOS NACIONAIS (BR) — fonte única, qualquer ano.
   Escopo: feriados nacionais (Lei 662/1949, 6.802/1980, 14.759/2023 +
   Sexta-feira Santa). Não inclui estaduais, municipais nem pontos
   facultativos (Carnaval, Corpus Christi) — extensível via holidayCalendar.
   ===================================================================== */
function easterSunday(y){
  const a=y%19, b=Math.floor(y/100), c=y%100, d=Math.floor(b/4), e=b%4, f=Math.floor((b+8)/25), g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30, i=Math.floor(c/4), k=c%4, l=(32+2*e+2*i-h-k)%7, m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31), day=((h+l-7*m+114)%31)+1;
  return `${y}-${pad(month)}-${pad(day)}`;
}
const _holidayCache = new Map();
function getNationalHolidays(year){
  if(_holidayCache.has(year)) return _holidayCache.get(year);
  const list = [
    [`${year}-01-01`,'Confraternização Universal'],
    [addDays(easterSunday(year), -2),'Sexta-feira Santa'],
    [`${year}-04-21`,'Tiradentes'],
    [`${year}-05-01`,'Dia do Trabalho'],
    [`${year}-09-07`,'Independência do Brasil'],
    [`${year}-10-12`,'Nossa Senhora Aparecida'],
    [`${year}-11-02`,'Finados'],
    [`${year}-11-15`,'Proclamação da República'],
    ...(year >= 2024 ? [[`${year}-11-20`,'Dia Nacional de Zumbi e da Consciência Negra']] : []),
    [`${year}-12-25`,'Natal']
  ];
  const map = new Map(list.map(([d,n]) => [d, {date:d, name:n, scope:'nacional'}]));
  _holidayCache.set(year, map);
  return map;
}
const holidayCalendar = { sources:[getNationalHolidays], get(iso){ for(const src of this.sources){ const h = src(+iso.slice(0,4)).get(iso); if(h) return h; } return null; } };
function isWeekday(iso){ const d = new Date(isoToUTC(iso)).getUTCDay(); return d >= 1 && d <= 5; }
function eachDay(from, to){ const out=[]; if(!from || !to || to < from) return out; for(let d=from; d<=to; d=addDays(d,1)) out.push(d); return out; }
/* Cadência ≠ capacidade: o período da sprint nunca muda; feriados e ausências só reduzem dias/horas disponíveis. */
function calculateSprintCalendar(sprint){
  const days = eachDay(sprint.start, sprint.end);
  const weekdays = days.filter(isWeekday);
  const holidays = [], weekendHolidays = [];
  days.forEach(d => { const h = holidayCalendar.get(d); if(h) (isWeekday(d) ? holidays : weekendHolidays).push(h); });
  const holidaySet = new Set(holidays.map(h => h.date));
  const available = weekdays.filter(d => !holidaySet.has(d));
  return {days, weekdays, holidays, weekendHolidays, available};
}
function calculateSprintCapacity(sprint, absences, today){
  const cal = calculateSprintCalendar(sprint);
  const members = (sprint.capacity && sprint.capacity.members) || [];
  const availSet = new Set(cal.available);
  const rows = members.map(mb => {
    const absentDays = new Set();
    const kinds = {};
    (absences || []).filter(a => a.memberId === mb.id).forEach(a => eachDay(a.from, a.to).forEach(d => {
      if(availSet.has(d) && !absentDays.has(d)){ absentDays.add(d); kinds[a.kind] = (kinds[a.kind] || 0) + 1; }
    }));
    const hpd = +mb.hoursPerDay || 0;
    const days = cal.available.length - absentDays.size;
    return {member:mb, hoursPerDay:hpd, absentDays:absentDays.size, absenceKinds:kinds, availableDays:days, hours:days*hpd,
      remainingDays: today ? cal.available.filter(d => d >= today && !absentDays.has(d)).length : null};
  });
  const hpdSum = rows.reduce((a,r) => a + r.hoursPerDay, 0);
  const total = rows.reduce((a,r) => a + r.hours, 0);
  return {
    calendar:cal, rows, members:rows.length,
    workingDaysTheoretical:cal.weekdays.length, workingDays:cal.available.length,
    theoreticalHours: cal.weekdays.length * hpdSum,
    holidayLossHours: cal.holidays.length * hpdSum,
    absenceLossHours: rows.reduce((a,r) => a + r.absentDays * r.hoursPerDay, 0),
    totalHours: total,
    remainingWorkingDays: today ? cal.available.filter(d => d >= today).length : null
  };
}

/* exporta para os demais módulos */
Object.assign(PF, {SCOPES, SQUAD_NONE_LABEL, fmtDateTime, fmtTime, PORTFOLIO_VERSION, STORE_DATA_SLOT, STORE_PREFS_SLOT, CLOUD_SLOT, WORKFLOW, OPEN_FLOW, PHASES, SITUATIONS, RISKS, DEADLINE_META, DEADLINE_KPI_ORDER, DEFAULT_SETTINGS, SCHEMA_VERSION, TONES, AUTO_TONE, TONE_LABEL, DEFAULT_TEAM, ABSENCE_KINDS, DEFAULT_COLORS, DEFAULT_PREFS, DOM, $, $$, activeEl, ESC, esc, clone, pad, DAY, MONTHS, WEEKDAYS, isoToUTC, utcToISO, isValidISO, localTodayISO, addDays, daysBetween, fmtDate, fmtDateFull, fmtDayMonth, weekday, fmtSigned, plural, pct, avg, normKey, ICONS, icon, shortName, debounce, mulberry32, hashStr, safeStorageGet, safeStorageSet, PHASE_ALIASES, SITUATION_ALIASES, RISK_ALIASES, STATUS_ALIASES, BLOCKED_STATUS_KEYS, canon, toText, parseBool, parseSquads, normalizeDate, normalizeInitiative, parseOwnerText, normalizeOwners, ownerNames, ownerAreas, normalizeStory, easterSunday, _holidayCache, getNationalHolidays, holidayCalendar, isWeekday, eachDay, calculateSprintCalendar, calculateSprintCapacity});
})();
