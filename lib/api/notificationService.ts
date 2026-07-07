import { DatabaseTables } from '../constants/database';
import { mapNotification } from '../mappers/notification';
import { supabase } from '../supabase';
import type { Notification } from '../../types';

const NOTIFICATION_PAGE_SIZE = 50;

type JoinActorRow = {
  activity_id: string;
  user_id: string;
  joined_at: string;
};

function pickClosestJoinActor(notification: Notification, rows: JoinActorRow[]) {
  const notificationTime = new Date(notification.createdAt).getTime();
  if (!Number.isFinite(notificationTime)) return rows[0] ?? null;

  return rows.reduce<JoinActorRow | null>((closest, row) => {
    const rowTime = new Date(row.joined_at).getTime();
    if (!Number.isFinite(rowTime)) return closest;

    if (!closest) return row;

    const closestTime = new Date(closest.joined_at).getTime();
    const rowDistance = Math.abs(notificationTime - rowTime);
    const closestDistance = Math.abs(notificationTime - closestTime);

    return rowDistance < closestDistance ? row : closest;
  }, null);
}

async function enrichJoinNotificationActors(notifications: Notification[]) {
  const joinNotifications = notifications.filter(
    (notification) => notification.type === 'join' && notification.activityId
  );

  if (joinNotifications.length === 0) {
    return notifications;
  }

  const activityIds = Array.from(
    new Set(joinNotifications.map((notification) => notification.activityId).filter(Boolean))
  ) as string[];

  const { data: participantRows, error: participantError } = await supabase
    .from(DatabaseTables.participants)
    .select('activity_id, user_id, joined_at')
    .in('activity_id', activityIds)
    .order('joined_at', { ascending: false })
    .limit(Math.max(joinNotifications.length * 4, 20));

  if (participantError || !participantRows?.length) {
    return notifications;
  }

  const participantRowsByActivity = (participantRows as JoinActorRow[]).reduce<Record<string, JoinActorRow[]>>(
    (acc, row) => {
      if (!acc[row.activity_id]) acc[row.activity_id] = [];
      acc[row.activity_id].push(row);
      return acc;
    },
    {}
  );

  const actorRowsByNotificationId = joinNotifications.reduce<Record<string, JoinActorRow>>(
    (acc, notification) => {
      if (!notification.activityId) return acc;
      const actorRow = pickClosestJoinActor(
        notification,
        participantRowsByActivity[notification.activityId] ?? []
      );

      if (actorRow) {
        acc[notification.id] = actorRow;
      }

      return acc;
    },
    {}
  );

  const actorIds = Array.from(
    new Set(Object.values(actorRowsByNotificationId).map((row) => row.user_id))
  );

  if (actorIds.length === 0) {
    return notifications;
  }

  const { data: profiles, error: profileError } = await supabase
    .from(DatabaseTables.profiles)
    .select('id, display_name, photo_url')
    .in('id', actorIds);

  if (profileError) {
    return notifications;
  }

  const profilesById = (profiles ?? []).reduce<Record<string, { display_name?: string | null; photo_url?: string | null }>>(
    (acc, profile: any) => {
      acc[profile.id] = {
        display_name: profile.display_name ?? null,
        photo_url: profile.photo_url ?? null,
      };
      return acc;
    },
    {}
  );

  return notifications.map((notification) => {
    const actorRow = actorRowsByNotificationId[notification.id];
    if (!actorRow) return notification;

    const profile = profilesById[actorRow.user_id];
    return {
      ...notification,
      actorId: actorRow.user_id,
      actorName: profile?.display_name?.trim() || undefined,
      actorPhoto: profile?.photo_url?.trim() || undefined,
    };
  });
}

export const notificationService = {
  async countUnreadForUser(userId: string) {
    const { count, error } = await supabase
      .from(DatabaseTables.notifications)
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) throw error;
    return count ?? 0;
  },

  async listForUser(userId: string) {
    const { data, error } = await supabase
      .from(DatabaseTables.notifications)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(NOTIFICATION_PAGE_SIZE);

    if (error) throw error;
    return enrichJoinNotificationActors((data ?? []).map(mapNotification));
  },

  async markAllRead(userId: string) {
    const { error } = await supabase
      .from(DatabaseTables.notifications)
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) throw error;
  },

  async markRead(notificationId: string) {
    const { error } = await supabase
      .from(DatabaseTables.notifications)
      .update({ read: true })
      .eq('id', notificationId);

    if (error) throw error;
  },

  async delete(notificationId: string) {
    const { error } = await supabase
      .from(DatabaseTables.notifications)
      .delete()
      .eq('id', notificationId);

    if (error) throw error;
  },

  async insert(payload: {
    user_id: string;
    type: string;
    title: string;
    body: string;
    activity_id?: string | null;
    read?: boolean;
  }) {
    const { error } = await supabase.from(DatabaseTables.notifications).insert({
      user_id: payload.user_id,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      activity_id: payload.activity_id ?? null,
      read: payload.read ?? false,
    });

    if (error) throw error;
  },
};
