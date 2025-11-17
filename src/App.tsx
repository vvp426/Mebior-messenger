// src/App.tsx
import React, { useEffect, useMemo, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
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
  increment,
} from "firebase/firestore";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";

import { db, storage } from "./firebase";
import type { Chat, Message, UserProfile } from "./types";

type AppProps = {
  firebaseUser: FirebaseUser;
  onSignOut: () => void;
};

const App: React.FC<AppProps> = ({ firebaseUser, onSignOut }) => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);

  const [newChatTitle, setNewChatTitle] = useState("");
  const [messageText, setMessageText] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState<{
    name: string;
    position: string;
    department: string;
  }>({ name: "", position: "", department: "" });

  // ---------------------------------------------------------------------------
  //  Профиль пользователя (коллекция users)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const uid = firebaseUser.uid;
    const userDocRef = doc(db, "users", uid);

    const loadOrCreate = async () => {
      const snap = await getDoc(userDocRef);

      if (!snap.exists()) {
        const profile: Omit<UserProfile, "id"> = {
          email: firebaseUser.email ?? "",
          name: firebaseUser.displayName ?? "",
          position: "",
          department: "",
          avatarUrl: null,
          createdAt: serverTimestamp() as any,
        };
        await setDoc(userDocRef, profile);
      }
    };

    void loadOrCreate();

    const unsub = onSnapshot(userDocRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.data() as Omit<UserProfile, "id">;
      const full: UserProfile = {
        id: snap.id,
        ...data,
      };
      setUserProfile(full);
      setProfileDraft({
        name: full.name ?? "",
        position: full.position ?? "",
        department: full.department ?? "",
      });
    });

    return () => unsub();
  }, [firebaseUser]);

  // ---------------------------------------------------------------------------
  //  Список чатов
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const chatsRef = collection(db, "chats");
    const q = query(chatsRef, orderBy("lastMessageAt", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      const list: Chat[] = snap.docs.map((d) => {
        const data = d.data() as Omit<Chat, "id">;
        return { id: d.id, ...data };
      });
      setChats(list);

      if (!activeChatId && list.length > 0) {
        setActiveChatId(list[0].id);
      }
    });

    return () => unsub();
  }, [activeChatId]);

  // ---------------------------------------------------------------------------
  //  Сообщения выбранного чата
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }

    const msgsRef = collection(db, "messages");
    const q = query(
      msgsRef,
      where("chatId", "==", activeChatId),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const list: Message[] = snap.docs.map((d) => {
        const data = d.data() as Omit<Message, "id">;
        return { id: d.id, ...data };
      });
      setMessages(list);
    });

    return () => unsub();
  }, [activeChatId]);

  // ---------------------------------------------------------------------------
  //  Создать чат
  // ---------------------------------------------------------------------------
  const handleCreateChat = async () => {
    const title = newChatTitle.trim();
    if (!title) return;

    const chatsRef = collection(db, "chats");
    const docRef = await addDoc(chatsRef, {
      title,
      createdAt: serverTimestamp(),
      createdBy: firebaseUser.uid,
      lastMessageAt: serverTimestamp(),
      messageCount: 0,
    });

    setNewChatTitle("");
    setActiveChatId(docRef.id);
  };

  // ---------------------------------------------------------------------------
  //  Отправить сообщение
  // ---------------------------------------------------------------------------
  const handleSendMessage = async () => {
    if (!activeChatId || (!messageText.trim() && !file)) return;
    if (!userProfile) return;

    const msgsRef = collection(db, "messages");

    let uploadedFileUrl: string | null = null;
    let uploadedFileName: string | null = null;

    if (file) {
      const path = `chatFiles/${activeChatId}/${Date.now()}_${file.name}`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, file);
      uploadedFileUrl = await getDownloadURL(ref);
      uploadedFileName = file.name;
    }

    await addDoc(msgsRef, {
      chatId: activeChatId,
      text: messageText.trim() || null,
      createdAt: serverTimestamp(),
      senderId: firebaseUser.uid,
      senderEmail: userProfile.email,
      senderName: userProfile.name ?? userProfile.email,
      fileUrl: uploadedFileUrl,
      fileName: uploadedFileName,
    });

    // обновляем мету чата
    const chatDocRef = doc(db, "chats", activeChatId);
    await updateDoc(chatDocRef, {
      lastMessageAt: serverTimestamp(),
      messageCount: increment(1),
    });

    setMessageText("");
    setFile(null);
  };

  const currentChat = useMemo(
    () => chats.find((c) => c.id === activeChatId) ?? null,
    [chats, activeChatId]
  );

  const handleProfileSave = async () => {
    if (!userProfile) return;
    const userDocRef = doc(db, "users", userProfile.id);
    await setDoc(
      userDocRef,
      {
        name: profileDraft.name.trim(),
        position: profileDraft.position.trim(),
        department: profileDraft.department.trim(),
      },
      { merge: true }
    );
    setIsProfileOpen(false);
  };

  // ---------------------------------------------------------------------------
  //  Рендер
  // ---------------------------------------------------------------------------
  return (
    <div className="app-root">
      <div className="app-shell">
        <header className="app-header">
          <div className="app-title">ORG MESSENGER</div>
          <div className="app-user">
            <span className="app-user-email">
              Вы вошли как: {firebaseUser.email}
            </span>
            <button
              className="app-header-btn"
              onClick={() => setIsProfileOpen(true)}
            >
              Профиль
            </button>
            <button className="app-header-btn" onClick={onSignOut}>
              Выйти
            </button>
          </div>
        </header>

        <div className="app-body">
          {/* Левая колонка — чаты */}
          <aside className="chat-sidebar">
            <div className="chat-sidebar-header">
              <div className="chat-sidebar-title">Чаты</div>
              <button
                className="primary-btn small"
                onClick={handleCreateChat}
                disabled={!newChatTitle.trim()}
              >
                + Новый
              </button>
            </div>

            <input
              className="chat-new-input"
              placeholder="Название чата"
              value={newChatTitle}
              onChange={(e) => setNewChatTitle(e.target.value)}
            />

            <div className="chat-list">
              {chats.map((chat) => (
                <button
                  key={chat.id}
                  className={
                    "chat-item" +
                    (chat.id === activeChatId ? " chat-item-active" : "")
                  }
                  onClick={() => setActiveChatId(chat.id)}
                >
                  <div className="chat-item-title">{chat.title}</div>
                  <div className="chat-item-meta">
                    Сообщений: {chat.messageCount ?? 0}
                  </div>
                </button>
              ))}
              {chats.length === 0 && (
                <div className="chat-empty">Чатов пока нет</div>
              )}
            </div>
          </aside>

          {/* Правая часть — сообщения */}
          <main className="chat-main">
            {currentChat ? (
              <>
                <div className="chat-main-header">
                  <div className="chat-main-title">{currentChat.title}</div>
                  <div className="chat-main-meta">
                    Сообщений: {currentChat.messageCount ?? 0}
                  </div>
                </div>

                <div className="message-list">
                  {messages.length === 0 ? (
                    <div className="message-empty">
                      Сообщений пока нет
                    </div>
                  ) : (
                    messages.map((m) => {
                      const isMine = m.senderId === firebaseUser.uid;
                      const isImage =
                        m.fileUrl &&
                        /\.(png|jpe?g|gif|webp)$/i.test(m.fileUrl);

                      return (
                        <div
                          key={m.id}
                          className={
                            "message-row" +
                            (isMine ? " message-row-mine" : " message-row-other")
                          }
                        >
                          <div className="message-bubble">
                            <div className="message-sender">
                              {m.senderName ?? m.senderEmail ?? "Без имени"}
                            </div>
                            {m.text && (
                              <div className="message-text">{m.text}</div>
                            )}
                            {m.fileUrl && (
                              <div className="message-attachment">
                                {isImage ? (
                                  <img
                                    src={m.fileUrl}
                                    alt={m.fileName ?? "image"}
                                    className="message-image"
                                  />
                                ) : (
                                  <a
                                    className="message-file-link"
                                    href={m.fileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {m.fileName ?? "Файл"}
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="message-input-row">
                  <label className="file-button">
                    <span>📎 Файл</span>
                    <input
                      type="file"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const f = e.target.files?.[0] ?? null;
                        setFile(f);
                      }}
                    />
                  </label>

                  <input
                    className="message-input"
                    placeholder="Сообщение"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSendMessage();
                      }
                    }}
                  />

                  <button
                    className="primary-btn"
                    onClick={handleSendMessage}
                    disabled={!messageText.trim() && !file}
                  >
                    Отправить
                  </button>
                </div>
              </>
            ) : (
              <div className="chat-placeholder">
                Выберите чат или создайте новый
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Модалка профиля */}
      {isProfileOpen && (
        <div className="modal-backdrop" onClick={() => setIsProfileOpen(false)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Профиль</h2>
            <div className="modal-field">
              <label>Имя</label>
              <input
                value={profileDraft.name}
                onChange={(e) =>
                  setProfileDraft((p) => ({ ...p, name: e.target.value }))
                }
              />
            </div>
            <div className="modal-field">
              <label>Должность</label>
              <input
                value={profileDraft.position}
                onChange={(e) =>
                  setProfileDraft((p) => ({ ...p, position: e.target.value }))
                }
              />
            </div>
            <div className="modal-field">
              <label>Подразделение</label>
              <input
                value={profileDraft.department}
                onChange={(e) =>
                  setProfileDraft((p) => ({
                    ...p,
                    department: e.target.value,
                  }))
                }
              />
            </div>

            <div className="modal-actions">
              <button onClick={() => setIsProfileOpen(false)}>Отмена</button>
              <button className="primary-btn" onClick={handleProfileSave}>
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
