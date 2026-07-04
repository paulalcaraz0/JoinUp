import type {
  Activity,
  ActivityDraft,
  ActivityRecommendation,
  BuddyMessage,
  BuddyResponse,
} from '../../types';

type BuddyContext = {
  activities?: Activity[];
};

const BUDDY_SCOPE_MESSAGE =
  "I'm here to help with activities, recommendations, and creating events on JoinUp.";

const CATEGORY_KEYWORDS: Record<Activity['category'], string[]> = {
  Fitness: ['basketball', 'sport', 'sports', 'fitness', 'run', 'running', 'gym', 'workout', 'volleyball', 'game'],
  Study: ['study', 'coding', 'code', 'review', 'exam', 'school', 'project', 'homework', 'learn'],
  Café: ['coffee', 'cafe', 'café', 'relax', 'relaxing', 'chill', 'quiet'],
  Outdoors: ['outside', 'outdoor', 'walk', 'hike', 'park', 'nature', 'weekend'],
  Gaming: ['gaming', 'game', 'games', 'esports', 'console'],
  Social: ['meet', 'people', 'social', 'shy', 'friends', 'hangout', 'bored'],
  Food: ['food', 'eat', 'dinner', 'lunch', 'snack', 'restaurant'],
  Other: ['activity', 'event', 'something', 'anything'],
};

const CREATE_KEYWORDS = ['create', 'make', 'host', 'organize', 'post', 'start', 'plan'];
const JOINUP_KEYWORDS = [
  'activity',
  'activities',
  'join',
  'event',
  'events',
  'recommend',
  'create',
  'meet',
  'people',
  'weekend',
  'tomorrow',
  'today',
  'basketball',
  'coding',
  'study',
  'relax',
  'sports',
  'group',
  'participants',
  'batstate',
  'bored',
  'shy',
  'food',
  'gaming',
  'outdoors',
];

const toId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const normalize = (value: string) => value.trim().toLowerCase();
const includesAny = (text: string, keywords: string[]) => keywords.some((keyword) => text.includes(keyword));

function inferCategory(text: string): Activity['category'] {
  const normalized = normalize(text);
  const scored = Object.entries(CATEGORY_KEYWORDS).map(([category, keywords]) => ({
    category: category as Activity['category'],
    score: keywords.filter((keyword) => normalized.includes(keyword)).length,
  }));

  scored.sort((left, right) => right.score - left.score);
  return scored[0]?.score > 0 ? scored[0].category : 'Social';
}

function extractMaxParticipants(text: string) {
  const explicit = text.match(/(?:for|with|limit|maximum|max)\s+(\d{1,3})\s*(?:people|participants|pax|members)?/i);
  const generic = text.match(/(\d{1,3})\s*(?:people|participants|pax|members)/i);
  const parsed = Number.parseInt(explicit?.[1] ?? generic?.[1] ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100) : 8;
}

function inferDate(text: string, now = new Date()) {
  const normalized = normalize(text);
  const date = new Date(now);

  if (normalized.includes('tomorrow')) {
    date.setDate(date.getDate() + 1);
  } else if (normalized.includes('saturday')) {
    const daysUntilSaturday = (6 - date.getDay() + 7) % 7 || 7;
    date.setDate(date.getDate() + daysUntilSaturday);
  } else if (normalized.includes('sunday')) {
    const daysUntilSunday = (7 - date.getDay()) % 7 || 7;
    date.setDate(date.getDate() + daysUntilSunday);
  } else if (normalized.includes('weekend')) {
    const daysUntilSaturday = (6 - date.getDay() + 7) % 7 || 7;
    date.setDate(date.getDate() + daysUntilSaturday);
  } else {
    date.setDate(date.getDate() + 1);
  }

  if (normalized.includes('morning')) {
    date.setHours(9, 0, 0, 0);
  } else if (normalized.includes('afternoon')) {
    date.setHours(14, 0, 0, 0);
  } else if (normalized.includes('evening') || normalized.includes('night')) {
    date.setHours(18, 0, 0, 0);
  } else {
    date.setHours(16, 0, 0, 0);
  }

  return date;
}

