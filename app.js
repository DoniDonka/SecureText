document.addEventListener("DOMContentLoaded", () => {
  // ===== helpers =====
  const $ = (id) => document.getElementById(id);

  const screens = {
    class: $("screen-class"),
    pin: $("screen-pin"),
    name: $("screen-name"),
    wait: $("screen-wait"),
    chat: $("screen-chat"),
  };

  function showScreen(key) {
    Object.values(screens).forEach((el) => el.classList.remove("active"));
    screens[key].classList.add("active");
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
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
    // decide where to go based on status
    restoreFlow(savedClassId, savedUserId, savedUserName);
  } else {
    loadClasses();
    showScreen("class");
  }

  // ===== UI events =====
  $("pinBackBtn").onclick = () => {
    $("pinInput").value = "";
    $("pinError").textContent = "";
    showScreen("class");
  };

  $("nameBackBtn").onclick = () => {
    $("nameInput").value = "";
    $("nameError").textContent = "";
    showScreen("pin");
  };

  $("resetBtn").onclick = () => {
    clearLS();
    location.reload();
  };

  $("logoutBtn").onclick = () => {
    clearLS();
    location.reload();
  };

  // ===== 1) Load classes dynamically =====
  function loadClasses() {
    const classesWrap = $("classes");
    const err = $("classError");
    classesWrap.innerHTML = "Loading classes...";
    err.textContent = "";

    db.collection("classes")
      .get()
      .then((snap) => {
        classesWrap.innerHTML = "";
        if (snap.empty) {
          err.textContent = "No classes found in Firestore (collection must be named 'classes').";
          return;
        }

        snap.forEach((doc) => {
          const data = doc.data() || {};
          const btn = document.createElement("button");
          btn.className = "class-btn";
          btn.textContent = data.name || doc.id;
          btn.onclick = () => {
            selectedClassId = doc.id;
            selectedClassName = data.name || doc.id;
            $("pinClassName").textContent = selectedClassName;
            $("pinError").textContent = "";
            $("pinInput").value = "";
            showScreen("pin");
          };
          classesWrap.appendChild(btn);
        });
      })
      .catch((e) => {
        err.textContent = "Failed to load classes. Check Firestore rules + config.";
        console.error(e);
      });
  }

  // ===== 2) PIN verify =====
  $("pinContinueBtn").onclick = async () => {
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

  // ===== 3) Create pending user =====
  $("nameContinueBtn").onclick = async () => {
    const name = $("nameInput").value.trim();
    if (!selectedClassId) {
      $("nameError").textContent = "No class selected.";
      return;
    }
    if (!name) {
      $("nameError").textContent = "Enter a name.";
      return;
    }

    // create a stable userId for this device
    const userId = "u_" + Math.random().toString(36).slice(2) + Date.now().toString(36);

    try {
      // if already banned for this userId (shouldn't happen first time), block
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

  // ===== waiting screen =====
  function showWaiting(name, classId) {
    $("waitText").textContent = `${name}, you requested access to ${selectedClassName || classId}.`;
    $("waitStatus").textContent = "";
    $("waitStatus").className = "notice";
    showScreen("wait");
  }

  function showDenied(msg) {
    $("waitText").textContent = "Access blocked.";
    $("waitStatus").textContent = msg;
    $("waitStatus").className = "notice bad";
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
        // stale local storage
        clearLS();
        loadClasses();
        showScreen("class");
        return;
      }

      const data = pDoc.data() || {};
      const status = data.status || (data.approved ? "approved" : "pending");

      if (status === "approved") {
        loadChat(name, classId, userId);
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
      // fallback
      showWaiting(name, classId);
      watchStatus(classId, userId, name);
    }
  }

  // ===== status watcher =====
  function watchStatus(classId, userId, name) {
    pendingRef(classId, userId).onSnapshot((doc) => {
      if (!doc.exists) {
        // admin deleted, treat as rejected
        showDenied("Your request was removed (denied).");
        return;
      }

      const data = doc.data() || {};
      const status = data.status || (data.approved ? "approved" : "pending");

      if (status === "approved") {
        loadChat(name, classId, userId);
      } else if (status === "rejected") {
        showDenied("You were rejected by the admin.");
      } else if (status === "banned") {
        showDenied("You are banned from this class.");
      } else {
        $("waitStatus").textContent = "Pending approval...";
        $("waitStatus").className = "notice warn";
      }
    });

    // also watch ban doc (in case ban happens later)
    bannedRef(classId, userId).onSnapshot((doc) => {
      if (doc.exists) {
        showDenied("You are banned from this class.");
      }
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

    $("chatWelcome").textContent = `Welcome, ${name}!`;
    $("chatSubtitle").textContent = `SecureText chat | ${selectedClassName || classId}`;
    $("chatStatus").textContent = "";
    showScreen("chat");

    const msgInput = $("msgInput");
    const sendBtn = $("sendBtn");
    const messagesDiv = $("messages");
    const typingDiv = $("typingIndicator");
    const themeToggle = $("themeToggle");

    // theme toggle
    themeToggle.onclick = () => {
      const screen = $("chat-screen");
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

    // announcements (per-class)
    chatUnsubs.push(
      announcementsCol(classId)
        .orderBy("timestamp", "asc")
        .onSnapshot((snap) => {
          const box = $("announcementsList");
          box.innerHTML = "";
          snap.forEach((doc) => {
            const a = doc.data() || {};
            const t = a.timestamp && a.timestamp.toDate ? a.timestamp.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
            const div = document.createElement("div");
            div.innerHTML = `<div style="margin:6px 0;"><strong>[${t}]</strong> ${escapeHtml(a.text || "")}</div>`;
            box.appendChild(div);
          });
          if (snap.empty) box.innerHTML = "<div style='opacity:.7;margin-top:6px;'>No announcements.</div>";
        })
    );

    // typing indicator (per-class)
    let typingTimeout = null;
    msgInput.addEventListener("input", () => {
      typingDoc(classId).set({ [userId]: true }, { merge: true });
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        typingDoc(classId).set({ [userId]: false }, { merge: true });
      }, 1500);
    });

    chatUnsubs.push(
      typingDoc(classId).onSnapshot((doc) => {
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
    sendBtn.onclick = async () => {
      const text = msgInput.value.trim();
      if (!text) return;

      // hard block if banned/rejected mid-session
      const banDoc = await bannedRef(classId, userId).get();
      if (banDoc.exists) {
        $("chatStatus").textContent = "You are banned.";
        $("chatStatus").className = "notice bad";
        return;
      }
      const pDoc = await pendingRef(classId, userId).get();
      const st = pDoc.exists ? (pDoc.data().status || (pDoc.data().approved ? "approved" : "pending")) : "missing";
      if (st !== "approved") {
        $("chatStatus").textContent = st === "rejected" ? "You were rejected." : "You are not approved.";
        $("chatStatus").className = "notice bad";
        return;
      }

      // write message
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

    // live messages (MAIN)
    chatUnsubs.push(
      messagesCol(classId)
        .orderBy("timestamp", "asc")
        .onSnapshot((snap) => {
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

    // replies panel open/close + send + delete are handled by global click
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

    panel.classList.remove("hidden");
    title.textContent = `Replies to: "${decodeURIComponent(parentText).slice(0, 40)}"`;

    // live replies for that parent (no where needed; filter in JS)
    const unsub = messagesCol(classId)
      .orderBy("timestamp", "asc")
      .onSnapshot((snap) => {
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

    // replace handler safely each time
    sendReplyBtn.onclick = async () => {
      const text = replyInput.value.trim();
      if (!text) return;

      // must still be approved
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

    // stop this listener when panel closes
    panel.dataset.unsub = "1";
    panel._unsubReplies = unsub;
  }

  function closeReplies() {
    const panel = $("replies-panel");
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

    // delete replies if deleting a main message
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

    if (t.id === "closeReplies") closeReplies();

    if (t.classList && (t.classList.contains("reply-btn") || t.classList.contains("view-replies-btn"))) {
      const parentId = t.dataset.id;
      const parentText = t.dataset.text || "";
      openReplies(parentId, parentText);
    }

    if (t.classList && t.classList.contains("delete-btn")) {
      const id = t.dataset.id;
      const parent = t.dataset.parent;
      deleteMessage(id, parent);
    }
  });
});
