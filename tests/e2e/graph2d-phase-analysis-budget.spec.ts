import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { graphEditor, openGraphType, saveGraphEditor } from "./helpers/graphAuthoring";

test("phase analysis budget changes equilibria without restarting scene sampling", async () => {
  test.setTimeout(90_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(page, "Phase portrait");
    await graphEditor(page).getByLabel("Start from preset").selectOption("damped");
    await saveGraphEditor(page);
    const inspector = page.getByLabel("Graph inspector", { exact: true });
    const table = inspector.getByTestId("graph2d-phase-equilibria-table");
    await inspector.getByLabel("Phase equilibrium evaluation budget").selectOption("2000");
    await expect(table).toBeVisible();
    const arrows = page.locator("[data-graph2d-phase-field] line");
    await expect.poll(() => arrows.count()).toBeGreaterThan(0);
    const arrowCount = await arrows.count();
    const orbitPath = await page.locator("[data-graph2d-path]").first().getAttribute("d");
    const quickEvaluations = await inspector.getByText(/Independent of field and orbit rendering/).textContent();
    await inspector.getByLabel("Phase equilibrium evaluation budget").selectOption("12000");
    await expect(table).toBeVisible();
    await expect.poll(async () => inspector.getByText(/Independent of field and orbit rendering/).textContent())
      .not.toBe(quickEvaluations);
    expect(await arrows.count()).toBe(arrowCount);
    expect(await page.locator("[data-graph2d-path]").first().getAttribute("d")).toBe(orbitPath);
    await expect(inspector.getByTestId("graph2d-phase-equilibria")).toContainText("Approximate equilibria");
  } finally { await closeSurfaceApp(app); }
});
