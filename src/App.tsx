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
  where,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from "firebase/storage";
import { auth, db, storage } from "./firebase";
import "./index.css";

// ---------- типы ----------

type Chat = {
  id: string;
  title: string;
  createdAt?: any;
  lastMessageAt?: any;
  messageCount?: number;
};

type Message = {
  id: string;
  chatId: string;
  text: string;
  createdAt?: any;
  userId: string;
  userName: string;
  userAvatarUrl?: string;
  fileName?: string;
  fileUrl?: string;
};

type UserProfile = {
  id: string;
  email: string;
  name: string;
  position: string;
  department: string;
  avatarUrl?: string;
};

type AppProps = {
  firebaseUser: FirebaseUser;
};

// ---------- компонент приложения ----------

const App: React.FC<AppProps> = ({ firebaseUser }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
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

  // ---------- загрузка профиля ----------

  useEffect(() => {
    const userDocRef = doc(db, "users", firebaseUser.uid);

    const loadProfile = async () => {
      const snap = await getDoc(userDocRef);

      if (snap.exists()) {
        const data = snap.data() as any;
        const loadedProfile: UserProfile = {
          id: firebaseUser.uid,
          email: firebaseUser.email || "",
          name: data.name || "",
          position: data.position || "",
          department: data.department || "",
          avatarUrl: data.avatarUrl,
        };
        setProfile(loadedProfile);
        setProfileDraft({
          name: loadedProfile.name,
          position: loadedProfile.position,
          department: loadedProfile.department,
        });
      } else {
        const baseProfile: UserProfile = {
          id: firebaseUser.uid,
          email: firebaseUser.email || "",
          name: firebaseUser.email || "",
          position: "",
          department: "",
        };

        await setDoc(userDocRef, {
          email: baseProfile.email,
          name: baseProfile.name,
          position: "",
          department: "",
          avatarUrl: null,
          createdAt: serverTimestamp(),
        });

        setProfile(baseProfile);
        setProfileDraft({
          name: baseProfile.name,
          position: "",
          department: "",
        });
      }
    };

    loadProfile().catch((e) =>
      console.error("Failed to load user profile", e)
    );
  }, [firebaseUser]);

  // ---------- выход ----------

  const handleSignOut = async () => {
    await signOut(auth);
  };

  // ---------- подписка на список чатов ----------

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

      // если чат не выбран — берём первый
      if (!activeChatId && list.length > 0) {
        setActiveChatId(list[0].id);
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId]);

  // ---------- подписка на сообщения выбранного чата ----------

  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }

    const messagesCol = collection(db, "messages");

    // ВАЖНО: фильтруем по chatId, чтобы у каждого чата был свой список сообщений
    const q = query(
      messagesCol,
      where("chatId", "==", activeChatId),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const list: Message[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        list.push({
          id: d.id,
          chatId: data.chatId,
          text: data.text,
          createdAt: data.createdAt,
          userId: data.userId,
          userName: data.userName,
          userAvatarUrl: data.userAvatarUrl,
          fileName: data.fileName,
          fileUrl: data.fileUrl,
        });
      });
      setMessages(list);
    });

    return () => unsub();
  }, [activeChatId]);

  // ---------- создание чата ----------

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

  // ---------- отправка сообщения ----------

  const handleSendMessage = async () => {
    if (!activeChatId) return;
    const trimmed = newMessage.trim();
    if (!trimmed) return;

    try {
      setIsSending(true);

      const messagesCol = collection(db, "messages");

      // каждое сообщение — новый документ
      await addDoc(messagesCol, {
        chatId: activeChatId,
        text: trimmed,
        createdAt: serverTimestamp(),
        userId: firebaseUser.uid,
        userName: profile?.name || firebaseUser.email || "Без имени",
        userAvatarUrl: profile?.avatarUrl || null,
      });

      // обновляем данные чата
      const chatDocRef = doc(db, "chats", activeChatId);
      const chatSnap = await getDoc(chatDocRef);
      const currentCount =
        (chatSnap.exists() && (chatSnap.data().messageCount as number)) || 0;

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

  // ---------- отправка файла ----------

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
      const currentCount =
        (snap.exists() && (snap.data().messageCount as number)) || 0;

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

  // ---------- сохранение профиля ----------

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

  // ---------- загрузка аватара ----------

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

  const activeChat = chats.find((c) => c.id === activeChatId) || null;

  // ---------- рендер ----------

  return (
    <div className="app-root">
      <div className="chat-card">
        {/* шапка */}
        <header className="chat-header">
          <div className="chat-header-left">
            <h1 className="chat-logo">ORG MESSENGER</h1>
            <div className="chat-subtitle">
              Вы вошли как: {userDisplayName} ({firebaseUser.email})
            </div>
          </div>
          <div className="header-buttons">
            <button onClick={() => setIsProfileOpen(true)}>Профиль</button>
            <button onClick={handleSignOut}>Выйти</button>
          </div>
        </header>

        {/* layout */}
        <div className="chat-layout">
          {/* сайдбар чатов */}
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

          {/* основной чат */}
          <main className="chat-main">
            <div className="chat-main-header">
              <div className="chat-main-title">
                {activeChat?.title || "Чат не выбран"}
              </div>
              <div className="chat-main-subtitle">
                Сообщений: {messages.length}
              </div>
            </div>

            <div className="messages-area">
              {messages.map((m) => {
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
                            {m.userName.charAt(0).toUpperCase()}
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

              {messages.length === 0 && (
                <div className="messages-empty">Сообщений пока нет</div>
              )}
            </div>

            {/* нижняя панель ввода */}
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

      {/* модалка профиля */}
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
