"use client";

import { useMemo, useState } from "react";

export type ManualScorecardPersonOption = {
  id: string;
  fullName: string;
  email: string;
};

export function ManualScorecardSelector({
  people,
  initialPersonId = "",
  initialPeriodKind = "monthly",
  initialPeriodStart = "",
}: {
  people: ManualScorecardPersonOption[];
  initialPersonId?: string;
  initialPeriodKind?: "monthly" | "quarterly" | "annual";
  initialPeriodStart?: string;
}) {
  const selected = people.find((person) => person.id === initialPersonId);
  const [query, setQuery] = useState(selected ? `${selected.fullName} ${selected.email}` : "");
  const [personId, setPersonId] = useState(initialPersonId);
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
      <label className="text-sm text-subtle">
        Period type
        <select
          name="manualPeriodKind"
          required
          defaultValue={initialPeriodKind}
          className="mt-2 w-full rounded-lg border border-hairline bg-background px-3 py-2.5 text-ink"
        >
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="annual">Annual</option>
        </select>
      </label>
      <label className="text-sm text-subtle">
        Period start
        <input
          name="manualPeriodStart"
          type="date"
          required
          defaultValue={initialPeriodStart}
          className="mt-2 w-full rounded-lg border border-hairline bg-background px-3 py-2.5 text-ink"
        />
      </label>
      <p className="self-end text-sm leading-6 text-mute md:col-span-2">
        Check the historical period-end role before Generate becomes available. Calendar boundaries are derived server-side.
      </p>
      <button
        type="submit"
        className="rounded-lg border border-accent px-5 py-3 text-sm font-semibold text-accent transition-colors hover:bg-accent/10 md:col-span-2 lg:col-span-1"
      >
        Check applicability
      </button>
    </form>
  );
}