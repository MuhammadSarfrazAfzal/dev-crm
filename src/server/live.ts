import "server-only";
import { db } from "@/lib/db";

/**
 * Local live updates: one LISTEN connection per server process fans out the table names
 * that changed (from the crm_changes NOTIFY triggers) to every open event stream.
 */
type Listener = (table: string) => void;
const g = globalThis as unknown as { __crmLive?: { listeners: Set<Listener>; started: Promise<void> | null } };
const state = g.__crmLive ?? (g.__crmLive = { listeners: new Set(), started: null });

export function subscribe(fn: Listener) {
  state.listeners.add(fn);
  // LISTEN keeps a connection open for good: fine on a long-running server, not through the
  // Supabase pooler or on Vercel (there the browser uses Supabase Realtime instead).
  if (process.env.VERCEL || db.mode === "session" || db.mode === "transaction") return () => state.listeners.delete(fn);
  state.started ??= db.sql
    .listen("crm_changes", (table) => state.listeners.forEach((l) => l(table)))
    .then(() => undefined)
    .catch((err) => {
      console.error("live updates: LISTEN failed", err);
      state.started = null;
    });
  return () => state.listeners.delete(fn);
}
