import React, { useEffect, useState, useRef } from "react";
import type { User as FirebaseUser } from "firebase/auth";
import { collection, addDoc, onSnapshot, query, orderBy } from "firebase/firestore";
import { db, storage } from "./firebase";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import "./index.css";

type AppProps = {
  firebaseUser: FirebaseUser;
};

type Chat = {
  id: string;
  name: string;
};

type Message = {
  id: string;
  text?: string;
  fileUrl?: string;
  fileName?: string;
  sender: string;
  createdAt: number;
  photoURL?: string;
};

const App: React.FC<AppProps> = ({ firebaseUser }) => {
  const user = firebaseUser;
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Подписка на список чатов
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "chats"), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
      }));
      setChats(data);
      if (!activeChat && data.length > 0) {
        setActiveChat(data[0].id);
      }
    });
    return () => unsubscribe();
  }, []);

  // Подписка на сообщения выбранного чата
  useEffect(() => {
    if (!activeChat) return;

    const q = query(
      collection(db, "chats", activeChat, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const arr: Message[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
      }));
      setMessages(arr);
    });

    return () => unsubscribe();
  }, [activeChat]);

  // Создать новый чат
  async function createChat() {
    const name = prompt("Название чата?");
    if (!name) return;

    await addDoc(collection(db, "chats"), {
      name,
    });
  }

  // Отправка текста
  async function sendMessage() {
    if (!newMessage.trim()) return;

    await addDoc(collection(db, "chats", activeChat!, "messages"), {
      text: newMessage,
      sender: user.email!,
      createdAt: Date.now(),
      photoURL: user.photoURL || null,
    });

    setNewMessage("");
  }

  // Выбираем файл
  function selectFile() {
    fileInputRef.current?.click();
  }

  // Отправка файла
  async function uploadFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileRef = ref(storage, `uploads/${activeChat}/${Date.now()}-${file.name}`);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);

    await addDoc(collection(db, "chats", activeChat!, "messages"), {
      fileUrl: url,
      fileName: file.name,
      sender: user.email!,
      createdAt: Date.now(),
      photoURL: user.photoURL || null,
    });
  }

  return (
    <div className="app-container">
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="user-label">
            Вы вошли как: {user.email}
          </div>
          <button onClick={createChat} className="new-chat-btn">+ Новый</button>
        </div>

        <div className="chat-list">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`chat-item ${activeChat === chat.id ? "active" : ""}`}
              onClick={() => setActiveChat(chat.id)}
            >
              <div className="chat-name">{chat.name}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="chat-window">
        {!activeChat ? (
          <div className="empty-chat">Выберите чат</div>
        ) : (
          <>
            <div className="messages">
              {messages.map((m) => (
                <div key={m.id} className="message">
                  <div className="message-header">
                    <span className="sender">{m.sender}</span>
                  </div>

                  {m.text && (
                    <div className="bubble">{m.text}</div>
                  )}

                  {m.fileUrl && (
                    <div className="file-preview">
                      {m.fileUrl.match(/\.(jpe?g|png|gif|webp)$/i) ? (
                        <img className="thumb" src={m.fileUrl} alt={m.fileName} />
                      ) : (
                        <a href={m.fileUrl} target="_blank" rel="noreferrer">
                          {m.fileName}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="input-bar">
              <button className="file-btn" onClick={selectFile}>📎</button>
              <input
                ref={fileInputRef}
                type="file"
                style={{ display: "none" }}
                onChange={uploadFile}
              />

              <input
                className="text-input"
                placeholder="Сообщение"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
              />

              <button className="send-btn" onClick={sendMessage}>Отправить</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default App;
