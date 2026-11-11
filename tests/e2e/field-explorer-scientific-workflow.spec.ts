import { cp, mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { reviseVectorField3DWorkspace, defaultVectorField3DWorkspace, checkpointProjectFieldExplorerDocument,
  serializeMath3DProject, parseProjectPackage, parseMath3DProject, createVectorField3DDocument,
  createGraph2DFieldReference, createMath3DProject, createMixedWorkspaceDocument, createStableDocumentId,
  upsertProjectScientificSelection, type VectorField3DDocument } from "@math3d/core";
import { launchSurfaceApp, closeSurfaceApp, openLastSavedProject, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

async function openExplorer(page: Page) {
  await page.getByTestId("workspace-nav-graphs").click();
  const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
  if (!await explorer.isVisible()) {
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer", exact: true }).click();
  }
  await expect(explorer).toBeVisible(); return explorer;
}
async function importFile(page: Page, raw: string) {
  await page.getByTestId("projects-toggle").click();
  const projects = page.getByTestId("project-explorer-panel");
  await projects.getByTestId("project-import-file").setInputFiles({ name: "scientific-fields.project.json",
    mimeType: "application/json", buffer: Buffer.from(raw) });
  await expect(projects.getByTestId("project-import-open")).toBeEnabled();
  await projects.getByTestId("project-import-open").click();
  await expect(projects.getByTestId("project-message")).toContainText("Opened");
}

test("scientific Field Explorer transfers a Project package to a fresh profile and recovers exact sources after cold reopen", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-field-scientific-"));
  const directory = join(root, "vortex.sscene"), exportedPath = join(root, "fields.project-package.json");
  await cp(resolve("tests/fixtures/scientific-scene/vortex-volume.sscene"), directory, { recursive: true });
  let ctx: LaunchedSurfaceApp | null = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(ctx.page);
    const fixture = parseMath3DProject(readFileSync(resolve("tests/fixtures/graph-field/gf23-bundled-profile.math3d"), "utf8"));
    const original = fixture.workspace.entries[0]!.checkpoint as VectorField3DDocument;
    if (original.source.field.kind !== "scientific-bundle") throw new Error("Wrong scientific fixture");
    const manifestJson = await readFile(join(directory, "manifest.json"), "utf8");
    const savedReferences = original.source.field.references;
    const relink = (reference: typeof savedReferences[number]) => createGraph2DFieldReference(
      manifestJson, reference.sceneFingerprint, { kind: "directory", value: directory }, reference.datasetId, reference.component);
    const references = [relink(savedReferences[0]), relink(savedReferences[1]), relink(savedReferences[2])] as const;
    const field = createVectorField3DDocument({ ...original.source,
      field: { ...original.source.field, references } }, { stableKey: "scientific-workflow-A" });
    const source = reviseVectorField3DWorkspace(field, { ...defaultVectorField3DWorkspace(field.source),
      selectedLayer: "xy", probe: [0, 0, 0] });
    const base = createMath3DProject(createMixedWorkspaceDocument({
      entries: [{ module: "vector3d", checkpoint: source, expected: source.identity, replay: null }],
      activeDocumentIds: [source.identity.id], results: [], artifacts: [], relations: [],
      constructions: [], committedSelection: null }), { stableKey: "scientific-workflow-project" });
    const initial = upsertProjectScientificSelection(checkpointProjectFieldExplorerDocument(base, source), {
      format: "math3d.scientific-selection", schemaVersion: 1,
      identity: { kind: "authored", id: createStableDocumentId("scientific-selection", "scientific-workflow-line") },
      role: "analysis", source: { kind: "document", documentId: source.identity.id,
        checkpoint: { revision: source.identity.revision, structuralHash: source.identity.structuralHash } },
      frame: { kind: "cartesian", axes: source.source.axes.map(axis => ({ name: axis.label, unit: axis.unit })) },
      geometry: { kind: "axis-line", varyingAxis: 0, fixedCoordinates: [null, 0, 0], extent: [-4, 4] } });
    await importFile(ctx.page, serializeMath3DProject(initial));
    let explorer = await openExplorer(ctx.page);
    await explorer.getByRole("button", { name: "Pin current as baseline B", exact: true }).click();
    const pair = explorer.getByRole("region", { name: "Linked A/B field views" });
    await expect(pair).toContainText("Both scientific sources verified");
    await expect(pair.getByRole("img", { name: /^magnitude map/ })).toHaveCount(2);
    await pair.getByRole("region", { name: "Pinned baseline B" }).getByRole("img", { name: /^magnitude map/ })
      .locator('rect[style*="crosshair"]').nth(200).click();
    await expect(pair.getByRole("region", { name: "Line profile through probe" })).toHaveCount(2);
    let comparison = explorer.getByTestId("gf18-field-comparison");
    await comparison.getByLabel("Points per axis").selectOption("5");
    await comparison.getByRole("button", { name: "Compare fields", exact: true }).click();
    await expect(comparison).toContainText("Coverage 125/125");
    await comparison.getByRole("button", { name: "Save comparison in Project" }).click();
    await explorer.getByRole("button", { name: "Save field to Project", exact: true }).click();
    await ctx.page.getByTestId("projects-toggle").click();
    let projects = ctx.page.getByTestId("project-explorer-panel");
    await expect(projects.getByTestId("project-message")).toContainText("Current workspace documents.");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    const saved = await ctx.page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const active = saved.workspace.entries.find((entry: any) => entry.expected.id === source.identity.id).checkpoint;
    expect(active.workspace.probe[0]).toBeCloseTo(-0.4);
    expect(active.workspace.probe[1]).toBeCloseTo(0.4);
    const pin = active.workspace.explorer.comparisonSource;
    await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), exportedPath);
    const header = projects.getByTestId("project-explorer-header");
    if (!await header.getByText("More", { exact: true }).isVisible()) {
      const details = header.getByTestId("project-detail-toggle");
      if (!await details.isVisible()) await header.getByTestId("project-gallery-layout-toggle").click();
      if (!await header.getByText("More", { exact: true }).isVisible()) await details.click();
    }
    await header.getByText("More", { exact: true }).click();
    await projects.getByTestId("project-explorer-header").getByRole("button", { name: "Import / export" }).click();
    await projects.getByTestId("project-export-resources").click();
    await expect.poll(() => {
      try { return existsSync(exportedPath) && JSON.parse(readFileSync(exportedPath, "utf8")).format; }
      catch { return false; }
    }).toBe("math3d.project-package");
    const raw = await readFile(exportedPath, "utf8");
    const packaged = parseProjectPackage(raw).project;
    expect(packaged.workspace.scientificSelections).toEqual(saved.workspace.scientificSelections);
    expect(packaged.workspace.entries.find(entry => entry.expected.id === source.identity.id)!.checkpoint).toEqual(active);
    await closeSurfaceApp(ctx); ctx = null;

    // A new profile has no warmed source registry or Project resource archive.
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    await importFile(ctx.page, raw);
    explorer = await openExplorer(ctx.page);
    await expect(explorer.getByRole("region", { name: "Linked A/B field views" })).toContainText("Both scientific sources verified");
    await expect(explorer.getByRole("region", { name: "Line profile through probe" })).toHaveCount(2);
    const profile = ctx.profileDir;
    await ctx.app.close(); ctx = await launchSurfaceApp({}, profile);
    await openLastSavedProject(ctx.page);
    explorer = await openExplorer(ctx.page);
    let reopenedPair = explorer.getByRole("region", { name: "Linked A/B field views" });
    await expect(reopenedPair).toContainText("Both scientific sources verified");
    comparison = explorer.getByTestId("gf18-field-comparison");
    await expect(comparison.getByLabel("Second saved field")).toHaveValue(pin.id);
    await expect(comparison.getByLabel("Points per axis")).toHaveValue("5");
    await comparison.locator("details").filter({ hasText: "Saved comparisons (1)" }).locator("summary").click();
    await expect(comparison).toContainText("current");
    const restored = await ctx.page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(restored.workspace.entries.find((entry: any) => entry.expected.id === source.identity.id).checkpoint).toEqual(active);
    expect(restored.workspace.scientificSelections).toEqual(saved.workspace.scientificSelections);

    const componentPath = join(directory, "north.f64"), correct = await readFile(componentPath);
    const corrupt = Buffer.from(correct); corrupt[0] ^= 1; await writeFile(componentPath, corrupt);
    await reopenedPair.getByRole("button", { name: "Reverify A/B sources" }).click();
    await expect(reopenedPair).toContainText("Values withheld");
    await expect(reopenedPair.getByRole("img", { name: /^magnitude map/ })).toHaveCount(0);
    await expect(comparison).toContainText("withheld");
    await expect(comparison.getByRole("button", { name: "Save comparison in Project" })).toHaveCount(0);
    await ctx.app.close(); ctx = await launchSurfaceApp({}, profile);
    await openLastSavedProject(ctx.page);
    projects = ctx.page.getByTestId("project-explorer-panel");
    await expect(projects.getByTestId("project-message")).toContainText("Project scientific field unavailable");
    expect(await ctx.page.getByRole("region", { name: "Linked A/B field views" }).count()).toBe(0);
    await rm(componentPath);
    await projects.getByTestId(`project-open-saved-${saved.identity.id}`).click();
    await expect(projects.getByTestId("project-message")).toContainText(/ENOENT|missing|not found/i);
    await writeFile(componentPath, correct);
    await projects.getByTestId(`project-open-saved-${saved.identity.id}`).click();
    explorer = await openExplorer(ctx.page);
    reopenedPair = explorer.getByRole("region", { name: "Linked A/B field views" });
    await expect(reopenedPair).toContainText("Both scientific sources verified");
    await expect(reopenedPair.getByRole("region", { name: "Line profile through probe" })).toHaveCount(2);
    await ctx.page.screenshot({ path: test.info().outputPath("scientific-package-recovery.png"), fullPage: true });
  } finally { await closeSurfaceApp(ctx); await rm(root, { recursive: true, force: true }); }
});
