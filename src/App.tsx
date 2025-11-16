import React, { useEffect, useMemo, useState } from 'react';
import './index.css';

import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth';

import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';

import {
  ref,
  uploadBytes,
  getDownloadURL,
} from 'firebase/storage';

import { auth, db, storage } from './firebase';
import { Chat, Message, UserProfile } from './types';

// Небольшой помощник для форматирования времени
function formatTime(d: Date | null): string {
  if (!d) return '';
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

// Получить отображаемое имя пользователя
function getDisplayName(p?: UserProfile | null): string {
  if (!p) return '';
  if (p.firstName || p.lastName) {
    return `${p.firstName} ${p.lastName}`.trim();
  }
  return p.email;
}

// ------------------ КОМПОНЕНТ ПРИЛОЖЕНИЯ ------------------ //

const App: React.FC = () => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileAvatarFile, setProfileAvatarFile] = useState<File | null>(null);

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [fileToSend, setFileToSend] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);

  const [creatingChat, setCreatingChat] = useState(false);
  const [newChatName, setNewChatName] = useState('');

  // ---------------- АВТОРИЗАЦИЯ ---------------- //

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      setLoadingAuth(false);
    });
    return () => unsub();
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!authEmail || !authPassword) {
      setAuthError('Введите email и пароль');
      return;
    }

    try {
      if (isLoginMode) {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        await createUserWithEmailAndPassword(auth, authEmail, authPassword);
      }
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message || 'Ошибка авторизации');
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setProfile(null);
    setChats([]);
    setMessages([]);
    setActiveChatId(null);
  };

  // ---------------- ПРОФИЛЬ ---------------- //

  // Загрузка профиля при входе
  useEffect(() => {
    if (!firebaseUser) {
      setProfile(null);
      return;
    }

    const loadProfile = async () => {
      setProfileLoading(true);
      try {
        const refDoc = doc(db, 'users', firebaseUser.uid);
        const snap = await getDoc(refDoc);
        if (snap.exists()) {
          const data = snap.data() as any;
          const p: UserProfile = {
            uid: firebaseUser.uid,
            email: data.email ?? firebaseUser.email ?? '',
            firstName: data.firstName ?? '',
            lastName: data.lastName ?? '',
            position: data.position ?? '',
            department: data.department ?? '',
            avatarUrl: data.avatarUrl ?? null,
          };
          p.fullName = getDisplayName(p);
          setProfile(p);
        } else {
          // создать минимальный профиль
          const base: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email ?? '',
            firstName: '',
            lastName: '',
            position: '',
            department: '',
            avatarUrl: null,
          };
          base.fullName = getDisplayName(base);
          await setDoc(refDoc, {
            email: base.email,
            firstName: '',
            lastName: '',
            position: '',
            department: '',
            avatarUrl: null,
          });
          setProfile(base);
        }
      } catch (err) {
        console.error('loadProfile error', err);
      } finally {
        setProfileLoading(false);
      }
    };

    loadProfile();
  }, [firebaseUser]);

  const handleOpenProfile = () => {
    setProfileAvatarFile(null);
    setIsProfileModalOpen(true);
  };

  const handleSaveProfile = async () => {
    if (!firebaseUser || !profile) return;

    setProfileSaving(true);
    try {
      let avatarUrl = profile.avatarUrl ?? null;

      if (profileAvatarFile) {
        const avatarRef = ref(
          storage,
          `avatars/${firebaseUser.uid}.jpg`
        );
        await uploadBytes(avatarRef, profileAvatarFile);
        avatarUrl = await getDownloadURL(avatarRef);
      }

      const updated: UserProfile = {
        ...profile,
        avatarUrl,
      };
      updated.fullName = getDisplayName(updated);

      await setDoc(doc(db, 'users', firebaseUser.uid), {
        email: updated.email,
        firstName: updated.firstName,
        lastName: updated.lastName,
        position: updated.position,
        department: updated.department,
        avatarUrl: updated.avatarUrl,
      });

      setProfile(updated);
      setIsProfileModalOpen(false);
    } catch (err) {
      console.error('saveProfile error', err);
      alert('Ошибка сохранения профиля');
    } finally {
      setProfileSaving(false);
    }
  };

  // ---------------- ЧАТЫ ---------------- //

  // Подписка на список чатов
  useEffect(() => {
    if (!firebaseUser) {
      setChats([]);
      setActiveChatId(null);
      return;
    }

    const q = query(
      collection(db, 'chats'),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const list: Chat[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          name: data.name ?? 'Без имени',
          createdAt: data.createdAt?.toDate?.() ?? null,
          createdBy: data.createdBy ?? '',
          messagesCount: data.messagesCount ?? 0,
          lastMessageAt: data.lastMessageAt?.toDate?.() ?? null,
        };
      });

      setChats(list);

      // если активный чат не выбран — выбрать "Общий чат" или первый
      setActiveChatId((prev) => {
        if (prev) return prev;
        const general = list.find((c) => c.name === 'Общий чат');
        return general?.id ?? list[0]?.id ?? null;
      });
    });

    return () => unsub();
  }, [firebaseUser]);

  // Создать новый чат
  const handleCreateChat = async () => {
    if (!firebaseUser) return;
    if (!newChatName.trim()) return;
    setCreatingChat(true);
    try {
      const docRef = await addDoc(collection(db, 'chats'), {
        name: newChatName.trim(),
        createdAt: serverTimestamp(),
        createdBy: firebaseUser.uid,
        messagesCount: 0,
        lastMessageAt: null,
      });
      setNewChatName('');
      setActiveChatId(docRef.id);
    } catch (err) {
      console.error('createChat error', err);
      alert('Ошибка создания чата');
    } finally {
      setCreatingChat(false);
    }
  };

  // ---------------- СООБЩЕНИЯ ---------------- //

  // Подписка на сообщения текущего чата (вот здесь ключевое изменение)
  useEffect(() => {
    if (!firebaseUser || !activeChatId) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, 'messages'),
      where('chatId', '==', activeChatId),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const list: Message[] = snap.docs.map((d) => {
        const data = d.data() as any;
        return {
          id: d.id,
          chatId: data.chatId,
          text: data.text ?? '',
          createdAt: data.createdAt?.to