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
    // If already accepted, go straight in
    if (hasAcceptedRules(classId, userId)) {
      onContinue();
      return;
    }

    // Fire confetti once when approved hits this gate
    try {
      if (window.ST_UI && typeof window.ST_UI.confettiBurst === "function") {
        window.ST_UI.confettiBurst(1400);
      }
    } catch {}

    const root = $("root") || document.body;

    // remove any existing gate
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
    card.style.background =
      "linear-gradient(180deg, rgba(20,20,20,.82), rgba(16,16,16,.58))";
    card.style.boxShadow = "0 30px 90px rgba(0,0,0,.6)";
    card.style.padding = "22px 22px 18px 22px";
    card.style.position = "relative";
    card.style.overflow = "hidden";

    // top stripe
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
    btn.onmouseenter = () => { if (!btn.disabled) btn.style.transform = "translateY(-1px)"; };
    btn.onmouseleave = () => { btn.style.transform = "translateY(0)"; };
    btn.onmousedown = () => { if (!btn.disabled) btn.style.opacity = ".95"; };
    btn.onmouseup = () => { btn.style.opacity = "1"; };

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

    // gating logic: 30s delay + 10s button lock + checkbox required
    let delayLeft = 30;
    let lockLeft = 10;

    const delayEl = document.getElementById("rulesDelayText");
    const tick = () => {
      if (delayEl) delayEl.textContent = `Security delay: ${delayLeft}s`;
      if (lockLeft > 0) {
        lockedNote.textContent = `Button unlocks in ${lockLeft}s…`;
      } else {
        lockedNote.textContent = checkbox.checked
          ? "You may continue."
          : "Check the box to continue.";
      }

      // enable button only when BOTH are satisfied
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
      // if for any reason disabled, ignore
      if (btn.disabled) return;

      try { clearInterval(interval); } catch {}
      setAcceptedRules(classId, userId);

      // remove overlay and continue to chat
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

          // keep your tile styling: if you want, you can swap class-btn -> class-tile in html/css
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
        // NEW: Rules gate before chat
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
        // NEW: Rules gate before chat
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

  // ===== CHAT =====
  let chatUnsubs = [];
  function clearChatListeners() {
    chatUnsubs.forEach((u) => {
      try { u(); } catch {}
    });
    chatUnsubs = [];
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

    // announcements (per-class)
    chatUnsubs.push(
      announcementsCol(classId)
        .orderBy("timestamp", "asc")
        .onSnapshot((snap) => {
          const box = $("announcementsList");
          if (!box) return;
          box.innerHTML = "";
          snap.forEach((doc) => {
            const a = doc.data() || {};
            const t =
              a.timestamp && a.timestamp.toDate
                ? a.timestamp.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "";
            const div = document.createElement("div");
            div.innerHTML = `<div style="margin:6px 0;"><strong>[${t}]</strong> ${escapeHtml(a.text || "")}</div>`;
            box.appendChild(div);
          });
          if (snap.empty) box.innerHTML = "<div style='opacity:.7;margin-top:6px;'>No announcements.</div>";
        })
    );

    // typing indicator (per-class)
    let typingTimeout = null;
    if (msgInput) {
      msgInput.addEventListener("input", () => {
        typingDoc(classId).set({ [userId]: true }, { merge: true });
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
          typingDoc(classId).set({ [userId]: false }, { merge: true });
        }, 1500);
      });
    }

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

        await messagesCol(classId).add({
          name,
          userId,
          text,
          replyTo: null,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });

        msgInput.value = "";
        typingDoc(classId).set({ [userId]: false }, { merge: true });
      };
    }

    // live messages (MAIN)
    chatUnsubs.push(
      messagesCol(classId)
        .orderBy("timestamp", "asc")
        .onSnapshot((snap) => {
          if (!messagesDiv) return;
          messagesDiv.innerHTML = "";
          snap.forEach((doc) => {
            const m = doc.data() || {};
            if (m.replyTo !== null) return;

            const isOwn = m.userId === userId;
            const time =
              m.timestamp && m.timestamp.toDate
                ? m.timestamp.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                : "Sending...";

            messagesDiv.innerHTML += `
              <div class="msg ${isOwn ? "own" : ""}" data-id="${doc.id}">
                <div class="msg-top">
                  <strong>${escapeHtml(m.name || "")}</strong>
                  <span class="msg-time">${time}</span>
                </div>
                <div class="msg-text">${escapeHtml(m.text || "")}</div>
                <div class="msg-actions">
                  <button class="reply-btn" data-id="${doc.id}" data-text="${encodeURIComponent(m.text || "")}">Reply</button>
                  <button class="view-replies-btn" data-id="${doc.id}" data-text="${encodeURIComponent(m.text || "")}">View replies</button>
                  ${isOwn ? `<button class="delete-btn" data-id="${doc.id}" data-parent="null">Delete</button>` : ""}
                </div>
              </div>
            `;
          });

          messagesDiv.scrollTop = messagesDiv.scrollHeight;
        })
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
        list.innerHTML = "";
        snap.forEach((doc) => {
          const m = doc.data() || {};
          if (m.replyTo !== parentId) return;

          const isOwn = m.userId === userId;
          const time =
            m.timestamp && m.timestamp.toDate
              ? m.timestamp.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "Sending...";

          list.innerHTML += `
            <div class="reply-msg ${isOwn ? "own" : ""}" data-id="${doc.id}">
              <div class="msg-top">
                <strong>${escapeHtml(m.name || "")}</strong>
                <span class="msg-time">${time}</span>
              </div>
              <div class="msg-text">${escapeHtml(m.text || "")}</div>
              <div class="msg-actions">
                ${isOwn ? `<button class="delete-btn" data-id="${doc.id}" data-parent="${parentId}">Delete</button>` : ""}
              </div>
            </div>
          `;
        });

        list.scrollTop = list.scrollHeight;
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