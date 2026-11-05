import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createMath3DProject, createMixedWorkspaceDocument,
  parseMath3DProject, reviseVectorField3DDocument,
  reviseVectorField3DWorkspace, searchVectorField3DEquilibria,
  serializeMath3DProject, vectorField3DExpression,
  type VectorField3DDocument } from "@math3d/core";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-46 promotes a local stable manifold Mesh with Project resource reopen", async () => {
  test.setTimeout(120_000);
  const fixture = parseMath3DProject(readFileSync(resolve(
    "tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d"), "utf8"));
  const original = fixture.workspace.entries.find(item => item.module === "vector3d")!
    .checkpoint as VectorField3DDocument;
  const field = reviseVectorField3DDocument(original, { ...original.source,
    field: { kind: "expressions", components: [
      vectorField3DExpression("-x", "m/s"),
      vectorField3DExpression("-2*y", "m/s"),
      vectorField3DExpression("z", "m/s") ] } });
  const search = searchVectorField3DEquilibria(field, undefined,
    { seedResolution: 3, maxEvaluations: 20_000 });
  const equilibrium = search.candidates.find(item => Math.hypot(...item.position) < 1e-6)!;
  const source = reviseVectorField3DWorkspace(field, { ...field.workspace!,
    equilibriumConstructions: [{ id: "gf46-equilibrium", position: equilibrium.position,
      residual: equilibrium.residual, classification: equilibrium.classification,
      sourceRevision: field.identity.revision,
      sourceStructuralHash: field.identity.structuralHash,
      sourceHash: search.sourceHash }] });
  const project = createMath3DProject(createMixedWorkspaceDocument({
    entries: [{ module: "vector3d", checkpoint: source,
      expected: source.identity, replay: null }],
    activeDocumentIds: [source.identity.id], results: [], artifacts: [],
    relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "gf46-desktop", title: "Local manifold gate" });
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gf46.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(serializeMath3DProject(project)) });
    await projects.getByTestId("project-import-open").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (!await explorer.isVisible()) {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    }
    await explorer.getByRole("button", { name: "Analyze", exact: true }).click();
    const advanced = explorer.getByTestId("gf44-gf46-advanced-topology");
    await advanced.getByLabel("Saved equilibrium").selectOption("gf46-equilibrium");
    await advanced.getByRole("button", { name: "Build bounded local patch" }).click();
    await expect(advanced.getByTestId("gf46-manifold-status"))
      .toContainText("40 vertices");
    await advanced.getByRole("button", { name: "Save local patch as Mesh" }).click();
    await expect(page.getByTestId("gf46-mesh-source-status"))
      .toContainText("source and Mesh bytes verified");
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    await page.reload();
    await openLastSavedProject(page);
    const saved = await page.evaluate(() => JSON.parse(
      localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace.results.some((item: { provenance: { operation: { type: string } } }) =>
      item.provenance.operation.type === "vector3d.local-manifold-patch")).toBe(true);
    expect(saved.workspace.entries.some((item: { module: string; checkpoint: {
      source?: { origin?: { kind?: string } } } }) => item.module === "mesh" &&
      item.checkpoint.source?.origin?.kind === "vector3d.local-manifold-patch"))
      .toBe(true);
  } finally { await closeSurfaceApp(app); }
});
