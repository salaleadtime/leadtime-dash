from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')

CSS = r'''
<style id="layout-grafite-dashboard-patch">
/* ── variáveis ── */
:root{
  --grafite-exato:#141922;
  --grafite-card:rgba(255,255,255,.07);
  --grafite-card-hover:rgba(255,255,255,.13);
  --bradesco-red:#cc092f;
  --bradesco-pink:#d80b57;
  --bradesco-red-dark:#a6002b;
  --bg-page:#f4f6fa;
  --line-soft:#e3e8ef
}
html,body{background:var(--bg-page)!important}

/* ── HEADER: fino, discreto, 56 px ── */
.top{
  background:var(--grafite-exato)!important;
  background-image:none!important;
  border-bottom:1px solid rgba(255,255,255,.05)!important;
  box-shadow:0 2px 12px rgba(0,0,0,.28)!important;
  height:56px!important;
  padding:0 1.4rem!important;
  gap:8px!important
}
.top::before,.top::after{display:none!important;content:none!important;background:none!important}

/* logo menor */
.top-logo{
  background:linear-gradient(135deg,var(--bradesco-red),var(--bradesco-pink))!important;
  color:#fff!important;border:0!important;box-shadow:none!important;
  width:32px!important;height:32px!important;border-radius:8px!important;
  font-size:11px!important;font-weight:900!important
}

/* nome compacto */
.top-name{
  color:#fff!important;
  font-size:14px!important;
  font-weight:700!important;
  letter-spacing:-.3px!important
}
.top-sub{color:rgba(255,255,255,.38)!important;font-size:9px!important;letter-spacing:.9px!important}
.top-sub::before,.top-sync{display:none!important}

/* badge meta */
.top-meta{
  background:rgba(255,255,255,.08)!important;
  color:rgba(255,255,255,.75)!important;
  border:1px solid rgba(255,255,255,.10)!important;
  border-radius:999px!important;
  padding:4px 10px!important;
  font-size:10.5px!important;
  font-weight:700!important;
  box-shadow:none!important
}

/* botões do header: discretos, sem peso */
.tbtn{
  background:var(--grafite-card)!important;
  color:rgba(255,255,255,.72)!important;
  border:1px solid rgba(255,255,255,.09)!important;
  border-radius:8px!important;
  padding:5px 10px!important;
  font-size:11px!important;
  font-weight:600!important;
  box-shadow:none!important;
  gap:5px!important;
  height:30px!important
}
.tbtn:hover{
  background:var(--grafite-card-hover)!important;
  color:#fff!important;
  border-color:rgba(255,255,255,.18)!important
}
/* botão Exportar Excel — único com destaque, mas sutil */
.tbtn.green{
  background:rgba(22,163,74,.18)!important;
  color:#6ee7b7!important;
  border:1px solid rgba(22,163,74,.28)!important;
  box-shadow:none!important
}
.tbtn.green:hover{background:rgba(22,163,74,.28)!important}
/* botões link coloridos (Visão de Projetos, Discovery PMO) — mantém cor mas tom-down */
.top a.tbtn[href]{opacity:.90}
.top a.tbtn[href]:hover{opacity:1;transform:none}

/* links de ação globais */
.up-btn,.up-btn-all,.fab-cap{
  background:linear-gradient(135deg,var(--bradesco-red),var(--bradesco-pink))!important;
  color:#fff!important;border-color:transparent!important;box-shadow:none!important
}

/* ── TABS: faixa fina colada ao header ── */
.tabs{
  top:56px!important;
  background:#1b2230!important;
  background-image:none!important;
  border-bottom:1px solid rgba(255,255,255,.07)!important;
  box-shadow:0 4px 10px rgba(0,0,0,.18)!important;
  padding:7px 1.4rem!important;
  gap:6px!important;
  min-height:auto!important;
  align-items:center!important;
  overflow-x:auto!important
}
.tabs::before,.tabs::after{display:none!important;content:none!important}

/* pílulas de aba compactas */
.tabbt{
  background:transparent!important;
  color:rgba(255,255,255,.52)!important;
  border:1px solid transparent!important;
  border-radius:7px!important;
  height:30px!important;
  padding:0 12px!important;
  margin:0!important;
  font-size:11.5px!important;
  font-weight:600!important;
  box-shadow:none!important;
  white-space:nowrap!important;
  letter-spacing:.05px!important
}
.tabbt:hover:not(.on){
  background:rgba(255,255,255,.07)!important;
  color:rgba(255,255,255,.82)!important;
  border-color:rgba(255,255,255,.10)!important
}
.tabbt.on{
  background:rgba(204,9,47,.18)!important;
  color:#fff!important;
  border-color:rgba(204,9,47,.40)!important;
  font-weight:700!important;
  box-shadow:none!important
}

/* badge de contagem dentro da aba */
.tab-ct{
  background:rgba(255,255,255,.12)!important;
  color:rgba(255,255,255,.72)!important;
  border-radius:999px!important;
  min-width:18px!important;
  height:16px!important;
  display:inline-flex!important;
  align-items:center!important;
  justify-content:center!important;
  font-size:9.5px!important;
  font-weight:800!important;
  padding:0 5px!important
}
.tabbt.on .tab-ct{
  background:rgba(255,255,255,.22)!important;
  color:#fff!important
}

/* ── conteúdo: barras internas ── */
.upbar,.sv-upbar,.st-upbar{background:#fff!important;border-bottom:1px solid var(--line-soft)!important}

/* ── dashboard interno ── */
#pane-db .db{padding:1.2rem 1.6rem 2rem!important;gap:1.35rem!important}
#pane-db .tri-banner,#pane-db #metaPace,#pane-db .panel,#pane-db .tc,
#pane-db .kpi,#pane-db .sc,#pane-db .pg{
  background:#fff!important;border:1px solid var(--line-soft)!important;
  box-shadow:0 8px 18px rgba(29,36,48,.06)!important
}
#pane-db .sec-lbl{color:var(--bradesco-red)!important;letter-spacing:.8px!important}
#pane-db .sec-lbl::after{background:#f0b8c7!important}
#pane-db .tri-q{background:var(--bradesco-red-dark)!important}
#pane-db .tri-prog-fill{background:linear-gradient(90deg,var(--bradesco-red-dark),var(--bradesco-red),var(--bradesco-pink))!important}
#pane-db .kpi{border-radius:12px!important}
#pane-db .kpi.kn::before,#pane-db .kpi.kr::before{background:linear-gradient(90deg,var(--bradesco-red-dark),var(--bradesco-red))!important}
#pane-db .kpi.kg::before{background:#16a34a!important}
#pane-db .kpi.ka::before{background:#b77900!important}
#pane-db .kpi.kb::before{background:#2563eb!important}
#pane-db .sc{border-radius:12px!important}
#pane-db .panel{border-radius:14px!important}

/* ── cards gerais ── */
.premium-kpi,.premium-ep-card,.pd-card,.pd-panel,.metro-summary,.metro-panel,
.kpi,.sc,.panel,.tc,.sv-tbl-wrap,.bk-history,.bk-squad-card,.sv-card,
.st-card,.cal-tri,.cal-month{
  background:#fff!important;border:1px solid var(--line-soft)!important
}
th,.sv-tbl thead th{background:#fbfcfe!important;color:#667085!important}
tr:hover td,tr:nth-child(even):hover td,.sv-tbl tbody tr:hover{background:#fff7fa!important}
.chip.on,.pb.on,.cal-btn.primary{
  background:linear-gradient(135deg,var(--bradesco-red),var(--bradesco-pink))!important;
  color:#fff!important;border-color:transparent!important
}
.cid-link,.st-card-id,.sv-card-ep,.sv-story-key,.metro-card-id,
.premium-title,#pane-ep .premium-title{color:var(--bradesco-red)!important}

/* ── responsivo ── */
@media(max-width:760px){
  .top{height:auto!important;min-height:52px!important;padding:8px 1rem!important;flex-wrap:wrap!important;gap:6px!important}
  .top-name{font-size:13px!important}
  .tabs{top:52px!important;padding:5px 1rem!important}
  .tabbt{height:28px!important;padding:0 10px!important;font-size:11px!important}
  .tbtn span{display:none!important}
}
</style>
'''

