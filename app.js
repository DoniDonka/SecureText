document.addEventListener("DOMContentLoaded", () => {
  // ===== helpers =====
  const $ = (id) => document.getElementById(id);

  // Screens used by THIS app.js
  const screens = {
    class: $("screen-class"),
    pin: $("screen-pin"),
    name: $("screen-name"),
    wait: $("screen-wait"),
    chat: $("screen-chat"),
  };

  // Extra legacy full-screen nodes that might still exist (from older versions)
  function hardHideEl(id) {
    const el = $(id);
    if (el) el.style.display = "none";
  }
  function hardShowEl(id) {
    const el = $(id);
    if (el) el.style.display = "";
  }

  function showScreen(key) {
    Object.entries(screens).forEach(([k, el]) => {
      if (!el) return;
      el.classList.toggle("active", k === key);
    });

    // Hide old nodes if present (prevents “double UIs” if you ever used them)
    if (key === "class") {
      hardHideEl("name-screen");
      hardHideEl("waiting-screen");
      hardHideEl("chat-screen-old");
      hardHideEl("name-screen-old");
    }
  }

  function escapeHtml(str) {
    return String(str || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setLS(obj) {
    Object.entries(obj).forEach(([k, v]) => localStorage.setItem(k, String(v)));
  }
  function clearLS() {
    localStorage.removeItem("classId");
    localStorage.removeItem("className");
    localStorage.removeItem("userId");
    localStorage.removeItem("userName");
    // do NOT clear rules acceptance here unless you want it to re-ask next time
  }

  // Firestore refs (v8 compat)
  function classDocRef(classId) {
    return db.collection("classes").doc(classId);
  }
  function pendingRef(classId, userId) {
    return classDocRef(classId).collection("pendingUsers").doc(userId);
  }
  function bannedRef(classId, userId) {
    return classDocRef(classId).collection("bannedUsers").doc(userId);
  }
  function messagesCol(classId) {
    return classDocRef(classId).collection("messages");
  }
  function announcementsCol(classId) {
    return classDocRef(classId).collection("announcements");
  }
  function typingDoc(classId) {
    return classDocRef(classId).collection("meta").doc("typing");
  }

  // Rules acceptance per (classId + userId)
  function rulesKey(classId, userId) {
    return `rulesAccepted_${classId}_${userId}`;
  }
  function hasAcceptedRules(classId, userId) {
    return localStorage.getItem(rulesKey(classId, userId)) === "true";
  }
  function setAcceptedRules(classId, userId) {
    localStorage.setItem(rulesKey(classId, userId), "true");
  }

  // ===== Notifications (permission + smart notify) =====
  const NOTIF_ASK_KEY = "st_notif_asked";
  function requestNotificationPermissionOnce() {
    try {
      if (!("Notification" in window)) return;
      if (localStorage.getItem(NOTIF_ASK_KEY) === "1") return;
      if (Notification.permission === "default") {
        localStorage.setItem(NOTIF_ASK_KEY, "1");
        Notification.requestPermission().catch(() => { });
      } else {
        localStorage.setItem(NOTIF_ASK_KEY, "1");
      }
    } catch { }
  }

  function maybeNotifyNewMessage({ className, from, text }) {
    try {
      if (!("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      if (!document.hidden) return; // A: only when tab is not focused

      const body = text.length > 140 ? text.slice(0, 140) + "…" : text;
      new Notification(`📚 SecureText | ${className}`, { body: `${from}: ${body}` });
    } catch { }
  }

  // ===== Settings: Theme + Sound =====
  const SETTINGS_KEY = "st_settings_v2";
  const DEFAULT_SETTINGS = { theme: "night", sound: true };

  function getSettingsState() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      return {
        theme: parsed.theme === "day" ? "day" : "night",
        sound: parsed.sound !== false,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function setSettingsState(next) {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          theme: next.theme === "day" ? "day" : "night",
          sound: !!next.sound,
        })
      );
    } catch { }
  }

  function applyTheme(mode) {
    const screen = $("chat-screen");
    const mode2 = mode === "day" ? "day" : "night";
    if (screen) {
      screen.classList.remove("day", "night");
      screen.classList.add(mode2);
    }
  }

  // ===== Sounds (no external files; tiny synth) =====
  let soundEnabled = getSettingsState().sound;
  function setSoundEnabled(v) {
    soundEnabled = !!v;
  }
  function playSound(type) {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);

      const now = ctx.currentTime;
      let freq = 440;
      let dur = 0.07;

      if (type === "send") {
        freq = 620;
        dur = 0.06;
      }
      if (type === "receive") {
        freq = 520;
        dur = 0.07;
      }
      if (type === "approve") {
        freq = 740;
        dur = 0.1;
      }
      if (type === "deny") {
        freq = 220;
        dur = 0.09;
      }

      o.frequency.setValueAtTime(freq, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      o.start(now);
      o.stop(now + dur + 0.02);
      o.onended = () => {
        try {
          ctx.close();
        } catch { }
      };
    } catch { }
  }

  // ===== Settings modal UI =====
  function openSettingsModal({ theme, sound, onChange }) {
    const old = document.getElementById("stSettingsOverlay");
    if (old) old.remove();

    const overlay = document.createElement("div");
    overlay.id = "stSettingsOverlay";
    overlay.className = "st-overlay";
    overlay.innerHTML = `
      <div class="st-modal">
        <div class="st-modal-top">
          <div class="st-modal-title">Settings</div>
          <button id="stSettingsClose" class="st-icon-btn" type="button">✕</button>
        </div>

        <div class="st-modal-body">
          <div class="st-setting-row">
            <div>
              <div class="st-setting-name">Theme</div>
              <div class="st-setting-desc muted">Day / Night mode</div>
            </div>
            <button id="stThemeBtn" class="st-pill-btn" type="button"></button>
          </div>

          <div class="st-setting-row">
            <div>
              <div class="st-setting-name">Sounds</div>
              <div class="st-setting-desc muted">Send / receive effects</div>
            </div>
            <button id="stSoundBtn" class="st-pill-btn" type="button"></button>
          </div>

          <div class="st-divider"></div>
          <div class="muted" style="font-size:.85rem;line-height:1.25rem">
            Notifications are only shown when this tab isn’t focused.
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const close = () => {
      try {
        overlay.remove();
      } catch { }
    };

    const themeBtn = overlay.querySelector("#stThemeBtn");
    const soundBtn = overlay.querySelector("#stSoundBtn");
    const closeBtn = overlay.querySelector("#stSettingsClose");

    function render() {
      themeBtn.textContent = theme === "day" ? "☀️ Day" : "🌙 Night";
      soundBtn.textContent = sound ? "🔊 On" : "🔇 Off";
    }
    render();

    themeBtn.onclick = () => {
      theme = theme === "day" ? "night" : "day";
      render();
      onChange({ theme, sound });
      playSound("send");
    };
    soundBtn.onclick = () => {
      sound = !sound;
      render();
      onChange({ theme, sound });
      playSound(sound ? "send" : "deny");
    };

    if (closeBtn) closeBtn.onclick = close;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    window.addEventListener("keydown", function esc(e) {
      if (e.key === "Escape") {
        window.removeEventListener("keydown", esc);
        close();
      }
    });
  }

  // ===== Enhanced styles for new UI bits (typing dots, modal, lock overlay) =====
  let enhancedStylesInjected = false;
  function ensureEnhancedStyles() {
    if (enhancedStylesInjected) return;
    enhancedStylesInjected = true;

    const css = `
      .online-badge{margin-top:6px;display:inline-block;font-size:.85rem;opacity:.85}
      .typing-bubble{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.10);padding:6px 10px;border-radius:999px}
      .typing-bubble .dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.85);display:inline-block;animation:stDot 1s infinite}
      .typing-bubble .dot:nth-child(2){animation-delay:.12s}
      .typing-bubble .dot:nth-child(3){animation-delay:.24s}
      @keyframes stDot{0%,60%,100%{transform:translateY(0);opacity:.55}30%{transform:translateY(-4px);opacity:1}}
      .st-overlay{position:fixed;inset:0;z-index:999999;display:grid;place-items:center;background:rgba(0,0,0,.70);backdrop-filter:blur(10px);padding:16px;animation:stFade .12s ease}
      @keyframes stFade{from{opacity:0}to{opacity:1}}
      .st-modal{width:min(520px,95vw);border-radius:16px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(180deg, rgba(20,20,20,.92), rgba(14,14,14,.76));box-shadow:0 30px 90px rgba(0,0,0,.65);overflow:hidden}
      .st-modal-top{display:flex;justify-content:space-between;align-items:center;padding:14px 14px;border-bottom:1px solid rgba(255,255,255,.10)}
      .st-modal-title{font-weight:700;letter-spacing:.04em}
      .st-icon-btn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.10);color:#fff;border-radius:10px;padding:6px 10px;cursor:pointer}
      .st-modal-body{padding:14px 14px}
      .st-setting-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0}
      .st-setting-name{font-weight:700}
      .st-setting-desc{font-size:.85rem}
      .st-pill-btn{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.12);color:#fff;border-radius:999px;padding:8px 12px;cursor:pointer}
      .st-divider{height:1px;background:rgba(255,255,255,.10);margin:10px 0}
      .st-lock{position:fixed;inset:0;z-index:999998;display:none;place-items:center;background:rgba(0,0,0,.72);backdrop-filter:blur(10px);padding:16px}
      .st-lock.active{display:grid;animation:stFade .12s ease}
      .st-lock-card{width:min(620px,95vw);border-radius:16px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(180deg, rgba(20,20,20,.92), rgba(14,14,14,.76));box-shadow:0 30px 90px rgba(0,0,0,.65);padding:18px}
      .st-lock-title{font-weight:800;letter-spacing:.06em}
      .st-lock-msg{margin-top:8px;opacity:.85;line-height:1.35rem}
      .st-statusflash{animation:stStatus .18s ease}
      @keyframes stStatus{from{transform:translateY(-3px);opacity:.2}to{transform:translateY(0);opacity:1}}
    `;

    const tag = document.createElement("style");
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  // ===== Lock overlay =====
  let chatLocked = false;
  function isChatLocked() {
    return !!chatLocked;
  }
  function setChatLocked(val, msg) {
    chatLocked = !!val;
    ensureEnhancedStyles();

    let lock = document.getElementById("stLockOverlay");
    if (!lock) {
      lock = document.createElement("div");
      lock.id = "stLockOverlay";
      lock.className = "st-lock";
      lock.innerHTML = `
        <div class="st-lock-card">
          <div class="st-lock-title">CHAT LOCKED</div>
          <div id="stLockMsg" class="st-lock-msg">Chat is temporarily locked by admin.</div>
          <div class="muted" style="margin-top:10px;font-size:.85rem">You’ll be able to chat again automatically when it unlocks.</div>
        </div>
      `;
      document.body.appendChild(lock);
    }

    const msgEl = document.getElementById("stLockMsg");
    if (msgEl) msgEl.textContent = msg || "Chat is temporarily locked by admin.";
    lock.classList.toggle("active", chatLocked);
  }

  function flashStatus(text, kind) {
    const el = $("chatStatus");
    if (!el) return;

    el.textContent = text || "";
    el.classList.remove("bad", "warn");
    if (kind === "bad") el.classList.add("bad");
    if (kind === "warn") el.classList.add("warn");

    el.classList.add("st-statusflash");
    setTimeout(() => {
      try {
        el.classList.remove("st-statusflash");
      } catch { }
    }, 240);
  }

  // ===== Presence (online counter only) =====
  let presenceTimer = null;
  let presenceUnsub = null;
  function presenceDoc(classId) {
    return classDocRef(classId).collection("meta").doc("presence");
  }

  function startPresence({ classId, userId, onCount }) {
    stopPresence();
    const ref = presenceDoc(classId);

    const beat = async () => {
      try {
        await ref.set(
          { [userId]: firebase.firestore.FieldValue.serverTimestamp() },
          { merge: true }
        );
      } catch { }
    };

    beat();
    presenceTimer = setInterval(beat, 30000);

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) beat();
    });

    presenceUnsub = ref.onSnapshot((doc) => {
      const data = doc && doc.exists ? doc.data() || {} : {};
      const now = Date.now();
      const TTL = 90000;

      let count = 0;
      Object.values(data).forEach((v) => {
        let ms = 0;
        if (!v) return;
        if (typeof v === "number") ms = v;
        else if (v.toDate) ms = v.toDate().getTime();
        if (ms && now - ms <= TTL) count++;
      });

      if (typeof onCount === "function") onCount(count);
    });

    if (presenceUnsub) chatUnsubs.push(presenceUnsub);
  }

  function stopPresence() {
    if (presenceTimer) {
      clearInterval(presenceTimer);
      presenceTimer = null;
    }
    if (presenceUnsub) {
      try {
        presenceUnsub();
      } catch { }
      presenceUnsub = null;
    }
  }

  // ===== Admin Commands =====
  function commandsDoc(classId) {
    return classDocRef(classId).collection("meta").doc("commands");
  }

  function startCommandsListener({
    classId,
    userId,
    onLogout,
    onRerules,
    onLock,
    onRefresh,
    onTheme,
  }) {
    const ref = commandsDoc(classId);
    const keyBase = `st_cmd_${classId}_`;

    const unsub = ref.onSnapshot((doc) => {
      const data = doc && doc.exists ? doc.data() || {} : {};

      const logoutNonce = Number(data.logoutNonce || 0);
      const rulesNonce = Number(data.rulesNonce || 0);
      const refreshNonce = Number(data.refreshNonce || 0);

      const lastLogout = Number(sessionStorage.getItem(keyBase + "logout") || "0");
      const lastRules = Number(sessionStorage.getItem(keyBase + "rules") || "0");
      const lastRef = Number(sessionStorage.getItem(keyBase + "refresh") || "0");

      if (logoutNonce > lastLogout) {
        sessionStorage.setItem(keyBase + "logout", String(logoutNonce));
        if (typeof onLogout === "function") onLogout();
      }
      if (rulesNonce > lastRules) {
        sessionStorage.setItem(keyBase + "rules", String(rulesNonce));
        if (typeof onRerules === "function") onRerules();
      }
      if (refreshNonce > lastRef) {
        sessionStorage.setItem(keyBase + "refresh", String(refreshNonce));
        if (typeof onRefresh === "function") onRefresh();
      }

      if (typeof onLock === "function") onLock(!!data.locked, data.lockMessage || "");

      if (typeof onTheme === "function" && (data.theme === "day" || data.theme === "night")) {
        onTheme(data.theme);
      }
    });

    if (unsub) chatUnsubs.push(unsub);
  }

  function forceReRules({ classId, userId, userName, className }) {
    try {
      localStorage.removeItem(rulesKey(classId, userId));
    } catch { }
    showRulesGate({ classId, userId, userName, className }, () => { });
  }

  function forceLogoutToClassScreen({ reason }) {
    try {
      setChatLocked(false, "");
    } catch { }
    stopPresence();
    clearChatListeners();
    clearLS();

    selectedClassId = null;
    selectedClassName = null;

    showScreen("class");
    try {
      loadClasses();
    } catch { }
  }

  // ===== RULES GATE OVERLAY (already in your app, upgraded to request notifications) =====
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
    } catch { }

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

    const title = document.createElement("div");
    title.style.fontWeight = "800";
    title.style.letterSpacing = ".08em";
    title.style.fontSize = "1.12rem";
    title.textContent = "RULES";

    const sub = document.createElement("div");
    sub.className = "muted";
    sub.style.marginTop = "6px";
    sub.style.lineHeight = "1.35rem";
    sub.innerHTML = `Class: <strong>${escapeHtml(className || classId)}</strong><br/>Welcome, <strong>${escapeHtml(
      userName || "User"
    )}</strong>`;

    const rules = document.createElement("div");
    rules.style.marginTop = "14px";
    rules.style.border = "1px solid rgba(255,255,255,.10)";
    rules.style.borderRadius = "14px";
    rules.style.padding = "12px 14px";
    rules.style.background = "rgba(0,0,0,.35)";
    rules.style.lineHeight = "1.45rem";
    rules.innerHTML = `
      <div style="opacity:.92">
        • Be respectful.<br/>
        • No spam / no harassment.<br/>
        • Keep it class-appropriate.<br/>
        • Admin can remove messages / lock chat if needed.
      </div>
    `;

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.gap = "12px";
    row.style.marginTop = "14px";
    row.style.flexWrap = "wrap";

    const left = document.createElement("div");
    left.style.display = "flex";
    left.style.alignItems = "center";
    left.style.gap = "10px";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "rulesCheck";
    checkbox.style.transform = "scale(1.1)";
    checkbox.style.cursor = "pointer";

    const label = document.createElement("label");
    label.htmlFor = "rulesCheck";
    label.className = "muted";
    label.style.cursor = "pointer";
    label.textContent = "I understand and agree to follow the rules.";

    left.appendChild(checkbox);
    left.appendChild(label);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Continue";
    btn.disabled = true;

    let secs = 2;
    const tick = () => {
      if (!checkbox.checked) {
        btn.disabled = true;
        btn.textContent = `Continue (${secs})`;
        return;
      }
      btn.disabled = false;
      btn.textContent = "Continue";
    };

    btn.textContent = `Continue (${secs})`;
    const interval = setInterval(() => {
      secs = Math.max(0, secs - 1);
      if (secs === 0) {
        tick();
        clearInterval(interval);
      } else {
        tick();
      }
    }, 1000);

    checkbox.addEventListener("change", tick);
    tick();

    btn.onclick = () => {
      if (btn.disabled) return;
      try {
        clearInterval(interval);
      } catch { }
      setAcceptedRules(classId, userId);

      // Ask for browser notifications once, right after rules acceptance
      requestNotificationPermissionOnce();

      overlay.style.opacity = "0";
      overlay.style.transition = "opacity .18s ease";
      overlay.style.pointerEvents = "none";
      setTimeout(() => {
        try {
          overlay.remove();
        } catch { }
        onContinue();
      }, 180);
    };

    row.appendChild(left);
    row.appendChild(btn);

    card.appendChild(title);
    card.appendChild(sub);
    card.appendChild(rules);
    card.appendChild(row);

    overlay.appendChild(card);
    root.appendChild(overlay);
  }

  // ===== state =====
  let selectedClassId = null;
  let selectedClassName = null;

  // ===== restore session on refresh =====
  const savedClassId = localStorage.getItem("classId");
  const savedUserId = localStorage.getItem("userId");
  const savedName = localStorage.getItem("userName");
  const savedClassName = localStorage.getItem("className");

  // ===== CLASSES FLOW =====
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
    } catch (e) {
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

      // Make a stable userId (per browser per class)
      const userId = localStorage.getItem("userId") || Math.random().toString(36).slice(2, 12);

      try {
        // banned check
        const bannedDoc = await bannedRef(selectedClassId, userId).get();
        if (bannedDoc.exists) {
          showDenied("You are banned.");
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

        showWaiting();
        watchStatus({ classId: selectedClassId, userId, name });
      } catch (e) {
        if (nameError) nameError.textContent = "Request failed.";
      }
    };
  }

  function showWaiting() {
    const waitStatus = $("waitStatus");
    if (waitStatus) waitStatus.textContent = "";
    showScreen("wait");
  }

  function showDenied(msg) {
    const waitStatus = $("waitStatus");
    if (waitStatus) waitStatus.textContent = msg || "You cannot join.";
    showScreen("wait");
  }

  // Restore flow
  function restoreFlow() {
    if (savedClassId && savedUserId && savedName) {
      selectedClassId = savedClassId;
      selectedClassName = savedClassName || savedClassId;

      showWaiting();
      watchStatus({ classId: savedClassId, userId: savedUserId, name: savedName });
    } else {
      showScreen("class");
      loadClasses();
    }
  }

  // Watch approval status (pendingUsers doc)
  function watchStatus({ classId, userId, name }) {
    const waitStatus = $("waitStatus");
    if (waitStatus) waitStatus.textContent = "Waiting…";

    const unsub = pendingRef(classId, userId).onSnapshot(
      (doc) => {
        if (!doc.exists) {
          if (waitStatus) waitStatus.textContent = "Request not found.";
          return;
        }
        const data = doc.data() || {};
        const status = data.status;

        if (status === "approved") {
          try {
            playSound("approve");
          } catch { }

          showRulesGate(
            {
              classId,
              userId,
              userName: name,
              className: selectedClassName || data.className || classId,
            },
            () => loadChat(name, classId, userId)
          );
        } else if (status === "rejected") {
          showDenied("You were rejected by the admin.");
        } else if (status === "banned") {
          showDenied("You are banned.");
        } else {
          if (waitStatus) waitStatus.textContent = "Waiting for admin approval…";
        }
      },
      () => {
        if (waitStatus) waitStatus.textContent = "Connection error.";
      }
    );

    // store as "chat" unsub too so cleanup works
    chatUnsubs.push(unsub);
  }

  // ===== CHAT (OPTIMIZED RENDERING) =====
  let chatUnsubs = [];

  function clearChatListeners() {
    chatUnsubs.forEach((u) => {
      try {
        u();
      } catch { }
    });
    chatUnsubs = [];
    // also stop any timers that aren't snapshot-based
    try {
      stopPresence();
    } catch { }
  }

  function isNearBottom(el, threshold = 120) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }

  function fmtTime(ts) {
    try {
      if (!ts) return "";
      if (typeof ts === "number") return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      if (ts.toDate) return ts.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return "";
    } catch {
      return "";
    }
  }

  function buildMsgEl(msg, classId, userId, userName) {
    const wrap = document.createElement("div");
    wrap.className = "msg";
    wrap.dataset.id = msg.id || "";

    const top = document.createElement("div");
    top.className = "msg-top";
    top.innerHTML = `<strong>${escapeHtml(msg.name || "User")}</strong> <span class="muted">${fmtTime(msg.timestamp)}</span>`;
    wrap.appendChild(top);

    const body = document.createElement("div");
    body.className = "msg-text";
    body.textContent = msg.text || "";
    wrap.appendChild(body);

    return wrap;
  }

  function updateMsgEl(el, msg) {
    const top = el.querySelector(".msg-top");
    const body = el.querySelector(".msg-text");
    if (top) top.innerHTML = `<strong>${escapeHtml(msg.name || "User")}</strong> <span class="muted">${fmtTime(msg.timestamp)}</span>`;
    if (body) body.textContent = msg.text || "";
  }

  // ===== NEW: upgraded loadChat =====
  function loadChat(name, classId, userId) {
    clearChatListeners();

    const chatWelcome = $("chatWelcome");
    const chatSubtitle = $("chatSubtitle");
    const chatStatus = $("chatStatus");

    if (chatWelcome) chatWelcome.textContent = `Welcome, ${name}!`;
    if (chatSubtitle) chatSubtitle.textContent = `SecureText chat | ${selectedClassName || classId}`;
    if (chatStatus) chatStatus.textContent = "";

    showScreen("chat");

    const msgInput = $("msgInput");
    const sendBtn = $("sendBtn");
    const messagesDiv = $("messages");
    const typingDiv = $("typingIndicator");
    const themeToggle = $("themeToggle"); // will be moved into settings
    const logoutBtn = $("logoutBtn");

    // ===== Enhanced UI / FX injection (once) =====
    ensureEnhancedStyles();

    // ===== Header: Settings button (Theme + Sounds) =====
    const chatControls = document.querySelector(".chat-controls");
    const settingsState = getSettingsState();

    // Hide the old theme button (we control theme via settings)
    if (themeToggle) themeToggle.style.display = "none";

    let settingsBtn = $("settingsBtn");
    if (!settingsBtn && chatControls) {
      settingsBtn = document.createElement("button");
      settingsBtn.id = "settingsBtn";
      settingsBtn.type = "button";
      settingsBtn.title = "Settings";
      settingsBtn.textContent = "⚙️";
      chatControls.insertBefore(settingsBtn, logoutBtn || null);
    }

    // Online counter badge
    let onlineBadge = $("onlineBadge");
    if (!onlineBadge) {
      onlineBadge = document.createElement("span");
      onlineBadge.id = "onlineBadge";
      onlineBadge.className = "online-badge";
      onlineBadge.textContent = "• 0 online";
      if (chatSubtitle && chatSubtitle.parentElement) {
        chatSubtitle.parentElement.appendChild(onlineBadge);
      }
    }

    // Apply theme from settings immediately
    applyTheme(settingsState.theme);
    setSoundEnabled(settingsState.sound);

    // Open settings modal
    if (settingsBtn) {
      settingsBtn.onclick = () => {
        openSettingsModal({
          theme: getSettingsState().theme,
          sound: getSettingsState().sound,
          onChange: (next) => {
            setSettingsState(next);
            applyTheme(next.theme);
            setSoundEnabled(next.sound);
          },
        });
      };
    }

    // logout button
    if (logoutBtn) {
      logoutBtn.onclick = () => {
        forceLogoutToClassScreen({ reason: "logout" });
      };
    }

    // ===== Enter to send (Shift+Enter newline) =====
    if (msgInput && sendBtn) {
      msgInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendBtn.click();
        }
      });
    }

    // ===== Presence (online counter) =====
    startPresence({
      classId,
      userId,
      onCount: (n) => {
        if (onlineBadge) onlineBadge.textContent = `• ${n} online`;
      },
    });

    // ===== Admin Commands Listener =====
    startCommandsListener({
      classId,
      userId,
      onLogout: () => forceLogoutToClassScreen({ reason: "forced" }),
      onRerules: () =>
        forceReRules({
          classId,
          userId,
          userName: name,
          className: selectedClassName || classId,
        }),
      onLock: (locked, msg) => setChatLocked(locked, msg),
      onRefresh: () => location.reload(),
      onTheme: (mode) => {
        if (mode === "day" || mode === "night") {
          applyTheme(mode);
        }
      },
    });

    // ===== Announcements (limited) =====
    chatUnsubs.push(
      announcementsCol(classId)
        .orderBy("timestamp", "asc")
        .limit(10)
        .onSnapshot(
          (snap) => {
            const list = $("announcementsList");
            if (!list) return;
            list.innerHTML = "";
            snap.forEach((d) => {
              const a = d.data() || {};
              const row = document.createElement("div");
              row.className = "announcement";
              row.innerHTML = `<div class="a-top"><strong>${escapeHtml(a.title || "Announcement")}</strong><span class="muted">${fmtTime(
                a.timestamp
              )}</span></div><div class="a-body">${escapeHtml(a.body || "")}</div>`;
              list.appendChild(row);
            });
          },
          () => { }
        )
    );

    // ===== Messages (limitToLast 75 to save reads) =====
    let didInitialMessages = false;

    chatUnsubs.push(
      messagesCol(classId)
        .orderBy("timestamp", "asc")
        .limitToLast(75)
        .onSnapshot(
          (snap) => {
            if (!messagesDiv) return;

            const shouldStick = isNearBottom(messagesDiv, 160);

            if (!didInitialMessages) {
              messagesDiv.innerHTML = "";
              snap.forEach((d) => {
                const data = d.data() || {};
                const el = buildMsgEl({ id: d.id, ...data }, classId, userId, name);
                el.id = `msg_${d.id}`;
                messagesDiv.appendChild(el);
              });
              didInitialMessages = true;

              if (shouldStick) messagesDiv.scrollTop = messagesDiv.scrollHeight;
              return;
            }

            // incremental updates after initial load
            const frag = document.createDocumentFragment();

            snap.docChanges().forEach((ch) => {
              const doc = ch.doc;
              const m = doc.data() || {};
              const elId = `msg_${doc.id}`;
              const existing = document.getElementById(elId);

              if (ch.type === "added") {
                const el = buildMsgEl({ id: doc.id, ...m }, classId, userId, name);
                el.id = elId;
                frag.appendChild(el);

                if (document.hidden && m.userId && m.userId !== userId) {
                  maybeNotifyNewMessage({
                    className: selectedClassName || classId,
                    from: m.name || "Someone",
                    text: String(m.text || ""),
                  });
                  playSound("receive");
                }
              } else if (ch.type === "modified") {
                if (existing) updateMsgEl(existing, { id: doc.id, ...m });
              } else if (ch.type === "removed") {
                if (existing) existing.remove();
              }
            });

            if (frag.childNodes.length) messagesDiv.appendChild(frag);
            if (shouldStick) messagesDiv.scrollTop = messagesDiv.scrollHeight;
          },
          () => { }
        )
    );

    // ===== Typing indicator (animated dots) =====
    let typingTimeout = null;
    let typingDebounce = null;
    let localTyping = false;

    async function setTyping(val) {
      if (localTyping === val) return;
      localTyping = val;
      try {
        await typingDoc(classId).set({ [userId]: val }, { merge: true });
      } catch { }
    }

    if (msgInput) {
      msgInput.oninput = () => {
        if (typingDebounce) clearTimeout(typingDebounce);
        typingDebounce = setTimeout(() => setTyping(true), 180);

        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => setTyping(false), 1400);
      };
    }

    try {
      typingDoc(classId).set({ [userId]: false }, { merge: true });
    } catch { }

    chatUnsubs.push(
      typingDoc(classId).onSnapshot((doc) => {
        if (!typingDiv) return;
        if (!doc.exists) {
          typingDiv.innerHTML = "";
          return;
        }
        const data = doc.data() || {};
        const others = Object.entries(data).filter(([id, val]) => id !== userId && val === true);

        if (others.length > 0) {
          typingDiv.innerHTML = `<span class="typing-bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span><span class="muted" style="margin-left:8px">Someone is typing…</span>`;
        } else {
          typingDiv.innerHTML = "";
        }
      })
    );

    // ===== Send message =====
    if (sendBtn && msgInput) {
      sendBtn.onclick = async () => {
        const text = msgInput.value.trim();
        if (!text) return;

        if (isChatLocked()) {
          flashStatus("Chat is locked by admin.", "warn");
          playSound("deny");
          return;
        }

        sendBtn.disabled = true;
        try {
          const banDoc = await bannedRef(classId, userId).get();
          if (banDoc.exists) {
            showDenied();
            return;
          }

          await messagesCol(classId).add({
            userId,
            name,
            text,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          });

          msgInput.value = "";
          try {
            setTyping(false);
          } catch { }
          playSound("send");
        } catch (e) {
          flashStatus("Failed to send.", "bad");
        } finally {
          sendBtn.disabled = false;
        }
      };
    }

    // Request notifications after rules accepted (won't spam)
    requestNotificationPermissionOnce();

    window.addEventListener("beforeunload", () => {
      try {
        typingDoc(classId).set({ [userId]: false }, { merge: true });
      } catch { }
    });
  }

  // Reset button
  const resetBtn = $("resetBtn");
  if (resetBtn) {
    resetBtn.onclick = () => {
      clearChatListeners();
      clearLS();
      selectedClassId = null;
      selectedClassName = null;
      showScreen("class");
      loadClasses();
    };
  }

  // Boot
  restoreFlow();
});