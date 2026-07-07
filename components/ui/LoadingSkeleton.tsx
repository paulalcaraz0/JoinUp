import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius, Shadows } from '../../constants/theme';

function SkeletonBlock({ style }: { style?: object }) {
  return <View style={[styles.block, style]} />;
}

export function ActivityCardSkeleton() {
  return (
    <View style={[styles.activityCard, Shadows.card]}>
      <View style={styles.skeletonTopRow}>
        <SkeletonBlock style={styles.chip} />
        <SkeletonBlock style={styles.smallChip} />
      </View>
      <View style={styles.skeletonBottom}>
        <SkeletonBlock style={styles.title} />
        <SkeletonBlock style={styles.shortLine} />
        <View style={styles.rowBetween}>
          <SkeletonBlock style={styles.line} />
          <SkeletonBlock style={styles.button} />
        </View>
      </View>
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
    height: 420,
    backgroundColor: Colors.primary + '14',
    borderRadius: 28,
    marginBottom: Spacing.lg,
    marginHorizontal: Spacing.lg,
    overflow: 'hidden',
  },
  skeletonTopRow: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  skeletonBottom: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: Spacing.lg,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  chip: {
    width: 86,
    height: 30,
    borderRadius: BorderRadius.pill,
  },
  smallChip: {
    width: 58,
    height: 30,
    borderRadius: BorderRadius.pill,
  },
  title: {
    width: '82%',
    height: 30,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.sm,
  },
  shortLine: {
    width: '64%',
    height: 16,
    borderRadius: BorderRadius.sm,
    marginBottom: Spacing.md,
  },
  line: {
    flex: 1,
    height: 18,
    borderRadius: BorderRadius.pill,
  },
  button: {
    width: 108,
    height: 52,
    borderRadius: BorderRadius.pill,
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
