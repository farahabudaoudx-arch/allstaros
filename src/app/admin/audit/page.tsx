import { requireSuperAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";

type AuditRow = {
  id: string;
  actor_person_id: string | null;
  action: string;
  target_person_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
};

function when(iso: string): string {
  return iso.replace("T", " ").slice(0, 16) + " UTC";
}

export default async function AdminAuditPage() {
  await requireSuperAdmin();
  const supabase = await createClient();

  const { data: auditData } = await supabase
    .from("admin_audit")
    .select("id, actor_person_id, action, target_person_id, detail, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = (auditData ?? []) as AuditRow[];

  const ids = [
    ...new Set(
      rows.flatMap((r) => [r.actor_person_id, r.target_person_id]).filter(Boolean),
    ),
  ] as string[];
  const nameById = new Map<string, string>();
  if (ids.length > 0) {
    const { data: people } = await supabase
      .from("person")
      .select("id, full_name")
      .in("id", ids);
    for (const p of people ?? []) nameById.set(p.id, p.full_name as string);
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
          Super Admin
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Audit Log
        </h1>
        <p className="mt-3 text-sm text-subtle">
          Sensitive admin actions, newest first. Showing the most recent{" "}
          {rows.length}.
        </p>
      </div>

      <div className="mt-8 overflow-hidden rounded-2xl border border-hairline">
        <table className="w-full text-sm">
          <thead className="bg-card-hi text-left text-xs uppercase tracking-wide text-mute">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Target</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-hairline align-top">
                <td className="px-4 py-3 font-mono text-xs text-mute">
                  {when(r.created_at)}
                </td>
                <td className="px-4 py-3 text-ink">
                  {r.actor_person_id
                    ? nameById.get(r.actor_person_id) ?? "—"
                    : "—"}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-subtle">
                  {r.action}
                </td>
                <td className="px-4 py-3 text-subtle">
                  {r.target_person_id
                    ? nameById.get(r.target_person_id) ?? "—"
                    : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-mute" colSpan={4}>
                  No audited actions yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
