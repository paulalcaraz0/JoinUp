import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import type { Message } from '../types';
import { getMockChatMessages } from '../lib/mockChats';
import { InputLimits, trimInput } from '../lib/validation';

const chatSupabase = supabase as any;

const MOCK_CHAT_STORAGE_PREFIX = 'mockChatMessages:v1:';
const UNREAD_CHAT_STORAGE_PREFIX = 'chatUnreadActivityIds:v1:';
const CHAT_IMAGE_BUCKET = 'chat-images';
const CHAT_IMAGE_SIGNED_URL_TTL_SECONDS = 60 * 60;

function mockChatStorageKey(activityId: string) {
  return `${MOCK_CHAT_STORAGE_PREFIX}${activityId}`;
}

function unreadChatStorageKey(userId: string) {
  return `${UNREAD_CHAT_STORAGE_PREFIX}${userId}`;
}

function normalizeUnreadActivityIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((value): value is string => typeof value === 'string');
}

export async function loadUnreadChatActivityIds(userId: string): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(unreadChatStorageKey(userId));
    return raw ? normalizeUnreadActivityIds(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export async function saveUnreadChatActivityIds(userId: string, activityIds: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(unreadChatStorageKey(userId), JSON.stringify(activityIds));
  } catch {
    // Best-effort local persistence.
  }
}

export async function markChatActivityUnread(userId: string, activityId: string): Promise<string[]> {
  const current = await loadUnreadChatActivityIds(userId);
  const next = Array.from(new Set([...current, activityId]));
  await saveUnreadChatActivityIds(userId, next);
  return next;
}

export async function clearChatActivityUnread(userId: string, activityId: string): Promise<string[]> {
  const current = await loadUnreadChatActivityIds(userId);
  const next = current.filter((id) => id !== activityId);
  await saveUnreadChatActivityIds(userId, next);
  return next;
}

function normalizePersistedMockMessage(raw: any, activityId: string): Message | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string') return null;
  if (typeof raw.senderId !== 'string') return null;
  if (typeof raw.senderName !== 'string') return null;
  if (typeof raw.type !== 'string') return null;
  if (typeof raw.createdAt !== 'string') return null;

  const messageType = raw.type as Message['type'];
  if (!['text', 'image', 'location', 'system'].includes(messageType)) return null;

  const location =
    raw.location && typeof raw.location === 'object' &&
    typeof raw.location.lat === 'number' &&
    typeof raw.location.lng === 'number'
      ? { lat: raw.location.lat, lng: raw.location.lng }
      : undefined;

  return {
    id: raw.id,
    activityId,
    senderId: raw.senderId,
    senderName: raw.senderName,
    senderPhoto: typeof raw.senderPhoto === 'string' ? raw.senderPhoto : '',
    text: typeof raw.text === 'string' ? raw.text : undefined,
    imageUrl: typeof raw.imageUrl === 'string' ? raw.imageUrl : undefined,
    location,
    type: messageType,
    isPinned: Boolean(raw.isPinned),
    createdAt: raw.createdAt,
  };
}

async function readPersistedMockMessages(activityId: string): Promise<Message[]> {
  try {
    const raw = await AsyncStorage.getItem(mockChatStorageKey(activityId));
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => normalizePersistedMockMessage(item, activityId))
      .filter((item): item is Message => item !== null);
  } catch {
    return [];
  }
}

function extractLocalMockMessages(messages: Message[], activityId: string) {
  return messages.filter(
    (message) =>
      message.activityId === activityId &&
      message.id.startsWith(`${activityId}-local-`)
  );
}

async function persistMockMessages(activityId: string, messages: Message[]) {
  try {
    const localMessages = extractLocalMockMessages(messages, activityId);
    await AsyncStorage.setItem(mockChatStorageKey(activityId), JSON.stringify(localMessages));
  } catch {
    // Best-effort persistence for mock chat experience.
  }
}

function mergeMockMessages(seeded: Message[], persisted: Message[]) {
  const merged = new Map<string, Message>();
  const sortedSeeded = [...seeded].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );
  const sortedPersisted = [...persisted].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  );

  // Keep seeded thread chronology intact and append locally persisted user messages after it.
  [...sortedSeeded, ...sortedPersisted].forEach((message) => {
    merged.set(message.id, message);
  });

  return Array.from(merged.values());
}

