import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { Colors, Typography, Spacing, BorderRadius, Shadows, CategoryColors } from '../constants/theme';
import { useActivities } from '../hooks/useActivities';
import { sendBuddyMessage } from '../lib/api/buddyService';
import type { Activity, ActivityDraft, ActivityRecommendation, BuddyMessage } from '../types';

const BUDDY_HISTORY_STORAGE_KEY = 'joinup:buddy:messages:v1';

const QUICK_PROMPTS = [
  "I'm bored",
  'Recommend sports',
  'I want to meet people',
  'Create an activity',
  'Study group',
  'Something relaxing',
];

const ACTIVITY_CATEGORIES: Activity['category'][] = [
  'Fitness',
  'Study',
  'Café',
  'Outdoors',
  'Gaming',
  'Social',
  'Food',
  'Other',
];

const createOpeningMessage = (): BuddyMessage => ({
  id: 'opening',
  role: 'assistant',
  text: "Hi! I'm JoinUp Buddy. Tell me your mood, interests, or what kind of activity you want to create.",
  createdAt: new Date().toISOString(),
});

const createUserMessage = (text: string): BuddyMessage => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  role: 'user',
  text,
  createdAt: new Date().toISOString(),
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isActivityCategory(value: unknown): value is Activity['category'] {
  return typeof value === 'string' && ACTIVITY_CATEGORIES.includes(value as Activity['category']);
}

function isActivityDraft(value: unknown): value is ActivityDraft {
  if (!isRecord(value)) return false;

  return (
    typeof value.title === 'string' &&
    typeof value.description === 'string' &&
    isActivityCategory(value.category) &&
    typeof value.location === 'string' &&
    typeof value.date === 'string' &&
    typeof value.time === 'string' &&
    typeof value.maxParticipants === 'number' &&
    (typeof value.notes === 'undefined' || typeof value.notes === 'string')
  );
}

function isActivityRecommendation(value: unknown): value is ActivityRecommendation {
  if (!isRecord(value)) return false;

  return (
    typeof value.activityId === 'string' &&
    typeof value.title === 'string' &&
    typeof value.reason === 'string' &&
    isActivityCategory(value.category) &&
    typeof value.location === 'string' &&
    typeof value.dateTime === 'string' &&
    typeof value.availableSlots === 'number'
  );
}

function isBuddyMessage(value: unknown): value is BuddyMessage {
  if (!isRecord(value)) return false;

  const recommendations = value.recommendations;
  return (
    typeof value.id === 'string' &&
    (value.role === 'user' || value.role === 'assistant') &&
    typeof value.text === 'string' &&
    typeof value.createdAt === 'string' &&
    (typeof value.draft === 'undefined' || isActivityDraft(value.draft)) &&
    (
      typeof recommendations === 'undefined' ||
      (Array.isArray(recommendations) && recommendations.every(isActivityRecommendation))
    )
  );
}

function parseStoredMessages(raw: string): BuddyMessage[] | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isBuddyMessage)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function toCreateParams(draft: ActivityDraft) {
  return {
    title: draft.title,
    description: draft.notes ? `${draft.description}\n\nNotes: ${draft.notes}` : draft.description,
    category: draft.category,
    location: draft.location,
    date: draft.date,
    time: draft.time,
    maxParticipants: String(draft.maxParticipants),
  };
}

