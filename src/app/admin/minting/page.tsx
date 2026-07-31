import { requireSuperAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import {
  adminSetAdminFlag,
  adminSetOwnerFlag,
  adminAddAdminByEmail,
} from "@/lib/actions/admin/minting";
import { Modal } from "@/components/admin/Modal";

type Row = {
  id: string;
  full_name: string;
  email: string;
  is_admin: boolean;
  is_super_admin: boolean;
  is_owner: boolean;
};

function Badge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-card-hi px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-subtle ring-1 ring-hairline">
      {label}
    </span>
  );
}

function ToggleBtn({
  personId,
  column,
  active,
  action,
}: {
  personId: string;
  column: "admin" | "owner";
  active: boolean;
  action: (formData: FormData) => void;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="next" value={active ? "false" : "true"} />
      <button
        type="submit"
        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
          active
            ? "border-hairline text-subtle hover:border-red-500/50 hover:text-red-400"
            : "border-hairline text-ink hover:border-accent hover:text-accent"
        }`}
      >
        {active ? `Revoke ${column}` : `Grant ${column}`}
      </button>
    </form>
  );
}

export default async function AdminMintingPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const caller = await requireSuperAdmin();
  const flash = await searchParams;
  const supabase = await createClient();

  const { data: privilegedData } = await supabase
    .from("person")
    .select("id, full_name, email, is_admin, is_super_admin, is_owner")
    .or("is_admin.eq.true,is_owner.eq.true,is_super_admin.eq.true")
    .order("full_name", { ascending: true });

  const privileged = (privilegedData ?? []) as Row[];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-mute">
          Super Admin
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          Roles &amp; Minting
        </h1>
        <p className="mt-3 text-sm text-subtle">
          Grant or revoke admin and owner. Reserved to super-admins — this is the
          guardrail that stops a CEO/EA from self-escalating. (Super-admin itself
          is set directly in the database.)
        </p>
      </div>

      {flash.ok ? (
        <p className="mt-6 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent">
          Privileges updated.
        </p>
      ) : null}
      {flash.error ? (
        <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {flash.error}
        </p>
      ) : null}

      <div className="mt-8">
        <Modal label="Add an admin" title="Add an admin">
          <form action={adminAddAdminByEmail} className="flex flex-col gap-3">
            <p className="text-sm text-subtle">
              Enter anyone&apos;s email to make them an admin (e.g. the CEO or his
              EA).
            </p>
            <input
              name="email"
              type="email"
              placeholder="person@example.com"
              className="w-full rounded-lg border border-hairline bg-card-hi px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
            <button
              type="submit"
              className="mt-1 rounded-full bg-accent px-5 py-2 text-xs font-semibold text-black transition hover:opacity-90"
            >
              Add as admin
            </button>
          </form>
        </Modal>
      </div>

      <Section title={`Current admins & owners (${privileged.length})`}>
        {privileged.map((p) => (
          <PersonRow key={p.id} p={p} selfId={caller.id} />
        ))}
      </Section>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-4 flex flex-col gap-2">{children}</div>
    </section>
  );
}

function PersonRow({ p, selfId }: { p: Row; selfId: string }) {
  const isSelf = p.id === selfId;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-card p-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-semibold text-ink">{p.full_name}</h3>
          {p.is_owner ? <Badge label="Owner" /> : null}
          {p.is_super_admin ? <Badge label="Super Admin" /> : null}
          {p.is_admin && !p.is_super_admin ? <Badge label="Admin" /> : null}
        </div>
        <p className="mt-1 truncate text-sm text-subtle">{p.email}</p>
      </div>
      {isSelf ? (
        <span className="text-xs text-mute">Your account</span>
      ) : (
        <div className="flex items-center gap-2">
          <ToggleBtn
            personId={p.id}
            column="admin"
            active={p.is_admin}
            action={adminSetAdminFlag}
          />
          <ToggleBtn
            personId={p.id}
            column="owner"
            active={p.is_owner}
            action={adminSetOwnerFlag}
          />
        </div>
      )}
    </div>
  );
}
