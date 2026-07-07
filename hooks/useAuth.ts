import { useState, useCallback, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useAuthStore } from '../store/authStore';
import { supabase, supabaseConfig } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import type { User } from '../types';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_AUTH_TIMEOUT_MS = 45000;
const EMAIL_AUTH_TIMEOUT_MS = 30000;
const PROFILE_QUERY_TIMEOUT_MS = 20000;
const SUPABASE_STORAGE_KEY_PREFIX = 'sb-';
const PROFILE_SELECT =
  'id, display_name, photo_url, bio, location, age_range, interests, activities_joined, rating, rating_count, verification_status, created_at';
const CORE_PROFILE_SELECT =
  'id, display_name, photo_url, bio, age_range, interests, activities_joined, rating, rating_count, created_at';
const APP_AUTH_CACHE_KEY_PREFIXES = [
  'supabase.auth.token',
  'joinedActivities:',
  'joinStatusHistory:',
  'chatUnreadActivityIds:v1:',
  'chatReadMarker:v1:',
];

function authDebug(label: string, payload?: unknown) {
  if (!__DEV__) return;

  if (payload === undefined) {
    console.log(`[auth] ${label}`);
    return;
  }

  console.log(`[auth] ${label}`, payload);
}

function serializeAuthError(error: any) {
  if (!error) return null;

  return {
    name: error.name,
    message: error.message,
    code: error.code,
    status: error.status,
    details: error.details,
    hint: error.hint,
    stack: error.stack,
  };
}

