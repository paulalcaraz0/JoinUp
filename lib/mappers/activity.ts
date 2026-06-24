import type { Activity } from '../../types';

export function normalizeImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const raw = value.trim();
  if (!raw) {
    return undefined;
  }

  if (raw.startsWith('https://') || raw.startsWith('http://')) {
    return raw;
  }

  const match = raw.match(/https?:\/\/[^\s]+?\.(jpg|jpeg|png|webp|heic|heif)(?:\?[^\s]*)?/i);
  return match?.[0];
}

export function mapActivity(row: unknown): Activity {
  const record = row as Record<string, unknown> | null | undefined;

  const rawImages = Array.isArray(record?.images) ? record.images : [];
  const normalizedImages = rawImages
    .map((image) => normalizeImageUrl(image))
    .filter((image): image is string => typeof image === 'string' && image.length > 0);

  return {
    id: (record?.id as string | undefined) ?? '',
    title: (record?.title as string | undefined) ?? '',
    description: (record?.description as string | undefined) ?? '',
    category: (record?.category as Activity['category'] | undefined) ?? 'Other',
    location: {
      name: ((record?.location_name as string | undefined) ?? ''),
      lat: Number(record?.location_lat ?? 0),
      lng: Number(record?.location_lng ?? 0),
    },
    dateTime: (record?.date_time as string | undefined) ?? '',
    maxSlots: Number(record?.max_slots ?? 0),
    currentSlots: Number(record?.current_slots ?? record?.max_slots ?? 0),
    participants: Array.isArray(record?.participant_ids)
      ? (record.participant_ids as string[])
      : [],
    hostId: (record?.host_id as string | undefined) ?? '',
    hostName: (record?.host_name as string | undefined) ?? '',
    hostPhoto: (record?.host_photo as string | undefined) ?? '',
    coverImage:
      normalizeImageUrl(record?.cover_image) ?? normalizedImages[0],
    images: normalizedImages.length > 0 ? normalizedImages : undefined,
    requiresApproval: Boolean(record?.requires_approval),
    reactions: {
      fire: Number(record?.reaction_fire ?? 0),
      heart: Number(record?.reaction_heart ?? 0),
      like: Number(record?.reaction_like ?? 0),
    },
    status: (record?.status as Activity['status'] | undefined) ?? 'active',
    createdAt: (record?.created_at as string | undefined) ?? new Date().toISOString(),
  };
}
