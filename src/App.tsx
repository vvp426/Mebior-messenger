// src/App.tsx
import React, { useEffect, useRef, useState } from "react";
import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  Timestamp,
  addDoc,
  collection,
  collectionGroup,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";
import { auth, db, storage } from "./firebase";

interface UserProfile {
  uid: string;
  email: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  department?: string;
  avatarUrl?: string;
}

interface Chat {
  id: string;
  name: string;
  createdAt?: Timestamp | null;
}

interface ChatMessage {
  id: string;
  text: string;
  createdAt?: Timestamp | null;
  userId: string;
  userEmail: string;
  userName?: string;
  userAvatarUrl?: string;
  fileUrl?: string;
  fileName?: string;
}

type NotificationPermissionState = NotificationPermission | "unsupported";

const App: React.FC = () => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // auth form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [showPassword, setShowPassword] = useState(false);

  // chats & messages
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileNamePreview, setFileNamePreview] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  // notifications
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>(() => {
      if (typeof window === "undefined" || !("Notification" in window)) {
        return "unsupported";
      }
      return Notification.permission;
    });
  const lastNotifiedMessageIdRef = useRef<string | null>(null);

  // -------------------- AUTH & PROFILE --------------------

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          setProfile({
            uid: user.uid,
            ...(snap.data() as Omit<UserProfile, "uid">),
          });
        } else {
          const basic: UserProfile = {
            uid: user.uid,
            email: user.email || "",
          };
          await setDoc(userRef, basic, { merge: true });
          setProfile(basic);
        }
      } else {
        setProfile(null);
      }
    });

    return () => unsub();
  }, []);

  const uploadAvatarIfNeeded = async (
    uid: string
  ): Promise<string | undefined> => {
    if (!avatarFile) return undefined;

    const avatarRef = ref(storage, `avatars/${uid}`);
    await uploadBytes(avatarRef, avatarFile);
    const url = await getDownloadURL(avatarRef);
    return url;
  };

  const handleRegister = async () => {
    try {
      setLoading(true);
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      const user = cred.user;

      const avatarUrl = await uploadAvatarIfNeeded(user.uid);

      const fullName = `${firstName} ${lastName}`.trim();
      if (fullName) {
        await updateProfile(user, { displayName: fullName, photoURL: avatarUrl });
      }

      const userProfile: UserProfile = {
        uid: user.uid,
        email: user.email || "",
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        position: position.trim(),
        department: department.trim(),
        avatarUrl,
      };

      await setDoc(doc(db, "users", user.uid), userProfile, { merge: true });
      setProfile(userProfile);
      setAuthMode("login");
      alert("Аккаунт создан. Теперь войдите с этими данными.");
    } catch (e: any) {
      console.error(e);
      alert(`Ошибка при регистрации: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    try {
      setLoading(true);
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e: any) {
      console.error(e);
      alert("Ошибка входа: проверьте email и пароль.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setChats([]);
    setActiveChatId(null);
    setMessages([]);
  };

  // -------------------- CHATS --------------------

  // подписка на список чатов
  useEffect(() => {
    if (!firebaseUser) return;

    const chatsRef = collection(db, "chats");
    const qChats = query(chatsRef, orderBy("createdAt", "asc"));

    const unsub = onSnapshot(qChats, async (snap) => {
      if (snap.empty) {
        // создаём общий чат один раз
        await addDoc(chatsRef, {
          name: "Общий чат",
          createdAt: serverTimestamp(),
        });
        return;
      }

      const list: Chat[] = [];
      snap.forEach((d) =>
        list.push({
          id: d.id,
          ...(d.data() as Omit<Chat, "id">),
        })
      );
      setChats(list);

      if (!activeChatId && list.length > 0) {
        setActiveChatId(list[0].id);
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser]);

  // подписка на сообщения выбранного чата
  useEffect(() => {
    if (!firebaseUser || !activeChatId) {
      setMessages([]);
      return;
    }

    const msgsRef = collection(db, "chats", activeChatId, "messages");
    const qMsgs = query(msgsRef, orderBy("createdAt", "asc"));

    const unsub = onSnapshot(qMsgs, (snap) => {
      const list: ChatMessage[] = [];
      snap.forEach((d) =>
        list.push({
          id: d.id,
          ...(d.data() as Omit<ChatMessage, "id">),
        })
      );
      setMessages(list);
    });

    return () => unsub();
  }, [firebaseUser, activeChatId]);

  const handleCreateChat = async () => {
    const name = prompt("Название нового чата / группы:");
    if (!name) return;

    try {
      const chatsRef = collection(db, "chats");
      const docRef = await addDoc(chatsRef, {
        name: name.trim(),
        createdAt: serverTimestamp(),
      });
      setActiveChatId(docRef.id);
    } catch (e: any) {
      console.error(e);
      alert("Не удалось создать чат.");
    }
  };

  // -------------------- MESSAGES --------------------

  const handleSendMessage = async () => {
    if (!firebaseUser || !activeChatId) return;
    if (!newMessage.trim() && !file) return;

    try {
      setLoading(true);
      let uploadedFileUrl: string | undefined;
      let uploadedFileName: string | undefined;

      if (file) {
        const fileRef = ref(
          storage,
          `chatFiles/${firebaseUser.uid}/${Date.now()}_${file.name}`
        );
        await uploadBytes(fileRef, file);
        uploadedFileUrl = await getDownloadURL(fileRef);
        uploadedFileName = file.name;
      }

      const userName =
        profile?.firstName ||
        firebaseUser.displayName ||
        profile?.email ||
        firebaseUser.email ||
        "Неизвестный";

      const msgsRef = collection(db, "chats", activeChatId, "messages");
      await addDoc(msgsRef, {
        text: newMessage.trim(),
        createdAt: serverTimestamp(),
        userId: firebaseUser.uid,
        userEmail: firebaseUser.email,
        userName,
        userAvatarUrl: profile?.avatarUrl || firebaseUser.photoURL || null,
        fileUrl: uploadedFileUrl || null,
        fileName: uploadedFileName || null,
      });

      setNewMessage("");
      setFile(null);
      setFileNamePreview(null);
    } catch (e: any) {
      console.error(e);
      alert("Ошибка при отправке сообщения.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setFileNamePreview(f ? f.name : null);
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setAvatarFile(f);
  };

  const handleMention = (name: string | undefined) => {
    if (!name) return;
    setNewMessage((prev) => (prev ? `${prev} @${name}` : `@${name} `));
  };

  // -------------------- NOTIFICATIONS --------------------

  const requestNotificationPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      alert("Браузер не поддерживает уведомления.");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
    } catch (e) {
      console.error(e);
    }
  };

  // глобальный слушатель последнего сообщения во всех чатах
  useEffect(() => {
    if (!firebaseUser) return;
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      notificationPermission === "unsupported"
    ) {
      return;
    }

    const qLast = query(
      collectionGroup(db, "messages"),
      orderBy("createdAt", "desc"),
      limit(1)
    );

    const unsub = onSnapshot(qLast, (snap) => {
      const docSnap = snap.docs[0];
      if (!docSnap) return;

      const data = docSnap.data() as any;
      const id = docSnap.id;

      if (!data) return;
      if (data.userId === firebaseUser.uid) return; // не уведомляем о своих
      if (lastNotifiedMessageIdRef.current === id) return;
      if (typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") return;

      const chatId = docSnap.ref.parent.parent?.id || null;
      const chatName =
        (chatId && chats.find((c) => c.id === chatId)?.name) || "Чат";

      // если вкладка активна и мы уже в этом чате — не шумим
      if (!document.hidden && chatId === activeChatId) return;

      const bodyParts: string[] = [];
      if (data.userName || data.userEmail) {
        bodyParts.push(String(data.userName || data.userEmail));
      }
      if (data.text) {
        bodyParts.push(String(data.text));
      } else if (data.fileName) {
        bodyParts.push(`файл: ${data.fileName}`);
      } else {
        bodyParts.push("новое сообщение");
      }

      try {
        new Notification(`Новое сообщение в «${chatName}»`, {
          body: bodyParts.join(" — "),
          icon: data.userAvatarUrl || undefined,
        });
        lastNotifiedMessageIdRef.current = id;
      } catch (e) {
        console.error("Ошибка показа уведомления", e);
      }
    });

    return () => unsub();
  }, [firebaseUser, chats, activeChatId, notificationPermission]);

  // -------------------- RENDER HELPERS --------------------

  const currentDisplayName =
    profile?.firstName && profile?.lastName
      ? `${profile.firstName} ${profile.lastName}`
      : profile?.firstName
      ? profile.firstName
      : profile?.email || firebaseUser?.email || "";

  const renderMessage = (m: ChatMessage) => {
    const isMe = m.userId === firebaseUser?.uid;
    const created =
      m.createdAt instanceof Timestamp
        ? m.createdAt.toDate().toLocaleTimeString("ru-RU", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";

    return (
      <div
        key={m.id}
        onClick={() => handleMention(m.userName || m.userEmail)}
        style={{
          display: "flex",
          justifyContent: isMe ? "flex-end" : "flex-start",
          marginBottom: 8,
          cursor: "pointer",
        }}
        title="Нажмите, чтобы обратиться к пользователю"
      >
        {!isMe && (
          <img
            src={
              m.userAvatarUrl ||
              "https://api.dicebear.com/7.x/initials/svg?seed=" +
                encodeURIComponent(m.userName || m.userEmail || "U")
            }
            alt="avatar"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              marginRight: 8,
              flexShrink: 0,
            }}
          />
        )}

        <div
          style={{
            background: isMe
              ? "linear-gradient(135deg,#5c6cff,#965cf7)"
              : "#f4f6fb",
            color: isMe ? "#fff" : "#111827",
            borderRadius: 20,
            padding: "8px 14px",
            maxWidth: "60%",
            boxShadow: "0 4px 12px rgba(15,23,42,0.12)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              opacity: 0.8,
              marginBottom: 4,
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <span>{m.userName || m.userEmail}</span>
            <span>{created}</span>
          </div>
          {m.text && <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>}
          {m.fileUrl && (
            <div style={{ marginTop: 6 }}>
              <a
                href={m.fileUrl}
                download={m.fileName || true}
                style={{
                  color: isMe ? "#e0e7ff" : "#4f46e5",
                  textDecoration: "underline",
                  fontSize: 13,
                }}
              >
                📎 {m.fileName || "Файл"}
              </a>
            </div>
          )}
        </div>

        {isMe && (
          <img
            src={
              m.userAvatarUrl ||
              "https://api.dicebear.com/7.x/initials/svg?seed=" +
                encodeURIComponent(m.userName || m.userEmail || "U")
            }
            alt="avatar"
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              marginLeft: 8,
              flexShrink: 0,
            }}
          />
        )}
      </div>
    );
  };

  // -------------------- UI --------------------

  if (!firebaseUser) {
    // ---------- AUTH SCREEN ----------
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at top,#1f2937,#020617)",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <div
          style={{
            width: 420,
            maxWidth: "90vw",
            background: "rgba(15,23,42,0.96)",
            borderRadius: 24,
            padding: 32,
            boxShadow:
              "0 24px 80px rgba(15,23,42,0.9),0 0 0 1px rgba(148,163,184,0.2)",
            color: "#e5e7eb",
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
            ORG MESSENGER
          </h1>
          <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 24 }}>
            Вход по email и паролю на Firebase Auth. Без SMS, бесплатно.
          </p>

          <div
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 20,
              background: "#020617",
              padding: 4,
              borderRadius: 999,
            }}
          >
            <button
              onClick={() => setAuthMode("login")}
              style={{
                flex: 1,
                border: "none",
                borderRadius: 999,
                padding: "6px 0",
                fontSize: 13,
                cursor: "pointer",
                background:
                  authMode === "login"
                    ? "linear-gradient(135deg,#6366f1,#a855f7)"
                    : "transparent",
                color: authMode === "login" ? "#fff" : "#9ca3af",
              }}
            >
              Вход
            </button>
            <button
              onClick={() => setAuthMode("register")}
              style={{
                flex: 1,
                border: "none",
                borderRadius: 999,
                padding: "6px 0",
                fontSize: 13,
                cursor: "pointer",
                background:
                  authMode === "register"
                    ? "linear-gradient(135deg,#6366f1,#a855f7)"
                    : "transparent",
                color: authMode === "register" ? "#fff" : "#9ca3af",
              }}
            >
              Регистрация
            </button>
          </div>

          {authMode === "register" && (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <input
                  placeholder="Имя"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  style={inputStyle}
                />
                <input
                  placeholder="Фамилия"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <input
                placeholder="Должность"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                style={{ ...inputStyle, marginBottom: 8 }}
              />
              <input
                placeholder="Подразделение"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                style={{ ...inputStyle, marginBottom: 12 }}
              />
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  marginBottom: 8,
                  cursor: "pointer",
                  color: "#9ca3af",
                }}
              >
                Аватар:
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  style={{ marginTop: 4, fontSize: 12, width: "100%" }}
                />
              </label>
            </>
          )}

          <input
            type="email"
            placeholder="Рабочий email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ ...inputStyle, marginBottom: 8 }}
          />

          <div style={{ position: "relative", marginBottom: 16 }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Пароль (минимум 6 символов)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ ...inputStyle, width: "100%", paddingRight: 70 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              style={{
                position: "absolute",
                right: 8,
                top: 4,
                bottom: 4,
                borderRadius: 999,
                border: "none",
                padding: "0 10px",
                fontSize: 12,
                cursor: "pointer",
                background: "#020617",
                color: "#9ca3af",
              }}
            >
              {showPassword ? "Скрыть" : "Показать"}
            </button>
          </div>

          <button
            onClick={authMode === "login" ? handleLogin : handleRegister}
            disabled={loading}
            style={{
              width: "100%",
              border: "none",
              borderRadius: 999,
              padding: "10px 0",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              background: "linear-gradient(135deg,#6366f1,#a855f7)",
              color: "#fff",
              boxShadow: "0 12px 30px rgba(79,70,229,0.6)",
            }}
          >
            {loading
              ? "Подождите…"
              : authMode === "login"
              ? "Войти"
              : "Создать аккаунт"}
          </button>
        </div>
      </div>
    );
  }

  // ---------- CHAT SCREEN ----------
  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top,#020617,#020617 45%,#030712)",
        padding: 24,
        boxSizing: "border-box",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          gap: 16,
          height: "calc(100vh - 48px)",
        }}
      >
        {/* SIDEBAR WITH CHATS */}
        <div
          style={{
            width: 260,
            background: "rgba(15,23,42,0.98)",
            borderRadius: 24,
            padding: 16,
            boxShadow:
              "0 20px 60px rgba(15,23,42,0.85),0 0 0 1px rgba(148,163,184,0.22)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: "#e5e7eb",
                marginBottom: 4,
              }}
            >
              ORG MESSENGER
            </div>
            <div
              style={{
                fontSize: 12,
                color: "#9ca3af",
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <img
                src={
                  profile?.avatarUrl ||
                  firebaseUser.photoURL ||
                  "https://api.dicebear.com/7.x/initials/svg?seed=" +
                    encodeURIComponent(currentDisplayName || "U")
                }
                alt="me"
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  objectFit: "cover",
                }}
              />
              <span>{currentDisplayName}</span>
            </div>
          </div>

          {notificationPermission !== "unsupported" && (
            <button
              onClick={requestNotificationPermission}
              style={{
                width: "100%",
                borderRadius: 999,
                border: "1px solid rgba(148,163,184,0.4)",
                padding: "4px 10px",
                fontSize: 11,
                marginTop: 4,
                marginBottom: 12,
                cursor: "pointer",
                background:
                  notificationPermission === "granted"
                    ? "rgba(22,163,74,0.15)"
                    : "rgba(15,23,42,0.9)",
                color:
                  notificationPermission === "granted"
                    ? "#bbf7d0"
                    : "#e5e7eb",
              }}
            >
              {notificationPermission === "granted"
                ? "🔔 Уведомления включены"
                : "🔕 Включить уведомления"}
            </button>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: 0.06,
                color: "#6b7280",
              }}
            >
              Чаты и группы
            </span>
            <button
              onClick={handleCreateChat}
              style={{
                border: "none",
                borderRadius: 999,
                padding: "4px 10px",
                fontSize: 11,
                cursor: "pointer",
                background:
                  "linear-gradient(135deg,#6366f1,#a855f7)",
                color: "#fff",
              }}
            >
              + Новый
            </button>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              paddingRight: 4,
            }}
          >
            {chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => setActiveChatId(chat.id)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  cursor: "pointer",
                  fontSize: 14,
                  color:
                    activeChatId === chat.id ? "#fff" : "#e5e7eb",
                  background:
                    activeChatId === chat.id
                      ? "linear-gradient(135deg,#6366f1,#a855f7)"
                      : "transparent",
                  marginBottom: 4,
                }}
              >
                {chat.name}
              </div>
            ))}
          </div>

          <button
            onClick={handleLogout}
            style={{
              marginTop: 12,
              border: "none",
              borderRadius: 999,
              padding: "8px 0",
              fontSize: 13,
              cursor: "pointer",
              background: "rgba(239,68,68,0.1)",
              color: "#fecaca",
            }}
          >
            Выйти
          </button>
        </div>

        {/* MAIN CHAT PANEL */}
        <div
          style={{
            flex: 1,
            background: "#f9fafb",
            borderRadius: 24,
            padding: 16,
            boxShadow:
              "0 20px 60px rgba(15,23,42,0.5),0 0 0 1px rgba(148,163,184,0.18)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* HEADER */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: "#111827",
                }}
              >
                {chats.find((c) => c.id === activeChatId)?.name || "Чат"}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                }}
              >
                Вы вошли как: {currentDisplayName}
              </div>
            </div>

            {profile && (
              <div
                style={{
                  fontSize: 11,
                  color: "#6b7280",
                  textAlign: "right",
                }}
              >
                <div>{profile.position && <span>{profile.position}</span>}</div>
                <div>
                  {profile.department && <span>{profile.department}</span>}
                </div>
              </div>
            )}
          </div>

          {/* MESSAGES */}
          <div
            style={{
              flex: 1,
              background: "#e5e7eb",
              borderRadius: 20,
              padding: 12,
              overflowY: "auto",
              marginBottom: 12,
            }}
          >
            {messages.length === 0 ? (
              <div
                style={{
                  height: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#6b7280",
                  fontSize: 13,
                  textAlign: "center",
                }}
              >
                В этом чате пока нет сообщений. Напишите первое!
              </div>
            ) : (
              messages.map(renderMessage)
            )}
          </div>

          {/* INPUT LINE */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <label
              style={{
                borderRadius: 999,
                padding: "8px 12px",
                background: "#e5e7eb",
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              📎 Файл
              <input
                type="file"
                style={{ display: "none" }}
                onChange={handleFileChange}
              />
            </label>

            <div style={{ flex: 1 }}>
              <input
                placeholder={
                  fileNamePreview
                    ? `Файл: ${fileNamePreview}. Добавьте сообщение (необязательно)…`
                    : "Сообщение"
                }
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                style={{
                  ...inputStyle,
                  width: "100%",
                  background: "#e5e7eb",
                }}
              />
            </div>

            <button
              onClick={handleSendMessage}
              disabled={loading}
              style={{
                border: "none",
                borderRadius: 999,
                padding: "10px 22px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                background: "linear-gradient(135deg,#6366f1,#a855f7)",
                color: "#fff",
                whiteSpace: "nowrap",
              }}
            >
              Отправить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// базовый стиль для инпутов на тёмном фоне
const inputStyle: React.CSSProperties = {
  width: "100%",
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.5)",
  padding: "8px 14px",
  fontSize: 13,
  outline: "none",
  background: "#020617",
  color: "#e5e7eb",
};

export default App;