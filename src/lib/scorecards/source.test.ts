import { describe, expect, it } from "vitest";
import {
  currentMonthlyPeriod,
  expectedDatesForSchedule,
  expectedDatesForScheduleHistory,
  monthlyProducerSourceFromRows,
} from "./source";

describe("monthly Producer source adapter", () => {
  it("applies workday exceptions without marking ordinary days off", () => {
    expect(
      expectedDatesForSchedule({
        periodStart: "2026-08-01",
        periodEnd: "2026-08-07",
        workingWeekdays: [1, 2, 3, 4, 5],
        exceptions: [
          { exception_date: "2026-08-03", is_working_day: false },
          { exception_date: "2026-08-02", is_working_day: true },
        ],
      }),
    ).toEqual(["2026-08-02", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"]);
  });

  it("uses the schedule effective on each date when a schedule changes mid-month", () => {
    expect(
      expectedDatesForScheduleHistory({
        periodStart: "2026-08-03",
        periodEnd: "2026-08-07",
        schedules: [
          { id: "old", effective_from: "2026-08-01", effective_to: "2026-08-04", working_weekdays: [1, 2, 3, 4, 5], created_at: "2026-08-01T00:00:00Z" },
          { id: "new", effective_from: "2026-08-05", effective_to: null, working_weekdays: [1, 3, 5], created_at: "2026-08-05T00:00:00Z" },
        ],
        exceptions: [
          { schedule_id: "new", exception_date: "2026-08-07", is_working_day: false },
        ],
      }),
    ).toEqual(["2026-08-03", "2026-08-04", "2026-08-05"]);
  });

  it("uses America/Chicago when selecting the current month", () => {
    expect(currentMonthlyPeriod(new Date("2026-09-01T04:30:00.000Z"))).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
      label: "August 2026",
    });
  });

  it("keeps organization report dates while exposing only the requested producer", () => {
    const source = monthlyProducerSourceFromRows({
      producerId: "producer-1",
      period: { start: "2026-08-01", end: "2026-08-31", label: "August 2026" },
      generatedAt: "2026-08-20T12:00:00.000Z",
      reportImports: [
        { report_date: "2026-08-07", gateway_label: "August Week 1" },
        { report_date: "2026-08-14", gateway_label: "August Week 2" },
      ],
      rows: [
        { person_id: "other", report_date: "2026-08-07", gateway_label: "August Week 1", personal_ip_cents: 999 },
        { person_id: "producer-1", report_date: "2026-08-14", gateway_label: "August Week 2", personal_ip_cents: 2500000 },
        { person_id: "other", report_date: "2026-08-14", gateway_label: "August Week 2", personal_ip_cents: 888 },
      ],
    });

    expect(source.reportDates).toEqual([
      { reportDate: "2026-08-07", label: "August Week 1" },
      { reportDate: "2026-08-14", label: "August Week 2" },
    ]);
    expect(source.producerRows).toEqual([
      { reportDate: "2026-08-14", personalIpCents: 2500000 },
    ]);
  });

  it("includes an imported report even when it produced no premium rows", () => {
    const source = monthlyProducerSourceFromRows({
      producerId: "producer-1",
      period: { start: "2026-08-01", end: "2026-08-31", label: "August 2026" },
      generatedAt: "2026-08-08T12:00:00.000Z",
      reportImports: [
        { report_date: "2026-08-07", gateway_label: "August Week 1" },
      ],
      rows: [],
    });

    expect(source.reportDates).toEqual([
      { reportDate: "2026-08-07", label: "August Week 1" },
    ]);
    expect(source.producerRows).toEqual([]);
  });
});
