"use client";

import { useMemo, useState } from "react";
import type { ScorecardPeriod } from "@/lib/scorecards/period";

export type ManualScorecardPersonOption = {
  id: string;
  fullName: string;
  email: string;
};

function periodKey(period: Pick<ScorecardPeriod, "kind" | "start">) {
  return `${period.kind}:${period.start}`;
}

function periodKindLabel(kind: ScorecardPeriod["kind"]) {
  if (kind === "monthly") return "Months";
  if (kind === "quarterly") return "Quarters";
  return "Years";
}

export function ManualScorecardSelector({
  people,
  periods,
  initialPersonId = "",
  initialPeriodKind = "monthly",
  initialPeriodStart = "",
}: {
  people: ManualScorecardPersonOption[];
  periods: ScorecardPeriod[];
  initialPersonId?: string;
  initialPeriodKind?: "monthly" | "quarterly" | "annual";
  initialPeriodStart?: string;
}) {
  const selected = people.find((person) => person.id === initialPersonId);
  const [query, setQuery] = useState(selected ? `${selected.fullName} ${selected.email}` : "");
  const [personId, setPersonId] = useState(initialPersonId);
  const initialPeriodKey = periods.some((period) => period.kind === initialPeriodKind && period.start === initialPeriodStart)
    ? `${initialPeriodKind}:${initialPeriodStart}`
    : periodKey(periods.find((period) => period.kind === initialPeriodKind) ?? periods[0]);
  const [selectedPeriodKey, setSelectedPeriodKey] = useState(initialPeriodKey);
  const selectedPeriod = periods.find((period) => periodKey(period) === selectedPeriodKey) ?? periods[0];
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = !needle
      ? people.slice(0, 50)
      : people
          .filter((person) => `${person.fullName} ${person.email}`.toLowerCase().includes(needle))
          .slice(0, 50);
    if (personId && !matches.some((person) => person.id === personId)) {
      const selectedPerson = people.find((person) => person.id === personId);
      if (selectedPerson) return [selectedPerson, ...matches].slice(0, 50);
    }
    return matches;
  }, [people, personId, query]);

  return (
    <form method="get" action="/admin/scorecards" className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
      <label className="text-sm text-subtle md:col-span-2">
        Search person
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name or email"
          autoComplete="off"
          className="mt-2 w-full rounded-lg border border-hairline bg-background px-3 py-2.5 text-ink"
        />
      </label>
      <label className="text-sm text-subtle md:col-span-2">
        Selected person
        <select
          name="manualPersonId"
          required
          value={personId}
          onChange={(event) => setPersonId(event.target.value)}
          className="mt-2 w-full rounded-lg border border-hairline bg-background px-3 py-2.5 text-ink"
        >
          <option value="">Choose one person</option>
          {filtered.map((person) => (
            <option key={person.id} value={person.id}>
              {person.fullName} — {person.email}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm text-subtle md:col-span-2">
        Closed period
        <select
          required
          value={selectedPeriodKey}
          onChange={(event) => setSelectedPeriodKey(event.target.value)}
          className="mt-2 w-full rounded-lg border border-hairline bg-background px-3 py-2.5 text-ink"
        >
          {(["monthly", "quarterly", "annual"] as const).map((kind) => (
            <optgroup key={kind} label={periodKindLabel(kind)}>
              {periods.filter((period) => period.kind === kind).map((period) => (
                <option key={periodKey(period)} value={periodKey(period)}>{period.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <input type="hidden" name="manualPeriodKind" value={selectedPeriod?.kind ?? ""} />
      <input type="hidden" name="manualPeriodStart" value={selectedPeriod?.start ?? ""} />
      <p className="self-end text-sm leading-6 text-mute md:col-span-2">
        Choose a named, fully closed Month, Quarter, or Year. Calendar boundaries are derived server-side.
      </p>
      <button
        type="submit"
        disabled={!selectedPeriod}
        className="rounded-lg border border-accent px-5 py-3 text-sm font-semibold text-accent transition-colors hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2 lg:col-span-1"
      >
        Check recovery eligibility
      </button>
    </form>
  );
}