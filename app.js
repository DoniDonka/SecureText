/* SecureText V6 Hotfix — stable, quota-safe, spam-protected (Firebase v8) */
document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const screens = ["class","pin","name","wait","chat"];
  function showScreen(k){
    for (const s of screens){ const el=$("screen-"+s); if(el) el.classList.toggle("active", s===k); }
  }

  function escapeHtml(str){
    return String(str||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }
  function fmtTime(ts){
    try { return ts?.toDate ? ts.toDate().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : ""; } catch { return ""; }
  }

  // flash
  function stFlash(){
    const el=$("stFlash"); if(!el) return;
    el.classList.add("on"); setTimeout(()=>el.classList.remove("on"), 220);
  }

  // local settings
  const SETTINGS_KEY="st_settings_v6";
  const DEFAULTS={theme:"night", sound:true, here:true};
  function getSettings(){ try{ return {...DEFAULTS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}")||{})}; }catch{return {...DEFAULTS};} }
  function setSettings(s){ try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }catch{} }
  let settings=getSettings();

  function applyTheme(mode) {
    // Apply to chat container + overall page background
    const cs = document.getElementById("chat-screen");
    if (cs) {
      cs.classList.remove("day","night");
      cs.classList.add(mode === "day" ? "day" : "night");
    }
    document.body.classList.remove("theme-day","theme-night");
    document.body.classList.add(mode === "day" ? "theme-day" : "theme-night");

    const tbtn = document.getElementById("themeToggle");
    if (tbtn) tbtn.textContent = mode === "day" ? "☀️" : "🌙";
  }
  function applyPreset(p){
    document.body.classList.remove("preset-neon","preset-emerald","preset-mono");
    if(p==="neon") document.body.classList.add("preset-neon");
    if(p==="emerald") document.body.classList.add("preset-emerald");
    if(p==="mono") document.body.classList.add("preset-mono");
  }

  // sounds (simple)
  function playSound(type){
    if(!settings.sound) return;
    try{
      const ctx=new (window.AudioContext||window.webkitAudioContext)();
      const o=ctx.createOscillator(); const g=ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      const now=ctx.currentTime;
      const freq = type==="deny"?220 : type==="approve"?740 : type==="send"?620 : 520;
      const dur = type==="approve"?0.10 : 0.07;
      o.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.08, now+0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now+dur);
      o.start(now); o.stop(now+dur+0.02);
      o.onended=()=>{try{ctx.close();}catch{}};
    }catch{}
  }

  // notifications
  const NOTIF_ASK_KEY="st_notif_asked";
  function requestNotifOnce(){
    try{
      if(!("Notification" in window)) return;
      if(localStorage.getItem(NOTIF_ASK_KEY)==="1") return;
      localStorage.setItem(NOTIF_ASK_KEY,"1");
      if(Notification.permission==="default") Notification.requestPermission().catch(()=>{});
    }catch{}
  }
  function maybeNotify(className, from, text){
    const t=String(text||"");
    const isHere=t.toLowerCase().includes("@here");
    if(isHere && settings.here){ stFlash(); playSound("approve"); }
    if(!("Notification" in window)) return;
    if(Notification.permission!=="granted") return;
    if(!document.hidden && !isHere) return;
    const body=(t.length>140?t.slice(0,140)+"…":t);
    new Notification(`📚 SecureText | ${className}`, { body: `${from}: ${body}` });
  }

  // firestore helpers (can use window.ST_REFS if available)
  const classDoc=(cid)=>(window.ST_REFS?window.ST_REFS.classDoc(cid):db.collection("classes").doc(cid));
  const pendingDoc=(cid,uid)=>(window.ST_REFS?window.ST_REFS.pendingDoc(cid,uid):classDoc(cid).collection("pendingUsers").doc(uid));
  const bannedDoc=(cid,uid)=>(window.ST_REFS?window.ST_REFS.bannedDoc(cid,uid):classDoc(cid).collection("bannedUsers").doc(uid));
  const messagesCol=(cid)=>(window.ST_REFS?window.ST_REFS.messagesCol(cid):classDoc(cid).collection("messages"));
  const annCol=(cid)=>(window.ST_REFS?window.ST_REFS.announcementsCol(cid):classDoc(cid).collection("announcements"));
  const typingDoc=(cid)=>(window.ST_REFS?window.ST_REFS.typingDoc(cid):classDoc(cid).collection("meta").doc("typing"));
  const presenceDoc=(cid)=>(window.ST_REFS?window.ST_REFS.presenceDoc(cid):classDoc(cid).collection("meta").doc("presence"));
  const commandsDoc=(cid)=>(window.ST_REFS?window.ST_REFS.commandsDoc(cid):classDoc(cid).collection("meta").doc("commands"));
  const pinnedDoc=(cid)=>(window.ST_REFS?window.ST_REFS.pinnedDoc(cid):classDoc(cid).collection("meta").doc("pinned"));

  // state
  let selectedClassId=null, selectedClassName=null;
  let userId=null, userName=null;
  let chatUnsubs=[];
  function clearChat(){ chatUnsubs.forEach(u=>{try{u();}catch{}}); chatUnsubs=[]; stopPresence(); }

  // presence (quota-friendly: 90s when normal, 2min when data saver)
  let presenceTimer=null;
  function stopPresence(){ if(presenceTimer){clearInterval(presenceTimer); presenceTimer=null;} }
  function startPresence(cid,uid){
    stopPresence();
    const ref=presenceDoc(cid);
    const intervalMs = window.__st_dataSaver ? 120000 : 90000;
    const beat=async()=>{ if(document.hidden) return; try{ await ref.set({[uid]: firebase.firestore.FieldValue.serverTimestamp()},{merge:true}); }catch{} };
    beat(); presenceTimer=setInterval(beat, intervalMs);
    const TTL = intervalMs + 35000;
    const unsub=ref.onSnapshot(doc=>{
      const data=doc?.exists?(doc.data()||{}):{};
      const now=Date.now();
      let c=0;
      for(const v of Object.values(data)){ if(v?.toDate){ const ms=v.toDate().getTime(); if(now-ms<=TTL) c++; } }
      const b=$("onlineBadge"); if(b) b.textContent=`• ${c} online`;
    });
    chatUnsubs.push(unsub);
  }

  // typing (debounce)
  let typingDeb=null, typingOff=null, localTyping=false;
  async function setTyping(cid,uid,val){
    if(window.__st_dataSaver) return;
    if(document.hidden) return;
    if(localTyping===val) return;
    localTyping=val;
    try{ await typingDoc(cid).set({[uid]: !!val},{merge:true}); }catch{}
  }
  function renderTyping(data,myId){
    const el=$("typingIndicator"); if(!el) return;
    if(window.__st_dataSaver){ el.innerHTML=""; return; }
    const others=Object.entries(data||{}).filter(([id,v])=>id!==myId && v===true);
    if(others.length) el.innerHTML=`<span class="typing-bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span><span class="muted" style="margin-left:8px">Someone is typing…</span>`;
    else el.innerHTML="";
  }

  // commands listener
  function startCommands(cid, handlers){
    const ref=commandsDoc(cid);
    const base=`st_cmd_${cid}_`;
    let init=false;
    const unsub=ref.onSnapshot(doc=>{
      const d=doc?.exists?(doc.data()||{}):{};
      const ln=Number(d.logoutNonce||0), rn=Number(d.rulesNonce||0), fn=Number(d.refreshNonce||0);
      if(!init){
        init=true;
        sessionStorage.setItem(base+"logout",String(ln));
        sessionStorage.setItem(base+"rules",String(rn));
        sessionStorage.setItem(base+"refresh",String(fn));
      }else{
        const l0=Number(sessionStorage.getItem(base+"logout")||"0");
        const r0=Number(sessionStorage.getItem(base+"rules")||"0");
        const f0=Number(sessionStorage.getItem(base+"refresh")||"0");
        if(ln>l0){ sessionStorage.setItem(base+"logout",String(ln)); handlers.onLogout?.(); }
        if(rn>r0){ sessionStorage.setItem(base+"rules",String(rn)); handlers.onRerules?.(); }
        if(fn>f0){ sessionStorage.setItem(base+"refresh",String(fn)); handlers.onRefresh?.(); }
      }
      if(typeof d.locked==="boolean") handlers.onLock?.(d.locked, d.lockMessage||"");
      if(d.theme==="day"||d.theme==="night") handlers.onTheme?.(d.theme);
      if(d.preset==="neon"||d.preset==="emerald"||d.preset==="mono") handlers.onPreset?.(d.preset);
      if(typeof d.dataSaver==="boolean") handlers.onDataSaver?.(d.dataSaver);
    });
    chatUnsubs.push(unsub);
  }

  // lock overlay
  let chatLocked=false;
  function setLocked(v,msg){
    chatLocked=!!v;
    let ov=document.getElementById("stLockOverlay");
    if(!ov){
      ov=document.createElement("div");
      ov.id="stLockOverlay";
      ov.style.cssText="position:fixed;inset:0;z-index:999998;display:none;place-items:center;background:rgba(0,0,0,.72);backdrop-filter:blur(10px);padding:16px;";
      ov.innerHTML=`<div style="width:min(620px,95vw);border-radius:16px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(180deg, rgba(20,20,20,.92), rgba(14,14,14,.76));box-shadow:0 30px 90px rgba(0,0,0,.65);padding:18px">
        <div style="font-weight:900;letter-spacing:.10em">CHAT LOCKED</div>
        <div id="stLockMsg" style="margin-top:8px;opacity:.85;line-height:1.35rem">Chat is temporarily locked.</div>
      </div>`;
      document.body.appendChild(ov);
    }
    const m=document.getElementById("stLockMsg"); if(m) m.textContent=msg||"Chat is temporarily locked.";
    ov.style.display=chatLocked?"grid":"none";
  }

  // spam
  let localMuteUntil=0, spamBlocks=0;
  const SPAM_MIN=1100, SPAM_WIN=12000, SPAM_MAXREP=2, SPAM_MAXLEN=350;
  let lastSendAt=0, lastSendText="";
  const recent=[];
  function status(msg, kind){
    const el=$("chatStatus"); if(!el) return;
    el.textContent=msg||"";
    try{
      const t=(msg||"").toLowerCase();
      if(t.includes("slow down")||t.includes("duplicate")||t.includes("too long")){
        spamBlocks++;
        if(spamBlocks>=3){
          localMuteUntil=Date.now()+10000; spamBlocks=0;
          stFlash(); playSound("deny");
          el.textContent="Muted for 10s (spam).";
        }
      }
    }catch{}
  }

  // rules
  const rulesKey=(cid,uid)=>`rulesAccepted_${cid}_${uid}`;
  const hasRules=(cid,uid)=>localStorage.getItem(rulesKey(cid,uid))==="true";
  const setRules=(cid,uid)=>localStorage.setItem(rulesKey(cid,uid),"true");
  function showRulesGate(cid, uid, uname, cname, onContinue){
    if(hasRules(cid,uid)){ onContinue(); return; }
    const ov=document.createElement("div");
    ov.style.cssText="position:fixed;inset:0;z-index:999999;display:grid;place-items:center;background:rgba(0,0,0,.72);backdrop-filter:blur(10px);padding:16px;";
    ov.innerHTML=`<div style="width:min(760px,95vw);border-radius:18px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(180deg, rgba(20,20,20,.92), rgba(14,14,14,.76));box-shadow:0 30px 90px rgba(0,0,0,.65);padding:18px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div><div style="font-weight:900;letter-spacing:.10em">RULES</div><div style="opacity:.75;margin-top:4px">Class: ${escapeHtml(cname||cid)}</div></div>
        <div style="opacity:.75">User: ${escapeHtml(uname||"User")}</div>
      </div>
      <div style="margin-top:12px;opacity:.9;line-height:1.5">
        • Be respectful.<br/>• No spam.<br/>• Follow teacher instructions.<br/>• Don’t share personal info.<br/><br/>
        <span style="opacity:.8">Tip: Use <b>@here</b> to ping the class (flashes + notifies).</span>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
        <button id="rulesContinueBtn" class="primary" style="min-width:180px">Continue</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    ov.querySelector("#rulesContinueBtn").onclick=()=>{
      setRules(cid,uid); requestNotifOnce();
      ov.style.pointerEvents="none"; ov.style.opacity="0";
      setTimeout(()=>{try{ov.remove();}catch{}},120);
      onContinue();
    };
  }

  // replies/delete minimal (no extra reads)
  async function deleteMyMessage(docRef){
    if(!confirm("Delete this message?")) return;
    try{ await docRef.set({deleted:true,text:"(deleted)",deletedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}); }catch{ try{ await docRef.delete(); }catch{} }
  }
  function msgEl(id,m,me){
    const w=document.createElement("div"); w.className="msg"; w.dataset.id=id; w.dataset.userid=m.userId||"";
    w.innerHTML=`<div class="msg-top"><strong>${escapeHtml(m.name||"User")}</strong> <span class="muted">${fmtTime(m.timestamp)}</span></div>`;
    const body=document.createElement("div"); body.className="msg-text";
    const del=!!m.deleted || String(m.text||"").trim().toLowerCase()==="(deleted)";
    body.textContent=del?"(deleted)":(m.text||""); if(del) body.classList.add("deleted");
    w.appendChild(body);
    if(!del){
      const acts=document.createElement("div"); acts.className="msg-actions";
      const r=document.createElement("button"); r.className="msg-btn"; r.textContent="Reply"; r.dataset.action="reply"; acts.appendChild(r);
      if(m.userId===me){ const d=document.createElement("button"); d.className="msg-btn"; d.textContent="Delete"; d.dataset.action="delete"; acts.appendChild(d); }
      w.appendChild(acts);
    }
    return w;
  }

  // replies panel (small)
  let replyTo=null;
  function ensureReplyUI(){
    if(document.getElementById("repliesPanel")) return;
    const p=document.createElement("div");
    p.id="repliesPanel"; p.style.cssText="position:fixed;right:18px;bottom:18px;width:min(420px,94vw);max-height:70vh;border-radius:16px;border:1px solid rgba(255,255,255,.12);background:rgba(16,16,16,.92);backdrop-filter:blur(14px);box-shadow:0 30px 90px rgba(0,0,0,.65);display:none;flex-direction:column;z-index:999999;";
    p.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 12px;border-bottom:1px solid rgba(255,255,255,.10);">
      <div class="muted" id="repliesTitle">Replies</div>
      <button id="closeRepliesBtn" class="msg-btn" type="button">Close</button>
    </div>
    <div id="repliesList" style="padding:10px 12px;overflow:auto;display:flex;flex-direction:column;gap:10px;"></div>
    <div style="display:flex;gap:8px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.10);">
      <input id="replyInput" type="text" placeholder="Reply…" style="flex:1" />
      <button id="sendReplyBtn" type="button" class="primary" style="max-width:120px">Send</button>
    </div>`;
    document.body.appendChild(p);
    document.getElementById("closeRepliesBtn").onclick=()=>{ p.style.display="none"; replyTo=null; };
    document.getElementById("replyInput").addEventListener("keydown",(e)=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault(); document.getElementById("sendReplyBtn").click();} });
  }

  // classes load
  async function loadClasses(){
    const box=$("classes"); const err=$("classError");
    if(err) err.textContent=""; if(box) box.textContent="Loading…";
    try{
      const snap=await db.collection("classes").get();
      if(!box) return;
      box.innerHTML="";
      snap.forEach(doc=>{
        const d=doc.data()||{};
        const b=document.createElement("button"); b.type="button"; b.textContent=d.name||doc.id;
        b.onclick=()=>{ selectedClassId=doc.id; selectedClassName=d.name||doc.id; $("pinClassName").textContent=selectedClassName; showScreen("pin"); };
        box.appendChild(b);
      });
      if(snap.empty) box.innerHTML=`<div class="muted">No classes found.</div>`;
    }catch(e){ console.error(e); if(err) err.textContent="Failed to load classes."; if(box) box.textContent=""; }
  }

  // navigation
  $("pinBackBtn").onclick=()=>showScreen("class");
  $("nameBackBtn").onclick=()=>showScreen("pin");
  $("resetBtn").onclick=()=>{ clearChat(); localStorage.removeItem("classId"); localStorage.removeItem("className"); localStorage.removeItem("userId"); localStorage.removeItem("userName"); selectedClassId=null; selectedClassName=null; showScreen("class"); loadClasses(); };

  // pin
  $("pinContinueBtn").onclick=async()=>{
    if(!selectedClassId) return;
    const pin=String($("pinInput").value||"").trim();
    const err=$("pinError"); if(err) err.textContent="";
    if(!pin){ if(err) err.textContent="Enter the class PIN."; return; }
    try{
      const doc=await classDoc(selectedClassId).get();
      const d=doc.data()||{};
      if(pin!==String(d.pin||"").trim()){ if(err) err.textContent="Incorrect PIN."; return; }
      showScreen("name");
    }catch{ if(err) err.textContent="PIN check failed."; }
  };

  // name request
  $("nameContinueBtn").onclick=async()=>{
    if(!selectedClassId) return;
    const name=String($("nameInput").value||"").trim();
    const err=$("nameError"); if(err) err.textContent="";
    if(!name){ if(err) err.textContent="Enter your name."; return; }
    userId = localStorage.getItem("userId") || Math.random().toString(36).slice(2,12);
    userName = name;
    try{
      const b=await bannedDoc(selectedClassId,userId).get();
      if(b.exists){ showScreen("wait"); $("waitStatus").textContent="You are banned."; return; }
      await pendingDoc(selectedClassId,userId).set({name, status:"pending", timestamp: firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      localStorage.setItem("classId",selectedClassId);
      localStorage.setItem("className",selectedClassName||selectedClassId);
      localStorage.setItem("userId",userId);
      localStorage.setItem("userName",userName);
      showScreen("wait");
      $("waitStatus").textContent="Waiting for admin approval…";
      watchStatus(selectedClassId,userId,userName);
    }catch(e){ console.error(e); if(err) err.textContent="Request failed."; }
  };

  let waitStatusHandled = false;
  function applyStatus(doc, cid, uid, uname){
    if(waitStatusHandled) return true;
    const ws=$("waitStatus");
    if(!doc||!doc.exists){ if(ws) ws.textContent="Request not found."; waitStatusHandled=true; return true; }
    const s=(doc.data()||{}).status;
    if(s==="approved"){
      waitStatusHandled=true;
      playSound("approve");
      showRulesGate(cid,uid,uname,selectedClassName||cid, ()=>loadChat(cid,uid,uname));
      return true;
    }
    if(s==="rejected"){ waitStatusHandled=true; if(ws) ws.textContent="You were rejected by the admin."; return true; }
    if(s==="banned"){ waitStatusHandled=true; if(ws) ws.textContent="You are banned."; return true; }
    if(ws) ws.textContent="Waiting for admin approval…";
    return false;
  }

  function watchStatus(cid, uid, uname){
    clearChat();
    waitStatusHandled = false;
    const ref=pendingDoc(cid,uid);

    // Real-time listener (works at home when WebSockets are allowed)
    const unsub=ref.onSnapshot(doc=>{
      if(applyStatus(doc, cid, uid, uname)) { /* done */ }
    });

    // Polling fallback for school networks (quota-friendly: check every 10s)
    const POLL_INTERVAL_MS = 10000;
    let pollTimer = null;
    const poll = async ()=>{
      try {
        const doc = await ref.get();
        if(applyStatus(doc, cid, uid, uname) && pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      } catch (e) { /* ignore; will retry next time */ }
    };
    pollTimer = setInterval(poll, POLL_INTERVAL_MS);
    poll(); // check once right away
    chatUnsubs.push(unsub);
    chatUnsubs.push(()=>{ if(pollTimer) clearInterval(pollTimer); });

    const testResult=$("waitTestResult"); if(testResult) testResult.textContent="";
    const testBtn=$("waitTestConnectionBtn");
    if(testBtn) testBtn.onclick=async ()=>{
      const res=$("waitTestResult"); if(res) res.textContent="Checking…";
      try {
        await ref.get();
        if($("waitTestResult")) $("waitTestResult").textContent="Connection OK";
      } catch (e) {
        if($("waitTestResult")) $("waitTestResult").textContent="Could not reach server";
      }
    };
  }

  function loadChat(cid, uid, uname){
    clearChat();
    showScreen("chat");
    settings=getSettings(); applyTheme(settings.theme);
    $("chatWelcome").textContent=`Welcome, ${uname}!`;
    $("chatSubtitle").textContent=`SecureText chat | ${selectedClassName||cid}`;
    ensureReplyUI();

    // Offline banner
    const offlineBanner=$("stOfflineBanner");
    function setOffline(off){ if(offlineBanner){ offlineBanner.classList.toggle("hidden",!off); offlineBanner.classList.add("on"); } }
    function setOnline(){ if(offlineBanner){ offlineBanner.classList.add("hidden"); offlineBanner.classList.remove("on"); } }
    window.addEventListener("online",setOnline);
    window.addEventListener("offline",()=>setOffline(true));
    if(!navigator.onLine) setOffline(true);
    chatUnsubs.push(()=>{ window.removeEventListener("online",setOnline); window.removeEventListener("offline",()=>setOffline(true)); });

    // Pinned message
    const pinnedBox=$("pinnedMessageBox");
    chatUnsubs.push(pinnedDoc(cid).onSnapshot(doc=>{
      if(!pinnedBox) return;
      const d=doc?.data?.()||{};
      const text=String(d.text||"").trim();
      if(!text){ pinnedBox.classList.add("hidden"); pinnedBox.innerHTML=""; return; }
      pinnedBox.classList.remove("hidden");
      pinnedBox.innerHTML=`<div class="st-pinned-label">📌 Pinned</div><div class="st-pinned-text">${escapeHtml(text)}</div>`;
    }));

    // Search & export toolbar
    const searchWrap=$("chatSearchWrap"); const searchInput=$("chatSearchInput"); const searchClear=$("chatSearchClear"); const exportBtn=$("chatExportBtn"); const searchToggleBtn=$("searchToggleBtn");
    if(searchToggleBtn) searchToggleBtn.onclick=()=>{ if(searchWrap){ searchWrap.style.display=searchWrap.style.display==="none"?"flex":"none"; if(searchWrap.style.display==="flex") searchInput&&searchInput.focus(); } };
    if(searchClear) searchClear.onclick=()=>{ if(searchInput){ searchInput.value=""; filterMessagesBySearch(""); } };
    function filterMessagesBySearch(q){
      const list=$("messages"); if(!list) return;
      const msgs=list.querySelectorAll(".msg");
      q=String(q||"").toLowerCase().trim();
      msgs.forEach(el=>{
        const text=(el.querySelector(".msg-text")?.textContent||"").toLowerCase();
        const name=(el.querySelector(".msg-top strong")?.textContent||"").toLowerCase();
        const show=!q || text.includes(q) || name.includes(q);
        el.style.display=show?"":"none";
      });
    }
    if(searchInput) searchInput.addEventListener("input",()=>filterMessagesBySearch(searchInput.value));
    if(exportBtn) exportBtn.onclick=()=>{
      const list=$("messages"); if(!list) return;
      const items=[];
      list.querySelectorAll(".msg").forEach(el=>{
        if(el.style.display==="none") return;
        const name=el.querySelector(".msg-top strong")?.textContent||"User";
        const text=el.querySelector(".msg-text")?.textContent||"";
        const time=el.querySelector(".msg-top .muted")?.textContent||"";
        items.push({name,text,timestamp:time});
      });
      const txt=items.map(m=>`[${m.timestamp}] ${m.name}: ${m.text}`).join("\n");
      const blob=new Blob([txt],{type:"text/plain;charset=utf-8"});
      if(window.ST_HELPERS&&window.ST_HELPERS.downloadBlob) window.ST_HELPERS.downloadBlob(blob,"securetext-chat-export.txt");
      else { const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="securetext-chat-export.txt"; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),200); }
    };

    $("settingsBtn").onclick=()=>{ // minimal settings: theme/sound/@here
      const ov=document.getElementById("stSettingsOverlay")||document.createElement("div");
      if(!ov.id){
        ov.id="stSettingsOverlay";
        ov.className="st-overlay";
        ov.innerHTML=`<div class="st-modal"><div class="st-modal-top"><div class="st-modal-title">Settings</div><button id="stClose" class="st-icon-btn" type="button">✕</button></div>
          <div class="st-modal-body">
            <div class="st-setting-row"><div><div class="st-setting-name">Theme</div><div class="st-setting-desc">Day / Night</div></div><button id="stTheme" class="st-pill-btn" type="button"></button></div>
            <div class="st-setting-row"><div><div class="st-setting-name">Sounds</div><div class="st-setting-desc">Send / receive / alerts</div></div><button id="stSound" class="st-pill-btn" type="button"></button></div>
            <div class="st-setting-row"><div><div class="st-setting-name">@here alerts</div><div class="st-setting-desc">Flash + notify</div></div><button id="stHere" class="st-pill-btn" type="button"></button></div>
          </div></div>`;
        document.body.appendChild(ov);
        ov.addEventListener("click",(e)=>{ if(e.target===ov) ov.classList.remove("on"); });
      }
      const render=()=>{
        $("stTheme").textContent = settings.theme==="day"?"☀️ Day":"🌙 Night";
        $("stSound").textContent = settings.sound?"🔊 On":"🔇 Off";
        $("stHere").textContent = settings.here?"On":"Off";
      };
      render();
      $("stClose").onclick=()=>ov.classList.remove("on");
      $("stTheme").onclick=()=>{ settings.theme=settings.theme==="day"?"night":"day"; setSettings(settings); applyTheme(settings.theme); render(); };
      $("stSound").onclick=()=>{ settings.sound=!settings.sound; setSettings(settings); render(); };
      $("stHere").onclick=()=>{ settings.here=!settings.here; setSettings(settings); render(); };
      ov.classList.add("on");
    };

    $("themeToggle").onclick=()=>{ settings.theme=settings.theme==="day"?"night":"day"; setSettings(settings); applyTheme(settings.theme); playSound("send"); };
    const doLogout=()=>{ clearChat(); localStorage.removeItem("classId"); localStorage.removeItem("className"); localStorage.removeItem("userId"); localStorage.removeItem("userName"); selectedClassId=null; selectedClassName=null; showScreen("class"); loadClasses(); };
    $("logoutBtn").onclick=doLogout; $("logoutBtnTop").onclick=doLogout;

    // banned cache
    window.__st_isBanned=false;
    chatUnsubs.push(bannedDoc(cid,uid).onSnapshot(d=>{ window.__st_isBanned=!!d?.exists; }));

    // commands
    window.__st_dataSaver=false;
    startCommands(cid,{
      onLogout: doLogout,
      onRerules: ()=>{ localStorage.removeItem(rulesKey(cid,uid)); showRulesGate(cid,uid,uname,selectedClassName||cid, ()=>{}); },
      onRefresh: ()=>location.reload(),
      onLock: (l,msg)=>setLocked(l,msg),
      onTheme: (m)=>applyTheme(m),
      onPreset: (p)=>applyPreset(p),
      onDataSaver: (on)=>{ window.__st_dataSaver=!!on; },
    });

    // presence + typing listeners
    startPresence(cid,uid);
    chatUnsubs.push(typingDoc(cid).onSnapshot(doc=>renderTyping(doc?.data()||{}, uid)));

    // announcements ping
    chatUnsubs.push(annCol(cid).orderBy("timestamp","asc").limit(15).onSnapshot(snap=>{
      const list=$("announcementsList"); if(!list) return;
      list.innerHTML="";
      snap.forEach(d=>{
        const a=d.data()||{};
        const row=document.createElement("div");
        row.style.cssText="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)";
        row.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px"><strong>${escapeHtml(a.by||"Admin")}</strong><span class="muted">${fmtTime(a.timestamp)}</span></div><div style="margin-top:6px;white-space:pre-wrap">${escapeHtml(a.text||"")}</div>`;
        list.appendChild(row);
      });
      snap.docChanges().forEach(ch=>{ if(ch.type==="added"){ const a=ch.doc.data()||{}; stFlash(); playSound("approve"); maybeNotify(selectedClassName||cid, "Announcement", String(a.text||"")); } });
    }));

    const messages=$("messages");
    const input=$("msgInput");
    const send=$("sendBtn");
    const loadOlderBtn=$("loadOlderBtn");
    const loadOlderInfo=$("loadOlderInfo");
    let oldest=null;

    // enter-to-send + typing
    input.addEventListener("keydown",(e)=>{ if(e.key==="Enter"&&!e.shiftKey){e.preventDefault(); send.click();} });
    input.oninput=()=>{
      if(typingDeb) clearTimeout(typingDeb);
      typingDeb=setTimeout(()=>setTyping(cid,uid,true),400);
      if(typingOff) clearTimeout(typingOff);
      typingOff=setTimeout(()=>setTyping(cid,uid,false),2500);
    };

    // send with spam
    send.onclick=async()=>{
      if(Date.now()<localMuteUntil){ status("Muted for 10s (spam).","warn"); playSound("deny"); return; }
      let text=String(input.value||"").trim();
      if(!text) return;
      text=text.replace(/\s{3,}/g,"  ");
      const now=Date.now();
      if(text.length>SPAM_MAXLEN){ status(`Message too long (max ${SPAM_MAXLEN}).`,"warn"); playSound("deny"); return; }
      if(now-lastSendAt<SPAM_MIN){ status("Slow down.","warn"); playSound("deny"); return; }
      const cutoff=now-SPAM_WIN;
      while(recent.length && recent[0].at<cutoff) recent.shift();
      const reps=recent.filter(r=>r.t===text).length;
      if(reps>=SPAM_MAXREP || (lastSendText===text && now-lastSendAt<SPAM_WIN)){ status("Duplicate spam blocked.","warn"); playSound("deny"); return; }
      if(chatLocked){ status("Chat is locked by admin.","warn"); playSound("deny"); return; }
      if(window.__st_isBanned){ status("You are banned.","bad"); playSound("deny"); return; }

      send.disabled=true;
      try{
        await messagesCol(cid).add({userId:uid, name:uname, text, replyTo:null, timestamp: firebase.firestore.FieldValue.serverTimestamp()});
        input.value=""; setTyping(cid,uid,false); playSound("send");
        lastSendAt=now; lastSendText=text; recent.push({t:text,at:now});
      }catch(e){ console.error(e); status("Failed to send.","bad"); }
      finally{ send.disabled=false; }
    };

    // message actions
    messages.addEventListener("click",(e)=>{
      const btn=e.target.closest(".msg-btn"); if(!btn) return;
      const msg=e.target.closest(".msg"); if(!msg) return;
      const mid=msg.dataset.id; const muid=msg.dataset.userid;
      if(btn.dataset.action==="delete"){ if(muid!==uid) return; deleteMyMessage(messagesCol(cid).doc(mid)); }
      if(btn.dataset.action==="reply"){
        replyTo=mid;
        const panel=document.getElementById("repliesPanel"); panel.style.display="flex";
        document.getElementById("repliesTitle").textContent="Replying…";
        const list=document.getElementById("repliesList"); list.innerHTML=`<div class="muted" style="padding:10px">Loading replies…</div>`;
        // live replies for this parent (limited)
        if(window.__repliesUnsub){ try{window.__repliesUnsub();}catch{} }
        window.__repliesUnsub = messagesCol(cid).where("replyTo","==",mid).orderBy("timestamp","asc").limitToLast(60).onSnapshot(snap=>{
          list.innerHTML="";
          if(snap.empty){ list.innerHTML=`<div class="muted" style="padding:10px">No replies yet.</div>`; return; }
          snap.forEach(d=>{
            const m=d.data()||{};
            const row=document.createElement("div");
            row.style.cssText="border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px;background:rgba(0,0,0,.20);";
            row.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:center;font-weight:800;opacity:.9"><strong>${escapeHtml(m.name||"User")}</strong><span class="muted">${fmtTime(m.timestamp)}</span></div>`;
            const b=document.createElement("div"); b.style.cssText="margin-top:6px;white-space:pre-wrap;"; b.textContent=(m.deleted?"(deleted)":(m.text||"")); row.appendChild(b);
            if(m.userId===uid && !m.deleted){ const dlt=document.createElement("button"); dlt.className="msg-btn"; dlt.textContent="Delete"; dlt.onclick=()=>deleteMyMessage(d.ref); row.appendChild(dlt); }
            list.appendChild(row);
          });
          list.scrollTop=list.scrollHeight;
        });
        chatUnsubs.push(()=>{ try{window.__repliesUnsub && window.__repliesUnsub();}catch{} });
        document.getElementById("sendReplyBtn").onclick=async()=>{
          const ri=document.getElementById("replyInput");
          let tx=String(ri.value||"").trim(); if(!tx||!replyTo) return;
          if(chatLocked){ status("Chat is locked by admin.","warn"); playSound("deny"); return; }
          if(window.__st_isBanned){ status("You are banned.","bad"); playSound("deny"); return; }
          await messagesCol(cid).add({userId:uid,name:uname,text:tx,replyTo:replyTo,timestamp:firebase.firestore.FieldValue.serverTimestamp()});
          ri.value=""; playSound("send");
        };
      }
    });

    // pagination load older
    loadOlderBtn.onclick=async()=>{
      if(!oldest) return;
      loadOlderBtn.disabled=true; loadOlderInfo.textContent="Loading…";
      try{
        const snap=await messagesCol(cid).orderBy("timestamp","asc").endBefore(oldest).limitToLast(30).get();
        if(snap.empty){ loadOlderInfo.textContent="No more."; oldest=null; return; }
        const frag=document.createDocumentFragment();
        snap.forEach(d=>{
          const m=d.data()||{}; const id="msg_"+d.id;
          if(document.getElementById(id)) return;
          const el=msgEl(d.id,m,uid); el.id=id; frag.appendChild(el);
        });
        oldest=snap.docs[0];
        const prev=messages.scrollHeight;
        messages.insertBefore(frag, messages.firstChild);
        messages.scrollTop += (messages.scrollHeight-prev);
        loadOlderInfo.textContent="";
      }catch(e){ console.error(e); loadOlderInfo.textContent="Failed."; }
      finally{ loadOlderBtn.disabled=false; }
    };

    // live listener (30 or 15)
    const nearBottom=()=> (messages.scrollHeight - messages.scrollTop - messages.clientHeight) < 160;
    const liveQ=()=>messagesCol(cid).orderBy("timestamp","asc").limitToLast(window.__st_dataSaver?15:25);
    chatUnsubs.push(liveQ().onSnapshot(snap=>{
      const stick=nearBottom();
      if(!messages.dataset.inited){
        messages.innerHTML="";
        snap.forEach(d=>{
          const m=d.data()||{}; const el=msgEl(d.id,m,uid); el.id="msg_"+d.id; messages.appendChild(el);
        });
        messages.dataset.inited="1";
        oldest=snap.docs[0]||oldest;
        if(stick) messages.scrollTop=messages.scrollHeight;
        return;
      }
      snap.docChanges().forEach(ch=>{
        const d=ch.doc; const m=d.data()||{}; const id="msg_"+d.id;
        const ex=document.getElementById(id);
        if(ch.type==="added"){
          const el=msgEl(d.id,m,uid); el.id=id; messages.appendChild(el);
          if(stick) messages.scrollTop=messages.scrollHeight;
          if(m.userId && m.userId!==uid){ maybeNotify(selectedClassName||cid, m.name||"Someone", String(m.text||"")); if(document.hidden) playSound("receive"); }
        }else if(ch.type==="modified"){
          if(ex){ const body=ex.querySelector(".msg-text"); const del=!!m.deleted || String(m.text||"").trim().toLowerCase()==="(deleted)"; if(body){ body.textContent=del?"(deleted)":(m.text||""); body.classList.toggle("deleted",del); } }
        }else if(ch.type==="removed"){ if(ex) ex.remove(); }
      });
    }));

    // scroll button
    (function(){
      const btn=$("stScrollBtn"), unseenEl=$("stUnseen");
      let unseen=0;
      const hide=()=>{ unseen=0; unseenEl.textContent="0"; btn.classList.add("hidden"); };
      messages.addEventListener("scroll",()=>{ if(nearBottom()) hide(); }, {passive:true});
      btn.onclick=()=>{ messages.scrollTop=messages.scrollHeight; hide(); };
      const mo=new MutationObserver(muts=>{
        const isNear=nearBottom();
        for(const m of muts){
          for(const n of (m.addedNodes||[])){
            if(!(n instanceof HTMLElement)) continue;
            if(!n.classList.contains("msg")) continue;
            if(!isNear){ unseen++; unseenEl.textContent=String(unseen); btn.classList.remove("hidden"); }
          }
        }
        if(isNear) messages.scrollTop=messages.scrollHeight;
      });
      mo.observe(messages,{childList:true});
      chatUnsubs.push(()=>mo.disconnect());
    })();

    requestNotifOnce();
  }

  // boot
  const cid=localStorage.getItem("classId");
  const uid=localStorage.getItem("userId");
  const uname=localStorage.getItem("userName");
  const cname=localStorage.getItem("className");
  if(cid && uid && uname){
    selectedClassId=cid; selectedClassName=cname||cid; userId=uid; userName=uname;
    showScreen("wait"); $("waitStatus").textContent="Reconnecting…";
    watchStatus(cid,uid,uname);
  }else{
    showScreen("class");
    loadClasses();
  }
});
