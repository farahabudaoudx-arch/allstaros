"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";
import { createServiceRoleClient } from "@/lib/supabase/server";

const BACK = "/admin/schedule";

function done(query: string): never {
  revalidatePath(BACK);
  revalidatePath("/producer");
  redirect(`${BACK}?${query}`);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function initialsFrom(host: string): string {
  return host
    .trim()
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 3);
}

type Fields = {
  title: string;
  host: string;
  initials: string;
  image: string | null;
  kicker: string | null;
  event_date: string;
  start_time: string;
  end_time: string;
  timezone: string;
  zoom_url: string | null;
  sort_order: number;
};

function readFields(formData: FormData): Fields | string {
  const title = String(formData.get("title") ?? "").trim();
  const event_date = String(formData.get("event_date") ?? "").trim();
  if (!title) return "Title is required.";
  if (!event_date) return "Event date is required.";
  const host = String(formData.get("host") ?? "").trim();
  const initialsRaw = String(formData.get("initials") ?? "").trim();
  const sortRaw = Number(String(formData.get("sort_order") ?? "0"));
  return {
    title,
    host,
    initials: initialsRaw || initialsFrom(host),
    image: String(formData.get("image") ?? "").trim() || null,
    kicker: String(formData.get("kicker") ?? "").trim() || null,
    event_date,
    start_time: String(formData.get("start_time") ?? "").trim() || "08:30",
    end_time: String(formData.get("end_time") ?? "").trim() || "09:00",
    timezone: String(formData.get("timezone") ?? "").trim() || "America/Chicago",
    zoom_url: String(formData.get("zoom_url") ?? "").trim() || null,
    sort_order: Number.isFinite(sortRaw) ? Math.round(sortRaw) : 0,
  };
}

export async function adminCreateScheduleEvent(formData: FormData) {
  await requireAdmin();
  const fields = readFields(formData);
  if (typeof fields === "string") done(`error=${encodeURIComponent(fields)}`);

  // Unique slug: title-based plus a short suffix to dodge collisions.
  const suffix = String(formData.get("event_date") ?? "").replace(/-/g, "").slice(4);
  const slug = `${slugify(fields.title)}-${suffix || "ev"}`;

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("training_schedule")
    .insert({ slug, ...fields });
  if (error) done(`error=${encodeURIComponent(error.message)}`);
  done("ok=created");
}

export async function adminUpdateScheduleEvent(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) done(`error=${encodeURIComponent("Missing event.")}`);
  const fields = readFields(formData);
  if (typeof fields === "string") done(`error=${encodeURIComponent(fields)}`);

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("training_schedule")
    .update(fields)
    .eq("id", id);
  if (error) done(`error=${encodeURIComponent(error.message)}`);
  done("ok=updated");
}

export async function adminDeleteScheduleEvent(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) done(`error=${encodeURIComponent("Missing event.")}`);

  const admin = createServiceRoleClient();
  const { error } = await admin.from("training_schedule").delete().eq("id", id);
  if (error) done(`error=${encodeURIComponent(error.message)}`);
  done("ok=deleted");
}
