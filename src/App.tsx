// src/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { signOut } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";

import { auth, db, storage } from "./firebase";
import type { Chat, Message, UserProfile } from "./types";
import "./App.css";

// ---------- Пропсы ----------

type AppProps = {
  firebaseUser: FirebaseUser;
};

// ---------- Компонент ----------

const App: React.FC<AppProps> = ({ firebaseUser }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  // ключевая штука: сообщения лежат по chatId
  const [messagesByChat, setMessagesByChat] = useState<
    Record<string, Message[]>
  >({});
  const [newMessage, setNewMessage] = useState("");

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [profileDraft, setProfileDraft] = useState<{
    name: string;
    position: string;
    department: string;
  }>({ name: "", position: "", department: "" });

  const userDisplayName = useMemo(
    () => profile?.name || firebaseUser.email || "",
    [profile, firebaseUser]
  );

  // ---------- Загрузка / создание профиля ----------

  useEffect(() => {
    const loadProfile = async () => {
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const snap = await getDoc(userDocRef);

      if (snap.exists()) {
        const data = snap.data() as any;
        const loaded: UserProfile = {
          id: firebaseUser.uid,
          email: firebaseUser.email || "",
          name: data.name || "",
          position: data.position || "",
          department: data.department || "",
          avatarUrl: data.avatarUrl || undefined,
        };
        setProfile(loaded);
        setProfileDraft({
          name: loaded.name,
          position: loaded.position,
          department: loaded.department,
        });
      } else {
        const base: UserProfile = {
          id: firebaseUser.uid,
          email: firebaseUser.email || "",
          name: firebaseUser.email || "",
          position: "",
          department: "",
        };

        await setDoc(userDocRef, {
          email: base.email,
          name: base.name,
          position: "",
          department: "",
          avatarUrl: null,
          createdAt: serverTimestamp(),
        });

        setProfile(base);
        setProfileDraft({
          name: base.name,
          position: "",
          department: "",
        });
      }
    };

    loadProfile().catch((e) => console.error("Profile load error", e));
  }, [firebaseUser]);

  // ---------- Подписка на список чатов ----------

  useEffect(() => {
    const chatsCol = collection(db, "chats");
    const q = query(chatsCol, orderBy("lastMessageAt", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      const list: Chat[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        list.push({
          id: d.id,
          title: data.title || "Без названия",
          createdAt: data.createdAt,
          lastMessageAt: data.lastMessageAt,
          messageCount: data.messageCount,
        });
      });

      setChats(list);

      // если чат ещё не выбран — выбираем первый
      if (!activeChatId && list.length > 0) {
        setActiveChatId(list[0].id);
      }
    });

    return () => unsub();
    // activeChatId намеренно не в зависимостях
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser]);

  // ---------- Подписка на ВСЕ сообщения, группировка по chatId ----------

  useEffect(() => {
    const messagesCol = collection(db, "messages");
    const q = query(messagesCol, orderBy("createdAt", "asc"));

    const unsub = onSnapshot(q, (snap) => {
      const byChat: Record<string, Message[]> = {};

      snap.forEach((d) => {
        const data = d.data() as any;
        const m: Message = {
          id: d.id,
          chatId: data.chatId,
          text: data.text,
          createdAt: data.createdAt,
          userId: data.userId,
          userName: data.userName,
          userAvatarUrl: data.userAvatarUrl,
          fileName: data.fileName,
          fileUrl: data.fileUrl,
        };

        if (!m.chatId) return; // защитимся от старых кривых данных

        if (!byChat[m.chatId]) {
          byChat[m.chatId] = [];
        }
        byChat[m.chatId].push(m);
      });

      setMessagesByChat(byChat);
    });

    return () => unsub();
  }, [firebaseUser]);

  // сообщения активного чата
  const activeMessages: Message[] =
    (activeChatId && messagesByChat[activeChatId]) || [];

  const activeChat = chats.find((c) => c.id === activeChatId) || null;

  // ---------- Обработчики ----------

  const handleSignOut = async () => {
    await signOut(auth);
  };

  const handleCreateChat = async () => {
    const title = window.prompt("Название чата");
    if (!title) return;

    try {
      setIsCreatingChat(true);

      const chatsCol = collection(db, "chats");
      const chatDoc = await addDoc(chatsCol, {
        title,
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        createdBy: firebaseUser.uid,
        messageCount: 0,
      });

      setActiveChatId(chatDoc.id);
    } catch (e) {
      console.error("Create chat error", e);
      alert("Не удалось создать чат");
    } finally {
      setIsCreatingChat(false);
    }
  };

  const handleSendMessage = async () => {
    if (!activeChatId) return;
    const trimmed = newMessage.trim();
    if (!trimmed) return;

    try {
      setIsSending(true);

      const messagesCol = collection(db, "messages");
      await addDoc(messagesCol, {
        chatId: activeChatId,
        text: trimmed,
        createdAt: serverTimestamp(),
        userId: firebaseUser.uid,
        userName: profile?.name || firebaseUser.email || "Без имени",
        userAvatarUrl: profile?.avatarUrl || null,
      });

      const chatDocRef = doc(db, "chats", activeChatId);
      const chatSnap = await getDoc(chatDocRef);
      const currentCount = chatSnap.exists()
        ? ((chatSnap.data()?.messageCount as number) || 0)
        : 0;

      await updateDoc(chatDocRef, {
        lastMessageAt: serverTimestamp(),
        messageCount: currentCount + 1,
      });

      setNewMessage("");
    } catch (e) {
      console.error("Send message error", e);
      alert("Не удалось отправить сообщение");
    } finally {
      setIsSending(false);
    }
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!activeChatId) return;
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsSending(true);

      const path = `chatFiles/${activeChatId}/${Date.now()}_${file.name}`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, file);
      const url = await getDownloadURL(ref);

      const messagesCol = collection(db, "messages");
      await addDoc(messagesCol, {
        chatId: activeChatId,
        text: "",
        fileName: file.name,
        fileUrl: url,
        createdAt: serverTimestamp(),
        userId: firebaseUser.uid,
        userName: profile?.name || firebaseUser.email || "Без имени",
        userAvatarUrl: profile?.avatarUrl || null,
      });

      const chatDocRef = doc(db, "chats", activeChatId);
      const snap = await getDoc(chatDocRef);
      const currentCount = snap.exists()
        ? ((snap.data()?.messageCount as number) || 0)
        : 0;

      await updateDoc(chatDocRef, {
        lastMessageAt: serverTimestamp(),
        messageCount: currentCount + 1,
      });

      e.target.value = "";
    } catch (err) {
      console.error("File upload error", err);
      alert("Не удалось отправить файл");
    } finally {
      setIsSending(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profile) return;

    try {
      const userDocRef = doc(db, "users", profile.id);
      await updateDoc(userDocRef, {
        name: profileDraft.name,
        position: profileDraft.position,
        department: profileDraft.department,
      });

      setProfile({
        ...profile,
        name: profileDraft.name,
        position: profileDraft.position,
        department: profileDraft.department,
      });
      setIsProfileOpen(false);
    } catch (err) {
      console.error("Profile update error", err);
      alert("Не удалось сохранить профиль");
    }
  };

  const handleAvatarChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    if (!profile) return;
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingAvatar(true);
      const ref = storageRef(storage, `avatars/${profile.id}.jpg`);
      await uploadBytes(ref, file);
      const url = await getDownloadURL(ref);

      const userDocRef = doc(db, "users", profile.id);
      await updateDoc(userDocRef, { avatarUrl: url });

      setProfile({ ...profile, avatarUrl: url });
    } catch (err) {
      console.error("Avatar upload error", err);
      alert("Ошибка загрузки аватара");
    } finally {
      setUploadingAvatar(false);
    }
  };

  // ---------- Рендер ----------

  return (
    <div className="app-root">
      <div className="chat-card">
        {/* Шапка */}
        <header className="chat-header">
          <div className="chat-header-left">
            <h1 className="chat-logo">ORG MESSENGER</h1>
            <div className="chat-subtitle">
              Вы вошли как: {userDisplayName}
              {firebaseUser.email && ` (${firebaseUser.email})`}
            </div>
          </div>
          <div className="header-buttons">
            <button onClick={() => setIsProfileOpen(true)}>Профиль</button>
            <button onClick={handleSignOut}>Выйти</button>
          </div>
        </header>

        {/* Основной layout */}
        <div className="chat-layout">
          {/* Список чатов */}
          <aside className="chat-sidebar">
            <div className="sidebar-header">
              <div className="sidebar-title">Чаты</div>
              <button
                className="new-chat-button"
                onClick={handleCreateChat}
                disabled={isCreatingChat}
              >
                + Новый
              </button>
            </div>

            <div className="chat-list">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  className={
                    "chat-item" +
                    (chat.id === activeChatId ? " chat-item-active" : "")
                  }
                  onClick={() => setActiveChatId(chat.id)}
                >
                  <div className="chat-item-title">{chat.title}</div>
                  <div className="chat-item-sub">
                    Сообщений: {chat.messageCount || 0}
                  </div>
                </div>
              ))}

              {chats.length === 0 && (
                <div className="chat-empty">
                  Чатов пока нет. Создайте первый.
                </div>
              )}
            </div>
          </aside>

          {/* Текущий чат */}
          <main className="chat-main">
            <div className="chat-main-header">
              <div className="chat-main-title">
                {activeChat?.title || "Чат не выбран"}
              </div>
              <div className="chat-main-subtitle">
                Сообщений: {activeMessages.length}
              </div>
            </div>

            <div className="messages-area">
              {activeMessages.map((m) => {
                const isMine = m.userId === firebaseUser.uid;
                return (
                  <div
                    key={m.id}
                    className={
                      "message-row" + (isMine ? " message-row-mine" : "")
                    }
                  >
                    {!isMine && (
                      <div className="message-avatar">
                        {m.userAvatarUrl ? (
                          <img src={m.userAvatarUrl} alt={m.userName} />
                        ) : (
                          <div className="avatar-placeholder">
                            {m.userName?.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="message-bubble-wrapper">
                      <div className="message-meta">
                        <span className="message-author">{m.userName}</span>
                      </div>
                      <div className="message-bubble">
                        {m.text && <div>{m.text}</div>}
                        {m.fileUrl && (
                          <a
                            href={m.fileUrl}
                            className="file-chip"
                            target="_blank"
                            rel="noreferrer"
                          >
                            📎 {m.fileName || "Файл"}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {activeMessages.length === 0 && (
                <div className="messages-empty">Сообщений пока нет</div>
              )}
            </div>

            {/* Ввод сообщения */}
            <div className="chat-input-row">
              <label className="file-button">
                📎 Файл
                <input type="file" onChange={handleFileChange} />
              </label>
              <input
                className="chat-input"
                placeholder="Сообщение"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <button
                className="send-button"
                onClick={handleSendMessage}
                disabled={isSending}
              >
                Отправить
              </button>
            </div>
          </main>
        </div>
      </div>

      {/* Модалка профиля */}
      {isProfileOpen && profile && (
        <div className="modal-backdrop" onClick={() => setIsProfileOpen(false)}>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="modal-title">Профиль</h2>

            <div className="profile-row">
              <div className="profile-avatar-block">
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt="avatar"
                    className="profile-avatar-img"
                  />
                ) : (
                  <div className="profile-avatar-placeholder">
                    {userDisplayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <label className="avatar-upload-button">
                  {uploadingAvatar ? "Загрузка…" : "Сменить аватар"}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarChange}
                    disabled={uploadingAvatar}
                  />
                </label>
              </div>

              <div className="profile-fields">
                <div className="profile-field">
                  <label>Email</label>
                  <input value={profile.email} disabled />
                </div>

                <div className="profile-field">
                  <label>Имя</label>
                  <input
                    value={profileDraft.name}
                    onChange={(e) =>
                      setProfileDraft((d) => ({
                        ...d,
                        name: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="profile-field">
                  <label>Должность</label>
                  <input
                    value={profileDraft.position}
                    onChange={(e) =>
                      setProfileDraft((d) => ({
                        ...d,
                        position: e.target.value,
                      }))
                    }
                  />
                </div>

                <div className="profile-field">
                  <label>Подразделение</label>
                  <input
                    value={profileDraft.department}
                    onChange={(e) =>
                      setProfileDraft((d) => ({
                        ...d,
                        department: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="secondary-button"
                onClick={() => setIsProfileOpen(false)}
              >
                Отмена
              </button>
              <button className="primary-button" onClick={handleSaveProfile}>
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
