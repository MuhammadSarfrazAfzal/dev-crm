import path from "node:path";
import { expect, test } from "@playwright/test";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("upload → preview → approve → open lead → log call → schedule follow-up", async ({ page }) => {
  // Sign in as a salesperson.
  await page.goto("/login");
  await page.getByLabel("Email").fill("sam@example.com");
  await page.getByLabel("Password").fill("Sales123!demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Total leads")).toBeVisible();

  // Upload a CSV.
  await page.goto("/imports/new");
  await page.getByLabel("File to import").setInputFiles(path.join(import.meta.dirname, "fixtures", "e2e-leads.csv"));
  await page.getByRole("button", { name: "Read and preview" }).click();

  // Preview: columns matched, phone normalized, row ready; nothing saved yet.
  await page.getByText("Match columns").click();
  await expect(page.getByLabel("Shop Name")).toHaveAttribute("data-value", "company");
  await expect(page.getByLabel("Email", { exact: true })).toHaveAttribute("data-value", "email");
  const row = page.getByRole("row", { name: /E2E Summit Phone Lab/ });
  await expect(row).toContainText("(720) 555-0177");
  await expect(row.getByTestId("import-email")).toHaveText("avery@summit-lab.example.com");
  await expect(row).toContainText("Denver");
  await expect(row).toContainText("CO");
  await expect(row.getByRole("checkbox")).toBeChecked();

  // Approve.
  await page.getByRole("button", { name: "Approve and import" }).click();
  await expect(page.getByText(/1 lead\(s\) added/)).toBeVisible();

  // The email shows on the leads list.
  await page.goto("/leads?q=Summit");
  await expect(page.getByTestId("leads-table").getByRole("row", { name: /E2E Summit Phone Lab/ })).toContainText("avery@summit-lab.example.com");
  await page.goBack();

  // Open the new lead.
  await page.getByRole("row", { name: /E2E Summit Phone Lab/ }).getByRole("link", { name: "Open" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "E2E Summit Phone Lab" })).toBeVisible();
  await expect(page.getByTestId("calling-window")).toBeVisible();

  // Copy the number.
  await page.getByRole("button", { name: "Copy number" }).first().click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("+17205550177");

  // Log the call with an outcome, notes and a follow-up in the shop's time zone.
  await page.getByText("Call back later", { exact: true }).click();
  await expect(page.getByRole("radio", { name: /Call back later/ })).toBeChecked();
  await page.locator("#call-callback-notes").fill("Avery asked us to call back about the repair module.");
  await page.getByRole("button", { name: "Next business day 10 am" }).first().click();
  await page.getByRole("button", { name: "Save call" }).click();
  await expect(page.getByText(/Call saved/)).toBeVisible();

  // History and follow-up show up.
  const timeline = page.getByTestId("timeline");
  await expect(timeline.getByRole("listitem").filter({ hasText: "Avery asked us" })).toContainText(/Call\s*Call back later/);
  await expect(timeline).toContainText("Avery asked us to call back");
  await expect(page.getByText("1 call attempt")).toBeVisible();

  // The follow-up is in the queue, shown in the shop's zone and the rep's zone.
  await page.goto("/followups");
  const item = page.getByRole("listitem").filter({ hasText: "E2E Summit Phone Lab" });
  await expect(item).toContainText("Demo the repair tickets");
  await expect(item).toContainText(/10:00 AM M[DS]T/);
  await expect(item).toContainText(/Pakistan: .*(9|10):00 PM PKT/);

  // Move it from the list: next business day 2 pm in the shop's time.
  await item.getByLabel(/Reschedule or cancel/).click();
  await item.getByRole("button", { name: "Next business day 2 pm" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "E2E Summit Phone Lab" })).toContainText(/2:00 PM M[DS]T/);
});
