"use server";

import * as Sentry from "@sentry/nextjs";
import { getCurrentPerson } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type NpnResult = { ok: true } | { ok: false; error: string };

/**
 * The NPN request popup writes through here, never a browser-to-Supabase write. person has
 * no client write policy (RLS is select-only), so every write uses the service
 * role pinned to the caller's own id. Each action re-checks auth itself: server
 * actions are reachable by direct POST, so layout-level gating is not enough.
 *
 * A user can only ever land on "submitted" (entered a number) or
 * "pending_license" (said they have none). "verified"/"pending_sale"/
 * "pending_transfer" are admin-only and are never settable here.
 */

/** True only for an active producer/builder (the audience the popup targets). */
async function requireProducerOrBuilder() {
  const person = await getCurrentPerson();
  if (!person) return { person: null, error: "Not signed in." as const };
  if (person.status !== "active" || (!person.is_producer && !person.is_builder)) {
    return { person: null, error: "Not allowed." as const };
  }
  return { person, error: null };
}

/** They typed an NPN and hit Submit → save it as submitted, pending verification. */
export async function submitNpn(raw: string): Promise<NpnResult> {
  // Numbers only, up to 10 digits (per product decision).
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 1 || digits.length > 10) {
    return { ok: false, error: "Please enter your NPN (numbers only, up to 10 digits)." };
  }

  try {
    const { person, error } = await requireProducerOrBuilder();
    if (!person) return { ok: false, error };

    // Don't let a stale popup downgrade someone already handled (e.g. verified
    // from the Gateway backfill). The popup only shows while status is missing.
    if (person.npn_status !== "missing") return { ok: true };

    const admin = createServiceRoleClient();
    const { error: updErr } = await admin
      .from("person")
      .update({ npn: digits, npn_status: "submitted", npn_source: "pop_up" })
      .eq("id", person.id);
    if (updErr) return { ok: false, error: updErr.message };

    return { ok: true };
  } catch (err) {
    Sentry.captureException(err);
    console.error("[npn] submit failed:", err);
    return { ok: false, error: "We couldn't save your NPN. Please try again." };
  }
}

/**
 * Save/correct an NPN from the Settings tab. Unlike the popup, this allows
 * editing an already-submitted or pending number, but a verified number is
 * locked (only an admin can change a confirmed NPN). Source is user_entered.
 */
export async function saveNpn(raw: string): Promise<NpnResult> {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length < 1 || digits.length > 10) {
    return { ok: false, error: "Please enter your NPN (numbers only, up to 10 digits)." };
  }

  try {
    const { person, error } = await requireProducerOrBuilder();
    if (!person) return { ok: false, error };

    if (person.npn_status === "verified") {
      return {
        ok: false,
        error: "Your NPN is already verified. Contact your admin to change it.",
      };
    }

    const admin = createServiceRoleClient();
    const { error: updErr } = await admin
      .from("person")
      .update({ npn: digits, npn_status: "submitted", npn_source: "user_entered" })
      .eq("id", person.id);
    if (updErr) return { ok: false, error: updErr.message };

    return { ok: true };
  } catch (err) {
    Sentry.captureException(err);
    console.error("[npn] settings save failed:", err);
    return { ok: false, error: "We couldn't save your NPN. Please try again." };
  }
}

/** They said they don't have an NPN yet → mark pending_license, no number. */
export async function declineNpn(): Promise<NpnResult> {
  try {
    const { person, error } = await requireProducerOrBuilder();
    if (!person) return { ok: false, error };

    if (person.npn_status !== "missing") return { ok: true };

    const admin = createServiceRoleClient();
    const { error: updErr } = await admin
      .from("person")
      .update({ npn: null, npn_status: "pending_license", npn_source: "pop_up" })
      .eq("id", person.id);
    if (updErr) return { ok: false, error: updErr.message };

    return { ok: true };
  } catch (err) {
    Sentry.captureException(err);
    console.error("[npn] decline failed:", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
