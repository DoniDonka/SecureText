// --- ADMIN LOGIN ---
document.getElementById("loginBtn").onclick = function () {
    const email = document.getElementById("adminEmail").value.trim();
    const password = document.getElementById("adminPassword").value;

    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            document.getElementById("admin-login").style.display = "none";
            document.getElementById("admin-dashboard").style.display = "block";
            loadPendingUsers();
        })
        .catch(() => {
            document.getElementById("loginError").innerText = "Invalid login";
        });
};

// --- LOAD PENDING USERS ---
function loadPendingUsers() {
    db.collection("pendingUsers")
        .where("approved", "==", false)
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

// --- LOGOUT ---
document.getElementById("logoutBtn").onclick = function () {
    auth.signOut().then(() => {
        location.reload();
    });
};