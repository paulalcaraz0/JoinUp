import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../constants/theme';
import { ScreenWrapper } from '../components/layout/ScreenWrapper';
import { NavBar } from '../components/layout/NavBar';
import { EmptyState } from '../components/ui/EmptyState';
import type { ListRenderItemInfo } from 'react-native';
import type { Notification } from '../types';
import { supabase } from '../lib/supabase';
import { mapNotification } from '../lib/mappers/notification';
import { notificationService } from '../lib/api/notificationService';
import { useAuthStore } from '../store/authStore';

const ICON_MAP: Record<string, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  join: { name: 'person-add', color: Colors.success },
  chat: { name: 'chatbubble', color: Colors.accent },
  reminder: { name: 'alarm', color: '#F59E0B' },
  update: { name: 'create', color: Colors.primary },
  approval: { name: 'shield-checkmark', color: Colors.warning },
};

type NotificationRowProps = {
  item: Notification;
  index: number;
  onPress: (notification: Notification) => void;
  onDelete: (notification: Notification) => void;
  isDeleting: boolean;
};

const NotificationRow = React.memo(function NotificationRow({
  item,
  index,
  onPress,
  onDelete,
  isDeleting,
}: NotificationRowProps) {
  const icon = ICON_MAP[item.type] ?? { name: 'notifications' as keyof typeof Ionicons.glyphMap, color: Colors.slate };
  const showActorAvatar = item.type === 'join' && Boolean(item.actorId);
  const actorInitial = (item.actorName || 'U').trim().charAt(0).toUpperCase();
  const bodyText = item.type === 'join' && item.actorName
    ? `${item.actorName} wants to join this activity.`
    : item.body;
  const timeAgo = item.createdAt
    ? formatDistanceToNow(parseISO(item.createdAt), { addSuffix: true })
    : '';

  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);

  const handleDelete = useCallback(() => {
    onDelete(item);
  }, [item, onDelete]);

  const row = (
      <TouchableOpacity
        style={[styles.notifRow, !item.read && styles.notifRowUnread, isDeleting && styles.notifRowDeleting]}
        onPress={handlePress}
        activeOpacity={0.7}
        disabled={isDeleting}
      >
        {showActorAvatar ? (
          item.actorPhoto ? (
            <Image source={{ uri: item.actorPhoto }} style={styles.actorPhoto} resizeMode="cover" />
          ) : (
            <View style={styles.actorFallback}>
              <Text style={styles.actorInitial}>{actorInitial}</Text>
            </View>
          )
        ) : (
          <View style={[styles.iconCircle, { backgroundColor: icon.color + '18' }]}>
            <Ionicons name={icon.name} size={20} color={icon.color} />
          </View>
        )}
        <View style={styles.notifContent}>
          <Text style={styles.notifTitle}>{item.title}</Text>
          <Text style={styles.notifBody} numberOfLines={2}>
            {bodyText}
          </Text>
          <Text style={styles.notifTime}>{timeAgo}</Text>
        </View>
        {!item.read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
  );

  const renderRightActions = () => (
    <View style={styles.deleteActionWrap}>
      <TouchableOpacity
        style={styles.deleteAction}
        onPress={handleDelete}
        activeOpacity={0.82}
        disabled={isDeleting}
      >
        <Ionicons name="trash-outline" size={21} color={Colors.white} />
        <Text style={styles.deleteActionText}>{isDeleting ? 'Deleting' : 'Delete'}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <Swipeable
        renderRightActions={renderRightActions}
        overshootRight={false}
        rightThreshold={42}
        friction={2}
      >
        {row}
      </Swipeable>
    </Animated.View>
  );
});

