import { Platform } from 'react-native';

/* ── Brand tokens ─────────────────────────────────────────── */
export const Colors = {
  primary: '#152238',
  accent: '#FF6B35',
  peach: '#F7C59F',
  cream: '#F7F8FA',
  white: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFCFA',
  mutedSurface: '#EEF2F7',
  slate: '#8A96A8',
  text: '#152238',
  textSecondary: '#526173',
  divider: '#E4E8EF',
  success: '#2ECC71',
  warning: '#F39C12',
  error: '#E74C3C',
  danger: '#E74C3C',
  overlay: 'rgba(21,34,56,0.56)',
} as const;

export const Typography = {
  heading: 'Syne_700Bold',
  body: 'DMSans_400Regular',
  bodyMed: 'DMSans_500Medium',
  bodyBold: 'DMSans_700Bold',
  display: 'Syne_700Bold',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  xxxl: 48,
} as const;

export const BorderRadius = {
  sm: 8,
  card: 12,
  pill: 24,
  full: 9999,
  input: 14,
  button: 14,
  sheet: 24,
} as const;

export const Shadows = {
  card: Platform.select({
    web: {
      boxShadow: '0px 10px 24px rgba(21, 34, 56, 0.10)',
    },
    default: {
      shadowColor: '#152238',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.10,
      shadowRadius: 18,
      elevation: 5,
    },
  }),
  soft: Platform.select({
    web: {
      boxShadow: '0px 6px 16px rgba(21, 34, 56, 0.07)',
    },
    default: {
      shadowColor: '#152238',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
  }),
  fab: Platform.select({
    web: {
      boxShadow: `0px 4px 8px ${Colors.accent}4D`,
    },
    default: {
      shadowColor: Colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
  }),
} as const;

export const Categories = [
  'All',
  'Fitness',
  'Study',
  'Café',
  'Outdoors',
  'Gaming',
  'Social',
  'Food',
  'Other',
] as const;

export const CategoryColors: Record<string, string> = {
  Fitness: '#FF6B35',
  Study: '#3498DB',
  Café: '#F39C12',
  Outdoors: '#2ECC71',
  Gaming: '#9B59B6',
  Social: '#E91E63',
  Food: '#E74C3C',
  Other: '#8C9BB5',
} as const;
