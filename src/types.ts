export interface UserProfile {
  id: string;
  email: string;
  fullName?: string;
  position?: string;
  department?: string;
  avatarUrl?: string | null;
  createdAt?: Date | null;
}

export interface Chat {
  id: string;
  title: string;
  createdAt: Date | null;
}

export interface Message {
  id: string;
  chatId: string;
  text: string;
  createdAt: Date | null;
  userId: string;
  userEmail?: string | null;
  userName?: string | null;
  userAvatarUrl?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
}