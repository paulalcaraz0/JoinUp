import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  Linking,
  RefreshControl,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { decode } from 'base64-arraybuffer';
import { format } from 'date-fns';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { EmptyState } from '../../components/ui/EmptyState';
import { MessageSkeleton } from '../../components/ui/LoadingSkeleton';
import { clearChatActivityUnread, useChat } from '../../hooks/useChat';
import { useActivities } from '../../hooks/useActivities';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { InputLimits, trimInput } from '../../lib/validation';
import type { Message } from '../../types';

type ChatPerson = {
  id: string;
  displayName: string;
  photoUrl: string;
};

type DisplayMessage = Message & {
  stackedImageUrls?: string[];
};

const CHAT_READ_MARKER_PREFIX = 'chatReadMarker:v1:';
const IMAGE_STACK_GROUP_WINDOW_MS = 90 * 1000;

function chatReadMarkerKey(userId: string, activityId: string) {
  return `${CHAT_READ_MARKER_PREFIX}${userId}:${activityId}`;
}

async function loadChatReadMarker(userId: string, activityId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(chatReadMarkerKey(userId, activityId));
  } catch {
    return null;
  }
}

async function saveChatReadMarker(userId: string, activityId: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(chatReadMarkerKey(userId, activityId), value);
  } catch {
    // Best-effort local marker only.
  }
}

type MessageRowProps = {
  message: DisplayMessage;
  currentUserId?: string;
  hostId?: string;
  onDelete: (message: Message) => void;
  onOpenImages: (imageUrls: string[], initialIndex?: number) => void;
};

type UnreadDividerProps = {
  label: string;
};

