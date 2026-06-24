import { DatabaseTables } from '../constants/database';
import { supabase } from '../supabase';

export const activityService = {
  async getActiveActivitiesRaw() {
    const { data, error } = await supabase
      .from(DatabaseTables.activitiesFull)
      .select('*')
      .eq('status', 'active')
      .order('date_time', { ascending: true });

    if (error) throw error;
    return data;
  },

  async getParticipantsForActivities(activityIds: string[]) {
    if (activityIds.length === 0) return [];

    const { data, error } = await supabase
      .from(DatabaseTables.participants)
      .select('activity_id, user_id')
      .in('activity_id', activityIds)
      .eq('status', 'approved');

    if (error) throw error;
    return data ?? [];
  },

  async getJoinStatuses(userId: string) {
    const { data, error } = await supabase
      .from(DatabaseTables.participants)
      .select('activity_id, status')
      .eq('user_id', userId)
      .neq('status', 'cancelled');

    if (error) throw error;
    return data ?? [];
  },

  async resolveDueJoinRequests(userId: string, limit = 25) {
    const { error } = await supabase.rpc('resolve_due_join_requests', {
      p_user_id: userId,
      p_limit: limit,
    });

    if (error) throw error;
  },

  async insertParticipant(payload: {
    activity_id: string;
    user_id: string;
    status: string;
    decision_due_at?: string | null;
    resolved_at?: string | null;
  }) {
    const { error } = await supabase.from(DatabaseTables.participants).insert(payload);
    if (error) throw error;
  },

  async deleteParticipant(activityId: string, userId: string) {
    const { error } = await supabase
      .from(DatabaseTables.participants)
      .delete()
      .eq('activity_id', activityId)
      .eq('user_id', userId);

    if (error) throw error;
  },

  async updateActivity(activityId: string, data: Record<string, unknown>) {
    const { error } = await supabase
      .from(DatabaseTables.activities)
      .update(data)
      .eq('id', activityId);

    if (error) throw error;
  },

  async insertApprovalNotification(payload: {
    user_id: string;
    title: string;
    body: string;
    activity_id?: string | null;
  }) {
    const { error } = await supabase.from(DatabaseTables.notifications).insert({
      user_id: payload.user_id,
      type: 'approval',
      title: payload.title,
      body: payload.body,
      activity_id: payload.activity_id ?? null,
      read: false,
    });

    if (error) throw error;
  },

  async respondToJoinRequest(activityId: string, requesterId: string, approved: boolean) {
    const { error } = await supabase.rpc('respond_to_join_request', {
      p_activity_id: activityId,
      p_requester_id: requesterId,
      p_approved: approved,
    });

    if (error) throw error;
  },

  async deleteRejectedJoinRequest(activityId: string) {
    const { data, error } = await supabase.rpc('delete_rejected_join_request', {
      p_activity_id: activityId,
    });

    if (error) throw error;
    return data;
  },
};
