/** Report periods as calendar days in USA time, on the trusted clock (no database, so tests and the PDF share it). */
import { now as trustedNow } from "./clock";
import { formatInZone, startOfLocalDay } from "./time";

export const PERIODS = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", all: "All time" } as const;
export type Period = keyof typeof PERIODS;

/**
 * The period as calendar days in the user's USA time zone, ending now: "Today" starts at
 * midnight today, "Last 7 days" at midnight six days ago (today plus the six before it).
 * "Now" is the trusted clock, never the machine's.
 */
export function periodRange(period: Period, timeZone: string, now = trustedNow()): { since: Date; until: Date } {
  const daysBack = period === "today" ? 0 : period === "7d" ? 6 : period === "30d" ? 29 : null;
  if (daysBack === null) return { since: new Date(0), until: now };
  return { since: startOfLocalDay(timeZone, new Date(now.getTime() - daysBack * 86_400_000)), until: now };
}

/** "Today · Tue, Oct 27, 12:00 AM – 4:30 PM CDT", "Last 7 days · Oct 21 – Oct 27, 2026", "All time". */
export function periodLabel(period: Period, range: { since: Date; until: Date }, timeZone: string) {
  if (period === "all") return `All time · up to ${formatInZone(range.until, timeZone, { year: "numeric" })}`;
  const day = (d: Date) => formatInZone(d, timeZone, { weekday: undefined, hour: undefined, minute: undefined, timeZoneName: undefined, year: "numeric" });
  if (period === "today") return `Today · ${formatInZone(range.since, timeZone, { year: "numeric", timeZoneName: undefined })} – ${formatInZone(range.until, timeZone, { weekday: undefined, month: undefined, day: undefined })}`;
  return `${PERIODS[period]} · ${day(range.since)} – ${day(range.until)}`;
}