function DraftPreview({
  draft,
  onUseDraft,
}: {
  draft: ActivityDraft;
  onUseDraft: (draft: ActivityDraft) => void;
}) {
  return (
    <View style={styles.draftCard}>
      <View style={styles.cardHeaderRow}>
        <View style={styles.cardIcon}>
          <Ionicons name="create-outline" size={16} color={Colors.accent} />
        </View>
        <Text style={styles.cardHeaderText}>Activity draft</Text>
      </View>
      <Text style={styles.draftTitle}>{draft.title}</Text>
      <Text style={styles.draftDescription}>{draft.description}</Text>
      <View style={styles.detailGrid}>
        <Text style={styles.detailText}>{draft.category}</Text>
        <Text style={styles.detailText}>{draft.location}</Text>
        <Text style={styles.detailText}>{draft.date} at {draft.time}</Text>
        <Text style={styles.detailText}>{draft.maxParticipants} people</Text>
      </View>
      <View style={styles.draftActions}>
        <TouchableOpacity style={styles.primarySmallButton} onPress={() => onUseDraft(draft)}>
          <Ionicons name="sparkles-outline" size={15} color={Colors.white} />
          <Text style={styles.primarySmallText}>Use this draft</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondarySmallButton} onPress={() => onUseDraft(draft)}>
          <Ionicons name="pencil-outline" size={15} color={Colors.text} />
          <Text style={styles.secondarySmallText}>Edit before posting</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function RecommendationList({
  recommendations,
  onOpenActivity,
}: {
  recommendations: ActivityRecommendation[];
  onOpenActivity: (activityId: string) => void;
}) {
  return (
    <View style={styles.recommendationList}>
      {recommendations.map((recommendation) => {
        const chipColor = CategoryColors[recommendation.category] ?? Colors.accent;
        const dateLabel = recommendation.dateTime
          ? format(new Date(recommendation.dateTime), 'EEE, MMM d, h:mm a')
          : 'Soon';

        return (
          <TouchableOpacity
            key={recommendation.activityId}
            style={styles.recommendationCard}
            activeOpacity={0.86}
            onPress={() => onOpenActivity(recommendation.activityId)}
          >
            <View style={styles.recommendationTopRow}>
              <View style={[styles.categoryPill, { backgroundColor: chipColor + '14', borderColor: chipColor }]}>
                <Text style={[styles.categoryPillText, { color: chipColor }]}>{recommendation.category}</Text>
              </View>
              <Text style={styles.slotsText}>{recommendation.availableSlots} left</Text>
            </View>
            <Text style={styles.recommendationTitle}>{recommendation.title}</Text>
            <Text style={styles.recommendationMeta}>{recommendation.location} · {dateLabel}</Text>
            <Text style={styles.recommendationReason}>{recommendation.reason}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function MessageBubble({
  message,
  onUseDraft,
  onOpenActivity,
}: {
  message: BuddyMessage;
  onUseDraft: (draft: ActivityDraft) => void;
  onOpenActivity: (activityId: string) => void;
}) {
  const isUser = message.role === 'user';

  return (
    <View style={[styles.messageRow, isUser ? styles.messageRowUser : styles.messageRowAssistant]}>
      {!isUser ? (
        <View style={styles.buddyAvatar}>
          <Ionicons name="sparkles" size={15} color={Colors.white} />
        </View>
      ) : null}
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        <Text style={[styles.messageText, isUser ? styles.userMessageText : styles.assistantMessageText]}>
          {message.text}
        </Text>
        {message.recommendations?.length ? (
          <RecommendationList recommendations={message.recommendations} onOpenActivity={onOpenActivity} />
        ) : null}
        {message.draft ? <DraftPreview draft={message.draft} onUseDraft={onUseDraft} /> : null}
      </View>
    </View>
  );
}

export default function BuddyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { activities } = useActivities();
  const [messages, setMessages] = useState<BuddyMessage[]>([createOpeningMessage()]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isHistoryLoaded, setIsHistoryLoaded] = useState(false);
  const listRef = useRef<FlatList<BuddyMessage>>(null);

  const canSend = input.trim().length > 0 && !isThinking;

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  useEffect(() => {
    let isActive = true;

    const loadHistory = async () => {
      try {
        const raw = await AsyncStorage.getItem(BUDDY_HISTORY_STORAGE_KEY);
        if (!isActive) return;

        if (raw) {
          const storedMessages = parseStoredMessages(raw);
          if (storedMessages) {
            setMessages(storedMessages);
          }
        }
      } catch {
        if (isActive) {
          setMessages([createOpeningMessage()]);
        }
      } finally {
        if (isActive) {
          setIsHistoryLoaded(true);
          scrollToEnd();
        }
      }
    };

    void loadHistory();

    return () => {
      isActive = false;
    };
  }, [scrollToEnd]);

  useEffect(() => {
    if (!isHistoryLoaded) return;

    const saveHistory = async () => {
      try {
        await AsyncStorage.setItem(BUDDY_HISTORY_STORAGE_KEY, JSON.stringify(messages));
      } catch {
        // Local history is best-effort; chat still works if storage is unavailable.
      }
    };

    void saveHistory();
  }, [isHistoryLoaded, messages]);

  const handleUseDraft = useCallback(
    (draft: ActivityDraft) => {
      router.push({
        pathname: '/(tabs)/create',
        params: toCreateParams(draft),
      });
    },
    [router]
  );

  const handleOpenActivity = useCallback(
    (activityId: string) => {
      router.push(`/activity/${activityId}`);
    },
    [router]
  );

  const submitPrompt = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || isThinking) return;

      const userMessage = createUserMessage(trimmed);
      const nextMessages = [...messages, userMessage];
      setMessages(nextMessages);
      setInput('');
      setIsThinking(true);
      scrollToEnd();

      try {
        const response = await sendBuddyMessage(nextMessages, { activities });
        setMessages((current) => [...current, response.message]);
      } catch {
        const errorMessage: BuddyMessage = {
          id: `${Date.now()}-error`,
          role: 'assistant',
          text: 'I had trouble thinking through that. Try asking for a recommendation or activity draft again.',
          createdAt: new Date().toISOString(),
        };
        setMessages((current) => [...current, errorMessage]);
      } finally {
        setIsThinking(false);
        scrollToEnd();
      }
    },
    [activities, isThinking, messages, scrollToEnd]
  );

  const renderMessage = useCallback(
    ({ item }: { item: BuddyMessage }) => (
      <MessageBubble message={item} onUseDraft={handleUseDraft} onOpenActivity={handleOpenActivity} />
    ),
    [handleOpenActivity, handleUseDraft]
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { paddingTop: insets.top }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.title}>Chat with JoinUp Buddy</Text>
          <View style={styles.statusRow}>
            <View style={styles.onlineDot} />
            <Text style={styles.subtitle}>Online</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.headerButton}>
          <Ionicons name="ellipsis-horizontal" size={22} color={Colors.text} />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={scrollToEnd}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          isThinking ? (
            <View style={styles.thinkingRow}>
              <View style={styles.buddyAvatar}>
                <Ionicons name="sparkles" size={15} color={Colors.white} />
              </View>
              <View style={styles.thinkingBubble}>
                <ActivityIndicator size="small" color={Colors.accent} />
                <Text style={styles.thinkingText}>Thinking...</Text>
              </View>
            </View>
          ) : null
        }
      />

      <View style={[styles.composerShell, { paddingBottom: Math.max(insets.bottom, Spacing.sm) }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickPromptWrap}
          keyboardShouldPersistTaps="handled"
        >
          {QUICK_PROMPTS.map((prompt) => (
            <TouchableOpacity
              key={prompt}
              style={styles.quickPrompt}
              onPress={() => submitPrompt(prompt)}
              disabled={isThinking}
            >
              <Text style={styles.quickPromptText}>{prompt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Type your message…"
            placeholderTextColor={Colors.slate}
            style={styles.input}
            multiline
            maxLength={500}
            editable={!isThinking}
          />
          <TouchableOpacity
            style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
            onPress={() => submitPrompt(input)}
            disabled={!canSend}
            activeOpacity={0.85}
          >
            <Ionicons name="send" size={18} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  header: {
    minHeight: 66,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: Typography.bodyBold,
    fontSize: 17,
    color: Colors.text,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  subtitle: {
    fontFamily: Typography.bodyMed,
    fontSize: 12,
    color: Colors.success,
  },
  messageList: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
    alignItems: 'flex-end',
    gap: Spacing.sm,
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
  },
  buddyAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    maxWidth: '84%',
    borderRadius: 18,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
  },
  userBubble: {
    backgroundColor: Colors.primary,
    borderBottomRightRadius: 5,
  },
  assistantBubble: {
    backgroundColor: Colors.white,
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: Colors.divider,
    ...Shadows.soft,
  },
  messageText: {
    fontFamily: Typography.body,
    fontSize: 15,
    lineHeight: 21,
  },
  userMessageText: {
    color: Colors.white,
  },
  assistantMessageText: {
    color: Colors.text,
  },
  draftCard: {
    marginTop: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.divider,
    backgroundColor: Colors.cream,
    padding: Spacing.md,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  cardIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: {
    fontFamily: Typography.bodyBold,
    fontSize: 12,
    color: Colors.accent,
  },
  draftTitle: {
    fontFamily: Typography.bodyBold,
    fontSize: 16,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  draftDescription: {
    fontFamily: Typography.body,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  detailGrid: {
    gap: 4,
    marginBottom: Spacing.md,
  },
  detailText: {
    fontFamily: Typography.bodyMed,
    fontSize: 12,
    color: Colors.text,
  },
  draftActions: {
    gap: Spacing.sm,
  },
  primarySmallButton: {
    minHeight: 38,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  primarySmallText: {
    fontFamily: Typography.bodyBold,
    fontSize: 13,
    color: Colors.white,
  },
  secondarySmallButton: {
    minHeight: 38,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  secondarySmallText: {
    fontFamily: Typography.bodyBold,
    fontSize: 13,
    color: Colors.text,
  },
  recommendationList: {
    marginTop: Spacing.md,
    gap: Spacing.sm,
  },
  recommendationCard: {
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.divider,
    backgroundColor: Colors.cream,
    padding: Spacing.sm,
  },
  recommendationTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryPill: {
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  categoryPillText: {
    fontFamily: Typography.bodyBold,
    fontSize: 10,
  },
  slotsText: {
    fontFamily: Typography.bodyMed,
    fontSize: 11,
    color: Colors.slate,
  },
  recommendationTitle: {
    fontFamily: Typography.bodyBold,
    fontSize: 14,
    color: Colors.text,
  },
  recommendationMeta: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.slate,
    marginTop: 2,
  },
  recommendationReason: {
    fontFamily: Typography.body,
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 5,
  },
  thinkingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  thinkingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: 18,
    borderBottomLeftRadius: 5,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.divider,
    paddingHorizontal: Spacing.md,
    paddingVertical: 11,
  },
  thinkingText: {
    fontFamily: Typography.bodyMed,
    fontSize: 13,
    color: Colors.slate,
  },
  composerShell: {
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: Colors.divider,
    paddingTop: Spacing.sm,
  },
  quickPromptWrap: {
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  quickPrompt: {
    borderRadius: BorderRadius.pill,
    borderWidth: 1,
    borderColor: Colors.divider,
    backgroundColor: Colors.cream,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: Spacing.sm,
  },
  quickPromptText: {
    fontFamily: Typography.bodyMed,
    fontSize: 12,
    color: Colors.text,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    backgroundColor: Colors.cream,
    borderRadius: BorderRadius.input,
    borderWidth: 1,
    borderColor: Colors.divider,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  input: {
    flex: 1,
    maxHeight: 96,
    minHeight: 36,
    fontFamily: Typography.body,
    fontSize: 15,
    color: Colors.text,
    paddingVertical: 8,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
});
