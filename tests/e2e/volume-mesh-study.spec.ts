import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { freezeControls } from "./helpers/projectFreeze";

const core = require(resolve("packages/core/src/index.ts"));

const fullProjectPanel = async (page: Page) => {
  const controls = freezeControls(page);
  await controls.show();
  const research = controls.panel.getByTestId("project-research-navigation");
  if (!await research.count()) await controls.panel.getByTestId("project-gallery-layout-toggle").click();
  if (!await research.count()) await controls.panel.getByTestId("project-detail-toggle").click();
  await expect(research).toBeVisible();
  return controls;
};

const galleryProjectPanel = async (page: Page) => {
  const controls = freezeControls(page);
  await controls.show();
  if (await controls.panel.getAttribute("data-project-placement"))
    await controls.panel.getByTestId("project-gallery-layout-toggle").click();
  if (await controls.panel.locator(".project-gallery-layout-detail").count())
    await controls.panel.getByTestId("project-detail-toggle").click();
  await expect(controls.panel.getByTestId("project-export-resources")).toBeVisible();
  return controls;
};

test("ACC-05 Volume extraction creates a saved Mesh Study and Workbook with exact source pins", async () => {
  test.setTimeout(240_000);
  const volume = core.createVolumeDocument({ stableKey: "acc05-volume", metadata: { title: "ACC-05 sphere" }, source: {
    representation: "custom-scalar-field",
    recipe: { kind: "custom-field", expression: "x*x+y*y+z*z-1", parameters: {} },
    spatial: { dimensions: [24,24,24], origin: [-1.5,-1.5,-1.5], spacing: [3/23,3/23,3/23],
      direction: [1,0,0,0,1,0,0,0,1], centering: "point", coordinateSystem: "world",
      positionUnits: "m", valueUnits: "unitless" },
    dependencies: [], payload: null,
  } });
  const project = core.createMath3DProject(core.createMixedWorkspaceDocument({
    entries: [{ module: "volume", checkpoint: volume, expected: volume.identity, replay: null }],
    activeDocumentIds: [volume.identity.id], results: [], artifacts: [], relations: [],
    constructions: [], committedSelection: null,
  }), { stableKey: "acc05-project", title: "ACC-05 Volume to Mesh" });
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    let page = ctx.page;
    let controls = freezeControls(page);
    await controls.importOpen(core.serializeMath3DProject(project));
    await controls.open(volume.identity.id);
    await page.getByTestId("volume-detailed-controls").getByTestId("volume-apply-isosurface").click();
    await page.getByTestId("shared-inspector-tab-geometry").click();
    const inspector = page.getByTestId("volume-inspector");
    await inspector.getByLabel("Geometry view").selectOption("derived");
    await expect(inspector.getByTestId("volume-derived-result-current")).toHaveCount(1);
    controls = await fullProjectPanel(page);
    await controls.panel.getByTestId("project-current").click();
    await controls.panel.getByRole("button", { name: "Studies", exact: true }).click();
    const publish = controls.panel.locator('[data-testid^="project-volume-mesh-publish-"]');
    await expect(publish).toHaveCount(1);
    await publish.click();
    await expect(controls.panel.getByTestId("project-message")).toContainText("Volume, retained Mesh, Study and Workbook staged");
    const staged = await controls.save();
    const mesh = staged.workspace.entries.find((entry: any) => entry.module === "mesh" &&
      staged.workspace.relations.some((relation: any) => relation.operation === "volume.extract.isosurface" &&
        relation.target.type === "document" && relation.target.generation.documentId === entry.expected.id));
    expect(mesh).toBeTruthy();
    expect(staged.workspace.studies).toHaveLength(1);
    expect(staged.workspace.studies[0].members.map((member: any) => member.documentId))
      .toEqual([volume.identity.id, mesh.expected.id]);
    expect(staged.workbooks).toHaveLength(1);
    controls = await galleryProjectPanel(page);
    const packagePath = resolve(ctx.profileDir, "acc05-transfer.json");
    await ctx.app.evaluate(({ session }, savePath) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(savePath)), packagePath);
    await controls.panel.getByTestId("project-export-resources").click();
    await expect(controls.panel.getByTestId("project-message")).toContainText("Exported project with verified");
    await expect.poll(() => existsSync(packagePath)).toBe(true);
    const transferred = readFileSync(packagePath, "utf8");
    const packageData = JSON.parse(transferred);
    expect(packageData.resources.some((item: any) => item.kind === "mesh-buffers")).toBe(true);
    controls = await fullProjectPanel(page);
    await controls.panel.getByTestId("project-current").click();
    await controls.panel.getByRole("button", { name: "Studies", exact: true }).click();
    const studies = controls.panel.getByTestId("project-studies-panel");
    await studies.locator('[data-testid^="project-study-open-"]').click();
    await studies.getByTestId("project-study-preview-toggle-pane-1").click();
    await expect(studies.getByTestId("project-study-pane-preview")).toHaveAttribute("data-kind", "volume");
    await studies.getByTestId("project-study-preview-toggle-pane-2").click();
    await expect(studies.getByTestId("project-study-pane-preview")).toHaveAttribute("data-kind", "mesh");
    await expect(studies.getByTestId("project-study-workbook-references")).toContainText("Exact citation");
    const profile = ctx.profileDir;
    await ctx.app.close();
    ctx = await launchSurfaceApp({}, profile);
    page = ctx.page;
    await openLastSavedProject(page);
    controls = await fullProjectPanel(page);
    await controls.panel.getByRole("button", { name: "Studies", exact: true }).click();
    const reopened = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(reopened.workspace.studies[0].id).toBe(staged.workspace.studies[0].id);
    expect(reopened.workspace.entries.find((entry: any) => entry.expected.id === mesh.expected.id)?.expected)
      .toEqual(mesh.expected);
    const reopenedStudies = controls.panel.getByTestId("project-studies-panel");
    await reopenedStudies.locator('[data-testid^="project-study-open-"]').click();
    await reopenedStudies.getByTestId("project-study-preview-toggle-pane-2").click();
    await expect(reopenedStudies.getByTestId("project-study-mesh-source")).toBeVisible();
    await reopenedStudies.getByTestId("project-study-open-source-pane-1").click();
    await expect(page.getByTestId("project-volume-editor")).toBeVisible();
    await page.getByTestId("project-volume-expression").fill("x*x+y*y+z*z-0.64");
    await page.getByTestId("project-volume-apply").click();
    controls = await fullProjectPanel(page);
    await controls.panel.getByTestId("project-current").click();
    await controls.panel.getByRole("button", { name: "Studies", exact: true }).click();
    await expect(controls.panel.locator('[data-testid^="project-volume-mesh-publish-"]')).toHaveCount(0);
    await closeSurfaceApp(ctx);
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    page = ctx.page;
    controls = await galleryProjectPanel(page);
    const importFile = async (raw: string) => controls.panel.getByTestId("project-import-file")
      .setInputFiles({ name: "acc05-transfer.json", mimeType: "application/json", buffer: Buffer.from(raw) });
    await importFile(JSON.stringify(packageData.project));
    await expect(controls.panel.getByTestId("project-import-open")).toBeDisabled();
    await expect(controls.panel.getByTestId("project-import-preview")).toContainText("missing or unverified");
    const corrupt = structuredClone(packageData);
    const sidecar = corrupt.resources.find((item: any) => item.kind === "mesh-buffers");
    sidecar.data = (sidecar.data[0] === "A" ? "B" : "A") + sidecar.data.slice(1);
    await importFile(JSON.stringify(corrupt));
    await expect(controls.panel.getByTestId("project-message")).toContainText("rejected");
    await importFile(transferred);
    await expect(controls.panel.getByTestId("project-import-open")).toBeEnabled();
    await controls.panel.getByTestId("project-import-open").click();
    await expect(controls.panel.getByTestId("project-message")).toContainText("Opened supported project");
    const imported = await controls.save();
    expect(imported.workspace.studies[0].id).toBe(staged.workspace.studies[0].id);
    expect(imported.workspace.entries.find((entry: any) => entry.expected.id === mesh.expected.id)?.expected)
      .toEqual(mesh.expected);
    expect(imported.workbooks[0].id).toBe(staged.workbooks[0].id);
  } finally { await closeSurfaceApp(ctx); }
});

test("ACC-05 Gallery opens an independent analytic Volume with a guided source Study", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const panel = ctx.page.getByTestId("project-explorer-panel");
    await ctx.page.getByTestId("projects-toggle").click();
    await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
    await panel.getByTestId("project-gallery-guided").click();
    const card = panel.getByTestId("curated-study-card-volume-isosurface-study");
    await expect(card).toContainText("How does an isovalue become a retained Mesh?");
    await card.getByTestId("curated-study-open-volume-isosurface-study").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project");
    const project = await ctx.page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(project.workspace.entries.map((entry: any) => entry.module)).toEqual(["volume"]);
    expect(project.workspace.studies).toHaveLength(1);
    expect(project.workspace.studies[0].members[0].documentId).toBe(project.workspace.entries[0].expected.id);
    expect(project.workspace.results).toHaveLength(0);
  } finally { await closeSurfaceApp(ctx); }
});
