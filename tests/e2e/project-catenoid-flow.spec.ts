import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { openLastSavedProject, launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Catenoid Surface → retained Mesh → Surface → save → cold restart → explicit reopen", async () => {
  test.setTimeout(240_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); await resizeSurfaceAppWindow(ctx, 1600, 1000);
    let page = ctx.page;
    await expect(page.getByTestId("projects-quick-toggle")).toHaveCount(0);
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-template-open-catenoid-evidence").click();
    await expect(page.getByTestId("project-source-editor")).toBeVisible();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const surface = saved.workspace.entries.find((entry: any) => entry.module === "surface");
    const mesh = saved.workspace.entries.find((entry: any) => entry.module === "mesh");
    const editor = page.getByTestId("project-source-editor");
    await expect(editor).toHaveAttribute("data-document-id", surface.expected.id);
    await expect(editor).toHaveAttribute("data-source-hash", surface.expected.structuralHash);
    await expect(page.getByTestId("workspace-nav-surfaces")).toHaveAttribute("aria-pressed", "true");
    // Exact captured revolution, not the module's default constructed Plane.
    expect(surface.checkpoint.source.definition.familyId).toBe("graph2d.revolution");
    await expect(editor.getByTestId("document-viewport")).toHaveAttribute("data-source-hash", surface.expected.structuralHash);
    await expect(editor.getByTestId("surface-viewer-canvas-host").locator("canvas")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("catenoid-surface.png") });
    await editor.getByTestId("project-saved-mesh-open").click();
    await expect(editor).toHaveAttribute("data-document-id", mesh.expected.id);
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", mesh.expected.id);
    await expect(page.getByTestId("workspace-nav-mesh")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("project-viewer-document")).toHaveValue(mesh.expected.id);
    await expect(page.getByTestId("project-source-back-to-surface")).toBeVisible();
    const meshViewer = page.getByTestId("surface-primary-viewer");
    await expect(meshViewer.getByTestId("surface-viewer-canvas-host").locator("canvas")).toBeVisible();
    await meshViewer.scrollIntoViewIfNeeded();
    expect((await meshViewer.boundingBox())!.height).toBeGreaterThan(250);
    await page.screenshot({ path: test.info().outputPath("catenoid-mesh.png") });
    await page.getByTestId("project-source-back-to-surface").click();
    await expect(page.getByTestId("workspace-nav-surfaces")).toHaveAttribute("aria-pressed", "true");
    await expect(editor).toHaveAttribute("data-document-id", surface.expected.id);
    await expect(page.getByTestId("project-viewer-document")).toHaveValue(surface.expected.id);
    await page.getByTestId("project-gallery-layout-toggle").click();
    await page.getByTestId("project-save").click();
    await expect(page.getByTestId("project-save")).toBeEnabled();
    await expect(page.getByTestId("project-explorer-panel")).toContainText(`Saved “${saved.metadata.title}”`);
    const profile = ctx.profileDir;
    await ctx.app.close();
    ctx = await launchSurfaceApp({}, profile); page = ctx.page;
    await openLastSavedProject(page);
    await resizeSurfaceAppWindow(ctx, 1600, 1000);
    await expect(page.getByTestId("project-source-editor")).toHaveAttribute("data-document-id", surface.expected.id);
    await expect(page.getByTestId("project-source-editor")).toHaveAttribute("data-source-hash", surface.expected.structuralHash);
    await expect(page.getByTestId("project-source-editor").getByTestId("surface-viewer-canvas-host").locator("canvas")).toBeVisible();
    await expect(page.getByTestId("app-status-bar")).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id)).toBe(saved.identity.id);
    await expect(page.getByRole("heading", { name: "Project overview", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Continue with catenoid", exact: true }).click();
    await expect(page.getByTestId("project-viewer-document")).toHaveValue(surface.expected.id);
    writeFileSync(test.info().outputPath("catenoid-evidence.json"), JSON.stringify({
      projectId: saved.identity.id, surface: surface.expected, mesh: mesh.expected,
      module: "surface", openingPath: "Projects Gallery → Catenoid Evidence → Open Mesh → Open source Surface → Save → cold Electron restart",
      viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, devicePixelRatio })),
      renderer: "native Surface module; captured Graph revolution", profile: "isolated temporary Electron profile",
    }, null, 2));
    await page.screenshot({ path: test.info().outputPath("catenoid-cold-resume.png") });
    // Also qualify saving with Mesh selected: no Surface-first hardcoding.
    await page.getByTestId("project-viewer-document").selectOption(mesh.expected.id);
    await page.getByTestId("project-gallery-layout-toggle").click();
    await page.getByTestId("project-save").click(); await expect(page.getByTestId("project-save")).toBeEnabled();
    await ctx.app.close(); ctx = await launchSurfaceApp({}, profile); page = ctx.page;
    await openLastSavedProject(page);
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", mesh.expected.id);
    await expect(page.getByTestId("project-source-back-to-surface")).toBeVisible();
  } finally { await closeSurfaceApp(ctx); }
});

test("Project middle flip preserves the native Catenoid canvas and source identity", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); await resizeSurfaceAppWindow(ctx, 1600, 1000);
    const page = ctx.page;
    await page.getByTestId("projects-toggle").click(); await page.getByTestId("project-template-open-catenoid-evidence").click();
    const editor = page.getByTestId("project-source-editor");
    const sourceHash = await editor.getAttribute("data-source-hash");
    await editor.getByTestId("surface-viewer-canvas-host").locator("canvas").evaluate(canvas => canvas.setAttribute("data-retained-canvas", "catenoid-session"));
    const id = await editor.getAttribute("data-document-id");
    await page.getByTestId("project-gallery-layout-toggle").click();
    await expect(editor).toBeHidden();
    await expect(page.getByTestId("project-sidebar-details")).toBeVisible();
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", id!);
    await page.screenshot({ path: test.info().outputPath("project-middle-details.png") });
    await page.getByTestId("project-viewer-return").click();
    await expect(editor).toBeVisible(); await expect(editor).toHaveAttribute("data-source-hash", sourceHash!);
    await expect(editor.getByTestId("surface-viewer-canvas-host").locator("canvas")).toHaveAttribute("data-retained-canvas", "catenoid-session");
  } finally { await closeSurfaceApp(ctx); }
});
