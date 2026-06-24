export const InputLimits = {
  activityTitle: 80,
  activityDescription: 1000,
  activityLocation: 120,
  profileName: 50,
  profileLocation: 80,
  profileBio: 300,
  chatMessage: 500,
  maxActivitySlots: 100,
} as const;

export function trimInput(value: string) {
  return value.trim();
}
