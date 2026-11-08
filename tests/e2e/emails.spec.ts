import { expect, test } from "@playwright/test";

test("emails worklist: mark a promised email as sent and view in completed tab", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("Admin123!demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Total leads")).toBeVisible();

  await page.goto("/emails");
  await expect(page.getByRole("link", { name: /To send/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Completed/ })).toBeVisible();

  const rows = page.getByTestId("email-row");
  const before = await rows.count();
  expect(before).toBeGreaterThan(0);
  const name = (await rows.first().getByRole("link").first().textContent())!;
  await rows.first().getByRole("button", { name: "Mark sent" }).click();
  await expect(rows).toHaveCount(before - 1);

  // Switch to Completed tab and verify the lead is there
  await page.getByRole("link", { name: /Completed/ }).click();
  await expect(page.getByTestId("email-row").first()).toContainText(name);
  await expect(page.getByTestId("email-row").first()).toContainText("Sent");

  // The sent step is in the lead's history.
  await page.getByRole("link", { name: "Leads" }).first().click();
  await page.goto(`/leads?q=${encodeURIComponent(name)}`);
  await page.getByTestId("leads-table").getByRole("link", { name }).first().click();
  await expect(page.getByTestId("timeline")).toContainText("Sent");
});
