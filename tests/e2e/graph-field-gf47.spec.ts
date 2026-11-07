import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { appendProjectDerivedField, createMath3DProject,
  createMixedWorkspaceDocument, createVectorField3DDocument,
  computeProjectTensorGlyphs, serializeMath3DProject,
  upsertProjectTensorGlyphs, vectorField3DExpression } from "@math3d/core";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-47 displays and reopens a saved bounded tensor glyph recipe", async () => {
  test.setTimeout(120_000);
  const document = createVectorField3DDocument({
    axes: (["x", "y", "z"] as const).map(role => ({ role, label: role,
      unit: "m", min: -2, max: 2 })) as unknown as import("@math3d/core").VectorField3DSource["axes"],
    timeUnit: "s", field: { kind: "expressions", components: [
      vectorField3DExpression("2*x", "m/s"),
      vectorField3DExpression("y", "m/s"),
      vectorField3DExpression("0.5*z", "m/s") ] },
    seeds: [], display: { density: [4, 4, 4], maxGlyphs: 64,
      magnitudeScale: 1, colorBy: "speed" },
    solver: { method: "rk45", absoluteTolerance: 1e-6,
      relativeTolerance: 1e-6, maxSteps: 1000, maxTime: 1 },
  }, { stableKey: "gf47-analytic" });
  const blank = createMath3DProject(createMixedWorkspaceDocument({
    entries: [{ module: "vector3d", checkpoint: document,
      expected: document.identity, replay: null }],
    activeDocumentIds: [document.identity.id], results: [], artifacts: [],
    relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "gf47-project", title: "Tensor glyph gate" });
  const project = appendProjectDerivedField(blank, document.identity.id,
    { kind: "jacobian-symmetric" }, { stableKey: "gf47-tensor",
      title: "Symmetric Jacobian" }, () => true);
  const tensorId = project.workspace.derivedFields![0]!.identity.id;
  if (process.env.MATH3D_GF49_FIXTURE_DIR) {
    const dir = resolve(process.env.MATH3D_GF49_FIXTURE_DIR);
    mkdirSync(dir, { recursive: true });
    const study = computeProjectTensorGlyphs(project, { derivedFieldId: tensorId,
      normalAxis: 2, coordinate: 0, density: [4, 4] });
    writeFileSync(resolve(dir, "gf49-tensor-glyph.math3d.project.json"),
      serializeMath3DProject(upsertProjectTensorGlyphs(project, study)));
  }
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gf47.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(serializeMath3DProject(project)) });
    await projects.getByTestId("project-import-open").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const openExplorer = async () => {
      const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
      if (!await explorer.isVisible()) {
        await page.locator(".graph2d-toolbar-menu > summary").click();
        await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
      }
      await explorer.getByRole("button", { name: "Layer", exact: true }).click();
      return explorer;
    };
    let explorer = await openExplorer();
    const glyphs = explorer.getByTestId("gf47-tensor-glyphs");
    await glyphs.getByLabel("Tensor recipe").selectOption(tensorId);
    await glyphs.getByRole("button", { name: "Compute bounded tensor glyphs" }).click();
    await expect(glyphs.getByTestId("gf47-glyph-status")).toContainText("16 principal directions");
    await expect(glyphs.getByTestId("gf47-glyph-preview").locator("line")).toHaveCount(16);
    await glyphs.getByRole("button", { name: "Save tensor glyph recipe" }).click();
    await expect(glyphs.getByTestId("gf47-saved-status")).toContainText("recipe current");
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    explorer = await openExplorer();
    await expect(explorer.getByTestId("gf47-saved-status")).toContainText("recipe current");
    await expect(explorer.getByTestId("gf47-glyph-preview")).toHaveCount(0);
  } finally { await closeSurfaceApp(app); }
});
