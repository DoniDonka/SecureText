document.addEventListener("DOMContentLoaded", () => {
const db = firebase.firestore();

// --- CONFIG: ADMIN EMAILS ---
const admins = {
    "doni@admin.com": "DoniClass",
    "jimboy@admin.com": "EthanClass"
};

// --- LOGIN ---
let email = prompt("Enter admin email:");
if(!admins[email]) {
    alert("Not an admin!");
    location.reload();
} else {
    document.getElementById("adminName").textContent = `Logged in as ${email}`;
}

// --- LOGOUT ---
document.getElementById("logoutBtn").onclick = () => location.reload();

// --- LOAD CLASSES ---
const classesDiv = document.getElementById("classes");
const classError = document.getElementById("classError");
const adminScreen = document.getElementById("admin-screen");
const classTitle = document.getElementById("classTitle");
const pendingUsersTable = document.querySelector("#pendingUsersTable tbody");
const bannedUsersTable = document.querySelector("#bannedUsersTable tbody");
const announcementInput = document.getElementById("announcementInput");
const announceBtn = document.getElementById("announceBtn");
const announcementsList = document.getElementById("announcementsList");
const chatMessages = document.getElementById("chatMessages");

let currentClass = null;

// ADMIN can only manage their own class
const allowedClass = admins[email];
const btn = document.createElement("button");
btn.textContent = allowedClass;
btn.onclick = () => loadClass(allowedClass);
classesDiv.appendChild(btn);

// --- LOAD CLASS FUNCTION ---
function loadClass(classId) {
    currentClass = classId;
    classesDiv.style.display = "none";
    adminScreen.style.display = "block";
    classTitle.textContent = `Managing: ${classId}`;

    // Load pending users
    db.collection("pendingUsers").where("classId","==",classId).where("approved","==",false)
    .onSnapshot(snapshot => {
        pendingUsersTable.innerHTML = "";
        snapshot.forEach(doc => {
            const tr = document.createElement("tr");
            const nameTd = document.createElement("td");
            nameTd.textContent = doc.data().name;
            const approveTd = document.createElement("td");
            const denyTd = document.createElement("td");
            const approveBtn = document.createElement("button");
            approveBtn.textContent = "Approve";
            approveBtn.onclick = () => doc.ref.update({approved:true});
            const denyBtn = document.createElement("button");
            denyBtn.textContent = "Deny";
            denyBtn.onclick = () => doc.ref.delete();
            approveTd.appendChild(approveBtn);
            denyTd.appendChild(denyBtn);
            tr.appendChild(nameTd);
            tr.appendChild(approveTd);
            tr.appendChild(denyTd);
            pendingUsersTable.appendChild(tr);
        });
    });

    // Load banned users
    db.collection("bannedUsers").where("classId","==",classId)
    .onSnapshot(snapshot => {
        bannedUsersTable.innerHTML = "";
        snapshot.forEach(doc => {
            const tr = document.createElement("tr");
            const nameTd = document.createElement("td");
            nameTd.textContent = doc.data().name;
            tr.appendChild(nameTd);
            bannedUsersTable.appendChild(tr);
        });
    });

    // ANNOUNCEMENTS
    announceBtn.onclick = () => {
        const text = announcementInput.value.trim();
        if(!text) return;
        db.collection("announcements").add({
            classId: classId,
            text: text,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        announcementInput.value = "";
    };
    db.collection("announcements").where("classId","==",classId).orderBy("timestamp")
    .onSnapshot(snapshot => {
        announcementsList.innerHTML = "";
        snapshot.forEach(doc => {
            const p = document.createElement("p");
            p.textContent = doc.data().text;
            announcementsList.appendChild(p);
        });
    });

    // LIVE CHAT
    db.collection("messages").where("classId","==",classId).orderBy("timestamp")
    .onSnapshot(snapshot => {
        chatMessages.innerHTML = "";
        snapshot.forEach(doc => {
            const msg = doc.data();
            const div = document.createElement("div");
            div.className = `msg ${msg.userId === "admin"? "own" : ""}`;
            const time = msg.timestamp && msg.timestamp.toDate ? msg.timestamp.toDate().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"}) : "Sending...";
            div.textContent = `[${time}] ${msg.name}: ${msg.text}`;
            chatMessages.appendChild(div);
        });
        chatMessages.scrollTop = chatMessages.scrollHeight;
    });
}

});
