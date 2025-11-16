import { useEffect, useRef, useState } from "react";
import type { FormEvent, ChangeEvent } from "react";
import "./index.css";

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
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
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "./firebase";

// ---------- Типы ----------

type Chat = {
  id: string;
  title: string;
  createdAt?: any;
  lastMessageText?: string;
  lastMessageAt?: any;
  messageCount?: number;
};

type ChatMessage = {
  id: string;
  text: string;
  createdAt?: any;
  userId: string;
  userEmail: string;
  userName?: string;
  fileName?: string;
  fileUrl?: string;
};

type UserProfile = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  department?: string;
  avatarUrl?: string;
};

// ----------------------------

function App() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // auth screen
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // ui
  const [toast, setToast] = useState<string | null>(null);

  // чаты и сообщения
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [fileToSend, setFileToSend] = useState<File | null>(null);
  const [sending, setSending] = useState(false);

  // профили пользователей
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<UserProfile | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);

  const [lastNotifiedMessageId, setLastNotifiedMessageId] =
    useState<string | null>(null);

  // ---------- хелперы UI ----------

  function showToast(text: string) {
    setToast(text);
    setTimeout(() => setToast(null), 3500);
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }

  // ---------- auth ----------

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setIsAuthReady(true);

      if (!user) {
        setProfile(null);
        setChats([]);
        setMessages([]);
        setActiveChatId(null);
        return;
      }

      // профиль пользователя
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);
      if (!snap.exists()) {
        await setDoc(userRef, {
          email: user.email ?? "",
          createdAt: serverTimestamp(),
        });
      }

      // подписка на собственный профиль
      onSnapshot(userRef, (d) => {
        setProfile({ id: d.id, ...(d.data() as any) });
      });

      // все пользователи (для обращений и списка)
      const usersRef = collection(db, "users");
      onSnapshot(usersRef, (snapUsers) => {
        const arr: UserProfile[] = [];
        snapUsers.forEach((docUser) =>
          arr.push({ id: docUser.id, ...(docUser.data() as any) })
        );
        setAllUsers(arr);
      });

      // чаты
      const chatsRef = collection(db, "chats");
      const chatsQuery = query(chatsRef, orderBy("createdAt", "asc"));

      onSnapshot(chatsQuery, async (snapChats) => {
        const list: Chat[] = [];
        snapChats.forEach((c) =>
          list.push({ id: c.id, ...(c.data() as any) } as Chat)
        );
        // если чатов нет — создаём общий
        if (list.length === 0) {
          const defaultRef = await addDoc(chatsRef, {
            title: "Общий чат",
            createdAt: serverTimestamp(),
            messageCount: 0,
          });
          setActiveChatId(defaultRef.id);
        } else {
          setChats(list);
          if (!activeChatId) {
            setActiveChatId(list[0].id);
          }
        }
      });
    });

    return () => unsub();
  }, []);

  // сообщения в активном чате
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }

    const msgsRef = collection(db, "chats", activeChatId, "messages");
    const msgsQuery = query(msgsRef, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(msgsQuery, (snapMsgs) => {
      const arr: ChatMessage[] = [];
      snapMsgs.forEach((m) =>
        arr.push({ id: m.id, ...(m.data() as any) } as ChatMessage)
      );
      setMessages(arr);
      scrollToBottom();
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChatId]);

  // уведомления о новых сообщениях
  useEffect(() => {
    if (
      !firebaseUser ||
      messages.length === 0 ||
      typeof window === "undefined" ||
      !(window as any).Notification
    )
      return;

    const NotificationApi = (window as any).Notification as Notification;
    if (NotificationApi.permission === "default") {
      NotificationApi.requestPermission();
    }
    if (NotificationApi.permission !== "granted") return;

    const last = messages[messages.length - 1];
    if (!last.createdAt) return;
    if (last.userId === firebaseUser.uid) return;
    if (last.id === lastNotifiedMessageId) return;

    const author =
      last.userName ||
      allUsers.find((u) => u.id === last.userId)?.firstName ||
      last.userEmail;

    new Notification("Новое сообщение", {
      body: `${author}: ${
        last.text || (last.fileName ? "отправил(а) файл" : "")
      }`,
    });

    setLastNotifiedMessageId(last.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // ---------- авторизация ----------

  async function handleAuthSubmit(e: FormEvent) {
    e.preventDefault();
    if (!authEmail.trim() || !authPassword.trim()) {
      showToast("Введите email и пароль");
      return;
    }
    setAuthLoading(true);
    try {
      if (isRegisterMode) {
        await createUserWithEmailAndPassword(
          auth,
          authEmail.trim(),
          authPassword
        );
        showToast("Аккаунт создан, вы вошли в систему");
      } else {
        await signInWithEmailAndPassword(
          auth,
          authEmail.trim(),
          authPassword
        );
      }
      setAuthPassword("");
    } catch (err: any) {
      console.error(err);
      showToast(
        isRegisterMode ? "Ошибка регистрации" : "Ошибка входа: " + err.message
      );
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    await signOut(auth);
  }

  // ---------- сообщения ----------

  async function ensureDefaultChat(): Promise<string | null> {
    if (activeChatId) return activeChatId;
    if (chats.length > 0) {
      setActiveChatId(chats[0].id);
      return chats[0].id;
    }
    const chatsRef = collection(db, "chats");
    const refChat = await addDoc(chatsRef, {
      title: "Общий чат",
      createdAt: serverTimestamp(),
      messageCount: 0,
    });
    setActiveChatId(refChat.id);
    return refChat.id;
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!firebaseUser) {
      showToast("Сначала войдите");
      return;
    }
    const text = messageText.trim();
    if (!text && !fileToSend) return;

    setSending(true);
    try {
      let chatId = activeChatId;
      chatId = await ensureDefaultChat();
      if (!chatId) throw new Error("Не удалось определить чат");

      let fileName: string | undefined;
      let fileUrl: string | undefined;

      if (fileToSend) {
        fileName = fileToSend.name;
        const filePath = `chatFiles/${chatId}/${Date.now()}_${fileToSend.name}`;
        const storageRef = ref(storage, filePath);
        await uploadBytes(storageRef, fileToSend);
        fileUrl = await getDownloadURL(storageRef);
      }

      const msgRef = collection(db, "chats", chatId, "messages");
      await addDoc(msgRef, {
        text,
        createdAt: serverTimestamp(),
        userId: firebaseUser.uid,
        userEmail: firebaseUser.email ?? "",
        userName:
          profile?.firstName && profile?.lastName
            ? `${profile.firstName} ${profile.lastName}`
            : profile?.firstName || undefined,
        fileName,
        fileUrl,
      });

      setMessageText("");
      setFileToSend(null);

      // обновим мета в чате
      const chatDocRef = doc(db, "chats", chatId);
      await updateDoc(chatDocRef, {
        lastMessageText: text || (fileName ? `Файл: ${fileName}` : ""),
        lastMessageAt: serverTimestamp(),
      });
    } catch (err: any) {
      console.error(err);
      showToast("Ошибка отправки сообщения");
    } finally {
      setSending(false);
    }
  }

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileToSend(file);
  }

  // ---------- чаты ----------

  async function handleCreateChat() {
    const title = window.prompt("Название нового чата");
    if (!title?.trim()) return;

    try {
      const chatRef = await addDoc(collection(db, "chats"), {
        title: title.trim(),
        createdAt: serverTimestamp(),
        messageCount: 0,
      });
      setActiveChatId(chatRef.id);
    } catch (err) {
      console.error(err);
      showToast("Не удалось создать чат");
    }
  }

  // ---------- профиль ----------

  function openProfile() {
    if (!profile) return;
    setProfileDraft({ ...profile });
    setAvatarFile(null);
    setIsProfileOpen(true);
  }

  function closeProfile() {
    setIsProfileOpen(false);
  }

  function handleProfileFieldChange(
    field: keyof UserProfile,
    value: string
  ): void {
    if (!profileDraft) return;
    setProfileDraft({ ...profileDraft, [field]: value });
  }

  function handleAvatarChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!firebaseUser || !profileDraft) return;
    try {
      const userRef = doc(db, "users", firebaseUser.uid);
      const dataToUpdate: any = {
        firstName: profileDraft.firstName ?? "",
        lastName: profileDraft.lastName ?? "",
        position: profileDraft.position ?? "",
        department: profileDraft.department ?? "",
      };

      if (avatarFile) {
        const avatarPath = `avatars/${firebaseUser.uid}.jpg`;
        const avatarRef = ref(storage, avatarPath);
        await uploadBytes(avatarRef, avatarFile);
        const url = await getDownloadURL(avatarRef);
        dataToUpdate.avatarUrl = url;
      }

      await updateDoc(userRef, dataToUpdate);
      showToast("Профиль сохранён");
      setIsProfileOpen(false);
    } catch (err) {
      console.error(err);
      showToast("Ошибка загрузки аватара");
    }
  }

  // клик по имени пользователя в сообщении → обращение
  function handleMentionClick(userId: string) {
    const user = allUsers.find((u) => u.id === userId);
    const name =
      (user?.firstName || "") +
      (user?.lastName ? ` ${user.lastName}` : "") ||
      user?.email ||
      "";
    if (!name) return;

    setMessageText((prev) =>
      prev.trim() ? `${prev} ${name}, ` : `${name}, `
    );
    messageInputRef.current?.focus();
  }

  // ---------- рендер ----------

  if (!isAuthReady) {
    return (
      <div className="app-root">
        <div className="auth-card">Загрузка…</div>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="app-root">
        <div className="auth-card">
          <h1 className="app-title">ORG MESSENGER</h1>
          <p className="auth-subtitle">
            Вход по email и паролю на Firebase Auth, без SMS.
          </p>

          <form onSubmit={handleAuthSubmit} className="auth-form">
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="user@company.com"
                required
              />
            </label>

            <label className="auth-field">
              <span>Пароль</span>
              <input
                type="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Минимум 6 символов"
                required
              />
            </label>

            <button
              type="submit"
              className="primary-btn"
              disabled={authLoading}
            >
              {isRegisterMode ? "Создать аккаунт" : "Войти"}
            </button>
          </form>

          <button
            type="button"
            className="ghost-btn"
            onClick={() => setIsRegisterMode((v) => !v)}
          >
            {isRegisterMode ? "У меня уже есть аккаунт" : "Создать новый аккаунт"}
          </button>
        </div>

        {toast && <div className="toast">{toast}</div>}
      </div>
    );
  }

  // ---- экран чата ----

  const currentChat = chats.find((c) => c.id === activeChatId);
  const displayName =
    (profile?.firstName || "") +
      (profile?.lastName ? ` ${profile.lastName}` : "") ||
    firebaseUser.email;

  return (
    <div className="app-root">
      <div className="chat-shell">
        <header className="chat-header">
          <div className="chat-header-left">
            <h1 className="app-title">ORG MESSENGER</h1>
            <div className="header-user-email">
              Вы вошли как: {firebaseUser.email}
            </div>
          </div>

          <div className="chat-header-right">
            <button className="ghost-btn" onClick={openProfile}>
              Профиль
            </button>
            <button className="ghost-btn" onClick={handleLogout}>
              Выйти
            </button>
          </div>
        </header>

        <div className="chat-layout">
          <aside className="chat-sidebar">
            <div className="chat-sidebar-header">
              <span>Чаты</span>
              <button className="small-btn" onClick={handleCreateChat}>
                + Новый
              </button>
            </div>

            <div className="chat-list">
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  className={
                    "chat-list-item" +
                    (chat.id === activeChatId ? " chat-list-item--active" : "")
                  }
                  onClick={() => setActiveChatId(chat.id)}
                >
                  <div className="chat-list-title">{chat.title}</div>
                  <div className="chat-list-meta">
                    {chat.messageCount
                      ? `Сообщений: ${chat.messageCount}`
                      : "Сообщений: 0"}
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <main className="chat-main">
            <div className="chat-main-header">
              <div className="chat-title">{currentChat?.title ?? "Чат"}</div>
            </div>

            <div className="chat-messages">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={
                    "chat-message" +
                    (m.userId === firebaseUser.uid
                      ? " chat-message--own"
                      : "")
                  }
                >
                  <div
                    className="message-author"
                    onClick={() => handleMentionClick(m.userId)}
                  >
                    {m.userName ||
                      allUsers.find((u) => u.id === m.userId)?.firstName ||
                      m.userEmail}
                  </div>
                  {m.text && <div className="message-text">{m.text}</div>}
                  {m.fileUrl && (
                    <a
                      className="file-pill"
                      href={m.fileUrl}
                      download={m.fileName}
                    >
                      📎 {m.fileName ?? "Файл"}
                    </a>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form className="chat-input-row" onSubmit={handleSend}>
              <label className="file-input-pill">
                <span>📎 Файл</span>
                <input type="file" onChange={handleFileChange} />
              </label>

              <input
                ref={messageInputRef}
                type="text"
                placeholder="Сообщение"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
              />

              <button
                type="submit"
                className="primary-btn"
                disabled={sending || (!messageText.trim() && !fileToSend)}
              >
                Отправить
              </button>
            </form>
          </main>
        </div>
      </div>

      {/* Модалка профиля */}
      {isProfileOpen && profileDraft && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2 className="modal-title">Профиль</h2>

            <div className="profile-avatar-row">
              <div className="avatar-circle">
                {profileDraft.avatarUrl ? (
                  <img src={profileDraft.avatarUrl} alt="avatar" />
                ) : (
                  (profileDraft.firstName?.[0] ??
                    profileDraft.email?.[0] ??
                    "U"
                  ).toUpperCase()
                )}
              </div>
              <div>
                <div className="profile-email-label">Email</div>
                <div className="profile-email-value">
                  {profileDraft.email ?? firebaseUser.email}
                </div>
                <label className="small-file-input">
                  <span>Изменить аватар</span>
                  <input type="file" accept="image/*" onChange={handleAvatarChange} />
                </label>
              </div>
            </div>

            <form onSubmit={saveProfile} className="profile-form">
              <label className="auth-field">
                <span>Имя</span>
                <input
                  type="text"
                  value={profileDraft.firstName ?? ""}
                  onChange={(e) =>
                    handleProfileFieldChange("firstName", e.target.value)
                  }
                />
              </label>

              <label className="auth-field">
                <span>Фамилия</span>
                <input
                  type="text"
                  value={profileDraft.lastName ?? ""}
                  onChange={(e) =>
                    handleProfileFieldChange("lastName", e.target.value)
                  }
                />
              </label>

              <label className="auth-field">
                <span>Должность</span>
                <input
                  type="text"
                  value={profileDraft.position ?? ""}
                  onChange={(e) =>
                    handleProfileFieldChange("position", e.target.value)
                  }
                />
              </label>

              <label className="auth-field">
                <span>Подразделение</span>
                <input
                  type="text"
                  value={profileDraft.department ?? ""}
                  onChange={(e) =>
                    handleProfileFieldChange("department", e.target.value)
                  }
                />
              </label>

              <div className="profile-buttons">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={closeProfile}
                >
                  Отмена
                </button>
                <button type="submit" className="primary-btn">
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;