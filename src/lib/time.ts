/**
 * Time-zone helpers built on Intl (no date library). All instants are stored in UTC;
 * wall-clock times are always paired with an IANA zone.
 */
import { now as trustedNow } from "./clock";
import { EIGHT_TO_EIGHT_STATES } from "./us";

export type WallClock = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

const partsCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(timeZone: string) {
  let fmt = partsCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    partsCache.set(timeZone, fmt);
  }
  return fmt;
}

// ---------------------------------------------------------------------------
// USA time first, Pakistan time on request
// ---------------------------------------------------------------------------

export const PAKISTAN_TZ = "Asia/Karachi";
/** Which clock the app shows times in. USA (the shop's own time) is the default. */
export type TimeView = "usa" | "pk";
export const TIME_VIEW_COOKIE = "time_view";
export const TIME_VIEW_LABEL: Record<TimeView, string> = { usa: "USA time", pk: "Pakistan time" };
/** The team's USA zone when nothing more specific is known. */
export const DEFAULT_US_TZ = "America/Chicago";

export function parseTimeView(v: string | null | undefined): TimeView {
  return v === "pk" ? "pk" : "usa";
}

/** A zone counts as a USA zone when it's one of the US mainland, Alaska, Hawaii or Puerto Rico zones. */
export function isUsTimeZone(tz: string | null | undefined): tz is string {
  return !!tz && isValidTimeZone(tz) && /^(America\/|Pacific\/Honolulu$|US\/)/.test(tz) && !/^America\/(Mexico|Toronto|Vancouver|Sao_Paulo|Bogota|Lima|Argentina|Santiago|Caracas|Havana|Halifax|Winnipeg|Edmonton|Regina)/.test(tz);
}

/**
 * The zone a time is shown in: in the USA view, the shop's own time (or the user's USA
 * zone); in the Pakistan view, Pakistan time.
 */
export function shownZone(view: TimeView, shopTz: string | null | undefined, usTz: string): string {
  return view === "pk" ? PAKISTAN_TZ : isValidTimeZone(shopTz) ? shopTz : usTz;
}

/** The other clock, for a small second line ("Pakistan: …" or "Shop: …"). */
export function otherZone(view: TimeView, shopTz: string | null | undefined, usTz: string): { zone: string; label: string } {
  return view === "pk" ? { zone: isValidTimeZone(shopTz) ? shopTz : usTz, label: isValidTimeZone(shopTz) ? "Shop" : "USA" } : { zone: PAKISTAN_TZ, label: "Pakistan" };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock reading of an instant in a zone. weekday: 0 = Sunday. */
export function wallClock(date: Date, timeZone: string): WallClock {
  const p = Object.fromEntries(partsFormatter(timeZone).formatToParts(date).map((x) => [x.type, x.value]));
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    hour: Number(p.hour),
    minute: Number(p.minute),
    weekday: WEEKDAYS.indexOf(p.weekday),
  };
}

