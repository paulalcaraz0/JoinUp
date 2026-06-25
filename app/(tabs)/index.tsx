import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TextInput,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOutUp, LinearTransition, SlideOutLeft } from 'react-native-reanimated';
import { Colors, Typography, Spacing, BorderRadius, Categories, Shadows } from '../../constants/theme';
import { ActivityCard } from '../../components/ui/ActivityCard';
import { CategoryChip } from '../../components/ui/CategoryChip';
import { EmptyState } from '../../components/ui/EmptyState';
import { NotificationBadge } from '../../components/ui/NotificationBadge';
import { useActivities } from '../../hooks/useActivities';
import { useAuthStore } from '../../store/authStore';
import { notificationService } from '../../lib/api/notificationService';
import { supabase } from '../../lib/supabase';
import type { Activity } from '../../types';

type FeedActivityRowProps = {
  activity: Activity;
  index: number;
  isLeaving: boolean;
  userId?: string;
  onOpen: (activityId: string) => void;
  onJoin: (activityId: string, userId: string) => Promise<boolean>;
};

type DiscoveryFilter = 'All' | 'Today' | 'This Weekend' | 'Popular';

const DiscoveryFilters: DiscoveryFilter[] = ['All', 'Today', 'This Weekend', 'Popular'];

function isToday(dateTime: string, now: Date) {
  const date = new Date(dateTime);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isThisWeekend(dateTime: string, now: Date) {
  const date = new Date(dateTime);
  const today = now.getDay();
  const saturday = new Date(now);
  saturday.setHours(0, 0, 0, 0);

  if (today === 0) {
    saturday.setDate(now.getDate() - 1);
  } else {
    saturday.setDate(now.getDate() + ((6 - today + 7) % 7));
  }

  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);
  sunday.setHours(23, 59, 59, 999);

  return date >= saturday && date <= sunday;
}

function joinedCount(activity: Activity) {
  return Math.max(0, activity.maxSlots - activity.currentSlots);
}

function applyDiscoveryFilter(items: Activity[], filter: DiscoveryFilter, now: Date) {
  if (filter === 'Today') {
    return items.filter((activity) => isToday(activity.dateTime, now));
  }

  if (filter === 'This Weekend') {
    return items.filter((activity) => isThisWeekend(activity.dateTime, now));
  }

  if (filter === 'Popular') {
    return [...items].sort((left, right) => joinedCount(right) - joinedCount(left));
  }

  return items;
}

const FeedActivityRow = React.memo(function FeedActivityRow({
  activity,
  index,
  isLeaving,
  userId,
  onOpen,
  onJoin,
}: FeedActivityRowProps) {
  const handlePress = useCallback(() => {
    onOpen(activity.id);
  }, [activity.id, onOpen]);

  const handleJoin = useCallback(async () => {
    if (!userId || isLeaving) return;
    await onJoin(activity.id, userId);
  }, [activity.id, isLeaving, onJoin, userId]);

  return (
    <Animated.View exiting={SlideOutLeft.duration(220)}>
      <ActivityCard
        activity={activity}
        index={index}
        isLeaving={isLeaving}
        onPress={handlePress}
        onJoin={handleJoin}
      />
    </Animated.View>
  );
});

