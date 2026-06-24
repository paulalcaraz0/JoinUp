import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Dimensions,
  Pressable,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors, Typography, Spacing, BorderRadius, Shadows, CategoryColors } from '../../constants/theme';
import { NavBar } from '../../components/layout/NavBar';
import { CategoryChip } from '../../components/ui/CategoryChip';
import { EmptyState } from '../../components/ui/EmptyState';
import { useActivities } from '../../hooks/useActivities';
import { useLocation } from '../../hooks/useLocation';
import { useUsers } from '../../hooks/useUsers';
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

function joinedCount(activity: any) {
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
  const { location } = useLocation();
  const [viewMode, setViewMode] = useState<ViewMode>('events');
  const [showPlaceDropdown, setShowPlaceDropdown] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState('All Philippines');
  const [selectedDiscoveryFilter, setSelectedDiscoveryFilter] = useState<DiscoveryFilter>('All');
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');

  useEffect(() => {
    if (!location?.city) return;

    const city = location.city.toLowerCase();
    const matched = PHILIPPINE_PLACES.find(
      (place) => place.label !== 'All Philippines' && place.keywords.some((keyword) => keyword.includes(city))
    );

    if (matched) {
      setSelectedPlace(matched.label);
    }
  }, [location?.city]);

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

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <NavBar
        title="Explore"
        showBack
        rightAction={
          <TouchableOpacity style={styles.filterBtn}>
            <Ionicons name="filter-outline" size={22} color={Colors.text} />
          </TouchableOpacity>
        }
      />

      <View style={styles.tabsContainer}>
        <TouchableOpacity
          style={[styles.tab, viewMode === 'events' && styles.tabActive]}
          onPress={() => setViewMode('events')}
        >
          <Text style={[styles.tabText, viewMode === 'events' && styles.tabTextActive]}>Events</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, viewMode === 'users' && styles.tabActive]}
          onPress={() => {
            setShowPlaceDropdown(false);
            setViewMode('users');
          }}
        >
          <Text style={[styles.tabText, viewMode === 'users' && styles.tabTextActive]}>Users</Text>
        </TouchableOpacity>
      </View>

      {viewMode === 'events' ? (
        <View style={styles.locationWrap}>
          <TouchableOpacity
            style={styles.locationPill}
            activeOpacity={0.85}
            onPress={() => setShowPlaceDropdown((prev) => !prev)}
          >
            <Ionicons name="location" size={16} color={Colors.success} />
            <Text style={styles.locationText}>{selectedPlace}</Text>
            <Ionicons name={showPlaceDropdown ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.slate} />
          </TouchableOpacity>

          {showPlaceDropdown ? (
            <View style={[styles.placeDropdown, Shadows.card]}>
              {PHILIPPINE_PLACES.map((place) => {
                const active = place.label === selectedPlace;
                return (
                  <TouchableOpacity
                    key={place.label}
                    style={[styles.placeItem, active && styles.placeItemActive]}
                    onPress={() => {
                      setSelectedPlace(place.label);
                      setShowPlaceDropdown(false);
                    }}
                  >
                    <Text style={[styles.placeItemText, active && styles.placeItemTextActive]}>{place.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </View>
      ) : null}

      {showPlaceDropdown && viewMode === 'events' ? (
        <Pressable
          style={styles.dropdownBackdrop}
          onPress={() => setShowPlaceDropdown(false)}
        />
      ) : null}

      {viewMode === 'events' ? (
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color={Colors.slate} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search events by title or location"
            placeholderTextColor={Colors.slate}
            value={eventSearchQuery}
            onChangeText={setEventSearchQuery}
          />
          {eventSearchQuery ? (
            <TouchableOpacity onPress={() => setEventSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={Colors.slate} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color={Colors.slate} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or interests"
            placeholderTextColor={Colors.slate}
            value={userSearchQuery}
            onChangeText={setUserSearchQuery}
          />
          {userSearchQuery ? (
            <TouchableOpacity onPress={() => setUserSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={Colors.slate} />
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {viewMode === 'events' ? (
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
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {viewMode === 'events' ? (
          <>
            <Text style={styles.sectionTitle}>Happening Near You</Text>

            {activitiesLoading ? (
              <ActivityIndicator size="large" color={Colors.accent} style={styles.loader} />
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
            ) : filteredActivities.map((activity, index) => {
            const chipColor = CategoryColors[activity.category] ?? Colors.accent;
            const joined = activity.maxSlots - activity.currentSlots;
            const dateStr = activity.dateTime
              ? format(new Date(activity.dateTime), 'EEE, h:mm a')
              : '';

            return (
              <Animated.View
                key={activity.id}
                entering={FadeInDown.delay(index * 80).springify()}
              >
                <TouchableOpacity
                  style={[styles.exploreCard, Shadows.card]}
                  onPress={() => router.push(`/activity/${activity.id}`)}
                  activeOpacity={0.92}
                >
                  {/* Cover image */}
                  <View style={styles.coverImage}>
                    {activity.coverImage ? (
                      <Image
                        source={{ uri: activity.coverImage }}
                        style={styles.coverPhoto}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.coverPlaceholder}>
                        <Ionicons name="image-outline" size={40} color={Colors.slate} />
                      </View>
                    )}

                  </View>

                  {/* Card info */}
                  <View style={styles.cardInfo}>
                    <View style={styles.cardInfoTop}>
                      <View
                        style={[
                          styles.categoryChip,
                          { backgroundColor: chipColor + '18', borderColor: chipColor },
                        ]}
                      >
                        <Text style={[styles.categoryText, { color: chipColor }]}>
                          {activity.category}
                        </Text>
                      </View>
                      <Text style={styles.joinedText}>
                        {joined}/{activity.maxSlots} joined
                      </Text>
                    </View>

                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {activity.title}
                    </Text>

                    <View style={styles.cardMeta}>
                      <View style={styles.metaItem}>
                        <Ionicons name="location-outline" size={14} color={Colors.slate} />
                        <Text style={styles.metaText} numberOfLines={2}>
                          {activity.location.name}
                        </Text>
                      </View>
                      <Text style={styles.metaText} numberOfLines={1}>
                        {dateStr}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            );
            })}
          </>
        ) : (
          <>
            <View style={styles.peopleHeader}>
              <View>
                <Text style={styles.sectionTitleNoMargin}>Discover People</Text>
                <Text style={styles.peopleSubtitle}>
                  {peopleSummary.userCount} {peopleSummary.userCount === 1 ? 'member' : 'members'} ready to join activities
                </Text>
              </View>
              <View style={styles.peopleHeaderIcon}>
                <Ionicons name="people" size={22} color={Colors.accent} />
              </View>
            </View>

            {peopleSummary.topInterests.length > 0 ? (
              <View style={styles.trendingRow}>
                <Text style={styles.trendingLabel}>Popular</Text>
                {peopleSummary.topInterests.map((interest) => (
                  <View key={interest} style={styles.trendingChip}>
                    <Text style={styles.trendingChipText}>{interest}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {usersLoading ? (
              <ActivityIndicator size="large" color={Colors.accent} style={styles.loader} />
            ) : usersError && users.length === 0 ? (
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
            ) : filteredUsers.length === 0 ? (
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
            ) : filteredUsers.map((profile, index) => (
              <Animated.View
                key={profile.uid}
                entering={FadeInDown.delay(index * 80).springify()}
              >
                <TouchableOpacity
                  style={[styles.userCard, Shadows.card]}
                  onPress={() => router.push(`/users/${profile.uid}`)}
                  activeOpacity={0.92}
                >
                  <View style={styles.userAccentBar} />
                  <View style={styles.userPhotoContainer}>
                    {profile.photoURL ? (
                      <Image
                        source={{ uri: profile.photoURL }}
                        style={styles.userPhoto}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.userPhotoPlaceholder}>
                        <Text style={styles.userInitial}>
                          {(profile.displayName || 'A').trim().charAt(0).toUpperCase()}
                        </Text>
                      </View>
                    )}
                    <View style={styles.userOnlineDot} />
                  </View>

                  <View style={styles.userInfo}>
                    <View style={styles.userHeader}>
                      <View style={styles.userTitleBlock}>
                        <Text style={styles.userName} numberOfLines={1}>
                          {profile.displayName || 'Anonymous'}
                        </Text>
                        <View style={styles.userMetaRow}>
                          {profile.verificationStatus === 'verified' ? (
                            <View style={styles.verifiedPill}>
                              <Ionicons name="shield-checkmark" size={12} color={Colors.success} />
                              <Text style={styles.verifiedText}>Verified ID</Text>
                            </View>
                          ) : null}
                          {profile.location ? (
                            <View style={styles.userMetaPill}>
                              <Ionicons name="location-outline" size={12} color={Colors.textSecondary} />
                              <Text style={styles.userMetaText} numberOfLines={1}>{profile.location}</Text>
                            </View>
                          ) : null}
                          <View style={styles.userMetaPill}>
                            <Ionicons name="person-outline" size={12} color={Colors.textSecondary} />
                            <Text style={styles.userMetaText}>{profile.ageRange}</Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.ratingContainer}>
                        <Ionicons name="star" size={13} color={Colors.accent} />
                        <Text style={styles.ratingText}>
                          {profile.ratingCount > 0 ? profile.rating.toFixed(1) : 'New'}
                        </Text>
                      </View>
                    </View>

                    {profile.bio ? (
                      <Text style={styles.userBio} numberOfLines={2}>
                        {profile.bio}
                      </Text>
                    ) : null}

                    {profile.interests.length > 0 ? (
                      <View style={styles.interestsContainer}>
                        {profile.interests.slice(0, 3).map((interest) => (
                          <View key={interest} style={styles.interestTag}>
                            <Text style={styles.interestText}>{interest}</Text>
                          </View>
                        ))}
                        {profile.interests.length > 3 ? (
                          <Text style={styles.moreInterests}>+{profile.interests.length - 3}</Text>
                        ) : null}
                      </View>
                    ) : (
                      <Text style={styles.userBio} numberOfLines={1}>
                        No interests added yet
                      </Text>
                    )}

                    <View style={styles.userFooter}>
                      <View style={styles.joinedMiniStat}>
                        <Ionicons name="calendar-outline" size={13} color={Colors.slate} />
                        <Text style={styles.joinedMiniText}>
                          {profile.activitiesJoined.length} joined
                        </Text>
                      </View>
                      <View style={styles.viewProfilePill}>
                        <Text style={styles.viewProfileText}>View profile</Text>
                        <Ionicons name="chevron-forward" size={14} color={Colors.accent} />
                      </View>
                    </View>
                  </View>
                </TouchableOpacity>
              </Animated.View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  filterBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.accent,
  },
  tabText: {
    fontFamily: Typography.bodyMed,
    fontSize: 16,
    color: Colors.slate,
  },
  tabTextActive: {
    color: Colors.accent,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRadius: BorderRadius.input,
    paddingHorizontal: Spacing.md,
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.body,
    fontSize: 16,
    color: Colors.text,
    paddingVertical: Spacing.md,
  },
  quickFilterScroll: {
    maxHeight: 38,
    marginBottom: Spacing.sm,
  },
  quickFilterContainer: {
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
  },
  locationWrap: {
    position: 'relative',
    marginLeft: Spacing.lg,
    marginBottom: Spacing.md,
    alignSelf: 'flex-start',
    zIndex: 30,
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
  },
  placeDropdown: {
    position: 'absolute',
    top: 40,
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
  },
  content: {
    paddingBottom: Spacing.xl * 2,
  },
  sectionTitle: {
    fontFamily: Typography.display,
    fontSize: 22,
    color: Colors.accent,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  sectionTitleNoMargin: {
    fontFamily: Typography.display,
    fontSize: 22,
    color: Colors.accent,
  },
  peopleHeader: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.md,
  },
  peopleSubtitle: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  peopleHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.accent + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  trendingLabel: {
    fontFamily: Typography.bodyMed,
    fontSize: 12,
    color: Colors.slate,
    marginRight: 2,
  },
  trendingChip: {
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.primary + '10',
    borderWidth: 1,
    borderColor: Colors.primary + '16',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  trendingChipText: {
    fontFamily: Typography.bodyMed,
    fontSize: 11,
    color: Colors.primary,
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
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.card,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  coverImage: {
    height: 160,
    backgroundColor: Colors.primary + '15',
    position: 'relative',
  },
  coverPhoto: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    padding: Spacing.md,
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
    fontFamily: Typography.bodyBold,
    fontSize: 17,
    color: Colors.text,
    marginBottom: Spacing.xs,
    lineHeight: 23,
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
    borderRadius: 14,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    flexDirection: 'row',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    overflow: 'hidden',
  },
  userAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: Colors.accent,
  },
  userPhotoContainer: {
    position: 'relative',
  },
  userPhoto: {
    width: 74,
    height: 74,
    borderRadius: BorderRadius.full,
    borderWidth: 3,
    borderColor: Colors.cream,
  },
  userPhotoPlaceholder: {
    width: 74,
    height: 74,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.cream,
  },
  userInitial: {
    fontFamily: Typography.display,
    fontSize: 28,
    color: Colors.white,
  },
  userOnlineDot: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.xs,
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
    marginBottom: 4,
  },
  userMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
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
    backgroundColor: Colors.success + '12',
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: Colors.success + '24',
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
    backgroundColor: Colors.accent + '12',
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
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    lineHeight: 18,
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
    gap: 2,
  },
  viewProfileText: {
    fontFamily: Typography.bodyBold,
    fontSize: 12,
    color: Colors.accent,
  },
});
