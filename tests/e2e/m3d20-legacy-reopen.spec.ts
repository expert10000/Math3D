import { mixedLegacyResourceFixture } from "./helpers/meshProjectResources";
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
  const mixed = core.parseMath3DProject(readFileSync("tests/fixtures/scientific-selection/gf01-legacy-project.math3d", "utf8"));
  // The mixed fixture's Graph point tables have no source sidecars. Keep its
  // unmodified legacy field checkpoint for this executable editor journey.
  const field = mixed.workspace.entries.find((entry: any) => entry.module === "vector3d");
  const original = core.createMath3DProject(core.createMixedWorkspaceDocument({
    ...mixed.workspace, entries: [field], activeDocumentIds: [field.expected.id],
  }), { stableKey: "acceptance-legacy-field-reopen" });
  const raw = core.serializeMath3DProject(original);
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
    await journey.panel.getByTestId("project-gallery-layout-toggle").click();
    await journey.panel.getByTestId("project-detail-tab-documents").click();
    await journey.panel.getByTestId("project-inspect-" + graph.identity.id).click();
    const missing = journey.panel.getByTestId("project-artifact-" + handle.artifactId);
    await expect(missing).toContainText("missing or unverified");
    expect(await journey.ctx.page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.artifacts)).toEqual([descriptor]);
  } finally { await closeSurfaceApp(journey.ctx); }
});

test("M3D20 mixed legacy Project package transfers real sidecars and recovers after rejected resources", async () => {
  test.setTimeout(300_000);
  const fixture = mixedLegacyResourceFixture();
  const expectedSelections = core.readScientificSelectionsFromProject(fixture.project);
  const originalPackage = JSON.parse(fixture.raw);
  expect(originalPackage.resources.length).toBeGreaterThan(0);
  const signatures = (p: any) => p.resources.map((r: any) => ({ id: r.id, checksum: r.checksum, byteLength: r.byteLength })).sort((a: any,b: any) => a.id.localeCompare(b.id));
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    let panel = await gallery(ctx);
    const importFile = async (raw: string) => {
      panel = await gallery(ctx!);
      await panel.getByTestId("project-import-file").setInputFiles({ name: "legacy.resources.json", mimeType: "application/json", buffer: Buffer.from(raw) });
    };
    const assertCurrent = async () => {
      await expect.poll(() => ctx!.page.evaluate(() => {
        const raw = localStorage.getItem("math3d.project.v1");
        return raw ? JSON.parse(raw).identity.id : null;
      })).toBe(fixture.project.identity.id);
      const project = core.parseMath3DProject(await ctx!.page.evaluate(() => localStorage.getItem("math3d.project.v1")!));
      expect(project.identity).toEqual(fixture.project.identity);
      expect(project.workspace.entries.map((entry: any) => entry.expected)).toEqual(fixture.project.workspace.entries.map((entry: any) => entry.expected));
      expect(core.readScientificSelectionsFromProject(project)).toEqual(expectedSelections);
    };
    const fullDetails = async () => {
      panel = await gallery(ctx!);
      if (await panel.getAttribute("data-project-placement"))
        await panel.getByTestId("project-gallery-layout-toggle").click();
      if (await panel.locator(".project-gallery-layout-detail").count())
        await panel.getByTestId("project-detail-toggle").click();
      await expect(panel.getByTestId("project-sidebar-transfer")).toBeVisible();
    };
    const exportPackage = async (name: string) => {
      await fullDetails();
      const path = test.info().outputPath(name);
      await ctx!.app.evaluate(({ session }, savePath) => session.defaultSession.once("will-download", (_event,item) => item.setSavePath(savePath)), path);
      await panel.getByTestId("project-export-resources").click();
      await expect(panel.getByTestId("project-message")).toContainText("Exported project with verified");
      await expect.poll(() => { try { return JSON.parse(readFileSync(path,"utf8")).format; } catch { return null; } }).toBe("math3d.project-package");
      return readFileSync(path,"utf8");
    };
    await importFile(fixture.raw);
    await expect(panel.getByTestId("project-import-open")).toBeEnabled();
    await panel.getByTestId("project-import-open").click();
    await assertCurrent();
    const outbound = await exportPackage("mixed-outbound.json");
    expect(signatures(JSON.parse(outbound))).toEqual(signatures(originalPackage));
    // Close/delete the source profile: the destination cannot reuse its caches.
    await closeSurfaceApp(ctx); ctx = null;
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    panel = await gallery(ctx);
    const storage = () => ctx!.page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([k]) => k.startsWith("math3d.project"))));
    const empty = await storage();
    const absent = JSON.parse(outbound); absent.resources.splice(0,1);
    await importFile(JSON.stringify(absent));
    await expect(panel.getByTestId("project-import-open")).toBeDisabled();
    expect(await storage()).toEqual(empty);
    const corrupt = JSON.parse(outbound);
    const data = corrupt.resources[0].data;
    corrupt.resources[0].data = (data[0] === "A" ? "B" : "A") + data.slice(1);
    await importFile(JSON.stringify(corrupt));
    await expect(panel.getByTestId("project-message")).toContainText("rejected");
    expect(await storage()).toEqual(empty);
    // Correct original bytes are imported normally; no safety override/rebinding.
    await importFile(outbound);
    await expect(panel.getByTestId("project-import-open")).toBeEnabled();
    await panel.getByTestId("project-import-open").click();
    await assertCurrent();
    const profile = ctx.profileDir;
    await ctx.app.close(); ctx = await launchSurfaceApp({},profile);
    panel = await gallery(ctx);
    await panel.getByTestId("project-open-saved-" + fixture.project.identity.id).click();
    await assertCurrent();
    const returned = await exportPackage("mixed-returned.json");
    expect(signatures(JSON.parse(returned))).toEqual(signatures(originalPackage));
    // The standard resource parser on UI import/export verifies actual bytes against these digests.
    expect(JSON.parse(returned).resources.map((r: any) => r.data)).toEqual(JSON.parse(outbound).resources.map((r: any) => r.data));
  } finally { await closeSurfaceApp(ctx); }
});