export default function HomeFeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activities, isLoading, error, joinActivity, joinedActivityIds, refetch } = useActivities();
  const user = useAuthStore((s) => s.user);

  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedDiscoveryFilter, setSelectedDiscoveryFilter] = useState<DiscoveryFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [fadingActivityIds, setFadingActivityIds] = useState<string[]>([]);
  const [showGreetingCard, setShowGreetingCard] = useState(true);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const lastScrollYRef = useRef(0);
  const showGreetingCardRef = useRef(true);
  const fadingActivityIdsRef = useRef<string[]>([]);

  useEffect(() => {
    fadingActivityIdsRef.current = fadingActivityIds;
  }, [fadingActivityIds]);

  useEffect(() => {
    showGreetingCardRef.current = showGreetingCard;
  }, [showGreetingCard]);

  useEffect(() => {
    setAvatarLoadFailed(false);
  }, [user?.photoURL]);

  const avatarInitial = (user?.displayName || 'U').trim().charAt(0).toUpperCase();

  const filteredActivities = useMemo(() => {
    let filtered = activities;
    if (selectedCategory !== 'All') {
      filtered = filtered.filter((a) => a.category === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.location.name.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q)
      );
    }

    if (joinedActivityIds.length) {
      const joinedIds = new Set(joinedActivityIds);
      filtered = filtered.filter(
        (activity) => !joinedIds.has(activity.id) || fadingActivityIds.includes(activity.id)
      );
    }

    return applyDiscoveryFilter(filtered, selectedDiscoveryFilter, new Date());
  }, [activities, fadingActivityIds, joinedActivityIds, searchQuery, selectedCategory, selectedDiscoveryFilter]);

  const fetchUnreadNotificationCount = useCallback(async () => {
    if (!user?.uid) {
      setUnreadNotificationCount(0);
      return;
    }

    try {
      setUnreadNotificationCount(await notificationService.countUnreadForUser(user.uid));
    } catch {
      // Badge count is best-effort; avoid blocking the feed on notification errors.
    }
  }, [user?.uid]);

  useEffect(() => {
    void fetchUnreadNotificationCount();
  }, [fetchUnreadNotificationCount]);

  useFocusEffect(
    useCallback(() => {
      void fetchUnreadNotificationCount();
    }, [fetchUnreadNotificationCount])
  );

  useEffect(() => {
    if (!user?.uid) return;

    const channel = supabase
      .channel(`home-notifications:${user.uid}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.uid}`,
        },
        () => {
          void fetchUnreadNotificationCount();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchUnreadNotificationCount, user?.uid]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 19) return 'Good afternoon';
    return 'Good evening';
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleFeedScroll = useCallback((event: any) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const previousY = lastScrollYRef.current;
    const scrollingDown = currentY > previousY + 6;
    const scrollingUp = currentY < previousY - 8;
    const shouldHideGreeting = currentY > 36 && scrollingDown;
    const shouldShowGreeting = currentY < 18 && scrollingUp;

    if (shouldHideGreeting && showGreetingCardRef.current) {
      setShowGreetingCard(false);
    }

    if (shouldShowGreeting && !showGreetingCardRef.current) {
      setShowGreetingCard(true);
    }

    lastScrollYRef.current = Math.max(0, currentY);
  }, []);

  const handleOpenActivity = useCallback((activityId: string) => {
    router.push(`/activity/${activityId}`);
  }, [router]);

  const handleJoinActivity = useCallback(async (activityId: string, userId: string) => {
    if (fadingActivityIdsRef.current.includes(activityId)) return false;

    setFadingActivityIds((prev) => [...prev, activityId]);
    const joined = await joinActivity(activityId, userId);

    if (!joined) {
      setFadingActivityIds((prev) => prev.filter((id) => id !== activityId));
      return false;
    }

    setTimeout(() => {
      setFadingActivityIds((prev) => prev.filter((id) => id !== activityId));
    }, 220);

    return true;
  }, [joinActivity]);

  const renderActivity = useCallback(
    ({ item, index }: { item: Activity; index: number }) => (
      <FeedActivityRow
        activity={item}
        index={index}
        isLeaving={fadingActivityIds.includes(item.id)}
        userId={user?.uid}
        onOpen={handleOpenActivity}
        onJoin={handleJoinActivity}
      />
    ),
    [fadingActivityIds, handleJoinActivity, handleOpenActivity, user?.uid]
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.logo}>JoinUp</Text>
          <Text style={styles.headerCaption}>Curated activities near you</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => router.push('/notifications')}
          >
            <Ionicons name="notifications-outline" size={24} color={Colors.primary} />
            <NotificationBadge count={unreadNotificationCount} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.avatar} onPress={() => router.push('/(tabs)/profile')}>
            {user?.photoURL && !avatarLoadFailed ? (
              <Image
                source={{ uri: user.photoURL }}
                style={styles.avatarImage}
                resizeMode="cover"
                onError={() => setAvatarLoadFailed(true)}
              />
            ) : (
              <Text style={styles.avatarInitial}>{avatarInitial}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Greeting card moved into the FlatList header so it scrolls with activities.
      <Animated.View
        style={[styles.greetingContainer, Shadows.card]}
      >
        <View style={styles.greetingTopRow}>
          <View style={styles.greetingIcon}>
            <Ionicons name="sparkles" size={18} color={Colors.accent} />
          </View>
          <Text style={styles.greetingKicker}>Today</Text>
        </View>
        <Text style={styles.greeting}>
          {getGreeting()}, {user?.displayName?.split(' ')[0] ?? 'there'} 👋
        </Text>
        <Text style={styles.greetingBody}>
          Find a group that fits your mood, schedule, and city.
        </Text>
      </Animated.View>
      */}
      <ScrollView
        horizontal
        style={styles.chipsScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContainer}
      >
        {Categories.map((cat) => (
          <CategoryChip
            key={cat}
            label={cat}
            selected={selectedCategory === cat}
            onPress={() => setSelectedCategory(cat)}
            size="sm"
          />
        ))}
      </ScrollView>

      {showGreetingCard ? (
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOutUp.duration(180)}
          layout={LinearTransition.duration(180)}
          style={[styles.greetingContainer, Shadows.card]}
        >
          <View style={styles.greetingTopRow}>
            <View style={styles.greetingIcon}>
              <Ionicons name="sparkles" size={18} color={Colors.accent} />
            </View>
            <View style={styles.greetingTextBlock}>
              <Text style={styles.greetingKicker}>Today</Text>
              <Text style={styles.greeting}>
                {getGreeting()}, {user?.displayName?.split(' ')[0] ?? 'there'}
              </Text>
            </View>
          </View>
          <Text style={styles.greetingBody}>
            Find something nearby today
          </Text>
        </Animated.View>
      ) : null}

      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={18} color={Colors.slate} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search activities..."
          placeholderTextColor={Colors.slate}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <ScrollView
        horizontal
        style={styles.quickFilterScroll}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quickFilterContainer}
      >
        {DiscoveryFilters.map((filter) => (
          <CategoryChip
            key={filter}
            label={filter}
            selected={selectedDiscoveryFilter === filter}
            onPress={() => setSelectedDiscoveryFilter(filter)}
            size="sm"
          />
        ))}
      </ScrollView>

      {/* Activity Feed */}
      <View style={styles.feedContainer}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.accent} />
          </View>
        ) : error && activities.length === 0 ? (
          <EmptyState
            icon="alert-circle-outline"
            title="Could not load activities"
            message={error}
            actionLabel="Try again"
            onAction={() => {
              void refetch();
            }}
          />
        ) : filteredActivities.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="No activities found"
            message="Try changing your filters or check back later for new activities."
            actionLabel="Refresh"
            onAction={() => {
              void refetch();
            }}
          />
        ) : (
          <FlatList
            style={styles.feedList}
            data={filteredActivities}
            keyExtractor={(item) => item.id}
            renderItem={renderActivity}
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            windowSize={5}
            removeClippedSubviews
            contentContainerStyle={[
              styles.feedContent,
              { paddingBottom: insets.bottom + Spacing.xl * 3 },
            ]}
            showsVerticalScrollIndicator={false}
            onScroll={handleFeedScroll}
            scrollEventThrottle={16}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={Colors.accent}
              />
            }
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  logo: {
    fontSize: 27,
    fontFamily: Typography.display,
    color: Colors.primary,
  },
  headerCaption: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.slate,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitial: {
    fontFamily: Typography.bodyBold,
    fontSize: 15,
    color: Colors.white,
  },
  greetingContainer: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    overflow: 'hidden',
  },
  greetingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  greetingIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greetingTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  greetingKicker: {
    fontFamily: Typography.bodyBold,
    fontSize: 11,
    color: Colors.white,
    opacity: 0.72,
  },
  greeting: {
    fontFamily: Typography.bodyBold,
    fontSize: 16,
    color: Colors.white,
    marginTop: 1,
  },
  greetingBody: {
    fontFamily: Typography.body,
    fontSize: 11,
    color: Colors.white,
    opacity: 0.68,
    marginTop: Spacing.xs,
    marginLeft: 42,
  },
  greetingCountPill: {
    minWidth: 34,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.white + '24',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  greetingCountText: {
    fontFamily: Typography.bodyBold,
    fontSize: 13,
    color: Colors.white,
  },
  chipsScroll: {
    maxHeight: 44,
  },
  chipsContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 2,
    paddingBottom: 4,
    alignItems: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.input,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.divider,
    zIndex: 2,
    ...Shadows.soft,
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.text,
    marginLeft: Spacing.sm,
    paddingVertical: 0,
  },
  quickFilterScroll: {
    maxHeight: 38,
    marginBottom: Spacing.sm,
  },
  quickFilterContainer: {
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedContainer: {
    flex: 1,
    position: 'relative',
    zIndex: 1,
  },
  feedList: {
    flex: 1,
  },
  feedContent: {
    paddingBottom: Spacing.xl,
  },
});
