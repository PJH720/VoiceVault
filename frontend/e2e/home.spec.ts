import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test("renders heading and tagline", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "VoiceVault" })).toBeVisible();
    await expect(page.getByText("Record your day, let AI organize it.")).toBeVisible();
  });

  test("has correct page title", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/VoiceVault/);
  });

  test("navigation links are present", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("navigation")).toBeVisible();
  });
});
