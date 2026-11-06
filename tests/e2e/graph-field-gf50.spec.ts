import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createMath3DProject, createMixedWorkspaceDocument,
  createTemporalFieldSourceDocument, createVectorField3DDocument,
  parseMath3DProject, serializeMath3DProject,
  upsertProjectTemporalFieldSource, vectorField3DExpression,
  type VectorField3DDocument } from "@math3d/core";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-50 saves a bounded finite-time Lyapunov field in a Project", async () => {
  test.setTimeout(120_000);
  const fixture = parseMath3DProject(readFileSync(resolve(
    "tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d"), "utf8"));
  const original = fixture.workspace.entries.find(item => item.module === "vector3d")!
    .checkpoint as VectorField3DDocument;
  const make = (key: string) => createVectorField3DDocument({ ...original.source,
    field: { kind: "expressions", components: [
      vectorField3DExpression("x", "m/s"),
      vectorField3DExpression("0", "m/s"),
      vectorField3DExpression("0", "m/s") ] } }, { stableKey: key });
  const first = make("gf50-desktop-first"), second = make("gf50-desktop-second");
  let project = createMath3DProject(createMixedWorkspaceDocument({
    entries: [first, second].map(checkpoint => ({ module: "vector3d" as const,
      checkpoint, expected: checkpoint.identity, replay: null })),
    activeDocumentIds: [first.identity.id], constructions: [], results: [],
    artifacts: [], relations: [], committedSelection: null }),
  { stableKey: "gf50-desktop", title: "Finite-time field gate" });
  const temporal = createTemporalFieldSourceDocument(project,
    [{ time: 0, documentId: first.identity.id },
      { time: .2, documentId: second.identity.id }],
    { stableKey: "gf50-desktop-time", timeUnit: "s", interpolation: "linear" });
  project = upsertProjectTemporalFieldSource(project, temporal);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gf50.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(serializeMath3DProject(project)) });
    await projects.getByTestId("project-import-open").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (!await explorer.isVisible()) {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    }
    const panel = explorer.getByTestId("gf22-time-source");
    await panel.getByTestId("gf25-saved-time-source-select").selectOption(temporal.identity.id);
    await panel.getByRole("button", { name: "Compute and save bounded FTLE field" }).click();
    await expect(panel.getByTestId("gf50-ftle-field"))
      .toContainText("4 finite-time estimates saved");
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await page.reload();
    await openLastSavedProject(page);
    const results = await page.evaluate(() => JSON.parse(
      localStorage.getItem("math3d.project.v1")!).workspace.results);
    const result = results.find((item: { provenance: { operation: { type: string } } }) =>
      item.provenance.operation.type === "vector3d.temporal-ftle-field");
    expect(result.summary.cellCount).toBe(4);
    expect(result.summary.exponentUnit).toBe("1/s");
  } finally { await closeSurfaceApp(app); }
});
