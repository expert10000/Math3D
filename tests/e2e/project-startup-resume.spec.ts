import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("startup protects Catenoid resume, supports Cancel and explicit recovery", async () => {
  test.setTimeout(240_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); await resizeSurfaceAppWindow(ctx, 1600, 1000);
    const page = ctx.page, errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    // Ordinary gallery view needs the desktop viewer strip too.
    await expect(page.getByTestId("surface-viewer-controls-strip")).toBeVisible();
    await page.getByTestId("projects-toggle").click(); await page.getByTestId("project-template-open-catenoid-evidence").click();
    const owner = page.getByTestId("project-source-editor"), panel = page.getByTestId("project-explorer-panel");
    const id = (await owner.getAttribute("data-document-id"))!, hash = (await owner.getAttribute("data-source-hash"))!;
    await panel.getByTestId("project-gallery-layout-toggle").click();
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved");
    const saved = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    await page.addInitScript(() => {
      const state = window as any, original = indexedDB.open.bind(indexedDB);
      indexedDB.open = (...args: Parameters<IDBFactory["open"]>) => {
        const request = original(...args);
        if (args[0] !== "math3d.project-resources.v1") return request;
        indexedDB.open = original;
        const success = Object.getOwnPropertyDescriptor(IDBRequest.prototype, "onsuccess")!;
        Object.defineProperty(request, "onsuccess", { set(handler) {
          success.set!.call(request, async (event: Event) => {
            await new Promise<void>(resolve => { state.releaseResumeResources = resolve; });
            handler.call(request, event);
          });
        } });
        return request;
      };
    });
    await page.reload();
    const progress = page.getByTestId("project-resume-progress");
    await expect(progress).toBeVisible();
    await expect(progress).toContainText("Catenoid Evidence Notebook");
    await expect.poll(() => page.evaluate(() => typeof (window as any).releaseResumeResources)).toBe("function");
    expect(await progress.evaluate(element => element.matches(":modal"))).toBe(true);
    // A click on the loading surface itself must not be mistaken for editing.
    await progress.dispatchEvent("pointerdown");
    await page.screenshot({ path: test.info().outputPath("catenoid-opening.png") });
    await page.evaluate(() => (window as any).releaseResumeResources());
    await expect(owner).toHaveAttribute("data-document-id", id);
    await expect(owner).toHaveAttribute("data-source-hash", hash);
    await expect(progress).not.toBeVisible();
    await expect(panel).toBeVisible(); await expect(panel).toHaveAttribute("data-project-placement", "left");
    await expect(page.getByTestId("surface-viewer-controls-strip")).toBeVisible();
    await expect(page.getByTestId("surface-view-gizmo")).toBeVisible();
    await expect(page.getByTestId("project-resume-status")).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("catenoid-resumed.png") });
    await page.reload(); await expect(progress).toBeVisible();
    await expect.poll(() => page.evaluate(() => typeof (window as any).releaseResumeResources)).toBe("function");
    await page.getByTestId("project-resume-cancel").click();
    await expect(progress).not.toBeVisible();
    await page.evaluate(() => (window as any).releaseResumeResources());
    await expect(page.getByTestId("project-resume-explicit")).toBeVisible();
    await expect(owner).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(saved);
    await page.getByTestId("project-resume-explicit").click();
    await expect(owner).toHaveAttribute("data-document-id", id);
    await expect(owner).toHaveAttribute("data-source-hash", hash);
    await expect(panel).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await closeSurfaceApp(ctx); }
});