type DateDividerProps = {
  label: string;
};

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function getMessageDate(message?: Message) {
  if (!message?.createdAt) return null;

  const date = new Date(message.createdAt);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getMessageDayKey(message?: Message) {
  const date = getMessageDate(message);
  if (!date) return '';

  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatMessageDateLabel(message: Message) {
  const date = getMessageDate(message);
  if (!date) return '';

  const messageDay = startOfLocalDay(date).getTime();
  const today = startOfLocalDay(new Date()).getTime();
  const dayDiff = Math.round((today - messageDay) / 86400000);

  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff > 1 && dayDiff < 7) return format(date, 'EEEE');

  return format(date, 'MMM d, yyyy');
}

function shouldStackImageMessage(previous: Message | undefined, current: Message) {
  if (!previous) return false;
  if (previous.type !== 'image' || current.type !== 'image') return false;
  if (!previous.imageUrl || !current.imageUrl) return false;
  if (previous.senderId !== current.senderId) return false;

  const previousTime = new Date(previous.createdAt).getTime();
  const currentTime = new Date(current.createdAt).getTime();
  if (Number.isNaN(previousTime) || Number.isNaN(currentTime)) return false;

  return Math.abs(currentTime - previousTime) <= IMAGE_STACK_GROUP_WINDOW_MS;
}

function groupStackedImageMessages(messages: Message[]): DisplayMessage[] {
  const grouped: DisplayMessage[] = [];

  messages.forEach((message) => {
    const lastGroup = grouped[grouped.length - 1];

    if (shouldStackImageMessage(lastGroup, message)) {
      const previousImageUrls = lastGroup.stackedImageUrls ?? (lastGroup.imageUrl ? [lastGroup.imageUrl] : []);
      const currentImageUrl = message.imageUrl;
      if (!currentImageUrl) return;

      grouped[grouped.length - 1] = {
        ...lastGroup,
        createdAt: message.createdAt,
        stackedImageUrls: [...previousImageUrls, currentImageUrl],
      };
      return;
    }

    grouped.push(
      message.type === 'image' && message.imageUrl
        ? { ...message, stackedImageUrls: [message.imageUrl] }
        : message
    );
  });

  return grouped;
}

const UnreadDivider = React.memo(function UnreadDivider({ label }: UnreadDividerProps) {
  return (
    <View style={styles.unreadDividerWrap}>
      <View style={styles.unreadDividerLine} />
      <View style={styles.unreadDividerPill}>
        <Text style={styles.unreadDividerText}>{label}</Text>
      </View>
      <View style={styles.unreadDividerLine} />
    </View>
  );
});

const DateDivider = React.memo(function DateDivider({ label }: DateDividerProps) {
  if (!label) return null;

  return (
    <View style={styles.dateDividerWrap}>
      <Text style={styles.dateDividerText}>{label}</Text>
    </View>
  );
});

const MessageRow = React.memo(function MessageRow({
  message,
  currentUserId,
  hostId,
  onDelete,
  onOpenImages,
}: MessageRowProps) {
  const { colors } = useThemeColors();
  const isMe = message.senderId === currentUserId;
  const isSystem = message.type === 'system';
  const timeStr = message.createdAt
    ? format(new Date(message.createdAt), 'h:mm a')
    : '';
  const canDelete = !isSystem && (message.senderId === currentUserId || hostId === currentUserId);
  const senderInitial = (message.senderName || 'U').trim().charAt(0).toUpperCase();
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [imageRetryKey, setImageRetryKey] = useState(0);

  useEffect(() => {
    setImageLoadFailed(false);
    setImageRetryKey(0);
  }, [message.imageUrl]);

  const senderAvatar = !isMe ? (
    message.senderPhoto ? (
      <Image source={{ uri: message.senderPhoto }} style={styles.messageAvatar} resizeMode="cover" />
    ) : (
      <View style={[styles.messageAvatarFallback, { backgroundColor: colors.primary }]}>
        <Text style={styles.messageAvatarInitial}>{senderInitial}</Text>
      </View>
    )
  ) : null;

  const handleDelete = useCallback(() => {
    if (canDelete) {
      onDelete(message);
    }
  }, [canDelete, message, onDelete]);

  const handleOpenMap = useCallback(() => {
    if (!message.location) return;
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${message.location.lat},${message.location.lng}`;
    void Linking.openURL(mapUrl);
  }, [message.location]);

  if (isSystem) {
    return (
      <View style={styles.systemMessage}>
        <Text style={[styles.systemText, { color: colors.slate }]}>{message.text}</Text>
      </View>
    );
  }

  if (message.type === 'location') {
    const locationLabel =
      message.location
        ? `${message.location.lat.toFixed(4)}, ${message.location.lng.toFixed(4)}`
        : 'Shared location';
    const locationBubble = (
      <>
        {!isMe ? (
          <View style={styles.senderInfo}>
            <Text style={[styles.senderName, { color: colors.slate }]}>{message.senderName}</Text>
          </View>
        ) : null}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleOpenMap}
          onLongPress={handleDelete}
          style={[styles.locationCard, isMe ? styles.locationCardSent : styles.locationCardReceived]}
        >
          <View style={styles.locationLiveRow}>
            <View style={styles.locationIconCircle}>
              <Ionicons name="navigate" size={20} color={Colors.white} />
            </View>
            <View style={styles.locationLiveCopy}>
              <Text style={styles.locationLiveTitle}>Shared location</Text>
              <Text style={styles.locationLiveSubtitle}>{timeStr ? `Shared at ${timeStr}` : 'Tap to view on map'}</Text>
            </View>
          </View>
          <Text style={styles.locationCoordinateText}>{locationLabel}</Text>
          <View style={styles.locationViewButton}>
            <Text style={styles.locationViewButtonText}>View location</Text>
          </View>
        </TouchableOpacity>
      </>
    );

    return isMe ? (
      <View style={[styles.bubbleRow, styles.bubbleRowRight]}>{locationBubble}</View>
    ) : (
      <View style={styles.receivedMessageRow}>
        {senderAvatar}
        <View style={styles.receivedBubbleWrap}>{locationBubble}</View>
      </View>
    );
  }

  if (message.type === 'image' && message.imageUrl) {
    const imageUrls = message.stackedImageUrls?.length ? message.stackedImageUrls : [message.imageUrl];
    const stackPreviewUrls = imageUrls.slice(-3);
    const extraPhotoCount = Math.max(0, imageUrls.length - 1);

    const handleOpenImages = () => {
      onOpenImages(imageUrls, imageUrls.length - 1);
    };

    const handleRetryImage = () => {
      setImageLoadFailed(false);
      setImageRetryKey((value) => value + 1);
    };

    const imageBubble = (
      <>
        {!isMe ? (
          <View style={styles.senderInfo}>
            <Text style={styles.senderName}>{message.senderName}</Text>
          </View>
        ) : null}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={imageLoadFailed ? undefined : handleOpenImages}
          onLongPress={handleDelete}
          style={styles.imageBubble}
        >
          <View style={styles.photoStackWrap}>
            {imageLoadFailed ? (
              <TouchableOpacity
                style={styles.imageRetryWrap}
                onPress={handleRetryImage}
                activeOpacity={0.82}
              >
                <Ionicons name="refresh-outline" size={22} color={colors.slate} />
                <Text style={[styles.imageRetryText, { color: colors.slate }]}>
                  Tap to retry image
                </Text>
              </TouchableOpacity>
            ) : (
              <>
                {stackPreviewUrls.slice(0, -1).map((imageUrl, index) => {
                  const isFirstLayer = index === 0;

                  return (
                    <View
                      key={`${message.id}-stack-${index}-${imageUrl}`}
                      style={[
                        styles.photoStackLayer,
                        isFirstLayer ? styles.photoStackLayerBack : styles.photoStackLayerMiddle,
                      ]}
                    >
                      <Image source={{ uri: imageUrl }} style={styles.photoStackImage} resizeMode="cover" />
                    </View>
                  );
                })}
                <View style={[styles.photoStackLayer, styles.photoStackLayerFront]}>
                  <Image
                    key={`${message.id}-${imageRetryKey}`}
                    source={{ uri: stackPreviewUrls[stackPreviewUrls.length - 1] ?? message.imageUrl }}
                    style={styles.photoStackImage}
                    resizeMode="cover"
                    onError={() => setImageLoadFailed(true)}
                  />
                </View>
                {extraPhotoCount > 0 ? (
                  <View style={styles.photoCountBadge}>
                    <Text style={styles.photoCountText}>{`+${extraPhotoCount} photo`}</Text>
                  </View>
                ) : null}
              </>
            )}
          </View>
          <Text style={[styles.timeText, { color: colors.slate }]}>{timeStr}</Text>
        </TouchableOpacity>
      </>
    );

    return isMe ? (
      <View style={[styles.bubbleRow, styles.bubbleRowRight]}>{imageBubble}</View>
    ) : (
      <View style={styles.receivedMessageRow}>
        {senderAvatar}
        <View style={styles.receivedBubbleWrap}>{imageBubble}</View>
      </View>
    );
  }

  if (message.type === 'image') {
    const unavailableBubble = (
      <>
        {!isMe ? (
          <View style={styles.senderInfo}>
            <Text style={[styles.senderName, { color: colors.slate }]}>{message.senderName}</Text>
          </View>
        ) : null}
        <View
          style={[
            styles.bubble,
            isMe ? styles.bubbleSent : [styles.bubbleReceived, { backgroundColor: colors.surface, borderColor: colors.divider }],
            styles.imageBubble,
          ]}
        >
          <View style={styles.imageUnavailableWrap}>
            <Ionicons name="image-outline" size={22} color={colors.slate} />
            <Text style={[styles.imageUnavailableText, { color: colors.slate }]}>
              Image unavailable
            </Text>
          </View>
          <Text style={[styles.timeText, { color: colors.slate }]}>{timeStr}</Text>
        </View>
      </>
    );

    return isMe ? (
      <View style={[styles.bubbleRow, styles.bubbleRowRight]}>{unavailableBubble}</View>
    ) : (
      <View style={styles.receivedMessageRow}>
        {senderAvatar}
        <View style={styles.receivedBubbleWrap}>{unavailableBubble}</View>
      </View>
    );
  }

  return isMe ? (
    <View style={[styles.bubbleRow, styles.bubbleRowRight]}>
      <TouchableOpacity
        activeOpacity={0.9}
        onLongPress={handleDelete}
        style={[styles.bubble, styles.bubbleSent]}
      >
        <Text style={[styles.bubbleText, styles.bubbleTextSent]}>
          {message.text}
        </Text>
        <Text style={[styles.timeText, styles.timeTextSent]}>{timeStr}</Text>
      </TouchableOpacity>
    </View>
  ) : (
    <View style={styles.receivedMessageRow}>
      {senderAvatar}
      <View style={styles.receivedBubbleWrap}>
        <View style={styles.senderInfo}>
          <Text style={[styles.senderName, { color: colors.slate }]}>{message.senderName}</Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={handleDelete}
          style={[styles.bubble, styles.bubbleReceived, { backgroundColor: colors.surface, borderColor: colors.divider }]}
        >
          <Text style={[styles.bubbleText, { color: colors.text }]}>{message.text}</Text>
          <Text style={[styles.timeText, { color: colors.slate }]}>{timeStr}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

export default function GroupChatScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = rawId ? rawId.toString().trim() : '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { colors } = useThemeColors();
  const user = useAuthStore((s) => s.user);
  const { activities, getJoinStatus, canAccessChat } = useActivities();
  const { messages, isLoading, error: chatError, sendMessage, sendImage, sendLocation, deleteMessage, pinnedMessage, refetch } = useChat(id);

  const [inputText, setInputText] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSharingLocation, setIsSharingLocation] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInfoVisible, setIsInfoVisible] = useState(false);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewImageIndex, setPreviewImageIndex] = useState(0);
  const [chatPeople, setChatPeople] = useState<ChatPerson[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const flatListRef = useRef<FlatList<DisplayMessage>>(null);
  const previewListRef = useRef<FlatList<string>>(null);
  const shouldAutoScrollRef = useRef(false);
  const hasScrolledToInitialBottomRef = useRef(false);
  const pendingInitialScrollRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const latestVisibleMessageAtRef = useRef<string>('');

  const activity = useMemo(
    () => activities.find((a) => a.id === id),
    [activities, id]
  );
  const joinStatus = getJoinStatus(id ?? '');
  const isChatAllowed = canAccessChat(id ?? '', activity?.hostId);
  const visibleMessages = useMemo(
    () => messages.filter((message) => !blockedUserIds.includes(message.senderId)),
    [blockedUserIds, messages]
  );
  const displayMessages = useMemo(
    () => groupStackedImageMessages(visibleMessages),
    [visibleMessages]
  );
  const latestVisibleMessageId = visibleMessages[visibleMessages.length - 1]?.id ?? '';
  const latestVisibleMessageAt = visibleMessages[visibleMessages.length - 1]?.createdAt ?? '';
  const latestOtherParticipant = useMemo(
    () =>
      [...visibleMessages]
        .reverse()
        .find((message) => message.senderId !== user?.uid && message.type !== 'system'),
    [user?.uid, visibleMessages]
  );
  const unreadDividerIndex = useMemo(() => {
    if (!lastReadAt) return -1;

    const boundary = new Date(lastReadAt).getTime();
    if (Number.isNaN(boundary)) return -1;

    return displayMessages.findIndex((message) => new Date(message.createdAt).getTime() > boundary);
  }, [displayMessages, lastReadAt]);

  useEffect(() => {
    latestVisibleMessageAtRef.current = latestVisibleMessageAt;
  }, [latestVisibleMessageAt]);

  useEffect(() => {
    hasScrolledToInitialBottomRef.current = false;
    pendingInitialScrollRef.current = true;
    shouldAutoScrollRef.current = false;
    isNearBottomRef.current = true;
    setLastReadAt(null);
  }, [id]);

  useEffect(() => {
    let isActive = true;

    const hydrateReadMarker = async () => {
      if (!user?.uid || !id) {
        if (isActive) {
          setLastReadAt(null);
        }
        return;
      }

      const marker = await loadChatReadMarker(user.uid, id);
      if (isActive) {
        setLastReadAt(marker);
      }
    };

    void hydrateReadMarker();

    return () => {
      isActive = false;
    };
  }, [id, user?.uid]);

  useEffect(() => {
    let isActive = true;

    const fetchBlockedUsers = async () => {
      if (!user?.uid) {
        setBlockedUserIds([]);
        return;
      }

      const { data, error } = await (supabase as any)
        .from('user_blocks')
        .select('blocked_user_id')
        .eq('blocker_id', user.uid);

      if (!isActive || error) return;
      setBlockedUserIds(
        (data ?? [])
          .map((row: any) => row.blocked_user_id)
          .filter((value: unknown): value is string => typeof value === 'string')
      );
    };

    void fetchBlockedUsers();

    return () => {
      isActive = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    let isActive = true;

    const fetchChatPeople = async () => {
      if (!activity) {
        setChatPeople([]);
        return;
      }

      const ids = Array.from(new Set([activity.hostId, ...(activity.participants ?? [])].filter(Boolean)));
      if (ids.length === 0) {
        setChatPeople([]);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, photo_url')
        .in('id', ids);

      if (!isActive || error) return;

      const profileMap = new Map(
        (data ?? []).map((profile: any) => [
          profile.id,
          {
            id: profile.id,
            displayName: profile.display_name ?? '',
            photoUrl: profile.photo_url ?? '',
          } as ChatPerson,
        ])
      );

      setChatPeople(ids.map((personId) => profileMap.get(personId) ?? {
        id: personId,
        displayName: personId === activity.hostId ? activity.hostName || 'Creator' : 'Participant',
        photoUrl: personId === activity.hostId ? activity.hostPhoto || '' : '',
      }));
    };

    void fetchChatPeople();

    return () => {
      isActive = false;
    };
  }, [activity]);

  const scrollToBottom = useCallback((animated: boolean) => {
    flatListRef.current?.scrollToEnd({ animated });
  }, []);

  const scrollToIndexSafely = useCallback((index: number, animated: boolean) => {
    if (index < 0) return;
    flatListRef.current?.scrollToIndex({
      index,
      animated,
      viewPosition: 0.15,
    });
  }, []);

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    isNearBottomRef.current = distanceFromBottom <= 120;
  }, []);

  const handleContentSizeChange = useCallback(() => {
    if (!latestVisibleMessageId) return;

    if (!hasScrolledToInitialBottomRef.current && pendingInitialScrollRef.current) {
      const targetIndex = unreadDividerIndex >= 0 ? unreadDividerIndex : displayMessages.length - 1;
      if (targetIndex >= 0) {
        scrollToIndexSafely(targetIndex, false);
      } else {
        scrollToBottom(false);
      }
      hasScrolledToInitialBottomRef.current = true;
      pendingInitialScrollRef.current = false;
      shouldAutoScrollRef.current = false;
      return;
    }

    if (shouldAutoScrollRef.current || isNearBottomRef.current) {
      scrollToBottom(true);
      shouldAutoScrollRef.current = false;
    }
  }, [displayMessages.length, latestVisibleMessageId, scrollToBottom, scrollToIndexSafely, unreadDividerIndex]);

  useEffect(() => {
    if (!latestVisibleMessageId) return;
    if (hasScrolledToInitialBottomRef.current || !pendingInitialScrollRef.current) return;

    const targetIndex = unreadDividerIndex >= 0 ? unreadDividerIndex : displayMessages.length - 1;
    if (targetIndex >= 0) {
      scrollToIndexSafely(targetIndex, false);
    } else {
      scrollToBottom(false);
    }

    hasScrolledToInitialBottomRef.current = true;
    pendingInitialScrollRef.current = false;
    shouldAutoScrollRef.current = false;
  }, [displayMessages.length, latestVisibleMessageId, scrollToBottom, scrollToIndexSafely, unreadDividerIndex]);

  const handleScrollToIndexFailed = useCallback((info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
    const offset = Math.max(0, Math.floor(info.index * info.averageItemLength));
    flatListRef.current?.scrollToOffset({ offset, animated: false });

    requestAnimationFrame(() => {
      flatListRef.current?.scrollToIndex({
        index: info.index,
        animated: false,
        viewPosition: 0.15,
      });
    });
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      void refetch();
      if (user?.uid && id) {
        void clearChatActivityUnread(user.uid, id);
      }

      return () => {
        if (user?.uid && id && latestVisibleMessageAtRef.current) {
          void saveChatReadMarker(user.uid, id, latestVisibleMessageAtRef.current);
        }
      };
    }, [id, refetch, user?.uid])
  );

  const handleRefresh = useCallback(async () => {
    try {
      setIsRefreshing(true);
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  }, [refetch]);

  const handleSend = useCallback(async () => {
    const text = trimInput(inputText);
    if (!text || !user) return;

    if (text.length > InputLimits.chatMessage) {
      Alert.alert('Message too long', `Keep messages under ${InputLimits.chatMessage} characters.`);
      return;
    }

    setInputText('');
    shouldAutoScrollRef.current = true;
    try {
      await sendMessage(text, user.uid, user.displayName);
    } catch (error: any) {
      shouldAutoScrollRef.current = false;
      setInputText(text);
      Alert.alert('Message not sent', error?.message ?? 'Could not send this message. Please try again.');
    }
  }, [inputText, sendMessage, user]);

  const uploadChatImage = useCallback(async (asset: ImagePicker.ImagePickerAsset) => {
    const uri = asset.uri;
    const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | null = null;

      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      });

      try {
        return await Promise.race([promise, timeoutPromise]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    let uploadBody: Blob | ArrayBuffer;
    let contentType = asset.mimeType || 'image/jpeg';

    if (asset.base64) {
      // Prefer image-picker base64 payload to avoid content:// URI read issues on some devices.
      uploadBody = decode(asset.base64);
    } else {
      const response = await withTimeout(fetch(uri), 15000, 'Timed out while reading selected image.');
      const blob = await withTimeout(response.blob(), 15000, 'Timed out while preparing selected image.');

      if ((blob as any)?.size === 0) {
        throw new Error('Could not read selected image data. The file appears empty.');
      }

      uploadBody = blob;
      contentType = blob.type || contentType;
    }

    const extension = (uri.split('.').pop() ?? 'jpg').split('?')[0];
    const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const objectPath = `${id}/${user?.uid ?? 'anon'}-${uniqueSuffix}.${extension}`;

    const { error } = await (supabase as any).storage
      .from('chat-images')
      .upload(objectPath, uploadBody, {
        upsert: false,
        contentType,
      });

    if (error) throw error;
    return objectPath;
  }, [id, user?.uid]);

  const handleAttachPhoto = useCallback(async () => {
    if (!user) return;

    try {
      setIsUploadingImage(true);
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to attach images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 6,
        allowsEditing: false,
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || !result.assets?.length) return;

      shouldAutoScrollRef.current = true;
      for (const asset of result.assets) {
        if (!asset.uri) continue;
        const imageObjectPath = await uploadChatImage(asset);
        await sendImage(imageObjectPath, user.uid, user.displayName);
      }
    } catch (error: any) {
      shouldAutoScrollRef.current = false;
      Alert.alert('Upload failed', error?.message ?? 'Could not attach this photo. Please try again.');
    } finally {
      setIsUploadingImage(false);
    }
  }, [sendImage, uploadChatImage, user]);

  const handleShareLocation = useCallback(async () => {
    if (!user) return;

    try {
      setIsSharingLocation(true);
      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        Alert.alert('Permission needed', 'Allow location access to share your location.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      await sendLocation(
        position.coords.latitude,
        position.coords.longitude,
        user.uid,
        user.displayName
      );
      shouldAutoScrollRef.current = true;
    } catch (error: any) {
      shouldAutoScrollRef.current = false;
      Alert.alert('Location unavailable', error?.message ?? 'Could not share your location right now.');
    } finally {
      setIsSharingLocation(false);
    }
  }, [sendLocation, user]);

  const handleReportConversation = useCallback(async () => {
    if (!user?.uid || !id) return;

    try {
      const latestMessage = [...messages].reverse().find((message) => message.type !== 'system');

      const { error } = await (supabase as any).from('content_reports').insert({
        reporter_id: user.uid,
        activity_id: id,
        reported_user_id:
          latestOtherParticipant?.senderId && latestOtherParticipant.senderId !== user.uid
            ? latestOtherParticipant.senderId
            : null,
        message_id: latestMessage?.id ?? null,
        reason: 'chat_safety',
        details: 'User reported this chat conversation from the in-app safety menu.',
      });

      if (error) throw error;
      Alert.alert('Report sent', 'Thanks. We will review this conversation.');
    } catch {
      Alert.alert('Report unavailable', 'Could not send the report right now. Please try again later.');
    }
  }, [id, latestOtherParticipant, messages, user?.uid]);

  const handleBlockLatestParticipant = useCallback(async () => {
    if (!user?.uid || !latestOtherParticipant) {
      Alert.alert('No participant to block', 'There are no other chat participants visible in this conversation yet.');
      return;
    }

    try {
      const blockedUserId = latestOtherParticipant.senderId;
      const { error } = await (supabase as any).from('user_blocks').upsert(
        {
          blocker_id: user.uid,
          blocked_user_id: blockedUserId,
        },
        { onConflict: 'blocker_id,blocked_user_id' }
      );

      if (error) throw error;
      setBlockedUserIds((prev) => Array.from(new Set([...prev, blockedUserId])));
      Alert.alert('User blocked', `${latestOtherParticipant.senderName || 'This user'} is now hidden from your chat.`);
    } catch {
      Alert.alert('Block unavailable', 'Could not block this user right now. Please try again later.');
    }
  }, [latestOtherParticipant, user?.uid]);

  const openSafetyMenu = useCallback(() => {
    Alert.alert(
      'Chat safety',
      'Report harmful content or hide messages from a participant.',
      [
        { text: 'Report conversation', onPress: handleReportConversation },
        { text: 'Block latest participant', onPress: handleBlockLatestParticipant, style: 'destructive' },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }, [handleBlockLatestParticipant, handleReportConversation]);

  const handleDeleteMessage = useCallback((message: Message) => {
    const isOwnMessage = message.senderId === user?.uid;
    Alert.alert(
      'Delete message?',
      isOwnMessage
        ? 'This message will be removed from the chat.'
        : 'As the host, you can remove this message from the chat.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const deleted = await deleteMessage(message.id);
              if (!deleted) {
                Alert.alert('Delete failed', 'You can only delete your own messages or messages in an activity you host.');
              }
            } catch {
              Alert.alert('Delete failed', 'Could not delete this message right now.');
            }
          },
        },
      ]
    );
  }, [deleteMessage, user?.uid]);

  const handleOpenImages = useCallback((imageUrls: string[], initialIndex = 0) => {
    if (imageUrls.length === 0) return;
    setPreviewImages(imageUrls);
    setPreviewImageIndex(Math.min(Math.max(initialIndex, 0), imageUrls.length - 1));
  }, []);

  const handleCloseImagePreview = useCallback(() => {
    setPreviewImages([]);
    setPreviewImageIndex(0);
  }, []);

  const handlePreviewStep = useCallback((direction: -1 | 1) => {
    const nextIndex = (() => {
      if (previewImages.length === 0) return 0;
      return (previewImageIndex + direction + previewImages.length) % previewImages.length;
    })();

    setPreviewImageIndex(nextIndex);
    previewListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
  }, [previewImageIndex, previewImages.length]);

  useEffect(() => {
    if (previewImages.length === 0) return;

    requestAnimationFrame(() => {
      previewListRef.current?.scrollToIndex({
        index: previewImageIndex,
        animated: false,
      });
    });
  }, [previewImages.length]);

  const renderMessage = useCallback(
    ({ item, index }: { item: DisplayMessage; index: number }) => {
      const previousMessage = displayMessages[index - 1];
      const shouldShowDateDivider =
        index === 0 || getMessageDayKey(item) !== getMessageDayKey(previousMessage);

      return (
        <View>
          {shouldShowDateDivider ? <DateDivider label={formatMessageDateLabel(item)} /> : null}
          {index === unreadDividerIndex ? <UnreadDivider label="Unread messages" /> : null}
          <MessageRow
            message={item}
            currentUserId={user?.uid}
            hostId={activity?.hostId}
            onDelete={handleDeleteMessage}
            onOpenImages={handleOpenImages}
          />
        </View>
      );
    },
    [activity?.hostId, displayMessages, handleDeleteMessage, handleOpenImages, unreadDividerIndex, user?.uid]
  );

  if (activity && !isChatAllowed) {
    const isRejected = joinStatus === 'rejected';

    return (
      <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.cream }]}> 
        <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
              {activity.title}
            </Text>
            <Text style={[styles.headerSubtitle, { color: colors.slate }]}>Chat access required</Text>
          </View>
        </View>

        <View style={styles.lockedWrap}>
          <View style={[styles.lockedIconWrap, { backgroundColor: colors.divider }]}>
            <Ionicons name="lock-closed" size={28} color={colors.slate} />
          </View>
          <Text style={[styles.lockedTitle, { color: colors.text }]}>{isRejected ? 'Join request not approved' : 'Waiting for approval'}</Text>
          <Text style={[styles.lockedBody, { color: colors.slate }]}>
            {isRejected
              ? 'You cannot access this chat because the request was not approved.'
              : 'Once approved, this chat unlocks instantly.'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.cream }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.divider }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            {activity?.title ?? 'Chat'}
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.slate }]}>
            {activity?.participants.length ?? 0} participants
          </Text>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => setIsInfoVisible(true)}
            style={[styles.headerIconBtn, { backgroundColor: colors.mutedSurface, borderColor: colors.divider }]}
            accessibilityRole="button"
            accessibilityLabel="Open activity information"
          >
            <Ionicons name="information-circle-outline" size={22} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openSafetyMenu}
            style={[styles.headerIconBtn, { backgroundColor: colors.mutedSurface, borderColor: colors.divider }]}
            accessibilityRole="button"
            accessibilityLabel="Open chat safety options"
          >
            <Ionicons name="shield-checkmark-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={isInfoVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsInfoVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.infoSheet, { paddingBottom: insets.bottom + Spacing.lg, backgroundColor: colors.cream }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.divider }]} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={[styles.sheetTitle, { color: colors.text }]}>Activity Info</Text>
                <Text style={[styles.sheetSubtitle, { color: colors.slate }]}>{chatPeople.length} people in this chat</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsInfoVisible(false)}
                style={[styles.sheetCloseBtn, { backgroundColor: colors.surface }]}
                accessibilityRole="button"
                accessibilityLabel="Close activity information"
              >
                <Ionicons name="close" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>

            {activity ? (
              <View style={[styles.activityInfoCard, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
                <Text style={[styles.infoActivityTitle, { color: colors.text }]} numberOfLines={2}>{activity.title}</Text>
                <View style={styles.infoMetaRow}>
                  <Ionicons name="time-outline" size={14} color={colors.slate} />
                  <Text style={[styles.infoMetaText, { color: colors.textSecondary }]}>
                    {activity.dateTime ? format(new Date(activity.dateTime), 'EEE, MMM d, h:mm a') : 'Date TBD'}
                  </Text>
                </View>
                <View style={styles.infoMetaRow}>
                  <Ionicons name="location-outline" size={14} color={colors.slate} />
                  <Text style={[styles.infoMetaText, { color: colors.textSecondary }]} numberOfLines={2}>
                    {activity.location.name || 'Location TBD'}
                  </Text>
                </View>
              </View>
            ) : null}

            <Text style={[styles.peopleSectionTitle, { color: colors.text }]}>People</Text>
            <View style={[styles.peopleList, { backgroundColor: colors.surface, borderColor: colors.divider }]}>
              {chatPeople.map((person, index) => {
                const isCreator = activity?.hostId === person.id;
                const initial = (person.displayName || (isCreator ? 'C' : 'P')).trim().charAt(0).toUpperCase();

                return (
                  <View key={`${person.id}-${index}`} style={styles.personRow}>
                    {person.photoUrl ? (
                      <Image source={{ uri: person.photoUrl }} style={styles.personPhoto} resizeMode="cover" />
                    ) : (
                      <View style={[styles.personPlaceholder, { backgroundColor: colors.primary }]}>
                        <Text style={styles.personInitial}>{initial}</Text>
                      </View>
                    )}
                    <View style={styles.personInfo}>
                      <Text style={[styles.personName, { color: colors.text }]} numberOfLines={1}>
                        {person.displayName || (isCreator ? 'Creator' : 'Participant')}
                      </Text>
                      <Text style={[styles.personRole, { color: colors.slate }]}>{isCreator ? 'Creator' : 'Participant'}</Text>
                    </View>
                    {isCreator ? (
                      <View style={styles.creatorBadge}>
                        <Text style={styles.creatorBadgeText}>Host</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={previewImages.length > 0}
        animationType="fade"
        transparent
        onRequestClose={handleCloseImagePreview}
      >
        <View style={styles.imagePreviewBackdrop}>
          <View style={[styles.imagePreviewHeader, { paddingTop: insets.top + Spacing.sm }]}>
            <Text style={styles.imagePreviewCount}>
              {previewImages.length > 1 ? `${previewImageIndex + 1} / ${previewImages.length}` : 'Photo'}
            </Text>
            <TouchableOpacity
              onPress={handleCloseImagePreview}
              style={styles.imagePreviewClose}
              accessibilityRole="button"
              accessibilityLabel="Close photo preview"
            >
              <Ionicons name="close" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>

          <FlatList
            ref={previewListRef}
            data={previewImages}
            keyExtractor={(item, index) => `${item}-${index}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <Image
                source={{ uri: item }}
                style={[styles.imagePreview, { width: windowWidth }]}
                resizeMode="contain"
              />
            )}
            getItemLayout={(_, index) => ({
              length: windowWidth,
              offset: windowWidth * index,
              index,
            })}
            onMomentumScrollEnd={(event) => {
              const nextIndex = Math.round(event.nativeEvent.contentOffset.x / windowWidth);
              setPreviewImageIndex(Math.min(Math.max(nextIndex, 0), previewImages.length - 1));
            }}
          />

          {previewImages.length > 1 ? (
            <View pointerEvents="box-none" style={styles.imagePreviewControls}>
              <TouchableOpacity
                onPress={() => handlePreviewStep(-1)}
                style={styles.imagePreviewNav}
                accessibilityRole="button"
                accessibilityLabel="Previous photo"
              >
                <Ionicons name="chevron-back" size={28} color={Colors.white} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handlePreviewStep(1)}
                style={styles.imagePreviewNav}
                accessibilityRole="button"
                accessibilityLabel="Next photo"
              >
                <Ionicons name="chevron-forward" size={28} color={Colors.white} />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </Modal>

      {/* Pinned message banner */}
      {pinnedMessage && (
        <View style={styles.pinnedBanner}>
          <Ionicons name="pin" size={14} color={colors.accent} />
          <Text style={[styles.pinnedText, { color: colors.text }]} numberOfLines={1}>
            {pinnedMessage.text}
          </Text>
        </View>
      )}

      {/* Event info banner */}
      {activity && (
        <View style={styles.eventBanner}>
          <Text style={styles.eventBannerText}>
            {activity.dateTime
              ? format(new Date(activity.dateTime), 'EEE, MMM d, h:mm a')
              : ''
            }
          </Text>
          <Text style={styles.eventBannerSub}>{activity.location.name}</Text>
        </View>
      )}

      {/* Messages */}
      {isLoading ? (
        <View style={styles.messageSkeletonList}>
          {[0, 1, 2, 3, 4].map((item) => (
            <MessageSkeleton key={item} />
          ))}
        </View>
      ) : chatError && visibleMessages.length === 0 ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Could not load chat"
          message={chatError}
          actionLabel="Try again"
          onAction={() => {
            void refetch();
          }}
        />
      ) : (
        <FlatList
          ref={flatListRef}
          data={displayMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          ListEmptyComponent={
            <View style={styles.emptyMessagesWrap}>
              <Ionicons name="chatbubble-ellipses-outline" size={34} color={colors.slate} />
              <Text style={[styles.emptyMessagesTitle, { color: colors.text }]}>No messages yet</Text>
              <Text style={[styles.emptyMessagesBody, { color: colors.slate }]}>Say hello and help the group get started.</Text>
            </View>
          }
          initialNumToRender={14}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          onContentSizeChange={handleContentSizeChange}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
        />
      )}

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + Spacing.sm, backgroundColor: colors.surface, borderTopColor: colors.divider }]}>
        <TouchableOpacity
          style={styles.attachBtn}
          onPress={handleAttachPhoto}
          disabled={isUploadingImage || isSharingLocation}
        >
          <Ionicons name="add-circle-outline" size={26} color={colors.slate} />
        </TouchableOpacity>
        <TextInput
          style={[styles.textInput, { backgroundColor: colors.cream, borderColor: colors.divider, color: colors.text }]}
          placeholder="Type a message..."
          placeholderTextColor={colors.slate}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={InputLimits.chatMessage}
        />
        <TouchableOpacity
          style={styles.locationBtn}
          onPress={handleShareLocation}
          disabled={isUploadingImage || isSharingLocation}
        >
          <Ionicons
            name={isSharingLocation ? 'hourglass-outline' : 'location-outline'}
            size={20}
            color={colors.slate}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: colors.accent }, !inputText.trim() && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim()}
        >
          <Ionicons
            name="send"
            size={20}
            color={inputText.trim() ? Colors.white : colors.slate}
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    backgroundColor: Colors.white,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
    minWidth: 0,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginLeft: Spacing.sm,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  headerTitle: {
    fontFamily: Typography.bodyBold,
    fontSize: 17,
    color: Colors.text,
  },
  headerSubtitle: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: Colors.slate,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: Colors.overlay,
  },
  infoSheet: {
    backgroundColor: Colors.cream,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    maxHeight: '82%',
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.divider,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sheetTitle: {
    fontFamily: Typography.display,
    fontSize: 24,
    color: Colors.text,
  },
  sheetSubtitle: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: Colors.slate,
    marginTop: 2,
  },
  sheetCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
  },
  activityInfoCard: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  infoActivityTitle: {
    fontFamily: Typography.bodyBold,
    fontSize: 18,
    color: Colors.text,
    lineHeight: 24,
    marginBottom: Spacing.sm,
  },
  infoMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: 4,
  },
  infoMetaText: {
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  peopleSectionTitle: {
    fontFamily: Typography.bodyBold,
    fontSize: 16,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  peopleList: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.divider,
    overflow: 'hidden',
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    gap: Spacing.sm,
  },
  personPhoto: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  personPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personInitial: {
    fontFamily: Typography.bodyBold,
    fontSize: 18,
    color: Colors.white,
  },
  personInfo: {
    flex: 1,
    minWidth: 0,
  },
  personName: {
    fontFamily: Typography.bodyBold,
    fontSize: 14,
    color: Colors.text,
  },
  personRole: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.slate,
    marginTop: 2,
  },
  creatorBadge: {
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.accent + '14',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  creatorBadgeText: {
    fontFamily: Typography.bodyBold,
    fontSize: 11,
    color: Colors.accent,
  },
  imagePreviewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.94)',
  },
  imagePreviewHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
  },
  imagePreviewCount: {
    fontFamily: Typography.bodyBold,
    fontSize: 14,
    color: Colors.white,
  },
  imagePreviewClose: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.38)',
  },
  imagePreview: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  imagePreviewControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
  },
  imagePreviewNav: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.38)',
    ...Shadows.card,
  },
  pinnedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.accent + '10',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  pinnedText: {
    fontFamily: Typography.bodyMed,
    fontSize: 13,
    color: Colors.text,
    flex: 1,
  },
  eventBanner: {
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  eventBannerText: {
    fontFamily: Typography.bodyBold,
    fontSize: 14,
    color: Colors.white,
  },
  eventBannerSub: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.white + 'CC',
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageSkeletonList: {
    flex: 1,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  lockedWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  lockedIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.divider,
    marginBottom: Spacing.md,
  },
  lockedTitle: {
    fontFamily: Typography.bodyBold,
    fontSize: 18,
    color: Colors.text,
    textAlign: 'center',
  },
  lockedBody: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.slate,
    marginTop: Spacing.sm,
    textAlign: 'center',
    lineHeight: 21,
  },
  unreadDividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginVertical: Spacing.sm,
  },
  unreadDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.divider,
  },
  unreadDividerPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  unreadDividerText: {
    fontFamily: Typography.bodyMed,
    fontSize: 11,
    color: Colors.slate,
    letterSpacing: 0,
  },
  dateDividerWrap: {
    alignSelf: 'center',
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  dateDividerText: {
    fontFamily: Typography.bodyBold,
    fontSize: 12,
    color: Colors.textSecondary,
    letterSpacing: 0,
  },
  messagesList: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    flexGrow: 1,
  },
  emptyMessagesWrap: {
    flex: 1,
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyMessagesTitle: {
    fontFamily: Typography.bodyBold,
    fontSize: 17,
    color: Colors.text,
    marginTop: Spacing.sm,
  },
  emptyMessagesBody: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.slate,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 20,
  },
  systemMessage: {
    alignSelf: 'center',
    backgroundColor: Colors.divider + '60',
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    marginVertical: Spacing.sm,
  },
  systemText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.slate,
  },
  bubbleRow: {
    marginBottom: Spacing.sm,
    maxWidth: '80%',
  },
  bubbleRowLeft: {
    alignSelf: 'flex-start',
  },
  bubbleRowRight: {
    alignSelf: 'flex-end',
  },
  receivedMessageRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.xs,
    maxWidth: '86%',
    marginBottom: Spacing.sm,
  },
  receivedBubbleWrap: {
    flexShrink: 1,
    minWidth: 0,
  },
  messageAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.divider,
  },
  messageAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  messageAvatarInitial: {
    fontFamily: Typography.bodyBold,
    fontSize: 12,
    color: Colors.white,
  },
  senderInfo: {
    marginBottom: 2,
    marginLeft: 4,
  },
  senderName: {
    fontFamily: Typography.bodyMed,
    fontSize: 12,
    color: Colors.accent,
  },
  bubble: {
    borderRadius: BorderRadius.card,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.ms,
    ...Shadows.soft,
  },
  bubbleSent: {
    backgroundColor: Colors.accent,
    borderBottomRightRadius: BorderRadius.sm,
  },
  bubbleReceived: {
    backgroundColor: Colors.white,
    borderBottomLeftRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  imageBubble: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: Spacing.xs,
  },
  bubbleText: {
    fontFamily: Typography.body,
    fontSize: 15,
    color: Colors.text,
    lineHeight: 21,
  },
  bubbleTextSent: {
    color: Colors.white,
  },
  locationCard: {
    width: 240,
    borderRadius: BorderRadius.card,
    padding: Spacing.ms,
    ...Shadows.soft,
  },
  locationCardSent: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: BorderRadius.sm,
  },
  locationCardReceived: {
    backgroundColor: Colors.primary,
    borderBottomLeftRadius: BorderRadius.sm,
  },
  locationLiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  locationIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2488FF',
  },
  locationLiveCopy: {
    flex: 1,
    minWidth: 0,
  },
  locationLiveTitle: {
    fontFamily: Typography.bodyBold,
    fontSize: 14,
    color: Colors.white,
  },
  locationLiveSubtitle: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.68)',
    marginTop: 1,
  },
  locationCoordinateText: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: Spacing.xs,
  },
  locationViewButton: {
    minHeight: 38,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    marginTop: Spacing.sm,
  },
  locationViewButtonText: {
    fontFamily: Typography.bodyBold,
    fontSize: 13,
    color: Colors.white,
  },
  locationMetaText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  locationMetaTextSent: {
    color: Colors.white + 'D9',
  },
  photoStackWrap: {
    width: 224,
    height: 220,
    marginBottom: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoStackLayer: {
    position: 'absolute',
    width: 190,
    height: 184,
    borderRadius: BorderRadius.card,
    overflow: 'hidden',
    backgroundColor: Colors.white,
    ...Shadows.soft,
  },
  photoStackLayerBack: {
    transform: [{ rotate: '-7deg' }, { translateX: -14 }, { translateY: 9 }],
    opacity: 0.9,
  },
  photoStackLayerMiddle: {
    transform: [{ rotate: '5deg' }, { translateX: 13 }, { translateY: 4 }],
    opacity: 0.95,
  },
  photoStackLayerFront: {
    transform: [{ rotate: '-1deg' }],
  },
  photoStackImage: {
    width: '100%',
    height: '100%',
  },
  photoCountBadge: {
    position: 'absolute',
    alignSelf: 'center',
    borderRadius: BorderRadius.pill,
    backgroundColor: 'rgba(21, 34, 56, 0.66)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  photoCountText: {
    fontFamily: Typography.bodyBold,
    fontSize: 12,
    color: Colors.white,
    letterSpacing: 0,
  },
  imageRetryWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  imageRetryText: {
    fontFamily: Typography.bodyMed,
    fontSize: 13,
    color: Colors.slate,
    textAlign: 'center',
  },
  imageRetryTextSent: {
    color: Colors.white + 'D9',
  },
  imageUnavailableWrap: {
    width: 220,
    minHeight: 92,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    marginBottom: 4,
  },
  imageUnavailableText: {
    fontFamily: Typography.bodyMed,
    fontSize: 13,
    color: Colors.slate,
  },
  imageUnavailableTextSent: {
    color: Colors.white + 'D9',
  },
  timeText: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: Colors.slate,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  timeTextSent: {
    color: Colors.white + 'AA',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.ms,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  attachBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textInput: {
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    maxHeight: 100,
    marginRight: Spacing.sm,
  },
  locationBtn: {
    width: 36,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.xs,
    marginBottom: 2,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: {
    backgroundColor: Colors.slate,
    opacity: 0.45,
  },
});
