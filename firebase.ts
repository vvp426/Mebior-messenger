// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getAuth, RecaptchaVerifier } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCWyQ7d4zdKGkWwY_U7WuDqAf70TFd-ocs",
  authDomain: "mebior.firebaseapp.com",
  projectId: "mebior",
  storageBucket: "mebior.firebasestorage.app",
  messagingSenderId: "1099465225536",
  appId: "1:....",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// для входа по телефону (reCAPTCHA)
export const setupRecaptcha = () => {
  // @ts-ignore
  if (!window.recaptchaVerifier) {
    // @ts-ignore
    window.recaptchaVerifier = new RecaptchaVerifier(
      "recaptcha-container",
      { size: "invisible" },
      auth
    );
  }
};
