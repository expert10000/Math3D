import { expect, test } from "@playwright/test";

test("GK19 browser shell advertises only its probed facilities and opens shared workspace", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
  await page.getByTestId("kernel-workspace-toggle").click();
  const platform = page.getByTestId("kernel-platform-capabilities");
  await expect(platform).toContainText("Platform: browser");
  await expect(platform).toContainText("hostFileSystem: Desktop file bridge is unavailable");
  await expect(platform).toContainText("nativeDialog: Desktop native dialog bridge is unavailable");
});
