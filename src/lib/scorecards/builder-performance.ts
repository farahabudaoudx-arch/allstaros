import { countActiveDirects } from "./active-directs";
import type { OrganizationRank } from "./ratings";

export const BUILDER_PERFORMANCE_KEYS = [
  "activeWriters",
  "teamDials",
  "teamContacts",
  "teamPresentations",
  "teamSales",
  "teamAp",
  "teamIp",
  "firstLegPercent",
  "averageIpPerWriter",
  "recruits",
] as const;

export type BuilderPerformanceKey = (typeof BUILDER_PERFORMANCE_KEYS)[number];

export type BuilderMetricResult = {
  value: number | null;
  rank: OrganizationRank;
};

export type BuilderAgencyPerformance = Record<BuilderPerformanceKey, BuilderMetricResult>;
export type BuilderAgencyValues = Record<BuilderPerformanceKey, number | null>;

type Person = { id: string; uplineId: string | null };
type GatewayRow = {
  builderId: string;
  teamIpCents: number;
  firstLegPercent: number | null;
};
type PersonProduction = {
  personId: string;
  dials: number;
  contacts: number;
  presentations: number;
  sales: number;
  apCents: number;
};

export type BuilderPerformanceInput = {
  people: Person[];
  eligibleBuilderIds: string[];
  gatewayRows: GatewayRow[];
  activeWriterIds: string[];
  activeDirectWriterIds: string[];
  activePersonIds: string[];
  personProduction: PersonProduction[];
  recruitPersonIds: string[];
};

function descendantIds(rootId: string, people: Person[]): Set<string> {
  const descendants = new Set([rootId]);
  let foundAnother = true;

  while (foundAnother) {
    foundAnother = false;
    for (const person of people) {
      if (person.uplineId && descendants.has(person.uplineId) && !descendants.has(person.id)) {
        descendants.add(person.id);
        foundAnother = true;
      }
    }
  }

  return descendants;
}

function ranksForRecordedValues(
  values: Map<string, number | null>,
): Map<string, OrganizationRank> {
  const sorted = [...values.values()]
    .filter((value): value is number => value != null && value > 0)
    .sort((left, right) => right - left);

  return new Map([...values].map(([builderId, value]) => [
    builderId,
    {
      rank: value != null && value > 0 ? sorted.indexOf(value) + 1 : null,
      population: sorted.length,
    },
  ]));
}

export function createBuilderAgencyValues(
  input: BuilderPerformanceInput,
): Map<string, BuilderAgencyValues> {
  const eligibleBuilderIds = [...new Set(input.eligibleBuilderIds)];
  const gatewayByBuilder = new Map(input.gatewayRows.map((row) => [row.builderId, row]));
  const activeWriterIds = new Set(input.activeWriterIds);
  const productionByPerson = new Map<string, Omit<PersonProduction, "personId">>();

  for (const row of input.personProduction) {
    const current = productionByPerson.get(row.personId) ?? {
      dials: 0,
      contacts: 0,
      presentations: 0,
      sales: 0,
      apCents: 0,
    };
    productionByPerson.set(row.personId, {
      dials: current.dials + row.dials,
      contacts: current.contacts + row.contacts,
      presentations: current.presentations + row.presentations,
      sales: current.sales + row.sales,
      apCents: current.apCents + row.apCents,
    });
  }

  const rawByBuilder = new Map<string, BuilderAgencyValues>();
  for (const builderId of eligibleBuilderIds) {
    const agencyIds = descendantIds(builderId, input.people);
    const gateway = gatewayByBuilder.get(builderId);
    let teamDials = 0;
    let teamContacts = 0;
    let teamPresentations = 0;
    let teamSales = 0;
    let teamAp = 0;

    for (const personId of agencyIds) {
      const production = productionByPerson.get(personId);
      if (!production) continue;
      teamDials += production.dials;
      teamContacts += production.contacts;
      teamPresentations += production.presentations;
      teamSales += production.sales;
      teamAp += production.apCents;
    }

    const agencyActiveWriters = [...agencyIds].filter((personId) => activeWriterIds.has(personId)).length;
    const activeWriters = countActiveDirects({
      builderId,
      people: input.people,
      activePersonIds: input.activePersonIds,
      recentWriterIds: input.activeDirectWriterIds,
    });
    const teamIp = gateway?.teamIpCents ?? null;
    const recruitAgencyIds = new Set(agencyIds);
    recruitAgencyIds.delete(builderId);

    rawByBuilder.set(builderId, {
      activeWriters,
      teamDials,
      teamContacts,
      teamPresentations,
      teamSales,
      teamAp,
      teamIp,
      firstLegPercent: gateway?.firstLegPercent ?? null,
      averageIpPerWriter: teamIp != null && agencyActiveWriters > 0
        ? Math.round(teamIp / agencyActiveWriters)
        : null,
      recruits: input.recruitPersonIds.filter((personId) => recruitAgencyIds.has(personId)).length,
    });
  }

  return rawByBuilder;
}

export function createBuilderAgencyPerformance(
  input: BuilderPerformanceInput,
): Map<string, BuilderAgencyPerformance> {
  const rawByBuilder = createBuilderAgencyValues(input);
  const ranks = Object.fromEntries(BUILDER_PERFORMANCE_KEYS.map((key) => [
    key,
    ranksForRecordedValues(new Map([...rawByBuilder].map(([builderId, values]) => [builderId, values[key]]))),
  ])) as Record<BuilderPerformanceKey, Map<string, OrganizationRank>>;

  return new Map([...rawByBuilder].map(([builderId, values]) => [
    builderId,
    Object.fromEntries(BUILDER_PERFORMANCE_KEYS.map((key) => [
      key,
      { value: values[key], rank: ranks[key].get(builderId)! },
    ])) as BuilderAgencyPerformance,
  ]));
}
