import React from 'react';
import { View, StyleSheet, ViewStyle, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/theme';
import { useThemeColors } from '../../hooks/useThemeColors';

interface ScreenWrapperProps {
  children: React.ReactNode;
  style?: ViewStyle;
  backgroundColor?: string;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
  statusBarStyle?: 'light-content' | 'dark-content';
}

export function ScreenWrapper({
  children,
  style,
  backgroundColor = Colors.cream,
  edges = ['top'],
  statusBarStyle = 'dark-content',
}: ScreenWrapperProps) {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useThemeColors();
  const resolvedBackgroundColor = backgroundColor === Colors.cream ? colors.cream : backgroundColor;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: resolvedBackgroundColor },
        edges.includes('top') && { paddingTop: insets.top },
        edges.includes('bottom') && { paddingBottom: insets.bottom },
        edges.includes('left') && { paddingLeft: insets.left },
        edges.includes('right') && { paddingRight: insets.right },
        style,
      ]}
    >
      <StatusBar
        barStyle={statusBarStyle === 'dark-content' && isDark ? 'light-content' : statusBarStyle}
        backgroundColor={resolvedBackgroundColor}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
