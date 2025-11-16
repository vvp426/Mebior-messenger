// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCWyQ7d4zdKGkWwY_U7WuDqAf70TFd-ocs",
  authDomain: "mebior.firebaseapp.com",
  projectId: "mebior",
  storageBucket: "mebior.firebasestorage.app",
  messagingSenderId: "1099465225536",
  appId: "1:1099465225536:web:e2fb5161cc58a1982f76a5",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
