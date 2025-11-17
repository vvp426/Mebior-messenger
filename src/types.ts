// Общие типы приложения

export interface UserProfile {
  uid: string;
  id: string;
email: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  avatarUrl: string | null;
  // Можно быстро получить отображаемое имя
fullName?: string;
  position?: string;
  department?: string;
  avatarUrl?: string | null;
  createdAt?: Date | null;
}

export interface Chat {
id: string;
  name: string;
  title: string;
createdAt: Date | null;
  createdBy: string;
  messagesCount?: number;
  lastMessageAt?: Date | null;
}

export interface Message {
id: string;
  chatId: string; // ← ключевое поле: к какому чату относится сообщение
  chatId: string;
text: string;
createdAt: Date | null;
userId: string;
  userEmail: string;
  userName?: string;
  userEmail?: string | null;
  userName?: string | null;
userAvatarUrl?: string | null;

attachmentUrl?: string | null;
attachmentName?: string | null;
attachmentType?: string | null;
