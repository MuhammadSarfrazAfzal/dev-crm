import { afterAll } from "vitest";
import { makeDb } from "@/lib/db/core";
import { testUrl } from "./global-setup";

export const db = makeDb(testUrl(), { max: 3 });
afterAll(() => db.sql.end());

export async function userId(email: string): Promise<string> {
  const [row] = await db.sql`select id from public.profiles where email = ${email}`;
  return row.id;
}

/** Runs fn as the user and rolls back, so tests don't leak state. */
export async function tryAsUser<T>(id: string, fn: Parameters<typeof db.asUser<T>>[1]): Promise<T> {
  const rollback = new Error("rollback");
  let result: T | undefined;
  try {
    await db.asUser(id, async (tx) => {
      result = await fn(tx);
      throw rollback;
    });
  } catch (err) {
    if (err !== rollback) throw err;
  }
  return result as T;
}
