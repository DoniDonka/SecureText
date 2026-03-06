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
  function fmtTimeFull(ts){
    try { return ts?.toDate ? ts.toDate().toLocaleString() : ""; } catch { return ""; }
  }

  // flash
  function stFlash(){
    const el=$("stFlash"); if(!el) return;
    el.classList.add("on"); setTimeout(()=>el.classList.remove("on"), 220);
  }

  // local settings
  const SETTINGS_KEY="st_settings_v6";
  const DEFAULTS={theme:"night", sound:true, here:true, fontSize:"medium"};
  function getSettings(){ try{ return {...DEFAULTS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}")||{})}; }catch{return {...DEFAULTS};} }
  function setSettings(s){ try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }catch{} }
  let settings=getSettings();

  function resolveThemeMode(){
    const t=settings.theme;
    if(t==="system" && typeof window.matchMedia!=="undefined" && window.matchMedia("(prefers-color-scheme: light)").matches) return "day";
    if(t==="system") return "night";
    return t==="day"?"day":"night";
  }
  function applyTheme(mode) {
    const resolved = mode==="system" ? resolveThemeMode() : (mode==="day"?"day":"night");
    const cs = document.getElementById("chat-screen");
    if (cs) {
      cs.classList.remove("day","night");
      cs.classList.add(resolved);
    }
    document.body.classList.remove("theme-day","theme-night");
    document.body.classList.add(resolved === "day" ? "theme-day" : "theme-night");
    const tbtn = document.getElementById("themeToggle");
    if (tbtn) tbtn.textContent = resolved === "day" ? "☀️" : "🌙";
    const fs = settings.fontSize || "medium";
    document.body.classList.remove("font-small","font-medium","font-large");
    document.body.classList.add("font-" + (fs === "small" ? "small" : fs === "large" ? "large" : "medium"));
  }
  function applyPreset(p){
    document.body.classList.remove("preset-neon","preset-emerald","preset-mono");
    if(p==="neon") document.body.classList.add("preset-neon");
    if(p==="emerald") document.body.classList.add("preset-emerald");
    if(p==="mono") document.body.classList.add("preset-mono");
  }

  // sounds (receive = new message, announcement = new announcement, approve = approved/alert)
  function playSound(type){
    if(!settings.sound) return;
    try{
      const ctx=new (window.AudioContext||window.webkitAudioContext)();
      const o=ctx.createOscillator(); const g=ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      const now=ctx.currentTime;
      const freq = type==="deny"?220 : type==="approve"?740 : type==="send"?620 : type==="receive"?440 : type==="announcement"?880 : 520;
      const dur = type==="approve"||type==="announcement"?0.10 : 0.07;
      o.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.08, now+0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now+dur);
      o.start(now); o.stop(now+dur+0.02);
      o.onended=()=>{try{ctx.close();}catch{}};
    }catch{}
  }

  // confetti (lightweight, no lib)
  function stConfetti(opts){
    const count=opts?.count||40; const container=opts?.container||document.body; const duration=opts?.duration||2200;
    const colors=["#508cff","#ff5a5a","#3cffa0","#ffd76b","#ff80c0"];
    const frag=document.createDocumentFragment();
    for(let i=0;i<count;i++){
      const el=document.createElement("div");
      el.style.cssText="position:fixed;width:10px;height:10px;border-radius:2px;pointer-events:none;z-index:999999;";
      el.style.left=Math.random()*100+"vw"; el.style.top="-10px";
      el.style.background=colors[Math.floor(Math.random()*colors.length)];
      el.style.setProperty("--tx",(Math.random()-0.5)*200+"px");
      el.style.setProperty("--rot",Math.random()*360+"deg");
      el.style.animation=`stConfettiFall ${duration}ms ease-out forwards`;
      frag.appendChild(el);
      setTimeout(()=>el.remove(),duration);
    }
    container.appendChild(frag);
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
  const reportsCol=(cid)=>(window.ST_REFS?window.ST_REFS.reportsCol(cid):classDoc(cid).collection("reports"));
  const checkInDoc=(cid)=>(window.ST_REFS?window.ST_REFS.checkInDoc(cid):classDoc(cid).collection("meta").doc("checkIn"));
  const activePollDoc=(cid)=>(window.ST_REFS?window.ST_REFS.activePollDoc(cid):classDoc(cid).collection("meta").doc("activePoll"));
  const moderationDoc=(cid)=>(window.ST_REFS?window.ST_REFS.moderationDoc(cid):classDoc(cid).collection("meta").doc("moderation"));

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
    function startInterval(){ beat(); presenceTimer=setInterval(beat, intervalMs); }
    startInterval();
    const visHandler=()=>{
      if(document.hidden){ if(presenceTimer){ clearInterval(presenceTimer); presenceTimer=null; } }
      else startInterval();
    };
    document.addEventListener("visibilitychange",visHandler);
    chatUnsubs.push(()=>document.removeEventListener("visibilitychange",visHandler));
    const TTL = intervalMs + 35000;
    const unsub=ref.onSnapshot(doc=>{
      if(window.__st_connUpdate) window.__st_connUpdate();
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
      if(d.slowMode!==undefined) handlers.onSlowMode?.(!!d.slowMode, d.slowModeSeconds);
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
      stConfetti({count:50,duration:2500});
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
  const REACTION_EMOJI=["👍","❤️","😂","🔥"];
  const EDIT_WINDOW_MS=120000;
  function msgEl(id,m,me){
    const w=document.createElement("div"); w.className="msg"; w.dataset.id=id; w.dataset.userid=m.userId||"";
    const timeStr=fmtTime(m.timestamp); const timeFull=fmtTimeFull(m.timestamp);
    w.innerHTML=`<div class="msg-top"><strong>${escapeHtml(m.name||"User")}</strong> <span class="muted msg-time" title="${escapeHtml(timeFull)}">${timeStr}</span><span class="msg-sent-check"></span></div>`;
    const body=document.createElement("div"); body.className="msg-text";
    const del=!!m.deleted || String(m.text||"").trim().toLowerCase()==="(deleted)";
    const textDisplay=del?"(deleted)":(m.text||"");
    const edited=!!m.editedAt;
    body.textContent=textDisplay+(edited&&!del?" (edited)":""); if(del) body.classList.add("deleted");
    w.appendChild(body);
    if(!del){
      const acts=document.createElement("div"); acts.className="msg-actions";
      const copyBtn=document.createElement("button"); copyBtn.className="msg-btn"; copyBtn.textContent="Copy"; copyBtn.dataset.action="copy"; acts.appendChild(copyBtn);
      const reportBtn=document.createElement("button"); reportBtn.className="msg-btn"; reportBtn.textContent="Report"; reportBtn.dataset.action="report"; acts.appendChild(reportBtn);
      const r=document.createElement("button"); r.className="msg-btn"; r.textContent="Reply"; r.dataset.action="reply"; acts.appendChild(r);
      const tsMs=m.timestamp?.toDate?.()?.getTime?.()||0;
      const canEdit=m.userId===me && tsMs && (Date.now()-tsMs<EDIT_WINDOW_MS);
      if(canEdit){ const ed=document.createElement("button"); ed.className="msg-btn"; ed.textContent="Edit"; ed.dataset.action="edit"; acts.appendChild(ed); }
      if(m.userId===me){ const d=document.createElement("button"); d.className="msg-btn"; d.textContent="Delete"; d.dataset.action="delete"; acts.appendChild(d); }
      w.appendChild(acts);
      const rx=document.createElement("div"); rx.className="msg-reactions";
      const reactions= m.reactions||{};
      REACTION_EMOJI.forEach(emoji=>{
        const uids=reactions[emoji]||[];
        const count=uids.length;
        const mine=uids.includes(me);
        const b=document.createElement("button"); b.className="msg-reaction-btn"+(mine?" active":"");
        b.textContent=emoji+(count?` ${count}`:""); b.dataset.emoji=emoji; b.dataset.action="react";
        rx.appendChild(b);
      });
      w.appendChild(rx);
    }
    if(!del && m.userId===me && id===window.__st_pendingSentId){
      const check=w.querySelector(".msg-sent-check"); if(check){ check.textContent=" ✓"; check.classList.add("visible"); }
      window.__st_pendingSentId=null;
    }
    return w;
  }
  function updateMsgReactionsAndEdit(el,m,me){
    const body=el.querySelector(".msg-text");
    const del=!!m.deleted || String(m.text||"").trim().toLowerCase()==="(deleted)";
    if(body){ body.textContent=(del?"(deleted)":(m.text||""))+(m.editedAt&&!del?" (edited)":""); body.classList.toggle("deleted",del); }
    const rx=el.querySelector(".msg-reactions");
    if(rx){
      const reactions=m.reactions||{};
      rx.querySelectorAll(".msg-reaction-btn").forEach(b=>{
        const emoji=b.dataset.emoji;
        const uids=reactions[emoji]||[];
        b.textContent=emoji+(uids.length?` ${uids.length}`:"");
        b.classList.toggle("active",uids.includes(me));
      });
    }
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
    if(err) err.textContent="";
    if(box){ box.innerHTML=""; for(let i=0;i<4;i++){ const s=document.createElement("div"); s.className="st-skeleton st-skeleton-btn"; box.appendChild(s); } }
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
      const by=d.name?` — ${escapeHtml(d.name)}`:"";
      const mid=d.messageId;
      const jumpLink=mid ? `<div style="margin-top:8px"><button type="button" class="msg-btn st-jump-to-msg" data-mid="${escapeHtml(mid)}">Jump to message</button></div>` : "";
      pinnedBox.innerHTML=`<div class="st-pinned-label">📌 Pinned${by}</div><div class="st-pinned-text">${escapeHtml(text)}</div>${jumpLink}`;
      pinnedBox.querySelector(".st-jump-to-msg")?.addEventListener("click",()=>{
        const el=document.getElementById("msg_"+mid) || document.querySelector(".msg[data-id=\""+mid+"\"]");
        if(el){ el.scrollIntoView({behavior:"smooth",block:"center"}); el.classList.add("msg-highlight"); setTimeout(()=>el.classList.remove("msg-highlight"),2500); }
      });
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
            <div class="st-setting-row"><div><div class="st-setting-name">Theme</div><div class="st-setting-desc">Day / Night / System</div></div><select id="stThemeSelect"><option value="night">🌙 Night</option><option value="day">☀️ Day</option><option value="system">📱 System</option></select></div>
            <div class="st-setting-row"><div><div class="st-setting-name">Font size</div><div class="st-setting-desc">Chat text size</div></div><select id="stFontSelect"><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></div>
            <div class="st-setting-row"><div><div class="st-setting-name">Sounds</div><div class="st-setting-desc">Send / receive / alerts</div></div><button id="stSound" class="st-pill-btn" type="button"></button></div>
            <div class="st-setting-row"><div><div class="st-setting-name">@here alerts</div><div class="st-setting-desc">Flash + notify</div></div><button id="stHere" class="st-pill-btn" type="button"></button></div>
            <div class="st-setting-row"><button id="stWhatsNewBtn" type="button" class="msg-btn">What&apos;s new</button></div>
          </div></div>`;
        document.body.appendChild(ov);
        ov.addEventListener("click",(e)=>{ if(e.target===ov) ov.classList.remove("on"); });
      }
      const render=()=>{
        const sel=$("stThemeSelect"); if(sel) sel.value=settings.theme||"night";
        const fs=$("stFontSelect"); if(fs) fs.value=settings.fontSize||"medium";
        $("stSound").textContent = settings.sound?"🔊 On":"🔇 Off";
        $("stHere").textContent = settings.here?"On":"Off";
      };
      render();
      $("stClose").onclick=()=>ov.classList.remove("on");
      const themeSel=$("stThemeSelect"); if(themeSel) themeSel.onchange=()=>{ settings.theme=themeSel.value; setSettings(settings); applyTheme(settings.theme); render(); };
      const fontSel=$("stFontSelect"); if(fontSel) fontSel.onchange=()=>{ settings.fontSize=fontSel.value; setSettings(settings); document.body.classList.remove("font-small","font-medium","font-large"); document.body.classList.add("font-"+(settings.fontSize==="small"?"small":settings.fontSize==="large"?"large":"medium")); render(); };
      try{ const q=window.matchMedia("(prefers-color-scheme: light)"); q.addEventListener("change",()=>{ if(settings.theme==="system") applyTheme("system"); }); }catch{}
      $("stSound").onclick=()=>{ settings.sound=!settings.sound; setSettings(settings); render(); };
      $("stHere").onclick=()=>{ settings.here=!settings.here; setSettings(settings); render(); };
      $("stWhatsNewBtn").onclick=()=>{
        const wov=document.getElementById("stWhatsNewOverlay")||document.createElement("div");
        if(!wov.id){
          wov.id="stWhatsNewOverlay"; wov.className="st-overlay";
          wov.innerHTML=`<div class="st-modal"><div class="st-modal-top"><div class="st-modal-title">What&apos;s new</div><button type="button" class="st-icon-btn st-whatsnew-close">✕</button></div><div class="st-modal-body st-whatsnew-body"><p>Polls and check-in — you can run quick polls and check-ins from the admin panel. Students see them in chat.</p><p>Report reasons — when reporting a message, you pick Spam, Off-topic, Unkind, or Other so admins have more context.</p><p>Unread line and jump to message — load older messages and you'll see where unread starts; pinned messages can have a Jump to message link.</p><p>Announcements collapse and load more — collapse the block to save space; new ones open it again. First few show by default, then Load more.</p><p>Font size and sent checkmark — change chat text size in settings; your sent messages get a small check when they're saved.</p><p>Draft and retry — your message is saved locally while you type. If send fails, tap Send again to retry.</p></div></div>`;
          document.body.appendChild(wov);
          wov.querySelector(".st-whatsnew-close").onclick=()=>wov.classList.remove("on");
          wov.addEventListener("click",e=>{ if(e.target===wov) wov.classList.remove("on"); });
        }
        wov.classList.add("on");
      };
      ov.classList.add("on");
    };

    // Help modal
    function showHelpModal(){
      const ov=document.getElementById("stHelpOverlay")||document.createElement("div");
      if(!ov.id){
        ov.id="stHelpOverlay"; ov.className="st-overlay";
        ov.innerHTML=`<div class="st-modal st-help-modal"><div class="st-modal-top"><div class="st-modal-title">Help &amp; shortcuts</div><button id="stHelpClose" class="st-icon-btn" type="button">✕</button></div>
          <div class="st-modal-body">
            <p><strong>Shortcuts</strong></p>
            <ul class="st-help-list">
              <li><kbd>Enter</kbd> or <kbd>Ctrl+Enter</kbd> Send message</li>
              <li><kbd>/</kbd> Focus search</li>
              <li><kbd>Esc</kbd> Close modal / panel</li>
            </ul>
            <p><strong>Tips</strong></p>
            <ul class="st-help-list">
              <li>Use <b>@here</b> in a message to ping the whole class (flash + notification).</li>
              <li>🔍 opens search and export. Export saves visible messages as a text file.</li>
              <li>School networks (e.g. NYCDOE) may delay updates; the app checks every 10 seconds.</li>
            </ul>
          </div></div>`;
        document.body.appendChild(ov);
        ov.addEventListener("click",e=>{ if(e.target===ov) ov.classList.remove("on"); });
        ov.querySelector("#stHelpClose").onclick=()=>ov.classList.remove("on");
      }
      ov.classList.add("on");
    }
    $("helpBtn").onclick=showHelpModal;

    // Keyboard: Esc close modals, / focus search
    document.addEventListener("keydown",function stGlobalKey(e){
      if(e.key==="Escape"){
        document.getElementById("stSettingsOverlay")?.classList.remove("on");
        document.getElementById("stHelpOverlay")?.classList.remove("on");
        const rp=document.getElementById("repliesPanel"); if(rp&&rp.style.display==="flex"){ rp.style.display="none"; replyTo=null; }
      }
      if(e.key==="/" && document.activeElement?.id!=="chatSearchInput" && document.activeElement?.id!=="msgInput"){
        const chatScreen=$("screen-chat");
        if(chatScreen&&chatScreen.classList.contains("active")){
          e.preventDefault();
          const wrap=$("chatSearchWrap"); const inp=$("chatSearchInput");
          if(wrap&&inp){ wrap.style.display="flex"; inp.focus(); }
        }
      }
    });

    // Connection indicator (green = recent update, gray = stale)
    let lastFirestoreUpdate=0;
    const connDot=$("connectionDot");
    if(connDot){
      lastFirestoreUpdate=Date.now();
      connDot.classList.add("ok");
      window.__st_connUpdate=()=>{ lastFirestoreUpdate=Date.now(); connDot.classList.add("ok"); connDot.classList.remove("stale"); };
      const checkConn=()=>{ connDot.classList.toggle("ok", Date.now()-lastFirestoreUpdate<35000); connDot.classList.toggle("stale", Date.now()-lastFirestoreUpdate>=35000); };
      setInterval(checkConn,8000);
      chatUnsubs.push(()=>{ delete window.__st_connUpdate; });
    }

    // Emoji picker
    const EMOJI_LIST=["👍","❤️","😂","😮","😢","🔥","👏","🙏","✨","🎉"];
    const strip=$("emojiPickerStrip"); const emojiBtn=$("emojiPickerBtn");
    if(strip){ strip.innerHTML=EMOJI_LIST.map(e=>`<button type="button" class="st-emoji-opt" data-emoji="${e}">${e}</button>`).join(""); }
    if(emojiBtn&&strip){
      emojiBtn.onclick=()=>strip.classList.toggle("hidden");
      strip.querySelectorAll(".st-emoji-opt").forEach(btn=>{
        btn.onclick=()=>{ const v=$("msgInput"); if(v){ v.value+=btn.dataset.emoji; v.focus(); } };
      });
    }

    $("themeToggle").onclick=()=>{ settings.theme=settings.theme==="day"?"night":"day"; setSettings(settings); applyTheme(settings.theme); playSound("send"); };
    const doLogout=()=>{ clearChat(); localStorage.removeItem("classId"); localStorage.removeItem("className"); localStorage.removeItem("userId"); localStorage.removeItem("userName"); selectedClassId=null; selectedClassName=null; showScreen("class"); loadClasses(); };
    $("logoutBtn").onclick=doLogout; $("logoutBtnTop").onclick=doLogout;

    // banned cache
    window.__st_isBanned=false;
    chatUnsubs.push(bannedDoc(cid,uid).onSnapshot(d=>{ window.__st_isBanned=!!d?.exists; }));

    // commands + slow mode + moderation (bad words)
    window.__st_dataSaver=false;
    window.__st_slowMode=false;
    window.__st_slowModeSeconds=10;
    window.__st_moderation={ filterEnabled: false, words: [] };
    startCommands(cid,{
      onLogout: doLogout,
      onRerules: ()=>{ localStorage.removeItem(rulesKey(cid,uid)); showRulesGate(cid,uid,uname,selectedClassName||cid, ()=>{}); },
      onRefresh: ()=>location.reload(),
      onLock: (l,msg)=>setLocked(l,msg),
      onTheme: (m)=>applyTheme(m),
      onPreset: (p)=>applyPreset(p),
      onDataSaver: (on)=>{ window.__st_dataSaver=!!on; },
      onSlowMode: (enabled, sec)=>{ window.__st_slowMode=!!enabled; window.__st_slowModeSeconds=Math.max(5, Number(sec)||10); },
    });
    chatUnsubs.push(moderationDoc(cid).onSnapshot(doc=>{
      const d=doc?.data?.()||{};
      window.__st_moderation={ filterEnabled: !!d.filterEnabled, words: Array.isArray(d.words)?d.words:(typeof d.words==="string"?d.words.split(/[\s,]+/).filter(Boolean):[]) };
    }));

    // presence + typing listeners
    startPresence(cid,uid);
    chatUnsubs.push(typingDoc(cid).onSnapshot(doc=>renderTyping(doc?.data()||{}, uid)));

    // announcements: collapse, new opens, load more (show 5 then reveal), New badge
    const ANNOUNCE_VISIBLE=5;
    const announcementsCard=$("announcementsCard"); const announcementsBody=$("announcementsBody"); const announcementsTitle=$("announcementsTitle"); const announcementsChevron=$("announcementsChevron"); const announcementsLoadMore=$("announcementsLoadMore");
    let announcementsExpanded=true; let announcementsAllDocs=[];
    const lastSeenKey=()=>"st_announce_seen_"+cid;
    if(announcementsCard){
      announcementsCard.querySelector(".st-announcements-header")?.addEventListener("click",()=>{
        announcementsExpanded=!announcementsExpanded;
        announcementsBody.style.display=announcementsExpanded?"block":"none";
        announcementsChevron.textContent=announcementsExpanded?"▼":"▶";
      });
    }
    if(announcementsLoadMore) announcementsLoadMore.onclick=()=>{
      const list=$("announcementsList"); if(!list) return;
      list.querySelectorAll(".st-announce-row").forEach((r,i)=>{ r.classList.remove("hidden"); });
      announcementsLoadMore.classList.add("hidden");
    };
    chatUnsubs.push(annCol(cid).orderBy("timestamp","asc").limit(10).onSnapshot(snap=>{
      const list=$("announcementsList"); if(!list) return;
      announcementsAllDocs=snap.docs;
      const lastSeen=localStorage.getItem(lastSeenKey())||"";
      list.innerHTML="";
      snap.forEach((d,i)=>{
        const a=d.data()||{};
        const isNew=d.id!==lastSeen && i===snap.size-1;
        const row=document.createElement("div");
        row.className="st-announce-row"+(i>=ANNOUNCE_VISIBLE?" hidden":"");
        row.style.cssText="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)";
        row.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><strong>${escapeHtml(a.by||"Admin")}</strong><span class="muted">${fmtTime(a.timestamp)}</span>${isNew?' <span class="st-new-badge">New</span>':""}</div><div style="margin-top:6px;white-space:pre-wrap">${escapeHtml(a.text||"")}</div>`;
        list.appendChild(row);
      });
      if(announcementsTitle) announcementsTitle.textContent="Announcements"+(snap.size?" ("+snap.size+")":"");
      if(announcementsLoadMore){ const extra=Math.max(0,snap.size-ANNOUNCE_VISIBLE); announcementsLoadMore.classList.toggle("hidden",extra===0); announcementsLoadMore.textContent="Load more"+(extra?" ("+extra+")":""); }
      snap.docChanges().forEach(ch=>{
        if(ch.type==="added"){
          const a=ch.doc.data()||{};
          stFlash(); playSound("announcement"); stConfetti({count:35,duration:2200});
          maybeNotify(selectedClassName||cid, "Announcement", String(a.text||""));
          const card=document.getElementById("announcementsCard");
          if(card){ card.classList.remove("pulse"); void card.offsetWidth; card.classList.add("pulse"); setTimeout(()=>card.classList.remove("pulse"),800); card.classList.remove("st-announcements-collapsed"); if(announcementsBody) announcementsBody.style.display="block"; announcementsExpanded=true; if(announcementsChevron) announcementsChevron.textContent="▼"; }
        }
      });
      if(announcementsExpanded && snap.size>0) setTimeout(()=>{ try{ localStorage.setItem(lastSeenKey(),snap.docs[snap.docs.length-1].id); }catch{} },3000);
    }));

    // Check-in (admin starts; students see "I'm here")
    const checkInBanner=$("checkInBanner"); const checkInBtn=$("checkInBtn");
    chatUnsubs.push(checkInDoc(cid).onSnapshot(doc=>{
      if(!checkInBanner) return;
      const d=doc?.data?.()||{};
      if(!d.active){ checkInBanner.classList.add("hidden"); return; }
      checkInBanner.classList.remove("hidden");
      const already=d.checkIns&&d.checkIns[uid];
      if(checkInBtn){ checkInBtn.textContent=already?"✓ Checked in":"I'm here"; checkInBtn.disabled=!!already; }
    }));
    if(checkInBtn) checkInBtn.onclick=async()=>{
      try{ await checkInDoc(cid).update({[`checkIns.${uid}`]:firebase.firestore.FieldValue.serverTimestamp()}); status("Checked in!","ok"); }catch(e){ status("Failed.","bad"); }
    };

    // Poll (admin creates; students vote, see results)
    const pollCard=$("pollCard"); const pollQuestion=$("pollQuestion"); const pollOptions=$("pollOptions"); const pollResults=$("pollResults");
    chatUnsubs.push(activePollDoc(cid).onSnapshot(doc=>{
      if(!pollCard||!pollQuestion||!pollOptions) return;
      const d=doc?.data?.()||{};
      const q=d.question; const opts=d.options;
      if(!q||!Array.isArray(opts)||!opts.length){ pollCard.classList.add("hidden"); return; }
      pollCard.classList.remove("hidden");
      pollQuestion.textContent=q;
      const votes=d.votes||{}; const myVote=votes[uid]; const allowChange=!!d.allowChangeVote;
      pollOptions.innerHTML="";
      opts.forEach(opt=>{
        const btn=document.createElement("button"); btn.type="button"; btn.className="msg-btn"; btn.textContent=opt;
        if(myVote===opt) btn.classList.add("active");
        btn.onclick=async()=>{ if(myVote&&!allowChange) return; try{ await activePollDoc(cid).update({[`votes.${uid}`]:opt}); }catch{} };
        pollOptions.appendChild(btn);
      });
      const totals=opts.map(o=>{ const c=Object.values(votes).filter(v=>v===o).length; return `${o}: ${c}`; }).join("  ·  ");
      if(pollResults) pollResults.textContent=totals||"No votes yet.";
    }));
    if(pollResults) pollResults.style.marginTop="10px";

    const messages=$("messages");
    const input=$("msgInput");
    const send=$("sendBtn");
    const loadOlderBtn=$("loadOlderBtn");
    const loadOlderInfo=$("loadOlderInfo");
    let oldest=null;
    if(messages){ messages.innerHTML=Array(5).fill(0).map(()=>'<div class="st-skeleton st-skeleton-msg"></div>').join(""); }
    try{ const draft=localStorage.getItem("st_draft_"+cid); if(draft&&input) input.value=draft; }catch{}
    let draftSaveTimer=null;
    input.addEventListener("input",()=>{
      if(draftSaveTimer) clearTimeout(draftSaveTimer);
      draftSaveTimer=setTimeout(()=>{ try{ localStorage.setItem("st_draft_"+cid,input.value||""); }catch{} draftSaveTimer=null; },2000);
    });
    const lastReadKey=()=>"st_lastRead_"+cid;
    function setLastReadToBottom(){ const lastMsg=[...messages.querySelectorAll(".msg")].pop(); if(lastMsg){ try{ localStorage.setItem(lastReadKey(),lastMsg.dataset.id||""); }catch{} } ensureUnreadDivider(); }
    function ensureUnreadDivider(){
      const existing=messages.querySelector(".st-unread-divider"); if(existing) existing.remove();
      try{ var lid=localStorage.getItem(lastReadKey()); }catch{ return; }
      if(!lid) return;
      const after=messages.querySelector(".msg[data-id=\""+lid+"\"]"); if(!after) return;
      const div=document.createElement("div"); div.className="st-unread-divider"; div.setAttribute("aria-hidden","true"); div.textContent="——— Unread ———";
      messages.insertBefore(div,after.nextSibling);
    }

    // enter-to-send + typing (Enter or Ctrl+Enter)
    input.addEventListener("keydown",(e)=>{ if((e.key==="Enter"&&!e.shiftKey)||(e.key==="Enter"&&(e.ctrlKey||e.metaKey))){ e.preventDefault(); send.click(); } });
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
      if(window.__st_slowMode && (now-lastSendAt)<window.__st_slowModeSeconds*1000){ status(`Slow mode: wait ${window.__st_slowModeSeconds}s between messages.`,"warn"); playSound("deny"); return; }
      const mod=window.__st_moderation||{};
      if(mod.filterEnabled&&mod.words&&mod.words.length){
        const lower=text.toLowerCase();
        const bad=mod.words.find(w=>w&&lower.includes(String(w).toLowerCase()));
        if(bad){ status("Message blocked by filter.","warn"); playSound("deny"); return; }
      }

      send.disabled=true;
      try{
        const ref=await messagesCol(cid).add({userId:uid, name:uname, text, replyTo:null, timestamp: firebase.firestore.FieldValue.serverTimestamp()});
        window.__st_pendingSentId=ref.id;
        input.value=""; setTyping(cid,uid,false); playSound("send");
        lastSendAt=now; lastSendText=text; recent.push({t:text,at:now});
        stConfetti({count:12,duration:1200});
        try{ localStorage.removeItem("st_draft_"+cid); }catch{}
      }catch(e){ console.error(e); status("Failed to send. Tap Send again to retry.","bad"); }
      finally{ send.disabled=false; }
    };

    // message actions (copy, reply, edit, delete, react)
    messages.addEventListener("click",async (e)=>{
      const reactBtn=e.target.closest(".msg-reaction-btn");
      if(reactBtn&&reactBtn.dataset.action==="react"){
        const msg=e.target.closest(".msg"); if(!msg) return;
        const mid=msg.dataset.id; const emoji=reactBtn.dataset.emoji;
        const docRef=messagesCol(cid).doc(mid);
        try {
          const doc=await docRef.get(); const data=doc.data()||{};
          const reactions={...(data.reactions||{})}; const arr=reactions[emoji]||[];
          const idx=arr.indexOf(uid);
          if(idx>=0) arr.splice(idx,1); else arr.push(uid);
          if(arr.length) reactions[emoji]=arr; else delete reactions[emoji];
          await docRef.update({reactions});
          if(window.__st_connUpdate) window.__st_connUpdate();
        }catch(err){ console.error(err); }
        return;
      }
      const btn=e.target.closest(".msg-btn"); if(!btn) return;
      const msg=e.target.closest(".msg"); if(!msg) return;
      const mid=msg.dataset.id; const muid=msg.dataset.userid;
      if(btn.dataset.action==="copy"){
        const text=msg.querySelector(".msg-text")?.textContent||""; if(text) navigator.clipboard?.writeText(text).then(()=>status("Copied.", "ok")).catch(()=>{});
        return;
      }
      if(btn.dataset.action==="report"){
        const messageText=(msg.querySelector(".msg-text")?.textContent||"").slice(0,200);
        const reportReasons=["Spam","Off-topic","Unkind","Other"];
        const ov=document.createElement("div"); ov.className="st-overlay on"; ov.innerHTML=`<div class="st-modal"><div class="st-modal-top"><div class="st-modal-title">Why are you reporting?</div><button type="button" class="st-icon-btn st-report-close">✕</button></div><div class="st-modal-body"><div class="st-report-options"></div><div id="stReportOtherWrap" class="hidden" style="margin-top:10px"><input id="stReportOtherInput" type="text" placeholder="Please specify…" /></div><button type="button" id="stReportSubmit" class="primary" style="margin-top:12px">Submit report</button></div></div>`;
        const opts=ov.querySelector(".st-report-options");
        reportReasons.forEach(r=>{ const lb=document.createElement("label"); lb.style.display="block"; lb.style.marginBottom="8px"; lb.innerHTML=`<input type="radio" name="reportReason" value="${escapeHtml(r)}" /> ${escapeHtml(r)}`; opts.appendChild(lb); });
        const otherWrap=ov.querySelector("#stReportOtherWrap"); const otherInput=ov.querySelector("#stReportOtherInput");
        opts.querySelectorAll('input[name="reportReason"]').forEach(radio=>{ radio.onchange=()=>{ otherWrap.classList.toggle("hidden",radio.value!=="Other"); }; });
        document.body.appendChild(ov);
        ov.querySelector(".st-report-close").onclick=()=>ov.remove();
        ov.querySelector("#stReportSubmit").onclick=async()=>{
          const chosen=ov.querySelector('input[name="reportReason"]:checked');
          const reason=chosen?chosen.value:"Other";
          const otherReason=(reason==="Other"?(otherInput.value||"").trim():"");
          try{
            await reportsCol(cid).add({messageId:mid,messageText,reportedBy:uid,reportedByName:uname,reason,otherReason,timestamp:firebase.firestore.FieldValue.serverTimestamp()});
            status("Report submitted. Admin will review.","ok");
          }catch(err){ console.error(err); status("Failed to report.","bad"); }
          ov.remove();
        };
        return;
      }
      if(btn.dataset.action==="edit"){
        if(muid!==uid||chatLocked||window.__st_isBanned) return;
        const body=msg.querySelector(".msg-text"); const current=body?.textContent?.replace(/\s*\(edited\)\s*$/,"")||"";
        const newText=prompt("Edit message", current); if(newText==null) return;
        const trimmed=String(newText).trim(); if(!trimmed) return;
        try{ await messagesCol(cid).doc(mid).update({text:trimmed,editedAt:firebase.firestore.FieldValue.serverTimestamp()}); if(window.__st_connUpdate) window.__st_connUpdate(); }catch(err){ console.error(err); }
        return;
      }
      if(btn.dataset.action==="delete"){ if(muid!==uid) return; deleteMyMessage(messagesCol(cid).doc(mid)); return; }
      if(btn.dataset.action==="reply"){
        replyTo=mid;
        const panel=document.getElementById("repliesPanel"); panel.style.display="flex";
        document.getElementById("repliesTitle").textContent="Replying…";
        const list=document.getElementById("repliesList"); list.innerHTML=`<div class="muted" style="padding:10px">Loading replies…</div>`;
        // live replies for this parent (limited)
        if(window.__repliesUnsub){ try{window.__repliesUnsub();}catch{} }
        window.__repliesUnsub = messagesCol(cid).where("replyTo","==",mid).orderBy("timestamp","asc").limitToLast(30).onSnapshot(snap=>{
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
        const divider=document.createElement("div");
        divider.className="st-new-messages-divider";
        divider.setAttribute("aria-hidden","true");
        frag.appendChild(divider);
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
        let empty=$("messagesEmptyState"); if(!empty){ empty=document.createElement("div"); empty.id="messagesEmptyState"; empty.className="st-empty-state"; empty.textContent="No messages yet. Say hi!"; messages.appendChild(empty); }
        empty.classList.toggle("hidden",!snap.empty);
        messages.dataset.inited="1";
        oldest=snap.docs[0]||oldest;
        if(stick) messages.scrollTop=messages.scrollHeight;
        if(stick) setLastReadToBottom();
        if(window.__st_connUpdate) window.__st_connUpdate();
        ensureUnreadDivider();
        return;
      }
      snap.docChanges().forEach(ch=>{
        const d=ch.doc; const m=d.data()||{}; const id="msg_"+d.id;
        const ex=document.getElementById(id);
        if(ch.type==="added"){
          const el=msgEl(d.id,m,uid); el.id=id; messages.appendChild(el);
          $("messagesEmptyState")?.classList.add("hidden");
          if(stick) messages.scrollTop=messages.scrollHeight;
          if(stick) setLastReadToBottom();
          if(m.userId && m.userId!==uid){ maybeNotify(selectedClassName||cid, m.name||"Someone", String(m.text||"")); playSound("receive"); }
        }else if(ch.type==="modified"){
          if(ex) updateMsgReactionsAndEdit(ex,m,uid);
        }else if(ch.type==="removed"){ if(ex) ex.remove(); }
      });
      ensureUnreadDivider();
      if(snap.docChanges().length && window.__st_connUpdate) window.__st_connUpdate();
    }));

    // scroll button + tab title unread
    const defaultTitle=document.title||"SecureText";
    (function(){
      const btn=$("stScrollBtn"), unseenEl=$("stUnseen");
      let unseen=0;
      const hide=()=>{ unseen=0; if(unseenEl) unseenEl.textContent="0"; if(btn) btn.classList.add("hidden"); document.title=defaultTitle; setLastReadToBottom(); };
      messages.addEventListener("scroll",()=>{ if(nearBottom()){ hide(); setLastReadToBottom(); } }, {passive:true});
      if(btn) btn.onclick=()=>{ messages.scrollTo({top:messages.scrollHeight,behavior:"smooth"}); hide(); setLastReadToBottom(); };
      window.addEventListener("focus",()=>{ if(nearBottom()) hide(); });
      const mo=new MutationObserver(muts=>{
        const isNear=nearBottom();
        for(const m of muts){
          for(const n of (m.addedNodes||[])){
            if(!(n instanceof HTMLElement)) continue;
            if(!n.classList.contains("msg")) continue;
            if(!isNear){ unseen++; if(unseenEl) unseenEl.textContent=String(unseen); if(btn) btn.classList.remove("hidden"); if(document.hidden) document.title=`(${unseen}) ${defaultTitle}`; }
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
