import { config, createDatabase, localDatabaseUrl, migrate, startServer } from "../../scripts/dbtools";
import { seed } from "../../scripts/seed";

export const TEST_DB_NAME = "salescrm_test";

export function testUrl() {
  return process.env.TEST_DATABASE_URL ?? localDatabaseUrl(TEST_DB_NAME);
}

export default async function setup() {
  const cfg = config();
  await startServer(cfg);
  const url = testUrl();
  await createDatabase(url, { drop: true });
  await migrate(url, { shim: true, log: () => {} });
  await seed(url, { log: () => {} });
  process.env.TEST_DATABASE_URL = url;
}
