// firebase.js (UPGRADED - v8 CDN compatible)
// - Enables offline persistence + unlimited cache (BIG read reduction)
// - Keeps global auth + db variables exactly as your app expects

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBLcIGjQUlprZSa4Xb4l_NirsBkZppiqJk",
  authDomain: "text-d83ac.firebaseapp.com",
  projectId: "text-d83ac",
  storageBucket: "text-d83ac.firebasestorage.app",
  messagingSenderId: "774345335493",
  appId: "1:774345335493:web:160763b83ed48f633d86ac",
  measurementId: "G-H29FGNXQZQ",
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// GLOBAL references (your app.js/admin.js rely on these)
const auth = firebase.auth();
const db = firebase.firestore();

// =========================
// Firestore performance settings
// =========================
try {
  // Unlimited local cache (reduces reads when users refresh / revisit)
  db.settings({
    cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
    ignoreUndefinedProperties: true,
  });
} catch (e) {
  // settings() can only be called before any Firestore usage.
  // If something else touched Firestore first, we just skip silently.
  // (Your app should still work.)
  console.warn("Firestore settings skipped:", e && e.message ? e.message : e);
}

try {
  // Offline persistence (multi-tab safe)
  db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
    // Common reasons:
    // - failed-precondition: multiple tabs open but syncTabs not supported
    // - unimplemented: browser doesn't support persistence
    console.warn("Persistence disabled:", err && err.code ? err.code : err);
  });
} catch (e) {
  console.warn("Persistence init error:", e && e.message ? e.message : e);
}

// Optional: expose for debugging (doesn't change behavior)
window.ST_DB = db;
window.ST_AUTH = auth;