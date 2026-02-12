// --- ADMIN LOGIN ---
document.getElementById("loginBtn").onclick = function () {
    const email = document.getElementById("adminEmail").value;
    const password = document.getElementById("adminPassword").value;

    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            document.getElementById("admin-login").style.display = "none";
            document.getElementById("admin-dashboard").style.display = "block";
            loadPendingUsers();
            loadMessages();
        })
        .catch(() => {
            document.getElementById("loginError").innerText = "Invalid login";
        });
};

// --- LOAD PENDING USERS ---
function loadPendingUsers() {
    db.collection("pendingUsers").where("approved", "==", false)
        .onSnapshot((snapshot) => {
            const container = document.getElementById("pendingUsers");
            container.innerHTML = "";

            snapshot.forEach((doc) => {
                const data = doc.data();
                const div = document.createElement("div");
                div.className = "pending-user";
                div.innerHTML = `
                    <p>${data.name}</p>
                    <button onclick="approveUser('${doc.id}')">Approve</button>
                    <button onclick="denyUser('${doc.id}')">Deny</button>
                `;
                container.appendChild(div);
            });
        });
}

// --- APPROVE USER ---
function approveUser(id) {
    db.collection("pendingUsers").doc(id).update({
        approved: true
    });
}

// --- DENY USER ---
function denyUser(id) {
    db.collection("pendingUsers").doc(id).delete();
}

// --- LOAD MESSAGES ---
function loadMessages() {
    db.collection("messages").orderBy("timestamp")
        .onSnapshot((snapshot) => {
            const container = document.getElementById("adminMessages");
            container.innerHTML = "";

            snapshot.forEach((doc) => {
                const data = doc.data();
                const div = document.createElement("div");
                div.className = "message";
                div.innerHTML = `
                    <p><strong>${data.name}:</strong> ${data.text}</p>
                    <button onclick="deleteMessage('${doc.id}')">Delete</button>
                `;
                container.appendChild(div);
            });
        });
}

// --- DELETE MESSAGE ---
function deleteMessage(id) {
    db.collection("messages").doc(id).delete();
}