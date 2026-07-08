import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, useSharedValue, withTiming } from 'react-native-reanimated';
import { Colors, Typography, BorderRadius, Spacing, CategoryColors } from '../../constants/theme';
import { useThemeColors } from '../../hooks/useThemeColors';

interface CategoryChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  style?: ViewStyle;
  size?: 'sm' | 'md';
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export function CategoryChip({
  label,
  selected,
  onPress,
  style,
  size = 'md',
}: CategoryChipProps) {
  const { colors } = useThemeColors();
  const chipColor = CategoryColors[label] ?? Colors.accent;

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(selected ? chipColor : colors.surfaceElevated, { duration: 200 }),
    borderColor: withTiming(selected ? chipColor : colors.divider, { duration: 200 }),
    transform: [{ scale: withSpring(selected ? 1 : 1, { damping: 15 }) }],
  }));

  return (
    <AnimatedTouchable
      style={[
        size === 'sm' ? styles.chipSm : styles.chip,
        animatedStyle,
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text
        style={[
          size === 'sm' ? styles.labelSm : styles.label,
          { color: selected ? colors.white : colors.text },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        {label}
      </Text>
    </AnimatedTouchable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    marginRight: 6,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipSm: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    marginRight: 6,
    minHeight: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontFamily: Typography.bodyMed,
    fontSize: 14,
  },
  labelSm: {
    fontFamily: Typography.bodyMed,
    fontSize: 11,
  },
});
