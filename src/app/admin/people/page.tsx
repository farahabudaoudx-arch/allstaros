import { requireAdmin } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import {
  adminSetRoleFlags,
  adminSetStatus,
  adminUpdateProfile,
} from "@/lib/actions/admin/people";
import type { Person } from "@/lib/db/types";

type Row = Pick<
  Person,
  | "id"
  | "full_name"
  | "email"
  | "phone"
  | "upline_id"
  | "is_builder"
  | "is_producer"
  | "is_admin"
  | "is_super_admin"
  | "is_owner"
  | "status"
>;

const FLASH: Record<string, string> = {
  role: "Role updated.",
  status: "Status updated.",
  profile: "Profile saved.",
};

function RoleBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-card-hi px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-subtle ring-1 ring-hairline">
      {label}
    </span>
  );
}

export default async function AdminPeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const caller = await requireAdmin();
  const flash = await searchParams;
  const supabase = await createClient();

  // Admins read the whole org via can_view. Order by name for a stable roster.
  const { data } = await supabase
    .from("person")
    .select(
      "id, full_name, email, phone, upline_id, is_builder, is_producer, is_admin, is_super_admin, is_owner, status",
    )
    .order("full_name", { ascending: true });
  const people = (data ?? []) as Row[];
  const nameById = new Map(people.map((p) => [p.id, p.full_name]));

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 md:px-10 md:py-14">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-mute">
          Admin
        </p>
        <h1 className="mt-1.5 text-4xl font-semibold tracking-[-0.025em] md:text-5xl">
          People
        </h1>
        <p className="mt-3 text-sm text-subtle">
          {people.length} {people.length === 1 ? "person" : "people"} across the
          organization.
        </p>
      </div>

      {flash.ok ? (
        <p className="mt-6 rounded-xl border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent">
          {FLASH[flash.ok] ?? "Done."}
        </p>
      ) : null}
      {flash.error ? (
        <p className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {flash.error}
        </p>
      ) : null}

      <div className="mt-8 flex flex-col gap-3">
        {people.map((p) => {
          const protectedRow =
            p.is_admin || p.is_super_admin || p.is_owner;
          const locked = protectedRow && !caller.is_super_admin;
          const isSelf = p.id === caller.id;
          const disabled = locked || isSelf;

          return (
            <div
              key={p.id}
              className="rounded-2xl border border-hairline bg-card p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold text-ink">
                      {p.full_name}
                    </h3>
                    {p.is_owner ? <RoleBadge label="Owner" /> : null}
                    {p.is_super_admin ? <RoleBadge label="Super Admin" /> : null}
                    {p.is_admin && !p.is_super_admin ? (
                      <RoleBadge label="Admin" />
                    ) : null}
                    {p.is_builder ? <RoleBadge label="Builder" /> : null}
                    {p.is_producer && !p.is_builder ? (
                      <RoleBadge label="Producer" />
                    ) : null}
                    {p.status === "removed" ? (
                      <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-red-400 ring-1 ring-red-500/30">
                        Removed
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-sm text-subtle">
                    {p.email}
                    {p.phone ? ` · ${p.phone}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-mute">
                    Upline:{" "}
                    {p.upline_id ? nameById.get(p.upline_id) ?? "—" : "—"}
                  </p>
                </div>

                {disabled ? (
                  <span className="text-xs text-mute">
                    {isSelf ? "Your account" : "Super-admin only"}
                  </span>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <RoleToggle
                      personId={p.id}
                      role="producer"
                      active={p.is_producer}
                    />
                    <RoleToggle
                      personId={p.id}
                      role="builder"
                      active={p.is_builder}
                    />
                    <form action={adminSetStatus}>
                      <input type="hidden" name="personId" value={p.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={p.status === "active" ? "removed" : "active"}
                      />
                      <button
                        type="submit"
                        className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink transition hover:border-accent hover:text-accent"
                      >
                        {p.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                    </form>
                  </div>
                )}
              </div>

              {!disabled ? (
                <details className="mt-3 border-t border-hairline pt-3">
                  <summary className="cursor-pointer text-xs font-medium text-subtle hover:text-ink">
                    Edit profile
                  </summary>
                  <form
                    action={adminUpdateProfile}
                    className="mt-3 grid gap-3 sm:grid-cols-3"
                  >
                    <input type="hidden" name="personId" value={p.id} />
                    <Field name="full_name" label="Name" defaultValue={p.full_name} />
                    <Field name="email" label="Email" defaultValue={p.email} />
                    <Field
                      name="phone"
                      label="Phone"
                      defaultValue={p.phone ?? ""}
                    />
                    <div className="sm:col-span-3">
                      <button
                        type="submit"
                        className="rounded-full bg-accent px-4 py-2 text-xs font-semibold text-black transition hover:opacity-90"
                      >
                        Save profile
                      </button>
                    </div>
                  </form>
                </details>
              ) : null}
            </div>
          );
        })}
      </div>
    </main>
  );
}

function RoleToggle({
  personId,
  role,
  active,
}: {
  personId: string;
  role: "producer" | "builder";
  active: boolean;
}) {
  const label = active
    ? `Remove ${role}`
    : `Make ${role}`;
  return (
    <form action={adminSetRoleFlags}>
      <input type="hidden" name="personId" value={personId} />
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="next" value={active ? "false" : "true"} />
      <button
        type="submit"
        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
          active
            ? "border-hairline text-subtle hover:border-red-500/50 hover:text-red-400"
            : "border-hairline text-ink hover:border-accent hover:text-accent"
        }`}
      >
        {label}
      </button>
    </form>
  );
}

function Field({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-mute">
        {label}
      </span>
      <input
        name={name}
        defaultValue={defaultValue}
        className="rounded-lg border border-hairline bg-card-hi px-3 py-2 text-sm text-ink outline-none focus:border-accent"
      />
    </label>
  );
}
