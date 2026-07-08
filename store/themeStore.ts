import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { ThemeMode } from '../constants/theme';

const THEME_STORAGE_KEY = 'joinup:theme-mode:v1';

interface ThemeState {
  mode: ThemeMode;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  setMode: (mode: ThemeMode) => Promise<void>;
  toggleMode: () => Promise<void>;
}

function normalizeThemeMode(value: unknown): ThemeMode {
  return value === 'dark' ? 'dark' : 'light';
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: 'light',
  isHydrated: false,
  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(THEME_STORAGE_KEY);
      set({ mode: normalizeThemeMode(stored), isHydrated: true });
    } catch {
      set({ mode: 'light', isHydrated: true });
    }
  },
  setMode: async (mode) => {
    set({ mode });
    try {
      await AsyncStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // Theme persistence is best-effort.
    }
  },
  toggleMode: async () => {
    const nextMode: ThemeMode = get().mode === 'dark' ? 'light' : 'dark';
    await get().setMode(nextMode);
  },
}));
