import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../../constants/theme';
import { InputField } from '../../components/ui/InputField';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { SecondaryButton } from '../../components/ui/SecondaryButton';
import { useAuth } from '../../hooks/useAuth';

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn, signInWithGoogle, resetPassword, isLoading, error } = useAuth({ initialize: false });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) return;
    try {
      await signIn(email, password);
      router.replace('/(tabs)');
    } catch (e) {
      // Error is already set in auth hook state, UI will show it
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      Alert.alert('Email required', 'Enter your email address, then tap Forgot Password again.');
      return;
    }

    try {
      await resetPassword(email);
      Alert.alert('Check your email', 'We sent password reset instructions to your email address.');
    } catch {
      // Error is already shown in the banner.
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={[styles.container, { paddingTop: insets.top + Spacing.md }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Text style={styles.heading}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>
        </Animated.View>

        {error && (
          <Animated.View entering={FadeInDown.springify()} style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <InputField
            label="Email"
            placeholder="your@email.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250).springify()}>
          <InputField
            label="Password"
            placeholder="Enter your password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            rightAccessory={
              <TouchableOpacity
                onPress={() => setShowPassword((prev) => !prev)}
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                style={styles.passwordToggle}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={Colors.slate}
                />
              </TouchableOpacity>
            }
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <TouchableOpacity
            style={styles.forgotLink}
            onPress={handleForgotPassword}
            disabled={isLoading}
          >
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(350).springify()}>
          <PrimaryButton
            title="Sign In"
            onPress={handleSignIn}
            loading={isLoading}
            disabled={!email.trim() || !password.trim()}
            style={styles.signInBtn}
          />
        </Animated.View>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <Animated.View entering={FadeInDown.delay(400).springify()}>
          <SecondaryButton
            title="Continue with Google"
            onPress={async () => {
              try {
                await signInWithGoogle();
              } catch {}
            }}
            loading={isLoading}
            disabled={isLoading}
            icon={<Text style={styles.googleIcon}>G</Text>}
          />
        </Animated.View>

        <TouchableOpacity
          onPress={() => router.push('/(auth)/sign-up')}
          style={styles.signUpLink}
        >
          <Text style={styles.signUpText}>
            Don&apos;t have an account?{' '}
            <Text style={styles.signUpBold}>Sign Up</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Colors.cream },
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl * 2,
  },
  backBtn: {
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  backText: {
    fontFamily: Typography.bodyMed,
    fontSize: 16,
    color: Colors.accent,
  },
  heading: {
    fontFamily: Typography.display,
    fontSize: 28,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  subtitle: {
    fontFamily: Typography.body,
    fontSize: 15,
    color: Colors.slate,
    marginBottom: Spacing.lg,
  },
  errorBanner: {
    backgroundColor: Colors.danger + '15',
    borderRadius: 8,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.danger,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  forgotText: {
    fontFamily: Typography.bodyMed,
    fontSize: 14,
    color: Colors.accent,
  },
  passwordToggle: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signInBtn: {
    marginBottom: Spacing.lg,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.divider,
  },
  dividerText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.slate,
    marginHorizontal: Spacing.md,
  },
  googleIcon: {
    fontFamily: Typography.bodyBold,
    fontSize: 18,
    color: '#4285F4',
  },
  signUpLink: {
    alignItems: 'center',
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  signUpText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.slate,
  },
  signUpBold: {
    fontFamily: Typography.bodyBold,
    color: Colors.accent,
  },
});
