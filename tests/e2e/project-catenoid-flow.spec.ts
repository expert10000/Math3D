import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Catenoid Surface → retained Mesh → Surface → save → cold restart", async () => {
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
    await expect(editor.getByTestId("project-source-measurement")).toContainText("sampled points");
    // Exact captured revolution, not the module's default constructed Plane.
    expect(surface.checkpoint.source.definition.familyId).toBe("graph2d.revolution");
    const measurement = await editor.getByTestId("project-source-measurement").textContent();
    const bounds = JSON.parse(measurement!.split("bounds ")[1]);
    expect(bounds.max[0]).toBeCloseTo(1.5, 1); expect(bounds.min[0]).toBeCloseTo(-1.5, 1);
    expect(bounds.max[1]).toBeGreaterThan(2.3); expect(bounds.max[2]).toBeGreaterThan(2.3);
    await expect(editor.getByTestId("surface-viewer-canvas-host").locator("canvas")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("catenoid-surface.png") });
    await editor.getByTestId("project-saved-mesh-open").click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", mesh.expected.id);
    await expect(page.getByTestId("workspace-nav-mesh")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("project-viewer-document")).toHaveValue(mesh.expected.id);
    await expect(page.getByTestId("project-study-open-source")).toBeVisible();
    const meshViewer = page.getByTestId("surface-primary-viewer");
    await expect(meshViewer.getByTestId("surface-viewer-canvas-host").locator("canvas")).toBeVisible();
    await meshViewer.scrollIntoViewIfNeeded();
    expect((await meshViewer.boundingBox())!.height).toBeGreaterThan(250);
    await page.screenshot({ path: test.info().outputPath("catenoid-mesh.png") });
    await page.getByTestId("project-study-open-source").click();
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
    await resizeSurfaceAppWindow(ctx, 1600, 1000);
    await expect(page.getByTestId("project-source-editor")).toHaveAttribute("data-document-id", surface.expected.id);
    await expect(page.getByTestId("project-source-editor")).toHaveAttribute("data-source-hash", surface.expected.structuralHash);
    await expect(page.getByTestId("project-source-editor").getByTestId("surface-viewer-canvas-host").locator("canvas")).toBeVisible();
    await expect(page.getByTestId("app-status-bar")).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id)).toBe(saved.identity.id);
    await page.getByRole("button", { name: "Project", exact: true }).click();
    await expect(page.getByTestId("project-viewer-document")).toHaveValue(surface.expected.id);
    writeFileSync(test.info().outputPath("catenoid-evidence.json"), JSON.stringify({
      projectId: saved.identity.id, surface: surface.expected, mesh: mesh.expected, bounds,
      module: "surface", openingPath: "Projects Gallery → Catenoid Evidence → Open Mesh → Open source Surface → Save → cold Electron restart",
      viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, devicePixelRatio })),
      renderer: "GeometryViewer → shared SurfaceViewer; captured Graph revolution", profile: "isolated temporary Electron profile",
    }, null, 2));
    await page.screenshot({ path: test.info().outputPath("catenoid-cold-resume.png") });
    // Also qualify saving with Mesh selected: no Surface-first hardcoding.
    await page.getByTestId("project-viewer-document").selectOption(mesh.expected.id);
    await page.getByTestId("project-gallery-layout-toggle").click();
    await page.getByTestId("project-save").click(); await expect(page.getByTestId("project-save")).toBeEnabled();
    await ctx.app.close(); ctx = await launchSurfaceApp({}, profile); page = ctx.page;
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", mesh.expected.id);
    await expect(page.getByTestId("project-study-open-source")).toBeVisible();
  } finally { await closeSurfaceApp(ctx); }
});

test("Project middle flip preserves the Catenoid canvas and source draft", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); await resizeSurfaceAppWindow(ctx, 1600, 1000);
    const page = ctx.page;
    await page.getByTestId("projects-toggle").click(); await page.getByTestId("project-template-open-catenoid-evidence").click();
    const editor = page.getByTestId("project-source-editor");
    await editor.getByTestId("project-source-json").locator("summary").click();
    const draft = editor.getByTestId("project-source-definition");
    await draft.fill("unapplied draft preserved by the middle flip");
    await editor.getByTestId("surface-viewer-canvas-host").locator("canvas").evaluate(canvas => canvas.setAttribute("data-retained-canvas", "catenoid-session"));
    const id = await editor.getAttribute("data-document-id");
    await page.getByTestId("project-gallery-layout-toggle").click();
    await expect(editor).toBeHidden();
    await expect(page.getByTestId("project-sidebar-details")).toBeVisible();
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", id!);
    await page.screenshot({ path: test.info().outputPath("project-middle-details.png") });
    await page.getByTestId("project-viewer-return").click();
    await expect(editor).toBeVisible(); await expect(draft).toHaveValue("unapplied draft preserved by the middle flip");
    await expect(editor.getByTestId("surface-viewer-canvas-host").locator("canvas")).toHaveAttribute("data-retained-canvas", "catenoid-session");
  } finally { await closeSurfaceApp(ctx); }
});
