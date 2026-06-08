import { adminAddPerson, adminBulkInvite } from "@/lib/actions/admin/team";
import { Modal } from "@/components/admin/Modal";

type Upline = { id: string; full_name: string };

const NOUN: Record<string, string> = {
  builder: "builder",
  producer: "producer",
  recruit: "recruit",
};

/**
 * Buttons that open popups to add people. Role is fixed per page. Both the
 * single and bulk forms ask for the upline and send invite emails. Builders
 * pass allowBulk={false} (we never bulk-add builders).
 */
export function AddPeople({
  role,
  uplines,
  back,
  allowBulk = true,
}: {
  role: "builder" | "producer" | "recruit";
  uplines: Upline[];
  back: string;
  allowBulk?: boolean;
}) {
  const noun = NOUN[role];

  return (
    <div className="flex flex-wrap gap-2">
      <Modal label={`Add a ${noun}`} title={`Add a ${noun}`}>
        <form action={adminAddPerson} className="flex flex-col gap-3">
          <input type="hidden" name="role" value={role} />
          <input type="hidden" name="back" value={back} />
          <Field name="name" label="Name" />
          <Field name="email" label="Email" type="email" />
          <UplineSelect uplines={uplines} />
          <button
            type="submit"
            className="mt-1 rounded-full bg-accent px-5 py-2 text-xs font-semibold text-black transition hover:opacity-90"
          >
            Add &amp; send invite
          </button>
        </form>
      </Modal>

      {allowBulk ? (
        <Modal
          label={`Bulk add ${noun}s`}
          title={`Bulk add ${noun}s`}
          variant="ghost"
        >
          <form action={adminBulkInvite} className="flex flex-col gap-3">
            <input type="hidden" name="role" value={role} />
            <input type="hidden" name="back" value={back} />
            <p className="text-xs text-mute">
              One per line — <span className="font-mono">Name, email</span>.
            </p>
            <textarea
              name="roster"
              rows={6}
              placeholder={"Jane Doe, jane@example.com\nJohn Smith, john@example.com"}
              className="w-full rounded-lg border border-hairline bg-card-hi px-3 py-2 font-mono text-sm text-ink outline-none focus:border-accent"
            />
            <UplineSelect uplines={uplines} />
            <button
              type="submit"
              className="mt-1 rounded-full bg-accent px-5 py-2 text-xs font-semibold text-black transition hover:opacity-90"
            >
              Add all &amp; send invites
            </button>
          </form>
        </Modal>
      ) : null}
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
