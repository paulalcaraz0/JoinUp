import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import type { Activity, JoinRequestStatus } from '../types';
import { MOCK_ACTIVITIES } from '../lib/mockActivities';
import { useActivityStore } from '../store/activityStore';
import { useAuthStore } from '../store/authStore';

function normalizeImageUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const raw = value.trim();
  if (!raw) return undefined;

  // Keep valid absolute URLs exactly as-is (including query tokens for signed URLs).
  if (raw.startsWith('https://') || raw.startsWith('http://')) {
    return raw;
  }

  // Salvage legacy malformed URLs such as "...jpg.blob:http://..." by keeping the first valid image URL.
  const extracted = raw.match(/https?:\/\/[^\s]+?\.(jpg|jpeg|png|webp|heic|heif)(?:\?[^\s]*)?/i);
  if (extracted?.[0]) {
    return extracted[0];
  }

  return undefined;
}

function mapActivity(row: any): Activity {
  const normalizedImages = Array.isArray(row.images)
    ? row.images
        .map((value: unknown) => normalizeImageUrl(value))
        .filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
    : [];

  const normalizedCoverImage = normalizeImageUrl(row.cover_image) ?? normalizedImages[0];

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    location: {
      name: row.location_name,
      lat: row.location_lat,
      lng: row.location_lng,
    },
    dateTime: row.date_time,
    maxSlots: row.max_slots,
    currentSlots: row.current_slots ?? row.max_slots,
    participants: row.participant_ids ?? [],
    hostId: row.host_id,
    hostName: row.host_name ?? '',
    hostPhoto: row.host_photo ?? '',
    coverImage: normalizedCoverImage,
    images: normalizedImages.length > 0 ? normalizedImages : undefined,
    requiresApproval: row.requires_approval,
    reactions: {
      fire: row.reaction_fire ?? 0,
      heart: row.reaction_heart ?? 0,
      like: row.reaction_like ?? 0,
    },
    status: row.status,
    createdAt: row.created_at,
  };
}

function isMissingImagesColumnError(error: unknown): boolean {
  const joined = [
    (error as any)?.code,
    (error as any)?.message,
    (error as any)?.details,
    (error as any)?.hint,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    joined.includes('pgrst204') ||
    joined.includes('schema cache') && joined.includes('images') && joined.includes('activities') ||
    joined.includes('column') && joined.includes('images') && joined.includes('does not exist')
  );
}

let runtimeUserId: string | null = null;
let runtimeParticipantChannel: any = null;
let runtimeActivityChannel: any = null;
let runtimeResolverInterval: ReturnType<typeof setInterval> | null = null;
let runtimeBootstrapPromise: Promise<void> | null = null;
let runtimeFetchActivities: (() => Promise<void>) | null = null;
let runtimeFetchJoinStatuses: (() => Promise<void>) | null = null;
let runtimeResolveDueJoinRequests: (() => Promise<void>) | null = null;
let runtimeResolverInFlight = false;

const RESOLVER_INTERVAL_MS = 10000;

function teardownActivitiesRuntime() {
  if (runtimeParticipantChannel) {
    void supabase.removeChannel(runtimeParticipantChannel);
    runtimeParticipantChannel = null;
  }

  if (runtimeActivityChannel) {
    void supabase.removeChannel(runtimeActivityChannel);
    runtimeActivityChannel = null;
  }

  if (runtimeResolverInterval) {
    clearInterval(runtimeResolverInterval);
    runtimeResolverInterval = null;
  }

  runtimeBootstrapPromise = null;
  runtimeFetchActivities = null;
  runtimeFetchJoinStatuses = null;
  runtimeResolveDueJoinRequests = null;
  runtimeResolverInFlight = false;
  runtimeUserId = null;
}

