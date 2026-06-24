import type { User } from '../../types';

function normalizeInterests(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  return [];
}

function normalizeActivities(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  return [];
}

export function mapProfile(id: string, profile: unknown): User {
  const record = profile as Record<string, unknown> | null | undefined;

  return {
    uid: id,
    displayName: (record?.display_name as string | undefined) ?? '',
    photoURL: (record?.photo_url as string | undefined) ?? '',
    bio: (record?.bio as string | undefined) ?? '',
    location: (record?.location as string | undefined) ?? '',
    ageRange: (record?.age_range as User['ageRange'] | undefined) ?? '18-24',
    interests: normalizeInterests(record?.interests),
    activitiesJoined: normalizeActivities(record?.activities_joined),
    activitiesHosted: [],
    rating: Number(record?.rating ?? 0),
    ratingCount: (record?.rating_count as number | undefined) ?? 0,
    verificationStatus: (record?.verification_status as User['verificationStatus'] | undefined) ?? 'unverified',
    createdAt: (record?.created_at as string | undefined) ?? new Date().toISOString(),
  };
}

export function mapUserRow(row: unknown): User {
  const record = row as Record<string, unknown> | null | undefined;
  const id = (record?.id as string | undefined) ?? '';

  return mapProfile(id, record);
}
