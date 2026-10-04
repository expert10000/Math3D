import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
const core = require(resolve("packages/core/src/index.ts"));

test("PRJ31–33 saved surface formulas, linked mesh and analysis survive package transfer and restart", async () => {
  test.setTimeout(300_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "prj31-enneper", metadata: { title: "Enneper workflow" }, source: {
      representation: "weierstrass", definition: { familyId: "enneper", expressions: { g: "z", phi: "1" } },
      domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false }, v: { min: -1, max: 1, periodic: false } },
      parameters: { retainedAnnotation: "acceptance" }, units: { length: "unitless" }, orientation: { sign: 1 }, branchPolicy: null,
    } });
    const project = core.createMath3DProject(core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface, expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], relations: [], results: [], artifacts: [], constructions: [], committedSelection: null }), { stableKey: "prj31-project", title: "Enneper workflow" });
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    let page = ctx.page, panel = page.getByTestId("project-explorer-panel"), editor = page.getByTestId("project-source-editor");
    const show = async () => { if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click(); };
    const close = async () => { if (await panel.isVisible()) await page.getByRole("button", { name: "Close project explorer" }).click(); };
    const openSurface = async () => { await show(); await panel.getByTestId(`project-open-${surface.identity.id}`).click(); await close(); await expect(editor).toBeVisible(); };
    const save = async () => { await show(); await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved"); return page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!)); };
    await show(); await panel.getByTestId("project-import-file").setInputFiles({ name: "enneper.json", mimeType: "application/json", buffer: Buffer.from(core.serializeMath3DProject(project)) });
    await panel.getByTestId("project-import-open").click(); await openSurface();
    await expect(editor.getByTestId("project-surface-field-g")).toHaveValue("z");
    await editor.getByTestId("project-surface-field-u.min").fill("2"); await editor.getByTestId("project-surface-apply").click();
    await expect(editor.getByRole("alert")).toContainText("min must be smaller"); await expect(editor.getByTestId("project-source-revision")).toHaveText("Revision 1");
    await editor.getByTestId("project-surface-field-u.min").fill("-1"); await editor.getByTestId("project-surface-field-phi").fill("2");
    await editor.getByTestId("project-surface-apply").click(); await expect(editor.getByTestId("project-source-revision")).toHaveText("Revision 2");
    await editor.getByTestId("project-source-undo").click(); await expect(editor.getByTestId("project-surface-field-phi")).toHaveValue("1");
    await editor.getByTestId("project-source-redo").click(); await expect(editor.getByTestId("project-surface-field-phi")).toHaveValue("2");
    await editor.getByTestId("project-surface-create-mesh").click();
    await expect(editor.getByTestId("project-saved-mesh-freshness")).toContainText("Current source");
    const firstId = await editor.getByTestId("project-saved-mesh-choice").inputValue();
    for (const action of ["quality", "curvature", "path"]) await editor.getByTestId(`project-saved-mesh-${action}`).click();
    await expect(editor.getByTestId("project-saved-mesh-results")).toContainText("Saved analysis (3)");
    await expect(editor.getByTestId("project-saved-mesh-results")).toContainText("Discrete curvature");
    const first = await save(); await close();
    expect(first.workspace.entries).toHaveLength(2); expect(first.workspace.results).toHaveLength(3);
    expect(first.workspace.results.every((result: any) => result.provenance.source.documentId === firstId)).toBe(true);
    expect(first.workspace.relations.find((relation: any) => relation.operation === "surface.tessellate-saved").sources[0].revision).toBe(4);
    await editor.getByTestId("project-surface-field-phi").fill("3"); await editor.getByTestId("project-surface-apply").click();
    await expect(editor.getByTestId("project-saved-mesh-freshness")).toContainText("Historical source");
    await editor.getByTestId("project-surface-create-mesh").click();
    const secondId = await editor.getByTestId("project-saved-mesh-choice").inputValue(); expect(secondId).not.toBe(firstId);
    await editor.getByTestId("project-saved-mesh-quality").click();
    await editor.getByTestId("project-saved-mesh-open").click(); await expect(editor).toBeHidden(); await expect(page.getByTestId("project-mesh-editor")).toBeVisible();
    await page.getByTestId("project-mesh-scale").fill("2"); await page.getByTestId("project-mesh-apply").click();
    await expect(page.getByTestId("project-saved-mesh-results")).toContainText("historical");
    await page.getByTestId("project-saved-mesh-quality").click();
    const saved = await save(); expect(saved.workspace.entries).toHaveLength(3); expect(saved.workspace.results.filter((result: any) => result.provenance.operation.type.startsWith("mesh.saved."))).toHaveLength(5);
    expect(saved.workspace.results.slice(0, 3)).toEqual(first.workspace.results);
    const exportPath = resolve(ctx.profileDir, "enneper-with-mesh.json");
    await ctx.app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), exportPath);
    await panel.getByTestId("project-export-resources").click(); await expect(panel.getByTestId("project-message")).toContainText("Exported project with verified");
    await expect.poll(() => existsSync(exportPath)).toBe(true);
    const raw = readFileSync(exportPath, "utf8"), exported = JSON.parse(raw);
    expect(exported.project.workspace.results).toEqual(saved.workspace.results); expect(exported.resources).toHaveLength(3);
    await closeSurfaceApp(ctx); ctx = null;
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); page = ctx.page; panel = page.getByTestId("project-explorer-panel"); editor = page.getByTestId("project-source-editor");
    await show(); await panel.getByTestId("project-import-file").setInputFiles({ name: "transferred.json", mimeType: "application/json", buffer: Buffer.from(raw) });
    await expect(panel.getByTestId("project-import-open")).toBeEnabled(); await panel.getByTestId("project-import-open").click();
    await save(); const profile = ctx.profileDir; await ctx.app.close(); ctx = await launchSurfaceApp({}, profile); page = ctx.page; panel = page.getByTestId("project-explorer-panel"); editor = page.getByTestId("project-source-editor");
    await show(); await panel.getByTestId("project-view-saved").click(); await panel.getByTestId("project-restore-saved").click(); await panel.getByTestId("project-import-open").click();
    await openSurface(); await expect(editor.getByTestId("project-surface-field-phi")).toHaveValue("3");
    await expect(editor.getByTestId("project-saved-mesh-choice").locator("option")).toHaveCount(2);
    await editor.getByTestId("project-saved-mesh-choice").selectOption(firstId); await expect(editor.getByTestId("project-saved-mesh-results")).toContainText("Saved analysis (3)");
    await expect(editor.getByTestId("project-saved-mesh-freshness")).toContainText("Historical source");
    await editor.getByTestId("project-saved-mesh-choice").selectOption(secondId); await expect(editor.getByTestId("project-saved-mesh-results")).toContainText("Saved analysis (2)");
    await page.setViewportSize({ width: 390, height: 844 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: resolve("output/projects-integration/prj31-33-mobile-width.png") });
  } finally { await closeSurfaceApp(ctx); }
});
