// src/types.ts
import type { Timestamp } from "firebase/firestore";

export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  position?: string;
  department?: string;
  avatarUrl?: string | null;
  createdAt?: Timestamp;
}

export interface Chat {
  id: string;
  title: string;
  createdAt?: Timestamp;
  createdBy?: string;
  lastMessageAt?: Timestamp;
  messageCount?: number;
}

export interface Message {
  id: string;
  chatId: string;
  text?: string;
  createdAt?: Timestamp;
  senderId: string;
  senderEmail?: string;
  senderName?: string;
  fileUrl?: string | null;
  fileName?: string | null;
}
