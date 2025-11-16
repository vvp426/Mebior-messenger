import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

import { auth, db, storage } from "./firebase";
import "./App.css";

// --------- Типы ---------

interface ChatMessage {
  id: string;
  text: string;
  userId: string;
  userEmail: string;
  createdAt?: { seconds: number; nanoseconds: number };
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
}

// --------- Вспомогательные функции ---------

function formatTimestamp(msg: ChatMessage): string {
  if (!msg.createdAt) return "";
  const date = new Date(msg.createdAt.seconds * 1000);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function downloadFile(url: string, fileName: string) {
  // Принудительное скачивание файла
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName || "file";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// --------- Компонент ---------

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const [authError, setAuthError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // ----- Подписка на авторизацию -----
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setEmail("");
        setPassword("");
      }
    });

    return () => unsub();
  }, []);

  // ----- Запрос разрешения на нотификации -----
  useEffect(() => {
    if (typeof window === "undefined") return;

    if ("Notification" in window) {
      Notification.requestPermission().catch(() => {
        /* игнорируем */
      });
    }
  }, []);

  // ----- Подписка на сообщения чата -----
  useEffect(() => {
    const msgsRef = collection(db, "messages");
    const q = query(msgsRef, orderBy("createdAt", "asc"));

    let firstLoad = true;
    let lastMessageId: string | null = null;

    const unsub = onSnapshot(q, (snapshot) => {
      const docs: ChatMessage[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as Omit<ChatMessage, "id">;
        docs.push({
          id: doc.id,
          ...data,
        });
      });

      // Уведомления о новых сообщениях (кроме первого загрузочного батча)
      if (!firstLoad && docs.length > 0) {
        const latest = docs[docs.length - 1];

        if (
          latest.id !== lastMessageId &&
          currentUser &&
          latest.userId !== currentUser.uid
        ) {
          if (typeof window !== "undefined" && "Notification" in window) {
            if (Notification.permission === "granted") {
              new Notification("Новое сообщение", {
                body: `${latest.userEmail}: ${
                  latest.text || latest.fileName || "Вложение"
                }`,
              });
            }
          }
        }

        lastMessageId = latest.id;
      }

      firstLoad = false;

      setMessages(docs);
      // автоскролл
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 0);
    });

    return () => unsub();
  }, [currentUser]);

  // ----- Авторизация -----

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);

    if (!email || !password) {
      setAuthError("Введите email и пароль");
      return;
    }

    try {
      if (isRegisterMode) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message ?? "Ошибка при авторизации");
    }
  }

  function handleLogout() {
    signOut(auth).catch((err) => console.error(err));
  }

  // ----- Работа с файлами -----

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
  }

  // ----- Отправка сообщения -----

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    if (!newMessage.trim() && !selectedFile) return;

    setIsSending(true);

    try {
      let fileUrl: string | undefined;
      let fileName: string | undefined;
      let fileType: string | undefined;

      if (selectedFile) {
        const fileRef = ref(
          storage,
          `chatFiles/${currentUser.uid}_${Date.now()}_${selectedFile.name}`,
        );
        const snap = await uploadBytes(fileRef, selectedFile);
        fileUrl = await getDownloadURL(snap.ref);
        fileName = selectedFile.name;
        fileType = selectedFile.type;
      }

      const msg: Omit<ChatMessage, "id"> = {
        text: newMessage.trim(),
        userId: currentUser.uid,
        userEmail: currentUser.email ?? "Неизвестный",
        createdAt: undefined, // сервер проставит timestamp
        fileUrl,
        fileName,
        fileType,
      };

      await addDoc(collection(db, "messages"), {
        ...msg,
        createdAt: serverTimestamp(),
      });

      setNewMessage("");
      setSelectedFile(null);
    } catch (err) {
      console.error("Ошибка при отправке сообщения:", err);
      alert("Ошибка при отправке сообщения");
    } finally {
      setIsSending(false);
    }
  }

  // ----- UI авторизации -----

  if (!currentUser) {
    return (
      <div className="app-root">
        <div className="auth-card">
          <h1 className="app-title">ORG MESSENGER</h1>
          <p className="auth-subtitle">
            Вход по email и паролю на Firebase Auth, без SMS.
          </p>

          <h2 className="auth-section-title">
            {isRegisterMode ? "Регистрация" : "Вход"}
          </h2>
          <p className="auth-hint">
            Используйте рабочую почту для доступа к чату организации.
          </p>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            <label className="auth-label">
              EMAIL
              <input
                className="auth-input"
                type="email"
                placeholder="user@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <label className="auth-label">
              ПАРОЛЬ
              <div className="password-row">
                <input
                  className="auth-input"
                  type={isPasswordVisible ? "text" : "password"}
                  placeholder="Минимум 6 символов"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setIsPasswordVisible((v) => !v)}
                >
                  {isPasswordVisible ? "Скрыть" : "Показать"}
                </button>
              </div>
            </label>

            {authError && <div className="auth-error">{authError}</div>}

            <button className="primary-btn" type="submit">
              {isRegisterMode ? "Зарегистрироваться" : "Войти"}
            </button>

            <button
              type="button"
              className="secondary-btn"
              onClick={() => {
                setIsRegisterMode((v) => !v);
                setAuthError(null);
              }}
            >
              {isRegisterMode ? "Уже есть аккаунт" : "Создать аккаунт"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ----- UI чата -----

  return (
    <div className="app-root">
      <div className="chat-card">
        <header className="chat-header">
          <div>
            <h1 className="app-title">ORG MESSENGER</h1>
            <p className="chat-subtitle">
              Вы вошли как: <span>{currentUser.email}</span>
            </p>
          </div>

          <div className="status-dot" aria-label="online" />

          <button className="logout-btn" onClick={handleLogout}>
            Выйти
          </button>
        </header>

        <main className="chat-main">
          <div className="messages-container">
            {messages.map((m) => {
              const mine = currentUser && m.userId === currentUser.uid;
              return (
                <div
                  key={m.id}
                  className={`message-bubble ${mine ? "mine" : "theirs"}`}
                >
                  <div className="message-meta">
                    <span className="message-author">{m.userEmail}</span>
                    <span className="message-time">{formatTimestamp(m)}</span>
                  </div>

                  {m.text && <div className="message-text">{m.text}</div>}

                  {m.fileUrl && (
                    <button
                      type="button"
                      className="file-pill"
                      onClick={() =>
                        downloadFile(m.fileUrl!, m.fileName ?? "file")
                      }
                    >
                      📎 {m.fileName || "Файл"}
                    </button>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <form className="input-panel" onSubmit={handleSendMessage}>
            <label className="file-label">
              <span className="file-icon">📎</span>
              <span className="file-text">
                {selectedFile ? selectedFile.name : "Файл"}
              </span>
              <input
                type="file"
                className="file-input"
                onChange={handleFileChange}
              />
            </label>

            <input
              className="message-input"
              placeholder="Сообщение"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
            />

            <button
              className="primary-btn send-btn"
              type="submit"
              disabled={isSending}
            >
              {isSending ? "..." : "Отправить"}
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}

export default App;