import { DatabaseTables } from '../constants/database';
import { supabase } from '../supabase';

export type RateableActivity = {
  id: string;
  title: string;
  dateTime: string;
};

type ParticipantRow = {
  activity_id: string;
  user_id: string;
};

type ActivityRow = {
  id: string;
  title: string;
  date_time: string | null;
  host_id: string;
};

export const ratingService = {
  async listRateableActivities(viewerId: string, targetUserId: string): Promise<RateableActivity[]> {
    if (!viewerId || !targetUserId || viewerId === targetUserId) return [];

    const { data: participantRows, error: participantError } = await supabase
      .from(DatabaseTables.participants)
      .select('activity_id, user_id')
      .in('user_id', [viewerId, targetUserId])
      .eq('status', 'approved');

    if (participantError) throw participantError;

    const rows = (participantRows ?? []) as ParticipantRow[];
    const viewerParticipantIds = new Set(
      rows.filter((row) => row.user_id === viewerId).map((row) => row.activity_id)
    );
    const targetParticipantIds = new Set(
      rows.filter((row) => row.user_id === targetUserId).map((row) => row.activity_id)
    );

    const candidateIds = Array.from(new Set([...viewerParticipantIds, ...targetParticipantIds]));
    if (candidateIds.length === 0) return [];

    const { data: activities, error: activityError } = await supabase
      .from(DatabaseTables.activities)
      .select('id, title, date_time, host_id')
      .in('id', candidateIds)
      .eq('status', 'completed')
      .order('date_time', { ascending: false });

    if (activityError) throw activityError;

    return ((activities ?? []) as ActivityRow[])
      .filter((activity) => {
        const viewerJoined = viewerParticipantIds.has(activity.id);
        const targetJoined = targetParticipantIds.has(activity.id);

        return (
          (activity.host_id === viewerId && targetJoined) ||
          (activity.host_id === targetUserId && viewerJoined) ||
          (viewerJoined && targetJoined)
        );
      })
      .map((activity) => ({
        id: activity.id,
        title: activity.title,
        dateTime: activity.date_time ?? '',
      }));
  },

  async getViewerRatings(viewerId: string, targetUserId: string) {
    if (!viewerId || !targetUserId || viewerId === targetUserId) return {};

    const { data, error } = await supabase
      .from(DatabaseTables.userRatings)
      .select('activity_id, score')
      .eq('rater_id', viewerId)
      .eq('rated_user_id', targetUserId);

    if (error) throw error;

    return (data ?? []).reduce<Record<string, number>>((acc, row: any) => {
      acc[row.activity_id] = Number(row.score ?? 0);
      return acc;
    }, {});
  },

  async submitRating(activityId: string, ratedUserId: string, score: number) {
    const { data, error } = await supabase.rpc('submit_user_rating', {
      p_activity_id: activityId,
      p_rated_user_id: ratedUserId,
      p_score: score,
      p_comment: '',
    });

    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;
    const { data: profileData, error: profileError } = await supabase
      .from(DatabaseTables.profiles)
      .select('rating, rating_count')
      .eq('id', ratedUserId)
      .single();

    if (profileError) throw profileError;

    return {
      rating: Number(profileData?.rating ?? result?.rating ?? 0),
      ratingCount: Number(profileData?.rating_count ?? result?.rating_count ?? 0),
      score: Number(result?.score ?? score),
    };
  },
};
