#!/usr/bin/env node
/*
 * Boletim Diário DS — pipeline de geração e envio.
 *
 * Passos (correspondem à seção 5 da especificação):
 *  1-2. busca dados existentes (mesmo backend GAS já usado pelo dashboard);
 *  3-4. valida disponibilidade e campos obrigatórios;
 *  5-6. seleciona registros e remove duplicidades (regras em ../../../boletim-ds/rules.js);
 *  7-8. monta o HTML do boletim (mesma identidade visual da página isolada);
 *  9.   gera PNG via Playwright;
 *  10.  monta e-mail (HTML + PNG inline, com fallback textual);
 *  11.  envia via SMTP (somente se todas as credenciais/destinatários estiverem configurados);
 *  12.  registra o resultado (stdout + arquivo de log/estado, sem dados sensíveis).
 *
 * Este script é só leitura em relação às fontes de dados: nunca grava em
 * backlog, stories ou discoveryPmo. O único arquivo que ele escreve é o
 * próprio estado de deduplicação de envio (.state/last-sent.json) e os
 * artefatos de saída (out/).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const BOLETIM_DIR = path.join(REPO_ROOT, 'boletim-ds');
const OUT_DIR = path.join(__dirname, 'out');
const STATE_FILE = path.join(__dirname, '.state', 'last-sent.json');

const BK_GAS_URL = process.env.BOLETIM_DS_GAS_URL ||
  'https://script.google.com/macros/s/AKfycbxOSQe41hqngh7b0iscE_Bcb_Z2mBfbwfqaaMCU_cKXDfCKnDvsQ6jb2HTPbnLso30C/exec';

const rules = require(path.join(BOLETIM_DIR, 'rules.js'));

function log(step, msg, extra) {
  const line = `[boletim-ds] ${new Date().toISOString()} ${step}: ${msg}`;
  console.log(line, extra ? JSON.stringify(extra) : '');
}

async function fetchJson(url) {
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao consultar ${url}`);
  const json = await res.json();
  if (!json || json.ok === false) throw new Error(json && json.error ? json.error : 'resposta sem sucesso (ok:false)');
  return json;
}

async function loadSourceData() {
  const [backlogRes, storiesRes, discRes] = await Promise.all([
    fetchJson(`${BK_GAS_URL}?action=getBacklog`),
    fetchJson(`${BK_GAS_URL}?action=getStories`),
    fetchJson(`${BK_GAS_URL}?action=getVpData&key=discoveryPmo`)
  ]);

  const snaps = Array.isArray(backlogRes.backlog) ? backlogRes.backlog.slice() : [];
  snaps.sort((a, b) => new Date(a.importedAt || 0) - new Date(b.importedAt || 0));
  const currentSnap = snaps.length ? snaps[snaps.length - 1] : null;
  const epicos = currentSnap && Array.isArray(currentSnap.stories) ? currentSnap.stories : [];
  const stories = Array.isArray(storiesRes.stories) ? storiesRes.stories : [];
  const projects = (discRes.data && Array.isArray(discRes.data.projects)) ? discRes.data.projects : [];

  return { epicos, stories, projects, currentSnap };
}

function validateAvailability({ epicos, stories, projects, currentSnap }) {
  const problems = [];
  if (!currentSnap) problems.push('nenhum snapshot de backlog disponível — dados indisponíveis ou desatualizados');
  if (!Array.isArray(stories)) problems.push('lista de stories inválida');
  if (!Array.isArray(projects)) problems.push('lista de projetos do Discovery PMO inválida');
  return problems;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderStandaloneHtml({ selCrit, selRef, selHom }, generatedAt) {
  const dateStr = generatedAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  function rowsCriticos() {
    if (!selCrit.itens.length) return '<div class="bds-empty">✅ Nenhum ponto crítico no momento.</div>';
    return '<table><thead><tr><th>SLOPC</th><th>Item</th><th>Ponto focal</th></tr></thead><tbody>' +
      selCrit.itens.map((r) => {
        const kind = r.lt >= rules.META_LEAD_TIME ? 'red' : 'amber';
        const tag = r.lt >= rules.META_LEAD_TIME ? `${r.lt}d` : 'impedimento';
        return `<tr><td><span class="bds-slopc">${esc(r.slopc)}</span> <span class="bds-pill ${kind}">${tag}</span></td>` +
          `<td>${esc(r.nome)}</td>` +
          `<td${r.pontoFocalAusente ? ' class="bds-focal-missing"' : ''}>${esc(r.pontoFocal)}</td></tr>`;
      }).join('') + '</tbody></table>';
  }

  function rowsRefinamento() {
    if (!selRef.itens.length) return '<div class="bds-empty">Sem iniciativa em refinamento técnico no momento.</div>';
    return '<table><thead><tr><th>Iniciativa</th><th>Squad</th><th>Ponto focal</th></tr></thead><tbody>' +
      selRef.itens.map((r) => `<tr><td><span class="bds-slopc">${esc(r.numero)}</span><br>${esc(r.nome)}<br><span class="bds-pill amber">${esc(r.etapa)}</span></td>` +
        `<td>${esc(r.squad)}</td>` +
        `<td${r.pontoFocalAusente ? ' class="bds-focal-missing"' : ''}>${esc(r.pontoFocal)}</td></tr>`).join('') + '</tbody></table>';
  }

  function rowsHomologacao() {
    if (!selHom.itens.length) return '<div class="bds-empty">✅ Nenhum item de homologação fora do prazo.</div>';
    return '<table><thead><tr><th>SLOPC</th><th>Item</th><th>Atraso</th><th>Ponto focal</th></tr></thead><tbody>' +
      selHom.itens.map((r) => `<tr><td><span class="bds-slopc">${esc(r.slopc)}</span></td>` +
        `<td>${esc(r.nome)}</td>` +
        `<td><span class="bds-pill red">${r.diasAtraso} ${r.diasAtraso === 1 ? 'dia útil' : 'dias úteis'}</span></td>` +
        `<td${r.pontoFocalAusente ? ' class="bds-focal-missing"' : ''}>${esc(r.pontoFocal)}</td></tr>`).join('') + '</tbody></table>';
  }

  // Reaproveita literalmente o CSS escopado de boletim-ds/index.html (mesma
  // identidade visual), só trocando a fonte dos dados (estático em vez de
  // JSONP) para o Playwright renderizar sem depender de rede no momento do
  // screenshot.
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Boletim Diário DS</title>
<style>
  #boletim-ds-root, #boletim-ds-root *{box-sizing:border-box}
  #boletim-ds-root{
    --bds-bg:#f5f7fb;--bds-panel:#fff;--bds-ink:#1c2430;--bds-muted:#687587;
    --bds-header:#20242c;--bds-primary:#bf1830;--bds-primary-dark:#8e1125;
    --bds-amber:#f4b740;--bds-amber-ink:#9a6a12;--bds-amber-soft:#fff7e6;
    --bds-green:#1f9d75;--bds-green-ink:#147557;--bds-green-soft:#e9f8f2;
    --bds-red-soft:#fdeaea;--bds-line:#e4e8f0;
    background:var(--bds-bg);color:var(--bds-ink);
    font:14px/1.5 Inter,"Segoe UI",Arial,sans-serif;
    max-width:1040px;margin:0 auto;padding:18px;
  }
  #boletim-ds-root .bds-header{background:var(--bds-header);color:#fff;border-radius:12px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}
  #boletim-ds-root .bds-brand{display:flex;align-items:center;gap:10px}
  #boletim-ds-root .bds-robot{width:30px;height:30px;flex:none;border-radius:8px;background:var(--bds-primary);display:flex;align-items:center;justify-content:center;font-size:15px}
  #boletim-ds-root .bds-title{font-size:16px;font-weight:800;margin:0;letter-spacing:.01em}
  #boletim-ds-root .bds-subtitle{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#c8ccd4;margin:2px 0 0}
  #boletim-ds-root .bds-date{font-size:12px;font-weight:700;color:#e7e9ee;text-align:right;white-space:nowrap}
  #boletim-ds-root .bds-date small{display:block;font-size:9px;font-weight:600;color:#9aa0ac;margin-top:2px}
  #boletim-ds-root .bds-panel{background:var(--bds-panel);border:1px solid var(--bds-line);border-radius:10px;padding:14px 16px;margin-bottom:14px}
  #boletim-ds-root .bds-panel h2{font-size:13px;font-weight:800;margin:0 0 3px;color:var(--bds-ink)}
  #boletim-ds-root .bds-panel .bds-hint{font-size:10.5px;color:var(--bds-muted);margin:0 0 10px}
  #boletim-ds-root .bds-cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  #boletim-ds-root table{width:100%;border-collapse:collapse;font-size:11.5px}
  #boletim-ds-root th{text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--bds-muted);font-weight:800;padding:6px 8px;border-bottom:1px solid var(--bds-line)}
  #boletim-ds-root td{padding:7px 8px;border-bottom:1px solid var(--bds-line);vertical-align:top}
  #boletim-ds-root tr:last-child td{border-bottom:none}
  #boletim-ds-root .bds-slopc{font-weight:800;color:var(--bds-primary);white-space:nowrap}
  #boletim-ds-root .bds-pill{display:inline-block;font-size:9.5px;font-weight:800;padding:2px 7px;border-radius:999px}
  #boletim-ds-root .bds-pill.red{background:var(--bds-red-soft);color:var(--bds-primary-dark)}
  #boletim-ds-root .bds-pill.amber{background:var(--bds-amber-soft);color:var(--bds-amber-ink)}
  #boletim-ds-root .bds-pill.green{background:var(--bds-green-soft);color:var(--bds-green-ink)}
  #boletim-ds-root .bds-focal-missing{color:var(--bds-amber-ink);font-weight:700}
  #boletim-ds-root .bds-empty{padding:14px 6px;color:var(--bds-muted);font-size:11.5px;text-align:center}
</style>
</head><body>
<div id="boletim-ds-root">
  <div class="bds-header">
    <div class="bds-brand"><div class="bds-robot" aria-hidden="true">🤖</div>
      <div><p class="bds-title">Boletim Diário DS</p><p class="bds-subtitle">Solução criada por DS</p></div>
    </div>
    <div class="bds-date">${dateStr}<small>Gerado automaticamente</small></div>
  </div>
  <div class="bds-panel"><h2>Pontos críticos do dia</h2>
    <p class="bds-hint">Itens classificados como críticos pelas regras já existentes do dashboard.</p>
    ${rowsCriticos()}
  </div>
  <div class="bds-cols">
    <div class="bds-panel"><h2>Discoveries em refinamento</h2>
      <p class="bds-hint">Iniciativas na fase de Refinamento Técnico, conforme o Cronograma do Discovery PMO.</p>
      ${rowsRefinamento()}
    </div>
    <div class="bds-panel"><h2>Homologação fora do prazo</h2>
      <p class="bds-hint">Itens em Homologação com o SLA de dias úteis já vencido.</p>
      ${rowsHomologacao()}
    </div>
  </div>
</div>
</body></html>`;
}

async function renderPng(html) {
  const { chromium } = await import('playwright');
  await fs.mkdir(OUT_DIR, { recursive: true });
  const htmlPath = path.join(OUT_DIR, 'boletim.html');
  await fs.writeFile(htmlPath, html, 'utf8');

  const launchOptions = process.env.BOLETIM_DS_CHROMIUM_PATH
    ? { executablePath: process.env.BOLETIM_DS_CHROMIUM_PATH }
    : {};
  const browser = await chromium.launch(launchOptions);
  try {
    const page = await browser.newPage({ viewport: { width: 1040, height: 800 } });
    await page.goto(`file://${htmlPath}`);
    const el = await page.$('#boletim-ds-root');
    const pngPath = path.join(OUT_DIR, 'boletim.png');
    await el.screenshot({ path: pngPath });
    return pngPath;
  } finally {
    await browser.close();
  }
}

function buildEmailHtml({ selCrit, selRef, selHom }, generatedAt, imagemDisponivel, systemLink) {
  const dateStr = generatedAt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  function listaTexto(itens, campos) {
    if (!itens.length) return '<p style="color:#687587;font-size:12px">Nenhum item nesta categoria.</p>';
    return '<ul style="margin:0;padding-left:18px;font-size:12px;color:#1c2430">' +
      itens.map((it) => `<li>${campos(it)}</li>`).join('') + '</ul>';
  }
  const linkHtml = systemLink ? `<p style="font-size:11px;color:#687587">Consultar o sistema: <a href="${esc(systemLink)}">${esc(systemLink)}</a></p>` : '';
  return `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto">
    <div style="background:#20242c;color:#fff;border-radius:10px;padding:14px 18px;margin-bottom:14px">
      <strong>Boletim Diário DS</strong><br><span style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#c8ccd4">Solução criada por DS</span>
      <div style="font-size:12px;margin-top:4px;color:#e7e9ee">${dateStr}</div>
    </div>
    ${imagemDisponivel ? '<img src="cid:boletim-ds-png" alt="Boletim Diário DS" style="max-width:100%;border:1px solid #e4e8f0;border-radius:8px" />' :
      '<p style="color:#9a6a12;background:#fff7e6;padding:8px 12px;border-radius:8px;font-size:12px">A imagem do boletim não pôde ser gerada nesta execução. Segue o resumo em texto abaixo.</p>'}
    <h3 style="font-size:13px;color:#1c2430">Pontos críticos do dia</h3>
    ${listaTexto(selCrit.itens, (r) => `<strong>${esc(r.slopc)}</strong> — ${esc(r.nome)} · ${esc(r.pontoFocal)}`)}
    <h3 style="font-size:13px;color:#1c2430">Discoveries em refinamento</h3>
    ${listaTexto(selRef.itens, (r) => `<strong>${esc(r.numero)}</strong> — ${esc(r.nome)} (${esc(r.squad)}) · ${esc(r.pontoFocal)}`)}
    <h3 style="font-size:13px;color:#1c2430">Homologação fora do prazo</h3>
    ${listaTexto(selHom.itens, (r) => `<strong>${esc(r.slopc)}</strong> — ${esc(r.nome)} · ${r.diasAtraso}d de atraso · ${esc(r.pontoFocal)}`)}
    ${linkHtml}
  </div>`;
}

async function readState() {
  try { return JSON.parse(await fs.readFile(STATE_FILE, 'utf8')); } catch { return {}; }
}
async function writeState(state) {
  await fs.mkdir(path.dirname(STATE_FILE), { recursive: true });
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

async function sendEmail({ html, pngPath, subject }) {
  const host = process.env.BOLETIM_DS_SMTP_HOST;
  const port = process.env.BOLETIM_DS_SMTP_PORT;
  const user = process.env.BOLETIM_DS_SMTP_USER;
  const pass = process.env.BOLETIM_DS_SMTP_PASS;
  const recipients = (process.env.BOLETIM_DS_RECIPIENTS || '').split(',').map((s) => s.trim()).filter(Boolean);

  if (!host || !port || !user || !pass || !recipients.length) {
    log('envio', 'SMTP/destinatários não configurados — envio não realizado (configuração pendente de aprovação)');
    return { sent: false, reason: 'config-ausente' };
  }

  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.default.createTransport({
    host, port: Number(port), secure: Number(port) === 465,
    auth: { user, pass }
  });

  const attachments = [];
  let imagemDisponivel = false;
  if (pngPath) {
    attachments.push({ filename: 'boletim-ds.png', path: pngPath, cid: 'boletim-ds-png' });
    imagemDisponivel = true;
  }

  await transporter.sendMail({
    from: user,
    to: recipients.join(','),
    subject,
    html,
    attachments
  });
  return { sent: true, recipients: recipients.length, imagemDisponivel };
}

async function main() {
  const generatedAt = new Date();
  const todayKey = generatedAt.toISOString().slice(0, 10);
  const state = await readState();

  if (state.lastSentDate === todayKey && process.env.BOLETIM_DS_FORCE !== '1') {
    log('dedupe', `boletim de ${todayKey} já enviado anteriormente — envio duplicado bloqueado`);
    return;
  }

  log('fetch', 'consultando fontes existentes (backlog, stories, discoveryPmo)');
  const source = await loadSourceData();

  const problems = validateAvailability(source);
  if (problems.length) {
    log('validacao', 'dados indisponíveis ou desatualizados — geração interrompida', problems);
    process.exitCode = 1;
    return;
  }

  const selCrit = rules.selectCriticos(source.epicos, buildFocalByEpic(source.stories));
  const selRef = rules.selectRefinamento(source.projects, generatedAt);
  const selHom = rules.selectHomologacaoAtrasada(source.stories, generatedAt);

  const totalInconsistencias = selCrit.inconsistencias.length + selRef.inconsistencias.length + selHom.inconsistencias.length;
  if (totalInconsistencias) {
    log('validacao', `${totalInconsistencias} inconsistência(s) registrada(s) (não corrigidas automaticamente)`,
      { criticos: selCrit.inconsistencias.length, refinamento: selRef.inconsistencias.length, homologacao: selHom.inconsistencias.length });
  }

  log('selecao', 'registros selecionados', {
    criticos: selCrit.itens.length, refinamento: selRef.itens.length, homologacaoAtrasada: selHom.itens.length
  });

  const html = renderStandaloneHtml({ selCrit, selRef, selHom }, generatedAt);

  let pngPath = null;
  try {
    pngPath = await renderPng(html);
    log('imagem', 'PNG gerado com sucesso', { pngPath });
  } catch (err) {
    log('imagem', 'falha ao gerar a imagem — mantendo boletim em HTML', { erro: String(err && err.message || err) });
  }

  const systemLink = process.env.BOLETIM_DS_SYSTEM_LINK || '';
  const emailHtml = buildEmailHtml({ selCrit, selRef, selHom }, generatedAt, !!pngPath, systemLink);

  const result = await sendEmail({
    html: emailHtml,
    pngPath,
    subject: `Boletim Diário DS — ${generatedAt.toLocaleDateString('pt-BR')}`
  });

  log('envio', result.sent ? 'e-mail enviado com sucesso' : 'e-mail não enviado', result);

  if (result.sent) {
    await writeState({ lastSentDate: todayKey, sentAt: generatedAt.toISOString() });
  }
}

function buildFocalByEpic(stories) {
  const map = {};
  (stories || []).forEach((s) => {
    const epic = String(s.epic || '').trim();
    if (epic && s.responsavel && !map[epic]) map[epic] = s.responsavel;
  });
  return map;
}

main().catch((err) => {
  log('erro', 'falha não tratada no pipeline', { erro: String(err && err.stack || err) });
  process.exitCode = 1;
});
