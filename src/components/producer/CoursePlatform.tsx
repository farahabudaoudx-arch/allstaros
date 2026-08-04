"use client";

import { useMemo, useState } from "react";
import type { Course, Program, Tone } from "@/lib/producer/trainings";
import { PageHeader } from "@/components/producer/PageHeader";

const TONE_BG: Record<Tone, string> = {
  coral: "bg-[#d9744f]",
  gold: "bg-[#e3b53e]",
  green: "bg-[#6f9e6f]",
  sky: "bg-[#6f93b8]",
  violet: "bg-[#8a7fb0]",
  rose: "bg-[#c97b8e]",
};

// Default status tabs, used when a Program doesn't define its own sections.
const STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
];

function Monogram({ tone, label, className }: { tone: Tone; label: string; className?: string }) {
  return (
    <div
      className={`flex items-center justify-center ${TONE_BG[tone]} text-white ${className ?? ""}`}
    >
      <span className="text-lg font-semibold tracking-tight opacity-90">
        {label.trim()[0]?.toUpperCase()}
      </span>
    </div>
  );
}

function Player({ course }: { course: Course }) {
  // A real embed (Bunny Stream) when we have one; otherwise the faux player.
  if (course.embedUrl) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
        <iframe
          key={course.id}
          src={`${course.embedUrl}?autoplay=false&preload=true`}
          title={course.title}
          loading="lazy"
          allow="accelerometer; gyroscope; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
          style={{ border: 0 }}
        />
      </div>
    );
  }
  return <PlayerPlaceholder course={course} />;
}

