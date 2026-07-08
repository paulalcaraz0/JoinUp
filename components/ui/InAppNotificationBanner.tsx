import React, { useEffect, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../constants/theme';
import { useThemeColors } from '../../hooks/useThemeColors';

type BannerPayload = {
  id: string;
  title: string;
  body: string;
};

interface InAppNotificationBannerProps {
  notification: BannerPayload | null;
  onHidden?: () => void;
}

export function InAppNotificationBanner({ notification, onHidden }: InAppNotificationBannerProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useThemeColors();
  const shouldUseNativeDriver = Platform.OS !== 'web';
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-16)).current;

  useEffect(() => {
    if (!notification) return;

    const fadeIn = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: shouldUseNativeDriver,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 220,
        useNativeDriver: shouldUseNativeDriver,
      }),
    ]);

    const fadeOut = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 220,
        useNativeDriver: shouldUseNativeDriver,
      }),
      Animated.timing(translateY, {
        toValue: -10,
        duration: 220,
        useNativeDriver: shouldUseNativeDriver,
      }),
    ]);

    fadeIn.start();
    const timer = setTimeout(() => {
      fadeOut.start(() => {
        onHidden?.();
      });
    }, 2600);

    return () => {
      clearTimeout(timer);
    };
  }, [notification, onHidden, opacity, shouldUseNativeDriver, translateY]);

  if (!notification) return null;

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          top: insets.top + Spacing.sm,
          pointerEvents: 'none',
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View style={[styles.card, Shadows.card, { backgroundColor: colors.primary, borderColor: colors.white + '22' }]}>
        <Text style={styles.title} numberOfLines={1}>{notification.title}</Text>
        <Text style={styles.body} numberOfLines={2}>{notification.body}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 1200,
  },
  card: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.card,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Colors.white + '22',
  },
  title: {
    color: Colors.white,
    fontFamily: Typography.bodyBold,
    fontSize: 14,
  },
  body: {
    color: Colors.white + 'DD',
    fontFamily: Typography.body,
    fontSize: 13,
    marginTop: 3,
    lineHeight: 18,
  },
});
