export const LIVE_CELEBRATION_MS = 5_000;
export const LIVE_SOUND_STORAGE_KEY = "allstar-live-leaderboard-sound";

export function mergeLiveCelebrationQueue<T>(
  current: T[],
  incoming: T[],
  rolledOver: boolean,
): T[] {
  return rolledOver ? [...incoming] : [...current, ...incoming];
}