JS = r'''
<script id="dashboard-completo-patch">
(function(){
  function renderDashboardCompleto(){
    var root=document.getElementById('dbContent');
    if(!root) return;
    root.innerHTML='<div id="triBanner"></div><div id="metaPace"></div><div><div class="sec-lbl">Visão do Trimestre</div><div class="kgrid" id="kpiRow"></div></div><div><div class="sec-lbl">Lead Time por Squad · Trimestre Atual</div><div class="sgrid" id="squadCards"></div></div><div id="runwayTimeline"></div><div class="g2"><div class="panel"><div class="p-hd"><span class="p-t">Datas previstas com status, impacto e próxima ação</span><span class="p-cnt" id="dCnt">—</span></div><div id="dList"></div></div><div class="panel"><div class="p-hd"><span class="p-t">🔴 Épicos Críticos ≥ '+(window.META||62)+'d</span><span class="p-cnt" id="rCnt">—</span></div><div id="rList"></div></div></div><div id="panoramaGeral"></div>';
    try{ if(typeof renderTriBanner==='function') renderTriBanner(); }catch(e){}
    try{ if(typeof renderMetaPace==='function') renderMetaPace(); }catch(e){}
    try{ if(typeof renderKPI==='function') renderKPI(); }catch(e){}
    try{ if(typeof renderSquads==='function') renderSquads(); }catch(e){}
    try{ if(typeof renderRunwayTimeline==='function') renderRunwayTimeline(); }catch(e){}
    try{ if(typeof renderDeliveries==='function') renderDeliveries(); }catch(e){}
    try{ if(typeof renderRisks==='function') renderRisks(); }catch(e){}
    try{ if(typeof renderPanorama==='function') renderPanorama(); }catch(e){}
    try{ if(typeof updateTabCounts==='function') updateTabCounts(); }catch(e){}
  }
  window.renderDashboardCompleto=renderDashboardCompleto;
  window.renderDash=renderDashboardCompleto;
  try{ renderDash=renderDashboardCompleto; }catch(e){}
  document.addEventListener('DOMContentLoaded',function(){setTimeout(function(){try{if((window.curTab||'')==='db'||document.querySelector('#pane-db.on')) renderDashboardCompleto();}catch(e){}},80);});
})();
</script>
'''

if 'layout-grafite-dashboard-patch' not in s:
    s = s.replace('</head>', CSS + '\n</head>')
    print('OK: CSS grafite/dashboard inserido')
if 'dashboard-completo-patch' not in s:
    s = s.replace('</body>', JS + '\n</body>')
    print('OK: JS dashboard completo inserido')

p.write_text(s, encoding='utf-8')
print('OK: patch visual aplicado')
