export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string | null;
  department?: string;
  position?: string;
}

export interface Message {
  id: string;
  uid: string;
  text?: string;

  createdAt: any;

  // файлов у тебя НЕТ — делаем опциональными
  fileUrl?: string | null;
  fileName?: string | null;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: any;
  lastMessageAt?: any;
  messageCount: number;
}
