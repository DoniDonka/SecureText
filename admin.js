document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  let currentClassId = null;
  let currentClassName = null;

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

  // logout
  $("logoutBtn").onclick = async () => {
    try { await auth.signOut(); } catch {}
    location.reload();
  };

  // ===== find which classes this admin can manage =====
  async function loadAllowedClasses(adminEmail) {
    $("classButtons").innerHTML = "";
    $("classError").textContent = "";

    try {
      // admins array contains the email
      const snap = await db.collection("classes")
        .where("admins", "array-contains", adminEmail)
        .get();

      if (snap.empty) {
        $("classError").textContent = "No class assigned to this admin email in Firestore.";
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
    currentClassId = classId;
    currentClassName = className;

    $("admin-screen").style.display = "block";
    $("classTitle").textContent = `Managing: ${className} (${classId})`;

    wirePending();
    wireBanned();
    wireAnnouncements();
    wireChat();
  }

  // ===== pending users =====
  function wirePending() {
    const tbody = $("pendingUsersTable").querySelector("tbody");
    tbody.innerHTML = "";

    pendingCol(currentClassId)
      .orderBy("createdAt", "asc")
      .onSnapshot((snap) => {
        tbody.innerHTML = "";
        snap.forEach((doc) => {
          const u = doc.data() || {};
          if ((u.status || "pending") !== "pending") return; // only show pending

          const tr = document.createElement("tr");

          const tdName = document.createElement("td");
          tdName.textContent = u.name || "(no name)";

          const tdApprove = document.createElement("td");
          const tdReject = document.createElement("td");
          const tdBan = document.createElement("td");

          const approveBtn = document.createElement("button");
          approveBtn.textContent = "Approve";
          approveBtn.onclick = () => doc.ref.update({
            approved: true,
            status: "approved",
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });

          const rejectBtn = document.createElement("button");
          rejectBtn.textContent = "Reject";
          rejectBtn.onclick = () => doc.ref.update({
            approved: false,
            status: "rejected",
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });

          const banBtn = document.createElement("button");
          banBtn.textContent = "Ban";
          banBtn.onclick = async () => {
            // mark pending as banned
            await doc.ref.update({
              approved: false,
              status: "banned",
              updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // create bannedUsers/{userId}
            await bannedCol(currentClassId).doc(doc.id).set({
              userId: doc.id,
              name: u.name || "",
              bannedAt: firebase.firestore.FieldValue.serverTimestamp(),
              by: auth.currentUser ? auth.currentUser.email : "admin"
            });

            // optional: remove their messages
            const msgSnap = await messagesCol(currentClassId).get();
            const batch = db.batch();
            msgSnap.forEach((m) => {
              const d = m.data() || {};
              if (d.userId === doc.id) batch.delete(m.ref);
            });
            await batch.commit();
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
  }

  // ===== banned users =====
  function wireBanned() {
    const tbody = $("bannedUsersTable").querySelector("tbody");
    tbody.innerHTML = "";

    bannedCol(currentClassId).onSnapshot((snap) => {
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
          // also clear status so they can re-request
          await pendingCol(currentClassId).doc(doc.id).set({
            approved: false,
            status: "rejected",
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
        };
        tdUnban.appendChild(unbanBtn);

        tr.appendChild(tdName);
        tr.appendChild(tdId);
        tr.appendChild(tdUnban);
        tbody.appendChild(tr);
      });
    });
  }

  // ===== announcements =====
  function wireAnnouncements() {
    $("announceBtn").onclick = async () => {
      const text = $("announcementInput").value.trim();
      if (!text) return;

      await announcementsCol(currentClassId).add({
        text,
        by: auth.currentUser ? auth.currentUser.email : "admin",
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      $("announcementInput").value = "";
    };

    announcementsCol(currentClassId)
      .orderBy("timestamp", "asc")
      .onSnapshot((snap) => {
        $("announcementsList").innerHTML = "";
        snap.forEach((doc) => {
          const a = doc.data() || {};
          const t = a.timestamp && a.timestamp.toDate
            ? a.timestamp.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "";
          const div = document.createElement("div");
          div.style.margin = "6px 0";
          div.textContent = `[${t}] ${a.text || ""}`;
          $("announcementsList").appendChild(div);
        });
        if (snap.empty) $("announcementsList").innerHTML = "<div style='opacity:.7'>No announcements yet.</div>";
      });
  }

  // ===== admin chat =====
  function wireChat() {
    $("adminSendBtn").onclick = async () => {
      const text = $("adminChatInput").value.trim();
      if (!text) return;

      await messagesCol(currentClassId).add({
        name: "Admin",
        userId: "admin",
        text,
        replyTo: null,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });

      $("adminChatInput").value = "";
    };

    messagesCol(currentClassId)
      .orderBy("timestamp", "asc")
      .onSnapshot((snap) => {
        const box = $("chatMessages");
        box.innerHTML = "";
        snap.forEach((doc) => {
          const m = doc.data() || {};
          const t = m.timestamp && m.timestamp.toDate
            ? m.timestamp.toDate().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : "Sending...";
          const div = document.createElement("div");
          div.className = "msg";
          div.textContent = `[${t}] ${m.name || ""}: ${m.text || ""}`;
          box.appendChild(div);
        });
        box.scrollTop = box.scrollHeight;
      });
  }
});