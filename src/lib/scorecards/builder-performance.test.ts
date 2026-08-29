import { describe, expect, it } from "vitest";
import { createBuilderAgencyPerformance } from "./builder-performance";

describe("Builder agency performance", () => {
  it("rolls monthly production through each active Builder's full agency and ranks recorded performance", () => {
    const performance = createBuilderAgencyPerformance({
      people: [
        { id: "a", uplineId: null },
        { id: "b", uplineId: "a" },
        { id: "c", uplineId: "a" },
        { id: "d", uplineId: "c" },
        { id: "e", uplineId: null },
        { id: "f", uplineId: "e" },
      ],
      eligibleBuilderIds: ["a", "c", "e"],
      gatewayRows: [
        { builderId: "a", teamIpCents: 100_000, firstLegPercent: 40 },
        { builderId: "c", teamIpCents: 60_000, firstLegPercent: 60 },
        { builderId: "e", teamIpCents: 40_000, firstLegPercent: 20 },
      ],
      activeWriterIds: ["b", "d", "f"],
      activeDirectWriterIds: ["b", "d", "f"],
      activePersonIds: ["a", "b", "c", "d", "e", "f"],
      personProduction: [
        { personId: "b", dials: 100, contacts: 10, presentations: 5, sales: 2, apCents: 10_000 },
        { personId: "d", dials: 50, contacts: 5, presentations: 3, sales: 1, apCents: 5_000 },
        { personId: "f", dials: 10, contacts: 1, presentations: 1, sales: 1, apCents: 2_000 },
      ],
      recruitPersonIds: ["d"],
    });

    expect(performance.get("a")).toEqual({
      activeWriters: { value: 1, rank: { rank: 1, population: 3 } },
      teamDials: { value: 150, rank: { rank: 1, population: 3 } },
      teamContacts: { value: 15, rank: { rank: 1, population: 3 } },
      teamPresentations: { value: 8, rank: { rank: 1, population: 3 } },
      teamSales: { value: 3, rank: { rank: 1, population: 3 } },
      teamAp: { value: 15_000, rank: { rank: 1, population: 3 } },
      teamIp: { value: 100_000, rank: { rank: 1, population: 3 } },
      firstLegPercent: { value: 40, rank: { rank: 2, population: 3 } },
      averageIpPerWriter: { value: 50_000, rank: { rank: 2, population: 3 } },
      recruits: { value: 1, rank: { rank: 1, population: 2 } },
    });
  });
});
