import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { programFromDbRows } from "./training-content";

describe("customer training content", () => {
  it("keeps an empty library empty instead of returning the hardcoded catalog", () => {
    const program = programFromDbRows("accelerator", []);
    expect(program.key).toBe("accelerator");
    expect(program.courses).toEqual([]);
  });

  it("maps only the supplied customer rows into the program", () => {
    const program = programFromDbRows("uplevel", [
      {
        id: "customer-video-1",
        library: "uplevel",
        title: "Customer leadership lesson",
        embed_url: "https://video.example.test/embed/1",
        sort_order: 10,
      },
    ]);
    expect(program.courses).toHaveLength(1);
    expect(program.courses[0]).toMatchObject({
      id: "customer-video-1",
      title: "Customer leadership lesson",
      embedUrl: "https://video.example.test/embed/1",
    });
    expect(JSON.stringify(program.courses)).not.toContain("Nicholas Verge");
  });
});
