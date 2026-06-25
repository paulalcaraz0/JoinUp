import { create } from 'zustand';
import type { Activity, JoinRequestStatus } from '../types';
import { MOCK_ACTIVITIES, SHOULD_USE_MOCK_ACTIVITIES } from '../lib/mockActivities';

interface ActivityState {
  activities: Activity[];
  joinStatuses: Record<string, JoinRequestStatus>;
  selectedCategory: string;
  searchQuery: string;
  setActivities: (activities: Activity[]) => void;
  setJoinStatuses: (
    next:
      | Record<string, JoinRequestStatus>
      | ((current: Record<string, JoinRequestStatus>) => Record<string, JoinRequestStatus>)
  ) => void;
  updateActivity: (activity: Activity) => void;
  removeActivity: (activityId: string) => void;
  setSelectedCategory: (category: string) => void;
  setSearchQuery: (query: string) => void;
  getFilteredActivities: () => Activity[];
}

function dedupeActivities(activities: Activity[]) {
  return Array.from(new Map(activities.map((activity) => [activity.id, activity])).values());
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  activities: SHOULD_USE_MOCK_ACTIVITIES ? MOCK_ACTIVITIES : [],
  joinStatuses: {},
  selectedCategory: 'All',
  searchQuery: '',
  setActivities: (activities) => set({ activities: dedupeActivities(activities) }),
  setJoinStatuses: (next) =>
    set((state) => ({
      joinStatuses:
        typeof next === 'function'
          ? next(state.joinStatuses)
          : next,
    })),
  updateActivity: (activity) =>
    set((state) => ({
      activities: dedupeActivities([
        ...state.activities.filter((item) => item.id !== activity.id),
        activity,
      ]),
    })),
  removeActivity: (activityId) =>
    set((state) => ({
      activities: state.activities.filter((activity) => activity.id !== activityId),
    })),
  setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  getFilteredActivities: () => {
    const { activities, selectedCategory, searchQuery } = get();
    let filtered = activities;

    if (selectedCategory !== 'All') {
      filtered = filtered.filter((a) => a.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.location.name.toLowerCase().includes(q)
      );
    }

    return filtered;
  },
}));