export function useActivities() {
  const activities = useActivityStore((state) => state.activities);
  const joinStatuses = useActivityStore((state) => state.joinStatuses);
  const setActivities = useActivityStore((state) => state.setActivities);
  const setJoinStatuses = useActivityStore((state) => state.setJoinStatuses);
  const updateActivity = useActivityStore((state) => state.updateActivity);
  const removeActivity = useActivityStore((state) => state.removeActivity);
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localJoinedIds, setLocalJoinedIds] = useState<string[]>([]);
  const localJoinStatusHistoryRef = useRef<Record<string, JoinRequestStatus>>({});
  const joinStatusesRef = useRef<Record<string, JoinRequestStatus>>({});
  const mockDecisionTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const resolverUnavailableRef = useRef(false);

  const persistLocalJoinedIds = useCallback(async (ids: string[]) => {
    if (!user?.uid) return;

    try {
      await AsyncStorage.setItem(`joinedActivities:${user.uid}`, JSON.stringify(ids));
    } catch {
      // Best-effort persistence for chat visibility fallback.
    }
  }, [user?.uid]);

  useEffect(() => {
    let isActive = true;

    const hydrateLocalJoinStatusHistory = async () => {
      if (!user?.uid) {
        localJoinStatusHistoryRef.current = {};
        return;
      }

      try {
        const raw = await AsyncStorage.getItem(`joinStatusHistory:${user.uid}`);
        if (!isActive) return;

        const parsed = raw ? JSON.parse(raw) : {};
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          localJoinStatusHistoryRef.current = {};
          return;
        }

        const normalized: Record<string, JoinRequestStatus> = {};
        Object.entries(parsed).forEach(([activityId, status]) => {
          if (
            status === 'pending' ||
            status === 'approved' ||
            status === 'rejected' ||
            status === 'cancelled'
          ) {
            normalized[activityId] = status;
          }
        });

        localJoinStatusHistoryRef.current = normalized;
      } catch {
        if (isActive) {
          localJoinStatusHistoryRef.current = {};
        }
      }
    };

    void hydrateLocalJoinStatusHistory();

    return () => {
      isActive = false;
    };
  }, [user?.uid]);

  const persistLocalJoinStatusHistory = useCallback(async (nextHistory: Record<string, JoinRequestStatus>) => {
    if (!user?.uid) return;

    try {
      await AsyncStorage.setItem(`joinStatusHistory:${user.uid}`, JSON.stringify(nextHistory));
    } catch {
      // Best-effort archive for chat/profile history fallback.
    }
  }, [user?.uid]);

  useEffect(() => {
    let isActive = true;

    const hydrateLocalJoinedIds = async () => {
      if (!user?.uid) {
        if (isActive) {
          setLocalJoinedIds([]);
        }
        return;
      }

      try {
        const raw = await AsyncStorage.getItem(`joinedActivities:${user.uid}`);
        if (!isActive) return;

        const parsed = raw ? JSON.parse(raw) : [];
        const normalized = Array.isArray(parsed)
          ? parsed.filter((value): value is string => typeof value === 'string')
          : [];
        setLocalJoinedIds(normalized);
      } catch {
        if (isActive) {
          setLocalJoinedIds([]);
        }
      }
    };

    void hydrateLocalJoinedIds();

    return () => {
      isActive = false;
    };
  }, [user?.uid]);

  useEffect(() => {
    joinStatusesRef.current = joinStatuses;
  }, [joinStatuses]);

  const isMockActivity = useCallback(
    (activityId: string) => activityId.startsWith('mock-'),
    []
  );

  const normalizeStatus = useCallback((status: string): JoinRequestStatus => {
    if (status === 'joined') return 'approved';
    if (status === 'pending' || status === 'approved' || status === 'rejected' || status === 'cancelled') {
      return status;
    }

    return 'pending';
  }, []);

  const delayRangeMs = useCallback(() => 3000 + Math.floor(Math.random() * 5000), []);

  const pickApprovalResult = useCallback((): JoinRequestStatus => {
    return Math.random() < 0.7 ? 'approved' : 'rejected';
  }, []);

  const isLegacyParticipantSchemaError = useCallback((error: any) => {
    const joinedText = [error?.message, error?.details, error?.hint]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return (
      joinedText.includes('decision_due_at') ||
      joinedText.includes('resolved_at') ||
      joinedText.includes('column') && joinedText.includes('does not exist')
    );
  }, []);

  const mergeActivities = useCallback((incoming: Activity[]) => {
    const merged = new Map<string, Activity>();

    MOCK_ACTIVITIES.forEach((activity) => {
      merged.set(activity.id, activity);
    });

    incoming.forEach((activity) => {
      merged.set(activity.id, activity);
    });

    return Array.from(merged.values()).sort(
      (left, right) => new Date(left.dateTime).getTime() - new Date(right.dateTime).getTime()
    );
  }, []);

  const syncJoinedActivities = useCallback(
    async (activityId: string, joined: boolean) => {
      if (!user) return;

      const currentJoined = user.activitiesJoined ?? [];
      const nextJoined = joined
        ? Array.from(new Set([...currentJoined, activityId]))
        : currentJoined.filter((joinedActivityId) => joinedActivityId !== activityId);

      const { error: profileError } = await supabase
        .from('profiles')
        .update({ activities_joined: nextJoined })
        .eq('id', user.uid);

      if (profileError) {
        if (!joined) {
          throw profileError;
        }

        // Preserve chat visibility locally even when profile persistence is temporarily unavailable.
        updateUser({ activitiesJoined: nextJoined });
        setLocalJoinedIds(nextJoined);
        void persistLocalJoinedIds(nextJoined);
        setError(profileError.message ?? 'Failed to persist joined activity');
        return nextJoined;
      }

      updateUser({ activitiesJoined: nextJoined });
      setLocalJoinedIds(nextJoined);
      void persistLocalJoinedIds(nextJoined);
      return nextJoined;
    },
    [persistLocalJoinedIds, updateUser, user]
  );

  const fetchJoinStatuses = useCallback(async () => {
    if (!user?.uid) {
      setJoinStatuses({});
      return;
    }

    const { data, error: fetchError } = await supabase
      .from('participants')
      .select('activity_id, status')
      .eq('user_id', user.uid)
      .neq('status', 'cancelled');

    const joinedIds = Array.from(new Set([...(user.activitiesJoined ?? []), ...localJoinedIds]));

    if (fetchError) {
      // Preserve known statuses on transient failures so chat access does not flicker.
      const fallbackStatuses = { ...joinStatusesRef.current, ...localJoinStatusHistoryRef.current };

      joinedIds.forEach((activityId) => {
        if (!fallbackStatuses[activityId]) {
          fallbackStatuses[activityId] = isMockActivity(activityId) ? 'approved' : 'pending';
        }
      });

      setError(fetchError.message ?? 'Failed to refresh join status');
      setJoinStatuses(fallbackStatuses);
      localJoinStatusHistoryRef.current = fallbackStatuses;
      void persistLocalJoinStatusHistory(fallbackStatuses);
      return;
    }

    const nextStatuses: Record<string, JoinRequestStatus> = { ...localJoinStatusHistoryRef.current };
    (data ?? []).forEach((row: any) => {
      nextStatuses[row.activity_id] = normalizeStatus(row.status);
    });

    const approvedActivityIds = (data ?? [])
      .filter((row: any) => normalizeStatus(row.status) === 'approved')
      .map((row: any) => row.activity_id)
      .filter((activityId: string) => !((user?.activitiesJoined ?? []).includes(activityId)));

    if (approvedActivityIds.length > 0) {
      await Promise.all(approvedActivityIds.map((activityId) => syncJoinedActivities(activityId, true)));
    }

    // Critical: For each activity in profile's activitiesJoined, ensure it has a join status.
    // This is especially important on page reload to restore previous joins.
    joinedIds.forEach((activityId) => {
      if (!nextStatuses[activityId]) {
        const previous = joinStatusesRef.current[activityId];
        if (previous) {
          nextStatuses[activityId] = previous;
          return;
        }

        // For mock activities, default to approved since they are profile-backed only.
        // For real activities in activities_joined with no participant row, prefer approved
        // to preserve legacy/previously-joined chat access on refresh.
        nextStatuses[activityId] = 'approved';
      }
    });

    setJoinStatuses(nextStatuses);
    localJoinStatusHistoryRef.current = nextStatuses;
    void persistLocalJoinStatusHistory(nextStatuses);
  }, [isMockActivity, localJoinedIds, normalizeStatus, persistLocalJoinStatusHistory, syncJoinedActivities, user?.activitiesJoined, user?.uid]);

  const resolveDueJoinRequests = useCallback(async () => {
    if (!user?.uid) return;
    if (resolverUnavailableRef.current) return;

    const { error: rpcError } = await supabase.rpc('resolve_due_join_requests', {
      p_user_id: user.uid,
      p_limit: 25,
    });

    if (rpcError) {
      const message = [rpcError.message, rpcError.details, rpcError.hint]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (
        message.includes('resolve_due_join_requests') ||
        message.includes('function') ||
        message.includes('404') ||
        message.includes('pgrst')
      ) {
        resolverUnavailableRef.current = true;
      }

      throw rpcError;
    }
  }, [user?.uid]);

  const fetchActivities = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('activities_full')
        .select('*')
        .eq('status', 'active')
        .order('date_time', { ascending: true });

      if (fetchError) throw fetchError;

      if (data) {
        // Fetch participant IDs for each activity
        const activityIds = data.map((a: any) => a.id);
        let parts: Array<{ activity_id: string; user_id: string }> = [];
        let activityMediaById: Record<string, { cover_image?: string | null; images?: string[] | null }> = {};

        if (activityIds.length > 0) {
          const { data: participantsData, error: participantsError } = await supabase
            .from('participants')
            .select('activity_id, user_id')
            .in('activity_id', activityIds)
            .eq('status', 'approved');

          if (participantsError) throw participantsError;
          parts = participantsData ?? [];

          try {
            let mediaRows:
              | Array<{ id: string; cover_image: string | null; images?: string[] | null }>
              | null = null;

            let { data: activityMediaRows, error: activityMediaError } = await supabase
              .from('activities')
              .select('id, cover_image, images')
              .in('id', activityIds);

            if (activityMediaError && isMissingImagesColumnError(activityMediaError)) {
              const { data: fallbackRows, error: fallbackError } = await supabase
                .from('activities')
                .select('id, cover_image')
                .in('id', activityIds);

              if (fallbackError) {
                throw fallbackError;
              }

              mediaRows = (fallbackRows ?? []).map((row: any) => ({
                id: row.id,
                cover_image: row.cover_image ?? null,
                images: null,
              }));
            } else {
              if (activityMediaError) {
                throw activityMediaError;
              }

              mediaRows = activityMediaRows ?? [];
            }

            activityMediaById = (mediaRows ?? []).reduce<Record<string, { cover_image?: string | null; images?: string[] | null }>>(
              (acc, row) => {
                acc[row.id] = {
                  cover_image: row.cover_image ?? null,
                  images: Array.isArray(row.images) ? row.images : row.images ?? null,
                };
                return acc;
              },
              {}
            );
          } catch {
            // Best-effort enrichment: keep using activities_full data when direct table media fetch is unavailable.
            activityMediaById = {};
          }
        }

        const participantMap: Record<string, string[]> = {};
        (parts ?? []).forEach((p: any) => {
          if (!participantMap[p.activity_id]) participantMap[p.activity_id] = [];
          participantMap[p.activity_id].push(p.user_id);
        });

        const remoteActivities = data.map((row: any) =>
          mapActivity({
            ...row,
            ...activityMediaById[row.id],
            participant_ids: participantMap[row.id] ?? [],
          })
        );

        setActivities(mergeActivities(remoteActivities));
      }
    } catch (err: any) {
      setError(err.message ?? 'Failed to load activities');
    } finally {
      setIsLoading(false);
    }
  }, [mergeActivities, setActivities]);

  useEffect(() => {
    if (runtimeUserId && runtimeUserId !== user?.uid) {
      teardownActivitiesRuntime();
    }

    if (!user?.uid) {
      if (runtimeUserId) {
        teardownActivitiesRuntime();
      }
      return;
    }

    runtimeUserId = user.uid;
    runtimeFetchActivities = fetchActivities;
    runtimeFetchJoinStatuses = fetchJoinStatuses;
    runtimeResolveDueJoinRequests = resolveDueJoinRequests;
  }, [fetchActivities, fetchJoinStatuses, resolveDueJoinRequests, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    if (!runtimeBootstrapPromise) {
      runtimeBootstrapPromise = (async () => {
        await Promise.all([
          runtimeFetchActivities?.() ?? Promise.resolve(),
          runtimeFetchJoinStatuses?.() ?? Promise.resolve(),
        ]);
      })();
    }

    void runtimeBootstrapPromise;
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    if (runtimeParticipantChannel) return;

    runtimeParticipantChannel = supabase
      .channel(`participants:user:${user.uid}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'participants',
          filter: `user_id=eq.${user.uid}`,
        },
        () => {
          void runtimeFetchJoinStatuses?.();
          void runtimeFetchActivities?.();
        }
      )
      .subscribe();
  }, [user?.uid]);

  // Listen to activity status changes to preserve chats even when activities become inactive
  useEffect(() => {
    if (!user?.uid) return;

    if (runtimeActivityChannel) return;

    runtimeActivityChannel = supabase
      .channel('activities:status')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'activities',
        },
        () => {
          // On activity status change, refetch join statuses to preserve chat visibility
          // for approved activities even if they're no longer 'active'
          void runtimeFetchJoinStatuses?.();
        }
      )
      .subscribe();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;

    if (runtimeResolverInterval) return;

    const resolveNow = async () => {
      if (runtimeResolverInFlight) return;
      runtimeResolverInFlight = true;

      try {
        await runtimeResolveDueJoinRequests?.();
      } catch {
        // Silent fail: resolver polling should not block app usage.
      } finally {
        runtimeResolverInFlight = false;
      }
    };

    void resolveNow();
    runtimeResolverInterval = setInterval(resolveNow, RESOLVER_INTERVAL_MS);
  }, [user?.uid]);

  useEffect(() => {
    return () => {
      Object.values(mockDecisionTimers.current).forEach((timer) => clearTimeout(timer));
      mockDecisionTimers.current = {};
    };
  }, []);

  const scheduleMockDecision = useCallback(
    async (activityId: string, userId: string, activityTitle: string) => {
      const delayMs = delayRangeMs();

      if (mockDecisionTimers.current[activityId]) {
        clearTimeout(mockDecisionTimers.current[activityId]);
      }

      // Capture activity at decision time for closure
      const currentActivity = activities.find((candidate) => candidate.id === activityId);

      mockDecisionTimers.current[activityId] = setTimeout(async () => {
        const resolvedStatus = pickApprovalResult();

        // Use captured activity or fallback to lookup (in case store was updated)
        const activity = currentActivity || activities.find((candidate) => candidate.id === activityId);

        if (activity && resolvedStatus === 'approved') {
          updateActivity({
            ...activity,
            currentSlots: Math.max(0, activity.currentSlots - 1),
            participants: activity.participants.includes(userId)
              ? activity.participants
              : [...activity.participants, userId],
          });
        }

        setJoinStatuses((prev) => {
          if (prev[activityId] !== 'pending') return prev;
          return { ...prev, [activityId]: resolvedStatus };
        });

        localJoinStatusHistoryRef.current = {
          ...localJoinStatusHistoryRef.current,
          [activityId]: resolvedStatus,
        };
        void persistLocalJoinStatusHistory(localJoinStatusHistoryRef.current);

        delete mockDecisionTimers.current[activityId];

        try {
          // Note: For mock activities, syncJoinedActivities was already called on join.
          // The approval/rejection only affects the local joinStatuses state. On page reload,
          // the activity will be found in profile.activitiesJoined and its status will be
          // restored from joinStatuses (which uses mock approval = 'approved' logic).
          await supabase.from('notifications').insert({
            user_id: userId,
            type: 'approval',
            title: resolvedStatus === 'approved' ? 'Join request approved' : 'Join request not approved',
            body:
              resolvedStatus === 'approved'
                ? `You can now access ${activityTitle} chat.`
                : `${activityTitle} join request was not approved.`,
            activity_id: null,
            read: false,
          });
        } catch {
          // Best-effort local mock notification.
        }
      }, delayMs);
    },
    [activities, delayRangeMs, persistLocalJoinStatusHistory, pickApprovalResult, updateActivity]
  );

  const joinActivity = useCallback(async (activityId: string, userId: string): Promise<boolean> => {
    try {
      const existingStatus = joinStatuses[activityId];
      if (existingStatus && existingStatus !== 'cancelled') {
        return false;
      }

      const currentActivity = activities.find((activity) => activity.id === activityId);

      if (!currentActivity) return false;

      setJoinStatuses((prev) => ({ ...prev, [activityId]: 'pending' }));

      // For real activities, insert into participants table
      if (!isMockActivity(activityId)) {
        const requiresApproval = currentActivity.requiresApproval;
        const decisionDueAt = requiresApproval ? null : new Date(Date.now() + delayRangeMs()).toISOString();
        const { error: joinError } = await supabase
          .from('participants')
          .insert({
            activity_id: activityId,
            user_id: userId,
            status: 'pending',
            decision_due_at: decisionDueAt,
            resolved_at: null,
          });

        if (joinError) {
          if (!isLegacyParticipantSchemaError(joinError)) {
            throw joinError;
          }

          // Legacy schema fallback
          const { error: fallbackError } = await supabase
            .from('participants')
            .insert({
              activity_id: activityId,
              user_id: userId,
              status: currentActivity.requiresApproval ? 'pending' : 'joined',
            });

          if (fallbackError) throw fallbackError;

          setJoinStatuses((prev) => ({
            ...prev,
            [activityId]: currentActivity.requiresApproval ? 'pending' : 'approved',
          }));
        }
      } else {
        // For mock activities, schedule auto-approval immediately (no DB insert needed)
        void scheduleMockDecision(activityId, userId, currentActivity.title);
      }

      // Persist joined activity IDs only for auto-resolved flows.
      if (!currentActivity.requiresApproval) {
        await syncJoinedActivities(activityId, true);
      }
      const nextHistory = { ...localJoinStatusHistoryRef.current, [activityId]: 'pending' as JoinRequestStatus };
      localJoinStatusHistoryRef.current = nextHistory;
      void persistLocalJoinStatusHistory(nextHistory);

      return true;
    } catch (err: any) {
      setJoinStatuses((prev) => {
        const next = { ...prev };
        delete next[activityId];
        return next;
      });
      setError(err.message ?? 'Failed to join activity');
      return false;
    }
  }, [activities, delayRangeMs, isLegacyParticipantSchemaError, isMockActivity, joinStatuses, persistLocalJoinStatusHistory, scheduleMockDecision, syncJoinedActivities]);

  const leaveActivity = useCallback(async (activityId: string, userId: string): Promise<boolean> => {
    try {
      const currentActivity = activities.find((activity) => activity.id === activityId);
      const currentStatus = joinStatuses[activityId];

      if (!currentActivity) return false;

      if (!isMockActivity(activityId)) {
        const { error: leaveError } = await supabase
          .from('participants')
          .delete()
          .eq('activity_id', activityId)
          .eq('user_id', userId);

        if (leaveError) throw leaveError;
      }

      await syncJoinedActivities(activityId, false);
      setJoinStatuses((prev) => {
        const next = { ...prev };
        delete next[activityId];
        return next;
      });

      if (mockDecisionTimers.current[activityId]) {
        clearTimeout(mockDecisionTimers.current[activityId]);
        delete mockDecisionTimers.current[activityId];
      }

      if (currentStatus === 'approved') {
        updateActivity({
          ...currentActivity,
          currentSlots: currentActivity.currentSlots + 1,
          participants: currentActivity.participants.filter((participant) => participant !== userId),
        });
      }

      return true;
    } catch (err: any) {
      setError(err.message ?? 'Failed to leave activity');
      return false;
    }
  }, [activities, isMockActivity, joinStatuses, syncJoinedActivities, updateActivity]);

  const deleteRejectedJoin = useCallback(async (activityId: string): Promise<boolean> => {
    if (!user?.uid) return false;

    try {
      if (joinStatuses[activityId] !== 'rejected') return false;

      if (!isMockActivity(activityId)) {
        const { data, error: rpcError } = await supabase.rpc('delete_rejected_join_request', {
          p_activity_id: activityId,
        });

        if (rpcError) throw rpcError;
        if (!data) return false;
      }

      setJoinStatuses((prev) => {
        const next = { ...prev };
        delete next[activityId];
        return next;
      });

      const nextHistory = { ...localJoinStatusHistoryRef.current };
      delete nextHistory[activityId];
      localJoinStatusHistoryRef.current = nextHistory;
      void persistLocalJoinStatusHistory(nextHistory);

      return true;
    } catch (err: any) {
      setError(err.message ?? 'Failed to delete rejected request');
      return false;
    }
  }, [isMockActivity, joinStatuses, persistLocalJoinStatusHistory, user?.uid]);

  const respondToJoinRequest = useCallback(async (activityId: string, requesterId: string, approved: boolean): Promise<boolean> => {
    if (!user?.uid) return false;

    try {
      const currentActivity = activities.find((activity) => activity.id === activityId);
      if (isMockActivity(activityId)) {
        if (!currentActivity || currentActivity.hostId !== user.uid || !currentActivity.requiresApproval) {
          setError('Only the activity host can update join requests.');
          return false;
        }
      }

      if (!isMockActivity(activityId)) {
        const { data, error: rpcError } = await supabase.rpc('respond_to_join_request', {
          p_activity_id: activityId,
          p_requester_id: requesterId,
          p_approved: approved,
        });

        if (rpcError) {
          const message = [rpcError.message, rpcError.details, rpcError.hint]
            .filter(Boolean)
            .join(' ');
          const canFallback =
            message.toLowerCase().includes('function') ||
            message.toLowerCase().includes('respond_to_join_request') ||
            message.toLowerCase().includes('schema cache');

          if (!canFallback) throw rpcError;
        } else if (data) {
          await fetchJoinStatuses();
          await fetchActivities();
          return true;
        } else {
          setError('No pending request was found, or only the activity host can approve it.');
          return false;
        }

        const { data: updatedRows, error: updateError } = await supabase
          .from('participants')
          .update({
            status: approved ? 'approved' : 'rejected',
            resolved_at: new Date().toISOString(),
            decision_due_at: null,
          })
          .eq('activity_id', activityId)
          .eq('user_id', requesterId)
          .eq('status', 'pending')
          .select('id');

        if (updateError) throw updateError;
        if (!updatedRows || updatedRows.length === 0) {
          setError('No pending request was found for this user.');
          return false;
        }

        await supabase.from('notifications').insert({
          user_id: requesterId,
          type: 'approval',
          title: approved ? 'Join request approved' : 'Join request not approved',
          body: approved
            ? `${currentActivity?.title ?? 'Your activity'} join request was approved.`
            : `${currentActivity?.title ?? 'Your activity'} join request was not approved.`,
          activity_id: activityId,
          read: false,
        });
      }

      await fetchJoinStatuses();
      await fetchActivities();
      return true;
    } catch (err: any) {
      setError(err.message ?? 'Failed to update join request');
      return false;
    }
  }, [activities, fetchActivities, fetchJoinStatuses, isMockActivity, user?.uid]);

  const approveJoinRequest = useCallback(async (activityId: string, requesterId: string): Promise<boolean> => {
    return respondToJoinRequest(activityId, requesterId, true);
  }, [respondToJoinRequest]);

  const rejectJoinRequest = useCallback(async (activityId: string, requesterId: string): Promise<boolean> => {
    return respondToJoinRequest(activityId, requesterId, false);
  }, [respondToJoinRequest]);

  const deleteHostedActivity = useCallback(async (activityId: string): Promise<boolean> => {
    if (!user?.uid) return false;

    try {
      const currentActivity = activities.find((activity) => activity.id === activityId);
      if (currentActivity && currentActivity.hostId !== user.uid) return false;

      if (!isMockActivity(activityId)) {
        const { data: deletedRows, error: deleteError } = await supabase
          .from('activities')
          .delete()
          .select('id')
          .eq('id', activityId)
          .eq('host_id', user.uid);

        if (deleteError) throw deleteError;
        if (!deletedRows || deletedRows.length === 0) return false;
      }

      removeActivity(activityId);

      setJoinStatuses((prev) => {
        const next = { ...prev };
        delete next[activityId];
        return next;
      });

      const nextHistory = { ...localJoinStatusHistoryRef.current };
      delete nextHistory[activityId];
      localJoinStatusHistoryRef.current = nextHistory;
      void persistLocalJoinStatusHistory(nextHistory);

      const nextLocalJoined = localJoinedIds.filter((joinedId) => joinedId !== activityId);
      setLocalJoinedIds(nextLocalJoined);
      void persistLocalJoinedIds(nextLocalJoined);

      const nextJoinedActivities = (user.activitiesJoined ?? []).filter((joinedId) => joinedId !== activityId);
      const nextHostedActivities = (user.activitiesHosted ?? []).filter((hostedId) => hostedId !== activityId);
      updateUser({
        activitiesJoined: nextJoinedActivities,
        activitiesHosted: nextHostedActivities,
      });

      return true;
    } catch (err: any) {
      setError(err.message ?? 'Failed to delete hosted activity');
      return false;
    }
  }, [
    activities,
    isMockActivity,
    localJoinedIds,
    persistLocalJoinStatusHistory,
    persistLocalJoinedIds,
    removeActivity,
    setJoinStatuses,
    updateUser,
    user,
  ]);

  const getJoinStatus = useCallback(
    (activityId: string): JoinRequestStatus | null => joinStatuses[activityId] ?? null,
    [joinStatuses]
  );

  const canAccessChat = useCallback(
    (activityId: string, hostId?: string) => {
      if (hostId && user?.uid && hostId === user.uid) return true;
      return joinStatuses[activityId] === 'approved';
    },
    [joinStatuses, user?.uid]
  );

  const joinedActivityIds = Object.entries(joinStatuses)
    .filter(([, status]) => status !== 'cancelled')
    .map(([activityId]) => activityId);

  const getActivity = useCallback(
    (id: string) => activities.find((a) => a.id === id) ?? null,
    [activities]
  );

  return {
    activities,
    joinStatuses,
    joinedActivityIds,
    isLoading,
    error,
    joinActivity,
    leaveActivity,
    deleteRejectedJoin,
    approveJoinRequest,
    rejectJoinRequest,
    deleteHostedActivity,
    getJoinStatus,
    canAccessChat,
    getActivity,
    refetch: async () => {
      await Promise.all([fetchActivities(), fetchJoinStatuses()]);
    },
  };
}
