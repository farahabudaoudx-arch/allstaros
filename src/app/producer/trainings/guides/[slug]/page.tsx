import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui";
import { getGuide, type Guide } from "@/lib/producer/guides";

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
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default async function GuideArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <Link
        href="/producer/trainings/guides"
        className="inline-flex items-center gap-1.5 text-sm text-subtle transition hover:text-ink"
      >
        <span aria-hidden>‹</span> All guides
      </Link>

      <div className="mt-6 flex items-center gap-2">
        <Badge tone="accent">{guide.category}</Badge>
        <span className="text-xs text-mute">{guide.readMinutes} min read</span>
      </div>

      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.025em] md:text-4xl">{guide.title}</h1>
      <p className="mt-3 text-base leading-relaxed text-subtle">{guide.excerpt}</p>

      <div className="mt-5 flex items-center gap-3 border-b border-hairline pb-6">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-full ${TONE_BG[guide.tone]} text-sm font-semibold text-white`}
        >
          {guide.author.trim()[0]?.toUpperCase()}
        </div>
        <div>
          <p className="text-sm font-medium text-ink">{guide.author}</p>
          <p className="text-xs text-mute">{fmtDate(guide.date)}</p>
        </div>
      </div>

      <article className="mt-8 space-y-5">
        {guide.body.map((para, i) => (
          <p key={i} className="text-base leading-relaxed text-subtle">
            {para}
          </p>
        ))}
      </article>
    </main>
  );
}
