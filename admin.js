document.addEventListener("DOMContentLoaded",()=>{
const pendingTable=document.querySelector("#pendingUsersTable tbody");
const announcementInput=document.getElementById("announcementInput");
const announceBtn=document.getElementById("announceBtn");
const announcementList=document.getElementById("announcementList");
const classSelectAdmin=document.getElementById("classSelectAdmin");
const loadLogsBtn=document.getElementById("loadLogsBtn");
const chatLogsDiv=document.getElementById("chatLogs");

// ----------------------
// Load classes for admin
// ----------------------
db.collection("classes").get().then(snapshot=>{
    snapshot.forEach(doc=>{
        const cls=doc.id;
        const option=document.createElement("option");
        option.value=cls;
        option.textContent=cls;
        classSelectAdmin.appendChild(option);
    });
});

// ----------------------
// Load pending users
// ----------------------
function loadPendingUsers(){
    db.collection("pendingUsers").where("approved","==",false)
    .onSnapshot(snapshot=>{
        pendingTable.innerHTML="";
        snapshot.forEach(doc=>{
            const data=doc.data();
            const tr=document.createElement("tr");
            tr.innerHTML=`
                <td>${data.name}</td>
                <td>${data.class}</td>
                <td><button class="approveBtn" data-id="${doc.id}">Approve</button></td>
                <td><button class="banBtn" data-id="${doc.id}">Ban</button></td>
            `;
            pendingTable.appendChild(tr);
        });
    });
}
loadPendingUsers();

// ----------------------
// Approve & Ban buttons
// ----------------------
document.addEventListener("click",e=>{
    if(e.target.classList.contains("approveBtn")){
        const id=e.target.dataset.id;
        db.collection("pendingUsers").doc(id).update({approved:true});
    }
    if(e.target.classList.contains("banBtn")){
        const id=e.target.dataset.id;
        db.collection("pendingUsers").doc(id).delete();
        // optionally remove user messages
        db.collection("messages").where("userId","==",id).get().then(snap=>{
            const batch=db.batch();
            snap.forEach(d=>batch.delete(d.ref));
            batch.commit();
        });
    }
});

// ----------------------
// Announcements
// ----------------------
announceBtn.onclick=()=>{
    const msg=announcementInput.value.trim();
    if(!msg) return;
    db.collection("announcements").add({
        message: msg,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    announcementInput.value="";
};

// Show announcements live
db.collection("announcements").orderBy("timestamp","desc").onSnapshot(snapshot=>{
    announcementList.innerHTML="";
    snapshot.forEach(doc=>{
        const data=doc.data();
        const li=document.createElement("li");
        li.textContent=data.message;
        announcementList.appendChild(li);
    });
});

// ----------------------
// Chat logs per class
// ----------------------
loadLogsBtn.onclick=()=>{
    const cls=classSelectAdmin.value;
    if(!cls){chatLogsDiv.textContent="Select a class"; return;}
    db.collection("messages").where("class","==",cls).orderBy("timestamp","asc").get().then(snapshot=>{
        chatLogsDiv.innerHTML="";
        snapshot.forEach(doc=>{
            const data=doc.data();
            const time=data.timestamp && data.timestamp.toDate ? data.timestamp.toDate().toLocaleTimeString() : "";
            const p=document.createElement("p");
            p.textContent=`[${time}] ${data.name}: ${data.text}`;
            chatLogsDiv.appendChild(p);
        });
    });
};
});
