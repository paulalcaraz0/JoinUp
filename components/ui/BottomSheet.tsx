import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Pressable,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Colors, BorderRadius, Spacing } from '../../constants/theme';
import { useThemeColors } from '../../hooks/useThemeColors';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  snapPoints?: number[];
  children: React.ReactNode;
}

export function BottomSheet({
  visible,
  onClose,
  snapPoints = [400],
  children,
}: BottomSheetProps) {
  const { colors } = useThemeColors();
  const translateY = useSharedValue(SCREEN_HEIGHT);
  const context = useSharedValue({ y: 0 });
  const sheetHeight = snapPoints[0];

  const blurActiveElementOnWeb = React.useCallback(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const activeElement = document.activeElement as HTMLElement | null;
    if (activeElement?.blur) {
      activeElement.blur();
    }
  }, []);

  React.useEffect(() => {
    if (visible) {
      translateY.value = withSpring(SCREEN_HEIGHT - sheetHeight, {
        damping: 20,
        stiffness: 150,
      });
    } else {
      blurActiveElementOnWeb();
      translateY.value = withTiming(SCREEN_HEIGHT, { duration: 300 });
    }
  }, [blurActiveElementOnWeb, visible, sheetHeight]);

  const gesture = Gesture.Pan()
    .onStart(() => {
      context.value = { y: translateY.value };
    })
    .onUpdate((event) => {
      const newY = context.value.y + event.translationY;
      translateY.value = Math.max(newY, SCREEN_HEIGHT - sheetHeight);
    })
    .onEnd((event) => {
      if (event.translationY > 100) {
        translateY.value = withTiming(SCREEN_HEIGHT, { duration: 300 });
        runOnJS(blurActiveElementOnWeb)();
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(SCREEN_HEIGHT - sheetHeight, {
          damping: 20,
          stiffness: 150,
        });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: withTiming(visible ? 1 : 0, { duration: 300 }),
    pointerEvents: visible ? ('auto' as const) : ('none' as const),
  }));

  return (
    <>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            blurActiveElementOnWeb();
            onClose();
          }}
        />
      </Animated.View>
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            styles.sheet,
            { height: sheetHeight, backgroundColor: colors.surface, borderColor: colors.divider },
            animatedStyle,
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.divider }]} />
          {children}
        </Animated.View>
      </GestureDetector>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(27, 45, 69, 0.5)',
    zIndex: 100,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderTopLeftRadius: BorderRadius.sheet,
    borderTopRightRadius: BorderRadius.sheet,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    zIndex: 101,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.divider,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
});
