import { readFileSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-17/18 local directions and two-source comparison survive Project reopen", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    const core = require(resolve("packages/core/src/index.ts"));
    const fixture = core.parseMath3DProject(readFileSync(resolve(
      "tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d"), "utf8"));
    const original = fixture.workspace.entries.find((entry: { module: string }) =>
      entry.module === "vector3d").checkpoint;
    const expressions = (parts: string[]) => ({ ...original.source,
      field: { kind: "expressions", components: parts.map(part =>
        core.vectorField3DExpression(part, "m/s")) } });
    const first = core.reviseVectorField3DDocument(original,
      expressions(["x", "-2*y", "-3*z"]));
    const second = core.createVectorField3DDocument(expressions(["2*x", "-2*y", "-3*z"]),
      { stableKey: "gf17-gf19-e2e-second", title: "Comparison field B" });
    const project = core.createMath3DProject(core.createMixedWorkspaceDocument({
      entries: [first, second].map(document => ({ module: "vector3d", checkpoint: document,
        expected: document.identity, replay: null })),
      activeDocumentIds: [first.identity.id], results: [], artifacts: [], relations: [],
      committedSelection: null, constructions: [] }),
    { stableKey: "gf17-gf19-e2e", title: "GF-17/18 analytic fields" });
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gf17-gf18.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(core.serializeMath3DProject(project)) });
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
    const comparison = explorer.getByTestId("gf18-field-comparison");
    await expect(comparison).toBeVisible();
    await comparison.getByLabel("Second saved field").selectOption(second.identity.id);
    await comparison.getByRole("button", { name: "Compare fields" }).click();
    await expect(comparison).toContainText("Coverage 729/729");
    await comparison.getByRole("button", { name: "Save comparison in Project" }).click();
    const topology = explorer.getByTestId("gf17-local-topology");
    await expect(topology).toBeVisible();
    await explorer.getByRole("button", { name: "Find equilibria" }).click();
    const saddle = explorer.getByTestId("vector-field3d-equilibria")
      .getByRole("button", { name: /saddle at/i }).first();
    await saddle.click();
    await expect(topology).toContainText("Local saddle");
    await expect(topology).toContainText("unstable eigendirection");
    await saddle.locator("..").getByRole("button", { name: "Save construction" }).click();
    await topology.getByRole("button", { name: "Save unstable + Curve" }).click();
    await expect(topology).toContainText("Saved local branches (1)");
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    explorer = await openExplorer();
    await expect(explorer.getByTestId("gf18-field-comparison"))
      .toContainText("Saved comparisons (1)");
    await explorer.getByTestId("gf18-field-comparison")
      .getByText("Saved comparisons (1)").click();
    await expect(explorer.getByTestId("gf18-field-comparison"))
      .toContainText("current");
    await expect(explorer.getByTestId("gf17-local-topology"))
      .toContainText("Saved local branches (1)");
  } finally { await closeSurfaceApp(app); }
});

test("GF-19 displays only verified complex density, domain color and guarded winding", async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-gf19-complex-"));
  const directory = join(root, "complex-field.sscene");
  await cp(resolve("tests/fixtures/scientific-scene/complex-wave-volume.sscene"),
    directory, { recursive: true });
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await app.app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () =>
      ({ canceled: false, filePaths: [folder] }); }, directory);
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Import scientific dataset" }).click();
    const importer = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    await importer.getByRole("region", { name: "3D complex field lines" })
      .getByRole("button", { name: "Save paired field to Project" }).click();
    await importer.getByRole("button", { name: "Cancel" }).click();
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    const fieldId = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!)
      .workspace.entries.find((entry: { module: string }) => entry.module === "field")?.expected.id as string);
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("project-viewer-document").selectOption(fieldId);
    const workspace = page.getByRole("dialog", { name: "3D complex field workspace" });
    const analysis = workspace.getByTestId("gf19-complex-plane");
    await expect(analysis).toContainText("|ψ|²:");
    await expect(analysis.getByRole("img", { name: /Domain coloring/ })).toBeVisible();
    await analysis.getByRole("button", { name: "|ψ|² density" }).click();
    await expect(analysis.getByRole("img", { name: /Density/ })).toBeVisible();
    await expect(analysis).toContainText(/winding (resolved|undefined|inconclusive)|phase winding/);
    const imaginary = join(directory, "imaginary.f64"), original = await readFile(imaginary);
    const changed = Buffer.from(original); changed[0] ^= 1;
    await writeFile(imaginary, changed);
    await workspace.getByRole("button", { name: "Reverify field" }).click();
    await expect(workspace.getByRole("alert")).toContainText(/changed|integrity failed/i);
    await expect(workspace.getByTestId("gf19-complex-plane")).toHaveCount(0);
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-gf19-complex-"))
      throw new Error("Unsafe complex fixture cleanup path");
    await rm(root, { recursive: true, force: true });
  }
});