function getChatImageObjectPath(imageUrl?: string): string | undefined {
  if (!imageUrl) return undefined;

  if (!/^https?:\/\//i.test(imageUrl)) {
    return imageUrl;
  }

  try {
    const parsed = new URL(imageUrl);
    const publicMarker = `/${CHAT_IMAGE_BUCKET}/`;
    const publicMarkerIndex = parsed.pathname.indexOf(publicMarker);

    if (publicMarkerIndex !== -1) {
      return decodeURIComponent(parsed.pathname.slice(publicMarkerIndex + publicMarker.length));
    }

    const signedMarker = `/object/sign/${CHAT_IMAGE_BUCKET}/`;
    const signedMarkerIndex = parsed.pathname.indexOf(signedMarker);

    if (signedMarkerIndex !== -1) {
      return decodeURIComponent(parsed.pathname.slice(signedMarkerIndex + signedMarker.length));
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function resolveChatImageUrl(imageUrl?: string): Promise<string | undefined> {
  const objectPath = getChatImageObjectPath(imageUrl);
  if (!objectPath) return imageUrl;

  try {
    const { data, error } = await chatSupabase.storage
      .from(CHAT_IMAGE_BUCKET)
      .createSignedUrl(objectPath, CHAT_IMAGE_SIGNED_URL_TTL_SECONDS);

    if (error || !data?.signedUrl) return undefined;
    return data.signedUrl;
  } catch {
    return undefined;
  }
}

async function resolveMessageImages(messages: Message[]) {
  return Promise.all(
    messages.map(async (message) => {
      if (message.type !== 'image') return message;
      return {
        ...message,
        imageUrl: await resolveChatImageUrl(message.imageUrl),
      };
    })
  );
}

async function mapMessage(row: any): Promise<Message> {
  return {
    id: row.id,
    activityId: row.activity_id,
    senderId: row.sender_id,
    senderName: row.sender_name ?? '',
    senderPhoto: row.sender_photo ?? '',
    text: row.text ?? undefined,
    imageUrl: await resolveChatImageUrl(row.image_url ?? undefined),
    location:
      row.location_lat != null && row.location_lng != null
        ? { lat: row.location_lat, lng: row.location_lng }
        : undefined,
    type: row.type,
    isPinned: row.is_pinned,
    createdAt: row.created_at,
  };
}

export function useChat(activityId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isMockThread = activityId.startsWith('mock-');
  const channelRef = useRef<any>(null);

  const fetchMessages = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isMockThread) {
        const seededMessages = await resolveMessageImages(getMockChatMessages(activityId));
        const persistedMessages = await readPersistedMockMessages(activityId);
        setMessages(mergeMockMessages(seededMessages, await resolveMessageImages(persistedMessages)));
        return;
      }

      const { data, error } = await chatSupabase
        .from('messages_full')
        .select('*')
        .eq('activity_id', activityId)
        .order('created_at', { ascending: true });

      if (!error && data) {
        setMessages(await Promise.all(data.map(mapMessage)));
      }
    } finally {
      setIsLoading(false);
    }
  }, [activityId, isMockThread]);

  useEffect(() => {
    let isActive = true;

    const initFetch = async () => {
      await fetchMessages();
    };

    initFetch();

    if (isMockThread) {
      return () => {
        isActive = false;
      };
    }

    const channel = chatSupabase
      .channel(`chat:${activityId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `activity_id=eq.${activityId}`,
        },
        async (payload: any) => {
          const { data } = await chatSupabase
            .from('messages_full')
            .select('*')
            .eq('id', payload.new.id)
            .single();

          if (data && isActive) {
            const nextMessage = await mapMessage(data);
            setMessages((prev) => {
              if (prev.some((message) => message.id === nextMessage.id)) return prev;
              return [...prev, nextMessage];
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
          filter: `activity_id=eq.${activityId}`,
        },
        (payload: any) => {
          if (!isActive) return;
          setMessages((prev) => prev.filter((message) => message.id !== payload.old.id));
        }
      )
      .on(
        'broadcast',
        { event: 'message_deleted' },
        (payload: any) => {
          if (!isActive) return;
          const deletedMessageId = payload?.payload?.messageId;
          if (!deletedMessageId) return;
          setMessages((prev) => prev.filter((message) => message.id !== deletedMessageId));
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      isActive = false;
      channelRef.current = null;
      chatSupabase.removeChannel(channel);
    };
  }, [activityId, isMockThread]);

  const sendMessage = useCallback(
    async (text: string, senderId: string, senderName: string) => {
      const nextText = trimInput(text);
      if (!nextText) {
        throw new Error('Message cannot be empty.');
      }

      if (nextText.length > InputLimits.chatMessage) {
        throw new Error(`Keep messages under ${InputLimits.chatMessage} characters.`);
      }

      if (isMockThread) {
        const mockMessage: Message = {
          id: `${activityId}-local-${Date.now()}`,
          activityId,
          senderId,
          senderName,
          senderPhoto: '',
          text: nextText,
          type: 'text',
          isPinned: false,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => {
          const next = [...prev, mockMessage];
          void persistMockMessages(activityId, next);
          return next;
        });
        return;
      }

      const { data, error } = await chatSupabase
        .from('messages')
        .insert({
          activity_id: activityId,
          sender_id: senderId,
          text: nextText,
          type: 'text',
        })
        .select()
        .single();

      if (!error && data) {
        const nextMessage = await mapMessage({ ...data, sender_name: senderName, sender_photo: '' });
        setMessages((prev) => {
          if (prev.some((message) => message.id === nextMessage.id)) return prev;
          return [...prev, nextMessage];
        });
      }
    },
    [activityId, isMockThread]
  );

  const sendImage = useCallback(
    async (imageUrl: string, senderId: string, senderName: string) => {
      if (isMockThread) {
        const mockMessage: Message = {
          id: `${activityId}-local-image-${Date.now()}`,
          activityId,
          senderId,
          senderName,
          senderPhoto: '',
          imageUrl,
          type: 'image',
          isPinned: false,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => {
          const next = [...prev, mockMessage];
          void persistMockMessages(activityId, next);
          return next;
        });
        return;
      }

      const { data, error } = await chatSupabase
        .from('messages')
        .insert({
          activity_id: activityId,
          sender_id: senderId,
          image_url: imageUrl,
          type: 'image',
        })
        .select()
        .single();

      if (error) {
        // Log and throw so callers (UI) can show an error immediately.
        // eslint-disable-next-line no-console
        console.error('sendImage error', error);
        throw error;
      }

      if (data) {
        const nextMessage = await mapMessage({ ...data, sender_name: senderName, sender_photo: '' });
        setMessages((prev) => {
          if (prev.some((message) => message.id === nextMessage.id)) return prev;
          return [...prev, nextMessage];
        });
      }
    },
    [activityId, isMockThread]
  );

  const sendLocation = useCallback(
    async (lat: number, lng: number, senderId: string, senderName: string) => {
      if (isMockThread) {
        const mockMessage: Message = {
          id: `${activityId}-local-location-${Date.now()}`,
          activityId,
          senderId,
          senderName,
          senderPhoto: '',
          location: { lat, lng },
          type: 'location',
          isPinned: false,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => {
          const next = [...prev, mockMessage];
          void persistMockMessages(activityId, next);
          return next;
        });
        return;
      }

      const { data, error } = await chatSupabase
        .from('messages')
        .insert({
          activity_id: activityId,
          sender_id: senderId,
          location_lat: lat,
          location_lng: lng,
          type: 'location',
        })
        .select()
        .single();

      if (!error && data) {
        const nextMessage = await mapMessage({ ...data, sender_name: senderName, sender_photo: '' });
        setMessages((prev) => {
          if (prev.some((message) => message.id === nextMessage.id)) return prev;
          return [...prev, nextMessage];
        });
      }
    },
    [activityId, isMockThread]
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (isMockThread) {
        setMessages((prev) => {
          const next = prev.filter((message) => message.id !== messageId);
          void persistMockMessages(activityId, next);
          return next;
        });
        return true;
      }

      const { data, error } = await chatSupabase.rpc('delete_chat_message', {
        p_message_id: messageId,
      });

      if (error) throw error;
      if (!data) return false;

      setMessages((prev) => prev.filter((message) => message.id !== messageId));

      void channelRef.current?.send?.({
        type: 'broadcast',
        event: 'message_deleted',
        payload: { messageId, activityId },
      });
      return true;
    },
    [activityId, isMockThread]
  );

  const pinnedMessage = messages.find((message) => message.isPinned) ?? null;

  return { messages, isLoading, sendMessage, sendImage, sendLocation, deleteMessage, pinnedMessage, refetch: fetchMessages };
}
