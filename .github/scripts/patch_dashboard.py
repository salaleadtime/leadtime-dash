from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')
changed = False


def rep(old: str, new: str, label: str) -> None:
    global s, changed
    if old in s:
        s = s.replace(old, new, 1)
        changed = True
        print(f'OK: {label}')
    else:
        print(f'SKIP: {label}')

# Calendário: quando o cache estiver vazio/inválido, carregar o padrão automaticamente.
rep(
"""function calLoad(){
  if(calData!==null) return calData;
  var raw=null;
  try{ raw=localStorage.getItem(CAL_KEY); }catch(e){}
  if(raw===null){            // primeira vez: carrega o planejamento padrão (2º/3º/4º TRI)
    calData=calDefaultData();
    calSave();
    return calData;
  }
  try{ calData=JSON.parse(raw); }catch(e){ calData=[]; }
  if(!Array.isArray(calData)) calData=[];
  return calData;
}""",
"""function calLoad(){
  if(Array.isArray(calData) && calData.length) return calData;
  var raw=null;
  try{ raw=localStorage.getItem(CAL_KEY); }catch(e){}
  if(raw!==null){
    try{ calData=JSON.parse(raw); }catch(e){ calData=[]; }
  }
  if(!Array.isArray(calData) || !calData.length){
    calData=calDefaultData();
    calSave();
  }
  return calData;
}""",
'calLoad padrão'
)

old_date = "{name:'SPRINT 6',month:'SETEMBRO',start:'2026-08-21',end:'2026-09-13'}"
new_date = "{name:'SPRINT 6',month:'SETEMBRO',start:'2026-08-31',end:'2026-09-13'}"
if old_date in s:
    s = s.replace(old_date, new_date)
    changed = True
    print('OK: data Sprint 6 setembro')

# Backlog: escolher como atual o snapshot mais completo. Isso evita voltar de 178 para 71.
if 'function getCurrentBacklogSnapshot()' not in s:
    rep(
    """function snapKey(s){ return (s&&s.id)?('id:'+s.id):('seq:'+(s?s.seq:'')); }""",
    """function snapKey(s){ return (s&&s.id)?('id:'+s.id):('seq:'+(s?s.seq:'')); }
function snapStoryCount(s){ return (s&&Array.isArray(s.stories)) ? s.stories.length : 0; }
function snapTime(s){ var t=Date.parse((s&&s.importedAt)||''); return isNaN(t)?0:t; }
function compareBacklogSnaps(a,b){
  var ca=snapStoryCount(a), cb=snapStoryCount(b);
  if(ca!==cb) return ca-cb;
  var ta=snapTime(a), tb=snapTime(b);
  if(ta!==tb) return ta-tb;
  var sa=Number(a&&a.seq)||0, sb=Number(b&&b.seq)||0;
  return sa-sb;
}
function sortBacklogSnaps(){ backlogSnaps.sort(compareBacklogSnaps); }
function getCurrentBacklogSnapshot(){ if(!backlogSnaps.length) return null; sortBacklogSnaps(); return backlogSnaps[backlogSnaps.length-1]; }
function getPreviousBacklogSnapshot(){ if(backlogSnaps.length<2) return null; sortBacklogSnaps(); return backlogSnaps[backlogSnaps.length-2]; }
function maxBacklogStoryCount(snaps){ return (snaps||[]).reduce(function(m,s){ return Math.max(m,snapStoryCount(s)); },0); }""",
    'helpers backlog'
    )

rep(
"""  backlogSnaps.sort(function(a,b){ return (a.seq||0)-(b.seq||0); });
  return added;""",
"""  sortBacklogSnaps();
  return added;""",
'mergeBacklog ordenação'
)

rep(
"""      var nextSeq=(backlogSnaps.length?backlogSnaps[backlogSnaps.length-1].seq:0)+1;""",
"""      var nextSeq=backlogSnaps.reduce(function(m,s){ return Math.max(m,Number(s&&s.seq)||0); },0)+1;""",
'nextSeq max'
)

rep(
"""      backlogSnaps.push({id:snapId,seq:nextSeq,stories:stories,importedAt:new Date().toISOString()});
      saveBacklogSnaps();""",
"""      backlogSnaps.push({id:snapId,seq:nextSeq,stories:stories,importedAt:new Date().toISOString()});
      sortBacklogSnaps();
      saveBacklogSnaps();""",
'sort após importação'
)

