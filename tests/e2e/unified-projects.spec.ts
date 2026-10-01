import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { runNamedProjectRoundTrip } from "./helpers/namedProjectRoundTrip";
const projectCore = require(resolve("packages/core/src/index.ts"));

test("PRJ08 named project checkpoints survive Electron/mobile transfer, restart and managed history", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); const app = ctx;
    let sequence = 0;
    await runNamedProjectRoundTrip(app.page, async (checkpoint) => {
      const filename = test.info().outputPath(`project-${++sequence}.math3d.project.json`);
      await app.app.evaluate(({ session }, savePath) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(savePath)), filename);
      await app.page.getByTestId(checkpoint ? "project-export-checkpoint" : "project-export").click();
      await expect.poll(() => { try { projectCore.parseMath3DProject(readFileSync(filename, "utf8")); return true; } catch { return false; } }).toBe(true);
      return readFileSync(filename, "utf8");
    });
  } finally { await closeSurfaceApp(ctx); }
});

test("PRJ07 previews independent scientific starters and opens their real documents and lineage", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    const before = await page.evaluate(() => ({ ...localStorage }));
    await panel.getByTestId("project-template-preview").click();
    await expect(panel.getByTestId("project-import-preview")).toContainText("Minimal Surface Study");
    await expect(panel.getByTestId("project-import-open")).toBeEnabled();
    expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
    await panel.getByTestId("project-import-cancel").click();
    expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
    await panel.getByTestId("project-template-preview").click(); await panel.getByTestId("project-import-save").click();
    const first = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project-library.v1")!).entries[0].id);
    await panel.getByTestId("project-template-preview").click(); await panel.getByTestId("project-import-open").click();
    const current = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(current.identity.id).not.toBe(first); expect(current.workspace.entries.map((entry: any) => entry.module)).toEqual(["graph2d", "curve", "surface"]);
    await expect(page.getByTestId("workspace-nav-graphs")).toHaveAttribute("aria-pressed", "true");
    await expect(panel.getByTestId("project-group-surface")).toContainText("catenoid");
    await expect(panel.getByTestId("project-group-analysis")).toContainText("numerical");
    await panel.getByTestId("project-inspect-relations").click();
    await expect(panel.getByTestId("project-dependencies")).toContainText("graph2d.revolve-surface");
    await panel.getByTestId("project-template-select").selectOption("derivative-study");
    await panel.getByTestId("project-template-preview").click();
    await expect(panel.getByTestId("project-import-preview")).toContainText("Derivative Study");
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.getByTestId("project-templates").screenshot({ path: test.info().outputPath("project-starter-phone.png") });
    const bounds = await panel.boundingBox(); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await panel.getByTestId("project-import-cancel").click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id)).toBe(current.identity.id);
  } finally { await closeSurfaceApp(ctx); }
});

test("PRJ01/PRJ02 names and previews a project across restart and navigates live documents", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("project-message")).toContainText("Current workspace");
    for (const module of ["graph2d", "geometry", "curve", "surface", "mesh", "volume", "topology", "complex", "analysis"]) {
      await expect(panel.getByTestId(`project-group-${module}`)).toHaveCount(1);
    }
    await panel.getByTestId("project-title").fill("Minimal Surface Study");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved “Minimal Surface Study”");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace.entries.length).toBeGreaterThan(1);
    const originalIds = saved.workspace.entries.map((entry: any) => entry.expected.id);
    await panel.screenshot({ path: test.info().outputPath("project-explorer-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    const bounds = await panel.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    await panel.screenshot({ path: test.info().outputPath("project-explorer-phone.png") });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.reload();
    await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-view-saved").click();
    await expect(panel.getByTestId("project-title")).toHaveValue("Minimal Surface Study");
    await expect(panel.getByTestId("project-title")).toBeDisabled();
    await expect(panel.getByTestId("project-save")).toBeDisabled();
    const buttons = panel.locator("button[data-testid^='project-open-']");
    await expect(buttons).toHaveCount(originalIds.length);
    for (let index = 0; index < originalIds.length; index++) await expect(buttons.nth(index)).toBeDisabled();
    const reopened = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(reopened).toEqual(saved);
    await panel.getByTestId("project-current").click();
    const graphOpen = panel.getByTestId("project-group-graph2d").getByRole("button").first();
    await expect(graphOpen).toBeEnabled(); await graphOpen.click();
    await expect(page.getByTestId("workspace-nav-graphs")).toHaveAttribute("aria-pressed", "true");
    await expect(panel).not.toBeVisible();
  } finally { await closeSurfaceApp(ctx); }
});

