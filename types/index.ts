export interface User {
  uid: string;
  displayName: string;
  photoURL: string;
  bio: string;
  location: string;
  ageRange: '18-24' | '25-30' | '31-40' | '40+';
  interests: string[];
  activitiesJoined: string[];
  activitiesHosted: string[];
  rating: number;
  ratingCount: number;
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  createdAt: string; // ISO 8601
}

export interface Activity {
  id: string;
  title: string;
  description: string;
  category: 'Fitness' | 'Study' | 'Café' | 'Outdoors' | 'Gaming' | 'Social' | 'Food' | 'Other';
  location: { name: string; lat: number; lng: number };
  dateTime: string; // ISO 8601
  maxSlots: number;
  currentSlots: number;
  participants: string[];
  hostId: string;
  hostName: string;
  hostPhoto: string;
  coverImage?: string;
  images?: string[]; // Multiple images for the activity
  requiresApproval: boolean;
  reactions: { fire: number; heart: number; like: number };
  status: 'active' | 'cancelled' | 'completed';
  createdAt: string; // ISO 8601
}

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ActivityDraft {
  title: string;
  description: string;
  category: Activity['category'];
  location: string;
  date: string;
  time: string;
  maxParticipants: number;
  notes?: string;
}

export interface ActivityRecommendation {
  activityId: string;
  title: string;
  reason: string;
  category: Activity['category'];
  location: string;
  dateTime: string;
  availableSlots: number;
}

export interface BuddyMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  draft?: ActivityDraft;
  recommendations?: ActivityRecommendation[];
}

export interface BuddyResponse {
  message: BuddyMessage;
  draft?: ActivityDraft;
  recommendations?: ActivityRecommendation[];
}

export interface Message {
  id: string;
  activityId: string;
  senderId: string;
  senderName: string;
  senderPhoto: string;
  text?: string;
  imageUrl?: string;
  location?: { lat: number; lng: number };
  type: 'text' | 'image' | 'location' | 'system';
  isPinned: boolean;
  createdAt: string; // ISO 8601
}

export interface Notification {
  id: string;
  userId: string;
  type: 'join' | 'comment' | 'reminder' | 'approval' | 'chat' | 'update';
  title: string;
  body: string;
  actorId?: string;
  actorName?: string;
  actorPhoto?: string;
  activityId: string | null;
  read: boolean;
  createdAt: string; // ISO 8601
}
