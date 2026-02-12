let currentUID = null;
let userDocRef = null;

// Wait for Firebase Auth to be ready
auth.onAuthStateChanged(user => {
    if (user) {
        currentUID = user.uid;
    }
});

// Handle name submission
document.getElementById("submitName").onclick = async () => {
    const name = document.getElementById("nameInput").value.trim();
    if (!name) return;

    // Sign in anonymously
    await auth.signInAnonymously();

    // Create pending user doc
    userDocRef = db.collection("pendingUsers").doc(currentUID);
    await userDocRef.set({
        name: name,
        approved: false,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Switch to waiting screen
    document.getElementById("name-screen").style.display = "none";
    document.getElementById("waiting-screen").style.display = "flex";

    // Listen for approval
    userDocRef.onSnapshot(doc => {
        if (doc.exists && doc.data().approved === true) {
            document.getElementById("waiting-screen").style.display = "none";
            document.getElementById("chat-screen").style.display = "flex";
            startChat();
        }
    });
};

// Start chat listener
function startChat() {
    db.collection("rooms").doc("main").collection("messages")
        .orderBy("createdAt")
        .onSnapshot(snapshot => {
            const messagesDiv = document.getElementById("messages");
            messagesDiv.innerHTML = "";

            snapshot.forEach(doc => {
                const msg = doc.data();
                const div = document.createElement("div");
                div.textContent = msg.name + ": " + msg.text;
                messagesDiv.appendChild(div);
            });
        });

    document.getElementById("sendBtn").onclick = sendMessage;
}

async function sendMessage() {
    const text = document.getElementById("messageInput").value.trim();
    if (!text) return;

    await db.collection("rooms").doc("main").collection("messages").add({
        text: text,
        name: (await userDocRef.get()).data().name,
        ownerId: currentUID,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        parentId: null
    });

    document.getElementById("messageInput").value = "";
}