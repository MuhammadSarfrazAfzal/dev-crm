/**
 * Database access. Every signed-in request runs in a transaction as the `authenticated`
 * role with Supabase-style JWT claims, so Row Level Security decides what it can see.
 */
import dns from "node:dns";
import net from "node:net";
import postgres from "postgres";

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

const FALLBACK_IPS: Record<string, string> = {
  "aws-0-ap-southeast-2.pooler.supabase.com": "13.237.241.81",
  "aws-0-ap-northeast-1.pooler.supabase.com": "35.79.125.133",
  "db.mmjwktjibkeuiiqoghhi.supabase.co": "2406:da14:311:1500:f91e:b388:ac48:da3",
};

async function resolveHost(hostname: string, family: 4 | 6, retries = 2): Promise<string> {
  if (FALLBACK_IPS[hostname]) return FALLBACK_IPS[hostname];
  for (let i = 0; i < retries; i++) {
    try {
      const res = await dns.promises.lookup(hostname, { family });
      if (res?.address) return res.address;
    } catch {
      await new Promise((r) => setTimeout(r, 100 * (i + 1)));
    }
  }
  return FALLBACK_IPS[hostname] ?? hostname;
}

function createCustomSocket(family: 4 | 6) {
  return async (opts: any) => {
    const rawHost = opts.host[0];
    const port = opts.port[0];
    const host = await resolveHost(rawHost, family);
    const s = net.connect({
      host,
      port,
      family,
    });
    (s as unknown as { host: string; port: number }).host = rawHost;
    (s as unknown as { host: string; port: number }).port = port;
    return new Promise<net.Socket>((resolve, reject) => {
      const timer = setTimeout(() => {
        s.destroy();
        reject(Object.assign(new Error(`write CONNECT_TIMEOUT ${rawHost}:${port}`), { code: "CONNECT_TIMEOUT" }));
      }, (opts.connect_timeout ?? 30) * 1000);
      s.once("connect", () => {
        clearTimeout(timer);
        resolve(s);
      });
      s.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  };
}

export function getDbOptions(url: string): postgres.Options<Record<string, postgres.PostgresType>> & { socket?: (opts: any) => Promise<net.Socket> } {
  if (url.includes("supabase.co")) {
    if (process.platform !== "win32") return { ssl: "require" };
    return {
      ssl: "require",
      socket: createCustomSocket(6),
    };
  }
  if (url.includes("pooler.supabase.com") || url.includes("sslmode=require")) {
    if (process.platform === "win32" && url.includes("pooler.supabase.com")) {
      return {
        ssl: "require",
        socket: createCustomSocket(4),
      };
    }
    return { ssl: "require" };
  }
  return {};
}

/** Errors that mean "couldn't get a connection", never "a statement failed". */
const CONNECT_ERRORS = new Set(["CONNECT_TIMEOUT", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN", "ENOTFOUND", "CONNECTION_CLOSED", "CONNECTION_DESTROYED", "CONNECTION_ENDED", "53300", "EMAXCONNSESSION", "EMAXCONN"]);

export function isConnectionError(err: unknown) {
  const code = (err as { code?: string } | null)?.code;
  if (code && CONNECT_ERRORS.has(code)) return true;
  // The Supabase pooler reports a full pool as an error message rather than a code.
  return /max clients reached|too many clients|remaining connection slots|connection closed|connection terminated/i.test((err as { message?: string } | null)?.message ?? "");
}

/**
 * How to talk to the database:
 * - `local`: the embedded server on this machine.
 * - `direct`: a long-running server talking to Postgres directly (a few kept-open connections).
 * - `session`: the Supabase session pooler (port 5432 on *.pooler.supabase.com), where every
 *   open connection holds one of a small number of pooler slots.
 * - `transaction`: the Supabase transaction pooler (port 6543), which shares connections
 *   between transactions and can't keep prepared statements.
 * On Vercel each serverless instance gets its own pool, so pools there are tiny and close
 * idle connections quickly whatever the mode.
 */
export type PoolMode = "local" | "direct" | "session" | "transaction";

export function poolMode(url: string): PoolMode {
  if (isLocalUrl(url)) return "local";
  const u = new URL(url);
  if (!u.hostname.includes("pooler.supabase.com")) return "direct";
  return u.port === "6543" ? "transaction" : "session";
}

export function poolOptions(url: string, env: Record<string, string | undefined> = process.env): postgres.Options<Record<string, postgres.PostgresType>> & { warm: boolean } {
  const mode = poolMode(url);
  const serverless = !!env.VERCEL;
  const small = serverless || mode === "session" || mode === "transaction";
  const max = Number(env.PG_POOL_MAX) || (mode === "local" ? 10 : mode === "transaction" ? 5 : small ? 3 : 10);
  return {
    max,
    // Long-running servers keep connections to the hosted database (opening one is slow);
    // pooled and serverless ones give their slot back after a few idle seconds.
    idle_timeout: mode === "local" ? 30 : small ? Number(env.PG_IDLE_TIMEOUT) || 15 : 0,
    ...(mode === "transaction" ? { prepare: false } : {}),
    warm: mode === "direct" && !serverless,
  };
}

export class DatabaseUnavailableError extends Error {
  constructor(cause: unknown) {
    super("The database can't be reached right now. Please try again in a moment.", { cause });
    this.name = "DatabaseUnavailableError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True for a database on this machine (the local embedded server). */
export function isLocalUrl(url: string) {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(new URL(url).hostname);
}

export function makeDb(url: string, options: postgres.Options<Record<string, postgres.PostgresType>> = {}) {
  const remote = !isLocalUrl(url);
  const mode = poolMode(url);
  const { warm: shouldWarm, ...pool } = poolOptions(url);
  const sql = postgres(url, {
    onnotice: () => {},
    // Opening a connection to the hosted database takes several seconds (up to ~15 s on a
    // slow day) and now and then hangs. Give up on a hung attempt after 20 s and try again
    // (see `connect`) instead of failing the page.
    connect_timeout: Number(process.env.PG_CONNECT_TIMEOUT ?? (remote ? 20 : 30)),
    ...pool,
    ...getDbOptions(url),
    ...options,
  });

  /** A reserved connection, retrying when the connection attempt itself fails. */
  async function connect(attempts = 3) {
    for (let i = 1; ; i++) {
      try {
        return await sql.reserve();
      } catch (err) {
        if (!isConnectionError(err)) throw err;
        const code = (err as { code?: string }).code;
        if (i >= attempts) {
          console.warn(`database: connection failed ${attempts} times (${code}); giving up`);
          throw new DatabaseUnavailableError(err);
        }
        console.warn(`database: connection attempt ${i} failed (${code}); retrying`);
        await sleep(300 * i);
      }
    }
  }

  /**
   * Runs `fn` as the given user. RLS applies to everything inside.
   *
   * BEGIN and the role/claims setup are pipelined with the first queries instead of each
   * waiting for a reply, which matters when the database is far away (Supabase). Safety
   * doesn't depend on the pipelining: the setup's result is awaited before anything is
   * committed or returned, and any failure rolls the whole transaction back.
   */
  async function asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("invalid user id");
    const conn = await connect();
    const claims = JSON.stringify({ sub: userId, role: "authenticated" });
    const setup = [
      conn`begin`,
      conn`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${claims}, true)`,
    ];
    setup.forEach((p) => p.catch(() => {}));
    try {
      const result = await fn(conn as unknown as Tx);
      await Promise.all(setup);
      await conn`commit`;
      return result;
    } catch (err) {
      await conn`rollback`.catch(() => {});
      throw isConnectionError(err) ? new DatabaseUnavailableError(err) : err;
    } finally {
      conn.release();
    }
  }

  /** Maintenance access that bypasses RLS. Only for login, seeding and system jobs. */
  async function asService<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const conn = await connect();
    try {
      await conn`begin`;
      const result = await fn(conn as unknown as Tx);
      await conn`commit`;
      return result;
    } catch (err) {
      await conn`rollback`.catch(() => {});
      throw isConnectionError(err) ? new DatabaseUnavailableError(err) : err;
    } finally {
      conn.release();
    }
  }

  /** Opens a few connections ahead of the first request so pages don't pay for them. */
  async function warm(n = 3) {
    await Promise.allSettled(Array.from({ length: n }, async () => (await connect(2)).release()));
  }

  return { sql, asUser, asService, warm, remote, mode, shouldWarm };
}
