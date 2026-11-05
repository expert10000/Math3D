import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { expect, test } from "@playwright/test";
import { createMixedWorkspaceDocument, createTemporalFieldSourceDocument,
  createVectorField3DDocument, replaceMath3DProjectWorkspace,
  serializeMath3DProject, upsertProjectTemporalFieldSource } from "@math3d/core";
import { createGf23Project, gf23Transfer } from "../fixtures/graph-field/gf23Bundle";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-26–28 verified time frames, saved pathline and explicit source rebase", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-gf26-28-"));
  const original = join(root, "original.sscene");
  const replacement = join(root, "replacement.sscene");
  await cp(resolve("tests/fixtures/scientific-scene/vortex-volume.sscene"),
    original, { recursive: true });
  await cp(original, replacement, { recursive: true });
  const bytes = Buffer.from(await readFile(join(replacement, "east.f64")));
  bytes.writeDoubleLE(bytes.readDoubleLE(0) + .125, 0);
  await writeFile(join(replacement, "east.f64"), bytes);
  const manifestPath = join(replacement, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.source.sourceId = "vortex-volume-replacement";
  manifest.resources.find((item: { id: string }) => item.id === "east").sha256 =
    createHash("sha256").update(bytes).digest("hex");
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  await writeFile(manifestPath, manifestBytes);
  const bundlePath = join(replacement, "bundle.json");
  const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
  bundle.manifest.bytes = manifestBytes.length;
  bundle.manifest.sha256 = createHash("sha256").update(manifestBytes).digest("hex");
  await writeFile(bundlePath, JSON.stringify(bundle));
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    let project = createGf23Project({ kind: "directory", value: original });
    const first = project.workspace.entries[0]!.checkpoint;
    if (first.format !== "math3d.vector-field3d-document") throw new Error("Wrong fixture.");
    const second = createVectorField3DDocument(first.source,
      { stableKey: "gf27-desktop-second", title: "Second verified frame" });
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: [...project.workspace.entries,
        { module: "vector3d", checkpoint: second, expected: second.identity, replay: null }] }));
    const transfer = gf23Transfer();
    const transfers = new Map([[first.identity.id, transfer], [second.identity.id, transfer]]);
    const temporal = createTemporalFieldSourceDocument(project,
      [{ time: 0, documentId: first.identity.id },
        { time: 1, documentId: second.identity.id }],
      { stableKey: "gf27-desktop", timeUnit: "s", interpolation: "linear", transfers });
    project = upsertProjectTemporalFieldSource(project, temporal, transfers);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gf27-time.math3d.project.json", mimeType: "application/json",
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
    await panel.getByLabel("Sample time").fill("0.5");
    await panel.getByRole("button", { name: "Sample temporal probe and slice" }).click();
    await expect(panel.getByTestId("gf25-sample-result")).toContainText("9 × 9");
    await panel.getByTestId("gf28-run-pathline").click();
    await expect(panel).toContainText("Saved pathlines (1)");
    await panel.getByTestId("gf29-run-streakline").click();
    await expect(panel).toContainText("Saved streaklines (1)");
    await explorer.getByTestId("gf07-open-profile-from-explorer").click();
    await expect(explorer).toBeHidden();
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved");
    await page.reload();
    await openLastSavedProject(page);
    if (!await projects.isVisible()) await page.getByTestId("projects-toggle").click();
    const pathlineId = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.entries
        .find((item: { module: string; checkpoint: { source?: { definition?: { familyId?: string } } } }) =>
          item.module === "curve" && item.checkpoint.source?.definition?.familyId ===
            "vector3d.temporal-pathline").checkpoint.identity.id as string);
    await projects.getByTestId(`project-tree-document-${pathlineId}`).click();
    const curvePreview = page.getByTestId("project-source-editor");
    await expect(curvePreview).toContainText("Curve values withheld");
    await curvePreview.getByTestId("scientific-pathline-verify-preview").click();
    await expect(curvePreview.getByTestId("project-source-measurement"))
      .toContainText("sampled points");
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(curvePreview).toContainText("Curve values withheld");
    await page.getByTestId("workspace-nav-graphs").click();
    explorer = await openExplorer();
    panel = explorer.getByTestId("gf22-time-source");
    await expect(panel).toContainText("Saved pathlines (1)");
    await expect(panel).toContainText("Saved streaklines (1)");
    await panel.getByText("Saved streaklines (1)").click();
    await expect(panel).toContainText("unverified");
    await panel.getByText("Saved pathlines (1)").click();
    await expect(panel).toContainText("unverified");
    await panel.getByTestId("gf25-saved-time-source-select").selectOption(temporal.identity.id);
    await panel.getByRole("button", { name: "Sample temporal probe and slice" }).click();
    await expect(panel.getByTestId("gf25-sample-result")).toContainText("9 × 9");
    await app.app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () =>
      ({ canceled: false, filePaths: [folder] }); }, replacement);
    const rebase = explorer.getByTestId("gf26-source-rebase");
    await rebase.getByRole("button", { name: "Choose replacement and rebase recipes" }).click();
    await expect(rebase.getByRole("status")).toContainText("Rebased");
    await expect(panel).toContainText("frame-1-changed");
    await explorer.getByRole("button", { name: "Back to Graphs" }).click();
    const rightToggle = page.getByRole("button", { name: "Right", exact: true });
    if (await rightToggle.getAttribute("aria-pressed") === "true") await rightToggle.click();
    const inspector = page.locator(".graph2d-compact-panels > details:has(> summary:text-is('Inspector'))");
    if (await inspector.getAttribute("open") === null)
      await inspector.locator(":scope > summary").click();
    await expect(inspector.getByTestId("gf07-graph-profile-status"))
      .toContainText("values withheld");
    await inspector.getByTestId("gf07-refresh-profile").click();
    await expect(inspector.getByTestId("gf07-graph-profile-status")).toContainText("current");
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-graphs").click();
    const reopenedExplorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (await reopenedExplorer.isVisible())
      await reopenedExplorer.getByRole("button", { name: "Back to Graphs" }).click();
    if (await rightToggle.getAttribute("aria-pressed") === "true") await rightToggle.click();
    const reopenedInspector = page.locator(".graph2d-compact-panels > details:has(> summary:text-is('Inspector'))");
    if (await reopenedInspector.getAttribute("open") === null)
      await reopenedInspector.locator(":scope > summary").click();
    await expect(reopenedInspector.getByTestId("gf07-graph-profile-status"))
      .toContainText("values withheld");
    await reopenedInspector.getByTestId("gf07-refresh-profile").click();
    await expect(reopenedInspector.getByTestId("gf07-graph-profile-status"))
      .toContainText("current");
  } finally {
    await closeSurfaceApp(app);
    if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-gf26-28-"))
      throw new Error("Unsafe fixture cleanup path.");
    await rm(root, { recursive: true, force: true });
  }
});
