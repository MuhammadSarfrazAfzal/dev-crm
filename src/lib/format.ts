import { now as trustedNow } from "./clock";

export function relativeTime(date: Date | string, now = trustedNow()): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = d.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60_000, "second"],
    [3_600_000, "minute"],
    [86_400_000, "hour"],
    [7 * 86_400_000, "day"],
    [30 * 86_400_000, "week"],
    [365 * 86_400_000, "month"],
    [Infinity, "year"],
  ];
  const sizes: Record<string, number> = { second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 7 * 86_400_000, month: 30 * 86_400_000, year: 365 * 86_400_000 };
  const unit = units.find(([limit]) => abs < limit)![1];
  return new Intl.RelativeTimeFormat("en-US", { numeric: "auto" }).format(Math.round(diff / sizes[unit]), unit);
}

export function money(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

export function plural(n: number, word: string, pluralWord = `${word}s`) {
  return `${n} ${n === 1 ? word : pluralWord}`;
}

/** "1 h 5 min", "12 min", "0 min" for talk time. */
export function duration(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

/** "42%" of a total, or a dash when there is nothing to divide by. */
export function percent(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "—";
}
