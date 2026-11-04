import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { createMath3DProject, createMixedWorkspaceDocument,
  createVectorField3DDocument, serializeMath3DProject } from "@math3d/core";
import { createGf23Project } from "../fixtures/graph-field/gf23Bundle";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-24 verified two-source comparison exports a guarded Graph profile", async () => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-gf24-comparison-"));
  const directory = join(root, "vortex-volume.sscene");
  await cp(resolve("tests/fixtures/scientific-scene/vortex-volume.sscene"),
    directory, { recursive: true });
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    const fixture = createGf23Project({ kind: "directory", value: directory });
    const first = fixture.workspace.entries[0]!.checkpoint;
    if (first.format !== "math3d.vector-field3d-document") throw new Error("Wrong fixture.");
    const second = createVectorField3DDocument(first.source,
      { stableKey: "gf24-desktop-second", title: "Second verified field" });
    const project = createMath3DProject(createMixedWorkspaceDocument({
      entries: [first, second].map(document => ({ module: "vector3d", checkpoint: document,
        expected: document.identity, replay: null })),
      activeDocumentIds: [first.identity.id], results: [], artifacts: [], relations: [],
      constructions: [], committedSelection: null }),
    { stableKey: "gf24-desktop", title: "Two verified sources" });
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gf24.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(serializeMath3DProject(project)) });
    await projects.getByTestId("project-import-open").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (!await explorer.isVisible()) {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    }
    const panel = explorer.getByTestId("gf18-field-comparison");
    await panel.getByLabel("Second saved field").selectOption(second.identity.id);
    await panel.getByRole("button", { name: "Compare fields" }).click();
    await expect(panel).toContainText("Coverage 729/729");
    await panel.getByRole("button", { name: "Save comparison in Project" }).click();
    await panel.getByRole("button", { name: "Open comparison profile in Graphs" }).click();
    await expect(explorer).toBeHidden();
    const inspector = page.locator(".graph2d-compact-panels > details:has(> summary:text-is('Inspector'))");
    if (await inspector.isVisible()) await inspector.locator(":scope > summary").click();
    await expect(inspector.getByTestId("gf24-graph-profile-status")).toContainText("current");
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    const reopenedExplorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (await reopenedExplorer.isVisible())
      await reopenedExplorer.getByRole("button", { name: "Back to Graphs" }).click();
    const reopened = page.locator(".graph2d-compact-panels > details:has(> summary:text-is('Inspector'))");
    if (await reopened.isVisible()) await reopened.locator(":scope > summary").click();
    await expect(reopened.getByTestId("gf24-graph-profile-status")).toContainText("current");
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-gf24-comparison-"))
      throw new Error("Unsafe scientific fixture cleanup path.");
    await rm(root, { recursive: true, force: true });
  }
});
