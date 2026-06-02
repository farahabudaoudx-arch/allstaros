// Placeholder catalog for the producer training portal. Real video URLs +
// copy get swapped in later; the shape is what the CoursePlatform renders.
// Bootcamp / Accelerator / Uplevel are structured programs; "live" is the
// archive of previous live trainings.

export type Level = "Beginner" | "Intermediate" | "Advanced" | "All levels";
export type CourseStatus = "active" | "completed" | "not_started";
export type Tone = "coral" | "gold" | "green" | "sky" | "violet" | "rose";

export type Lecture = {
  id: string;
  title: string;
  duration: string;
  description: string;
  tone: Tone;
};

export type Course = {
  id: string;
  title: string;
  blurb: string;
  description: string;
  category: string;
  level: Level;
  status: CourseStatus;
  rating: number;
  ratingCount: number;
  tone: Tone;
  instructor: { name: string; title: string };
  durationLabel: string;
  videoUrl?: string;
  lectures: Lecture[];
};

export type ProgramKey = "launchpad" | "bootcamp" | "accelerator" | "uplevel" | "live";

export type Program = {
  key: ProgramKey;
  title: string;
  subtitle: string;
  filters: string[];
  courses: Course[];
};

const TONES: Tone[] = ["coral", "gold", "green", "sky", "violet", "rose"];

function lectures(seed: string, titles: Array<[string, string, string]>): Lecture[] {
  return titles.map(([title, duration, description], i) => ({
    id: `${seed}-l${i + 1}`,
    title,
    duration,
    description,
    tone: TONES[i % TONES.length],
  }));
}

const BOOTCAMP: Course[] = [
  {
    id: "bc-foundations",
    title: "Day 1: Foundations & mindset",
    blurb: "Set up your week, your workspace, and the producer mindset that drives results.",
    description:
      "Your first day in the All Star bootcamp. We cover how the 28-day shell works, how to set up your dialer and lead pipeline, and the daily non-negotiables that separate the producers who graduate from the ones who stall.",
    category: "Onboarding",
    level: "Beginner",
    status: "active",
    rating: 5,
    ratingCount: 412,
    tone: "coral",
    instructor: { name: "Cortney McGregor", title: "Lead Producer Coach" },
    durationLabel: "1.5 hours",
    lectures: lectures("bc-foundations", [
      ["Welcome to bootcamp", "03:29 mins", "Meet your coach and see what the next 28 days look like."],
      ["Setting your numbers", "05:42 mins", "Dials, contacts, and the daily activity that hits your goals."],
      ["Your workspace setup", "07:10 mins", "Dialer, CRM, and lead list configuration end to end."],
      ["The producer mindset", "06:18 mins", "How top producers think about rejection and momentum."],
    ]),
  },
  {
    id: "bc-dialing",
    title: "Dialing with confidence",
    blurb: "Build a calling rhythm, handle the first 10 seconds, and book appointments.",
    description:
      "The phone is the job. This module breaks down the opening, the tonality, and the appointment-setting frame so you can dial all day without burning out or sounding like everyone else.",
    category: "Phone Skills",
    level: "Beginner",
    status: "active",
    rating: 4,
    ratingCount: 289,
    tone: "gold",
    instructor: { name: "Cortney McGregor", title: "Lead Producer Coach" },
    durationLabel: "2 hours",
    lectures: lectures("bc-dialing", [
      ["The first 10 seconds", "04:55 mins", "Earn the right to keep talking on every call."],
      ["Tonality that converts", "06:40 mins", "Pace, pitch, and pauses that hold attention."],
      ["Booking the appointment", "05:20 mins", "A repeatable frame for locking in the next step."],
      ["Working a callback list", "04:12 mins", "Turn maybes into sat appointments."],
    ]),
  },
  {
    id: "bc-presentation",
    title: "The final-expense presentation",
    blurb: "Walk a prospect from need to coverage with a clean, compliant presentation.",
    description:
      "A start-to-finish presentation framework for final expense. You'll learn the discovery questions, how to present coverage options simply, and how to ask for the application without pressure.",
    category: "Presentation",
    level: "Intermediate",
    status: "not_started",
    rating: 5,
    ratingCount: 174,
    tone: "green",
    instructor: { name: "Marcus Hale", title: "Senior Field Trainer" },
    durationLabel: "2.5 hours",
    lectures: lectures("bc-presentation", [
      ["Discovery questions", "06:02 mins", "Uncover the real reason they answered the phone."],
      ["Presenting options", "07:48 mins", "Keep it simple: two or three clear choices."],
      ["Asking for the app", "05:33 mins", "A natural close that feels like the next step."],
      ["Field underwriting basics", "08:15 mins", "Match the prospect to the right carrier the first time."],
    ]),
  },
  {
    id: "bc-objections",
    title: "Handling objections",
    blurb: "Reframe price, spouse, and think-about-it without being pushy.",
    description:
      "Objections are buying signals. This module gives you calm, conversational reframes for the most common stalls so you keep the sale moving while keeping the relationship intact.",
    category: "Objections",
    level: "Intermediate",
    status: "not_started",
    rating: 4,
    ratingCount: 203,
    tone: "sky",
    instructor: { name: "Marcus Hale", title: "Senior Field Trainer" },
    durationLabel: "1.5 hours",
    lectures: lectures("bc-objections", [
      ["\"I need to think about it\"", "05:10 mins", "Surface the real hesitation behind the stall."],
      ["\"It's too expensive\"", "04:48 mins", "Reframe price around what matters to them."],
      ["\"I have to ask my spouse\"", "05:55 mins", "Bring the decision-maker into the room."],
    ]),
  },
];

