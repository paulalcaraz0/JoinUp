import type { Notification } from '../../types';

export function mapNotification(row: unknown): Notification {
  const record = row as Record<string, unknown> | null | undefined;

  return {
    id: (record?.id as string | undefined) ?? '',
    userId: (record?.user_id as string | undefined) ?? '',
    type: (record?.type as Notification['type'] | undefined) ?? 'update',
    title: (record?.title as string | undefined) ?? '',
    body: (record?.body as string | undefined) ?? '',
    actorId: (record?.actor_id as string | undefined) ?? undefined,
    actorName: (record?.actor_name as string | undefined) ?? undefined,
    actorPhoto: (record?.actor_photo as string | undefined) ?? undefined,
    activityId: (record?.activity_id as string | undefined) ?? null,
    read: Boolean(record?.read),
    createdAt: (record?.created_at as string | undefined) ?? new Date().toISOString(),
  };
}
