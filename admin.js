
document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  let currentClassId = null;
  let liveUnsubs = [];

  // ===== Admin spam guard =====
  let adminLastSendAt = 0;
  let adminLastSendText = "";
  const adminRecent = [];
  const ADMIN_SPAM_MIN_INTERVAL_MS = 900;
  const ADMIN_SPAM_REPEAT_WINDOW_MS = 10000;
  const ADMIN_SPAM_MAX_REPEAT = 2;
  const ADMIN_SPAM_MAX_LEN = 350;
  function adminSpamCheck(text) {
    const now = Date.now();
    if (text.length > ADMIN_SPAM_MAX_LEN) return { ok:false, msg:`Too long (max ${ADMIN_SPAM_MAX_LEN}).` };
    if (now - adminLastSendAt < ADMIN_SPAM_MIN_INTERVAL_MS) return { ok:false, msg:"Slow down." };
    const cutoff = now - ADMIN_SPAM_REPEAT_WINDOW_MS;
    while (adminRecent.length && adminRecent[0].at < cutoff) adminRecent.shift();
    const reps = adminRecent.filter(r => r.t === text).length;
    if (reps >= ADMIN_SPAM_MAX_REPEAT || (adminLastSendText === text && now - adminLastSendAt < ADMIN_SPAM_REPEAT_WINDOW_MS)) {
      return { ok:false, msg:"Duplicate blocked." };
    }
    return { ok:true };
  }


  function clearListeners() {
    liveUnsubs.forEach((u) => { try { u(); } catch {} });
    liveUnsubs = [];
  }

  function setStatus(msg, kind) {
    const el = $("adminActionStatus");
    if (!el) return;
    el.textContent = msg || "";
    el.style.color = kind === "bad" ? "var(--bad)" : (kind === "warn" ? "var(--warn)" : "var(--good)");
  }

  function classDocRef(classId) { return db.collection("classes").doc(classId); }
  function pendingCol(classId) { return classDocRef(classId).collection("pendingUsers"); }
  function bannedCol(classId) { return classDocRef(classId).collection("bannedUsers"); }
  function messagesCol(classId) { return classDocRef(classId).collection("messages"); }
  function announcementsCol(classId) { return classDocRef(classId).collection("announcements"); }
  function commandsDoc(classId) { return classDocRef(classId).collection("meta").doc("commands"); }
  function pinnedDoc(classId) { return classDocRef(classId).collection("meta").doc("pinned"); }
  function reportsCol(classId) { return classDocRef(classId).collection("reports"); }
  function checkInDoc(classId) { return classDocRef(classId).collection("meta").doc("checkIn"); }
  function activePollDoc(classId) { return classDocRef(classId).collection("meta").doc("activePoll"); }
  function moderationDoc(classId) { return classDocRef(classId).collection("meta").doc("moderation"); }
  function presenceDoc(classId) { return classDocRef(classId).collection("meta").doc("presence"); }

  // ===== login =====
  $("loginBtn").onclick = async () => {
    const email = ($("adminEmail").value || "").trim();
    const pass = ($("adminPassword").value || "").trim();
    $("loginError").textContent = "";
    if (!email || !pass) { $("loginError").textContent = "Enter email + password."; return; }
    try {
      await auth.signInWithEmailAndPassword(email, pass);
      $("admin-login").style.display = "none";
      $("admin-dashboard").style.display = "flex";
      $("adminInfo").textContent = `Logged in as: ${email}`;
      loadAllowedClasses(email);
    } catch (e) {
      console.error(e);
      $("loginError").textContent = e.message || "Login failed.";
    }
  };

  $("logoutBtn").onclick = async () => {
    try { await auth.signOut(); } catch {}
    location.reload();
  };

  async function loadAllowedClasses(adminEmail) {
    $("classButtons").innerHTML = "";
    $("classError").textContent = "";
    try {
      const snap = await db.collection("classes").where("admins", "array-contains", adminEmail).get();
      if (snap.empty) { $("classError").textContent = "No class assigned to this admin email."; return; }

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
    clearListeners();
    currentClassId = classId;

    $("admin-screen").style.display = "block";
    $("classTitle").textContent = `Managing: ${className} (${classId})`;
    setStatus("Ready.", "ok");

    wireControls();
    wireExtraControlsHotfix($, commandsDoc, currentClassId, setStatus);
    wireBulkPending();
    wirePending();
    wireBanned();
    wireReports();
    wireStats();
    wireCheckIn();
    wirePoll();
    wireModeration();
    wireAnnouncements();
    wireChat();
  }

  function bumpField(ref, key) {
    return db.runTransaction(async (tx) => {
      const d = await tx.get(ref);
      const v = d.exists ? Number((d.data() || {})[key] || 0) : 0;
      tx.set(ref, { [key]: v + 1, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    });
  }

  function wireControls() {
    const ref = commandsDoc(currentClassId);

    $("forceLogoutEveryoneBtn").onclick = async () => {
      if (!confirm("Force logout everyone?")) return;
      setStatus("Forcing logout…", "warn");
      try { await bumpField(ref, "logoutNonce"); setStatus("✅ Forced logout.", "ok"); } catch (e) { console.error(e); setStatus("Failed.", "bad"); }
    };

    $("forceRerulesBtn").onclick = async () => {
      if (!confirm("Force everyone to re-accept rules?")) return;
      setStatus("Forcing re-rules…", "warn");
      try { await bumpField(ref, "rulesNonce"); setStatus("✅ Forced re-rules.", "ok"); } catch (e) { console.error(e); setStatus("Failed.", "bad"); }
    };

    $("forceRefreshEveryoneBtn").onclick = async () => {
      if (!confirm("Force refresh everyone?")) return;
      setStatus("Forcing refresh…", "warn");
      try { await bumpField(ref, "refreshNonce"); setStatus("✅ Forced refresh.", "ok"); } catch (e) { console.error(e); setStatus("Failed.", "bad"); }
    };

    $("lockChatBtn").onclick = async () => {
      setStatus("Locking chat…", "warn");
      try { await ref.set({ locked: true, lockMessage: ($("lockMessageInput").value || "").trim() }, { merge: true }); setStatus("🔒 Chat locked.", "ok"); } catch (e) { console.error(e); setStatus("Failed.", "bad"); }
    };

    $("unlockChatBtn").onclick = async () => {
      setStatus("Unlocking chat…", "warn");
      try { await ref.set({ locked: false, lockMessage: "" }, { merge: true }); setStatus("🔓 Chat unlocked.", "ok"); } catch (e) { console.error(e); setStatus("Failed.", "bad"); }
    };

    $("forceThemeNightBtn").onclick = async () => {
      setStatus("Forcing theme night…", "warn");
      try { await ref.set({ theme: "night" }, { merge: true }); setStatus("✅ Theme forced: night.", "ok"); } catch (e) { console.error(e); setStatus("Failed.", "bad"); }
    };

    $("forceThemeDayBtn").onclick = async () => {
      setStatus("Forcing theme day…", "warn");
      try { await ref.set({ theme: "day" }, { merge: true }); setStatus("✅ Theme forced: day.", "ok"); } catch (e) { console.error(e); setStatus("Failed.", "bad"); }
    };

    $("clearForcedThemeBtn").onclick = async () => {
      setStatus("Clearing forced theme…", "warn");
      try { await ref.set({ theme: firebase.firestore.FieldValue.delete() }, { merge: true }); setStatus("✅ Forced theme cleared.", "ok"); } catch (e) { console.error(e); setStatus("Failed.", "bad"); }
    };

    $("deleteAllChatBtn").onclick = async () => {
      if (!confirm("Delete ALL chat messages?")) return;
      setStatus("Deleting chat…", "warn");
      try {
        const snap = await messagesCol(currentClassId).get();
        const batch = db.batch();
        snap.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        setStatus("✅ Chat deleted.", "ok");
      } catch (e) { console.error(e); setStatus("Failed.", "bad"); }
    };

    $("deleteAllAnnouncementsBtn").onclick = async () => {
      if (!confirm("Delete ALL announcements?")) return;
      setStatus("Deleting announcements…", "warn");
      try {
        const snap = await announcementsCol(currentClassId).get();
        const batch = db.batch();
        snap.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        setStatus("✅ Announcements deleted.", "ok");
      } catch (e) { console.error(e); setStatus("Failed.", "bad"); }
    };

    $("resetCommandsBtn").onclick = async () => {
      if (!confirm("Reset commands for this class? (Fix kick loop)")) return;
      setStatus("Resetting commands…", "warn");
      try {
        await ref.set({
          logoutNonce: 0,
          refreshNonce: 0,
          rulesNonce: 0,
          locked: false,
          lockMessage: "",
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          forceLogoutAt: firebase.firestore.FieldValue.delete(),
          forceRulesAt: firebase.firestore.FieldValue.delete(),
        }, { merge: true });
        setStatus("✅ Commands reset.", "ok");
      } catch (e) { console.error(e); setStatus("Failed.", "bad"); }
    };

    const pinRef = pinnedDoc(currentClassId);
    $("setPinBtn").onclick = async () => {
      const text = ($("pinMessageInput").value || "").trim();
      setStatus("Setting pinned…", "warn");
      try {
        await pinRef.set({ text: text || "(no message)", updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        setStatus("✅ Pinned message set.", "ok");
      } catch (e) { console.error(e); setStatus("Failed.", "bad"); }
    };
    $("clearPinBtn").onclick = async () => {
      setStatus("Clearing pinned…", "warn");
      try {
        await pinRef.set({ text: "", updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        $("pinMessageInput").value = "";
        setStatus("✅ Pinned cleared.", "ok");
      } catch (e) { console.error(e); setStatus("Failed.", "bad"); }
    };

    $("exportChatBtn").onclick = async () => {
      const range = parseInt($("exportRangeSelect").value || "7", 10);
      const now = new Date();
      let start;
      if (range === 1) { start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
      else { start = new Date(now.getTime() - range * 24 * 60 * 60 * 1000); }
      setStatus("Exporting…", "warn");
      try {
        const snap = await messagesCol(currentClassId).orderBy("timestamp", "asc").startAt(firebase.firestore.Timestamp.fromDate(start)).limit(300).get();
        const lines = [];
        snap.forEach((d) => {
          const m = d.data() || {};
          const t = m.timestamp && m.timestamp.toDate ? m.timestamp.toDate().toISOString() : "";
          lines.push("[" + t + "] " + (m.name || "User") + ": " + (m.text || ""));
        });
        const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "securetext-export-" + currentClassId + ".txt";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 200);
        setStatus("✅ Exported " + snap.size + " messages.", "ok");
      } catch (e) { console.error(e); setStatus("Export failed.", "bad"); }
    };

    $("slowModeOnBtn").onclick = async () => {
      try { await commandsDoc(currentClassId).set({ slowMode: true, slowModeSeconds: 10 }, { merge: true }); setStatus("✅ Slow mode ON (10s).", "ok"); } catch (e) { setStatus("Failed.", "bad"); }
    };
    $("slowModeOffBtn").onclick = async () => {
      try { await commandsDoc(currentClassId).set({ slowMode: false }, { merge: true }); setStatus("✅ Slow mode OFF.", "ok"); } catch (e) { setStatus("Failed.", "bad"); }
    };
  }

  function wireReports() {
    const list = $("reportsList");
    const unsub = reportsCol(currentClassId).orderBy("timestamp", "desc").limit(50).onSnapshot((snap) => {
      list.innerHTML = "";
      snap.forEach((doc) => {
        const r = doc.data() || {};
        const div = document.createElement("div");
        div.style.cssText = "padding:10px;border-bottom:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;align-items:flex-start;gap:10px";
        div.innerHTML = "<div><strong>" + (r.reportedByName || "?") + "</strong> reported message: \"" + (r.messageText || "").slice(0, 80) + "…\"</div>";
        const btn = document.createElement("button"); btn.className = "msg-btn"; btn.textContent = "Dismiss";
        btn.onclick = () => doc.ref.delete();
        div.appendChild(btn);
        list.appendChild(div);
      });
      if (snap.empty) list.innerHTML = "<div class=\"muted\" style=\"padding:10px\">No reports.</div>";
    });
    liveUnsubs.push(unsub);
  }

  function wireStats() {
    $("adminStatsRefreshBtn").onclick = async () => {
      $("adminStatsText").textContent = "Loading…";
      try {
        const [pendingSnap, presenceSnap, messagesSnap] = await Promise.all([
          pendingCol(currentClassId).where("status", "==", "pending").get(),
          presenceDoc(currentClassId).get(),
          (() => { const start = new Date(Date.now() - 24 * 60 * 60 * 1000); return messagesCol(currentClassId).orderBy("timestamp", "asc").startAt(firebase.firestore.Timestamp.fromDate(start)).limit(300).get(); })()
        ]);
        let online = 0;
        if (presenceSnap.exists) {
          const data = presenceSnap.data() || {};
          const now = Date.now();
          Object.values(data).forEach((v) => { if (v && v.toDate && (now - v.toDate().getTime() < 120000)) online++; });
        }
        $("adminStatsText").textContent = "Pending: " + pendingSnap.size + "  ·  Online now: " + online + "  ·  Messages (24h): " + messagesSnap.size;
      } catch (e) { $("adminStatsText").textContent = "Failed to load."; }
    };
  }

  function wireCheckIn() {
    $("checkInStartBtn").onclick = async () => {
      try { await checkInDoc(currentClassId).set({ active: true, startedAt: firebase.firestore.FieldValue.serverTimestamp(), checkIns: {} }, { merge: true }); setStatus("✅ Check-in started.", "ok"); } catch (e) { setStatus("Failed.", "bad"); }
    };
    $("checkInEndBtn").onclick = async () => {
      try { await checkInDoc(currentClassId).set({ active: false }, { merge: true }); setStatus("✅ Check-in ended.", "ok"); } catch (e) { setStatus("Failed.", "bad"); }
    };
    const unsub = checkInDoc(currentClassId).onSnapshot((doc) => {
      const d = doc.data() || {};
      const checkIns = d.checkIns || {};
      const names = Object.keys(checkIns).length + " checked in.";
      $("checkInList").textContent = d.active ? names : (d.active ? names : "No active check-in.");
    });
    liveUnsubs.push(unsub);
  }

  function wirePoll() {
    $("pollCreateBtn").onclick = async () => {
      const q = ($("pollQuestionInput").value || "").trim();
      const optsStr = ($("pollOptionsInput").value || "").trim();
      const opts = optsStr.split(/[,]+/).map((s) => s.trim()).filter(Boolean);
      if (!q || opts.length < 2) { setStatus("Enter question and at least 2 options.", "warn"); return; }
      try {
        await activePollDoc(currentClassId).set({ question: q, options: opts, createdAt: Date.now(), votes: {} }, { merge: true });
        setStatus("✅ Poll created.", "ok");
      } catch (e) { setStatus("Failed.", "bad"); }
    };
    $("pollEndBtn").onclick = async () => {
      try { await activePollDoc(currentClassId).set({ question: null, options: [], votes: {} }, { merge: true }); setStatus("✅ Poll ended.", "ok"); } catch (e) { setStatus("Failed.", "bad"); }
    };
  }

  function wireModeration() {
    moderationDoc(currentClassId).get().then((doc) => {
      const d = doc.data() || {};
      $("filterEnabledCheck").checked = !!d.filterEnabled;
      $("filterWordsInput").value = Array.isArray(d.words) ? d.words.join("\n") : "";
    });
    $("filterSaveBtn").onclick = async () => {
      const words = ($("filterWordsInput").value || "").split(/[\n,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
      try {
        await moderationDoc(currentClassId).set({ filterEnabled: $("filterEnabledCheck").checked, words }, { merge: true });
        setStatus("✅ Filter saved.", "ok");
      } catch (e) { setStatus("Failed.", "bad"); }
    };
  }

  function wireBulkPending() {
    $("bulkApproveBtn").onclick = async () => {
      if (!currentClassId) return;
      if (!confirm("Approve ALL pending users?")) return;
      setStatus("Approving all…", "warn");
      try {
        const snap = await pendingCol(currentClassId).where("status", "==", "pending").get();
        const batch = db.batch();
        snap.forEach((d) => batch.set(d.ref, { status: "approved", updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }));
        await batch.commit();
        setStatus("✅ Approved " + snap.size + " users.", "ok");
      } catch (e) { console.error(e); setStatus("Failed.", "bad"); }
    };
    $("bulkRejectBtn").onclick = async () => {
      if (!currentClassId) return;
      if (!confirm("Reject ALL pending users?")) return;
      setStatus("Rejecting all…", "warn");
      try {
        const snap = await pendingCol(currentClassId).where("status", "==", "pending").get();
        const batch = db.batch();
        snap.forEach((d) => batch.set(d.ref, { status: "rejected", updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }));
        await batch.commit();
        setStatus("✅ Rejected " + snap.size + " users.", "ok");
      } catch (e) { console.error(e); setStatus("Failed.", "bad"); }
    };
  }

  function wirePending() {
    const tbody = $("pendingUsersTable").querySelector("tbody");
    const unsub = pendingCol(currentClassId).orderBy("timestamp", "asc").onSnapshot((snap) => {
      tbody.innerHTML = "";
      snap.forEach((doc) => {
        const u = doc.data() || {};
        if ((u.status || "pending") !== "pending") return;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)">${u.name || "(no name)"}</td>
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)"><button class="good" type="button">Approve</button></td>
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)"><button class="danger" type="button">Reject</button></td>
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)"><button class="danger" type="button">Ban</button></td>
        `;
        const [approveBtn, rejectBtn, banBtn] = tr.querySelectorAll("button");
        approveBtn.onclick = () => doc.ref.set({ status: "approved", updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        rejectBtn.onclick = () => doc.ref.set({ status: "rejected", updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        banBtn.onclick = async () => {
          await doc.ref.set({ status: "banned", updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
          await bannedCol(currentClassId).doc(doc.id).set({
            userId: doc.id,
            name: u.name || "",
            bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
            by: auth.currentUser ? auth.currentUser.email : "admin",
          });
        };
        tbody.appendChild(tr);
      });
    });
    liveUnsubs.push(unsub);
  }

  function wireBanned() {
    const tbody = $("bannedUsersTable").querySelector("tbody");
    const unsub = bannedCol(currentClassId).onSnapshot((snap) => {
      tbody.innerHTML = "";
      snap.forEach((doc) => {
        const b = doc.data() || {};
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)">${b.name || ""}</td>
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)">${doc.id}</td>
          <td style="padding:8px;border-bottom:1px solid rgba(255,255,255,.08)"><button class="good" type="button">Unban</button></td>
        `;
        tr.querySelector("button").onclick = async () => {
          await doc.ref.delete();
          await pendingCol(currentClassId).doc(doc.id).set({ status: "rejected", updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
        };
        tbody.appendChild(tr);
      });
    });
    liveUnsubs.push(unsub);
  }

  function wireAnnouncements() {
    $("announceBtn").onclick = async () => {
      const text = ($("announcementInput").value || "").trim();
      if (!text) return;
      await announcementsCol(currentClassId).add({
        text,
        by: auth.currentUser ? auth.currentUser.email : "admin",
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });
      $("announcementInput").value = "";
    };

    const unsub = announcementsCol(currentClassId).orderBy("timestamp", "asc").onSnapshot((snap) => {
      const list = $("announcementsList");
      list.innerHTML = "";
      snap.forEach((doc) => {
        const a = doc.data() || {};
        const t = a.timestamp && a.timestamp.toDate ? a.timestamp.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
        const div = document.createElement("div");
        div.style.margin = "6px 0";
        div.textContent = `[${t}] ${a.text || ""}`;
        list.appendChild(div);
      });
      if (snap.empty) list.innerHTML = `<div class="muted">No announcements yet.</div>`;
    });
    liveUnsubs.push(unsub);
  }

  function wireChat() {
    const inp = $("adminChatInput");
    if (inp) {
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          $("adminSendBtn").click();
        }
      });
    }
    $("adminSendBtn").onclick = async () => {
      const input = $("adminChatInput");
      let text = (input.value || "").trim();
      if (!text) return;
      text = text.replace(/\s{3,}/g, "  ");
      const chk = adminSpamCheck(text);
      if (!chk.ok) { setStatus(chk.msg, "warn"); return; }

      await messagesCol(currentClassId).add({
        name: "Admin",
        userId: "admin",
        text,
        replyTo: null,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });

      input.value = "";
      adminLastSendAt = Date.now();
      adminLastSendText = text;
      adminRecent.push({ t: text, at: adminLastSendAt });
    };

    const unsub = messagesCol(currentClassId).orderBy("timestamp", "asc").limitToLast(50).onSnapshot((snap) => {
      const box = $("chatMessages");
      box.innerHTML = "";
      snap.forEach((doc) => {
        const m = doc.data() || {};
        const t = m.timestamp && m.timestamp.toDate ? m.timestamp.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "…";
        const div = document.createElement("div");
        div.className = "msg admin-msg";
        div.style.display = "flex"; div.style.alignItems = "flex-start"; div.style.gap = "8px"; div.style.padding = "8px 0"; div.style.borderBottom = "1px solid rgba(255,255,255,.08)";
        const text = document.createElement("span");
        text.style.flex = "1"; text.style.minWidth = "0";
        text.textContent = `[${t}] ${m.name || ""}: ${m.deleted ? "(deleted)" : (m.text || "")}`;
        div.appendChild(text);
        const acts = document.createElement("div");
        acts.style.flexShrink = "0";
        const delBtn = document.createElement("button"); delBtn.className = "msg-btn danger"; delBtn.textContent = "Delete"; delBtn.type = "button";
        delBtn.onclick = async () => { try { await doc.ref.delete(); setStatus("Message deleted.", "ok"); } catch (e) { setStatus("Failed.", "bad"); } };
        const pinBtn = document.createElement("button"); pinBtn.className = "msg-btn primary"; pinBtn.textContent = "Pin"; pinBtn.type = "button";
        pinBtn.onclick = async () => {
          try {
            await pinnedDoc(currentClassId).set({ messageId: doc.id, text: m.text || "", name: m.name || "", timestamp: m.timestamp, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
            setStatus("Pinned message set.", "ok");
          } catch (e) { setStatus("Failed.", "bad"); }
        };
        acts.appendChild(delBtn); acts.appendChild(pinBtn);
        div.appendChild(acts);
        box.appendChild(div);
      });
      box.scrollTop = box.scrollHeight;
    });
    liveUnsubs.push(unsub);
  }
});


// ===== Hotfix: wire preset + data saver buttons safely (no crashes) =====
function wireExtraControlsHotfix($, commandsDoc, currentClassId, setStatus) {
  const ref = commandsDoc(currentClassId);
  const safeSet = async (patch, okMsg) => {
    setStatus(okMsg ? "Working…" : "Working…", "warn");
    try { await ref.set(patch, { merge: true }); setStatus(okMsg || "✅ Done.", "ok"); }
    catch (e) { console.error(e); setStatus("Failed.", "bad"); }
  };

  const neon = $("presetNeonBtn");
  if (neon) neon.onclick = () => safeSet({ preset: "neon" }, "✅ Preset: neon.");
  const em = $("presetEmeraldBtn");
  if (em) em.onclick = () => safeSet({ preset: "emerald" }, "✅ Preset: emerald.");
  const mono = $("presetMonoBtn");
  if (mono) mono.onclick = () => safeSet({ preset: "mono" }, "✅ Preset: mono.");
  const clr = $("presetClearBtn");
  if (clr) clr.onclick = () => safeSet({ preset: firebase.firestore.FieldValue.delete() }, "✅ Preset cleared.");

  const on = $("dataSaverOnBtn");
  if (on) on.onclick = () => safeSet({ dataSaver: true }, "✅ Data Saver ON.");
  const off = $("dataSaverOffBtn");
  if (off) off.onclick = () => safeSet({ dataSaver: false }, "✅ Data Saver OFF.");
}
