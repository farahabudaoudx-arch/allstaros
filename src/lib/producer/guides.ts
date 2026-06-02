// Placeholder content for the Guides section — a lightweight blog/CMS-style
// catalog. Swap `body` for real CMS-sourced content later; the shape is what
// the guides index + article view render.

export type Guide = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  author: string;
  date: string;
  readMinutes: number;
  tone: "coral" | "gold" | "green" | "sky" | "violet" | "rose";
  body: string[];
};

export const GUIDES: Guide[] = [
  {
    slug: "first-week-checklist",
    title: "Your first week: a producer checklist",
    excerpt:
      "Everything to set up and do in your first five days so you start dialing on day one instead of day ten.",
    category: "Getting Started",
    author: "Cortney McGregor",
    date: "2026-05-28",
    readMinutes: 6,
    tone: "coral",
    body: [
      "Your first week sets the tone for everything that follows. The goal is simple: be on the phone with prospects as fast as possible.",
      "Start by getting your tools in order — dialer, CRM, and your first lead list. Don't over-optimize the setup; a working system beats a perfect one.",
      "Then block your selling hours and protect them. Everything else — paperwork, training, admin — happens around the dials, never instead of them.",
    ],
  },
  {
    slug: "reading-your-numbers",
    title: "How to read your activity numbers",
    excerpt:
      "Dials, contacts, appointments, presentations, sales — what each number tells you and which one to fix first.",
    category: "Analytics",
    author: "Dana Whitfield",
    date: "2026-05-21",
    readMinutes: 8,
    tone: "gold",
    body: [
      "Your funnel tells you exactly where you're losing deals. The trick is knowing which number to read first.",
      "Start at the bottom: if sales are low but presentations are healthy, it's a closing problem. If presentations are low but contacts are high, it's an appointment-setting problem.",
      "Fix one stage at a time. Chasing every metric at once is how producers spin without improving.",
    ],
  },
  {
    slug: "compliant-final-expense-presentation",
    title: "Staying compliant in a final-expense presentation",
    excerpt:
      "The disclosures, replacement rules, and documentation habits that keep you and your clients protected.",
    category: "Compliance",
    author: "Marcus Hale",
    date: "2026-05-14",
    readMinutes: 7,
    tone: "green",
    body: [
      "Compliance isn't paperwork for its own sake — it protects the client and your license. Build the habits early.",
      "Always make required disclosures, handle replacements correctly, and document what you presented and why.",
      "When in doubt, slow down and write it down. A clean file is the best defense you'll ever have.",
    ],
  },
  {
    slug: "building-a-callback-system",
    title: "Building a callback system that converts",
    excerpt:
      "Most sales live in the follow-up. Here's a simple cadence so no lead ever goes cold on you.",
    category: "Systems",
    author: "Dana Whitfield",
    date: "2026-05-07",
    readMinutes: 5,
    tone: "sky",
    body: [
      "The fortune is in the follow-up, but only if your follow-up is systematic instead of whenever-you-remember.",
      "Set a fixed cadence — same day, day three, day seven — and let the system tell you who to call instead of your memory.",
      "Treat callbacks as appointments with yourself. They're some of the highest-converting dials you'll make.",
    ],
  },
  {
    slug: "mindset-for-the-grind",
    title: "Mindset for the grind",
    excerpt:
      "Rejection is the job, not a verdict. A few reframes to keep your energy high through a full week of dials.",
    category: "Mindset",
    author: "Nicholas Verge",
    date: "2026-04-30",
    readMinutes: 4,
    tone: "violet",
    body: [
      "Every no is data, not a verdict on you. The producers who last are the ones who stop taking the phone personally.",
      "Protect your energy like a resource. Short resets between blocks beat grinding yourself flat by noon.",
      "Measure effort, not just outcomes. On the days the sales don't come, the dials still count.",
    ],
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
