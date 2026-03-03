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

  // Extra legacy full-screen nodes that might still exist (from older versions / CSS)
  const legacyFullScreens = ["name-screen", "waiting-screen", "chat-screen"];

  function hardHideEl(el) {
    if (!el) return;
    el.classList.remove("active");
    el.style.display = "none";
    el.style.opacity = "0";
    el.style.pointerEvents = "none";
    el.style.visibility = "hidden";
  }

  function hardShowEl(el) {
    if (!el) return;
    el.classList.add("active");
    el.style.display = "block";
    el.style.opacity = "1";
    el.style.pointerEvents = "auto";
    el.style.visibility = "visible";
  }

  // IMPORTANT: Always ensure only ONE main screen can exist/click at once
  function showScreen(key) {
    // Hide all known screens
    Object.values(screens).forEach((el) => hardHideEl(el));

    // Also hide any old full-screen elements that can overlay and block clicks
    legacyFullScreens.forEach((id) => {
      const el = $(id);
      if (id === "chat-screen") return;
      if (el) hardHideEl(el);
    });

    // Show the target screen
    hardShowEl(screens[key]);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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

  // ===== RULES GATE (NEW) =====
  function rulesKey(classId, userId) {
    return `rulesAccepted:${classId}:${userId}`;
  }

  function hasAcceptedRules(classId, userId) {
    return localStorage.getItem(rulesKey(classId, userId)) === "true";
  }

  function setAcceptedRules(classId, userId) {
    localStorage.setItem(rulesKey(classId, userId), "true");
  }

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

  // ===== state =====
  let selectedClassId = null;
  let selectedClassName = null;

  // ===== restore session on refresh =====
  const savedClassId = localStorage.getItem("classId");
  const savedUserId = localStorage.getItem("userId");
  const savedUserName = localStorage.getItem("userName");
  const savedClassName = localStorage.getItem("className");

  if (savedClassId && savedUserId && savedUserName) {
    selectedClassId = savedClassId;
    selectedClassName = savedClassName || savedClassId;
    restoreFlow(savedClassId, savedUserId, savedUserName);
  } else {
    loadClasses();
    showScreen("class");
  }

  // ===== UI events =====
  const pinBackBtn = $("pinBackBtn");
  if (pinBackBtn) {
    pinBackBtn.onclick = () => {
      $("pinInput").value = "";
      $("pinError").textContent = "";
      showScreen("class");
    };
  }

  const nameBackBtn = $("nameBackBtn");
  if (nameBackBtn) {
    nameBackBtn.onclick = () => {
      $("nameInput").value = "";
      $("nameError").textContent = "";
      showScreen("pin");
    };
  }

  const resetBtn = $("resetBtn");
  if (resetBtn) {
    resetBtn.onclick = () => {
      clearLS();
      location.reload();
    };
  }

  const logoutBtn = $("logoutBtn");
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      clearLS();
      location.reload();
    };
  }

  // ===== 1) Load classes dynamically =====
  function loadClasses() {
    const classesWrap = $("classes");
    const err = $("classError");
    if (!classesWrap) return;

    classesWrap.innerHTML = "Loading classes...";
    if (err) err.textContent = "";

    db.collection("classes")
      .get()
      .then((snap) => {
        classesWrap.innerHTML = "";
        if (snap.empty) {
          if (err) err.textContent = "No classes found in Firestore (collection must be named 'classes').";
          return;
        }

        snap.forEach((doc) => {
          const data = doc.data() || {};
          const btn = document.createElement("button");
          btn.className = "class-btn";
          btn.type = "button";
          btn.textContent = data.name || doc.id;

          btn.onclick = () => {
            selectedClassId = doc.id;
            selectedClassName = data.name || doc.id;

            const pinClassName = $("pinClassName");
            if (pinClassName) pinClassName.textContent = selectedClassName;

            $("pinError").textContent = "";
            $("pinInput").value = "";
            showScreen("pin");
          };

          classesWrap.appendChild(btn);
        });
      })
      .catch((e) => {
        if (err) err.textContent = "Failed to load classes. Check Firestore rules + config.";
        console.error(e);
      });
  }

  // ===== 2) PIN verify =====
  const pinContinueBtn = $("pinContinueBtn");
  if (pinContinueBtn) {
    pinContinueBtn.onclick = async () => {
      const pin = $("pinInput").value.trim();
      if (!selectedClassId) {
        $("pinError").textContent = "No class selected.";
        return;
      }
      if (!pin) {
        $("pinError").textContent = "Enter a PIN.";
        return;
      }

      try {
        const clsDoc = await classDocRef(selectedClassId).get();
        if (!clsDoc.exists) {
          $("pinError").textContent = "Class not found.";
          return;
        }
        const data = clsDoc.data() || {};
        if (String(data.pin || "") !== pin) {
          $("pinError").textContent = "Wrong PIN!";
          return;
        }

        $("pinError").textContent = "";
        $("nameError").textContent = "";
        $("nameInput").value = "";
        showScreen("name");
      } catch (e) {
        console.error(e);
        $("pinError").textContent = "PIN check failed. Check Firestore rules.";
      }
    };
  }

  // ===== 3) Create pending user =====
  const nameContinueBtn = $("nameContinueBtn");
  if (nameContinueBtn) {
    nameContinueBtn.onclick = async () => {
      const name = $("nameInput").value.trim();
      if (!selectedClassId) {
        $("nameError").textContent = "No class selected.";
        return;
      }
      if (!name) {
        $("nameError").textContent = "Enter a name.";
        return;
      }

      const userId = "u_" + Math.random().toString(36).slice(2) + Date.now().toString(36);

      try {
        const bannedDoc = await bannedRef(selectedClassId, userId).get();
        if (bannedDoc.exists) {
          showDenied("You are banned from this class.");
          return;
        }

        await pendingRef(selectedClassId, userId).set({
          name,
          userId,
          classId: selectedClassId,
          className: selectedClassName || selectedClassId,
          status: "pending",
          approved: false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });

        setLS({
          classId: selectedClassId,
          className: selectedClassName || selectedClassId,
          userId,
          userName: name,
        });

        showWaiting(name, selectedClassId);
        watchStatus(selectedClassId, userId, name);
      } catch (e) {
        console.error(e);
        $("nameError").textContent = "Failed to submit. Check Firestore rules.";
      }
    };
  }

  // ===== waiting screen =====
  function showWaiting(name, classId) {
    const waitText = $("waitText");
    const waitStatus = $("waitStatus");

    if (waitText) waitText.textContent = `${name}, you requested access to ${selectedClassName || classId}.`;
    if (waitStatus) {
      waitStatus.textContent = "";
      waitStatus.className = "notice";
    }

    showScreen("wait");
  }

  function showDenied(msg) {
    const waitText = $("waitText");
    const waitStatus = $("waitStatus");

    if (waitText) waitText.textContent = "Access blocked.";
    if (waitStatus) {
      waitStatus.textContent = msg;
      waitStatus.className = "notice bad";
    }

    showScreen("wait");
  }

  // ===== restore =====
  async function restoreFlow(classId, userId, name) {
    try {
      const banDoc = await bannedRef(classId, userId).get();
      if (banDoc.exists) {
        showDenied("You are banned from this class.");
        return;
      }

      const pDoc = await pendingRef(classId, userId).get();
      if (!pDoc.exists) {
        clearLS();
        loadClasses();
        showScreen("class");
        return;
      }

      const data = pDoc.data() || {};
      const status = data.status || (data.approved ? "approved" : "pending");

      if (status === "approved") {
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
        showDenied("You are banned from this class.");
      } else {
        showWaiting(name, classId);
        watchStatus(classId, userId, name);
      }
    } catch (e) {
      console.error(e);
      showWaiting(name, classId);
      watchStatus(classId, userId, name);
    }
  }

  // ===== status watcher =====
  function watchStatus(classId, userId, name) {
    pendingRef(classId, userId).onSnapshot((doc) => {
      if (!doc.exists) {
        showDenied("Your request was removed (denied).");
        return;
      }

      const data = doc.data() || {};
      const status = data.status || (data.approved ? "approved" : "pending");

      if (status === "approved") {
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
        showDenied("You are banned from this class.");
      } else {
        const waitStatus = $("waitStatus");
        if (waitStatus) {
          waitStatus.textContent = "Pending approval...";
          waitStatus.className = "notice warn";
        }
      }
    });

    bannedRef(classId, userId).onSnapshot((doc) => {
      if (doc.exists) showDenied("You are banned from this class.");
    });
  }

  // ===== CHAT (OPTIMIZED RENDERING) =====
  let chatUnsubs = [];
  function clearChatListeners() {
    chatUnsubs.forEach((u) => {
      try { u(); } catch {}
    });
    chatUnsubs = [];
  }

  function isNearBottom(el, thresholdPx = 120) {
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < thresholdPx;
  }

  function fmtTime(ts) {
    return ts && ts.toDate
      ? ts.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "Sending...";
  }

  function buildMsgEl({ docId, name, userId, text, time, isOwn }) {
    const wrap = document.createElement("div");
    wrap.className = `msg ${isOwn ? "own" : ""}`;
    wrap.dataset.id = docId;

    wrap.innerHTML = `
      <div class="msg-top">
        <strong>${escapeHtml(name || "")}</strong>
        <span class="msg-time">${escapeHtml(time || "")}</span>
      </div>
      <div class="msg-text">${escapeHtml(text || "")}</div>
      <div class="msg-actions">
        <button class="reply-btn" data-id="${docId}" data-text="${encodeURIComponent(text || "")}">Reply</button>
        <button class="view-replies-btn" data-id="${docId}" data-text="${encodeURIComponent(text || "")}">View replies</button>
        ${isOwn ? `<button class="delete-btn" data-id="${docId}" data-parent="null">Delete</button>` : ""}
      </div>
    `;
    return wrap;
  }

  function updateMsgEl(el, { name, text, time, isOwn }) {
    if (!el) return;

    // class own/non-own
    el.className = `msg ${isOwn ? "own" : ""}`;

    const strong = el.querySelector(".msg-top strong");
    if (strong) strong.textContent = name || "";

    const t = el.querySelector(".msg-time");
    if (t) t.textContent = time || "";

    const txt = el.querySelector(".msg-text");
    if (txt) txt.innerHTML = escapeHtml(text || "");

    // update action buttons dataset text
    const replyBtn = el.querySelector(".reply-btn");
    const viewBtn = el.querySelector(".view-replies-btn");
    if (replyBtn) replyBtn.dataset.text = encodeURIComponent(text || "");
    if (viewBtn) viewBtn.dataset.text = encodeURIComponent(text || "");

    // ensure delete button exists only if own
    const actions = el.querySelector(".msg-actions");
    if (actions) {
      const del = actions.querySelector(".delete-btn");
      if (isOwn && !del) {
        const b = document.createElement("button");
        b.className = "delete-btn";
        b.dataset.id = el.dataset.id;
        b.dataset.parent = "null";
        b.textContent = "Delete";
        actions.appendChild(b);
      }
      if (!isOwn && del) del.remove();
    }
  }

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
    const themeToggle = $("themeToggle");

    // theme toggle
    if (themeToggle) {
      themeToggle.onclick = () => {
        const screen = $("chat-screen");
        if (!screen) return;
        const isDay = screen.classList.contains("day");
        if (isDay) {
          screen.classList.remove("day");
          screen.classList.add("night");
          themeToggle.textContent = "🌙";
        } else {
          screen.classList.remove("night");
          screen.classList.add("day");
          themeToggle.textContent = "☀️";
        }
      };
    }

    // announcements (per-class) - small list, OK to re-render
    chatUnsubs.push(
      announcementsCol(classId)
        .orderBy("timestamp", "asc")
        .onSnapshot((snap) => {
          const box = $("announcementsList");
          if (!box) return;
          box.innerHTML = "";
          snap.forEach((doc) => {
            const a = doc.data() || {};
            const t = fmtTime(a.timestamp);
            const div = document.createElement("div");
            div.innerHTML = `<div style="margin:6px 0;"><strong>[${escapeHtml(t)}]</strong> ${escapeHtml(a.text || "")}</div>`;
            box.appendChild(div);
          });
          if (snap.empty) box.innerHTML = "<div style='opacity:.7;margin-top:6px;'>No announcements.</div>";
        })
    );

    // typing indicator (per-class) - debounce + state-aware writes
    let typingTimeout = null;
    let typingDebounce = null;
    let localTyping = false;

    async function setTyping(val) {
      if (localTyping === val) return; // avoid spamming
      localTyping = val;
      try {
        await typingDoc(classId).set({ [userId]: val }, { merge: true });
      } catch {}
    }

    if (msgInput) {
      msgInput.oninput = () => {
        // debounce the "true" write
        if (typingDebounce) clearTimeout(typingDebounce);
        typingDebounce = setTimeout(() => {
          setTyping(true);
        }, 220);

        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
          setTyping(false);
        }, 1500);
      };
    }

    // best-effort cleanup
    window.addEventListener("beforeunload", () => {
      try {
        typingDoc(classId).set({ [userId]: false }, { merge: true });
      } catch {}
    });

    chatUnsubs.push(
      typingDoc(classId).onSnapshot((doc) => {
        if (!typingDiv) return;
        if (!doc.exists) {
          typingDiv.textContent = "";
          return;
        }
        const data = doc.data() || {};
        const othersTyping = Object.entries(data).some(([id, val]) => id !== userId && val === true);
        typingDiv.textContent = othersTyping ? "Someone is typing..." : "";
      })
    );

    // send message (MAIN)
    if (sendBtn && msgInput) {
      sendBtn.onclick = async () => {
        const text = msgInput.value.trim();
        if (!text) return;

        const banDoc = await bannedRef(classId, userId).get();
        if (banDoc.exists) {
          if (chatStatus) {
            chatStatus.textContent = "You are banned.";
            chatStatus.className = "notice bad";
          }
          return;
        }

        const pDoc = await pendingRef(classId, userId).get();
        const st = pDoc.exists ? (pDoc.data().status || (pDoc.data().approved ? "approved" : "pending")) : "missing";
        if (st !== "approved") {
          if (chatStatus) {
            chatStatus.textContent = st === "rejected" ? "You were rejected." : "You are not approved.";
            chatStatus.className = "notice bad";
          }
          return;
        }

        try {
          await messagesCol(classId).add({
            name,
            userId,
            text,
            replyTo: null,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          });
        } catch (e) {
          console.error(e);
          if (chatStatus) {
            chatStatus.textContent = "Failed to send (check rules/quota).";
            chatStatus.className = "notice bad";
          }
          return;
        }

        msgInput.value = "";
        setTyping(false);
      };
    }

    // ===== LIVE MESSAGES (OPTIMIZED: docChanges, no full re-render) =====
    const msgEls = new Map(); // docId -> element

    function clearAllMessages() {
      msgEls.clear();
      if (messagesDiv) messagesDiv.innerHTML = "";
    }

    clearAllMessages();

    chatUnsubs.push(
      messagesCol(classId)
        .orderBy("timestamp", "asc")
        .onSnapshot(
          (snap) => {
            if (!messagesDiv) return;

            const shouldStick = isNearBottom(messagesDiv, 160);

            const frag = document.createDocumentFragment();

            snap.docChanges().forEach((ch) => {
              const doc = ch.doc;
              const m = doc.data() || {};

              // Only main messages
              if (m.replyTo !== null) return;

              const docId = doc.id;

              if (ch.type === "removed") {
                const el = msgEls.get(docId);
                if (el && el.parentNode) el.parentNode.removeChild(el);
                msgEls.delete(docId);
                return;
              }

              const isOwn = m.userId === userId;
              const time = fmtTime(m.timestamp);

              if (ch.type === "added") {
                // create + append in order
                const el = buildMsgEl({
                  docId,
                  name: m.name || "",
                  userId: m.userId || "",
                  text: m.text || "",
                  time,
                  isOwn,
                });
                msgEls.set(docId, el);
                frag.appendChild(el);
              }

              if (ch.type === "modified") {
                const el = msgEls.get(docId);
                if (el) {
                  updateMsgEl(el, {
                    name: m.name || "",
                    text: m.text || "",
                    time,
                    isOwn,
                  });
                }
              }
            });

            // Append any newly added nodes in one paint
            if (frag.childNodes.length) messagesDiv.appendChild(frag);

            if (shouldStick) {
              messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
          },
          (err) => {
            console.error("Messages listener error:", err);
            if (chatStatus) {
              chatStatus.textContent = "Chat stream error (check quota/rules).";
              chatStatus.className = "notice bad";
            }
          }
        )
    );
  }

  // ===== Replies panel (per-class) =====
  function openReplies(parentId, parentText) {
    const classId = localStorage.getItem("classId");
    const userId = localStorage.getItem("userId");
    const name = localStorage.getItem("userName");

    const panel = $("replies-panel");
    const title = $("replies-title");
    const list = $("replies-list");
    const sendReplyBtn = $("sendReplyBtn");
    const replyInput = $("replyMsgInput");

    if (!panel) return;

    panel.classList.remove("hidden");
    title.textContent = `Replies to: "${decodeURIComponent(parentText).slice(0, 40)}"`;

    const unsub = messagesCol(classId)
      .orderBy("timestamp", "asc")
      .onSnapshot((snap) => {
        if (!list) return;

        const stick = isNearBottom(list, 120);
        list.innerHTML = "";

        snap.forEach((doc) => {
          const m = doc.data() || {};
          if (m.replyTo !== parentId) return;

          const isOwn = m.userId === userId;
          const time = fmtTime(m.timestamp);

          list.innerHTML += `
            <div class="reply-msg ${isOwn ? "own" : ""}" data-id="${doc.id}">
              <div class="msg-top">
                <strong>${escapeHtml(m.name || "")}</strong>
                <span class="msg-time">${escapeHtml(time)}</span>
              </div>
              <div class="msg-text">${escapeHtml(m.text || "")}</div>
              <div class="msg-actions">
                ${isOwn ? `<button class="delete-btn" data-id="${doc.id}" data-parent="${parentId}">Delete</button>` : ""}
              </div>
            </div>
          `;
        });

        if (stick) list.scrollTop = list.scrollHeight;
      });

    if (sendReplyBtn) {
      sendReplyBtn.onclick = async () => {
        const text = replyInput.value.trim();
        if (!text) return;

        const pDoc = await pendingRef(classId, userId).get();
        const st = pDoc.exists ? (pDoc.data().status || (pDoc.data().approved ? "approved" : "pending")) : "missing";
        if (st !== "approved") return;

        await messagesCol(classId).add({
          name,
          userId,
          text,
          replyTo: parentId,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });

        replyInput.value = "";
      };
    }

    panel._unsubReplies = unsub;
  }

  function closeReplies() {
    const panel = $("replies-panel");
    if (!panel) return;
    panel.classList.add("hidden");
    if (panel._unsubReplies) {
      try { panel._unsubReplies(); } catch {}
      panel._unsubReplies = null;
    }
  }

  // ===== Delete =====
  async function deleteMessage(messageId, parentId) {
    const classId = localStorage.getItem("classId");
    await messagesCol(classId).doc(messageId).delete();

    if (parentId === "null") {
      const snap = await messagesCol(classId).get();
      const batch = db.batch();
      snap.forEach((d) => {
        const m = d.data() || {};
        if (m.replyTo === messageId) batch.delete(d.ref);
      });
      await batch.commit();
    }
  }

  // ===== global click handler =====
  document.addEventListener("click", (e) => {
    const t = e.target;

    if (t && t.id === "closeReplies") closeReplies();

    if (t && t.classList && (t.classList.contains("reply-btn") || t.classList.contains("view-replies-btn"))) {
      const parentId = t.dataset.id;
      const parentText = t.dataset.text || "";
      openReplies(parentId, parentText);
    }

    if (t && t.classList && t.classList.contains("delete-btn")) {
      const id = t.dataset.id;
      const parent = t.dataset.parent;
      deleteMessage(id, parent);
    }
  });
});

