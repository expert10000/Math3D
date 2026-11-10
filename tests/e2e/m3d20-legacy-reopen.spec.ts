import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
const core = require(resolve("packages/core/src/index.ts"));
const gallery = async (ctx: LaunchedSurfaceApp) => {
  const panel = ctx.page.getByTestId("project-explorer-panel");
  if (!await panel.isVisible()) await ctx.page.getByTestId("projects-toggle").click();
  await expect(panel).toBeVisible();
  return panel;
};
async function importAndRestart(raw: string) {
  let ctx = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(ctx.page);
    const panel = await gallery(ctx);
    await panel.getByTestId("project-import-file").setInputFiles({
      name: "acceptance.math3d", mimeType: "application/json", buffer: Buffer.from(raw),
    });
    await panel.getByTestId("project-import-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Imported into the library");
    const project = core.parseMath3DProject(raw);
    const payload = () => ctx.page.evaluate(id => localStorage.getItem("math3d.project.v1.payload." + id), project.identity.id);
    await expect.poll(payload).not.toBeNull();
    const before = core.parseMath3DProject((await payload())!);
    const profile = ctx.profileDir;
    await ctx.app.close();
    ctx = await launchSurfaceApp({}, profile);
    const reopenedPanel = await gallery(ctx);
    await reopenedPanel.getByTestId("project-open-saved-" + project.identity.id).click();
    await expect.poll(() => ctx.page.evaluate(() => {
      const raw = localStorage.getItem("math3d.project.v1"); return raw ? JSON.parse(raw).identity.id : null;
    })).toBe(project.identity.id);
    const after = core.parseMath3DProject((await payload())!);
    return { ctx, panel: reopenedPanel, before, after };
  } catch (error) { await closeSurfaceApp(ctx); throw error; }
}
test("M3D20 AC02 AC07 legacy nullable selections survive library import and cold reopen", async () => {
  test.setTimeout(180_000);
  const raw = readFileSync("tests/fixtures/scientific-selection/gf01-legacy-project.math3d", "utf8");
  const original = core.parseMath3DProject(raw);
  const expected = core.readScientificSelectionsFromProject(original);
  const journey = await importAndRestart(raw);
  try {
    expect(journey.before.identity.id).toBe(original.identity.id);
    expect(journey.after.identity).toEqual(journey.before.identity);
    const selections = core.readScientificSelectionsFromProject(journey.after);
    expect(selections).toEqual(expected);
    expect(selections.some((s: any) => s.source === null)).toBe(true);
    expect(selections.some((s: any) => s.source?.kind === "document" && s.source.checkpoint === null)).toBe(true);
    const frame = JSON.parse(readFileSync("packages/core/fixtures/cross-module/current-v1.json", "utf8")).sourceFrame;
    const entry = journey.after.workspace.entries.find((e: any) => e.module === "vector3d");
    const source = core.viewerSourceFromDocument(entry.checkpoint);
    for (const s of selections.filter((s: any) => s.source === null || s.source.kind === "document" && s.source.checkpoint === null))
      expect(core.referenceFromScientificSelection(s, source, "vector3d", frame, "point").ok).toBe(false);
  } finally { await closeSurfaceApp(journey.ctx); }
});
test("M3D20 AC03 metadata-only artifact remains unavailable after cold Project reopen", async () => {
  test.setTimeout(180_000);
  const graph = core.instantiateGraph2DPreset(core.getGraph2DPresetCatalog().get("parabola-tangent"), "acceptance-missing-bytes").document;
  const publication = core.analyzeGraph2DDerivative({ document: graph, objectId: graph.source.objects[0].id, x: 1, order: 1 }).publication;
  const handle = { artifactId: "acceptance-unavailable", kind: "table", role: "samples" };
  const descriptor = { handle, contentHash: core.structuralHash("absent bytes"), byteLength: 100 };
  const workspace = core.createMixedWorkspaceDocument({ ...core.createGraph2DWorkspaceProject(graph),
    results: [{ ...publication, artifacts: [handle] }], artifacts: [descriptor] });
  const project = core.createMath3DProject(workspace, { stableKey: "acceptance-missing-bytes" });
  const journey = await importAndRestart(core.serializeMath3DProject(project));
  try {
    expect(journey.after.workspace.artifacts).toEqual([descriptor]);
    expect(journey.after.workspace.results[0].artifacts).toEqual([handle]);
    expect(journey.after.identity).toEqual(journey.before.identity);
    await journey.panel.getByTestId("project-inspect-" + graph.identity.id).click();
    const missing = journey.panel.getByTestId("project-artifact-" + handle.artifactId);
    await expect(missing).toContainText("missing or unverified");
    expect(await journey.ctx.page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.artifacts)).toEqual([descriptor]);
  } finally { await closeSurfaceApp(journey.ctx); }
});
