import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Colors, Typography, Spacing } from '../constants/theme';
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
};

const NotificationRow = React.memo(function NotificationRow({
  item,
  index,
  onPress,
}: NotificationRowProps) {
  const icon = ICON_MAP[item.type] ?? { name: 'notifications' as keyof typeof Ionicons.glyphMap, color: Colors.slate };
  const timeAgo = item.createdAt
    ? formatDistanceToNow(parseISO(item.createdAt), { addSuffix: true })
    : '';

  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <TouchableOpacity
        style={[styles.notifRow, !item.read && styles.notifRowUnread]}
        onPress={handlePress}
        activeOpacity={0.7}
      >
        <View style={[styles.iconCircle, { backgroundColor: icon.color + '18' }]}>
          <Ionicons name={icon.name} size={20} color={icon.color} />
        </View>
        <View style={styles.notifContent}>
          <Text style={styles.notifTitle}>{item.title}</Text>
          <Text style={styles.notifBody} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={styles.notifTime}>{timeAgo}</Text>
        </View>
        {!item.read && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    </Animated.View>
  );
});

export default function NotificationsScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const renderNotification = useCallback(
    ({ item, index }: ListRenderItemInfo<Notification>) => (
      <NotificationRow item={item} index={index} onPress={handleNotificationPress} />
    ),
    [handleNotificationPress]
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
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          renderItem={renderNotification}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={renderSeparator}
        />
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
    paddingVertical: Spacing.sm,
  },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  notifRowUnread: {
    backgroundColor: Colors.accent + '08',
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
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
    height: 1,
    backgroundColor: Colors.divider,
    marginLeft: 42 + Spacing.md + Spacing.sm,
  },
  markRead: {
    fontFamily: Typography.bodyMed,
    fontSize: 14,
    color: Colors.accent,
  },
});
