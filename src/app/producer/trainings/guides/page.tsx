import Link from "next/link";
import { Badge } from "@/components/ui";
import { GUIDES, type Guide } from "@/lib/producer/guides";

const TONE_BG: Record<Guide["tone"], string> = {
  coral: "bg-[#d9744f]",
  gold: "bg-[#e3b53e]",
  green: "bg-[#6f9e6f]",
  sky: "bg-[#6f93b8]",
  violet: "bg-[#8a7fb0]",
  rose: "bg-[#c97b8e]",
};

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function GuidesPage() {
  const [featured, ...rest] = GUIDES;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">Training</p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">Guides</h1>
        <p className="mt-3 max-w-2xl text-sm text-subtle">
          Short, practical reads on the skills and systems that drive production.
        </p>
      </div>

      {/* Featured */}
      {featured ? (
        <Link
          href={`/producer/trainings/guides/${featured.slug}`}
          className="group mt-8 grid overflow-hidden rounded-2xl border border-hairline bg-card transition hover:border-accent md:grid-cols-2"
        >
          <div className={`relative min-h-[180px] ${TONE_BG[featured.tone]}`}>
            <div className="absolute inset-0 flex items-center justify-center p-8 text-center">
              <span className="text-2xl font-semibold text-white/90">{featured.title}</span>
            </div>
          </div>
          <div className="flex flex-col p-6 md:p-8">
            <div className="flex items-center gap-2">
              <Badge tone="accent">Featured</Badge>
              <Badge>{featured.category}</Badge>
            </div>
            <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em]">{featured.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-subtle">{featured.excerpt}</p>
            <div className="mt-auto pt-5 text-xs text-mute">
              {featured.author} • {fmtDate(featured.date)} • {featured.readMinutes} min read
            </div>
          </div>
        </Link>
      ) : null}

      {/* Grid */}
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((g) => (
          <Link
            key={g.slug}
            href={`/producer/trainings/guides/${g.slug}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-hairline bg-card transition hover:border-accent hover:bg-card-hi"
          >
            <div className={`relative h-32 ${TONE_BG[g.tone]}`}>
              <div className="absolute inset-0 flex items-end p-4">
                <Badge>{g.category}</Badge>
              </div>
            </div>
            <div className="flex flex-1 flex-col p-5">
              <h2 className="text-base font-semibold text-ink">{g.title}</h2>
              <p className="mt-1.5 line-clamp-2 text-sm text-subtle">{g.excerpt}</p>
              <div className="mt-auto pt-4 text-xs text-mute">
                {g.author} • {g.readMinutes} min read
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