/** Zone offset from UTC in minutes at an instant (New York in winter: -300). */
export function offsetMinutes(date: Date, timeZone: string): number {
  const w = wallClock(date, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  return Math.round((asUtc - Math.floor(date.getTime() / 60000) * 60000) / 60000);
}

const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/;

/**
 * Converts a wall-clock time ("2026-11-01T01:30") in a zone to the UTC instant.
 * Ambiguous times (clocks going back) resolve to the first occurrence; times that don't
 * exist (clocks going forward) move forward by the gap, as a wall clock would.
 */
export function zonedToUtc(local: string, timeZone: string): Date {
  const m = local.match(LOCAL_RE);
  if (!m) throw new Error(`Invalid local date-time: ${local}`);
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const before = offsetMinutes(new Date(guess - 86_400_000), timeZone);
  const after = offsetMinutes(new Date(guess + 86_400_000), timeZone);
  const matches = [...new Set([before, after])]
    .map((o) => guess - o * 60_000)
    .filter((t) => {
      const w = wallClock(new Date(t), timeZone);
      return w.year === y && w.month === mo && w.day === d && w.hour === h && w.minute === mi;
    });
  if (matches.length) return new Date(Math.min(...matches));
  return new Date(guess - before * 60_000);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM-DDTHH:mm" for an <input type="datetime-local"> in the given zone. */
export function toLocalInput(date: Date, timeZone: string): string {
  const w = wallClock(date, timeZone);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

/** Intl names some zones only by offset ("GMT+5"); show the name people use instead. */
const ZONE_NAMES: Record<string, Record<string, string>> = { "Asia/Karachi": { "GMT+5": "PKT" } };
const friendlyZone = (text: string, timeZone: string) => {
  const names = ZONE_NAMES[timeZone];
  return names ? text.replace(/GMT[+-]\d+(?::\d+)?/, (m) => names[m] ?? m) : text;
};

export function zoneAbbreviation(date: Date, timeZone: string): string {
  return friendlyZone(
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
      .formatToParts(date)
      .find((x) => x.type === "timeZoneName")?.value ?? timeZone,
    timeZone,
  );
}

export function formatInZone(date: Date | string, timeZone: string, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return friendlyZone(new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    ...opts,
  }).format(d), timeZone);
}

/** Start of the next local day in the zone (exclusive end of "today"). */
export function endOfLocalDay(timeZone: string, now = trustedNow()): Date {
  const w = wallClock(now, timeZone);
  const next = new Date(Date.UTC(w.year, w.month - 1, w.day + 1));
  return zonedToUtc(`${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}T00:00`, timeZone);
}

export function startOfLocalDay(timeZone: string, now = trustedNow()): Date {
  const w = wallClock(now, timeZone);
  return zonedToUtc(`${w.year}-${pad(w.month)}-${pad(w.day)}T00:00`, timeZone);
}

// ---------------------------------------------------------------------------
// Calling windows
// ---------------------------------------------------------------------------

export type WindowRule = { startHour: number; endHour: number; label: string };

/** Legal window: federal TCPA 8 am–9 pm local; Florida and Oklahoma 8 am–8 pm. */
export function legalWindow(state: string | null | undefined): WindowRule {
  return state && EIGHT_TO_EIGHT_STATES.has(state)
    ? { startHour: 8, endHour: 20, label: `8 am–8 pm (${state} law)` }
    : { startHour: 8, endHour: 21, label: "8 am–9 pm (federal TCPA)" };
}

/** Our own stricter rule for calling shops: weekdays 9 am–6 pm in the shop's zone. */
export const HOUSE_WINDOW: WindowRule = { startHour: 9, endHour: 18, label: "weekdays 9 am–6 pm (house rule)" };

export type CallingWindow = {
  status: "ok" | "outside_house" | "outside_legal" | "unknown_zone";
  localTime: string;
  zone: string;
  message: string;
};

export function callingWindow(
  timeZone: string | null | undefined,
  state: string | null | undefined,
  now = trustedNow(),
  locationLabel?: string | null
): CallingWindow {
  if (!isValidTimeZone(timeZone)) {
    return { status: "unknown_zone", localTime: "", zone: "", message: "Time zone unknown: add the shop's state before calling." };
  }
  const w = wallClock(now, timeZone);
  const minutes = w.hour * 60 + w.minute;
  const localTime = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "numeric", minute: "2-digit" }).format(now);
  const zone = zoneAbbreviation(now, timeZone);
  const label = locationLabel ? ` (${locationLabel})` : " at the shop";
  const legal = legalWindow(state);
  if (minutes < legal.startHour * 60 || minutes >= legal.endHour * 60) {
    return { status: "outside_legal", localTime, zone, message: `It's ${localTime} ${zone}${label}. Calls are only allowed ${legal.label}.` };
  }
  const weekend = w.weekday === 0 || w.weekday === 6;
  if (weekend || minutes < HOUSE_WINDOW.startHour * 60 || minutes >= HOUSE_WINDOW.endHour * 60) {
    return { status: "outside_house", localTime, zone, message: `It's ${localTime} ${zone}${label}: legal, but outside our ${HOUSE_WINDOW.label}.` };
  }
  return { status: "ok", localTime, zone, message: `${localTime} ${zone}${label}. Good time to call.` };
}

