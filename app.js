document.addEventListener("DOMContentLoaded", () => {

// ----------------------
// SESSION / ENTRY LOGIC
// ----------------------
const savedId = localStorage.getItem("userId");
const savedName = localStorage.getItem("userName");

if (savedId && savedName) {
    db.collection("pendingUsers").doc(savedId).onSnapshot((doc) => {
        if (!doc.exists) {
            localStorage.clear();
            location.reload();
            return;
        }

        if (doc.data().approved === true) {
            loadChat(savedName);
        } else {
            showWaitingScreen(savedName);
        }
    });
} else {
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

            db.collection("pendingUsers")
                .add({
                    name: name,
                    approved: false,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                })
                .then((docRef) => {
                    localStorage.setItem("userId", docRef.id);
                    localStorage.setItem("userName", name);
                    showWaitingScreen(name);

                    db.collection("pendingUsers")
                        .doc(docRef.id)
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

function showWaitingScreen(name) {
    document.body.innerHTML = `
        <div id="waiting-screen">
            <h1>SecureText</h1>
            <p>${name}, your name has been submitted.</p>
            <p>Please wait for admin approval.</p>
        </div>
    `;
}

// ----------------------
// CHAT UI + LOGIC
// ----------------------
function loadChat(name) {
    document.body.innerHTML = `
        <div id="chat-screen" class="night">
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
                <div class="reply-input">
                    <input id="replyMsgInput" type="text" placeholder="Reply...">
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

    // SEND MAIN MESSAGE
    sendBtn.onclick = () => {
        const text = msgInput.value.trim();
        if (!text) return;

        db.collection("messages").add({
            name: name,
            userId: userId,
            text: text,
            replyTo: null,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });

        msgInput.value = "";
    };

    // LIVE MAIN MESSAGES
    db.collection("messages")
        .orderBy("timestamp", "asc")
        .onSnapshot((snapshot) => {
            messagesDiv.innerHTML = "";
            snapshot.forEach((doc) => {
                const msg = doc.data();
                if (msg.replyTo !== null) return;

                const isOwn = msg.userId === userId;
                const time =
                    msg.timestamp && msg.timestamp.toDate
                        ? msg.timestamp.toDate().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})
                        : "Sending...";

                messagesDiv.innerHTML += `
                    <div class="msg ${isOwn ? "own" : ""}" data-id="${doc.id}">
                        <div class="msg-top">
                            <strong>${msg.name}</strong>
                            <span class="msg-time">${time}</span>
                        </div>
                        <div class="msg-text">${escapeHtml(msg.text)}</div>
                        <div class="msg-actions">
                            <button class="reply-btn" data-id="${doc.id}" data-text="${encodeURIComponent(msg.text || "")}">Reply</button>
                            <button class="view-replies-btn" data-id="${doc.id}" data-text="${encodeURIComponent(msg.text || "")}">View replies</button>
                            ${isOwn ? `<button class="delete-btn" data-id="${doc.id}" data-parent="null">Delete</button>` : ""}
                        </div>
                    </div>
                `;
            });
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }, (error) => console.error("Firestore listener error:", error));

    // THEME TOGGLE
    themeToggle.onclick = () => {
        const screen = document.getElementById("chat-screen");
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

    // ----------------------
    // APPROVED USERS SIDEBAR
    // ----------------------
    if (!document.getElementById("approved-sidebar")) {
        const sidebar = document.createElement("div");
        sidebar.id = "approved-sidebar";
        sidebar.style.cssText = `
            position: fixed;
            top: 80px;
            right: 0;
            width: 180px;
            height: calc(100% - 100px);
            background-color: #111;
            color: #fff;
            padding: 10px;
            overflow-y: auto;
            border-left: 2px solid #333;
            z-index: 999;
            font-family: sans-serif;
        `;
        sidebar.innerHTML = `<h4>Approved Users</h4><div id="approved-users-list"></div>`;
        document.body.appendChild(sidebar);

        const chatScreen = document.getElementById("chat-screen");
        if (chatScreen) chatScreen.style.marginRight = "190px";
    }

    const approvedUsersList = document.getElementById("approved-users-list");
    db.collection("pendingUsers")
      .where("approved", "==", true)
      .orderBy("createdAt", "asc")
      .onSnapshot((snapshot) => {
          if (!approvedUsersList) return;
          approvedUsersList.innerHTML = "";
          snapshot.forEach((doc) => {
              const user = doc.data();
              const div = document.createElement("div");
              div.textContent = user.name;
              div.style.padding = "4px 0";
              approvedUsersList.appendChild(div);
          });
      });
}

// ----------------------
// REPLIES
// ----------------------
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
    title.textContent = `Replies to: "${decodeURIComponent(parentText).slice(0,40)}"`;
    sendReplyBtn.dataset.parentId = parentId;

    db.collection("messages")
      .orderBy("timestamp", "asc")
      .onSnapshot((snapshot) => {
          list.innerHTML = "";
          snapshot.forEach((doc) => {
              const msg = doc.data();
              if (msg.replyTo !== parentId) return;

              const isOwn = msg.userId === userId;
              const time = msg.timestamp && msg.timestamp.toDate
                  ? msg.timestamp.toDate().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})
                  : "Sending...";

              list.innerHTML += `
                  <div class="reply-msg ${isOwn ? "own" : ""}" data-id="${doc.id}">
                      <div class="msg-top">
                          <strong>${msg.name}</strong>
                          <span class="msg-time">${time}</span>
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

    sendReplyBtn.onclick = () => {
        const text = replyInput.value.trim();
        if (!text) return;

        db.collection("messages").add({
            name: name,
            userId: userId,
            text: text,
            replyTo: parentId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        });

        replyInput.value = "";
    };
}

function closeReplies() {
    const panel = document.getElementById("replies-panel");
    if (panel) panel.classList.add("hidden");
}

// DELETE
function deleteMessage(messageId, parentId) {
    db.collection("messages").doc(messageId).delete();

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

// GLOBAL CLICK
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

// ESCAPE HELPER
function escapeHtml(str) {
    if (!str) return "";
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

}); // END DOMContentLoaded
