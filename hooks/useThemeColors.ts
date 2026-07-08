import { useMemo } from 'react';
import { Colors, DarkColors } from '../constants/theme';
import { useThemeStore } from '../store/themeStore';

export function useThemeColors() {
  const mode = useThemeStore((state) => state.mode);

  return useMemo(
    () => ({
      mode,
      isDark: mode === 'dark',
      colors: mode === 'dark' ? DarkColors : Colors,
    }),
    [mode]
  );
}
