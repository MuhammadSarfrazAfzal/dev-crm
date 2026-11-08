import { config, createDatabase, localDatabaseUrl, migrate, startServer } from "../../scripts/dbtools";
import { seed } from "../../scripts/seed";

/** Fresh database for every e2e run: migrate and seed the fake demo data. */
export default async function globalSetup() {
  const cfg = config();
  await startServer(cfg);
  const url = process.env.E2E_DATABASE_URL ?? localDatabaseUrl("salescrm_e2e", cfg);
  await createDatabase(url, { drop: true });
  await migrate(url, { shim: true, log: () => {} });
  await seed(url, { log: () => {} });
}
