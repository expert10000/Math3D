import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { computeVectorField3DPoincareSection, createMath3DProject,
  createMixedWorkspaceDocument, parseMath3DProject,
  reviseVectorField3DDocument, serializeMath3DProject,
  upsertProjectVectorField3DTopologyStudy, vectorField3DExpression,
  type VectorField3DDocument } from "@math3d/core";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-44/45 saves a return map and finite-time estimate through Graphs and Project reopen", async () => {
  test.setTimeout(120_000);
  const fixture = parseMath3DProject(readFileSync(resolve(
    "tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d"), "utf8"));
  const original = fixture.workspace.entries.find(item => item.module === "vector3d")!
    .checkpoint as VectorField3DDocument;
  const source = reviseVectorField3DDocument(original, { ...original.source,
    field: { kind: "expressions", components: [
      vectorField3DExpression("-y", "m/s"),
      vectorField3DExpression("x", "m/s"),
      vectorField3DExpression("0", "m/s") ] } });
  const section = computeVectorField3DPoincareSection(source, {
    seed: [1, 0, 0], section: { start: [0, 0, 0], end: [0, 2, 0],
      normal: [1, 0], direction: "negative" },
    solver: { method: "rk4-step-doubling", maxSteps: 256, maxTime: 20,
      absoluteTolerance: 1e-5, relativeTolerance: 1e-5 },
    maxCrossings: 8, tangencyTolerance: 1e-4 });
  const blank = createMath3DProject(createMixedWorkspaceDocument({
    entries: [{ module: "vector3d", checkpoint: source,
      expected: source.identity, replay: null }],
    activeDocumentIds: [source.identity.id], results: [], artifacts: [],
    relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "gf44-gf45-desktop", title: "Return and growth gate" });
  const project = upsertProjectVectorField3DTopologyStudy(blank,
    section.publication);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gf44-gf45.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(serializeMath3DProject(project)) });
    await projects.getByTestId("project-import-open").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const openExplorer = async () => {
      const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
      if (!await explorer.isVisible()) {
        await page.locator(".graph2d-toolbar-menu > summary").click();
        await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
      }
      await explorer.getByRole("button", { name: "Analyze", exact: true }).click();
      return explorer;
    };
    let explorer = await openExplorer();
    const advanced = explorer.getByTestId("gf44-gf46-advanced-topology");
    await advanced.getByLabel("Saved oriented section").selectOption(
      section.publication.resultId);
    await advanced.getByRole("button", { name: "Compute bounded return pairs" }).click();
    await expect(advanced.getByTestId("gf44-return-status")).toContainText("ordered pairs");
    await advanced.getByRole("button", { name: "Save return map" }).click();
    await advanced.getByRole("button", { name: "Estimate finite-time growth" }).click();
    await expect(advanced.getByTestId("gf45-lyapunov-status"))
      .toContainText("Finite-time estimate");
    await advanced.getByRole("button", { name: "Save finite-time estimate" }).click();
    await expect(advanced.getByTestId("gf44-gf46-saved-result")).toHaveCount(2);
    await advanced.getByRole("button", { name: "Open return map in Graphs" }).click();
    await expect(page.getByLabel("Graph functions", { exact: true }))
      .toContainText("Poincaré return map");
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    explorer = await openExplorer();
    await expect(explorer.getByTestId("gf44-gf46-saved-result")).toHaveCount(2);
    await expect(page.getByLabel("Graph functions", { exact: true }))
      .toContainText("Poincaré return map");
  } finally { await closeSurfaceApp(app); }
});