/* =============================
   SecureText V5 UX Pack (SAFE)
   - Scroll-to-bottom + new-msg counter
   - New message highlight
   - Reply drawer preview + jump to original
   - Toasts + HUD
   - Anti-spam v2 (client-only) via input sanitizer + local cooldown on repeated blocks
   - Presence/typing smarter when tab hidden (no extra reads)
   - Expanded Settings (keeps existing behavior; adds toggles)
   NOTE: Does not change Firestore schema.
   ============================= */

(function () {
  const $ = (id) => document.getElementById(id);
  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- Settings store (adds new toggles; keeps existing theme/sound if present) ----
  const SETTINGS_KEY = "st_settings_v5";
  const DEFAULTS = {
    sound: true,
    theme: "night",
    showHUD: true,
    showToasts: true,
    showScrollBtn: true,
    highlightNew: true,
    showOnline: true,
    typingEnabled: true,
    presenceEnabled: true,
    fxChatBursts: false,       // keep chat light by default
    spamStrict: "normal",      // "normal" | "strict"
  };

  function getSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return { ...DEFAULTS };
      const p = JSON.parse(raw);
      return { ...DEFAULTS, ...p };
    } catch {
      return { ...DEFAULTS };
    }
  }
  function setSettings(next) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
  }

  // Try to sync from older settings keys if present
  (function migrate() {
    const st = getSettings();
    const legacyKey = "st_settings_v2";
    try {
      const raw = localStorage.getItem(legacyKey);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && typeof p === "object") {
          if (typeof p.sound === "boolean") st.sound = p.sound;
          if (p.theme === "day" || p.theme === "night") st.theme = p.theme;
          setSettings(st);
        }
      }
    } catch {}
  })();

  // ---- Toasts ----
  function ensureToasts() {
    if ($("stToastContainer")) return;
    const d = document.createElement("div");
    d.id = "stToastContainer";
    d.className = "st-toast-container";
    document.body.appendChild(d);
  }
  function toast(msg, kind="info") {
    const st = getSettings();
    if (!st.showToasts) return;
    ensureToasts();
    const c = $("stToastContainer");
    if (!c) return;
    const el = document.createElement("div");
    el.className = `st-toast ${kind}`;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(() => el.classList.add("out"), 2800);
    setTimeout(() => { try { el.remove(); } catch {} }, 3150);
  }

  // ---- HUD (Chat header) ----
  function ensureHUD() {
    const st = getSettings();
    const header = document.querySelector(".chat-header");
    if (!header) return;
    let hud = $("stHud");
    if (!st.showHUD) { if (hud) hud.remove(); return; }
    if (hud) return;

    hud = document.createElement("div");
    hud.id = "stHud";
    hud.className = "st-hud";
    hud.innerHTML = `
      <div class="hud-left">
        <div class="hud-badge"><span class="dot"></span><span class="txt">SecureText</span></div>
        <div class="hud-chip" id="stHudClock">--:--</div>
        <div class="hud-chip" id="stHudOnline">• 0 online</div>
      </div>
      <div class="hud-right">
        <div class="hud-chip hud-soft" id="stHudState">LIVE</div>
      </div>
    `;
    header.style.position = "relative";
    header.appendChild(hud);

    const updateClock = () => {
      const el = $("stHudClock");
      if (!el) return;
      const now = new Date();
      el.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };
    updateClock();
    setInterval(updateClock, 30000);
  }

  function syncOnlineToHUD() {
    const st = getSettings();
    const hudOnline = $("stHudOnline");
    if (!hudOnline || !st.showOnline) return;
    const badge = $("onlineBadge");
    if (badge) hudOnline.textContent = badge.textContent || "• 0 online";
  }

  // ---- Scroll-to-bottom button + new message counter ----
  let unseenCount = 0;
  function ensureScrollBtn() {
    const st = getSettings();
    let btn = $("stScrollBtn");
    if (!st.showScrollBtn) { if (btn) btn.remove(); return; }
    if (btn) return btn;
    btn = document.createElement("button");
    btn.id = "stScrollBtn";
    btn.type = "button";
    btn.className = "st-scroll-btn hidden";
    btn.innerHTML = `<span class="arr">↓</span><span class="txt">New</span><span id="stUnseen" class="count">0</span>`;
    document.body.appendChild(btn);
    btn.onclick = () => {
      const box = $("messages");
      if (!box) return;
      box.scrollTop = box.scrollHeight;
      unseenCount = 0;
      const c = $("stUnseen");
      if (c) c.textContent = "0";
      btn.classList.add("hidden");
    };
    return btn;
  }

  function isNearBottom(el, threshold=160) {
    return (el.scrollHeight - el.scrollTop - el.clientHeight) < threshold;
  }

  function hookScrollBox() {
    const box = $("messages");
    if (!box) return;
    const btn = ensureScrollBtn();
    if (!btn) return;

    box.addEventListener("scroll", () => {
      if (isNearBottom(box)) {
        unseenCount = 0;
        const c = $("stUnseen");
        if (c) c.textContent = "0";
        btn.classList.add("hidden");
      }
    }, { passive: true });
  }

  // ---- New message highlight + auto-scroll behavior without yanking user ----
  function hookNewMessages() {
    const box = $("messages");
    if (!box) return;

    const st = getSettings();
    const btn = ensureScrollBtn();

    const mo = new MutationObserver((mut) => {
      const boxNow = $("messages");
      if (!boxNow) return;
      const near = isNearBottom(boxNow);

      for (const m of mut) {
        for (const node of m.addedNodes || []) {
          if (!(node instanceof HTMLElement)) continue;
          if (!node.classList.contains("msg")) continue;

          // Highlight new message
          if (getSettings().highlightNew && !prefersReduced) {
            node.classList.add("st-new-msg");
            setTimeout(() => { try { node.classList.remove("st-new-msg"); } catch {} }, 1400);
          }

          // If user is not near bottom, increment unseen and show button
          if (!near) {
            unseenCount++;
            if (btn) {
              const c = $("stUnseen");
              if (c) c.textContent = String(unseenCount);
              btn.classList.remove("hidden");
            }
          }
        }
      }

      // smooth stick-to-bottom only if already near bottom
      if (near) {
        boxNow.scrollTop = boxNow.scrollHeight;
      }
    });

    mo.observe(box, { childList: true });
  }

  // ---- Reply drawer: preview parent message + jump to original ----
  function addReplyPreviewIfOpen() {
    const panel = $("repliesPanel");
    if (!panel || panel.classList.contains("hidden")) return;

    // Add preview container if missing
    let pv = panel.querySelector(".reply-preview");
    if (!pv) {
      pv = document.createElement("div");
      pv.className = "reply-preview";
      pv.innerHTML = `
        <div class="pv-top">
          <div class="pv-title">Replying to</div>
          <button type="button" id="stJumpToParent" class="pv-jump">Jump</button>
        </div>
        <div id="stParentSnippet" class="pv-snippet"></div>
      `;
      const header = panel.querySelector(".replies-header");
      if (header && header.nextSibling) panel.insertBefore(pv, header.nextSibling);
    }

    // Determine active reply target from title text: we can’t access internal var, so best-effort:
    // Use the last clicked message marked via dataset by our delegation below.
    const parentId = panel.dataset.parentid;
    if (!parentId) return;

    const parentEl = document.getElementById("msg_" + parentId) || document.querySelector(`.msg[data-id="${parentId}"]`);
    const snip = $("stParentSnippet");
    if (snip && parentEl) {
      const nameEl = parentEl.querySelector(".msg-top strong");
      const txtEl = parentEl.querySelector(".msg-text");
      const nm = nameEl ? nameEl.textContent : "User";
      const tx = txtEl ? txtEl.textContent : "";
      snip.textContent = `${nm}: ${tx}`;
    }

    const jump = $("stJumpToParent");
    if (jump) {
      jump.onclick = () => {
        const box = $("messages");
        const target = document.getElementById("msg_" + parentId);
        if (!box || !target) return;
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.add("st-jump-flash");
        setTimeout(() => { try { target.classList.remove("st-jump-flash"); } catch {} }, 900);
      };
    }
  }

  // Mark replies panel parent id when you click reply
  function hookReplyClicks() {
    const box = $("messages");
    if (!box) return;
    box.addEventListener("click", (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const btn = t.closest(".msg-btn.msg-reply");
      if (!btn) return;
      const msgEl = t.closest(".msg");
      if (!msgEl) return;
      const pid = msgEl.dataset.id || "";
      const panel = $("repliesPanel");
      if (panel && pid) panel.dataset.parentid = pid;
      setTimeout(addReplyPreviewIfOpen, 50);
      toast("↩ Reply mode", "info");
    });
  }

  // ---- Anti-spam v2 (extra sanitization + temporary local mute after repeated blocks) ----
  let blockedCount = 0;
  let localMuteUntil = 0;

  function sanitizeText(raw) {
    let t = String(raw ?? "");
    // remove zero-width / invisibles
    t = t.replace(/[\u200B-\u200D\uFEFF]/g, "");
    // strip control chars except newline/tab
    t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
    // collapse mega whitespace
    t = t.replace(/\s{3,}/g, "  ");
    // trim
    t = t.trim();

    // strict mode: block crazy repetition
    const st = getSettings();
    if (st.spamStrict === "strict") {
      // compress repeated characters (aaaaaa -> aaaa)
      t = t.replace(/(.)\1{8,}/g, "$1$1$1$1");
    }
    return t;
  }

  function hookSendButton() {
    const sendBtn = $("sendBtn");
    const input = $("msgInput");
    if (!sendBtn || !input) return;

    // Wrap existing onclick without breaking
    const prev = sendBtn.onclick;
    sendBtn.onclick = async () => {
      const now = Date.now();
      if (now < localMuteUntil) {
        toast("Muted for a moment (spam).", "warn");
        return;
      }

      // sanitize in-place before existing logic runs
      const clean = sanitizeText(input.value);
      input.value = clean;

      try {
        const res = prev && prev.call(sendBtn);
        // if promise, await but don't require
        if (res && typeof res.then === "function") await res;
        // success pulse
        if (clean) toast("Sent", "good");
      } catch (e) {
        // spam blocks usually do not throw; but if it fails, toast
        toast("Send blocked / failed", "warn");
      }
    };

    // If we detect repeated "Slow down" etc via status text, apply local mute
    const status = $("chatStatus");
    if (status) {
      const mo = new MutationObserver(() => {
        const txt = (status.textContent || "").toLowerCase();
        if (txt.includes("slow down") || txt.includes("duplicate")) {
          blockedCount++;
          if (blockedCount >= 3) {
            localMuteUntil = Date.now() + 9000;
            blockedCount = 0;
            toast("Temporarily muted (spam).", "warn");
          }
        }
      });
      mo.observe(status, { childList: true, subtree: true, characterData: true });
    }
  }

  // ---- Settings button + modal with toggles ----
  function ensureSettingsButton() {
    const controls = document.querySelector(".chat-controls");
    if (!controls) return;
    if ($("settingsBtn")) return;

    const btn = document.createElement("button");
    btn.id = "settingsBtn";
    btn.type = "button";
    btn.title = "Settings";
    btn.textContent = "⚙️";
    controls.insertBefore(btn, controls.firstChild);
    btn.onclick = openSettings;
  }

  function openSettings() {
    let st = getSettings();

    let ov = $("stSettingsOverlay");
    if (ov) ov.remove();

    ov = document.createElement("div");
    ov.id = "stSettingsOverlay";
    ov.className = "st-overlay";
    ov.innerHTML = `
      <div class="st-modal">
        <div class="st-modal-top">
          <div class="st-modal-title">Settings</div>
          <button id="stClose" class="st-icon-btn" type="button">✕</button>
        </div>
        <div class="st-modal-body">
          <div class="st-setting-row">
            <div><div class="st-setting-name">Theme</div><div class="st-setting-desc">Day / Night</div></div>
            <button id="stTheme" class="st-pill-btn" type="button"></button>
          </div>

          <div class="st-setting-row">
            <div><div class="st-setting-name">Sounds</div><div class="st-setting-desc">Send / receive effects</div></div>
            <button id="stSound" class="st-pill-btn" type="button"></button>
          </div>

          <div class="st-divider"></div>

          <div class="st-setting-row">
            <div><div class="st-setting-name">HUD</div><div class="st-setting-desc">Clock + online + status</div></div>
            <button id="stHudT" class="st-pill-btn" type="button"></button>
          </div>

          <div class="st-setting-row">
            <div><div class="st-setting-name">Toasts</div><div class="st-setting-desc">Pop-up notifications</div></div>
            <button id="stToastT" class="st-pill-btn" type="button"></button>
          </div>

          <div class="st-setting-row">
            <div><div class="st-setting-name">New message highlight</div><div class="st-setting-desc">Glow on new messages</div></div>
            <button id="stHiT" class="st-pill-btn" type="button"></button>
          </div>

          <div class="st-setting-row">
            <div><div class="st-setting-name">Scroll button</div><div class="st-setting-desc">New message counter</div></div>
            <button id="stScrollT" class="st-pill-btn" type="button"></button>
          </div>

          <div class="st-divider"></div>

          <div class="st-setting-row">
            <div><div class="st-setting-name">Typing</div><div class="st-setting-desc">Show typing indicator</div></div>
            <button id="stTypeT" class="st-pill-btn" type="button"></button>
          </div>

          <div class="st-setting-row">
            <div><div class="st-setting-name">Online counter</div><div class="st-setting-desc">Show online count</div></div>
            <button id="stOnT" class="st-pill-btn" type="button"></button>
          </div>

          <div class="st-setting-row">
            <div><div class="st-setting-name">Spam strictness</div><div class="st-setting-desc">Normal / Strict</div></div>
            <button id="stSpam" class="st-pill-btn" type="button"></button>
          </div>

          <div class="st-divider"></div>
          <div class="st-setting-desc">Tip: heavy visuals are automatically minimized in chat to avoid lag.</div>
        </div>
      </div>
    `;
    document.body.appendChild(ov);

    const render = () => {
      const theme = $("stTheme");
      const sound = $("stSound");
      const hud = $("stHudT");
      const to = $("stToastT");
      const hi = $("stHiT");
      const sc = $("stScrollT");
      const ty = $("stTypeT");
      const on = $("stOnT");
      const sp = $("stSpam");

      if (theme) theme.textContent = st.theme === "day" ? "☀️ Day" : "🌙 Night";
      if (sound) sound.textContent = st.sound ? "🔊 On" : "🔇 Off";
      if (hud) hud.textContent = st.showHUD ? "On" : "Off";
      if (to) to.textContent = st.showToasts ? "On" : "Off";
      if (hi) hi.textContent = st.highlightNew ? "On" : "Off";
      if (sc) sc.textContent = st.showScrollBtn ? "On" : "Off";
      if (ty) ty.textContent = st.typingEnabled ? "On" : "Off";
      if (on) on.textContent = st.showOnline ? "On" : "Off";
      if (sp) sp.textContent = st.spamStrict === "strict" ? "Strict" : "Normal";
    };
    render();

    const bind = (id, fn) => {
      const el = $(id);
      if (!el) return;
      el.onclick = () => { fn(); setSettings(st); render(); applyLive(); };
    };

    bind("stTheme", () => st.theme = st.theme === "day" ? "night" : "day");
    bind("stSound", () => st.sound = !st.sound);
    bind("stHudT", () => st.showHUD = !st.showHUD);
    bind("stToastT", () => st.showToasts = !st.showToasts);
    bind("stHiT", () => st.highlightNew = !st.highlightNew);
    bind("stScrollT", () => st.showScrollBtn = !st.showScrollBtn);
    bind("stTypeT", () => st.typingEnabled = !st.typingEnabled);
    bind("stOnT", () => st.showOnline = !st.showOnline);
    bind("stSpam", () => st.spamStrict = (st.spamStrict === "strict" ? "normal" : "strict"));

    const close = () => { try { ov.remove(); } catch {} };
    const c = $("stClose"); if (c) c.onclick = close;
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    window.addEventListener("keydown", function esc(e){ if(e.key==="Escape"){ window.removeEventListener("keydown", esc); close(); }});
  }

  // Apply settings live to the UI + best-effort sync to existing sound/theme mechanisms
  function applyLive() {
    const st = getSettings();

    // Theme: click existing theme toggle if needed
    const cs = $("chat-screen");
    if (cs) {
      cs.classList.remove("day","night");
      cs.classList.add(st.theme === "day" ? "day" : "night");
    }

    // Online badge visibility
    const badge = $("onlineBadge");
    if (badge) badge.style.display = st.showOnline ? "" : "none";

    // Typing indicator visibility
    const typ = $("typingIndicator");
    if (typ) typ.style.display = st.typingEnabled ? "" : "none";

    ensureHUD();
    syncOnlineToHUD();

    // Scroll button state
    ensureScrollBtn();

    // If there is an audio toggle in the app, we can’t directly access it.
    // But we can store v2 key for compatibility:
    try {
      localStorage.setItem("st_settings_v2", JSON.stringify({ theme: st.theme, sound: st.sound }));
    } catch {}
  }

  // ---- Quota optimizations (presence/typing behavior in hidden tabs) ----
  function hookVisibility() {
    document.addEventListener("visibilitychange", () => {
      const st = getSettings();
      if (!st.typingEnabled) return;
      // Best-effort: if tab hidden, clear typing UI
      if (document.hidden) {
        const typ = $("typingIndicator");
        if (typ) typ.innerHTML = "";
      }
    });
  }

  // ---- Boot when chat exists ----
  function bootWhenReady() {
    const chat = $("screen-chat");
    const msg = $("messages");
    const input = $("msgInput");
    if (!chat || !msg || !input) {
      setTimeout(bootWhenReady, 350);
      return;
    }

    applyLive();
    ensureSettingsButton();
    ensureHUD();
    hookScrollBox();
    hookNewMessages();
    hookReplyClicks();
    hookSendButton();
    hookVisibility();

    // keep HUD online synced
    setInterval(syncOnlineToHUD, 1200);
  }

  // Observe screen changes to re-apply HUD/button when entering chat
  function observeScreens() {
    const root = $("root") || document.body;
    const mo = new MutationObserver(() => {
      const chat = $("screen-chat");
      if (chat && chat.classList.contains("active")) {
        applyLive();
        ensureSettingsButton();
        ensureHUD();
        syncOnlineToHUD();
      }
      // if replies panel open, ensure preview exists
      addReplyPreviewIfOpen();
    });
    mo.observe(root, { subtree: true, attributes: true, attributeFilter: ["class"] });
  }

  // Add minimal CSS for overlay/modal if not already present
  function injectCssOnce() {
    if ($("stV5Css")) return;
    const css = document.createElement("style");
    css.id = "stV5Css";
    css.textContent = `
      .st-scroll-btn{
        position: fixed;
        right: 18px;
        bottom: 92px;
        z-index: 999998;
        display:flex;
        align-items:center;
        gap:10px;
        padding: 10px 12px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,.14);
        background: rgba(0,0,0,.32);
        backdrop-filter: blur(12px);
        color: rgba(255,255,255,.92);
        cursor: pointer;
        box-shadow: 0 20px 60px rgba(0,0,0,.55);
      }
      .st-scroll-btn.hidden{ display:none; }
      .st-scroll-btn .count{
        min-width: 24px;
        height: 20px;
        border-radius: 999px;
        padding: 0 8px;
        display:grid;
        place-items:center;
        font-size: 12px;
        background: rgba(80,140,255,.22);
        border: 1px solid rgba(80,140,255,.22);
      }
      .st-new-msg{
        animation: stNewMsg 1.4s ease;
      }
      @keyframes stNewMsg{
        0%{ box-shadow: 0 0 0 rgba(0,0,0,0); }
        25%{ box-shadow: 0 0 22px rgba(80,140,255,.22); }
        100%{ box-shadow: 0 0 0 rgba(0,0,0,0); }
      }
      .st-jump-flash{
        animation: stJump .9s ease;
      }
      @keyframes stJump{
        0%{ box-shadow: 0 0 0 rgba(0,0,0,0); transform: translateY(0); }
        40%{ box-shadow: 0 0 26px rgba(60,255,160,.20); transform: translateY(-1px); }
        100%{ box-shadow: 0 0 0 rgba(0,0,0,0); transform: translateY(0); }
      }
      .st-toast-container{
        position: fixed;
        bottom: 18px;
        right: 18px;
        display:flex;
        flex-direction:column;
        gap:10px;
        z-index: 999999;
        pointer-events:none;
      }
      .st-toast{
        pointer-events:none;
        padding: 12px 14px;
        border-radius: 12px;
        background: rgba(18,18,18,.86);
        border: 1px solid rgba(255,255,255,.12);
        color: rgba(255,255,255,.92);
        backdrop-filter: blur(12px);
        box-shadow: 0 20px 60px rgba(0,0,0,.55);
        transform: translateX(16px);
        opacity: 0;
        animation: stToastIn .20s ease forwards;
        max-width: min(360px, 86vw);
        font-weight: 650;
      }
      .st-toast.good{ border-color: rgba(60,255,160,.22); }
      .st-toast.warn{ border-color: rgba(255,211,107,.22); }
      .st-toast.info{ border-color: rgba(80,140,255,.22); }
      .st-toast.out{ animation: stToastOut .22s ease forwards; }
      @keyframes stToastIn{ to{ transform: translateX(0); opacity: 1; } }
      @keyframes stToastOut{ to{ transform: translateX(16px); opacity: 0; } }

      .st-hud{
        position:absolute;
        top:10px;
        right:12px;
        display:flex;
        justify-content:space-between;
        gap:12px;
        align-items:center;
        pointer-events:none;
      }
      .hud-left, .hud-right{ display:flex; gap:10px; align-items:center; }
      .hud-chip{
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(0,0,0,.22);
        border: 1px solid rgba(255,255,255,.12);
        color: rgba(255,255,255,.86);
        font-size: 12px;
        letter-spacing:.02em;
        backdrop-filter: blur(10px);
      }
      .hud-soft{ opacity:.85; }
      .hud-badge{
        display:flex;
        gap:8px;
        align-items:center;
        padding: 6px 10px;
        border-radius: 999px;
        background: rgba(0,0,0,.18);
        border: 1px solid rgba(255,255,255,.12);
        backdrop-filter: blur(10px);
      }
      .hud-badge .dot{
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: rgba(60,255,160,.92);
        box-shadow: 0 0 18px rgba(60,255,160,.18);
        animation: stDotPulse 1.8s ease-in-out infinite;
      }
      @keyframes stDotPulse{
        0%,100%{ transform: scale(1); opacity:.75; }
        50%{ transform: scale(1.25); opacity: 1; }
      }
      .hud-badge .txt{ font-weight: 800; letter-spacing:.05em; }

      .st-overlay{position:fixed;inset:0;z-index:999999;display:grid;place-items:center;background:rgba(0,0,0,.70);backdrop-filter:blur(10px);padding:16px;}
      .st-modal{width:min(560px,95vw);border-radius:16px;border:1px solid rgba(255,255,255,.12);background:linear-gradient(180deg, rgba(20,20,20,.92), rgba(14,14,14,.76));box-shadow:0 30px 90px rgba(0,0,0,.65);overflow:hidden}
      .st-modal-top{display:flex;justify-content:space-between;align-items:center;padding:14px 14px;border-bottom:1px solid rgba(255,255,255,.10)}
      .st-modal-title{font-weight:800;letter-spacing:.04em}
      .st-icon-btn{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.10);color:#fff;border-radius:10px;padding:6px 10px;cursor:pointer}
      .st-modal-body{padding:14px 14px}
      .st-setting-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0}
      .st-setting-name{font-weight:800}
      .st-setting-desc{font-size:.85rem;opacity:.75}
      .st-pill-btn{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.12);color:#fff;border-radius:999px;padding:8px 12px;cursor:pointer}
      .st-divider{height:1px;background:rgba(255,255,255,.10);margin:10px 0}

      .reply-preview{
        margin: 10px 12px 0 12px;
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,.10);
        background: rgba(0,0,0,.20);
      }
      .pv-top{ display:flex; justify-content:space-between; align-items:center; gap:10px; }
      .pv-title{ font-weight:800; opacity:.9; }
      .pv-snippet{ margin-top:6px; opacity:.85; white-space:pre-wrap; }
      .pv-jump{
        border:1px solid rgba(255,255,255,.12);
        background: rgba(255,255,255,.06);
        color:#fff;
        border-radius: 10px;
        padding: 6px 10px;
        cursor:pointer;
      }
      .pv-jump:hover{ border-color: rgba(60,255,160,.22); box-shadow: 0 0 10px rgba(60,255,160,.10); }
    `;
    document.head.appendChild(css);
  }

  function boot() {
    injectCssOnce();
    bootWhenReady();
    observeScreens();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
