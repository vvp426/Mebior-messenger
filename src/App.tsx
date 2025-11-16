// src/App.tsx
import { useEffect, useMemo, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "./firebase";

interface AppUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  department?: string;
  avatarUrl?: string | null;
}

interface Chat {
  id: string;
  name: string;
  isGroup: boolean;
  createdAt?: { seconds: number; nanoseconds: number } | null;
}

interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderEmail: string;
  text: string | null;
  fileUrl: string | null;
  fileName: string | null;
  fileType: string | null;
  createdAt?: { seconds: number; nanoseconds: number } | null;
}

type AuthMode = "login" | "register";

const GENERAL_CHAT_NAME = "Общий чат";

function formatTimestamp(ts?: { seconds: number; nanoseconds: number } | null) {
  if (!ts) return "";
  const date = new Date(ts.seconds * 1000);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getDisplayName(user?: AppUser) {
  if (!user) return "Неизвестный";
  const { firstName, lastName, email } = user;
  if (firstName || lastName) {
    return `${firstName ?? ""} ${lastName ?? ""}`.trim();
  }
  return email;
}

function App() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // доп поля при регистрации
  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regPosition, setRegPosition] = useState("");
  const [regDepartment, setRegDepartment] = useState("");

  // чаты и сообщения
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // все пользователи (для аватаров и отображения имён)
  const [usersMap, setUsersMap] = useState<Record<string, AppUser>>({});

  // модалка профиля
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);

  // уведомления
  const [hasUnread, setHasUnread] = useState(false);

  // ====== АВТОРИЗАЦИЯ ======

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
      }
    });
    return () => unsub();
  }, []);

  // загрузка / создание документа пользователя
  useEffect(() => {
    if (!firebaseUser) return;

    const userRef = doc(db, "users", firebaseUser.uid);

    const unsub = onSnapshot(userRef, async (snap) => {
      if (!snap.exists()) {
        const newProfile: AppUser = {
          id: firebaseUser.uid,
          email: firebaseUser.email ?? "",
          firstName: "",
          lastName: "",
          position: "",
          department: "",
          avatarUrl: null,
        };
        await setDoc(userRef, {
          ...newProfile,
          createdAt: serverTimestamp(),
        });
        setProfile(newProfile);
      } else {
        const data = snap.data() as any;
        setProfile({
          id: snap.id,
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          position: data.position,
          department: data.department,
          avatarUrl: data.avatarUrl ?? null,
        });
      }
    });

    return () => unsub();
  }, [firebaseUser]);

  const handleAuthSubmit = async () => {
    setAuthError(null);
    if (!authEmail || !authPassword) {
      setAuthError("Заполните email и пароль");
      return;
    }
    setAuthLoading(true);
    try {
      if (authMode === "login") {
        await signInWithEmailAndPassword(auth, authEmail, authPassword);
      } else {
        const cred = await createUserWithEmailAndPassword(
          auth,
          authEmail,
          authPassword
        );
        const userRef = doc(db, "users", cred.user.uid);
        await setDoc(userRef, {
          email: authEmail,
          firstName: regFirstName.trim(),
          lastName: regLastName.trim(),
          position: regPosition.trim(),
          department: regDepartment.trim(),
          avatarUrl: null,
          createdAt: serverTimestamp(),
        });
      }
    } catch (err: any) {
      console.error(err);
      setAuthError(err.message ?? "Ошибка авторизации");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  // ====== ЧАТЫ / ПОЛЬЗОВАТЕЛИ ======

  // все пользователи
  useEffect(() => {
    const colRef = collection(db, "users");
    const unsub = onSnapshot(colRef, (snap) => {
      const map: Record<string, AppUser> = {};
      snap.forEach((doc) => {
        const d = doc.data() as any;
        map[doc.id] = {
          id: doc.id,
          email: d.email,
          firstName: d.firstName,
          lastName: d.lastName,
          position: d.position,
          department: d.department,
          avatarUrl: d.avatarUrl ?? null,
        };
      });
      setUsersMap(map);
    });
    return () => unsub();
  }, []);

  // чаты
  useEffect(() => {
    if (!firebaseUser) return;

    const colRef = collection(db, "chats");
    const q = query(colRef, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, async (snap) => {
      let arr: Chat[] = [];
      snap.forEach((doc) => {
        const d = doc.data() as any;
        arr.push({
          id: doc.id,
          name: d.name,
          isGroup: d.isGroup,
          createdAt: d.createdAt ?? null,
        });
      });

      // если ещё нет общего чата — создаём
      if (!arr.some((c) => c.name === GENERAL_CHAT_NAME)) {
        const newChatRef = await addDoc(colRef, {
          name: GENERAL_CHAT_NAME,
          isGroup: true,
          createdAt: serverTimestamp(),
        });
        arr = [
          {
            id: newChatRef.id,
            name: GENERAL_CHAT_NAME,
            isGroup: true,
            createdAt: null,
          },
          ...arr,
        ];
      }

      setChats(arr);
      if (!currentChatId && arr.length > 0) {
        const general = arr.find((c) => c.name === GENERAL_CHAT_NAME) ?? arr[0];
        setCurrentChatId(general.id);
      }
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseUser]);

  // сообщения конкретного чата + уведомления
  useEffect(() => {
    if (!firebaseUser || !currentChatId) {
      setMessages([]);
      return;
    }

    const colRef = collection(db, "messages");
    const q = query(
      colRef,
      where("chatId", "==", currentChatId),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const arr: ChatMessage[] = [];
      const changes = snap.docChanges();

      changes.forEach((change) => {
        if (change.type === "added") {
          const d = change.doc.data() as any;
          // уведомления
          if (
            document.hidden &&
            d.senderId !== firebaseUser.uid // не свои сообщения
          ) {
            notifyNewMessage(d);
          }
        }
      });

      snap.forEach((doc) => {
        const d = doc.data() as any;
        arr.push({
          id: doc.id,
          chatId: d.chatId,
          senderId: d.senderId,
          senderEmail: d.senderEmail,
          text: d.text ?? null,
          fileUrl: d.fileUrl ?? null,
          fileName: d.fileName ?? null,
          fileType: d.fileType ?? null,
          createdAt: d.createdAt ?? null,
        });
      });
      setMessages(arr);
    });

    return () => unsub();
  }, [firebaseUser, currentChatId]);

  // запрос прав на Notification
  useEffect(() => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, []);

  // сброс "непрочитанных" при фокусе
  useEffect(() => {
    const onFocus = () => setHasUnread(false);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // смена title при hasUnread
  useEffect(() => {
    const original = document.title || "ORG MESSENGER";
    if (hasUnread) {
      document.title = "Новое сообщение — ORG MESSENGER";
    } else {
      document.title = original;
    }
    return () => {
      document.title = original;
    };
  }, [hasUnread]);

  const notifyNewMessage = (d: any) => {
    setHasUnread(true);
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const sender = usersMap[d.senderId];
    const title = "Org Messenger";
    const bodyParts: string[] = [];
    if (sender) bodyParts.push(getDisplayName(sender));
    if (d.text) bodyParts.push(d.text);
    else if (d.fileName) bodyParts.push(`Файл: ${d.fileName}`);
    const body = bodyParts.join(": ");

    try {
      new Notification(title, { body });
    } catch {
      // некоторых браузерах может падать — игнорируем
    }
  };

  // ====== ОТПРАВКА СООБЩЕНИЯ ======

  const handleSendMessage = async () => {
    if (!firebaseUser || !currentChatId) return;

    const trimmedText = newMessage.trim();
    if (!trimmedText && !selectedFile) return;

    let fileUrl: string | null = null;
    let fileName: string | null = null;
    let fileType: string | null = null;

    if (selectedFile) {
      const fileRef = ref(
        storage,
        `chatFiles/${firebaseUser.uid}/${Date.now()}_${selectedFile.name}`
      );
      await uploadBytes(fileRef, selectedFile);
      fileUrl = await getDownloadURL(fileRef);
      fileName = selectedFile.name;
      fileType = selectedFile.type || null;
    }

    await addDoc(collection(db, "messages"), {
      chatId: currentChatId,
      senderId: firebaseUser.uid,
      senderEmail: firebaseUser.email ?? "",
      text: trimmedText || null,
      fileUrl,
      fileName,
      fileType,
      createdAt: serverTimestamp(),
    });

    setNewMessage("");
    setSelectedFile(null);
  };

  // клик по пользователю → @Имя
  const handleMentionUser = (userId: string) => {
    const user = usersMap[userId];
    const name = getDisplayName(user);
    setNewMessage((prev) => {
      const base = prev.trimEnd();
      const prefix = base ? base + " " : "";
      return `${prefix}@${name} `;
    });
  };

  // создание нового чата / группы
  const handleCreateChat = async () => {
    const name = window.prompt("Название чата / группы:");
    if (!name) return;
    const chatRef = await addDoc(collection(db, "chats"), {
      name: name.trim(),
      isGroup: true,
      createdAt: serverTimestamp(),
    });
    setCurrentChatId(chatRef.id);
  };

  // ====== ПРОФИЛЬ / АВАТАР ======

  const handleProfileSave = async () => {
    if (!firebaseUser || !profile) return;
    setProfileSaving(true);
    try {
      const userRef = doc(db, "users", firebaseUser.uid);
      await updateDoc(userRef, {
        firstName: profile.firstName ?? "",
        lastName: profile.lastName ?? "",
        position: profile.position ?? "",
        department: profile.department ?? "",
      });
      setIsProfileOpen(false);
    } catch (e) {
      console.error(e);
      alert("Ошибка сохранения профиля");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAvatarChange = async (file: File | null) => {
    if (!firebaseUser || !file) return;
    try {
      const avatarRef = ref(storage, `avatars/${firebaseUser.uid}`);
      await uploadBytes(avatarRef, file);
      const url = await getDownloadURL(avatarRef);
      const userRef = doc(db, "users", firebaseUser.uid);
      await updateDoc(userRef, { avatarUrl: url });
    } catch (e) {
      console.error(e);
      alert("Ошибка загрузки аватара");
    }
  };

  const currentChat = useMemo(
    () => chats.find((c) => c.id === currentChatId) ?? null,
    [chats, currentChatId]
  );

  // ====== РЕНДЕР ======

  if (!firebaseUser) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.title}>ORG MESSENGER</h1>
          <p style={styles.subtitle}>
            Вход по email и паролю на Firebase Auth, без SMS.
          </p>

          <div style={{ marginTop: 24, width: "100%" }}>
            <div style={styles.fieldLabel}>Email</div>
            <input
              style={styles.input}
              type="email"
              placeholder="user@company.com"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
            />

            <div style={{ ...styles.fieldLabel, marginTop: 12 }}>Пароль</div>
            <div style={{ position: "relative" }}>
              <input
                style={styles.input}
                type={showPassword ? "text" : "password"}
                placeholder="Минимум 6 символов"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
              />
              <button
                type="button"
                style={styles.showPasswordButton}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? "Скрыть" : "Показать"}
              </button>
            </div>

            {authMode === "register" && (
              <div style={{ marginTop: 16 }}>
                <div style={styles.fieldLabel}>Имя</div>
                <input
                  style={styles.input}
                  value={regFirstName}
                  onChange={(e) => setRegFirstName(e.target.value)}
                />
                <div style={styles.fieldLabel}>Фамилия</div>
                <input
                  style={styles.input}
                  value={regLastName}
                  onChange={(e) => setRegLastName(e.target.value)}
                />
                <div style={styles.fieldLabel}>Должность</div>
                <input
                  style={styles.input}
                  value={regPosition}
                  onChange={(e) => setRegPosition(e.target.value)}
                />
                <div style={styles.fieldLabel}>Подразделение</div>
                <input
                  style={styles.input}
                  value={regDepartment}
                  onChange={(e) => setRegDepartment(e.target.value)}
                />
              </div>
            )}

            {authError && (
              <div style={styles.errorBox}>{authError}</div>
            )}

            <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
              <button
                style={styles.primaryButton}
                onClick={handleAuthSubmit}
                disabled={authLoading}
              >
                {authMode === "login" ? "Войти" : "Создать аккаунт"}
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              {authMode === "login" ? (
                <button
                  style={styles.textButton}
                  onClick={() => {
                    setAuthMode("register");
                    setAuthError(null);
                  }}
                >
                  Нет аккаунта? Зарегистрироваться
                </button>
              ) : (
                <button
                  style={styles.textButton}
                  onClick={() => {
                    setAuthMode("login");
                    setAuthError(null);
                  }}
                >
                  Уже есть аккаунт? Войти
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ====== ОСНОВНОЙ ЧАТ ======

  return (
    <div style={styles.page}>
      <div style={styles.chatShell}>
        {/* Верхняя панель */}
        <div style={styles.header}>
          <div>
            <div style={styles.appTitle}>ORG MESSENGER</div>
            <div style={styles.headerSubtitle}>
              Вы вошли как: {firebaseUser.email}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button
              style={styles.secondaryButton}
              onClick={() => setIsProfileOpen(true)}
            >
              Профиль
            </button>
            <button style={styles.secondaryButton} onClick={handleLogout}>
              Выйти
            </button>
          </div>
        </div>

        <div style={styles.mainLayout}>
          {/* список чатов */}
          <div style={styles.chatListColumn}>
            <div style={styles.chatListHeader}>
              <span>Чаты</span>
              <button
                style={styles.smallButton}
                onClick={handleCreateChat}
                title="Создать новый чат / группу"
              >
                + Новый
              </button>
            </div>
            <div style={styles.chatList}>
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  style={{
                    ...styles.chatListItem,
                    backgroundColor:
                      chat.id === currentChatId ? "#4f46e5" : "transparent",
                    color: chat.id === currentChatId ? "#fff" : "#e5e7eb",
                  }}
                  onClick={() => setCurrentChatId(chat.id)}
                >
                  {chat.name}
                </button>
              ))}
            </div>
          </div>

          {/* окно чата */}
          <div style={styles.chatColumn}>
            <div style={styles.chatHeader}>
              <div>
                <div style={styles.chatTitle}>
                  {currentChat ? currentChat.name : "Чат"}
                </div>
                <div style={styles.chatSubtitle}>
                  Сообщений: {messages.length}
                </div>
              </div>
            </div>

            <div style={styles.messagesBox}>
              {messages.map((m) => {
                const sender = usersMap[m.senderId];
                const isOwn = m.senderId === firebaseUser.uid;
                const name = getDisplayName(sender);

                return (
                  <div
                    key={m.id}
                    style={{
                      display: "flex",
                      justifyContent: isOwn ? "flex-end" : "flex-start",
                      marginBottom: 8,
                    }}
                  >
                    {!isOwn && (
                      <button
                        style={styles.avatarButton}
                        type="button"
                        onClick={() => handleMentionUser(m.senderId)}
                        title={`Обратиться к ${name}`}
                      >
                        {sender?.avatarUrl ? (
                          <img
                            src={sender.avatarUrl}
                            alt={name}
                            style={styles.avatarImg}
                          />
                        ) : (
                          <span style={styles.avatarInitials}>
                            {name[0] ?? "?"}
                          </span>
                        )}
                      </button>
                    )}

                    <div
                      style={{
                        maxWidth: "70%",
                        textAlign: "left",
                        marginLeft: isOwn ? 0 : 8,
                        marginRight: isOwn ? 8 : 0,
                      }}
                    >
                      <button
                        style={{
                          ...styles.senderNameButton,
                          alignSelf: isOwn ? "flex-end" : "flex-start",
                        }}
                        type="button"
                        onClick={() => handleMentionUser(m.senderId)}
                        title="Кликните, чтобы обратиться по имени"
                      >
                        {name}
                      </button>

                      <div
                        style={{
                          ...styles.messageBubble,
                          background: isOwn ? "#4f46e5" : "#f3f4f6",
                          color: isOwn ? "#fff" : "#111827",
                          alignSelf: isOwn ? "flex-end" : "flex-start",
                        }}
                      >
                        {m.text && <div>{m.text}</div>}

                        {m.fileUrl && (
                          <div style={{ marginTop: m.text ? 6 : 0 }}>
                            {renderFileContent(m)}
                          </div>
                        )}
                      </div>
                      <div style={styles.messageMeta}>
                        <span>{formatTimestamp(m.createdAt ?? null)}</span>
                      </div>
                    </div>

                    {isOwn && (
                      <button
                        style={styles.avatarButton}
                        type="button"
                        onClick={() => handleMentionUser(m.senderId)}
                        title={`Вы: ${name}`}
                      >
                        {sender?.avatarUrl ? (
                          <img
                            src={sender.avatarUrl}
                            alt={name}
                            style={styles.avatarImg}
                          />
                        ) : (
                          <span style={styles.avatarInitials}>
                            {name[0] ?? "Я"}
                          </span>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* форма отправки */}
            <div style={styles.composer}>
              <label style={styles.fileLabel}>
                📎
                <span style={{ marginLeft: 6 }}>
                  {selectedFile ? selectedFile.name : "Файл"}
                </span>
                <input
                  type="file"
                  style={{ display: "none" }}
                  onChange={(e) =>
                    setSelectedFile(e.target.files?.[0] ?? null)
                  }
                />
              </label>

              <input
                style={styles.composerInput}
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
                style={styles.sendButton}
                onClick={handleSendMessage}
              >
                Отправить
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Модалка профиля */}
      {isProfileOpen && profile && (
        <div style={styles.modalBackdrop} onClick={() => setIsProfileOpen(false)}>
          <div
            style={styles.profileModal}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ marginTop: 0 }}>Профиль</h2>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div>
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt="avatar"
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: "50%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: "50%",
                      background: "#4f46e5",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontWeight: 600,
                      fontSize: 24,
                    }}
                  >
                    {getDisplayName(profile)[0] ?? "?"}
                  </div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>Email</div>
                <div>{profile.email}</div>
                <label
                  style={{
                    marginTop: 12,
                    display: "inline-flex",
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "#e5e7eb",
                    fontSize: 13,
                    cursor: "pointer",
                  }}
                >
                  Изменить аватар
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) =>
                      handleAvatarChange(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={styles.fieldLabel}>Имя</div>
              <input
                style={styles.input}
                value={profile.firstName ?? ""}
                onChange={(e) =>
                  setProfile((p) =>
                    p ? { ...p, firstName: e.target.value } : p
                  )
                }
              />
              <div style={styles.fieldLabel}>Фамилия</div>
              <input
                style={styles.input}
                value={profile.lastName ?? ""}
                onChange={(e) =>
                  setProfile((p) =>
                    p ? { ...p, lastName: e.target.value } : p
                  )
                }
              />
              <div style={styles.fieldLabel}>Должность</div>
              <input
                style={styles.input}
                value={profile.position ?? ""}
                onChange={(e) =>
                  setProfile((p) =>
                    p ? { ...p, position: e.target.value } : p
                  )
                }
              />
              <div style={styles.fieldLabel}>Подразделение</div>
              <input
                style={styles.input}
                value={profile.department ?? ""}
                onChange={(e) =>
                  setProfile((p) =>
                    p ? { ...p, department: e.target.value } : p
                  )
                }
              />
            </div>

            <div
              style={{
                marginTop: 20,
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
              }}
            >
              <button
                style={styles.secondaryButton}
                onClick={() => setIsProfileOpen(false)}
              >
                Отмена
              </button>
              <button
                style={styles.primaryButton}
                onClick={handleProfileSave}
                disabled={profileSaving}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ====== РЕНДЕР ФАЙЛА В СООБЩЕНИИ ======

function renderFileContent(m: ChatMessage) {
  const isImage =
    (m.fileType && m.fileType.startsWith("image/")) ||
    (m.fileName &&
      /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(m.fileName));

  if (isImage && m.fileUrl) {
    return (
      <a
        href={m.fileUrl}
        target="_blank"
        rel="noreferrer"
        style={{ textDecoration: "none" }}
      >
        <img
          src={m.fileUrl}
          alt={m.fileName ?? "image"}
          style={{
            maxWidth: "70vw",
            maxHeight: "60vh",
            borderRadius: 18,
            display: "block",
            objectFit: "cover",
          }}
        />
      </a>
    );
  }

  if (!m.fileUrl) return null;

  return (
    <a
      href={m.fileUrl}
      download={m.fileName || true}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 12px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.9)",
        color: "#111",
        fontSize: 13,
        maxWidth: "80vw",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
        overflow: "hidden",
        textDecoration: "none",
        boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
      }}
    >
      <span style={{ marginRight: 6 }}>📎</span>
      <span>{m.fileName ?? "Файл"}</span>
    </a>
  );
}

// ====== СТИЛИ ======

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    background: "rgba(15,23,42,0.95)",
    borderRadius: 24,
    padding: 24,
    color: "#e5e7eb",
    boxShadow: "0 24px 60px rgba(0,0,0,0.6)",
  },
  title: {
    fontSize: 26,
    fontWeight: 700,
    margin: 0,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 14,
    color: "#9ca3af",
  },
  fieldLabel: {
    fontSize: 13,
    marginBottom: 4,
    color: "#9ca3af",
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 999,
    border: "1px solid #4b5563",
    outline: "none",
    fontSize: 14,
    background: "#020617",
    color: "#e5e7eb",
  },
  showPasswordButton: {
    position: "absolute",
    right: 10,
    top: "50%",
    transform: "translateY(-50%)",
    border: "none",
    background: "transparent",
    color: "#9ca3af",
    fontSize: 13,
    cursor: "pointer",
  },
  errorBox: {
    marginTop: 12,
    padding: "8px 12px",
    borderRadius: 12,
    background: "rgba(248,113,113,0.12)",
    color: "#fecaca",
    fontSize: 13,
  },
  primaryButton: {
    padding: "10px 18px",
    borderRadius: 999,
    border: "none",
    background: "linear-gradient(135deg,#4f46e5,#6366f1)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  secondaryButton: {
    padding: "8px 14px",
    borderRadius: 999,
    border: "1px solid rgba(148,163,184,0.6)",
    background: "transparent",
    color: "#e5e7eb",
    fontSize: 13,
    cursor: "pointer",
  },
  textButton: {
    border: "none",
    background: "transparent",
    color: "#a5b4fc",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
  },
  chatShell: {
    width: "100%",
    maxWidth: 1180,
    height: "90vh",
    borderRadius: 32,
    background: "rgba(15,23,42,0.95)",
    boxShadow: "0 32px 80px rgba(0,0,0,0.65)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    padding: "16px 20px",
    borderBottom: "1px solid rgba(148,163,184,0.3)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  appTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: "#f9fafb",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 4,
  },
  mainLayout: {
    flex: 1,
    display: "flex",
    minHeight: 0,
  },
  chatListColumn: {
    width: 220,
    borderRight: "1px solid rgba(148,163,184,0.3)",
    padding: 12,
    display: "flex",
    flexDirection: "column",
  },
  chatListHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 14,
    color: "#e5e7eb",
    marginBottom: 8,
  },
  chatList: {
    flex: 1,
    overflowY: "auto",
  },
  chatListItem: {
    width: "100%",
    textAlign: "left",
    padding: "8px 10px",
    borderRadius: 999,
    border: "none",
    cursor: "pointer",
    marginBottom: 4,
    fontSize: 13,
  },
  smallButton: {
    padding: "4px 10px",
    borderRadius: 999,
    border: "none",
    background: "#4f46e5",
    color: "#fff",
    fontSize: 12,
    cursor: "pointer",
  },
  chatColumn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    padding: 12,
  },
  chatHeader: {
    paddingBottom: 8,
    borderBottom: "1px solid rgba(148,163,184,0.3)",
    marginBottom: 8,
  },
  chatTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: "#f9fafb",
  },
  chatSubtitle: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 2,
  },
  messagesBox: {
    flex: 1,
    overflowY: "auto",
    padding: "8px 4px",
  },
  messageBubble: {
    padding: "8px 12px",
    borderRadius: 18,
    fontSize: 14,
    boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
    wordBreak: "break-word",
  },
  messageMeta: {
    marginTop: 2,
    fontSize: 11,
    color: "#9ca3af",
  },
  composer: {
    marginTop: 8,
    display: "flex",
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
    borderTop: "1px solid rgba(148,163,184,0.3)",
  },
  fileLabel: {
    flexShrink: 0,
    padding: "8px 12px",
    borderRadius: 999,
    border: "1px dashed rgba(148,163,184,0.8)",
    color: "#e5e7eb",
    fontSize: 13,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    maxWidth: 180,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
  },
  composerInput: {
    flex: 1,
    padding: "10px 12px",
    borderRadius: 999,
    border: "1px solid #4b5563",
    outline: "none",
    fontSize: 14,
    background: "#020617",
    color: "#e5e7eb",
  },
  sendButton: {
    padding: "10px 16px",
    borderRadius: 999,
    border: "none",
    background: "linear-gradient(135deg,#4f46e5,#6366f1)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  avatarButton: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    border: "none",
    padding: 0,
    overflow: "hidden",
    background: "transparent",
    cursor: "pointer",
    flexShrink: 0,
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  avatarInitials: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#4f46e5",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
  },
  senderNameButton: {
    border: "none",
    background: "transparent",
    color: "#9ca3af",
    fontSize: 12,
    marginBottom: 2,
    cursor: "pointer",
    padding: 0,
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.85)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  profileModal: {
    width: "100%",
    maxWidth: 480,
    background: "#0f172a",
    borderRadius: 24,
    padding: 20,
    color: "#e5e7eb",
    boxShadow: "0 24px 80px rgba(0,0,0,0.7)",
  },
};

export default App;