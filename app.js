document.addEventListener("DOMContentLoaded", () => {

// ----------------------
// SESSION / CLASS / PIN LOGIC
// ----------------------
const savedId = localStorage.getItem("userId");
const savedName = localStorage.getItem("userName");
const savedClass = localStorage.getItem("userClass");

if(savedId && savedName && savedClass){
    db.collection("pendingUsers").doc(savedId).onSnapshot(doc => {
        if(!doc.exists){
            localStorage.clear();
            location.reload();
            return;
        }

        if(doc.data().approved === true){
            loadChat(savedName, savedClass);
        } else {
            showWaitingScreen(savedName);
        }
    });
} else {
    const nameScreen = document.getElementById("name-screen");
    const error = document.getElementById("errorMsg");

    // Create class select dropdown
    const classSelect = document.createElement("select");
    classSelect.id = "classSelect";
    const defaultOption = document.createElement("option");
    defaultOption.textContent = "--Select Class--";
    defaultOption.value = "";
    classSelect.appendChild(defaultOption);
    nameScreen.insertBefore(classSelect, document.getElementById("nameInput"));

    // Create PIN input
    const pinInput = document.createElement("input");
    pinInput.id = "pinInput";
    pinInput.type = "password";
    pinInput.placeholder = "Enter Class PIN";
    nameScreen.insertBefore(pinInput, document.getElementById("nameInput"));

    // Populate class select dynamically
    db.collection("classes").get().then(snapshot => {
        snapshot.forEach(doc => {
            const opt = document.createElement("option");
            opt.value = doc.id;
            opt.textContent = doc.id;
            classSelect.appendChild(opt);
        });
    }).catch(err => console.error("Error loading classes:", err));

    // Continue button logic
    const btn = document.getElementById("continueBtn");
    const input = document.getElementById("nameInput");

    btn.onclick = async () => {
        const name = input.value.trim();
        const cls = classSelect.value;
        const pin = pinInput.value.trim();

        if(!cls){
            error.textContent = "Please select a class.";
            return;
        }

        if(!pin){
            error.textContent = "Please enter class PIN.";
            return;
        }

        if(!name){
            error.textContent = "Please enter your name.";
            return;
        }

        try{
            const clsDoc = await db.collection("classes").doc(cls).get();
            if(!clsDoc.exists || clsDoc.data().pin !== pin){
                error.textContent = "Wrong PIN!";
                return;
            }

            // Add user to pendingUsers
            const docRef = await db.collection("pendingUsers").add({
                name: name,
                class: cls,
                approved: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            localStorage.setItem("userId", docRef.id);
            localStorage.setItem("userName", name);
            localStorage.setItem("userClass", cls);

            showWaitingScreen(name);

            db.collection("pendingUsers").doc(docRef.id).onSnapshot(doc => {
                if(doc.exists && doc.data().approved === true){
                    loadChat(name, cls);
                }
            });

        } catch(e){
            console.error(e);
            error.textContent = "Something went wrong. Try again.";
        }
    };
}

// ----------------------
// WAITING SCREEN
// ----------------------
function showWaitingScreen(name){
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
function loadChat(name, cls){
    document.body.innerHTML = `
        <div id="chat-screen" class="night">
            <header class="chat-header">
                <div>
                    <h1>Welcome, ${name}!</h1>
                    <p class="subtitle">Class: ${cls}</p>
                </div>
                <div class="chat-controls">
                    <button id="themeToggle">🌙</button>
                    <button id="logoutBtn">Logout</button>
                </div>
            </header>

            <div id="messages" class="messages"></div>
            <div id="typingIndicator" style="font-style: italic; margin: 5px 0;"></div>

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
    const typingDiv = document.getElementById("typingIndicator");
    const themeToggle = document.getElementById("themeToggle");

    let typingTimeout;

    // SEND MAIN MESSAGE
    sendBtn.onclick = () => {
        const text = msgInput.value.trim();
        if(!text) return;

        db.collection("messages").add({
            name: name,
            userId: userId,
            class: cls,
            text: text,
            replyTo: null,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        msgInput.value = "";

        // set typing false on send
        db.collection("typing").doc("status").set({
            [userId]: false
        }, { merge: true });
    };

    // TYPING INDICATOR
    msgInput.addEventListener("input", () => {
        db.collection("typing").doc("status").set({
            [userId]: true
        }, { merge: true });

        if(typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            db.collection("typing").doc("status").set({
                [userId]: false
            }, { merge: true });
        }, 2000);
    });

    // LIVE TYPING STATUS
    db.collection("typing").doc("status").onSnapshot(doc => {
        if(!doc.exists) return;

        const data = doc.data();
        const typingUsers = Object.entries(data)
            .filter(([id,val]) => id !== userId && val === true)
            .map(([id]) => id);

        typingDiv.textContent = typingUsers.length > 0 ? "Someone is typing..." : "";
    });

    // LIVE MAIN MESSAGES
    db.collection("messages").where("class","==",cls)
      .orderBy("timestamp","asc")
      .onSnapshot(snapshot => {
        messagesDiv.innerHTML = "";

        snapshot.forEach(doc => {
            const msg = doc.data();
            if(msg.replyTo !== null) return;

            const isOwn = msg.userId === userId;
            const time = msg.timestamp && msg.timestamp.toDate ?
                msg.timestamp.toDate().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }) :
                "Sending...";

            messagesDiv.innerHTML += `
                <div class="msg ${isOwn?"own":""}" data-id="${doc.id}">
                    <div class="msg-top">
                        <strong>${msg.name}</strong>
                        <span class="msg-time">${time}</span>
                    </div>
                    <div class="msg-text">${escapeHtml(msg.text)}</div>
                    <div class="msg-actions">
                        <button class="reply-btn" data-id="${doc.id}" data-text="${encodeURIComponent(msg.text||"")}">Reply</button>
                        <button class="view-replies-btn" data-id="${doc.id}" data-text="${encodeURIComponent(msg.text||"")}">View replies</button>
                        ${isOwn ? `<button class="delete-btn" data-id="${doc.id}" data-parent="null">Delete</button>`:""}
                    </div>
                </div>
            `;
        });

        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });

    // THEME TOGGLE
    themeToggle.onclick = () => {
        const screen = document.getElementById("chat-screen");
        const isDay = screen.classList.contains("day");

        if(isDay){
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

// ----------------------
// REPLIES
// ----------------------
function openReplies(parentId, parentText){
    const panel = document.getElementById("replies-panel");
    const title = document.getElementById("replies-title");
    const list = document.getElementById("replies-list");
    const sendReplyBtn = document.getElementById("sendReplyBtn");
    const replyInput = document.getElementById("replyMsgInput");
    const userId = localStorage.getItem("userId");
    const name = localStorage.getItem("userName");
    const cls = localStorage.getItem("userClass");

    if(!panel) return;

    panel.classList.remove("hidden");
    title.textContent = `Replies to: "${decodeURIComponent(parentText).slice(0,40)}"`;
    sendReplyBtn.dataset.parentId = parentId;

    db.collection("messages").where("class","==",cls)
      .orderBy("timestamp","asc")
      .onSnapshot(snapshot => {
        list.innerHTML = "";

        snapshot.forEach(doc => {
            const msg = doc.data();
            if(msg.replyTo !== parentId) return;

            const isOwn = msg.userId === userId;
            const time = msg.timestamp && msg.timestamp.toDate ?
                msg.timestamp.toDate().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }) :
                "Sending...";

            list.innerHTML += `
                <div class="reply-msg ${isOwn?"own":""}" data-id="${doc.id}">
                    <div class="msg-top">
                        <strong>${msg.name}</strong>
                        <span class="msg-time">${time}</span>
                    </div>
                    <div class="msg-text">${escapeHtml(msg.text)}</div>
                    <div class="msg-actions">
                        ${isOwn ? `<button class="delete-btn" data-id="${doc.id}" data-parent="${parentId}">Delete</button>`:""}
                    </div>
                </div>
            `;
        });

        list.scrollTop = list.scrollHeight;
    });

    sendReplyBtn.onclick = () => {
        const text = replyInput.value.trim();
        if(!text) return;

        db.collection("messages").add({
            name: name,
            userId: userId,
            class: cls,
            text: text,
            replyTo: parentId,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        replyInput.value = "";

        // set typing false on reply
        db.collection("typing").doc("status").set({
            [userId]: false
        }, { merge: true });
    };
}

function closeReplies(){
    const panel = document.getElementById("replies-panel");
    if(panel) panel.classList.add("hidden");
}

// DELETE
function deleteMessage(messageId, parentId){
    db.collection("messages").doc(messageId).delete();

    if(parentId==="null"){
        db.collection("messages").where("replyTo","==",messageId)
          .get().then(snapshot=>{
            const batch = db.batch();
            snapshot.forEach(doc=>batch.delete(doc.ref));
            return batch.commit();
        });
    }

    const userId = localStorage.getItem("userId");
    db.collection("typing").doc("status").set({
        [userId]: false
    }, { merge:true });
}

// GLOBAL CLICK
document.addEventListener("click", e=>{
    const target = e.target;

    if(target.id==="logoutBtn"){
        localStorage.clear();
        location.reload();
    }

    if(target.id==="closeReplies"){
        closeReplies();
    }

    if(target.classList.contains("reply-btn") || target.classList.contains("view-replies-btn")){
        const parentId = target.dataset.id;
        const parentText = target.dataset.text || "";
        openReplies(parentId, parentText);
    }

    if(target.classList.contains("delete-btn")){
        const messageId = target.dataset.id;
        const parentId = target.dataset.parent;
        deleteMessage(messageId,parentId);
    }
});

// ESCAPE HELPER
function escapeHtml(str){
    if(!str) return "";
    return str.replace(/&/g,"&amp;")
              .replace(/</g,"&lt;")
              .replace(/>/g,"&gt;");
}

});
