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

      <Section title="Identity Verification">
        If you choose to verify your identity, JoinUp collects the ID photo or document image you submit,
        the verification request date, review status, and optional reviewer notes. ID verification is used
        to help reduce fake accounts, fraud, and unsafe behavior. Other users can only see your verification
        status, such as whether your profile is verified. They cannot see your ID image.
      </Section>

      <Section title="How We Use Information">
        We use your information to create your account, show activities and profiles, support chat,
        send notifications, prevent abuse, review reports, verify identity submissions, investigate safety
        concerns, and keep the service working.
      </Section>

      <Section title="Public Profile Information">
        Your display name, profile photo, bio, interests, age range, rating, and public activity
        information may be visible to other JoinUp users. Your verification status may also be visible to
        other users. Your email address and ID verification image are not shown to other users.
      </Section>

      <Section title="User Content and Safety">
        Activities, profile content, images, and chat messages may be reviewed when reported. Users can
        report content or block another user from chat safety options. Reports and blocks are used to
        protect users, enforce rules, and prevent abuse.
      </Section>

      <Section title="Storage and Security">
        JoinUp stores account data, activity data, messages, reports, and verification records using
        Supabase services. ID verification images are stored in a private storage bucket with access
        controls. No security system is perfect, but JoinUp limits access to sensitive verification data
        and does not make ID images public.
      </Section>

      <Section title="Data Sharing">
        JoinUp does not sell your personal information. Information may be shared with service providers
        that help operate the app, such as hosting, database, storage, analytics, crash reporting, or
        notification providers. Information may also be disclosed if required by law, to protect users, or
        to investigate abuse, fraud, or security incidents.
      </Section>

      <Section title="Retention">
        JoinUp keeps account information while your account is active. Safety records, reports, and
        verification records may be kept as needed to protect users, investigate abuse, meet legal
        obligations, or enforce app rules. ID verification images should be deleted when they are no longer
        needed for verification, safety, legal, or fraud-prevention purposes.
      </Section>

      <Section title="Account Deletion">
        You can delete your account inside the app from Profile settings. You can also request account
        deletion by emailing alcarazpaul4@gmail.com. Deleting your account removes your profile and related
        account data according to the app's database retention behavior. Some records may be kept for a
        limited time when needed for safety, fraud prevention, dispute handling, legal compliance, or abuse
        investigations.
      </Section>

      <Section title="Your Choices">
        You can edit your profile, choose what profile information to provide, block users, report safety
        concerns, and delete your account. Identity verification is optional unless JoinUp later requires it
        for specific safety-sensitive features.
      </Section>

      <Section title="Children">
        JoinUp is intended for users who are old enough to use social meetup services under applicable law.
        Do not use JoinUp if you are not legally allowed to create an account or attend activities in your
        location.
      </Section>

      <Section title="Changes to This Policy">
        JoinUp may update this Privacy Policy when features, legal requirements, or safety practices
        change. The updated date above shows when the policy was last revised.
      </Section>

      <Section title="Contact">
        For privacy, safety, account deletion, or ID verification requests, contact JoinUp developer
        Paul Alcaraz at alcarazpaul4@gmail.com.
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
