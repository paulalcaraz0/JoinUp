import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle, Image } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Colors, Typography, BorderRadius, Spacing, Shadows, CategoryColors } from '../../constants/theme';
import { SlotProgressBar } from './SlotProgressBar';
import type { Activity } from '../../types';

interface ActivityCardProps {
  activity: Activity;
  onPress: () => void;
  onJoin: () => void;
  style?: ViewStyle;
  index?: number;
  isLeaving?: boolean;
}

function ActivityCardComponent({ activity, onPress, onJoin, style, index = 0, isLeaving = false }: ActivityCardProps) {
  const slotsLeft = activity.currentSlots;
  const isFull = slotsLeft <= 0;
  const chipColor = CategoryColors[activity.category] ?? Colors.accent;
  const dateStr = activity.dateTime ? format(new Date(activity.dateTime), 'EEE, h:mm a') : '';
  const joined = activity.maxSlots - activity.currentSlots;
  const hostInitial = (activity.hostName || 'H').trim().charAt(0).toUpperCase();

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <TouchableOpacity
        style={[styles.card, Shadows.card, style, isLeaving && styles.cardLeaving]}
        onPress={onPress}
        activeOpacity={0.92}
        disabled={isLeaving}
      >
        <View style={styles.mediaFrame}>
          {activity.coverImage ? (
            <Image source={{ uri: activity.coverImage }} style={styles.coverPhoto} resizeMode="cover" />
          ) : (
            <View style={styles.coverPlaceholder}>
              <Ionicons name="calendar-outline" size={32} color={Colors.slate} />
            </View>
          )}
          <View style={styles.mediaOverlay} />
          <View style={styles.dateBadge}>
            <Text style={styles.dateBadgeText}>{dateStr || 'Soon'}</Text>
          </View>
        </View>

        <View style={styles.topRow}>
          <View style={[styles.categoryChip, { backgroundColor: chipColor + '16', borderColor: chipColor }]}>
            <Text style={[styles.categoryText, { color: chipColor }]}>{activity.category}</Text>
          </View>
          <View style={[styles.slotBadge, { backgroundColor: isFull ? Colors.danger + '12' : Colors.success + '12' }]}>
            <Text style={[styles.slotBadgeText, { color: isFull ? Colors.danger : Colors.success }]}>
              {isFull ? 'Full' : `${slotsLeft} left`}
            </Text>
          </View>
        </View>

        <Text style={styles.title} numberOfLines={2}>
          {activity.title}
        </Text>

        <View style={styles.hostRow}>
          {activity.hostPhoto ? (
            <Image source={{ uri: activity.hostPhoto }} style={styles.hostPhoto} resizeMode="cover" />
          ) : (
            <View style={styles.hostPhotoFallback}>
              <Text style={styles.hostInitial}>{hostInitial}</Text>
            </View>
          )}
          <View style={styles.hostTextWrap}>
            <Text style={styles.hostLabel}>Hosted by</Text>
            <Text style={styles.hostName} numberOfLines={1}>
              {activity.hostName || 'JoinUp host'}
            </Text>
          </View>
          {activity.requiresApproval ? (
            <View style={styles.approvalPill}>
              <Ionicons name="shield-checkmark-outline" size={12} color={Colors.success} />
              <Text style={styles.approvalText}>Approval</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.infoRow}>
          <Ionicons name="location-outline" size={14} color={Colors.slate} />
          <Text style={styles.infoText} numberOfLines={2}>
            {activity.location.name || 'Location TBD'}
          </Text>
        </View>

        <SlotProgressBar current={joined} max={activity.maxSlots} />
        <View style={styles.trustMetaRow}>
          <Text style={styles.progressText}>{joined}/{activity.maxSlots} joined</Text>
          <View style={styles.participantPill}>
            <Ionicons name="people-outline" size={12} color={Colors.slate} />
            <Text style={styles.participantText}>
              {activity.participants.length} participant{activity.participants.length === 1 ? '' : 's'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.joinBtn, isFull && styles.joinBtnDisabled]}
          onPress={(event) => {
            event.stopPropagation?.();
            onJoin();
          }}
          disabled={isFull || isLeaving}
          activeOpacity={0.82}
        >
          <Text style={styles.joinBtnText}>
            {isLeaving ? 'Joining...' : isFull ? 'Full' : 'Join'}
          </Text>
          {!isFull && !isLeaving ? <Ionicons name="arrow-forward" size={15} color={Colors.white} /> : null}
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

export const ActivityCard = React.memo(ActivityCardComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.card,
    padding: Spacing.ms,
    marginBottom: Spacing.md,
    marginHorizontal: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.divider,
    overflow: 'hidden',
  },
  cardLeaving: {
    transform: [{ translateX: 12 }],
  },
  mediaFrame: {
    width: '100%',
    height: 164,
    borderRadius: BorderRadius.input,
    marginBottom: Spacing.ms,
    backgroundColor: Colors.mutedSurface,
    overflow: 'hidden',
    position: 'relative',
  },
  coverPhoto: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(21,34,56,0.06)',
  },
  dateBadge: {
    position: 'absolute',
    left: Spacing.sm,
    bottom: Spacing.sm,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.white,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: Colors.white + '99',
  },
  dateBadgeText: {
    fontFamily: Typography.bodyBold,
    fontSize: 11,
    color: Colors.primary,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  categoryText: {
    fontFamily: Typography.bodyMed,
    fontSize: 12,
  },
  slotBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.pill,
  },
  slotBadgeText: {
    fontFamily: Typography.bodyBold,
    fontSize: 12,
  },
  title: {
    fontFamily: Typography.bodyBold,
    fontSize: 18,
    color: Colors.text,
    marginBottom: Spacing.xs,
    lineHeight: 24,
    paddingHorizontal: Spacing.xs,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  hostPhoto: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.mutedSurface,
  },
  hostPhotoFallback: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary + '14',
  },
  hostInitial: {
    fontFamily: Typography.bodyBold,
    fontSize: 12,
    color: Colors.primary,
  },
  hostTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  hostLabel: {
    fontFamily: Typography.body,
    fontSize: 10,
    color: Colors.slate,
  },
  hostName: {
    fontFamily: Typography.bodyBold,
    fontSize: 13,
    color: Colors.text,
  },
  approvalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.success + '12',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  approvalText: {
    fontFamily: Typography.bodyBold,
    fontSize: 10,
    color: Colors.success,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    gap: 4,
    paddingHorizontal: Spacing.xs,
  },
  infoText: {
    fontFamily: Typography.body,
    fontSize: 13,
    color: Colors.slate,
    flexShrink: 1,
    minWidth: 0,
  },
  trustMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: 6,
    paddingHorizontal: Spacing.xs,
  },
  progressText: {
    fontFamily: Typography.bodyMed,
    fontSize: 11,
    color: Colors.slate,
  },
  participantPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 1,
  },
  participantText: {
    fontFamily: Typography.bodyMed,
    fontSize: 11,
    color: Colors.slate,
  },
  joinBtn: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.button,
    paddingVertical: 11,
    paddingHorizontal: Spacing.lg,
    alignSelf: 'stretch',
    justifyContent: 'center',
    marginTop: Spacing.md,
    marginHorizontal: Spacing.xs,
    marginBottom: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  joinBtnDisabled: {
    backgroundColor: Colors.slate,
    opacity: 0.6,
  },
  joinBtnText: {
    color: Colors.white,
    fontFamily: Typography.bodyBold,
    fontSize: 14,
  },
});
