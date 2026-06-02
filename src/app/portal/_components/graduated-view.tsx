import Card from "./card";
import type { Recruit } from "@/lib/db/types";

export default function GraduatedView({ recruit }: { recruit: Recruit }) {
  return (
    <Card
      title="Welcome to the Road to 40k"
      subtitle="You hit the 8-in-28 gate. You’re officially a Rookie."
    >
      <p className="text-sm text-subtle">
        Bootcamp graduated on{" "}
        <span className="font-medium text-ink">
          {recruit.bootcamp_started_at
            ? new Date(
                new Date(recruit.bootcamp_started_at).getTime() +
                  28 * 24 * 60 * 60 * 1000,
              )
                .toISOString()
                .slice(0, 10)
            : "—"}
        </span>
        . Road-to-40k tools land in V2.
      </p>
    </Card>
  );
}
