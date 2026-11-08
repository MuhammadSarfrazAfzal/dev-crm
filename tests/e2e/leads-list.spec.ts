import { expect, test } from "@playwright/test";

test("leads list: live search and the assign menu", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("admin@example.com");
  await page.getByLabel("Password").fill("Admin123!demo");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Total leads")).toBeVisible();

  // Typing filters the list without pressing Search, ignoring case, and keeps focus.
  await page.goto("/leads");
  const box = page.getByRole("searchbox", { name: "Search leads" });
  await box.fill("summit");
  await expect(page).toHaveURL(/q=summit/);
  const rows = page.getByTestId("leads-table").locator("tbody tr");
  await expect(rows.first()).toContainText(/summit/i);
  for (const text of await rows.allInnerTexts()) expect(text).toMatch(/summit/i);
  await expect(box).toBeFocused();

  // The assign menu opens under its button, stays open, and closes on Escape.
  const button = page.getByTestId("assign-button");
  await expect(page.getByTestId("selection-bar")).toBeHidden();
  await rows.first().getByRole("checkbox").check();
  await expect(page.getByTestId("selection-bar")).toContainText("1 selected");
  await button.click();
  const menu = page.getByTestId("assign-menu");
  await expect(menu).toBeVisible();
  await page.waitForTimeout(500);
  await expect(menu).toBeVisible();
  const b = (await button.boundingBox())!;
  const m = (await menu.boundingBox())!;
  expect(m.y).toBeGreaterThanOrEqual(b.y + b.height);
  expect(Math.abs(m.x + m.width - (b.x + b.width))).toBeLessThan(2);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  // Choosing an owner asks first; Cancel changes nothing, Assign assigns the ticked lead.
  await button.click();
  await menu.getByRole("menuitem", { name: "Riley Chen" }).click();
  const dialog = page.getByTestId("assign-dialog");
  await expect(dialog).toContainText("Assign 1 lead to Riley Chen?");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Reassigned 1 lead(s).")).toBeHidden();
  await button.click();
  await menu.getByRole("menuitem", { name: "Riley Chen" }).click();
  await page.getByTestId("assign-dialog-confirm").click();
  await expect(page.getByText("Reassigned 1 lead(s).")).toBeVisible();

  // Ticking a row only selects it; clicking anywhere else on the row opens the lead.
  await page.goto("/leads");
  const first = page.getByTestId("leads-table").locator("tbody tr").first();
  await first.getByRole("checkbox").check();
  await expect(page).toHaveURL(/\/leads$/);
  await first.locator("td:visible").nth(2).click();
  await expect(page).toHaveURL(/\/leads\/[0-9a-f-]{36}$/);
});
