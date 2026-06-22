import { useState, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
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
    createdAt: profile.created_at ?? new Date().toISOString(),
  };
}

async function resolveSessionUser(session: any, setUser: (user: User | null) => void) {
  if (!session?.user) {
    setUser(null);
    return;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

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
    createdAt: new Date().toISOString(),
  });
}

export async function signOutAndResetSession() {
  await supabase.auth.signOut({ scope: 'local' });

  queryClient.clear();
  useAuthStore.getState().signOut();
}

export function useAuth() {
  const { user, isAuthenticated, isLoading, setUser, setLoading } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  // Listen for auth state changes
  useEffect(() => {
    let isActive = true;

    const syncSession = async (session: any) => {
      try {
        await resolveSessionUser(session, (nextUser) => {
          if (isActive) {
            setUser(nextUser);
          }
        });
      } catch {
        if (isActive) {
          setUser(null);
        }
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        await syncSession(session);
      }
    );

    const bootstrapAuth = async () => {
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
        await syncSession(session);
      } catch {
        if (isActive) {
          setUser(null);
        }
      } finally {
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
  }, [setLoading, setUser]);

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
        setLoading(true);
        setError(null);

        const normalizedEmail = email.trim().toLowerCase();
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (authError) throw authError;

        await resolveSessionUser(authData.session, setUser);
      } catch (err: any) {
        if (err?.message?.toLowerCase?.().includes('email not confirmed')) {
          setError('Please verify your email first, then sign in.');
        } else {
          setError(err.message ?? 'Failed to sign in. Please check your credentials.');
        }
        throw err;
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
