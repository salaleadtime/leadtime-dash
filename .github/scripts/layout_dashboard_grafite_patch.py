from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')

CSS = r'''
<style id="layout-grafite-dashboard-patch">
:root{--grafite-exato:#141922;--grafite-card:#242b36;--grafite-card-hover:#303846;--bradesco-red:#cc092f;--bradesco-pink:#d80b57;--bradesco-red-dark:#a6002b;--bg-page:#f4f6fa;--line-soft:#e3e8ef}html,body{background:var(--bg-page)!important}.top{background:var(--grafite-exato)!important;background-image:none!important;border-bottom:none!important;box-shadow:none!important;height:84px!important;padding:0 1.8rem!important}.top::before,.top::after{display:none!important;content:none!important;background:none!important}.top-logo{background:linear-gradient(135deg,var(--bradesco-red),var(--bradesco-pink))!important;color:#fff!important;border:0!important;box-shadow:none!important;width:46px!important;height:46px!important;border-radius:14px!important}.top-name{color:#fff!important;font-size:24px!important;font-weight:800!important;letter-spacing:-.7px!important}.top-sub{color:#c6ceda!important;font-size:10px!important;letter-spacing:1.2px!important}.top-sub::before,.top-sync{display:none!important}.top-meta,.tbtn{background:var(--grafite-card)!important;color:#fff!important;border:1px solid rgba(255,255,255,.06)!important;border-radius:999px!important;box-shadow:none!important;font-weight:800!important}.top-meta{padding:9px 18px!important;font-size:11.5px!important}.tbtn{padding:9px 16px!important;font-size:11.5px!important}.tbtn:hover{background:var(--grafite-card-hover)!important;color:#fff!important}.tbtn.green,.up-btn,.up-btn-all,.fab-cap{background:linear-gradient(135deg,var(--bradesco-red),var(--bradesco-pink))!important;color:#fff!important;border-color:transparent!important;box-shadow:none!important}.tabs{top:84px!important;background:var(--grafite-exato)!important;background-image:none!important;border-bottom:none!important;box-shadow:none!important;padding:10px 1.8rem 18px!important;gap:10px!important;min-height:70px!important;align-items:center!important;overflow-x:auto!important}.tabs::before,.tabs::after{display:none!important;content:none!important}.tabbt{background:var(--grafite-card)!important;color:#d8dee8!important;border:0!important;border-radius:999px!important;height:38px!important;padding:0 22px!important;margin:0!important;font-size:12.5px!important;font-weight:800!important;box-shadow:none!important;white-space:nowrap!important}.tabbt:hover:not(.on){background:var(--grafite-card-hover)!important;color:#fff!important}.tabbt.on{background:linear-gradient(135deg,var(--bradesco-red),var(--bradesco-pink))!important;color:#fff!important;border:0!important;box-shadow:none!important}.tab-ct{background:#3a4350!important;color:#f4f7fb!important;border-radius:999px!important;min-width:24px!important;height:20px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;font-size:10px!important;font-weight:900!important;padding:0 8px!important}.tabbt.on .tab-ct{background:rgba(255,255,255,.22)!important;color:#fff!important}.upbar,.sv-upbar,.st-upbar{background:#fff!important;border-bottom:1px solid var(--line-soft)!important}#pane-db .db{padding:1.2rem 1.6rem 2rem!important;gap:1.35rem!important}#pane-db .tri-banner,#pane-db #metaPace,#pane-db .panel,#pane-db .tc,#pane-db .kpi,#pane-db .sc,#pane-db .pg{background:#fff!important;border:1px solid var(--line-soft)!important;box-shadow:0 8px 18px rgba(29,36,48,.06)!important}#pane-db .sec-lbl{color:var(--bradesco-red)!important;letter-spacing:.8px!important}#pane-db .sec-lbl::after{background:#f0b8c7!important}#pane-db .tri-q{background:var(--bradesco-red-dark)!important}#pane-db .tri-prog-fill{background:linear-gradient(90deg,var(--bradesco-red-dark),var(--bradesco-red),var(--bradesco-pink))!important}#pane-db .kpi{border-radius:12px!important}#pane-db .kpi.kn::before,#pane-db .kpi.kr::before{background:linear-gradient(90deg,var(--bradesco-red-dark),var(--bradesco-red))!important}#pane-db .kpi.kg::before{background:#16a34a!important}#pane-db .kpi.ka::before{background:#b77900!important}#pane-db .kpi.kb::before{background:#2563eb!important}#pane-db .sc{border-radius:12px!important}#pane-db .panel{border-radius:14px!important}.premium-kpi,.premium-ep-card,.pd-card,.pd-panel,.metro-summary,.metro-panel,.kpi,.sc,.panel,.tc,.sv-tbl-wrap,.bk-history,.bk-squad-card,.sv-card,.st-card,.cal-tri,.cal-month{background:#fff!important;border:1px solid var(--line-soft)!important}th,.sv-tbl thead th{background:#fbfcfe!important;color:#667085!important}tr:hover td,tr:nth-child(even):hover td,.sv-tbl tbody tr:hover{background:#fff7fa!important}.chip.on,.pb.on,.cal-btn.primary{background:linear-gradient(135deg,var(--bradesco-red),var(--bradesco-pink))!important;color:#fff!important;border-color:transparent!important}.cid-link,.st-card-id,.sv-card-ep,.sv-story-key,.metro-card-id,.premium-title,#pane-ep .premium-title{color:var(--bradesco-red)!important}@media(max-width:760px){.top{height:auto!important;min-height:78px!important;padding:12px 1rem!important;flex-wrap:wrap!important}.top-name{font-size:19px!important}.tabs{top:78px!important;padding:10px 1rem 14px!important;min-height:58px!important}.tabbt{height:34px!important;padding:0 16px!important;font-size:12px!important}}
</style>
'''

JS = r'''
<script id="dashboard-completo-patch">
(function(){
  function renderDashboardCompleto(){
    var root=document.getElementById('dbContent');
    if(!root) return;
    root.innerHTML='<div id="triBanner"></div><div id="metaPace"></div><div><div class="sec-lbl">Visão do Trimestre</div><div class="kgrid" id="kpiRow"></div></div><div><div class="sec-lbl">Lead Time por Squad · Trimestre Atual</div><div class="sgrid" id="squadCards"></div></div><div id="runwayTimeline"></div><div class="g2"><div class="panel"><div class="p-hd"><span class="p-t">Datas previstas com status, impacto e próxima ação</span><span class="p-cnt" id="dCnt">—</span></div><div id="dList"></div></div><div class="panel"><div class="p-hd"><span class="p-t">🔴 Épicos Críticos ≥ 62d</span><span class="p-cnt" id="rCnt">—</span></div><div id="rList"></div></div></div><div id="panoramaGeral"></div>';
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