test("PRJ02 rejects corrupt saved project without replacing its bytes", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    await ctx.page.evaluate(() => localStorage.setItem("math3d.project.v1", "{broken saved project"));
    await ctx.page.getByTestId("projects-toggle").click();
    const panel = ctx.page.getByTestId("project-explorer-panel");
    await expect(panel.getByTestId("project-message")).toContainText("Project unavailable");
    await expect(panel.getByTestId("project-save")).toBeDisabled();
    expect(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe("{broken saved project");
  } finally { await closeSurfaceApp(ctx); }
});

test("PRJ03 persists library metadata, favorites, activity and thumbnail sidecars safely", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-title").fill("Catenary research");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved “Catenary research”");
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    await panel.getByTestId("project-description").fill("Minimal surface workflow");
    await panel.getByTestId("project-tags").fill("geometry, research");
    await panel.getByTestId("project-thumbnail").setInputFiles({ name: "thumbnail.png", mimeType: "image/png",
      buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
    await expect(panel.getByTestId("project-message")).toContainText("Thumbnail ready");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved “Catenary research”");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(saved.identity).toEqual(before.identity);
    expect(saved.workspace).toEqual(before.workspace);
    const firstCard = panel.getByTestId(`project-library-${saved.identity.id}`);
    await expect(firstCard.locator("img")).toBeVisible();
    await firstCard.getByRole("button", { name: "Favorite Catenary research", exact: true }).click();
    await panel.getByTestId("project-new").click();
    await panel.getByTestId("project-title").fill("Second study");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved “Second study”");
    const activeId = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id);
    expect(activeId).not.toBe(saved.identity.id);
    await expect(panel.getByTestId("project-library").locator("article").first()).toHaveAttribute("data-testid", `project-library-${saved.identity.id}`);
    await panel.getByTestId("project-library-search").fill("geometry");
    await expect(panel.getByTestId("project-library").locator("article")).toHaveCount(1);
    await firstCard.getByTestId(`project-preview-${saved.identity.id}`).click();
    await expect(panel.getByTestId("project-description")).toHaveValue("Minimal surface workflow");
    await expect(panel.getByTestId("project-tags")).toHaveValue("geometry, research");
    await expect(panel.getByTestId("project-description")).toBeDisabled();
    await expect(firstCard).toContainText("Viewed");
    await panel.getByTestId("project-current").click();
    await expect(panel.getByTestId("project-title")).toHaveValue("Second study");
    await page.reload();
    await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
    await page.getByTestId("projects-toggle").click();
    await expect(firstCard.getByRole("button", { name: "Favorite Catenary research", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(firstCard).toContainText("Viewed");
    await firstCard.getByTestId(`project-preview-${saved.identity.id}`).click();
    await expect(panel.getByTestId("project-description")).toHaveValue("Minimal surface workflow");
    await panel.screenshot({ path: test.info().outputPath("project-library-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.screenshot({ path: test.info().outputPath("project-library-phone.png") });
    const bounds = await panel.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await page.evaluate((id) => localStorage.removeItem(`math3d.project.v1.payload.${id}.thumbnail`), saved.identity.id);
    await panel.getByTestId("project-current").click();
    await expect(firstCard.getByTestId("project-thumbnail-fallback")).toBeVisible();
    const payloads = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("math3d.project.v1"))));
    await page.evaluate(() => localStorage.setItem("math3d.project-library.v1", "{broken index"));
    await panel.getByTestId("project-current").click();
    await expect(panel.getByTestId("project-library-message")).toContainText("Library unavailable");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Project save failed");
    expect(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith("math3d.project.v1"))))).toEqual(payloads);
  } finally { await closeSurfaceApp(ctx); }
});

