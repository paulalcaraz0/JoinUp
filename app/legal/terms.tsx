import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing } from '../../constants/theme';

export default function TermsScreen() {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={22} color={Colors.text} />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Terms of Use</Text>
      <Text style={styles.updated}>Last updated: June 22, 2026</Text>

      <Section title="Use of JoinUp">
        JoinUp helps users discover, host, and join group activities. You must provide accurate account
        information and use the app lawfully and respectfully.
      </Section>

      <Section title="User Content">
        You are responsible for activities, messages, images, profile details, and other content you post.
        Do not post illegal, abusive, hateful, sexual, exploitative, misleading, or unsafe content.
      </Section>

      <Section title="Safety and Moderation">
        JoinUp may remove content, restrict accounts, or review reports when content or behavior appears
        unsafe, abusive, fraudulent, or against these terms.
      </Section>

      <Section title="Meetups">
        Users are responsible for their own safety when attending activities. Meet in public places, use
        good judgment, and leave any situation that feels unsafe.
      </Section>

      <Section title="Account Termination">
        You can delete your account from Profile settings. JoinUp may suspend or remove accounts that
        violate these terms or create safety risks.
      </Section>

      <Section title="Contact">
        Replace this section with your production support email before store submission.
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