function isSchemaCacheError(error: any) {
  const text = [error?.code, error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return text.includes('schema cache') || text.includes('pgrst20');
}

function getFriendlyAuthErrorMessage(error: any) {
  const rawMessage = String(error?.message ?? '').trim();
  const message = rawMessage.toLowerCase();

  if (message.includes('invalid login credentials')) {
    return 'Incorrect email or password. Please check your details and try again.';
  }

  if (message.includes('email not confirmed')) {
    return 'Please verify your email first, then sign in.';
  }

  if (message.includes('network') || message.includes('fetch') || message.includes('timed out')) {
    return rawMessage || 'Network error. Check your connection and try again.';
  }

  if (message.includes('profile query failed')) {
    return 'Signed in, but JoinUp could not load your profile. Please try again.';
  }

  return rawMessage || 'Failed to sign in. Please check your credentials.';
}

async function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out. Check your network connection and try again.`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isLikelyExistingEmailSignUpResponse(authData: any, normalizedEmail: string) {
  const user = authData?.user;

  if (authData?.session || !user) {
    return false;
  }

  const identities = (user as any)?.identities;
  if (Array.isArray(identities) && identities.length === 0) {
    return true;
  }

  // Supabase can return the existing user object without throwing.
  // If the account is clearly older than "just now", treat this as duplicate email.
  const returnedEmail = String((user as any)?.email ?? '').trim().toLowerCase();
  const createdAtMs = Date.parse(String((user as any)?.created_at ?? ''));
  const looksOld = Number.isFinite(createdAtMs) && Date.now() - createdAtMs > 60_000;

  return returnedEmail === normalizedEmail && looksOld;
}

function isExpoGoRuntime() {
  if (Platform.OS === 'web') {
    return false;
  }

  // `appOwnership` can vary across SDK/runtime combinations.
  // `executionEnvironment === 'storeClient'` reliably indicates Expo Go.
  const executionEnvironment = String((Constants as any).executionEnvironment ?? '').toLowerCase();
  const appOwnership = String((Constants as any).appOwnership ?? '').toLowerCase();

  return executionEnvironment === 'storeclient' || appOwnership === 'expo';
}

function getOAuthRedirectUri() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }

  if (isExpoGoRuntime()) {
    return Linking.createURL('/auth/callback');
  }

  // Development builds and standalone apps should always use the custom scheme callback.
  return 'joinup://auth/callback';
}

function extractAuthCallbackData(callbackUrl: string) {
  const parsedUrl = new URL(callbackUrl);
  const hash = parsedUrl.hash.startsWith('#') ? parsedUrl.hash.slice(1) : parsedUrl.hash;
  const hashParams = new URLSearchParams(hash);

  return {
    code: parsedUrl.searchParams.get('code'),
    accessToken: parsedUrl.searchParams.get('access_token') ?? hashParams.get('access_token'),
    refreshToken: parsedUrl.searchParams.get('refresh_token') ?? hashParams.get('refresh_token'),
    errorDescription:
      parsedUrl.searchParams.get('error_description') ??
      parsedUrl.searchParams.get('error') ??
      hashParams.get('error_description') ??
      hashParams.get('error'),
  };
}

async function finalizeOAuthCallbackUrl(
  callbackUrl: string,
  setUser: (user: User | null) => void
) {
  const { code, accessToken, refreshToken, errorDescription } = extractAuthCallbackData(callbackUrl);

  if (errorDescription) {
    throw new Error(decodeURIComponent(errorDescription));
  }

  if (code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;

    const {
      data: { session: exchangedSession },
    } = await supabase.auth.getSession();

    if (exchangedSession) {
      await resolveSessionUser(exchangedSession, setUser);
      return true;
    }

    return false;
  }

  if (accessToken && refreshToken) {
    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (setSessionError) throw setSessionError;

    const {
      data: { session: tokenSession },
    } = await supabase.auth.getSession();

    if (tokenSession) {
      await resolveSessionUser(tokenSession, setUser);
      return true;
    }

    return false;
  }

  return false;
}

async function isGoogleProviderEnabled() {
  const supabaseUrl = supabaseConfig.url;
  const supabaseKey = supabaseConfig.anonKey;

  if (!supabaseUrl || !supabaseKey) {
    return true;
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
  });

  if (!response.ok) {
    return true;
  }

  const settings = await response.json();
  return !!settings?.external?.google;
}

function mapProfile(id: string, profile: any): User {
  return {
    uid: id,
    displayName: profile.display_name ?? '',
    photoURL: profile.photo_url ?? '',
    bio: profile.bio ?? '',
    location: profile.location ?? '',
    ageRange: profile.age_range ?? '18-24',
    interests: profile.interests ?? [],
    activitiesJoined: profile.activities_joined ?? [],
    activitiesHosted: [],
    rating: Number(profile.rating ?? 0),
    ratingCount: profile.rating_count ?? 0,
    verificationStatus: profile.verification_status ?? 'unverified',
    createdAt: profile.created_at ?? new Date().toISOString(),
  };
}

async function resolveSessionUser(session: any, setUser: (user: User | null) => void) {
  if (!session?.user) {
    authDebug('resolveSessionUser: no session user');
    setUser(null);
    return;
  }

  authDebug('first database query after login:start', {
    object: 'public.profiles',
    query: `profiles.select(${PROFILE_SELECT}).eq(id, ${session.user.id}).maybeSingle()`,
  });

  let profileSelect = PROFILE_SELECT;
  const profileResult = await withTimeout(
    supabase
    .from('profiles')
    .select(PROFILE_SELECT)
    .eq('id', session.user.id)
      .maybeSingle(),
    PROFILE_QUERY_TIMEOUT_MS,
    'Profile query'
  );
  let profile: any = profileResult.data;
  let profileError: any = profileResult.error;

  if (profileError && isSchemaCacheError(profileError)) {
    authDebug('first database query after login:schema fallback', {
      query: `profiles.select(${CORE_PROFILE_SELECT}).eq(id, ${session.user.id}).maybeSingle()`,
      error: serializeAuthError(profileError),
    });

    profileSelect = CORE_PROFILE_SELECT;
    const fallbackResult = await withTimeout(
      supabase
        .from('profiles')
        .select(CORE_PROFILE_SELECT)
        .eq('id', session.user.id)
        .maybeSingle(),
      PROFILE_QUERY_TIMEOUT_MS,
      'Profile query'
    );

    profile = fallbackResult.data;
    profileError = fallbackResult.error;
  }

  authDebug('first database query after login:result', {
    hasProfile: Boolean(profile),
    error: serializeAuthError(profileError),
  });

  if (profileError) {
    const message = profileError.message ?? 'Failed to load profile after login.';
    const wrapped = new Error(`Profile query failed: ${message}`);
    (wrapped as any).cause = profileError;
    (wrapped as any).query = `profiles.select(${profileSelect}).eq(id, ${session.user.id}).maybeSingle()`;
    authDebug('first database query after login:error', {
      query: (wrapped as any).query,
      error: serializeAuthError(profileError),
      stack: wrapped.stack,
    });
    throw wrapped;
  }

  if (profile) {
    setUser(mapProfile(session.user.id, profile));
    return;
  }

  setUser({
    uid: session.user.id,
    displayName: session.user.user_metadata?.display_name ?? '',
    photoURL: session.user.user_metadata?.avatar_url ?? '',
    bio: '',
    location: '',
    ageRange: '18-24',
    interests: [],
    activitiesJoined: [],
    activitiesHosted: [],
    rating: 0,
    ratingCount: 0,
    verificationStatus: 'unverified',
    createdAt: new Date().toISOString(),
  });
}

export async function signOutAndResetSession() {
  try {
    await withTimeout(
      supabase.auth.signOut({ scope: 'global' }),
      10000,
      'Sign out timed out. Local session was cleared on this device.'
    );
  } finally {
    queryClient.clear();
    useAuthStore.getState().signOut();
    await clearLocalAuthSessionCache();
  }
}

export async function clearLocalAuthSessionCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const authKeys = keys.filter(
      (key) =>
        key.startsWith(SUPABASE_STORAGE_KEY_PREFIX) ||
        APP_AUTH_CACHE_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
    );

    if (authKeys.length > 0) {
      await AsyncStorage.multiRemove(authKeys);
    }
  } catch {
    // Best-effort cleanup for development/testing and logout.
  }
}

type UseAuthOptions = {
  initialize?: boolean;
};

export function useAuth(options: UseAuthOptions = {}) {
  const { initialize = true } = options;
  const { user, isAuthenticated, isLoading, setUser, setLoading } = useAuthStore();
  const [error, setError] = useState<string | null>(null);
  const sessionSyncKeyRef = useRef<string | null>(null);
  const sessionSyncPromiseRef = useRef<Promise<void> | null>(null);

  // Listen for auth state changes
  useEffect(() => {
    if (!initialize) {
      return;
    }

    let isActive = true;

    const syncSession = async (session: any) => {
      const sessionKey = session?.access_token
        ? `${session.user?.id ?? 'unknown'}:${session.access_token}`
        : 'no-session';

      if (sessionSyncKeyRef.current === sessionKey && sessionSyncPromiseRef.current) {
        authDebug('auth state session sync skipped', {
          reason: 'same session already syncing',
          userId: session?.user?.id,
        });
        return sessionSyncPromiseRef.current;
      }

      sessionSyncKeyRef.current = sessionKey;
      const syncPromise = (async () => {
      try {
        await resolveSessionUser(session, (nextUser) => {
          if (isActive) {
            setUser(nextUser);
          }
        });
      } catch (err) {
        authDebug('auth state session sync failed', {
          error: serializeAuthError(err),
          cause: serializeAuthError((err as any)?.cause),
        });

        if (isActive && !session?.user) {
          setUser(null);
        }
      } finally {
        if (sessionSyncKeyRef.current === sessionKey) {
          sessionSyncPromiseRef.current = null;
        }
      }
      })();

      sessionSyncPromiseRef.current = syncPromise;
      return syncPromise;
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        authDebug('auth state change', {
          event,
          hasSession: Boolean(session),
          userId: session?.user?.id,
        });
        setTimeout(() => {
          void syncSession(session);
        }, 0);
      }
    );

    const bootstrapAuth = async () => {
      if (__DEV__) {
        console.time('[auth] bootstrap session');
      }

      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const callbackUrl = new URL(window.location.href);
          const callbackCode = callbackUrl.searchParams.get('code');
          const callbackError =
            callbackUrl.searchParams.get('error_description') ??
            callbackUrl.searchParams.get('error');

          if (callbackError) {
            setError(decodeURIComponent(callbackError));
          }

          if (callbackCode) {
            const { data: exchangedData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(callbackCode);
            if (exchangeError) {
              throw exchangeError;
            }

            await syncSession(exchangedData.session);

            // Clean OAuth callback params from URL after exchanging code.
            callbackUrl.searchParams.delete('code');
            callbackUrl.searchParams.delete('state');
            callbackUrl.searchParams.delete('error');
            callbackUrl.searchParams.delete('error_code');
            callbackUrl.searchParams.delete('error_description');
            callbackUrl.searchParams.delete('provider_token');
            callbackUrl.searchParams.delete('provider_refresh_token');

            window.history.replaceState({}, '', `${callbackUrl.pathname}${callbackUrl.search}${callbackUrl.hash}`);
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!sessionSyncPromiseRef.current) {
          await syncSession(session);
        }
      } catch {
        if (isActive) {
          setUser(null);
        }
      } finally {
        if (__DEV__) {
          console.timeEnd('[auth] bootstrap session');
        }

        if (isActive) {
          setLoading(false);
        }
      }
    };

    bootstrapAuth();

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [initialize, setLoading, setUser]);

  useEffect(() => {
    if (!isLoading) {
      return;
    }

    const timer = setTimeout(() => {
      setLoading(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, [isLoading, setLoading]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      try {
        authDebug('login start', { email: email.trim().toLowerCase() });
        setLoading(true);
        setError(null);

        const normalizedEmail = email.trim().toLowerCase();
        const { data: authData, error: authError } = await withTimeout(
          supabase.auth.signInWithPassword({
            email: normalizedEmail,
            password,
          }),
          EMAIL_AUTH_TIMEOUT_MS,
          'Supabase sign in'
        );
        authDebug('supabase auth response', {
          hasSession: Boolean(authData?.session),
          userId: authData?.user?.id,
          error: serializeAuthError(authError),
        });
        if (authError) throw authError;
        if (!authData?.session) {
          throw new Error('Supabase sign in did not return a session. Please try again.');
        }

        await resolveSessionUser(authData.session, setUser);
      } catch (err: any) {
        authDebug('login failed', {
          error: serializeAuthError(err),
          cause: serializeAuthError(err?.cause),
          query: err?.query,
        });
        const friendlyMessage = getFriendlyAuthErrorMessage(err);
        setError(friendlyMessage);
        const friendlyError = new Error(friendlyMessage);
        (friendlyError as any).cause = err;
        throw friendlyError;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setUser]
  );

  const signUp = useCallback(
    async (data: {
      fullName: string;
      email: string;
      password: string;
      ageRange: string;
      interests: string[];
    }): Promise<{ requiresEmailConfirmation: boolean }> => {
      try {
        setLoading(true);
        setError(null);

        const normalizedEmail = data.email.trim().toLowerCase();

        const { data: emailExists, error: emailCheckError } = await supabase.rpc(
          'email_is_registered',
          { input_email: normalizedEmail }
        );

        const missingEmailCheckFunction =
          String((emailCheckError as any)?.message ?? '').toLowerCase().includes('email_is_registered') ||
          String((emailCheckError as any)?.code ?? '') === 'PGRST202';

        if (emailCheckError && !missingEmailCheckFunction) {
          throw emailCheckError;
        }

        if (emailExists) {
          throw new Error('This email is already registered. Please sign in instead.');
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password: data.password,
          options: {
            data: {
              display_name: data.fullName,
              age_range: data.ageRange,
              interests: JSON.stringify(data.interests),
            },
          },
        });
        if (authError) throw authError;

        // When email-confirmation is enabled, Supabase can return a "fake" user for
        // already-registered emails (no session + empty identities) instead of throwing.
        const isExistingEmailResponse = isLikelyExistingEmailSignUpResponse(
          authData,
          normalizedEmail
        );

        if (isExistingEmailResponse) {
          throw new Error('This email is already registered. Please sign in instead.');
        }

        // If we have a session immediately, user is logged in and profile trigger has fired
        if (authData.session) {
          // Small delay to ensure trigger has completed
          await new Promise((r) => setTimeout(r, 500));
          await resolveSessionUser(authData.session, setUser);
          return { requiresEmailConfirmation: false };
        }

        // No session yet (email confirmation required) — don't try to write to profiles
        // The database trigger will create profile row when auth.users is created
        // We'll update with interests later once user confirms email and logs in
        setUser(null);
        return { requiresEmailConfirmation: true };
      } catch (err: any) {
        const rawMessage = String(err?.message ?? '').toLowerCase();
        const duplicateEmail =
          rawMessage.includes('user already registered') ||
          rawMessage.includes('already registered') ||
          rawMessage.includes('already exists') ||
          rawMessage.includes('email address is already in use') ||
          rawMessage.includes('duplicate key');

        if (duplicateEmail) {
          setError('This email is already registered. Please sign in instead.');
        } else {
          setError(err.message ?? 'Failed to create account. Please try again.');
        }
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setLoading, setUser]
  );

  const resetPassword = useCallback(
    async (email: string) => {
      try {
        setLoading(true);
        setError(null);

        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) {
          throw new Error('Enter your email address first.');
        }

        const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail);
        if (resetError) throw resetError;
      } catch (err: any) {
        setError(err.message ?? 'Failed to send password reset email.');
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [setLoading]
  );

  const signInWithGoogle = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const callbackRedirectTo = getOAuthRedirectUri();

      const googleEnabled = await isGoogleProviderEnabled();
      if (!googleEnabled) {
        throw new Error('Google authentication is not enabled in Supabase yet.');
      }

      if (Platform.OS === 'web') {
        const { data: webOAuthData, error: webSignInError } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: callbackRedirectTo,
            skipBrowserRedirect: true,
            queryParams: {
              access_type: 'offline',
              prompt: 'consent',
            },
          },
        });

        if (webSignInError) throw webSignInError;
        if (!webOAuthData?.url) {
          throw new Error('Google authentication could not be started.');
        }

        window.location.assign(webOAuthData.url);
        return;
      }

      const { data, error: nativeSignInError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackRedirectTo,
          skipBrowserRedirect: true,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (nativeSignInError) throw nativeSignInError;
      if (!data?.url) {
        throw new Error('Google authentication could not be started.');
      }

      let callbackUrlFromLinking: string | null = null;
      const linkingSubscription = Linking.addEventListener('url', (event) => {
        callbackUrlFromLinking = event.url;
      });

      let result: WebBrowser.WebBrowserAuthSessionResult;

      try {
        result = (await Promise.race([
          WebBrowser.openAuthSessionAsync(data.url, callbackRedirectTo),
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error('Google authentication timed out. Please try again.'));
            }, GOOGLE_AUTH_TIMEOUT_MS);
          }),
        ])) as WebBrowser.WebBrowserAuthSessionResult;
      } finally {
        linkingSubscription.remove();
      }

      if (result.type === 'success' && result.url) {
        if (await finalizeOAuthCallbackUrl(result.url, setUser)) {
          return;
        }
      }

      if (callbackUrlFromLinking) {
        if (await finalizeOAuthCallbackUrl(callbackUrlFromLinking, setUser)) {
          return;
        }
      }

      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        if (await finalizeOAuthCallbackUrl(initialUrl, setUser)) {
          return;
        }
      }

      if (result.type !== 'success' || !result.url) {
        // Some Android + Expo Go flows complete session without returning a success URL.
        // Check if Supabase already has a valid session before treating this as canceled.
        const {
          data: { session: fallbackSession },
        } = await supabase.auth.getSession();

        if (fallbackSession) {
          await resolveSessionUser(fallbackSession, setUser);
          return;
        }

        throw new Error('Google authentication was canceled.');
      }

      throw new Error('Google authentication did not return a valid session.');
    } catch (err: any) {
      const message = String(err?.message ?? 'Google sign in failed.');

      if (
        message.toLowerCase().includes('unsupported provider') ||
        message.toLowerCase().includes('google authentication is not enabled')
      ) {
        setError('Google authentication is not enabled in Supabase yet. Please contact the project admin.');
      } else {
        setError(message);
      }

      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  const handleSignOut = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await signOutAndResetSession();
    } catch (err) {
      setError('Failed to sign out.');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading]);

  return {
    user,
    isAuthenticated,
    isLoading,
    error,
    signIn,
    signUp,
    resetPassword,
    signInWithGoogle,
    signOut: handleSignOut,
    setUser,
  };
}
