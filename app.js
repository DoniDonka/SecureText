const btn = document.getElementById("continueBtn");
const input = document.getElementById("nameInput");
const error = document.getElementById("errorMsg");

btn.onclick = () => {
    const name = input.value.trim();

    if (!name) {
        error.textContent = "Please enter a name.";
        return;
    }

    db.collection("pendingUsers").add({
        name: name,
        approved: false
    })
    .then(() => {
        document.getElementById("name-screen").innerHTML = `
            <h1>SecureText</h1>
            <p>Your name has been submitted.</p>
            <p>Please wait for admin approval.</p>
        `;
    })
    .catch(() => {
        error.textContent = "Something went wrong. Try again.";
    });
};