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

test("GF-32 saves spectral Graph rows and withholds changed verified frames", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-gf32-spectra-"));
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
      { stableKey: "gf32-later", title: "Later frame" });
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: [...project.workspace.entries,
        { module: "vector3d", checkpoint: second,
          expected: second.identity, replay: null }] }));
    const transfers = new Map([[first.identity.id, gf23Transfer()],
      [second.identity.id, gf23Transfer()]]);
    const temporal = createTemporalFieldSourceDocument(project,
      [{ time: 0, documentId: first.identity.id },
        { time: 1, documentId: second.identity.id }],
      { stableKey: "gf32-time", timeUnit: "s",
        interpolation: "linear", transfers });
    project = upsertProjectTemporalFieldSource(project, temporal, transfers);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gf32.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(serializeMath3DProject(project)) });
    await projects.getByTestId("project-import-open").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (!await explorer.isVisible()) {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    }
    await explorer.getByRole("button", { name: "Analyze", exact: true }).click();
    const panel = explorer.getByTestId("gf22-time-source");
    await panel.getByTestId("gf25-saved-time-source-select").selectOption(temporal.identity.id);
    await panel.getByTestId("gf31-run-spectrum").click();
    await expect(panel.getByTestId("gf31-spectrum-values")).toBeVisible();
    await panel.getByTestId("gf32-open-spectrum-graphs").click();
    await expect(explorer).toBeHidden();
    const inspector = page.locator(
      ".graph2d-compact-panels > details:has(> summary:text-is('Inspector'))");
    if (await inspector.isVisible()) await inspector.locator(":scope > summary").click();
    await expect(inspector.getByTestId("gf32-graph-spectrum-status"))
      .toContainText("current");
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const graph = saved.workspace.entries.find((item: { module: string }) => item.module === "graph2d");
    expect(graph.checkpoint.source.objects.filter((item: { temporalSpectrumOrigin?: unknown }) =>
      item.temporalSpectrumOrigin).length).toBe(2);
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    const reopenedExplorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (await reopenedExplorer.isVisible())
      await reopenedExplorer.getByRole("button", { name: "Back to Graphs" }).click();
    const reopened = page.locator(
      ".graph2d-compact-panels > details:has(> summary:text-is('Inspector'))");
    if (await reopened.isVisible()) await reopened.locator(":scope > summary").click();
    await expect(reopened.getByTestId("gf32-graph-spectrum-status"))
      .toContainText("values withheld");
    await reopened.getByTestId("gf32-refresh-spectrum").click();
    await expect(reopened.getByTestId("gf32-graph-spectrum-status"))
      .toContainText("current", { timeout: 30_000 });
    const bytes = Buffer.from(await readFile(join(bundle, "east.f64")));
    bytes.writeDoubleLE(bytes.readDoubleLE(0) + .1, 0);
    await writeFile(join(bundle, "east.f64"), bytes);
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    const staleExplorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (await staleExplorer.isVisible())
      await staleExplorer.getByRole("button", { name: "Back to Graphs" }).click();
    const stale = page.locator(
      ".graph2d-compact-panels > details:has(> summary:text-is('Inspector'))");
    if (await stale.isVisible()) await stale.locator(":scope > summary").click();
    await expect(stale.getByTestId("gf32-graph-spectrum-status"))
      .toContainText("values withheld");
    await stale.getByTestId("gf32-refresh-spectrum").click();
    await expect(stale.getByRole("alert")).toBeVisible();
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-gf32-spectra-"))
      throw new Error("Unsafe fixture cleanup path.");
    await rm(root, { recursive: true, force: true });
  }
});
