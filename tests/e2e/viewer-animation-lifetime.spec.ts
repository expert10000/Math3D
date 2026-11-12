import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Mesh and Volume navigation releases animation frames and GL contexts", async () => {
  test.setTimeout(3 * 60_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    const page = ctx.page;
    await page.addInitScript(() => {
      const pending = new Set<number>();
      const schedule = window.requestAnimationFrame.bind(window);
      const cancel = window.cancelAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => {
        const id = schedule(time => { pending.delete(id); callback(time); });
        pending.add(id);
        return id;
      };
      window.cancelAnimationFrame = id => { pending.delete(id); cancel(id); };
      (window as typeof window & { __MATH3D_E2E_PENDING_FRAMES__?: () => number })
        .__MATH3D_E2E_PENDING_FRAMES__ = () => pending.size;
    });
    await resetSurfaceAppState(page);
    const samples: number[] = [];
    for (let cycle = 0; cycle < 6; cycle++) {
      for (const route of ["mesh", "volume"] as const) {
        const button = page.getByTestId(`workspace-nav-${route}`);
        await button.click();
        await expect(button).toHaveAttribute("aria-pressed", "true");
        if (route === "mesh")
          await expect(page.getByTestId("surface-viewer-canvas-host").locator("canvas")).toHaveCount(1);
        else
          await expect(page.locator('[data-testid^="volume-slice-viewer-"] canvas').first()).toBeVisible();
        const canvas = route === "mesh"
          ? page.getByTestId("surface-viewer-canvas-host").locator("canvas")
          : page.locator('[data-testid^="volume-slice-viewer-"] canvas').first();
        await canvas.evaluate(element => {
          (window as Window & { __MATH3D_E2E_VIEWER_CONTEXT__?: WebGL2RenderingContext | null })
            .__MATH3D_E2E_VIEWER_CONTEXT__ = (element as HTMLCanvasElement).getContext("webgl2");
        });
        const graph = page.getByTestId("workspace-nav-graphs");
        await graph.click();
        await expect(graph).toHaveAttribute("aria-pressed", "true");
        const released = await page.evaluate(() => {
          const diagnostic = window as Window & { __MATH3D_E2E_VIEWER_CONTEXT__?: WebGL2RenderingContext | null };
          const lost = diagnostic.__MATH3D_E2E_VIEWER_CONTEXT__?.isContextLost() ?? false;
          diagnostic.__MATH3D_E2E_VIEWER_CONTEXT__ = null;
          return lost;
        });
        expect(released, `${route} should lose its GL context on navigation`).toBe(true);
      }
      await page.waitForTimeout(100);
      samples.push(await page.evaluate(() => (window as typeof window & {
        __MATH3D_E2E_PENDING_FRAMES__?: () => number
      }).__MATH3D_E2E_PENDING_FRAMES__?.() ?? -1));
    }
    expect(samples.every(value => value >= 0)).toBe(true);
    expect(Math.max(...samples.slice(2)) - Math.min(...samples.slice(2))).toBeLessThanOrEqual(2);
    expect(samples.at(-1)! - samples[0]!).toBeLessThanOrEqual(2);
  } finally { await closeSurfaceApp(ctx); }
});
