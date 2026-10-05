import { test, expect } from "@playwright/test";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState, openParametricSurface, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

for (const source of ["implicit", "parametric"] as const) test(`Open Analysis prepares ${source} live workspace documents without an import and preserves their sources`, async () => {
  test.setTimeout(180_000); let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, errors: string[] = [];
    if (source === "parametric") {
      await openParametricSurface(page);
      await page.getByRole("button", { name: "Edit custom σ(u,v)", exact: true }).first().click();
    }
    page.on("pageerror", error => errors.push(error.message));
    const panel = page.getByTestId("project-explorer-panel");
    const show = async () => { if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click(); };
    await show();
    await expect(panel.getByTestId("project-message")).toHaveText("Current workspace documents.");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const surface = before.workspace.entries.find((entry: any) => entry.module === "surface");
    await panel.getByTestId(`project-open-analysis-${surface.expected.id}`).click();
    await expect(panel).toBeHidden();
    const workflow = page.getByTestId("project-saved-mesh-workflow");
    await expect(workflow).toBeVisible();
    await workflow.getByTestId("project-analysis-studies").locator("summary").click();
    await workflow.getByTestId("project-analysis-run-study").click();
    await expect(workflow.getByTestId("project-saved-mesh-results")).toContainText("Discrete curvature");
    await show(); await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(after.identity.id).toBe(before.identity.id);
    for (const entry of before.workspace.entries) expect(after.workspace.entries.find((item: any) => item.expected.id === entry.expected.id)?.expected).toEqual(entry.expected);
    const curve = before.workspace.entries.find((entry: any) => entry.module === "curve");
    await panel.getByTestId(`project-open-analysis-${curve.expected.id}`).click();
    await expect(panel).toBeHidden(); await expect(page.getByTestId("curve-analysis-preset")).toBeVisible();
    await show(); await panel.getByTestId(`project-open-analysis-${surface.expected.id}`).click();
    await expect(panel).toBeHidden(); await expect(workflow.getByTestId("project-saved-mesh-results")).toContainText("Discrete curvature");
    expect(errors).toEqual([]);
  } finally { await closeSurfaceApp(ctx); }
});
