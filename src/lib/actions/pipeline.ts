"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Phase, PhaseStep, Recruit } from "@/lib/db/types";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** Recruit-only: schedule the state exam. */
export async function setExamDate(
  recruitId: string,
  date: string,
): Promise<ActionResult<Recruit>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recruit_set_exam_date", {
    p_recruit: recruitId,
    p_date: date,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/portal");
  revalidatePath(`/dashboard/recruits/${recruitId}`);
  return { ok: true, data: data as Recruit };
}

/** Recruit-only: mark studying (got study login). Moves exam_scheduled → studying. */
export async function markStudying(
  recruitId: string,
): Promise<ActionResult<Recruit>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recruit_mark_studying", {
    p_recruit: recruitId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/portal");
  revalidatePath(`/dashboard/recruits/${recruitId}`);
  return { ok: true, data: data as Recruit };
}

/** Recruit-only: mark exam passed (builder still confirms to advance phase). */
export async function markExamPassed(
  recruitId: string,
): Promise<ActionResult<Recruit>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recruit_mark_exam_passed", {
    p_recruit: recruitId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/portal");
  revalidatePath(`/dashboard/recruits/${recruitId}`);
  return { ok: true, data: data as Recruit };
}

/** Recruit-only: record a failed exam attempt. Stays on the current step. */
export async function markExamFailed(
  recruitId: string,
): Promise<ActionResult<Recruit>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recruit_mark_exam_failed", {
    p_recruit: recruitId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/portal");
  revalidatePath(`/dashboard/recruits/${recruitId}`);
  return { ok: true, data: data as Recruit };
}

/** Recruit-only: mark the licensing guide as read. Soft gate, no step change. */
export async function markGuideRead(
  recruitId: string,
): Promise<ActionResult<Recruit>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recruit_mark_guide_read", {
    p_recruit: recruitId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/portal");
  revalidatePath(`/dashboard/recruits/${recruitId}`);
  return { ok: true, data: data as Recruit };
}

/** Builder-only: advance the recruit's phase. */
export async function advancePhase(
  recruitId: string,
  toPhase: Phase,
): Promise<ActionResult<Recruit>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("builder_advance_phase", {
    p_recruit: recruitId,
    p_to_phase: toPhase,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/recruits/${recruitId}`);
  return { ok: true, data: data as Recruit };
}

/** Builder-only: advance the recruit's phase_step. */
export async function setStep(
  recruitId: string,
  toStep: PhaseStep,
): Promise<ActionResult<Recruit>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("builder_set_step", {
    p_recruit: recruitId,
    p_to_step: toStep,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  revalidatePath(`/dashboard/recruits/${recruitId}`);
  return { ok: true, data: data as Recruit };
}
