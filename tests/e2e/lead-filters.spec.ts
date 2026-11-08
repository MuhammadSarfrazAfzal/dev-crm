import { expect, test } from "@playwright/test";

const count = async (page: import("@playwright/test").Page) => Number((await page.getByText(/of \d+ leads|No leads/).first().textContent())?.match(/of (\d+) leads/)?.[1] ?? 0);

test("leads filters: combined filters, chips, dashboard links and CSV export", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("Admin123!demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Total leads")).toBeVisible();

  // The Not called card lands on the matching chips with the same number.
  const card = page.getByRole("link", { name: /Not called/ });
  const expected = Number((await card.locator(".text-2xl").textContent())?.trim());
  await card.click();
  await expect(page.getByTestId("filter-chips")).toContainText("Calls: Not called yet");
  expect(await count(page)).toBe(expected);

  // Combine filters: Products, then State from the Filters panel.
  await page.goto("/leads");
  const all = await count(page);
  const panel = page.getByTestId("filters-panel");
  await page.getByTestId("filters-button").click();
  await expect(panel).toBeVisible();
  await panel.getByTestId("panel-product").getByRole("button").first().click();
  await panel.getByTestId("panel-product").getByLabel(/Interested in 8staros POS/).check();
  await page.getByTestId("filters-apply").click();
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(/product=pos/);
  const pos = await count(page);
  expect(pos).toBeGreaterThan(0);
  expect(pos).toBeLessThan(all);

  // Narrow to the state of the first shop that wants POS.
  const firstRow = await page.getByTestId("leads-table").locator("tbody tr").first().innerText();
  const [, city, st] = firstRow.match(/([A-Za-z .]+), ([A-Z]{2})\b/) ?? [];
  await page.getByTestId("filters-button").click();
  await panel.getByTestId("panel-state").getByRole("button").first().click();
  await panel.getByTestId("panel-state").getByLabel(new RegExp(`\\(${st}\\)`)).check();
  await expect(page.getByTestId("filters-apply")).toHaveText(/Show \d+ leads?/);
  await page.getByTestId("filters-apply").click();
  await expect(panel).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`state=${st}`));
  await expect(page.getByTestId("filter-chips")).toContainText(`(${st})`);
  const both = await count(page);
  expect(both).toBeGreaterThan(0);
  expect(both).toBeLessThanOrEqual(pos);
  for (const text of await page.getByTestId("leads-table").locator("tbody tr").allInnerTexts()) {
    expect(text).toContain(`, ${st}`);
    expect(text).toMatch(/\bPOS\b/);
  }

  // Live search combines with the filters.
  await page.getByRole("searchbox", { name: "Search leads" }).fill(city.trim().split(" ").pop()!.toLowerCase());
  await expect(page).toHaveURL(/q=/);
  await expect(page).toHaveURL(/product=pos/);

  // CSV export follows the same filters.
  const csv = await page.evaluate(async () => (await fetch(`/api/export/leads${location.search}`)).text());
  const rows = csv.trim().split("\n").slice(1);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((r) => r.includes("8staros POS") && r.includes(`,${st},`))).toBe(true);

  // Removing a chip widens the list again; Clear all filters resets.
  await page.getByTestId("filter-chips").getByRole("button", { name: new RegExp(`\\(${st}\\)`) }).click();
  await expect(page).not.toHaveURL(new RegExp(`state=${st}`));
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).not.toHaveURL(/product=/);
});
