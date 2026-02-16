document.addEventListener("DOMContentLoaded", () => {
  // ===== helpers =====
  const $ = (id) => document.getElementById(id);

  // Screens used by THIS app.js
  const screens = {
    class: $("screen-class"),
    pin: $("screen-pin"),
    name: $("screen-name"),
    wait: $("screen-wait"),
    rules: $("screen-rules"),
    chat: $("screen-chat"),
  };

  const adminBtn = $("adminPathBtn");

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
    Object.entries(screens).forEach(([k, el]) => {
      if (k === key) hardShowEl(el);
      else hardHideEl(el);
    });

    // Admin Path ONLY on class screen
    if (adminBtn) adminBtn.style.display = (key === "class") ? "block" : "none";
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
    localStorage.removeItem("rulesAccepted");
    localStorage.removeItem("lastSessionCmd");
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

  function sessionControlDoc(classId) {
    return classDocRef(classId).collection("meta").doc("sessionControl");
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
          const tile = document.createElement("button");
          tile.className = "class-tile";
          tile.type = "button";
          tile.innerHTML = `
            <p class="class-name">${escapeHtml(data.name || doc.id)}</p>
            <p class="class-meta">Tap to enter PIN</p>
          `;

          tile.onclick = () => {
            selectedClassId = doc.id;
            selectedClassName = data.name || doc.id;

            const pinClassName = $("pinClassName");
            if (pinClassName) pinClassName.textContent = selectedClassName;

            $("pinError").textContent = "";
            $("pinInput").value = "";
            showScreen("pin");
          };

          classesWrap.appendChild(tile);
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

      // stable-ish userId per request
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
          status: "pending",          // pending | approved | rejected | banned
          approved: false,
          rulesAccepted: false,
          needsRules: true,
          lastCommand: "",
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          active: false,
          lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
        });

        setLS({
          classId: selectedClassId,
          className: selectedClassName || selectedClassId,
          userId,
          userName: name,
          rulesAccepted: "false",
          lastSessionCmd: "",
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

  // ===== RULES GATE =====
  let rulesTimerInt = null;

  function showRulesGate(afterApproved = false) {
    const rulesCheck = $("rulesCheck");
    const rulesTimer = $("rulesTimer");
    const rulesBtn = $("rulesContinueBtn");
    const rulesError = $("rulesError");

    if (rulesError) rulesError.textContent = "";
    if (rulesCheck) rulesCheck.checked = false;
    if (rulesBtn) rulesBtn.disabled = true;
    if (rulesCheck) rulesCheck.disabled = true;

    showScreen("rules");

    // Optional confetti + delay vibe when approved
    if (afterApproved && window.ST_UI && typeof window.ST_UI.confettiBurst === "function") {
      window.ST_UI.confettiBurst(1800);
    }

    let secs = 10;
    if (rulesTimer) rulesTimer.textContent = `Please wait ${secs}s…`;

    if (rulesTimerInt) clearInterval(rulesTimerInt);
    rulesTimerInt = setInterval(() => {
      secs -= 1;
      if (secs > 0) {
        if (rulesTimer) rulesTimer.textContent = `Please wait ${secs}s…`;
      } else {
        clearInterval(rulesTimerInt);
        rulesTimerInt = null;
        if (rulesTimer) rulesTimer.textContent = "You can accept now.";
        if (rulesCheck) rulesCheck.disabled = false;
        if (rulesBtn) rulesBtn.disabled = false;
      }
    }, 1000);
  }

  const rulesContinueBtn = $("rulesContinueBtn");
  if (rulesContinueBtn) {
    rulesContinueBtn.onclick = async () => {
      const classId = localStorage.getItem("classId");
      const userId = localStorage.getItem("userId");
      const name = localStorage.getItem("userName");
      const check = $("rulesCheck");
      const err = $("rulesError");

      if (!classId || !userId || !name) {
        if (err) err.textContent = "Session missing. Start over.";
        return;
      }

      if (!check || !check.checked) {
        if (err) err.textContent = "You must check the box to continue.";
        return;
      }

      try {
        await pendingRef(classId, userId).set({
          rulesAccepted: true,
          needsRules: false,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        localStorage.setItem("rulesAccepted", "true");
        loadChat(name, classId, userId);
      } catch (e) {
        console.error(e);
        if (err) err.textContent = "Failed to accept rules (rules). Check Firestore rules.";
      }
    };
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
        // If rules not accepted, show rules gate (infinite until accepted)
        const needsRules = data.needsRules === true || data.rulesAccepted !== true;
        if (needsRules) {
          showRulesGate(false);
          watchStatus(classId, userId, name);
        } else {
          loadChat(name, classId, userId);
        }
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
  let statusUnsub = null;
  let banUnsub = null;
  let sessionCmdUnsub = null;

  function clearStatusWatchers() {
    if (statusUnsub) { try { statusUnsub(); } catch {} statusUnsub = null; }
    if (banUnsub) { try { banUnsub(); } catch {} banUnsub = null; }
    if (sessionCmdUnsub) { try { sessionCmdUnsub(); } catch {} sessionCmdUnsub = null; }
  }

  function watchStatus(classId, userId, name) {
    clearStatusWatchers();

    statusUnsub = pendingRef(classId, userId).onSnapshot((doc) => {
      if (!doc.exists) {
        showDenied("Your request was removed (denied).");
        return;
      }

      const data = doc.data() || {};
      const status = data.status || (data.approved ? "approved" : "pending");

      if (status === "approved") {
        const needsRules = data.needsRules === true || data.rulesAccepted !== true;

        // If admin forces rules screen
        if (data.lastCommand === "forceRules") {
          // clear command so it doesn't loop
          pendingRef(classId, userId).set({ lastCommand: "" }, { merge: true });
          localStorage.setItem("rulesAccepted", "false");
          showRulesGate(true);
          return;
        }

        if (needsRules) {
          showRulesGate(true);
          return;
        }

        loadChat(name, classId, userId);
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

    banUnsub = bannedRef(classId, userId).onSnapshot((doc) => {
      if (doc.exists) showDenied("You are banned from this class.");
    });

    // Session control commands (kick / force relog) - per class document
    sessionCmdUnsub = sessionControlDoc(classId).onSnapshot((doc) => {
      if (!doc.exists) return;
      const data = doc.data() || {};
      const cmds = data.commands || {};
      const cmd = cmds[userId];
      if (!cmd) return;

      const lastSeenCmd = localStorage.getItem("lastSessionCmd") || "";
      if (lastSeenCmd === cmd.id) return; // already processed

      localStorage.setItem("lastSessionCmd", cmd.id);

      if (cmd.type === "kick") {
        clearLS();
        alert("Admin removed your session. Please rejoin.");
        location.reload();
      }
      if (cmd.type === "forceRules") {
        // Set pending doc flag too (for reliability)
        pendingRef(classId, userId).set({ needsRules: true, rulesAccepted: false }, { merge: true });
        localStorage.setItem("rulesAccepted", "false");
        showRulesGate(true);
      }
      if (cmd.type === "relog") {
        clearLS();
        alert("Admin requested a relog. Please rejoin.");
        location.reload();
      }
    });
  }

  // ===== CHAT =====
  let chatUnsubs = [];
  function clearChatListeners() {
    chatUnsubs.forEach((u) => { try { u(); } catch {} });
    chatUnsubs = [];
  }

  function markActive(classId, userId, isActive) {
    // Do not crash if rules
    pendingRef(classId, userId).set({
      active: !!isActive,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }).catch(() => {});
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

    // mark active presence
    markActive(classId, userId, true);
    window.addEventListener("beforeunload", () => markActive(classId, userId, false), { once: true });

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

        // hard block if banned/rejected mid-session
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

        // if admin forces rules while chatting
        const needsRules = pDoc.exists && (pDoc.data().needsRules === true || pDoc.data().rulesAccepted !== true);
        if (needsRules) {
          localStorage.setItem("rulesAccepted", "false");
          showRulesGate(true);
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

    // Keep watching status while chatting (for instant revoke/ban)
    watchStatus(classId, userId, name);
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
    if (title) title.textContent = `Replies to: "${decodeURIComponent(parentText).slice(0, 40)}"`;

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

        const needsRules = pDoc.exists && (pDoc.data().needsRules === true || pDoc.data().rulesAccepted !== true);
        if (needsRules) {
          localStorage.setItem("rulesAccepted", "false");
          showRulesGate(true);
          return;
        }

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
