import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Dimensions,
  Pressable,
  TextInput,
  Platform,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, BorderRadius, Shadows, CategoryColors } from '../../constants/theme';
import { NavBar } from '../../components/layout/NavBar';
import { CategoryChip } from '../../components/ui/CategoryChip';
import { EmptyState } from '../../components/ui/EmptyState';
import { useActivities } from '../../hooks/useActivities';
import { useUsers } from '../../hooks/useUsers';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { Activity, User } from '../../types';
import { format } from 'date-fns';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - Spacing.lg * 2;

type PlaceOption = {
  label: string;
  keywords: string[];
};

const PHILIPPINE_PLACES: PlaceOption[] = [
  { label: 'All Philippines', keywords: [] },
  { label: 'Batangas City', keywords: ['batangas city'] },
  { label: 'Manila', keywords: ['manila', 'intramuros', 'luneta', 'rizal park', 'binondo', 'escolta'] },
  { label: 'Makati', keywords: ['makati', 'poblacion', 'little tokyo'] },
  { label: 'Quezon City', keywords: ['quezon city', 'up diliman'] },
  { label: 'Taguig / BGC', keywords: ['taguig', 'bgc'] },
  { label: 'Paranaque', keywords: ['paranaque', 'baclaran'] },
  { label: 'Batangas (Province)', keywords: ['batangas', 'bauan', 'mt. maculot', 'taal'] },
];

type ViewMode = 'events' | 'users';
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

function joinedCount(activity: Pick<Activity, 'maxSlots' | 'currentSlots'>) {
  return Math.max(0, activity.maxSlots - activity.currentSlots);
}

