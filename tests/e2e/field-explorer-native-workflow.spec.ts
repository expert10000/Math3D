import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

async function openExplorer(page: Page) {
  await page.getByTestId("workspace-nav-graphs").click();
  const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
  if (!await explorer.isVisible()) {
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer", exact: true }).click();
  }
  await expect(explorer).toBeVisible(); return explorer;
}

test("native Field Explorer configures, probes, pins, compares and cold-reopens exact Project checkpoints", async () => {
  let app = await launchSurfaceApp();
  try {
    let page = app.page;
    await resetSurfaceAppState(page);
    const core = require(resolve("packages/core/src/index.ts"));
    const fixture = core.parseMath3DProject(readFileSync(resolve(
      "tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d"), "utf8"));
    const original = fixture.workspace.entries.find((entry: any) => entry.module === "vector3d").checkpoint;
    const source = core.createVectorField3DDocument({ ...original.source,
      field: { kind: "expressions", components: ["-y", "x", "0"].map(p =>
        core.vectorField3DExpression(p, "m/s")) } }, { stableKey: "native-workflow-A",
      workspace: { ...core.defaultVectorField3DWorkspace(original.source), selectedLayer: "xy",
        probe: [1, 1, 0] } });
    const project = core.createMath3DProject(core.createMixedWorkspaceDocument({
      entries: [{ module: "vector3d", checkpoint: source, expected: source.identity, replay: null }],
      activeDocumentIds: [source.identity.id], results: [], artifacts: [], relations: [],
      constructions: [], committedSelection: null }), { stableKey: "native-workflow-project" });
    await page.getByTestId("projects-toggle").click();
    let projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "native-field-workflow.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(core.serializeMath3DProject(project)) });
    await expect(projects.getByTestId("project-import-open")).toBeEnabled();
    await projects.getByTestId("project-import-open").click();
    let explorer = await openExplorer(page);
    await explorer.getByRole("button", { name: "Pin current as baseline B", exact: true }).click();
    await expect(explorer.getByRole("region", { name: "Linked A/B field views" })).toBeVisible();
    await expect(explorer.getByTestId("field-explorer-project-hierarchy")).toContainText("Sources (2)");
    await explorer.getByLabel("P(x,y,z)", { exact: true }).fill("-2*y");
    await explorer.getByLabel("Q(x,y,z)", { exact: true }).fill("2*x");
    await explorer.getByRole("button", { name: "Verify & render arrows", exact: true }).click();
    await explorer.getByRole("button", { name: "Save field to Project", exact: true }).click();
    const comparison = explorer.getByTestId("gf18-field-comparison");
    await comparison.getByLabel("Points per axis").selectOption("5");
    await comparison.getByRole("button", { name: "Compare fields", exact: true }).click();
    await expect(comparison).toContainText("Coverage 125/125");
    await expect(comparison.getByRole("button", { name: "Save comparison in Project" })).toBeEnabled();
    await comparison.getByRole("button", { name: "Save comparison in Project" }).click();
    await expect(comparison).toContainText("Saved comparisons (1)");
    const pair = explorer.getByRole("region", { name: "Linked A/B field views" });
    const live = pair.getByRole("region", { name: "Live field A" });
    await live.getByRole("img", { name: /^magnitude map/ }).locator('rect[style*="crosshair"]').nth(100).click();
    await expect(pair.getByRole("region", { name: "Line profile through probe" })).toHaveCount(2);
    await explorer.getByRole("button", { name: "Save field to Project", exact: true }).click();
    await page.getByTestId("projects-toggle").click();
    projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const active = saved.workspace.entries.find((e: any) => e.expected.id === source.identity.id).checkpoint;
    const pin = active.workspace.explorer.comparisonSource;
    expect(active.workspace.explorer).toMatchObject({ inspectorSection: "analyze",
      comparisonVisible: true, comparisonResolution: 5 });
    expect(saved.workspace.entries.find((e: any) => e.expected.id === pin.id).checkpoint.source)
      .toEqual(source.source);
    expect(saved.workspace.results.some((r: any) => r.provenance.operation.type === "vector3d.field-comparison"))
      .toBe(true);
    const profileDir = app.profileDir;
    await app.app.close(); // Actual process restart with the same saved Project library.
    app = await launchSurfaceApp({}, profileDir); page = app.page;
    await openLastSavedProject(page);
    explorer = await openExplorer(page);
    const reopenedComparison = explorer.getByTestId("gf18-field-comparison");
    await expect(reopenedComparison.getByLabel("Second saved field")).toHaveValue(pin.id);
    await expect(reopenedComparison.getByLabel("Points per axis")).toHaveValue("5");
    await expect(explorer.getByRole("region", { name: "Linked A/B field views" })).toBeVisible();
    await expect(explorer.getByRole("region", { name: "Line profile through probe" })).toHaveCount(2);
    await expect(reopenedComparison).toContainText("Saved comparisons (1)");
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(restored.workspace.entries.find((e: any) => e.expected.id === source.identity.id).checkpoint)
      .toEqual(active);
    expect(core.resolveFieldExplorerBaseline(core.parseMath3DProject(JSON.stringify(restored)), active).identity)
      .toEqual(pin);
    await reopenedComparison.getByRole("button", { name: "Compare fields", exact: true }).click();
    await expect(reopenedComparison).toContainText("Coverage 125/125");
    await explorer.getByRole("button", { name: "Save field to Project", exact: true }).click();
    await explorer.getByLabel("P(x,y,z)", { exact: true }).fill("-3*y");
    await explorer.getByRole("button", { name: "Verify & render arrows", exact: true }).click();
    await expect(reopenedComparison).not.toContainText("Coverage 125/125");
    await expect(reopenedComparison.getByRole("button", { name: "Save comparison in Project" })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("native-field-workflow.png"), fullPage: true });
  } finally { await closeSurfaceApp(app); }
});
