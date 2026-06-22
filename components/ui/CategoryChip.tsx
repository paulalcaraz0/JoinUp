import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, useSharedValue, withTiming } from 'react-native-reanimated';
import { Colors, Typography, BorderRadius, Spacing, CategoryColors } from '../../constants/theme';

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
  const chipColor = CategoryColors[label] ?? Colors.accent;

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: withTiming(selected ? chipColor : Colors.surface, { duration: 200 }),
    borderColor: withTiming(selected ? chipColor : Colors.divider, { duration: 200 }),
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
          { color: selected ? Colors.white : Colors.text },
        ]}
      >
        {label}
      </Text>
    </AnimatedTouchable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    marginRight: 6,
    minHeight: 34,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipSm: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    marginRight: 6,
    minHeight: 30,
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
