import { expect, test } from "@playwright/test";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument, createGraph2DDocument,
  createGraph2DWorkspaceProject, createMath3DProject,
  serializeMath3DProject } from "@math3d/core";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-36 saves a linked derivative through Graphs and Project reopen", async () => {
  test.setTimeout(120_000);
  const blank = createEmptyGraph2DDocument("gf36-desktop");
  const graph = createGraph2DDocument({ ...applyGraph2DAuthoring(blank,
    { type: "create", draft: { label: "Parabola", expression: "x^2",
      domain: { min: -3, max: 3, includeMin: true, includeMax: true },
      style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } }),
  stableKey: "gf36-desktop" });
  const project = createMath3DProject(createGraph2DWorkspaceProject(graph),
    { stableKey: "gf36-desktop-project" });
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gf36.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(serializeMath3DProject(project)) });
    await projects.getByTestId("project-import-open").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const inspector = page.locator(".graph2d-compact-panels summary")
      .filter({ hasText: "Inspector" });
    if (await inspector.isVisible()) await inspector.click();
    await page.locator('[data-testid="gf36-save-derivative-curve"]:visible').first().click();
    await expect(page.getByLabel("Graph functions", { exact: true }))
      .toContainText("Parabola'");
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await expect(page.getByLabel("Graph functions", { exact: true }))
      .toContainText("Parabola'");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const entry = saved.workspace.entries.find((item: { module: string }) =>
      item.module === "graph2d");
    expect(entry.replay).not.toBeNull();
    expect(entry.expected.revision).toBeGreaterThan(entry.checkpoint.identity.revision);
  } finally { await closeSurfaceApp(app); }
});
