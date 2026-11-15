import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { openGraphType, saveGraphEditor } from "./helpers/graphAuthoring";

test("Graph plot stays within its viewport after navigation and hide/show", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1100, height: 750 });
    await page.getByTestId("workspace-nav-complex_analysis").click();
    await page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(page, "Function");
    await saveGraphEditor(page);
    const plot = page.getByTestId("graph2d-plot");
    await expect(plot).toBeVisible();
    const functions = page.getByLabel("Graph functions", { exact: true });
    await functions.getByRole("button", { name: "Hide f", exact: true }).click();
    await expect(functions.getByText("Hidden")).toBeVisible();
    await expect(plot.getByTestId("graph2d-interval-overlays")).toHaveCount(0);
    if (process.env.MATH3D_UI_CAPTURE_DIR) {
      mkdirSync(process.env.MATH3D_UI_CAPTURE_DIR, { recursive: true });
      await page.getByTestId("main-viewer").screenshot({ path: join(process.env.MATH3D_UI_CAPTURE_DIR, "graph-hidden-before.png") });
    }
    await functions.getByRole("button", { name: "Show f", exact: true }).click();
    await expect(functions.getByText("Hidden")).toHaveCount(0);
    await expect(plot.getByTestId("graph2d-interval-overlays")).toHaveCount(1);
    await page.getByTestId("workspace-nav-mesh").click();
    await page.getByTestId("workspace-nav-graphs").click();
    await expect(plot).toBeVisible();
    await expect(plot.getByTestId("graph2d-interval-overlays")).toHaveCount(1);
    if (process.env.MATH3D_UI_CAPTURE_DIR) {
      await page.getByTestId("main-viewer").screenshot({ path: join(process.env.MATH3D_UI_CAPTURE_DIR, "graph-return-before.png") });
    }
  } finally {
    await closeSurfaceApp(app);
  }
});
