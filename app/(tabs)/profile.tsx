import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { format } from 'date-fns';
import { Colors, Typography, Spacing, BorderRadius, Shadows, CategoryColors } from '../../constants/theme';
import { CategoryChip } from '../../components/ui/CategoryChip';
import { BottomSheet } from '../../components/ui/BottomSheet';
import { InputField } from '../../components/ui/InputField';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { InputLimits, trimInput } from '../../lib/validation';
import { signOutAndResetSession } from '../../hooks/useAuth';
import { useActivities } from '../../hooks/useActivities';
import { useThemeStore } from '../../store/themeStore';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { JoinRequestStatus } from '../../types';

type ProfileTab = 'Joined' | 'Hosting' | 'Past';
type HistoryActivity = {
  id: string;
  title: string;
  category: string;
  coverImage?: string;
  dateTime: string;
  locationName: string;
  status: string;
  hostId: string;
  joinStatus?: JoinRequestStatus;
};

function mapHistoryActivity(row: any): HistoryActivity {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    coverImage: row.cover_image ?? undefined,
    dateTime: row.date_time,
    locationName: row.location_name ?? '',
    status: row.status ?? 'active',
    hostId: row.host_id,
    joinStatus: row.join_status,
  };
}

function dedupeById(items: HistoryActivity[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useThemeColors();
  const toggleThemeMode = useThemeStore((state) => state.toggleMode);
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const { activities, joinStatuses, joinedActivityIds, deleteRejectedJoin, canAccessChat } = useActivities();

  const [activeTab, setActiveTab] = useState<ProfileTab>('Joined');
  const [showEditSheet, setShowEditSheet] = useState(false);
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [authActionLoading, setAuthActionLoading] = useState<'switch' | 'logout' | 'delete' | null>(null);
  const [editName, setEditName] = useState(user?.displayName ?? '');
  const [editLocation, setEditLocation] = useState(user?.location ?? '');
  const [editBio, setEditBio] = useState(user?.bio ?? '');
  const [hostedActivities, setHostedActivities] = useState<HistoryActivity[]>([]);
  const [pastActivities, setPastActivities] = useState<HistoryActivity[]>([]);

  useEffect(() => {
    setEditName(user?.displayName ?? '');
    setEditLocation(user?.location ?? '');
    setEditBio(user?.bio ?? '');
  }, [user?.bio, user?.displayName, user?.location]);

  useEffect(() => {
    setPhotoLoadFailed(false);
  }, [user?.photoURL]);

  const fetchHistory = useCallback(async () => {
    if (!user?.uid) return;

    try {
      setHistoryLoading(true);
      setHistoryError(null);

      const { data: joinedRows, error: joinedError } = await supabase
        .from('participants')
        .select('activity_id, status')
        .eq('user_id', user.uid)
        .neq('status', 'cancelled');

      if (joinedError) throw joinedError;

      const joinedRowsByActivityId = new Map(
        (joinedRows ?? []).map((row: any) => [row.activity_id, row.status])
      );
      const joinedIds = Array.from(joinedRowsByActivityId.keys());

      let joinedActivitiesRaw: HistoryActivity[] = [];
      if (joinedIds.length > 0) {
        const { data: joinedActivitiesData, error: joinedActivitiesError } = await supabase
          .from('activities')
          .select('id, title, category, cover_image, date_time, location_name, status, host_id')
          .in('id', joinedIds)
          .eq('status', 'active')
          .order('date_time', { ascending: true });

        if (joinedActivitiesError) throw joinedActivitiesError;
        joinedActivitiesRaw = (joinedActivitiesData ?? []).map((row: any) => ({
          ...mapHistoryActivity(row),
          joinStatus: joinedRowsByActivityId.get(row.id) ?? 'pending',
        }));
      }

      const { data: hostedData, error: hostedError } = await supabase
        .from('activities')
        .select('id, title, category, cover_image, date_time, location_name, status, host_id')
        .eq('host_id', user.uid)
        .eq('status', 'active')
        .order('date_time', { ascending: true });

      if (hostedError) throw hostedError;

      const hostedRaw = (hostedData ?? []).map(mapHistoryActivity);

      const hostedAll = hostedRaw.sort(
        (left, right) => new Date(right.dateTime).getTime() - new Date(left.dateTime).getTime()
      );

      const past = dedupeById([...joinedActivitiesRaw, ...hostedRaw])
        .sort(
        (left, right) => new Date(right.dateTime).getTime() - new Date(left.dateTime).getTime()
      );

      setHostedActivities(hostedAll);
      setPastActivities(past);
    } catch (error: any) {
      setHistoryError(error.message ?? 'Failed to load profile activity history.');
    } finally {
      setHistoryLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useFocusEffect(
    useCallback(() => {
      void fetchHistory();
    }, [fetchHistory])
  );

  useEffect(() => {
    if (!user?.uid) return;

    const channel = supabase
      .channel(`profile-hosted:${user.uid}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activities',
          filter: `host_id=eq.${user.uid}`,
        },
        () => {
          void fetchHistory();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [fetchHistory, user?.uid]);

  useEffect(() => {
    if (!isUploadingPhoto) return;

    const timer = setTimeout(() => {
      setIsUploadingPhoto(false);
      Alert.alert('Upload timeout', 'Profile photo upload took too long. Please try again.');
    }, 30000);

    return () => clearTimeout(timer);
  }, [isUploadingPhoto]);

  const uploadProfilePhoto = useCallback(async (asset: ImagePicker.ImagePickerAsset): Promise<string> => {
    const uri = asset.uri;
    const extension = (uri.split('.').pop() ?? 'jpg').split('?')[0].toLowerCase();
    const path = `profile-photos/${user?.uid ?? 'anon'}-${Date.now()}.${extension}`;
    const bucket = 'activity-images';

    let uploadBody: Blob | File | ArrayBuffer;
    let contentType = asset.mimeType || 'image/jpeg';
    if ((asset as any).file) {
      // Web returns a native File object; upload it directly to avoid fetch(uri) stalls.
      uploadBody = (asset as any).file as File;
      contentType = uploadBody.type || contentType;
    } else if (asset.base64) {
      uploadBody = decode(asset.base64);
      if (uploadBody.byteLength === 0) {
        throw new Error('Selected image appears empty. Please pick a different photo.');
      }
    } else {
      const response = await withTimeout(fetch(uri), 15000, 'Timed out while reading selected image.');
      uploadBody = await withTimeout(response.blob(), 15000, 'Timed out while preparing selected image.');
      if ((uploadBody as Blob).size === 0) {
        throw new Error('Selected image appears empty. Please pick a different photo.');
      }
      contentType = (uploadBody as Blob).type || contentType;
    }

    const { error: uploadError } = await withTimeout(
      supabase.storage
        .from(bucket)
        .upload(path, uploadBody, {
          upsert: false,
          contentType,
        }),
      20000,
      'Timed out while uploading profile photo.'
    );

    if (uploadError) throw uploadError;
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }, [user?.uid]);

  const handleChangeProfilePhoto = useCallback(async () => {
    if (!user?.uid) return;
    if (isUploadingPhoto) return;

    try {
      setIsUploadingPhoto(true);

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow media access to pick a profile photo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.85,
        base64: true,
      });

      if (result.canceled || !result.assets?.[0]?.uri) {
        return;
      }

      const selectedAsset = result.assets[0];
      const photoUrl = await uploadProfilePhoto(selectedAsset);
      const updateResult = await withTimeout(
        (async () =>
          supabase
            .from('profiles')
            .update({ photo_url: photoUrl })
            .eq('id', user.uid))(),
        15000,
        'Timed out while saving profile photo.'
      );

      const { error } = updateResult;

      if (error) throw error;

      updateUser({ photoURL: photoUrl });
      Alert.alert('Updated', 'Profile photo updated successfully.');
    } catch (error: any) {
      Alert.alert('Upload failed', error.message ?? 'Could not update profile photo.');
    } finally {
      setIsUploadingPhoto(false);
    }
  }, [isUploadingPhoto, updateUser, uploadProfilePhoto, user?.uid]);

  const handleSaveProfile = useCallback(async () => {
    if (!user?.uid) return;
    const nextName = trimInput(editName);
    const nextLocation = trimInput(editLocation);
    const nextBio = trimInput(editBio);

    if (!nextName) {
      Alert.alert('Missing name', 'Display name is required.');
      return;
    }

    if (nextName.length > InputLimits.profileName) {
      Alert.alert('Name too long', `Keep your display name under ${InputLimits.profileName} characters.`);
      return;
    }

    if (nextLocation.length > InputLimits.profileLocation) {
      Alert.alert('Location too long', `Keep your location under ${InputLimits.profileLocation} characters.`);
      return;
    }

    if (nextBio.length > InputLimits.profileBio) {
      Alert.alert('Bio too long', `Keep your bio under ${InputLimits.profileBio} characters.`);
      return;
    }

    const updates: {
      display_name?: string;
      location?: string;
      bio?: string;
    } = {};

    const locationChanged = nextLocation !== (user.location ?? '').trim();

    if (nextName !== (user.displayName ?? '').trim()) {
      updates.display_name = nextName;
    }

    if (nextBio !== (user.bio ?? '').trim()) {
      updates.bio = nextBio;
    }

    if (locationChanged) {
      updates.location = nextLocation;
    }

    if (Object.keys(updates).length === 0 && !locationChanged) {
      setShowEditSheet(false);
      return;
    }

    try {
      setSaveLoading(true);

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.uid);

      if (error) throw error;

      const localUpdates: { displayName?: string; location?: string; bio?: string } = {};

      if (updates.display_name !== undefined) {
        localUpdates.displayName = nextName;
      }

      if (locationChanged) {
        localUpdates.location = nextLocation;
      }

      if (updates.bio !== undefined) {
        localUpdates.bio = nextBio;
      }

      updateUser(localUpdates);

      setShowEditSheet(false);
      Alert.alert('Saved', 'Profile updated successfully.');
    } catch (error: any) {
      Alert.alert('Save failed', error.message ?? 'Could not save your profile.');
    } finally {
      setSaveLoading(false);
    }
  }, [editBio, editLocation, editName, updateUser, user?.uid]);

  const handleAuthAction = useCallback(
    async (action: 'switch' | 'logout') => {
      const isSwitch = action === 'switch';
      try {
        setAuthActionLoading(action);
        setShowSettingsSheet(false);
        await signOutAndResetSession();
        await new Promise((resolve) => setTimeout(resolve, 250));
        router.replace(isSwitch ? '/(auth)/sign-in' : '/(auth)');
      } catch (error: any) {
        Alert.alert('Sign out failed', error.message ?? 'Could not complete the request.');
      } finally {
        setAuthActionLoading(null);
      }
    },
    [router]
  );

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account, profile data, hosted activities, and chat history. This cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            try {
              setAuthActionLoading('delete');
              setShowSettingsSheet(false);

              const { data, error } = await supabase.rpc('delete_my_account');
              if (error) throw error;
              if (!data) {
                throw new Error('Account deletion was not completed. Please try again.');
              }

              await signOutAndResetSession();
              router.replace('/(auth)');
            } catch (error: any) {
              const rawMessage = String(error?.message ?? '');
              const missingRpcFunction =
                rawMessage.toLowerCase().includes('delete_my_account') &&
                rawMessage.toLowerCase().includes('schema cache');

              if (missingRpcFunction) {
                Alert.alert(
                  'Delete unavailable',
                  'Database migration not applied yet. Run the latest Supabase migration (including 007_delete_own_account.sql), then try again.'
                );
              } else {
                Alert.alert('Delete failed', error.message ?? 'Could not delete your account.');
              }
            } finally {
              setAuthActionLoading(null);
            }
          },
        },
      ]
    );
  }, [router]);

  const joinedActivities = useMemo<HistoryActivity[]>(() => {
    const activityMap = new Map(activities.map((activity) => [activity.id, activity]));
    const existingHistoryIds = new Set([
      ...hostedActivities.map((activity) => activity.id),
      ...pastActivities.map((activity) => activity.id),
    ]);
    const shouldFilterAgainstHistory = existingHistoryIds.size > 0;
    const items: HistoryActivity[] = [];

    joinedActivityIds.forEach((activityId) => {
        if (shouldFilterAgainstHistory && !existingHistoryIds.has(activityId)) return;
        const source = activityMap.get(activityId);
        if (!source) return;

        items.push({
          id: source.id,
          title: source.title,
          category: source.category,
          coverImage: source.coverImage,
          dateTime: source.dateTime,
          locationName: source.location.name,
          status: source.status,
          hostId: source.hostId,
          joinStatus: joinStatuses[activityId],
        });
      });

    return items.sort(
      (left, right) => new Date(left.dateTime).getTime() - new Date(right.dateTime).getTime()
    );
  }, [activities, hostedActivities, joinStatuses, joinedActivityIds, pastActivities]);

  const removeHistoryActivity = useCallback((activityId: string) => {
    setHostedActivities((prev) => prev.filter((activity) => activity.id !== activityId));
    setPastActivities((prev) => prev.filter((activity) => activity.id !== activityId));
  }, []);

  const handleOpenHistoryActivity = useCallback(async (activityId: string) => {
    const { data, error: lookupError } = await supabase
      .from('activities')
      .select('id, status')
      .eq('id', activityId)
      .maybeSingle();

    if (lookupError || !data || data.status !== 'active') {
      removeHistoryActivity(activityId);
      Alert.alert('Activity removed', 'This activity is no longer available, so it was removed from your profile.');
      return;
    }

    router.push(`/activity/${activityId}`);
  }, [removeHistoryActivity, router]);

  const getTabActivities = useCallback(() => {
    switch (activeTab) {
      case 'Joined':
        return joinedActivities;
      case 'Hosting':
        return hostedActivities;
      case 'Past':
        return pastActivities;
    }
  }, [activeTab, hostedActivities, joinedActivities, pastActivities]);

  const stats = useMemo(
    () => [
      { label: 'Joined', value: joinedActivities.length },
      { label: 'Hosted', value: hostedActivities.length },
      { label: 'Rating', value: user?.ratingCount ? user.rating.toFixed(1) : 'New' },
    ],
    [hostedActivities.length, joinedActivities.length, user?.rating, user?.ratingCount]
  );

  const memberSince = user?.createdAt ? format(new Date(user.createdAt), 'MMM yyyy') : 'New member';
  const avatarInitial = (user?.displayName || 'U').trim().charAt(0).toUpperCase();

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.cream }]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.profileHeader}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.white} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => setShowSettingsSheet(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="settings-outline" size={24} color={Colors.white} />
          </TouchableOpacity>
        </View>

        {/* Avatar and info */}
        <View style={styles.profileInfo}>
          <TouchableOpacity
            style={styles.avatarLarge}
            onPress={handleChangeProfilePhoto}
            disabled={isUploadingPhoto}
            activeOpacity={0.85}
          >
            {user?.photoURL && !photoLoadFailed ? (
              <Image
                source={{ uri: user.photoURL }}
                style={styles.avatarImage}
                resizeMode="cover"
                onError={() => setPhotoLoadFailed(true)}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackInitial}>{avatarInitial}</Text>
              </View>
            )}
            <View style={styles.avatarCameraBadge}>
              {isUploadingPhoto ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Ionicons name="camera" size={14} color={Colors.white} />
              )}
            </View>
          </TouchableOpacity>
          <Text style={[styles.displayName, { color: colors.text }]}>
            {user?.displayName ?? 'User'}
          </Text>
          <Text style={[styles.location, { color: colors.slate }]}>{user?.location || 'No location set'}</Text>
          <Text style={[styles.memberSince, { color: colors.textSecondary }]}>Member since {memberSince}</Text>
          <TouchableOpacity
            style={[
              styles.editBtn,
              { backgroundColor: colors.surface, borderColor: colors.divider },
            ]}
            onPress={() => setShowEditSheet(true)}
          >
            <Text style={[styles.editBtnText, { color: colors.text }]}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={[styles.statsRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.divider }]}>
          {stats.map((stat) => (
            <View key={stat.label} style={styles.statItem}>
              <Text style={[styles.statValue, { color: colors.text }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, { color: colors.slate }]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Bio */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Bio</Text>
          <Text style={[styles.bioText, { color: colors.text }]}>
            {user?.bio ?? 'No bio yet.'}
          </Text>
        </View>

        {/* Interests */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Interests</Text>
          <View style={styles.chipsRow}>
            {(user?.interests ?? []).map((interest) => (
              <CategoryChip
                key={interest}
                label={interest}
                selected={false}
                onPress={() => {}}
                size="sm"
              />
            ))}
          </View>
        </View>

        {/* Tabs */}
        <View style={[styles.tabRow, { backgroundColor: colors.surfaceElevated, borderColor: colors.divider }]}>
          {(['Joined', 'Hosting', 'Past'] as ProfileTab[]).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tab,
                activeTab === tab && styles.tabActive,
                activeTab === tab && { backgroundColor: colors.primary },
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                style={[
                  styles.tabText,
                  activeTab === tab && styles.tabTextActive,
                  { color: activeTab === tab ? colors.white : colors.slate },
                ]}
              >
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Activity list */}
        <View style={styles.activitiesSection}>
          {historyLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={Colors.accent} size="small" />
              <Text style={styles.loadingText}>Loading your activity history...</Text>
            </View>
          ) : historyError ? (
            <View style={styles.loadingWrap}>
              <Text style={styles.errorText}>{historyError}</Text>
              <TouchableOpacity onPress={fetchHistory} style={styles.retryBtn}>
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : getTabActivities().length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.slate }]}>
              No {activeTab.toLowerCase()} activities yet.
            </Text>
          ) : (
            getTabActivities().map((activity, index) => {
              const chipColor = CategoryColors[activity.category as keyof typeof CategoryColors] ?? Colors.accent;
              const isJoinedTab = activeTab === 'Joined';
              const joinStatus = activity.joinStatus;
              const statusColor =
                joinStatus === 'approved'
                  ? Colors.success
                  : joinStatus === 'rejected'
                    ? Colors.error
                    : Colors.warning;
              return (
                <Animated.View
                  key={activity.id}
                  entering={FadeInDown.delay(index * 50).springify()}
                >
                  <TouchableOpacity
                    style={[
                      styles.miniCard,
                      Shadows.card,
                      { backgroundColor: colors.surfaceElevated, borderColor: colors.divider },
                    ]}
                    onPress={() => {
                      void handleOpenHistoryActivity(activity.id);
                    }}
                  >
                    <View style={[styles.miniCardImage, { backgroundColor: chipColor + '20' }]}>
                      {activity.coverImage ? (
                        <Image
                          source={{ uri: activity.coverImage }}
                          style={styles.miniCardPhoto}
                          resizeMode="cover"
                        />
                      ) : (
                        <Ionicons name="image-outline" size={24} color={chipColor} />
                      )}
                    </View>
                    <Text style={[styles.miniCardTitle, { color: colors.text }]} numberOfLines={2}>
                      {activity.title}
                    </Text>
                    <Text style={[styles.miniCardMeta, { color: colors.slate }]} numberOfLines={2}>
                      {activity.locationName}
                    </Text>
                    {isJoinedTab && joinStatus ? (
                      <View style={[styles.joinStatusPill, { backgroundColor: statusColor + '1A' }]}>
                        <Text style={[styles.joinStatusText, { color: statusColor }]}>
                          {joinStatus === 'approved'
                            ? 'Approved'
                            : joinStatus === 'rejected'
                              ? 'Not approved'
                              : 'Waiting for approval'}
                        </Text>
                      </View>
                    ) : null}
                    {isJoinedTab && joinStatus === 'approved' ? (
                      <TouchableOpacity
                        style={styles.inlineActionBtn}
                        onPress={() => {
                          if (canAccessChat(activity.id, activity.hostId)) {
                            router.push(`/chat/${activity.id}`);
                          }
                        }}
                      >
                        <Text style={styles.inlineActionText}>Open chat</Text>
                      </TouchableOpacity>
                    ) : null}
                    {isJoinedTab && joinStatus === 'rejected' ? (
                      <TouchableOpacity
                        style={styles.inlineDeleteBtn}
                        onPress={async () => {
                          const removed = await deleteRejectedJoin(activity.id);
                          if (!removed) {
                            Alert.alert('Delete failed', 'Could not remove this rejected activity.');
                          }
                        }}
                      >
                        <Text style={styles.inlineDeleteText}>Delete</Text>
                      </TouchableOpacity>
                    ) : null}
                  </TouchableOpacity>
                </Animated.View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Edit Profile Sheet */}
      <BottomSheet
        visible={showEditSheet}
        onClose={() => setShowEditSheet(false)}
        snapPoints={[520]}
      >
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.sheetTitle}>Edit Profile</Text>
          <InputField
            label="Display Name"
            value={editName}
            onChangeText={setEditName}
            placeholder="Your name"
            maxLength={InputLimits.profileName}
          />
          <InputField
            label="Location"
            value={editLocation}
            onChangeText={setEditLocation}
            placeholder="City, Country"
            maxLength={InputLimits.profileLocation}
          />
          <InputField
            label="Bio"
            value={editBio}
            onChangeText={setEditBio}
            placeholder="About you"
            multiline
            numberOfLines={4}
            maxLength={InputLimits.profileBio}
          />
          <PrimaryButton
            title="Save Changes"
            onPress={handleSaveProfile}
            loading={saveLoading}
            style={styles.sheetSaveBtn}
          />
        </ScrollView>
      </BottomSheet>

      {/* Account Settings Sheet */}
      <BottomSheet
        visible={showSettingsSheet}
        onClose={() => setShowSettingsSheet(false)}
        snapPoints={[430]}
      >
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={[
            styles.settingsSheetContent,
            { paddingBottom: insets.bottom + Spacing.xxxl },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.sheetTitle, { color: colors.text }]}>Account settings</Text>
          <Text style={[styles.settingsSubtitle, { color: colors.slate }]}>
            Manage how this device signs into JoinUp.
          </Text>

          <TouchableOpacity
            style={[
              styles.settingsAction,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.divider },
            ]}
            onPress={() => {
              void toggleThemeMode();
            }}
            activeOpacity={0.85}
          >
            <View style={[styles.settingsIconWrap, styles.settingsIconAccent]}>
              <Ionicons name={isDark ? 'moon' : 'sunny-outline'} size={20} color={colors.accent} />
            </View>
            <View style={styles.settingsActionTextWrap}>
              <Text style={[styles.settingsActionTitle, { color: colors.text }]}>Dark mode</Text>
              <Text style={[styles.settingsActionSubtitle, { color: colors.slate }]}>
                Switch this device between light and dark UI.
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={() => {
                void toggleThemeMode();
              }}
              trackColor={{ false: colors.divider, true: colors.accent + '66' }}
              thumbColor={isDark ? colors.accent : colors.white}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.settingsAction,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.divider },
            ]}
            onPress={() => handleAuthAction('switch')}
            activeOpacity={0.85}
            disabled={authActionLoading !== null}
          >
            <View style={[styles.settingsIconWrap, styles.settingsIconAccent]}>
              <Ionicons name="swap-horizontal" size={20} color={Colors.accent} />
            </View>
            <View style={styles.settingsActionTextWrap}>
              <Text style={[styles.settingsActionTitle, { color: colors.text }]}>Switch account</Text>
              <Text style={[styles.settingsActionSubtitle, { color: colors.slate }]}>
                Sign out and jump straight to sign in.
              </Text>
            </View>
            {authActionLoading === 'switch' ? (
              <ActivityIndicator color={Colors.accent} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={Colors.slate} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.settingsAction,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.divider },
            ]}
            onPress={() => handleAuthAction('logout')}
            activeOpacity={0.85}
            disabled={authActionLoading !== null}
          >
            <View style={[styles.settingsIconWrap, styles.settingsIconDanger]}>
              <Ionicons name="log-out-outline" size={20} color={Colors.error} />
            </View>
            <View style={styles.settingsActionTextWrap}>
              <Text style={[styles.settingsActionTitle, { color: colors.text }]}>Log out</Text>
              <Text style={[styles.settingsActionSubtitle, { color: colors.slate }]}>
                End this session and return to the welcome screen.
              </Text>
            </View>
            {authActionLoading === 'logout' ? (
              <ActivityIndicator color={Colors.error} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={Colors.slate} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.settingsAction,
              { backgroundColor: colors.surfaceElevated, borderColor: colors.divider },
            ]}
            onPress={handleDeleteAccount}
            activeOpacity={0.85}
            disabled={authActionLoading !== null}
          >
            <View style={[styles.settingsIconWrap, styles.settingsIconDanger]}>
              <Ionicons name="trash-outline" size={20} color={Colors.error} />
            </View>
            <View style={styles.settingsActionTextWrap}>
              <Text style={[styles.settingsActionTitle, styles.settingsActionTitleDanger]}>Delete account</Text>
              <Text style={[styles.settingsActionSubtitle, { color: colors.slate }]}>
                Permanently remove your account and all associated data.
              </Text>
            </View>
            {authActionLoading === 'delete' ? (
              <ActivityIndicator color={Colors.error} />
            ) : (
              <Ionicons name="chevron-forward" size={18} color={Colors.slate} />
            )}
          </TouchableOpacity>
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  profileHeader: {
    backgroundColor: Colors.primary,
    height: 132,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white + '18',
  },
  settingsBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white + '18',
  },
  settingsSheetContent: {
    flex: 1,
    paddingBottom: Spacing.lg,
  },
  settingsSubtitle: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.slate,
    marginBottom: Spacing.md,
  },
  settingsAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.card,
    backgroundColor: Colors.cream,
    marginBottom: Spacing.sm,
  },
  settingsIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsIconAccent: {
    backgroundColor: Colors.accent + '18',
  },
  settingsIconDanger: {
    backgroundColor: Colors.error + '14',
  },
  settingsActionTextWrap: {
    flex: 1,
  },
  settingsActionTitle: {
    fontFamily: Typography.bodyBold,
    fontSize: 15,
    color: Colors.text,
    marginBottom: 2,
  },
  settingsActionTitleDanger: {
    color: Colors.error,
  },
  settingsActionSubtitle: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: Colors.slate,
    lineHeight: 18,
  },
  profileInfo: {
    alignItems: 'center',
    marginTop: -48,
    marginBottom: Spacing.lg,
    marginHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderRadius: BorderRadius.card,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
    ...Shadows.soft,
  },
  avatarLarge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.slate,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.white,
    marginTop: -8,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  avatarFallbackInitial: {
    fontFamily: Typography.bodyBold,
    fontSize: 30,
    color: Colors.white,
  },
  avatarCameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  displayName: {
    fontFamily: Typography.bodyBold,
    fontSize: 22,
    color: Colors.text,
  },
  location: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.slate,
    marginTop: 2,
  },
  memberSince: {
    fontFamily: Typography.bodyMed,
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 3,
  },
  editBtn: {
    marginTop: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRadius: BorderRadius.pill,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.cream,
  },
  editBtnText: {
    fontFamily: Typography.bodyBold,
    fontSize: 14,
    color: Colors.text,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.card,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
    ...Shadows.hairline,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontFamily: Typography.bodyBold,
    fontSize: 20,
    color: Colors.text,
  },
  statLabel: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: Colors.slate,
    marginTop: 2,
  },
  section: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  sectionTitle: {
    fontFamily: Typography.bodyBold,
    fontSize: 16,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  bioText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 22,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tabRow: {
    flexDirection: 'row',
    marginTop: Spacing.lg,
    marginHorizontal: Spacing.lg,
    padding: 4,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
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
    fontFamily: Typography.bodyBold,
  },
  activitiesSection: {
    padding: Spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  emptyText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.slate,
    textAlign: 'center',
    width: '100%',
    paddingVertical: Spacing.xl,
  },
  miniCard: {
    width: 160,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.card,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  miniCardImage: {
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  miniCardPhoto: {
    width: '100%',
    height: '100%',
  },
  miniCardTitle: {
    fontFamily: Typography.bodyMed,
    fontSize: 13,
    color: Colors.text,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    lineHeight: 18,
  },
  miniCardMeta: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.slate,
    paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.xs,
    lineHeight: 16,
  },
  joinStatusPill: {
    alignSelf: 'flex-start',
    borderRadius: BorderRadius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginHorizontal: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  joinStatusText: {
    fontFamily: Typography.bodyMed,
    fontSize: 11,
  },
  inlineActionBtn: {
    marginHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  inlineActionText: {
    color: Colors.white,
    fontFamily: Typography.bodyBold,
    fontSize: 12,
  },
  inlineDeleteBtn: {
    marginHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: Colors.error,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  inlineDeleteText: {
    color: Colors.error,
    fontFamily: Typography.bodyBold,
    fontSize: 12,
  },
  sheetTitle: {
    fontFamily: Typography.display,
    fontSize: 22,
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  sheetScroll: {
    flex: 1,
  },
  sheetContent: {
    paddingBottom: Spacing.xl,
  },
  sheetSaveBtn: {
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  fieldLabel: {
    fontFamily: Typography.bodyMed,
    fontSize: 14,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  loadingWrap: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  loadingText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.slate,
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.error,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  retryBtnText: {
    fontFamily: Typography.bodyMed,
    color: Colors.accent,
  },
});
