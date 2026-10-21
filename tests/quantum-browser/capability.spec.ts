import { expect, test } from "@playwright/test";

test("Math3D browser declares quantum folder import desktop-only", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => ({ quantum: !!window.quantumScenes, scientific: !!window.scientificScenes })))
    .toEqual({ quantum: false, scientific: false });
  await page.getByRole("button", { name: "Palette", exact: true }).click();
  await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
    .fill("Open Theory Lab quantum scene");
  await page.getByRole("button", { name: /Open Theory Lab quantum scene/ }).click();
  await expect(page.getByText("Verified quantum-scene import is available in the desktop app.")).toBeVisible();
  await expect(page.getByTestId("quantum-scene-preview")).toHaveCount(0);
});
