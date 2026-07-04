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

type ParsedTime = {
  hour: number;
  minute: number;
  source: 'explicit' | 'period' | 'default';
};

type ParsedDateTime = {
  date: Date;
  hasDateCue: boolean;
  hasTimeCue: boolean;
};

type DraftParts = {
  category: Activity['category'];
  title: string;
  location: string | null;
  dateTime: ParsedDateTime;
  maxParticipants: number;
  hasActivityType: boolean;
};

const CAFE_CATEGORY = 'Caf\u00E9';

const BUDDY_SCOPE_MESSAGE =
  "I'm here to help with activities, recommendations, and creating events on JoinUp.";

const CATEGORY_KEYWORDS: Record<Activity['category'], string[]> = {
  Fitness: [
    'basketball',
    'badminton',
    'cycling',
    'fitness',
    'gym',
    'running',
    'sport',
    'sports',
    'volleyball',
    'workout',
  ],
  Study: ['coding', 'code', 'exam', 'homework', 'learn', 'programming', 'project', 'review', 'school', 'study'],
  [CAFE_CATEGORY]: ['cafe', 'caf\u00E9', 'coffee'],
  Outdoors: ['hike', 'hiking', 'outdoor', 'outside', 'park', 'picnic', 'walk'],
  Gaming: ['console', 'esports', 'game', 'games', 'gaming'],
  Social: ['bible', 'church', 'friends', 'hangout', 'meet', 'people', 'prayer', 'social', 'worship'],
  Food: ['dinner', 'eat', 'food', 'lunch', 'restaurant', 'snack'],
  Other: [],
};

const CREATE_KEYWORDS = ['create', 'make', 'host', 'organize', 'post', 'start', 'plan'];
const JOINUP_KEYWORDS = [
  'activity',
  'activities',
  'badminton',
  'basketball',
  'batstate',
  'bible',
  'bored',
  'cafe',
  'church',
  'coding',
  'coffee',
  'create',
  'cycling',
  'event',
  'events',
  'food',
  'gaming',
  'gym',
  'join',
  'meet',
  'outdoors',
  'participants',
  'people',
  'prayer',
  'recommend',
  'relax',
  'running',
  'shy',
  'sports',
  'study',
  'tomorrow',
  'today',
  'volleyball',
  'weekend',
  'worship',
];

const ACTIVITY_TYPE_KEYWORDS = Object.values(CATEGORY_KEYWORDS).flat();
const TIME_PATTERN = /\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:am|pm)\b|\b(?:[01]?\d|2[0-3]):[0-5]\d\b/i;
const RELATIVE_DATE_PATTERN =
  /\b(?:later|today|tomorrow|weekend)\b|\b(?:this\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const toId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const normalize = (value: string) => value.trim().toLowerCase();
const includesAny = (text: string, keywords: string[]) => keywords.some((keyword) => text.includes(keyword));

function hasWholeWord(text: string, keyword: string) {
  return new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text);
}

function inferCategory(text: string): Activity['category'] {
  const normalized = normalize(text);

  if (includesAny(normalized, ['worship', 'prayer', 'church', 'bible'])) return 'Social';
  if (includesAny(normalized, ['basketball', 'volleyball', 'badminton', 'running', 'cycling', 'gym'])) return 'Fitness';
  if (includesAny(normalized, ['study', 'review', 'coding', 'programming', 'project'])) return 'Study';
  if (includesAny(normalized, ['coffee', 'cafe', 'caf\u00E9'])) return CAFE_CATEGORY;
  if (includesAny(normalized, ['food', 'dinner', 'lunch', 'eat', 'restaurant'])) return 'Food';
  if (includesAny(normalized, ['hiking', 'hike', 'walk', 'outdoor', 'picnic'])) return 'Outdoors';
  if (includesAny(normalized, ['gaming', 'games', 'esports', 'console'])) return 'Gaming';
  if (includesAny(normalized, ['meet', 'people', 'social', 'friends', 'hangout', 'bored'])) return 'Social';

  return 'Social';
}

function hasActivityType(text: string) {
  const normalized = normalize(text);
  return ACTIVITY_TYPE_KEYWORDS.some((keyword) => keyword && hasWholeWord(normalized, keyword));
}

function extractMaxParticipants(text: string) {
  const explicit = text.match(/(?:for|with|limit|maximum|max)\s+(\d{1,3})\s*(?:people|participants|pax|members)?/i);
  const generic = text.match(/(\d{1,3})\s*(?:people|participants|pax|members)/i);
  const parsed = Number.parseInt(explicit?.[1] ?? generic?.[1] ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100) : 8;
}

