document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  let currentClassId = null;
  let currentClassName = null;
  let liveUnsubs = [];

  function setStatus(msg) {
    const el = $("adminActionStatus");
    if (el) el.textContent = msg || "";
  }

  function clearListeners() {
    liveUnsubs.forEach((u) => { try { u(); } catch {} });
    liveUnsubs = [];
  }

  function classDocRef(classId) {
    return db.collection("classes").doc(classId);
  }
  function pendingUsersCol(classId) {
    return classDocRef(classId).collection("pendingUsers");
  }
  function bannedUsersCol(classId) {
    return classDocRef(classId).collection("bannedUsers");
  }
  function announcementsCol(classId) {
    return classDocRef(classId).collection("announcements");
  }
  function messagesCol(classId) {
    return classDocRef(classId).collection("messages");
  }
  function commandsDoc(classId) {
    return classDocRef(classId).collection("meta").doc("commands");
  }
  function pendingAttachmentsCol(classId) {
    return classDocRef(classId).collection("pendingAttachments");
  }

  // ===== auth UI =====
  $("loginBtn").onclick = async () => {
    const email = $("adminEmail").value.trim();
    const pass = $("adminPassword").value.trim();
    $("loginError").textContent = "";

    try {
      await auth.signInWithEmailAndPassword(email, pass);
    } catch (e) {
      console.error(e);
      $("loginError").textContent = e.message || "Login failed.";
    }
  };

  $("logoutBtn").onclick = async () => {
    clearListeners();
    currentClassId = null;
    currentClassName = null;
    await auth.signOut();
  };

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      $("admin-login").style.display = "block";
      $("admin-dashboard").style.display = "none";
      return;
    }

    $("admin-login").style.display = "none";
    $("admin-dashboard").style.display = "block";
    $("adminInfo").textContent = `Logged in as: ${user.email}`;

    loadClassButtons();
  });

  // ===== class buttons =====
  async function loadClassButtons() {
    const wrap = $("classButtons");
    const err = $("classError");
    wrap.innerHTML = "Loading...";
    err.textContent = "";

    try {
      const snap = await db.collection("classes").get();
      wrap.innerHTML = "";

      if (snap.empty) {
        err.textContent = "No classes found.";
        return;
      }

      snap.forEach((doc) => {
        const data = doc.data() || {};
        const btn = document.createElement("button");
        btn.textContent = data.name || doc.id;
        btn.style.marginRight = "8px";
        btn.style.marginBottom = "8px";
        btn.onclick = () => selectClass(doc.id, data.name || doc.id);
        wrap.appendChild(btn);
      });
    } catch (e) {
      console.error(e);
      err.textContent = "Failed to load classes.";
    }
  }

  function selectClass(classId, className) {
    clearListeners();
    currentClassId = classId;
    currentClassName = className;

    $("admin-screen").style.display = "block";
    $("classTitle").textContent = `Class: ${className} (${classId})`;

    wirePendingUsers();
    wireBannedUsers();
    wireAnnouncements();
    wireLiveChat();
    wirePendingAttachments();
    wireControls();
  }

  // ===== controls =====
  function wireControls() {
    $("forceRulesBtn").onclick = async () => {
      if (!currentClassId) return;
      setStatus("Forcing rules re-accept for everyone...");
      try {
        await commandsDoc(currentClassId).set({
          forceRulesAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        setStatus("Done: rules re-accept triggered.");
      } catch (e) {
        console.error(e);
        setStatus("Failed to force rules.");
      }
      setTimeout(() => setStatus(""), 2500);
    };

    $("forceLogoutBtn").onclick = async () => {
      if (!currentClassId) return;
      if (!confirm("Force logout EVERYONE in this class?")) return;
      setStatus("Forcing logout for everyone...");
      try {
        await commandsDoc(currentClassId).set({
          forceLogoutAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        setStatus("Done: logout triggered.");
      } catch (e) {
        console.error(e);
        setStatus("Failed to force logout.");
      }
      setTimeout(() => setStatus(""), 2500);
    };

    $("deleteAllChatBtn").onclick = async () => {
      if (!currentClassId) return;
      if (!confirm("DELETE ALL CHAT in this class? This cannot be undone.")) return;
      setStatus("Deleting all chat...");
      try {
        await deleteCollectionInChunks(messagesCol(currentClassId), 200);
        setStatus("Deleted all chat.");
      } catch (e) {
        console.error(e);
        setStatus("Failed deleting chat (check rules/quota).");
      }
      setTimeout(() => setStatus(""), 2500);
    };

    $("deleteAllAnnouncementsBtn").onclick = async () => {
      if (!currentClassId) return;
      if (!confirm("DELETE ALL ANNOUNCEMENTS in this class?")) return;
      setStatus("Deleting all announcements...");
      try {
        await deleteCollectionInChunks(announcementsCol(currentClassId), 200);
        setStatus("Deleted all announcements.");
      } catch (e) {
        console.error(e);
        setStatus("Failed deleting announcements.");
      }
      setTimeout(() => setStatus(""), 2500);
    };
  }

  async function deleteCollectionInChunks(colRef, batchSize) {
    while (true) {
      const snap = await colRef.limit(batchSize).get();
      if (snap.empty) break;

      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();

      if (snap.size < batchSize) break;
    }
  }

  // ===== pending users =====
  function wirePendingUsers() {
    const tbody = $("pendingUsersTable").querySelector("tbody");
    liveUnsubs.push(
      pendingUsersCol(currentClassId).orderBy("createdAt", "asc").onSnapshot((snap) => {
        tbody.innerHTML = "";
        snap.forEach((doc) => {
          const u = doc.data() || {};
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${(u.name || "")}</td>
            <td><button data-act="approve" data-id="${doc.id}">Approve</button></td>
            <td><button data-act="reject" data-id="${doc.id}">Reject</button></td>
            <td><button class="danger" data-act="ban" data-id="${doc.id}">Ban</button></td>
          `;
          tbody.appendChild(tr);
        });

        tbody.querySelectorAll("button").forEach((btn) => {
          btn.onclick = () => handlePendingAction(btn.dataset.act, btn.dataset.id);
        });
      })
    );
  }

  async function handlePendingAction(act, docId) {
    const ref = pendingUsersCol(currentClassId).doc(docId);
    const snap = await ref.get();
    if (!snap.exists) return;

    const data = snap.data() || {};
    const userId = data.userId || docId;
    const name = data.name || "Unknown";

    if (act === "approve") {
      await ref.set({ status: "approved", approved: true, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      setStatus(`Approved ${name}`);
    }

    if (act === "reject") {
      await ref.set({ status: "rejected", approved: false, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      setStatus(`Rejected ${name}`);
    }

    if (act === "ban") {
      if (!confirm(`Ban ${name}?`)) return;
      await bannedUsersCol(currentClassId).doc(userId).set({
        userId,
        name,
        bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      await ref.set({ status: "banned", approved: false, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      setStatus(`Banned ${name}`);
    }

    setTimeout(() => setStatus(""), 2000);
  }

  // ===== banned users =====
  function wireBannedUsers() {
    const tbody = $("bannedUsersTable").querySelector("tbody");
    liveUnsubs.push(
      bannedUsersCol(currentClassId).orderBy("bannedAt", "desc").onSnapshot((snap) => {
        tbody.innerHTML = "";
        snap.forEach((doc) => {
          const u = doc.data() || {};
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${(u.name || "")}</td>
            <td class="muted">${(u.userId || doc.id)}</td>
            <td><button data-id="${doc.id}">Unban</button></td>
          `;
          tbody.appendChild(tr);
        });

        tbody.querySelectorAll("button").forEach((btn) => {
          btn.onclick = async () => {
            await bannedUsersCol(currentClassId).doc(btn.dataset.id).delete();
            setStatus("Unbanned.");
            setTimeout(() => setStatus(""), 1500);
          };
        });
      })
    );
  }

  // ===== announcements =====
  function wireAnnouncements() {
    $("announceBtn").onclick = async () => {
      const text = $("announcementInput").value.trim();
      if (!text) return;

      await announcementsCol(currentClassId).add({
        text,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });

      $("announcementInput").value = "";
    };

    liveUnsubs.push(
      announcementsCol(currentClassId).orderBy("timestamp", "desc").limit(30).onSnapshot((snap) => {
        const box = $("announcementsList");
        box.innerHTML = "";
        snap.forEach((doc) => {
          const a = doc.data() || {};
          const t = a.timestamp && a.timestamp.toDate
            ? a.timestamp.toDate().toLocaleString()
            : "Sending...";
          const div = document.createElement("div");
          div.className = "msg";
          div.innerHTML = `<div class="msgTop"><strong>${t}</strong></div><div>${a.text || ""}</div>`;
          box.appendChild(div);
        });
      })
    );
  }

  // ===== live chat =====
  function wireLiveChat() {
    const chatBox = $("chatMessages");

    $("adminSendBtn").onclick = async () => {
      const text = $("adminChatInput").value.trim();
      if (!text) return;

      await messagesCol(currentClassId).add({
        type: "text",
        name: "ADMIN",
        userId: "ADMIN",
        text,
        replyTo: null,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });

      $("adminChatInput").value = "";
    };

    liveUnsubs.push(
      messagesCol(currentClassId).orderBy("timestamp", "desc").limit(80).onSnapshot((snap) => {
        chatBox.innerHTML = "";
        const docs = snap.docs.slice().reverse();
        docs.forEach((doc) => {
          const m = doc.data() || {};
          const t = m.timestamp && m.timestamp.toDate ? m.timestamp.toDate().toLocaleTimeString() : "Sending...";
          const div = document.createElement("div");
          div.className = "msg";

          let body = "";
          if (m.type === "image" && m.attachmentUrl) {
            body = `
              <div>${m.text || ""}</div>
              <img class="preview" src="${m.attachmentUrl}" alt="img">
            `;
          } else {
            body = `<div>${m.text || ""}</div>`;
          }

          div.innerHTML = `
            <div class="msgTop">
              <div><strong>${m.name || ""}</strong> <span class="muted">(${m.userId || ""})</span></div>
              <div class="muted">${t}</div>
            </div>
            ${body}
            <div class="row" style="margin-top:8px;">
              <button class="danger" data-del="${doc.id}">Delete</button>
            </div>
          `;
          chatBox.appendChild(div);
        });

        chatBox.querySelectorAll("button[data-del]").forEach((b) => {
          b.onclick = async () => {
            const id = b.getAttribute("data-del");
            if (!confirm("Delete this message?")) return;
            await messagesCol(currentClassId).doc(id).delete();
          };
        });

        chatBox.scrollTop = chatBox.scrollHeight;
      })
    );
  }

  // ===== pending attachments approval =====
  function wirePendingAttachments() {
    const wrap = $("pendingAttachments");

    liveUnsubs.push(
      pendingAttachmentsCol(currentClassId).orderBy("createdAt", "desc").limit(40).onSnapshot(async (snap) => {
        wrap.innerHTML = "";

        if (snap.empty) {
          wrap.innerHTML = `<div class="muted">No pending attachments.</div>`;
          return;
        }

        for (const doc of snap.docs) {
          const a = doc.data() || {};
          if (a.status !== "pending") continue;

          const card = document.createElement("div");
          card.className = "card";
          card.style.marginTop = "10px";

          let previewUrl = "";
          try {
            if (a.storagePath) previewUrl = await storage.ref().child(a.storagePath).getDownloadURL();
          } catch {}

          card.innerHTML = `
            <div class="msgTop">
              <div><strong>${a.uploaderName || "Unknown"}</strong> <span class="muted">(${a.uploaderId || ""})</span></div>
              <div class="muted">${a.fileName || ""}</div>
            </div>
            <div class="muted" style="margin-top:6px;">Status: pending</div>
            ${previewUrl ? `<img class="preview" src="${previewUrl}" alt="preview">` : `<div class="muted" style="margin-top:8px;">(No preview URL)</div>`}
            <div class="row" style="margin-top:10px;">
              <button data-approve="${doc.id}">Approve</button>
              <button class="danger" data-reject="${doc.id}">Reject</button>
            </div>
          `;

          wrap.appendChild(card);
        }

        wrap.querySelectorAll("button[data-approve]").forEach((b) => {
          b.onclick = async () => {
            const id = b.getAttribute("data-approve");
            await approveAttachment(id);
          };
        });

        wrap.querySelectorAll("button[data-reject]").forEach((b) => {
          b.onclick = async () => {
            const id = b.getAttribute("data-reject");
            if (!confirm("Reject and delete this upload?")) return;
            await rejectAttachment(id);
          };
        });
      })
    );
  }

  async function approveAttachment(uploadId) {
    const ref = pendingAttachmentsCol(currentClassId).doc(uploadId);
    const snap = await ref.get();
    if (!snap.exists) return;

    const a = snap.data() || {};
    if (!a.storagePath) return;

    // get download URL
    const url = await storage.ref().child(a.storagePath).getDownloadURL();

    // create approved message
    await messagesCol(currentClassId).add({
      type: "image",
      name: a.uploaderName || "Unknown",
      userId: a.uploaderId || "unknown",
      text: "📷 Image",
      attachmentUrl: url,
      attachmentPath: a.storagePath,
      replyTo: null,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });

    // mark approved
    await ref.set({ status: "approved", approvedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    setStatus("Attachment approved.");
    setTimeout(() => setStatus(""), 1800);
  }

  async function rejectAttachment(uploadId) {
    const ref = pendingAttachmentsCol(currentClassId).doc(uploadId);
    const snap = await ref.get();
    if (!snap.exists) return;

    const a = snap.data() || {};
    try {
      if (a.storagePath) await storage.ref().child(a.storagePath).delete();
    } catch {}

    await ref.set({ status: "rejected", rejectedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
    setStatus("Attachment rejected.");
    setTimeout(() => setStatus(""), 1800);
  }
});