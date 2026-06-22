import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../../constants/theme';

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={22} color={Colors.text} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Privacy Policy</Text>
      <Text style={styles.updated}>Last updated: June 22, 2026</Text>

      <Section title="Information We Collect">
        JoinUp collects account details you provide, including your name, email address, age range,
        interests, profile photo, profile text, activity details, chat messages, reports, and blocks.
        Location is used only when you choose to autofill an activity location or share a location in chat.
      </Section>

      <Section title="How We Use Information">
        We use your information to create your account, show activities and profiles, support chat,
        send notifications, prevent abuse, review reports, and keep the service working.
      </Section>

      <Section title="Public Profile Information">
        Your display name, profile photo, bio, interests, age range, rating, and public activity
        information may be visible to other JoinUp users. Your email address is not shown to other users.
      </Section>

      <Section title="User Content and Safety">
        Activities, profile content, images, and chat messages may be reviewed when reported. Users can
        report content or block another user from chat safety options.
      </Section>

      <Section title="Account Deletion">
        You can delete your account from Profile settings. Deleting your account removes your profile and
        related account data according to the app's database retention behavior.
      </Section>

      <Section title="Contact">
        For privacy or safety requests, contact the JoinUp administrator. Replace this text with your
        production support email before store submission.
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.body}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.cream },
  content: { padding: Spacing.lg, paddingTop: Spacing.xxl, paddingBottom: Spacing.xxxl },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.lg },
  backText: { fontFamily: Typography.bodyMed, fontSize: 15, color: Colors.text },
  title: { fontFamily: Typography.display, fontSize: 30, color: Colors.text, marginBottom: Spacing.xs },
  updated: { fontFamily: Typography.body, fontSize: 13, color: Colors.slate, marginBottom: Spacing.lg },
  section: { marginBottom: Spacing.lg },
  sectionTitle: { fontFamily: Typography.bodyBold, fontSize: 17, color: Colors.text, marginBottom: Spacing.xs },
  body: { fontFamily: Typography.body, fontSize: 15, lineHeight: 22, color: Colors.textSecondary },
});
