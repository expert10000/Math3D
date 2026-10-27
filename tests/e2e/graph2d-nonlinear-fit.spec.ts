import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { graphEditor, openGraphType, saveGraphEditor } from "./helpers/graphAuthoring";

test("GRA-15 desktop fits a checked exponential series with named initial parameters", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(page, "Data series");
    const editor = graphEditor(page);
    await editor.getByLabel("Data series name").fill("Measured decay");
    const csv = Array.from({ length: 21 }, (_, index) => {
      const x = index / 5;
      return `${x},${(3 * Math.exp(-.7 * x)).toPrecision(12)}`;
    }).join("\n");
    await editor.getByLabel("Data series import").fill(csv);
    await expect(editor.getByLabel("Import preview")).toContainText("21 rows");
    await saveGraphEditor(page);
    const panel = page.getByRole("region", { name: "Regression fitting", exact: true });
    await panel.getByLabel("Regression model").selectOption("exponential-decay");
    await panel.getByLabel("Initial exponential amplitude").fill("2");
    await panel.getByLabel("Initial exponential rate").fill("0.3");
    await panel.getByRole("button", { name: "Fit dataset", exact: true }).click();
    await expect(panel.getByRole("status")).toHaveText("Current regression");
    await expect(panel).toContainText("bounded-levenberg-marquardt: converged");
    await expect(panel).toContainText("No uncertainty bands are claimed");
    await expect(page.getByTestId("graph2d-regression-overlay")).toHaveCount(1);
    await panel.getByText("Residuals (21)").click();
    const residuals = panel.getByRole("table", { name: "Regression residual numerical results" });
    await expect(residuals.locator("tbody tr")).toHaveCount(21);
    await panel.getByRole("button", { name: "Highlight residual row", exact: false }).first().click();
    await expect(page.locator(".graph2d-probe-selected")).toHaveCount(1);
    await panel.getByLabel("Initial exponential rate").fill("0.4");
    await expect(panel.getByRole("status")).toHaveCount(0);
    await expect(page.getByTestId("graph2d-regression-overlay")).toHaveCount(0);
  } finally { await closeSurfaceApp(app); }
});