/** True when an instant falls inside the legal calling window for that zone and state. */
export function withinLegalWindow(date: Date, timeZone: string, state?: string | null): boolean {
  const w = wallClock(date, timeZone);
  const legal = legalWindow(state);
  const minutes = w.hour * 60 + w.minute;
  return minutes >= legal.startHour * 60 && minutes < legal.endHour * 60;
}

// ---------------------------------------------------------------------------
// Follow-up quick picks
// ---------------------------------------------------------------------------

function addLocalDays(timeZone: string, now: Date, days: number) {
  const w = wallClock(now, timeZone);
  const d = new Date(Date.UTC(w.year, w.month - 1, w.day + days));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), weekday: d.getUTCDay() };
}

/** `hour`:`minute` local time on the next business day (Mon–Fri) after today. */
export function nextBusinessDayAt(timeZone: string, hour: number, minute = 0, now = trustedNow()): Date {
  for (let i = 1; i <= 7; i++) {
    const day = addLocalDays(timeZone, now, i);
    if (day.weekday !== 0 && day.weekday !== 6) {
      return zonedToUtc(`${day.y}-${pad(day.m)}-${pad(day.d)}T${pad(hour)}:${pad(minute)}`, timeZone);
    }
  }
  throw new Error("unreachable");
}

/** `hour` local time `days` calendar days from today. */
export function localDaysFromNow(timeZone: string, days: number, hour: number, minute = 0, now = trustedNow()): Date {
  const day = addLocalDays(timeZone, now, days);
  return zonedToUtc(`${day.y}-${pad(day.m)}-${pad(day.d)}T${pad(hour)}:${pad(minute)}`, timeZone);
}

/**
 * Moves an instant into the shop's house calling window: weekend or after-hours times
 * go to the next business day at 9 am; early times go to 9 am the same day.
 */
export function clampToCallingHours(date: Date, timeZone: string): Date {
  const w = wallClock(date, timeZone);
  const minutes = w.hour * 60 + w.minute;
  const weekend = w.weekday === 0 || w.weekday === 6;
  if (!weekend && minutes >= HOUSE_WINDOW.startHour * 60 && minutes < HOUSE_WINDOW.endHour * 60) return date;
  if (!weekend && minutes < HOUSE_WINDOW.startHour * 60) {
    return zonedToUtc(`${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(HOUSE_WINDOW.startHour)}:00`, timeZone);
  }
  return nextBusinessDayAt(timeZone, HOUSE_WINDOW.startHour, 0, date);
}

export type QuickPick = { key: string; label: string; at: Date };

export function followupQuickPicks(timeZone: string, now = trustedNow()): QuickPick[] {
  return [
    // Whole minutes, so the time saved is exactly the time shown.
    { key: "2h", label: "In 2 hours", at: clampToCallingHours(new Date(Math.floor((now.getTime() + 2 * 3_600_000) / 60_000) * 60_000), timeZone) },
    { key: "tomorrow-10", label: "Next business day 10 am", at: nextBusinessDayAt(timeZone, 10, 0, now) },
    { key: "tomorrow-2pm", label: "Next business day 2 pm", at: nextBusinessDayAt(timeZone, 14, 0, now) },
    { key: "3d", label: "In 3 days, 10 am", at: clampToCallingHours(localDaysFromNow(timeZone, 3, 10, 0, now), timeZone) },
    { key: "1w", label: "In 1 week, 10 am", at: clampToCallingHours(localDaysFromNow(timeZone, 7, 10, 0, now), timeZone) },
  ];
}
