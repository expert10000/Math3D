import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
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
  } finally { await closeSurfaceApp(ctx); }
});
