import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/Avatar";
import { HeadshotQueue, type QueueRow } from "@/components/admin/HeadshotQueue";
import {
  isPhotoReviewStatus,
  type PhotoReviewStatus,
} from "@/lib/headshots/status";

type Row = {
  id: string;
  full_name: string;
  email: string;
  photo_url: string | null;
  photo_review_status: PhotoReviewStatus;
  photo_rejection_reason: string | null;
  photo_reviewed_at: string | null;
  photo_updated_at: string | null;
};

const TABS: { key: PhotoReviewStatus; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function AdminHeadshotsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    ok?: string;
    n?: string;
    warn?: string;
    error?: string;
  }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const status: PhotoReviewStatus = isPhotoReviewStatus(params.status)
    ? params.status
    : "pending";

  const supabase = await createClient();
  const { data } = await supabase
    .from("person")
    .select(
      "id, full_name, email, photo_url, photo_review_status, photo_rejection_reason, photo_reviewed_at, photo_updated_at",
    )
    .eq("photo_review_status", status)
    .order("photo_updated_at", { ascending: false, nullsFirst: false });
  const rows = (data ?? []) as Row[];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-mute">
          Review
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Headshots
        </h1>
        <p className="mt-3 text-sm text-subtle">
          {rows.length} {status} {rows.length === 1 ? "photo" : "photos"}.
        </p>
      </div>

      {params.ok && !(params.ok === "rejected" && params.warn === "email") ? (
        <p className="mt-6 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent">
          {params.ok === "approved"
            ? params.n
              ? `Approved ${params.n} ${params.n === "1" ? "photo" : "photos"}.`
              : "Photo approved."
            : "Photo rejected. We emailed them the note."}
        </p>
      ) : null}
      {params.warn === "email" ? (
        <p className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-400">
          Photo rejected, but the email didn&apos;t send. Reach out by hand.
        </p>
      ) : null}
      {params.error ? (
        <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {params.error}
        </p>
      ) : null}

      {/* Status tabs */}
      <div className="mt-8 flex items-center gap-2">
        {TABS.map((t) => {
          const active = t.key === status;
          return (
            <Link
              key={t.key}
              href={`/admin/headshots?status=${t.key}`}
              className={
                active
                  ? "rounded-full border border-accent/40 bg-accent/10 px-4 py-1.5 text-xs font-medium text-accent"
                  : "rounded-full border border-hairline px-4 py-1.5 text-xs font-medium text-subtle transition hover:text-ink"
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {status === "pending" ? (
        <HeadshotQueue
          rows={rows.map<QueueRow>((r) => ({
            id: r.id,
            full_name: r.full_name,
            email: r.email,
            photo_url: r.photo_url,
            whenLabel: formatWhen(r.photo_updated_at),
            // Reviewed before + back in pending = an approved/rejected person
            // swapped their photo. reviewed_at survives uploads, so it's the tell.
            changed: r.photo_reviewed_at !== null,
          }))}
        />
      ) : (
        <section className="mt-8 flex flex-col gap-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-hairline bg-card p-5"
            >
              <div className="flex min-w-0 items-center gap-4">
                <Avatar
                  name={r.full_name}
                  photoUrl={r.photo_url}
                  className="h-14 w-14 text-base ring-1 ring-hairline"
                />
                <div className="min-w-0">
                  <Link
                    href={`/admin/people/${r.id}`}
                    className="text-base font-semibold text-ink hover:text-accent"
                  >
                    {r.full_name}
                  </Link>
                  <p className="mt-0.5 truncate text-sm text-subtle">
                    {r.email}
                  </p>
                  <p className="mt-1 text-xs text-mute">
                    Uploaded {formatWhen(r.photo_updated_at)}
                    {status === "rejected" && r.photo_rejection_reason
                      ? ` · ${r.photo_rejection_reason}`
                      : ""}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {rows.length === 0 ? (
            <p className="text-sm text-mute">Nothing {status} right now.</p>
          ) : null}
        </section>
      )}
    </main>
  );
}
