import type { Activity } from '../types';

type Category = Activity['category'];

export const SHOULD_USE_MOCK_ACTIVITIES = __DEV__;

const CATEGORY_SEEDS: Record<Category, Array<{ title: string; location: string; description: string }>> = {
  Fitness: [
    { title: 'Sunrise Run Club', location: 'Luneta Park, Manila', description: 'Easy paced 5K with a coffee stop after.' },
    { title: 'Core & Coffee', location: 'Batangas City Sports Complex', description: 'Quick core circuit followed by a social coffee break.' },
    { title: 'Sunday Stretch Session', location: 'Ayala Triangle Gardens, Manila', description: 'Mobility, stretch, and breathwork for a reset.' },
    { title: 'Pickup Basketball Night', location: 'Batangas City Grand Terminal Court', description: 'Friendly pickup games with rotating teams.' },
    { title: 'Trail Hike + Picnic', location: 'Taal Lake View Deck, Batangas City', description: 'Moderate hike and a casual picnic at the summit.' },
  ],
  Study: [
    { title: 'Exam Prep Sprint', location: 'University of Batangas Library', description: '90-minute focused study block with accountability.' },
    { title: 'Language Exchange Circle', location: 'UP Diliman Library, Quezon City', description: 'Practice conversation and shared note-taking.' },
    { title: 'Build in Public Workshop', location: 'Batangas City Public Library', description: 'Work alongside others on projects and homework.' },
    { title: 'Coding Co-Study', location: 'Ateneo de Manila Study Hall', description: 'Quiet coding and study session for builders.' },
    { title: 'Reading Club Hour', location: 'Batangas State University Library', description: 'Bring a book, read together, and compare notes.' },
  ],
  'Café': [
    { title: 'Latte & Letters', location: 'Bluemoon Cafe', description: 'Bring your journal or notebook and settle in.' },
    { title: 'Coffee Chat Meetup', location: 'Pronto', description: 'Meet new people over espresso and pastries.' },
    { title: 'Remote Work Table', location: 'Itaewon Cafe', description: 'A friendly work session with outlet access and good vibes.' },
    { title: 'Sunday Brunch Club', location: 'Bluemoon Cafe', description: 'Slow brunch, light conversation, and a shared table.' },
    { title: 'Dessert Tasting Hang', location: 'Pronto', description: 'Sample desserts and chat through your favorites.' },
  ],
  Outdoors: [
    { title: 'Sunset Kayak Crew', location: 'Taal Lake, Batangas City', description: 'Calm water paddle and sunset photos.' },
    { title: 'Botanical Garden Walk', location: 'Manila Baywalk', description: 'Casual walk through the gardens with nature photos.' },
    { title: 'Weekend Beach Cleanup', location: 'Bauan Coast, Batangas', description: 'Do good, meet people, and enjoy the shore.' },
    { title: 'Urban Bike Loop', location: 'Intramuros, Manila', description: 'Easy bike ride through the city loop.' },
    { title: 'Hilltop Sunset Watch', location: 'Mt. Maculot Jump-off, Batangas', description: 'Short hike up for a scenic sunset together.' },
  ],
  Gaming: [
    { title: 'Mario Kart Night', location: 'Quantum, Manila', description: 'Friendly races, rematches, and bragging rights.' },
    { title: 'Co-op Quest Session', location: 'Batangas City Game Room', description: 'Team up for co-op missions and loot drops.' },
    { title: 'Board Game Jam', location: 'Makati Arcade Hub', description: 'Strategy, party games, and quick rounds.' },
    { title: 'Fighting Game Meetup', location: 'SM City Batangas Activity Center', description: 'Bring your controller and try new matchups.' },
    { title: 'Indie Game Showcase', location: 'Cubao Expo, Manila', description: 'Try short indie titles and vote for your favorite.' },
  ],
  Social: [
    { title: 'New Friends Mixer', location: 'Batangas City People’s Park', description: 'Casual icebreakers for meeting new people.' },
    { title: 'Trivia & Tapas', location: 'Poblacion, Makati', description: 'Team trivia with small bites and good energy.' },
    { title: 'Weekend Picnic Meetup', location: 'Rizal Park, Manila', description: 'Bring snacks, blankets, and a good mood.' },
    { title: 'Game Night Social', location: 'Batangas City Grandstand', description: 'Light games and easy conversation starters.' },
    { title: 'After Work Hangout', location: 'BGC High Street, Taguig', description: 'Unwind, meet locals, and grab a drink.' },
  ],
  Food: [
    { title: 'Taco Crawl', location: 'Little Tokyo, Makati', description: 'Hit a few taco spots and rate the favorites.' },
    { title: 'Sushi Night', location: 'Batangas City Bay Mall', description: 'Group dinner with a shared tasting menu.' },
    { title: 'Home Cook Potluck', location: 'Escolta, Manila', description: 'Everyone brings one dish and the stories behind it.' },
    { title: 'Street Food Safari', location: 'Batangas City Public Market', description: 'Sample bites from local food stalls together.' },
    { title: 'Dessert Lovers Meetup', location: 'Binondo Food Street, Manila', description: 'A sweet crawl through the neighborhood.' },
  ],
  Other: [
    { title: 'Creative Jam Session', location: 'Batangas City Art District', description: 'Explore ideas, sketches, and random creative sparks.' },
    { title: 'Photography Walk', location: 'Intramuros, Manila', description: 'Bring a camera or phone and shoot the streets.' },
    { title: 'Thrift Find Hunt', location: 'Baclaran Market, Parañaque', description: 'Browse thrift spots and compare the best finds.' },
    { title: 'Puzzle & Tea Hour', location: 'Batangas City Library Annex', description: 'Slow-paced puzzles, tea, and conversation.' },
    { title: 'Maker Meetup', location: 'The Mind Museum Area, BGC', description: 'Share projects, tools, and ideas with other makers.' },
  ],
};

