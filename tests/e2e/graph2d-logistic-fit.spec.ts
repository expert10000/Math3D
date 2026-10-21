import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { graphEditor, openGraphType, saveGraphEditor } from "./helpers/graphAuthoring";

test("GRA-15 desktop fits a logistic point series and omits unsupported bands", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(page, "Data series");
    const editor = graphEditor(page);
    await editor.getByLabel("Data series name").fill("Measured growth");
    const csv = Array.from({ length: 41 }, (_, index) => {
      const x = index / 10;
      return `${x},${(5 / (1 + Math.exp(-1.4 * (x - 2)))).toPrecision(12)}`;
    }).join("\n");
    await editor.getByLabel("Data series import").fill(csv);
    await expect(editor.getByLabel("Import preview")).toContainText("41 rows");
    await saveGraphEditor(page);
    const panel = page.getByRole("region", { name: "Regression fitting", exact: true });
    await panel.getByLabel("Regression model").selectOption("logistic-growth");
    await panel.getByLabel("Initial logistic capacity").fill("4");
    await panel.getByLabel("Initial logistic rate").fill("1");
    await panel.getByLabel("Initial logistic midpoint").fill("1.5");
    await panel.getByRole("button", { name: "Fit dataset", exact: true }).click();
    await expect(panel.getByRole("status")).toHaveText("Current regression");
    await expect(panel).toContainText("bounded-levenberg-marquardt: converged");
    await expect(panel).toContainText("No uncertainty bands are claimed");
    await expect(page.getByTestId("graph2d-regression-overlay")).toHaveCount(1);
    await panel.getByLabel("Initial logistic midpoint").fill("1.6");
    await expect(panel.getByRole("status")).toHaveCount(0);
    await expect(page.getByTestId("graph2d-regression-overlay")).toHaveCount(0);
  } finally { await closeSurfaceApp(app); }
});
