import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useFocusEffect, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors, Typography, Spacing, BorderRadius, Shadows, CategoryColors } from '../../constants/theme';
import { useActivities } from '../../hooks/useActivities';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuthStore } from '../../store/authStore';
import { getMockChatPreview } from '../../lib/mockChats';
import { supabase } from '../../lib/supabase';
import { clearChatActivityUnread, loadUnreadChatActivityIds, saveUnreadChatActivityIds } from '../../hooks/useChat';
import type { Activity, JoinRequestStatus, Message } from '../../types';

type ChatActivityRowProps = {
  activity: Activity;
  index: number;
  currentUserId?: string;
  joinedIds: Set<string>;
  getJoinStatus: (activityId: string) => JoinRequestStatus | null;
  onOpen: (activityId: string, hostId: string | undefined, effectiveStatus: JoinRequestStatus | null) => void;
  onDeleteRejected: (activityId: string) => Promise<boolean>;
  onDeleteHosted: (activityId: string) => void;
  hasUnread: boolean;
  recentMeta: RecentChatMeta | null;
}

type RecentChatMeta = {
  lastMessageAt: string;
  senderName: string;
  previewText: string;
  type: Message['type'];
};

function buildPreviewText(row: any): string {
  if (row.type === 'location') return 'Shared location';
  if (row.type === 'image') return 'Sent a photo';
  if (row.type === 'system') return row.text ?? 'System message';
  return row.text ?? '';
}

function normalizeSenderName(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

const statusMeta = (status: JoinRequestStatus | null, isHost: boolean) => {
  if (isHost) {
    return { label: 'Hosting', color: Colors.primary, locked: false };
  }

  if (status === 'pending') {
    return { label: 'Waiting for approval', color: Colors.warning, locked: true };
  }

  if (status === 'rejected') {
    return { label: 'Not approved', color: Colors.error, locked: true };
  }

  return { label: 'Chat unlocked', color: Colors.success, locked: false };
};

const ChatActivityRow = React.memo(function ChatActivityRow({
  activity,
  index,
  currentUserId,
  joinedIds,
  getJoinStatus,
  onOpen,
  onDeleteRejected,
  onDeleteHosted,
  hasUnread,
  recentMeta,
}: ChatActivityRowProps) {
  const chipColor = CategoryColors[activity.category] ?? Colors.accent;
  const preview = getMockChatPreview(activity.id);
  const isHost = activity.hostId === currentUserId;
  const status = getJoinStatus(activity.id);
  const effectiveStatus: JoinRequestStatus | null =
    isHost ? null : status ?? (joinedIds.has(activity.id) ? 'approved' : null);
  const meta = statusMeta(effectiveStatus, isHost);
  const previewText = recentMeta?.previewText
    ? `${recentMeta.senderName}: ${recentMeta.previewText}`
    : preview
      ? `${preview.senderName}: ${preview.text}`
      : `${activity.participants.length} participants`;
  const timeText = recentMeta?.lastMessageAt
    ? new Date(recentMeta.lastMessageAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : '';

  const handleOpen = useCallback(() => {
    onOpen(activity.id, activity.hostId, effectiveStatus);
  }, [activity.hostId, activity.id, effectiveStatus, onOpen]);

  const handleDeleteRejected = useCallback(async () => {
    const removed = await onDeleteRejected(activity.id);
    if (!removed) {
      Alert.alert('Delete failed', 'Could not remove this rejected activity.');
    }
  }, [activity.id, onDeleteRejected]);

  const handleDeleteHosted = useCallback(() => {
    onDeleteHosted(activity.id);
  }, [activity.id, onDeleteHosted]);

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <View style={[styles.chatItem, Shadows.card]}>
        <TouchableOpacity
          style={styles.chatMainPress}
          onPress={handleOpen}
          activeOpacity={0.9}
        >
          <View style={[styles.chatIcon, { backgroundColor: chipColor + '20' }]}>
            <Ionicons
              name={meta.locked ? 'lock-closed' : 'chatbubble'}
              size={20}
              color={meta.locked ? Colors.slate : chipColor}
            />
          </View>
          <View style={styles.chatInfo}>
            <Text style={styles.chatTitle} numberOfLines={1}>
              {activity.title}
            </Text>
            <Text style={styles.chatSubtitle} numberOfLines={1}>
              {meta.locked ? meta.label : previewText}
            </Text>
            <View style={styles.statusRow}>
              <View style={[styles.statusPill, { backgroundColor: meta.color + '1A' }]}>
                <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
              </View>
              {hasUnread ? <View style={styles.unreadDot} /> : null}
              {timeText ? <Text style={styles.timeText}>{timeText}</Text> : null}
            </View>
          </View>
        </TouchableOpacity>

        {effectiveStatus === 'rejected' && !isHost ? (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDeleteRejected}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={18} color={Colors.error} />
          </TouchableOpacity>
        ) : isHost ? (
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={handleDeleteHosted}
            activeOpacity={0.8}
          >
            <Ionicons name="trash-outline" size={18} color={Colors.error} />
          </TouchableOpacity>
        ) : (
          <View style={styles.chevronWrap}>
            <Ionicons name="chevron-forward" size={18} color={Colors.slate} />
          </View>
        )}
      </View>
    </Animated.View>
  );
});

