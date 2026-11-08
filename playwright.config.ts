import { defineConfig } from "@playwright/test";
import { localDatabaseUrl } from "./scripts/dbtools";

// 3031 keeps the e2e server clear of a dev server on 3020/3021.
const PORT = Number(process.env.E2E_PORT ?? 3031);
// Always the local embedded database, even when .env.local points the app at Supabase.
const DB_URL = process.env.E2E_DATABASE_URL ?? localDatabaseUrl("salescrm_e2e");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    // Set PLAYWRIGHT_CHROMIUM_PATH to use a system Chromium instead of `npx playwright install chromium`.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `next dev --hostname 127.0.0.1 -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      // Like Vercel: the server's own clock zone is UTC (E2E_SERVER_TZ to try others); nothing may depend on it.
      TZ: process.env.E2E_SERVER_TZ ?? "UTC",
      DATABASE_URL: DB_URL,
      PG_EMBEDDED: "1",
      AUTH_PROVIDER: "local",
      STORAGE_PROVIDER: "local",
      NEXT_DIST_DIR: ".next-e2e",
      UPLOAD_DIR: ".local/e2e-uploads",
      SESSION_SECRET: "e2e-only-session-secret-0123456789abcdef",
      // Every test signs in from 127.0.0.1; the real limit (10 per 15 minutes) would stop the suite.
      LOGIN_RATE_LIMIT: "500",
    },
  },
});
