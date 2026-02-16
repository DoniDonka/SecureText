// classes.js

import { db, auth } from "./firebase.js";
import { doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
import { generateId } from "./utils.js";

export async function createClass(name, pin) {
  const id = generateId();

  await setDoc(doc(db, "classes", id), {
    name,
    pin,
    teacher: auth.currentUser.uid,
    created: Date.now()
  });

  alert("Class created.");
}

export async function joinClass(classId, pin) {
  const ref = doc(db, "classes", classId);
  const snap = await getDoc(ref);

  if (!snap.exists()) throw new Error("Class not found.");

  const data = snap.data();

  if (data.pin !== pin) throw new Error("Wrong PIN.");

  await updateDoc(doc(db, "users", auth.currentUser.uid), {
    classes: [classId]
  });

  alert("Joined.");
}