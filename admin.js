// ELEMENTS
const adminLogin = document.getElementById("admin-login");
const adminDashboard = document.getElementById("admin-dashboard");
const pendingUsersDiv = document.getElementById("pendingUsers");

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loginError = document.getElementById("loginError");


// LOGIN BUTTON
loginBtn.onclick = async () => {

    const email = document.getElementById("adminEmail").value.trim();
    const password = document.getElementById("adminPassword").value.trim();

    loginError.textContent = "";

    if (!email || !password) {
        loginError.textContent = "Enter email and password.";
        return;
    }

    try {

        await auth.signInWithEmailAndPassword(email, password);

    } catch (error) {

        loginError.textContent = error.message;

    }

};


// LOGOUT BUTTON
logoutBtn.onclick = () => {

    auth.signOut();

};


// KEEP ADMIN LOGGED IN AFTER REFRESH
auth.onAuthStateChanged((user) => {

    if (user) {

        adminLogin.style.display = "none";
        adminDashboard.style.display = "block";

        startPendingUsersListener();

    } else {

        adminLogin.style.display = "block";
        adminDashboard.style.display = "none";

    }

});


// REALTIME LISTENER FOR PENDING USERS
function startPendingUsersListener() {

    db.collection("pendingUsers")
    .orderBy("createdAt", "asc")
    .onSnapshot((snapshot) => {

        pendingUsersDiv.innerHTML = "";

        snapshot.forEach((doc) => {

            const data = doc.data();

            // ONLY SHOW NON APPROVED USERS
            if (data.approved === true) return;

            const div = document.createElement("div");

            div.style.marginBottom = "10px";

            div.innerHTML = `
                <strong>${escapeHtml(data.name)}</strong>
                <button onclick="approveUser('${doc.id}')" style="margin-left:10px;">
                    Approve
                </button>
            `;

            pendingUsersDiv.appendChild(div);

        });

    }, (error) => {

        console.error("Pending users listener error:", error);

    });

}


// APPROVE USER (THIS FIXES YOUR WHOLE SYSTEM)
window.approveUser = async function(docId) {

    try {

        await db.collection("pendingUsers")
        .doc(docId)
        .update({

            approved: true

        });

    } catch (error) {

        console.error("Approve error:", error);

    }

};


// ESCAPE HTML FOR SAFETY
function escapeHtml(str) {

    if (!str) return "";

    return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

}