test("PRJ04 manages saved documents with guarded deletion and undo across reopen", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved “");
    const activeBytes = await page.evaluate(() => localStorage.getItem("math3d.project.v1")!);
    const original = JSON.parse(activeBytes), graph = original.workspace.entries.find((entry: any) => entry.module === "graph2d");
    await panel.getByTestId("project-manage").click();
    for (const entry of original.workspace.entries.filter((entry: any) => entry.module !== "graph2d")) {
      await panel.getByTestId(`project-actions-${entry.expected.id}`).getByRole("button", { name: "Duplicate source", exact: true }).click();
      await expect(panel.getByTestId("project-message")).toContainText("new identity");
      await panel.getByTestId("project-undo").click();
    }
    const originalActions = panel.getByTestId(`project-actions-${graph.expected.id}`);
    await originalActions.getByRole("button", { name: "Duplicate source", exact: true }).click();
    await expect(panel.getByTestId("project-message")).toContainText("new identity");
    await expect(panel.getByTestId("project-group-graph2d")).toContainText("Graph (2)");
    await originalActions.getByRole("button", { name: "Review delete", exact: true }).click();
    await expect(panel.getByTestId(`project-delete-review-${graph.expected.id}`)).toContainText("Delete blocked");
    await expect(panel.getByTestId(`project-delete-review-${graph.expected.id}`).getByRole("button", { name: "Delete document", exact: true })).toBeDisabled();
    const copyActions = panel.getByTestId("project-group-graph2d").locator("[data-testid^='project-actions-']").last();
    await copyActions.getByRole("textbox").fill("Independent graph snapshot");
    await copyActions.getByRole("button", { name: "Rename", exact: true }).click();
    await copyActions.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(panel.getByTestId("project-group-graph2d")).toContainText("archived");
    await copyActions.getByRole("button", { name: "Restore", exact: true }).click();
    await copyActions.getByRole("button", { name: "Review delete", exact: true }).click();
    await copyActions.getByRole("button", { name: "Delete document", exact: true }).click();
    await expect(panel.getByTestId("project-group-graph2d")).toContainText("Graph (1)");
    await panel.getByTestId("project-undo").click();
    await expect(panel.getByTestId("project-group-graph2d")).toContainText("Graph (2)");
    await panel.getByTestId("project-redo").click();
    await expect(panel.getByTestId("project-group-graph2d")).toContainText("Graph (1)");
    await panel.getByTestId("project-undo").click(); await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved “");
    const saved = await page.evaluate((id) => JSON.parse(localStorage.getItem(`math3d.project.v1.payload.${id}`)!), original.identity.id);
    expect(saved.workspace.entries.length).toBe(original.workspace.entries.length + 1);
    expect(saved.workspace.entries.slice(0, -1)).toEqual(original.workspace.entries);
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(activeBytes);
    await page.reload(); await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId(`project-preview-${original.identity.id}`).click();
    await expect(panel.getByTestId("project-group-graph2d")).toContainText("Independent graph snapshot");
    await expect(panel.getByTestId("project-group-graph2d")).toContainText("Graph (2)");
  } finally { await closeSurfaceApp(ctx); }
});

