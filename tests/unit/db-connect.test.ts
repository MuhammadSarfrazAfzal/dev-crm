import { describe, expect, it } from "vitest";
import { DatabaseUnavailableError, isConnectionError, makeDb, poolMode, poolOptions } from "@/lib/db/core";

describe("database connection failures", () => {
  it("retries a hung connection attempt, then reports the database as unavailable", async () => {
    // 10.255.255.1 is unroutable: the connection attempt hangs until the timeout.
    const db = makeDb("postgres://u:p@10.255.255.1:5432/x", { connect_timeout: 1 });
    const started = Date.now();
    let ran = false;
    await expect(db.asUser("0d54f94b-7247-43c9-a375-954df7931db8", async () => { ran = true; })).rejects.toBeInstanceOf(DatabaseUnavailableError);
    expect(ran).toBe(false);
    expect(Date.now() - started).toBeGreaterThanOrEqual(2900); // three attempts
    await db.sql.end({ timeout: 1 });
  }, 15_000);

  it("times out a hung IPv6 connect on the Supabase socket path too", async () => {
    // 100::1 is in the IPv6 discard prefix; the database name makes getDbOptions use the custom socket.
    const db = makeDb("postgres://u:p@[100::1]:5432/supabase.co", { connect_timeout: 1 });
    const started = Date.now();
    const err = await db.asService(async () => 1).catch((e) => e);
    expect(err).toBeInstanceOf(DatabaseUnavailableError);
    expect(Date.now() - started).toBeLessThan(8000);
    await db.sql.end({ timeout: 1 });
  }, 15_000);

  it("only treats connection problems as retryable", () => {
    expect(isConnectionError({ code: "CONNECT_TIMEOUT" })).toBe(true);
    expect(isConnectionError({ code: "42501" })).toBe(false);
    expect(isConnectionError(new Error("x"))).toBe(false);
  });
});


describe("connection pool for each place the app runs", () => {
  const direct = "postgres://postgres:x@db.abcd.supabase.co:5432/postgres";
  const session = "postgres://postgres.abcd:x@aws-0-ap-southeast-2.pooler.supabase.com:5432/postgres";
  const transaction = "postgres://postgres.abcd:x@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres";
  const local = "postgres://postgres:postgres@127.0.0.1:54329/salescrm";

  it("knows the kind of connection from the address", () => {
    expect([local, direct, session, transaction].map(poolMode)).toEqual(["local", "direct", "session", "transaction"]);
  });

  it("keeps this computer's setup unchanged", () => {
    expect(poolOptions(local, {})).toMatchObject({ max: 10, idle_timeout: 30, warm: false });
    expect(poolOptions(direct, {})).toMatchObject({ max: 10, idle_timeout: 0, warm: true });
  });

  it("uses tiny pools that let go quickly on Vercel and through the pooler, with no warm-up", () => {
    for (const url of [direct, session, transaction]) {
      const o = poolOptions(url, { VERCEL: "1" });
      expect(o.max).toBeLessThanOrEqual(2);
      expect(o.idle_timeout).toBeGreaterThan(0);
      expect(o.warm).toBe(false);
    }
    expect(poolOptions(session, {})).toMatchObject({ max: 2, warm: false });
  });

  it("turns off prepared statements only for the transaction pooler", () => {
    expect(poolOptions(transaction, {}).prepare).toBe(false);
    expect(poolOptions(session, {}).prepare).toBeUndefined();
  });

  it("treats a full pooler as 'database unavailable', not a broken page", () => {
    expect(isConnectionError(Object.assign(new Error("(EMAXCONNSESSION) max clients reached in session mode"), { code: "XX000" }))).toBe(true);
    expect(isConnectionError(Object.assign(new Error("syntax error"), { code: "42601" }))).toBe(false);
  });
});