function extractTime(text: string): ParsedTime {
  const explicit = text.match(TIME_PATTERN)?.[0];

  if (explicit) {
    const compact = explicit.toLowerCase().replace(/\s+/g, '');
    const period = compact.endsWith('am') || compact.endsWith('pm') ? compact.slice(-2) : null;
    const withoutPeriod = period ? compact.slice(0, -2) : compact;
    const [rawHour, rawMinute] = withoutPeriod.split(':');
    let hour = Number.parseInt(rawHour, 10);
    const minute = rawMinute ? Number.parseInt(rawMinute, 10) : 0;

    if (period === 'pm' && hour < 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;

    return { hour, minute, source: 'explicit' };
  }

  const normalized = normalize(text);
  if (normalized.includes('morning')) return { hour: 9, minute: 0, source: 'period' };
  if (normalized.includes('afternoon')) return { hour: 14, minute: 0, source: 'period' };
  if (normalized.includes('evening') || normalized.includes('night')) return { hour: 18, minute: 0, source: 'period' };

  return { hour: 16, minute: 0, source: 'default' };
}

function inferDateTime(text: string, now = new Date()): ParsedDateTime {
  const normalized = normalize(text);
  const date = new Date(now);
  const time = extractTime(text);
  const hasTimeCue = time.source !== 'default';
  const hasDateCue = RELATIVE_DATE_PATTERN.test(text);

  date.setHours(time.hour, time.minute, 0, 0);

  if (normalized.includes('tomorrow')) {
    date.setDate(date.getDate() + 1);
  } else {
    const dayIndex = DAY_NAMES.findIndex((day) => normalized.includes(day));
    if (dayIndex >= 0) {
      const daysUntilTarget = (dayIndex - date.getDay() + 7) % 7 || 7;
      date.setDate(date.getDate() + daysUntilTarget);
    } else if (normalized.includes('weekend')) {
      const daysUntilSaturday = (6 - date.getDay() + 7) % 7 || 7;
      date.setDate(date.getDate() + daysUntilSaturday);
    } else if ((normalized.includes('later') || hasTimeCue) && date.getTime() <= now.getTime()) {
      date.setDate(date.getDate() + 1);
    } else if (!normalized.includes('today') && !normalized.includes('later') && !hasTimeCue) {
      date.setDate(date.getDate() + 1);
    }
  }

  return { date, hasDateCue, hasTimeCue };
}

function formatDateParam(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatTimeParam(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function toTitleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(' ');
}

function extractTitle(text: string, category: Activity['category']) {
  const normalized = normalize(text);
  const phrasePatterns: Array<[RegExp, string]> = [
    [/\bworship\s+activity\b/i, 'Worship Activity'],
    [/\bprayer\s+(?:meeting|activity|group)\b/i, 'Prayer Meeting'],
    [/\bbasketball\s+(?:game|activity|meetup)\b/i, 'Basketball Game'],
    [/\bvolleyball\s+(?:game|activity|meetup)\b/i, 'Volleyball Game'],
    [/\bbadminton\s+(?:game|activity|meetup)\b/i, 'Badminton Game'],
    [/\bstudy\s+group\b/i, 'Study Group'],
    [/\bcoding\s+(?:session|group|activity)\b/i, 'Coding Session'],
    [/\bcoffee\s+(?:hangout|meetup|activity)\b/i, 'Coffee Hangout'],
  ];

  const matchedPhrase = phrasePatterns.find(([pattern]) => pattern.test(text));
  if (matchedPhrase) return matchedPhrase[1];

  const afterCreate = text.match(
    /\b(?:create|make|host|organize|post|start|plan)\s+(?:me\s+)?(?:a|an)?\s*([a-z][a-z\s'-]{2,40}?)(?=\s+(?:later|today|tomorrow|this|at|in|on|near|around|for|with)\b|$)/i
  )?.[1];

  if (afterCreate) {
    const cleaned = afterCreate.trim();
    if (cleaned && !/^(activity|event|something|anything)$/i.test(cleaned)) {
      return toTitleCase(cleaned);
    }
  }

  if (normalized.includes('worship')) return 'Worship Activity';
  if (normalized.includes('basketball')) return 'Basketball Game';
  if (normalized.includes('volleyball')) return 'Volleyball Game';
  if (normalized.includes('badminton')) return 'Badminton Game';
  if (normalized.includes('study')) return 'Study Group';
  if (normalized.includes('coffee') || normalized.includes('cafe')) return 'Coffee Hangout';

  const defaults: Record<Activity['category'], string> = {
    Fitness: 'Casual Fitness Meetup',
    Study: 'Study Group',
    [CAFE_CATEGORY]: 'Cafe Hangout',
    Outdoors: 'Outdoor Meetup',
    Gaming: 'Gaming Session',
    Social: 'Social Meetup',
    Food: 'Food Meetup',
    Other: 'JoinUp Activity',
  };

  return defaults[category];
}

function looksLikeTimeOrDate(value: string) {
  return TIME_PATTERN.test(value) || /^(?:later|today|tomorrow|this|weekend|morning|afternoon|evening|night)\b/i.test(value);
}

function cleanLocationCandidate(value: string) {
  return value
    .replace(/[.?!]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLocation(text: string) {
  const matches = Array.from(text.matchAll(/\b(at|in|on|near|around)\s+/gi));

  for (const match of matches) {
    const start = (match.index ?? 0) + match[0].length;
    const remaining = text.slice(start);
    if (looksLikeTimeOrDate(remaining)) continue;

    const boundary = remaining.search(
      /\s+(?:at\s+)?(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s*(?:am|pm)\b|\s+(?:[01]?\d|2[0-3]):[0-5]\d\b|\s+\b(?:later|today|tomorrow|this\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|morning|afternoon|evening|night|for|with|limit|maximum|max)\b/i
    );
    const candidate = cleanLocationCandidate(boundary >= 0 ? remaining.slice(0, boundary) : remaining);

    if (candidate && !looksLikeTimeOrDate(candidate) && !/^\d+\s*(?:people|participants|pax|members)?$/i.test(candidate)) {
      return candidate;
    }
  }

  if (normalize(text).includes('batstate')) return 'BatState';
  return null;
}

function buildDescription(title: string, category: Activity['category']) {
  if (title === 'Worship Activity') return 'Friendly worship activity for JoinUp members.';
  return `A friendly ${category.toLowerCase()} activity for JoinUp members. Bring a good attitude and be ready to meet people.`;
}

function parseActivityDraftParts(text: string, now = new Date()): DraftParts {
  const category = inferCategory(text);
  const title = extractTitle(text, category);

  return {
    category,
    title,
    location: extractLocation(text),
    dateTime: inferDateTime(text, now),
    maxParticipants: extractMaxParticipants(text),
    hasActivityType: hasActivityType(text),
  };
}

function missingDraftDetails(text: string) {
  const parts = parseActivityDraftParts(text);
  const missing: string[] = [];

  if (!parts.hasActivityType) missing.push('activity type');
  if (!parts.location) missing.push('location');
  if (!parts.dateTime.hasDateCue && !parts.dateTime.hasTimeCue) missing.push('date or time');

  return missing;
}

function followUpForMissingDetails(missing: string[]) {
  if (missing.length === 0) return null;

  const readable =
    missing.length === 1
      ? missing[0]
      : `${missing.slice(0, -1).join(', ')} and ${missing[missing.length - 1]}`;

  return `I can draft that, but I need the ${readable} first.`;
}

/*
Parser examples:
- "Create a worship activity later at 9pm on Alangilan, Batangas City"
  => Worship Activity, Social, Alangilan, Batangas City, 21:00, today or tomorrow if 21:00 passed.
- "Create a basketball game this Saturday at BatState for 10 people"
  => Basketball Game, Fitness, BatState, next Saturday, maxParticipants 10.
- "I want a study group tomorrow afternoon"
  => Study Group, Study, tomorrow 14:00; Buddy asks for location before drafting.
- "Plan a coffee hangout near SM Batangas at 5pm"
  => Coffee Hangout, Cafe, SM Batangas, 17:00, today or tomorrow if 17:00 passed.
*/
export function generateActivityDraftFromText(text: string): ActivityDraft {
  const parts = parseActivityDraftParts(text);
  const date = parts.dateTime.date;

  return {
    title: parts.title,
    description: buildDescription(parts.title, parts.category),
    category: parts.category,
    location: parts.location ?? 'Location TBD',
    date: formatDateParam(date),
    time: formatTimeParam(date),
    maxParticipants: parts.maxParticipants,
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
    const followUp = followUpForMissingDetails(missingDraftDetails(prompt));
    if (followUp) {
      const message = assistantMessage(followUp);
      return { message };
    }

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
  const draftPrompt = `Create a ${category} activity based on: ${prompt}`;
  const followUp = followUpForMissingDetails(missingDraftDetails(draftPrompt));
  if (followUp) {
    const message = assistantMessage(followUp);
    return { message };
  }

  const draft = generateActivityDraftFromText(draftPrompt);
  const message = assistantMessage(
    `I could not find a strong existing match. You could create a ${category.toLowerCase()} activity instead.`,
    { draft }
  );
  return { message, draft };
}
