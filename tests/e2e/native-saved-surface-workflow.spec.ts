import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
const core = require(resolve("packages/core/src/index.ts"));

test("PRJ35 native saved Helicoid and custom formulas retain linked Mesh analyses across transfer and restart", async () => {
  test.setTimeout(300_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "prj35-helicoid", metadata: { title: "Helicoid investigation" }, source: {
      representation: "parametric", definition: { familyId: "custom", expressions: { x: "v*cos(u)", y: "v*sin(u)", z: "u" } },
      domain: { kind: "parameter", u: { min: -2, max: 2, periodic: false }, v: { min: -1, max: 1, periodic: false } },
      parameters: { observation: "retain this" }, units: { length: "m" }, orientation: { sign: 1 }, branchPolicy: null,
    } });
    const project = core.createMath3DProject(core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface, expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], relations: [], results: [], artifacts: [], constructions: [], committedSelection: null }), { stableKey: "prj35-project", title: "Native surface analysis" });
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    let page = ctx.page, panel = page.getByTestId("project-explorer-panel"), workflow = page.getByTestId("project-saved-mesh-workflow");
    const show = async () => { if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click(); };
    const close = async () => { if (await panel.isVisible()) await page.getByRole("button", { name: "Close project explorer" }).click(); };
    const openSurface = async () => { await show(); await panel.getByTestId(`project-open-${surface.identity.id}`).click(); await close(); await expect(page.getByTestId("project-surface-z")).toBeVisible(); };
    const save = async () => { await show(); await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved"); return page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!)); };
    await show(); await panel.getByTestId("project-import-file").setInputFiles({ name: "helicoid.json", mimeType: "application/json", buffer: Buffer.from(core.serializeMath3DProject(project)) });
    await panel.getByTestId("project-import-open").click(); await openSurface();
    await expect(workflow).toHaveCount(1); await expect(workflow).toContainText("33 × 33 grid");
    await workflow.getByTestId("project-surface-create-mesh").click();
    const originalMesh = await workflow.getByTestId("project-saved-mesh-choice").inputValue();
    await expect(workflow.getByTestId("project-saved-mesh-freshness")).toContainText("Current source");
    for (const action of ["quality", "curvature", "path"]) await workflow.getByTestId(`project-saved-mesh-${action}`).click();
    await expect(workflow.getByTestId("project-saved-mesh-results")).toContainText("Saved analysis (3)");
    const first = await save(); await close();
    const oldResults = first.workspace.results.filter((result: any) => result.provenance.operation.type.startsWith("mesh.saved."));
    expect(oldResults).toHaveLength(3);
    await page.getByTestId("project-surface-z").fill("0.5*u");
    await expect(workflow.getByTestId("project-saved-mesh-freshness")).toContainText("Historical source");
    await page.getByTestId("project-editor-undo").click(); await expect(page.getByTestId("project-surface-z")).toHaveValue("u");
    await page.getByTestId("project-editor-redo").click(); await expect(page.getByTestId("project-surface-z")).toHaveValue("0.5*u");
    await workflow.getByTestId("project-surface-create-mesh").click();
    const customMesh = await workflow.getByTestId("project-saved-mesh-choice").inputValue(); expect(customMesh).not.toBe(originalMesh);
    await workflow.getByTestId("project-surface-create-mesh").click(); await expect(workflow.getByTestId("project-saved-mesh-choice").locator("option")).toHaveCount(2);
    await workflow.getByTestId("project-saved-mesh-path-start").fill("-1"); await workflow.getByTestId("project-saved-mesh-path").click();
    await expect(workflow.getByRole("alert")).toContainText("Choose vertex indices");
    await workflow.getByTestId("project-saved-mesh-quality").click();
    const saved = await save();
    expect(saved.workspace.results.filter((result: any) => oldResults.some((old: any) => old.resultId === result.resultId))).toEqual(oldResults);
    const sourceEntry = saved.workspace.entries.find((entry: any) => entry.expected.id === surface.identity.id);
    const lineage = saved.workspace.relations.find((relation: any) => relation.operation === "surface.tessellate-saved" && relation.target.generation.documentId === customMesh);
    expect(lineage.sources[0]).toMatchObject({ documentId: surface.identity.id, revision: sourceEntry.expected.revision, structuralHash: sourceEntry.expected.structuralHash });
    const exportPath = resolve(ctx.profileDir, "native-surface-with-mesh.json");
    await ctx.app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), exportPath);
    await panel.getByTestId("project-export-resources").click(); await expect(panel.getByTestId("project-message")).toContainText("Exported project with verified");
    await expect.poll(() => existsSync(exportPath)).toBe(true);
    const raw = readFileSync(exportPath, "utf8"); expect(JSON.parse(raw).resources).toHaveLength(2);
    await close(); await workflow.getByTestId("project-saved-mesh-open").click();
    await expect(page.getByTestId("project-mesh-editor")).toBeVisible(); await expect(workflow).toHaveCount(1);
    await closeSurfaceApp(ctx); ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    page = ctx.page; panel = page.getByTestId("project-explorer-panel"); workflow = page.getByTestId("project-saved-mesh-workflow");
    await show(); await panel.getByTestId("project-import-file").setInputFiles({ name: "transferred.json", mimeType: "application/json", buffer: Buffer.from(raw) });
    await panel.getByTestId("project-import-open").click(); await save();
    const profile = ctx.profileDir; await ctx.app.close(); ctx = await launchSurfaceApp({}, profile);
    page = ctx.page; panel = page.getByTestId("project-explorer-panel"); workflow = page.getByTestId("project-saved-mesh-workflow");
    await show(); await panel.getByTestId("project-view-saved").click(); await panel.getByTestId("project-restore-saved").click(); await panel.getByTestId("project-import-open").click(); await openSurface();
    await expect(page.getByTestId("project-surface-z")).toHaveValue("0.5*u");
    await workflow.getByTestId("project-saved-mesh-choice").selectOption(originalMesh);
    await expect(workflow.getByTestId("project-saved-mesh-results")).toContainText("Saved analysis (3)");
    await expect(workflow.getByTestId("project-saved-mesh-freshness")).toContainText("Historical source");
    await workflow.getByTestId("project-saved-mesh-choice").selectOption(customMesh);
    await expect(workflow.getByTestId("project-saved-mesh-freshness")).toContainText("Current source");
    await expect(workflow.getByTestId("project-saved-mesh-results")).toContainText("Saved analysis (1)");
  } finally { await closeSurfaceApp(ctx); }
});
