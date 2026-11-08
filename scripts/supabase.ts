/**
 * npm run supabase:<command> — work with the CRM's hosted Supabase project.
 *
 * Reads SUPABASE_DB_URL (or SUPABASE_DB_HOST + SUPABASE_DB_PASSWORD) from the environment
 * or .env.local. Never prints secrets. Demo data is never written here: `db:seed` refuses
 * any database that isn't on this machine.
 *
 *   migrate                 apply supabase/migrations/*.sql not yet recorded (no auth shim)
 *   status                  applied migrations and row counts
 *   create-user             --email a@b.com --name "Full Name" [--role admin|salesperson] [--tz America/Chicago]
 *                           password from NEW_USER_PASSWORD, or generated and written to --password-file (mode 600)
 *   default-scripts         publish the standard call/email scripts if the library is empty (--author email)
 *   purge-demo --yes        delete the fake seed data (example.com shops and the three demo logins);
 *                           the script library is kept and handed to a real admin
 */
import crypto from "node:crypto";
import fs from "node:fs";
import postgres from "postgres";
import { getDbOptions } from "../src/lib/db/core";
import { loadEnv, migrate } from "./dbtools";
import { SCRIPTS } from "./seed";
import { hashPassword, insertAuthUser } from "../src/lib/auth/users";

