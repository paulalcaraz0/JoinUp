import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '../types';

function mapUser(row: any): User {
  return {
    uid: row.id,
    displayName: row.display_name ?? '',
    photoURL: row.photo_url ?? '',
    bio: row.bio ?? '',
    location: row.location ?? '',
    ageRange: row.age_range ?? '18-24',
    interests: Array.isArray(row.interests) ? row.interests : [],
    activitiesJoined: Array.isArray(row.activities_joined) ? row.activities_joined : [],
    activitiesHosted: [],
    rating: Number(row.rating ?? 0),
    ratingCount: row.rating_count ?? 0,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

export function useUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('id, display_name, photo_url, bio, location, age_range, interests, activities_joined, rating, rating_count, created_at')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setUsers((data ?? []).map(mapUser));
    } catch (err: any) {
      setError(err?.message ?? 'Failed to fetch users');
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  return { users, isLoading, error, refetch: fetchUsers };
}