function mapActivityRow(row: any): Activity {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    location: {
      name: row.location_name,
      lat: row.location_lat,
      lng: row.location_lng,
    },
    dateTime: row.date_time,
    maxSlots: row.max_slots,
    currentSlots: row.current_slots ?? row.max_slots,
    participants: row.participant_ids ?? [],
    hostId: row.host_id,
    hostName: row.host_name ?? '',
    hostPhoto: row.host_photo ?? '',
    coverImage: row.cover_image ?? undefined,
    requiresApproval: row.requires_approval,
    reactions: {
      fire: row.reaction_fire ?? 0,
      heart: row.reaction_heart ?? 0,
      like: row.reaction_like ?? 0,
    },
    status: row.status,
    createdAt: row.created_at,
  };
}

export default function ChatListScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const {
    activities,
    isLoading,
    error,
    joinStatuses,
    getJoinStatus,
    canAccessChat,
    deleteRejectedJoin,
    deleteHostedActivity,
    refetch,
  } = useActivities();
  const user = useAuthStore((state) => state.user);
  const [supplementalActivities, setSupplementalActivities] = useState<Record<string, Activity>>({});
  const [recentChatMeta, setRecentChatMeta] = useState<Record<string, RecentChatMeta>>({});
  const [unreadChatIds, setUnreadChatIds] = useState<string[]>([]);
  const unreadHydratedRef = useRef(false);
  const listRef = useRef<FlatList<Activity>>(null);
  
  const joinedIds = useMemo(() => new Set(user?.activitiesJoined ?? []), [user?.activitiesJoined]);
  const unreadChatIdSet = useMemo(() => new Set(unreadChatIds), [unreadChatIds]);
  const activeChatId = useMemo(() => {
    if (!pathname.startsWith('/chat/')) return null;
    const maybeId = pathname.split('/')[2]?.trim();
    return maybeId || null;
  }, [pathname]);

  const chatActivityIds = useMemo(() => {
    const ids = new Set<string>();

    Object.keys(joinStatuses).forEach((id) => ids.add(id));
    joinedIds.forEach((id) => ids.add(id));
    activities
      .filter((activity) => activity.hostId === user?.uid)
      .forEach((activity) => ids.add(activity.id));

    return Array.from(ids);
  }, [activities, joinStatuses, joinedIds, user?.uid]);

  const upsertRecentMeta = useCallback((activityId: string, meta: RecentChatMeta) => {
    setRecentChatMeta((prev) => {
      const current = prev[activityId];
      if (current && current.lastMessageAt >= meta.lastMessageAt && current.previewText === meta.previewText) {
        return prev;
      }

      return { ...prev, [activityId]: meta };
    });
  }, []);

  useEffect(() => {
    const missingIds = chatActivityIds.filter(
      (activityId) => !activities.some((activity) => activity.id === activityId)
    );

    if (missingIds.length === 0) {
      setSupplementalActivities({});
      return;
    }

    let isActive = true;

    const fetchSupplementalActivities = async () => {
      const { data, error } = await supabase
        .from('activities_full')
        .select('*')
        .in('id', missingIds);

      if (error || !isActive) return;

      const byId: Record<string, Activity> = {};
      (data ?? []).forEach((row: any) => {
        const mapped = mapActivityRow(row);
        byId[mapped.id] = mapped;
      });

      if (isActive) {
        setSupplementalActivities(byId);
      }
    };

    void fetchSupplementalActivities();

    return () => {
      isActive = false;
    };
  }, [activities, chatActivityIds]);

  useEffect(() => {
    if (chatActivityIds.length === 0) {
      setRecentChatMeta({});
      return;
    }

    let isActive = true;

    const fetchLatestMessages = async () => {
      const { data, error } = await supabase
        .from('messages_full')
        .select('activity_id, sender_id, sender_name, text, type, created_at')
        .in('activity_id', chatActivityIds)
        .order('created_at', { ascending: false });

      if (error || !isActive) return;

      const fallbackSenderIds = Array.from(
        new Set(
          (data ?? [])
            .map((row: any) => row.sender_id)
            .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && normalizeSenderName((data ?? []).find((item: any) => item.sender_id === value)?.sender_name).length === 0)
        )
      );

      let senderNameMap: Record<string, string> = {};

      if (fallbackSenderIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', fallbackSenderIds);

        senderNameMap = (profiles ?? []).reduce((acc: Record<string, string>, profile: any) => {
          const displayName = normalizeSenderName(profile?.display_name);
          if (profile?.id && displayName) {
            acc[profile.id] = displayName;
          }
          return acc;
        }, {});
      }

      const next: Record<string, RecentChatMeta> = {};
      (data ?? []).forEach((row: any) => {
        if (next[row.activity_id]) return;
        const senderName =
          normalizeSenderName(row.sender_name) ||
          senderNameMap[row.sender_id] ||
          'Someone';
        next[row.activity_id] = {
          lastMessageAt: row.created_at,
          senderName,
          previewText: buildPreviewText(row),
          type: row.type,
        };
      });

      if (isActive) {
        setRecentChatMeta(next);
      }
    };

    void fetchLatestMessages();

    return () => {
      isActive = false;
    };
  }, [chatActivityIds]);

  useFocusEffect(
    useCallback(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: false });
      void refetch();

      let isActive = true;

      const hydrateUnreadChats = async () => {
        if (!user?.uid) {
          if (isActive) {
            setUnreadChatIds([]);
            unreadHydratedRef.current = true;
          }
          return;
        }

        const ids = await loadUnreadChatActivityIds(user.uid);
        if (isActive) {
          setUnreadChatIds(ids);
          unreadHydratedRef.current = true;
        }
      };

      void hydrateUnreadChats();

      return () => {
        isActive = false;
      };
    }, [user?.uid])
  );

  useEffect(() => {
    if (!user?.uid || !unreadHydratedRef.current) return;
    void saveUnreadChatActivityIds(user.uid, unreadChatIds);
  }, [unreadChatIds, user?.uid]);

  useEffect(() => {
    if (!user?.uid || chatActivityIds.length === 0) return;

    let isActive = true;
    const channel = supabase.channel(`chat-list-unread:${user.uid}`);

    chatActivityIds.forEach((activityId) => {
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `activity_id=eq.${activityId}`,
        },
        async (payload: any) => {
          if (!isActive) return;
          const isOwnMessage = payload?.new?.sender_id === user.uid;

          const { data } = await supabase
            .from('messages_full')
            .select('activity_id, sender_id, sender_name, text, type, created_at')
            .eq('id', payload?.new?.id)
            .single();

          if (!isActive || !data) return;

          let senderName = normalizeSenderName(data.sender_name);
          if (!senderName && data.sender_id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('display_name')
              .eq('id', data.sender_id)
              .maybeSingle();

            senderName = normalizeSenderName(profile?.display_name);
          }

          upsertRecentMeta(activityId, {
            lastMessageAt: data.created_at,
            senderName: senderName || 'Someone',
            previewText: buildPreviewText(data),
            type: data.type,
          });

          if (isOwnMessage) return;
          if (activeChatId === activityId) return;

          if (isActive) {
            setUnreadChatIds((prev) => (prev.includes(activityId) ? prev : [...prev, activityId]));
          }
        }
      );
    });

    void channel.subscribe();

    return () => {
      isActive = false;
      void supabase.removeChannel(channel);
    };
  }, [activeChatId, chatActivityIds, upsertRecentMeta, user?.uid]);

  const allChatActivities = useMemo(() => {
    const activityMap = new Map<string, Activity>();

    activities.forEach((activity) => {
      activityMap.set(activity.id, activity);
    });

    Object.values(supplementalActivities).forEach((activity) => {
      if (!activityMap.has(activity.id)) {
        activityMap.set(activity.id, activity);
      }
    });

    return Array.from(activityMap.values());
  }, [activities, supplementalActivities]);

  const chatActivities = useMemo(
    () =>
      allChatActivities
        .filter((activity) => {
          const status = getJoinStatus(activity.id);
          const isHost = activity.hostId === user?.uid;
          return Boolean(status) || isHost || joinedIds.has(activity.id);
        })
        .sort((left, right) => {
          const leftTime = recentChatMeta[left.id]?.lastMessageAt ?? left.dateTime;
          const rightTime = recentChatMeta[right.id]?.lastMessageAt ?? right.dateTime;
          return new Date(rightTime).getTime() - new Date(leftTime).getTime();
        }),
    [allChatActivities, getJoinStatus, joinedIds, recentChatMeta, user?.uid]
  );

  const openChatOrShowLock = useCallback((activityId: string, hostId: string | undefined, effectiveStatus: JoinRequestStatus | null) => {
    if (canAccessChat(activityId, hostId)) {
      if (user?.uid) {
        void clearChatActivityUnread(user.uid, activityId).then((next) => {
          setUnreadChatIds(next);
        });
      }
      router.push(`/chat/${activityId}`);
      return;
    }

    Alert.alert(
      'Chat locked',
      effectiveStatus === 'rejected'
        ? 'Your join request was not approved for this activity.'
        : 'Your join request is still pending approval.'
    );
  }, [canAccessChat, router, user?.uid]);

  const removeFromSupplemental = useCallback((activityId: string) => {
    setSupplementalActivities((prev) => {
      if (!prev[activityId]) return prev;
      const next = { ...prev };
      delete next[activityId];
      return next;
    });
  }, []);

  const executeHostedDelete = useCallback(async (activityId: string) => {
    const deleted = await deleteHostedActivity(activityId);
    if (!deleted) {
      Alert.alert('Delete failed', 'Could not delete this hosted event.');
      return;
    }

    removeFromSupplemental(activityId);
    Alert.alert('Deleted', 'Hosted event deleted successfully.');
  }, [deleteHostedActivity, removeFromSupplemental]);

  const confirmHostedDelete = useCallback((activityId: string) => {
    if (Platform.OS === 'web') {
      const confirmed = typeof globalThis.confirm === 'function'
        ? globalThis.confirm('Delete this hosted event permanently for everyone?')
        : true;

      if (!confirmed) return;
      void executeHostedDelete(activityId);
      return;
    }

    Alert.alert(
      'Delete hosted event',
      'This will permanently delete the event and its chat for everyone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void executeHostedDelete(activityId);
          },
        },
      ]
    );
  }, [executeHostedDelete]);

  const renderChatActivity = useCallback(
    ({ item, index }: { item: Activity; index: number }) => (
      <ChatActivityRow
        activity={item}
        index={index}
        currentUserId={user?.uid}
        joinedIds={joinedIds}
        getJoinStatus={getJoinStatus}
        onOpen={openChatOrShowLock}
        onDeleteRejected={deleteRejectedJoin}
        onDeleteHosted={confirmHostedDelete}
        hasUnread={unreadChatIdSet.has(item.id)}
        recentMeta={recentChatMeta[item.id] ?? null}
      />
    ),
    [confirmHostedDelete, deleteRejectedJoin, getJoinStatus, joinedIds, openChatOrShowLock, recentChatMeta, unreadChatIdSet, user?.uid]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.heading}>Chats</Text>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : error && chatActivities.length === 0 ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Could not load chats"
          message={error}
          actionLabel="Try again"
          onAction={() => {
            void refetch();
          }}
        />
      ) : chatActivities.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title="No chats yet"
          message="Join an activity to start chatting with other participants."
        />
    ) : (
        <FlatList
          ref={listRef}
          data={chatActivities}
          keyExtractor={(item) => item.id}
          renderItem={renderChatActivity}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + Spacing.xl * 3 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  heading: {
    fontFamily: Typography.display,
    fontSize: 28,
    color: Colors.text,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.card,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  chatMainPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  chatIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  chatInfo: {
    flex: 1,
  },
  chatTitle: {
    fontFamily: Typography.bodyBold,
    fontSize: 16,
    color: Colors.text,
  },
  chatSubtitle: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: Colors.slate,
    marginTop: 2,
  },
  statusPill: {
    alignSelf: 'flex-start',
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
  },
  timeText: {
    fontFamily: Typography.bodyMed,
    fontSize: 11,
    color: Colors.slate,
  },
  statusText: {
    fontFamily: Typography.bodyMed,
    fontSize: 11,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.error,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.error + '14',
  },
  chevronWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
