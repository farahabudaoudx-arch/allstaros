import { Badge, Card } from "@/components/ui";
import type { BuildReadiness } from "@/lib/whitelabel/types";

const sectionLabel = {
  intake: "Intake",
  payment: "Payment",
  access: "Access",
  scope: "Scope",
} as const;

export function ReadinessPanel({ readiness }: { readiness: BuildReadiness }) {
  return (
    <Card accent={readiness.ready}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-mute">Intake readiness</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">
            {readiness.ready ? "Ready for the build stage" : "Required setup is still missing"}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-subtle">
            Readiness is derived from saved intake, payment, agreed scope, and required service access. It is never a manual “ready” switch.
          </p>
        </div>
        <Badge tone={readiness.ready ? "pos" : "warn"}>
          {readiness.ready ? "Ready" : `${readiness.missing.length} blocker${readiness.missing.length === 1 ? "" : "s"}`}
        </Badge>
      </div>

      {!readiness.ready ? (
        <ul className="mt-5 grid gap-2 md:grid-cols-2">
          {readiness.missing.map((issue) => (
            <li key={issue.key} className="rounded-xl border border-hairline bg-card-hi px-3.5 py-3">
              <span className="text-[10px] uppercase tracking-[0.14em] text-mute">
                {sectionLabel[issue.section]}
              </span>
              <div className="mt-1 text-sm text-ink">{issue.label}</div>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
