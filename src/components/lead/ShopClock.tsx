"use client";

import { useEffect, useState } from "react";
import { now as trustedNow } from "@/lib/clock";
import { callingWindow } from "@/lib/time";
import { cn } from "../ui";

/** Live local time at the shop with the calling-window status. */
export function ShopClock({
  timeZone,
  state,
  locationLabel,
}: {
  timeZone: string | null;
  state: string | null;
  locationLabel?: string | null;
}) {
  const [now, setNow] = useState(() => trustedNow());
  useEffect(() => {
    // Re-read once the browser is on the trusted clock (the first render may predate it).
    const first = setTimeout(() => setNow(trustedNow()), 1_000);
    const t = setInterval(() => setNow(trustedNow()), 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, []);
  const w = callingWindow(timeZone, state, now, locationLabel);
  const tone = {
    ok: "border-success-line bg-success-soft text-success-fg",
    outside_house: "border-warning-line bg-warning-soft text-warning-fg",
    outside_legal: "border-danger-line bg-danger-soft text-danger-fg",
    unknown_zone: "border-line bg-surface-2 text-fg-2",
  }[w.status];
  return (
    <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", tone)} role="status" data-testid="calling-window">
      <svg viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
      <span suppressHydrationWarning>{w.message}</span>
    </div>
  );
}
