import 'react-native-url-polyfill/auto';
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const expoExtra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

export const supabaseConfig = {
  url:
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    expoExtra.supabaseUrl ??
    expoExtra.EXPO_PUBLIC_SUPABASE_URL,
  anonKey:
    process.env.EXPO_PUBLIC_SUPABASE_KEY ??
    expoExtra.supabaseAnonKey ??
    expoExtra.EXPO_PUBLIC_SUPABASE_KEY,
};

export const isSupabaseConfigured = Boolean(supabaseConfig.url && supabaseConfig.anonKey);

if (!isSupabaseConfigured) {
  // Don't throw at import time — allow the app to boot so Metro/router can show UI.
  // Consumers of `supabase` will get a helpful runtime error if they try to use it.
}

const createThrowingProxy = (message: string): SupabaseClient =>
  new Proxy(
    {} as SupabaseClient,
    {
      get() {
        return () => {
          throw new Error(message);
        };
      },
    }
  );

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseConfig.url!, supabaseConfig.anonKey!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : createThrowingProxy(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY and restart Expo.'
    );
