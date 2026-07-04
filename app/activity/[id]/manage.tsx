import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Image,
  ScrollView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../../constants/theme';
import { NavBar } from '../../../components/layout/NavBar';
import { SlotProgressBar } from '../../../components/ui/SlotProgressBar';
import { PrimaryButton } from '../../../components/ui/PrimaryButton';
import { SecondaryButton } from '../../../components/ui/SecondaryButton';
import { useActivities } from '../../../hooks/useActivities';
import { useAuthStore } from '../../../store/authStore';
import { supabase } from '../../../lib/supabase';

type PendingJoinRequest = {
  id: string;
  userId: string;
  displayName: string;
  photoUrl: string;
  joinedAt: string;
};

type PickedImage = {
  uri: string;
  mimeType?: string | null;
  base64?: string | null;
  file?: Blob;
  fileSize?: number;
};

type UploadPayload = {
  body: Blob | ArrayBuffer;
  contentType: string;
};

type ParticipantRowProps = {
  userId: string;
  displayName: string;
  photoUrl: string;
  index: number;
  hostId: string;
  onRemove: (userId: string) => void;
};

const deriveImageExtension = (uri: string, mimeType?: string): string => {
  if (mimeType?.startsWith('image/')) {
    const fromMime = mimeType.split('/')[1]?.toLowerCase();
    if (fromMime) {
      return fromMime === 'jpeg' ? 'jpg' : fromMime;
    }
  }

  const sanitizedUri = uri.split('?')[0].toLowerCase();
  const match = sanitizedUri.match(/\.(jpg|jpeg|png|webp|heic|heif)$/);
  if (match?.[1]) {
    return match[1] === 'jpeg' ? 'jpg' : match[1];
  }

  return 'jpg';
};

const isWebBlobFile = (value: unknown): value is Blob => {
  return typeof Blob !== 'undefined' && value instanceof Blob;
};

