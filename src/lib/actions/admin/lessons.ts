"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";

const BACK = "/admin/training";

function done(query: string): never {
  revalidatePath(BACK);
  revalidatePath("/portal");
  redirect(`${BACK}?${query}`);
}

/** Add a recruit-portal lesson (training_lesson). */
export async function adminCreateLesson(formData: FormData) {
  await requireAdmin();
  const title = String(formData.get("title") ?? "").trim();
  const video_url = String(formData.get("video_url") ?? "").trim() || null;
  const phase = String(formData.get("phase") ?? "");
  const sortRaw = Number(String(formData.get("sort_order") ?? "0"));
  const is_assignment = String(formData.get("is_assignment") ?? "") === "on";

  if (!title) done(`error=${encodeURIComponent("Title is required.")}`);
  if (phase !== "licensing" && phase !== "onboarding") {
    done(`error=${encodeURIComponent("Phase must be licensing or onboarding.")}`);
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.from("training_lesson").insert({
    title,
    video_url,
    phase,
    sort_order: Number.isFinite(sortRaw) ? Math.round(sortRaw) : 0,
    is_assignment,
  });
  if (error) done(`error=${encodeURIComponent(error.message)}`);
  done("ok=lesson");
}

export async function adminDeleteLesson(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) done(`error=${encodeURIComponent("Missing lesson.")}`);

  const admin = createServiceRoleClient();
  const { error } = await admin.from("training_lesson").delete().eq("id", id);
  if (error) done(`error=${encodeURIComponent(error.message)}`);
  done("ok=lessonDeleted");
}
