// --- SESSION CHECK ON LOAD ---
const savedId = localStorage.getItem("userId");
const savedName = localStorage.getItem("userName");

if (savedId && savedName) {
    // User already exists → check approval status
    db.collection("pendingUsers").doc(savedId)
        .onSnapshot((doc) => {
            if (!doc.exists) {
                // If admin deleted them, reset
                localStorage.clear();
                location.reload();
                return;
            }

            if (doc.data().approved === true) {
                loadChat(savedName);
            } else {
                // Still waiting
                const nameScreen = document.getElementById("name-screen");
                if (nameScreen) {
                    nameScreen.innerHTML = `
                        <h1>SecureText</h1>
                        <p>Your name has been submitted.</p>
                        <p>Please wait for admin approval.</p>
                    `;
                }
            }
        });

    // Stop the rest of the script from re-binding the button
} else {
    // Normal first-time flow
    const btn = document.getElementById("continueBtn");
    const input = document.getElementById("nameInput");
    const error = document.getElementById("errorMsg");

    if (btn) {
        btn.onclick = () => {
            const name = input.value.trim();

            if (!name) {
                error.textContent = "Please enter a name.";
                return;
            }

            db.collection("pendingUsers").add({
                name: name,
                approved: false
            })
            .then((docRef) => {
                localStorage.setItem("userId", docRef.id);
                localStorage.setItem("userName", name);

                const nameScreen = document.getElementById("name-screen");
                if (nameScreen) {
                    nameScreen.innerHTML = `
                        <h1>SecureText</h1>
                        <p>Your name has been submitted.</p>
                        <p>Please wait for admin approval.</p>
                    `;
                }

                db.collection("pendingUsers").doc(docRef.id)
                    .onSnapshot((doc) => {
                        if (doc.exists && doc.data().approved === true) {
                            loadChat(name);
                        }
                    });
            })
            .catch(() => {
                error.textContent = "Something went wrong. Try again.";
            });
        };
    }
}

// --- CHAT UI + LOGIC ---

