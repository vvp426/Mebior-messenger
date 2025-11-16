import React, { useEffect, useMemo, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User,
} from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  serverTimestamp,
  getDoc,
  setDoc,
  query,
  orderBy,
  where,
  increment,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";

import { auth, db, storage } from "./firebase";

type UserProfile = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  position?: string;
  department?: string;
  avatarUrl?: string;
};

type Chat = {
  id: string;
  title: string;
  createdAt?: any;
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

const App: React.FC = () => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState("");
  const [attachedFile, setAttachedFile] = useState<File | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [newChatTitle, setNewChatTitle] = useState("");

  // Локальная карта пользователей (для аватарок и имён в сообщениях)
  const [usersMap, setUsersMap] = useState<Record<string, UserProfile>>({});

  // -------------------- АВТОРИЗАЦИЯ --------------------

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      setIsLoading(false);

      if (user) {
        // грузим / создаём профиль
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
          const data = snap.data() as Omit<UserProfile, "id">;
          setUserProfile({ id: user.uid, ...data });
        } else {
          const defaultProfile: UserProfile = {
            id: user.uid,
            email: user.email || "",
          };
          await setDoc(userRef, {
            email: defaultProfile.email,
            firstName: "",
            lastName: "",
            position: "",
            department: "",
            avatarUrl: "",
            createdAt: serverTimestamp(),
          });
          setUserProfile(defaultProfile);
        }
      } else {
        setUserProfile(null);
      }
    });

    return () => unsub();
  }, []);

  const handleLogin = async () => {
    setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e: any) {
      setAuthError(e.message || "Ошибка входа");
    }
  };

  const handleRegister = async () => {
    setAuthError(null);
    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password
      );
      const user = cred.user;
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, {
        email: user.email || "",
        firstName: "",
        lastName: "",
        position: "",
        department: "",
        avatarUrl: "",
        createdAt: serverTimestamp(),
      });
    } catch (e: any) {
      setAuthError(e.message || "Ошибка регистрации");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  // -------------------- ПОДПИСКА НА ПОЛЬЗОВАТЕЛЕЙ --------------------

  useEffect(() => {
    if (!firebaseUser) return;

    const usersRef = collection(db, "users");
    const qUsers = query(usersRef);

    const unsub = onSnapshot(qUsers, (snap) => {
      const map: Record<string, UserProfile> = {};
      snap.forEach((docSnap) => {
        const data = docSnap.data() as Omit<UserProfile, "id">;
        map[docSnap.id] = { id: docSnap.id, ...data };
      });
      setUsersMap(map);
    });

    return () => unsub();
  }, [firebaseUser]);

  // -------------------- ПОДПИСКА НА ЧАТЫ --------------------

  useEffect(() => {
    if (!firebaseUser) return;

    const chatsRef = collection(db, "chats");
    const qChats = query(chatsRef, orderBy("createdAt", "asc"));

    const unsub = onSnapshot(qChats, (snap) => {
      const data: Chat[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data() as Omit<Chat, "id">;
        data.push({ id: docSnap.id, ...d });
      });
      setChats(data);

      // если активный чат не выбран — выбираем первый
      if (!activeChatId && data.length > 0) {
        setActiveChatId(data[0].id);
      }
    });

    return () => unsub();
  }, [firebaseUser, activeChatId]);

  const activeChat: Chat | undefined = useMemo(
    () => chats.find((c) => c.id === activeChatId),
    [chats, activeChatId]
  );

  // -------------------- ПОДПИСКА НА СООБЩЕНИЯ --------------------

  useEffect(() => {
    if (!firebaseUser) return;
    if (!activeChatId) {
      setMessages([]);
      return;
    }

    // ВНИМАНИЕ: здесь мы жёстко фильтруем по chatId,
    // чтобы не тянуть сообщения из других чатов
    const messagesRef = collection(db, "messages");
    const qMessages = query(
      messagesRef,
      where("chatId", "==", activeChatId),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(qMessages, (snap) => {
      const data: Message[] = [];
      snap.forEach((docSnap) => {
        const d = docSnap.data() as Omit<Message, "id">;
        data.push({ id: docSnap.id, ...d });
      });
      setMessages(data);
    });

    return () => unsub();
  }, [firebaseUser, activeChatId]);

  // Дополнительно — на всякий случай считаем сообщения локально
  const messagesForActiveChat: Message[] = useMemo(() => {
    if (!activeChatId) return [];
    return messages.filter((m) => m.chatId === activeChatId);
  }, [messages, activeChatId]);

  // -------------------- СОЗДАНИЕ ЧАТА --------------------

  const handleCreateChat = async () => {
    if (!firebaseUser) return;
    const title = newChatTitle.trim();
    if (!title) return;

    const chatsRef = collection(db, "chats");
    const newChatDoc = await addDoc(chatsRef, {
      title,
      createdBy: firebaseUser.uid,
      createdAt: serverTimestamp(),
      messageCount: 0,
    });

    setNewChatTitle("");
    setActiveChatId(newChatDoc.id);
  };

  // -------------------- ОТПРАВКА СООБЩЕНИЯ --------------------

  const handleSendMessage = async () => {
    if (!firebaseUser || !userProfile || !activeChatId) return;
    if (!messageText.trim() && !attachedFile) return;

    const messagesRef = collection(db, "messages");

    let fileUrl: string | undefined;
    let fileName: string | undefined;

    if (attachedFile) {
      fileName = attachedFile.name;
      const filePath = `chatFiles/${activeChatId}/${Date.now()}_${fileName}`;
      const fileStorageRef = ref(storage, filePath);
      await uploadBytes(fileStorageRef, attachedFile);
      fileUrl = await getDownloadURL(fileStorageRef);
    }

    const text = messageText.trim();

    await addDoc(messagesRef, {
      chatId: activeChatId, // ← ключевая строка
      text,
      userId: firebaseUser.uid,
      userName:
        (userProfile.firstName || userProfile.lastName) ?
          `${userProfile.firstName || ""} ${userProfile.lastName || ""}`.trim() :
          userProfile.email,
      userAvatarUrl: userProfile.avatarUrl || "",
      fileName: fileName || null,
      fileUrl: fileUrl || null,
      createdAt: serverTimestamp(),
    });

    // обновим счётчик сообщений в документе чата
    if (activeChat) {
      const chatRef = doc(db, "chats", activeChat.id);
      await updateDoc(chatRef, {
        messageCount: increment(1),
        lastMessageAt: serverTimestamp(),
        lastMessageText: text || fileName || "",
      });
    }

    setMessageText("");
    setAttachedFile(null);
  };

  // -------------------- УПОМЯНУТЬ ПОЛЬЗОВАТЕЛЯ ПО КЛИКУ --------------------

  const handleUserClick = (userId: string) => {
    const user = usersMap[userId];
    const nameForMention =
      user?.firstName || user?.lastName
        ? `${user.firstName || ""} ${user.lastName || ""}`.trim()
        : user?.email || "";
    if (!nameForMention) return;

    const mention = `@${nameForMention} `;
    if (messageText.includes(mention)) return;
    setMessageText((prev) => (prev ? prev + " " + mention : mention));
  };

  // -------------------- ПРОФИЛЬ --------------------

  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [profilePosition, setProfilePosition] = useState("");
  const [profileDepartment, setProfileDepartment] = useState("");
  const [profileAvatarFile, setProfileAvatarFile] = useState<File | null>(null);

  useEffect(() => {
    if (!userProfile) return;
    setProfileFirstName(userProfile.firstName || "");
    setProfileLastName(userProfile.lastName || "");
    setProfilePosition(userProfile.position || "");
    setProfileDepartment(userProfile.department || "");
  }, [userProfile]);

  const handleSaveProfile = async () => {
    if (!firebaseUser || !userProfile) return;

    let avatarUrl = userProfile.avatarUrl || "";

    if (profileAvatarFile) {
      const avatarRef = ref(storage, `avatars/${firebaseUser.uid}.jpg`);
      await uploadBytes(avatarRef, profileAvatarFile);
      avatarUrl = await getDownloadURL(avatarRef);
    }

    const userRef = doc(db, "users", firebaseUser.uid);
    await updateDoc(userRef, {
      firstName: profileFirstName.trim(),
      lastName: profileLastName.trim(),
      position: profilePosition.trim(),
      department: profileDepartment.trim(),
      avatarUrl,
    });

    setUserProfile({
      ...userProfile,
      firstName: profileFirstName.trim(),
      lastName: profileLastName.trim(),
      position: profilePosition.trim(),
      department: profileDepartment.trim(),
      avatarUrl,
    });

    setIsProfileModalOpen(false);
  };

 