const ACCELERATOR: Course[] = [
  {
    id: "ac-pipeline",
    title: "Building a predictable pipeline",
    blurb: "Move from reactive dialing to a pipeline that produces every week.",
    description:
      "Once you can sell, the next constraint is consistency. This module shows you how to build a lead and follow-up system that produces predictable AP week over week.",
    category: "Systems",
    level: "Intermediate",
    status: "active",
    rating: 5,
    ratingCount: 142,
    tone: "violet",
    instructor: { name: "Dana Whitfield", title: "Scaling Coach" },
    durationLabel: "2 hours",
    lectures: lectures("ac-pipeline", [
      ["Lead flow math", "06:30 mins", "Know exactly how many leads your goal requires."],
      ["Follow-up cadence", "05:15 mins", "A system so no lead falls through the cracks."],
      ["Weekly review ritual", "04:40 mins", "Read your numbers and adjust before it's too late."],
    ]),
  },
  {
    id: "ac-referrals",
    title: "Referrals & cross-sells",
    blurb: "Turn every issued policy into two more conversations.",
    description:
      "Your existing book is your cheapest lead source. Learn how to ask for referrals at the right moment and position cross-sells that genuinely serve the client.",
    category: "Growth",
    level: "Intermediate",
    status: "not_started",
    rating: 4,
    ratingCount: 98,
    tone: "rose",
    instructor: { name: "Dana Whitfield", title: "Scaling Coach" },
    durationLabel: "1.5 hours",
    lectures: lectures("ac-referrals", [
      ["The referral moment", "04:20 mins", "When and how to ask so it feels natural."],
      ["Cross-sell positioning", "05:35 mins", "Add coverage that actually fits the client."],
      ["The annual review call", "06:05 mins", "Re-open the conversation every year."],
    ]),
  },
  {
    id: "ac-timeblock",
    title: "Time-blocking for producers",
    blurb: "Protect your dial time and stop letting admin eat your day.",
    description:
      "A practical time-blocking system built for commission producers. Defend your selling hours, batch the busywork, and finish the week ahead instead of behind.",
    category: "Systems",
    level: "All levels",
    status: "completed",
    rating: 5,
    ratingCount: 121,
    tone: "gold",
    instructor: { name: "Dana Whitfield", title: "Scaling Coach" },
    durationLabel: "1 hour",
    lectures: lectures("ac-timeblock", [
      ["The producer's calendar", "05:00 mins", "Block selling time first, everything else after."],
      ["Batching admin", "03:45 mins", "Group low-value tasks so they stop interrupting."],
    ]),
  },
];

