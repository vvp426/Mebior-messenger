// src/types.ts

// ---------- Профиль пользователя ----------

export interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  department?: string | null;
  position?: string | null;
  createdAt?: any; // Firebase Timestamp
}

// ---------- Чаты ----------

export interface Chat {
  id: string;
  title: string;
  createdAt?: any;          // Timestamp
  createdBy?: string | null;
  lastMessageAt?: any | null;
  messageCount?: number;
}

// ---------- Файлы сообщений ----------

// Описание файла, прикреплённого к сообщению
export type MessageFileInfo = {
  id: string;           // id или путь в Storage
  name: string;         // имя файла для пользователя
  url: string;          // download URL
  size: number;         // размер в байтах
  contentType?: string | null;
};

// ---------- Сообщения ----------

export type MessageKind = "text" | "file";

export interface Message {
  id: string;

  // принадлежность чату
  chatId: string;

  // тип сообщения
  kind: MessageKind;

  // текст (если kind === "text")
  text?: string | null;

  // время создания
  createdAt: any; // Firebase Timestamp

  // данные автора (то, что мы используем в App.tsx)
  userId?: string;
  userName?: string | null;
  userAvatarUrl?: string | null;

  // вложенный объект с информацией о файле
  fileInfo?: MessageFileInfo | null;

  // запасные поля, если где-то ещё используем прямые значения
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileContentType?: string | null;
}
