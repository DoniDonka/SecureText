document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const screens = {
    class: $("screen-class"),
    pin: $("screen-pin"),
    name: $("screen-name"),
    wait: $("screen-wait"),
    chat: $("screen-chat"),
  };

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

  function showScreen(key) {
    Object.values(screens).forEach((el) => hardHideEl(el));
    legacyFullScreens.forEach((id) => {
      const el = $(id);
      if (id === "chat-screen") return;
      if (el) hardHideEl(el);
    });
    hardShowEl(screens[key]);

    // admin path button ONLY on class select
    const adminBtn = $("adminPathBtn");
    if (adminBtn) adminBtn.style.display = key === "class" ? "block" : "none";
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
  function commandsDoc(classId) {
    return classDocRef(classId).collection("meta").doc("commands");
  }
  function pendingAttachmentsCol(classId) {
    return classDocRef(classId).collection("pendingAttachments");
  }

  // ===== RULES GATE =====
  function rulesKey(classId, userId) {
    return `rulesAccepted:${classId}:${userId}`;
  }
  function hasAcceptedRules(classId, userId) {
    return localStorage.getItem(rulesKey(classId, userId)) === "true";
  }
  function setAcceptedRules(classId, userId) {
    localStorage.setItem(rulesKey(classId, userId), "true");
  }
  function clearAcceptedRules(classId, userId) {
    localStorage.removeItem(rulesKey(classId, userId));
  }

  function showRulesGate({ classId, userId, userName, className }, onContinue) {
    if (hasAcceptedRules(classId, userId)) {
      onContinue();
      return;
    }

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
    title.style.position = "relative";
    title.style.zIndex = "2";
    title.style.display = "flex";
    title.style.alignItems = "center";
    title.style.justifyContent = "space-between";
    title.style.gap = "12px";

    title.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="
          width:46px;height:46px;border-radius:14px;
          background: rgba(255,255,255,.06);
          border: 1px solid rgba(255,255,255,.10);
          display:grid;place-items:center;
          box-shadow: 0 12px 35px rgba(0,0,0,.45);
          font-weight:900;letter-spacing:.6px;
        ">!</div>
        <div>
          <div style="font-size:22px;font-weight:900;letter-spacing:.4px;">Rules & Conduct Agreement</div>
          <div style="margin-top:4px;font-size:12px;opacity:.74;">
            Class: <strong>${escapeHtml(className || classId)}</strong> • User: <strong>${escapeHtml(userName || "")}</strong>
          </div>
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:12px;opacity:.78;">Approved ✅</div>
        <div id="rulesDelayText" style="margin-top:3px;font-size:12px;opacity:.78;">Security delay: 30s</div>
      </div>
    `;

    const box = document.createElement("div");
    box.style.position = "relative";
    box.style.zIndex = "2";
    box.style.marginTop = "14px";
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
    controls.style.position = "relative";
    controls.style.zIndex = "2";
    controls.style.marginTop = "14px";
    controls.style.display = "grid";
    controls.style.gap = "10px";

    const checkWrap = document.createElement("label");
    checkWrap.style.display = "flex";
    checkWrap.style.alignItems = "center";
    checkWrap.style.gap = "10px";
    checkWrap.style.userSelect = "none";
    checkWrap.style.cursor = "pointer";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.style.transform = "scale(1.15)";
    checkbox.style.cursor = "pointer";

    const checkText = document.createElement("div");
    checkText.innerHTML = `
      <div style="font-size:13px;"><strong>I understand</strong> and will follow the rules above.</div>
      <div style="font-size:12px;opacity:.72;">You must accept to enter chat.</div>
    `;

    checkWrap.appendChild(checkbox);
    checkWrap.appendChild(checkText);

    const btn = document.createElement("button");
    btn.textContent = "I Understand";
    btn.disabled = true;
    btn.style.border = "1px solid rgba(255,255,255,.14)";
    btn.style.background = "rgba(255,255,255,.06)";
    btn.style.color = "rgba(255,255,255,.92)";
    btn.style.padding = "10px 14px";
    btn.style.borderRadius = "12px";
    btn.style.cursor = "not-allowed";

    const lockedNote = document.createElement("div");
    lockedNote.style.marginTop = "6px";
    lockedNote.style.fontSize = "12px";
    lockedNote.style.opacity = "0.78";
    lockedNote.textContent = "Please wait…";

    controls.appendChild(checkWrap);
    controls.appendChild(btn);
    controls.appendChild(lockedNote);

    card.appendChild(title);
    card.appendChild(box);
    card.appendChild(controls);
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

  // ===== restore session =====
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
  if (pinBackBtn) pinBackBtn.onclick = () => { $("pinInput").value = ""; $("pinError").textContent = ""; showScreen("class"); };

  const nameBackBtn = $("nameBackBtn");
  if (nameBackBtn) nameBackBtn.onclick = () => { $("nameInput").value = ""; $("nameError").textContent = ""; showScreen("pin"); };

  const resetBtn = $("resetBtn");
  if (resetBtn) resetBtn.onclick = () => { clearLS(); location.reload(); };

  const logoutBtn = $("logoutBtn");
  if (logoutBtn) logoutBtn.onclick = () => { clearLS(); location.reload(); };

  // ===== load classes =====
  function loadClasses() {
    const classesWrap = $("classes");
    const err = $("classError");
    if (!classesWrap) return;

    classesWrap.innerHTML = "Loading classes...";
    if (err) err.textContent = "";

    db.collection("classes").get()
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

  // ===== PIN verify =====
  const pinContinueBtn = $("pinContinueBtn");
  if (pinContinueBtn) {
    pinContinueBtn.onclick = async () => {
      const pin = $("pinInput").value.trim();
      if (!selectedClassId) return ($("pinError").textContent = "No class selected.");
      if (!pin) return ($("pinError").textContent = "Enter a PIN.");

      try {
        const clsDoc = await classDocRef(selectedClassId).get();
        if (!clsDoc.exists) return ($("pinError").textContent = "Class not found.");

        const data = clsDoc.data() || {};
        if (String(data.pin || "") !== pin) return ($("pinError").textContent = "Wrong PIN!");

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

  // ===== create pending user =====
  const nameContinueBtn = $("nameContinueBtn");
  if (nameContinueBtn) {
    nameContinueBtn.onclick = async () => {
      const name = $("nameInput").value.trim();
      if (!selectedClassId) return ($("nameError").textContent = "No class selected.");
      if (!name) return ($("nameError").textContent = "Enter a name.");

      const userId = "u_" + Math.random().toString(36).slice(2) + Date.now().toString(36);

      try {
        const bannedDoc = await bannedRef(selectedClassId, userId).get();
        if (bannedDoc.exists) return showDenied("You are banned from this class.");

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

  function showWaiting(name, classId) {
    const waitText = $("waitText");
    const waitStatus = $("waitStatus");
    if (waitText) waitText.textContent = `${name}, you requested access to ${selectedClassName || classId}.`;
    if (waitStatus) { waitStatus.textContent = ""; waitStatus.className = "notice"; }
    showScreen("wait");
  }

  function showDenied(msg) {
    const waitText = $("waitText");
    const waitStatus = $("waitStatus");
    if (waitText) waitText.textContent = "Access blocked.";
    if (waitStatus) { waitStatus.textContent = msg; waitStatus.className = "notice bad"; }
    showScreen("wait");
  }

  async function restoreFlow(classId, userId, name) {
    try {
      const banDoc = await bannedRef(classId, userId).get();
      if (banDoc.exists) return showDenied("You are banned from this class.");

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
          { classId, userId, userName: name, className: selectedClassName || data.className || classId },
          () => loadChat(name, classId, userId)
        );
      } else if (status === "rejected") showDenied("You were rejected by the admin.");
      else if (status === "banned") showDenied("You are banned from this class.");
      else {
        showWaiting(name, classId);
        watchStatus(classId, userId, name);
      }
    } catch (e) {
      console.error(e);
      showWaiting(name, classId);
      watchStatus(classId, userId, name);
    }
  }

  function watchStatus(classId, userId, name) {
    pendingRef(classId, userId).onSnapshot((doc) => {
      if (!doc.exists) return showDenied("Your request was removed (denied).");

      const data = doc.data() || {};
      const status = data.status || (data.approved ? "approved" : "pending");

      if (status === "approved") {
        showRulesGate(
          { classId, userId, userName: name, className: selectedClassName || data.className || classId },
          () => loadChat(name, classId, userId)
        );
      } else if (status === "rejected") showDenied("You were rejected by the admin.");
      else if (status === "banned") showDenied("You are banned from this class.");
      else {
        const waitStatus = $("waitStatus");
        if (waitStatus) { waitStatus.textContent = "Pending approval..."; waitStatus.className = "notice warn"; }
      }
    });

    bannedRef(classId, userId).onSnapshot((doc) => {
      if (doc.exists) showDenied("You are banned from this class.");
    });
  }

  // ===== CHAT (optimized rendering) =====
  let chatUnsubs = [];
  function clearChatListeners() {
    chatUnsubs.forEach((u) => { try { u(); } catch {} });
    chatUnsubs = [];
  }

  // DOM cache for messages to prevent flashing
  const msgNodes = new Map(); // messageId -> element

  function upsertMessageNode({ container, id, html, sortKey }) {
    let el = msgNodes.get(id);
    if (!el) {
      el = document.createElement("div");
      el.dataset.id = id;
      msgNodes.set(id, el);
      container.appendChild(el);
    }
    el.dataset.sortKey = String(sortKey || "");
    el.innerHTML = html;
  }

  function removeMessageNode(id) {
    const el = msgNodes.get(id);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    msgNodes.delete(id);
  }

  function scrollToBottomIfNearBottom(container) {
    // Only autoscroll if user is already near bottom (prevents jitter)
    const threshold = 140;
    const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    if (atBottom) container.scrollTop = container.scrollHeight;
  }

  function loadChat(name, classId, userId) {
    clearChatListeners();
    msgNodes.clear();

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
    const attachBtn = $("attachBtn");
    const fileInput = $("fileInput");

    // Theme toggle
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

    // Announcements
    chatUnsubs.push(
      announcementsCol(classId).orderBy("timestamp", "asc").onSnapshot((snap) => {
        const box = $("announcementsList");
        if (!box) return;
        box.innerHTML = "";
        snap.forEach((doc) => {
          const a = doc.data() || {};
          const t = a.timestamp && a.timestamp.toDate
            ? a.timestamp.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "";
          const div = document.createElement("div");
          div.innerHTML = `<div style="margin:6px 0;"><strong>[${t}]</strong> ${escapeHtml(a.text || "")}</div>`;
          box.appendChild(div);
        });
        if (snap.empty) box.innerHTML = "<div style='opacity:.7;margin-top:6px;'>No announcements.</div>";
      })
    );

    // Commands listener (force logout / force rules)
    chatUnsubs.push(
      commandsDoc(classId).onSnapshot((doc) => {
        if (!doc.exists) return;
        const d = doc.data() || {};

        // Force logout
        if (d.forceLogoutAt) {
          const lastSeen = Number(localStorage.getItem(`cmdSeen:logout:${classId}:${userId}`) || "0");
          const t = d.forceLogoutAt.toMillis ? d.forceLogoutAt.toMillis() : Number(d.forceLogoutAt) || 0;
          if (t && t > lastSeen) {
            localStorage.setItem(`cmdSeen:logout:${classId}:${userId}`, String(t));
            clearLS();
            location.reload();
          }
        }

        // Force rules
        if (d.forceRulesAt) {
          const lastSeen = Number(localStorage.getItem(`cmdSeen:rules:${classId}:${userId}`) || "0");
          const t = d.forceRulesAt.toMillis ? d.forceRulesAt.toMillis() : Number(d.forceRulesAt) || 0;
          if (t && t > lastSeen) {
            localStorage.setItem(`cmdSeen:rules:${classId}:${userId}`, String(t));
            clearAcceptedRules(classId, userId);
            showRulesGate(
              { classId, userId, userName: name, className: selectedClassName || classId },
              () => {} // they’re already in chat; after accept they just continue
            );
          }
        }
      })
    );

    // Typing indicator
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
        if (!doc.exists) return (typingDiv.textContent = "");
        const data = doc.data() || {};
        const othersTyping = Object.entries(data).some(([id, val]) => id !== userId && val === true);
        typingDiv.textContent = othersTyping ? "Someone is typing..." : "";
      })
    );

    async function ensureApprovedOrBlock() {
      const banDoc = await bannedRef(classId, userId).get();
      if (banDoc.exists) {
        if (chatStatus) { chatStatus.textContent = "You are banned."; chatStatus.className = "notice bad"; }
        return false;
      }
      const pDoc = await pendingRef(classId, userId).get();
      const st = pDoc.exists ? (pDoc.data().status || (pDoc.data().approved ? "approved" : "pending")) : "missing";
      if (st !== "approved") {
        if (chatStatus) {
          chatStatus.textContent = st === "rejected" ? "You were rejected." : "You are not approved.";
          chatStatus.className = "notice bad";
        }
        return false;
      }
      return true;
    }

    // Send text message
    if (sendBtn && msgInput) {
      sendBtn.onclick = async () => {
        const text = msgInput.value.trim();
        if (!text) return;
        if (!(await ensureApprovedOrBlock())) return;

        await messagesCol(classId).add({
          type: "text",
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

    // Attach button -> choose image
    if (attachBtn && fileInput) {
      attachBtn.onclick = async () => {
        if (!(await ensureApprovedOrBlock())) return;
        fileInput.value = "";
        fileInput.click();
      };

      fileInput.onchange = async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;

        // only images
        if (!file.type || !file.type.startsWith("image/")) {
          if (chatStatus) { chatStatus.textContent = "Only image files are allowed right now."; chatStatus.className = "notice bad"; }
          return;
        }

        if (!(await ensureApprovedOrBlock())) return;

        try {
          if (chatStatus) { chatStatus.textContent = "Uploading image for admin approval…"; chatStatus.className = "notice warn"; }

          const uploadId = "att_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
          const path = `classes/${classId}/pendingAttachments/${uploadId}_${file.name.replace(/[^\w.\-]+/g, "_")}`;

          const storageRef = storage.ref().child(path);
          await storageRef.put(file, { contentType: file.type });

          await pendingAttachmentsCol(classId).doc(uploadId).set({
            uploadId,
            status: "pending", // pending | approved | rejected
            classId,
            uploaderId: userId,
            uploaderName: name,
            fileName: file.name,
            contentType: file.type,
            storagePath: path,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          });

          if (chatStatus) { chatStatus.textContent = "Sent to admin for approval ✅"; chatStatus.className = "notice good"; }
          setTimeout(() => { if (chatStatus) chatStatus.textContent = ""; }, 2200);
        } catch (e) {
          console.error(e);
          if (chatStatus) { chatStatus.textContent = "Upload failed. Check Storage rules / quota."; chatStatus.className = "notice bad"; }
        }
      };
    }

    // Live messages optimized (last 200)
    const q = messagesCol(classId).orderBy("timestamp", "asc").limitToLast(200);

    chatUnsubs.push(
      q.onSnapshot((snap) => {
        if (!messagesDiv) return;

        snap.docChanges().forEach((chg) => {
          const doc = chg.doc;
          const m = doc.data() || {};

          // Only main messages in this main list
          if (m.replyTo !== null) return;

          const isOwn = m.userId === userId;
          const time = m.timestamp && m.timestamp.toDate
            ? m.timestamp.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "Sending...";

          let bodyHtml = "";
          if (m.type === "image" && m.attachmentUrl) {
            bodyHtml = `
              <div class="msg-text">${escapeHtml(m.text || "")}</div>
              <div class="attach-preview"><img src="${m.attachmentUrl}" alt="attachment"></div>
            `;
          } else {
            bodyHtml = `<div class="msg-text">${escapeHtml(m.text || "")}</div>`;
          }

          const html = `
            <div class="msg ${isOwn ? "own" : ""}" data-id="${doc.id}">
              <div class="msg-top">
                <strong>${escapeHtml(m.name || "")}</strong>
                <span class="msg-time">${time}</span>
              </div>
              ${bodyHtml}
              <div class="msg-actions">
                <button class="reply-btn" data-id="${doc.id}" data-text="${encodeURIComponent(m.text || "")}">Reply</button>
                <button class="view-replies-btn" data-id="${doc.id}" data-text="${encodeURIComponent(m.text || "")}">View replies</button>
                ${isOwn ? `<button class="delete-btn" data-id="${doc.id}" data-parent="null">Delete</button>` : ""}
              </div>
            </div>
          `;

          if (chg.type === "removed") {
            removeMessageNode(doc.id);
          } else {
            const sortKey = (m.timestamp && m.timestamp.toMillis) ? m.timestamp.toMillis() : Date.now();
            upsertMessageNode({ container: messagesDiv, id: doc.id, html, sortKey });
          }
        });

        scrollToBottomIfNearBottom(messagesDiv);
      }, (err) => console.error("messages listener error", err))
    );
  }

  // ===== Replies (kept simple) =====
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
    if (title) title.textContent = `Replies to: "${decodeURIComponent(parentText).slice(0, 40)}"`;

    const unsub = messagesCol(classId).orderBy("timestamp", "asc").limitToLast(300).onSnapshot((snap) => {
      if (!list) return;
      list.innerHTML = "";
      snap.forEach((doc) => {
        const m = doc.data() || {};
        if (m.replyTo !== parentId) return;
        const isOwn = m.userId === userId;
        const time = m.timestamp && m.timestamp.toDate
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
          type: "text",
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

  // Global click handler
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