"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ALL_LIBRARIES } from "@/lib/producer/training-content";

const BACK = "/admin/training";

function done(query: string): never {
  revalidatePath(BACK);
  // Refresh the producer-facing program pages too.
  revalidatePath("/producer/trainings/bootcamp");
  revalidatePath("/producer/trainings/accelerator");
  revalidatePath("/producer/trainings/uplevel");
  redirect(`${BACK}?${query}`);
}

export async function adminCreateContent(formData: FormData) {
  await requireAdmin();
  const library = String(formData.get("library") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const embed_url = String(formData.get("embed_url") ?? "").trim();
  const sortRaw = Number(String(formData.get("sort_order") ?? "0"));

  if (!(ALL_LIBRARIES as readonly string[]).includes(library)) {
    done(`error=${encodeURIComponent("Unknown library.")}`);
  }
  if (!title) done(`error=${encodeURIComponent("Title is required.")}`);
  if (!embed_url) done(`error=${encodeURIComponent("Embed URL is required.")}`);

  const admin = createServiceRoleClient();
  const { error } = await admin.from("training_content").insert({
    library,
    title,
    embed_url,
    sort_order: Number.isFinite(sortRaw) ? Math.round(sortRaw) : 0,
  });
  if (error) done(`error=${encodeURIComponent(error.message)}`);
  done("ok=created");
}

export async function adminDeleteContent(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) done(`error=${encodeURIComponent("Missing item.")}`);

  const admin = createServiceRoleClient();
  const { error } = await admin.from("training_content").delete().eq("id", id);
  if (error) done(`error=${encodeURIComponent(error.message)}`);
  done("ok=deleted");
}