const UPLEVEL: Course[] = [
  {
    id: "up-recruiting",
    title: "Recruiting your first agents",
    blurb: "Start a team without losing your personal production.",
    description:
      "The first step from producer to builder. Learn how to find, attract, and onboard your first agents while keeping your own pipeline healthy.",
    category: "Leadership",
    level: "Advanced",
    status: "active",
    rating: 5,
    ratingCount: 76,
    tone: "sky",
    instructor: { name: "Nicholas Verge", title: "Founder" },
    durationLabel: "2.5 hours",
    lectures: lectures("up-recruiting", [
      ["Who to recruit", "06:50 mins", "The traits that predict a producing agent."],
      ["The recruiting conversation", "07:20 mins", "Sell the opportunity honestly."],
      ["First-week onboarding", "05:40 mins", "Get a new agent to their first sale fast."],
    ]),
  },
  {
    id: "up-duplication",
    title: "Duplicating yourself",
    blurb: "Build systems so your team produces without you in every call.",
    description:
      "Leadership is duplication. This module covers how to package what you do into systems and trainings your team can run, so growth doesn't depend on your personal hours.",
    category: "Leadership",
    level: "Advanced",
    status: "not_started",
    rating: 5,
    ratingCount: 54,
    tone: "violet",
    instructor: { name: "Nicholas Verge", title: "Founder" },
    durationLabel: "2 hours",
    lectures: lectures("up-duplication", [
      ["Systemizing your process", "06:10 mins", "Turn what you do into a repeatable playbook."],
      ["Running team trainings", "05:55 mins", "Coach the group without burning out."],
      ["Tracking team metrics", "05:30 mins", "Lead the numbers, not just the people."],
    ]),
  },
];

const LIVE: Course[] = [
  {
    id: "live-2026-05-mindset",
    title: "May team call: Q2 push & mindset reset",
    blurb: "Recorded live team call — quarter goals, leaderboard recap, and a mindset reset.",
    description:
      "The full recording of our May all-team live call. We recap the leaderboard, set the Q2 production push, and run a mindset reset segment to finish the quarter strong.",
    category: "Team Call",
    level: "All levels",
    status: "completed",
    rating: 5,
    ratingCount: 318,
    tone: "coral",
    instructor: { name: "Nicholas Verge", title: "Founder" },
    durationLabel: "1 hour",
    lectures: lectures("live-2026-05-mindset", [
      ["Leaderboard recap", "08:30 mins", "Who moved and what they did differently."],
      ["The Q2 push", "12:15 mins", "Targets and the plan to hit them."],
      ["Mindset reset", "10:40 mins", "Reframe the grind for the back half of the quarter."],
    ]),
  },
  {
    id: "live-2026-04-objections",
    title: "April workshop: live objection handling",
    blurb: "Recorded workshop — real recorded calls broken down objection by objection.",
    description:
      "A recorded live workshop where we pull real recorded calls and break down each objection as it happens. Bring a notepad — these are the exact lines that are working on the floor right now.",
    category: "Workshop",
    level: "Intermediate",
    status: "completed",
    rating: 4,
    ratingCount: 207,
    tone: "green",
    instructor: { name: "Marcus Hale", title: "Senior Field Trainer" },
    durationLabel: "1.5 hours",
    lectures: lectures("live-2026-04-objections", [
      ["Call breakdown #1", "11:20 mins", "Price objection on a fixed-income prospect."],
      ["Call breakdown #2", "09:45 mins", "Spouse stall reframed in real time."],
      ["Q&A", "14:10 mins", "Live questions from the floor."],
    ]),
  },
  {
    id: "live-2026-03-faststart",
    title: "March guest: fast-start case study",
    blurb: "Recorded guest session — how a new producer hit $20k AP in month one.",
    description:
      "A recorded guest session with one of our fastest starts. She walks through exactly what her first 30 days looked like, the mistakes she avoided, and the daily routine that got her to a $20k AP month.",
    category: "Case Study",
    level: "Beginner",
    status: "completed",
    rating: 5,
    ratingCount: 264,
    tone: "gold",
    instructor: { name: "Guest: Priya N.", title: "Top New Producer" },
    durationLabel: "50 mins",
    lectures: lectures("live-2026-03-faststart", [
      ["Her first week", "09:10 mins", "Setup, leads, and the first dials."],
      ["The routine", "08:25 mins", "What a $20k-month day actually looks like."],
      ["What she'd skip", "06:50 mins", "The time-wasters she'd avoid doing again."],
    ]),
  },
];

