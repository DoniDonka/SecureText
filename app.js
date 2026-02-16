document.addEventListener("DOMContentLoaded", () => {
const savedId = localStorage.getItem("userId");
const savedName = localStorage.getItem("userName");
const savedClass = localStorage.getItem("userClass");

// ----------------------
// CLASS SELECTION SETUP
// ----------------------
const classSelect = document.getElementById("classSelect");
db.collection("classes").get().then(snapshot=>{
  snapshot.forEach(doc=>{
    const opt = document.createElement("option");
    opt.value = doc.id;
    opt.textContent = doc.id;
    classSelect.appendChild(opt);
  });
});

// ----------------------
// SESSION / ENTRY LOGIC
// ----------------------
if(savedId && savedName && savedClass){
    db.collection("pendingUsers").doc(savedId).onSnapshot(doc=>{
        if(!doc.exists){
            localStorage.clear();
            location.reload();
            return;
        }
        if(doc.data().approved===true){
            loadChat(savedName, savedClass);
        } else {
            showWaitingScreen(savedName, savedClass);
        }
    });
} else {
    const btn = document.getElementById("continueBtn");
    const input = document.getElementById("nameInput");
    const pinInput = document.getElementById("pinInput");
    const error = document.getElementById("errorMsg");

    btn.onclick = async () => {
        const name = input.value.trim();
        const cls = classSelect.value;
        const pin = pinInput.value.trim();

        if(!cls){ error.textContent="Select a class."; return; }
        if(!pin){ error.textContent="Enter PIN."; return; }
        if(!name){ error.textContent="Enter your name."; return; }

        // Check PIN
        const clsDoc = await db.collection("classes").doc(cls).get();
        if(!clsDoc.exists || clsDoc.data().pin !== pin){
            error.textContent="Wrong PIN!";
            return;
        }

        // Submit to pendingUsers
        db.collection("pendingUsers").add({
            name:name,
            class:cls,
            approved:false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(docRef=>{
            localStorage.setItem("userId", docRef.id);
            localStorage.setItem("userName", name);
            localStorage.setItem("userClass", cls);
            showWaitingScreen(name, cls);
        }).catch(()=>{error.textContent="Something went wrong."});
    }
}

function showWaitingScreen(name, cls){
    document.body.innerHTML=`
    <div id="waiting-screen">
      <h1>SecureText</h1>
      <p>${name} (${cls}), your name has been submitted.</p>
      <p>Please wait for admin approval.</p>
    </div>
    `;
}

// ----------------------
// CHAT UI + LOGIC
// ----------------------
function loadChat(name, cls){
document.body.innerHTML=`
<div id="chat-screen" class="night">
<header class="chat-header">
  <div><h1>Welcome, ${name}!</h1><p class="subtitle">SecureText chat (${cls})</p></div>
  <div class="chat-controls"><button id="themeToggle">🌙</button><button id="logoutBtn">Logout</button></div>
</header>

<div id="messages" class="messages"></div>
<div id="typingIndicator" style="font-style: italic; margin:5px 0;"></div>

<div id="chat-input">
<input id="msgInput" type="text" placeholder="Type a message">
<button id="sendBtn">Send</button>
</div>
</div>
`;

const userId = localStorage.getItem("userId");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");
const messagesDiv = document.getElementById("messages");
const typingDiv = document.getElementById("typingIndicator");
const themeToggle = document.getElementById("themeToggle");

let typingTimeout;

// SEND
sendBtn.onclick=()=>{
const text=msgInput.value.trim();
if(!text) return;
db.collection("messages").add({
  name:name,
  class:cls,
  userId:userId,
  text:text,
  replyTo:null,
  timestamp:firebase.firestore.FieldValue.serverTimestamp()
});
msgInput.value="";
db.collection("typing").doc("status").set({[userId]:false},{merge:true});
};

// TYPING
msgInput.addEventListener("input",()=>{
db.collection("typing").doc("status").set({[userId]:true},{merge:true});
if(typingTimeout) clearTimeout(typingTimeout);
typingTimeout=setTimeout(()=>{db.collection("typing").doc("status").set({[userId]:false},{merge:true});},2000);
});

// LIVE TYPING
db.collection("typing").doc("status").onSnapshot(doc=>{
if(!doc.exists) return;
const data=doc.data();
const typingUsers=Object.entries(data).filter(([id,val])=>id!==userId && val===true).map(([id])=>id);
typingDiv.textContent = typingUsers.length>0 ? "Someone is typing...":"";
});

// LIVE MESSAGES
db.collection("messages").where("class","==",cls).orderBy("timestamp","asc").onSnapshot(snapshot=>{
messagesDiv.innerHTML="";
snapshot.forEach(doc=>{
const msg=doc.data();
if(msg.replyTo!==null) return;
const isOwn=msg.userId===userId;
const time=msg.timestamp&&msg.timestamp.toDate ? msg.timestamp.toDate().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}):"Sending...";
messagesDiv.innerHTML+=`<div class="msg ${isOwn?"own":""}" data-id="${doc.id}"><div class="msg-top"><strong>${msg.name}</strong><span class="msg-time">${time}</span></div><div class="msg-text">${escapeHtml(msg.text)}</div></div>`;
});
messagesDiv.scrollTop=messagesDiv.scrollHeight;
});

// THEME
themeToggle.onclick=()=>{
const screen=document.getElementById("chat-screen");
const isDay=screen.classList.contains("day");
if(isDay){screen.classList.remove("day");screen.classList.add("night");themeToggle.textContent="🌙";}
else{screen.classList.remove("night");screen.classList.add("day");themeToggle.textContent="☀️";}
};
}

// ESCAPE HTML
function escapeHtml(str){if(!str) return"";return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
