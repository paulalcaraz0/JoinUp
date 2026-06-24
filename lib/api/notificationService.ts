import { DatabaseTables } from '../constants/database';
import { mapNotification } from '../mappers/notification';
import { supabase } from '../supabase';

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
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(mapNotification);
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