function formatDateParam(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatTimeParam(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function titleForCategory(category: Activity['category'], text: string) {
  const normalized = normalize(text);

  if (normalized.includes('basketball')) return 'Casual Basketball Game';
  if (normalized.includes('coding')) return 'Coding Study Session';
  if (normalized.includes('study')) return 'Study Group';
  if (normalized.includes('relax')) return 'Relaxed Hangout';
  if (normalized.includes('coffee') || normalized.includes('cafe')) return 'Cafe Meetup';

  const defaults: Record<Activity['category'], string> = {
    Fitness: 'Casual Fitness Meetup',
    Study: 'Study Group',
    Café: 'Cafe Hangout',
    Outdoors: 'Outdoor Meetup',
    Gaming: 'Gaming Session',
    Social: 'Social Meetup',
    Food: 'Food Meetup',
    Other: 'JoinUp Activity',
  };

  return defaults[category];
}

function extractLocation(text: string) {
  const atMatch = text.match(/\bat\s+([a-z0-9 .'-]+?)(?:\s+(?:today|tomorrow|this|on|for|with|at\s+\d)|$)/i);
  if (atMatch?.[1]) {
    return atMatch[1].trim().replace(/\s+/g, ' ');
  }

  if (normalize(text).includes('batstate')) return 'BatState';
  return 'Location TBD';
}

export function generateActivityDraftFromText(text: string): ActivityDraft {
  const category = inferCategory(text);
  const date = inferDate(text);
  const title = titleForCategory(category, text);

  return {
    title,
    description: `A friendly ${category.toLowerCase()} activity for JoinUp members. Bring a good attitude and be ready to meet people.`,
    category,
    location: extractLocation(text),
    date: formatDateParam(date),
    time: formatTimeParam(date),
    maxParticipants: extractMaxParticipants(text),
    notes: 'Generated by JoinUp Buddy. Review the details before posting.',
  };
}

function activityScore(prompt: string, activity: Activity) {
  const normalized = normalize(prompt);
  const haystack = normalize(`${activity.title} ${activity.description} ${activity.category} ${activity.location.name}`);
  const words = normalized.split(/\s+/).filter((word) => word.length > 2);
  const availableSlots = Math.max(0, activity.currentSlots);
  let score = 0;

  words.forEach((word) => {
    if (haystack.includes(word)) score += 2;
  });
  CATEGORY_KEYWORDS[activity.category].forEach((keyword) => {
    if (normalized.includes(keyword)) score += 3;
  });
  if (availableSlots > 0) score += 1;
  if (new Date(activity.dateTime).getTime() >= Date.now()) score += 1;

  return score;
}

export function recommendActivitiesFromPrompt(
  text: string,
  activities: Activity[] = []
): ActivityRecommendation[] {
  return activities
    .map((activity) => ({ activity, score: activityScore(text, activity) }))
    .filter(({ activity, score }) => score > 1 && Math.max(0, activity.currentSlots) > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map(({ activity }) => ({
      activityId: activity.id,
      title: activity.title,
      reason: `${activity.category} match with ${Math.max(0, activity.currentSlots)} slot${Math.max(0, activity.currentSlots) === 1 ? '' : 's'} left.`,
      category: activity.category,
      location: activity.location.name,
      dateTime: activity.dateTime,
      availableSlots: Math.max(0, activity.currentSlots),
    }));
}

function assistantMessage(text: string, extras?: Pick<BuddyMessage, 'draft' | 'recommendations'>): BuddyMessage {
  return {
    id: toId(),
    role: 'assistant',
    text,
    createdAt: new Date().toISOString(),
    ...extras,
  };
}

export async function sendBuddyMessage(
  messages: BuddyMessage[],
  context: BuddyContext = {}
): Promise<BuddyResponse> {
  const latest = [...messages].reverse().find((message) => message.role === 'user');
  const prompt = latest?.text ?? '';
  const normalized = normalize(prompt);

  if (!includesAny(normalized, JOINUP_KEYWORDS)) {
    const message = assistantMessage(BUDDY_SCOPE_MESSAGE);
    return { message };
  }

  if (normalized.length < 10 || normalized === 'create an activity' || normalized === 'recommend') {
    const message = assistantMessage(
      'Tell me your mood, interest, location, or preferred time. I can recommend something or help draft a new activity.'
    );
    return { message };
  }

  if (includesAny(normalized, CREATE_KEYWORDS)) {
    const draft = generateActivityDraftFromText(prompt);
    const message = assistantMessage(
      'I drafted an activity. Review it first, then use it to prefill the post form.',
      { draft }
    );
    return { message, draft };
  }

  const recommendations = recommendActivitiesFromPrompt(prompt, context.activities);
  if (recommendations.length > 0) {
    const message = assistantMessage('These existing activities look like a good fit:', { recommendations });
    return { message, recommendations };
  }

  const category = inferCategory(prompt);
  const draft = generateActivityDraftFromText(`Create a ${category} activity based on: ${prompt}`);
  const message = assistantMessage(
    `I could not find a strong existing match. You could create a ${category.toLowerCase()} activity instead.`,
    { draft }
  );
  return { message, draft };
}