function dbUrl() {
  loadEnv();
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  if (process.env.DATABASE_URL && !/127\.0\.0\.1|localhost/.test(new URL(process.env.DATABASE_URL).hostname)) return process.env.DATABASE_URL;
  const host = process.env.SUPABASE_DB_HOST;
  const pw = process.env.SUPABASE_DB_PASSWORD;
  if (!host || !pw) throw new Error("Set SUPABASE_DB_URL, or SUPABASE_DB_HOST and SUPABASE_DB_PASSWORD, in .env.local");
  return `postgres://postgres:${encodeURIComponent(pw)}@${host}:5432/postgres?sslmode=require`;
}

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const cmd = process.argv[2];
  const url = dbUrl();
  if (/127\.0\.0\.1|localhost/.test(new URL(url).hostname)) throw new Error("SUPABASE_DB_URL points at this machine; use npm run db:* for the local database.");

  if (cmd === "migrate") return migrate(url, { shim: false });

  const sql = postgres(url, { max: 1, onnotice: () => {}, ...getDbOptions(url) });
  try {
    switch (cmd) {
      case "status": {
        const done = await sql`select version, name from supabase_migrations.schema_migrations order by version`;
        console.log(`migrations applied: ${done.length}`);
        done.forEach((m) => console.log(`  ${m.version} ${m.name}`));
        const tables = ["profiles", "companies", "contacts", "leads", "call_activities", "followups", "imports", "scripts", "research_requests"];
        for (const t of tables) {
          const [r] = await sql`select count(*)::int as n from ${sql(t)}`.catch(() => [{ n: "missing" }]);
          console.log(`  ${t}: ${r.n}`);
        }
        return;
      }
      case "create-user": {
        const email = arg("email")?.trim().toLowerCase();
        const name = arg("name")?.trim();
        const role = arg("role") ?? "salesperson";
        const tz = arg("tz") ?? "America/Chicago";
        if (!email || !name || !["admin", "salesperson"].includes(role)) throw new Error('usage: create-user --email a@b.com --name "Full Name" [--role admin|salesperson] [--tz Zone] [--password-file path]');
        let password = process.env.NEW_USER_PASSWORD;
        const file = arg("password-file");
        if (!password) {
          if (!file) throw new Error("Set NEW_USER_PASSWORD or pass --password-file to generate one.");
          password = crypto.randomBytes(12).toString("base64url");
        }
        const hash = await hashPassword(password);
        const id = await sql.begin(async (tx) => {
          const id = await insertAuthUser(tx, { email, passwordHash: hash, fullName: name }, "supabase");
          await tx`insert into public.profiles (id, email, full_name, role, time_zone) values (${id}, ${email}, ${name}, ${role}, ${tz})`;
          await tx`insert into public.audit_logs (action, entity, entity_id, details) values ('user.created', 'profiles', ${id}, ${tx.json({ email, role, via: "cli" })})`;
          return id;
        });
        if (!process.env.NEW_USER_PASSWORD && file) {
          fs.writeFileSync(file, `Star Sales CRM sign-in\nemail: ${email}\npassword: ${password}\n`, { mode: 0o600 });
          console.log(`created ${role} ${email} (${id}); password written to ${file}`);
        } else console.log(`created ${role} ${email} (${id})`);
        return;
      }
      case "default-scripts": {
        const [{ n }] = await sql`select count(*)::int as n from public.scripts`;
        if (n > 0) return console.log(`script library already has ${n} scripts; nothing to do`);
        const author = arg("author")?.toLowerCase();
        const [a] = author ? await sql`select id from public.profiles where email = ${author}` : await sql`select id from public.profiles where role = 'admin' order by created_at limit 1`;
        if (!a) throw new Error("Create an admin first (create-user --role admin).");
        for (const s of SCRIPTS) {
          await sql`insert into public.scripts (script_key, version, product, script_type, title, body, created_by)
            values (${s.key}, 1, ${s.product}, ${s.type}, ${s.title}, ${s.body}, ${a.id})`;
        }
        return console.log(`published ${SCRIPTS.length} default scripts`);
      }
      case "purge-demo": {
        if (!process.argv.includes("--yes")) throw new Error("This deletes the demo seed data. Re-run with --yes to confirm.");
        await sql.begin(async (tx) => {
          const companies = await tx`delete from public.companies c
            where exists (select 1 from public.leads l where l.company_id = c.id and l.source = 'seed')
              and not exists (select 1 from public.leads l where l.company_id = c.id and l.source <> 'seed')
            returning id`;
          const demo = await tx`select id from auth.users where email in ('admin@example.com', 'sam@example.com', 'riley@example.com')`;
          const ids = demo.map((d) => d.id as string);
          if (ids.length) {
            // The script library stays: hand it to a real admin before the demo admin goes.
            const [keeper] = await tx`select id from public.profiles where role = 'admin' and active and not (id = any(${ids}::uuid[])) order by created_at limit 1`;
            if (!keeper) throw new Error("Create a real admin first (create-user --role admin); the script library needs an owner.");
            await tx`update public.scripts set created_by = ${keeper.id} where created_by = any(${ids}::uuid[])`;
            await tx`delete from public.audit_logs where actor_id = any(${ids}::uuid[])`;
            await tx`delete from public.profiles where id = any(${ids}::uuid[])`;
            await tx`delete from auth.identities where user_id = any(${ids}::uuid[])`;
            await tx`delete from auth.users where id = any(${ids}::uuid[])`;
          }
          // Audit entries that only described the deleted demo rows or demo sign-in attempts.
          const audit = await tx`delete from public.audit_logs a
            where (a.entity = 'companies' and not exists (select 1 from public.companies c where c.id = a.entity_id))
               or (a.entity = 'leads' and not exists (select 1 from public.leads l where l.id = a.entity_id))
               or (a.entity = 'sales_opportunities' and not exists (select 1 from public.sales_opportunities o where o.id = a.entity_id))
               or (a.action like 'auth.%' and a.details ->> 'email' in ('admin@example.com', 'sam@example.com', 'riley@example.com'))
            returning id`;
          console.log(`deleted ${companies.length} demo companies (with their leads and history), ${ids.length} demo logins, ${audit.length} demo audit entries`);
        });
        return;
      }
      default:
        console.error("usage: tsx scripts/supabase.ts migrate|status|create-user|default-scripts|purge-demo");
        process.exitCode = 1;
    }
  } finally {
    await sql.end({ timeout: 1 });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
