// src/firebase.ts

import { initializeApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User,
} from "firebase/auth";

import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  getDoc,
} from "firebase/firestore";

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";

// === ТВОИ ДАННЫЕ ВСТАВЛЕНЫ ===
const firebaseConfig = {
  apiKey: "AIzaSyCWyQ7d4zdKGkWwY_U7WuDqAf70TFd-ocs",
  authDomain: "mebior.firebaseapp.com",
  projectId: "mebior",
  storageBucket: "mebior.firebasestorage.app",
  messagingSenderId: "1099465225536",
  appId: "1:1099465225536:web:e2fb5161cc58a1982f76a5",
};

// Инициализация
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// ===== Auth =====

export function listenAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}

export function login(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function register(email: string, password: string) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function logout() {
  return signOut(auth);
}

// ===== User profile =====

export async function saveUserProfile(data: any) {
  const refUser = doc(db, "users", data.uid);
  return setDoc(refUser, data, { merge: true });
}

export async function getUserProfile(uid: string) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

// ===== Chats =====

export async function createChat(title: string) {
  const refChats = collection(db, "chats");
  const docRef = await addDoc(refChats, {
    title,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export function listenChats(callback: (chats: any[]) => void) {
  const q = query(collection(db, "chats"), orderBy("createdAt", "asc"));
  return onSnapshot(q, (snap) => {
    const arr: any[] = [];
    snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
    callback(arr);
  });
}

// ===== Messages =====

export async function sendMessage(chatId: string, message: any) {
  const refMsgs = collection(db, "chats", chatId, "messages");
  await addDoc(refMsgs, {
    ...message,
    createdAt: serverTimestamp(),
  });
}

export function listenMessages(chatId: string, callback: (messages: any[]) => void) {
  const q = query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt", "asc")
  );

  return onSnapshot(q, (snap) => {
    const arr: any[] = [];
    snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
    callback(arr);
  });
}

// ===== Storage: files & avatars =====

export async function uploadChatFile(chatId: string, file: File) {
  const fileRef = ref(storage, `chatFiles/${chatId}/${file.name}`);
  await uploadBytes(fileRef, file);
  const url = await getDownloadURL(fileRef);
  return { url, name: file.name };
}

export async function uploadAvatar(userId: string, file: File) {
  const avatarRef = ref(storage, `avatars/${userId}.jpg`);
  await uploadBytes(avatarRef, file);
  return await getDownloadURL(avatarRef);
}