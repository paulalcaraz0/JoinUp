import React from 'react';
import { View, StyleSheet, Image, Text } from 'react-native';
import { Colors, Typography } from '../../constants/theme';

export type AvatarStackItem = {
  id: string;
  name?: string;
  photoUrl?: string;
};

interface AvatarStackProps {
  count: number;
  size?: number;
  maxShow?: number;
  avatars?: AvatarStackItem[];
}

export function AvatarStack({ count, size = 28, maxShow = 4, avatars = [] }: AvatarStackProps) {
  const shownAvatars = avatars.slice(0, maxShow);
  const fallbackCount = Math.max(0, Math.min(count, maxShow) - shownAvatars.length);
  const avatarColors = [Colors.accent, Colors.primary, Colors.peach, Colors.success, Colors.slate];
  const totalShown = shownAvatars.length + fallbackCount;

  return (
    <View style={styles.container}>
      {shownAvatars.map((avatar, index) => {
        const initial = (avatar.name || 'U').trim().charAt(0).toUpperCase();

        return (
          <View
            key={avatar.id}
            style={[
              styles.avatar,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: avatarColors[index % avatarColors.length],
                marginLeft: index > 0 ? -(size * 0.3) : 0,
                zIndex: totalShown - index,
              },
            ]}
          >
            {avatar.photoUrl ? (
              <Image source={{ uri: avatar.photoUrl }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <Text style={[styles.avatarInitial, { fontSize: Math.max(10, size * 0.38) }]}>
                {initial}
              </Text>
            )}
          </View>
        );
      })}
      {Array.from({ length: fallbackCount }).map((_, i) => {
        const index = shownAvatars.length + i;
        return (
          <View
            key={`fallback-${i}`}
            style={[
              styles.avatar,
              {
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: avatarColors[index % avatarColors.length],
                marginLeft: index > 0 ? -(size * 0.3) : 0,
                zIndex: totalShown - index,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitial: {
    fontFamily: Typography.bodyBold,
    color: Colors.white,
  },
});
