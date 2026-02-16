// auth.js

import { auth, db } from "./firebase.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { showError } from "./utils.js";

export async function register(email, password) {
  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);

    await setDoc(doc(db, "users", userCred.user.uid), {
      email,
      role: "student",
      approved: false,
      banned: false,
      classes: []
    });

    alert("Registered. Wait for approval.");
  } catch (e) {
    showError(e.message);
  }
}

export async function login(email, password) {
  try {
    const userCred = await signInWithEmailAndPassword(auth, email, password);

    const snap = await getDoc(doc(db, "users", userCred.user.uid));
    const data = snap.data();

    if (data.banned) throw new Error("You are banned.");
    if (!data.approved) throw new Error("Not approved yet.");

    window.location.href = "dashboard.html";
  } catch (e) {
    showError(e.message);
  }
}
