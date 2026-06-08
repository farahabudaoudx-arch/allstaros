import { adminAddPerson, adminBulkInvite } from "@/lib/actions/admin/team";

type Upline = { id: string; full_name: string };

const NOUN: Record<string, string> = {
  builder: "builder",
  producer: "producer",
  recruit: "recruit",
};

/**
 * Add-people block shown on each People list page. Role is fixed per page; both
 * the single-add and bulk-add forms ask for the upline and send invite emails.
 */
export function AddPeople({
  role,
  uplines,
  back,
}: {
  role: "builder" | "producer" | "recruit";
  uplines: Upline[];
  back: string;
}) {
  const noun = NOUN[role];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Single add */}
      <section className="rounded-2xl border border-hairline bg-card p-5">
        <h2 className="text-base font-semibold text-ink">Add a {noun}</h2>
        <form action={adminAddPerson} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="role" value={role} />
          <input type="hidden" name="back" value={back} />
          <Field name="name" label="Name" />
          <Field name="email" label="Email" type="email" />
          <UplineSelect uplines={uplines} />
          <button
            type="submit"
            className="rounded-full bg-accent px-5 py-2 text-xs font-semibold text-black transition hover:opacity-90"
          >
            Add &amp; send invite
          </button>
        </form>
      </section>

      {/* Bulk add */}
      <section className="rounded-2xl border border-hairline bg-card p-5">
        <h2 className="text-base font-semibold text-ink">Bulk add {noun}s</h2>
        <p className="mt-1 text-xs text-mute">
          One per line — <span className="font-mono">Name, email</span>.
        </p>
        <form action={adminBulkInvite} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="role" value={role} />
          <input type="hidden" name="back" value={back} />
          <textarea
            name="roster"
            rows={4}
            placeholder={"Jane Doe, jane@example.com\nJohn Smith, john@example.com"}
            className="w-full rounded-lg border border-hairline bg-card-hi px-3 py-2 font-mono text-sm text-ink outline-none focus:border-accent"
          />
          <UplineSelect uplines={uplines} />
          <button
            type="submit"
            className="rounded-full bg-accent px-5 py-2 text-xs font-semibold text-black transition hover:opacity-90"
          >
            Add all &amp; send invites
          </button>
        </form>
      </section>
    </div>
  );
}

function UplineSelect({ uplines }: { uplines: Upline[] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-mute">
        Upline
      </span>
      <select
        name="uplineId"
        className="rounded-lg border border-hairline bg-card-hi px-3 py-2 text-sm text-ink outline-none focus:border-accent"
      >
        <option value="">— none —</option>
        {uplines.map((u) => (
          <option key={u.id} value={u.id}>
            {u.full_name}
          </option>
        ))}
      </select>
    </label>
  );
}

function Field({
  name,
  label,
  type = "text",
}: {
  name: string;
  label: string;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-mute">
        {label}
      </span>
      <input
        name={name}
        type={type}
        className="rounded-lg border border-hairline bg-card-hi px-3 py-2 text-sm text-ink outline-none focus:border-accent"
      />
    </label>
  );
}
