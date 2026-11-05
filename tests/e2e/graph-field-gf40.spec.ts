import { expect, test } from "@playwright/test";
import { applyGraph2DAuthoring, createEmptyGraph2DDocument,
  createGraph2DDocument, createGraph2DWorkspaceProject, createMath3DProject,
  serializeMath3DProject } from "@math3d/core";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-40 saves an approximate linked derivative through Project reopen", async () => {
  test.setTimeout(120_000);
  const blank = createEmptyGraph2DDocument("gf40-desktop");
  const graph = createGraph2DDocument({ ...applyGraph2DAuthoring(blank,
    { type: "create", draft: { label: "Cusp", expression: "abs(x)",
      domain: { min: -2, max: 2, includeMin: true, includeMax: true },
      style: { color: "#2563eb", lineWidth: 2, lineStyle: "solid", visible: true } } }),
  stableKey: "gf40-desktop" });
  const project = createMath3DProject(createGraph2DWorkspaceProject(graph),
    { stableKey: "gf40-desktop-project" });
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gf40.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(serializeMath3DProject(project)) });
    await projects.getByTestId("project-import-open").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const inspector = page.locator(".graph2d-compact-panels summary")
      .filter({ hasText: "Inspector" });
    if (await inspector.isVisible()) await inspector.click();
    const controls = page.locator('[data-testid="gf40-saved-derivative"]:visible').first();
    await controls.getByLabel("Allow approximate numerical fallback").check();
    await controls.getByRole("button", { name: "Save extended derivative curve" }).click();
    await expect(page.getByLabel("Graph functions", { exact: true }))
      .toContainText("Cusp'");
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await expect(page.getByLabel("Graph functions", { exact: true }))
      .toContainText("Cusp'");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const entry = saved.workspace.entries.find((item: { module: string }) =>
      item.module === "graph2d");
    expect(entry.replay).not.toBeNull();
    expect(entry.expected.revision).toBeGreaterThan(entry.checkpoint.identity.revision);
  } finally { await closeSurfaceApp(app); }
});