export default function NotificationsScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [undoNotification, setUndoNotification] = useState<Notification | null>(null);
  const deleteTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fetchNotifications = useCallback(async () => {
    if (!user?.uid) {
      setNotifications([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      setNotifications(await notificationService.listForUser(user.uid));
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load notifications.');
    }

    setIsLoading(false);
  }, [user?.uid]);

  useEffect(() => {
    setIsLoading(true);
    void fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!user?.uid) return;

    const channel = supabase
      .channel(`notifications:${user.uid}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.uid}`,
        },
        (payload: any) => {
          if (payload.eventType === 'INSERT' && payload.new) {
            if (payload.new.type === 'join') {
              void fetchNotifications();
              return;
            }

            setNotifications((prev) => {
              const incoming = mapNotification(payload.new);
              if (prev.some((item) => item.id === incoming.id)) {
                return prev;
              }
              return [incoming, ...prev];
            });
            return;
          }

          if (payload.eventType === 'UPDATE' && payload.new) {
            setNotifications((prev) =>
              prev.map((item) =>
                item.id === payload.new.id ? mapNotification(payload.new) : item
              )
            );
            return;
          }

          if (payload.eventType === 'DELETE' && payload.old?.id) {
            setNotifications((prev) => prev.filter((item) => item.id !== payload.old.id));
            return;
          }

          void fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchNotifications, user?.uid]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  const handleMarkAllRead = useCallback(() => {
    if (!user?.uid || notifications.length === 0) return;

    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    void notificationService.markAllRead(user.uid);
  }, [notifications.length, user?.uid]);

  const handleNotificationPress = useCallback(async (notif: Notification) => {
    if (!notif.read) {
      try {
        await notificationService.markRead(notif.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
        );
      } catch {
        // Keep existing navigation behavior even if the read write fails.
      }
    }

    // Navigate to activity
    if (notif.activityId) {
      router.push(`/activity/${notif.activityId}`);
    }
  }, [router]);

  const handleDeleteNotification = useCallback((notif: Notification) => {
    if (deletingIds.includes(notif.id)) return;

    setDeletingIds((prev) => [...prev, notif.id]);
    setNotifications((prev) => prev.filter((item) => item.id !== notif.id));
    setUndoNotification(notif);

    if (deleteTimersRef.current[notif.id]) {
      clearTimeout(deleteTimersRef.current[notif.id]);
    }

    deleteTimersRef.current[notif.id] = setTimeout(() => {
      void notificationService.delete(notif.id).catch((err: unknown) => {
        setNotifications((prev) => {
          if (prev.some((item) => item.id === notif.id)) return prev;
          return [notif, ...prev].sort(
            (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
          );
        });

        const message = err instanceof Error ? err.message : 'Could not delete this notification.';
        Alert.alert('Delete failed', message);
      }).finally(() => {
        delete deleteTimersRef.current[notif.id];
        setDeletingIds((prev) => prev.filter((id) => id !== notif.id));
        setUndoNotification((current) => current?.id === notif.id ? null : current);
      });
    }, 4500);
  }, [deletingIds]);

  const handleUndoDelete = useCallback(() => {
    if (!undoNotification) return;

    const restored = undoNotification;
    if (deleteTimersRef.current[restored.id]) {
      clearTimeout(deleteTimersRef.current[restored.id]);
      delete deleteTimersRef.current[restored.id];
    }

    setDeletingIds((prev) => prev.filter((id) => id !== restored.id));
    setNotifications((prev) => {
      if (prev.some((item) => item.id === restored.id)) return prev;
      return [restored, ...prev].sort(
        (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      );
    });
    setUndoNotification(null);
  }, [undoNotification]);

  const renderNotification = useCallback(
    ({ item, index }: ListRenderItemInfo<Notification>) => (
      <NotificationRow
        item={item}
        index={index}
        onPress={handleNotificationPress}
        onDelete={handleDeleteNotification}
        isDeleting={deletingIds.includes(item.id)}
      />
    ),
    [deletingIds, handleDeleteNotification, handleNotificationPress]
  );

  const renderSeparator = useCallback(() => <View style={styles.separator} />, []);

  return (
    <ScreenWrapper>
      <NavBar
        title="Notifications"
        showBack
        rightAction={
          unreadCount > 0 ? (
            <TouchableOpacity onPress={handleMarkAllRead}>
              <Text style={styles.markRead}>Mark all read</Text>
            </TouchableOpacity>
          ) : undefined
        }
      />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      ) : error && notifications.length === 0 ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Could not load notifications"
          message={error}
          actionLabel="Try again"
          onAction={() => {
            setIsLoading(true);
            void fetchNotifications();
          }}
        />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon="notifications-off-outline"
          title="No notifications"
          message="You're all caught up! Check back later."
          actionLabel="Refresh"
          onAction={() => {
            setIsLoading(true);
            void fetchNotifications();
          }}
        />
      ) : (
        <>
          <FlatList
            data={notifications}
            keyExtractor={(item) => item.id}
            renderItem={renderNotification}
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            windowSize={7}
            removeClippedSubviews
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={renderSeparator}
          />
          {undoNotification ? (
            <View style={styles.undoBar}>
              <Text style={styles.undoText} numberOfLines={1}>Notification deleted</Text>
              <TouchableOpacity onPress={handleUndoDelete} style={styles.undoBtn}>
                <Text style={styles.undoBtnText}>Undo</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      )}
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: Spacing.md,
    borderRadius: BorderRadius.card,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
    ...Shadows.hairline,
  },
  notifRowUnread: {
    backgroundColor: Colors.accentSoft,
    borderColor: Colors.accent + '24',
  },
  notifRowDeleting: {
    opacity: 0.55,
  },
  deleteActionWrap: {
    width: 92,
    marginLeft: Spacing.sm,
    justifyContent: 'center',
  },
  deleteAction: {
    flex: 1,
    minHeight: 74,
    borderRadius: BorderRadius.card,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  deleteActionText: {
    fontFamily: Typography.bodyBold,
    fontSize: 12,
    color: Colors.white,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actorPhoto: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.divider,
  },
  actorFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  actorInitial: {
    fontFamily: Typography.bodyBold,
    fontSize: 15,
    color: Colors.white,
  },
  notifContent: {
    flex: 1,
    marginLeft: Spacing.sm,
  },
  notifTitle: {
    fontFamily: Typography.bodyBold,
    fontSize: 15,
    color: Colors.text,
  },
  notifBody: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 20,
  },
  notifTime: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.slate,
    marginTop: 4,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent,
    marginTop: 6,
    marginLeft: Spacing.sm,
  },
  separator: {
    height: Spacing.sm,
  },
  markRead: {
    fontFamily: Typography.bodyMed,
    fontSize: 14,
    color: Colors.accent,
  },
  undoBar: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    borderRadius: BorderRadius.card,
    backgroundColor: Colors.text,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  undoText: {
    flex: 1,
    fontFamily: Typography.bodyMed,
    fontSize: 14,
    color: Colors.white,
  },
  undoBtn: {
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
  },
  undoBtnText: {
    fontFamily: Typography.bodyBold,
    fontSize: 13,
    color: Colors.text,
  },
});
