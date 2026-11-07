import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createMath3DProject, createMixedWorkspaceDocument,
  parseMath3DProject, reviseVectorField3DDocument,
  serializeMath3DProject, vectorField3DExpression,
  type VectorField3DDocument } from "@math3d/core";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-41/42 saves analytic topology recipes and hands oriented crossings to Graphs", async () => {
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
  const project = createMath3DProject(createMixedWorkspaceDocument({
    entries: [{ module: "vector3d", checkpoint: source,
      expected: source.identity, replay: null }],
    activeDocumentIds: [source.identity.id], results: [], artifacts: [],
    relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "gf41-gf42-desktop", title: "Analytic topology gate" });
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gf41-gf42.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(serializeMath3DProject(project)) });
    await projects.getByTestId("project-import-open").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const openExplorer = async () => {
      const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
      if (!await explorer.isVisible()) {
        await page.locator(".graph2d-toolbar-menu > summary").click();
        await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
      }
      return explorer;
    };
    let explorer = await openExplorer();
    await explorer.getByRole("button", { name: "Analyze", exact: true }).click();
    const studies = explorer.getByTestId("gf41-gf42-topology-studies");
    await studies.getByRole("button", { name: "Compute bounded basin map" }).click();
    await expect(studies.getByTestId("gf41-basin-status")).toContainText("seeds");
    await studies.getByRole("button", { name: "Save basin recipe" }).click();
    await studies.getByRole("button", { name: "Compute oriented crossings" }).click();
    await expect(studies.getByTestId("gf42-section-status")).toContainText("crossings");
    await studies.getByRole("button", { name: "Save section recipe" }).click();
    await expect(studies.getByTestId("gf41-gf42-saved-result")).toHaveCount(2);
    await studies.getByRole("button", { name: "Open crossings in Graphs" }).click();
    await expect(page.getByLabel("Graph functions", { exact: true }))
      .toContainText("Poincaré crossings");
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    explorer = await openExplorer();
    await expect(explorer.getByTestId("gf41-gf42-saved-result")).toHaveCount(2);
    await expect(page.getByLabel("Graph functions", { exact: true }))
      .toContainText("Poincaré crossings");
  } finally { await closeSurfaceApp(app); }
});
