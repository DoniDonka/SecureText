document.addEventListener("DOMContentLoaded", () => {

const db = firebase.firestore();

// ----------------------
// CLASS + PIN SELECTION
// ----------------------
const classSelect = document.getElementById("classSelect");
const pinInput = document.getElementById("pinInput");
const classContinueBtn = document.getElementById("classContinueBtn");
const classError = document.getElementById("classError");
const classScreen = document.getElementById("class-screen");
const nameScreen = document.getElementById("name-screen");
const nameInput = document.getElementById("nameInput");
const continueBtn = document.getElementById("continueBtn");
const errorMsg = document.getElementById("errorMsg");

let selectedClass = "";
let approvedPin = false;

// Load classes from Firestore
db.collection("classes").get().then(snapshot => {
    snapshot.forEach(doc => {
        const cls = doc.id;
        const option = document.createElement("option");
        option.value = cls;
        option.textContent = cls;
        classSelect.appendChild(option);
    });
});

classContinueBtn.onclick = () => {
    selectedClass = classSelect.value;
    const pin = pinInput.value.trim();

    if (!selectedClass || !pin) {
        classError.textContent = "Select class and enter PIN.";
        return;
    }

    // Verify PIN
    db.collection("classes").doc(selectedClass).get().then(doc => {
        if (!doc.exists) {
            classError.textContent = "Class not found.";
            return;
        }
        if (doc.data().pin === pin) {
            approvedPin = true;
            classScreen.style.display = "none";
            nameScreen.style.display = "block";
        } else {
            classError.textContent = "Incorrect PIN.";
        }
    });
};

// ----------------------
// SESSION / NAME ENTRY
// ----------------------
continueBtn.onclick = () => {
    if (!approvedPin) return;

    const name = nameInput.value.trim();
    if (!name) {
        errorMsg.textContent = "Please enter a name.";
        return;
    }

    db.collection("pendingUsers").add({
        name: name,
        approved: false,
        class: selectedClass,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(docRef => {
        localStorage.setItem("userId", docRef.id);
        localStorage.setItem("userName", name);
        localStorage.setItem("userClass", selectedClass);
        showWaitingScreen(name);
        // Listen for approval
        db.collection("pendingUsers").doc(docRef.id).onSnapshot(doc => {
            if (doc.exists && doc.data().approved === true) {
                loadChat(name);
            }
        });
    });
};

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
    const userClass = localStorage.getItem("userClass");
    const userId = localStorage.getItem("userId");

    document.body.innerHTML = `
        <div id="chat-screen" class="night">
            <header class="chat-header">
                <div>
                    <h1>Welcome, ${name}!</h1>
                    <p class="subtitle">SecureText chat | Class: ${userClass}</p>
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

    const msgInput = document.getElementById("msgInput");
    const sendBtn = document.getElementById("sendBtn");
    const messagesDiv = document.getElementById("messages");
    const typingDiv = document.getElementById("typingIndicator");
    const themeToggle = document.getElementById("themeToggle");

    let typingTimeout;

    // Send message
    sendBtn.onclick = () => {
        const text = msgInput.value.trim();
        if (!text) return;

        db.collection("messages").add({
            name,
            userId,
            class: userClass,
            text,
            replyTo: null,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        msgInput.value = "";
        db.collection("typing").doc("status").set({ [userId]: false }, { merge: true });
    };

    // Typing indicator
    msgInput.addEventListener("input", () => {
        db.collection("typing").doc("status").set({ [userId]: true }, { merge: true });
        if (typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            db.collection("typing").doc("status").set({ [userId]: false }, { merge: true });
        }, 2000);
    });

    db.collection("typing").doc("status").onSnapshot(doc => {
        if (!doc.exists) return;
        const data = doc.data();
        const typingUsers = Object.entries(data).filter(([id,val]) => id!==userId && val===true);
        typingDiv.textContent = typingUsers.length > 0 ? "Someone is typing..." : "";
    });

    // Live messages (class-only)
    db.collection("messages").where("class","==",userClass).orderBy("timestamp","asc").onSnapshot(snapshot=>{
        messagesDiv.innerHTML="";
        snapshot.forEach(doc=>{
            const msg = doc.data();
            if(msg.replyTo!==null) return;
            const isOwn = msg.userId===userId;
            const time = msg.timestamp && msg.timestamp.toDate ? msg.timestamp.toDate().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) : "Sending...";
            messagesDiv.innerHTML+=`
                <div class="msg ${isOwn?"own":""}" data-id="${doc.id}">
                    <div class="msg-top">
                        <strong>${msg.name}</strong>
                        <span class="msg-time">${time}</span>
                    </div>
                    <div class="msg-text">${escapeHtml(msg.text)}</div>
                    <div class="msg-actions">
                        <button class="reply-btn" data-id="${doc.id}" data-text="${encodeURIComponent(msg.text||"")}">Reply</button>
                        <button class="view-replies-btn" data-id="${doc.id}" data-text="${encodeURIComponent(msg.text||"")}">View replies</button>
                        ${isOwn?`<button class="delete-btn" data-id="${doc.id}" data-parent="null">Delete</button>`:""}
                    </div>
                </div>
            `;
        });
        messagesDiv.scrollTop=messagesDiv.scrollHeight;
    });

    // Theme toggle
    themeToggle.onclick=()=>{
        const screen=document.getElementById("chat-screen");
        const isDay=screen.classList.contains("day");
        if(isDay){screen.classList.remove("day"); screen.classList.add("night"); themeToggle.textContent="🌙";}
        else{screen.classList.remove("night"); screen.classList.add("day"); themeToggle.textContent="☀️";}
    };
});

// ----------------------
// REPLIES
// ----------------------
function openReplies(parentId,parentText){
    const panel=document.getElementById("replies-panel");
    const title=document.getElementById("replies-title");
    const list=document.getElementById("replies-list");
    const sendReplyBtn=document.getElementById("sendReplyBtn");
    const replyInput=document.getElementById("replyMsgInput");
    const userId=localStorage.getItem("userId");
    const name=localStorage.getItem("userName");
    const userClass=localStorage.getItem("userClass");

    if(!panel) return;
    panel.classList.remove("hidden");
    title.textContent=`Replies to: "${decodeURIComponent(parentText).slice(0,40)}"`;
    sendReplyBtn.dataset.parentId=parentId;

    db.collection("messages").where("class","==",userClass).orderBy("timestamp","asc").onSnapshot(snapshot=>{
        list.innerHTML="";
        snapshot.forEach(doc=>{
            const msg=doc.data();
            if(msg.replyTo!==parentId) return;
            const isOwn=msg.userId===userId;
            const time=msg.timestamp && msg.timestamp.toDate ? msg.timestamp.toDate().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) : "Sending...";
            list.innerHTML+=`
                <div class="reply-msg ${isOwn?"own":""}" data-id="${doc.id}">
                    <div class="msg-top">
                        <strong>${msg.name}</strong>
                        <span class="msg-time">${time}</span>
                    </div>
                    <div class="msg-text">${escapeHtml(msg.text)}</div>
                    <div class="msg-actions">
                        ${isOwn?`<button class="delete-btn" data-id="${doc.id}" data-parent="${parentId}">Delete</button>`:""}
                    </div>
                </div>
            `;
        });
        list.scrollTop=list.scrollHeight;
    });

    sendReplyBtn.onclick=()=>{
        const text=replyInput.value.trim();
        if(!text) return;
        db.collection("messages").add({
            name,
            userId,
            class:userClass,
            text,
            replyTo:parentId,
            timestamp:firebase.firestore.FieldValue.serverTimestamp()
        });
        replyInput.value="";
        db.collection("typing").doc("status").set({[userId]:false},{merge:true});
    };
}

function closeReplies(){
    const panel=document.getElementById("replies-panel");
    if(panel) panel.classList.add("hidden");
}

// ----------------------
// DELETE
// ----------------------
function deleteMessage(messageId,parentId){
    db.collection("messages").doc(messageId).delete();
    const userId=localStorage.getItem("userId");
    db.collection("typing").doc("status").set({[userId]:false},{merge:true});
    if(parentId==="null"){
        db.collection("messages").where("replyTo","==",messageId).get().then(snapshot=>{
            const batch=db.batch();
            snapshot.forEach(doc=>batch.delete(doc.ref));
            batch.commit();
        });
    }
}

// ----------------------
// GLOBAL CLICK
// ----------------------
document.addEventListener("click",e=>{
    const target=e.target;
    if(target.id==="logoutBtn"){localStorage.clear(); location.reload();}
    if(target.id==="closeReplies"){closeReplies();}
    if(target.classList.contains("reply-btn")||target.classList.contains("view-replies-btn")){
        const parentId=target.dataset.id;
        const parentText=target.dataset.text||"";
        openReplies(parentId,parentText);
    }
    if(target.classList.contains("delete-btn")){
        const messageId=target.dataset.id;
        const parentId=target.dataset.parent;
        deleteMessage(messageId,parentId);
    }
});

// ----------------------
// ESCAPE HELPER
// ----------------------
function escapeHtml(str){
    if(!str) return "";
    return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

});
