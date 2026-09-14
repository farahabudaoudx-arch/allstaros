"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  ALL_LIBRARIES,
  type ContentLibrary,
} from "@/lib/producer/training-content";

const BACK = "/admin/content/training";

function done(query: string): never {
  revalidatePath(BACK);
  revalidatePath("/producer");
  revalidatePath("/portal/training");
  redirect(`${BACK}?${query}`);
}

function libraryValue(value: FormDataEntryValue | null): ContentLibrary {
  const library = String(value ?? "") as ContentLibrary;
  if (!(ALL_LIBRARIES as readonly string[]).includes(library)) {
    throw new Error("Unsupported training library.");
  }
  return library;
}

function embedUrlValue(value: FormDataEntryValue | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("Video embed URL is required.");
  if (raw.length > 1200) throw new Error("Video embed URL is too long.");
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
      throw new Error("unsafe");
    }
    return url.toString();
  } catch {
    throw new Error("Video embed URL must be a safe HTTPS URL.");
  }
}

function readFields(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title || title.length > 240) throw new Error("A title up to 240 characters is required.");
  const sortRaw = Number(String(formData.get("sort_order") ?? "0"));
  if (!Number.isFinite(sortRaw) || Math.abs(sortRaw) > 100000) throw new Error("Sort order is invalid.");
  return {
    library: libraryValue(formData.get("library")),
    title,
    embed_url: embedUrlValue(formData.get("embed_url")),
    sort_order: Math.round(sortRaw),
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid training content.";
}

export async function adminCreateTrainingContent(formData: FormData) {
  await requireAdmin(BACK);
  let fields: ReturnType<typeof readFields>;
  try {
    fields = readFields(formData);
  } catch (error) {
    done(`error=${encodeURIComponent(message(error))}`);
  }
  const admin = createServiceRoleClient();
  const { error } = await admin.from("training_content").insert(fields);
  if (error) done(`error=${encodeURIComponent("Training content could not be added.")}`);
  done("ok=created");
}

export async function adminUpdateTrainingContent(formData: FormData) {
  await requireAdmin(BACK);
  const id = String(formData.get("id") ?? "").trim();
  if (!id) done(`error=${encodeURIComponent("Training item is missing.")}`);
  let fields: ReturnType<typeof readFields>;
  try {
    fields = readFields(formData);
  } catch (error) {
    done(`error=${encodeURIComponent(message(error))}`);
  }
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("training_content")
    .update(fields)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data) done(`error=${encodeURIComponent("Training item could not be saved.")}`);
  done("ok=updated");
}

export async function adminDeleteTrainingContent(formData: FormData) {
  await requireAdmin(BACK);
  const id = String(formData.get("id") ?? "").trim();
  if (!id) done(`error=${encodeURIComponent("Training item is missing.")}`);
  const admin = createServiceRoleClient();
  const { error } = await admin.from("training_content").delete().eq("id", id);
  if (error) done(`error=${encodeURIComponent("Training item could not be removed.")}`);
  done("ok=deleted");
}
