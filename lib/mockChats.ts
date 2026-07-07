import type { Message } from '../types';

export interface MockChatThread {
  activityId: string;
  messages: Message[];
}

export const MOCK_CHAT_THREADS: Record<string, MockChatThread> = {};

export function getMockChatMessages(activityId: string) {
  return MOCK_CHAT_THREADS[activityId]?.messages ?? [];
}

export function getMockChatPreview(activityId: string): {
  senderName: string;
  text: string;
  createdAt: string;
} | null {
  return null;
}
