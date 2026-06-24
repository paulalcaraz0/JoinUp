import { useCallback, useEffect, useState } from 'react';
import type { User } from '../types';
import { userService } from '../lib/api/userService';

export const useUsers = (userId?: string) => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      setUsers(await userService.listProfiles());
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