const ParticipantRow = React.memo(function ParticipantRow({
  userId,
  displayName,
  photoUrl,
  index,
  hostId,
  onRemove,
}: ParticipantRowProps) {
  const handleRemove = useCallback(() => {
    onRemove(userId);
  }, [onRemove, userId]);

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <View style={[styles.participantRow, Shadows.card]}>
        <View style={styles.participantAvatar}>
          {photoUrl ? (
            <Image source={{ uri: photoUrl }} style={styles.participantAvatarImage} resizeMode="cover" />
          ) : (
            <Ionicons name="person" size={18} color={Colors.white} />
          )}
        </View>
        <View style={styles.participantInfo}>
          <Text style={styles.participantName}>
            {userId === hostId ? `${displayName || userId} (Host)` : displayName || userId}
          </Text>
        </View>
        {userId !== hostId && (
          <TouchableOpacity
            onPress={handleRemove}
            style={styles.removeBtn}
          >
            <Ionicons name="close-circle" size={22} color={Colors.danger} />
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
});

export default function ManageActivityScreen() {
  const { id: rawId } = useLocalSearchParams<{ id: string }>();
  const id = rawId ? rawId.toString().trim() : '';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const {
    activities,
    error: activityError,
    leaveActivity,
    cancelHostedActivity,
    completeHostedActivity,
    approveJoinRequest,
    rejectJoinRequest,
    refetch,
  } = useActivities();

  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<PendingJoinRequest[]>([]);
  const [participantProfiles, setParticipantProfiles] = useState<Record<string, { displayName: string; photoUrl: string }>>({});
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [isCancellingActivity, setIsCancellingActivity] = useState(false);
  const [isCompletingActivity, setIsCompletingActivity] = useState(false);

  const activity = useMemo(
    () => activities.find((a) => a.id === id) ?? null,
    [activities, id]
  );

  const fetchPendingRequests = useCallback(async () => {
    if (!activity?.requiresApproval || !activity?.id) {
      setPendingRequests([]);
      setIsLoadingRequests(false);
      return;
    }

    try {
      setIsLoadingRequests(true);

      const { data: participantRows, error: participantError } = await supabase
        .from('participants')
        .select('id, user_id, joined_at')
        .eq('activity_id', activity.id)
        .eq('status', 'pending')
        .order('joined_at', { ascending: false });

      if (participantError) throw participantError;

      const requesterIds = (participantRows ?? []).map((row) => row.user_id);
      let profileMap: Record<string, { display_name: string; photo_url: string }> = {};

      if (requesterIds.length > 0) {
        const { data: profileRows, error: profileError } = await supabase
          .from('profiles')
          .select('id, display_name, photo_url')
          .in('id', requesterIds);

        if (profileError) throw profileError;

        profileMap = (profileRows ?? []).reduce<Record<string, { display_name: string; photo_url: string }>>(
          (acc, profile) => {
            acc[profile.id] = {
              display_name: profile.display_name ?? '',
              photo_url: profile.photo_url ?? '',
            };
            return acc;
          },
          {}
        );
      }

      setPendingRequests(
        (participantRows ?? []).map((row) => ({
          id: row.id,
          userId: row.user_id,
          displayName: profileMap[row.user_id]?.display_name || row.user_id,
          photoUrl: profileMap[row.user_id]?.photo_url || '',
          joinedAt: row.joined_at,
        }))
      );
    } catch {
      setPendingRequests([]);
    } finally {
      setIsLoadingRequests(false);
    }
  }, [activity?.id, activity?.requiresApproval]);

  const fetchParticipantProfiles = useCallback(async () => {
    if (!activity?.participants?.length) {
      setParticipantProfiles({});
      return;
    }

    try {
      const participantIds = Array.from(new Set(activity.participants.filter(Boolean)));

      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('id, display_name, photo_url')
        .in('id', participantIds);

      if (profileError) throw profileError;

      const profileMap = (profileRows ?? []).reduce<Record<string, { displayName: string; photoUrl: string }>>(
        (acc, profile) => {
          acc[profile.id] = {
            displayName: profile.display_name ?? '',
            photoUrl: profile.photo_url ?? '',
          };
          return acc;
        },
        {}
      );

      setParticipantProfiles(profileMap);
    } catch {
      setParticipantProfiles({});
    }
  }, [activity?.participants]);

  useEffect(() => {
    let isActive = true;

    if (!isActive) return;
    void fetchPendingRequests();

    return () => {
      isActive = false;
    };
  }, [fetchPendingRequests]);

  useEffect(() => {
    let isActive = true;

    const loadParticipantProfiles = async () => {
      await fetchParticipantProfiles();
    };

    if (!isActive) return;
    void loadParticipantProfiles();

    return () => {
      isActive = false;
    };
  }, [fetchParticipantProfiles]);

  const createUploadPayload = async (image: PickedImage): Promise<UploadPayload> => {
    if (typeof image.fileSize === 'number' && image.fileSize <= 0) {
      throw new Error('Selected image is empty. Please pick a different photo.');
    }

    if (isWebBlobFile(image.file)) {
      if (image.file.size === 0) {
        throw new Error('Selected image is empty. Please pick a different photo.');
      }

      return {
        body: image.file,
        contentType: image.file.type || image.mimeType || 'image/jpeg',
      };
    }

    // On native devices, prefer picker base64 to avoid zero-byte fetch(uri) blobs.
    if (Platform.OS !== 'web') {
      const base64 = image.base64 ?? await readAsStringAsync(image.uri, { encoding: 'base64' });
      if (!base64 || base64.length === 0) {
        throw new Error('Could not read selected image data.');
      }

      const decoded = decode(base64);
      if (decoded.byteLength === 0) {
        throw new Error('Selected image decoded to an empty file.');
      }

      return {
        body: decoded,
        contentType: image.mimeType || 'image/jpeg',
      };
    }

    try {
      // Try fetch first (works on web/localhost)
      const response = await fetch(image.uri);
      const blob = await response.blob();

      if (!blob || blob.size === 0) {
        throw new Error('Image fetch returned an empty file.');
      }

      return {
        body: blob,
        contentType: blob.type || image.mimeType || 'image/jpeg',
      };
    } catch (err) {
      // Prefer picker-provided base64 on native because ph:// URIs can fail fetch/read.
      const base64 = image.base64 ?? await readAsStringAsync(image.uri, { encoding: 'base64' });
      if (!base64 || base64.length === 0) {
        throw new Error('Could not read selected image data.');
      }

      const decoded = decode(base64);
      if (decoded.byteLength === 0) {
        throw new Error('Selected image decoded to an empty file.');
      }

      return {
        body: decoded,
        contentType: image.mimeType || 'image/jpeg',
      };
    }
  };

  const uploadActivityImage = async (image: PickedImage): Promise<string> => {
    const payload = await createUploadPayload(image);
    const extension = deriveImageExtension(image.uri, image.mimeType ?? payload.contentType);
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    const path = `activity-covers/${user?.uid ?? 'anon'}-${activity?.id}-${Date.now()}-${randomSuffix}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from('activity-images')
      .upload(path, payload.body, {
        upsert: false,
        contentType: payload.contentType,
      });

    if (uploadError) {
      throw uploadError;
    }

    return supabase.storage.from('activity-images').getPublicUrl(path).data.publicUrl;
  };

  const handleAddImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow media access to add images.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
        base64: Platform.OS !== 'web',
      });

      if (result.canceled || !result.assets?.[0]?.uri) {
        return;
      }

      setIsUploadingImage(true);
      const picked = result.assets[0];
      const imageUrl = await uploadActivityImage({
        uri: picked.uri,
        mimeType: picked.mimeType,
        base64: picked.base64,
        file: (picked as any).file,
        fileSize: picked.fileSize,
      });

      // Update activity with new image
      const currentImages = activity?.images ?? [];
      const updatedImages = [...currentImages, imageUrl];
      const nextCoverImage = activity?.coverImage ?? updatedImages[0] ?? null;

      const { error } = await supabase
        .from('activities')
        .update({
          images: updatedImages,
          cover_image: nextCoverImage,
        })
        .eq('id', id);

      if (error) throw error;

      await refetch();

      Alert.alert('Success', 'Image added successfully!');
    } catch {
      Alert.alert('Upload failed', 'Could not upload the image. Please try again.');
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleDeleteImage = (imageUrl: string) => {
    Alert.alert(
      'Delete Image',
      'Are you sure you want to remove this image?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedImages = (activity?.images ?? []).filter((img) => img !== imageUrl);
              const nextCoverImage = updatedImages[0] ?? null;

              const { error } = await supabase
                .from('activities')
                .update({
                  images: updatedImages,
                  cover_image: nextCoverImage,
                })
                .eq('id', id);

              if (error) throw error;

              await refetch();

              Alert.alert('Success', 'Image deleted successfully!');
            } catch {
              Alert.alert('Error', 'Could not delete the image.');
            }
          },
        },
      ]
    );
  };

  const handleRemoveParticipant = useCallback((userId: string) => {
    if (!activity) return;

    Alert.alert(
      'Remove Participant',
      'Are you sure you want to remove this participant?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await leaveActivity(activity.id, userId);
          },
        },
      ]
    );
  }, [activity, leaveActivity]);

  const handleApproveRequest = async (request: PendingJoinRequest) => {
    if (!activity) return;

    setProcessingRequestId(request.id);
    try {
      const approved = await approveJoinRequest(activity.id, request.userId);
      if (!approved) {
        Alert.alert('Approve failed', activityError ?? 'Could not approve this request.');
        return;
      }

      setPendingRequests((prev) => prev.filter((item) => item.id !== request.id));
      await refetch();
      await fetchPendingRequests();
      Alert.alert('Approved', `${request.displayName} can now join the chat.`);
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleRejectRequest = async (request: PendingJoinRequest) => {
    if (!activity) return;

    setProcessingRequestId(request.id);
    try {
      const rejected = await rejectJoinRequest(activity.id, request.userId);
      if (!rejected) {
        Alert.alert('Reject failed', activityError ?? 'Could not reject this request.');
        return;
      }

      setPendingRequests((prev) => prev.filter((item) => item.id !== request.id));
      await refetch();
      await fetchPendingRequests();
      Alert.alert('Rejected', `${request.displayName} was notified.`);
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleCancelActivity = () => {
    if (!activity || activity.hostId !== user?.uid) return;

    Alert.alert(
      'Cancel Activity',
      'Are you sure you want to cancel this activity? It will no longer be joinable.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Activity',
          style: 'destructive',
          onPress: async () => {
            setIsCancellingActivity(true);
            try {
              const cancelled = await cancelHostedActivity(activity.id);
              if (!cancelled) {
                Alert.alert('Cancel failed', activityError ?? 'Could not cancel this activity.');
                return;
              }

              Alert.alert('Activity cancelled', 'The activity is no longer joinable.', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } finally {
              setIsCancellingActivity(false);
            }
          },
        },
      ]
    );
  };

  const handleCompleteActivity = () => {
    if (!activity || activity.hostId !== user?.uid) return;

    Alert.alert(
      'Mark Completed',
      'Mark this activity as completed? Participants will be able to rate each other afterward.',
      [
        { text: 'Keep Active', style: 'cancel' },
        {
          text: 'Mark Completed',
          onPress: async () => {
            setIsCompletingActivity(true);
            try {
              const completed = await completeHostedActivity(activity.id);
              if (!completed) {
                Alert.alert('Update failed', activityError ?? 'Could not complete this activity.');
                return;
              }

              Alert.alert('Activity completed', 'Ratings are now available for participants.', [
                { text: 'OK', onPress: () => router.back() },
              ]);
            } finally {
              setIsCompletingActivity(false);
            }
          },
        },
      ]
    );
  };

  const renderParticipant = useCallback(
    ({ item, index }: { item: string; index: number }) => (
      <ParticipantRow
        userId={item}
        displayName={
          participantProfiles[item]?.displayName ||
          (item === activity?.hostId ? activity?.hostName || '' : '')
        }
        photoUrl={
          participantProfiles[item]?.photoUrl ||
          (item === activity?.hostId ? activity?.hostPhoto || '' : '')
        }
        index={index}
        hostId={activity?.hostId ?? ''}
        onRemove={handleRemoveParticipant}
      />
    ),
    [activity?.hostId, activity?.hostName, activity?.hostPhoto, handleRemoveParticipant, participantProfiles]
  );

  if (!activity) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <NavBar title="Manage" showBack />
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Activity not found</Text>
        </View>
      </View>
    );
  }

  const joined = activity.maxSlots - activity.currentSlots;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <NavBar title="Host Dashboard" showBack />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {/* Activity summary */}
          <View style={[styles.summaryCard, Shadows.card]}>
            <Text style={styles.activityTitle}>{activity.title}</Text>
            <View style={styles.slotInfo}>
              <Text style={styles.slotText}>
                {joined}/{activity.maxSlots} participants
              </Text>
              <SlotProgressBar current={joined} max={activity.maxSlots} showLabel={false} />
            </View>
          </View>

          {/* Image Gallery */}
          <Text style={styles.sectionTitle}>Photos ({(activity.images ?? []).length})</Text>
          <View style={[styles.imageGallery, Shadows.card]}>
            {(activity.images ?? []).length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScrollView}>
                {activity.images!.map((imageUrl, index) => (
                  <View key={index} style={styles.imageContainer}>
                    <Image source={{ uri: imageUrl }} style={styles.galleryImage} />
                    <TouchableOpacity
                      style={styles.deleteImageBtn}
                      onPress={() => handleDeleteImage(imageUrl)}
                    >
                      <Ionicons name="close-circle" size={24} color={Colors.white} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyGallery}>
                <Ionicons name="images-outline" size={32} color={Colors.slate} />
                <Text style={styles.emptyGalleryText}>No photos yet</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.addImageBtn}
              onPress={handleAddImage}
              disabled={isUploadingImage}
            >
              <Ionicons name="add-circle-outline" size={20} color={Colors.accent} />
              <Text style={styles.addImageText}>{isUploadingImage ? 'Uploading...' : 'Add Photo'}</Text>
            </TouchableOpacity>
          </View>

          {/* Participants list */}
          <Text style={styles.sectionTitle}>Participants ({activity.participants.length})</Text>

          <FlatList
            data={activity.participants}
            keyExtractor={(item) => item}
            renderItem={renderParticipant}
            contentContainerStyle={styles.listContent}
            scrollEnabled={false}
          />

          {activity.requiresApproval && (
            <>
              <Text style={styles.sectionTitle}>Pending Requests</Text>
              {isLoadingRequests ? (
                <View style={[styles.pendingCard, Shadows.card]}>
                  <Text style={styles.emptyText}>Loading requests...</Text>
                </View>
              ) : pendingRequests.length === 0 ? (
                <View style={[styles.pendingCard, Shadows.card]}>
                  <Text style={styles.emptyText}>No pending join requests.</Text>
                </View>
              ) : (
                pendingRequests.map((request) => (
                  <View key={request.id} style={[styles.pendingCard, Shadows.card]}>
                    <View style={styles.pendingHeader}>
                      <View style={styles.participantAvatar}>
                        {request.photoUrl ? (
                          <Image source={{ uri: request.photoUrl }} style={styles.pendingAvatarImage} />
                        ) : (
                          <Ionicons name="person" size={18} color={Colors.white} />
                        )}
                      </View>
                      <View style={styles.participantInfo}>
                        <Text style={styles.participantName}>{request.displayName}</Text>
                        <Text style={styles.pendingMeta}>Requested to join</Text>
                      </View>
                    </View>
                    <View style={styles.pendingActions}>
                      <SecondaryButton
                        title="Reject"
                        onPress={() => void handleRejectRequest(request)}
                        loading={processingRequestId === request.id}
                        style={styles.pendingActionBtn}
                      />
                      <PrimaryButton
                        title="Approve"
                        onPress={() => void handleApproveRequest(request)}
                        loading={processingRequestId === request.id}
                        style={styles.pendingActionBtn}
                      />
                    </View>
                  </View>
                ))
              )}
            </>
          )}

          {/* Complete or cancel activity */}
          <TouchableOpacity
            style={styles.completeBtn}
            onPress={handleCompleteActivity}
            disabled={isCompletingActivity}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color={Colors.success} />
            <Text style={styles.completeBtnText}>
              {isCompletingActivity ? 'Completing...' : 'Mark Completed'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={handleCancelActivity}
            disabled={isCancellingActivity}
          >
            <Ionicons name="trash-outline" size={18} color={Colors.danger} />
            <Text style={styles.cancelBtnText}>Cancel Activity</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  content: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.card,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  activityTitle: {
    fontFamily: Typography.bodyBold,
    fontSize: 18,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  slotInfo: {
    gap: Spacing.sm,
  },
  slotText: {
    fontFamily: Typography.bodyMed,
    fontSize: 14,
    color: Colors.slate,
  },
  sectionTitle: {
    fontFamily: Typography.bodyBold,
    fontSize: 16,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  listContent: {
    paddingBottom: Spacing.lg,
  },
  participantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.card,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    ...Shadows.hairline,
  },
  participantAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.peach,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
    overflow: 'hidden',
  },
  participantAvatarImage: {
    width: '100%',
    height: '100%',
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontFamily: Typography.bodyMed,
    fontSize: 15,
    color: Colors.text,
  },
  pendingCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.card,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    ...Shadows.hairline,
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  pendingAvatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  pendingMeta: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: Colors.slate,
    marginTop: 2,
  },
  pendingActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  pendingActionBtn: {
    flex: 1,
  },
  removeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  completeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.success + '33',
    borderRadius: BorderRadius.button,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  completeBtnText: {
    fontFamily: Typography.bodyBold,
    fontSize: 15,
    color: Colors.success,
  },
  cancelBtnText: {
    fontFamily: Typography.bodyBold,
    fontSize: 15,
    color: Colors.danger,
  },
  emptyText: {
    fontFamily: Typography.body,
    fontSize: 16,
    color: Colors.slate,
  },
  scrollContent: {
    paddingVertical: Spacing.md,
  },
  imageGallery: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.card,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    ...Shadows.soft,
  },
  imageScrollView: {
    marginBottom: Spacing.md,
  },
  imageContainer: {
    position: 'relative',
    marginRight: Spacing.md,
  },
  galleryImage: {
    width: 120,
    height: 120,
    borderRadius: BorderRadius.md,
  },
  deleteImageBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: Colors.text,
    borderRadius: 12,
  },
  emptyGallery: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.lg,
  },
  emptyGalleryText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.slate,
    marginTop: Spacing.sm,
  },
  addImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
  },
  addImageText: {
    fontFamily: Typography.bodyMed,
    fontSize: 14,
    color: Colors.accent,
  },
});
