import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getInstallationServiceBinding } from "@/lib/services/bindings";
import {
  adminCreateTrainingContent,
  adminDeleteTrainingContent,
  adminUpdateTrainingContent,
} from "@/lib/actions/admin/training-content";
import {
  ALL_LIBRARIES,
  LIBRARY_LABELS,
  type ContentLibrary,
  type TrainingContentRow,
} from "@/lib/producer/training-content";
import { Badge, Button, Card, Field, Input, PageShell } from "@/components/ui";

const FLASH: Record<string, string> = {
  created: "Training item added.",
  updated: "Training item saved.",
  deleted: "Training item removed.",
};

export default async function AdminTrainingContentPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  await requireAdmin("/admin/content/training");
  const flash = await searchParams;
  const admin = createServiceRoleClient();
  const [{ data, error }, videoBinding] = await Promise.all([
    admin
      .from("training_content")
      .select("id, library, title, embed_url, sort_order")
      .order("library", { ascending: true })
      .order("sort_order", { ascending: true }),
    getInstallationServiceBinding("video"),
  ]);
  const rows = error ? [] : ((data ?? []) as TrainingContentRow[]);

  return (
    <PageShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-mute">Admin · Content</p>
          <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">Training Libraries</h1>
          <p className="mt-3 max-w-3xl text-sm text-subtle">
            Customer-local content only. Empty libraries stay empty; they never inherit another installation&apos;s catalog.
          </p>
        </div>
        <Badge tone={videoBinding?.status === "configured" ? "pos" : "warn"}>
          Video: {videoBinding?.providerKey ?? "not connected"}
        </Badge>
      </div>

      {flash.ok ? <p className="mt-6 rounded-xl border border-pos/30 bg-pos/[0.08] px-4 py-2.5 text-sm text-pos">{FLASH[flash.ok] ?? "Saved."}</p> : null}
      {flash.error ? <p className="mt-6 rounded-xl border border-neg/30 bg-neg/[0.08] px-4 py-2.5 text-sm text-neg">{flash.error}</p> : null}

      <div className="mt-8 grid gap-6">
        {ALL_LIBRARIES.map((library) => (
          <LibrarySection key={library} library={library} rows={rows.filter((row) => row.library === library)} />
        ))}
      </div>
    </PageShell>
  );
}

function LibrarySection({ library, rows }: { library: ContentLibrary; rows: TrainingContentRow[] }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-ink">{LIBRARY_LABELS[library]}</h2>
          <p className="mt-1 text-sm text-subtle">{rows.length} item{rows.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      <form action={adminCreateTrainingContent} className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_120px_auto] md:items-end">
        <input type="hidden" name="library" value={library} />
        <Field label="Title" htmlFor={`${library}-new-title`}><Input id={`${library}-new-title`} name="title" required /></Field>
        <Field label="HTTPS video embed URL" htmlFor={`${library}-new-url`}><Input id={`${library}-new-url`} name="embed_url" type="url" required /></Field>
        <Field label="Sort" htmlFor={`${library}-new-sort`}><Input id={`${library}-new-sort`} name="sort_order" type="number" defaultValue="0" /></Field>
        <Button type="submit" variant="primary">Add</Button>
      </form>

      <div className="mt-5 grid gap-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-xl border border-hairline bg-card-hi p-4">
            <form action={adminUpdateTrainingContent} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_120px_auto] md:items-end">
              <input type="hidden" name="id" value={row.id} />
              <input type="hidden" name="library" value={library} />
              <Field label="Title" htmlFor={`${row.id}-title`}><Input id={`${row.id}-title`} name="title" defaultValue={row.title} required /></Field>
              <Field label="HTTPS video embed URL" htmlFor={`${row.id}-url`}><Input id={`${row.id}-url`} name="embed_url" type="url" defaultValue={row.embed_url} required /></Field>
              <Field label="Sort" htmlFor={`${row.id}-sort`}><Input id={`${row.id}-sort`} name="sort_order" type="number" defaultValue={String(row.sort_order)} /></Field>
              <Button type="submit">Save</Button>
            </form>
            <form action={adminDeleteTrainingContent} className="mt-2">
              <input type="hidden" name="id" value={row.id} />
              <Button type="submit" variant="danger">Delete</Button>
            </form>
          </div>
        ))}
        {rows.length === 0 ? <p className="text-sm text-mute">Nothing here yet. This library intentionally remains empty until content is added.</p> : null}
      </div>
    </Card>
  );
}
