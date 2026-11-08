import { afterEach, describe, expect, it } from "vitest";
import { now, setClockSkew } from "@/lib/clock";
import { relativeTime } from "@/lib/format";
import { followupQuickPicks } from "@/lib/time";

afterEach(() => setClockSkew(0));

describe("trusted clock", () => {
  it("corrects a machine clock that is hours off", () => {
    const real = Date.now();
    setClockSkew(11 * 3_600_000); // this machine is 11 hours behind
    expect(Math.abs(now().getTime() - (real + 11 * 3_600_000))).toBeLessThan(1000);
  });

  it("quick picks and 'x ago' use the corrected clock", () => {
    setClockSkew(-6 * 3_600_000);
    const at = followupQuickPicks("America/Chicago")[0].at;
    expect(at.getTime() % 60_000).toBe(0); // whole minutes
    expect(relativeTime(new Date(now().getTime() - 3 * 60_000))).toBe("3 minutes ago");
  });
});
