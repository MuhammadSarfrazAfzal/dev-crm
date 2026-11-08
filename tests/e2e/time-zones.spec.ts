import { expect, test, type Page } from "@playwright/test";
import postgres from "postgres";
import { localDatabaseUrl } from "../../scripts/dbtools";
import { clampToCallingHours, formatInZone, PAKISTAN_TZ, toLocalInput, zonedToUtc } from "../../src/lib/time";

// The server runs with TZ=UTC (like Vercel). Browsers here sit in Pakistan or the USA, and one
// has a PC clock that is 11 hours wrong: the time picked must be the time saved and shown.
const DB_URL = process.env.E2E_DATABASE_URL ?? localDatabaseUrl("salescrm_e2e");
const SHOP_TZ = "America/Chicago";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("Admin123!demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Total leads")).toBeVisible();
}

/** 8 pm Pakistan time on a weekday about a week ahead, as typed into the picker. */
function pakistanEvening() {
  const d = new Date(Date.now() + 8 * 86_400_000);
  while ([0, 6].includes(new Date(d.toLocaleString("en-US", { timeZone: SHOP_TZ })).getDay()) || [0, 6].includes(d.getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  const day = d.toLocaleDateString("en-CA", { timeZone: PAKISTAN_TZ });
  return { local: `${day}T20:00`, at: zonedToUtc(`${day}T20:00`, PAKISTAN_TZ) };
}

for (const zone of [PAKISTAN_TZ, "America/New_York"]) {
  test.describe(`browser in ${zone}`, () => {
    test.use({ timezoneId: zone });

    test("follow-up times stay exact across pages, in USA and Pakistan view", async ({ page }) => {
      const sql = postgres(DB_URL, { max: 1, onnotice: () => {} });
      try {
        const [lead] = await sql`select l.id, c.name from leads l join companies c on c.id = l.company_id
          where c.time_zone = ${SHOP_TZ} and c.suppression = 'none' and l.owner_id is not null
          order by c.name offset ${zone === PAKISTAN_TZ ? 0 : 1} limit 1`;
        // In Pakistan, also give the PC a clock that is 11 hours behind.
        if (zone === PAKISTAN_TZ) await page.clock.install({ time: new Date(Date.now() - 11 * 3_600_000) });
        await signIn(page);
        await page.goto(`/leads/${lead.id}`);
        await page.getByTestId("log-call-form").getByText("Call back later", { exact: true }).click();

        // Quick pick: computed from the real time, not the PC's.
        await page.getByRole("button", { name: "In 2 hours" }).first().click();
        const expected = clampToCallingHours(new Date(Math.floor((Date.now() + 2 * 3_600_000) / 60_000) * 60_000), SHOP_TZ);
        const shown = await page.locator("#call-due").inputValue();
        expect(Math.abs(zonedToUtc(shown, SHOP_TZ).getTime() - expected.getTime())).toBeLessThanOrEqual(60_000);

        // A time typed in Pakistan time.
        const { local, at } = pakistanEvening();
        await page.getByRole("radio", { name: "Pakistan time" }).click();
        await page.locator("#call-due").fill(local);
        const preview = page.getByTestId("followup-preview").first();
        await expect(preview).toContainText(`Shop: ${formatInZone(at, SHOP_TZ)}`);
        await expect(preview).toContainText(`Pakistan: ${formatInZone(at, PAKISTAN_TZ)}`);
        await page.getByRole("button", { name: "Save call" }).click();
        await expect(page.getByText(`Next follow-up ${formatInZone(at, SHOP_TZ)} (${formatInZone(at, PAKISTAN_TZ)} in Pakistan)`)).toBeVisible();
        const [f] = await sql`select due_at from followups where lead_id = ${lead.id} and status = 'pending' order by created_at desc limit 1`;
        expect(new Date(f.due_at).toISOString()).toBe(at.toISOString());

        // USA view (the default): the shop's own time first, Pakistan underneath.
        await page.reload();
        await expect(page.getByText(formatInZone(at, SHOP_TZ)).first()).toBeVisible();
        await page.goto("/followups?scope=team");
        const item = page.getByRole("listitem").filter({ has: page.locator(`a[href="/leads/${lead.id}"]`) });
        await expect(item).toContainText(formatInZone(at, SHOP_TZ));
        await expect(item).toContainText(`Pakistan: ${formatInZone(at, PAKISTAN_TZ)}`);

        // Pakistan view: Pakistan time first, the shop's time underneath; the same instant.
        await page.getByTestId("time-view").getByRole("radio", { name: "PK" }).click();
        await expect(page.getByTestId("time-view").getByRole("radio", { name: "PK" })).toHaveAttribute("aria-checked", "true");
        await expect(item).toContainText(formatInZone(at, PAKISTAN_TZ));
        await expect(item).toContainText(`Shop: ${formatInZone(at, SHOP_TZ)}`);
        await page.goto(`/leads?q=${encodeURIComponent(lead.name)}`);
        await expect(page.getByTestId("leads-table")).toContainText(formatInZone(at, PAKISTAN_TZ, { weekday: undefined, timeZoneName: undefined }));
        await page.goto(`/leads/${lead.id}`);
        await expect(page.getByText(formatInZone(at, PAKISTAN_TZ)).first()).toBeVisible();
        // The picker starts in Pakistan time in this view and still saves the same instant.
        await expect(page.locator("label[for=fu-due]")).toContainText("Pakistan time");

        // Back to USA time.
        await page.getByTestId("time-view").getByRole("radio", { name: "USA" }).click();
        await expect(page.getByText(formatInZone(at, SHOP_TZ)).first()).toBeVisible();

        // The Move menu closes when clicking elsewhere and on Escape.
        await page.goto("/followups?scope=team");
        const move = page.getByRole("listitem").filter({ has: page.locator(`a[href="/leads/${lead.id}"]`) }).locator("details[data-menu]");
        await move.locator("summary").click();
        await expect(move).toHaveAttribute("open", "");
        await page.getByRole("heading", { name: "Follow-ups" }).click();
        await expect(move).not.toHaveAttribute("open", "");
        await move.locator("summary").click();
        await page.keyboard.press("Escape");
        await expect(move).not.toHaveAttribute("open", "");
        expect(toLocalInput(at, PAKISTAN_TZ)).toBe(local);
      } finally {
        await sql.end();
      }
    });
  });
}
