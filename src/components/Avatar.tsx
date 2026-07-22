import { initialsFor } from "@/lib/headshots/initials";

/**
 * The one avatar used everywhere: leaderboard, downline/org, messaging, admin
 * roster, and profile. Feed it a display name and an optional photo URL and
 * nothing else. It draws the photo if there is one, otherwise the initials
 * circle. It knows nothing about roles, review status, or the login wall.
 *
 * Sizing, ring, and text-size are supplied by the caller via `className` so it
 * drops into every existing avatar slot unchanged (e.g. "h-14 w-14 text-base
 * ring-2 ring-accent" on the podium, "h-8 w-8 text-[11px] ring-1 ring-hairline"
 * in a table row).
 */
export function Avatar({
  name,
  photoUrl,
  className = "",
}: {
  name: string;
  photoUrl?: string | null;
  className?: string;
}) {
  const base =
    "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-card-hi font-semibold text-ink";

  if (photoUrl) {
    return (
      <span className={`${base} ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl}
          alt={name}
          loading="lazy"
          referrerPolicy="origin"
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span className={`${base} ${className}`} aria-label={name}>
      {initialsFor(name)}
    </span>
  );
}
