import React from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, Shadows } from '../../constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.white,
          borderTopColor: 'transparent',
          borderTopWidth: 0,
          height: 58 + insets.bottom,
          paddingBottom: Math.max(insets.bottom - 2, 4),
          paddingTop: 7,
          marginHorizontal: 14,
          marginBottom: Platform.OS === 'ios' ? 2 : 10,
          borderRadius: 28,
          position: 'absolute',
          borderWidth: 1,
          borderColor: Colors.divider,
          ...Shadows.card,
        },
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.slate,
        tabBarLabelStyle: {
          fontFamily: Typography.bodyMed,
          fontSize: 11,
          marginTop: 3,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: 'Post',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.postButton, focused && styles.postButtonActive]}>
              <Ionicons name="add" size={28} color={Colors.white} />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  postButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Platform.OS === 'ios' ? 8 : 6,
    ...Shadows.fab,
  },
  postButtonActive: {
    backgroundColor: Colors.primary,
  },
});
