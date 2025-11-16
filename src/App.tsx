// src/App.tsx
import React, { useEffect, useState } from "react";
import { auth, db, storage } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

type ChatMessage = {
  id: string;
  text?: string | null;
  uid: string;
  email?: string | null;
  createdAt?: any;
  fileUrl?: string | null;
  fileName?: string | null;
  fileType?: string | null;
};

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [user, setUser] = useState<any>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMsg, setNewMsg] = useState("");
  const [file, setFile] = useState<File | null>(null);

  // ======= слежение за авторизацией =======
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return unsub;
  }, []);

  // ======= загрузка сообщений из Firestore =======
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, "messages"), orderBy("createdAt"));
    const unsub = onSnapshot(q, (snap) => {
      const arr = snap.docs.map(
        (d) =>
          ({
            id: d.id,
            ...d.data(),
          } as ChatMessage)
      );
      setMessages(arr);
    });

    return unsub;
  }, [user]);

  // ======= регистрация / вход / выход =======

  const handleRegister = async () => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      setUser(cred.user);
    } catch (e: any) {
      console.error(e);

      let msg = "Ошибка при регистрации.";
      switch (e.code) {
        case "auth/email-already-in-use":
          msg = "Такой email уже зарегистрирован. Попробуйте войти.";
          break;
        case "auth/invalid-email":
          msg = "Некорректный email. Проверьте адрес.";
          break;
        case "auth/weak-password":
          msg = "Слишком простой пароль. Минимум 6 символов.";
          break;
        default:
          msg = "Ошибка при регистрации: " + e.message;
      }

      alert(msg);
    }
  };

  const handleLogin = async () => {
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      setUser(cred.user);
    } catch (e: any) {
      console.error(e);

      let msg = "Ошибка при входе.";
      switch (e.code) {
        case "auth/wrong-password":
          msg = "Неверный пароль. Попробуйте ещё раз.";
          break;
        case "auth/user-not-found":
          msg =
            "Пользователь с таким email не найден. Проверьте адрес или зарегистрируйтесь.";
          break;
        case "auth/invalid-email":
          msg = "Некорректный email. Проверьте адрес.";
          break;
        case "auth/too-many-requests":
          msg =
            "Слишком много неудачных попыток. Попробуйте позже или смените пароль.";
          break;
        default:
          msg = "Ошибка при входе: " + e.message;
      }

      alert(msg);
      setPassword("");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setEmail("");
    setPassword("");
  };

  // ======= выбор файла =======

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
  };

  // ======= отправка сообщения (текст + файл) =======

  const sendMessage = async () => {
    if (!user) return;
    if (!newMsg.trim() && !file) return;

    let fileUrl: string | null = null;
    let fileName: string | null = null;
    let fileType: string | null = null;

    if (file) {
      try {
        const path = `chatFiles/${user.uid}/${Date.now()}_${file.name}`;
        const fileRef = ref(storage, path);

        const metadata = {
          contentType: file.type || "application/octet-stream",
          // просим браузер скачивать файл, а не отображать
          contentDisposition: `attachment; filename="${encodeURIComponent(
            file.name
          )}"`,
        };

        await uploadBytes(fileRef, file, metadata);

        fileUrl = await getDownloadURL(fileRef);
        fileName = file.name;
        fileType = file.type || "application/octet-stream";
      } catch (e: any) {
        console.error(e);
        alert("Ошибка при загрузке файла: " + e.message);
        return;
      }
    }

    await addDoc(collection(db, "messages"), {
      text: newMsg.trim() || null,
      uid: user.uid,
      email: user.email,
      createdAt: serverTimestamp(),
      fileUrl,
      fileName,
      fileType,
    });

    setNewMsg("");
    setFile(null);
    const fileInput = document.getElementById(
      "file-input"
    ) as HTMLInputElement | null;
    if (fileInput) fileInput.value = "";
  };

  // ======= экран авторизации =======

  if (!user)
    return (
      <div className="app">
        <div className="card">
          <div className="auth-layout">
            <header>
              <h1 className="app-title">ORG MESSENGER</h1>
              <p className="app-subtitle">
                Вход по email и паролю на Firebase Auth, без SMS.
              </p>
            </header>

            <div>
              <h2 className="card-title">
                {mode === "login" ? "Вход" : "Регистрация"}
              </h2>
              <p className="card-subtitle">
                Используйте рабочую почту для доступа к чату организации.
              </p>
            </div>

            <div className="form-row">
              <span className="label">Email</span>
              <div className="input-row">
                <input
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@company.com"
                />
              </div>
            </div>

            <div className="form-row">
              <span className="label">Пароль</span>
              <div className="input-row">
                <input
                  className="input"
                  type={passwordVisible ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                />
                <button
                  type="button"
                  className="button"
                  style={{
                    padding: "0 12px",
                    fontSize: "0.8rem",
                    whiteSpace: "nowrap",
                  }}
                  onClick={() => setPasswordVisible((v) => !v)}
                >
                  {passwordVisible ? "Скрыть" : "Показать"}
                </button>
              </div>
            </div>

            <div className="input-row">
              {mode === "login" ? (
                <>
                  <button className="button primary" onClick={handleLogin}>
                    Войти
                  </button>
                  <button
                    className="button"
                    onClick={() => setMode("register")}
                  >
                    Создать аккаунт
                  </button>
                </>
              ) : (
                <>
                  <button className="button primary" onClick={handleRegister}>
                    Зарегистрироваться
                  </button>
                  <button
                    className="button"
                    onClick={() => setMode("login")}
                  >
                    Уже есть аккаунт
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );

  // ======= экран чата =======

  return (
    <div className="app">
      <div className="card chat-card">
        <header className="chat-header">
          <div>
            <h1 className="app-title">ORG MESSENGER</h1>
            <p className="chat-user-line">
              Вы вошли как: <b>{user.email}</b>
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div className="chat-status-dot" />
            <button
              className="button"
              style={{ padding: "4px 10px", fontSize: "0.8rem" }}
              onClick={handleLogout}
            >
              Выйти
            </button>
          </div>
        </header>

        <main className="chat-main">
          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">Пока сообщений нет</div>
            )}

            {messages.map((m) => {
              const own = m.uid === user.uid;
              const name = m.email || "Неизвестный";
              const isImage =
                m.fileType && m.fileType.startsWith("image/") && m.fileUrl;

              return (
                <div
                  key={m.id}
                  className={`msg-row ${own ? "own" : ""}`}
                >
                  <div className="msg-bubble">
                    <span className="msg-phone">{name}</span>
                    {m.text && (
                      <>
                        {" "}
                        <span className="msg-text">{m.text}</span>
                      </>
                    )}

                    {m.fileUrl && (
                      <div style={{ marginTop: m.text ? 6 : 0 }}>
                        {isImage ? (
                          // картинка тоже скачивается, но при этом показываем превью
                          <a
                            href={m.fileUrl || "#"}
                            download={m.fileName || true}
                            rel="noreferrer"
                          >
                            <img
                              src={m.fileUrl || ""}
                              alt={m.fileName || "file"}
                              style={{
                                maxWidth: "200px",
                                maxHeight: "200px",
                                borderRadius: 12,
                                display: "block",
                              }}
                            />
                          </a>
                        ) : (
                          <a
                            href={m.fileUrl || "#"}
                            download={m.fileName || true}
                            rel="noreferrer"
                            style={{ color: own ? "#e0e7ff" : "#4f46e5" }}
                          >
                            📎 {m.fileName || "Файл"}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="chat-input-row">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label
                htmlFor="file-input"
                className="button"
                style={{ cursor: "pointer" }}
              >
                📎 Файл
              </label>
              {file && (
                <span style={{ fontSize: "0.8rem", color: "#6b7280" }}>
                  {file.name}
                </span>
              )}
              <input
                id="file-input"
                type="file"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
            </div>

            <input
              className="input"
              value={newMsg}
              onChange={(e) => setNewMsg(e.target.value)}
              placeholder="Сообщение"
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button className="button primary" onClick={sendMessage}>
              Отправить
            </button>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
