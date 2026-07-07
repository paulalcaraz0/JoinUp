import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
  Dimensions,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { format } from 'date-fns';
import { Colors, Typography, Spacing, BorderRadius, Shadows, CategoryColors } from '../../../constants/theme';
import { PrimaryButton } from '../../../components/ui/PrimaryButton';
import { SlotProgressBar } from '../../../components/ui/SlotProgressBar';
import { AvatarStack } from '../../../components/ui/AvatarStack';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { EmptyState } from '../../../components/ui/EmptyState';
import { NavBar } from '../../../components/layout/NavBar';
import { useActivities } from '../../../hooks/useActivities';
import { useAuthStore } from '../../../store/authStore';
import { supabase } from '../../../lib/supabase';
import type { AvatarStackItem } from '../../../components/ui/AvatarStack';

export default function ActivityDetailScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = rawId ? rawId.toString().trim() : '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const galleryWidth = Dimensions.get('window').width - Spacing.lg * 2;
  const {
    activities,
    isLoading,
    error,
    joinActivity,
    leaveActivity,
    getJoinStatus,
    canAccessChat,
    deleteRejectedJoin,
    refetch,
  } = useActivities();
  const user = useAuthStore((s) => s.user);

  const [showJoinSheet, setShowJoinSheet] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [showPhotoViewer, setShowPhotoViewer] = useState(false);
  const galleryScrollRef = useRef<ScrollView>(null);
  const [participantProfiles, setParticipantProfiles] = useState<Record<string, { displayName: string; photoUrl: string }>>({});

  const activity = useMemo(
    () => activities.find((a) => a.id === id) ?? null,
    [activities, id]
  );
  const participantIds = useMemo(
    () => Array.from(new Set((activity?.participants ?? []).filter(Boolean))),
    [activity?.participants]
  );
  const participantAvatars = useMemo<AvatarStackItem[]>(
    () =>
      participantIds.map((participantId) => ({
        id: participantId,
        name: participantProfiles[participantId]?.displayName,
        photoUrl: participantProfiles[participantId]?.photoUrl,
      })),
    [participantIds, participantProfiles]
  );

  useEffect(() => {
    let isActive = true;

    const fetchParticipantProfiles = async () => {
      if (participantIds.length === 0) {
        if (isActive) {
          setParticipantProfiles({});
        }
        return;
      }

      try {
        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('id, display_name, photo_url')
          .in('id', participantIds);

        if (profileError) throw profileError;
        if (!isActive) return;

        const nextProfiles = (data ?? []).reduce<Record<string, { displayName: string; photoUrl: string }>>(
          (acc, profile: any) => {
            acc[profile.id] = {
              displayName: profile.display_name ?? '',
              photoUrl: profile.photo_url ?? '',
            };
            return acc;
          },
          {}
        );

        setParticipantProfiles(nextProfiles);
      } catch {
        if (isActive) {
          setParticipantProfiles({});
        }
      }
    };

    void fetchParticipantProfiles();

    return () => {
      isActive = false;
    };
  }, [participantIds]);

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <NavBar title="Activity" showBack />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </View>
    );
  }

  if (!activity) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <NavBar title="Activity" showBack />
        <EmptyState
          icon={error ? 'alert-circle-outline' : 'calendar-outline'}
          title={error ? 'Could not load activity' : 'Activity not found'}
          message={error ?? 'This activity may have been removed or is no longer available.'}
          actionLabel="Try again"
          onAction={() => {
            void refetch();
          }}
        />
      </View>
    );
  }

  const chipColor = CategoryColors[activity.category] ?? Colors.accent;
  const isHost = activity.hostId === user?.uid;
  const joinStatus = getJoinStatus(activity.id);
  const isParticipant = joinStatus === 'approved';
  const isFull = activity.currentSlots <= 0;
  const joined = activity.maxSlots - activity.currentSlots;
  const dateStr = activity.dateTime
    ? format(new Date(activity.dateTime), 'EEEE, MMMM d, h:mm a')
    : '';
  const hostInitial = (activity.hostName || 'H').trim().charAt(0).toUpperCase();
  const galleryImages = (activity.images ?? []).length > 0
    ? activity.images ?? []
    : activity.coverImage
      ? [activity.coverImage]
      : [];
  const selectedViewerImage = galleryImages[viewerIndex] ?? galleryImages[0] ?? '';

  const openPhotoViewer = (index: number) => {
    setViewerIndex(index);
    setShowPhotoViewer(true);
  };

  const handleJoin = async () => {
    if (!user) return;
    setIsJoining(true);
    try {
      const joined = await joinActivity(activity.id, user.uid);
      if (joined) {
        setShowJoinSheet(true);
      } else {
        Alert.alert('Could not join', 'This activity may already be full or your request may already be active.');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to join activity.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeave = async () => {
    if (!user) return;
    Alert.alert('Leave Activity', 'Are you sure you want to leave?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          const left = await leaveActivity(activity.id, user.uid);
          if (!left) {
            Alert.alert('Leave failed', error ?? 'Could not leave this activity. Please try again.');
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Images Gallery */}
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <View style={styles.imageGallery}>
            {galleryImages.length > 0 ? (
              <ScrollView
                ref={galleryScrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onMomentumScrollEnd={(event) => {
                  const nextIndex = Math.round(event.nativeEvent.contentOffset.x / galleryWidth);
                  setGalleryIndex(nextIndex);
                }}
                style={styles.imageCarousel}
              >
                {galleryImages.map((imageUrl, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.galleryImage, { width: galleryWidth }]}
                    activeOpacity={0.94}
                    onPress={() => openPhotoViewer(index)}
                  >
                    <Image
                      source={{ uri: imageUrl }}
                      style={styles.galleryImageContent}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.coverPlaceholder}>
                <Ionicons name="image-outline" size={48} color={Colors.slate} />
              </View>
            )}
            {galleryImages.length > 1 && (
              <View style={styles.imageCounter}>
                <Text style={styles.imageCountText}>{galleryIndex + 1} / {galleryImages.length}</Text>
              </View>
            )}
            {galleryImages.length > 1 && (
              <View style={styles.thumbnailRail}>
                {galleryImages.slice(0, 4).map((imageUrl, index) => {
                  const hiddenCount = galleryImages.length - 4;
                  const showMore = index === 3 && hiddenCount > 0;

                  return (
                    <TouchableOpacity
                      key={`${imageUrl}-${index}`}
                      style={[
                        styles.thumbnailButton,
                        galleryIndex === index && styles.thumbnailButtonActive,
                      ]}
                      activeOpacity={0.84}
                      onPress={() => {
                        galleryScrollRef.current?.scrollTo({ x: galleryWidth * index, animated: true });
                        setGalleryIndex(index);
                        openPhotoViewer(index);
                      }}
                    >
                      <Image source={{ uri: imageUrl }} style={styles.thumbnailImage} resizeMode="cover" />
                      {showMore ? (
                        <View style={styles.thumbnailMoreOverlay}>
                          <Text style={styles.thumbnailMoreText}>+{hiddenCount}</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            <View style={styles.galleryControls}>
              <TouchableOpacity
                onPress={() => router.back()}
                style={styles.galleryControlBtn}
                activeOpacity={0.84}
              >
                <Ionicons name="close" size={20} color={Colors.white} />
              </TouchableOpacity>
              {isHost ? (
                <TouchableOpacity
                  onPress={() => router.push(`/activity/${id}/manage` as never)}
                  style={styles.galleryControlBtn}
                  activeOpacity={0.84}
                >
                  <Ionicons name="settings-outline" size={20} color={Colors.white} />
                </TouchableOpacity>
              ) : (
                <View style={styles.galleryControlSpacer} />
              )}
            </View>
          </View>
        </Animated.View>

        {/* Title */}
        <Animated.View entering={FadeInDown.delay(150).springify()} style={styles.titleSection}>
          <Text style={styles.title}>{activity.title}</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Ionicons name="star" size={15} color={Colors.text} />
              <Text style={styles.summaryText}>
                {activity.reactions.like + activity.reactions.heart + activity.reactions.fire > 0
                  ? `${activity.reactions.like + activity.reactions.heart + activity.reactions.fire} reactions`
                  : 'New activity'}
              </Text>
            </View>
            <Text style={styles.summaryDot}>-</Text>
            <Text style={styles.summaryText}>{joined}/{activity.maxSlots} going</Text>
          </View>
        </Animated.View>

        {/* Host info */}
        <Animated.View entering={FadeInDown.delay(200).springify()} style={styles.hostCard}>
          <View>
            <Text style={styles.hostCardTitle}>{activity.category} activity</Text>
            <Text style={styles.hostText}>Hosted by {activity.hostName || 'Host'}</Text>
          </View>
          <View style={styles.hostAvatar}>
            {activity.hostPhoto ? (
              <Image source={{ uri: activity.hostPhoto }} style={styles.hostAvatarImage} resizeMode="cover" />
            ) : (
              <Text style={styles.hostAvatarInitial}>{hostInitial}</Text>
            )}
          </View>
        </Animated.View>

        {/* Date and location */}
        <Animated.View entering={FadeInDown.delay(250).springify()} style={styles.infoSection}>
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Ionicons name="calendar-outline" size={20} color={Colors.accent} />
            </View>
            <View style={styles.infoTextBlock}>
              <Text style={styles.infoLabel}>Date & Time</Text>
              <Text style={styles.infoValue}>{dateStr}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <View style={styles.infoIcon}>
              <Ionicons name="location-outline" size={20} color={Colors.accent} />
            </View>
            <View style={styles.infoTextBlock}>
              <Text style={styles.infoLabel}>Location</Text>
              <Text style={styles.infoValue}>{activity.location.name}</Text>
            </View>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).springify()} style={styles.amenitiesSection}>
          <Text style={styles.sectionTitle}>Activity info</Text>
          <View style={styles.amenitiesList}>
            <View style={[styles.amenityPill, { backgroundColor: chipColor + '14' }]}>
              <Text style={[styles.amenityText, { color: chipColor }]}>{activity.category}</Text>
            </View>
            <View style={styles.amenityPill}>
              <Text style={styles.amenityText}>{activity.requiresApproval ? 'Approval required' : 'Instant join'}</Text>
            </View>
            <View style={styles.amenityPill}>
              <Text style={styles.amenityText}>{activity.currentSlots} spots left</Text>
            </View>
            {isFull ? (
              <View style={styles.fullBadge}>
                <Text style={styles.fullBadgeText}>Full</Text>
              </View>
            ) : null}
          </View>
        </Animated.View>

        {/* Description */}
        <Animated.View entering={FadeInDown.delay(350).springify()} style={styles.descSection}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.description}>{activity.description}</Text>
        </Animated.View>

        {/* Participants */}
        <Animated.View entering={FadeInDown.delay(400).springify()} style={styles.participantsSection}>
          <Text style={styles.sectionTitle}>Participants</Text>
          <View style={styles.participantsRow}>
            <AvatarStack count={activity.participants.length} size={32} avatars={participantAvatars} />
            <Text style={styles.participantCount}>
              {joined}/{activity.maxSlots} spots filled
            </Text>
          </View>
          <SlotProgressBar current={joined} max={activity.maxSlots} />
        </Animated.View>

        {/* Reactions */}
        <Animated.View entering={FadeInDown.delay(450).springify()} style={styles.reactionsSection}>
          <Text style={styles.sectionTitle}>Reactions</Text>
          <View style={styles.reactionsRow}>
          <TouchableOpacity style={styles.reactionBtn}>
            <Ionicons name="flame-outline" size={15} color={Colors.accent} />
            <Text style={styles.reactionCount}>{activity.reactions.fire}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reactionBtn}>
            <Ionicons name="heart-outline" size={15} color={Colors.error} />
            <Text style={styles.reactionCount}>{activity.reactions.heart}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reactionBtn}>
            <Ionicons name="thumbs-up-outline" size={15} color={Colors.success} />
            <Text style={styles.reactionCount}>{activity.reactions.like}</Text>
          </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>

      {/* Bottom action */}
      <Animated.View
        entering={FadeInUp.delay(500).springify()}
        style={[styles.bottomBar, { paddingBottom: insets.bottom + Spacing.md }]}
      >
        {isParticipant || isHost ? (
          <View style={styles.bottomActions}>
            <PrimaryButton
              title="Open Chat"
              onPress={() => {
                if (canAccessChat(activity.id, activity.hostId)) {
                  router.push(`/chat/${activity.id}`);
                }
              }}
              style={styles.chatBtn}
            />
            {!isHost && (
              <TouchableOpacity style={styles.leaveBtn} onPress={handleLeave}>
                <Text style={styles.leaveBtnText}>Leave</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : joinStatus === 'pending' ? (
          <PrimaryButton
            title="Waiting for approval"
            onPress={() => {}}
            disabled
            style={styles.joinBtn}
          />
        ) : joinStatus === 'rejected' ? (
          <PrimaryButton
            title="Delete Rejected Request"
            onPress={async () => {
              const removed = await deleteRejectedJoin(activity.id);
              if (!removed) {
                Alert.alert('Delete failed', 'Could not remove this rejected request.');
              }
            }}
            style={styles.joinBtn}
          />
        ) : (
          <PrimaryButton
            title={isFull ? 'Activity Full' : 'Join Activity'}
            onPress={handleJoin}
            loading={isJoining}
            disabled={isFull}
            style={styles.joinBtn}
          />
        )}
      </Animated.View>

      {/* Join Confirmation Sheet */}
      <BottomSheet
        visible={showJoinSheet}
        onClose={() => setShowJoinSheet(false)}
        snapPoints={[320]}
      >
        <View style={styles.confirmSheet}>
          <View style={styles.checkCircle}>
            <Ionicons name="checkmark" size={36} color={Colors.white} />
          </View>
          <Text style={styles.confirmTitle}>Request Sent</Text>
          <Text style={styles.confirmMessage}>
            {activity.requiresApproval
              ? `Your request to join ${activity.title} is pending. Chat unlocks when the host approves it.`
              : `You're in ${activity.title}. Chat unlocks once your spot is confirmed.`}
          </Text>
          <PrimaryButton
            title="Got it"
            onPress={() => {
              setShowJoinSheet(false);
            }}
            style={{ marginTop: Spacing.md }}
          />
        </View>
      </BottomSheet>

      <Modal
        visible={showPhotoViewer}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPhotoViewer(false)}
      >
        <View style={styles.photoViewer}>
          <TouchableOpacity
            style={[styles.photoViewerClose, { top: insets.top + Spacing.md }]}
            onPress={() => setShowPhotoViewer(false)}
            activeOpacity={0.84}
          >
            <Ionicons name="close" size={22} color={Colors.white} />
          </TouchableOpacity>
          {galleryImages.length > 1 ? (
            <View style={[styles.photoViewerCounter, { top: insets.top + Spacing.md }]}>
              <Text style={styles.photoViewerCounterText}>{viewerIndex + 1} / {galleryImages.length}</Text>
            </View>
          ) : null}
          {selectedViewerImage ? (
            <Image source={{ uri: selectedViewerImage }} style={styles.photoViewerImage} resizeMode="contain" />
          ) : null}
          {galleryImages.length > 1 ? (
            <View style={[styles.photoViewerNav, { bottom: insets.bottom + Spacing.xl }]}>
              <TouchableOpacity
                style={styles.photoViewerNavBtn}
                onPress={() => setViewerIndex((current) => (current === 0 ? galleryImages.length - 1 : current - 1))}
                activeOpacity={0.84}
              >
                <Ionicons name="chevron-back" size={22} color={Colors.white} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.photoViewerNavBtn}
                onPress={() => setViewerIndex((current) => (current + 1) % galleryImages.length)}
                activeOpacity={0.84}
              >
                <Ionicons name="chevron-forward" size={22} color={Colors.white} />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundText: {
    fontFamily: Typography.body,
    fontSize: 16,
    color: Colors.slate,
  },
  content: {
    paddingBottom: 132,
    paddingTop: Spacing.sm,
  },
  imageGallery: {
    height: 330,
    backgroundColor: Colors.primary + '12',
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.sheet,
    overflow: 'hidden',
    position: 'relative',
    ...Shadows.soft,
  },
  imageCarousel: {
    width: '100%',
    height: '100%',
  },
  galleryImage: {
    height: '100%',
  },
  galleryImageContent: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.mutedSurface,
  },
  imageCounter: {
    position: 'absolute',
    bottom: Spacing.md,
    right: Spacing.md,
    backgroundColor: 'rgba(21, 34, 56, 0.62)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: BorderRadius.pill,
  },
  imageCountText: {
    fontFamily: Typography.bodyBold,
    fontSize: 12,
    color: Colors.white,
  },
  thumbnailRail: {
    position: 'absolute',
    top: 74,
    right: Spacing.sm,
    width: 42,
    borderRadius: 14,
    padding: 4,
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.38)',
  },
  thumbnailButton: {
    width: 32,
    height: 32,
    borderRadius: 9,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.72)',
    backgroundColor: Colors.white,
  },
  thumbnailButtonActive: {
    borderColor: Colors.accent,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailMoreOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(21, 34, 56, 0.58)',
  },
  thumbnailMoreText: {
    fontFamily: Typography.bodyBold,
    fontSize: 10,
    color: Colors.white,
  },
  galleryControls: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  galleryControlBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(21, 34, 56, 0.46)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  galleryControlSpacer: {
    width: 40,
    height: 40,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  categoryText: {
    fontFamily: Typography.bodyMed,
    fontSize: 13,
  },
  fullBadge: {
    backgroundColor: Colors.danger + '12',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: Colors.danger + '22',
  },
  fullBadgeText: {
    fontFamily: Typography.bodyBold,
    fontSize: 12,
    color: Colors.danger,
  },
  title: {
    fontFamily: Typography.display,
    fontSize: 25,
    color: Colors.text,
    lineHeight: 31,
  },
  titleSection: {
    marginHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: Spacing.sm,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  summaryText: {
    fontFamily: Typography.bodyBold,
    fontSize: 13,
    color: Colors.text,
  },
  summaryDot: {
    fontFamily: Typography.bodyBold,
    fontSize: 14,
    color: Colors.slate,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  hostAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.peach,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  hostAvatarImage: {
    width: '100%',
    height: '100%',
  },
  hostAvatarInitial: {
    fontFamily: Typography.bodyBold,
    fontSize: 18,
    color: Colors.white,
  },
  hostText: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: Colors.slate,
    marginTop: 3,
  },
  hostCard: {
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  hostCardTitle: {
    fontFamily: Typography.bodyBold,
    fontSize: 16,
    color: Colors.text,
  },
  infoSection: {
    marginHorizontal: Spacing.lg,
    gap: 0,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    paddingVertical: Spacing.sm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  infoIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accent + '12',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  infoTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  infoLabel: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.slate,
  },
  infoValue: {
    fontFamily: Typography.bodyMed,
    fontSize: 14,
    color: Colors.text,
    marginTop: 1,
    lineHeight: 20,
    flexShrink: 1,
  },
  amenitiesSection: {
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  amenitiesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  amenityPill: {
    backgroundColor: Colors.mutedSurface,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  amenityText: {
    fontFamily: Typography.bodyBold,
    fontSize: 12,
    color: Colors.textSecondary,
  },
  descSection: {
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  sectionTitle: {
    fontFamily: Typography.bodyBold,
    fontSize: 16,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  description: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 22,
  },
  participantsSection: {
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  participantsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.sm,
  },
  participantCount: {
    fontFamily: Typography.bodyMed,
    fontSize: 14,
    color: Colors.slate,
  },
  reactionsSection: {
    marginHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  reactionsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  reactionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.divider,
    gap: 6,
  },
  reactionCount: {
    fontFamily: Typography.bodyMed,
    fontSize: 13,
    color: Colors.text,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopLeftRadius: BorderRadius.sheet,
    borderTopRightRadius: BorderRadius.sheet,
    ...Shadows.card,
  },
  bottomActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  chatBtn: {
    flex: 1,
  },
  leaveBtn: {
    borderWidth: 1.5,
    borderColor: Colors.danger,
    borderRadius: BorderRadius.button,
    paddingHorizontal: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveBtnText: {
    fontFamily: Typography.bodyBold,
    fontSize: 14,
    color: Colors.danger,
  },
  joinBtn: {
    width: '100%',
  },
  manageBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoViewer: {
    flex: 1,
    backgroundColor: 'rgba(4, 8, 15, 0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoViewerImage: {
    width: '100%',
    height: '78%',
  },
  photoViewerClose: {
    position: 'absolute',
    left: Spacing.lg,
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoViewerCounter: {
    position: 'absolute',
    right: Spacing.lg,
    zIndex: 2,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  photoViewerCounterText: {
    fontFamily: Typography.bodyBold,
    fontSize: 12,
    color: Colors.white,
  },
  photoViewerNav: {
    position: 'absolute',
    flexDirection: 'row',
    gap: Spacing.md,
  },
  photoViewerNavBtn: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmSheet: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  confirmTitle: {
    fontFamily: Typography.display,
    fontSize: 22,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  confirmMessage: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.slate,
    textAlign: 'center',
    lineHeight: 20,
  },
});
