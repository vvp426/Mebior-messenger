// src/App.tsx

import React, { useEffect, useMemo, useState } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  where,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  limit,
  type DocumentData,
} from "firebase/firestore";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";

import { db, storage } from "./firebase";
import type { Chat, Message, UserProfile, MessageFileInfo } from "./types";

import "./App.css";

type AppProps = {
  firebaseUser: FirebaseUser;
};

const App: React.FC<AppProps> = ({ firebaseUser }) => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [newMessageText, setNewMessageText] = useState("");
  const [fileToSend, setFileToSend] = useState<File | null>(null);

  // --------- Профиль пользователя ---------

  useEffect(() => {
    const loadOrCreateProfile = async () => {
      const userDocRef = doc(db, "users", firebaseUser.uid);
      const snap = await getDoc(userDocRef);

      if (snap.exists()) {
        setProfile({ id: snap.id, ...(snap.data() as any) });
      } else {
        const profileData: Omit<UserProfile, "id"> = {
          email: firebaseUser.email ?? "",
          name: firebaseUser.displayName ?? firebaseUser.email ?? "",
          avatarUrl: firebaseUser.photoURL ?? null,
          createdAt: serverTimestamp() as any,
          department: "",
          position: "",
        };
        await setDoc(userDocRef, profileData);
        setProfile({ id: firebaseUser.uid, ...profileData });
      }
    };

    void loadOrCreateProfile();
  }, [firebaseUser]);

  const currentUserId = firebaseUser.uid;

  // --------- Чаты ---------

  useEffect(() => {
    const qChats = query(
      collection(db, "chats"),
      orderBy("lastMessageAt", "desc")
    );

    const unsub = onSnapshot(qChats, (snapshot) => {
      const list: Chat[] = snapshot.docs.map((d) => {
        const data = d.data() as DocumentData;
        return {
          id: d.id,
          title: data.title ?? "Без названия",
          createdAt: data.createdAt,
          createdBy: data.createdBy,
          messageCount: data.messageCount,
          lastMessageAt: data.lastMessageAt,
        };
      });
      setChats(list);

      // Если активный чат не выбран — выбираем первый
      if (!activeChatId && list.length > 0) {
        setActiveChatId(list[0].id);
      }
    });

    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --------- Сообщения выбранного чата ---------

  useEffect(() => {
    if (!activeChatId) {
      setMessages([]);
      return;
    }

    setIsLoadingMessages(true);

    const qMessages = query(
      collection(db, "messages"),
      where("chatId", "==", activeChatId),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(qMessages, (snapshot) => {
      const msgs: Message[] = snapshot.docs.map((d) => {
        const data = d.data() as any;

        const base: Message = {
          id: d.id,
          chatId: data.chatId,
          userId: data.userId ?? data.uid ?? "",
          userName: data.userName,
          userAvatarUrl: data.userAvatarUrl,
          kind: data.kind ?? (data.fileUrl ? "file" : "text"),
          text: data.text,
          createdAt: data.createdAt,
          fileInfo: undefined,
        };

        if (base.kind === "file") {
          base.fileInfo = {
            url: data.fileUrl,
            name: data.fileName ?? "Файл",
            size: data.fileSize,
            contentType: data.fileContentType,
          };
        }

        return base;
      });

      setMessages(msgs);
      setIsLoadingMessages(false);
    });

    return unsub;
  }, [activeChatId]);

  const activeChat = useMemo(
    () => chats.find((c) => c.id === activeChatId) ?? null,
    [chats, activeChatId]
  );

  // --------- Создание нового чата ---------

  const handleCreateChat = async () => {
    const title = window.prompt("Название чата:");
    if (!title) return;

    const newChatData: Omit<Chat, "id"> = {
      title,
      createdAt: serverTimestamp() as any,
      createdBy: currentUserId,
      messageCount: 0,
      lastMessageAt: null,
    };

    const docRef = await addDoc(collection(db, "chats"), newChatData);
    setActiveChatId(docRef.id);
  };

  // --------- Отправка текстового сообщения ---------

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChatId || (!newMessageText.trim() && !fileToSend)) return;

    const chatId = activeChatId;

    let messagePayload: any = {
      chatId,
      userId: currentUserId,
      userName: profile?.name ?? profile?.email ?? "",
      userAvatarUrl: profile?.avatarUrl ?? null,
      createdAt: serverTimestamp(),
    };

    if (fileToSend) {
      // Сначала грузим файл в Storage
      const path = `chatFiles/${chatId}/${Date.now()}_${fileToSend.name}`;
      const r = storageRef(storage, path);
      await uploadBytes(r, fileToSend);
      const url = await getDownloadURL(r);

      messagePayload = {
        ...messagePayload,
        kind: "file",
        fileUrl: url,
        fileName: fileToSend.name,
        fileSize: fileToSend.size,
        fileContentType: fileToSend.type,
      };
    } else {
      messagePayload = {
        ...messagePayload,
        kind: "text",
        text: newMessageText.trim(),
      };
    }

    await addDoc(collection(db, "messages"), messagePayload);

    // Обновляем счётчики в чате (messageCount, lastMessageAt)
    const chatRef = doc(db, "chats", chatId);
    await updateDoc(chatRef, {
      messageCount: (activeChat?.messageCount ?? 0) + 1,
      lastMessageAt: serverTimestamp(),
    });

    setNewMessageText("");
    setFileToSend(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setFileToSend(file);
  };

  // --------- Рендер ---------

  if (!profile) {
    return (
      <div className="app-root center-screen">
        <div className="auth-card">
          <h1 className="app-title">ORG MESSENGER</h1>
          <p className="auth-subtitle">Загрузка профиля…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="app-header-left">
          <h1 className="app-title">ORG MESSENGER</h1>
          <p className="app-subtitle">
            Вы вошли как: {profile.name ?? profile.email} ({profile.email})
          </p>
        </div>
      </header>

      <div className="app-layout">
        {/* Список чатов */}
        <aside className="chat-list-panel">
          <div className="chat-list-header">
            <span className="chat-list-title">Чаты</span>
            <button className="primary-button" onClick={handleCreateChat}>
              + Новый
            </button>
          </div>

          <div className="chat-list">
            {chats.map((chat) => (
              <button
                key={chat.id}
                className={
                  "chat-list-item" +
                  (chat.id === activeChatId ? " chat-list-item-active" : "")
                }
                onClick={() => setActiveChatId(chat.id)}
              >
                <div className="chat-list-item-title">{chat.title}</div>
                <div className="chat-list-item-meta">
                  Сообщений: {chat.messageCount ?? 0}
                </div>
              </button>
            ))}

            {chats.length === 0 && (
              <div className="chat-list-empty">Пока нет ни одного чата</div>
            )}
          </div>
        </aside>

        {/* Сообщения */}
        <main className="chat-panel">
          <div className="chat-panel-header">
            <div className="chat-panel-title">
              {activeChat?.title ?? "Выберите чат"}
            </div>
            <div className="chat-panel-meta">
              Сообщений: {activeChat?.messageCount ?? 0}
            </div>
          </div>

          <div className="message-list">
            {isLoadingMessages && (
              <div className="message-list-empty">Загрузка сообщений…</div>
            )}

            {!isLoadingMessages && messages.length === 0 && (
              <div className="message-list-empty">Сообщений пока нет</div>
            )}

            {messages.map((m) => {
              const isMine = m.userId === currentUserId;
              const className =
                "message-row" + (isMine ? " message-row-mine" : "");

              const displayName = m.userName ?? "Без имени";

              return (
                <div key={m.id} className={className}>
                  <div className="message-author">{displayName}</div>

                  {m.kind === "text" && (
                    <div className="message-bubble">{m.text}</div>
                  )}

                  {m.kind === "file" && m.fileInfo && (
                    <div className="message-bubble">
                      {m.fileInfo.contentType?.startsWith("image/") ? (
                        <img
                          src={m.fileInfo.url}
                          alt={m.fileInfo.name}
                          className="message-image-thumb"
                        />
                      ) : (
                        <a
                          href={m.fileInfo.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {m.fileInfo.name}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* форма отправки */}
          <form className="message-input-row" onSubmit={handleSendMessage}>
            <label className="file-button">
              📎 Файл
              <input type="file" onChange={handleFileChange} hidden />
            </label>

            <input
              className="message-input"
              type="text"
              placeholder="Сообщение"
              value={newMessageText}
              onChange={(e) => setNewMessageText(e.target.value)}
            />

            <button
              type="submit"
              className="primary-button"
              disabled={!newMessageText.trim() && !fileToSend}
            >
              Отправить
            </button>
          </form>
        </main>
      </div>
    </div>
  );
};

export default App;
