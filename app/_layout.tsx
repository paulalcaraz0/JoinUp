import React, { useEffect, useState } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts, Syne_700Bold } from '@expo-google-fonts/syne';
import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import * as SplashScreen from 'expo-splash-screen';
import { queryClient } from '../lib/queryClient';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { InAppNotificationBanner } from '../components/ui/InAppNotificationBanner';
import { Colors } from '../constants/theme';
import { useThemeStore } from '../store/themeStore';
import { useThemeColors } from '../hooks/useThemeColors';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Syne_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });
  useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, user } = useAuthStore();
  const hydrateTheme = useThemeStore((state) => state.hydrate);
  const isThemeHydrated = useThemeStore((state) => state.isHydrated);
  const { colors, isDark } = useThemeColors();
  const [authBootstrapped, setAuthBootstrapped] = useState(false);
  const [bannerNotification, setBannerNotification] = useState<{
    id: string;
    title: string;
    body: string;
  } | null>(null);

  useEffect(() => {
    void hydrateTheme();
  }, [hydrateTheme]);

  useEffect(() => {
    if (!isLoading) {
      setAuthBootstrapped(true);
    }
  }, [isLoading]);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    if (!fontsLoaded || !authBootstrapped) {
      return;
    }

    const currentPath = pathname || '/';
    const isAuthRoute =
      currentPath === '/' ||
      currentPath.startsWith('/(auth)') ||
      currentPath.startsWith('/sign-in') ||
      currentPath.startsWith('/sign-up');

    const isProtectedRoute =
      currentPath.startsWith('/(tabs)') ||
      currentPath.startsWith('/activity') ||
      currentPath.startsWith('/buddy') ||
      currentPath.startsWith('/chat') ||
      currentPath.startsWith('/notifications') ||
      currentPath.startsWith('/profile') ||
      currentPath.startsWith('/explore') ||
      currentPath.startsWith('/create');

    if (__DEV__) {
      console.log('[auth] navigation decision', {
        currentPath,
        isAuthenticated,
        isLoading,
        authBootstrapped,
        isAuthRoute,
        isProtectedRoute,
      });
    }

    if (!isAuthenticated && isProtectedRoute) {
      if (__DEV__) {
        console.log('[auth] navigation redirect', {
          from: currentPath,
          to: '/(auth)',
          reason: 'protected route without authenticated user',
        });
      }
      router.replace('/(auth)');
      return;
    }

    if (isAuthenticated && isAuthRoute) {
      if (__DEV__) {
        console.log('[auth] navigation redirect', {
          from: currentPath,
          to: '/(tabs)',
          reason: 'authenticated user on auth route',
        });
      }
      router.replace('/(tabs)');
    }
  }, [authBootstrapped, fontsLoaded, isAuthenticated, pathname, router]);

  useEffect(() => {
    if (!user?.uid) return;

    const channel = supabase
      .channel(`banner-notifications:${user.uid}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.uid}`,
        },
        (payload: any) => {
          const incoming = payload.new;
          if (!incoming?.id) return;

          setBannerNotification({
            id: incoming.id,
            title: incoming.title ?? 'Notification',
            body: incoming.body ?? '',
          });
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.uid]);

  if (!fontsLoaded || !authBootstrapped || !isThemeHydrated) {
    return (
      <View style={[styles.bootContainer, { backgroundColor: colors.primary }]}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.cream} />
          <InAppNotificationBanner
            notification={bannerNotification}
            onHidden={() => setBannerNotification(null)}
          />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="auth/callback" />
            <Stack.Screen
              name="activity/[id]"
              options={{
                animation: 'slide_from_right',
              }}
            />
            <Stack.Screen
              name="buddy"
              options={{
                animation: 'slide_from_right',
              }}
            />
            <Stack.Screen
              name="chat/[id]"
              options={{
                animation: 'slide_from_right',
              }}
            />
            <Stack.Screen
              name="notifications"
              options={{
                animation: 'slide_from_right',
              }}
            />
          </Stack>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  bootContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
});
