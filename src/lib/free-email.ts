import { createServiceRoleClient } from "@/lib/supabase/server";

type Admin = ReturnType<typeof createServiceRoleClient>;

/**
 * Find the Supabase auth user id for an email. Pending invitees have an auth user
 * (created by generateLink) but no person.auth_user_id yet, so we may have to look
 * them up by email. Bounded paging to keep this snappy on a large user base.
 */
async function findAuthUserIdByEmail(admin: Admin, email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/**
 * Free up a removed person's email + login so the SAME address can be added again
 * from My Downline → Add someone.
 *
 * Removing a downline person is a soft-delete (status='removed'); the row, its
 * email, and the Supabase login all linger, which is why re-adding the same email
 * used to fail with "already exists". This moves the email aside to a tombstone
 * (`deleted+<personId>+<original>`, kept unique by the person id) and deletes the
 * dead login, so the real address is free everywhere. The person row stays for
 * history; a superadmin can restore the original email later.
 *
 * Best-effort and idempotent — safe to call more than once.
 */
export async function freeRemovedPersonEmail(admin: Admin, personId: string): Promise<void> {
  const { data: person } = await admin
    .from("person")
    .select("email, auth_user_id")
    .eq("id", personId)
    .maybeSingle();
  if (!person?.email) return;

  const email = person.email as string;
  if (email.startsWith("deleted+")) return; // already freed

  // Delete their login so the address is free in the auth system too — otherwise
  // re-adding the same email can't mint a fresh invite link for it.
  const authUserId =
    (person.auth_user_id as string | null) ?? (await findAuthUserIdByEmail(admin, email));
  if (authUserId) {
    await admin.auth.admin.deleteUser(authUserId).catch(() => {});
  }

  // Move the email aside and drop the now-dead login link.
  await admin
    .from("person")
    .update({ email: `deleted+${personId}+${email}`, auth_user_id: null })
    .eq("id", personId);
}