function buildParticipants(activityId: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${activityId}-participant-${index + 1}`);
}

function buildCoverImage(activityId: string, category: Category) {
  const categorySlug = category.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `https://picsum.photos/seed/joinup-${categorySlug}-${activityId}/960/640`;
}

function buildMockActivities(): Activity[] {
  const activities: Activity[] = [];
  const now = new Date();
  const categories = Object.keys(CATEGORY_SEEDS) as Category[];

  categories.forEach((category, categoryIndex) => {
    CATEGORY_SEEDS[category].forEach((seed, seedIndex) => {
      const maxSlots = 6 + ((categoryIndex + seedIndex) % 5);
      const joinedCount = Math.max(1, Math.min(maxSlots - 1, 2 + ((categoryIndex * 2 + seedIndex) % 4)));
      const dateTime = new Date(now);
      dateTime.setDate(now.getDate() + categoryIndex + seedIndex + 1);
      dateTime.setHours(17 + (seedIndex % 4), 0, 0, 0);

      const id = `mock-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${seedIndex + 1}`;

      activities.push({
        id,
        title: seed.title,
        description: seed.description,
        category,
        location: {
          name: seed.location,
          lat: 0,
          lng: 0,
        },
        dateTime: dateTime.toISOString(),
        maxSlots,
        currentSlots: maxSlots - joinedCount,
        participants: buildParticipants(id, joinedCount),
        hostId: `host-${category.toLowerCase()}-${seedIndex + 1}`,
        hostName: ['Mia', 'Jordan', 'Avery', 'Sam', 'Taylor'][(categoryIndex + seedIndex) % 5],
        hostPhoto: '',
        coverImage: buildCoverImage(id, category),
        requiresApproval: seedIndex % 3 === 0,
        reactions: {
          fire: 4 + ((categoryIndex + seedIndex) % 7),
          heart: 2 + ((categoryIndex * 3 + seedIndex) % 6),
          like: 1 + ((categoryIndex + seedIndex * 2) % 5),
        },
        status: 'active',
        createdAt: new Date(now.getTime() - (categoryIndex * 5 + seedIndex) * 86400000).toISOString(),
      });
    });
  });

  return activities;
}

export const MOCK_ACTIVITIES = buildMockActivities();
