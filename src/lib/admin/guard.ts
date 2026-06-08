import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import type { Person } from "@/lib/db/types";

/**
 * Gate a page or server action to admins (CEO + EA) and super-admins.
 * Returns the signed-in person; redirects (throws) otherwise, so callers can
 * use the return value directly without a null check.
 *
 * `is_admin` on the person row already folds in is_super_admin + is_owner via
 * the DB, but getCurrentPerson() reads raw columns, so we check both flags here.
 */
export async function requireAdmin(next = "/admin"): Promise<Person> {
  const person = await getCurrentPerson();
  if (!person) redirect(`/auth/signin?next=${encodeURIComponent(next)}`);
  if (!person.is_admin && !person.is_super_admin) redirect("/producer");
  return person;
}

/**
 * Gate the reserved system tier (minting, hard deletes, audit log, system config).
 * A plain admin (CEO/EA) is bounced back to the admin home, never to /producer,
 * so they keep their admin context but can't reach super-admin surfaces.
 */
export async function requireSuperAdmin(next = "/admin"): Promise<Person> {
  const person = await getCurrentPerson();
  if (!person) redirect(`/auth/signin?next=${encodeURIComponent(next)}`);
  if (!person.is_super_admin) redirect("/admin");
  return person;
}
