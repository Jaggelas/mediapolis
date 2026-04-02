import { expect, test } from "@playwright/test";

test("redirects visitors to the login screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /sign in on your local network/i })).toBeVisible();
});
