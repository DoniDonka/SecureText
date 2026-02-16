// chat.js

import { db, auth } from "./firebase.js";
import { collection, addDoc, serverTimestamp, updateDoc, doc } from "firebase/firestore";

export async function sendMessage(classId, text, replyTo = null) {
  await addDoc(collection(db, "classes", classId, "messages"), {
    sender: auth.currentUser.uid,
    text,
    replyTo,
    deleted: false,
    timestamp: serverTimestamp()
  });
}

export async function deleteMessage(classId, messageId) {
  await updateDoc(doc(db, "classes", classId, "messages", messageId), {
    deleted: true
  });
}
export async function typing(classId, isTyping) {
  await updateDoc(doc(db, "classes", classId, "typing", auth.currentUser.uid), {
    typing: isTyping
  });
}
import { doc, updateDoc, increment } from "firebase/firestore";
import { db, auth } from "./firebase.js";

export async function reactToMessage(classId, messageId, emoji) {
  const uid = auth.currentUser.uid;

  const ref = doc(db, "classes", classId, "messages", messageId);

  await updateDoc(ref, {
    [`reactions.${emoji}.${uid}`]: true
  });
}

export async function removeReaction(classId, messageId, emoji) {
  const uid = auth.currentUser.uid;

  const ref = doc(db, "classes", classId, "messages", messageId);

  await updateDoc(ref, {
    [`reactions.${emoji}.${uid}`]: false
  });
}
export async function sendThreadMessage(classId, parentId, text) {
  await addDoc(collection(db, "classes", classId, "threads"), {
    parentId,
    sender: auth.currentUser.uid,
    text,
    timestamp: Date.now()
  });

  await updateDoc(
    doc(db, "classes", classId, "messages", parentId),
    { threadCount: increment(1) }
  );
}
export async function editMessage(classId, messageId, newText) {
  await updateDoc(
    doc(db, "classes", classId, "messages", messageId),
    {
      text: newText,
      edited: true
    }
  );
}
export async function updatePresence(classId, online) {
  await setDoc(
    doc(db, "classes", classId, "presence", auth.currentUser.uid),
    {
      online,
      lastSeen: Date.now()
    }
  );
}
export async function markSeen(classId, messageId) {
  await updateDoc(
    doc(db, "classes", classId, "messages", messageId),
    {
      [`seen.${auth.currentUser.uid}`]: true
    }
  );
}