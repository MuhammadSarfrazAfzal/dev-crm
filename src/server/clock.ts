import "server-only";
import { db } from "@/lib/db";
import { clockSkew, setClockSkew } from "@/lib/clock";

/** Re-check the database clock this often; between checks the measured offset is reused. */
const RESYNC_MS = 5 * 60_000;
/** After a failed reading, wait this long before trying again (the machine's clock is used meanwhile). */
const RETRY_MS = 60_000;
/** A clock reading must never hold up a page for long. */
const TIMEOUT_MS = 3_000;
let syncedAt = 0;
let nextTry = 0;
let inflight: Promise<void> | null = null;

async function measure() {
  const t0 = Date.now();
  // Same pool as everything else; on a busy pooled database give up quickly.
  const query = db.sql`select (extract(epoch from clock_timestamp()) * 1000)::float8 as ms`;
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), TIMEOUT_MS));
  const [row] = await Promise.race([query, timeout]);
  const t1 = Date.now();
  // The database answered half way through the round trip.
  setClockSkew(Number(row.ms) - (t0 + t1) / 2);
  syncedAt = t1;
  nextTry = t1 + RESYNC_MS;
}

/**
 * Keeps the server's "now" on the database's clock (the hosted database is kept on
 * internet time; this machine's clock may not be). The first call waits briefly for a
 * reading; later calls refresh it in the background. If the database can't be reached
 * the last reading (or the machine's clock, which on Vercel is internet time anyway) is
 * used, and the next try waits a minute, so a busy database is never asked on every page.
 */
export async function syncServerClock(): Promise<void> {
  if (Date.now() < nextTry) return;
  if (!inflight) {
    nextTry = Date.now() + RETRY_MS;
    inflight = measure()
      .catch((err) => console.warn("clock sync skipped; using the last reading:", err instanceof Error ? err.message : err))
      .finally(() => (inflight = null));
  }
  // Vercel's own clock is kept on internet time, so a page never waits for the first reading there.
  if (!syncedAt && !process.env.VERCEL) await inflight;
}

export { clockSkew };
