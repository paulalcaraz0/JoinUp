export const DatabaseTables = {
  profiles: 'profiles',
  activities: 'activities',
  activitiesFull: 'activities_full',
  participants: 'participants',
  notifications: 'notifications',
  messages: 'messages',
  messagesFull: 'messages_full',
  reactions: 'reactions',
} as const;

export const ActivityStatus = {
  active: 'active',
  cancelled: 'cancelled',
  completed: 'completed',
} as const;

export const ParticipantStatus = {
  joined: 'joined',
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  cancelled: 'cancelled',
} as const;

export const NotificationTypes = {
  join: 'join',
  comment: 'comment',
  reminder: 'reminder',
  approval: 'approval',
  chat: 'chat',
  update: 'update',
} as const;

export const ActivityCategories = {
  fitness: 'Fitness',
  study: 'Study',
  cafe: 'Café',
  outdoors: 'Outdoors',
  gaming: 'Gaming',
  social: 'Social',
  food: 'Food',
  other: 'Other',
} as const;
