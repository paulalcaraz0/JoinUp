import type { Message, Activity } from '../types';
import { MOCK_ACTIVITIES, SHOULD_USE_MOCK_ACTIVITIES } from './mockActivities';

export interface MockChatThread {
  activityId: string;
  messages: Message[];
}

const HOST_REPLIES = [
  'I’ll be there a bit early to set things up.',
  'Let me know if you’re bringing a friend.',
  'See you all there.',
  'I can share the exact meetup spot later today.',
  'Perfect, this should be a fun one.',
];

const PARTICIPANT_REPLIES = [
  'Count me in.',
  'Looking forward to this.',
  'I’m on the way after work.',
  'Sounds good, see you there!',
  'I can bring snacks if needed.',
];

function participantName(activity: Activity, index: number) {
  const names = ['Alex', 'Jamie', 'Rin', 'Kai', 'Nina', 'Drew'];
  return `${names[(index + activity.title.length) % names.length]} ${index + 1}`;
}

function buildMessageId(activityId: string, suffix: string) {
  return `${activityId}-msg-${suffix}`;
}

function buildThread(activity: Activity, activityIndex: number): MockChatThread {
  const start = new Date(activity.dateTime);
  const baseTime = new Date(start.getTime() - (60 + activityIndex * 3) * 60000);
  const hostId = activity.hostId;

  const messages: Message[] = [
    {
      id: buildMessageId(activity.id, 'welcome'),
      activityId: activity.id,
      senderId: hostId,
      senderName: activity.hostName,
      senderPhoto: activity.hostPhoto,
      text: `Welcome to ${activity.title}. Meetup at ${activity.location.name}.`,
      type: 'text',
      isPinned: true,
      createdAt: new Date(baseTime.getTime()).toISOString(),
    },
    {
      id: buildMessageId(activity.id, 'reply-1'),
      activityId: activity.id,
      senderId: `${activity.id}-participant-1`,
      senderName: participantName(activity, 1),
      senderPhoto: '',
      text: PARTICIPANT_REPLIES[activityIndex % PARTICIPANT_REPLIES.length],
      type: 'text',
      isPinned: false,
      createdAt: new Date(baseTime.getTime() + 12 * 60000).toISOString(),
    },
    {
      id: buildMessageId(activity.id, 'reply-2'),
      activityId: activity.id,
      senderId: hostId,
      senderName: activity.hostName,
      senderPhoto: activity.hostPhoto,
      text: HOST_REPLIES[activityIndex % HOST_REPLIES.length],
      type: 'text',
      isPinned: false,
      createdAt: new Date(baseTime.getTime() + 22 * 60000).toISOString(),
    },
    {
      id: buildMessageId(activity.id, 'reply-3'),
      activityId: activity.id,
      senderId: `${activity.id}-participant-2`,
      senderName: participantName(activity, 2),
      senderPhoto: '',
      text: 'I’ll join once I finish up here.',
      type: 'text',
      isPinned: false,
      createdAt: new Date(baseTime.getTime() + 31 * 60000).toISOString(),
    },
    {
      id: buildMessageId(activity.id, 'reply-4'),
      activityId: activity.id,
      senderId: hostId,
      senderName: activity.hostName,
      senderPhoto: activity.hostPhoto,
      text: activity.requiresApproval ? 'Waiting for approvals. Check the invite status.' : 'We’re all set for today.',
      type: 'system',
      isPinned: false,
      createdAt: new Date(baseTime.getTime() + 38 * 60000).toISOString(),
    },
  ];

  return { activityId: activity.id, messages };
}

export const MOCK_CHAT_THREADS: Record<string, MockChatThread> = SHOULD_USE_MOCK_ACTIVITIES
  ? MOCK_ACTIVITIES.reduce<Record<string, MockChatThread>>(
      (acc, activity, index) => {
        acc[activity.id] = buildThread(activity, index);
        return acc;
      },
      {}
    )
  : {};

export function getMockChatMessages(activityId: string) {
  return MOCK_CHAT_THREADS[activityId]?.messages ?? [];
}

export function getMockChatPreview(activityId: string) {
  const thread = MOCK_CHAT_THREADS[activityId];
  if (!thread || thread.messages.length === 0) {
    return null;
  }

  const latest = thread.messages[thread.messages.length - 1];
  const previewText =
    latest.type === 'image'
      ? 'Shared a photo'
      : latest.type === 'location'
        ? 'Shared a location update'
        : latest.text ?? 'New message';

  return {
    senderName: latest.senderName,
    text: previewText,
    createdAt: latest.createdAt,
  };
}
