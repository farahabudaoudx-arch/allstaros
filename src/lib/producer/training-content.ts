import { createClient } from "@/lib/supabase/server";
import {
  getProgram,
  type Course,
  type Program,
  type ProgramKey,
  type Tone,
} from "@/lib/producer/trainings";

/** A DB row from training_content. */
export type TrainingContentRow = {
  id: string;
  library: string;
  title: string;
  embed_url: string;
  sort_order: number;
};

/** Libraries backed by training_content + a flat-list program page. */
export const ALL_LIBRARIES = [
  "recruit",
  "live",
  "bootcamp",
  "accelerator",
  "uplevel",
  "all-star-tv",
  "live-dials",
  "case-studies",
] as const;
export type ContentLibrary = (typeof ALL_LIBRARIES)[number];

export const LIBRARY_LABELS: Record<ContentLibrary, string> = {
  recruit: "Recruit Launch Pad",
  live: "Previous Live Trainings",
  bootcamp: "Bootcamp",
  accelerator: "Accelerator",
  uplevel: "Uplevel",
  "all-star-tv": "Agent Vlogs",
  "live-dials": "Live Sales Calls",
  "case-studies": "Case Studies",
};

const TONES: Tone[] = ["coral", "gold", "green", "sky", "violet", "rose"];

/**
 * Build a CoursePlatform Program from training_content rows — a flat list, one
 * course per video, mirroring liveTrainingProgram in bunny.ts. Title/subtitle
 * are inherited from the hardcoded program so the page heading is unchanged.
 */
export function programFromDbRows(
  key: ProgramKey,
  rows: TrainingContentRow[],
): Program {
  const base = getProgram(key);
  const courses: Course[] = rows.map((r, i) => ({
    id: r.id,
    title: r.title,
    blurb: "",
    description: "",
    category: base.title,
    level: "All levels",
    status: "active",
    rating: 5,
    ratingCount: 0,
    tone: TONES[i % TONES.length],
    instructor: { name: "", title: "" },
    durationLabel: "",
    embedUrl: r.embed_url,
    section: "all",
    lectures: [],
  }));
  return {
    ...base,
    // A single section renders as one flat list (no status tabs).
    sections: [{ key: "all", label: "All" }],
    courses,
  };
}

/** Fetch a library's content rows in display order. */
export async function getLibraryContent(
  library: string,
): Promise<TrainingContentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_content")
    .select("id, library, title, embed_url, sort_order")
    .eq("library", library)
    .order("sort_order", { ascending: true });
  return (data ?? []) as TrainingContentRow[];
}

/**
 * Resolve a program-page's program from customer-local content only. An empty
 * library stays empty; it never falls back to the All Star placeholder catalog.
 */
export async function resolveProgram(
  key: Extract<ContentLibrary, "bootcamp" | "accelerator" | "uplevel">,
): Promise<Program> {
  const rows = await getLibraryContent(key);
  return programFromDbRows(key, rows);
}
