import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("SAGE-E04 builds free and presented modules and a typed map, then independently imports the Project", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-e04-surface", metadata: { title: "Project Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null,
      definition: { familyId: "sage-e04-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-e04-desktop", title: "Module presentations" });
    const zz = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "ZZ"),
      revision: 1, label: "ZZ", definition: { kind: "integer-ring" } });
    project = core.upsertMath3DProjectAlgebraObject(project, zz);
    const projectId = project.identity.id;
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.evaluate(({ id, title, raw }) => {
      localStorage.setItem("math3d.project.v1", raw);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
      localStorage.setItem("math3d.project-library.v1", JSON.stringify({ format: "math3d.project-library", version: 1,
        entries: [{ id, title, tags: [], favorite: false, savedAt: Date.now(), viewedAt: Date.now() }] }));
    }, { id: projectId, title: project.metadata.title, raw: core.serializeMath3DProject(project) });
    await ctx.page.reload();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId(`project-open-saved-${projectId}`).click();
    await ctx.page.getByTestId("workspace-nav-cas").click();
    const cas = ctx.page.getByTestId("cas-algebra-workspace");
    await cas.getByRole("button", { name: "+ New module" }).click();
    let builder = cas.getByTestId("cas-module-builder");
    await builder.getByLabel("Module name").fill("F");
    await builder.getByRole("button", { name: "Validate & preview" }).click();
    await expect(builder.getByTestId("cas-module-preview")).toContainText("ZZ^2");
    await builder.getByRole("button", { name: "Save to Project" }).click();
    await expect(cas.getByTestId("cas-selected-structure")).toContainText("Zero map (free module)");
    await cas.getByRole("button", { name: "Structures", exact: true }).click();
    await cas.getByRole("button", { name: "+ New module" }).click();
    builder = cas.getByTestId("cas-module-builder");
    await builder.getByLabel("Module type").selectOption("presented");
    await builder.getByRole("button", { name: "Validate & preview" }).click();
    await expect(builder.getByTestId("cas-module-preview")).toContainText("ZZ^2 / im(A");
    await builder.getByRole("button", { name: "Save to Project" }).click();
    await expect(cas.getByTestId("cas-selected-structure")).toContainText("[2, 0]; [0, 6]");
    await cas.getByRole("button", { name: "Structures", exact: true }).click();
    await cas.getByRole("button", { name: "+ New module" }).click();
    builder = cas.getByTestId("cas-module-builder");
    await builder.getByLabel("Module type").selectOption("map");
    await builder.getByRole("button", { name: "Validate & preview" }).click();
    if (await builder.getByRole("alert").count()) throw new Error(await builder.getByRole("alert").innerText());
    await expect(builder.getByTestId("cas-module-preview")).toContainText("2 rows × 2 columns");
    await builder.getByRole("button", { name: "Save to Project" }).click();
    await expect(cas.getByTestId("cas-selected-structure")).toContainText("Source and target are free modules");
    await cas.getByRole("button", { name: "Back to workspace" }).click();
    await ctx.page.getByTestId("projects-toggle").click();
    const panel = ctx.page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-save").click();
    await panel.getByTestId("project-detail-toggle").click();
    await panel.getByTestId("project-explorer-header").locator("summary").click();
    await panel.getByTestId("project-explorer-header").getByRole("button", { name: "Import / export" }).click();
    const path = test.info().outputPath("modules.resources.math3d.project.json");
    await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), path);
    await panel.getByTestId("project-export-resources").click();
    await expect.poll(() => { try { return readFileSync(path).length; } catch { return 0; } }).toBeGreaterThan(100);
    const bundle = JSON.parse(readFileSync(path, "utf8"));
    expect(bundle.project.identity.id).toBe(projectId);
    const saved = bundle.project.algebraObjects;
    expect(saved).toHaveLength(4);
    expect(saved.map((item: { revisions: { kind: string }[] }) => item.revisions[0].kind).sort()).toEqual(
      ["integer-ring", "module", "module", "module-map"].sort());
    const map = saved.find((item: { revisions: { kind: string }[] }) => item.revisions[0].kind === "module-map").revisions[0];
    expect(map.definition.matrix).toEqual([["1", "0"], ["0", "1"]]);
    await closeSurfaceApp(ctx); ctx = null;
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.getByTestId("projects-toggle").click();
    const freshPanel = ctx.page.getByTestId("project-explorer-panel");
    await freshPanel.getByTestId("project-import-file").setInputFiles(path);
    await expect(freshPanel.getByTestId("project-import-save")).toBeEnabled();
    await freshPanel.getByTestId("project-import-save").click();
    await expect(freshPanel.getByTestId("project-message")).toContainText("Imported into the library");
    await freshPanel.getByTestId(`project-open-saved-${projectId}`).click();
    await ctx.page.getByTestId("workspace-nav-cas").click();
    const reopened = ctx.page.getByTestId("cas-algebra-workspace");
    await reopened.getByTestId("cas-structures-explorer").getByRole("button", { name: /M @1/ }).click();
    await expect(reopened.getByTestId("cas-selected-structure")).toContainText("[2, 0]; [0, 6]");
    const imported = core.parseMath3DProject(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    expect(imported.algebraObjects).toEqual(core.parseMath3DProject(JSON.stringify(bundle.project)).algebraObjects);
  } finally { await closeSurfaceApp(ctx); }
});
