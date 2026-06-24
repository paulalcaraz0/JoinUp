import { DatabaseTables } from '../constants/database';
import { mapUserRow } from '../mappers/user';
import { supabase } from '../supabase';

export const userService = {
  async getProfile(userId: string) {
    const { data, error } = await supabase
      .from(DatabaseTables.profiles)
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async listProfiles() {
    const { data, error } = await supabase
      .from(DatabaseTables.profiles)
      .select(
        'id, display_name, photo_url, bio, location, age_range, interests, activities_joined, rating, rating_count, verification_status, created_at'
      )
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []).map(mapUserRow);
  },

  async updateActivitiesJoined(userId: string, activityIds: string[]) {
    const { error } = await supabase
      .from(DatabaseTables.profiles)
      .update({ activities_joined: activityIds })
      .eq('id', userId);

    if (error) throw error;
  },
};
