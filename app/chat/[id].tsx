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
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  RefreshControl,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { decode } from 'base64-arraybuffer';
import { format } from 'date-fns';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { useChat } from '../../hooks/useChat';
import { useActivities } from '../../hooks/useActivities';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { InputLimits, trimInput } from '../../lib/validation';
import type { Message } from '../../types';

type ChatPerson = {
  id: string;
  displayName: string;
  photoUrl: string;
};

type MessageRowProps = {
  message: Message;
  currentUserId?: string;
  hostId?: string;
  onDelete: (message: Message) => void;
};

const MessageRow = React.memo(function MessageRow({
  message,
  currentUserId,
  hostId,
  onDelete,
}: MessageRowProps) {
  const isMe = message.senderId === currentUserId;
  const isSystem = message.type === 'system';
  const timeStr = message.createdAt
    ? format(new Date(message.createdAt), 'h:mm a')
    : '';
  const canDelete = !isSystem && (message.senderId === currentUserId || hostId === currentUserId);
  const senderInitial = (message.senderName || 'U').trim().charAt(0).toUpperCase();

  const senderAvatar = !isMe ? (
    message.senderPhoto ? (
      <Image source={{ uri: message.senderPhoto }} style={styles.messageAvatar} resizeMode="cover" />
    ) : (
      <View style={styles.messageAvatarFallback}>
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
        <Text style={styles.systemText}>{message.text}</Text>
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
            <Text style={styles.senderName}>{message.senderName}</Text>
          </View>
        ) : null}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleOpenMap}
          onLongPress={handleDelete}
          style={[styles.bubble, isMe ? styles.bubbleSent : styles.bubbleReceived]}
        >
          <Ionicons name="location" size={18} color={isMe ? Colors.white : Colors.accent} />
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextSent]}>
            Shared location
          </Text>
          <Text style={[styles.locationMetaText, isMe && styles.locationMetaTextSent]}>{locationLabel}</Text>
          <Text style={[styles.timeText, isMe && styles.timeTextSent]}>{timeStr}</Text>
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
    const imageBubble = (
      <>
        {!isMe ? (
          <View style={styles.senderInfo}>
            <Text style={styles.senderName}>{message.senderName}</Text>
          </View>
        ) : null}
        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={handleDelete}
          style={[styles.bubble, isMe ? styles.bubbleSent : styles.bubbleReceived]}
        >
          <Image source={{ uri: message.imageUrl }} style={styles.imageMessage} resizeMode="cover" />
          <Text style={[styles.timeText, isMe && styles.timeTextSent]}>{timeStr}</Text>
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
          <Text style={styles.senderName}>{message.senderName}</Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.9}
          onLongPress={handleDelete}
          style={[styles.bubble, styles.bubbleReceived]}
        >
          <Text style={styles.bubbleText}>{message.text}</Text>
          <Text style={styles.timeText}>{timeStr}</Text>
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
  const user = useAuthStore((s) => s.user);
  const { activities, getJoinStatus, canAccessChat } = useActivities();
  const { messages, isLoading, sendMessage, sendImage, sendLocation, deleteMessage, pinnedMessage, refetch } = useChat(id);

  const [inputText, setInputText] = useState('');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isSharingLocation, setIsSharingLocation] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInfoVisible, setIsInfoVisible] = useState(false);
  const [chatPeople, setChatPeople] = useState<ChatPerson[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const flatListRef = useRef<FlatList<Message>>(null);
  const shouldAutoScrollRef = useRef(false);
  const hasScrolledToInitialBottomRef = useRef(false);
  const isNearBottomRef = useRef(true);

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
  const latestVisibleMessageId = visibleMessages[visibleMessages.length - 1]?.id ?? '';
  const latestOtherParticipant = useMemo(
    () =>
      [...visibleMessages]
        .reverse()
        .find((message) => message.senderId !== user?.uid && message.type !== 'system'),
    [user?.uid, visibleMessages]
  );

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

  const handleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    isNearBottomRef.current = distanceFromBottom <= 120;
  }, []);

  useEffect(() => {
    if (!latestVisibleMessageId) return;

    if (!hasScrolledToInitialBottomRef.current) {
      scrollToBottom(false);
      hasScrolledToInitialBottomRef.current = true;
      shouldAutoScrollRef.current = false;
      return;
    }

    if (shouldAutoScrollRef.current || isNearBottomRef.current) {
      scrollToBottom(true);
      shouldAutoScrollRef.current = false;
    }
  }, [latestVisibleMessageId, scrollToBottom]);

  useFocusEffect(
    React.useCallback(() => {
      void refetch();
    }, [refetch])
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
    const objectPath = `${id}/${user?.uid ?? 'anon'}-${Date.now()}.${extension}`;

    const { error } = await (supabase as any).storage
      .from('chat-images')
      .upload(objectPath, uploadBody, {
        upsert: false,
        contentType,
      });

    if (error) throw error;
    // Store the public URL so the message can be reloaded after navigation.
    // The bucket is configured as public in Supabase, so this stays stable.
    const publicResp = (supabase as any).storage.from('chat-images').getPublicUrl(objectPath);
    return publicResp.data?.publicUrl ?? '';
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
        allowsEditing: false,
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      const publicUrl = await uploadChatImage(result.assets[0]);
      shouldAutoScrollRef.current = true;
      await sendImage(publicUrl, user.uid, user.displayName);
    } catch (error) {
      shouldAutoScrollRef.current = false;
      Alert.alert('Upload failed', 'Could not attach this photo. Please try again.');
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
    } catch (error) {
      shouldAutoScrollRef.current = false;
      Alert.alert('Location unavailable', 'Could not get your current location.');
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

  const renderMessage = useCallback(
    ({ item }: { item: Message }) => (
      <MessageRow
        message={item}
        currentUserId={user?.uid}
        hostId={activity?.hostId}
        onDelete={handleDeleteMessage}
      />
    ),
    [activity?.hostId, handleDeleteMessage, user?.uid]
  );

  if (activity && !isChatAllowed) {
    const isRejected = joinStatus === 'rejected';

    return (
      <View style={[styles.container, { paddingTop: insets.top }]}> 
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <View style={styles.headerInfo}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {activity.title}
            </Text>
            <Text style={styles.headerSubtitle}>Chat access required</Text>
          </View>
        </View>

        <View style={styles.lockedWrap}>
          <View style={styles.lockedIconWrap}>
            <Ionicons name="lock-closed" size={28} color={Colors.slate} />
          </View>
          <Text style={styles.lockedTitle}>{isRejected ? 'Join request not approved' : 'Waiting for approval'}</Text>
          <Text style={styles.lockedBody}>
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
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setIsInfoVisible(true)}
          style={styles.infoBtn}
          accessibilityRole="button"
          accessibilityLabel="Open activity information"
        >
          <Ionicons name="information" size={17} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {activity?.title ?? 'Chat'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {activity?.participants.length ?? 0} participants
          </Text>
        </View>
        <TouchableOpacity
          onPress={openSafetyMenu}
          style={styles.safetyBtn}
          accessibilityRole="button"
          accessibilityLabel="Open chat safety options"
        >
          <Ionicons name="shield-checkmark-outline" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={isInfoVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsInfoVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.infoSheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Activity Info</Text>
                <Text style={styles.sheetSubtitle}>{chatPeople.length} people in this chat</Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsInfoVisible(false)}
                style={styles.sheetCloseBtn}
                accessibilityRole="button"
                accessibilityLabel="Close activity information"
              >
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {activity ? (
              <View style={styles.activityInfoCard}>
                <Text style={styles.infoActivityTitle} numberOfLines={2}>{activity.title}</Text>
                <View style={styles.infoMetaRow}>
                  <Ionicons name="time-outline" size={14} color={Colors.slate} />
                  <Text style={styles.infoMetaText}>
                    {activity.dateTime ? format(new Date(activity.dateTime), 'EEE, MMM d • h:mm a') : 'Date TBD'}
                  </Text>
                </View>
                <View style={styles.infoMetaRow}>
                  <Ionicons name="location-outline" size={14} color={Colors.slate} />
                  <Text style={styles.infoMetaText} numberOfLines={2}>
                    {activity.location.name || 'Location TBD'}
                  </Text>
                </View>
              </View>
            ) : null}

            <Text style={styles.peopleSectionTitle}>People</Text>
            <View style={styles.peopleList}>
              {chatPeople.map((person, index) => {
                const isCreator = activity?.hostId === person.id;
                const initial = (person.displayName || (isCreator ? 'C' : 'P')).trim().charAt(0).toUpperCase();

                return (
                  <View key={`${person.id}-${index}`} style={styles.personRow}>
                    {person.photoUrl ? (
                      <Image source={{ uri: person.photoUrl }} style={styles.personPhoto} resizeMode="cover" />
                    ) : (
                      <View style={styles.personPlaceholder}>
                        <Text style={styles.personInitial}>{initial}</Text>
                      </View>
                    )}
                    <View style={styles.personInfo}>
                      <Text style={styles.personName} numberOfLines={1}>
                        {person.displayName || (isCreator ? 'Creator' : 'Participant')}
                      </Text>
                      <Text style={styles.personRole}>{isCreator ? 'Creator' : 'Participant'}</Text>
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

      {/* Pinned message banner */}
      {pinnedMessage && (
        <View style={styles.pinnedBanner}>
          <Ionicons name="pin" size={14} color={Colors.accent} />
          <Text style={styles.pinnedText} numberOfLines={1}>
            {pinnedMessage.text}
          </Text>
        </View>
      )}

      {/* Event info banner */}
      {activity && (
        <View style={styles.eventBanner}>
          <Text style={styles.eventBannerText}>
            {activity.dateTime
              ? format(new Date(activity.dateTime), 'EEE, MMM d • h:mm a')
              : ''
            }
          </Text>
          <Text style={styles.eventBannerSub}>{activity.location.name}</Text>
        </View>
      )}

      {/* Messages */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={visibleMessages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.accent}
              colors={[Colors.accent]}
            />
          }
        />
      )}

      {/* Input bar */}
      <View style={[styles.inputBar, { paddingBottom: insets.bottom + Spacing.sm }]}>
        <TouchableOpacity
          style={styles.attachBtn}
          onPress={handleAttachPhoto}
          disabled={isUploadingImage || isSharingLocation}
        >
          <Ionicons name="add-circle-outline" size={26} color={Colors.slate} />
        </TouchableOpacity>
        <TextInput
          style={styles.textInput}
          placeholder="Type a message..."
          placeholderTextColor={Colors.slate}
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
            color={Colors.slate}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!inputText.trim()}
        >
          <Ionicons
            name="send"
            size={20}
            color={inputText.trim() ? Colors.white : Colors.slate}
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
  infoBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.cream,
  },
  headerInfo: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  safetyBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  messagesList: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    flexGrow: 1,
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
    paddingVertical: Spacing.sm + 2,
  },
  bubbleSent: {
    backgroundColor: Colors.accent,
    borderBottomRightRadius: 4,
  },
  bubbleReceived: {
    backgroundColor: Colors.white,
    borderBottomLeftRadius: 4,
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
  locationMetaText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  locationMetaTextSent: {
    color: Colors.white + 'D9',
  },
  imageMessage: {
    width: 220,
    height: 220,
    borderRadius: BorderRadius.sm,
    marginBottom: 4,
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
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
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
    backgroundColor: Colors.divider,
  },
});
