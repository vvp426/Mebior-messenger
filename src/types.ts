// src/types.ts

import type { Timestamp } from "firebase/firestore";

// Профиль пользователя в коллекции users
export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string | null;
  department?: string;
  position?: string;
  createdAt?: Timestamp;
}

// Документ чата в коллекции chats
export interface Chat {
  id: string;
  title: string;
  createdAt?: Timestamp;
  createdBy?: string;
  messageCount?: number;
  lastMessageAt?: Timestamp | null;
}

// Тип содержимого сообщения
export type MessageKind = "text" | "file";

// Инфо о прикреплённом файле
export interface MessageFileInfo {
  url: string;
  name: string;
  size?: number;
  contentType?: string;
}

// Документ сообщения в коллекции messages
export interface Message {
  id: string;

  // id чата, к которому относится сообщение
  chatId: string;

  // uid пользователя из Firebase Auth
  userId: string;

  // Доп. данные пользователя (чтоб не ходить за ними отдельно)
  userName?: string;
  userAvatarUrl?: string | null;

  // Тип сообщения
  kind: MessageKind;

  // Текст (для kind === "text")
  text?: string;

  // Файл (для kind === "file")
  fileInfo?: MessageFileInfo | null;

  createdAt?: Timestamp;
}
