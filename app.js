document.addEventListener("DOMContentLoaded", () => {
  // ========= helpers =========
  const $ = (id) => document.getElementById(id);

  const screens = {
    class: $("screen-class"),
    pin: $("screen-pin"),
    name: $("screen-name"),
    wait: $("screen-wait"),
    chat: $("screen-chat"),
  };

  function showScreen(key) {
    Object.entries(screens).forEach(([k, el]) => {
      if (!el) return;
      el.classList.toggle("active", k === key);
    });
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function fmtTime(ts) {
    try {
      if (!ts) return "";
      if (ts.toDate) return ts.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return "";
    } catch {
      return "";
    }
  }

  // ========= local storage =========
  function setLS(obj) {
    Object.entries(obj).forEach(([k, v]) => localStorage.setItem(k, String(v)));
  }
  function getLS(k) { return localStorage.getItem(k); }

  function clearSession() {
    localStorage.removeItem("classId");
    localStorage.removeItem("className");
    localStorage.removeItem("userId");
    localStorage.removeItem("userName");
  }

  // ========= Firestore refs (v8 compat) =========
  function classDocRef(classId) { return db.collection("classes").doc(classId); }
  function pendingRef(classId, userId) { return classDocRef(classId).collection("pendingUsers").doc(userId); }
  function bannedRef(classId, userId) { return classDocRef(classId).collection("bannedUsers").doc(userId); }
  function messagesCol(classId) { return classDocRef(classId).collection("messages"); }
  function announcementsCol(classId) { return classDocRef(classId).collection("announcements"); }
  function typingDoc(classId) { return classDocRef(classId).collection("meta").doc("typing"); }
  function presenceDoc(classId) { return classDocRef(classId).collection("meta").doc("presence"); }
  function commandsDoc(classId) { return classDocRef(classId).collection("meta").doc("commands"); }

  // ========= Rules accepted (keep your original behavior) =========
  function rulesKey(classId, userId) { return `rulesAccepted_${classId}_${userId}`; }
  function hasAcceptedRules(classId, userId) { return localStorage.getItem(rulesKey(classId, userId)) === "true"; }
  function setAcceptedRules(classId, userId) { localStorage.setItem(rulesKey(classId, userId), "true"); }

function showRulesGate({ classId, userId, userName, className }, onContinue) {
    if (hasAcceptedRules(classId, userId)) {
      onContinue();
      return;
    }

    // Confetti once
    try {
      if (window.ST_UI && typeof window.ST_UI.confettiBurst === "function") {
        window.ST_UI.confettiBurst(1400);
      }
    } catch {}

    const root = $("root") || document.body;

    const old = document.getElementById("rulesGateOverlay");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "rulesGateOverlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "99999";
    overlay.style.display = "grid";
    overlay.style.placeItems = "center";
    overlay.style.padding = "16px";
    overlay.style.background =
      "radial-gradient(1200px 700px at 20% 10%, rgba(255,90,90,.10), transparent 60%)," +
      "radial-gradient(900px 600px at 85% 20%, rgba(255,211,107,.10), transparent 55%)," +
      "rgba(0,0,0,.78)";
    overlay.style.backdropFilter = "blur(10px)";
    overlay.style.pointerEvents = "all";

    const card = document.createElement("div");
    card.style.width = "min(860px, 96vw)";
    card.style.borderRadius = "18px";
    card.style.border = "1px solid rgba(255,255,255,.12)";
    card.style.background = "linear-gradient(180deg, rgba(20,20,20,.82), rgba(16,16,16,.58))";
    card.style.boxShadow = "0 30px 90px rgba(0,0,0,.6)";
    card.style.padding = "22px 22px 18px 22px";
    card.style.position = "relative";
    card.style.overflow = "hidden";

    const stripe = document.createElement("div");
    stripe.style.position = "absolute";
    stripe.style.inset = "-40% -40% auto -40%";
    stripe.style.height = "240px";
    stripe.style.background =
      "conic-gradient(from 180deg, rgba(255,90,90,.0), rgba(255,90,90,.18), rgba(255,211,107,.14), rgba(255,90,90,.0))";
    stripe.style.filter = "blur(12px)";
    stripe.style.opacity = "0.9";
    stripe.style.animation = "stSpin 4.8s linear infinite";
    card.appendChild(stripe);

    const styleTag = document.createElement("style");
    styleTag.textContent = `
      @keyframes stSpin { to { transform: rotate(360deg);} }
      @keyframes stIn { from { opacity:0; transform: translateY(14px) scale(.985);} to { opacity:1; transform: translateY(0) scale(1);} }
      @keyframes stPulse { 0%{ box-shadow: 0 0 0 rgba(255,90,90,0);} 50%{ box-shadow: 0 0 28px rgba(255,90,90,.10);} 100%{ box-shadow: 0 0 0 rgba(255,90,90,0);} }
    `;
    document.head.appendChild(styleTag);

    card.style.animation = "stIn .35s ease";
    card.style.transformOrigin = "center";

    const content = document.createElement("div");
    content.style.position = "relative";
    content.style.zIndex = "2";
    content.style.display = "grid";
    content.style.gap = "14px";

    const title = document.createElement("div");
    title.style.display = "flex";
    title.style.alignItems = "center";
    title.style.justifyContent = "space-between";
    title.style.gap = "12px";

    const left = document.createElement("div");
    left.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="
          width:46px;height:46px;border-radius:14px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.10);
          display:grid;place-items:center;
          box-shadow: 0 12px 35px rgba(0,0,0,.45);
          font-weight:900;letter-spacing:.6px;
          animation: stPulse 1.6s ease infinite;
        ">!</div>
        <div>
          <div style="font-size:22px;font-weight:900;letter-spacing:.4px;">Rules & Conduct Agreement</div>
          <div style="margin-top:4px;font-size:12px;opacity:.74;">
            Class: <strong>${escapeHtml(className || classId)}</strong> • User: <strong>${escapeHtml(userName || "")}</strong>
          </div>
        </div>
      </div>
    `;

    const right = document.createElement("div");
    right.innerHTML = `
      <div style="text-align:right;">
        <div style="font-size:12px;opacity:.78;">Approved ✅</div>
        <div id="rulesDelayText" style="margin-top:3px;font-size:12px;opacity:.78;">Security delay: 30s</div>
      </div>
    `;

    title.appendChild(left);
    title.appendChild(right);

    const box = document.createElement("div");
    box.style.border = "1px solid rgba(255,255,255,.10)";
    box.style.borderRadius = "16px";
    box.style.background = "rgba(0,0,0,.30)";
    box.style.padding = "14px 14px";
    box.style.lineHeight = "1.4";
    box.innerHTML = `
      <div style="font-weight:900;letter-spacing:.2px;margin-bottom:10px;">Read carefully. These rules are enforced.</div>
      <div style="display:grid;gap:8px;font-size:14px;">
        <div>• <strong>No cursing / harassment.</strong></div>
        <div>• <strong>No racial slurs</strong> or hate speech (instant ban).</div>
        <div>• <strong>No threats</strong>, doxxing, or personal info.</div>
        <div>• <strong>No spam</strong> or flooding chat.</div>
        <div>• <strong>Respect admins</strong> and class members.</div>
      </div>
      <div style="margin-top:12px;font-size:12px;opacity:.78;">
        Breaking rules may result in <strong>rejection</strong> or a <strong>ban</strong> without warning.
      </div>
    `;

    const controls = document.createElement("div");
    controls.style.display = "grid";
    controls.style.gap = "10px";
    controls.style.marginTop = "2px";

    const checkWrap = document.createElement("label");
    checkWrap.style.display = "flex";
    checkWrap.style.alignItems = "center";
    checkWrap.style.gap = "10px";
    checkWrap.style.userSelect = "none";
    checkWrap.style.cursor = "pointer";
    checkWrap.style.opacity = "0.95";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "rulesChk";
    checkbox.style.transform = "scale(1.15)";
    checkbox.style.cursor = "pointer";

    const checkText = document.createElement("div");
    checkText.innerHTML = `<div style="font-size:13px;"><strong>I understand</strong> and will follow the rules above.</div>
                           <div style="font-size:12px;opacity:.72;">You must accept to enter chat.</div>`;

    checkWrap.appendChild(checkbox);
    checkWrap.appendChild(checkText);

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.justifyContent = "flex-end";
    btnRow.style.gap = "10px";
    btnRow.style.marginTop = "2px";

    const lockedNote = document.createElement("div");
    lockedNote.id = "rulesLockedNote";
    lockedNote.style.marginTop = "6px";
    lockedNote.style.fontSize = "12px";
    lockedNote.style.opacity = "0.78";
    lockedNote.textContent = "Please wait…";

    const btn = document.createElement("button");
    btn.id = "rulesAcceptBtn";
    btn.type = "button";
    btn.textContent = "I Understand";
    btn.disabled = true;
    btn.style.border = "1px solid rgba(255,255,255,.14)";
    btn.style.background = "rgba(255,255,255,.06)";
    btn.style.color = "rgba(255,255,255,.92)";
    btn.style.padding = "10px 14px";
    btn.style.borderRadius = "12px";
    btn.style.cursor = "not-allowed";
    btn.style.transition = "transform .12s ease, filter .12s ease, background .12s ease, opacity .12s ease";

    btnRow.appendChild(btn);

    controls.appendChild(checkWrap);
    controls.appendChild(btnRow);
    controls.appendChild(lockedNote);

    content.appendChild(title);
    content.appendChild(box);
    content.appendChild(controls);
    card.appendChild(content);
    overlay.appendChild(card);
    root.appendChild(overlay);

    let delayLeft = 30;
    let lockLeft = 10;
    const delayEl = document.getElementById("rulesDelayText");

    const tick = () => {
      if (delayEl) delayEl.textContent = `Security delay: ${delayLeft}s`;
      if (lockLeft > 0) lockedNote.textContent = `Button unlocks in ${lockLeft}s…`;
      else lockedNote.textContent = checkbox.checked ? "You may continue." : "Check the box to continue.";

      const canClick = delayLeft <= 0 && lockLeft <= 0 && checkbox.checked;
      btn.disabled = !canClick;
      btn.style.cursor = btn.disabled ? "not-allowed" : "pointer";
      btn.style.background = btn.disabled ? "rgba(255,255,255,.06)" : "rgba(60,255,160,.14)";
      btn.style.borderColor = btn.disabled ? "rgba(255,255,255,.14)" : "rgba(60,255,160,.28)";
    };

    const interval = setInterval(() => {
      if (delayLeft > 0) delayLeft--;
      if (lockLeft > 0) lockLeft--;
      tick();
    }, 1000);

    checkbox.addEventListener("change", tick);
    tick();

    btn.onclick = () => {
      if (btn.disabled) return;
      try { clearInterval(interval); } catch {}
      setAcceptedRules(classId, userId);

      overlay.style.opacity = "0";
      overlay.style.transition = "opacity .18s ease";
      overlay.style.pointerEvents = "none";
      setTimeout(() => {
        try { overlay.remove(); } catch {}
        onContinue();
      }, 180);
    };
  }

  // ========= Settings (Theme + Sound) =========
  const SETTINGS_KEY = "st_settings_v2";
  const DEFAULT_SETTINGS = { theme: "night", sound: true };
  function getSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const p = JSON.parse(raw);
      return {
        theme: p.theme === "day" ? "day" : "night",
        sound: p.sound !== false,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
  function setSettings(next) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        theme: next.theme === "day" ? "day" : "night",
        sound: !!next.sound,
      }));
    } catch {}
  }

  function applyTheme(mode) {
    const cs = $("chat-screen");
    if (!cs) return;
    cs.classList.remove("day", "night");
    cs.classList.add(mode === "day" ? "day" : "night");
    const tbtn = $("themeToggle");
    if (tbtn) tbtn.textContent = mode === "day" ? "☀️" : "🌙";
  }

  // ===== Sound synth (no external files) =====
  let soundEnabled = getSettings().sound;
  function setSoundEnabled(v) { soundEnabled = !!v; }
  function playSound(type) {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      const now = ctx.currentTime;
      let freq = 520, dur = 0.07;
      if (type === "send") { freq = 620; dur = 0.06; }
      if (type === "receive") { freq = 520; dur = 0.07; }
      if (type === "approve") { freq = 740; dur = 0.10; }
      if (type === "deny") { freq = 220; dur = 0.09; }
      o.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      o.start(now);
      o.stop(now + dur + 0.02);
      o.onended = () => { try { ctx.close(); } catch {} };
    } catch {}
  }

  // ========= Notifications (tab hidden only) =========
  const NOTIF_ASK_KEY = "st_notif_asked";
  function requestNotificationPermissionOnce() {
    try {
      if (!("Notification" in window)) return;
      if (localStorage.getItem(NOTIF_ASK_KEY) === "1") return;
      localStorage.setItem(NOTIF_ASK_KEY, "1");
      if (Notification.permission === "default") Notification.requestPermission().catch(()=>{});
    } catch {}
  }
  function maybeNotify(className, from, text) {
    try {
      if (!("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      if (!document.hidden) return;
      const body = (text || "").length > 140 ? (text || "").slice(0, 140) + "…" : (text || "");
      new Notification(`📚 SecureText | ${className}`, { body: `${from}: ${body}` });
    } catch {}
  }

  // ========= toasts (optional if present) =========
  function toast(msg) {
    if (window.ST_UIX && typeof window.ST_UIX.toast === "function") window.ST_UIX.toast(msg, "info");
  }

  // ========= listener cleanup =========
  let chatUnsubs = [];
  function clearChatListeners() {
    chatUnsubs.forEach((u) => { try { u(); } catch {} });
    chatUnsubs = [];
    stopPresence();
  }

  // ========= presence =========
  let presenceTimer = null;
  function stopPresence() {
    if (presenceTimer) { clearInterval(presenceTimer); presenceTimer = null; }
  }
  function startPresence(classId, userId) {
    stopPresence();
    const ref = presenceDoc(classId);
    const beat = async () => {
      try {
        await ref.set({ [userId]: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      } catch {}
    };
    beat();
    presenceTimer = setInterval(beat, 30000);

    const unsub = ref.onSnapshot((doc) => {
      const data = (doc && doc.exists) ? (doc.data() || {}) : {};
      const now = Date.now();
      const TTL = 90000;
      let count = 0;
      Object.values(data).forEach((v) => {
        if (!v || !v.toDate) return;
        const ms = v.toDate().getTime();
        if (ms && now - ms <= TTL) count++;
      });
      const badge = $("onlineBadge");
      if (badge) badge.textContent = `• ${count} online`;
    });
    chatUnsubs.push(unsub);
  }

  // ========= typing =========
  let typingTimeout = null;
  let typingDebounce = null;
  let localTyping = false;
  async function setTyping(classId, userId, val) {
    if (localTyping === val) return;
    localTyping = val;
    try { await typingDoc(classId).set({ [userId]: !!val }, { merge: true }); } catch {}
  }

  // prevent "stuck typing" by auto-clearing stale 'true' values (client-side)
  function renderTypingIndicator(docData, myId) {
    const el = $("typingIndicator");
    if (!el) return;
    const data = docData || {};
    const others = Object.entries(data).filter(([id,v]) => id !== myId && v === true);
    if (others.length) {
      el.innerHTML = `<span class="typing-bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span><span class="muted" style="margin-left:8px">Someone is typing…</span>`;
    } else {
      el.innerHTML = "";
    }
  }

  // ========= commands listener (admin control) =========
  function startCommandsListener(classId, userId, handlers) {
    const ref = commandsDoc(classId);
    const keyBase = `st_cmd_${classId}_`;
    let initialized = false;
    const unsub = ref.onSnapshot((doc) => {
      const data = (doc && doc.exists) ? (doc.data() || {}) : {};
      const logoutNonce = Number(data.logoutNonce || 0);
      const rulesNonce = Number(data.rulesNonce || 0);
      const refreshNonce = Number(data.refreshNonce || 0);

      if (!initialized) {
        initialized = true;
        sessionStorage.setItem(keyBase+"logout", String(logoutNonce));
        sessionStorage.setItem(keyBase+"rules", String(rulesNonce));
        sessionStorage.setItem(keyBase+"refresh", String(refreshNonce));
        if (handlers.onLock) handlers.onLock(!!data.locked, data.lockMessage || "");
        if (handlers.onTheme && (data.theme === "day" || data.theme === "night")) handlers.onTheme(data.theme);
        return;
      }

      const lastLogout = Number(sessionStorage.getItem(keyBase+"logout") || "0");
      const lastRules = Number(sessionStorage.getItem(keyBase+"rules") || "0");
      const lastRefresh = Number(sessionStorage.getItem(keyBase+"refresh") || "0");

      if (logoutNonce > lastLogout) {
        sessionStorage.setItem(keyBase+"logout", String(logoutNonce));
        handlers.onLogout && handlers.onLogout();
      }
      if (rulesNonce > lastRules) {
        sessionStorage.setItem(keyBase+"rules", String(rulesNonce));
        handlers.onRerules && handlers.onRerules();
      }
      if (refreshNonce > lastRefresh) {
        sessionStorage.setItem(keyBase+"refresh", String(refreshNonce));
        handlers.onRefresh && handlers.onRefresh();
      }

      handlers.onLock && handlers.onLock(!!data.locked, data.lockMessage || "");
      if (handlers.onTheme && (data.theme === "day" || data.theme === "night")) handlers.onTheme(data.theme);
    });
    chatUnsubs.push(unsub);
  }

  // ========= lock overlay (reuse your old one if present) =========
  let chatLocked = false;
  function setChatLocked(val, msg) {
    chatLocked = !!val;
    // If you already have overlay from older code, keep it. Otherwise minimal.
    let lock = document.getElementById("stLockOverlay");
    if (!lock) {
      lock = document.createElement("div");
      lock.id = "stLockOverlay";
      lock.className = "st-lock";
      lock.innerHTML = `
        <div class="st-lock-card">
          <div class="st-lock-title">CHAT LOCKED</div>
          <div id="stLockMsg" class="st-lock-msg">Chat is temporarily locked by admin.</div>
        </div>`;
      document.body.appendChild(lock);
    }
    const msgEl = document.getElementById("stLockMsg");
    if (msgEl) msgEl.textContent = msg || "Chat is temporarily locked by admin.";
    lock.classList.toggle("active", chatLocked);
  }
  function isChatLocked() { return !!chatLocked; }

  // ========= replies + delete + spam filter =========
  let activeReplyTo = null;
  let repliesUnsub = null;

  function ensureRepliesUI() {
    let panel = document.getElementById("repliesPanel");
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "repliesPanel";
    panel.className = "replies hidden";
    panel.innerHTML = `
      <div class="replies-header">
        <div class="muted"><span id="repliesTitle">Replies</span></div>
        <div style="display:flex;gap:8px;align-items:center">
          <button id="cancelReplyBtn" type="button" title="Cancel reply">✕</button>
          <button id="closeRepliesBtn" type="button">Close</button>
        </div>
      </div>
      <div id="repliesList" class="replies-list"></div>
      <div class="reply-input">
        <input id="replyInput" type="text" placeholder="Reply…" autocomplete="off" />
        <button id="sendReplyBtn" type="button">Send</button>
      </div>
    `;
    const host = document.getElementById("chat-screen") || document.body;
    host.appendChild(panel);
    return panel;
  }

  function closeRepliesPanel() {
    const panel = document.getElementById("repliesPanel");
    if (panel) panel.classList.add("hidden");
    activeReplyTo = null;
    const title = document.getElementById("repliesTitle");
    if (title) title.textContent = "Replies";
    if (repliesUnsub) { try { repliesUnsub(); } catch {} repliesUnsub = null; }
    const list = document.getElementById("repliesList");
    if (list) list.innerHTML = "";
  }

  function openRepliesForMessage(classId, userId, parentId, parentName) {
    const panel = ensureRepliesUI();
    panel.classList.remove("hidden");
    activeReplyTo = { id: parentId, name: parentName || "User" };
    const title = document.getElementById("repliesTitle");
    if (title) title.textContent = `Replying to ${activeReplyTo.name}`;

    if (repliesUnsub) { try { repliesUnsub(); } catch {} repliesUnsub = null; }

    const list = document.getElementById("repliesList");
    if (list) list.innerHTML = `<div class="muted" style="padding:10px">Loading replies…</div>`;

    repliesUnsub = messagesCol(classId)
      .where("replyTo", "==", parentId)
      .orderBy("timestamp", "asc")
      .limitToLast(75)
      .onSnapshot((snap) => {
        if (!list) return;
        list.innerHTML = "";
        if (snap.empty) {
          list.innerHTML = `<div class="muted" style="padding:10px">No replies yet.</div>`;
          return;
        }
        snap.forEach((d) => {
          const m = d.data() || {};
          const row = document.createElement("div");
          row.className = "reply-row";
          row.innerHTML = `<div class="reply-top"><strong>${escapeHtml(m.name || "User")}</strong> <span class="muted">${fmtTime(m.timestamp)}</span></div>`;
          const body = document.createElement("div");
          body.className = "reply-text";
          body.textContent = (m.deleted || String(m.text||"").trim().toLowerCase()==="(deleted)") ? "(deleted)" : (m.text || "");
          row.appendChild(body);
          if (m.userId && m.userId === userId && !m.deleted && String(m.text||"").trim().toLowerCase()!=="(deleted)") {
            const del = document.createElement("button");
            del.type="button"; del.className="msg-btn msg-del"; del.textContent="Delete";
            del.onclick = () => deleteMyMessage(d.ref);
            row.appendChild(del);
          }
          list.appendChild(row);
        });
        list.scrollTop = list.scrollHeight;
      });

    chatUnsubs.push(repliesUnsub);

    const closeBtn = document.getElementById("closeRepliesBtn");
    if (closeBtn) closeBtn.onclick = closeRepliesPanel;
    const cancelBtn = document.getElementById("cancelReplyBtn");
    if (cancelBtn) cancelBtn.onclick = closeRepliesPanel;
  }

  async function deleteMyMessage(docRef) {
    if (!docRef) return;
    if (!confirm("Delete this message?")) return;
    try {
      await docRef.set({
        deleted: true,
        text: "(deleted)",
        deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return;
    } catch {}
    try {
      await docRef.delete();
    } catch {}
  }

  // spam filter
  let lastSendAt = 0;
  let lastSendText = "";
  const recentTexts = [];
  const SPAM_MIN_INTERVAL_MS = 1100;
  const SPAM_REPEAT_WINDOW_MS = 12000;
  const SPAM_MAX_REPEAT = 2;
  const SPAM_MAX_LEN = 350;

  // ========= UI rendering =========
  function buildMsgEl(msg, userId) {
    const wrap = document.createElement("div");
    wrap.className = "msg";
    wrap.dataset.id = msg.id || "";
    wrap.dataset.userid = msg.userId || "";
    if (msg.replyTo) wrap.dataset.replyto = msg.replyTo;

    const top = document.createElement("div");
    top.className = "msg-top";
    top.innerHTML = `<strong>${escapeHtml(msg.name || "User")}</strong> <span class="muted">${fmtTime(msg.timestamp)}</span>`;
    wrap.appendChild(top);

    const body = document.createElement("div");
    body.className = "msg-text";
    const isDeleted = !!msg.deleted || (String(msg.text||"").trim().toLowerCase()==="(deleted)");
    body.textContent = isDeleted ? "(deleted)" : (msg.text || "");
    if (isDeleted) body.classList.add("deleted");
    wrap.appendChild(body);

    // reply preview (optional)
    if (msg.replyTo) {
      const pill = document.createElement("div");
      pill.className = "reply-pill";
      pill.textContent = "↩ reply";
      wrap.insertBefore(pill, body);
    }

    if (!isDeleted) {
      const actions = document.createElement("div");
      actions.className = "msg-actions";

      const replyBtn = document.createElement("button");
      replyBtn.type="button"; replyBtn.className="msg-btn msg-reply";
      replyBtn.textContent="Reply"; replyBtn.dataset.action="reply";
      actions.appendChild(replyBtn);

      if (msg.userId && msg.userId === userId) {
        const delBtn = document.createElement("button");
        delBtn.type="button"; delBtn.className="msg-btn msg-del";
        delBtn.textContent="Delete"; delBtn.dataset.action="delete";
        actions.appendChild(delBtn);
      }

      wrap.appendChild(actions);
    }

    return wrap;
  }

  // ========= main flow =========
  let selectedClassId = null;
  let selectedClassName = null;

  async function loadClasses() {
    const classesDiv = $("classes");
    const classError = $("classError");
    if (classError) classError.textContent = "";
    if (!classesDiv) return;
    classesDiv.textContent = "Loading…";
    try {
      const snap = await db.collection("classes").get();
      classesDiv.innerHTML = "";
      if (snap.empty) {
        classesDiv.innerHTML = `<div class="muted">No classes found.</div>`;
        return;
      }
      snap.forEach((doc) => {
        const data = doc.data() || {};
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = data.name || doc.id;
        btn.onclick = () => {
          selectedClassId = doc.id;
          selectedClassName = data.name || doc.id;
          const pinName = $("pinClassName");
          if (pinName) pinName.textContent = selectedClassName;
          showScreen("pin");
        };
        classesDiv.appendChild(btn);
      });
    } catch {
      if (classError) classError.textContent = "Failed to load classes.";
      classesDiv.textContent = "";
    }
  }

  // PIN screen
  const pinBackBtn = $("pinBackBtn");
  const pinContinueBtn = $("pinContinueBtn");
  const pinInput = $("pinInput");
  const pinError = $("pinError");

  if (pinBackBtn) pinBackBtn.onclick = () => showScreen("class");
  if (pinContinueBtn) {
    pinContinueBtn.onclick = async () => {
      if (!selectedClassId) return;
      if (pinError) pinError.textContent = "";
      const pin = (pinInput && pinInput.value ? pinInput.value : "").trim();
      if (!pin) {
        if (pinError) pinError.textContent = "Enter the class PIN.";
        return;
      }
      try {
        const clsDoc = await classDocRef(selectedClassId).get();
        if (!clsDoc.exists) {
          if (pinError) pinError.textContent = "Class not found.";
          return;
        }
        const data = clsDoc.data() || {};
        const correctPin = String(data.pin || "").trim();
        if (String(pin) !== correctPin) {
          if (pinError) pinError.textContent = "Incorrect PIN.";
          return;
        }
        showScreen("name");
      } catch {
        if (pinError) pinError.textContent = "PIN check failed.";
      }
    };
  }

  // NAME screen
  const nameBackBtn = $("nameBackBtn");
  const nameContinueBtn = $("nameContinueBtn");
  const nameInput = $("nameInput");
  const nameError = $("nameError");

  if (nameBackBtn) nameBackBtn.onclick = () => showScreen("pin");

  if (nameContinueBtn) {
    nameContinueBtn.onclick = async () => {
      if (!selectedClassId) return;
      if (nameError) nameError.textContent = "";
      const name = (nameInput && nameInput.value ? nameInput.value : "").trim();
      if (!name) {
        if (nameError) nameError.textContent = "Enter your name.";
        return;
      }
      const userId = getLS("userId") || Math.random().toString(36).slice(2, 12);
      try {
        const bannedDoc = await bannedRef(selectedClassId, userId).get();
        if (bannedDoc.exists) {
          showScreen("wait");
          setText("waitStatus","You are banned.");
          return;
        }
        await pendingRef(selectedClassId, userId).set({
          name,
          status: "pending",
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });
        setLS({
          classId: selectedClassId,
          className: selectedClassName || selectedClassId,
          userId,
          userName: name,
        });
        showScreen("wait");
        const waitStatus = $("waitStatus");
        if (waitStatus) waitStatus.textContent = "Waiting for admin approval…";
        watchStatus(selectedClassId, userId, name);
      } catch {
        if (nameError) nameError.textContent = "Request failed.";
      }
    };
  }

  function setText(id, txt) { const el = $(id); if (el) el.textContent = txt || ""; }

  function watchStatus(classId, userId, name) {
    clearChatListeners();
    const waitStatus = $("waitStatus");
    const unsub = pendingRef(classId, userId).onSnapshot((doc) => {
      if (!doc.exists) {
        if (waitStatus) waitStatus.textContent = "Request not found.";
        return;
      }
      const data = doc.data() || {};
      const status = data.status;
      if (status === "approved") {
        playSound("approve");
        showRulesGate({ classId, userId, userName: name, className: selectedClassName || classId }, () => {
          requestNotificationPermissionOnce();
          loadChat(classId, userId, name);
        });
      } else if (status === "rejected") {
        if (waitStatus) waitStatus.textContent = "You were rejected by the admin.";
      } else if (status === "banned") {
        if (waitStatus) waitStatus.textContent = "You are banned.";
      } else {
        if (waitStatus) waitStatus.textContent = "Waiting for admin approval…";
      }
    });
    chatUnsubs.push(unsub);
  }

  // ===== chat =====
  function flashStatus(msg, kind) {
    const el = $("chatStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.remove("bad","warn");
    if (kind==="bad") el.classList.add("bad");
    if (kind==="warn") el.classList.add("warn");
  }

  function loadChat(classId, userId, name) {
    clearChatListeners();
    showScreen("chat");

    // apply settings
    const st = getSettings();
    applyTheme(st.theme);
    setSoundEnabled(st.sound);

    const chatWelcome = $("chatWelcome");
    const chatSubtitle = $("chatSubtitle");
    if (chatWelcome) chatWelcome.textContent = `Welcome, ${name}!`;
    if (chatSubtitle) chatSubtitle.textContent = `SecureText chat | ${selectedClassName || classId}`;

    // ensure online badge
    if (!$("onlineBadge") && chatSubtitle && chatSubtitle.parentElement) {
      const b = document.createElement("span");
      b.id="onlineBadge";
      b.className="online-badge";
      b.textContent="• 0 online";
      chatSubtitle.parentElement.appendChild(b);
    }

    // quick theme toggle (still works)
    const themeToggle = $("themeToggle");
    if (themeToggle) {
      themeToggle.onclick = () => {
        const cur = getSettings();
        const next = { ...cur, theme: cur.theme === "day" ? "night" : "day" };
        setSettings(next);
        applyTheme(next.theme);
        playSound("send");
      };
    }

    // logout
    const logoutBtn = $("logoutBtn");
    if (logoutBtn) {
      logoutBtn.onclick = () => {
        clearChatListeners();
        clearSession();
        selectedClassId = null; selectedClassName = null;
        showScreen("class");
        loadClasses();
      };
    }

    // presence
    startPresence(classId, userId);

    // cached ban state
    window.__st_isBanned = false;
    try {
      const banUnsub = bannedRef(classId, userId).onSnapshot((d) => {
        window.__st_isBanned = !!(d && d.exists);
      });
      chatUnsubs.push(banUnsub);
    } catch {}

    // commands listener (admin)
    startCommandsListener(classId, userId, {
      onLogout: () => {
        clearChatListeners();
        clearSession();
        selectedClassId = null; selectedClassName = null;
        showScreen("class");
        loadClasses();
      },
      onRerules: () => {
        localStorage.removeItem(rulesKey(classId,userId));
        showRulesGate({ classId, userId, userName: name, className: selectedClassName || classId }, () => {});
      },
      onRefresh: () => location.reload(),
      onLock: (locked,msg) => setChatLocked(locked,msg),
      onTheme: (mode) => applyTheme(mode),
    });

    // announcements
    const annUnsub = announcementsCol(classId).orderBy("timestamp","asc").limit(10).onSnapshot((snap) => {
      const list = $("announcementsList");
      if (!list) return;
      list.innerHTML = "";
      snap.forEach((d) => {
        const a = d.data() || {};
        const row = document.createElement("div");
        row.className="announcement";
        row.innerHTML = `<div class="a-top"><strong>${escapeHtml(a.title || "Announcement")}</strong><span class="muted">${fmtTime(a.timestamp)}</span></div><div class="a-body">${escapeHtml(a.body || "")}</div>`;
        list.appendChild(row);
      });
    });
    chatUnsubs.push(annUnsub);

    // messages
    const messagesDiv = $("messages");
    const msgInput = $("msgInput");
    const sendBtn = $("sendBtn");

    // reply UI
    ensureRepliesUI();
    // wire reply send each chat open
    const replyInp = document.getElementById("replyInput");
    const replyBtn = document.getElementById("sendReplyBtn");
    if (replyInp && replyBtn) {
      replyInp.addEventListener("keydown", (e) => {
        if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); replyBtn.click(); }
      });
      replyBtn.onclick = async () => {
        const text = (replyInp.value || "").trim();
        if (!text || !activeReplyTo) return;
        if (isChatLocked()) { flashStatus("Chat is locked by admin.","warn"); playSound("deny"); return; }
        if (window.__st_isBanned) { flashStatus("You are banned.","bad"); playSound("deny"); return; }
        replyBtn.disabled=true;
        try {
          await messagesCol(classId).add({
            userId,
            name,
            text,
            replyTo: activeReplyTo.id,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          });
          replyInp.value="";
          playSound("send");
        } catch {
          flashStatus("Failed to send reply.","bad");
        } finally {
          replyBtn.disabled=false;
        }
      };
    }

    // Enter to send (Shift+Enter newline)
    if (msgInput && sendBtn) {
      msgInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendBtn.click();
        }
      });
      msgInput.oninput = () => {
        if (typingDebounce) clearTimeout(typingDebounce);
        typingDebounce = setTimeout(() => setTyping(classId, userId, true), 180);
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => setTyping(classId, userId, false), 1400);
      };
    }

    // typing listener
    const typUnsub = typingDoc(classId).onSnapshot((doc) => {
      const data = (doc && doc.exists) ? (doc.data() || {}) : {};
      renderTypingIndicator(data, userId);
    });
    chatUnsubs.push(typUnsub);

    // message render
    const msgUnsub = messagesCol(classId).orderBy("timestamp","asc").limitToLast(75).onSnapshot((snap) => {
      if (!messagesDiv) return;
      const stick = (messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight) < 160;
      // if first load, rebuild
      if (!messagesDiv.dataset.inited) {
        messagesDiv.innerHTML="";
        snap.forEach((d) => {
          const m = d.data() || {};
          const el = buildMsgEl({ id:d.id, ...m }, userId);
          el.id = `msg_${d.id}`;
          messagesDiv.appendChild(el);
        });
        messagesDiv.dataset.inited="1";
        if (stick) messagesDiv.scrollTop = messagesDiv.scrollHeight;
        return;
      }

      snap.docChanges().forEach((ch) => {
        const d = ch.doc;
        const m = d.data() || {};
        const id = `msg_${d.id}`;
        const existing = document.getElementById(id);

        if (ch.type==="added") {
          const el = buildMsgEl({ id:d.id, ...m }, userId);
          el.id = id;
          messagesDiv.appendChild(el);
          if (stick) messagesDiv.scrollTop = messagesDiv.scrollHeight;

          if (m.userId && m.userId !== userId) {
            maybeNotify(selectedClassName || classId, m.name || "Someone", String(m.text||""));
            if (document.hidden) playSound("receive");
          }
        } else if (ch.type==="modified") {
          if (existing) {
            const body = existing.querySelector(".msg-text");
            const isDeleted = !!m.deleted || (String(m.text||"").trim().toLowerCase()==="(deleted)");
            if (body) {
              body.textContent = isDeleted ? "(deleted)" : (m.text || "");
              body.classList.toggle("deleted", isDeleted);
            }
          }
        } else if (ch.type==="removed") {
          if (existing) existing.remove();
        }
      });
    });
    chatUnsubs.push(msgUnsub);

    // Message actions (reply/delete)
    if (messagesDiv) {
      messagesDiv.addEventListener("click", (e) => {
        const t = e.target;
        if (!(t instanceof Element)) return;
        const btn = t.closest(".msg-btn");
        if (!btn) return;
        const msgEl = t.closest(".msg");
        if (!msgEl) return;
        const mid = msgEl.dataset.id || "";
        const muid = msgEl.dataset.userid || "";
        if (!mid) return;

        if (btn.dataset.action==="reply") {
          const nameEl = msgEl.querySelector(".msg-top strong");
          openRepliesForMessage(classId, userId, mid, nameEl ? nameEl.textContent : "User");
        } else if (btn.dataset.action==="delete") {
          if (muid !== userId) return;
          deleteMyMessage(messagesCol(classId).doc(mid));
        }
      });
    }

    // Send message (spam filter + no per-send reads)
    if (sendBtn && msgInput) {
      sendBtn.onclick = async () => {
        let text = String(msgInput.value || "").trim();
        if (!text) return;
        const now = Date.now();

        text = text.replace(/\s{3,}/g, "  ");
        if (text.length > SPAM_MAX_LEN) { flashStatus(`Message too long (max ${SPAM_MAX_LEN}).`,"warn"); playSound("deny"); return; }
        if (now - lastSendAt < SPAM_MIN_INTERVAL_MS) { flashStatus("Slow down.","warn"); playSound("deny"); return; }

        // repeats
        const cutoff = now - SPAM_REPEAT_WINDOW_MS;
        while (recentTexts.length && recentTexts[0].at < cutoff) recentTexts.shift();
        const repeats = recentTexts.filter(r => r.t === text).length;
        if (repeats >= SPAM_MAX_REPEAT || (lastSendText === text && now - lastSendAt < SPAM_REPEAT_WINDOW_MS)) {
          flashStatus("Duplicate spam blocked.","warn"); playSound("deny"); return;
        }

        if (isChatLocked()) { flashStatus("Chat is locked by admin.","warn"); playSound("deny"); return; }
        if (window.__st_isBanned) { flashStatus("You are banned.","bad"); playSound("deny"); return; }

        sendBtn.disabled=true;
        try {
          await messagesCol(classId).add({
            userId,
            name,
            text,
            replyTo: null,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          });
          msgInput.value="";
          setTyping(classId, userId, false);
          playSound("send");
          lastSendAt = now;
          lastSendText = text;
          recentTexts.push({ t:text, at:now });
        } catch {
          flashStatus("Failed to send.","bad");
        } finally {
          sendBtn.disabled=false;
        }
      };
    }

    // Ask notifications permission once after rules accepted
    requestNotificationPermissionOnce();
  }

  // reset button
  const resetBtn = $("resetBtn");
  if (resetBtn) {
    resetBtn.onclick = () => {
      clearChatListeners();
      clearSession();
      selectedClassId=null; selectedClassName=null;
      showScreen("class");
      loadClasses();
    };
  }

  // restore session
  const savedClassId = getLS("classId");
  const savedUserId = getLS("userId");
  const savedName = getLS("userName");
  const savedClassName = getLS("className");

  if (savedClassId && savedUserId && savedName) {
    selectedClassId = savedClassId;
    selectedClassName = savedClassName || savedClassId;
    showScreen("wait");
    const w = $("waitStatus");
    if (w) w.textContent = "Reconnecting…";
    watchStatus(savedClassId, savedUserId, savedName);
  } else {
    showScreen("class");
    loadClasses();
  }
});
