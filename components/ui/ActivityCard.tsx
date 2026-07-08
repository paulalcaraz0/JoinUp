import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ViewStyle, Image } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { format } from 'date-fns';
import { Colors, Typography, BorderRadius, Spacing, Shadows, CategoryColors } from '../../constants/theme';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { Activity } from '../../types';

interface ActivityCardProps {
  activity: Activity;
  onPress: () => void;
  onJoin: () => void;
  style?: ViewStyle;
  index?: number;
  isLeaving?: boolean;
  joinLabel?: string;
  joinDisabled?: boolean;
}

function ActivityCardComponent({
  activity,
  onPress,
  onJoin,
  style,
  index = 0,
  isLeaving = false,
  joinLabel,
  joinDisabled = false,
}: ActivityCardProps) {
  const { colors, isDark } = useThemeColors();
  const slotsLeft = activity.currentSlots;
  const isFull = slotsLeft <= 0;
  const isActionDisabled = isFull || isLeaving || joinDisabled;
  const chipColor = CategoryColors[activity.category] ?? colors.accent;
  const dateStr = activity.dateTime ? format(new Date(activity.dateTime), 'EEE, h:mm a') : '';
  const joined = activity.maxSlots - activity.currentSlots;
  const hostInitial = (activity.hostName || 'H').trim().charAt(0).toUpperCase();
  const actionLabel = joinLabel ?? (isLeaving ? 'Joining...' : isFull ? 'Full' : 'Join');

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).springify()}>
      <TouchableOpacity
        style={[
          styles.card,
          Shadows.card,
          { backgroundColor: colors.primary, borderColor: isDark ? colors.divider : 'transparent' },
          style,
          isLeaving && styles.cardLeaving,
        ]}
        onPress={onPress}
        activeOpacity={0.92}
        disabled={isLeaving}
      >
        {activity.coverImage ? (
          <Image source={{ uri: activity.coverImage }} style={styles.coverPhoto} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={[colors.primarySoft, colors.primary, isDark ? '#111827' : '#0E1726']}
            style={styles.coverPhoto}
          >
            <Ionicons name="calendar-outline" size={42} color={Colors.white + 'B8'} />
          </LinearGradient>
        )}

        <LinearGradient
          colors={[
            'rgba(21,34,56,0.06)',
            'rgba(21,34,56,0.18)',
            'rgba(21,34,56,0.76)',
            'rgba(21,34,56,0.94)',
          ]}
          locations={[0, 0.42, 0.72, 1]}
          style={styles.cardOverlay}
        />

        <View style={styles.topOverlayRow}>
          <View style={[styles.categoryChip, { backgroundColor: Colors.white + 'E8', borderColor: chipColor }]}>
            <Text style={[styles.categoryText, { color: chipColor }]}>{activity.category}</Text>
          </View>
          <View style={[styles.slotBadge, { backgroundColor: isFull ? Colors.danger : Colors.white + 'E8' }]}>
            <Text style={[styles.slotBadgeText, { color: isFull ? Colors.white : colors.primary }]}>
              {isFull ? 'Full' : `${slotsLeft} left`}
            </Text>
          </View>
        </View>

        <View style={styles.contentOverlay}>
          <Text style={styles.title} numberOfLines={2}>
            {activity.title}
          </Text>

          <View style={styles.hostRow}>
            {activity.hostPhoto ? (
              <Image source={{ uri: activity.hostPhoto }} style={styles.hostPhoto} resizeMode="cover" />
            ) : (
              <View style={[styles.hostPhotoFallback, { backgroundColor: colors.accent }]}>
                <Text style={styles.hostInitial}>{hostInitial}</Text>
              </View>
            )}
            <View style={styles.hostTextWrap}>
              <Text style={styles.hostName} numberOfLines={1}>
                Hosted by {activity.hostName || 'JoinUp host'}
              </Text>
            </View>
            {activity.requiresApproval ? (
              <View style={styles.approvalPill}>
                <Ionicons name="shield-checkmark-outline" size={12} color={Colors.white} />
              </View>
            ) : null}
          </View>

          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={14} color={Colors.white + 'D9'} />
            <Text style={styles.infoText} numberOfLines={1}>
              {activity.location.name || 'Location TBD'}
            </Text>
          </View>

          <View style={styles.bottomRow}>
            <View style={styles.metricsRow}>
              <View style={styles.metricItem}>
                <Ionicons name="people-outline" size={15} color={Colors.white} />
                <Text style={styles.metricText}>{joined}/{activity.maxSlots}</Text>
              </View>
              <View style={styles.metricItem}>
                <Ionicons name="time-outline" size={15} color={Colors.white} />
                <Text style={styles.metricText}>{dateStr || 'Soon'}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.joinBtn, { backgroundColor: colors.white }, isActionDisabled && styles.joinBtnDisabled]}
              onPress={(event) => {
                event.stopPropagation?.();
                onJoin();
              }}
              disabled={isActionDisabled}
              activeOpacity={0.82}
            >
              <Text style={[styles.joinBtnText, { color: colors.primary }, isActionDisabled && styles.joinBtnTextDisabled]}>
                {actionLabel}
              </Text>
              {!isActionDisabled ? <Ionicons name="add" size={20} color={colors.primary} /> : null}
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export const ActivityCard = React.memo(ActivityCardComponent);

const styles = StyleSheet.create({
  card: {
    height: 420,
    backgroundColor: Colors.primary,
    borderWidth: 1,
    borderColor: 'transparent',
    borderRadius: 28,
    marginBottom: Spacing.lg,
    marginHorizontal: Spacing.lg,
    overflow: 'hidden',
  },
  cardLeaving: {
    transform: [{ translateX: 12 }],
  },
  coverPhoto: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  topOverlayRow: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryChip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
  },
  categoryText: {
    fontFamily: Typography.bodyBold,
    fontSize: 12,
  },
  slotBadge: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: BorderRadius.pill,
  },
  slotBadgeText: {
    fontFamily: Typography.bodyBold,
    fontSize: 12,
  },
  contentOverlay: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    bottom: Spacing.lg,
  },
  title: {
    fontFamily: Typography.display,
    fontSize: 30,
    color: Colors.white,
    marginBottom: Spacing.xs,
    lineHeight: 35,
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  hostPhoto: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.white + '24',
    borderWidth: 1,
    borderColor: Colors.white + '8F',
  },
  hostPhotoFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accent,
    borderWidth: 1,
    borderColor: Colors.white + '8F',
  },
  hostInitial: {
    fontFamily: Typography.bodyBold,
    fontSize: 13,
    color: Colors.white,
  },
  hostTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  hostName: {
    fontFamily: Typography.bodyMed,
    fontSize: 14,
    color: Colors.white + 'E8',
  },
  approvalPill: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.pill,
    backgroundColor: Colors.white + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
    gap: 5,
  },
  infoText: {
    fontFamily: Typography.body,
    fontSize: 14,
    color: Colors.white + 'D9',
    flexShrink: 1,
    minWidth: 0,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  metricsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    minWidth: 0,
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  metricText: {
    fontFamily: Typography.bodyMed,
    fontSize: 14,
    color: Colors.white,
  },
  joinBtn: {
    minWidth: 108,
    minHeight: 52,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.pill,
    paddingVertical: 12,
    paddingHorizontal: Spacing.md,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  joinBtnDisabled: {
    backgroundColor: Colors.white + 'B8',
  },
  joinBtnText: {
    fontFamily: Typography.bodyBold,
    fontSize: 15,
  },
  joinBtnTextDisabled: {
    color: Colors.textSecondary,
  },
});
