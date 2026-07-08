import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Colors, Typography, BorderRadius, Spacing, Shadows } from '../../constants/theme';
import { useThemeColors } from '../../hooks/useThemeColors';

interface PrimaryButtonProps {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
}

export function PrimaryButton({
  title,
  onPress,
  loading = false,
  disabled = false,
  style,
  textStyle,
  icon,
}: PrimaryButtonProps) {
  const { colors } = useThemeColors();

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: colors.accent, shadowColor: colors.accent },
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} size="small" />
      ) : (
        <>
          {icon}
          <Text style={[styles.text, { color: colors.white }, textStyle]}>{title}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.button,
    paddingVertical: 14,
    paddingHorizontal: Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 54,
    gap: Spacing.sm,
    ...Shadows.fab,
  },
  disabled: {
    backgroundColor: Colors.slate,
    opacity: 0.55,
  },
  text: {
    color: Colors.white,
    fontFamily: Typography.bodyBold,
    fontSize: 16,
    textAlign: 'center',
    letterSpacing: 0,
  },
});
