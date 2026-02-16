import { db, auth } from "./firebase.js";
import { addDoc, collection } from "firebase/firestore";

export async function postAnnouncement(classId, title, content) {
  await addDoc(collection(db, "classes", classId, "announcements"), {
    title,
    content,
    createdBy: auth.currentUser.uid,
    timestamp: Date.now()
  });
}
