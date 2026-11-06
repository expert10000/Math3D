import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createMath3DProject,
  createMixedWorkspaceDocument, parseMath3DProject,
  reviseVectorField3DDocument, reviseVectorField3DWorkspace,
  searchVectorField3DEquilibria, serializeMath3DProject,
  vectorField3DExpression,
  type VectorField3DDocument } from "@math3d/core";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-58/60/62–64 saves guarded atlas coverage, seams and refinement", async () => {
  test.setTimeout(180_000);
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
    equilibriumConstructions: [{ id: "gf58-desktop-equilibrium",
      position: equilibrium.position, residual: equilibrium.residual,
      classification: equilibrium.classification,
      sourceRevision: field.identity.revision,
      sourceStructuralHash: field.identity.structuralHash,
      sourceHash: search.sourceHash }] });
  const project = createMath3DProject(createMixedWorkspaceDocument({
    entries: [{ module: "vector3d", checkpoint: source,
      expected: source.identity, replay: null }],
    activeDocumentIds: [source.identity.id], constructions: [],
    results: [], artifacts: [], relations: [], committedSelection: null }),
  { stableKey: "gf58-desktop", title: "Local atlas gate" });
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gf58.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(serializeMath3DProject(project)) });
    await projects.getByTestId("project-import-open").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (!await explorer.isVisible()) {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    }
    const openAnalyze = async () => {
      await page.getByTestId("workspace-nav-graphs").click();
      if (!await explorer.isVisible()) {
        await page.locator(".graph2d-toolbar-menu > summary").click();
        await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
      }
      await explorer.getByRole("button", { name: "Analyze", exact: true }).click();
    };
    await openAnalyze();
    const advanced = explorer.getByTestId("gf44-gf46-advanced-topology");
    for (const seedCount of [8, 10, 12]) {
      await advanced.getByLabel("Saved equilibrium").selectOption("gf58-desktop-equilibrium");
      await advanced.getByLabel("Patch rings (3–8)").fill("3");
      await advanced.getByLabel("Patch time (s)").fill("0.5");
      await advanced.getByLabel("Patch solver tolerance").fill("1e-7");
      await advanced.getByLabel("Patch seeds (6–12)").fill(String(seedCount));
      await advanced.getByLabel("Patch offset fraction").fill(seedCount === 12 ? ".02" : ".01");
      await advanced.getByRole("button", { name: "Build bounded local patch" }).click();
      await expect(advanced.getByTestId("gf46-manifold-status"))
        .toContainText("patch");
      await advanced.getByRole("button", { name: "Save local patch as Mesh" }).click();
      await openAnalyze();
      const patchId = await advanced.getByLabel("Saved local patch")
        .locator("option").last().getAttribute("value");
      expect(patchId).toBeTruthy();
      await advanced.getByLabel("Saved local patch").selectOption(patchId!);
      await advanced.getByRole("button", {
        name: "Verify saved patch for continuation" }).click();
      await advanced.getByRole("button", {
        name: "Validate adaptive local continuation" }).click();
      await expect(advanced.getByTestId("gf55-extended-status"))
        .toContainText("Global claim withheld");
      await advanced.getByRole("button", { name: "Save extended local Mesh" }).click();
      await openAnalyze();
      if (seedCount === 10) {
        await advanced.getByLabel("Atlas domain fraction").fill(".375");
        await advanced.getByLabel("Atlas overlap tolerance").fill(".25");
        await advanced.getByRole("button", { name: "Validate local patch atlas" }).click();
        await expect(advanced.getByTestId("gf58-atlas-status"))
          .toContainText("Global claim withheld");
        await advanced.getByRole("button", { name: "Save local atlas Mesh" }).click();
        await openAnalyze();
      }
    }
    await advanced.getByRole("button", { name: "Refine saved local atlas" }).click();
    await expect(advanced.getByTestId("gf58-atlas-status"))
      .toContainText("Local atlas validated");
    await advanced.getByRole("button", { name: "Save local atlas Mesh" }).click();
    await expect(page.getByTestId("app-status-bar"))
      .toContainText("Local manifold patch atlas");
    await openAnalyze();
    await advanced.getByRole("button", { name: "Verify saved atlas surface coverage" }).click();
    await expect(advanced.getByTestId("gf62-surface-coverage-status"))
      .toContainText("Global claim withheld");
    await advanced.getByRole("button", { name: "Measure saved atlas seams in 3D" }).click();
    await expect(advanced.getByTestId("gf63-seam-status"))
      .toContainText("Global claim withheld");
    await advanced.getByRole("button", { name: "Refine saved atlas charts" }).click();
    await expect(advanced.getByTestId("gf64-refinement-status"))
      .toContainText("global claim withheld");
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message"))
      .toContainText("Saved “Local atlas gate”");
    await page.reload();
    await openLastSavedProject(page);
    const results = await page.evaluate(() => JSON.parse(
      localStorage.getItem("math3d.project.v1")!).workspace.results);
    expect(results.some((item: { provenance: { operation: { type: string } };
      summary: { globalClaim?: string; memberResultIds?: string[];
        uncoveredCells?: number; baseUncoveredCells?: number } }) =>
      item.provenance.operation.type === "vector3d.manifold-atlas" &&
        item.summary.globalClaim === "withheld" &&
        item.summary.memberResultIds?.length === 3 &&
        item.summary.uncoveredCells! < item.summary.baseUncoveredCells!))
      .toBe(true);
    expect(results.some((item: { provenance: { operation: { type: string } };
      summary: { globalClaim?: string; gain16?: number; gain32?: number;
        refined32?: { boundaryGapCells: number } } }) =>
      item.provenance.operation.type === "vector3d.manifold-surface-coverage" &&
        item.summary.globalClaim === "withheld" &&
        item.summary.gain16! > 0 && item.summary.gain32! > 0 &&
        Number.isFinite(item.summary.refined32?.boundaryGapCells)))
      .toBe(true);
    expect(results.some((item: { provenance: { operation: { type: string } };
      summary: { globalClaim?: string; measurement?: { projectedOverlaps: number } } }) =>
      item.provenance.operation.type === "vector3d.atlas-seams" &&
        item.summary.globalClaim === "withheld" &&
        item.summary.measurement!.projectedOverlaps > 0)).toBe(true);
    expect(results.some((item: { provenance: { operation: { type: string } };
      summary: { globalClaim?: string; attempts?: unknown[]; evaluations?: number } }) =>
      item.provenance.operation.type === "vector3d.atlas-refinement" &&
        item.summary.globalClaim === "withheld" &&
        item.summary.attempts?.length === 3 &&
        item.summary.evaluations! <= 1_000_000)).toBe(true);
  } finally { await closeSurfaceApp(app); }
});
