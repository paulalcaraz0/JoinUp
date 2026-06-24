import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors, Typography, Spacing, BorderRadius, Shadows, CategoryColors } from '../../constants/theme';
import { useActivities } from '../../hooks/useActivities';
import { EmptyState } from '../../components/ui/EmptyState';
import { useAuthStore } from '../../store/authStore';
import { getMockChatPreview } from '../../lib/mockChats';
import { supabase } from '../../lib/supabase';
import type { Activity, JoinRequestStatus } from '../../types';

type ChatActivityRowProps = {
  activity: Activity;
  index: number;
  currentUserId?: string;
  joinedIds: Set<string>;
  getJoinStatus: (activityId: string) => JoinRequestStatus | null;
  onOpen: (activityId: string, hostId: string | undefined, effectiveStatus: JoinRequestStatus | null) => void;
  onDeleteRejected: (activityId: string) => Promise<boolean>;
  onDeleteHosted: (activityId: string) => void;
};

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
}: ChatActivityRowProps) {
  const chipColor = CategoryColors[activity.category] ?? Colors.accent;
  const preview = getMockChatPreview(activity.id);
  const isHost = activity.hostId === currentUserId;
  const status = getJoinStatus(activity.id);
  const effectiveStatus: JoinRequestStatus | null =
    isHost ? null : status ?? (joinedIds.has(activity.id) ? 'approved' : null);
  const meta = statusMeta(effectiveStatus, isHost);

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
              {meta.locked
                ? meta.label
                : preview
                  ? `${preview.senderName}: ${preview.text}`
                  : `${activity.participants.length} participants`}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: meta.color + '1A' }]}>
              <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
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
  
  const joinedIds = useMemo(() => new Set(user?.activitiesJoined ?? []), [user?.activitiesJoined]);

  const chatActivityIds = useMemo(() => {
    const ids = new Set<string>();

    Object.keys(joinStatuses).forEach((id) => ids.add(id));
    joinedIds.forEach((id) => ids.add(id));
    activities
      .filter((activity) => activity.hostId === user?.uid)
      .forEach((activity) => ids.add(activity.id));

    return Array.from(ids);
  }, [activities, joinStatuses, joinedIds, user?.uid]);

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
        .sort((left, right) => new Date(right.dateTime).getTime() - new Date(left.dateTime).getTime()),
    [allChatActivities, getJoinStatus, joinedIds, user?.uid]
  );

  const openChatOrShowLock = useCallback((activityId: string, hostId: string | undefined, effectiveStatus: JoinRequestStatus | null) => {
    if (canAccessChat(activityId, hostId)) {
      router.push(`/chat/${activityId}`);
      return;
    }

    Alert.alert(
      'Chat locked',
      effectiveStatus === 'rejected'
        ? 'Your join request was not approved for this activity.'
        : 'Your join request is still pending approval.'
    );
  }, [canAccessChat, router]);

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
      />
    ),
    [confirmHostedDelete, deleteRejectedJoin, getJoinStatus, joinedIds, openChatOrShowLock, user?.uid]
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
          data={chatActivities}
          keyExtractor={(item) => item.id}
          renderItem={renderChatActivity}
          contentContainerStyle={styles.listContent}
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
    marginTop: 6,
  },
  statusText: {
    fontFamily: Typography.bodyMed,
    fontSize: 11,
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