function applyDiscoveryFilter<T extends { dateTime: string; maxSlots: number; currentSlots: number }>(
  items: T[],
  filter: DiscoveryFilter,
  now: Date
) {
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

export default function ExploreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useThemeColors();
  const {
    activities,
    isLoading: activitiesLoading,
    error: activitiesError,
    refetch: refetchActivities,
  } = useActivities();
  const {
    users,
    isLoading: usersLoading,
    error: usersError,
    refetch: refetchUsers,
  } = useUsers();
  const [viewMode, setViewMode] = useState<ViewMode>('events');
  const [showPlaceDropdown, setShowPlaceDropdown] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState('All Philippines');
  const [selectedDiscoveryFilter, setSelectedDiscoveryFilter] = useState<DiscoveryFilter>('All');
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [showEventDiscovery, setShowEventDiscovery] = useState(true);
  const [showPeopleDiscovery, setShowPeopleDiscovery] = useState(true);
  const lastEventScrollY = useRef(0);
  const lastPeopleScrollY = useRef(0);

  const selectedPlaceOption = useMemo(
    () => PHILIPPINE_PLACES.find((place) => place.label === selectedPlace) ?? PHILIPPINE_PLACES[0],
    [selectedPlace]
  );

  const filteredActivities = useMemo(() => {
    const byPlace =
      selectedPlaceOption.label === 'All Philippines'
        ? activities
        : activities.filter((activity) => {
            const haystack = `${activity.location.name} ${activity.title}`.toLowerCase();
            return selectedPlaceOption.keywords.some((keyword) => haystack.includes(keyword));
          });

    let bySearch = byPlace;

    if (eventSearchQuery.trim()) {
      const query = eventSearchQuery.toLowerCase();
      bySearch = byPlace.filter((activity) => {
        const titleMatch = activity.title.toLowerCase().includes(query);
        const locationMatch = activity.location.name.toLowerCase().includes(query);
        const categoryMatch = activity.category.toLowerCase().includes(query);
        return titleMatch || locationMatch || categoryMatch;
      });
    }

    return applyDiscoveryFilter(bySearch, selectedDiscoveryFilter, new Date());
  }, [activities, eventSearchQuery, selectedDiscoveryFilter, selectedPlaceOption]);

  const filteredUsers = useMemo(() => {
    if (!userSearchQuery.trim()) {
      return users;
    }

    const query = userSearchQuery.toLowerCase();
    return users.filter((user) => {
      const nameMatch = user.displayName.toLowerCase().includes(query);
      const bioMatch = user.bio.toLowerCase().includes(query);
      const locationMatch = user.location.toLowerCase().includes(query);
      const interestsMatch = user.interests.some((interest) => interest.toLowerCase().includes(query));
      return nameMatch || bioMatch || locationMatch || interestsMatch;
    });
  }, [users, userSearchQuery]);

  const peopleSummary = useMemo(() => {
    const interestCount = new Map<string, number>();

    users.forEach((user) => {
      user.interests.forEach((interest) => {
        interestCount.set(interest, (interestCount.get(interest) ?? 0) + 1);
      });
    });

    const topInterests = Array.from(interestCount.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, 3)
      .map(([interest]) => interest);

    return {
      userCount: users.length,
      topInterests,
    };
  }, [users]);

  const renderActivityItem = useCallback(
    ({ item, index }: { item: Activity; index: number }) => {
      const chipColor = CategoryColors[item.category] ?? Colors.accent;
      const joined = item.maxSlots - item.currentSlots;
      const dateStr = item.dateTime ? format(new Date(item.dateTime), 'EEE, h:mm a') : '';

      return (
        <Animated.View entering={FadeInDown.delay(index * 80).springify()}>
        <TouchableOpacity
          style={[styles.exploreCard, Shadows.card, { backgroundColor: colors.primary }]}
          onPress={() => router.push(`/activity/${item.id}`)}
          activeOpacity={0.92}
        >
          {item.coverImage ? (
            <Image
              source={{ uri: item.coverImage }}
              style={styles.exploreCardImage}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={[Colors.primarySoft, Colors.primary, '#0D1628']}
              style={styles.exploreCardFallback}
            >
              <Ionicons name="calendar-outline" size={42} color={Colors.white} />
            </LinearGradient>
          )}

          <LinearGradient
            colors={['rgba(21, 34, 56, 0.04)', 'rgba(21, 34, 56, 0.28)', 'rgba(21, 34, 56, 0.88)']}
            locations={[0.05, 0.42, 1]}
            style={styles.exploreCardOverlay}
          />

          <View style={styles.exploreCardTop}>
            <View />
            <View style={styles.exploreCardCountPill}>
              <Text style={styles.exploreCardCountText}>{joined}/{item.maxSlots}</Text>
            </View>
          </View>

          <View style={styles.exploreCardContent}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.cardDescription} numberOfLines={2}>
              {item.description || item.location.name}
            </Text>

            <Text style={styles.cardPriceLine} numberOfLines={1}>
              {dateStr}
            </Text>

            <View style={styles.cardFooterRow}>
              <View style={styles.exploreCardCta}>
                <Text style={[styles.exploreCardCtaText, { color: colors.primary }]}>VIEW</Text>
                <Ionicons name="eye-outline" size={13} color={colors.primary} />
              </View>
              <View style={[styles.exploreCategoryPill, { backgroundColor: chipColor + '24' }]}>
                <Text style={styles.exploreCategoryText}>{item.category}</Text>
              </View>
            </View>
          </View>
          </TouchableOpacity>
        </Animated.View>
      );
    },
    [colors, router]
  );

  const renderUserItem = useCallback(
    ({ item: profile, index }: { item: User; index: number }) => {
      const primaryInterest = profile.interests[0] ?? 'Open to join';
      const initials = (profile.displayName || 'A').trim().charAt(0).toUpperCase();

      return (
        <Animated.View entering={FadeInDown.delay(index * 80).springify()}>
          <TouchableOpacity
            style={[
              styles.userCard,
              Shadows.card,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.divider },
            ]}
            onPress={() => router.push(`/users/${profile.uid}`)}
            activeOpacity={0.92}
          >
            <View style={styles.userImagePanel}>
              {profile.photoURL ? (
                <Image
                  source={{ uri: profile.photoURL }}
                  style={styles.userPhotoFull}
                  resizeMode="cover"
                />
              ) : (
                <LinearGradient
                  colors={[Colors.primarySoft, Colors.primary, '#0D1628']}
                  style={styles.userImagePlaceholder}
                >
                  <Text style={styles.userInitial}>{initials}</Text>
                </LinearGradient>
              )}
              <LinearGradient
                colors={['rgba(21, 34, 56, 0)', 'rgba(21, 34, 56, 0.24)']}
                style={styles.userImageGradient}
              />
            </View>

            <View style={styles.userDetailsPanel}>
              <View style={styles.userTopLine}>
                <View style={styles.userTitleBlock}>
                  <Text style={[styles.userName, { color: colors.text }]} numberOfLines={1}>
                    {profile.displayName || 'Anonymous'}
                  </Text>
                  <Text style={styles.userPrimaryInterest} numberOfLines={1}>
                    {primaryInterest}
                  </Text>
                </View>
                <View style={styles.ratingContainer}>
                  <Ionicons name="star" size={13} color={Colors.accent} />
                  <Text style={styles.ratingText}>
                    {profile.ratingCount > 0 ? profile.rating.toFixed(1) : 'New'}
                  </Text>
                </View>
              </View>

              <View style={styles.userMetaRow}>
                {profile.verificationStatus === 'verified' ? (
                  <View style={styles.verifiedPill}>
                    <Ionicons name="shield-checkmark" size={12} color={Colors.success} />
                    <Text style={styles.verifiedText}>Verified</Text>
                  </View>
                ) : null}
                {profile.location ? (
                  <View style={[styles.userMetaPill, { backgroundColor: colors.cream }]}>
                    <Ionicons name="location-outline" size={12} color={colors.slate} />
                    <Text style={[styles.userMetaText, { color: colors.textSecondary }]} numberOfLines={1}>
                      {profile.location}
                    </Text>
                  </View>
                ) : null}
                <View style={[styles.userMetaPill, { backgroundColor: colors.cream }]}>
                  <Ionicons name="person-outline" size={12} color={colors.slate} />
                  <Text style={[styles.userMetaText, { color: colors.textSecondary }]}>{profile.ageRange}</Text>
                </View>
              </View>

              <Text style={[styles.userBio, { color: colors.textSecondary }]} numberOfLines={1}>
                {profile.bio || 'Ready to discover activities on JoinUp.'}
              </Text>

              <View style={styles.userFooter}>
                <View style={styles.joinedMiniStat}>
                  <Ionicons name="calendar-outline" size={13} color={colors.slate} />
                  <Text style={[styles.joinedMiniText, { color: colors.slate }]}>
                    {profile.activitiesJoined.length} joined
                  </Text>
                </View>
                <View style={[styles.viewProfilePill, { backgroundColor: colors.cream, borderColor: colors.divider }]}>
                  <Text style={[styles.viewProfileText, { color: colors.primary }]}>View</Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.primary} />
                </View>
              </View>
            </View>
          </TouchableOpacity>
        </Animated.View>
      );
    },
    [colors, router]
  );

  const handleEventScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    const delta = y - lastEventScrollY.current;

    if (y <= 8) {
      setShowEventDiscovery(true);
    } else if (delta > 8) {
      setShowEventDiscovery(false);
    } else if (delta < -8) {
      setShowEventDiscovery(true);
    }

    lastEventScrollY.current = y;
  }, []);

  const renderPeopleDiscoveryHeader = useCallback(
    () => (
      <View style={styles.peopleDiscoveryHeader}>
        <View
          style={[
            styles.searchContainer,
            styles.searchStandalone,
            styles.peopleSearchContainer,
            { backgroundColor: colors.surfaceElevated, borderColor: colors.divider },
          ]}
        >
          <Ionicons name="search-outline" size={18} color={colors.slate} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchInput, styles.peopleSearchInput, { color: colors.text }]}
            placeholder="Search by name or interests"
            placeholderTextColor={colors.slate}
            value={userSearchQuery}
            onChangeText={setUserSearchQuery}
          />
          {userSearchQuery ? (
            <TouchableOpacity onPress={() => setUserSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.slate} />
            </TouchableOpacity>
          ) : null}
        </View>

        <LinearGradient
          colors={[colors.surfaceElevated, isDark ? colors.surface : colors.surfaceElevated]}
          style={styles.peopleHeader}
        >
          <View>
            <Text style={[styles.sectionTitleNoMargin, { color: colors.text }]}>Discover People</Text>
            <Text style={[styles.peopleSubtitle, { color: colors.textSecondary }]}>
              {peopleSummary.userCount} {peopleSummary.userCount === 1 ? 'member' : 'members'} ready to join activities
            </Text>
          </View>
          <View style={[styles.peopleHeaderIcon, { backgroundColor: colors.accentSoft, borderColor: colors.accent + '20' }]}>
            <Ionicons name="people" size={20} color={colors.primary} />
          </View>
        </LinearGradient>

        {peopleSummary.topInterests.length > 0 ? (
          <View style={styles.trendingRow}>
            <Text style={[styles.trendingLabel, { color: colors.slate }]}>Popular</Text>
            {peopleSummary.topInterests.map((interest) => (
              <View key={interest} style={[styles.trendingChip, { backgroundColor: colors.surfaceElevated, borderColor: colors.divider }]}>
                <Text style={[styles.trendingChipText, { color: colors.accent }]}>{interest}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    ),
    [colors, isDark, peopleSummary, userSearchQuery]
  );

  const handlePeopleScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    const delta = y - lastPeopleScrollY.current;

    if (y <= 8) {
      setShowPeopleDiscovery(true);
    } else if (delta > 8) {
      setShowPeopleDiscovery(false);
    } else if (delta < -8) {
      setShowPeopleDiscovery(true);
    }

    lastPeopleScrollY.current = y;
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.cream }]}>
      {/* Header */}
      <NavBar
        title="Explore"
        showBack
        rightAction={
          <TouchableOpacity style={[styles.filterBtn, { backgroundColor: colors.surfaceElevated, borderColor: colors.divider }]}>
            <Ionicons name="filter-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        }
      />

      <View style={[styles.tabsContainer, { backgroundColor: colors.surfaceElevated, borderColor: colors.divider }]}>
        <TouchableOpacity
          style={[styles.tab, viewMode === 'events' && styles.tabActive, viewMode === 'events' && { backgroundColor: colors.primary }]}
          onPress={() => {
            setShowPlaceDropdown(false);
            setShowEventDiscovery(true);
            lastEventScrollY.current = 0;
            setViewMode('events');
          }}
        >
          <Text style={[styles.tabText, viewMode === 'events' && styles.tabTextActive, { color: viewMode === 'events' ? colors.white : colors.slate }]}>Events</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, viewMode === 'users' && styles.tabActive, viewMode === 'users' && { backgroundColor: colors.primary }]}
          onPress={() => {
            setShowPlaceDropdown(false);
            setShowPeopleDiscovery(true);
            lastPeopleScrollY.current = 0;
            setViewMode('users');
          }}
        >
          <Text style={[styles.tabText, viewMode === 'users' && styles.tabTextActive, { color: viewMode === 'users' ? colors.white : colors.slate }]}>Users</Text>
        </TouchableOpacity>
      </View>

      {showPlaceDropdown && viewMode === 'events' ? (
        <Pressable
          style={styles.dropdownBackdrop}
          onPress={() => setShowPlaceDropdown(false)}
        />
      ) : null}

      {viewMode === 'events' && showEventDiscovery ? (
        <Animated.View
          entering={FadeInDown.duration(180)}
          exiting={FadeOutUp.duration(160)}
          layout={LinearTransition.duration(180)}
        >
          <View style={styles.eventSearchWrap}>
            <View style={styles.eventSearchRow}>
              <View style={[styles.searchContainer, styles.searchInline, { backgroundColor: colors.surfaceElevated, borderColor: colors.divider }]}>
                <Ionicons name="search-outline" size={18} color={colors.slate} style={styles.searchIcon} />
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  placeholder="Search events by title or location"
                  placeholderTextColor={colors.slate}
                  value={eventSearchQuery}
                  onChangeText={setEventSearchQuery}
                />
                {eventSearchQuery ? (
                  <TouchableOpacity onPress={() => setEventSearchQuery('')}>
                    <Ionicons name="close-circle" size={18} color={colors.slate} />
                  </TouchableOpacity>
                ) : null}
              </View>
              <TouchableOpacity
                style={[
                  styles.locationFilterButton,
                  showPlaceDropdown && styles.locationFilterButtonActive,
                  {
                    backgroundColor: showPlaceDropdown ? colors.primary : colors.surfaceElevated,
                    borderColor: showPlaceDropdown ? colors.primary : colors.divider,
                  },
                ]}
                activeOpacity={0.85}
                onPress={() => setShowPlaceDropdown((prev) => !prev)}
              >
                <Ionicons
                  name="options-outline"
                  size={20}
                  color={showPlaceDropdown ? colors.white : colors.primary}
                />
              </TouchableOpacity>
            </View>

            {showPlaceDropdown ? (
              <View style={[styles.placeDropdown, Shadows.card, { backgroundColor: colors.surfaceElevated, borderColor: colors.divider }]}>
                {PHILIPPINE_PLACES.map((place) => {
                  const active = place.label === selectedPlace;
                  return (
                    <TouchableOpacity
                      key={place.label}
                      style={[styles.placeItem, active && styles.placeItemActive, active && { backgroundColor: colors.accentSoft }]}
                      onPress={() => {
                        setSelectedPlace(place.label);
                        setShowPlaceDropdown(false);
                      }}
                    >
                      <Text style={[styles.placeItemText, { color: active ? colors.accent : colors.text }, active && styles.placeItemTextActive]}>{place.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </View>
        </Animated.View>
      ) : null}

      {viewMode === 'events' && showEventDiscovery ? (
        <Animated.View
          entering={FadeInDown.duration(180)}
          exiting={FadeOutUp.duration(160)}
          layout={LinearTransition.duration(180)}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.quickFilterScroll}
            contentContainerStyle={styles.quickFilterRow}
          >
            <TouchableOpacity
              style={[
                styles.locationPill,
                selectedPlace !== 'All Philippines' && styles.locationPillActive,
                {
                  backgroundColor: selectedPlace !== 'All Philippines' ? colors.primary : colors.surfaceElevated,
                  borderColor: selectedPlace !== 'All Philippines' ? colors.primary : colors.divider,
                },
              ]}
              activeOpacity={0.85}
              onPress={() => setShowPlaceDropdown((prev) => !prev)}
            >
              <Ionicons
                name="location"
                size={15}
                color={selectedPlace !== 'All Philippines' ? colors.white : colors.success}
              />
              <Text
                style={[
                  styles.locationText,
                  selectedPlace !== 'All Philippines' && styles.locationTextActive,
                  { color: selectedPlace !== 'All Philippines' ? colors.white : colors.text },
                ]}
                numberOfLines={1}
              >
                {selectedPlace}
              </Text>
            </TouchableOpacity>
            {DiscoveryFilters.map((filter) => (
              <View key={filter} style={styles.quickFilterCell}>
                <CategoryChip
                  label={filter}
                  selected={selectedDiscoveryFilter === filter}
                  onPress={() => setSelectedDiscoveryFilter(filter)}
                  size="sm"
                  style={styles.discoveryFilterChip}
                />
              </View>
            ))}
          </ScrollView>
        </Animated.View>
      ) : null}

      {viewMode === 'events' ? (
        <View style={styles.listShell}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Happening Near You</Text>

          {activitiesLoading && activities.length === 0 ? (
            <ActivityIndicator size="large" color={colors.accent} style={styles.loader} />
          ) : activitiesError && activities.length === 0 ? (
            <EmptyState
              icon="alert-circle-outline"
              title="Could not load activities"
              message={activitiesError}
              actionLabel="Try again"
              onAction={() => {
                void refetchActivities();
              }}
              style={styles.inlineEmptyState}
            />
          ) : filteredActivities.length === 0 ? (
            <EmptyState
              icon="calendar-outline"
              title="No activities found"
              message={eventSearchQuery ? 'No activities found matching your search.' : 'No activities found for this place yet.'}
              actionLabel="Refresh"
              onAction={() => {
                void refetchActivities();
              }}
              style={styles.inlineEmptyState}
            />
          ) : (
            <FlatList
              style={styles.list}
              data={filteredActivities}
              keyExtractor={(item) => item.id}
              renderItem={renderActivityItem}
              onScroll={handleEventScroll}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: insets.bottom + Spacing.xl * 3 },
              ]}
              initialNumToRender={6}
              maxToRenderPerBatch={6}
              windowSize={7}
              removeClippedSubviews={Platform.OS === 'android'}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>
      ) : (
        <View style={styles.listShell}>
          {showPeopleDiscovery ? (
            <Animated.View
              entering={FadeInDown.duration(180)}
              exiting={FadeOutUp.duration(160)}
              layout={LinearTransition.duration(180)}
            >
              {renderPeopleDiscoveryHeader()}
            </Animated.View>
          ) : null}

          {usersLoading && users.length === 0 ? (
            <>
              <ActivityIndicator size="large" color={colors.accent} style={styles.loader} />
            </>
          ) : usersError && users.length === 0 ? (
            <>
              <EmptyState
                icon="alert-circle-outline"
                title="Could not load people"
                message={usersError}
                actionLabel="Try again"
                onAction={() => {
                  void refetchUsers();
                }}
                style={styles.inlineEmptyState}
              />
            </>
          ) : filteredUsers.length === 0 ? (
            <>
              <EmptyState
                icon="people-outline"
                title="No people found"
                message={userSearchQuery ? 'No users found matching your search.' : 'No users available yet.'}
                actionLabel="Refresh"
                onAction={() => {
                  void refetchUsers();
                }}
                style={styles.inlineEmptyState}
              />
            </>
          ) : (
            <FlatList
              style={styles.list}
              data={filteredUsers}
              keyExtractor={(item) => item.uid}
              renderItem={renderUserItem}
              onScroll={handlePeopleScroll}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[
                styles.listContent,
                { paddingBottom: insets.bottom + Spacing.xl * 3 },
              ]}
              initialNumToRender={6}
              maxToRenderPerBatch={6}
              windowSize={7}
              removeClippedSubviews={Platform.OS === 'android'}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  filterBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: 3,
    ...Shadows.hairline,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: BorderRadius.pill,
  },
  tabActive: {
    backgroundColor: Colors.primary,
  },
  tabText: {
    fontFamily: Typography.bodyMed,
    fontSize: 14,
    color: Colors.slate,
  },
  tabTextActive: {
    color: Colors.white,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRadius: BorderRadius.input,
    paddingHorizontal: Spacing.md,
    ...Shadows.hairline,
  },
  searchInline: {
    flex: 1,
  },
  searchStandalone: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  peopleSearchContainer: {
    backgroundColor: Colors.white,
    borderColor: Colors.divider,
    borderRadius: BorderRadius.card,
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.text,
    paddingVertical: 12,
  },
  peopleSearchInput: {
    color: Colors.primary,
  },
  peopleDiscoveryHeader: {
    paddingTop: 0,
  },
  eventSearchWrap: {
    position: 'relative',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    zIndex: 30,
  },
  eventSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  locationFilterButton: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.hairline,
  },
  locationFilterButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  quickFilterScroll: {
    maxHeight: 44,
    marginBottom: Spacing.sm,
  },
  quickFilterRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  quickFilterCell: {
    flex: 0,
  },
  discoveryFilterChip: {
    marginRight: 0,
    minHeight: 28,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
    maxWidth: 190,
  },
  locationPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  placeDropdown: {
    position: 'absolute',
    top: 58,
    left: 0,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.card,
    borderWidth: 1,
    borderColor: Colors.divider,
    minWidth: 210,
    overflow: 'hidden',
    zIndex: 31,
  },
  dropdownBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 25,
  },
  placeItem: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  placeItemActive: {
    backgroundColor: Colors.accent + '14',
  },
  placeItemText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.text,
  },
  placeItemTextActive: {
    color: Colors.accent,
    fontFamily: Typography.bodyMed,
  },
  locationText: {
    fontFamily: Typography.bodyMed,
    fontSize: 14,
    color: Colors.text,
    flexShrink: 1,
  },
  locationTextActive: {
    color: Colors.white,
  },
  listShell: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: Spacing.xl * 2,
  },
  sectionTitle: {
    fontFamily: Typography.display,
    fontSize: 22,
    color: Colors.text,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionTitleNoMargin: {
    fontFamily: Typography.display,
    fontSize: 19,
    color: Colors.text,
  },
  peopleHeader: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.divider,
    ...Shadows.soft,
  },
  peopleSubtitle: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  peopleHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.accentSoft,
    borderWidth: 1,
    borderColor: Colors.accent + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  trendingLabel: {
    fontFamily: Typography.bodyMed,
    fontSize: 12,
    color: Colors.slate,
    marginRight: 2,
  },
  trendingChip: {
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  trendingChipText: {
    fontFamily: Typography.bodyMed,
    fontSize: 11,
    color: Colors.accent,
  },
  loader: {
    marginTop: Spacing.xl * 2,
  },
  inlineEmptyState: {
    flex: 0,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    paddingVertical: Spacing.xl,
  },
  emptyText: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    color: Colors.slate,
    fontFamily: Typography.body,
    fontSize: 14,
  },
  exploreCard: {
    height: 280,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.sheet,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  exploreCardImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  exploreCardFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exploreCardOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  exploreCardTop: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exploreCardCountPill: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  exploreCardCountText: {
    fontFamily: Typography.bodyBold,
    fontSize: 11,
    color: Colors.primary,
  },
  exploreCardContent: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: Spacing.lg,
    zIndex: 2,
  },
  distanceBadge: {
    position: 'absolute',
    top: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    ...Shadows.card,
  },
  distanceText: {
    fontFamily: Typography.bodyBold,
    fontSize: 12,
    color: Colors.primary,
  },
  cardInfo: {
    padding: Spacing.lg,
  },
  cardInfoTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  categoryText: {
    fontFamily: Typography.bodyMed,
    fontSize: 11,
  },
  joinedText: {
    fontFamily: Typography.bodyMed,
    fontSize: 12,
    color: Colors.slate,
  },
  cardTitle: {
    fontFamily: Typography.display,
    fontSize: 27,
    color: Colors.white,
    marginBottom: Spacing.sm,
    lineHeight: 32,
  },
  cardDescription: {
    fontFamily: Typography.bodyMed,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.84)',
    lineHeight: 20,
    marginBottom: Spacing.md,
  },
  cardPriceLine: {
    fontFamily: Typography.bodyBold,
    fontSize: 13,
    color: Colors.white,
    marginBottom: Spacing.md,
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  exploreCardCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  exploreCardCtaText: {
    fontFamily: Typography.bodyBold,
    fontSize: 12,
    color: Colors.primary,
  },
  exploreCategoryPill: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
  },
  exploreCategoryText: {
    fontFamily: Typography.bodyBold,
    fontSize: 11,
    color: Colors.white,
  },
  cardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.xs,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  metaText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.slate,
    flexShrink: 1,
    minWidth: 0,
  },
  userCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.card,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: Colors.divider,
    overflow: 'hidden',
    height: 132,
    padding: 8,
  },
  userImagePanel: {
    width: 86,
    height: 116,
    position: 'relative',
    backgroundColor: Colors.primarySoft,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  userPhotoFull: {
    width: '100%',
    height: 116,
  },
  userImagePlaceholder: {
    width: '100%',
    height: 116,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userImageGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  userInitial: {
    fontFamily: Typography.display,
    fontSize: 34,
    color: Colors.white,
  },
  userDetailsPanel: {
    flex: 1,
    minWidth: 0,
    height: 116,
    paddingLeft: Spacing.md,
    paddingVertical: 1,
  },
  userTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  userTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontFamily: Typography.bodyBold,
    fontSize: 17,
    color: Colors.text,
    marginBottom: 2,
  },
  userPrimaryInterest: {
    fontFamily: Typography.bodyMed,
    fontSize: 12,
    color: Colors.accent,
  },
  userMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 5,
    marginBottom: 5,
  },
  userMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    maxWidth: '100%',
    backgroundColor: Colors.cream,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.success + '20',
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: Colors.success + '55',
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  verifiedText: {
    fontFamily: Typography.bodyBold,
    fontSize: 10,
    color: Colors.success,
  },
  userMetaText: {
    fontFamily: Typography.bodyMed,
    fontSize: 10,
    color: Colors.textSecondary,
    maxWidth: 96,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.accentSoft,
    borderWidth: 1,
    borderColor: Colors.accent + '18',
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ratingText: {
    fontFamily: Typography.bodyMed,
    fontSize: 11,
    color: Colors.accent,
  },
  userBio: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 0,
    lineHeight: 15,
  },
  interestsContainer: {
    flexDirection: 'row',
    gap: Spacing.xs,
    flexWrap: 'wrap',
    marginBottom: Spacing.sm,
  },
  interestTag: {
    backgroundColor: Colors.accent + '10',
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: Colors.accent + '18',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  interestText: {
    fontFamily: Typography.bodyMed,
    fontSize: 11,
    color: Colors.accent,
  },
  moreInterests: {
    fontFamily: Typography.bodyMed,
    fontSize: 11,
    color: Colors.slate,
    paddingHorizontal: Spacing.xs,
    alignSelf: 'center',
  },
  userFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: 'auto',
  },
  joinedMiniStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  joinedMiniText: {
    fontFamily: Typography.bodyMed,
    fontSize: 11,
    color: Colors.slate,
  },
  viewProfilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: 28,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.cream,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  viewProfileText: {
    fontFamily: Typography.bodyBold,
    fontSize: 11,
    color: Colors.primary,
  },
});
