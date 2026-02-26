// chat.js (CLEANED - v8 CDN compatible, NO REACTIONS)
// Safe helper module you can include later if you want.
// Uses global `db` + `firebase` from firebase.js

(function () {
  if (!window.db || !window.firebase) {
    console.warn("chat.js: Firestore not found. Make sure firebase.js loads first.");
    return;
  }

  function classDocRef(classId) {
    return db.collection("classes").doc(classId);
  }
  function messagesCol(classId) {
    return classDocRef(classId).collection("messages");
  }
  function typingDoc(classId) {
    // Matches the system used in app.js v2
    return classDocRef(classId).collection("meta").doc("typing");
  }

  async function sendMessage(classId, { userId, name, text, replyTo = null }) {
    const msg = String(text || "").trim();
    if (!msg) return;

    return messagesCol(classId).add({
      userId: String(userId || ""),
      name: String(name || "User"),
      text: msg,
      replyTo: replyTo || null,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }

  // Soft-delete: marks message as deleted instead of deleting documents (saves reads)
  async function softDeleteMessage(classId, messageId) {
    if (!classId || !messageId) return;
    return messagesCol(classId).doc(messageId).set(
      {
        deleted: true,
        deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  // Typing: store boolean in meta/typing doc (single doc, low reads)
  async function setTyping(classId, userId, isTyping) {
    if (!classId || !userId) return;
    return typingDoc(classId).set({ [userId]: !!isTyping }, { merge: true });
  }

  // Expose as a global helper (optional use)
  window.ST_CHAT = {
    sendMessage,
    softDeleteMessage,
    setTyping,
  };
})();