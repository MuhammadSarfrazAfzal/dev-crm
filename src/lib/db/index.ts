import "server-only";
import { makeDb } from "./core";

const url = process.env.DATABASE_URL ?? `postgres://postgres:postgres@127.0.0.1:${process.env.PG_PORT ?? 54329}/salescrm`;

// Reuse one pool across hot reloads in development.
const g = globalThis as unknown as { __crmDb?: ReturnType<typeof makeDb> };
const created = !g.__crmDb;
export const db = g.__crmDb ?? (g.__crmDb = makeDb(url));
// Long-running server on a direct connection: open a few connections now instead of on the
// first page view. Never on Vercel or through the Supabase pooler, where slots are scarce.
if (created && db.shouldWarm && process.env.NODE_ENV !== "test") void db.warm();
export const { asUser, asService } = db;
export { DatabaseUnavailableError } from "./core";
export type { Tx } from "./core";
