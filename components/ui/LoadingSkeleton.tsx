import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/theme';

function SkeletonBlock({ style }: { style?: object }) {
  return <View style={[styles.block, style]} />;
}

export function ActivityCardSkeleton() {
  return (
    <View style={[styles.activityCard, Shadows.card]}>
      <SkeletonBlock style={styles.activityImage} />
      <View style={styles.rowBetween}>
        <SkeletonBlock style={styles.chip} />
        <SkeletonBlock style={styles.smallChip} />
      </View>
      <SkeletonBlock style={styles.title} />
      <SkeletonBlock style={styles.shortLine} />
      <SkeletonBlock style={styles.line} />
      <SkeletonBlock style={styles.button} />
    </View>
  );
}

export function ChatRowSkeleton() {
  return (
    <View style={[styles.chatRow, Shadows.card]}>
      <SkeletonBlock style={styles.avatar} />
      <View style={styles.chatTextWrap}>
        <SkeletonBlock style={styles.chatTitle} />
        <SkeletonBlock style={styles.chatSubtitle} />
        <SkeletonBlock style={styles.chatPill} />
      </View>
    </View>
  );
}

export function MessageSkeleton() {
  return (
    <View style={styles.messageWrap}>
      <SkeletonBlock style={styles.messageAvatar} />
      <View style={styles.messageTextWrap}>
        <SkeletonBlock style={styles.messageLineWide} />
        <SkeletonBlock style={styles.messageLine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: Colors.divider,
    opacity: 0.62,
  },
  activityCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.card,
    padding: Spacing.ms,
    marginBottom: Spacing.md,
    marginHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  activityImage: {
    height: 164,
    borderRadius: BorderRadius.input,
    marginBottom: Spacing.ms,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  chip: {
    width: 86,
    height: 24,
    borderRadius: BorderRadius.pill,
  },
  smallChip: {
    width: 58,
    height: 24,
    borderRadius: BorderRadius.pill,
  },
  title: {
    width: '78%',
    height: 22,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  shortLine: {
    width: '52%',
    height: 14,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  line: {
    width: '100%',
    height: 10,
    borderRadius: BorderRadius.sm,
    marginTop: Spacing.sm,
  },
  button: {
    height: 42,
    borderRadius: BorderRadius.button,
    marginTop: Spacing.md,
  },
  chatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.card,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.divider,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: Spacing.md,
  },
  chatTextWrap: {
    flex: 1,
  },
  chatTitle: {
    width: '72%',
    height: 16,
    borderRadius: BorderRadius.sm,
    marginBottom: 8,
  },
  chatSubtitle: {
    width: '90%',
    height: 12,
    borderRadius: BorderRadius.sm,
    marginBottom: 8,
  },
  chatPill: {
    width: 104,
    height: 20,
    borderRadius: BorderRadius.pill,
  },
  messageWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: Spacing.md,
  },
  messageAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: Spacing.xs,
  },
  messageTextWrap: {
    flex: 1,
    maxWidth: '72%',
    borderRadius: BorderRadius.card,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
    padding: Spacing.md,
  },
  messageLineWide: {
    width: '100%',
    height: 12,
    borderRadius: BorderRadius.sm,
    marginBottom: 8,
  },
  messageLine: {
    width: '58%',
    height: 12,
    borderRadius: BorderRadius.sm,
  },
});
