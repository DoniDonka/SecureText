document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  // ===== map admin emails -> class doc id =====
  const ADMIN_CLASS_MAP = {
    "doni@admin.com": "DoniClass",
    "jimboy@admin.com": "EthanClass",
  };

  const PRESENCE_TTL_MS = 45_000;

  let currentAdminEmail = null;
  let classId = null;

  // cache for combining presence + approved list
  let latestPresenceActiveSet = new Set(); // userIds active
  let latestApprovedMap = new Map();       // userId -> data

  // ===== refs =====
  const classDoc = (cid) => db.collection("classes").doc(cid);
  const pendingCol = (cid) => classDoc(cid).collection("pendingUsers");
  const bannedCol = (cid) => classDoc(cid).collection("bannedUsers");
  const messagesCol = (cid) => classDoc(cid).collection("messages");
  const announcementsCol = (cid) => classDoc(cid).collection("announcements");
  const presenceDoc = (cid) => classDoc(cid).collection("meta").doc("presence");

  function showLogin() {
    $("admin-login").style.display = "block";
    $("admin-dashboard").style.display = "none";
  }

  function showDash() {
    $("admin-login").style.display = "none";
    $("admin-dashboard").style.display = "block";
  }

  function setStatus(msg) {
    const el = $("adminStatus");
    if (!el) return;
    el.textContent = msg || "";
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function fmtTime(ts) {
    try {
      return ts && ts.toDate
        ? ts.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";
    } catch {
      return "";
    }
  }

  // ===== auth =====
  $("loginBtn").onclick = async () => {
    $("loginError").textContent = "";
    const email = $("adminEmail").value.trim().toLowerCase();
    const pass = $("adminPassword").value;

    if (!email || !pass) {
      $("loginError").textContent = "Enter email + password.";
      return;
    }

    try {
      await firebase.auth().signInWithEmailAndPassword(email, pass);
    } catch (e) {
      console.error(e);
      $("loginError").textContent = "Login failed.";
    }
  };

  $("logoutBtn").onclick = async () => {
    try { await firebase.auth().signOut(); } catch {}
    showLogin();
  };

  firebase.auth().onAuthStateChanged(async (user) => {
    if (!user) {
      currentAdminEmail = null;
      classId = null;
      showLogin();
      return;
    }

    currentAdminEmail = (user.email || "").toLowerCase();
    classId = ADMIN_CLASS_MAP[currentAdminEmail] || null;

    if (!classId) {
      showLogin();
      $("loginError").textContent =
        "This email is not assigned to a class in ADMIN_CLASS_MAP (admin.js).";
      try { await firebase.auth().signOut(); } catch {}
      return;
    }

    showDash();
    $("adminMeta").textContent = `Logged in as ${currentAdminEmail} • Class: ${classId}`;
    wireDashboard();
  });

  // ===== dashboard wiring =====
  let unsubs = [];
  function clearUnsubs() {
    unsubs.forEach((u) => { try { u(); } catch {} });
    unsubs = [];
  }

  function wireDashboard() {
    clearUnsubs();
    setStatus("");

    // 1) Pending users (status=pending)
    unsubs.push(
      pendingCol(classId)
        .orderBy("createdAt", "asc")
        .onSnapshot((snap) => {
          const wrap = $("pendingUsers");
          wrap.innerHTML = "";

          if (snap.empty) {
            wrap.innerHTML = `<div class="item"><div class="muted">No users found.</div></div>`;
            latestApprovedMap.clear();
            renderOfflineFromCaches();
            return;
          }

          // rebuild approved map too (we reuse the same collection)
          latestApprovedMap.clear();

          // render pending list
          let anyPending = false;

          snap.forEach((doc) => {
            const u = doc.data() || {};
            const status = u.status || (u.approved ? "approved" : "pending");

            // cache approved users for offline list
            if (status === "approved") {
              latestApprovedMap.set(doc.id, { ...u, _id: doc.id });
            }

            if (status !== "pending") return;
            anyPending = true;

            const div = document.createElement("div");
            div.className = "item";

            div.innerHTML = `
              <div class="item-top">
                <div>
                  <div><strong>${escapeHtml(u.name || "(no name)")}</strong></div>
                  <div class="small muted">userId: ${escapeHtml(u.userId || doc.id)}</div>
                </div>
                <div class="small muted">${fmtTime(u.createdAt)}</div>
              </div>
              <div class="btn-row">
                <button class="btn good" data-act="approve" data-id="${doc.id}">Approve</button>
                <button class="btn warn" data-act="reject" data-id="${doc.id}">Reject</button>
                <button class="btn danger" data-act="ban" data-id="${doc.id}">Ban</button>
              </div>
            `;

            wrap.appendChild(div);
          });

          if (!anyPending) {
            wrap.innerHTML = `<div class="item"><div class="muted">No pending users.</div></div>`;
          }

          // update offline list after approved cache refresh
          renderOfflineFromCaches();
        })
    );

    // 2) Active presence list (live)
    unsubs.push(
      presenceDoc(classId).onSnapshot((doc) => {
        const activeWrap = $("activeUsers");
        activeWrap.innerHTML = "";

        latestPresenceActiveSet = new Set();

        if (!doc.exists) {
          activeWrap.innerHTML = `<div class="item"><div class="muted">No active users yet.</div></div>`;
          renderOfflineFromCaches();
          return;
        }

        const data = doc.data() || {};
        const now = Date.now();

        const entries = Object.entries(data)
          .map(([uid, obj]) => {
            const last = obj && obj.lastSeen && obj.lastSeen.toDate ? obj.lastSeen.toDate().getTime() : 0;
            const active = (now - last) <= PRESENCE_TTL_MS && obj && obj.active === true;
            return { uid, obj: obj || {}, last, active };
          })
          .filter((x) => x.active)
          .sort((a, b) => b.last - a.last);

        if (entries.length === 0) {
          activeWrap.innerHTML = `<div class="item"><div class="muted">No one currently active.</div></div>`;
        } else {
          entries.forEach(({ uid, obj, last }) => {
            latestPresenceActiveSet.add(uid);

            const div = document.createElement("div");
            div.className = "item";
            const t = new Date(last).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

            div.innerHTML = `
              <div class="item-top">
                <div>
                  <div><strong>${escapeHtml(obj.name || "User")}</strong> <span class="small ok">• active</span></div>
                  <div class="small muted">userId: ${escapeHtml(uid)}</div>
                </div>
                <div class="small muted">last: ${t}</div>
              </div>
              <div class="btn-row">
                <button class="btn warn" data-act="forceRules" data-id="${uid}">Send to Rules</button>
                <button class="btn danger" data-act="revoke" data-id="${uid}">Revoke Access</button>
                <button class="btn danger" data-act="banActive" data-id="${uid}">Ban</button>
              </div>
            `;
            activeWrap.appendChild(div);
          });
        }

        // update offline list after presence refresh
        renderOfflineFromCaches();
      })
    );

    // 3) Live announcements list
    unsubs.push(
      announcementsCol(classId)
        .orderBy("timestamp", "desc")
        .limit(40)
        .onSnapshot((snap) => {
          const wrap = $("announcements");
          wrap.innerHTML = "";

          if (snap.empty) {
            wrap.innerHTML = `<div class="item"><div class="muted">No announcements.</div></div>`;
            return;
          }

          snap.forEach((doc) => {
            const a = doc.data() || {};
            const div = document.createElement("div");
            div.className = "item";
            div.innerHTML = `
              <div class="item-top">
                <div><strong>${escapeHtml(a.title || "Announcement")}</strong></div>
                <div class="small muted">${fmtTime(a.timestamp)}</div>
              </div>
              <div class="small" style="margin-top:6px;">${escapeHtml(a.text || "")}</div>
              <div class="btn-row">
                <button class="btn danger" data-act="delAnn" data-id="${doc.id}">Delete</button>
              </div>
            `;
            wrap.appendChild(div);
          });
        })
    );

    // 4) Live chat log (main only)
    unsubs.push(
      messagesCol(classId)
        .orderBy("timestamp", "desc")
        .limit(60)
        .onSnapshot((snap) => {
          const wrap = $("chatLog");
          wrap.innerHTML = "";

          if (snap.empty) {
            wrap.innerHTML = `<div class="item"><div class="muted">No messages.</div></div>`;
            return;
          }

          const docs = snap.docs.slice().reverse();
          docs.forEach((doc) => {
            const m = doc.data() || {};
            if (m.replyTo !== null) return;

            const div = document.createElement("div");
            div.className = "item";
            div.innerHTML = `
              <div class="item-top">
                <div><strong>${escapeHtml(m.name || "")}</strong> <span class="small muted">(${escapeHtml(m.userId || "")})</span></div>
                <div class="small muted">${fmtTime(m.timestamp)}</div>
              </div>
              <div style="margin-top:6px;">${escapeHtml(m.text || "")}</div>
              <div class="btn-row">
                <button class="btn danger" data-act="delMsg" data-id="${doc.id}">Delete</button>
              </div>
            `;
            wrap.appendChild(div);
          });
        })
    );

    // ===== offline renderer (uses caches) =====
    function renderOfflineFromCaches() {
      const offlineWrap = $("offlineUsers");
      if (!offlineWrap) return;

      offlineWrap.innerHTML = "";

      // offline = approved users not currently active
      const offlineEntries = Array.from(latestApprovedMap.entries())
        .filter(([uid]) => !latestPresenceActiveSet.has(uid))
        .map(([uid, u]) => ({ uid, u }))
        .sort((a, b) => {
          const at = a.u.updatedAt && a.u.updatedAt.toDate ? a.u.updatedAt.toDate().getTime() : 0;
          const bt = b.u.updatedAt && b.u.updatedAt.toDate ? b.u.updatedAt.toDate().getTime() : 0;
          return bt - at;
        });

      if (offlineEntries.length === 0) {
        offlineWrap.innerHTML = `<div class="item"><div class="muted">No approved offline users.</div></div>`;
        return;
      }

      offlineEntries.forEach(({ uid, u }) => {
        const div = document.createElement("div");
        div.className = "item";

        div.innerHTML = `
          <div class="item-top">
            <div>
              <div><strong>${escapeHtml(u.name || "User")}</strong> <span class="small muted">• offline</span></div>
              <div class="small muted">userId: ${escapeHtml(uid)}</div>
            </div>
            <div class="small muted">${fmtTime(u.updatedAt || u.createdAt)}</div>
          </div>
          <div class="btn-row">
            <button class="btn warn" data-act="forceRules" data-id="${uid}">Send to Rules</button>
            <button class="btn danger" data-act="revoke" data-id="${uid}">Revoke Access</button>
            <button class="btn danger" data-act="banActive" data-id="${uid}">Ban</button>
          </div>
        `;
        offlineWrap.appendChild(div);
      });
    }

    // delete all
    $("deleteAllChatsBtn").onclick = async () => {
      if (!confirm("Delete ALL chat messages for this class?")) return;
      setStatus("Deleting chat…");
      try {
        await deleteCollection(messagesCol(classId), 420);
        setStatus("✅ Deleted all chat messages.");
      } catch (e) {
        console.error(e);
        setStatus("❌ Failed deleting chat.");
      }
    };

    $("deleteAllAnnouncementsBtn").onclick = async () => {
      if (!confirm("Delete ALL announcements for this class?")) return;
      setStatus("Deleting announcements…");
      try {
        await deleteCollection(announcementsCol(classId), 420);
        setStatus("✅ Deleted all announcements.");
      } catch (e) {
        console.error(e);
        setStatus("❌ Failed deleting announcements.");
      }
    };
  }

  // ===== click actions =====
  document.addEventListener("click", async (e) => {
    const btn = e.target;
    if (!btn || !btn.dataset || !btn.dataset.act || !classId) return;

    const act = btn.dataset.act;
    const id = btn.dataset.id;

    try {
      if (act === "approve") {
        await pendingCol(classId).doc(id).set({
          approved: true,
          status: "approved",
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        setStatus("✅ Approved.");
      }

      if (act === "reject") {
        await pendingCol(classId).doc(id).set({
          approved: false,
          status: "rejected",
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        setStatus("✅ Rejected.");
      }

      if (act === "ban") {
        const p = await pendingCol(classId).doc(id).get();
        const u = p.exists ? (p.data() || {}) : {};

        await bannedCol(classId).doc(id).set({
          userId: id,
          name: u.name || "User",
          bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
          reason: "Banned by admin",
        }, { merge: true });

        await pendingCol(classId).doc(id).set({
          approved: false,
          status: "banned",
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        setStatus("✅ Banned.");
      }

      if (act === "revoke") {
        // works for both active + offline
        await pendingCol(classId).doc(id).set({
          approved: false,
          status: "rejected",
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        setStatus("✅ Revoked access (rejected).");
      }

      if (act === "banActive") {
        await bannedCol(classId).doc(id).set({
          userId: id,
          name: "User",
          bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
          reason: "Banned by admin",
        }, { merge: true });

        await pendingCol(classId).doc(id).set({
          approved: false,
          status: "banned",
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        setStatus("✅ Banned user.");
      }

      if (act === "forceRules") {
        const nonce = "fr_" + Math.random().toString(36).slice(2) + Date.now().toString(36);

        await pendingCol(classId).doc(id).set({
          forceRules: true,
          forceRulesNonce: nonce,
          forceRulesAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        setStatus("✅ Sent user to Rules screen.");
      }

      if (act === "delAnn") {
        await announcementsCol(classId).doc(id).delete();
        setStatus("✅ Announcement deleted.");
      }

      if (act === "delMsg") {
        await messagesCol(classId).doc(id).delete();
        setStatus("✅ Message deleted.");
      }
    } catch (err) {
      console.error(err);
      setStatus("❌ Action failed. Check rules/auth.");
    }
  });

  // ===== batch delete helper =====
  async function deleteCollection(colRef, batchSize = 420) {
    while (true) {
      const snap = await colRef.limit(batchSize).get();
      if (snap.empty) return;

      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();

      await new Promise((r) => setTimeout(r, 80));
    }
  }
});
