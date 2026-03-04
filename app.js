/* SecureText V6.2 — CLEAN FIX (Firebase v8) */
document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  // ===== Screens =====
  const screens = {
    class: $("screen-class"),
    pin: $("screen-pin"),
    name: $("screen-name"),
    wait: $("screen-wait"),
    chat: $("screen-chat"),
  };
  function showScreen(key) {
    Object.values(screens).forEach((el) => el && el.classList.remove("active"));
    if (screens[key]) screens[key].classList.add("active");
  }

  // ===== Helpers =====
  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function fmtTime(ts) {
    try { return ts && ts.toDate ? ts.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""; }
    catch { return ""; }
  }

  function stFlash() {
    const el = $("stFlash");
    if (!el) return;
    el.classList.add("on");
    setTimeout(() => el.classList.remove("on"), 220);
  }

  // ===== Settings (local) =====
  const SETTINGS_KEY = "st_settings_v62";
  const DEFAULTS = { theme: "night", sound: true, hereAlerts: true };
  function getSettings() {
    try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") || {}) }; }
    catch { return { ...DEFAULTS }; }
  }
  function setSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch {} }

  function applyTheme(mode) {
    const cs = $("chat-screen");
    if (cs) {
      cs.classList.remove("day","night");
      cs.classList.add(mode === "day" ? "day" : "night");
    }
    document.body.classList.remove("theme-day","theme-night");
    document.body.classList.add(mode === "day" ? "theme-day" : "theme-night");

    const tbtn = $("themeToggle");
    if (tbtn) tbtn.textContent = mode === "day" ? "☀️" : "🌙";
  }

  function applyPreset(preset) {
    document.body.classList.remove("preset-neon","preset-emerald","preset-mono");
    if (preset === "neon") document.body.classList.add("preset-neon");
    if (preset === "emerald") document.body.classList.add("preset-emerald");
    if (preset === "mono") document.body.classList.add("preset-mono");
  }

  // ===== Sounds =====
  let soundEnabled = getSettings().sound;
  function playSound(type) {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      const now = ctx.currentTime;
      let freq = 520, dur = 0.07;
      if (type === "send") { freq = 640; dur = 0.06; }
      if (type === "receive") { freq = 520; dur = 0.07; }
      if (type === "approve") { freq = 760; dur = 0.10; }
      if (type === "deny") { freq = 210; dur = 0.09; }
      o.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.start(now);
      o.stop(now + dur + 0.02);
      o.onended = () => { try { ctx.close(); } catch {} };
    } catch {}
  }

  // ===== Notifications =====
  const ASK_KEY = "st_notif_asked";
  function requestNotifOnce() {
    try {
      if (!("Notification" in window)) return;
      if (localStorage.getItem(ASK_KEY) === "1") return;
      localStorage.setItem(ASK_KEY, "1");
      if (Notification.permission === "default") Notification.requestPermission().catch(() => {});
    } catch {}
  }
  function maybeNotify(className, from, text) {
    const t = String(text || "");
    const isHere = t.toLowerCase().includes("@here");
    const settings = getSettings();
    if (isHere && settings.hereAlerts) {
      stFlash();
      playSound("approve");
    }
    try {
      if (!("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      if (!document.hidden && !(isHere && settings.hereAlerts)) return;
      const body = (t.length > 140 ? t.slice(0, 140) + "…" : t);
      new Notification(`📚 SecureText | ${className}`, { body: `${from}: ${body}` });
    } catch {}
  }

  // ===== Firestore refs =====
  function classDocRef(classId) { return db.collection("classes").doc(classId); }
  function pendingRef(classId, userId) { return classDocRef(classId).collection("pendingUsers").doc(userId); }
  function bannedRef(classId, userId) { return classDocRef(classId).collection("bannedUsers").doc(userId); }
  function messagesCol(classId) { return classDocRef(classId).collection("messages"); }
  function announcementsCol(classId) { return classDocRef(classId).collection("announcements"); }
  function typingDoc(classId) { return classDocRef(classId).collection("meta").doc("typing"); }
  function presenceDoc(classId) { return classDocRef(classId).collection("meta").doc("presence"); }
  function commandsDoc(classId) { return classDocRef(classId).collection("meta").doc("commands"); }

  // ===== State =====
  let selectedClassId = null;
  let selectedClassName = null;

  // restore session
  const savedClassId = localStorage.getItem("classId");
  const savedClassName = localStorage.getItem("className");
  const savedUserId = localStorage.getItem("userId");
  const savedUserName = localStorage.getItem("userName");

  // listeners
  let unsubs = [];
  function clearUnsubs() { unsubs.forEach((u)=>{try{u();}catch{}}); unsubs=[]; stopPresence(); }

  // ===== Presence (quota safe) =====
  let presenceTimer = null;
  function stopPresence(){ if(presenceTimer){clearInterval(presenceTimer); presenceTimer=null;} }
  function startPresence(classId, userId){
    stopPresence();
    const ref = presenceDoc(classId);
    const beat = async () => {
      if (document.hidden) return;
      try { await ref.set({ [userId]: firebase.firestore.FieldValue.serverTimestamp() }, { merge:true }); } catch {}
    };
    beat();
    presenceTimer = setInterval(beat, 60000); // 60s (quota saver)

    const unsub = ref.onSnapshot((doc)=>{
      const data = doc && doc.exists ? (doc.data()||{}) : {};
      const now = Date.now();
      const TTL = 125000;
      let c=0;
      Object.values(data).forEach((v)=>{
        if(!v || !v.toDate) return;
        const ms=v.toDate().getTime();
        if(ms && now-ms<=TTL) c++;
      });
      const badge = $("onlineBadge");
      if (badge) badge.textContent = `• ${c} online`;
    });
    unsubs.push(unsub);
  }

  // ===== Typing (debounced, disabled in data saver / hidden) =====
  let typingLocal = false;
  let typingStopTimer = null;
  let typingStartTimer = null;
  async function setTyping(classId, userId, val){
    if (window.__st_dataSaver) return;
    if (document.hidden) return;
    if (typingLocal === val) return;
    typingLocal = val;
    try { await typingDoc(classId).set({ [userId]: !!val }, { merge:true }); } catch {}
  }
  function renderTyping(data, myId){
    const el = $("typingIndicator");
    if (!el) return;
    const others = Object.entries(data||{}).filter(([id,v])=>id!==myId && v===true);
    if (others.length) {
      el.innerHTML = `<span class="typing-bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span><span class="muted" style="margin-left:8px">Someone is typing…</span>`;
    } else el.innerHTML = "";
  }

  // ===== Commands (nonces + lock + forced theme/preset + dataSaver) =====
  function startCommands(classId, handlers){
    const ref = commandsDoc(classId);
    const base = `st_cmd_${classId}_`;
    let init=false;
    const unsub = ref.onSnapshot((doc)=>{
      const data = doc && doc.exists ? (doc.data()||{}) : {};
      const ln = Number(data.logoutNonce||0);
      const rn = Number(data.rulesNonce||0);
      const fn = Number(data.refreshNonce||0);

      const apply = ()=>{
        handlers.onLock && handlers.onLock(!!data.locked, data.lockMessage||"");
        if (data.theme === "day" || data.theme === "night") handlers.onTheme && handlers.onTheme(data.theme);
        if (data.preset === "neon" || data.preset === "emerald" || data.preset === "mono") handlers.onPreset && handlers.onPreset(data.preset);
        if (typeof data.dataSaver === "boolean") handlers.onDataSaver && handlers.onDataSaver(!!data.dataSaver);
      };

      if (!init){
        init=true;
        sessionStorage.setItem(base+"logout", String(ln));
        sessionStorage.setItem(base+"rules", String(rn));
        sessionStorage.setItem(base+"refresh", String(fn));
        apply();
        return;
      }
      const lastL = Number(sessionStorage.getItem(base+"logout")||"0");
      const lastR = Number(sessionStorage.getItem(base+"rules")||"0");
      const lastF = Number(sessionStorage.getItem(base+"refresh")||"0");

      if (ln > lastL){ sessionStorage.setItem(base+"logout", String(ln)); handlers.onLogout && handlers.onLogout(); }
      if (rn > lastR){ sessionStorage.setItem(base+"rules", String(rn)); handlers.onRerules && handlers.onRerules(); }
      if (fn > lastF){ sessionStorage.setItem(base+"refresh", String(fn)); handlers.onRefresh && handlers.onRefresh(); }

      apply();
    });
    unsubs.push(unsub);
  }

  // ===== Rules =====
  function rulesKey(classId, userId){ return `rulesAccepted_${classId}_${userId}`; }
  function hasRules(classId, userId){ return localStorage.getItem(rulesKey(classId,userId))==="true"; }
  function setRules(classId, userId){ localStorage.setItem(rulesKey(classId,userId), "true"); }

  function showRulesGate({classId,userId,userName,className}, onContinue){
    if (hasRules(classId,userId)) { onContinue && onContinue(); return; }
    const overlay=document.createElement("div");
    overlay.style.cssText="position:fixed;inset:0;z-index:999999;display:grid;place-items:center;background:rgba(0,0,0,.72);backdrop-filter:blur(10px);padding:16px;";
    overlay.innerHTML = `
      <div style="width:min(760px,95vw);border-radius:18px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(180deg, rgba(20,20,20,.92), rgba(14,14,14,.76));box-shadow:0 30px 90px rgba(0,0,0,.65);padding:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
          <div>
            <div style="font-weight:900;letter-spacing:.10em">RULES</div>
            <div style="opacity:.75;margin-top:4px">Class: ${escapeHtml(className||classId)}</div>
          </div>
          <div style="opacity:.75">User: ${escapeHtml(userName||"User")}</div>
        </div>
        <div style="margin-top:12px;opacity:.9;line-height:1.5">
          • Be respectful.<br/>• No spam.<br/>• Don’t share personal info.<br/><br/>
          Tip: <b>@here</b> pings + flashes.
        </div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px">
          <button id="rulesContinueBtn" class="primary" style="min-width:180px">Continue</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const btn=overlay.querySelector("#rulesContinueBtn");
    btn.onclick=()=>{
      if(btn.disabled) return;
      btn.disabled=true;
      setRules(classId,userId);
      requestNotifOnce();
      overlay.style.pointerEvents="none";
      overlay.style.opacity="0";
      setTimeout(()=>{ try{overlay.remove();}catch{} },120);
      try{onContinue && onContinue();}catch{}
    };
  }

  // ===== Spam protection =====
  let localMuteUntil = 0;
  let spamBlocks = 0;
  function flashStatus(msg, kind){
    const el = $("chatStatus");
    if (!el) return;
    el.textContent = msg || "";
    try{
      const t = (msg||"").toLowerCase();
      if (t.includes("slow down")||t.includes("duplicate")||t.includes("too long")){
        spamBlocks++;
        if (spamBlocks>=3){
          localMuteUntil = Date.now()+10000;
          spamBlocks=0;
          stFlash();
          playSound("deny");
          el.textContent = "Muted for 10s (spam).";
        }
      }
    }catch{}
  }

  // ===== Build message element =====
  function buildMsgEl(msg, myId){
    const wrap=document.createElement("div");
    wrap.className="msg";
    wrap.dataset.id=msg.id||"";
    wrap.dataset.userid=msg.userId||"";
    const top=document.createElement("div");
    top.className="msg-top";
    top.innerHTML=`<strong>${escapeHtml(msg.name||"User")}</strong> <span class="muted">${fmtTime(msg.timestamp)}</span>`;
    wrap.appendChild(top);

    const body=document.createElement("div");
    body.className="msg-text";
    const deleted = !!msg.deleted || String(msg.text||"").trim().toLowerCase()==="(deleted)";
    body.textContent = deleted ? "(deleted)" : (msg.text||"");
    if (deleted) body.classList.add("deleted");
    wrap.appendChild(body);

    if (!deleted){
      const actions=document.createElement("div");
      actions.className="msg-actions";
      const reply=document.createElement("button");
      reply.type="button";
      reply.className="msg-btn";
      reply.textContent="Reply";
      reply.dataset.action="reply";
      actions.appendChild(reply);

      if (msg.userId===myId){
        const del=document.createElement("button");
        del.type="button";
        del.className="msg-btn";
        del.textContent="Delete";
        del.dataset.action="delete";
        actions.appendChild(del);
      }
      wrap.appendChild(actions);
    }
    return wrap;
  }

  async function deleteMyMessage(ref){
    if (!confirm("Delete this message?")) return;
    try{
      await ref.set({ deleted:true, text:"(deleted)", deletedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge:true });
    }catch{}
  }

  // ===== Load classes =====
  async function loadClasses(){
    const div=$("classes");
    const err=$("classError");
    if (err) err.textContent="";
    if (!div) return;
    div.textContent="Loading…";
    try{
      const snap=await db.collection("classes").get();
      div.innerHTML="";
      if (snap.empty){ div.innerHTML=`<div class="muted">No classes found.</div>`; return; }
      snap.forEach((doc)=>{
        const data=doc.data()||{};
        const b=document.createElement("button");
        b.type="button";
        b.textContent=data.name||doc.id;
        b.onclick=()=>{
          selectedClassId=doc.id;
          selectedClassName=data.name||doc.id;
          $("pinClassName").textContent=selectedClassName;
          showScreen("pin");
        };
        div.appendChild(b);
      });
    }catch(e){
      console.error(e);
      if (err) err.textContent="Failed to load classes.";
      div.textContent="";
    }
  }

  // ===== Navigation =====
  $("pinBackBtn").onclick=()=>showScreen("class");
  $("nameBackBtn").onclick=()=>showScreen("pin");
  $("resetBtn").onclick=()=>{
    clearUnsubs();
    localStorage.removeItem("classId");
    localStorage.removeItem("className");
    localStorage.removeItem("userId");
    localStorage.removeItem("userName");
    selectedClassId=null; selectedClassName=null;
    showScreen("class");
    loadClasses();
  };

  // ===== PIN =====
  $("pinContinueBtn").onclick=async ()=>{
    const pin=String($("pinInput").value||"").trim();
    const err=$("pinError"); if (err) err.textContent="";
    if (!selectedClassId) return;
    if (!pin){ if(err) err.textContent="Enter the class PIN."; return; }
    try{
      const doc=await classDocRef(selectedClassId).get();
      const data=doc.exists?(doc.data()||{}):{};
      if (!doc.exists){ if(err) err.textContent="Class not found."; return; }
      if (String(data.pin||"").trim()!==pin){ if(err) err.textContent="Incorrect PIN."; return; }
      showScreen("name");
    }catch{ if(err) err.textContent="PIN check failed."; }
  };

  // ===== NAME / request =====
  $("nameContinueBtn").onclick=async ()=>{
    const name=String($("nameInput").value||"").trim();
    const err=$("nameError"); if (err) err.textContent="";
    if (!selectedClassId) return;
    if (!name){ if(err) err.textContent="Enter your name."; return; }

    const userId = localStorage.getItem("userId") || Math.random().toString(36).slice(2,12);
    try{
      const bdoc=await bannedRef(selectedClassId,userId).get();
      if (bdoc.exists){ showScreen("wait"); $("waitStatus").textContent="You are banned."; return; }

      await pendingRef(selectedClassId,userId).set({
        name, status:"pending", timestamp: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge:true });

      localStorage.setItem("classId", selectedClassId);
      localStorage.setItem("className", selectedClassName || selectedClassId);
      localStorage.setItem("userId", userId);
      localStorage.setItem("userName", name);

      showScreen("wait");
      $("waitStatus").textContent="Waiting for admin approval…";
      watchStatus(selectedClassId,userId,name);
    }catch(e){
      console.error(e);
      if(err) err.textContent="Request failed.";
    }
  };

  function watchStatus(classId,userId,name){
    clearUnsubs();
    const unsub = pendingRef(classId,userId).onSnapshot((doc)=>{
      const el=$("waitStatus");
      if (!doc.exists){ if(el) el.textContent="Request not found."; return; }
      const data=doc.data()||{};
      const status=data.status||"pending";
      if (status==="approved"){
        playSound("approve");
        showRulesGate({classId,userId,userName:name,className:selectedClassName||classId}, ()=> loadChat(classId,userId,name));
      } else if (status==="rejected"){ if(el) el.textContent="You were rejected."; }
      else if (status==="banned"){ if(el) el.textContent="You are banned."; }
      else { if(el) el.textContent="Waiting for admin approval…"; }
    });
    unsubs.push(unsub);
  }

  // ===== Chat =====
  function loadChat(classId,userId,name){
    clearUnsubs();
    showScreen("chat");

    // apply local theme immediately
    const s=getSettings();
    soundEnabled=!!s.sound;
    applyTheme(s.theme);

    $("chatWelcome").textContent=`Welcome, ${name}!`;
    $("chatSubtitle").textContent=`SecureText chat | ${selectedClassName||classId}`;

    // Settings button
    const settingsBtn=$("settingsBtn");
    if (settingsBtn) settingsBtn.onclick=()=>{
      // quick toggle sounds + here alerts (minimal, safe)
      const cur=getSettings();
      cur.sound=!cur.sound;
      soundEnabled=cur.sound;
      setSettings(cur);
      flashStatus(cur.sound ? "Sounds: ON" : "Sounds: OFF");
      playSound("send");
    };

    // Theme toggle
    const t=$("themeToggle");
    if (t) t.onclick=()=>{
      const cur=getSettings();
      const next = cur.theme==="day" ? "night" : "day";
      const ns={...cur, theme: next};
      setSettings(ns);
      applyTheme(next);
      playSound("send");
    };

    // Logout
    const logout=()=>{
      clearUnsubs();
      localStorage.removeItem("classId");
      localStorage.removeItem("className");
      localStorage.removeItem("userId");
      localStorage.removeItem("userName");
      selectedClassId=null; selectedClassName=null;
      showScreen("class");
      loadClasses();
    };
    const lb=$("logoutBtn"); if (lb) lb.onclick=logout;
    const lbt=$("logoutBtnTop"); if (lbt) lbt.onclick=logout;

    // lock handling
    let locked=false;
    function setLock(on,msg){
      locked=!!on;
      // simple status bar
      if (locked) flashStatus(msg || "Chat locked by admin.", "warn");
      else flashStatus("", "");
    }

    // commands
    window.__st_dataSaver = false;
    startCommands(classId,{
      onLogout: logout,
      onRerules: ()=>{ localStorage.removeItem(rulesKey(classId,userId)); showRulesGate({classId,userId,userName:name,className:selectedClassName||classId}, ()=>{}); },
      onRefresh: ()=>location.reload(),
      onLock: (on,msg)=>setLock(on,msg),
      onTheme: (mode)=>applyTheme(mode),
      onPreset: (p)=>applyPreset(p),
      onDataSaver: (on)=>{ window.__st_dataSaver=!!on; },
    });

    // presence + typing listeners
    startPresence(classId,userId);
    const typUnsub = typingDoc(classId).onSnapshot((doc)=>{
      if (window.__st_dataSaver){ renderTyping({},userId); return; }
      const data = doc && doc.exists ? (doc.data()||{}) : {};
      renderTyping(data,userId);
    });
    unsubs.push(typUnsub);

    // announcements (limit 10 for quota)
    const annUnsub = announcementsCol(classId).orderBy("timestamp","desc").limit(10).onSnapshot((snap)=>{
      const list=$("announcementsList");
      if (!list) return;
      list.innerHTML="";
      const docs=snap.docs.slice().reverse();
      docs.forEach((d)=>{
        const a=d.data()||{};
        const row=document.createElement("div");
        row.style.cssText="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.06)";
        row.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px"><strong>${escapeHtml(a.by||"Admin")}</strong><span class="muted">${fmtTime(a.timestamp)}</span></div>
        <div style="margin-top:6px;white-space:pre-wrap">${escapeHtml(a.text||"")}</div>`;
        list.appendChild(row);
      });
      snap.docChanges().forEach((ch)=>{
        if (ch.type!=="added") return;
        const a=ch.doc.data()||{};
        maybeNotify(selectedClassName||classId, "Announcement", String(a.text||""));
      });
    });
    unsubs.push(annUnsub);

    // messages
    const messagesDiv=$("messages");
    const input=$("msgInput");
    const send=$("sendBtn");

    // typing input debounce
    if (input){
      input.addEventListener("input", ()=>{
        if (window.__st_dataSaver) return;
        if (typingStartTimer) clearTimeout(typingStartTimer);
        typingStartTimer=setTimeout(()=>setTyping(classId,userId,true), 220);
        if (typingStopTimer) clearTimeout(typingStopTimer);
        typingStopTimer=setTimeout(()=>setTyping(classId,userId,false), 1400);
      });
      input.addEventListener("keydown",(e)=>{
        if (e.key==="Enter" && !e.shiftKey){ e.preventDefault(); send && send.click(); }
      });
    }

    // load older
    let oldestDoc=null;
    const loadOlderBtn=$("loadOlderBtn");
    const loadOlderInfo=$("loadOlderInfo");
    async function loadOlder(){
      if (!oldestDoc) return;
      if (loadOlderBtn) loadOlderBtn.disabled=true;
      if (loadOlderInfo) loadOlderInfo.textContent="Loading…";
      try{
        const snap = await messagesCol(classId).orderBy("timestamp","asc").endBefore(oldestDoc).limitToLast(30).get();
        if (snap.empty){ if(loadOlderInfo) loadOlderInfo.textContent="No more."; oldestDoc=null; return; }
        const frag=document.createDocumentFragment();
        snap.forEach((d)=>{
          const m=d.data()||{};
          const id=`msg_${d.id}`;
          if (document.getElementById(id)) return;
          const el=buildMsgEl({id:d.id, ...m}, userId);
          el.id=id;
          frag.appendChild(el);
        });
        oldestDoc=snap.docs[0];
        if (messagesDiv){
          const prev=messagesDiv.scrollHeight;
          messagesDiv.insertBefore(frag, messagesDiv.firstChild);
          messagesDiv.scrollTop += (messagesDiv.scrollHeight-prev);
        }
        if (loadOlderInfo) loadOlderInfo.textContent="";
      }catch{ if(loadOlderInfo) loadOlderInfo.textContent="Failed."; }
      finally{ if(loadOlderBtn) loadOlderBtn.disabled=false; }
    }
    if (loadOlderBtn) loadOlderBtn.onclick=loadOlder;

    // spam vars
    let lastSendAt=0;
    let lastText="";
    const recent=[];
    const MIN_MS=1100, WIN_MS=12000, MAX_REPEAT=2, MAX_LEN=350;

    send.onclick=async ()=>{
      if (Date.now()<localMuteUntil){ flashStatus("Muted for 10s (spam).","warn"); playSound("deny"); return; }
      let text=String(input.value||"").trim();
      if (!text) return;
      const now=Date.now();
      if (text.length>MAX_LEN){ flashStatus(`Message too long (max ${MAX_LEN}).`,"warn"); playSound("deny"); return; }
      if (now-lastSendAt<MIN_MS){ flashStatus("Slow down.","warn"); playSound("deny"); return; }
      const cutoff=now-WIN_MS;
      while(recent.length && recent[0].at<cutoff) recent.shift();
      const reps=recent.filter(r=>r.t===text).length;
      if (reps>=MAX_REPEAT || (lastText===text && now-lastSendAt<WIN_MS)){ flashStatus("Duplicate spam blocked.","warn"); playSound("deny"); return; }
      if (locked){ flashStatus("Chat is locked by admin.","warn"); playSound("deny"); return; }

      send.disabled=true;
      try{
        await messagesCol(classId).add({
          userId, name, text, replyTo:null,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        input.value="";
        setTyping(classId,userId,false);
        playSound("send");
        lastSendAt=now; lastText=text; recent.push({t:text,at:now});
      }catch(e){
        console.error(e);
        flashStatus("Failed to send.","bad");
      }finally{ send.disabled=false; }
    };

    // message actions
    messagesDiv.addEventListener("click",(e)=>{
      const el = e.target.closest(".msg-btn");
      if (!el) return;
      const msgEl = e.target.closest(".msg");
      if (!msgEl) return;
      const mid=msgEl.dataset.id;
      const muid=msgEl.dataset.userid;
      if (el.dataset.action==="delete" && muid===userId){
        deleteMyMessage(messagesCol(classId).doc(mid));
      }
      // reply UI omitted for speed — you said reply is broken but don't care right now
    });

    // scroll button
    const scrollBtn=$("stScrollBtn");
    const unseenEl=$("stUnseen");
    let unseen=0;
    const nearBottom=()=> (messagesDiv.scrollHeight-messagesDiv.scrollTop-messagesDiv.clientHeight)<160;

    if (scrollBtn){
      scrollBtn.onclick=()=>{
        messagesDiv.scrollTop=messagesDiv.scrollHeight;
        unseen=0; if(unseenEl) unseenEl.textContent="0";
        scrollBtn.classList.add("hidden");
      };
      messagesDiv.addEventListener("scroll",()=>{
        if (nearBottom()){
          unseen=0; if(unseenEl) unseenEl.textContent="0";
          scrollBtn.classList.add("hidden");
        }
      },{passive:true});
    }

    // live listener (30 or 15)
    const liveLimit=()=> window.__st_dataSaver ? 15 : 30;
    const msgUnsub = messagesCol(classId).orderBy("timestamp","asc").limitToLast(liveLimit()).onSnapshot((snap)=>{
      if (!messagesDiv.dataset.inited){
        messagesDiv.innerHTML="";
        snap.forEach((d)=>{
          const m=d.data()||{};
          const el=buildMsgEl({id:d.id, ...m}, userId);
          el.id=`msg_${d.id}`;
          messagesDiv.appendChild(el);
        });
        messagesDiv.dataset.inited="1";
        oldestDoc=snap.docs[0]||oldestDoc;
        messagesDiv.scrollTop=messagesDiv.scrollHeight;
        return;
      }

      snap.docChanges().forEach((ch)=>{
        const d=ch.doc;
        const m=d.data()||{};
        const id=`msg_${d.id}`;
        const existing=document.getElementById(id);
        if (ch.type==="added"){
          const el=buildMsgEl({id:d.id, ...m}, userId);
          el.id=id;
          messagesDiv.appendChild(el);

          const stick=nearBottom();
          if (stick) messagesDiv.scrollTop=messagesDiv.scrollHeight;
          else {
            unseen++; if(unseenEl) unseenEl.textContent=String(unseen);
            scrollBtn && scrollBtn.classList.remove("hidden");
          }

          if (m.userId && m.userId!==userId){
            maybeNotify(selectedClassName||classId, m.name||"Someone", String(m.text||""));
            if (document.hidden) playSound("receive");
          }
        } else if (ch.type==="modified"){
          if (existing){
            const body=existing.querySelector(".msg-text");
            const deleted=!!m.deleted || String(m.text||"").trim().toLowerCase()==="(deleted)";
            if (body){
              body.textContent = deleted ? "(deleted)" : (m.text||"");
              body.classList.toggle("deleted", deleted);
            }
          }
        } else if (ch.type==="removed"){
          if (existing) existing.remove();
        }
      });
    });
    unsubs.push(msgUnsub);

    requestNotifOnce();
  }

  // ===== Boot =====
  if (savedClassId && savedUserId && savedUserName){
    selectedClassId=savedClassId;
    selectedClassName=savedClassName||savedClassId;
    showScreen("wait");
    $("waitStatus").textContent="Reconnecting…";
    watchStatus(savedClassId, savedUserId, savedUserName);
  } else {
    showScreen("class");
    loadClasses();
  }
});
