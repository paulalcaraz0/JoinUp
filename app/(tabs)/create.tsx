import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { readAsStringAsync } from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import * as Location from 'expo-location';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { InputField } from '../../components/ui/InputField';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { CategoryChip } from '../../components/ui/CategoryChip';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { InputLimits, trimInput } from '../../lib/validation';
import { useActivities } from '../../hooks/useActivities';
import type { Activity } from '../../types';
import { format } from 'date-fns';

const CATEGORIES = ['Fitness', 'Study', 'Café', 'Outdoors', 'Gaming', 'Social', 'Food', 'Other'];
type Category = Activity['category'];
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

type FormErrors = {
  title?: string;
  description?: string;
  category?: string;
  location?: string;
  date?: string;
  maxSlots?: string;
};

const isMissingImagesColumnError = (error: unknown): boolean => {
  const joined = [
    (error as any)?.code,
    (error as any)?.message,
    (error as any)?.details,
    (error as any)?.hint,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    joined.includes('pgrst204') ||
    (joined.includes('schema cache') && joined.includes("'images'") && joined.includes('activities'))
  );
};

export default function CreateActivityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const { refetch } = useActivities();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [locationName, setLocationName] = useState('');
  const [maxSlots, setMaxSlots] = useState('8');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [date, setDate] = useState(new Date(Date.now() + 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isFetchingLocation, setIsFetchingLocation] = useState(false);
  const [selectedImages, setSelectedImages] = useState<PickedImage[]>([]);
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});

  const parsedMaxSlots = useMemo(() => Number.parseInt(maxSlots, 10), [maxSlots]);

  const isValid = useMemo(
    () =>
      title.trim().length > 0 &&
      description.trim().length > 0 &&
      Boolean(category) &&
      locationName.trim().length > 0 &&
      Number.isInteger(parsedMaxSlots) &&
      parsedMaxSlots > 0,
    [category, locationName, parsedMaxSlots, title, description]
  );

  const validateForm = (): FormErrors => {
    const nextErrors: FormErrors = {};

    const nextTitle = trimInput(title);
    const nextDescription = trimInput(description);
    const nextLocation = trimInput(locationName);

    if (nextTitle.length === 0) {
      nextErrors.title = 'Title is required.';
    } else if (nextTitle.length > InputLimits.activityTitle) {
      nextErrors.title = `Keep the title under ${InputLimits.activityTitle} characters.`;
    }

    if (nextDescription.length === 0) {
      nextErrors.description = 'Description is required.';
    } else if (nextDescription.length > InputLimits.activityDescription) {
      nextErrors.description = `Keep the description under ${InputLimits.activityDescription} characters.`;
    }

    if (!category) {
      nextErrors.category = 'Select a category.';
    }

    if (nextLocation.length === 0) {
      nextErrors.location = 'Enter where this event will happen.';
    } else if (nextLocation.length > InputLimits.activityLocation) {
      nextErrors.location = `Keep the location under ${InputLimits.activityLocation} characters.`;
    }

    if (!Number.isInteger(parsedMaxSlots) || parsedMaxSlots <= 0) {
      nextErrors.maxSlots = 'Enter a valid participant count.';
    } else if (parsedMaxSlots > InputLimits.maxActivitySlots) {
      nextErrors.maxSlots = `Keep participant count at ${InputLimits.maxActivitySlots} or less.`;
    }

    return nextErrors;
  };

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

  const uploadActivityImages = async (images: PickedImage[]): Promise<string[]> => {
    const uploadedUrls: string[] = [];

    for (const image of images) {
      const payload = await createUploadPayload(image);
      const extension = deriveImageExtension(image.uri, image.mimeType ?? payload.contentType);
      const randomSuffix = Math.random().toString(36).slice(2, 8);
      const path = `activity-covers/${user?.uid ?? 'anon'}-${Date.now()}-${randomSuffix}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from('activity-images')
        .upload(path, payload.body, {
          upsert: false,
          contentType: payload.contentType,
        });

      if (uploadError) {
        throw uploadError;
      }

      const url = supabase.storage.from('activity-images').getPublicUrl(path).data.publicUrl;
      uploadedUrls.push(url);
    }

    return uploadedUrls;
  };

  const handleUseMyLocation = async () => {
    try {
      setIsFetchingLocation(true);
      const permission = await Location.requestForegroundPermissionsAsync();

      if (permission.status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow location access to autofill this field.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const geocoded = await Location.reverseGeocodeAsync({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });

      const first = geocoded[0];
      const labelParts = [first?.name, first?.district, first?.city, first?.region, first?.country]
        .filter(Boolean);

      setLocationCoords({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      });
      setLocationName(labelParts.length > 0 ? labelParts.join(', ') : 'Current location');
      setErrors((prev) => ({ ...prev, location: undefined }));
    } catch {
      Alert.alert('Location unavailable', 'Could not fetch your current location.');
    } finally {
      setIsFetchingLocation(false);
    }
  };

  const handleImagePick = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow media access to pick images.');
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

      // Add the new image to the array
      const picked = result.assets[0];
      setSelectedImages((prev) => [
        ...prev,
        {
          uri: picked.uri,
          mimeType: picked.mimeType,
          base64: picked.base64,
          file: (picked as any).file,
          fileSize: picked.fileSize,
        },
      ]);
    } catch {
      Alert.alert('Image unavailable', 'Could not select this image right now.');
    }
  };

  const handleRemoveImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDateChange = (_event: DateTimePickerEvent, selectedDate?: Date) => {
    if (!selectedDate) {
      setShowDatePicker(false);
      return;
    }

    if (Platform.OS === 'android') {
      if (pickerMode === 'date') {
        const next = new Date(date);
        next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        setDate(next);
        setPickerMode('time');
        setShowDatePicker(true);
        return;
      }

      const next = new Date(date);
      next.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
      setDate(next);
      setShowDatePicker(false);
      return;
    }

    setDate(selectedDate);
  };

  const openDateTimePicker = () => {
    if (Platform.OS === 'android') {
      setPickerMode('date');
      setShowDatePicker(true);
      return;
    }

    setShowDatePicker((prev) => !prev);
  };

  const handleSubmit = async () => {
    if (!user?.uid) {
      Alert.alert('Sign in required', 'Please sign in before creating an activity.');
      return;
    }

    const validationErrors = validateForm();
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      Alert.alert('Missing details', 'Please review the highlighted fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      let coverImageUrl: string | null = null;
      let activityImages: string[] = [];

      if (selectedImages.length > 0) {
        setIsUploadingCover(true);
        try {
          activityImages = await uploadActivityImages(selectedImages);
          coverImageUrl = activityImages[0]; // Use first image as cover
        } catch {
          Alert.alert('Image upload failed', 'The activity will still be created without images.');
        } finally {
          setIsUploadingCover(false);
        }
      }

      const insertPayload = {
        title: trimInput(title),
        description: trimInput(description),
        category,
        location_name: trimInput(locationName),
        location_lat: locationCoords?.lat ?? 0,
        location_lng: locationCoords?.lng ?? 0,
        date_time: date.toISOString(),
        max_slots: parsedMaxSlots,
        cover_image: coverImageUrl,
        images: activityImages,
        requires_approval: requiresApproval,
        status: 'active' as const,
        host_id: user.uid,
      };

      let { data, error } = await supabase
        .from('activities')
        .insert(insertPayload)
        .select('id')
        .single();

      if (error && isMissingImagesColumnError(error)) {
        ({ data, error } = await supabase
          .from('activities')
          .insert({
            ...insertPayload,
            images: undefined,
          })
          .select('id')
          .single());
      }

      if (error || !data?.id) {
        throw error ?? new Error('Could not create activity.');
      }

      await refetch();

      Alert.alert('Success', 'Activity created successfully!', [
        { text: 'Open activity', onPress: () => router.push(`/activity/${data.id}`) },
        { text: 'Stay here', style: 'cancel' },
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create activity. Please try again.';
      Alert.alert('Error', message);
    } finally {
      setIsUploadingCover(false);
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={[styles.container, { paddingTop: insets.top + Spacing.md }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Text style={styles.heading}>Create Activity</Text>
          <Text style={styles.subtitle}>Plan something awesome</Text>
        </Animated.View>

        {/* Images Gallery */}
        <Animated.View entering={FadeInDown.delay(150).springify()}>
          <View style={styles.imagesSection}>
            {selectedImages.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.imageScrollView}
              >
                {selectedImages.map((image, index) => (
                  <View key={index} style={styles.imageContainer}>
                    <Image source={{ uri: image.uri }} style={styles.selectedImage} resizeMode="cover" />
                    <TouchableOpacity
                      style={styles.removeImageBtn}
                      onPress={() => handleRemoveImage(index)}
                    >
                      <Ionicons name="close-circle" size={20} color={Colors.white} />
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <TouchableOpacity style={styles.addImageButton} onPress={handleImagePick}>
              <Ionicons name="add-circle-outline" size={24} color={Colors.accent} />
              <Text style={styles.addImageText}>
                {selectedImages.length > 0 ? 'Add More Photos' : 'Add Cover Photo'}
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <InputField
            label="Activity Title"
            placeholder="Give it a catchy name"
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              if (errors.title) {
                setErrors((prev) => ({ ...prev, title: undefined }));
              }
            }}
            error={errors.title}
            maxLength={InputLimits.activityTitle}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250).springify()}>
          <InputField
            label="Description"
            placeholder="What's the plan?"
            value={description}
            onChangeText={(value) => {
              setDescription(value);
              if (errors.description) {
                setErrors((prev) => ({ ...prev, description: undefined }));
              }
            }}
            multiline
            numberOfLines={4}
            style={styles.textArea}
            error={errors.description}
            maxLength={InputLimits.activityDescription}
          />
        </Animated.View>

        {/* Category */}
        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.chipsRow}>
            {CATEGORIES.map((cat) => (
              <CategoryChip
                key={cat}
                label={cat}
                selected={category === cat}
                onPress={() => {
                  setCategory(cat as Category);
                  if (errors.category) {
                    setErrors((prev) => ({ ...prev, category: undefined }));
                  }
                }}
                size="sm"
              />
            ))}
          </View>
          {errors.category ? <Text style={styles.inlineError}>{errors.category}</Text> : null}
        </Animated.View>

        {/* Location */}
        <Animated.View entering={FadeInDown.delay(350).springify()}>
          <InputField
            label="Location"
            placeholder="Where is it happening?"
            value={locationName}
            onChangeText={(value) => {
              setLocationName(value);
              setLocationCoords(null);
              if (errors.location) {
                setErrors((prev) => ({ ...prev, location: undefined }));
              }
            }}
            error={errors.location}
            maxLength={InputLimits.activityLocation}
          />
          <TouchableOpacity
            style={styles.useLocationBtn}
            onPress={handleUseMyLocation}
            disabled={isFetchingLocation}
          >
            <Ionicons name="navigate-outline" size={16} color={Colors.accent} />
            <Text style={styles.useLocationText}>
              {isFetchingLocation ? 'Getting location...' : 'Use my location'}
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Date and Time */}
        <Animated.View entering={FadeInDown.delay(400).springify()}>
          <Text style={styles.fieldLabel}>Date & Time</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={openDateTimePicker}>
            <Ionicons name="calendar-outline" size={18} color={Colors.accent} />
            <Text style={styles.dateBtnText}>
              {format(date, 'EEEE, MMMM d, yyyy · h:mm a')}
            </Text>
          </TouchableOpacity>
          {errors.date ? <Text style={styles.inlineError}>{errors.date}</Text> : null}
          {showDatePicker ? (
            <DateTimePicker
              value={date}
              mode={Platform.OS === 'ios' ? 'datetime' : pickerMode}
              minimumDate={new Date()}
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={handleDateChange}
            />
          ) : null}
        </Animated.View>

        {/* Max slots */}
        <Animated.View entering={FadeInDown.delay(450).springify()}>
          <InputField
            label="Max Participants"
            placeholder="8"
            value={maxSlots}
            onChangeText={(value) => {
              const cleaned = value.replace(/[^0-9]/g, '');
              setMaxSlots(cleaned);
              if (errors.maxSlots) {
                setErrors((prev) => ({ ...prev, maxSlots: undefined }));
              }
            }}
            keyboardType="number-pad"
            error={errors.maxSlots}
            maxLength={String(InputLimits.maxActivitySlots).length}
          />
        </Animated.View>

        {/* Requires approval */}
        <Animated.View entering={FadeInDown.delay(500).springify()}>
          <View style={styles.switchRow}>
            <View style={styles.switchInfo}>
              <Text style={styles.switchLabel}>Require Approval</Text>
              <Text style={styles.switchDesc}>
                Review and approve join requests
              </Text>
            </View>
            <Switch
              value={requiresApproval}
              onValueChange={setRequiresApproval}
              trackColor={{ false: Colors.divider, true: Colors.accent + '50' }}
              thumbColor={requiresApproval ? Colors.accent : Colors.white}
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(550).springify()}>
          <PrimaryButton
            title="Create Activity"
            onPress={handleSubmit}
            loading={isSubmitting || isUploadingCover}
            disabled={!isValid}
            style={styles.submitBtn}
          />
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.cream },
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl * 3,
  },
  heading: {
    fontFamily: Typography.display,
    fontSize: 28,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontFamily: Typography.body,
    fontSize: 15,
    color: Colors.slate,
    marginBottom: Spacing.lg,
  },
  imagesSection: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.card,
    borderWidth: 2,
    borderColor: Colors.divider,
    borderStyle: 'dashed',
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  imageScrollView: {
    marginBottom: Spacing.md,
  },
  imageContainer: {
    position: 'relative',
    marginRight: Spacing.md,
  },
  selectedImage: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.sm,
  },
  removeImageBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: Colors.text,
    borderRadius: 12,
  },
  addImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  addImageText: {
    fontFamily: Typography.bodyMed,
    fontSize: 14,
    color: Colors.accent,
  },
  fieldLabel: {
    fontFamily: Typography.bodyMed,
    fontSize: 14,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: Spacing.md,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  useLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  useLocationText: {
    fontFamily: Typography.bodyMed,
    fontSize: 14,
    color: Colors.accent,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.input,
    borderWidth: 1.5,
    borderColor: Colors.divider,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  dateBtnText: {
    fontFamily: Typography.body,
    fontSize: 15,
    color: Colors.text,
  },
  inlineError: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.danger,
    marginTop: -Spacing.xs,
    marginBottom: Spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.input,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  switchInfo: {
    flex: 1,
    marginRight: Spacing.md,
  },
  switchLabel: {
    fontFamily: Typography.bodyMed,
    fontSize: 15,
    color: Colors.text,
  },
  switchDesc: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: Colors.slate,
    marginTop: 2,
  },
  submitBtn: {
    marginTop: Spacing.sm,
  },
});
