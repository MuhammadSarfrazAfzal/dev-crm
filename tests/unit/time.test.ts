import { describe, expect, it } from "vitest";
import {
  callingWindow, clampToCallingHours, endOfLocalDay, followupQuickPicks, nextBusinessDayAt,
  toLocalInput, wallClock, zonedToUtc,
} from "@/lib/time";

const NY = "America/New_York";
const LA = "America/Los_Angeles";
const PHX = "America/Phoenix";

describe("zonedToUtc", () => {
  it("converts ordinary times", () => {
    expect(zonedToUtc("2026-10-24T10:00", NY).toISOString()).toBe("2026-10-24T14:00:00.000Z");
    expect(zonedToUtc("2026-12-01T10:00", NY).toISOString()).toBe("2026-12-01T15:00:00.000Z");
    expect(zonedToUtc("2026-07-01T10:00", PHX).toISOString()).toBe("2026-07-01T17:00:00.000Z");
  });
  it("resolves the fall-back overlap to the first occurrence", () => {
    expect(zonedToUtc("2026-11-01T01:30", NY).toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
  it("moves a non-existent spring-forward time forward by the gap", () => {
    const d = zonedToUtc("2026-03-08T02:30", NY);
    expect(d.toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(toLocalInput(d, NY)).toBe("2026-03-08T03:30");
  });
  it("round-trips through toLocalInput", () => {
    for (const local of ["2026-01-15T08:05", "2026-06-30T23:59", "2026-11-01T03:00"]) {
      expect(toLocalInput(zonedToUtc(local, LA), LA)).toBe(local);
    }
  });
  it("rejects garbage", () => {
    expect(() => zonedToUtc("tomorrow", NY)).toThrow();
  });
});

describe("callingWindow", () => {
  it("is ok inside weekday house hours", () => {
    expect(callingWindow(NY, "NY", new Date("2026-10-26T15:00:00Z")).status).toBe("ok"); // Mon 11 am EDT
  });
  it("warns outside house hours but inside legal hours", () => {
    expect(callingWindow(NY, "NY", new Date("2026-10-26T23:30:00Z")).status).toBe("outside_house"); // 7:30 pm
    expect(callingWindow(NY, "NY", new Date("2026-10-24T15:00:00Z")).status).toBe("outside_house"); // Saturday
  });
  it("blocks outside the legal window, with Florida's 8 pm cut-off", () => {
    expect(callingWindow(NY, "NY", new Date("2026-10-26T11:30:00Z")).status).toBe("outside_legal"); // 7:30 am
    expect(callingWindow(NY, "GA", new Date("2026-10-27T00:30:00Z")).status).toBe("outside_house"); // 8:30 pm GA ok
    expect(callingWindow(NY, "FL", new Date("2026-10-27T00:30:00Z")).status).toBe("outside_legal"); // 8:30 pm FL
  });
  it("handles an unknown zone", () => {
    expect(callingWindow(null, null).status).toBe("unknown_zone");
    expect(callingWindow("Mars/Base", null).status).toBe("unknown_zone");
  });
});

describe("follow-up scheduling", () => {
  it("skips weekends for the next business day", () => {
    const fri = new Date("2026-10-23T20:00:00Z"); // Fri 4 pm EDT
    expect(toLocalInput(nextBusinessDayAt(NY, 10, 0, fri), NY)).toBe("2026-10-26T10:00");
  });
  it("crosses the DST change without drifting the wall clock", () => {
    const sat = new Date("2026-10-31T16:00:00Z"); // Sat before fall-back
    const monday = nextBusinessDayAt(NY, 10, 0, sat);
    expect(toLocalInput(monday, NY)).toBe("2026-11-02T10:00");
    expect(monday.toISOString()).toBe("2026-11-02T15:00:00.000Z");
  });
  it("clamps into calling hours in the shop's zone", () => {
    const lateLa = zonedToUtc("2026-10-26T19:30", LA);
    expect(toLocalInput(clampToCallingHours(lateLa, LA), LA)).toBe("2026-10-27T09:00");
    const early = zonedToUtc("2026-10-26T07:00", LA);
    expect(toLocalInput(clampToCallingHours(early, LA), LA)).toBe("2026-10-26T09:00");
    const fine = zonedToUtc("2026-10-26T11:00", LA);
    expect(clampToCallingHours(fine, LA)).toEqual(fine);
  });
  it("gives quick picks in the lead's zone", () => {
    const picks = followupQuickPicks(LA, new Date("2026-10-26T17:00:00Z"));
    for (const p of picks) {
      const w = wallClock(p.at, LA);
      expect(w.weekday).toBeGreaterThan(0);
      expect(w.weekday).toBeLessThan(6);
      expect(w.hour).toBeGreaterThanOrEqual(9);
      expect(w.hour).toBeLessThan(18);
    }
  });
  it("computes the end of a local day", () => {
    expect(endOfLocalDay(LA, new Date("2026-10-26T17:00:00Z")).toISOString()).toBe("2026-10-27T07:00:00.000Z");
  });
});
