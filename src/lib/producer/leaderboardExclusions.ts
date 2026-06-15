// People who should never appear on any leaderboard or team-performance board.
//
// Their accounts stay fully alive (they can sign in, produce, recruit, etc.) —
// they're just filtered out of the ranked boards so internal/test/owner rows
// don't distort the real team standings. Keyed by stable person.id so it
// survives email and name changes.
//
// To stop hiding someone, delete their line here. To hide someone new, add
// their person.id with a comment.
export const LEADERBOARD_EXCLUDED_IDS: ReadonlySet<string> = new Set([
  "11d8e4ac-747c-47ea-8fb8-84c3d6f07360", // Dev Admin <admin@allstar.test>
  "4c841534-0a41-4c18-9a6d-48cf28c3c7aa", // Dev Builder <builder@allstar.test>
  "c89bcec6-849b-4c0d-9de8-5776230d792b", // Dev Producer <producer@allstar.test>
  "9fdfcccb-6293-44d2-a58a-5a4ba950e0af", // Dev Recruit <recruit@allstar.test>
  "dc3b7350-7d2c-4179-a47e-1fc8f412251c", // test <test@test.com>
  "8662faf0-64b5-417d-9106-1f1aeb3fa64d", // Nicholas Verge (owner) <nicholasverge@gmail.com>
  "ba1a1791-68c2-4271-ba78-0a4ab3e5d7b4", // Nicholas Verge (producer) <nicholasdalton123@yahoo.com>
  "c97e4cb4-eaad-429a-ad6e-dcf4468c8460", // Nick Swipe <nickswipe99@gmail.com>
]);

export const isLeaderboardExcluded = (personId: string): boolean =>
  LEADERBOARD_EXCLUDED_IDS.has(personId);
