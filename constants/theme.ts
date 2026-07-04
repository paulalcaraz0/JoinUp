import { Platform } from 'react-native';

/* ── Brand tokens ─────────────────────────────────────────── */
export const Colors = {
  primary: '#152238',
  primarySoft: '#243653',
  accent: '#FF6B35',
  accentSoft: '#FFF0EA',
  peach: '#F7C59F',
  cream: '#F7F8FA',
  white: '#FFFFFF',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFCFA',
  mutedSurface: '#EEF2F7',
  inkMuted: '#EEF3F8',
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
  ms: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  xxxl: 48,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  card: 16,
  pill: 24,
  full: 9999,
  input: 14,
  button: 14,
  sheet: 24,
} as const;

export const Shadows = {
  hairline: Platform.select({
    web: {
      boxShadow: '0px 1px 2px rgba(21, 34, 56, 0.04)',
    },
    default: {
      shadowColor: '#152238',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1,
    },
  }),
  card: Platform.select({
    web: {
      boxShadow: '0px 12px 28px rgba(21, 34, 56, 0.09)',
    },
    default: {
      shadowColor: '#152238',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.09,
      shadowRadius: 20,
      elevation: 5,
    },
  }),
  soft: Platform.select({
    web: {
      boxShadow: '0px 8px 18px rgba(21, 34, 56, 0.06)',
    },
    default: {
      shadowColor: '#152238',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.06,
      shadowRadius: 14,
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
