document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  let currentClassId = null;
  let currentClassName = null;

  // Keep track of live listeners so we can clean them up (VERY important for reads)
  let liveUnsubs = [];

  function addUnsub(fn) {
    if (typeof fn === "function") liveUnsubs.push(fn);
  }
  function clearLiveUnsubs() {
    liveUnsubs.forEach((u) => {
      try { u(); } catch { }
    });
    liveUnsubs = [];
  }

  function classDocRef(classId) {
    return db.collection("classes").doc(classId);
  }
  function pendingCol(classId) {
    return classDocRef(classId).collection("pendingUsers");
  }
  function bannedCol(classId) {
    return classDocRef(classId).collection("bannedUsers");
  }
  function messagesCol(classId) {
    return classDocRef(classId).collection("messages");
  }
  function announcementsCol(classId) {
    return classDocRef(classId).collection("announcements");
  }
  function commandsDoc(classId) {
    return classDocRef(classId).collection("meta").doc("commands");
  }

  // ===== UI status helper =====
  function setActionStatus(msg, kind) {
    const el = document.getElementById("adminActionStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = kind === "bad" ? "#ff6b6b" : kind === "warn" ? "#ffd36b" : "#9cffb1";
  }

  // ===== Batch delete (chat + announcements) =====
  async function deleteCollectionBatched(colRef, batchSize = 300) {
    let deleted = 0;

    while (true) {
      const snap = await colRef.orderBy("__name__").limit(batchSize).get();
      if (snap.empty) break;

      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();

      deleted += snap.size;

      // small yield so the UI doesn't freeze
      await new Promise((r) => setTimeout(r, 40));
    }

    return deleted;
  }

  // ===== Inject Class Controls UI (no admin.html changes needed) =====
  function ensureControlsUI() {
    const screen = $("admin-screen");
    if (!screen) return;

    if (document.getElementById("classControlsCard")) return;

    const wrap = document.createElement("div");
    wrap.id = "classControlsCard";
    wrap.style.border = "1px solid #333";
    wrap.style.background = "#0e0e0e";
    wrap.style.borderRadius = "10px";
    wrap.style.padding = "12px";
    wrap.style.margin = "12px 0 16px 0";

    wrap.innerHTML = `
      <h3 style="margin:0 0 10px 0">Class Controls</h3>

      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <button id="forceLogoutEveryoneBtn" type="button">Force Logout Everyone</button>
        <button id="forceRerulesBtn" type="button">Force Rules Re-Accept</button>
        <button id="forceRefreshBtn" type="button">Force Refresh Everyone</button>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px">
        <button id="lockChatBtn" type="button">Lock Chat</button>
        <button id="unlockChatBtn" type="button">Unlock Chat</button>
        <input id="lockMessageInput" type="text" placeholder="Lock message (optional)" style="flex:1;min-width:220px" />
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px">
        <button id="forceThemeNightBtn" type="button">Force Theme: Night</button>
        <button id="forceThemeDayBtn" type="button">Force Theme: Day</button>
        <button id="clearForcedThemeBtn" type="button">Clear Forced Theme</button>
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px">
        <button id="deleteAllChatBtn" type="button" style="border-color:#ff6b6b">Delete ALL Chat</button>
        <button id="deleteAllAnnouncementsBtn" type="button" style="border-color:#ff6b6b">Delete ALL Announcements</button>
        <span id="adminActionStatus" style="margin-left:auto;opacity:.9"></span>
      </div>
    `;

    // Insert just under classTitle
    const title = $("classTitle");
    if (title && title.parentElement) {
      title.parentElement.insertBefore(wrap, title.nextSibling);
    } else {
      screen.insertBefore(wrap, screen.firstChild);
    }
  }

  function wireControls() {
    ensureControlsUI();

    const ref = commandsDoc(currentClassId);

    const inc = (field) =>
      ref.set(
        {
          [field]: firebase.firestore.FieldValue.increment(1),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    const set = (obj) =>
      ref.set(
        { ...obj, updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );

    const forceLogoutBtn = document.getElementById("forceLogoutEveryoneBtn");
    const forceRerulesBtn = document.getElementById("forceRerulesBtn");
    const forceRefreshBtn = document.getElementById("forceRefreshBtn");
    const lockBtn = document.getElementById("lockChatBtn");
    const unlockBtn = document.getElementById("unlockChatBtn");
    const lockMsgInput = document.getElementById("lockMessageInput");
    const themeNightBtn = document.getElementById("forceThemeNightBtn");
    const themeDayBtn = document.getElementById("forceThemeDayBtn");
    const clearThemeBtn = document.getElementById("clearForcedThemeBtn");
    const delChatBtn = document.getElementById("deleteAllChatBtn");
    const delAnnBtn = document.getElementById("deleteAllAnnouncementsBtn");

    if (forceLogoutBtn) {
      forceLogoutBtn.onclick = async () => {
        try {
          await inc("logoutNonce");
          setActionStatus("Force logout sent.", "ok");
        } catch {
          setActionStatus("Failed to send force logout.", "bad");
        }
      };
    }

    if (forceRerulesBtn) {
      forceRerulesBtn.onclick = async () => {
        try {
          await inc("rulesNonce");
          setActionStatus("Force re-rules sent.", "ok");
        } catch {
          setActionStatus("Failed to send re-rules.", "bad");
        }
      };
    }

    if (forceRefreshBtn) {
      forceRefreshBtn.onclick = async () => {
        try {
          await inc("refreshNonce");
          setActionStatus("Force refresh sent.", "ok");
        } catch {
          setActionStatus("Failed to send refresh.", "bad");
        }
      };
    }

    if (lockBtn) {
      lockBtn.onclick = async () => {
        try {
          const msg = (lockMsgInput && lockMsgInput.value ? lockMsgInput.value : "").trim();
          await set({ locked: true, lockMessage: msg || "Chat is temporarily locked by admin." });
          setActionStatus("Chat locked.", "warn");
        } catch {
          setActionStatus("Failed to lock chat.", "bad");
        }
      };
    }

    if (unlockBtn) {
      unlockBtn.onclick = async () => {
        try {
          await set({ locked: false, lockMessage: "" });
          setActionStatus("Chat unlocked.", "ok");
        } catch {
          setActionStatus("Failed to unlock chat.", "bad");
        }
      };
    }

    if (themeNightBtn) {
      themeNightBtn.onclick = async () => {
        try {
          await set({ theme: "night" });
          setActionStatus("Forced theme: Night.", "ok");
        } catch {
          setActionStatus("Failed to force theme.", "bad");
        }
      };
    }

    if (themeDayBtn) {
      themeDayBtn.onclick = async () => {
        try {
          await set({ theme: "day" });
          setActionStatus("Forced theme: Day.", "ok");
        } catch {
          setActionStatus("Failed to force theme.", "bad");
        }
      };
    }

    if (clearThemeBtn) {
      clearThemeBtn.onclick = async () => {
        try {
          await set({ theme: firebase.firestore.FieldValue.delete() });
          setActionStatus("Forced theme cleared.", "ok");
        } catch {
          setActionStatus("Failed to clear forced theme.", "bad");
        }
      };
    }

    if (delChatBtn) {
      delChatBtn.onclick = async () => {
        if (!confirm("Delete ALL chat messages for this class? This cannot be undone.")) return;
        setActionStatus("Deleting chat…", "warn");
        try {
          const n = await deleteCollectionBatched(messagesCol(currentClassId), 300);
          setActionStatus(`Deleted ${n} messages.`, "ok");
        } catch {
          setActionStatus("Failed to delete chat.", "bad");
        }
      };
    }

    if (delAnnBtn) {
      delAnnBtn.onclick = async () => {
        if (!confirm("Delete ALL announcements for this class? This cannot be undone.")) return;
        setActionStatus("Deleting announcements…", "warn");
        try {
          const n = await deleteCollectionBatched(announcementsCol(currentClassId), 300);
          setActionStatus(`Deleted ${n} announcements.`, "ok");
        } catch {
          setActionStatus("Failed to delete announcements.", "bad");
        }
      };
    }

    // Optional: show current lock/theme state live in admin
    const unsub = ref.onSnapshot((doc) => {
      const d = doc && doc.exists ? doc.data() || {} : {};
      const locked = !!d.locked;
      const theme = d.theme === "day" ? "day" : d.theme === "night" ? "night" : "auto";
      setActionStatus(`State: ${locked ? "LOCKED" : "UNLOCKED"} • Theme: ${theme}`, locked ? "warn" : "ok");
    });
    addUnsub(unsub);
  }

  // ===== login =====
  $("loginBtn").onclick = async () => {
    const email = $("adminEmail").value.trim();
    const pass = $("adminPassword").value.trim();
    $("loginError").textContent = "";

    if (!email || !pass) {
      $("loginError").textContent = "Enter email + password.";
      return;
    }

    try {
      await auth.signInWithEmailAndPassword(email, pass);
      $("admin-login").style.display = "none";
      $("admin-dashboard").style.display = "block";
      $("adminInfo").textContent = `Logged in as: ${email}`;
      loadAllowedClasses(email);
    } catch (e) {
      console.error(e);
      $("loginError").textContent = e.message || "Login failed.";
    }
  };

  // logout (dashboard button)
  $("logoutBtn").onclick = async () => {
    try { await auth.signOut(); } catch { }
    location.reload();
  };

  // ===== find which classes this admin can manage =====
  async function loadAllowedClasses(adminEmail) {
    $("classButtons").innerHTML = "";
    $("classError").textContent = "";

    try {
      const snap = await db
        .collection("classes")
        .where("admins", "array-contains", adminEmail)
        .get();

      if (snap.empty) {
        $("classError").textContent =
          "No class assigned to this admin email in Firestore.";
        return;
      }

      snap.forEach((doc) => {
        const data = doc.data() || {};
        const btn = document.createElement("button");
        btn.textContent = data.name || doc.id;
        btn.onclick = () => openClass(doc.id, data.name || doc.id);
        $("classButtons").appendChild(btn);
      });
    } catch (e) {
      console.error(e);
      $("classError").textContent = "Failed loading admin classes.";
    }
  }

  function openClass(classId, className) {
    // IMPORTANT: clear listeners when switching classes (saves quota)
    clearLiveUnsubs();

    currentClassId = classId;
    currentClassName = className;

    $("admin-screen").style.display = "block";
    $("classTitle").textContent = `Managing: ${className} (${classId})`;

    wireControls();
    wirePending();
    wireBanned();
    wireAnnouncements();
    wireChat();
  }

  // ===== pending users =====
  function wirePending() {
    const tbody = $("pendingUsersTable").querySelector("tbody");
    tbody.innerHTML = "";

    // Use timestamp (your app writes timestamp), not createdAt
    const q = pendingCol(currentClassId).orderBy("timestamp", "asc");

    const unsub = q.onSnapshot((snap) => {
      tbody.innerHTML = "";
      snap.forEach((doc) => {
        const u = doc.data() || {};
        if ((u.status || "pending") !== "pending") return;

        const tr = document.createElement("tr");

        const tdName = document.createElement("td");
        tdName.textContent = u.name || "(no name)";

        const tdApprove = document.createElement("td");
        const tdReject = document.createElement("td");
        const tdBan = document.createElement("td");

        const approveBtn = document.createElement("button");
        approveBtn.textContent = "Approve";
        approveBtn.onclick = () =>
          doc.ref.update({
            approved: true,
            status: "approved",
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          });

        const rejectBtn = document.createElement("button");
        rejectBtn.textContent = "Reject";
        rejectBtn.onclick = () =>
          doc.ref.update({
            approved: false,
            status: "rejected",
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          });

        const banBtn = document.createElement("button");
        banBtn.textContent = "Ban";
        banBtn.onclick = async () => {
          // NOTE: Do NOT delete their messages (quota killer). We only ban.
          await doc.ref.update({
            approved: false,
            status: "banned",
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          });

          await bannedCol(currentClassId).doc(doc.id).set(
            {
              userId: doc.id,
              name: u.name || "",
              bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
              by: auth.currentUser ? auth.currentUser.email : "admin",
            },
            { merge: true }
          );
        };

        tdApprove.appendChild(approveBtn);
        tdReject.appendChild(rejectBtn);
        tdBan.appendChild(banBtn);

        tr.appendChild(tdName);
        tr.appendChild(tdApprove);
        tr.appendChild(tdReject);
        tr.appendChild(tdBan);
        tbody.appendChild(tr);
      });
    });

    addUnsub(unsub);
  }

  // ===== banned users =====
  function wireBanned() {
    const tbody = $("bannedUsersTable").querySelector("tbody");
    tbody.innerHTML = "";

    const unsub = bannedCol(currentClassId).onSnapshot((snap) => {
      tbody.innerHTML = "";
      snap.forEach((doc) => {
        const b = doc.data() || {};
        const tr = document.createElement("tr");

        const tdName = document.createElement("td");
        tdName.textContent = b.name || "";

        const tdId = document.createElement("td");
        tdId.textContent = doc.id;

        const tdUnban = document.createElement("td");
        const unbanBtn = document.createElement("button");
        unbanBtn.textContent = "Unban";
        unbanBtn.onclick = async () => {
          await doc.ref.delete();
          // allow them to re-request
          await pendingCol(currentClassId).doc(doc.id).set(
            {
              approved: false,
              status: "rejected",
              updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        };
        tdUnban.appendChild(unbanBtn);

        tr.appendChild(tdName);
        tr.appendChild(tdId);
        tr.appendChild(tdUnban);
        tbody.appendChild(tr);
      });
    });

    addUnsub(unsub);
  }

  // ===== announcements =====
  function wireAnnouncements() {
    $("announceBtn").onclick = async () => {
      const text = $("announcementInput").value.trim();
      if (!text) return;

      await announcementsCol(currentClassId).add({
        title: "Announcement",
        body: text,
        by: auth.currentUser ? auth.currentUser.email : "admin",
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });

      $("announcementInput").value = "";
    };

    const unsub = announcementsCol(currentClassId)
      .orderBy("timestamp", "asc")
      .limit(30)
      .onSnapshot((snap) => {
        const box = $("announcementsList");
        box.innerHTML = "";
        snap.forEach((doc) => {
          const a = doc.data() || {};
          const t =
            a.timestamp && a.timestamp.toDate
              ? a.timestamp
                .toDate()
                .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "";
          const div = document.createElement("div");
          div.style.margin = "6px 0";
          const txt = a.body || a.text || "";
          div.textContent = `[${t}] ${txt}`;
          box.appendChild(div);
        });
        if (snap.empty)
          box.innerHTML = "<div style='opacity:.7'>No announcements yet.</div>";
      });

    addUnsub(unsub);
  }

  // ===== admin chat =====
  function wireChat() {
    // Enter-to-send for admin chat too
    const input = $("adminChatInput");
    const send = $("adminSendBtn");

    if (input && send) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          send.click();
        }
      });
    }

    if (send) {
      send.onclick = async () => {
        const text = (input && input.value ? input.value : "").trim();
        if (!text) return;

        await messagesCol(currentClassId).add({
          name: "Admin",
          userId: "admin",
          text,
          replyTo: null,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });

        if (input) input.value = "";
      };
    }

    const unsub = messagesCol(currentClassId)
      .orderBy("timestamp", "asc")
      .limitToLast(75)
      .onSnapshot((snap) => {
        const box = $("chatMessages");
        box.innerHTML = "";
        snap.forEach((doc) => {
          const m = doc.data() || {};
          const t =
            m.timestamp && m.timestamp.toDate
              ? m.timestamp
                .toDate()
                .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "Sending…";
          const div = document.createElement("div");
          div.className = "msg";
          div.textContent = `[${t}] ${m.name || ""}: ${m.text || ""}`;
          box.appendChild(div);
        });
        box.scrollTop = box.scrollHeight;
      });

    addUnsub(unsub);
  }
});