import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { createMath3DProject, createMixedWorkspaceDocument,
  createVectorField3DDocument, serializeMath3DProject } from "@math3d/core";
import { createGf23Project } from "../fixtures/graph-field/gf23Bundle";
import { gf34CoarseBundle } from "../fixtures/graph-field/gf34CoarseBundle";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-34 compares different verified grids and guards the Graph profile", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-gf34-cross-grid-"));
  const full = join(root, "full.sscene"), coarsePath = join(root, "coarse.sscene");
  await cp(resolve("tests/fixtures/scientific-scene/vortex-volume.sscene"),
    full, { recursive: true });
  await mkdir(coarsePath);
  const coarse = gf34CoarseBundle({ kind: "directory", value: coarsePath });
  await writeFile(join(coarsePath, "manifest.json"), coarse.manifestJson);
  await writeFile(join(coarsePath, "bundle.json"), coarse.bundleJson);
  for (const [name, bytes] of coarse.bytesByName)
    await writeFile(join(coarsePath, `${name}.f64`), bytes);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    const fixture = createGf23Project({ kind: "directory", value: full });
    const first = fixture.workspace.entries[0]!.checkpoint;
    if (first.format !== "math3d.vector-field3d-document" ||
        first.source.field.kind !== "scientific-bundle") throw new Error("Wrong fixture.");
    const second = createVectorField3DDocument({ ...first.source,
      field: { ...first.source.field, references: coarse.references } },
    { stableKey: "gf34-desktop-coarse", title: "Coarse verified field" });
    const project = createMath3DProject(createMixedWorkspaceDocument({
      entries: [first, second].map(checkpoint => ({ module: "vector3d" as const,
        checkpoint, expected: checkpoint.identity, replay: null })),
      activeDocumentIds: [first.identity.id], results: [], artifacts: [],
      relations: [], constructions: [], committedSelection: null }),
    { stableKey: "gf34-desktop", title: "Cross-grid comparison" });
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gf34.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(serializeMath3DProject(project)) });
    await projects.getByTestId("project-import-open").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (!await explorer.isVisible()) {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    }
    await explorer.getByRole("button", { name: "Analyze", exact: true }).click();
    const panel = explorer.getByTestId("gf18-field-comparison");
    await panel.getByLabel("Second saved field").selectOption(second.identity.id);
    await panel.getByTestId("gf34-alignment").selectOption("cartesian-aligned-overlap");
    await expect(panel.getByTestId("gf34-overlap-bounds"))
      .toContainText("physical-overlap-grid resampling");
    await panel.getByRole("button", { name: "Compare fields" }).click();
    await expect(panel).toContainText("Coverage 729/729", { timeout: 30_000 });
    await expect(panel).toContainText("cartesian-aligned-overlap");
    await panel.getByRole("button", { name: "Save comparison in Project" }).click();
    await panel.getByRole("button", { name: "Open comparison profile in Graphs" }).click();
    await expect(explorer).toBeHidden();
    const inspector = page.locator(
      ".graph2d-compact-panels > details:has(> summary:text-is('Inspector'))");
    if (await inspector.isVisible()) await inspector.locator(":scope > summary").click();
    await expect(inspector.getByTestId("gf24-graph-profile-status"))
      .toContainText("current");
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const result = saved.workspace.results.find((item: { provenance: { operation: { type: string } } }) =>
      item.provenance.operation.type === "vector3d.field-comparison");
    expect(result.provenance.operation.parameters).toMatchObject({
      frame: "cartesian-aligned-overlap", resampling: "physical-overlap-grid",
      interpolation: "verified-volume-trilinear", coverage: "complete-or-withhold",
      domain: [[-4, 4], [-4, 4], [-3, 3]] });
    expect(result.provenance.source.documentId).toBe(first.identity.id);
    expect(result.provenance.operation.parameters.secondSource.documentId).toBe(second.identity.id);
    const bytes = Buffer.from(await readFile(join(coarsePath, "east.f64")));
    bytes.writeDoubleLE(bytes.readDoubleLE(0) + .1, 0);
    await writeFile(join(coarsePath, "east.f64"), bytes);
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    const reopenedExplorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (await reopenedExplorer.isVisible())
      await reopenedExplorer.getByRole("button", { name: "Back to Graphs" }).click();
    const reopened = page.locator(
      ".graph2d-compact-panels > details:has(> summary:text-is('Inspector'))");
    if (await reopened.isVisible()) await reopened.locator(":scope > summary").click();
    await expect(reopened.getByTestId("gf24-graph-profile-status"))
      .toContainText("values withheld", { timeout: 30_000 });
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-gf34-cross-grid-"))
      throw new Error("Unsafe fixture cleanup path.");
    await rm(root, { recursive: true, force: true });
  }
});
