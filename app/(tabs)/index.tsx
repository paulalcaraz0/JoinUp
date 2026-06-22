import React, { useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOutUp, LinearTransition, SlideOutLeft } from 'react-native-reanimated';
import { Colors, Typography, Spacing, BorderRadius, Categories, Shadows } from '../../constants/theme';
import { ActivityCard } from '../../components/ui/ActivityCard';
import { CategoryChip } from '../../components/ui/CategoryChip';
import { EmptyState } from '../../components/ui/EmptyState';
import { useActivities } from '../../hooks/useActivities';
import { useAuthStore } from '../../store/authStore';

export default function HomeFeedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activities, isLoading, joinActivity, joinedActivityIds, refetch } = useActivities();
  const user = useAuthStore((s) => s.user);

  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [fadingActivityIds, setFadingActivityIds] = useState<string[]>([]);
  const [showGreetingCard, setShowGreetingCard] = useState(true);
  const lastScrollYRef = useRef(0);

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
          a.location.name.toLowerCase().includes(q)
      );
    }

    if (joinedActivityIds.length) {
      const joinedIds = new Set(joinedActivityIds);
      filtered = filtered.filter(
        (activity) => !joinedIds.has(activity.id) || fadingActivityIds.includes(activity.id)
      );
    }

    return filtered;
  }, [activities, fadingActivityIds, joinedActivityIds, searchQuery, selectedCategory]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 19) return 'Good afternoon';
    return 'Good evening';
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleFeedScroll = (event: any) => {
    const currentY = event.nativeEvent.contentOffset.y;
    const previousY = lastScrollYRef.current;
    const scrollingDown = currentY > previousY + 6;
    const scrollingUp = currentY < previousY - 8;

    if (currentY > 36 && scrollingDown) {
      setShowGreetingCard(false);
    }

    if (currentY < 18 || scrollingUp) {
      setShowGreetingCard(true);
    }

    lastScrollYRef.current = Math.max(0, currentY);
  };

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
          </TouchableOpacity>
          <TouchableOpacity style={styles.avatar} onPress={() => router.push('/(tabs)/profile')}>
            <Text style={styles.avatarInitial}>
              {(user?.displayName || 'U').trim().charAt(0).toUpperCase()}
            </Text>
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

      {/* Activity Feed */}
      <View style={styles.feedContainer}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.accent} />
          </View>
        ) : filteredActivities.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="No activities found"
            message="Try changing your filters or check back later for new activities."
          />
        ) : (
          <FlatList
            style={styles.feedList}
            data={filteredActivities}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <Animated.View exiting={SlideOutLeft.duration(220)}>
                <ActivityCard
                  activity={item}
                  index={index}
                  isLeaving={fadingActivityIds.includes(item.id)}
                  onPress={() => router.push(`/activity/${item.id}`)}
                  onJoin={async () => {
                    if (!user?.uid || fadingActivityIds.includes(item.id)) return;

                    setFadingActivityIds((prev) => [...prev, item.id]);
                    const joined = await joinActivity(item.id, user.uid);

                    if (!joined) {
                      setFadingActivityIds((prev) => prev.filter((activityId) => activityId !== item.id));
                      return;
                    }

                    setTimeout(() => {
                      setFadingActivityIds((prev) => prev.filter((activityId) => activityId !== item.id));
                    }, 220);
                  }}
                />
              </Animated.View>
            )}
            contentContainerStyle={[
              styles.feedContent,
              { paddingBottom: insets.bottom + Spacing.xl * 2 },
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
