// Firebase config (GitHub Pages + Firestore)
const firebaseConfig = {
  apiKey: "AIzaSyBLcIGjQUlprZSa4Xb4l_NirsBkZppiqJk",
  authDomain: "text-d83ac.firebaseapp.com",
  projectId: "text-d83ac",
  storageBucket: "text-d83ac.firebasestorage.app",
  messagingSenderId: "774345335493",
  appId: "1:774345335493:web:160763b83ed48f633d86ac",
  measurementId: "G-H29FGNXQZQ"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// GLOBAL references
const auth = firebase.auth();
const db = firebase.firestore();

// --- Persistence & offline (fewer reads, better UX on refresh) ---
try {
  if (firebase.firestore && firebase.firestore().enableIndexedDbPersistence) {
    db.enableIndexedDbPersistence({ forceOwnership: false }).catch(function (err) {
      if (err.code === "failed-precondition") console.warn("ST: persistence already enabled in another tab.");
      else if (err.code === "unimplemented") console.warn("ST: persistence not supported.");
    });
  }
} catch (e) { /* ignore */ }

// --- Firestore ref helpers (single place for paths) ---
const ST_REFS = {
  classDoc: function (cid) { return db.collection("classes").doc(cid); },
  pendingDoc: function (cid, uid) { return ST_REFS.classDoc(cid).collection("pendingUsers").doc(uid); },
  bannedDoc: function (cid, uid) { return ST_REFS.classDoc(cid).collection("bannedUsers").doc(uid); },
  messagesCol: function (cid) { return ST_REFS.classDoc(cid).collection("messages"); },
  announcementsCol: function (cid) { return ST_REFS.classDoc(cid).collection("announcements"); },
  metaDoc: function (cid, name) { return ST_REFS.classDoc(cid).collection("meta").doc(name || "commands"); },
  commandsDoc: function (cid) { return ST_REFS.metaDoc(cid, "commands"); },
  typingDoc: function (cid) { return ST_REFS.metaDoc(cid, "typing"); },
  presenceDoc: function (cid) { return ST_REFS.metaDoc(cid, "presence"); },
  pinnedDoc: function (cid) { return ST_REFS.metaDoc(cid, "pinned"); },
  reportsCol: function (cid) { return ST_REFS.classDoc(cid).collection("reports"); },
  checkInDoc: function (cid) { return ST_REFS.metaDoc(cid, "checkIn"); },
  activePollDoc: function (cid) { return ST_REFS.metaDoc(cid, "activePoll"); },
  moderationDoc: function (cid) { return ST_REFS.metaDoc(cid, "moderation"); }
};
if (typeof window !== "undefined") window.ST_REFS = ST_REFS;