const LAUNCHPAD: Course[] = [
  {
    id: "lp-welcome",
    title: "Welcome to All Star",
    blurb: "What the next few weeks look like and how to get the most out of onboarding.",
    description:
      "Start here. We walk through how onboarding works, what's expected of you, and the milestones you'll hit on the way to getting licensed and contracted. By the end you'll know exactly what to do next.",
    category: "Getting Started",
    level: "Beginner",
    status: "active",
    rating: 5,
    ratingCount: 96,
    tone: "coral",
    instructor: { name: "Cortney McGregor", title: "Lead Producer Coach" },
    durationLabel: "30 mins",
    lectures: lectures("lp-welcome", [
      ["Welcome aboard", "04:10 mins", "Meet your coach and see the road ahead."],
      ["How onboarding works", "05:20 mins", "Your milestones from day one to first sale."],
      ["What we expect from you", "04:35 mins", "The daily habits that get recruits to the finish line."],
    ]),
  },
  {
    id: "lp-licensing",
    title: "Getting your license",
    blurb: "The step-by-step path to passing your state exam and getting licensed.",
    description:
      "A clear walkthrough of the licensing process — how to enroll in the pre-licensing course, how to study efficiently, scheduling your exam, and what to do the day you pass so nothing stalls your start.",
    category: "Licensing",
    level: "Beginner",
    status: "active",
    rating: 5,
    ratingCount: 84,
    tone: "gold",
    instructor: { name: "Cortney McGregor", title: "Lead Producer Coach" },
    durationLabel: "45 mins",
    lectures: lectures("lp-licensing", [
      ["The licensing roadmap", "05:50 mins", "Every step from enrollment to license in hand."],
      ["How to study", "06:15 mins", "Pass the exam the first time without overstudying."],
      ["Scheduling your exam", "04:00 mins", "Book it, prep for the day, and what to bring."],
      ["You passed — now what", "03:40 mins", "The next steps the moment you're licensed."],
    ]),
  },
  {
    id: "lp-contracting",
    title: "Carrier contracting & setup",
    blurb: "Get contracted with carriers and set up the tools you'll use every day.",
    description:
      "Once you're licensed, this module gets you contracted and ready to produce. We cover the contracting paperwork, getting your writing numbers, and setting up your dialer, CRM, and lead access.",
    category: "Setup",
    level: "Beginner",
    status: "not_started",
    rating: 5,
    ratingCount: 61,
    tone: "green",
    instructor: { name: "Marcus Hale", title: "Senior Field Trainer" },
    durationLabel: "40 mins",
    lectures: lectures("lp-contracting", [
      ["Contracting paperwork", "05:25 mins", "Fill it out right the first time so nothing bounces."],
      ["Your writing numbers", "04:15 mins", "What they are and how to find them."],
      ["Tool setup", "06:30 mins", "Dialer, CRM, and lead access end to end."],
    ]),
  },
  {
    id: "lp-firstweek",
    title: "Your first week as a producer",
    blurb: "Hit the ground running with a simple plan for your first five days.",
    description:
      "You're licensed, contracted, and set up — now what? This module gives you a day-by-day plan for your first week so you start dialing with confidence and book your first appointments fast.",
    category: "Getting Started",
    level: "Beginner",
    status: "not_started",
    rating: 5,
    ratingCount: 47,
    tone: "sky",
    instructor: { name: "Cortney McGregor", title: "Lead Producer Coach" },
    durationLabel: "35 mins",
    lectures: lectures("lp-firstweek", [
      ["Day-by-day plan", "06:00 mins", "Exactly what to do each of your first five days."],
      ["Your first dials", "05:10 mins", "Get on the phone and book your first appointment."],
      ["Where to get help", "03:30 mins", "Who to ask and how to use the portal when you're stuck."],
    ]),
  },
];

export const PROGRAMS: Record<ProgramKey, Program> = {
  launchpad: {
    key: "launchpad",
    title: "Launch Pad",
    subtitle: "Everything you need to get licensed, contracted, and producing.",
    filters: ["Getting Started", "Licensing", "Setup"],
    courses: LAUNCHPAD,
  },
  bootcamp: {
    key: "bootcamp",
    title: "Bootcamp",
    subtitle: "Your first 28 days — from setup to your first issued policy.",
    filters: ["Onboarding", "Phone Skills", "Presentation", "Objections"],
    courses: BOOTCAMP,
  },
  accelerator: {
    key: "accelerator",
    title: "Accelerator",
    subtitle: "Build the systems that turn skill into consistent production.",
    filters: ["Systems", "Growth"],
    courses: ACCELERATOR,
  },
  uplevel: {
    key: "uplevel",
    title: "Uplevel",
    subtitle: "Producer to builder — recruit, duplicate, and lead a team.",
    filters: ["Leadership"],
    courses: UPLEVEL,
  },
  live: {
    key: "live",
    title: "Previous Live Trainings",
    subtitle: "Recordings of past team calls, workshops, and guest sessions.",
    filters: ["Team Call", "Workshop", "Case Study"],
    courses: LIVE,
  },
};

export function getProgram(key: ProgramKey): Program {
  return PROGRAMS[key];
}