function loadChat(name) {
    document.body.innerHTML = `
        <div id="chat-screen" class="day">
            <header class="chat-header">
                <div>
                    <h1>Welcome, ${name}!</h1>
                    <p class="subtitle">SecureText chat</p>
                </div>
                <div class="chat-controls">
                    <button id="themeToggle">🌙</button>
                    <button id="logoutBtn">Logout</button>
                </div>
            </header>

            <div id="messages" class="messages"></div>

            <div id="replies-panel" class="replies hidden">
                <div class="replies-header">
                    <span id="replies-title">Replies</span>
                    <button id="closeReplies">Close</button>
                </div>
                <div id="replies-list" class="replies-list"></div>
                <div id="reply-input" class="reply-input">
                    <input id="replyMsgInput" type="text" placeholder="Type a reply">
                    <button id="sendReplyBtn">Send</button>
                </div>
            </div>

            <div id="chat-input">
                <input id="msgInput" type="text" placeholder="Type a message">
                <button id="sendBtn">Send</button>
            </div>
        </div>
    `;

    const userId = localStorage.getItem("userId");
    const msgInput = document.getElementById("msgInput");
    const sendBtn = document.getElementById("sendBtn");
    const messagesDiv = document.getElementById("messages");
    const themeToggle = document.getElementById("themeToggle");

    // --- SEND MAIN MESSAGE ---
    sendBtn.onclick = () => {
        const text = msgInput.value.trim();
        if (!text) return;

        db.collection("messages").add({
            name: name,
            userId: userId,
            text: text,
            replyTo: null,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        msgInput.value = "";
    };

    // --- LIVE MAIN MESSAGES (NO REPLIES) ---
    db.collection("messages")
      .where("replyTo", "==", null)
      .orderBy("timestamp")
      .onSnapshot((snapshot) => {
          messagesDiv.innerHTML = "";
          snapshot.forEach((doc) => {
              const msg = doc.data();
              const isOwn = msg.userId === userId;

              messagesDiv.innerHTML += `
                  <div class="msg" data-id="${doc.id}">
                      <div class="msg-top">
                          <strong>${msg.name}</strong>
                      </div>
                      <div class="msg-text">${escapeHtml(msg.text)}</div>
                      <div class="msg-actions">
                          <button class="reply-btn" data-id="${doc.id}" data-text="${encodeURIComponent(msg.text)}">Reply</button>
                          <button class="view-replies-btn" data-id="${doc.id}" data-text="${encodeURIComponent(msg.text)}">View replies</button>
                          ${isOwn ? `<button class="delete-btn" data-id="${doc.id}" data-parent="null">Delete</button>` : ""}
                      </div>
                  </div>
              `;
          });

          messagesDiv.scrollTop = messagesDiv.scrollHeight;
      });

    // --- THEME TOGGLE ---
    themeToggle.onclick = () => {
        const screen = document.getElementById("chat-screen");
        const isDay = screen.classList.contains("day");

        if (isDay) {
            screen.classList.remove("day");
            screen.classList.add("night");
            themeToggle.textContent = "☀️";
        } else {
            screen.classList.remove("night");
            screen.classList.add("day");
            themeToggle.textContent = "🌙";
        }
    };
}

// --- REPLIES LOGIC ---

function openReplies(parentId, parentText) {
    const panel = document.getElementById("replies-panel");
    const title = document.getElementById("replies-title");
    const list = document.getElementById("replies-list");
    const sendReplyBtn = document.getElementById("sendReplyBtn");
    const replyInput = document.getElementById("replyMsgInput");
    const userId = localStorage.getItem("userId");
    const name = localStorage.getItem("userName");

    if (!panel) return;

    panel.classList.remove("hidden");
    title.textContent = `Replies to: "${decodeURIComponent(parentText).slice(0, 40)}"`;
    sendReplyBtn.dataset.parentId = parentId;

    // Load replies
    db.collection("messages")
      .where("replyTo", "==", parentId)
      .orderBy("timestamp")
      .onSnapshot((snapshot) => {
          list.innerHTML = "";
          snapshot.forEach((doc) => {
              const msg = doc.data();
              const isOwn = msg.userId === userId;

              list.innerHTML += `
                  <div class="reply-msg" data-id="${doc.id}">
                      <div class="msg-top">
                          <strong>${msg.name}</strong>
                      </div>
                      <div class="msg-text">${escapeHtml(msg.text)}</div>
                      <div class="msg-actions">
                          ${isOwn ? `<button class="delete-btn" data-id="${doc.id}" data-parent="${parentId}">Delete</button>` : ""}
                      </div>
                  </div>
              `;
          });

          list.scrollTop = list.scrollHeight;
      });

    // Send reply
    sendReplyBtn.onclick = () => {
        const text = replyInput.value.trim();
        if (!text) return;

        db.collection("messages").add({
            name: name,
            userId: userId,
            text: text,
            replyTo: parentId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        replyInput.value = "";
    };
}

function closeReplies() {
    const panel = document.getElementById("replies-panel");
    if (panel) {
        panel.classList.add("hidden");
    }
}

// --- DELETE MESSAGE (USER ONLY; ADMIN USES ADMIN PANEL) ---

function deleteMessage(messageId, parentId) {
    // Delete the message itself
    db.collection("messages").doc(messageId).delete();

    // If it's a parent message, also delete its replies
    if (parentId === "null") {
        db.collection("messages")
          .where("replyTo", "==", messageId)
          .get()
          .then((snapshot) => {
              const batch = db.batch();
              snapshot.forEach((doc) => batch.delete(doc.ref));
              return batch.commit();
          });
    }
}

// --- GLOBAL CLICK HANDLER (REPLY / VIEW REPLIES / CLOSE / DELETE / LOGOUT) ---

document.addEventListener("click", (e) => {
    const target = e.target;

    if (target.id === "logoutBtn") {
        localStorage.clear();
        location.reload();
    }

    if (target.id === "closeReplies") {
        closeReplies();
    }

    if (target.classList.contains("reply-btn") || target.classList.contains("view-replies-btn")) {
        const parentId = target.dataset.id;
        const parentText = target.dataset.text || "";
        openReplies(parentId, parentText);
    }

    if (target.classList.contains("delete-btn")) {
        const messageId = target.dataset.id;
        const parentId = target.dataset.parent;
        deleteMessage(messageId, parentId);
    }
});

// --- SMALL HELPER TO AVOID HTML INJECTION ---
function escapeHtml(str) {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}