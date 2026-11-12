import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Mesh and Volume navigation reuses WebGL contexts and detaches idle canvases", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    await ctx.page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      const seen = new WeakSet<object>();
      const stats = { created: 0, resources: {} as Record<string, { created: number; deleted: number }> };
      (window as Window & { __viewerContexts?: typeof stats }).__viewerContexts = stats;
      for (const kind of ["Texture", "Buffer", "Framebuffer", "Program", "VertexArray"] as const) {
        const createName = `create${kind}`, deleteName = `delete${kind}`;
        const gl = WebGL2RenderingContext.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
        const create = gl[createName], remove = gl[deleteName];
        if (!create || !remove) continue;
        stats.resources[kind] = { created: 0, deleted: 0 };
        gl[createName] = function (this: WebGL2RenderingContext, ...args: unknown[]) {
          const resource = create.apply(this, args);
          if (resource) stats.resources[kind]!.created++;
          return resource;
        };
        gl[deleteName] = function (this: WebGL2RenderingContext, ...args: unknown[]) {
          if (args[0]) stats.resources[kind]!.deleted++;
          return remove.apply(this, args);
        };
      }
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
        const context = original.apply(this, args) as ReturnType<typeof original>;
        if (context && /^(webgl2?|experimental-webgl)$/.test(String(args[0])) && !seen.has(context)) {
          seen.add(context);
          stats.created++;
        }
        return context;
      } as typeof original;
    });
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    const baselineCanvases = await page.locator("canvas").count();
    const takeStats = () => page.evaluate(() => {
      const stats = (window as Window & { __viewerContexts?: { created: number; resources: Record<string, { created: number; deleted: number }> } }).__viewerContexts;
      return { created: stats?.created ?? -1, outstanding: Object.fromEntries(
        Object.entries(stats?.resources ?? {}).map(([kind, value]) => [kind, value.created - value.deleted])) };
    });
    let warmed: Awaited<ReturnType<typeof takeStats>> | null = null;
    for (let cycle = 0; cycle < 12; cycle++) {
      for (const route of ["mesh", "volume", "graphs"] as const) {
        const button = page.getByTestId(`workspace-nav-${route}`);
        await button.click();
        await expect(button).toHaveAttribute("aria-pressed", "true");
        if (route !== "graphs") await expect(page.locator("canvas:visible").first()).toBeVisible();
      }
      if (cycle === 1) warmed = await takeStats();
    }
    await expect.poll(() => page.locator("canvas").count()).toBeLessThanOrEqual(baselineCanvases);
    const final = await takeStats();
    expect(warmed?.created).toBeGreaterThan(0);
    expect(final.created).toBe(warmed?.created);
    expect(final.outstanding).toEqual(warmed?.outstanding);
  } finally {
    await closeSurfaceApp(ctx);
  }
});
