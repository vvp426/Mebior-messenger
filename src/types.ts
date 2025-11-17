// src/types.ts

// Профиль пользователя
export interface UserProfile {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  department?: string | null;
  position?: string | null;
  createdAt?: any; // Firebase Timestamp
}

// Чат
export interface Chat {
  id: string;
  title: string;
  createdAt?: any;          // Timestamp
  createdBy?: string | null;
  lastMessageAt?: any | null;
  messageCount?: number;
}

// Тип сообщения
export type MessageKind = "text" | "file";

// Сообщение
export interface Message {
  id: string;

  // какому чату принадлежит
  chatId: string;

  // тип: текст или файл
  kind: MessageKind;

  // текст сообщения (если kind === "text")
  text?: string | null;

  // служебное
  createdAt: any; // Timestamp

  // данные пользователя, которые мы сейчас читаем в App.tsx
  userId?: string;
  userName?: string | null;
  userAvatarUrl?: string | null;

  // данные файла (если kind === "file")
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileContentType?: string | null;
}
