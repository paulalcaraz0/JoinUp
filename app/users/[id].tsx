import React, { useEffect, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { format } from 'date-fns';
import { Colors, Typography, Spacing, BorderRadius, Shadows, CategoryColors } from '../../constants/theme';
import { supabase } from '../../lib/supabase';
import { ratingService, type RateableActivity } from '../../lib/api/ratingService';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { useAuthStore } from '../../store/authStore';
import type { Activity, User } from '../../types';

interface UserWithActivities extends User {
  hostedActivities?: Activity[];
  joinedActivities?: Activity[];
}

function mapUser(row: any): User {
  return {
    uid: row.id,
    displayName: row.display_name ?? '',
    photoURL: row.photo_url ?? '',
    bio: row.bio ?? '',
    location: row.location ?? '',
    ageRange: row.age_range ?? '18-24',
    interests: Array.isArray(row.interests) ? row.interests : [],
    activitiesJoined: Array.isArray(row.activities_joined) ? row.activities_joined : [],
    activitiesHosted: [],
    rating: Number(row.rating ?? 0),
    ratingCount: row.rating_count ?? 0,
    verificationStatus: row.verification_status ?? 'unverified',
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function mapActivity(row: any): Activity {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? '',
    category: row.category ?? 'Other',
    location: {
      name: row.location_name ?? '',
      lat: row.location_lat ?? 0,
      lng: row.location_lng ?? 0,
    },
    dateTime: row.date_time ?? '',
    maxSlots: row.max_slots ?? 0,
    currentSlots: row.current_slots ?? 0,
    participants: Array.isArray(row.participant_ids) ? row.participant_ids : [],
    hostId: row.host_id ?? '',
    hostName: row.host_name ?? '',
    hostPhoto: row.host_photo ?? '',
    coverImage: row.cover_image ?? undefined,
    images: Array.isArray(row.images) ? row.images : undefined,
    requiresApproval: row.requires_approval ?? false,
    reactions: {
      fire: row.reaction_fire ?? 0,
      heart: row.reaction_heart ?? 0,
      like: row.reaction_like ?? 0,
    },
    status: row.status ?? 'active',
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

export default function UserProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentUser = useAuthStore((state) => state.user);

  const [profile, setProfile] = useState<UserWithActivities | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rateableActivities, setRateableActivities] = useState<RateableActivity[]>([]);
  const [viewerRatings, setViewerRatings] = useState<Record<string, number>>({});
  const [selectedRatingActivityId, setSelectedRatingActivityId] = useState<string | null>(null);
  const [draftScore, setDraftScore] = useState(0);
  const [isLoadingRatingOptions, setIsLoadingRatingOptions] = useState(false);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);

  useEffect(() => {
    let isActive = true;

    const fetchUserProfile = async () => {
      if (!id) {
        if (isActive) {
          setError('Missing user id.');
          setIsLoading(false);
        }
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('id, display_name, photo_url, bio, location, age_range, interests, activities_joined, rating, rating_count, verification_status, created_at')
          .eq('id', id)
          .single();

        if (profileError) throw profileError;
        if (!profileData) throw new Error('User not found');

        const { data: hostedData } = await supabase
          .from('activities_full')
          .select('*')
          .eq('host_id', id)
          .eq('status', 'active');

        const { data: participantData } = await supabase
          .from('participants')
          .select('activity_id')
          .eq('user_id', id)
          .eq('status', 'approved');

        let joinedData: Activity[] = [];
        const activityIds = (participantData ?? []).map((row: any) => row.activity_id);
        if (activityIds.length > 0) {
          const { data: activitiesData } = await supabase
            .from('activities_full')
            .select('*')
            .in('id', activityIds);

          joinedData = (activitiesData ?? []).map(mapActivity);
        }

        if (!isActive) return;

        setProfile({
          ...mapUser(profileData),
          hostedActivities: (hostedData ?? []).map(mapActivity),
          joinedActivities: joinedData,
        });
      } catch (err: any) {
        if (isActive) {
          setError(err?.message ?? 'Failed to fetch user profile');
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void fetchUserProfile();

    return () => {
      isActive = false;
    };
  }, [id]);

  useEffect(() => {
    let isActive = true;

    const loadRatingOptions = async () => {
      if (!currentUser?.uid || !id || currentUser.uid === id) {
        setRateableActivities([]);
        setViewerRatings({});
        setSelectedRatingActivityId(null);
        setDraftScore(0);
        return;
      }

      try {
        setIsLoadingRatingOptions(true);

        const [activities, ratings] = await Promise.all([
          ratingService.listRateableActivities(currentUser.uid, id),
          ratingService.getViewerRatings(currentUser.uid, id),
        ]);

        if (!isActive) return;

        setRateableActivities(activities);
        setViewerRatings(ratings);

        const firstActivityId = activities.find((activity) => !ratings[activity.id])?.id ?? activities[0]?.id ?? null;
        setSelectedRatingActivityId(firstActivityId);
        setDraftScore(firstActivityId ? ratings[firstActivityId] ?? 0 : 0);
      } catch {
        if (!isActive) return;
        setRateableActivities([]);
        setViewerRatings({});
        setSelectedRatingActivityId(null);
        setDraftScore(0);
      } finally {
        if (isActive) {
          setIsLoadingRatingOptions(false);
        }
      }
    };

    void loadRatingOptions();

    return () => {
      isActive = false;
    };
  }, [currentUser?.uid, id]);

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header onBack={() => router.back()} />
        <ActivityIndicator size="large" color={Colors.accent} style={styles.loader} />
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header onBack={() => router.back()} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error || 'User not found'}</Text>
        </View>
      </View>
    );
  }

  const hostedCount = profile.hostedActivities?.length ?? 0;
  const joinedCount = profile.joinedActivities?.length ?? 0;
  const firstInitial = (profile.displayName || 'A').trim().charAt(0).toUpperCase();
  const memberSince = profile.createdAt ? format(new Date(profile.createdAt), 'MMM yyyy') : 'New member';
  const selectedRatingActivity = rateableActivities.find((activity) => activity.id === selectedRatingActivityId) ?? null;
  const existingRatingScore = selectedRatingActivityId ? viewerRatings[selectedRatingActivityId] ?? 0 : 0;
  const hasRatedSelectedActivity = existingRatingScore > 0;
  const unratedActivityCount = rateableActivities.filter((activity) => !viewerRatings[activity.id]).length;

  const handleSelectRatingActivity = (activityId: string) => {
    setSelectedRatingActivityId(activityId);
    setDraftScore(viewerRatings[activityId] ?? 0);
  };

  const handleSubmitRating = async () => {
    if (!id || !selectedRatingActivityId || draftScore < 1) return;

    try {
      setIsSubmittingRating(true);
      const result = await ratingService.submitRating(selectedRatingActivityId, id, draftScore);

      setViewerRatings((current) => ({
        ...current,
        [selectedRatingActivityId]: result.score,
      }));
      setProfile((current) =>
        current
          ? {
              ...current,
              rating: result.rating,
              ratingCount: result.ratingCount,
            }
          : current
      );
      Alert.alert('Rating saved', `You rated ${profile.displayName || 'this user'} ${result.score} stars.`);
      const nextUnratedActivity = rateableActivities.find((activity) => (
        activity.id !== selectedRatingActivityId && !viewerRatings[activity.id]
      ));
      if (nextUnratedActivity) {
        setSelectedRatingActivityId(nextUnratedActivity.id);
        setDraftScore(0);
      }
    } catch (err: any) {
      Alert.alert('Rating failed', err?.message ?? 'Could not save your rating.');
    } finally {
      setIsSubmittingRating(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header onBack={() => router.back()} />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <Animated.View entering={FadeInDown.springify()} style={styles.profileCard}>
          <View style={styles.coverArea}>
            <View style={styles.coverCircleLarge} />
            <View style={styles.coverCircleSmall} />
          </View>

          <View style={styles.profileHeader}>
            <View style={styles.photoContainer}>
              {profile.photoURL ? (
                <Image source={{ uri: profile.photoURL }} style={styles.profilePhoto} resizeMode="cover" />
              ) : (
                <View style={styles.photoPlaceholder}>
                  <Text style={styles.photoInitial}>{firstInitial}</Text>
                </View>
              )}
            </View>

            <Text style={styles.displayName}>{profile.displayName || 'Anonymous'}</Text>
            <View style={styles.profileMetaWrap}>
              {profile.verificationStatus === 'verified' ? (
                <View style={styles.verifiedPill}>
                  <Ionicons name="shield-checkmark" size={13} color={Colors.success} />
                  <Text style={styles.verifiedText}>Verified ID</Text>
                </View>
              ) : null}
              {profile.location ? (
                <View style={styles.profileMetaPill}>
                  <Ionicons name="location-outline" size={13} color={Colors.textSecondary} />
                  <Text style={styles.profileMetaText} numberOfLines={1}>{profile.location}</Text>
                </View>
              ) : null}
              <View style={styles.profileMetaPill}>
                <Ionicons name="person-outline" size={13} color={Colors.textSecondary} />
                <Text style={styles.profileMetaText}>{profile.ageRange}</Text>
              </View>
              <View style={styles.profileMetaPill}>
                <Ionicons name="calendar-outline" size={13} color={Colors.textSecondary} />
                <Text style={styles.profileMetaText}>{memberSince}</Text>
              </View>
            </View>
          </View>

          {profile.bio ? (
            <View style={styles.bioSection}>
              <Text style={styles.bioText}>{profile.bio}</Text>
            </View>
          ) : (
            <View style={styles.bioSection}>
              <Text style={styles.bioMuted}>No bio added yet.</Text>
            </View>
          )}

          <View style={styles.quickStatsRow}>
            <View style={styles.quickStat}>
              <View style={styles.quickStatIcon}>
                <Ionicons name="star" size={15} color={Colors.accent} />
              </View>
              <Text style={styles.quickStatValue}>
                {profile.ratingCount > 0 ? profile.rating.toFixed(1) : 'New'}
              </Text>
              <Text style={styles.quickStatLabel}>Rating</Text>
            </View>
            <View style={styles.quickStat}>
              <View style={styles.quickStatIcon}>
                <Ionicons name="sparkles-outline" size={15} color={Colors.accent} />
              </View>
              <Text style={styles.quickStatValue}>{profile.interests.length}</Text>
              <Text style={styles.quickStatLabel}>Interests</Text>
            </View>
            <View style={styles.quickStat}>
              <View style={styles.quickStatIcon}>
                <Ionicons name="people-outline" size={15} color={Colors.accent} />
              </View>
              <Text style={styles.quickStatValue}>{hostedCount + joinedCount}</Text>
              <Text style={styles.quickStatLabel}>Activities</Text>
            </View>
          </View>

          <View style={styles.interestsSection}>
            <Text style={styles.sectionLabel}>Interests</Text>
            {profile.interests.length > 0 ? (
              <View style={styles.interestsList}>
                {profile.interests.map((interest) => (
                  <View key={interest} style={styles.interestBadge}>
                    <Text style={styles.interestBadgeText}>{interest}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyInlineText}>No interests listed yet.</Text>
            )}
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{hostedCount}</Text>
              <Text style={styles.statLabel}>Hosted</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{joinedCount}</Text>
              <Text style={styles.statLabel}>Joined</Text>
            </View>
          </View>
        </Animated.View>

        {isLoadingRatingOptions ? (
          <View style={[styles.ratingPanel, Shadows.card]}>
            <ActivityIndicator size="small" color={Colors.accent} />
          </View>
        ) : selectedRatingActivity ? (
          <View style={[styles.ratingPanel, Shadows.card]}>
            <View style={styles.ratingPanelHeader}>
              <View>
                <Text style={styles.ratingPanelTitle}>
                  {hasRatedSelectedActivity ? 'You rated this activity' : 'Rate this user'}
                </Text>
                <Text style={styles.ratingPanelMeta} numberOfLines={1}>
                  {selectedRatingActivity.title}
                </Text>
              </View>
              {hasRatedSelectedActivity ? (
                <View style={styles.savedRatingPill}>
                  <Text style={styles.savedRatingText}>Rated</Text>
                </View>
              ) : null}
            </View>

            {rateableActivities.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.ratingActivityList}
              >
                {rateableActivities.map((activity) => {
                  const selected = activity.id === selectedRatingActivity.id;
                  const rated = Boolean(viewerRatings[activity.id]);

                  return (
                    <TouchableOpacity
                      key={activity.id}
                      style={[styles.ratingActivityChip, selected && styles.ratingActivityChipSelected]}
                      onPress={() => handleSelectRatingActivity(activity.id)}
                    >
                      <Text
                        style={[styles.ratingActivityChipText, selected && styles.ratingActivityChipTextSelected]}
                        numberOfLines={1}
                      >
                        {rated ? `${activity.title} - Rated` : activity.title}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}

            <View style={styles.starPicker}>
              {[1, 2, 3, 4, 5].map((score) => (
                <TouchableOpacity
                  key={score}
                  onPress={() => {
                    if (!hasRatedSelectedActivity) {
                      setDraftScore(score);
                    }
                  }}
                  style={styles.starButton}
                  disabled={hasRatedSelectedActivity}
                  accessibilityRole="button"
                  accessibilityLabel={`${score} star rating`}
                >
                  <Ionicons
                    name={score <= (hasRatedSelectedActivity ? existingRatingScore : draftScore) ? 'star' : 'star-outline'}
                    size={34}
                    color={score <= (hasRatedSelectedActivity ? existingRatingScore : draftScore) ? Colors.accent : Colors.slate}
                  />
                </TouchableOpacity>
              ))}
            </View>

            {hasRatedSelectedActivity ? (
              <Text style={styles.ratingLockedText}>
                This activity is already rated. {unratedActivityCount > 0 ? 'Select another completed activity to rate again.' : 'There are no other completed activities to rate.'}
              </Text>
            ) : (
              <PrimaryButton
                title="Submit Rating"
                onPress={() => void handleSubmitRating()}
                loading={isSubmittingRating}
                disabled={draftScore < 1}
                style={styles.submitRatingButton}
              />
            )}
          </View>
        ) : null}

        <ActivitySection
          title="Hosted Activities"
          count={hostedCount}
          emptyText="No hosted activities yet."
          activities={profile.hostedActivities ?? []}
          onPress={(activityId) => router.push(`/activity/${activityId}`)}
        />

        <ActivitySection
          title="Joined Activities"
          count={joinedCount}
          emptyText="No joined activities yet."
          activities={profile.joinedActivities ?? []}
          onPress={(activityId) => router.push(`/activity/${activityId}`)}
        />
      </ScrollView>
    </View>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={24} color={Colors.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>User Profile</Text>
      <View style={styles.backBtn} />
    </View>
  );
}

function ActivitySection({
  title,
  count,
  emptyText,
  activities,
  onPress,
}: {
  title: string;
  count: number;
  emptyText: string;
  activities: Activity[];
  onPress: (activityId: string) => void;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeadingRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionCountPill}>
          <Text style={styles.sectionCountText}>{count}</Text>
        </View>
      </View>
      {activities.length === 0 ? (
        <View style={styles.emptyActivityCard}>
          <Ionicons name="calendar-clear-outline" size={22} color={Colors.slate} />
          <Text style={styles.emptyActivityText}>{emptyText}</Text>
        </View>
      ) : null}
      {activities.map((activity, index) => (
        <Animated.View key={activity.id} entering={FadeInDown.delay(index * 80).springify()}>
          <TouchableOpacity
            style={[styles.activityCard, Shadows.card]}
            onPress={() => onPress(activity.id)}
            activeOpacity={0.92}
          >
            <View style={styles.activityCardAccent} />
            <View style={styles.activityMainRow}>
              <View style={styles.activityIconBox}>
                <Ionicons name="calendar-outline" size={19} color={Colors.accent} />
              </View>
              <View style={styles.activityBody}>
                <View style={styles.activityTopRow}>
                  <Text style={styles.activityTitle} numberOfLines={2}>
                    {activity.title}
                  </Text>
                  <View
                    style={[
                      styles.categoryBadge,
                      { backgroundColor: (CategoryColors[activity.category] ?? Colors.accent) + '14' },
                    ]}
                  >
                    <Text style={[styles.categoryBadgeText, { color: CategoryColors[activity.category] ?? Colors.accent }]}>
                      {activity.category}
                    </Text>
                  </View>
                </View>
                <View style={styles.activityMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="location-outline" size={12} color={Colors.slate} />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {activity.location.name || 'Location TBD'}
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={12} color={Colors.slate} />
                    <Text style={styles.metaText} numberOfLines={1}>
                      {activity.dateTime ? format(new Date(activity.dateTime), 'MMM d, yyyy') : 'Date TBD'}
                    </Text>
                  </View>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.slate} />
            </View>
          </TouchableOpacity>
        </Animated.View>
      ))}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
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
  headerTitle: {
    fontFamily: Typography.bodyBold,
    fontSize: 18,
    color: Colors.text,
    flex: 1,
    textAlign: 'center',
  },
  content: {
    paddingBottom: Spacing.xl * 2,
    paddingTop: Spacing.md,
  },
  loader: {
    marginTop: Spacing.xl * 3,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: Spacing.lg,
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 16,
    color: Colors.slate,
    textAlign: 'center',
  },
  profileCard: {
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.lg,
    borderRadius: 14,
    overflow: 'hidden',
    ...Shadows.card,
  },
  coverArea: {
    height: 116,
    backgroundColor: Colors.primary,
    position: 'relative',
    overflow: 'hidden',
  },
  coverCircleLarge: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Colors.accent + '28',
    top: -82,
    right: -42,
  },
  coverCircleSmall: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.peach + '36',
    bottom: -44,
    left: 28,
  },
  profileHeader: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  photoContainer: {
    position: 'relative',
    marginTop: -52,
    marginBottom: Spacing.md,
  },
  profilePhoto: {
    width: 104,
    height: 104,
    borderRadius: BorderRadius.full,
    borderWidth: 4,
    borderColor: Colors.white,
  },
  photoPlaceholder: {
    width: 104,
    height: 104,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: Colors.white,
  },
  photoInitial: {
    fontFamily: Typography.display,
    fontSize: 38,
    color: Colors.white,
  },
  displayName: {
    fontFamily: Typography.display,
    fontSize: 28,
    color: Colors.text,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  profileMetaWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  profileMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
    backgroundColor: Colors.cream,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.success + '12',
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: Colors.success + '24',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  verifiedText: {
    fontFamily: Typography.bodyBold,
    fontSize: 11,
    color: Colors.success,
  },
  profileMetaText: {
    fontFamily: Typography.bodyMed,
    fontSize: 11,
    color: Colors.textSecondary,
    maxWidth: 180,
  },
  bioSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  bioText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
    textAlign: 'center',
  },
  bioMuted: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.slate,
    lineHeight: 20,
    textAlign: 'center',
  },
  quickStatsRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  quickStat: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: Colors.cream,
    borderRadius: 12,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  quickStatIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.accent + '14',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  quickStatValue: {
    fontFamily: Typography.bodyBold,
    fontSize: 14,
    color: Colors.text,
  },
  quickStatLabel: {
    fontFamily: Typography.body,
    fontSize: 10,
    color: Colors.slate,
  },
  interestsSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  sectionLabel: {
    fontFamily: Typography.bodyMed,
    fontSize: 12,
    color: Colors.slate,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
  },
  emptyInlineText: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: Colors.slate,
  },
  interestsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  interestBadge: {
    backgroundColor: Colors.accent + '12',
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: Colors.accent + '18',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  interestBadgeText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.accent,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingVertical: Spacing.md,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statNumber: {
    fontFamily: Typography.display,
    fontSize: 20,
    color: Colors.accent,
    marginBottom: Spacing.xs,
  },
  statLabel: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.slate,
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: Colors.divider,
  },
  section: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
  },
  ratingPanel: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    padding: Spacing.md,
  },
  ratingPanelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  ratingPanelTitle: {
    fontFamily: Typography.bodyBold,
    fontSize: 17,
    color: Colors.text,
  },
  ratingPanelMeta: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.slate,
    marginTop: 2,
    maxWidth: 230,
  },
  savedRatingPill: {
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.success + '12',
    borderWidth: 1,
    borderColor: Colors.success + '24',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  savedRatingText: {
    fontFamily: Typography.bodyBold,
    fontSize: 11,
    color: Colors.success,
  },
  ratingActivityList: {
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  ratingActivityChip: {
    maxWidth: 180,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: Colors.divider,
    backgroundColor: Colors.cream,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  ratingActivityChipSelected: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + '12',
  },
  ratingActivityChipText: {
    fontFamily: Typography.bodyMed,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  ratingActivityChipTextSelected: {
    color: Colors.accent,
  },
  starPicker: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.md,
  },
  starButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitRatingButton: {
    minHeight: 48,
    marginTop: Spacing.xs,
  },
  ratingLockedText: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: Colors.slate,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: Spacing.xs,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontFamily: Typography.bodyBold,
    fontSize: 19,
    color: Colors.text,
  },
  sectionCountPill: {
    minWidth: 30,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.accent + '14',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  sectionCountText: {
    fontFamily: Typography.bodyBold,
    fontSize: 12,
    color: Colors.accent,
  },
  emptyActivityCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyActivityText: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: Colors.slate,
    textAlign: 'center',
  },
  activityCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    marginBottom: Spacing.md,
    padding: Spacing.md,
    overflow: 'hidden',
  },
  activityCardAccent: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 4,
    backgroundColor: Colors.accent,
  },
  activityMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  activityIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.accent + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityBody: {
    flex: 1,
    minWidth: 0,
  },
  activityTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  activityTitle: {
    fontFamily: Typography.bodyBold,
    fontSize: 15,
    color: Colors.text,
    lineHeight: 20,
    flex: 1,
    minWidth: 0,
  },
  categoryBadge: {
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryBadgeText: {
    fontFamily: Typography.bodyMed,
    fontSize: 10,
  },
  activityMeta: {
    gap: 3,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  metaText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.slate,
    flex: 1,
  },
});
