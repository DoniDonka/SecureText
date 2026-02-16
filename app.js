document.addEventListener("DOMContentLoaded", () => {

const db = firebase.firestore();

// --- GLOBAL VARS ---
let selectedClassId = null;
let selectedClassName = null;
let userId = localStorage.getItem("userId");
let userName = localStorage.getItem("userName");

// --- STEP 1: LOAD CLASSES ---
const classContainer = document.getElementById("classes");
const classError = document.getElementById("classError");

db.collection("classes").get().then(snapshot => {
    if(snapshot.empty) {
        classError.textContent = "No classes found!";
        return;
    }
    snapshot.forEach(doc => {
        const cls = doc.data();
        const btn = document.createElement("button");
        btn.textContent = doc.id;
        btn.className = "class-btn";
        btn.onclick = () => selectClass(doc.id, cls.pin);
        classContainer.appendChild(btn);
    });
}).catch(err => {
    classError.textContent = "Failed to load classes.";
});

// --- STEP 2: SELECT CLASS + PIN ---
function selectClass(classId, pin) {
    selectedClassId = classId;
    selectedClassName = classId;
    document.getElementById("class-screen").style.display = "none";
    document.getElementById("pin-screen").style.display = "block";
    document.getElementById("selectedClassName").textContent = selectedClassName;

    document.getElementById("pinBtn").onclick = () => {
        const enteredPin = document.getElementById("pinInput").value.trim();
        if(!enteredPin) return;
        if(enteredPin !== pin) {
            document.getElementById("pinError").textContent = "Wrong PIN!";
            return;
        }
        document.getElementById("pin-screen").style.display = "none";
        document.getElementById("name-screen").style.display = "block";
    };
}

// --- STEP 3: ENTER NAME & CREATE PENDING USER ---
document.getElementById("continueBtn").onclick = () => {
    const name = document.getElementById("nameInput").value.trim();
    if(!name) return document.getElementById("errorMsg").textContent = "Enter a name";

    db.collection("pendingUsers").add({
        name: name,
        classId: selectedClassId,
        approved: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(docRef => {
        localStorage.setItem("userId", docRef.id);
        localStorage.setItem("userName", name);
        localStorage.setItem("classId", selectedClassId);
        document.getElementById("name-screen").style.display = "none";
        document.getElementById("waiting-screen").style.display = "block";
        document.getElementById("waitingName").textContent = name;

        // WATCH APPROVAL
        db.collection("pendingUsers").doc(docRef.id).onSnapshot(doc => {
            if(doc.exists && doc.data().approved) {
                startChat(name, selectedClassId);
            }
        });
    }).catch(() => {
        document.getElementById("errorMsg").textContent = "Something went wrong.";
    });
};

// --- STEP 4: CHAT ---
function startChat(name, classId) {
    document.getElementById("waiting-screen").style.display = "none";
    document.getElementById("chat-screen").style.display = "block";
    document.getElementById("chatClassName").textContent = classId;

    const msgInput = document.getElementById("msgInput");
    const sendBtn = document.getElementById("sendBtn");
    const messagesDiv = document.getElementById("messages");
    const typingDiv = document.getElementById("typingIndicator");
    const logoutBtn = document.getElementById("logoutBtn");

    userId = localStorage.getItem("userId");
    userName = localStorage.getItem("userName");

    let typingTimeout;

    // --- SEND MESSAGE ---
    sendBtn.onclick = () => {
        const text = msgInput.value.trim();
        if(!text) return;

        db.collection("messages").add({
            name: userName,
            userId: userId,
            classId: classId,
            text: text,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });

        msgInput.value = "";

        db.collection("typing").doc(classId).set({ [userId]: false }, { merge: true });
    };

    // --- TYPING INDICATOR ---
    msgInput.addEventListener("input", () => {
        db.collection("typing").doc(classId).set({ [userId]: true }, { merge: true });

        if(typingTimeout) clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            db.collection("typing").doc(classId).set({ [userId]: false }, { merge: true });
        }, 1500);
    });

    // --- WATCH TYPING ---
    db.collection("typing").doc(classId).onSnapshot(doc => {
        if(!doc.exists) return;
        const data = doc.data();
        const typingUsers = Object.entries(data).filter(([id,val]) => id !== userId && val).map(([id])=>id);
        typingDiv.textContent = typingUsers.length>0 ? "Someone is typing..." : "";
    });

    // --- LIVE MESSAGES ---
    db.collection("messages").where("classId","==",classId).orderBy("timestamp").onSnapshot(snapshot => {
        messagesDiv.innerHTML = "";
        snapshot.forEach(doc => {
            const msg = doc.data();
            const isOwn = msg.userId === userId;
            const time = msg.timestamp && msg.timestamp.toDate ? msg.timestamp.toDate().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) : "Sending...";
            const div = document.createElement("div");
            div.className = `msg ${isOwn?"own":""}`;
            div.innerHTML = `<strong>${msg.name}</strong> [${time}]: ${escapeHtml(msg.text)}`;
            messagesDiv.appendChild(div);
        });
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    });

    // --- LOGOUT ---
    logoutBtn.onclick = () => {
        localStorage.clear();
        location.reload();
    };
}

// --- ESCAPE HELPER ---
function escapeHtml(str) {
    if(!str) return "";
    return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// --- AUTO-LOAD IF APPROVED ---
if(userId && userName && localStorage.getItem("classId")) {
    db.collection("pendingUsers").doc(userId).onSnapshot(doc => {
        if(doc.exists && doc.data().approved) {
            startChat(userName, doc.data().classId);
        }
    });
}
});
