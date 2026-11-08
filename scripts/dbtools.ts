/**
 * Local database tooling: runs PostgreSQL from the embedded-postgres npm binaries
 * (no root, no Docker) and applies the Supabase-style migrations.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { getDbOptions } from "../src/lib/db/core";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
export const SHIM_FILE = path.join(ROOT, "supabase", "local", "auth_shim.sql");

export function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) continue;
    for (const rawLine of fs.readFileSync(file, "utf8").split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
}

export function config() {
  loadEnv();
  const port = Number(process.env.PG_PORT ?? 54329);
  const dataDir = path.resolve(ROOT, process.env.PG_DATA_DIR ?? ".local/pgdata");
  const databaseUrl = process.env.DATABASE_URL ?? `postgres://postgres:postgres@127.0.0.1:${port}/salescrm`;
  return { port, dataDir, databaseUrl, embedded: process.env.PG_EMBEDDED !== "0" };
}

/** True for a database on this machine. Destructive tooling (drop, create, demo seed) only runs against these. */
export function isLocalDatabase(databaseUrl: string) {
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(new URL(databaseUrl).hostname);
}

/**
 * The local embedded server's URL for a given database name. Tests always use this, even
 * when DATABASE_URL points the app at Supabase, so they can never touch the hosted project.
 */
export function localDatabaseUrl(name: string, { port } = config()) {
  return `postgres://postgres:postgres@127.0.0.1:${port}/${name}`;
}

async function binaries(): Promise<{ pg_ctl: string; initdb: string }> {
  // The platform package matching this machine is installed as an optional dependency.
  const platform = os.platform() === "win32" ? "windows" : os.platform();
  const mod = await import(`@embedded-postgres/${platform}-${os.arch()}`);
  return { pg_ctl: mod.pg_ctl, initdb: mod.initdb };
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

/** Initialises the data directory on first use and starts the server in the background. */
export async function startServer({ dataDir, port } = config()) {
  if (await portOpen(port)) return { started: false };
  const pidFile = path.join(dataDir, "postmaster.pid");
  if (fs.existsSync(pidFile)) {
    try {
      const pid = Number(fs.readFileSync(pidFile, "utf8").split("\n")[0].trim());
      if (pid) {
        try {
          process.kill(pid, 0);
        } catch (e: any) {
          if (e.code === "ESRCH") {
            fs.rmSync(pidFile, { force: true });
          }
        }
      }
    } catch {}
  }
  const bin = await binaries();
  if (!fs.existsSync(path.join(dataDir, "PG_VERSION"))) {
    fs.mkdirSync(dataDir, { recursive: true });
    const pwFile = path.join(os.tmpdir(), `salescrm-pw-${process.pid}`);
    fs.writeFileSync(pwFile, "postgres\n", { mode: 0o600 });
    const init = spawnSync(
      bin.initdb,
      ["-D", dataDir, "-U", "postgres", "--pwfile", pwFile, "--auth=scram-sha-256", "-E", "UTF8", "--locale=C"],
      { stdio: "pipe", encoding: "utf8" },
    );
    fs.rmSync(pwFile, { force: true });
    if (init.status !== 0) throw new Error(`initdb failed: ${init.stderr || init.stdout}`);
  }
  const isWin = os.platform() === "win32";
  const socketDir = path.join(dataDir, "..", "pgsocket");
  fs.mkdirSync(socketDir, { recursive: true });
  const optStr = isWin
    ? `-p ${port} -c listen_addresses=127.0.0.1 -c timezone=UTC`
    : `-p ${port} -k ${socketDir} -c listen_addresses=127.0.0.1 -c timezone=UTC`;
  const res = spawnSync(
    bin.pg_ctl,
    [
      "-D", dataDir,
      "-l", path.join(dataDir, "..", "postgres.log"),
      "-o", optStr,
      ...(isWin ? ["start"] : ["-w", "start"]),
    ],
    { stdio: isWin ? "ignore" : "pipe", encoding: "utf8" },
  );
  if (!isWin && res.status !== 0) throw new Error(`pg_ctl start failed: ${res.stderr || res.stdout}`);
  for (let i = 0; i < 50; i++) {
    if (await portOpen(port)) return { started: true };
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`pg_ctl start timed out: postgres port ${port} did not open`);
}

export async function stopServer({ dataDir, port } = config()) {
  if (!fs.existsSync(path.join(dataDir, "postmaster.pid"))) return false;
  const bin = await binaries();
  const isWin = os.platform() === "win32";
  spawnSync(bin.pg_ctl, ["-D", dataDir, "-m", "fast", ...(isWin ? [] : ["-w"]), "stop"], { stdio: "inherit" });
  if (isWin) {
    for (let i = 0; i < 30; i++) {
      if (!fs.existsSync(path.join(dataDir, "postmaster.pid"))) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  return true;
}

function adminUrl(databaseUrl: string) {
  const u = new URL(databaseUrl);
  const name = decodeURIComponent(u.pathname.slice(1));
  u.pathname = "/postgres";
  return { url: u.toString(), name };
}

export async function createDatabase(databaseUrl: string, { drop = false } = {}) {
  if (!isLocalDatabase(databaseUrl)) throw new Error("Refusing to create or drop a database that isn't on this machine.");
  const { url, name } = adminUrl(databaseUrl);
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Unsafe database name: ${name}`);
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    if (drop) await sql.unsafe(`drop database if exists ${name} with (force)`);
    const [row] = await sql`select 1 as ok from pg_database where datname = ${name}`;
    if (!row) await sql.unsafe(`create database ${name}`);
  } finally {
    await sql.end();
  }
}

/** Applies the local auth shim (embedded only) and any migrations not yet recorded. */
export async function migrate(databaseUrl: string, { shim = true, log = console.log } = {}) {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {}, ...getDbOptions(databaseUrl) });
  try {
    if (shim) await sql.unsafe(fs.readFileSync(SHIM_FILE, "utf8"));
    await sql`create schema if not exists supabase_migrations`;
    await sql`create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, applied_at timestamptz default now())`;
    const done = new Set((await sql`select version from supabase_migrations.schema_migrations`).map((r) => r.version));
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
      if (done.has(version)) continue;
      await sql.begin(async (tx) => {
        await tx.unsafe(fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
        await tx`insert into supabase_migrations.schema_migrations (version, name) values (${version}, ${rest.join("_")})`;
      });
      log(`applied ${file}`);
    }
  } finally {
    await sql.end();
  }
}
