import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { resolve } from "node:path";
const projectCore = require(resolve("packages/core/src/index.ts"));

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
