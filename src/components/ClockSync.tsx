"use client";

import { useEffect } from "react";
import { setClockSkew } from "@/lib/clock";

/**
 * Puts the browser on the server's clock: measures the offset against /api/time once the
 * page is up, then every few minutes and whenever the tab comes back. (The page itself
 * already carries the server's time; see ClockSeed.)
 */
export function ClockSync() {
  useEffect(() => {
    let stopped = false;
    async function sync() {
      try {
        const t0 = Date.now();
        const res = await fetch("/api/time", { cache: "no-store" });
        const t1 = Date.now();
        const { now } = (await res.json()) as { now: number };
        if (!stopped && Number.isFinite(now) && t1 - t0 < 10_000) setClockSkew(now - (t0 + t1) / 2);
      } catch {
        // Offline: keep the offset from the page.
      }
    }
    void sync();
    const timer = setInterval(sync, 10 * 60_000);
    const onVisible = () => document.visibilityState === "visible" && void sync();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return null;
}
