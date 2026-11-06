import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { computeVectorField3DLocalManifoldPatch, createMath3DProject,
  createMixedWorkspaceDocument, parseMath3DProject,
  reviseVectorField3DDocument, reviseVectorField3DWorkspace,
  searchVectorField3DEquilibria, serializeMath3DProject,
  upsertProjectLocalManifoldPatch, vectorField3DExpression,
  type VectorField3DDocument } from "@math3d/core";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-55 saves adaptive local continuation evidence and Mesh", async () => {
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
    equilibriumConstructions: [{ id: "gf55-desktop-equilibrium",
      position: equilibrium.position, residual: equilibrium.residual,
      classification: equilibrium.classification,
      sourceRevision: field.identity.revision,
      sourceStructuralHash: field.identity.structuralHash,
      sourceHash: search.sourceHash }] });
  let project = createMath3DProject(createMixedWorkspaceDocument({
    entries: [{ module: "vector3d", checkpoint: source,
      expected: source.identity, replay: null }],
    activeDocumentIds: [source.identity.id], constructions: [],
    results: [], artifacts: [], relations: [], committedSelection: null }),
  { stableKey: "gf55-desktop", title: "Extended local continuation gate" });
  const patch = computeVectorField3DLocalManifoldPatch(source, {
    constructionId: "gf55-desktop-equilibrium", branch: "stable",
    offsetFraction: .01, seedCount: 8, rings: 3, timeLimit: .5,
    solver: { method: "rk4-step-doubling", maxSteps: 256,
      absoluteTolerance: 1e-7, relativeTolerance: 1e-7 } });
  project = upsertProjectLocalManifoldPatch(project, patch);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gf55.math3d.project.json", mimeType: "application/json",
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
    await advanced.getByLabel("Saved local patch").selectOption(patch.publication!.resultId);
    await advanced.getByRole("button", { name: "Verify saved patch for continuation" }).click();
    await advanced.getByRole("button", {
      name: "Validate adaptive local continuation" }).click();
    await expect(advanced.getByTestId("gf55-extended-status"))
      .toContainText("Global claim withheld");
    await advanced.getByRole("button", { name: "Save extended local Mesh" }).click();
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await page.reload();
    await openLastSavedProject(page);
    const results = await page.evaluate(() => JSON.parse(
      localStorage.getItem("math3d.project.v1")!).workspace.results);
    expect(results.some((item: { provenance: { operation: { type: string } };
      summary: { globalClaim?: string } }) =>
      item.provenance.operation.type === "vector3d.extended-manifold" &&
        item.summary.globalClaim === "withheld"))
      .toBe(true);
  } finally { await closeSurfaceApp(app); }
});
