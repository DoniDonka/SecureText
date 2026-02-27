document.addEventListener("DOMContentLoaded", () => {
  // =========================
  // DOM helpers
  // =========================
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

  function setText(id, text) {
    const el = $(id);
    if (el) el.textContent = text || "";
  }

  // =========================
  // Intro overlay (old UI)
  // =========================
  (function initIntro() {
    const intro = $("introOverlay");
    if (!intro) return;
    // Let your old animation play a moment, then fade out smoothly
    setTimeout(() => {
      intro.style.opacity = "0";
      intro.style.transition = "opacity .35s ease";
      setTimeout(() => {
        try {
          intro.remove();
        } catch { }
      }, 380);
    }, 850);
  })();

  // =========================
  // Firestore refs (v8)
  // =========================
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
  function presenceDoc(classId) {
    return classDocRef(classId).collection("meta").doc("presence");
  }
  function commandsDoc(classId) {
    return classDocRef(classId).collection("meta").doc("commands");
  }

  // =========================
  // Local storage (session)
  // =========================
  function setLS(obj) {
    Object.entries(obj).forEach(([k, v]) => localStorage.setItem(k, String(v)));
  }
  function getLS(k) {
    return localStorage.getItem(k);
  }
  function clearSessionLS() {
    localStorage.removeItem("classId");
    localStorage.removeItem("className");
    localStorage.removeItem("userId");
    localStorage.removeItem("userName");
  }

  // Rules acceptance per class+user
  function rulesKey(classId, userId) {
    return `rulesAccepted_${classId}_${userId}`;
  }
  function hasAcceptedRules(classId, userId) {
    return localStorage.getItem(rulesKey(classId, userId)) === "true";
  }
  function setAcceptedRules(classId, userId) {
    localStorage.setItem(rulesKey(classId, userId), "true");
  }

  // =========================
  // Settings (Theme + Sound)
  // =========================
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
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ theme: next.theme === "day" ? "day" : "night", sound: !!next.sound })
      );
    } catch { }
  }

  function applyTheme(mode) {
    const cs = $("chat-screen");
    if (!cs) return;
    cs.classList.remove("day", "night");
    cs.classList.add(mode === "day" ? "day" : "night");
    // Keep your existing button icon updated if present
    const tbtn = $("themeToggle");
    if (tbtn) tbtn.textContent = mode === "day" ? "☀️" : "🌙";
  }

  // Tiny synth sounds (no external files)
  let soundEnabled = getSettings().sound;
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
      let freq = 520;
      let dur = 0.07;

      if (type === "send") {
        freq = 620;
        dur = 0.06;
      } else if (type === "receive") {
        freq = 520;
        dur = 0.07;
      } else if (type === "approve") {
        freq = 740;
        dur = 0.1;
      } else if (type === "deny") {
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

  // Settings modal (inject)
  function ensureEnhancedStylesOnce() {
    if (document.getElementById("stEnhancedStyles")) return;
    const css = document.createElement("style");
    css.id = "stEnhancedStyles";
    css.textContent = `
      .st-overlay{position:fixed;inset:0;z-index:999999;display:grid;place-items:center;background:rgba(0,0,0,.70);backdrop-filter:blur(10px);padding:16px;animation:stFade .12s ease}
      @keyframes stFade{from{opacity:0}to{opacity:1}}
      .st-modal{width:min(520px,95vw);border-radius:16px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(180deg, rgba(20,20,20,.92), rgba(14,14,14,.76));box-shadow:0 30px 90px rgba(0,0,0,.65);overflow:hidden}
      .st-modal-top{display:flex;justify-content:space-between;align-items:center;padding:14px 14px;border-bottom:1px solid rgba(255,255,255,.10)}
      .st-modal-title{font-weight:800;letter-spacing:.04em}
      .st-icon-btn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.10);color:#fff;border-radius:10px;padding:6px 10px;cursor:pointer}
      .st-modal-body{padding:14px 14px}
      .st-setting-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0}
      .st-setting-name{font-weight:800}
      .st-setting-desc{font-size:.85rem;opacity:.75}
      .st-pill-btn{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.12);color:#fff;border-radius:999px;padding:8px 12px;cursor:pointer}
      .st-divider{height:1px;background:rgba(255,255,255,.10);margin:10px 0}
      .typing-bubble{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.10);padding:6px 10px;border-radius:999px}
      .typing-bubble .dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.85);display:inline-block;animation:stDot 1s infinite}
      .typing-bubble .dot:nth-child(2){animation-delay:.12s}
      .typing-bubble .dot:nth-child(3){animation-delay:.24s}
      @keyframes stDot{0%,60%,100%{transform:translateY(0);opacity:.55}30%{transform:translateY(-4px);opacity:1}}
      .st-lock{position:fixed;inset:0;z-index:999998;display:none;place-items:center;background:rgba(0,0,0,.72);backdrop-filter:blur(10px);padding:16px}
      .st-lock.active{display:grid;animation:stFade .12s ease}
      .st-lock-card{width:min(620px,95vw);border-radius:16px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(180deg, rgba(20,20,20,.92), rgba(14,14,14,.76));box-shadow:0 30px 90px rgba(0,0,0,.65);padding:18px}
      .st-lock-title{font-weight:900;letter-spacing:.10em}
      .st-lock-msg{margin-top:8px;opacity:.85;line-height:1.35rem}
      .online-badge{display:inline-block;margin-left:10px;font-size:.85rem;opacity:.8}
    `;
    document.head.appendChild(css);
  }

  function openSettingsModal() {
    ensureEnhancedStylesOnce();

    const old = document.getElementById("stSettingsOverlay");
    if (old) old.remove();

    let st = getSettings();

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
              <div class="st-setting-desc">Day / Night mode</div>
            </div>
            <button id="stThemeBtn" class="st-pill-btn" type="button"></button>
          </div>

          <div class="st-setting-row">
            <div>
              <div class="st-setting-name">Sounds</div>
              <div class="st-setting-desc">Send / receive effects</div>
            </div>
            <button id="stSoundBtn" class="st-pill-btn" type="button"></button>
          </div>

          <div class="st-divider"></div>
          <div class="st-setting-desc">Notifications only appear when this tab isn’t focused.</div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const themeBtn = overlay.querySelector("#stThemeBtn");
    const soundBtn = overlay.querySelector("#stSoundBtn");

    function render() {
      themeBtn.textContent = st.theme === "day" ? "☀️ Day" : "🌙 Night";
      soundBtn.textContent = st.sound ? "🔊 On" : "🔇 Off";
    }
    render();

    themeBtn.onclick = () => {
      st.theme = st.theme === "day" ? "night" : "day";
      setSettings(st);
      applyTheme(st.theme);
      render();
      playSound("send");
    };

    soundBtn.onclick = () => {
      st.sound = !st.sound;
      setSettings(st);
      setSoundEnabled(st.sound);
      render();
      playSound(st.sound ? "send" : "deny");
    };

    const close = () => {
      try {
        overlay.remove();
      } catch { }
    };

    overlay.querySelector("#stSettingsClose").onclick = close;
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    window.addEventListener(
      "keydown",
      function esc(e) {
        if (e.key === "Escape") {
          window.removeEventListener("keydown", esc);
          close();
        }
      },
      { once: true }
    );
  }

  function ensureSettingsButton() {
    // Put ⚙ next to logout, keep your existing themeToggle too
    const controls = document.querySelector(".chat-controls");
    if (!controls) return;

    if ($("settingsBtn")) return;

    const btn = document.createElement("button");
    btn.id = "settingsBtn";
    btn.type = "button";
    btn.title = "Settings";
    btn.textContent = "⚙️";
    btn.style.marginLeft = "8px";
    controls.insertBefore(btn, $("logoutBtn") || null);
    btn.onclick = openSettingsModal;
  }

  // =========================
  // Notifications (A: only when tab not focused)
  // =========================
  const NOTIF_ASK_KEY = "st_notif_asked";
  function requestNotificationPermissionOnce() {
    try {
      if (!("Notification" in window)) return;
      if (localStorage.getItem(NOTIF_ASK_KEY) === "1") return;

      localStorage.setItem(NOTIF_ASK_KEY, "1");

      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => { });
      }
    } catch { }
  }

  function maybeNotify({ className, from, text }) {
    try {
      if (!("Notification" in window)) return;
      if (Notification.permission !== "granted") return;
      if (!document.hidden) return; // A

      const body = (text || "").length > 140 ? (text || "").slice(0, 140) + "…" : (text || "");
      new Notification(`📚 SecureText | ${className}`, { body: `${from}: ${body}` });
    } catch { }
  }

  // =========================
  // Lock overlay
  // =========================
  let chatLocked = false;
  function setChatLocked(val, msg) {
    chatLocked = !!val;
    ensureEnhancedStylesOnce();

    let lock = document.getElementById("stLockOverlay");
    if (!lock) {
      lock = document.createElement("div");
      lock.id = "stLockOverlay";
      lock.className = "st-lock";
      lock.innerHTML = `
        <div class="st-lock-card">
          <div class="st-lock-title">CHAT LOCKED</div>
          <div id="stLockMsg" class="st-lock-msg">Chat is temporarily locked by admin.</div>
          <div style="margin-top:10px;opacity:.75;font-size:.85rem">You’ll be able to chat again automatically when it unlocks.</div>
        </div>
      `;
      document.body.appendChild(lock);
    }

    const msgEl = document.getElementById("stLockMsg");
    if (msgEl) msgEl.textContent = msg || "Chat is temporarily locked by admin.";
    lock.classList.toggle("active", chatLocked);
  }

  // =========================
  // Listener manager
  // =========================
  let unsubs = [];
  function addUnsub(fn) {
    if (typeof fn === "function") unsubs.push(fn);
  }
  function clearListeners() {
    unsubs.forEach((u) => {
      try {
        u();
      } catch { }
    });
    unsubs = [];
  }

  // =========================
  // State
  // =========================
  let selectedClassId = null;
  let selectedClassName = null;

  const savedClassId = getLS("classId");
  const savedClassName = getLS("className");
  const savedUserId = getLS("userId");
  const savedUserName = getLS("userName");

  // =========================
  // Load classes (still a read — but persistence will help a lot)
  // =========================
  async function loadClasses() {
    const box = $("classes");
    setText("classError", "");
    if (!box) return;

    box.innerHTML = `<div class="muted">Loading…</div>`;

    try {
      const snap = await db.collection("classes").get();
      box.innerHTML = "";

      if (snap.empty) {
        box.innerHTML = `<div class="muted">No classes found.</div>`;
        return;
      }

      snap.forEach((doc) => {
        const data = doc.data() || {};
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "classBtn";
        btn.innerHTML = `<span>${escapeHtml(data.name || doc.id)}</span><span class="chip">Join</span>`;

        btn.onclick = () => {
          selectedClassId = doc.id;
          selectedClassName = data.name || doc.id;
          setText("pinClassName", selectedClassName);
          showScreen("pin");
        };

        box.appendChild(btn);
      });
    } catch (e) {
      box.innerHTML = "";
      setText("classError", "Failed to load classes.");
    }
  }

  // =========================
  // Buttons: pin/name/wait
  // =========================
  const pinBackBtn = $("pinBackBtn");
  const pinContinueBtn = $("pinContinueBtn");
  const pinInput = $("pinInput");

  if (pinBackBtn) pinBackBtn.onclick = () => showScreen("class");

  if (pinContinueBtn) {
    pinContinueBtn.onclick = async () => {
      setText("pinError", "");
      if (!selectedClassId) return;

      const pin = String(pinInput?.value || "").trim();
      if (!pin) {
        setText("pinError", "Enter the class PIN.");
        return;
      }

      try {
        const cls = await classDocRef(selectedClassId).get();
        if (!cls.exists) {
          setText("pinError", "Class not found.");
          return;
        }
        const data = cls.data() || {};
        const correctPin = String(data.pin || "").trim();
        if (pin !== correctPin) {
          setText("pinError", "Incorrect PIN.");
          return;
        }
        showScreen("name");
      } catch {
        setText("pinError", "PIN check failed.");
      }
    };
  }

  const nameBackBtn = $("nameBackBtn");
  const nameContinueBtn = $("nameContinueBtn");
  const nameInput = $("nameInput");

  if (nameBackBtn) nameBackBtn.onclick = () => showScreen("pin");

  if (nameContinueBtn) {
    nameContinueBtn.onclick = async () => {
      setText("nameError", "");
      if (!selectedClassId) return;

      const name = String(nameInput?.value || "").trim();
      if (!name) {
        setText("nameError", "Enter your name.");
        return;
      }

      const userId = getLS("userId") || Math.random().toString(36).slice(2, 12);

      try {
        const b = await bannedRef(selectedClassId, userId).get();
        if (b.exists) {
          showScreen("wait");
          setText("waitStatus", "You are banned.");
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
        setText("waitStatus", "Waiting for admin approval…");
        watchStatus({ classId: selectedClassId, userId, name });
      } catch {
        setText("nameError", "Request failed.");
      }
    };
  }

  const resetBtn = $("resetBtn");
  if (resetBtn) {
    resetBtn.onclick = () => {
      clearListeners();
      clearSessionLS();
      selectedClassId = null;
      selectedClassName = null;
      showScreen("class");
      loadClasses();
    };
  }

  // =========================
  // Rules gate overlay (keeps vibe; asks notif permission after accept)
  // =========================
  function showRulesGate({ classId, userId, userName, className }, onContinue) {
    if (hasAcceptedRules(classId, userId)) {
      onContinue();
      return;
    }

    // Confetti if your old confetti system exists
    try {
      if (window.ST_UI && typeof window.ST_UI.confettiBurst === "function") {
        window.ST_UI.confettiBurst(1200);
      }
    } catch { }

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
    overlay.style.background = "rgba(0,0,0,.78)";
    overlay.style.backdropFilter = "blur(10px)";

    const card = document.createElement("div");
    card.style.width = "min(860px, 96vw)";
    card.style.borderRadius = "18px";
    card.style.border = "1px solid rgba(255,255,255,.12)";
    card.style.background = "linear-gradient(180deg, rgba(20,20,20,.82), rgba(16,16,16,.58))";
    card.style.boxShadow = "0 30px 90px rgba(0,0,0,.6)";
    card.style.padding = "22px";

    card.innerHTML = `
      <div style="font-weight:900;letter-spacing:.10em">RULES</div>
      <div style="opacity:.75;margin-top:8px;line-height:1.35rem">
        Class: <strong>${escapeHtml(className || classId)}</strong><br/>
        Welcome, <strong>${escapeHtml(userName || "User")}</strong>
      </div>
      <div style="margin-top:14px;border:1px solid rgba(255,255,255,.10);border-radius:14px;padding:12px 14px;background:rgba(0,0,0,.35);line-height:1.55rem;opacity:.92">
        • Be respectful.<br/>
        • No spam / harassment.<br/>
        • Keep it class-appropriate.<br/>
        • Admin can lock chat if needed.
      </div>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px">
        <input id="rulesCheck" type="checkbox" style="transform:scale(1.1)"/>
        <label for="rulesCheck" style="opacity:.8;cursor:pointer">I understand and agree.</label>
        <button id="rulesContinue" type="button" style="margin-left:auto;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.08);color:#fff;padding:10px 14px;cursor:pointer" disabled>
          Continue (2)
        </button>
      </div>
    `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const check = overlay.querySelector("#rulesCheck");
    const btn = overlay.querySelector("#rulesContinue");

    let secs = 2;
    const timer = setInterval(() => {
      secs = Math.max(0, secs - 1);
      if (secs === 0) {
        clearInterval(timer);
        btn.textContent = "Continue";
        btn.disabled = !check.checked;
      } else {
        btn.textContent = `Continue (${secs})`;
      }
    }, 1000);

    check.addEventListener("change", () => {
      if (secs === 0) btn.disabled = !check.checked;
    });

    btn.onclick = () => {
      if (btn.disabled) return;
      try {
        clearInterval(timer);
      } catch { }
      setAcceptedRules(classId, userId);

      // Ask browser notif permission once after rules acceptance
      requestNotificationPermissionOnce();

      overlay.style.opacity = "0";
      overlay.style.transition = "opacity .18s ease";
      overlay.style.pointerEvents = "none";
      setTimeout(() => {
        try {
          overlay.remove();
        } catch { }
        onContinue();
      }, 190);
    };
  }

  // =========================
  // Watch status (approved → rules → chat)
  // =========================
  function watchStatus({ classId, userId, name }) {
    clearListeners();

    const unsub = pendingRef(classId, userId).onSnapshot(
      (doc) => {
        if (!doc.exists) {
          setText("waitStatus", "Request not found.");
          return;
        }
        const data = doc.data() || {};
        const status = data.status;

        if (status === "approved") {
          playSound("approve");

          const className = getLS("className") || selectedClassName || classId;
          showRulesGate({ classId, userId, userName: name, className }, () => {
            loadChat({ classId, className, userId, name });
          });
        } else if (status === "rejected") {
          setText("waitStatus", "You were rejected by the admin.");
        } else if (status === "banned") {
          setText("waitStatus", "You are banned.");
        } else {
          setText("waitStatus", "Waiting for admin approval…");
        }
      },
      () => setText("waitStatus", "Connection error.")
    );

    addUnsub(unsub);
  }

  // =========================
  // Chat: optimized + commands + presence + typing + enter-to-send
  // =========================
  function isNearBottom(el, threshold = 120) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
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

  function renderMsg(d) {
    const wrap = document.createElement("div");
    wrap.className = "msg";
    wrap.innerHTML = `
      <div class="msg-top"><strong>${escapeHtml(d.name || "User")}</strong> <span class="muted">${fmtTime(d.timestamp)}</span></div>
      <div class="msg-text"></div>
    `;
    wrap.querySelector(".msg-text").textContent = d.text || "";
    return wrap;
  }

  let presenceTimer = null;

  function stopPresence() {
    if (presenceTimer) {
      clearInterval(presenceTimer);
      presenceTimer = null;
    }
  }

  function startPresence({ classId, userId, onCount }) {
    stopPresence();

    const ref = presenceDoc(classId);
    const beat = async () => {
      try {
        await ref.set({ [userId]: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      } catch { }
    };

    beat();
    presenceTimer = setInterval(beat, 30000);

    addUnsub(
      ref.onSnapshot((doc) => {
        const data = doc && doc.exists ? doc.data() || {} : {};
        const now = Date.now();
        const TTL = 90000;
        let count = 0;

        Object.values(data).forEach((v) => {
          if (!v) return;
          const ms = v.toDate ? v.toDate().getTime() : 0;
          if (ms && now - ms <= TTL) count++;
        });

        if (typeof onCount === "function") onCount(count);
      })
    );
  }

  function startCommands({ classId, userId, onLogout, onRerules, onLock, onRefresh, onTheme }) {
    const ref = commandsDoc(classId);
    const keyBase = `st_cmd_${classId}_`;

    addUnsub(
      ref.onSnapshot((doc) => {
        const d = doc && doc.exists ? doc.data() || {} : {};

        const logoutNonce = Number(d.logoutNonce || 0);
        const rulesNonce = Number(d.rulesNonce || 0);
        const refreshNonce = Number(d.refreshNonce || 0);

        const lastLogout = Number(sessionStorage.getItem(keyBase + "logout") || "0");
        const lastRules = Number(sessionStorage.getItem(keyBase + "rules") || "0");
        const lastRef = Number(sessionStorage.getItem(keyBase + "refresh") || "0");

        if (logoutNonce > lastLogout) {
          sessionStorage.setItem(keyBase + "logout", String(logoutNonce));
          onLogout && onLogout();
        }
        if (rulesNonce > lastRules) {
          sessionStorage.setItem(keyBase + "rules", String(rulesNonce));
          onRerules && onRerules();
        }
        if (refreshNonce > lastRef) {
          sessionStorage.setItem(keyBase + "refresh", String(refreshNonce));
          onRefresh && onRefresh();
        }

        onLock && onLock(!!d.locked, d.lockMessage || "");
        if (d.theme === "day" || d.theme === "night") onTheme && onTheme(d.theme);
      })
    );
  }

  function loadChat({ classId, className, userId, name }) {
    clearListeners();
    stopPresence();
    setChatLocked(false, "");

    // Show chat screen
    showScreen("chat");

    // Apply stored settings
    const st = getSettings();
    applyTheme(st.theme);
    setSoundEnabled(st.sound);

    // Settings button injected into your existing header controls
    ensureSettingsButton();

    // Online badge
    ensureEnhancedStylesOnce();
    let badge = document.getElementById("onlineBadge");
    if (!badge) {
      badge = document.createElement("span");
      badge.id = "onlineBadge";
      badge.className = "online-badge";
      const sub = $("chatSubtitle");
      if (sub && sub.parentElement) sub.parentElement.appendChild(badge);
    }

    setText("chatWelcome", `Welcome, ${name}!`);
    setText("chatSubtitle", `SecureText chat | ${className}`);

    // Theme button still works (quick toggle)
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

    // Logout
    const logoutBtn = $("logoutBtn");
    if (logoutBtn) {
      logoutBtn.onclick = () => {
        stopPresence();
        clearListeners();
        clearSessionLS();
        selectedClassId = null;
        selectedClassName = null;
        showScreen("class");
        loadClasses();
      };
    }

    // Start presence + update badge
    startPresence({
      classId,
      userId,
      onCount: (n) => {
        if (badge) badge.textContent = `• ${n} online`;
      },
    });

    // Commands
    startCommands({
      classId,
      userId,
      onLogout: () => {
        stopPresence();
        clearListeners();
        clearSessionLS();
        selectedClassId = null;
        selectedClassName = null;
        showScreen("class");
        loadClasses();
      },
      onRerules: () => {
        try {
          localStorage.removeItem(rulesKey(classId, userId));
        } catch { }
        showRulesGate({ classId, userId, userName: name, className }, () => { });
      },
      onLock: (locked, msg) => setChatLocked(locked, msg),
      onRefresh: () => location.reload(),
      onTheme: (mode) => applyTheme(mode),
    });

    // Announcements (limit)
    addUnsub(
      announcementsCol(classId)
        .orderBy("timestamp", "asc")
        .limit(10)
        .onSnapshot((snap) => {
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
        })
    );

    // Messages (limitToLast 75)
    const messagesDiv = $("messages");
    let didInit = false;

    addUnsub(
      messagesCol(classId)
        .orderBy("timestamp", "asc")
        .limitToLast(75)
        .onSnapshot((snap) => {
          if (!messagesDiv) return;
          const stick = isNearBottom(messagesDiv, 160);

          if (!didInit) {
            messagesDiv.innerHTML = "";
            snap.forEach((d) => {
              messagesDiv.appendChild(renderMsg(d.data() || {}));
            });
            didInit = true;
            if (stick) messagesDiv.scrollTop = messagesDiv.scrollHeight;
            return;
          }

          snap.docChanges().forEach((ch) => {
            if (ch.type === "added") {
              const m = ch.doc.data() || {};
              messagesDiv.appendChild(renderMsg(m));

              // notification + sound for other users only
              if (m.userId && m.userId !== userId) {
                maybeNotify({ className, from: m.name || "Someone", text: String(m.text || "") });
                if (document.hidden) playSound("receive");
              }
            }
            if (ch.type === "removed") {
              // simplest: re-render if deletions happen (rare)
              didInit = false;
            }
          });

          if (stick) messagesDiv.scrollTop = messagesDiv.scrollHeight;
        })
    );

    // Typing (single doc, throttled)
    const typingIndicator = $("typingIndicator");
    const msgInput = $("msgInput");
    let typingTimeout = null;
    let typingDebounce = null;
    let localTyping = false;

    async function setTyping(val) {
      if (localTyping === val) return;
      localTyping = val;
      try {
        await typingDoc(classId).set({ [userId]: !!val }, { merge: true });
      } catch { }
    }

    // show animated typing bubble for others
    addUnsub(
      typingDoc(classId).onSnapshot((doc) => {
        if (!typingIndicator) return;
        if (!doc.exists) {
          typingIndicator.innerHTML = "";
          return;
        }
        const data = doc.data() || {};
        const others = Object.entries(data).filter(([id, v]) => id !== userId && v === true);
        if (others.length > 0) {
          ensureEnhancedStylesOnce();
          typingIndicator.innerHTML = `<span class="typing-bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span><span class="muted" style="margin-left:8px">Someone is typing…</span>`;
        } else {
          typingIndicator.innerHTML = "";
        }
      })
    );

    if (msgInput) {
      msgInput.oninput = () => {
        if (typingDebounce) clearTimeout(typingDebounce);
        typingDebounce = setTimeout(() => setTyping(true), 180);

        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => setTyping(false), 1400);
      };
    }

    // Enter-to-send (Shift+Enter newline)
    const sendBtn = $("sendBtn");
    if (msgInput && sendBtn) {
      msgInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendBtn.click();
        }
      });
    }

    // Send message
    if (sendBtn && msgInput) {
      sendBtn.onclick = async () => {
        const text = String(msgInput.value || "").trim();
        if (!text) return;

        if (chatLocked) {
          setText("chatStatus", "Chat is locked by admin.");
          playSound("deny");
          return;
        }

        sendBtn.disabled = true;
        try {
          const b = await bannedRef(classId, userId).get();
          if (b.exists) {
            setText("chatStatus", "You are banned.");
            return;
          }

          await messagesCol(classId).add({
            userId,
            name,
            text,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          });

          msgInput.value = "";
          setText("chatStatus", "");
          playSound("send");
          try {
            setTyping(false);
          } catch { }
        } catch {
          setText("chatStatus", "Failed to send.");
        } finally {
          sendBtn.disabled = false;
        }
      };
    }

    // Ask notification permission once (won’t spam)
    requestNotificationPermissionOnce();
  }

  // =========================
  // Boot / restore
  // =========================
  function boot() {
    const st = getSettings();
    applyTheme(st.theme);
    setSoundEnabled(st.sound);

    if (savedClassId && savedUserId && savedUserName) {
      selectedClassId = savedClassId;
      selectedClassName = savedClassName || savedClassId;
      showScreen("wait");
      setText("waitStatus", "Reconnecting…");
      watchStatus({ classId: savedClassId, userId: savedUserId, name: savedUserName });
    } else {
      showScreen("class");
      loadClasses();
    }
  }

  boot();
});