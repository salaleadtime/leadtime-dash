from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')

CSS = r'''
<style id="ux-compact-buttons-patch">
/* ── variáveis base ── */
:root{
  --ux-btn-h:26px;--ux-btn-pad-x:10px;--ux-btn-font:10.5px;
  --ux-tab-h:26px;--ux-tab-pad-x:11px;--ux-tab-font:11px
}

/* ── HEADER: linha única, nunca quebra ── */
.top{
  height:48px!important;
  padding:0 1.2rem!important;
  gap:5px!important;
  flex-wrap:nowrap!important;
  overflow:hidden!important
}
.top-logo{width:28px!important;height:28px!important;border-radius:8px!important;font-size:10px!important;flex:0 0 auto!important}
.top-brand{flex:0 0 auto!important}
.top-name{font-size:13px!important;white-space:nowrap!important}
.top-sub{font-size:8px!important;white-space:nowrap!important}
.top-meta{
  height:var(--ux-btn-h)!important;padding:0 10px!important;
  font-size:9.5px!important;display:inline-flex!important;
  align-items:center!important;flex:0 0 auto!important;white-space:nowrap!important
}

/* ── BOTÕES do header ── */
.tbtn{
  min-height:var(--ux-btn-h)!important;height:var(--ux-btn-h)!important;
  padding:0 var(--ux-btn-pad-x)!important;font-size:var(--ux-btn-font)!important;
  gap:5px!important;border-radius:999px!important;line-height:1!important;
  flex:0 0 auto!important;white-space:nowrap!important
}
.tbtn svg{width:10px!important;height:10px!important}
.tbtn span{line-height:1!important}

/* ── ABAS ── */
.tabs{
  top:48px!important;min-height:36px!important;
  padding:4px 1.2rem!important;gap:5px!important
}
.tabbt{
  height:var(--ux-tab-h)!important;min-height:var(--ux-tab-h)!important;
  padding:0 var(--ux-tab-pad-x)!important;font-size:var(--ux-tab-font)!important;
  gap:5px!important;border-radius:999px!important;line-height:1!important;
  white-space:nowrap!important
}
.tab-ct{min-width:16px!important;height:15px!important;padding:0 5px!important;font-size:8.5px!important}

/* ── conteúdo interno (inalterado) ── */
.upbar,.sv-upbar,.st-upbar{padding:.32rem 1.2rem!important;gap:8px!important;min-height:38px!important}
.up-btn,.cal-btn,.mb,.pb,.chip,.fsel,.fdate,.fdate-clear{min-height:28px!important;height:28px!important;padding:0 10px!important;font-size:10px!important;border-radius:999px!important;line-height:1!important;display:inline-flex!important;align-items:center!important;justify-content:center!important}
.chip{padding:0 11px!important}.pb{min-width:28px!important;padding:0 9px!important}
.fsel,.fdate{border-radius:8px!important}
.fsrch{height:30px!important;font-size:11px!important;border-radius:8px!important}
.cal-iact{width:24px!important;height:24px!important;border-radius:7px!important;font-size:11px!important}
.cid-copy{padding:1px 3px!important;font-size:9px!important}
.bdg,.dli-pill,.sv-status-badge,.hist-tag,.premium-pill,.metro-card-date,.metro-card-id{min-height:20px!important;padding:2px 8px!important;font-size:9px!important;border-radius:999px!important}
.fab-cap{padding:9px 14px!important;border-radius:13px!important;font-size:11px!important;gap:7px!important;bottom:22px!important;right:22px!important}
.fab-cap svg{width:14px!important;height:14px!important}
.fab-cap-sub{font-size:8.5px!important}
.ep,.db,.cal-wrap{padding-top:1rem!important}

/* ════════════════════════════════════════
   RESPONSIVO — nunca deixa quebrar linha
   ════════════════════════════════════════ */

/* Monitor grande (>1600px): tudo visível */

/* Tela intermediária: subtítulo some */
@media(max-width:1500px){
  .top-sub{display:none!important}
  .top{gap:5px!important}
}

/* Notebook ~1366px: botões utilitários viram só ícone
   (Google Sheets, Atualizar, Histórico, Copiar) */
@media(max-width:1380px){
  .top button.tbtn:not(.green) span{display:none!important}
  .top button.tbtn:not(.green){padding:0 8px!important;min-width:var(--ux-btn-h)!important;justify-content:center!important}
  .top{gap:4px!important}
}

/* Notebook pequeno ~1280px: nome menor, logo menor */
@media(max-width:1280px){
  .top-logo{width:24px!important;height:24px!important}
  .top-name{font-size:12px!important}
  .top-meta{padding:0 8px!important;font-size:9px!important}
  .top{gap:3px!important}
}

/* ~1100px: links de nav também viram ícone */
@media(max-width:1100px){
  .top a.tbtn span{display:none!important}
  .top a.tbtn{padding:0 8px!important;min-width:var(--ux-btn-h)!important;justify-content:center!important}
  .top-meta{display:none!important}
}

/* Mobile (<760px) */
@media(max-width:760px){
  .top{height:auto!important;min-height:48px!important;padding:7px 1rem!important;flex-wrap:wrap!important}
  .top-name{font-size:12px!important}
  .tabs{top:48px!important;padding:4px 1rem!important}
  .tabbt{height:26px!important;padding:0 10px!important;font-size:10.5px!important}
  .tbtn span{display:none!important}
  .top button.tbtn:not(.green){padding:0 7px!important}
}
</style>
'''

if 'ux-compact-buttons-patch' not in s:
    s = s.replace('</head>', CSS + '\n</head>')
    print('OK: CSS de botões compactos inserido')
else:
    print('OK: CSS de botões compactos já existia')

p.write_text(s, encoding='utf-8')
print('OK: patch UX aplicado')
