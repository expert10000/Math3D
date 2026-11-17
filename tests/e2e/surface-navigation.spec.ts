import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, openSurfaceGenerator, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("Surface panel navigation retains its entry points", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1100, height: 750 });
    await openSurfaceGenerator(page);
    await expect(page.getByTestId("surface-module-actions")).toBeVisible();
    const stages = page.getByTestId("surface-workflow-stages");
    await expect(stages).not.toHaveAttribute("open", "");
    await expect(stages.locator("summary")).toContainText("Workflow navigation");
    await expect(page.getByTestId("surface-workflow-preview-primary")).toBeVisible();
    if (process.env.MATH3D_UI_CAPTURE_DIR) {
      mkdirSync(process.env.MATH3D_UI_CAPTURE_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.MATH3D_UI_CAPTURE_DIR, "surface-nav-compact-source-build.png") });
    }
    await stages.locator("summary").click();
    await expect(page.getByTestId("surface-workflow-preview-primary")).toBeHidden();
    await stages.getByRole("button", { name: "Analyze", exact: true }).click();
    await expect(page.getByTestId("surfaces-left-tab-analysis")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("surfaces-left-tab-scene").click();
    await expect(page.getByTestId("surfaces-left-tab-scene")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("surfaces-left-tab-analysis").click();
    await expect(page.getByTestId("surfaces-left-tab-analysis")).toHaveAttribute("aria-pressed", "true");
    if (process.env.MATH3D_UI_CAPTURE_DIR) {
      await page.screenshot({ path: join(process.env.MATH3D_UI_CAPTURE_DIR, "surface-nav-expanded-source-build.png") });
    }
  } finally {
    await closeSurfaceApp(app);
  }
});
