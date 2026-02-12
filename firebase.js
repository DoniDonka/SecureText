// Firebase config
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

// GLOBAL references for the rest of your app
const auth = firebase.auth();
const db = firebase.firestore();