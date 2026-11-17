import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("SURF-05 late curvature response leaves a revised saved Surface ready to compute", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await resizeSurfaceAppWindow(ctx, 1600, 1000);
    const page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-template-open-catenoid-evidence").click();
    await expect(page.getByTestId("document-viewport")).toHaveAttribute("data-workbench", "module");
    const editor = page.getByTestId("project-source-editor");
    const oldHash = await editor.getAttribute("data-source-hash");
    await page.evaluate(() => {
      const NativeWorker = window.Worker;
      const held = { requestId: "", released: 0, release: null as null | (() => void) };
      (window as any).surf05HeldCurvature = held;
      (window as any).Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          if (!String(url).includes("surfaceAnalysisWorker")) return;
          this.addEventListener("message", (event: MessageEvent) => {
            if (event.data?.type !== "curvature-result" || held.requestId) return;
            event.stopImmediatePropagation();
            held.requestId = event.data.requestId;
            held.release = () => { held.released++; this.onmessage?.(event); };
          }, { capture: true });
        }
      };
    });
    await page.getByTestId("surfaces-left-tab-analysis").click();
    await page.getByTestId("surface-computation-curvature-field").click();
    await expect(page.getByTestId("surface-curvature-compute-button")).toBeEnabled();
    await page.getByTestId("surface-curvature-compute-button").click();
    await expect.poll(() => page.evaluate(() => (window as any).surf05HeldCurvature.requestId)).not.toBe("");
    await expect(page.getByTestId("surface-curvature-result")).toHaveCount(0);
    await page.getByTestId("surfaces-left-tab-object").click();
    await editor.getByTestId("project-surface-field-y").fill("2*(exp(x/2)+exp(-x/2))/2");
    await editor.getByTestId("project-surface-apply").click();
    await expect(editor).not.toHaveAttribute("data-source-hash", oldHash!);
    await page.getByTestId("surfaces-left-tab-analysis").click();
    await page.getByTestId("surface-computation-curvature-field").click();
    await expect(page.getByTestId("surface-curvature-execution-state")).toContainText("idle");
    await page.evaluate(() => {
      const held = (window as any).surf05HeldCurvature;
      if (!held.release) throw new Error("No genuine Surface worker response held");
      held.release();
    });
    expect(await page.evaluate(() => (window as any).surf05HeldCurvature.released)).toBe(1);
    await expect(page.getByTestId("surface-curvature-result")).toHaveCount(0);
    await expect(page.getByTestId("surface-result-qualification")).toHaveAttribute("data-status", "unavailable");
    await expect(page.getByTestId("surface-curvature-execution-state")).toContainText("idle");
    await expect(page.getByTestId("surface-curvature-compute-button")).toBeEnabled();
    await page.getByTestId("surface-curvature-compute-button").click();
    await expect(page.getByTestId("surface-curvature-execution-state")).toHaveText(/Execution: (ready|cached)/);
    await expect(page.getByTestId("surface-result-qualification")).toHaveAttribute("data-status", "current");
    await expect(page.getByTestId("surface-curvature-statistics")).toContainText("RMS");
    await expect(page.getByTestId("error-banner")).toHaveCount(0);
  } finally { await closeSurfaceApp(ctx); }
});