# Substitui a versão antiga do load por fetch.
rep(
"""function gasLoadBacklog(cb){
  if(!BK_GAS_URL){ if(cb) cb('no webapp'); return; }
  fetch(BK_GAS_URL+'?action=getBacklog&t='+Date.now())
    .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(json){
      if(json && json.ok && Array.isArray(json.backlog) && json.backlog.length){
        var added=mergeBacklog(json.backlog);
        if(added>0){
          try{ localStorage.setItem(BACKLOG_KEY,JSON.stringify(backlogSnaps)); }catch(e){}
          renderBacklogView();
        }
        if(cb) cb(null, json.backlog.length);
      } else {
        if(cb) cb(null, 0);
      }
    })
    .catch(function(err){ if(cb) cb(err.message||'erro'); });
}""",
"""function gasLoadBacklog(cb){
  if(!BK_GAS_URL){ if(cb) cb('no webapp'); return; }
  var localMax=maxBacklogStoryCount(backlogSnaps);
  _gasJsonp(BK_GAS_URL+'?action=getBacklog&t='+Date.now(), function(err,json){
    if(err){ if(cb) cb(err); return; }
    if(json && json.ok && Array.isArray(json.backlog) && json.backlog.length){
      var serverMax=maxBacklogStoryCount(json.backlog);
      mergeBacklog(json.backlog);
      sortBacklogSnaps();
      try{ localStorage.setItem(BACKLOG_KEY,JSON.stringify(backlogSnaps)); }catch(e){}
      renderBacklogView();
      updateTabCounts();
      if(localMax>serverMax && !_gasBacklogSaving){ setTimeout(function(){ gasSaveBacklog(); },500); }
      if(cb) cb(null, json.backlog.length);
    } else {
      if(backlogSnaps.length && !_gasBacklogSaving){ setTimeout(function(){ gasSaveBacklog(); },500); }
      if(cb) cb(null, 0);
    }
  });
}""",
'gasLoadBacklog JSONP antigo'
)

# Substitui a versão já corrigida que ainda usava fetch. JSONP evita CORS/Failed to fetch no Apps Script.
rep(
"""function gasLoadBacklog(cb){
  if(!BK_GAS_URL){ if(cb) cb('no webapp'); return; }
  var localMax=maxBacklogStoryCount(backlogSnaps);
  fetch(BK_GAS_URL+'?action=getBacklog&t='+Date.now())
    .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(json){
      if(json && json.ok && Array.isArray(json.backlog) && json.backlog.length){
        var serverMax=maxBacklogStoryCount(json.backlog);
        mergeBacklog(json.backlog);
        sortBacklogSnaps();
        try{ localStorage.setItem(BACKLOG_KEY,JSON.stringify(backlogSnaps)); }catch(e){}
        renderBacklogView();
        updateTabCounts();
        if(localMax>serverMax && !_gasBacklogSaving){ setTimeout(function(){ gasSaveBacklog(); },500); }
        if(cb) cb(null, json.backlog.length);
      } else {
        if(backlogSnaps.length && !_gasBacklogSaving){ setTimeout(function(){ gasSaveBacklog(); },500); }
        if(cb) cb(null, 0);
      }
    })
    .catch(function(err){ if(cb) cb(err.message||'erro'); });
}""",
"""function gasLoadBacklog(cb){
  if(!BK_GAS_URL){ if(cb) cb('no webapp'); return; }
  var localMax=maxBacklogStoryCount(backlogSnaps);
  _gasJsonp(BK_GAS_URL+'?action=getBacklog&t='+Date.now(), function(err,json){
    if(err){ if(cb) cb(err); return; }
    if(json && json.ok && Array.isArray(json.backlog) && json.backlog.length){
      var serverMax=maxBacklogStoryCount(json.backlog);
      mergeBacklog(json.backlog);
      sortBacklogSnaps();
      try{ localStorage.setItem(BACKLOG_KEY,JSON.stringify(backlogSnaps)); }catch(e){}
      renderBacklogView();
      updateTabCounts();
      if(localMax>serverMax && !_gasBacklogSaving){ setTimeout(function(){ gasSaveBacklog(); },500); }
      if(cb) cb(null, json.backlog.length);
    } else {
      if(backlogSnaps.length && !_gasBacklogSaving){ setTimeout(function(){ gasSaveBacklog(); },500); }
      if(cb) cb(null, 0);
    }
  });
}""",
'gasLoadBacklog JSONP corrigido'
)

rep(
"""  var cur=backlogSnaps[backlogSnaps.length-1];
  var prev=backlogSnaps.length>1?backlogSnaps[backlogSnaps.length-2]:null;
  var stories=cur.stories;""",
"""  sortBacklogSnaps();
  var cur=getCurrentBacklogSnapshot();
  var prev=getPreviousBacklogSnapshot();
  var stories=(cur&&Array.isArray(cur.stories))?cur.stories:[];""",
'renderBacklogView snapshot atual'
)

rep(
"""  if(bkEl){ var bkCur=backlogSnaps.length?backlogSnaps[backlogSnaps.length-1].stories.length:0; bkEl.textContent=bkCur||''; }""",
"""  if(bkEl){ var bkCurSnap=getCurrentBacklogSnapshot(); var bkCur=bkCurSnap?snapStoryCount(bkCurSnap):0; bkEl.textContent=bkCur||''; }""",
'contador aba backlog'
)

rep(
"""    if(backlogSnaps.length){
      var bkLastSnap=backlogSnaps[backlogSnaps.length-1];""",
"""    if(backlogSnaps.length){
      sortBacklogSnaps();
      var bkLastSnap=getCurrentBacklogSnapshot();""",
'boot local backlog atual'
)

p.write_text(s, encoding='utf-8')
print('changed=', changed)
