import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../hooks/useThemeColors';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({
  icon = 'search-outline',
  title,
  message,
  actionLabel,
  onAction,
  style,
}: EmptyStateProps) {
  const { colors } = useThemeColors();

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.iconWrap, { backgroundColor: colors.accentSoft, borderColor: colors.divider }]}>
        <Ionicons name={icon} size={34} color={colors.accent} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.slate }]}>{message}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.accent }]} onPress={onAction} activeOpacity={0.85}>
          <Text style={styles.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xl * 2,
    backgroundColor: 'transparent',
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentSoft,
    borderWidth: 1,
    borderColor: Colors.divider,
    marginBottom: Spacing.md,
  },
  title: {
    fontFamily: Typography.bodyBold,
    fontSize: 19,
    color: Colors.text,
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  message: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.slate,
    textAlign: 'center',
    lineHeight: 20,
  },
  actionBtn: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 11,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.accent,
  },
  actionText: {
    fontFamily: Typography.bodyBold,
    fontSize: 14,
    color: Colors.white,
  },
});
