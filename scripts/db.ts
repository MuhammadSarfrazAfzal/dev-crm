/** npm run db:<start|stop|migrate|seed|reset|status|pull> — local database lifecycle. */
import { config, createDatabase, migrate, startServer, stopServer } from "./dbtools";
import { seed } from "./seed";
import postgres from "postgres";

async function main() {
  const cmd = process.argv[2];
  const cfg = config();
  const shim = cfg.embedded || process.env.APPLY_AUTH_SHIM === "1";
  switch (cmd) {
    case "start": {
      if (!cfg.embedded) return console.log("PG_EMBEDDED=0: using the server at DATABASE_URL");
      const { started } = await startServer(cfg);
      console.log(started ? `postgres started on 127.0.0.1:${cfg.port} (data: ${cfg.dataDir})` : `postgres already running on ${cfg.port}`);
      await createDatabase(cfg.databaseUrl);
      return;
    }
    case "stop":
      console.log((await stopServer(cfg)) ? "postgres stopped" : "postgres was not running");
      return;
    case "migrate":
      await migrate(cfg.databaseUrl, { shim });
      return;
    case "status": {
      const sql = postgres(cfg.databaseUrl, { max: 1 });
      const tables = ["profiles", "companies", "contacts", "leads", "call_activities", "followups", "imports", "scripts", "research_requests", "audit_logs"];
      console.log("Local database table counts:");
      for (const t of tables) {
        const [r] = await sql`select count(*)::int as n from ${sql(t)}`.catch(() => [{ n: "missing" }]);
        console.log(`  ${t}: ${r.n}`);
      }
      await sql.end();
      return;
    }
    case "seed":
      await seed(cfg.databaseUrl);
      return;
    case "reset":
      if (cfg.embedded) await startServer(cfg);
      await createDatabase(cfg.databaseUrl, { drop: true });
      await migrate(cfg.databaseUrl, { shim });
      await seed(cfg.databaseUrl);
      return;
    default:
      console.error("usage: tsx scripts/db.ts start|stop|migrate|seed|reset|status");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
