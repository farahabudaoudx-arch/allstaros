// Public route — no auth required.
// Renders the full UX audit letter with embedded screenshots.
export const dynamic = "force-static";

export const metadata = {
  title: "UX Audit Report — All Star OS",
  description: "A comprehensive UX audit of the All Star OS platform.",
};

export default function UXAuditPage() {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap');

.ux-root {
  --bg: #050505;
  --card: #0d0d0d;
  --card-hi: #141414;
  --ink: #f5f5f5;
  --subtle: #8a8a8a;
  --mute: #5a5a5a;
  --hairline: #1f1f1f;
  --accent: #f6c945;
  --accent-soft: #c9a235;
  --pos: #34d399;
  --warn: #f97316;
  --neg: #ef4444;
  background: var(--bg);
  color: var(--ink);
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}
.ux-root * { margin: 0; padding: 0; box-sizing: border-box; }
.ux-page { max-width: 880px; margin: 0 auto; padding: 60px 32px 120px; }
.ux-header { text-align: center; margin-bottom: 64px; padding-bottom: 40px; border-bottom: 1px solid var(--hairline); }
.ux-header .logo { font-family: 'JetBrains Mono', monospace; font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: var(--accent); margin-bottom: 16px; }
.ux-header h1 { font-size: 42px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; margin-bottom: 12px; }
.ux-header h1 em { color: var(--accent); font-style: italic; }
.ux-header .meta { color: var(--subtle); font-size: 14px; }
.ux-header .meta span { color: var(--mute); margin: 0 8px; }
.ux-greeting { font-size: 17px; color: var(--subtle); margin-bottom: 48px; line-height: 1.7; }
.ux-greeting strong { color: var(--ink); }
.ux-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 64px; }
.ux-stat { background: var(--card); border: 1px solid var(--hairline); border-radius: 16px; padding: 20px; text-align: center; }
.ux-stat .num { font-size: 36px; font-weight: 700; letter-spacing: -0.03em; line-height: 1; }
.ux-stat .label { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--mute); margin-top: 8px; }
.ux-stat.p0 .num { color: var(--neg); }
.ux-stat.p1 .num { color: var(--warn); }
.ux-stat.p2 .num { color: var(--accent); }
.ux-stat.qw .num { color: var(--pos); }
.ux-section { margin-bottom: 56px; }
.ux-section-title { font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.18em; color: var(--accent); margin-bottom: 8px; }
.ux-section h2 { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 16px; }
.ux-section p { color: var(--subtle); font-size: 15px; line-height: 1.7; margin-bottom: 16px; }
.ux-section p strong { color: var(--ink); }
.ux-screenshot { border-radius: 12px; border: 1px solid var(--hairline); overflow: hidden; margin: 24px 0; background: var(--card); }
.ux-screenshot img { width: 100%; display: block; }
.ux-screenshot .caption { padding: 14px 18px; font-size: 13px; color: var(--subtle); border-top: 1px solid var(--hairline); background: var(--card-hi); }
.ux-screenshot .caption strong { color: var(--accent); font-family: 'JetBrains Mono', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; }
.ux-finding { background: var(--card); border: 1px solid var(--hairline); border-radius: 16px; padding: 24px; margin: 20px 0; }
.ux-finding .tag { display: inline-block; font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; padding: 4px 10px; border-radius: 999px; margin-bottom: 12px; font-weight: 600; }
.ux-finding .tag.p0 { background: rgba(239,68,68,0.1); color: var(--neg); border: 1px solid rgba(239,68,68,0.3); }
.ux-finding .tag.p1 { background: rgba(249,115,22,0.1); color: var(--warn); border: 1px solid rgba(249,115,22,0.3); }
.ux-finding .tag.p2 { background: rgba(246,201,69,0.1); color: var(--accent); border: 1px solid rgba(246,201,69,0.3); }
.ux-finding h3 { font-size: 18px; font-weight: 600; margin-bottom: 8px; letter-spacing: -0.01em; }
.ux-finding .route { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--mute); margin-bottom: 12px; }
.ux-finding p { font-size: 14px; color: var(--subtle); line-height: 1.65; margin-bottom: 8px; }
.ux-finding .fix { margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--hairline); font-size: 13px; color: var(--pos); }
.ux-finding .fix::before { content: "\\2192 Fix: "; font-weight: 600; }
.ux-callout { background: rgba(246,201,69,0.06); border: 1px solid rgba(246,201,69,0.2); border-radius: 16px; padding: 24px; margin: 32px 0; }
.ux-callout .label { font-family: 'JetBrains Mono', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.16em; color: var(--accent); margin-bottom: 8px; }
.ux-callout p { color: var(--ink); font-size: 15px; line-height: 1.7; }
.ux-ww { display: flex; align-items: flex-start; gap: 12px; margin: 12px 0; padding: 14px 0; border-bottom: 1px solid var(--hairline); }
.ux-ww:last-child { border-bottom: none; }
.ux-ww .check { color: var(--pos); font-weight: 700; flex-shrink: 0; margin-top: 2px; }
.ux-ww p { font-size: 14px; color: var(--subtle); margin: 0; }
.ux-ww p strong { color: var(--ink); }
.ux-qw { list-style: none; counter-reset: qw; }
.ux-qw li { counter-increment: qw; padding: 10px 0; padding-left: 36px; position: relative; font-size: 14px; color: var(--subtle); border-bottom: 1px solid var(--hairline); }
.ux-qw li::before { content: counter(qw); position: absolute; left: 0; top: 8px; width: 24px; height: 24px; background: rgba(52,211,153,0.1); border: 1px solid rgba(52,211,153,0.3); border-radius: 50%; color: var(--pos); font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; }
.ux-qw li strong { color: var(--ink); }
.ux-qw li .time { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--pos); float: right; }
.ux-signature { margin-top: 80px; padding-top: 40px; border-top: 1px solid var(--hairline); color: var(--subtle); font-size: 14px; line-height: 1.8; }
.ux-signature .name { color: var(--accent); font-style: italic; font-weight: 600; font-size: 16px; }
@media (max-width: 640px) {
  .ux-page { padding: 32px 16px 80px; }
  .ux-header h1 { font-size: 30px; }
  .ux-stats { grid-template-columns: repeat(2, 1fr); }
  .ux-section h2 { font-size: 22px; }
}
          `,
        }}
      />
      <div className="ux-root">
        <div className="ux-page">
          <div className="ux-header">
            <div className="logo">UX Audit · All Star OS</div>
            <h1>What I Found <em>Inside Your App</em></h1>
            <div className="meta">
              July 25, 2026 <span>·</span> Source code review <span>·</span> 89 findings
            </div>
          </div>

          <div className="ux-greeting">
            <p>Nicholas,</p>
            <p>I did a full UX audit of All Star OS — read through <strong>every route, every component, every layout file</strong> in the codebase. I was trained on three UX books (Norman's <em>Design of Everyday Things</em>, Krug's <em>Don't Make Me Think</em>, Marsh's <em>UX for Beginners</em>) before starting.</p>
            <p>Here's what I found, with screenshots from the live dev server.</p>
          </div>

          <div className="ux-stats">
            <div className="ux-stat p0"><div className="num">11</div><div className="label">Blocking (P0)</div></div>
            <div className="ux-stat p1"><div className="num">32</div><div className="label">High Friction (P1)</div></div>
            <div className="ux-stat p2"><div className="num">46</div><div className="label">Polish (P2)</div></div>
            <div className="ux-stat qw"><div className="num">20</div><div className="label">Quick Wins</div></div>
          </div>

          {/* LANDING PAGE */}
          <div className="ux-section">
            <div className="ux-section-title">First Impression</div>
            <h2>The landing page looks great — but the video has no escape</h2>
            <p>The hero video background is cinematic and the gold "All Star" headline pops. The Sign In button is clear. This is a strong first impression. But there are two problems: the video <strong>ignores <code>prefers-reduced-motion</code></strong> (a user with vestibular sensitivity can't turn it off), and there's <strong>no poster image</strong> — if the video is slow to load, the hero is a black blob.</p>
            <div className="ux-screenshot">
              <img src="/ux-screenshots/ux-screenshot-bf7637a82f304cd9b771722d72510cbb.png" alt="Landing page with hero video" />
              <div className="caption"><strong>Landing page</strong> — Hero video, gold headline, single Sign In CTA. No value prop beyond the headline.</div>
            </div>
            <div className="ux-finding">
              <span className="tag p0">P0-9</span>
              <h3>Light mode is disabled on the landing page</h3>
              <div className="route">src/components/ThemeToggle.tsx · line 9</div>
              <p>The <code>themeInitScript</code> explicitly forces dark mode on <code>/</code>, <code>/join/*</code>, and <code>/auth/*</code> — even if the user saved light mode in the producer app. A producer who prefers light mode signs out, visits the landing page, and gets a dark theme flash. Their preference is ignored on the very first page they see.</p>
              <div className="fix">Remove the <code>landing</code> exclusion from <code>themeInitScript</code>. 5-minute fix.</div>
            </div>
          </div>

          {/* DASHBOARD */}
          <div className="ux-section">
            <div className="ux-section-title">The Dashboard</div>
            <h2>Five sections, no primary action, and white cards that don't match</h2>
            <p>The producer dashboard is the first thing agents see every morning. It has five sections: a greeting, daily projections + actuals, the AP goal, this week's trainings, and an activity chart. But there's <strong>no single primary action</strong> — the agent doesn't know where to look first. And the TodaySnapshot cards use <strong>white backgrounds</strong> (<code>bg-white text-black</code>) that clash with the app's dark theme. Every other card in the app uses dark surfaces.</p>
            <div className="ux-screenshot">
              <img src="/ux-screenshots/ux-screenshot-d2665e948fc04b3d8ce57ca94bc1c7ec.png" alt="Producer dashboard with white cards" />
              <div className="caption"><strong>Producer Dashboard</strong> — The two white TodaySnapshot cards break the dark theme. No clear primary action. The sidebar active state is barely visible.</div>
            </div>
            <div className="ux-finding">
              <span className="tag p1">P1-2</span>
              <h3>No clear primary action on the dashboard</h3>
              <div className="route">src/app/producer/page.tsx</div>
              <p>A new producer logging in sees 5 sections of data with no guidance on what to do next. The "Open Tracker" button is buried in the second section. There's no "Today's focus" card that says "Log your dials" or "3 recruits need attention."</p>
              <div className="fix">Add a "Today's focus" hero card at the top — gold background, single CTA — that surfaces the most important next action.</div>
            </div>
            <div className="ux-finding">
              <span className="tag p1">P1-3</span>
              <h3>White cards break the dark theme</h3>
              <div className="route">src/components/producer/TodaySnapshot.tsx · lines 177-189</div>
              <p>The Card component uses <code>bg-white p-6 text-black</code> — white background, black text. Every other component uses <code>bg-card</code> (#0d0d0d). The TodaySnapshot looks like it belongs to a different app.</p>
              <div className="fix">Replace with the standard <code>border border-hairline bg-card</code> pattern. Use the existing Card component from ui.tsx.</div>
            </div>
            <div className="ux-finding">
              <span className="tag p2">P2-10</span>
              <h3>Sidebar active state is almost invisible</h3>
              <div className="route">src/components/Sidebar.tsx · lines 135, 181</div>
              <p>The active nav item uses <code>bg-card-hi</code> (#141414) — only slightly lighter than the background (#050505). Krug says "make the active state twice as prominent as you think." On a dark background, this is nearly invisible.</p>
              <div className="fix">Use <code>bg-accent/10 ring-1 ring-accent/30</code> — a gold tint makes it immediately clear which section the user is in. 5-minute fix.</div>
            </div>
          </div>

          {/* SIDEBAR */}
          <div className="ux-section">
            <div className="ux-section-title">Navigation</div>
            <h2>17 nav items is too many</h2>
            <p>The producer sidebar has 17 leaf items across 4 collapsible groups (Tracking, My Team, Training, plus top-level items). Marsh's research on the paradox of choice suggests 5-7 items is ideal. A new producer seeing this for the first time is overwhelmed.</p>
            <div className="ux-screenshot">
              <img src="/ux-screenshots/ux-screenshot-013f382f73ce46b488852329f908286b.png" alt="Sidebar with groups expanded" />
              <div className="caption"><strong>Sidebar with groups expanded</strong> — Tracking (5 items), My Team (5 items), Training (5 items, 3 locked). That's 17 leaf items for a builder.</div>
            </div>
            <div className="ux-finding">
              <span className="tag p1">P1-1</span>
              <h3>17 leaf items — cognitive overload</h3>
              <div className="route">src/app/producer/layout.tsx · buildNav()</div>
              <p>The Tracking group alone has 5 items. My Team has 5 more. Training has 5 (3 locked). Plus Dashboard, Leaderboard, Resources, Messages, Settings = 17 total for builders.</p>
              <div className="fix">Merge "Daily Tracker" and "Analytics" under "Performance." Move "Lead Spend" and "Issued Premium" under "Clients." Hide locked training items entirely until eligible.</div>
            </div>
            <div className="ux-finding">
              <span className="tag p0">P0-2</span>
              <h3>No breadcrumbs anywhere — deep pages fail the Trunk Test</h3>
              <div className="route">All /producer/clients/[id], /producer/recruiting/recruit/[id], /producer/downline/[id] routes</div>
              <p>If a producer bookmarks <code>/producer/recruiting/recruit/abc123</code>, when they return they see the recruit's name but no indication of what section they're in or how to get back. The sidebar highlights "Recruiting Pipeline" but the page itself gives no breadcrumb context. This fails Krug's Trunk Test.</p>
              <div className="fix">Create a Breadcrumbs component at src/components/Breadcrumbs.tsx. Use it in the producer layout for any route deeper than 2 levels.</div>
            </div>
            <div className="ux-finding">
              <span className="tag p1">P1-17</span>
              <h3>Two "Messages" nav items are confusing</h3>
              <div className="route">src/app/producer/layout.tsx · lines 38, 46</div>
              <p>"Team Messages" (from your downline) and "Messages" (to your upline) — a builder seeing both doesn't know which is which from the labels alone.</p>
              <div className="fix">Rename to "Upline Chat" and "Downline Messages." 5-minute fix.</div>
            </div>
          </div>

          {/* CLIENT FORM */}
          <div className="ux-section">
            <div className="ux-section-title">The Biggest Form</div>
            <h2>The ClientForm is 817 lines with no safety net</h2>
            <p>The ClientForm is the most critical form in the app — it's how producers record every policy sale. It's <strong>817 lines of form fields</strong> on a single page: client info, medical notes, policy details, carrier picker, beneficiaries, private notes, and commission estimate. There are 7 sections stacked vertically with <strong>no progress indicator, no step structure, no auto-save, and no unsaved-changes warning</strong>.</p>
            <p>Insurance agents get phone calls mid-form. If they navigate away, all work is lost. The form uses <code>alert()</code> for errors and <code>confirm()</code> for deletions — both are blocking native browser dialogs that break the dark theme.</p>
            <div className="ux-finding">
              <span className="tag p0">P0-1</span>
              <h3>Single 817-line form with no progress, no auto-save, no validation</h3>
              <div className="route">src/components/producer/clients/ClientForm.tsx</div>
              <p>No progress indicator. No step counter. No auto-save. No <code>beforeunload</code> warning. The <code>savedFlash</code> state exists but is never used for auto-save. Required fields (client_name, dob) have red asterisks but no inline validation — errors only surface on save via <code>alert()</code>.</p>
              <div className="fix">Break into a 4-step wizard: (1) Client Info, (2) Medical, (3) Policy, (4) Beneficiaries. Add a progress bar. Add debounced auto-save on field blur. Add <code>beforeunload</code> when dirty. This is the single biggest UX improvement you can make.</div>
            </div>
            <div className="ux-finding">
              <span className="tag p0">P0-5</span>
              <h3>Errors use alert() — blocking, ugly, no context</h3>
              <div className="route">ClientForm.tsx · lines 129, 134, 148</div>
              <p>Save errors: <code>alert("Save failed: ...")</code>. Delete errors: <code>alert("Delete failed: ...")</code>. Native <code>alert()</code> blocks the main thread, renders with browser default styling (breaking the dark theme), and gives no way to copy the error.</p>
              <div className="fix">Replace with inline error banners using the existing <code>border-neg/40 bg-neg/[0.06] text-neg</code> pattern.</div>
            </div>
            <div className="ux-finding">
              <span className="tag p1">P1-26</span>
              <h3>"Private notes" stores SSNs and banking info with no security warning</h3>
              <div className="route">src/lib/clients/types.ts · lines 118-120</div>
              <p>The field description says "for anything sensitive (e.g. SSN, banking)." But it's a plain textarea with no encryption, no masking, no warning about the security implications of typing SSNs into a web form.</p>
              <div className="fix">Add a warning: "Avoid entering full SSNs or bank account numbers — use last 4 digits only." Or implement field-level encryption.</div>
            </div>
          </div>

          {/* RECRUITING */}
          <div className="ux-section">
            <div className="ux-section-title">Recruiting Pipeline</div>
            <h2>The funnel visualization is creative but potentially misleading</h2>
            <p>The recruiting pipeline has a "Visual" view that renders each stage as a band that gets progressively narrower — creating a funnel shape. But the narrowing is purely cosmetic. A stage with 20 people and a stage with 1 person both render at the same width. The count is shown inside, but the visual width could mislead.</p>
            <div className="ux-screenshot">
              <img src="/ux-screenshots/ux-screenshot-3058cc03430f4d0c9139b76f494a005c.png" alt="Recruiting pipeline funnel" />
              <div className="caption"><strong>Recruiting Pipeline</strong> — The funnel bands narrow cosmetically, not proportionally. The "Add someone" toggle and Visual/Spreadsheet toggle are visible.</div>
            </div>
          </div>

          {/* PORTAL */}
          <div className="ux-section">
            <div className="ux-section-title">Recruit Portal</div>
            <h2>The onboarding flow is strong — but it dead-ends at graduation</h2>
            <p>The portal has a 5-step licensing timeline with progressive disclosure: locked steps are blurred, the active step is clear, and completing a step triggers an unlock animation. This is the best part of the app. But after 28 days of bootcamp, the graduated view just says "Road-to-40k tools land in V2." <strong>No CTA, no "what to do now," no link to messages.</strong> A recruit who fought through 28 days lands on a "coming soon" stub.</p>
            <div className="ux-screenshot">
              <img src="/ux-screenshots/ux-screenshot-3b727ac74208402dbfcec79d7a6f48f7.png" alt="Portal licensing timeline" />
              <div className="caption"><strong>Recruit Portal</strong> — The 5-step licensing timeline with locked nav items (Training, Check-in, Sidekick greyed out). Video player on Step 1.</div>
            </div>
            <div className="ux-finding">
              <span className="tag p0">P0-7</span>
              <h3>Exam-fail modal uses a rickroll video</h3>
              <div className="route">src/app/portal/_components/exam-fail-modal.tsx · line 8</div>
              <p>The modal shown to recruits who <strong>just failed their licensing exam</strong> uses <code>dQw4w9WgXcQ</code> as the YouTube video ID — Rick Astley's "Never Gonna Give You Up." If this is live in production, a recruit who failed their exam gets rickrolled. <strong>Ship-blocker.</strong></p>
              <div className="fix">Replace with the actual encouragement video. If none exists, remove the video entirely. 5-minute fix.</div>
            </div>
            <div className="ux-finding">
              <span className="tag p1">P1-19</span>
              <h3>Graduated view is a "V2 coming" dead end</h3>
              <div className="route">src/app/portal/_components/graduated-view.tsx · line 22</div>
              <p>After 28 days of effort, the recruit sees "Road-to-40k tools land in V2." No CTA, no link to messages, no link to the Sidekick, no link to the producer app. The biggest motivational letdown in the onboarding flow.</p>
              <div className="fix">Add CTAs: "Message your builder to celebrate," "Explore the All Star Sidekick," and if promoted, "Open your Producer Dashboard." Add a celebration animation.</div>
            </div>
          </div>

          {/* SETTINGS */}
          <div className="ux-section">
            <div className="ux-section-title">Settings</div>
            <h2>The settings hub is clean — but the forms have gaps</h2>
            <p>The SettingsHub uses a grid of cards that expand into individual sections via URL state. Each section has an icon, title, and description. This is a good pattern. But the forms inside have issues: missing <code>autoComplete</code> attributes (autofill broken), "Saved." toasts that never auto-clear, and no <code>aria-live</code> for screen readers.</p>
            <div className="ux-screenshot">
              <img src="/ux-screenshots/ux-screenshot-63b44f4f4d474fadb0a149ed60a0aba9.png" alt="Settings hub" />
              <div className="caption"><strong>Settings Hub</strong> — Grid of 6 settings cards (Policy Info, Account, NPN, Builder, Discord, Goal). Clean layout, good descriptions.</div>
            </div>
          </div>

          {/* RESOURCES */}
          <div className="ux-section">
            <div className="ux-section-title">Resources</div>
            <h2>Good organization, but external links need better marking</h2>
            <div className="ux-screenshot">
              <img src="/ux-screenshots/ux-screenshot-821947d200eb4054af08238024b73f5f.png" alt="Resources page" />
              <div className="caption"><strong>Resources Hub</strong> — Two sections (AI Tools, Useful Links) with cards. External links show ↗ on hover only — invisible on touch devices.</div>
            </div>
          </div>

          {/* ACCESSIBILITY */}
          <div className="ux-section">
            <div className="ux-section-title">Accessibility</div>
            <h2>The biggest gaps are in the auth flow</h2>
            <div className="ux-finding">
              <span className="tag p0">P0-4</span>
              <h3>No "Skip to main content" link</h3>
              <div className="route">src/app/layout.tsx</div>
              <p>A keyboard-only user must tab through all 17+ sidebar items before reaching the page content. On every page load. There is no skip link anywhere in the codebase.</p>
              <div className="fix">Add a visually-hidden skip link as the first child of <code>&lt;body&gt;</code>. 10-minute fix.</div>
            </div>
            <div className="ux-finding">
              <span className="tag p0">P0-10</span>
              <h3>Auth form labels not associated with inputs</h3>
              <div className="route">src/app/auth/signin/signin-button.tsx · lines 23-25, 35-37</div>
              <p>The <code>&lt;label&gt;</code> and <code>&lt;Input&gt;</code> are siblings but not associated — no <code>htmlFor</code> on the label, no <code>id</code> on the input. A screen-reader user on the sign-in page hears "edit text, edit text" with no indication of which field is email and which is password. This is the most security-critical form in the app.</p>
              <div className="fix">Add <code>id="email"</code> / <code>htmlFor="email"</code> and <code>id="password"</code> / <code>htmlFor="password"</code>. 15-minute fix across all 3 auth forms.</div>
            </div>
            <div className="ux-finding">
              <span className="tag p0">P0-11</span>
              <h3>Broken error handoff — users land on signin with no explanation</h3>
              <div className="route">src/app/auth/confirm/actions.ts · line 82; src/app/auth/callback/route.ts · line 28</div>
              <p>When OTP verification fails or OAuth fails, the user is redirected to <code>/auth/signin?error=invite</code> or <code>?error=oauth</code>. But the signin page <strong>never reads <code>searchParams.error</code></strong>. The user lands on a bare sign-in form with no explanation that their email link expired or their OAuth login failed.</p>
              <div className="fix">In <code>signin-button.tsx</code>, read <code>useSearchParams().get("error")</code> and render appropriate messages. 15-minute fix.</div>
            </div>
          </div>

          {/* WHAT'S WORKING WELL */}
          <div className="ux-section">
            <div className="ux-section-title">What's Working Well</div>
            <h2>Things you're doing right</h2>
            <p>Not everything is broken. Here are the patterns that are already good and should be replicated:</p>
            <div className="ux-ww"><span className="check">✓</span><p><strong>Global press feedback</strong> — Every button in the app scales to 0.96 on <code>:active</code>. Tactile, responsive, with <code>prefers-reduced-motion</code> support.</p></div>
            <div className="ux-ww"><span className="check">✓</span><p><strong>DialTracker auto-save</strong> — 600ms debounce, 4-state SaveBadge, flushes pending saves on unmount. The best auto-save pattern in the app.</p></div>
            <div className="ux-ww"><span className="check">✓</span><p><strong>Mobile drawer pattern</strong> — Kept mounted for bidirectional CSS transitions, locks body scroll, closes on route change, uses <code>inert</code> attribute.</p></div>
            <div className="ux-ww"><span className="check">✓</span><p><strong>BugReportModal accessibility</strong> — Portals to <code>&lt;body&gt;</code>, locks scroll + Escape, proper <code>role="dialog"</code> + <code>aria-modal</code>. Should be the template for all modals.</p></div>
            <div className="ux-ww"><span className="check">✓</span><p><strong>JoinWizard multi-step pattern</strong> — One field per card, per-step validation, progress dots, autoFocus, back button. Should be the template for the ClientForm redesign.</p></div>
            <div className="ux-ww"><span className="check">✓</span><p><strong>Portal licensing timeline</strong> — 5-step timeline with complete/active/locked states, blurred locked steps with <code>aria-hidden</code> + <code>inert</code>.</p></div>
            <div className="ux-ww"><span className="check">✓</span><p><strong>UX rationale in code comments</strong> — Multiple files explain the <em>why</em> behind design decisions in comments. Exemplary for maintainability.</p></div>
            <div className="ux-ww"><span className="check">✓</span><p><strong>Visibility-change refresh</strong> — Dashboard components refresh data when the user returns to the tab.</p></div>
          </div>

          {/* QUICK WINS */}
          <div className="ux-section">
            <div className="ux-section-title">Quick Wins</div>
            <h2>20 fixes you can ship in under an hour each</h2>
            <ul className="ux-qw">
              <li><strong>Add "Skip to main content" link</strong> in layout.tsx <span className="time">10 min</span></li>
              <li><strong>Replace the rickroll video</strong> in exam-fail-modal.tsx <span className="time">5 min</span></li>
              <li><strong>Remove landing-page theme exclusion</strong> from themeInitScript <span className="time">5 min</span></li>
              <li><strong>Add htmlFor/id to auth form labels</strong> in signin, reset, reset/confirm <span className="time">15 min</span></li>
              <li><strong>Read ?error= from searchParams</strong> in signin-button.tsx <span className="time">15 min</span></li>
              <li><strong>Rename "Messages" to "Upline Chat"</strong> and "Team Messages" to "Downline Messages" <span className="time">5 min</span></li>
              <li><strong>Make sidebar active state gold</strong> — bg-accent/10 ring-accent/30 <span className="time">5 min</span></li>
              <li><strong>Make external link ↗ icon always visible</strong> on resources page <span className="time">5 min</span></li>
              <li><strong>Disable pending carrier links</strong> on portal-links page <span className="time">10 min</span></li>
              <li><strong>Preserve query params</strong> in middleware redirect <span className="time">10 min</span></li>
              <li><strong>Add id attributes to guide page headings</strong> for anchor links <span className="time">10 min</span></li>
              <li><strong>Add prefers-reduced-motion check</strong> to HeroVideo <span className="time">15 min</span></li>
              <li><strong>Replace alert() with inline error banner</strong> in ClientForm <span className="time">30 min</span></li>
              <li><strong>Add auto-refresh polling</strong> to onboarding pending page <span className="time">30 min</span></li>
              <li><strong>Remove misleading NewTabIcon</strong> from "Open Tracker" button <span className="time">2 min</span></li>
              <li><strong>Increase mobile menu button to 44px</strong> (h-11 w-11) <span className="time">5 min</span></li>
              <li><strong>Add Escape key handler</strong> to mobile drawer <span className="time">10 min</span></li>
              <li><strong>Add aria-label to AddPerson toggle</strong> <span className="time">5 min</span></li>
              <li><strong>Add "View:" label before recruiting toggle</strong> <span className="time">5 min</span></li>
              <li><strong>Increase flagged category label to text-xs</strong> <span className="time">2 min</span></li>
            </ul>
          </div>

          {/* STRATEGIC */}
          <div className="ux-callout">
            <div className="label">Strategic Recommendations</div>
            <p><strong>1. Break the ClientForm into a multi-step wizard with auto-save.</strong> This single change addresses 6 findings. Use the JoinWizard as the template.</p>
            <p style={{marginTop:'12px'}}><strong>2. Create a Breadcrumbs component and deploy it everywhere.</strong> One component fixes the Trunk Test failure across 15+ deep routes.</p>
            <p style={{marginTop:'12px'}}><strong>3. Unify the two design systems.</strong> The <code>.ll-analytics</code> CSS scope creates a parallel design system. Migrate to shared <code>ui.tsx</code> components.</p>
            <p style={{marginTop:'12px'}}><strong>4. Add a global search (Cmd+K).</strong> Producers manage clients, recruits, and messages across 15+ pages. Global search would dramatically reduce navigation friction.</p>
            <p style={{marginTop:'12px'}}><strong>5. Implement undo for destructive actions.</strong> Replace all <code>confirm()</code> dialogs with a modal + 5-second undo toast. Gmail-style.</p>
          </div>

          {/* SIGNATURE */}
          <div className="ux-signature">
            <p>The full 89-finding report with specific file paths, line numbers, and code patterns is available on request.</p>
            <p style={{marginTop:'24px'}}>Let me know which findings you want to tackle first — I can start fixing them immediately.</p>
            <p style={{marginTop:'32px'}} className="name">— Hermes</p>
          </div>
        </div>
      </div>
    </>
  );
}
