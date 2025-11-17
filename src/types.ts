// src/types.ts

export interface UserProfile {
  id: string;
  email: string;

  // всё, что реально есть в Firestore, либо может появиться
  name?: string;
  position?: string;
  department?: string;
  avatarUrl?: string | null;
}

export interface Chat {
  id: string;
  title: string;

  createdAt?: any;
  lastMessageAt?: any;

  // мы его храним в документе чата, но в интерфейсе делаем опциональным
  messageCount?: number;
}

export interface Message {
  id: string;

  chatId: string;
  userId: string;
  userName: string;

  text?: string;

  createdAt?: any;

  // файл может быть, а может и нет
  fileName?: string | null;
  fileUrl?: string | null;

  // на будущее — если будешь показывать аватар
  userAvatarUrl?: string | null;
}
