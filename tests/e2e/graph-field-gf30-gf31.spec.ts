import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { createMixedWorkspaceDocument, createTemporalFieldSourceDocument,
  createVectorField3DDocument, replaceMath3DProjectWorkspace,
  serializeMath3DProject, upsertProjectTemporalFieldSource } from "@math3d/core";
import { createGf23Project, gf23Transfer } from "../fixtures/graph-field/gf23Bundle";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-30–31 pinned-time surfaces and saved spectra", async () => {
  test.setTimeout(360_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-gf30-31-"));
  const bundle = join(root, "source.sscene");
  await cp(resolve("tests/fixtures/scientific-scene/vortex-volume.sscene"),
    bundle, { recursive: true });
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    let project = createGf23Project({ kind: "directory", value: bundle });
    const first = project.workspace.entries[0]!.checkpoint;
    if (first.format !== "math3d.vector-field3d-document") throw new Error("Wrong fixture.");
    const second = createVectorField3DDocument(first.source,
      { stableKey: "gf30-desktop-second", title: "Later verified frame" });
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: [...project.workspace.entries,
        { module: "vector3d", checkpoint: second, expected: second.identity, replay: null }] }));
    const transfers = new Map([[first.identity.id, gf23Transfer()],
      [second.identity.id, gf23Transfer()]]);
    const temporal = createTemporalFieldSourceDocument(project,
      [{ time: 0, documentId: first.identity.id },
        { time: 1, documentId: second.identity.id }],
      { stableKey: "gf30-desktop-time", timeUnit: "s",
        interpolation: "linear", transfers });
    project = upsertProjectTemporalFieldSource(project, temporal, transfers);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gf30-time.math3d.project.json", mimeType: "application/json",
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
    let panel = explorer.getByTestId("gf22-time-source");
    await panel.getByTestId("gf25-saved-time-source-select").selectOption(temporal.identity.id);
    await panel.getByTestId("gf31-run-spectrum").click();
    await expect(panel.getByTestId("gf31-spectrum-values")).toBeVisible();
    await expect(panel).toContainText("Saved temporal spectra (1)");
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!)
      .workspace.results.filter((item: { provenance: { operation: { type: string } } }) =>
        item.provenance.operation.type === "vector3d.temporal-spectrum").length)).toBe(1);
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    explorer = await openExplorer(); panel = explorer.getByTestId("gf22-time-source");
    await explorer.getByRole("button", { name: "Analyze", exact: true }).click();
    await panel.getByText("Saved temporal spectra (1)").click();
    await expect(panel).toContainText("unverified");
    await panel.getByRole("button", { name: "Verify and show PSD" }).click();
    await expect(panel.getByTestId("gf31-spectrum-values")).toBeVisible();
    await panel.getByTestId("gf25-saved-time-source-select").selectOption(temporal.identity.id);
    await panel.getByTestId("gf30-run-moving").click();
    await expect.poll(async () => {
      const errors = await panel.getByRole("alert").allTextContents();
      if (errors.length) throw new Error(errors.join(" "));
      return panel.getByTestId("gf30-moving-isosurfaces")
        .getByRole("button", { name: "Save this frame as Mesh" }).count();
    }, { timeout: 75_000 }).toBe(2);
    await expect(panel.getByTestId("gf33-moving-playback"))
      .toContainText("Frames 1–2:");
    await panel.getByRole("checkbox", { name: "Show validated midpoints when correspondence is stable" })
      .check();
    await panel.getByTestId("gf33-moving-playback")
      .getByRole("button", { name: "Play verified frames" }).click();
    await expect(panel.getByTestId("gf33-moving-playback"))
      .toContainText("Frame 2/2: 1 s", { timeout: 15_000 });
    await expect(page.getByTestId("vector-field3d-isosurface")).toBeVisible();
    await panel.getByTestId("gf30-moving-isosurfaces")
      .getByRole("button", { name: "Save this frame as Mesh" }).first().click();
    await expect(page.getByTestId("scientific-mesh-source-status"))
      .toContainText("Source current", { timeout: 45_000 });
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const mesh = saved.workspace.entries.find((item: { module: string }) => item.module === "mesh");
    expect(mesh.checkpoint.source.origin.temporal).toMatchObject({
      id: temporal.identity.id, time: 0, timeUnit: "s" });
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    explorer = await openExplorer(); panel = explorer.getByTestId("gf22-time-source");
    await explorer.getByRole("button", { name: "Analyze", exact: true }).click();
    await panel.getByText("Saved temporal spectra (1)").click();
    await expect(panel).toContainText("unverified");
    await page.getByTestId("projects-toggle").click();
    await projects.getByRole("button", { name: "View current project" }).click();
    await projects.getByTestId("project-detail-tab-documents").click();
    await projects.getByTestId(`project-open-${mesh.checkpoint.identity.id}`).click();
    await expect(page.getByTestId("scientific-mesh-source-status"))
      .toContainText("Source current", { timeout: 45_000 });
    const bytes = Buffer.from(await readFile(join(bundle, "east.f64")));
    bytes.writeDoubleLE(bytes.readDoubleLE(0) + .1, 0);
    await writeFile(join(bundle, "east.f64"), bytes);
    await page.reload();
    await openLastSavedProject(page);
    await expect(page.getByTestId("scientific-mesh-source-status"))
      .toContainText("Source stale", { timeout: 45_000 });
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-gf30-31-"))
      throw new Error("Unsafe fixture cleanup path.");
    await rm(root, { recursive: true, force: true });
  }
});
