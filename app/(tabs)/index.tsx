import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TextInput,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
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
import { ActivityCardSkeleton } from '../../components/ui/LoadingSkeleton';
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

  const isHost = Boolean(userId && activity.hostId === userId);

  return (
    <Animated.View exiting={SlideOutLeft.duration(220)}>
      <ActivityCard
        activity={activity}
        index={index}
        isLeaving={isLeaving}
        onPress={handlePress}
        onJoin={handleJoin}
        joinLabel={isHost ? 'Hosting' : undefined}
        joinDisabled={isHost}
      />
    </Animated.View>
  );
});

export default function HomeFeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activities, isLoading, error, joinActivity, joinStatuses, refetch } = useActivities();
  const user = useAuthStore((s) => s.user);

  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedDiscoveryFilter, setSelectedDiscoveryFilter] = useState<DiscoveryFilter>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [fadingActivityIds, setFadingActivityIds] = useState<string[]>([]);
  const [showGreetingCard, setShowGreetingCard] = useState(true);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
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
  const hasActiveFilters =
    selectedCategory !== 'All' ||
    selectedDiscoveryFilter !== 'All' ||
    searchQuery.trim().length > 0;

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

    const approvedActivityIds = Object.entries(joinStatuses)
      .filter(([, status]) => status === 'approved')
      .map(([activityId]) => activityId);

    if (approvedActivityIds.length) {
      const joinedIds = new Set(approvedActivityIds);
      filtered = filtered.filter(
        (activity) => !joinedIds.has(activity.id) || fadingActivityIds.includes(activity.id)
      );
    }

    return applyDiscoveryFilter(filtered, selectedDiscoveryFilter, new Date());
  }, [activities, fadingActivityIds, joinStatuses, searchQuery, selectedCategory, selectedDiscoveryFilter]);

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

  const handleOpenBuddy = useCallback(() => {
    router.push('/buddy');
  }, [router]);

  const clearFilters = useCallback(() => {
    setSelectedCategory('All');
    setSelectedDiscoveryFilter('All');
    setSearchQuery('');
  }, []);

  const handleJoinActivity = useCallback(async (activityId: string, userId: string) => {
    if (fadingActivityIdsRef.current.includes(activityId)) return false;

    setFadingActivityIds((prev) => [...prev, activityId]);
    const joined = await joinActivity(activityId, userId);

    if (!joined) {
      setFadingActivityIds((prev) => prev.filter((id) => id !== activityId));
      const activity = activities.find((item) => item.id === activityId);
      const currentStatus = joinStatuses[activityId];
      const message =
        currentStatus === 'pending'
          ? 'Your join request is already waiting for approval.'
          : currentStatus
            ? 'You already have an active join status for this activity.'
            : activity?.currentSlots === 0
              ? 'This activity is already full.'
              : error ?? 'Could not join this activity. Please try again.';
      Alert.alert('Could not join', message);
      return false;
    }

    setTimeout(() => {
      setFadingActivityIds((prev) => prev.filter((id) => id !== activityId));
    }, 220);

    return true;
  }, [activities, error, joinActivity, joinStatuses]);

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

      <View style={styles.headerControls}>
        <TouchableOpacity
          style={[
            styles.categoryFilterBtn,
            selectedCategory !== 'All' && styles.categoryFilterBtnActive,
          ]}
          onPress={() => setShowCategoryPicker((current) => !current)}
          activeOpacity={0.86}
        >
          <Ionicons
            name="options-outline"
            size={19}
            color={selectedCategory !== 'All' ? Colors.white : Colors.primary}
          />
          {selectedCategory !== 'All' ? (
            <Text style={styles.categoryFilterActiveText} numberOfLines={1}>
              {selectedCategory}
            </Text>
          ) : null}
        </TouchableOpacity>

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

      {showCategoryPicker ? (
        <Animated.View
          entering={FadeInDown.duration(160)}
          exiting={FadeOutUp.duration(120)}
          style={styles.categoryPicker}
        >
          {Categories.map((cat) => (
            <CategoryChip
              key={cat}
              label={cat}
              selected={selectedCategory === cat}
              onPress={() => {
                setSelectedCategory(cat);
                setShowCategoryPicker(false);
              }}
              size="sm"
            />
          ))}
        </Animated.View>
      ) : null}

      {/* Activity Feed */}
      <View style={styles.feedContainer}>
        {isLoading && activities.length === 0 ? (
          <View style={styles.skeletonList}>
            {[0, 1, 2].map((item) => (
              <ActivityCardSkeleton key={item} />
            ))}
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
            title={hasActiveFilters ? 'No matches found' : 'No activities yet'}
            message={
              hasActiveFilters
                ? 'Try clearing your filters or searching a different activity, category, or place.'
                : 'There are no active activities right now. Create one or check back soon.'
            }
            actionLabel={hasActiveFilters ? 'Clear filters' : 'Refresh'}
            onAction={hasActiveFilters ? clearFilters : () => {
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

      <TouchableOpacity
        style={[
          styles.buddyFloatingButton,
          { bottom: insets.bottom + Spacing.xl * 2 + 16 },
        ]}
        onPress={handleOpenBuddy}
        activeOpacity={0.88}
      >
        <Image
          source={require('../../assets/icon.png')}
          style={styles.buddyFloatingIcon}
          resizeMode="cover"
        />
      </TouchableOpacity>
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
    paddingBottom: Spacing.md,
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
    ...Shadows.hairline,
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
    marginTop: 0,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.card,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    overflow: 'hidden',
  },
  greetingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  greetingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    fontSize: 18,
    color: Colors.white,
    marginTop: 1,
  },
  greetingBody: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: Colors.white,
    opacity: 0.68,
    marginTop: Spacing.xs,
    marginLeft: 48,
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
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  categoryFilterBtn: {
    minWidth: 48,
    height: 48,
    borderRadius: BorderRadius.input,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 13,
    ...Shadows.soft,
  },
  categoryFilterBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
    maxWidth: 118,
  },
  categoryFilterActiveText: {
    fontFamily: Typography.bodyBold,
    fontSize: 12,
    color: Colors.white,
    flexShrink: 1,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: 13,
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
    maxHeight: 42,
    marginBottom: Spacing.md,
  },
  quickFilterContainer: {
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  categoryPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.sm,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  skeletonList: {
    paddingTop: Spacing.xs,
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
  buddyFloatingButton: {
    position: 'absolute',
    right: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    width: 58,
    height: 58,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    padding: 4,
    zIndex: 20,
    ...Shadows.fab,
  },
  buddyFloatingIcon: {
    width: '100%',
    height: '100%',
    borderRadius: BorderRadius.full,
  },
});
