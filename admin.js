const adminLogin = document.getElementById("admin-login");
const adminDashboard = document.getElementById("admin-dashboard");
const pendingUsersDiv = document.getElementById("pendingUsers");

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loginError = document.getElementById("loginError");


// LOGIN
loginBtn.onclick = async () => {

    const email = document.getElementById("adminEmail").value;
    const password = document.getElementById("adminPassword").value;

    try {

        await auth.signInWithEmailAndPassword(email, password);

    } catch (error) {

        loginError.innerText = error.message;

    }

};


// LOGOUT
logoutBtn.onclick = () => {

    auth.signOut();

};


// KEEP LOGIN AFTER REFRESH
auth.onAuthStateChanged(user => {

    if (user) {

        adminLogin.style.display = "none";
        adminDashboard.style.display = "block";

        listenForPendingUsers();

    }
    else {

        adminLogin.style.display = "block";
        adminDashboard.style.display = "none";

    }

});


// REALTIME PENDING USERS LISTENER
function listenForPendingUsers() {

    db.collection("pendingUsers")
    .orderBy("timestamp", "asc")
    .onSnapshot(snapshot => {

        pendingUsersDiv.innerHTML = "";

        snapshot.forEach(doc => {

            const data = doc.data();

            const div = document.createElement("div");

            div.innerHTML = `
                ${data.name}
                <button onclick="approveUser('${doc.id}', '${data.name}')">
                    Approve
                </button>
            `;

            pendingUsersDiv.appendChild(div);

        });

    });

}


// APPROVE USER
async function approveUser(docId, name) {

    await db.collection("approvedUsers").add({

        name: name,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()

    });

    await db.collection("pendingUsers").doc(docId).delete();

}
