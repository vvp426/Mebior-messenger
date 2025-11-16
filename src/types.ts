// Общие типы приложения

export interface UserProfile {
  uid: string;
  email: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  avatarUrl: string | null;
  // Можно быстро получить отображаемое имя
  fullName?: string;
}

export interface Chat {
  id: string;
  name: string;
  createdAt: Date | null;
  createdBy: string;
  messagesCount?: number;
  lastMessageAt?: Date | null;
}

export interface Message {
  id: string;
  chatId: string; // ← ключевое поле: к какому чату относится сообщение
  text: string;
  createdAt: Date | null;
  userId: string;
  userEmail: string;
  userName?: string;
  userAvatarUrl?: string | null;

  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
}