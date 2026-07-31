import { removeRecruitForm } from "@/lib/actions/flagging";
import type { Recruit } from "@/lib/db/types";
import { Input } from "@/components/ui";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";

export default function RemoveForm({ recruit }: { recruit: Recruit }) {
  if (recruit.removed_at) {
    return (
      <div className="rounded-2xl border border-neg/40 bg-neg/[0.08] px-4 py-3 text-sm text-neg">
        Removed on {new Date(recruit.removed_at).toLocaleDateString()}. Record
        retained. Post-removal workflow is intentionally not built (Section
        6.2).
      </div>
    );
  }

  return (
    <form
      action={removeRecruitForm}
      className="rounded-2xl border border-warn/40 bg-warn/[0.06] p-5"
    >
      <input type="hidden" name="recruitId" value={recruit.id} />
      <p className="text-sm text-subtle">
        Removing sets <code className="text-ink">removed_at</code> and marks the
        person <code className="text-ink">removed</code>. History stays intact.
      </p>
      <label className="mt-4 block text-[10px] uppercase tracking-[0.16em] text-mute">
        Reason (optional)
      </label>
      <Input
        name="reason"
        type="text"
        placeholder="Optional note — e.g. could not reach"
        className="mt-1.5"
      />
      <ConfirmSubmit
        label="Remove recruit"
        title="Remove this recruit?"
        message="Once you remove them you can't bring them back — all of their data will be removed. Make sure you're absolutely certain this is what you want to do."
        confirmLabel="Yes, remove them"
        className="mt-3 inline-flex items-center justify-center rounded-full bg-neg px-4 py-2 text-sm font-medium text-white transition hover:bg-neg/85"
      />
    </form>
  );
}