test("PRJ05 inspects stale lineage, provenance and missing artifacts without opening unrelated live state", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const core = projectCore, graph = core.instantiateGraph2DPreset(core.getGraph2DPresetCatalog().get("parabola-tangent"), "inspection-e2e").document;
    const curve = core.promoteGraph2DToCurve(graph, graph.source.objects[0].id);
    const result = core.analyzeGraph2DDerivative({ document: graph, objectId: graph.source.objects[0].id, x: 1, order: 1 }).publication;
    const handle = { artifactId: "e2e-unavailable-artifact", kind: "table", role: "samples" };
    const edited = core.createEmptyGraph2DDocument("replacement", "Edited graph");
    const source = edited.source, identity = core.advanceDocumentIdentity(graph.identity, source);
    const changedGraph = core.createGraph2DDocument({ stableKey: "replacement", source, identity, title: "Edited graph" });
    const workspace = core.createMixedWorkspaceDocument({ ...core.createGraph2DWorkspaceProject(changedGraph),
      entries: [...core.createGraph2DWorkspaceProject(changedGraph).entries, { module: "curve", checkpoint: curve.document, expected: curve.document.identity, replay: null }],
      results: [{ ...result, artifacts: [handle] }], artifacts: [{ handle, contentHash: core.structuralHash("missing"), byteLength: 100 }], relations: [curve.relation] });
    const project = core.createMath3DProject(workspace, { stableKey: "inspection-e2e", title: "Stale lineage study" });
    const bytes = core.serializeMath3DProject(project), page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.evaluate((raw) => localStorage.setItem("math3d.project.v1", raw), bytes);
    await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-view-saved").click();
    await panel.getByTestId(`project-inspect-${curve.document.identity.id}`).click();
    const inspector = panel.getByTestId("project-dependencies");
    await expect(inspector.getByTestId("project-document-freshness")).toContainText("lineage stale");
    await inspector.getByRole("button", { name: "Edited graph", exact: true }).click();
    await expect(inspector).toContainText("Dependencies: Edited graph");
    await expect(inspector.getByTestId(`project-result-status-${result.resultId}`)).toContainText(`authority ${result.status}`);
    await expect(inspector.getByTestId(`project-result-status-${result.resultId}`)).toContainText("unavailable");
    await expect(inspector.getByTestId(`project-artifact-${handle.artifactId}`)).toContainText("missing or unverified");
    await expect(panel.getByTestId(`project-open-${graph.identity.id}`)).toBeDisabled();
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(bytes);
    await inspector.screenshot({ path: test.info().outputPath("project-dependencies-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await inspector.screenshot({ path: test.info().outputPath("project-dependencies-phone.png") });
  } finally { await closeSurfaceApp(ctx); }
});

test("PRJ06 exports, previews, cancels and opens supported imports while retaining historical records", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel"), core = projectCore;
    await page.getByTestId("projects-toggle").click(); await panel.getByTestId("project-title").fill("Local study");
    await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved “Local study”");
    const originalBytes = await page.evaluate(() => localStorage.getItem("math3d.project.v1")!);
    const exportedPath = test.info().outputPath("project.math3d.project.json");
    await ctx.app.evaluate(({ session }, savePath) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(savePath)), exportedPath);
    await panel.getByTestId("project-export").click();
    await expect.poll(() => { try { core.parseMath3DProject(readFileSync(exportedPath, "utf8")); return true; } catch { return false; } }).toBe(true);
    const exported = core.parseMath3DProject(readFileSync(exportedPath, "utf8"));
    expect(exported.identity).toEqual(JSON.parse(originalBytes).identity); expect(exported.workspace).toEqual(JSON.parse(originalBytes).workspace);
    const before = await page.evaluate(() => ({ ...localStorage }));
    await panel.getByTestId("project-import-file").setInputFiles(exportedPath);
    await expect(panel.getByTestId("project-import-preview")).toContainText("replay verified");
    await expect(panel.getByTestId("project-import-open")).toBeDisabled();
    expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
    await panel.getByTestId("project-import-cancel").click(); await expect(panel.getByTestId("project-import-preview")).toHaveCount(0);
    const future = { ...exported, schemaVersion: 99 };
    await panel.getByTestId("project-import-file").setInputFiles({ name: "future.project.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(future)) });
    await expect(panel.getByTestId("project-message")).toContainText("Project import rejected");
    expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before);
    const graph = core.instantiateGraph2DPreset(core.getGraph2DPresetCatalog().get("parabola-tangent"), "supported-import-e2e").document;
    const curve = core.promoteGraph2DToCurve(graph, graph.source.objects[0].id), result = core.analyzeGraph2DDerivative({ document: graph, objectId: graph.source.objects[0].id, x: 1, order: 1 }).publication;
    const workspace = core.createMixedWorkspaceDocument({ ...core.createGraph2DWorkspaceProject(graph), entries: [...core.createGraph2DWorkspaceProject(graph).entries,
      { module: "curve", checkpoint: curve.document, expected: curve.document.identity, replay: null }], results: [result], relations: [curve.relation] });
    const incoming = core.createMath3DProject(workspace, { stableKey: "supported-import-e2e", title: "Imported Graph study" }), bytes = core.serializeMath3DProject(incoming);
    const upload = { name: "supported.project.json", mimeType: "application/json", buffer: Buffer.from(bytes) };
    await panel.getByTestId("project-import-file").setInputFiles(upload);
    await expect(panel.getByTestId("project-import-preview")).toContainText("Recorded result engines");
    await expect(panel.getByTestId("project-import-open")).toBeEnabled();
    await panel.screenshot({ path: test.info().outputPath("project-import-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 }); await panel.screenshot({ path: test.info().outputPath("project-import-phone.png") });
    const bounds = await panel.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await page.setViewportSize({ width: 1280, height: 720 });
    await panel.getByTestId("project-import-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Imported into the library");
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(originalBytes);
    await panel.getByTestId("project-import-file").setInputFiles(upload); await panel.getByTestId("project-import-open").click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported Graph workspace");
    await expect(page.getByTestId("workspace-nav-graphs")).toHaveAttribute("aria-pressed", "true");
    const backup = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1.before-open")!));
    expect(backup.workspace.entries.map((entry: any) => entry.expected.id)).toEqual(JSON.parse(originalBytes).workspace.entries.map((entry: any) => entry.expected.id));
    await panel.getByTestId("project-current").click();
    await expect(panel.getByTestId(`project-open-${graph.identity.id}`)).toBeEnabled();
    await expect(panel.getByTestId("project-group-curve")).toContainText(curve.document.metadata.title);
    await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved “Imported Graph study”");
    const after = await page.evaluate(() => localStorage.getItem("math3d.project.v1")!);
    expect(JSON.parse(after).workspace.results).toContainEqual(result); expect(JSON.parse(after).workspace.relations).toContainEqual(curve.relation);
    const conflict = { ...incoming, metadata: { title: "Conflicting version" } };
    await panel.getByTestId("project-import-file").setInputFiles({ name: "conflict.json", mimeType: "application/json", buffer: Buffer.from(core.serializeMath3DProject(conflict)) });
    await panel.getByTestId("project-import-save").click(); await expect(panel.getByTestId("project-message")).toContainText("different saved version");
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(after);
    await expect(page.getByTestId("workspace-nav-graphs")).toHaveAttribute("aria-pressed", "true");
  } finally { await closeSurfaceApp(ctx); }
});
