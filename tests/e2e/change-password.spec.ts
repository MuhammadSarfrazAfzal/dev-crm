import { expect, test } from "@playwright/test";

async function signIn(page: import("@playwright/test").Page, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("riley@example.com");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("a salesperson changes their own password and signs in with it", async ({ page }) => {
  await signIn(page, "Sales123!demo");
  await expect(page.getByText("Total leads")).toBeVisible();

  await page.goto("/settings");
  await page.getByLabel("Current password").fill("wrong-password");
  await page.getByLabel("New password", { exact: true }).fill("NewRiley123!pass");
  await page.getByLabel("New password again").fill("NewRiley123!pass");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Your current password isn't right.")).toBeVisible();

  await page.getByLabel("Current password").fill("Sales123!demo");
  await page.getByLabel("New password", { exact: true }).fill("NewRiley123!pass");
  await page.getByLabel("New password again").fill("NewRiley123!pass");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText(/Password changed/)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).first().click();
  await signIn(page, "Sales123!demo");
  await expect(page.getByText("Wrong email or password.")).toBeVisible();
  await signIn(page, "NewRiley123!pass");
  await expect(page.getByText("Total leads")).toBeVisible();
});
