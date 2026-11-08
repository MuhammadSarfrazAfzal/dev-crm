import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { localDatabaseUrl } from "../../scripts/dbtools";

const DB_URL = process.env.E2E_DATABASE_URL ?? localDatabaseUrl("salescrm_e2e");
const count = async (page: import("@playwright/test").Page) => Number((await page.getByText(/of \d+ leads|No leads/).first().textContent())?.match(/of (\d+) leads/)?.[1] ?? 0);

test("an admin deletes leads one at a time, several at once, from the lead page and from Companies", async ({ page }) => {
  const sql = postgres(DB_URL, { max: 1, onnotice: () => {} });
  try {
    await page.goto("/login");
    await page.getByLabel("Email").fill("admin@example.com");
    await page.getByLabel("Password").fill("Admin123!demo");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Total leads")).toBeVisible();

    // One ticked row: Delete asks first; Cancel keeps it.
    await page.goto("/leads?sort=company");
    const before = await count(page);
    const firstRow = page.getByTestId("leads-table").locator("tbody tr").first();
    const firstName = (await firstRow.locator("a").first().textContent())!.trim();
    const firstId = (await firstRow.locator("a").first().getAttribute("href"))!.split("/").pop()!;
    await expect(page.getByTestId("delete-row")).toHaveCount(0);
    await firstRow.locator('input[name="ids"]').check();
    await page.getByTestId("delete-selected").click();
    await expect(page.getByTestId("delete-dialog")).toContainText("Delete 1 lead?");
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("delete-dialog")).toBeHidden();
    await page.getByTestId("delete-selected").click();
    await page.getByTestId("delete-dialog-confirm").click();
    await expect(page.getByTestId("delete-dialog")).toBeHidden();
    await expect.poll(() => count(page)).toBe(before - 1);
    expect(await sql`select id from leads where id = ${firstId}`).toHaveLength(0);

    // Several at once from the selection bar.
    const rows = page.getByTestId("leads-table").locator("tbody tr");
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      ids.push((await rows.nth(i).locator("a").first().getAttribute("href"))!.split("/").pop()!);
      await rows.nth(i).locator('input[name="ids"]').check();
    }
    await expect(page.getByTestId("selection-bar")).toContainText("3 selected");
    await page.getByTestId("delete-selected").click();
    await expect(page.getByTestId("delete-dialog")).toContainText("Delete 3 leads?");
    await expect(page.getByTestId("delete-dialog")).toContainText("with their calls, follow-ups, emails, deals");
    await page.getByTestId("delete-dialog-confirm").click();
    await expect.poll(() => count(page)).toBe(before - 4);
    expect(await sql`select id from leads where id = any(${ids}::uuid[])`).toHaveLength(0);

    // From the lead page: back to Leads afterwards; its calls and follow-ups are gone too.
    const [busy] = await sql`select l.id, c.name from leads l join companies c on c.id = l.company_id
      where exists (select 1 from call_activities a where a.lead_id = l.id) order by c.name limit 1`;
    await page.goto(`/leads/${busy.id}`);
    await page.getByTestId("delete-lead").click();
    await page.getByTestId("delete-dialog-confirm").click();
    await expect(page).toHaveURL(/\/leads$/);
    const [left] = await sql`select (select count(*)::int from call_activities where lead_id = ${busy.id}) as calls,
      (select count(*)::int from followups where lead_id = ${busy.id}) as followups`;
    expect(left).toEqual({ calls: 0, followups: 0 });
    const audit = await sql`select details from audit_logs where action = 'company.deleted' and details -> 'leads' -> 0 ->> 'id' = ${busy.id}`;
    expect(audit).toHaveLength(1);
    expect(audit[0].details.name).toBe(busy.name);

    // From a company page (Companies rows have no delete of their own).
    await page.goto("/companies");
    await expect(page.getByTestId("delete-company-row")).toHaveCount(0);
    const crow = page.getByTestId("companies-table").locator("tbody tr").first();
    const cid = (await crow.locator("a").first().getAttribute("href"))!.split("/").pop()!;
    await page.goto(`/companies/${cid}`);
    await page.getByTestId("delete-company").click();
    await page.getByTestId("delete-dialog-confirm").click();
    await expect(page).toHaveURL(/\/companies$/);
    expect(await sql`select id from companies where id = ${cid}`).toHaveLength(0);
  } finally {
    await sql.end();
  }
});

test("a salesperson sees no delete buttons", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("sam@example.com");
  await page.getByLabel("Password").fill("Sales123!demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Total leads")).toBeVisible();
  await page.goto("/leads");
  await expect(page.getByTestId("delete-selected")).toHaveCount(0);
  const [lead] = await page.getByTestId("leads-table").locator("tbody tr a").first().getAttribute("href").then((h) => [h]);
  await page.goto(lead!);
  await expect(page.getByTestId("delete-lead")).toHaveCount(0);
});
