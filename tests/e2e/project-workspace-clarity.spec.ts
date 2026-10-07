import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Project documents and workspace exit are visible with compact controls", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); await resizeSurfaceAppWindow(ctx, 1600, 1000);
    const page = ctx.page, editor = page.getByTestId("project-source-editor");
    await page.getByTestId("projects-toggle").click();
    let start = Date.now();
    await page.getByTestId("project-template-open-catenoid-evidence").click();
    await expect(editor.getByTestId("surface-viewer-canvas-host").locator("canvas")).toBeVisible();
    const openingMs = Date.now() - start;
    const id = (await editor.getAttribute("data-document-id"))!, hash = (await editor.getAttribute("data-source-hash"))!;
    const switchesMs: number[] = [];
    const profiler = process.env.MATH3D_PROFILE_PROJECT === "1" ? await page.context().newCDPSession(page) : null;
    if (profiler) { await profiler.send("Profiler.enable"); await profiler.send("Profiler.start"); }
    for (let index = 0; index < 3; index++) {
      start = Date.now();
      await editor.getByTestId("project-source-back-to-module").click();
      await expect(editor).toHaveCount(0);
      await page.getByTestId("project-viewer-document").selectOption(id);
      await expect(editor).toHaveAttribute("data-source-hash", hash);
      await expect(editor.getByTestId("surface-viewer-canvas-host").locator("canvas")).toBeVisible();
      switchesMs.push(Date.now() - start);
    }
    if (profiler) { const result = await profiler.send("Profiler.stop"); writeFileSync(test.info().outputPath("project-switch-cpu-profile.json"), JSON.stringify(result.profile)); await profiler.detach(); }
    writeFileSync(test.info().outputPath("project-navigation-timing.json"), JSON.stringify({ openingMs, switchesMs, profile: "isolated Electron; click to visible canvas; not a GPU frame-rate benchmark" }, null, 2));
    if (process.env.MATH3D_CLARITY_BASELINE === "1") return;
    const tree = page.getByTestId("project-document-tree");
    await expect(tree).toBeVisible();
    await expect(tree.getByTestId(`project-tree-document-${id}`)).toHaveAttribute("aria-current", "page");
    const panel = page.getByTestId("project-explorer-panel");
    const treeBox = await tree.boundingBox(), contentsBox = await panel.getByTestId("project-sidebar-contents").boundingBox();
    expect(treeBox!.y + treeBox!.height).toBeLessThan(contentsBox!.y);
    await expect(page.getByTestId("surfaces-action-gallery")).toHaveCount(0);
    await expect(editor.getByTestId("project-source-back-to-module")).toHaveText("Back to normal Surfaces");
    const sizes = await page.evaluate(() => {
      const metrics = (selector: string) => { const element = document.querySelector<HTMLElement>(selector)!; const style = getComputedStyle(element); return { font: style.fontSize, height: element.getBoundingClientRect().height }; };
      return { global: metrics('[data-testid="workspace-nav-surfaces"]'), project: metrics('[data-testid="project-placement-left"]'), source: metrics('[data-testid="project-source-back-to-module"]'), toggle: metrics('[data-testid="projects-quick-toggle"]') };
    });
    expect(sizes.project.font).toBe(sizes.global.font); expect(sizes.source.font).toBe(sizes.global.font);
    expect(sizes.toggle.font).toBe(sizes.global.font);
    expect(Math.abs(sizes.project.height - sizes.global.height)).toBeLessThan(3);
    expect(Math.abs(sizes.source.height - sizes.global.height)).toBeLessThan(3);
    await page.screenshot({ path: test.info().outputPath("compact-project-catenoid.png") });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const mesh = saved.workspace.entries.find((entry: any) => entry.module === "mesh");
    await tree.getByTestId(`project-tree-document-${mesh.expected.id}`).click();
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", mesh.expected.id);
    expect(await page.getByTestId("project-study-open-source").evaluate(element => getComputedStyle(element).fontSize)).toBe(sizes.global.font);
    await page.screenshot({ path: test.info().outputPath("compact-project-mesh.png") });
    await tree.getByTestId(`project-tree-document-${id}`).click();
    await expect(editor).toHaveAttribute("data-source-hash", hash);
    await page.getByRole("button", { name: "Project", exact: true }).click();
    await page.getByRole("button", { name: "Project", exact: true }).click();
    await expect(page.getByTestId("project-viewer-document")).toHaveValue(id);
    await page.getByTestId("project-gallery-layout-toggle").click();
    await page.getByTestId("project-detail-toggle").click();
    const gallerySize = await page.getByTestId("project-template-open-catenoid-evidence").evaluate(element => ({ font: getComputedStyle(element).fontSize, height: element.getBoundingClientRect().height }));
    expect(parseFloat(gallerySize.font)).toBeGreaterThan(parseFloat(sizes.global.font));
    expect(gallerySize.height).toBeGreaterThan(sizes.global.height + 10);
  } finally { await closeSurfaceApp(ctx); }
});
