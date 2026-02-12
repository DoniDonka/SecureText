// LOGIN
document.getElementById("loginBtn").onclick = async () => {
    const email = document.getElementById("adminEmail").value;
    const password = document.getElementById("adminPassword").value;

    try {
        await auth.signInWithEmailAndPassword(email, password);

        document.getElementById("admin-login").style.display = "none";
        document.getElementById("admin-dashboard").style.display = "block";

        loadPendingUsers();
    } catch (error) {
        document.getElementById("loginError").textContent = "Invalid login.";
    }
};

// LOGOUT
document.getElementById("logoutBtn").onclick = async () => {
    await auth.signOut();
    location.reload();
};

// LOAD PENDING USERS
function loadPendingUsers() {
    db.collection("pendingUsers")
        .where("approved", "==", false)
        .onSnapshot(snapshot => {
            const list = document.getElementById("pendingList");
            list.innerHTML = "";

            snapshot.forEach(doc => {
                const data = doc.data();

                const div = document.createElement("div");
                div.className = "pendingUser";
                div.innerHTML = `
                    <strong>${data.name}</strong>
                    <button onclick="approveUser('${doc.id}')">Approve</button>
                    <button onclick="denyUser('${doc.id}')">Deny</button>
                `;

                list.appendChild(div);
            });
        });
}

// APPROVE USER
async function approveUser(uid) {
    await db.collection("pendingUsers").doc(uid).update({
        approved: true
    });
}

// DENY USER
async function denyUser(uid) {
    await db.collection("pendingUsers").doc(uid).delete();
}