function PlayerPlaceholder({ course }: { course: Course }) {
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-hairline bg-gradient-to-br from-card-hi to-black">
      <div className={`absolute inset-0 opacity-25 ${TONE_BG[course.tone]}`} />
      <div className="absolute inset-0 flex items-center justify-center">
        <button
          type="button"
          aria-label="Play"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-accent text-black shadow-lg transition hover:scale-105"
        >
          <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
        </button>
      </div>
      {/* Faux control bar */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-10">
        <div className="flex items-center gap-3 text-white/90">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
          </svg>
          <span className="text-[11px] tabular-nums">00:19 / 01:38</span>
          <div className="relative h-1 flex-1 rounded-full bg-white/25">
            <div className="absolute inset-y-0 left-0 w-[20%] rounded-full bg-accent" />
            <div className="absolute left-[20%] top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
          </div>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 00-2.5-4.03v8.06A4.5 4.5 0 0016.5 12z" />
          </svg>
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function CourseCard({
  course,
  selected,
  onSelect,
}: {
  course: Course;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full gap-4 rounded-2xl border p-3 text-left transition ${
        selected
          ? "border-accent/60 bg-accent/[0.05]"
          : "border-hairline bg-card hover:border-mute hover:bg-card-hi"
      }`}
    >
      {course.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={course.thumbnailUrl}
          alt=""
          loading="lazy"
          referrerPolicy="origin"
          className="h-20 w-24 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <Monogram tone={course.tone} label={course.title} className="h-20 w-24 shrink-0 rounded-xl" />
      )}
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <h3 className="truncate text-sm font-semibold text-ink">{course.title}</h3>
        <p className="mt-1 line-clamp-2 text-xs text-subtle">{course.blurb}</p>
      </div>
    </button>
  );
}

export function CoursePlatform({
  program,
  fill = "screen",
  backHref,
}: {
  program: Program;
  // "screen" fills the viewport (h-dvh) for the producer portal where the
  // platform sits beside the sidebar; "parent" fills a bounded parent (h-full)
  // for the recruit portal where a TopBar sits above it.
  fill?: "screen" | "parent";
  /** Producer portal only — shows the centered title + back pill. Recruit
   *  portal (fill="parent") has its own TopBar nav and leaves this unset. */
  backHref?: string;
}) {
  // When the program defines named sections, the tabs become those sections
  // (filtering by course.section); otherwise fall back to status tabs.
  const sectionTabs = program.sections ?? null;
  const tabs = sectionTabs ?? STATUS_TABS;

  const [tab, setTab] = useState<string>(tabs[0]?.key ?? "all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>(program.courses[0]?.id ?? "");
  // Mobile is master-detail: show the list, tap a course to open the player,
  // and a back button returns to the list. Desktop shows both side by side.
  const [mobileShowPlayer, setMobileShowPlayer] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return program.courses.filter((c) => {
      if (sectionTabs) {
        if (c.section !== tab) return false;
      } else {
        if (tab === "active" && c.status !== "active") return false;
        if (tab === "completed" && c.status !== "completed") return false;
      }
      if (q && !`${c.title} ${c.blurb}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [program.courses, sectionTabs, tab, query]);

  // Keep the current selection while it's visible; otherwise show the first
  // item in the active tab (so switching sections updates the player too).
  const selected =
    filtered.find((c) => c.id === selectedId) ?? filtered[0] ?? program.courses[0] ?? null;

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row ${
        fill === "parent" ? "h-full" : "h-dvh"
      }`}
    >
      {/* Left: course list (master) — hidden on mobile once a video is open */}
      <div
        className={`min-h-0 flex-col border-hairline lg:flex lg:w-[400px] lg:shrink-0 lg:border-r ${
          mobileShowPlayer ? "hidden" : "flex"
        }`}
      >
        <div className="px-5 pt-8 md:px-8">
          {backHref ? (
            <PageHeader title={program.title} backHref={backHref} />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-mute">Training</p>
                  <h1 className="mt-1 text-3xl font-semibold tracking-[-0.02em]">{program.title}</h1>
                </div>
              </div>
              <p className="mt-2 text-sm text-subtle">{program.subtitle}</p>
            </>
          )}

          {/* Tabs — hidden when there's only one. A single "All" tab filters
              nothing and switches to nothing; it just looks like a control. */}
          {tabs.length > 1 ? (
            <div className="mt-5 flex items-center gap-4 border-b border-hairline">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`-mb-px border-b-2 pb-2.5 text-sm transition ${
                    tab === t.key
                      ? "border-accent font-medium text-ink"
                      : "border-transparent text-subtle hover:text-ink"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : null}

          {/* Search */}
          <div className="relative mt-4">
            <svg
              viewBox="0 0 24 24"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4-4" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${program.title.toLowerCase()}…`}
              className="w-full rounded-xl border border-hairline bg-card-hi py-2.5 pl-9 pr-3 text-sm text-ink outline-none transition placeholder:text-mute focus:border-accent"
            />
          </div>
        </div>

        {/* Scrollable list */}
        <div className="mt-4 flex-1 space-y-2.5 overflow-y-auto px-5 pb-8 md:px-8">
          {filtered.length === 0 ? (
            <p className="rounded-2xl border border-hairline bg-card p-6 text-center text-sm text-mute">
              Nothing matches your filters.
            </p>
          ) : (
            filtered.map((c) => (
              <CourseCard
                key={c.id}
                course={c}
                selected={selected?.id === c.id}
                onSelect={() => {
                  setSelectedId(c.id);
                  setMobileShowPlayer(true);
                }}
              />
            ))
          )}
        </div>
      </div>

      {/* Right: player + detail. Top-aligned so the video sits at the top of the
       * pane (not floating in the vertical middle) while the left list scrolls
       * independently. */}
      <div
        className={`min-h-0 flex-1 flex-col overflow-y-auto px-5 py-8 md:px-8 lg:flex ${
          mobileShowPlayer ? "flex" : "hidden"
        }`}
      >
        {selected ? (
          <div className="mx-auto w-full max-w-4xl">
            <button
              type="button"
              onClick={() => setMobileShowPlayer(false)}
              className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-subtle transition hover:text-ink lg:hidden"
            >
              <span aria-hidden>←</span> Back to trainings
            </button>
            <Player course={selected} />

            <h2 className="mt-5 text-2xl font-semibold tracking-[-0.02em] md:text-3xl">
              {selected.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-subtle">{selected.description}</p>

            {selected.instructor.name ? (
              <div className="mt-5 flex items-center gap-3">
                <Monogram
                  tone={selected.tone}
                  label={selected.instructor.name}
                  className="h-10 w-10 rounded-full"
                />
                <div>
                  <p className="text-sm font-medium text-ink">{selected.instructor.name}</p>
                  <p className="text-xs text-mute">{selected.instructor.title}</p>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-mute">
            No course selected.
          </div>
        )}
      </div>
    </div>
  );
}
