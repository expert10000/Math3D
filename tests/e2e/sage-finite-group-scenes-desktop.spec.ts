import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));
const fixture = require(resolve("tests/fixtures/sage-group-d4-sage95.json"));
const download = async (ctx: LaunchedSurfaceApp, filename: string, action: () => Promise<unknown>) => {
  const path = test.info().outputPath(filename);
  await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
    (_event, item) => item.setSavePath(target)), path);
  await action();
  await expect.poll(() => { try { return readFileSync(path).length > 0; } catch { return false; } }).toBe(true);
  return readFileSync(path, "utf8");
};

test("SAGE-E03 exports checked Cayley and subgroup scenes and reopens their source Project", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-e03-surface", metadata: { title: "Project Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null,
      definition: { familyId: "sage-e03-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-e03-desktop", title: "Group scenes" });
    const group = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "D4"),
      revision: 1, label: "D4", definition: core.FINITE_GROUP_PRESETS.find((item: { id: string }) => item.id === "D4").definition });
    project = core.upsertMath3DProjectAlgebraObject(project, group);
    const request = core.buildAlgebraOperationRequest(project, { objectId: group.id, revision: 1 },
      "sage.group.dossier", "docker", {});
    const evidence = core.createProjectAlgebraEvidence(project.identity.id, project.algebraObjects, request, fixture,
      { engine: "sagemath", version: "9.5", backend: "docker", jobId: "sage-e03-desktop",
        elapsedMs: 1, warnings: [] });
    project = core.addMath3DProjectAlgebraEvidence(project, evidence);
    const install = async (raw: string) => {
      await ctx!.page.evaluate(({ id, title, raw }) => {
        localStorage.setItem("math3d.project.v1", raw);
        localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
        localStorage.setItem("math3d.project-library.v1", JSON.stringify({ format: "math3d.project-library", version: 1,
          entries: [{ id, title, tags: [], favorite: false, savedAt: Date.now(), viewedAt: Date.now() }] }));
      }, { id: project.identity.id, title: project.metadata.title, raw });
      await ctx!.page.reload();
      await ctx!.page.getByTestId("projects-toggle").click();
      await ctx!.page.getByTestId(`project-open-saved-${project.identity.id}`).click();
      await ctx!.page.getByTestId("workspace-nav-cas").click();
    };
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await install(core.serializeMath3DProject(project));
    const cas = ctx.page.getByTestId("cas-algebra-workspace");
    await cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /D4 @1/ }).click();
    await cas.getByRole("button", { name: "Operations", exact: true }).click();
    await cas.getByRole("button", { name: "Inspect saved result" }).click();
    const viewer = cas.getByTestId("cas-group-viewer");
    await expect(viewer.getByTestId("cas-group-cayley-scene")).toBeVisible();
    await expect(viewer.locator("[data-testid^='cas-group-node-']")).toHaveCount(8);
    await viewer.getByTestId("cas-group-node-g3").click();
    await expect(viewer.getByTestId("cas-group-selection")).toContainText("[2, 3, 4, 1]");
    await viewer.screenshot({ path: test.info().outputPath("cayley-scene.png") });
    const cayley = core.parseSageFiniteGroupScene(JSON.parse(await download(ctx, "cayley.json",
      () => viewer.getByRole("button", { name: "Export scene JSON" }).click())));
    expect(cayley.edges).toHaveLength(16);
    expect(cayley.source.targetHash).toBe(group.contentHash);
    await viewer.getByRole("button", { name: "Subgroup graph" }).click();
    await expect(viewer.getByTestId("cas-group-subgroup-scene")).toBeVisible();
    await viewer.getByTestId("cas-group-node-H1").focus();
    await viewer.getByTestId("cas-group-node-H1").press("Enter");
    await expect(viewer.getByTestId("cas-group-selection")).toContainText("Normal");
    await viewer.screenshot({ path: test.info().outputPath("subgroup-scene.png") });
    const subgroup = core.parseSageFiniteGroupScene(JSON.parse(await download(ctx, "subgroup.json",
      () => viewer.getByRole("button", { name: "Export scene JSON" }).click())));
    expect(subgroup.nodes).toHaveLength(10);
    expect(subgroup.source.resultHash).toBe(evidence.resultHash);
    const svg = await download(ctx, "subgroup.svg", () => viewer.getByRole("button", { name: "Export SVG" }).click());
    expect(svg).toContain("Subgroup inclusion graph");
    expect(svg).toContain(evidence.id);
    const embedded = await ctx.page.evaluate((source) => {
      const document = new DOMParser().parseFromString(source, "image/svg+xml");
      if (document.querySelector("parsererror")) throw new Error("Exported group SVG is invalid XML.");
      return JSON.parse(document.querySelector("#math3d-scene")?.textContent ?? "null");
    }, svg);
    expect(core.parseSageFiniteGroupScene(embedded)).toEqual(subgroup);
    await cas.getByRole("button", { name: "Back to workspace" }).click();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId("project-explorer-panel").getByTestId("project-save").click();
    const exported = await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    if (!exported) throw new Error("Project export bytes are missing.");
    await ctx.app.close();
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await install(exported);
    const reopened = ctx.page.getByTestId("cas-algebra-workspace");
    await reopened.getByTestId("cas-structures-explorer").getByRole("button", { name: /D4 @1/ }).click();
    await reopened.getByRole("button", { name: "Operations", exact: true }).click();
    await reopened.getByRole("button", { name: "Inspect saved result" }).click();
    await expect(reopened.getByTestId("cas-group-viewer")).toContainText("Pinned group");
    const imported = core.parseMath3DProject(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    expect(core.buildSageFiniteGroupScene(imported, imported.algebraEvidence[0], "subgroup")).toEqual(subgroup);
  } finally { await closeSurfaceApp(ctx); }
});
