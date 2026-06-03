"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { devAccountByRole } from "@/lib/devLogin";
import { resetDevRecruitByPersonId } from "@/lib/devReset";
import {
  setExamDate,
  markStudying,
  markExamPassed,
  markExamFailed,
  markGuideRead,
  markLicensingSubmitted,
} from "@/lib/actions/pipeline";
import type { MilestoneKind } from "@/lib/db/types";
import { MILESTONE_KINDS } from "@/lib/db/types";

async function getRecruitForCurrent() {
  const person = await getCurrentPerson();
  if (!person) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("recruit")
    .select("id, person_id, phase, phase_step, bootcamp_started_at")
    .eq("person_id", person.id)
    .maybeSingle();
  return data
    ? {
        ...data,
        person,
        supabase,
      }
    : null;
}

// Step 2, part one: just save the date. This writes the exam_date column
// directly (RLS lets a recruit update their own row) WITHOUT advancing the
// step, so "Save date" only fills the field — the recruit still has to click
// "Mark as completed" to move forward.
export async function saveExamDateForm(formData: FormData) {
  const recruitId = String(formData.get("recruitId") ?? "");
  const date = String(formData.get("examDate") ?? "");
  if (!recruitId || !date) redirect("/portal");
  const supabase = await createClient();
  await supabase.from("recruit").update({ exam_date: date }).eq("id", recruitId);
  revalidatePath("/portal");
  redirect("/portal");
}

// Step 2, part two: "Mark as completed" — advance logged_in → exam_scheduled
// using the already-saved date. The guarded RPC does the actual step change.
export async function markExamScheduledForm(formData: FormData) {
  const recruitId = String(formData.get("recruitId") ?? "");
  const date = String(formData.get("examDate") ?? "");
  if (!recruitId || !date) redirect("/portal");
  await setExamDate(recruitId, date);
  redirect("/portal");
}

// Step 5: "Mark as completed" on the Sircon card. Stamps licensing_submitted_at,
// which unlocks the closing success card.
export async function markLicensingSubmittedForm(formData: FormData) {
  const recruitId = String(formData.get("recruitId") ?? "");
  if (!recruitId) redirect("/portal");
  await markLicensingSubmitted(recruitId);
  redirect("/portal");
}

export async function markStudyingForm(formData: FormData) {
  const recruitId = String(formData.get("recruitId") ?? "");
  if (!recruitId) redirect("/portal");
  await markStudying(recruitId);
  redirect("/portal");
}

export async function markExamPassedForm(formData: FormData) {
  const recruitId = String(formData.get("recruitId") ?? "");
  if (!recruitId) redirect("/portal");
  await markExamPassed(recruitId);
  redirect("/portal");
}

export async function markExamFailedForm(formData: FormData) {
  const recruitId = String(formData.get("recruitId") ?? "");
  if (!recruitId) redirect("/portal");
  await markExamFailed(recruitId);
  redirect("/portal");
}

export async function markGuideReadForm(formData: FormData) {
  const recruitId = String(formData.get("recruitId") ?? "");
  if (!recruitId) redirect("/portal");
  await markGuideRead(recruitId);
  redirect("/portal");
}

// Testing convenience: wipe the demo recruit's licensing progress back to
// step 1. Gated to the seeded demo account by email — a real recruit can never
// trigger it, and it only ever touches that one account's own row.
export async function resetLicensingForm() {
  const person = await getCurrentPerson();
  if (!person) redirect("/auth/signin");
  if (person.email !== devAccountByRole("recruit")?.email) redirect("/portal");
  await resetDevRecruitByPersonId(person.id);
  redirect("/portal");
}

export async function recordCheckIn(formData: FormData) {
  const ctx = await getRecruitForCurrent();
  if (!ctx) redirect("/auth/signin");

  const returnTo = String(formData.get("returnTo") ?? "/portal");
  const today = new Date().toISOString().slice(0, 10);
  const summary = String(formData.get("summary") ?? "").trim();
  if (!summary) redirect(`${returnTo}?error=summary-required`);

  const isBootcamp = ctx.phase === "bootcamp";
  const pacing = isBootcamp
    ? {
        dials: numOr(formData.get("pacing_dials"), 0),
        appts: numOr(formData.get("pacing_appts"), 0),
        presentations: numOr(formData.get("pacing_presentations"), 0),
        closes: numOr(formData.get("pacing_closes"), 0),
      }
    : null;
  const actuals = isBootcamp
    ? {
        dials: numOr(formData.get("actual_dials"), 0),
        appts: numOr(formData.get("actual_appts"), 0),
        presentations: numOr(formData.get("actual_presentations"), 0),
        closes: numOr(formData.get("actual_closes"), 0),
      }
    : null;

  // Upsert: one per recruit per day.
  const { error } = await ctx.supabase.from("check_in").upsert(
    {
      recruit_id: ctx.id,
      check_in_date: today,
      summary,
      pacing,
      actuals,
    },
    { onConflict: "recruit_id,check_in_date" },
  );
  if (error) redirect(`${returnTo}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=check-in`);
}

export async function markMilestone(formData: FormData) {
  const ctx = await getRecruitForCurrent();
  if (!ctx) redirect("/auth/signin");
  const kind = String(formData.get("kind") ?? "") as MilestoneKind;
  if (!MILESTONE_KINDS.includes(kind)) {
    redirect("/portal?error=bad-milestone");
  }
  const { error } = await ctx.supabase.from("milestone").insert({
    recruit_id: ctx.id,
    kind,
  });
  if (error && !error.message.includes("duplicate")) {
    redirect(`/portal?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/portal");
  redirect(`/portal?milestone=${kind}`);
}

export async function addPolicySubmission(formData: FormData) {
  const ctx = await getRecruitForCurrent();
  if (!ctx) redirect("/auth/signin");
  if (ctx.phase !== "bootcamp") redirect("/portal?error=not-in-bootcamp");

  const submittedAt = String(formData.get("submittedAt") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!submittedAt) redirect("/portal?error=date-required");

  const { error } = await ctx.supabase.from("policy_submission").insert({
    recruit_id: ctx.id,
    submitted_at: submittedAt,
    note,
  });
  if (error) redirect(`/portal?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/portal");
  redirect("/portal?ok=policy");
}

export async function completeLesson(formData: FormData) {
  const ctx = await getRecruitForCurrent();
  if (!ctx) redirect("/auth/signin");
  const returnTo = String(formData.get("returnTo") ?? "/portal");
  const lessonId = String(formData.get("lessonId") ?? "");
  if (!lessonId) redirect(`${returnTo}?error=missing-lesson`);

  const { error } = await ctx.supabase
    .from("lesson_completion")
    .insert({ recruit_id: ctx.id, lesson_id: lessonId });
  if (error && !error.message.includes("duplicate")) {
    redirect(`${returnTo}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(returnTo);
  redirect(`${returnTo}?ok=lesson`);
}

function numOr(v: FormDataEntryValue | null, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
