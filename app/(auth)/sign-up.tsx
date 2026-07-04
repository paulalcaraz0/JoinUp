import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius } from '../../constants/theme';
import { InputField } from '../../components/ui/InputField';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { SecondaryButton } from '../../components/ui/SecondaryButton';
import { CategoryChip } from '../../components/ui/CategoryChip';
import { useAuth } from '../../hooks/useAuth';
import { Ionicons } from '@expo/vector-icons';

const AGE_RANGES = ['18-24', '25-30', '31-40', '40+'];
const INTEREST_OPTIONS = ['Fitness', 'Study', 'Outdoors', 'Gaming', 'Café', 'Music', 'Food', 'Social'];

export default function SignUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signUp, signInWithGoogle, isLoading, error } = useAuth();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ageRange, setAgeRange] = useState('18-24');
  const [interests, setInterests] = useState<string[]>([]);
  const [showAgeDropdown, setShowAgeDropdown] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const toggleInterest = (interest: string) => {
    setInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!fullName.trim()) newErrors.fullName = 'Name is required';
    if (!email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      newErrors.email = 'Invalid email address';
    if (!password.trim()) newErrors.password = 'Password is required';
    else if (password.length < 6)
      newErrors.password = 'Password must be at least 6 characters';
    if (interests.length === 0)
      newErrors.interests = 'Select at least one interest';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setInfoMessage(null);
    setSubmitError(null);

    try {
      const result = await signUp({ fullName, email, password, ageRange, interests });

      if (result.requiresEmailConfirmation) {
        setInfoMessage('Account created. Please check your email and verify your account before signing in.');
        return;
      }

      router.replace('/(tabs)');
    } catch (err: any) {
      const message = String(err?.message ?? '').trim();
      if (message) {
        setSubmitError(message);
      }
    }
  };

  const isValid =
    fullName.trim() &&
    email.trim() &&
    password.trim() &&
    password.length >= 6 &&
    interests.length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={[styles.container, { paddingTop: insets.top + Spacing.md }]}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInDown.delay(100).springify()}>
          <Text style={styles.heading}>Create Account</Text>
          <Text style={styles.subtitle}>Join the community and start connecting</Text>
        </Animated.View>

        {(submitError || error) && (
          <Animated.View entering={FadeInDown.springify()} style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>{submitError || error}</Text>
          </Animated.View>
        )}

        {infoMessage && (
          <Animated.View entering={FadeInDown.springify()} style={styles.infoBanner}>
            <Text style={styles.infoBannerText}>{infoMessage}</Text>
          </Animated.View>
        )}

        <Animated.View entering={FadeInDown.delay(200).springify()}>
          <InputField
            label="Full Name"
            placeholder="Enter your name"
            value={fullName}
            onChangeText={setFullName}
            error={errors.fullName}
            autoCapitalize="words"
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(250).springify()}>
          <InputField
            label="Email"
            placeholder="your@email.com"
            value={email}
            onChangeText={setEmail}
            error={errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).springify()}>
          <InputField
            label="Password"
            placeholder="Create a password"
            value={password}
            onChangeText={setPassword}
            error={errors.password}
            secureTextEntry
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(350).springify()}>
          <Text style={styles.fieldLabel}>Age Range</Text>
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => setShowAgeDropdown(!showAgeDropdown)}
            activeOpacity={0.8}
          >
            <Text style={styles.dropdownText}>{ageRange}</Text>
            <Ionicons
              name={showAgeDropdown ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={Colors.text}
            />
          </TouchableOpacity>
          {showAgeDropdown && (
            <View style={styles.dropdownMenu}>
              {AGE_RANGES.map((range) => (
                <TouchableOpacity
                  key={range}
                  style={[
                    styles.dropdownItem,
                    ageRange === range && styles.dropdownItemActive,
                  ]}
                  onPress={() => {
                    setAgeRange(range);
                    setShowAgeDropdown(false);
                  }}
                >
                  <Text
                    style={[
                      styles.dropdownItemText,
                      ageRange === range && styles.dropdownItemTextActive,
                    ]}
                  >
                    {range}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(400).springify()}>
          <Text style={styles.fieldLabel}>What are you interested in?</Text>
          {errors.interests && (
            <Text style={styles.errorText}>{errors.interests}</Text>
          )}
          <View style={styles.chipsContainer}>
            {INTEREST_OPTIONS.map((interest) => (
              <CategoryChip
                key={interest}
                label={interest}
                selected={interests.includes(interest)}
                onPress={() => toggleInterest(interest)}
              />
            ))}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(450).springify()}>
          <Text style={styles.legalText}>
            By creating an account, you agree to the{' '}
            <Text style={styles.legalLink} onPress={() => router.push('/legal/terms')}>
              Terms
            </Text>{' '}
            and{' '}
            <Text style={styles.legalLink} onPress={() => router.push('/legal/privacy')}>
              Privacy Policy
            </Text>
            .
          </Text>
          <PrimaryButton
            title="Create Account"
            onPress={handleSubmit}
            loading={isLoading}
            disabled={!isValid}
            style={styles.submitBtn}
          />
        </Animated.View>

        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

        <Animated.View entering={FadeInDown.delay(500).springify()}>
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
          onPress={() => router.push('/(auth)/sign-in')}
          style={styles.signInLink}
        >
          <Text style={styles.signInText}>
            Already have an account?{' '}
            <Text style={styles.signInBold}>Sign In</Text>
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
    paddingTop: Spacing.md,
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
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
    lineHeight: 21,
  },
  errorBanner: {
    backgroundColor: Colors.danger + '15',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.danger + '26',
  },
  errorBannerText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.danger,
  },
  infoBanner: {
    backgroundColor: Colors.accent + '15',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.accent + '24',
  },
  infoBannerText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.accent,
  },
  fieldLabel: {
    fontFamily: Typography.bodyBold,
    fontSize: 13,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  dropdown: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRadius: BorderRadius.input,
    paddingHorizontal: Spacing.md,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  dropdownText: {
    fontFamily: Typography.body,
    fontSize: 16,
    color: Colors.text,
  },
  dropdownMenu: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
    borderRadius: BorderRadius.input,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  dropdownItemActive: {
    backgroundColor: Colors.accent + '15',
  },
  dropdownItemText: {
    fontFamily: Typography.body,
    fontSize: 16,
    color: Colors.text,
  },
  dropdownItemTextActive: {
    color: Colors.accent,
    fontFamily: Typography.bodyMed,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: Spacing.lg,
  },
  errorText: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.danger,
    marginBottom: Spacing.sm,
  },
  submitBtn: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
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
  legalText: {
    fontFamily: Typography.body,
    fontSize: 12,
    lineHeight: 18,
    color: Colors.slate,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  legalLink: {
    fontFamily: Typography.bodyBold,
    color: Colors.accent,
  },
  signInLink: {
    alignItems: 'center',
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  signInText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.slate,
  },
  signInBold: {
    fontFamily: Typography.bodyBold,
    color: Colors.accent,
  },
});
